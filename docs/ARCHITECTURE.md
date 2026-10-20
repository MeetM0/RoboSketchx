# How RoboSketch works

RoboSketch turns a picture, a photo or typed text into **pen strokes**, lays them out on a
sheet of paper, writes them as **G-code**, and streams that G-code to a pen-plotter robot over
**Bluetooth LE**.

## 1. The pipeline

Every drawing goes through the same five stages, whichever tab it starts from:

```
  1 SOURCE              2 STROKES          3 PLAN               4 G-CODE            5 ROBOT
  ─────────             ─────────          ──────               ────────            ───────
  Gallery picture ─┐
  Your photo ──────┼──►  Sketch   ──────►  planPlot()  ──────►  sketchToGcode() ──► BLE stream ──► pen moves
  Typed text ──────┘    (lines in           (paper mm,           (text program)      (chunks,
                         pixels)             Y flipped,                               flow control,
                                             joins, park)                             stop)
                            │                    │                     │
                            ▼                    ▼                     ▼
                       paper preview      "14 strokes · 190 ×      Export .gcode / .svg
                                           165 mm · ≈ 4 min"
```

| Stage | What it is | Code |
| --- | --- | --- |
| 1 Source | Where the lines come from | `lib/sources/catalog`, `lib/sources/photo`, `lib/sources/text` |
| 2 Strokes | A `Sketch`: a list of polylines plus the size of the space they live in | `lib/geometry/types.ts` |
| 3 Plan | Fit to the paper in millimetres, flip Y, join touching strokes, add the park move | `lib/plot/plan.ts` |
| 4 G-code | The program text the robot runs | `lib/plot/gcode.ts` (checked by `lib/plot/validate.ts`) |
| 5 Robot | Split into Bluetooth packets, stream with flow control, stop safely | `lib/robot/`, `platform/bluetooth.ts`, `state/robot.tsx` |

The preview, the summary line, the exported file and what the robot receives all come from the
same `planPlot()` result, so they always agree.

## 2. Folder map

```
app/                 URLs only. Each route file is one line that points at a screen in features/.
features/            The screens, grouped by tab.
  draw/                Draw tab: draw-screen (Gallery | Photo switch), gallery-mode, photo-mode
  write/               Write tab: write-screen, font-picker
  robot/               Robot tab: overview + Paper / Pen / Motion / Connection pages, status pill, connect flow
  plot/                Shared by Draw and Write: paper preview, bottom action bar (Send / Stop / Export)
components/ui/       Design system: Button, Text, Segmented, Section/Row, Field, Banner, Sheet, Screen …
constants/theme.ts   Design tokens: colours (light + dark), spacing, radius, type scale
hooks/               useTheme, useColorScheme (honours the Appearance setting), useHasHydrated
state/               React contexts: app-wide state, saved with AsyncStorage
  plotter-settings.tsx   paper, pen, speeds, start/park           key robosketch.plotterSettings.v1
  robot.tsx              Bluetooth connection, current job, log    key robosketch.robotSettings.v1
  appearance.tsx         System / Light / Dark                     key robosketch.appearance.v1
platform/            Thin wrappers around device APIs
  bluetooth.ts / .web.ts   native BLE (react-native-ble-plx) / Web Bluetooth (Chrome, Edge)
  pick-image.ts, prepare-photo.ts, share-file.ts / .web.ts
lib/                 The engine: pure TypeScript, no React, no device APIs. Runs in Node tests.
  geometry/            Point, Polyline, Sketch, RgbaImage; polyline maths (length, simplify, order, join)
  sources/photo/       photo → strokes
  sources/text/        text → strokes (single-stroke fonts, layout)
  sources/catalog/     the 12 built-in pictures → strokes
  plot/                settings, plan, gcode, svg, validate
  robot/               protocol (packets), sender (flow control), job (outcome), stop (safe stop)
  base64.ts
tests/               node:test suites for lib/ (npm test)
scripts/             export-catalog (writes catalog/*.gcode), build-fonts (regenerates font data)
catalog/             Ready-made G-code and SVG for the built-in pictures (A4)
docs/                This file, DESIGN.md (UX and design system), AUDIT.md (correctness audit)
```

### Who may import whom

```
app ──► features ──► components/ui, hooks, constants
            │
            ├──────► state ──► platform ──► lib
            └──────────────────────────────► lib
```

- **`lib/` imports nothing from the app.** It doesn't import React, Expo, `@/` paths or device
  APIs, and uses relative imports only, so `npm test` runs it directly in Node. Anything that
  draws, plans or talks the robot protocol belongs here.
