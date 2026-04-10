# File size decomposition plan (single pass)

This document is the **single decomposition plan** for every `src/**/*.ts` file that **violates the 1000-line hard limit** (and adjacent “hotspot” files that should shrink toward the 600-line desirable limit). It aligns with rule #9 (600 desirable / 1000 hard) and keeps **behavior-neutral** refactors: no rule changes, only moves and thin facades.

Line counts were taken from the repository at plan authoring time; re-measure after each merge.

## Inventory (hard limit > 1000)

| Priority | File | Approx. lines | Role |
|----------|------|---------------|------|
| P0 | `src/renderer/renderer.ts` | ~3500+ | Renderer entry: wiring, Leaflet/canvas orchestration, sidebar glue |
| P0 | `src/shared/ipcTypes.ts` | ~2400+ | Cross-process DTOs and API shapes |
| P1 | `src/main/openrouter/openRouter.ts` | ~1650+ | OpenRouter client + request lifecycle |
| P1 | `src/main/gameActions.ts` | ~1600+ | Game action façade (IPC-facing) |
| P1 | `src/main/gameDb.ts` | ~1500+ | DB access and snapshots |
| P2 | `src/main/openrouter/requestOrdersFlow.ts` | ~1260+ | Order request pipeline |
| P2 | `src/main/game-actions/humanMarchPreview.ts` | ~1250+ | Human march preview logic |
| P2 | `src/main/openrouter/possibleUnitActions.ts` | ~1100+ | Briefing “possible actions” markdown |

## Global principles

1. **Extract before rename**: move code to new modules with identical exports from a thin barrel where needed (`export * from './x'` only when cycles are impossible; prefer explicit re-exports).
2. **One direction of dependency**: inner modules must not import the old god file; the god file (or a small `index.ts`) imports inner modules.
3. **Preserve public API**: `gameActions.ts`, `ipcTypes.ts`, and renderer entry must keep stable import paths for callers until a dedicated “import path migration” change is approved.
4. **Verify after each slice**: `npm run build`, `npm run test`, `npm run lint`, `npm run check:circular`.
5. **Orienting comments**: new top-level declarations get the orienting pass (`npm run orienting-comments:apply`) or ESLint will fail.

## P0 — `src/renderer/renderer.ts`

**Goal**: Entry file ≤ 600 lines; only composition, `init()`, and `declare global` augmentation if still required.

**Suggested modules** (names indicative; adjust to match existing domains):

| Module | Responsibility | Notes |
|--------|------------------|-------|
| `renderer/stackCallout.ts` | Stack callout UI, sealift section, tooltips tied to stack | Large contiguous block today |
| `renderer/terrainPointerState.ts` | `terrainStateForPointer`, `namingLookupTargetForPointer`, res4/res1 tooltip assembly | Types live in `map/terrainTooltipTypes.ts` (shared with `mainMapInteractions`) |
| `renderer/resolutionAnimationBridge.ts` | Resolution playback tick, `drawGameScene`, animation deps wiring | Touches canvas + state snapshot |
| `renderer/rendererReadyWiring.ts` | Ready button handler assembly (`ReadyHandlerDeps`) | Keeps `init()` readable |
| `renderer/rendererMapWiring.ts` | `wireInitCore` / `wireMainMapInteractions` argument objects | Pure data assembly |

**Order**: (1) types + pointer helpers → (2) map wiring objects → (3) resolution/canvas → (4) stack/ready → (5) trim entry.

**Risk**: Highest coupling and `declare global`; move `Window` augmentation last or keep in entry with a single import side-effect module.

## P0 — `src/shared/ipcTypes.ts`

**Goal**: No single file above 1000 lines; consumers keep `from '../../shared/ipcTypes'` via a barrel **only if** tree-shaking and circularity allow.

**Suggested split** (domain folders under `src/shared/ipc/` or similar):

