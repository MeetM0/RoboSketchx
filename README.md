# RoboSketch

Turn photos and text into pen strokes that a drawing robot / pen plotter can draw.

- **Draw → Catalog:** pick one of 12 built-in cartoon line drawings (animals, things, nature);
  each comes with ready-made G-code in [`catalog/`](catalog/README.md).
- **Draw → My photo:** take or choose a photo; RoboSketch removes the background and traces the
  subject's outlines (pick **Low / Medium / High** detail).
- **Write:** type a message and pick a single-stroke font (Print, Handwriting, Cursive,
  Calligraphy), size and alignment; "Natural" adds slight per-letter variation so it looks
  hand-written.

Every mode previews the result on your sheet of paper, **sends the G-code to the robot over
Bluetooth LE**, or exports **G-code** / **SVG** files.

Runs on iOS, Android and web (Expo SDK 54, expo-router).

## Get started

Requires Node.js 20.19.4 or newer.

```bash
npm install
npx expo start
```

Press `i` (iOS simulator), `a` (Android emulator) or `w` (web), or scan the QR code with Expo Go.

### Bluetooth needs a development build

Everything except Bluetooth runs in Expo Go. Sending to the robot uses native BLE
(`react-native-ble-plx`), so build the app once with the native code included:

```bash
npx expo run:ios --device      # iPhone over USB (needs Xcode)
npx expo run:android --device  # Android phone over USB (needs Android Studio)
```

After that, `npx expo start` serves updates to the installed development build. (Or use
EAS: `eas build --profile development`.) On the web, Bluetooth works in Chrome and Edge via
Web Bluetooth. The iOS simulator has no Bluetooth; use a real phone.

## Project layout

| Path | What it is |
| --- | --- |
| `app/(tabs)/index.tsx` | **Draw** screen: cartoon catalog, or trace your own photo |
| `app/(tabs)/write.tsx` | **Write** screen: type text for the robot to write |
| `app/(tabs)/plotter.tsx` | **Plotter** screen: paper size, margin, speeds, pen up/down G-code |
| `lib/catalog/` | Cartoon catalog: `pictures.ts` (SVG path artwork) and an SVG path → strokes flattener |
| `catalog/` | Ready-made `.gcode` + `.svg` per cartoon for A4 (`npm run export-catalog`) |
| `lib/sketch/` | The photo → strokes engine (pure TypeScript, no React) |
| `lib/text/` | Text → strokes: single-stroke fonts (`font-data.ts`, generated) and line layout |
| `scripts/build-fonts.js` | Regenerates `lib/text/font-data.ts` from the `hersheytext` fonts (`npm run build-fonts`) |
| `lib/prepare-photo.ts` | Downscales the picked photo to 512px and returns it as JPEG base64 |
| `lib/robot/` | Bluetooth: chunking protocol, sender with flow control, native + web BLE links, connection context |
| `components/robot-panel.tsx` | Plotter tab: find / connect the robot, Bluetooth settings, robot replies |
| `components/send-to-robot.tsx` | "Send to robot" button with chunk progress and cancel |
| `lib/plotter-settings.tsx` | Plotter settings context, persisted with AsyncStorage |
| `lib/share-file.ts` / `.web.ts` | Share sheet on native, file download on web |
| `components/catalog-browser.tsx` | Catalog grid with category filter and preview |
| `components/sketch-actions.tsx` | Stroke count / size / time summary and the export buttons |
| `components/sketch-preview.tsx` | Draws the strokes on the configured paper with react-native-svg |
| `components/background-overlay.tsx` | Fades the removed background over the photo |

## Cartoon catalog (`lib/catalog`)

Each picture is a list of SVG path strings in a 100 × 100 box, drawn as single pen lines.
`flattenPath` turns curves and arcs into short straight moves, and `pictureToSketch` orders the
strokes and crops them so the drawing fills the paper. The app generates G-code for your
current Plotter settings; `npm run export-catalog` also writes ready-made A4 files to
`catalog/`. To add a picture, append it to `CATALOG` in `lib/catalog/pictures.ts` and re-run
the export.

## How the sketch engine works (`lib/sketch`)

1. **Decode** the JPEG to RGBA (`jpeg-js`).
2. **Background removal** (`background.ts`, optional, on by default): learn the background
   colours from the photo border (k-means in CIE Lab), flood-fill inward through matching
   pixels and gentle lighting gradients, clean up the mask, keep the main subject, then
   composite it onto white paper. Busy backgrounds or implausible results fall back to the
   whole photo. Works best with a plain wall, table, sky or paper behind the subject.
3. **Canny edge detection** (`edges.ts`): Gaussian blur → Sobel gradients → non-max suppression →
   hysteresis. The strong-edge threshold is the stronger of a percentile cut and a minimum contrast
   step, so flat noisy backgrounds stay blank.
4. **Trace** connected edge pixels into polylines (`trace.ts`), starting at line ends.
5. **Clean up** (`geometry.ts`): drop short strokes, simplify with Ramer–Douglas–Peucker, and order
   strokes nearest-neighbour from the origin to cut pen-up travel.
6. **Export** (`export.ts`): SVG, or G-code fitted inside the paper margins (Y flipped for the
   machine, pen up/down commands and feed rates from the Plotter settings).

Detail presets live in `DETAIL_PRESETS` in `lib/sketch/index.ts`.

## Writing text (`lib/text`)

Plotters need **single-stroke** fonts: each letter is a few pen paths rather than an outline
to fill. RoboSketch ships four from the Hershey / EMS engraving fonts (licences in
`lib/text/FONTS-LICENSE.md`). `layoutText` wraps words to the paper's writing area, splits
over-long words, reports lines that don't fit and characters the font lacks, and keeps strokes
in writing order.

## Sending to the robot over Bluetooth LE (`lib/robot`)

| | Default | Setting |
| --- | --- | --- |
| Service | Nordic UART Service `6e400001-b5a3-f393-e0a9-e50e24dcca9e` | Plotter → Bluetooth settings |
| RX (app → robot, write with response) | `6e400002-b5a3-f393-e0a9-e50e24dcca9e` | ″ |
| TX (robot → app, notify; optional) | `6e400003-b5a3-f393-e0a9-e50e24dcca9e` | ″ |
| MTU requested | **400** → chunks of up to **397 bytes** (MTU − 3-byte ATT header) | ″ |
| Flow control | none | none / one `ok` per chunk / one `ok` per line |

- The G-code is plain ASCII, one command per line ending in `\n`. It is split into chunks that
  **always end on a line break**, so the robot never gets half a command; chunks are written
  one at a time, each waiting for the BLE write acknowledgement.
- Android requests MTU 400 when connecting. iOS negotiates the MTU itself; if the robot or phone
  agrees on less than 400, chunks shrink to fit (the app shows a warning). Browsers don't expose
  the MTU, so web sends 397-byte writes and relies on BLE long writes if the real MTU is smaller.
- With flow control on, the app waits for the robot to notify the reply token (default `ok`)
  on TX before sending the next chunk — once per chunk, or once per G-code line (GRBL style).
  Replies may arrive split across notifications. No reply within the timeout (default 30 s)
  stops the job with an error.
- **Cancel** stops between chunks and then sends the pen-up command so the pen doesn't drag.
- The robot firmware should accept writes of up to 397 bytes on RX, buffer the lines and
  execute them in order. If its buffer is small, enable flow control and reply `ok` once it
  has room for more.

