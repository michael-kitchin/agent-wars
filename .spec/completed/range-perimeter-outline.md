# Range Perimeter Outline

Execution plan for animated range perimeter during ranged-attack and air-strike planning modes. See the Cursor plan artifact for phase details; implementation places testable pure modules under `src/shared/` and canvas overlay under `src/renderer/rendering/rangePerimeterOverlay.ts`.

## Behavior

- Visible while `rangedModeActive` or `airStrikeModeActive`.
- Union of selected units' range hexes; outer perimeter only (no LOS).
- Strategic res1: `getRange` / `AIR_STRIKE_RANGE_HEXES`; tactical res4: effective tactical range / full footprint for air strike.
- Style: red `#ff0000`, line width is `ORDER_LINE_WIDTH * 1.5`, opacity matches route preview paths (`globalAlpha = 0.55`), `lineCap` round, flowing via `lineDashOffset` at 12 px/s. Ranged: dash at least `[8px, 8px]` (1:1). Air strike: inverted ratio at least `[4px, 16px]` (1:2 dash:gap — less dash, more space). Planned ranged and air-strike lines use the matching non-animated style for their mode.
- Hidden on commit, cancel, or mode exit.
