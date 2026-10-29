# RoboSketch

Turn photos and text into pen strokes that a drawing robot / pen plotter can draw.

- **Draw → Gallery:** pick one of 12 built-in cartoon line drawings (animals, things, nature);
  each comes with ready-made G-code in [`catalog/`](catalog/README.md).
- **Draw → Photo:** take or choose a photo; RoboSketch removes the background and traces the
  subject's outlines (pick **Low / Medium / High** detail).
- **Write:** type a message and pick a single-stroke font (Print, Handwriting, Cursive,
  Calligraphy), size (**Fit width** by default, or Small / Medium / Large / a custom height in
  mm) and alignment; "Natural" adds slight per-letter variation so it looks hand-written.

Every mode previews the result on your sheet of paper, **sends the G-code to the robot over
Bluetooth LE**, or exports **G-code** / **SVG** files.

Runs on iOS, Android and web (Expo SDK 54, expo-router).

## Get started

New to the project? Follow **[docs/SETUP.md](docs/SETUP.md)**: tools to install, cloning,
running on a browser or phone, and troubleshooting. The short version, with Node.js 20.19.4 or
newer (22 LTS recommended):

```bash
git clone https://github.com/MeetM0/RoboSketchx.git
cd RoboSketchx
npm run setup
npx expo start --web
```

`npm run setup` installs the exact locked dependencies (`npm ci`) and runs the checks.
Bluetooth to the robot needs Chrome or Edge on the web, or a development build on a phone
(`npx expo run:ios --device` / `npx expo run:android --device`); Expo Go runs everything
except Bluetooth (`npx expo start --go`). Before pushing, run `npm run check`.

## How it's organised

**Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** for how the system works end to end
(source → strokes → paper plan → G-code → Bluetooth) and where each piece lives.
[`docs/DESIGN.md`](docs/DESIGN.md) covers the UX and the design system.

| Folder | What's in it |
| --- | --- |
| `app/` | Routes only: each file points at a screen in `features/` |
| `features/` | Screens by tab: `draw/`, `write/`, `robot/`, plus `plot/` (preview + action bar shared by Draw and Write) |
| `components/ui/` | Design-system components; tokens in `constants/theme.ts` |
| `state/` | App-wide state, saved on the device: plotter settings, robot connection and job, appearance |
| `platform/` | Device APIs: Bluetooth (native and web), image picker, photo resize, file sharing |
| `lib/` | The engine, pure TypeScript and tested in Node: `geometry/`, `sources/{photo,text,catalog}`, `plot/`, `robot/` |
| `tests/` | `npm test` |
| `scripts/`, `catalog/` | `npm run export-catalog` writes ready-made A4 G-code + SVG for the gallery pictures |

## Bluetooth defaults

| | Default | Setting |
| --- | --- | --- |
| Service | Nordic UART Service `6e400001-b5a3-f393-e0a9-e50e24dcca9e` | Robot → Connection |
| RX (app → robot, write with response) | `6e400002-b5a3-f393-e0a9-e50e24dcca9e` | ″ |
| TX (robot → app, notify) | `6e400003-b5a3-f393-e0a9-e50e24dcca9e` | ″ |
| MTU requested | **400** → packets of up to **397 bytes** (web: 20-byte writes unless long writes are on) | ″ |
| Flow control | GRBL buffer counting, 128-byte controller buffer | ″ |
| Firmware | GRBL: Stop = feed hold, soft reset, unlock, pen up | ″ |

The robot should accept G-code lines on RX, reply `ok` per line (GRBL style) on TX, and run
them in order. Details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (stage 5).
