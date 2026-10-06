# RoboSketch

Turn photos and text into pen strokes that a drawing robot / pen plotter can draw.

- **Draw:** take or choose a photo; RoboSketch removes the background and traces the subject's
  outlines (pick **Low / Medium / High** detail).
- **Write → Type:** type a message and pick a single-stroke font (Print, Handwriting, Cursive,
  Calligraphy), size and alignment; "Natural" adds slight per-letter variation so it looks
  hand-written.
- **Write → Scan page:** photograph handwriting or a line drawing on paper; RoboSketch traces the
  centre of every pen line so the robot copies it in the same hand.

Every mode previews the result on your sheet of paper and exports **G-code** or **SVG**.

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
| `app/(tabs)/index.tsx` | **Draw** screen: pick a photo, preview the sketch, export |
| `app/(tabs)/write.tsx` | **Write** screen: type text or scan a handwritten page |
| `app/(tabs)/plotter.tsx` | **Plotter** screen: paper size, margin, speeds, pen up/down G-code |
| `lib/sketch/` | The photo → strokes engine (pure TypeScript, no React) |
| `lib/sketch/centerline.ts` | Page scan: ink threshold → thinning → centre-line strokes |
| `lib/text/` | Text → strokes: single-stroke fonts (`font-data.ts`, generated) and line layout |
| `scripts/build-fonts.js` | Regenerates `lib/text/font-data.ts` from the `hersheytext` fonts (`npm run build-fonts`) |
| `lib/prepare-photo.ts` | Downscales the picked photo to 512px and returns it as JPEG base64 |
| `lib/plotter-settings.tsx` | Plotter settings context, persisted with AsyncStorage |
| `lib/share-file.ts` / `.web.ts` | Share sheet on native, file download on web |
| `components/sketch-actions.tsx` | Stroke count / size / time summary and the export buttons |
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

## Writing text (`lib/text`)

Plotters need **single-stroke** fonts: each letter is a few pen paths rather than an outline
to fill. RoboSketch ships four from the Hershey / EMS engraving fonts (licences in
`lib/text/FONTS-LICENSE.md`). `layoutText` wraps words to the paper's writing area, splits
over-long words, reports lines that don't fit and characters the font lacks, and keeps strokes
in writing order.

## Scanning a page (`lib/sketch/centerline.ts`)

1. **Ink vs paper** with an adaptive (local mean) threshold, so shadows and uneven light don't
   matter. Photos are processed at 1200 px so handwriting stays several pixels thick.
2. **Clean up:** drop specks and large blobs touching the photo edge (table, page edge,
   shadows); fill pin-holes inside strokes.
3. **Zhang–Suen thinning** to 1-pixel centre lines; restore dots that thinning erases.
4. **Trace**, drop stray staircase pixels, simplify, order, join strokes that touch, and crop
   to the writing so it fills the paper.

This copies the *shape* of the writing; it doesn't recognise the words (no OCR).
