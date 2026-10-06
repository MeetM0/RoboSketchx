# RoboSketch

Turn a photo into line art that a drawing robot / pen plotter can draw.

1. Take or choose a photo.
2. RoboSketch removes the background, then traces the subject's outlines into pen strokes
   (pick **Low / Medium / High** detail).
3. Preview the drawing on your sheet of paper, then export **G-code** for the robot or **SVG**.

Runs on iOS, Android and web (Expo SDK 54, expo-router).

## Get started

Requires Node.js 20.19.4 or newer.

```bash
npm install
npx expo start
```

Press `i` (iOS simulator), `a` (Android emulator) or `w` (web), or scan the QR code with Expo Go.

## Project layout

| Path | What it is |
| --- | --- |
| `app/(tabs)/index.tsx` | **Create** screen: pick a photo, preview the sketch, export |
| `app/(tabs)/plotter.tsx` | **Plotter** screen: paper size, margin, speeds, pen up/down G-code |
| `lib/sketch/` | The photo → strokes engine (pure TypeScript, no React) |
| `lib/prepare-photo.ts` | Downscales the picked photo to 512px and returns it as JPEG base64 |
| `lib/plotter-settings.tsx` | Plotter settings context, persisted with AsyncStorage |
| `lib/share-file.ts` / `.web.ts` | Share sheet on native, file download on web |
| `components/sketch-preview.tsx` | Draws the strokes on the configured paper with react-native-svg |
| `components/background-overlay.tsx` | Fades the removed background over the photo |

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
