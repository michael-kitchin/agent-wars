# Res4 Zoom Hide Strategic Units — Execution Plan

*When the strategic map enters res4 detail zoom, hide strategic unit markers, stack visuals, stale intel ghost markers, and stack callouts. Build buttons were already suppressed at this zoom. Everything else (order paths, terrain/res4 overlays, tactical magnifiers, sidebar selection, resolution combat markers) stays unchanged.*

---

## Goal

When the player zooms the **strategic** map far enough to see res4 hexes:

- Hide strategic unit markers and stack visuals (canvas)
- Hide stale enemy intel ghost markers (canvas); keep fog tracking running
- Hide and block stack callout popup (`#stack-callout`)
- Verify build buttons remain hidden (already implemented)

## Res4 visibility gate

Res4 uses screen-space fill fraction with hysteresis in `src/renderer/map/terrainView.ts`:

- Show at **≥ 80%** viewport fill (`RES4_SHOW_THRESHOLD_VIEW_FRACTION`)
- Hide at **≤ 70%** (`RES4_HIDE_THRESHOLD_VIEW_FRACTION`)
- Tactical battles force res4 on regardless

Strategic-only hide helper:

```typescript
shouldHideStrategicMapUnitsForRes4Zoom() === shouldRenderRes4Hexes() && !S.tacticalBattleSnapshot
```

## Confirmed product decisions

| Topic | Decision |
|-------|----------|
| Stale intel ghost markers at res4 | Hide |
| Stale intel tracking while at res4 | Keep running |
| Build buttons at res4 | Hide (pre-existing) |
| Tactical magnifiers at res4 | Keep visible |
| Sidebar selection at res4 | Persist |
| Resolution `?` battle markers | Keep visible |
| Tactical battle units | Unchanged |

## Implementation summary

| Area | File | Change |
|------|------|--------|
| Shared gate | `terrainView.ts` | `shouldHideStrategicMapUnitsForRes4Zoom()` |
| Canvas units | `renderer.ts` `drawGameScene` | Gate `drawUnits` / `drawMovingUnits` |
| Stale intel | `unitDrawing.ts` | Early return after tracking block |
| Stack callout | `renderer.ts` | Guards on show/refresh; dismiss in `redraw` / `resizeAndRedraw`; `hideStackCallout` no-ops when already hidden |
| Hit-testing | `mainMapInteractions.ts`, `drawInteraction.ts` | Zero effective unit icon hits when hidden |
| Tests | `rendererConsolidation.test.ts` | `testRes4ZoomHidesStrategicMapUnits` |

## Manual test checklist

1. Strategic map zoomed out: units, stacks, build buttons, stale intel visible.
2. Zoom into res4: units/stacks/stale markers and build buttons hidden; res4 terrain/overlays remain; order paths work with sidebar selection.
3. Zoom back out: units and overlays reappear; stale intel correct for enemies that left fog while zoomed in.
4. Open stack callout, zoom into res4: callout dismisses; cannot re-open at former unit position.
5. Tactical battle: units and stack callout unchanged.
6. Resolution animation at res4: move/combat lines play; march unit markers hidden.

## Build note

Run `npm run build:renderer` before manual Electron testing to refresh `static/renderer.js`. CI tests read TS sources directly via `npm test`.
