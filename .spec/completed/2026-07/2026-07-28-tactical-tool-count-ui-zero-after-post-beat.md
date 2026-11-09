# Tool UI counts: strategic / tactical parity

## Symptom
Tool calls appear in `debug.log`, but OpenRouter tool-group buttons often stay at `0` after Ready—especially in tactical, and whenever Ready zeros counts then a consult path omits them.

## Root causes
1. **Tactical post-beat:** `afterTacticalBeatResolution` required `tacticalOpponentPlan` on `requestOrders` success; raw flow only returns `orders`, so tool counts were dropped (`hasToolInvocationCounts: false`).
2. **Strategic post-resolution:** `afterResolution` used `result.success && result.orders`, which could skip storing pending orders / returning counts on odd success shapes; success gate now matches tactical (`success === true`).
3. **Renderer Ready:** Strategic Ready restored cached precomputed tool counts when the IPC result omitted them; tactical commit did not, so prefetch telemetry vanished after the shared zero-at-Ready-start reset (including deferred post-beat).

## Fix
1. `tacticalOpponentPlanFromRequestOrdersSuccess` + post-beat success normalization (forwards counts).
2. `afterResolution` treats any successful `requestOrders` like tactical (store pending, return strategy + counts).
3. Shared `applyToolInvocationCountsAfterReady` used by strategic Ready and tactical commit; aborted Ready paths restore pre-click counts.
