# RoboSketch audit (Phase 1, no code changed)

Branch `claude/eloquent-feynman-kzzl5q` at `e468560`. Severity: **SAFETY** = machine safety,
**PAPER** = visible on paper, **HYGIENE** = correctness/maintainability with no direct effect.

## Inputs that were not available

`docs/PIPELINE.md`, `tests/fixtures/{textm,flower,snoop}.gcode` and `tools/fix_gcode.py` are
**not in the repository** (checked every branch on GitHub after `git fetch`: `claude/eloquent-
feynman-kzzl5q`, `main`, `master`). So:

- Fixture-specific numbers quoted in the request (snoop 0.541 mm/px, 76% axis/45° share) are
  **unverified**. Each item below instead reproduces the defect with output generated from the
  current source, using the same pipeline and the default plotter settings (A4 portrait, 10 mm
  margin, `G0 Z5` / `G1 Z0`, F1500 draw / F3000 travel).
- The validator in Phase 2 is designed from the invariants, not ported from `fix_gcode.py`.
  If you push the script, I will diff its rules against this list before writing `validate.ts`.

Repro inputs: the photo-like test scenes used earlier in this session (cat on a textured wall,
512×384; a transposed 384×512 portrait copy, which reproduces the snoop scaling mechanism),
synthetic line-art bitmaps, the catalog Flower, and typed text. Measurement scripts become the
Phase 2 tests.

## Summary

| ID | Status | Severity | One line |
| --- | --- | --- | --- |
| B1 | **FAIL** | SAFETY | Default flow control is `none`; even `line` mode writes 397 B before waiting |
| B2 | **FAIL** | SAFETY | Cancel only queues a pen-up behind buffered moves; no `!` / 0x18 |
| B3 | PARTIAL | SAFETY | Native uses negotiated MTU; web assumes the requested 400 |
| B4 | **FAIL** | SAFETY | Disconnect mid-job is reported as "cancelled", no pen-up on reconnect |
| P1 | **FAIL** | PAPER | Resize happens before background removal; no crop to subject |
| P2 | **FAIL** | PAPER | `planPlot` fits the image frame, not the stroke bbox |
| P3 | **FAIL** | PAPER | No smoothing before RDP: 46–52% of segments are axis/45° |
| P4 | **FAIL** | PAPER | One drawn line → one stroke going round both sides (2× length) |
| P5 | **FAIL** | PAPER | Loops not closed (1.41 px gap); no endpoint linking; stray fragments |
| P6 | **FAIL** | PAPER | Presets in pixels: min length 2.97 mm at 512 px vs 5.94 mm at 256 px |
| P7 | PASS (iOS, code) / UNVERIFIED (Android, web) | PAPER | EXIF applied by image-manipulator before jpeg-js |
| P8 | **FAIL** | HYGIENE | No stage logging; min-length filter silently drops 10.4% of length |
| C1 | **FAIL** | PAPER | Flatten tolerance 0.08 box units = 0.17–0.25 mm, before scaling |
| C2 | **FAIL** | PAPER | Flower leaf bases sit 1.4–4.1 mm off the stem |
| T1 | PASS | — | Natural variation is seeded from the text; identical across runs |
| T2 | **FAIL** | PAPER + SAFETY | Fit width leaves 37 mm on the right; text 0.34 mm past the top margin |
| G1 | **FAIL** | SAFETY | `F` on every `G0`; pen-down `G1 Z0` has no F and runs at 3000 mm/min |
| G2 | **FAIL** | SAFETY | No G92/homing in header; no `M2` |
| G3 | **FAIL** (conflict) | SAFETY | Park chosen from the last stroke (default `corner`) |
| G4 | **FAIL** | SAFETY | No validator; export and BLE send are unchecked |
| X1 | **FAIL** | SAFETY | Text exceeds the margin: 3 pen-down points, worst 0.34 mm (and 0.55 mm on the right) |

---

## Robot / BLE (highest priority)