- **`platform/`** is the only place that touches device APIs (Bluetooth, camera, files).
- **`state/`** holds what several screens share, and saves it.
- **`features/`** composes everything into screens; **`components/ui/`** knows nothing about
  robots or drawings.

## 3. The core data types

| Type | Where | Meaning |
| --- | --- | --- |
| `Sketch` | `lib/geometry/types.ts` | `{ width, height, strokes: Polyline[], fit? }`: lines in their own pixel space (y down). `fit: 'frame'` for text, so the layout's position on the page is kept. |
| `PlotterSettings` | `lib/plot/settings.ts` | Paper size and margin, draw/travel speed, pen mode (Z axis or custom commands), start mode (`G92` / `G28` / `$H`), park position. |
| `PlotPlan` | `lib/plot/plan.ts` | Strokes in machine millimetres (X0 Y0 = paper bottom-left, y up), park point, stroke count, lengths, minutes. |
| `RobotSettings` | `lib/robot/protocol.ts` | Firmware, flow-control mode, controller buffer size, MTU, BLE UUIDs, reply timeout. |
| `SendJob` | `state/robot.tsx` | `sending` / `done` / `cancelled` / `failed`, with progress and error. |

## 4. Stage by stage

### 1 · Sources: where strokes come from

**Gallery** (`lib/sources/catalog`). Each picture is a few SVG path strings in a 100 × 100
box. `flattenPath` turns curves and arcs into short straight segments, and `pictureToSketch`
orders the strokes.

**Photo** (`lib/sources/photo`). Runs entirely on the phone, in this order:

1. `platform/prepare-photo.ts` shrinks the picked photo to 1024 px and re-encodes it as JPEG;
   `decode.ts` turns that into RGBA pixels.
2. `photo.ts` → `photoToSketch`: on a 512 px copy, `background.ts` finds the subject (learns
   the background colours from the border with k-means in Lab colour, flood-fills inward,
   cleans the mask). The 1024 px photo is cropped to the subject plus 6 % and resized to
   512 px, so the subject gets the full tracing resolution.
3. `edges.ts`: Canny edge detection (blur → Sobel → thin → hysteresis), with a minimum
   contrast so flat, noisy backgrounds stay blank. Edge points are refined to sub-pixel accuracy.
4. `trace.ts` follows connected edge pixels into chains.
5. `chains.ts` links broken chains that continue each other, closes loops, drops duplicates,
   and smooths the pixel staircase.
6. `pipeline.ts` → `imageToSketch`: drops strokes that are too short, simplifies with
   Ramer–Douglas–Peucker, and orders strokes nearest-first from the paper's bottom-left
   corner to cut pen-up travel. Detail presets (`DETAIL_PRESETS`) are in millimetres on
   paper, converted with the scale the drawing will be plotted at.

**Text** (`lib/sources/text`). Four single-stroke fonts generated from the Hershey / EMS
engraving fonts (`font-data.ts`, built by `npm run build-fonts`). `layoutText` wraps words to
the writing area, sizes them (Fit width or a fixed capital height), aligns them, optionally adds
"Natural" wobble, and keeps cursive joins exact so they become one pen-down line.

### 2 · Strokes

All three sources return a `Sketch`. Nothing after this point knows where the lines came from.

### 3 · Plan: put it on the paper (`lib/plot/plan.ts`)

`pixelToPaperTransform` scales the drawing's bounding box to fit inside the margins and
centres it. This is the only place Y is flipped: images are y-down, the machine is y-up with
X0 Y0 at the paper's bottom-left. `planPlot` then:
- converts every point to millimetres;
- joins strokes whose ends are within **0.3 mm**, so the pen doesn't lift and land on the same spot;
- adds the park move;
- totals draw and travel length, giving the time estimate.

### 4 · G-code (`lib/plot/gcode.ts`)

```
G21 / G90                       millimetres, absolute
G92 X0 Y0 | G28 | $H            where the pen starts (Robot → Motion)
G0 Z5.00                        pen up
for each stroke:
  G0 X… Y…                      travel (never carries F)
  G1 Z0.00 F500                 pen down (or your custom command, e.g. M3 S90)
  G1 X… Y… F1500 / G1 X… Y…     draw (feed set on the first move)
  G0 Z5.00                      pen up
G0 X<park> Y<park>              park
M2                              end
```

