# RoboSketch — UX and design system

## 1. Who uses it

**A maker with a pen-plotter robot** (hobbyist, teacher, parent with a kid, small studio).
Comfortable with apps, not necessarily with G-code. Uses RoboSketch in short sessions next to
the machine: pick something, put paper in, draw, repeat. Sometimes on a phone in one hand,
sometimes on a laptop at the bench.

Frustrations we design against:

- *"Is it connected? Is it drawing? Did it finish?"* — uncertainty about machine state.
- *"What does this setting do?"* — machine jargon (G92, MTU, feed rates) in the main flow.
- *"Where is the button?"* — the main action scrolled off-screen.
- *"It ruined my paper."* — wrong size, wrong place, pen dragging after a cancel.

## 2. The primary task

> **Get a drawing onto paper.**

Everything else (machine setup, exports, Bluetooth details) supports that. The primary
action — **Send to robot** — is always visible, in the same place, on every creation screen.

## 3. Journey

| Step | What the user does | What the UI provides |
| --- | --- | --- |
| Entry | Opens app | Lands on **Draw** with a drawing already selected and previewed — never an empty screen |
| Understand | Looks at the preview | The real sheet of paper, margins, and one summary line: strokes · size · time |
| Decide | Picks a drawing, photo or text; adjusts 1–2 options | Options next to the preview; advanced options hidden until needed |
| Act | Taps **Send to robot** | Bottom action bar; if not connected the same button reads **Connect robot** |
| Confirm | Watches progress | Progress in the action bar; global status shows *Drawing 42%* |
| Continue | Next drawing | Success message with *Done*; selection stays so a re-run is one tap |

Removed steps: no separate "export then send"; no visiting Settings before the first drawing
(defaults work for A4); connection setup is one tap from wherever you are.

## 4. Information priority

- **Must know:** what will be drawn (preview), robot status, the Send action, errors.
- **Should know:** drawing size, stroke count, estimated time, current paper size.
- **Nice to know:** G-code details, MTU, flow control, firmware — in Robot → Advanced.

## 5. Information architecture

```
Draw      Gallery | Photo        (choose → preview → send)
Write                            (type → preview → send)
Robot     Status & connection    (connect, current job, recent activity)
  ├─ Paper            size, orientation, margin
  ├─ Pen              Z axis or custom commands, pen feed
  ├─ Motion           drawing / travel speed, start position, park
  └─ Connection       Bluetooth, firmware, flow control (advanced)
```

- Three tabs, named for what you do. Machine setup moved under **Robot** as grouped rows that
  open focused pages (progressive disclosure) instead of one long form.
- A **robot status pill** in the header of Draw and Write shows connection and job state and
  opens the Robot tab.

## 6. Layout

- Content width capped at 720 px (phones use the full width with 16 px gutters).
- From 960 px wide (tablets, desktop web) creation screens use two columns: preview on the
  left (sticky), controls on the right. The action bar sits under the controls.
- Spacing on a 4 px grid: 4 · 8 · 12 · 16 · 24 · 32 · 48.
- Surfaces are flat with 1 px hairline borders; no drop shadows except the action bar's
  separating border. Radius 6 (controls) / 10 (cards) / 14 (sheets).

## 7. Visual language

- **Colour:** neutral greys for structure; one accent (calm blue `#2F5BD3`, `#7EA2FF` in dark)
  only for the primary action, selection and focus. Semantic colours only for state: green
  connected/success, amber warning, red error. All text meets WCAG AA contrast.
- **Type:** system font. Screen title 22/28 semibold (compact 56 px header) · Section 17/22
  semibold · Body 16/22 · Secondary 15/20 · Label 14/20 medium · Caption 13/18 · Mono for
  machine values.
- **Motion:** none decorative. Pressed states and progress only.

Contrast (WCAG 2.1, light / dark): body text 16.9 / 15.7, secondary 5.6 / 8.2, tertiary
4.8 / 5.5, accent on surface 5.9 / 7.1, white on accent 5.9, semantic text on its tint ≥ 4.7.
Tokens live in `constants/theme.ts` (`Colors`, `Space`, `Radius`, `Layout`, `Type`);
components read the palette with `useTheme()`.

## 8. Components

`Screen` (header, max-width, two-column) · `Text` (type scale) · `Button` (primary / secondary
/ tertiary / destructive, loading, disabled) · `IconButton` · `Segmented` · `Chip` ·
`Section` + `Row` (grouped settings list with value + chevron) · `Field` (label, unit,
helper, error) · `SwitchRow` · `Banner` (info / success / warning / error with action) ·
`StatusPill` · `ActionBar` · `ProgressBar` · `Sheet` (export choices) · `EmptyState` ·
`PaperPreview`.

Where they live:

| Component | File |
| --- | --- |
| `Screen`, `Workspace` (creation layout), `useIsWide` | `components/ui/screen.tsx` |
| `Text` | `components/ui/text.tsx` |
| `Button`, `IconButton` | `components/ui/button.tsx` |
| `Segmented` | `components/ui/segmented.tsx` |
| `ChipGroup` | `components/ui/chip.tsx` |
| `Section`, `Row`, `OptionList` (radio rows with explanations) | `components/ui/list.tsx` |
| `NumberField`, `TextField`, `FieldRow` (inline validation) | `components/ui/field.tsx` |
| `Banner` | `components/ui/banner.tsx` |
| `ProgressBar` | `components/ui/progress-bar.tsx` |
| `Sheet` (bottom sheet / dialog) | `components/ui/sheet.tsx` |
| `StatusPill`, connect flow, status wording | `components/robot/` |
| `PlotActionBar` (summary, Connect → Send → Stop, outcome, export) | `components/plot-action-bar.tsx` |
| `SketchPreview` / `Stage` (paper fitted to its container) | `components/sketch-preview.tsx` |

Fields never silently revert: an out-of-range value stays in the box with the allowed range
("Enter a value from 0–104 mm.") and the stored setting is unchanged until it's valid.
Destructive resets ask for confirmation.

## 9. States

Every screen defines: empty (useful, with the next action), loading (inline, labelled),
error (what happened + what to do + a button), success (brief, dismissible).

## 10. Accessibility

44 × 44 pt minimum targets · labelled controls with roles and states · visible focus ring on
web · keyboard reachable (web) · colour never the only signal (icons + text) · respects
system dark mode and text scaling.