### B1 — Flow control is off by default and too coarse when on — SAFETY
- `lib/robot/protocol.ts:47` `ackMode: 'none'` is the default.
- `lib/robot/sender.ts:61-66` writes a whole chunk (up to 397 B, ~15 lines) **before** waiting
  for any `ok`, even in `line` mode.
- **Firmware RX buffer size: unknown — I cannot confirm it from this repo.** GRBL's serial RX
  buffer is 128 B by default; ESP32 BLE-UART bridges vary.
- Repro: `catalog/robot.gcode` (9 758 B) with defaults → 26 BLE writes issued back to back,
  bounded only by the BLE write acknowledgement (simulated robot test: all 26 accepted with
  no app-level wait). With `line` mode, each write still carries up to 397 B into a buffer
  that may be 128 B.
- Fix: add a `rxBufferBytes` setting (default 128) and a **GRBL character-counting** mode:
  keep a queue of sent line lengths, only send the next line while
  `sum(unacked line lengths) + next ≤ rxBufferBytes`, pop on each `ok`, fail on `error:`.
  Make it the default. Keep BLE chunking (≤ MTU−3) as the *transport* layer underneath, i.e.
  pack only the lines the counter allows into each write. Keep `none` as an explicit
  "my firmware buffers everything" option with a warning.

### B2 — Cancel does not stop buffered motion — SAFETY
- `lib/robot/robot-context.tsx:217-229`: on cancel, stops sending between chunks, then writes
  `penUpCommand + "\n"` as an ordinary line.
- Repro (simulated robot): cancel after chunk 3 → robot received 3 chunks (≈1 190 B of moves)
  **then** `G0 Z5`. A real controller executes all buffered moves first, pen down, and only
  then lifts.
- Fix: on cancel send realtime `!` (feed hold), wait ~200 ms, send `0x18` (soft reset), wait
  for the controller's reset banner / `ok`, then send `penUpCommand`. **Conflict to flag:**
  `!` and `0x18` are GRBL realtime commands; custom firmware may ignore or misinterpret them.
  Proposal: a `firmware: 'grbl' | 'custom'` setting; `grbl` uses the sequence above, `custom`
  keeps today's behaviour plus a configurable "stop" command.

### B3 — Chunk size vs negotiated MTU — SAFETY (web only)
- Native: `lib/robot/link.ts:99` requests 400, `:145` reports `device.mtu`;
  `robot-context.tsx:173` `payloadSize(settings.mtu, connection.mtu)` = min(requested,
  negotiated) − 3 → correct, and logged in the in-app log (`:176`
  `Connected to X (MTU n)`), not to the console.
- Web: `lib/robot/link.web.ts:108` sets `mtu: settings.mtu` (assumed 400) → 397 B writes
  regardless of the real MTU; relies on BLE long writes.
- Not verified on hardware: whether iOS's reported `device.mtu` matches the with-response
  write limit.
- Fix: on web, default to 20-byte payload (the BLE minimum, MTU 23) unless the user enables
  "long writes"; log negotiated MTU with `console.info` on all platforms and show it in the
  panel (already shown on native).

### B4 — Disconnect mid-job — SAFETY
- `robot-context.tsx:163-166` on disconnect sets `cancelRef = true` and drops the
  connection; the send loop then throws `SendCancelled` → job state **`cancelled`**
  ("pen lifted"/"couldn't lift the pen"), not `failed`. Nothing happens on reconnect.
- Repro (simulated robot, `dropConnection()` during a send): job shows "Cancelled…";
  reconnecting sends nothing; the pen stays wherever the robot stopped.
- No silent resume: **PASS** (a new send always starts from line 1).
- Fix: distinguish disconnect from user cancel → job `failed` with "connection lost after N
  chunks"; remember `needsPenUp`; on the next successful connect send the stop/pen-up
  sequence (B2) before anything else and log it.

## Photo mode

