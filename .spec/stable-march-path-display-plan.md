# Stable March Path Display

See execution plan in Cursor plan file `stable_march_path_display_e24233f1.plan.md` for full phase breakdown.

## Summary

Preserve committed march route paths so they display stably across beats (tactical) and turns (strategic), instead of re-running Dijkstra from the current unit position on every refresh.

## Phases

1. **Shared path-tail utility** — `findPathTailFromCurrentPosition` in `src/shared/marchPathUtils.ts`
2. **Strategic route caching** — `cachedOriginH3` + `cachedRouteSegments` in `computed_route`; `listHumanStandingOrders` cache hit
3. **Tactical preview override-path** — `TacticalDraftPreviewResult` wrapper; `overridePathH3Indexes` option
4. **Tactical renderer** — `pathH3Indexes` + `cachedSegments` on pending march rows; continuation tail advance in `readyHandler`