`validate.ts` checks a program against these rules (units, feeds, pen state, margins, park,
2-decimal numbers, curve accuracy). The tests use it on every generated program.

### 5 · Robot: Bluetooth (`lib/robot`, `platform/bluetooth*.ts`, `state/robot.tsx`)

- **Connect.** `platform/bluetooth.ts` scans for the Nordic UART Service (the default on most
  ESP32 / nRF serial-over-BLE firmware) and asks for MTU 400, which gives 397-byte packets.
  Browsers don't report the MTU, so the web version uses safe 20-byte writes unless you turn
  on long writes.
- **Stream** (`sender.ts`). By default it uses GRBL *character counting*: it keeps track of how
  many bytes are in the controller's 128-byte receive buffer, sends only while there's room,
  and frees a line on each `ok`. An `error:` or `ALARM:` reply fails the job. Other modes wait
  for `ok` per line or per packet, or don't wait at all.
- **Stop** (`stop.ts`). Stopping the sender isn't enough, because the controller would keep
  drawing what it has buffered. GRBL gets `!` (feed hold), `Ctrl-X` (soft reset, clears the
  buffer), `$X` (unlock) and then pen up. Custom firmware gets your stop command, then pen up.
- **Outcome** (`job.ts`). Each job ends as done, cancelled or failed. If the connection drops
  mid-job, it's marked failed and the robot is stopped first thing on the next connection.
- **State** (`state/robot.tsx`). Holds the connection, the job and the activity log for every
  screen (status pill, action bar, Robot tab).

## 5. What happens when you tap **Send to robot**

1. `features/plot/plot-action-bar.tsx` calls `sketchToGcode(sketch, settings)` (`lib/plot/gcode.ts`).
2. That calls `planPlot` (`lib/plot/plan.ts`) and formats the G-code text.
3. `robot.send(gcode, penUpLine)` in `state/robot.tsx` starts a job.
4. `runJob` (`lib/robot/job.ts`) → `sendGcode` (`lib/robot/sender.ts`) splits the text into
   packets (`protocol.ts`) and writes them through the connection from `platform/bluetooth.ts`.
5. Each progress update re-renders the action bar, the header status pill and the Robot tab.
6. The job ends as done, cancelled or failed. On Stop, or if sending fails, `stopRobot`
   (`lib/robot/stop.ts`) halts the machine and lifts the pen.

## 6. Screens

| Tab | Screen file | Shows |
| --- | --- | --- |
| Draw | `features/draw/draw-screen.tsx` → `gallery-mode.tsx`, `photo-mode.tsx` | Pick a picture or photo; preview; Send |
| Write | `features/write/write-screen.tsx` | Type text, font, size, alignment; preview; Send |
| Robot | `features/robot/robot-screen.tsx` | Connection, current job, setup rows, appearance, activity |
| Robot → Paper / Pen / Motion / Connection | `features/robot/*-screen.tsx` | One group of settings each |

Draw and Write share the same layout (`Workspace` in `components/ui/screen.tsx`): paper
preview, controls, and the bottom action bar. Windows 960 px and wider get two columns. Colours
come from `constants/theme.ts` via `useTheme()`, so dark mode is a palette swap. See
`docs/DESIGN.md` for the UX reasoning and the component list.

## 7. Common changes

| I want to… | Change |
| --- | --- |
| Add a gallery picture | Append to `CATALOG` in `lib/sources/catalog/pictures.ts`, then `npm run export-catalog` |
| Tune photo detail | `DETAIL_PRESETS` in `lib/sources/photo/pipeline.ts` |
| Change the G-code format | `lib/plot/gcode.ts` (and the rules in `lib/plot/validate.ts`) |
| Add a plotter setting | `lib/plot/settings.ts` (type + default), use it in `plan.ts` / `gcode.ts`, add a field in `features/robot/*-screen.tsx` |
| Support other firmware | `lib/robot/sender.ts` (flow control) and `lib/robot/stop.ts` (stop sequence) |
| Add a font | Add it to `scripts/build-fonts.js`, then `npm run build-fonts` |
| Change colours or spacing | `constants/theme.ts` |

## 8. Checks

```
npm test              node:test suites for lib/ (G-code rules, photo, tracing, text, Bluetooth)
npx tsc --noEmit      types
npm run lint          ESLint (expo lint)
```

The Bluetooth tests drive `lib/robot` against a simulated GRBL controller
(`tests/helpers/fake-grbl.ts`), so flow control and stop behaviour are tested without hardware.