### P1 — Crop to subject before resizing — PAPER
- `app/(tabs)/index.tsx:158` `preparePhoto(uri, w, h)` resizes the **whole frame** to 512 px
  (`lib/prepare-photo.ts:7,19`); background removal then runs on that (`index.tsx:119-122`);
  no crop afterwards.
- Repro (cat, 21% subject): subject stroke bbox 217×233 px inside a 512×384 frame → on A4
  the drawing is **80.5 × 86.5 mm** (42% of usable width, 31% of height). The portrait copy
  (384×512) gives 0.495 mm/px and 115 × 107 mm. Same mechanism as snoop's 277/512 = 0.541.
- Fix: run background removal on a working copy, take the mask bbox + padding (e.g. 4% of the
  bbox), crop the **original** photo to it, then resize to 512 px and re-run removal on the
  crop. Two passes cost ~250 ms on the measured scenes.

### P2 — Fit the stroke bbox, not the frame — PAPER
- `lib/sketch/export.ts:62-75` `pixelToPaperTransform` uses `sketch.width/height` (the image
  frame); `planPlot` (`:96`) inherits it.
- Repro: same as P1 — 80.5 × 86.5 mm drawn in a 190 × 277 mm area.
- Fix: compute the bbox of `sketch.strokes` and fit/centre that. **Conflict to flag:** Write
  mode currently relies on the frame (= writing area) to anchor text top-left; fitting the
  stroke bbox there would vertically centre a one-line message. See T2 for the proposal.

### P3 — No smoothing before RDP — PAPER
- `lib/sketch/index.ts:54-56`: `traceEdges` → length filter → `simplify` directly on
  8-connected pixel chains.
- Repro: share of segments within ±1° of 0/45/90/135°: **cat 49.5% (107/216), portrait
  46.5% (166/357), table 51.9% (83/160)**. Snoop's 76% is unverified (fixture missing).
- Fix: Gaussian-smooth each chain (σ = 1.25 px, endpoints pinned, closed loops wrapped)
  before RDP. Target < 20% on these three scenes.

### P4 — Line-art input gives double outlines — PAPER
- Canny outlines both sides of every drawn line; there is no threshold → skeleton path.
- Repro: one 6 px black line, 391 px long, on white → **1 stroke of 789.5 px** (it goes round
  both sides of the line, ≈ 2 × 391). A 4 px ring r = 100 → **two loops** (619.6 px inner,
  649.2 px outer).
- Fix: detect line art (≥ 85% of pixels near-white and a bimodal histogram) → adaptive
  threshold → Zhang–Suen skeleton → trace centrelines. Target: the 391 px line → 1 stroke of
  ~391 px; the ring → 1 loop. (This partially reverts the scan-mode removal you asked for
  earlier; it would live inside photo mode, not as a separate Scan feature.)

### P5 — Loops, endpoint linking, stray fragments — PAPER
- `lib/sketch/trace.ts:65-70`: pass 1 traces from endpoints, pass 2 picks up loops, so loops
  are traced, but `walk` (`:33-62`) never closes them; there is no gap linking; the length
  filter (`index.ts:55`) runs on unlinked fragments.
- Repro: the ring above → loops end **1.41 px** from their start (not closed), plus **8 stray
  2-point fragments of 11–16 px** at the diagonals. A line with 3 px gaps every 40 px → 55
  raw chains, 10 kept; nothing links them into one line.
- Fix: after tracing, close loops whose ends are ≤ 1.5 px apart (append first point); link
  endpoint pairs ≤ 2.5 px apart whose tangents differ by < 45°; then filter by length.

### P6 — Thresholds in pixels — PAPER
- `lib/sketch/index.ts:13-38` (`minStrokeLength`, `simplifyTolerance` in px).
- Repro: same scene at 512 px vs downscaled 256 px: min length **2.97 mm vs 5.94 mm**, RDP ε
  **0.33 mm vs 0.67 mm**, result **17 vs 13 strokes**, 720 vs 684 mm pen-down.
