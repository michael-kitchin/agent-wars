# TypeScript Modularization Baseline

Baseline captured before execution of the modularization plan.

## Target files and line counts

- `src/renderer/renderer.ts`: 5,543
- `src/main/openRouter.ts`: 2,374
- `src/main/gameActions.ts`: 2,092
- `src/main/gameDb.ts`: 2,084

## Automated verification command baseline

- `npm run build:main`
- `npm run build:renderer`
- `node dist/main/rendererConsolidation.test.js`
- `node dist/main/openRouter.matrix.test.js`
- `node dist/main/gameActionsMultiSelect.test.js`
- `node dist/main/gameActionsProduction.test.js`
- `node dist/main/productionRules.test.js`
- `node dist/main/productionOrders.test.js`
- `node dist/main/submitOrdersPayload.test.js`
- `node dist/main/gameDb.test.js` (requires native `better-sqlite3` availability in runtime)

## Known environment caveat

- `gameDb.test` hard-fails when `better-sqlite3` native bindings are unavailable for the active Node runtime.
