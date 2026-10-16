# Baseline fixtures

Generated from the source at commit `e468560` (before the audit fixes) with the default
plotter settings (A4 portrait, 10 mm margin, F1500 draw / F3000 travel, `G0 Z5` / `G1 Z0`):

| File | Input |
| --- | --- |
| `textm.gcode` | Write: "textm hello", Cursive, Fit width, Natural |
| `flower.gcode` | Draw → Catalog: Flower |
| `snoop.gcode` | Draw → My photo: `snoopScene()` from `tests/helpers/scenes.ts`, Medium, background removed |

They record the defects listed in `AUDIT.md`; `tests/validate.test.ts` asserts that they fail
validation. Don't regenerate them — the regeneration tests build fresh output from the
current source instead.
