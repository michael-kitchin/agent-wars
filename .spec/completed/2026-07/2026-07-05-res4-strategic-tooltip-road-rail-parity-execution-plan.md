# Res4 Strategic Tooltip Road/Rail Parity — Execution Plan

*Align strategic res4 hex tooltips with tactical res4 tooltips for Road/Rail Features labels and transport Effects.*

---

## Problem

Strategic res4 zoom tooltips omitted **Road** and **Rail** from the Features line because `featureLabelsForRes4Child` only read side masks from `S.tacticalBattleSnapshot`. The Effects line already used `S.res4RoadRailSidesByH3` (session-global data from `game:getRes4RoadRailOverlays`).

## Solution

Introduce `res4RoadRailSideMasksForChild(detailH3)` as the single lookup into `S.res4RoadRailSidesByH3` for both:

- `featureLabelsForRes4Child` — Features line (`Road`, `Rail`)
- `res4EffectFieldsForChild` — Effects line (`(+) All Movement` via `hasRoad` / `hasRail`; see `.spec/completed/terrain-effects-tooltip.md`)

Parent res1 exploration gate unchanged (`infraGlyphsAllowedForRes4Child`).

## Files changed

| File | Change |
|------|--------|
| `src/renderer/map/terrainTooltipRes1State.ts` | Shared mask helper; Features use global map |
| `src/main/rendererConsolidation.test.ts` | Static contract tests updated |

## Manual verification

1. Strategic game, zoom to res4 on an explored hex with visible road/rail overlay.
2. Hover hex tooltip: Features includes `Road` and/or `Rail` when side masks are active.
3. Effects includes `(+) All Movement` on plains/road hexes (same as tactical).
4. Tactical battle tooltips unchanged.
5. Unexplored parent res1 hex: no Road/Rail features and no transport effects.