- Fix: presets in mm (`minStrokeLengthMm`, `simplifyToleranceMm`, `linkGapMm`); convert with
  the final mm/px (known after P1/P2 fitting) before filtering.

### P7 — EXIF orientation — PASS on iOS by code; UNVERIFIED on Android / web
- `node_modules/expo-image-manipulator/ios/ImageManipulatorModule.swift:27-28` adds
  `ImageFixOrientationTransformer` on load; Android loads via expo-image-loader (Glide,
  applies EXIF by default); web draws via `<img>` → canvas (browsers apply EXIF by default).
  jpeg-js only ever sees the manipulator's re-encoded output.
- Fix: none needed if verified. Phase 2 test: a JPEG with EXIF Orientation = 6 through the
  web build must come out portrait. Android needs an on-device check.

### P8 — No per-stage logging or loss guard — HYGIENE
- No logging anywhere in `imageToSketch`.
- Repro (cat, medium): traced 182 chains / 2 232.6 px → after min length 17 / 1 999.7 px
  (**−10.4% length**) → after RDP 17 / 1 940.1 px → plot 17 strokes / 720.0 mm.
- **Conflict to flag:** "fail if a stage drops > 5%" would fail every photo today, because the
  min-length filter is *meant* to drop noise. Proposal: log every stage; fail only if
  smoothing/RDP/linking change length by > 5% (they should be near-lossless); report the
  filter's drop as a number, not a failure.

## Catalog / Text

### C1 — Flatten tolerance not in mm — PAPER
- `lib/catalog/index.ts:20` `flattenPath(d, 0.08)` in 100-unit box space, before scaling;
  `lib/catalog/svg-path.ts:148` uses midpoint deviation (≈ sagitta).
- Repro on A4: flower 3.06 mm/unit → **0.25 mm**, sun 2.57 → 0.21 mm, cat 2.44 → 0.19 mm,
  car 2.07 → 0.17 mm. Target ≤ 0.05 mm. Straight lines are 2 points (**PASS**).
- Fix: flatten after the paper scale is known: pass `0.05 / mmPerUnit` as the tolerance (or
  flatten in mm in `planPlot`).

### C2 — Flower leaves detached from the stem — PAPER
- `lib/catalog/pictures.ts:266-268`: stem `M50 56Q47 72 50 92`; leaves start/end at fixed
  points `49,70`/`49,73` and `50,79`/`50,82`, assuming the stem is straight.
- Repro (A4, 3.06 mm/unit), distance from leaf base to the stem curve: **1.40 mm, 1.53 mm,
  4.10 mm, 3.50 mm** (limit 0.2 mm).
- Fix: build leaves from points evaluated on the stem curve (`Q` at the parameter where
  y = 70 / 79) and add a catalog test asserting every attach gap ≤ 0.2 mm.

### T1 — Reproducible variation — PASS
- `lib/text/layout.ts:93` `seededRandom(hash(text))`; two layouts of the same text and
  options are byte-identical (verified). Note: the seed ignores font/size, which is fine.

### T2 — Fit width and vertical placement — PAPER (+ X1)
- Repro, "textm hello", cursive, Fit width: capitals **25.0 mm** (hit the 25 mm cap,
  `layout.ts:41`), stroke bbox **x 11.16–173.00, y 261.30–287.34 mm** → left gap 11.16,
  **right gap 37.0 mm**, **top gap 9.66 mm (inside the 10 mm margin)**, bottom gap 261.3 mm.
  So it does not fill the width (by design of the cap) and sits on the top edge.
- `textm.gcode` itself is unverified (fixture missing).
- **Conflict to flag:** invariant 11 forbids anchoring to the top edge, but writing a note
  from the top of the page is how letters are normally laid out. Proposal: a "Position"
  option — `Top` (current, default for multi-line) / `Centre` (default for ≤ 2 lines); and
  raise or remove the 25 mm cap so Fit width actually fills the width (bounded by height).