| Module | Contents |
|--------|----------|
| `ipc/coreSnapshots.ts` | `GameStateSnapshot`, hex/unit core, fog basics |
| `ipc/ordersAndCombat.ts` | Orders, combat results, ranged/air/ferry |
| `ipc/productionAndBuild.ts` | Build queue, production, caps |
| `ipc/openRouterAndTools.ts` | LLM/tool payloads, briefing-adjacent DTOs |
| `ipcTypes.ts` (thin) | Re-export surface matching today’s public types |

**Order**: Extract leaf types (enums, small unions) → medium composites → `GameStateSnapshot` last (most inbound edges).

**Risk**: Circular type references; resolve with `import type` and lazy `interface` merges or shared `typesCore.ts`.

## P1 — `src/main/openrouter/openRouter.ts`

**Goal**: Core client &lt; 600 lines; side channels isolated.

| Module | Responsibility |
|--------|----------------|
| `openRouter/openRouterHttp.ts` | Fetch, retries, timeouts |
| `openRouter/openRouterPayloads.ts` | Body building, model id normalization |
| `openRouter/openRouterErrors.ts` | Error classification and user-visible messages |
| `openRouter.ts` | Orchestration only |

## P1 — `src/main/gameActions.ts`

**Goal**: IPC entry stays thin; domain handlers grouped.

| Module | Responsibility |
|--------|----------------|
| `game-actions/gameActionsSelection.ts` | Selection-related IPC |
| `game-actions/gameActionsOrders.ts` | Order submission paths |
| `game-actions/gameActionsBuild.ts` | Build queue / production UI-facing |
| `gameActions.ts` | Re-export / delegate registry |

**Order**: Remove unused imports first (lint), then split by `grep` for exported function clusters.

## P1 — `src/main/gameDb.ts`

**Goal**: DB layer split by concern (schema vs query vs fog vs seeding touchpoints already live under `game-db/` — continue that pattern).

| Module | Responsibility |
|--------|----------------|
| `game-db/readQueries.ts` | Heavy read-only SQL |
| `game-db/writeQueries.ts` | Mutations |
| `gameDb.ts` | Public façade + transaction boundaries |

## P2 — `src/main/openrouter/requestOrdersFlow.ts`

Split by **phase**: validation → model call → parse → persist → telemetry. Each phase ≤ 400 lines.

## P2 — `src/main/game-actions/humanMarchPreview.ts`

Split **pure geometry / reach** from **snapshot IO / logging**. Keep `humanMarchPreviewDiagnostics.ts` as the sink for verbose diagnostics.

## P2 — `src/main/openrouter/possibleUnitActions.ts`

| Module | Responsibility |
|--------|----------------|
| `possibleUnitActions/constants.ts` | `ENEMY_PLAYER`, action labels, bucket tables |
| `possibleUnitActions/markdown.ts` | `buildPossibleUnitActionsMarkdown` |
| `possibleUnitActions/partition.ts` | `partitionHomelandNearestOther` + helpers |
| `possibleUnitActions.ts` | Re-exports |

## Typing strategy (Leaflet / CDN globals)

1. **Prefer upstream**: add **`@types/leaflet`** as a devDependency and use `import type` from `leaflet` for map/layer/control shapes where the runtime still comes from `static/vendor/leaflet`.
2. **Where Leaflet’s types lag** (custom panes, plugin-less builds): use **`unknown` + narrow** at boundaries (`getPanes()`, dynamic plugin slots).
3. **Augment**: keep `leafletShim.d.ts` in sync with how `worldLeafletMap.ts` uses `L` (minimal ambient surface).

## CI / quality gates

- `npm run test` must include **`npm run lint`** (wired in `package.json`).
- GitHub Actions workflow should run **`npm run test`** unchanged so lint runs on all platforms.

## Completion checklist

- [ ] All listed files ≤ 1000 lines (re-run line-count script).
- [ ] `npm run lint` — 0 errors.
- [ ] `npm run test` — pass on Windows (local) and in CI matrix.
- [ ] `npm run check:circular` — pass.
- [ ] `npm run orienting-comments:dry-run` — 0 edits (optional hygiene after moves).
