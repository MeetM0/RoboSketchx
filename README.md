# RoboSketch

Turn photos and text into pen strokes that a drawing robot / pen plotter can draw.

- **Draw → Catalog:** pick one of 12 built-in cartoon line drawings (animals, things, nature);
  each comes with ready-made G-code in [`catalog/`](catalog/README.md).
- **Draw → My photo:** take or choose a photo; RoboSketch removes the background and traces the
  subject's outlines (pick **Low / Medium / High** detail).
- **Write:** type a message and pick a single-stroke font (Print, Handwriting, Cursive,
  Calligraphy), size and alignment; "Natural" adds slight per-letter variation so it looks
  hand-written.

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
| `app/(tabs)/index.tsx` | **Draw** screen: cartoon catalog, or trace your own photo |
| `app/(tabs)/write.tsx` | **Write** screen: type text for the robot to write |
| `app/(tabs)/plotter.tsx` | **Plotter** screen: paper size, margin, speeds, pen up/down G-code |
| `lib/catalog/` | Cartoon catalog: `pictures.ts` (SVG path artwork) and an SVG path → strokes flattener |
| `catalog/` | Ready-made `.gcode` + `.svg` per cartoon for A4 (`npm run export-catalog`) |
| `lib/sketch/` | The photo → strokes engine (pure TypeScript, no React) |
| `lib/text/` | Text → strokes: single-stroke fonts (`font-data.ts`, generated) and line layout |
| `scripts/build-fonts.js` | Regenerates `lib/text/font-data.ts` from the `hersheytext` fonts (`npm run build-fonts`) |
| `lib/prepare-photo.ts` | Downscales the picked photo to 512px and returns it as JPEG base64 |
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