## G-code

### G1 — Feeds — SAFETY
- `lib/sketch/export.ts:151` `G0 X.. Y.. F3000`; `:152` emits `penDownCommand` verbatim
  (`G1 Z0`, no F).
- Repro (text, flower, photo outputs): **15 / 12 / 18 `G0` lines carry F**; **14 / 11 / 17
  pen-down moves have no F** and therefore run at the modal **F3000** set by the preceding
  `G0` — the pen is driven down at travel speed.
- Fix: never emit F on G0; add `penFeedRate` (default 500 mm/min); emit
  `G1 Z<down> F<pen>` / `G0 Z<up>`; emit F on the first draw move after every pen-down.
  This requires splitting the free-text pen commands into `penUpZ` / `penDownZ` (or a
  servo command template) — **flag:** servo plotters using `M3 S..` have no feed; keep a
  "custom command" escape hatch that is exempt from the F rule.

### G2 — Header / footer — SAFETY
- `export.ts:143-157`: header `G21`, `G90`, pen up; **no `G92`/homing**; footer ends with the
  park `G0`, **no `M2`**.
- Fix: configurable start: `G28`/`$H` (home) or `G92 X0 Y0` (declare current position);
  footer: pen up → park → `M2`.

### G3 — Park position — SAFETY (conflict)
- `export.ts:35` default `finishAt: 'corner'`; `:107-114` picks the paper corner nearest the
  **last stroke**. Repro: text parks at `X210 Y297`, flower at `X0 Y297`, cat at `X210 Y0`.
- **Conflict to flag:** you asked for nearest-corner parking last round to cut travel; G3 now
  forbids a park derived from layout. Proposal: one configured park position (default
  X0 Y0, editable); remove `corner`; keep `stay` only if you want it.

### G4 — No validator — SAFETY
- `components/sketch-actions.tsx:29` (export) and `:44` (BLE send) call `sketchToGcode`
  directly. Nothing checks the output.
- Fix: `src/gcode/validate.ts` (invariants 1–6, 8, 12) run in both places; errors block
  export and send and are listed in the UI.

## Extra finding

### X1 — Pen-down points outside the margin — SAFETY
- Cause: line placement uses `metrics.ascent` (`layout.ts:101`), measured from H/l/d/f only;
  real glyph extents are taller (e.g. `Å` reaches 1 049 units vs ascent 662 in cursive), and
  word wrap uses advance widths, not ink extents.
- Repro: "textm hello", cursive, Fit width → **3 pen-down points above Y 287, worst 0.34 mm**;
  cursive word-wrapped at 9 mm → ink reaches **190.55 mm in a 190 mm area (0.55 mm over)**.
- Fix: lay out, measure the ink bbox, then fit/shift so it lies inside the area; the
  validator (G4) catches anything that still escapes.

## Invariants with no finding

- 2 (no rapid with the pen down): 0 occurrences in all three outputs.
- 6 (numbers): no NaN/Infinity/−0, no duplicate consecutive points, no zero-length strokes in
  the three outputs; dots in all four fonts are small shapes (0 strokes < 0.05 mm).
- 7 (Y flip in one place): only `pixelToPaperTransform` (`export.ts:74`).
- 8 (straight lines stay 2 points): yes; curves fail on tolerance (C1).

## Proposed Phase 2 order

G1 → G2 → G3 → X1 → G4 (validator gates everything) → B1 → B2 → B4 → B3 → P1/P2 → P3 → P5 →
P6 → P4 → P8 → C1 → C2 → T2 → P7 test. One commit per item, each with a test that fails
before and passes after.

**Decisions needed before Phase 2:** the conflicts in B2 (firmware type), G1 (servo pen
commands), G3 (corner vs fixed park), P4 (line-art path in photo mode), P8 (loss threshold),
T2 (top vs centre, the 25 mm cap) — and please push the three fixtures and `fix_gcode.py`.
