# Maintainability consolidation and reuse — execution plan (v5)

Audience: a **lower-quality** coding agent (mechanical refactors preferred; avoid cleverness).  
Goal: improve **maintainability** through **consolidation, reuse, and small extractions** with **low behavior risk** and **clear verification** after every phase.

This plan continues the series in `.spec/completed/maintainability-consolidation-execution-plan-v{2,3,4}.md` and the strategic/tactical parity plan. It **does not** replace `.spec/completed/file-size-decomposition-plan-v1.md` (mega-file strategy). Prefer **thin extractions** and **typed seams** over big-bang rewrites.

---

## Non-goals (explicit)

1. No gameplay rule changes, movement costs, combat, pathfinding, or tooltip copy semantics.
2. No changes to generated JSON schemas, pipeline outputs, or IPC **channel name strings**.
3. No preload bundling change; keep the sandboxed preload’s local channel maps.
4. No dependency upgrades or adoption of `@types/leaflet`.
5. No broad splits of `renderer.ts`, `gameActionsCore.ts`, `gameDb.ts`, `requestOrdersFlow.ts`, or `registerIpcHandlers`.
6. No commits or pushes (human review stays authoritative).
7. Do **not** “fix” the tactical `h3ToLatLng` `[0, 0]` fallback; preserve both fallback behaviors behind an explicit parameter and document the discrepancy only in this `.spec` file (never as a phase/opportunity identifier in source).

---

## Baseline facts (anchor the work)

Approximate line counts observed when planning; **re-measure at Phase 0**:

| Area | File | Approx lines | Why it matters |
|------|------|---------------|----------------|
| Renderer monolith | `src/renderer/renderer.ts` | ~3060 | Hard to review; duplicated resolution overlay blocks drift |
| Game actions façade | `src/main/game-actions/gameActionsCore.ts` | ~1680 | Repeated sealift empty-state literal |
| Main entry / IPC | `src/main/main.ts` | ~650 | Triplicated overlay IPC try/catch; sealift empty states |
| Ready IPC types | `src/shared/ipc/readyTypes.ts` | ~1020 | Out of scope for this plan (comment-heavy types) |
| Tool pathfinding | `src/main/tools/tool1Pathfinding.ts` | ~920 | Local `h3ToLatLng` duplicated across tools |

---

## Consolidation opportunities (9), prioritized

1. **Shared tools `h3ToLatLng`**  
   - Today: identical helpers in `tool1Pathfinding.ts`, `tool2Assessment.ts`, `tool3CombatEstimation.ts`; `tacticalTool1Pathfinding.ts` falls back to `[0, 0]` instead of `cellToLatLng`.  
   - Target: `src/main/tools/h3LatLng.ts` owning `LatLng`, `LatLngMap`, and `h3ToLatLng(h3, map, fallback)` with `fallback: 'cellCenter' | 'origin'`. Each tool re-exports `LatLng` so existing `import type { LatLng } from './tool1Pathfinding'` call sites stay untouched.

2. **`emptySealiftStackState` factory**  
   - Today: the same eight-field `SealiftStackState` literal appears in `main.ts` (invalid payload ×2), `gameActionsCore.ts` (inactive tactical), and `tacticalSealiftStackState.ts`.  
   - Target: `src/shared/sealiftStackState.ts` exporting `emptySealiftStackState(h3Index?: string)` matching `SealiftStackState` in `src/shared/ipc/sealiftTypes.ts`.

3. **Logged IPC handler wrapper for res4 overlays**  
   - Today: three identical try/catch+logError handlers in `main.ts` for city / road-rail / transport-vector overlays.  
   - Target: `src/main/ipc/loggedIpcHandler.ts` with `registerLoggedIpcHandler(ipcMain, channel, label, handler, fallback)` (inject `ipcMain` for node-testability). Apply only to those three handlers in this plan.

4. **Preload ↔ shared IPC channel drift guard**  
   - Today: `preload.ts` re-declares `IPC_GAME` / `IPC_OPENROUTER` because sandboxed preload cannot require local modules; `src/shared/ipc/channels.ts` is the documented source of truth.  
   - Target: `src/main/preloadIpcChannelParity.test.ts` that **imports** the real maps from `channels.ts` and **parses only** preload source text, asserting key/value parity both directions for both maps. No runtime bundling change.

5. **Build-count sanitizer reuse**  
   - Today: `sanitizeBuildCountInputText` in `buildQueuePopup.ts` and private `sanitizeCount` in `buildQueueMultiPopup.ts` are the same 1–99 digits-only rule.  
   - Target: move the function into the leaf module `src/renderer/gameplay/buildQueuePopupFormatting.ts` (zero imports today); both popups import it from there.

6. **Support-order line stroke helper**  
   - Today: `drawRangedAttackLines`, `drawRangedResolutionShotLines`, and `drawAirStrikeLines` in `orderDrawing.ts` repeat save / alpha / dash / stroke / restore.  
   - Target: one internal `strokeSupportOrderLines(ctx, mode, segments)` (or equivalent); keep the three public signatures unchanged.

7. **Pending order replacement + representative selection**  
   - Today: three near-identical `replacePending*ForSelected` functions and twin tactical/strategic loops in `getRepresentativeSelectedUnitIdsByOrigin` in `tacticalOrders.ts`.  
   - Target: a private helper that filters/pushes via a row builder callback (air strike carries `targetType`); one loop with a unit lookup map for representative selection. Public exports/signatures unchanged.

8. **Transient pointer tooltip factory**  
   - Today: `orderBlockHexTooltip.ts` and `orderSlowerHexTooltip.ts` differ mainly by element id and whether the module escapes plain text vs accepts pre-built HTML.  
   - Target: factory (extend `transientPointerTooltipTtl.ts` or add `createTransientPointerTooltip.ts`) exposing show / hide / isVisible / repositionIfVisible. Keep `resolveOrderBlockHexTooltipMessage` and related message logic in the block module.

9. **Resolution combat overlay slice out of `renderer.ts`**  
   - Today: tactical (`drawGameScene` ~2407–2449) and strategic (~2539–2581) blocks select combat/casualty hexes and draw lightning + unknown markers + casualty overlays with identical logic. Shot lines are already drawn **before** units in both branches; do **not** move shot lines into this extraction.  
   - Target: `src/renderer/rendering/resolutionCombatOverlays.ts` taking `elapsed` as a parameter so strategic reuses `elapsedStrategic`. Assert draw order remains: shot connectors → units → lightning → casualties.

---

## Handoff and cadence (locked)

1. **One phase per change set.** After each phase’s verification passes, **stop and report** (files touched, greps run, test outcomes, before/after line counts when relevant). Wait for human go-ahead before the next phase.
2. **Renderer phases (5–9):** after automated verification, the human runs a **manual smoke** before the next phase starts. Do not proceed on smoke failures.
3. If a phase fails verification, **revert that phase whole** rather than patching forward into the next phase.
4. If a phase’s diff grows beyond the files it lists, **stop and report** rather than expanding scope.

---

## Anti-regression rules

1. Copy error strings, fallback values, and log message text **verbatim**; never paraphrase while moving code.
2. Preserve call order and short-circuit conditions exactly; changing when a guard runs is a behavior change.
3. New shared helpers keep existing **public** signatures of their callers; no call-site signature churn in the same phase as a body extraction (except re-exports of types from the same module path).
4. After each extraction, grep for the old local symbol / literal and record the result in the phase report.
5. Never put phase numbers, opportunity numbers, or plan identifiers into source, comments, configuration, or documentation under version control (this `.spec` plan file is the exception as the plan itself).
6. Orienting comments on every new and changed field and non-overriding method.
7. Main-process public functions: `logDebug` on entry; getters that do not modify state: `logTrace`; caught exceptions: `logError`. Use existing `logger` APIs. **Renderer modules add no logging** (they have none today).
8. Tests cover happy paths and essential failure cases only; no tests for accessors, DTO constructors, or pure pass-through delegation.
9. Keep every new module well under the **600-line** desirable limit; never exceed **1000**. Prefer ≤ **6** named parameters (hard cap 10); use a small options object if needed.
10. Prefer move + thin wrapper over clever generics.

---

## Phases (ordered for reliability)

**Verification bar for every phase (including Phase 0):**

```bash
npm test
npm run build:renderer
```

`npm test` already runs `rebuild:native:node`, `build:main`, `lint`, and all discovered `dist/**/*.test.js` files. New `*.test.ts` under `src/main` or `src/shared` are discovered automatically after `build:main` — no `package.json` wiring required.

Additionally for phases that touch renderer modules: `npm run check:circular`.

---

### Phase 0 — Readiness + inventory (no functional change)

**Intent:** Create a repeatable baseline so later diffs are obviously mechanical.

**Opportunities covered:** none (inventory only).

**Files:** this document only (append a Phase 0 inventory subsection at the bottom), or a short companion note if you must — prefer appending here.

**Steps:**

1. Run the full verification bar and confirm green before any code edit.
2. Re-measure line counts (PowerShell `Measure-Object -Line` or equivalent) for:

   - `src/renderer/renderer.ts`
   - `src/main/game-actions/gameActionsCore.ts`
   - `src/main/main.ts`
   - `src/main/tools/tool1Pathfinding.ts`
   - `src/main/tools/tool2Assessment.ts`
   - `src/main/tools/tool3CombatEstimation.ts`
   - `src/main/tools/tacticalTool1Pathfinding.ts`
   - `src/renderer/rendering/orderDrawing.ts`
   - `src/renderer/gameplay/tacticalOrders.ts`
   - `src/renderer/map/orderBlockHexTooltip.ts`
   - `src/renderer/map/orderSlowerHexTooltip.ts`
   - `src/renderer/gameplay/buildQueuePopup.ts`
   - `src/renderer/gameplay/buildQueueMultiPopup.ts`
   - `src/renderer/gameplay/buildQueuePopupFormatting.ts`
   - `src/main/preload.ts`
   - `src/shared/ipc/channels.ts`

3. Record a short “before” grep inventory (counts only):

   - `function h3ToLatLng` under `src/main/tools`
   - `contextMode: 'unsupported'` under `src/main` (empty sealift literals)
   - `getRes4CityOverlays` / `getRes4RoadRailOverlays` / `getRes4TransportVectorOverlays` handler bodies in `main.ts`
   - `sanitizeBuildCountInputText` and `function sanitizeCount` under `src/renderer/gameplay`
   - Duplicate stroke setup: count of `ctx.globalAlpha = RANGE_PERIMETER_ALPHA` in `orderDrawing.ts`

**Verification:**

- Full bar passes with **zero** source changes (or only this inventory subsection appended to this document).

**Stop gate:** Inventory recorded; human go-ahead before Phase 1.

---

### Phase 1 — Shared tools `h3ToLatLng`

**Intent:** One lat/lng resolution helper for AI tools without changing either fallback behavior.

**Opportunities covered:** #1.

**Files:**

- **Add** `src/main/tools/h3LatLng.ts`
- **Add** `src/main/tools/h3LatLng.test.ts`
- **Edit** `src/main/tools/tool1Pathfinding.ts`
- **Edit** `src/main/tools/tool2Assessment.ts`
- **Edit** `src/main/tools/tool3CombatEstimation.ts`
- **Edit** `src/main/tools/tacticalTool1Pathfinding.ts`

**Steps:**

1. Create `h3LatLng.ts` exporting:

   - `export type LatLng = [number, number];`
   - `export type LatLngMap = Map<string, LatLng>;`
   - `export type H3LatLngFallback = 'cellCenter' | 'origin';`
   - `export function h3ToLatLng(h3: string, latLngByH3: ReadonlyMap<string, LatLng>, fallback: H3LatLngFallback): LatLng`

   Contract:

   - If the map has `h3`, return that pair (tactical may copy `[ll[0], ll[1]]` — either is fine if values match).
   - If missing and `fallback === 'cellCenter'`, return `cellToLatLng(h3)` as `[lat, lng]` (same as today’s strategic tools).
   - If missing and `fallback === 'origin'`, return `[0, 0]` (same as today’s tactical tool).
   - Orienting comments on type and function. `logDebug` once at entry with `{ h3, fallback, hit: latLngByH3.has(h3) }` (main-process public helper).

2. In each of the three strategic tools: delete the local `h3ToLatLng` (and local `LatLng` / `LatLngMap` if present), import from `./h3LatLng`, call with `'cellCenter'`, and **re-export** `export type { LatLng } from './h3LatLng'` (or equivalent) so existing importers of `./tool1Pathfinding` keep working. Do **not** edit `tool5*` / `tool6*` files in this phase.

3. In `tacticalTool1Pathfinding.ts`: replace local helper with import; call with `'origin'`. Keep its orienting comment intent (missing entries yield `[0, 0]`).

4. Tests in `h3LatLng.test.ts` (happy + essential failure only):

   - Map hit returns the stored pair for either fallback.
   - Miss + `'cellCenter'` matches `cellToLatLng` for a known H3 (use a fixed valid index from existing tests, e.g. neighbors of `89283082807ffff`).
   - Miss + `'origin'` returns `[0, 0]`.

**Verification:**

- Full bar (`npm test` + `npm run build:renderer`).
- Grep: `rg "function h3ToLatLng" src/main/tools` should show **no** local definitions outside `h3LatLng.ts` (test file may mention the name).
- Grep: `rg "from '\\./tool1Pathfinding'" src/main/tools` still finds type imports that compile (build:main proves this).

**Stop gate:** Report results; wait for go-ahead. Do not touch sealift or IPC yet.

---

### Phase 2 — `emptySealiftStackState` factory

**Intent:** One empty `SealiftStackState` constructor so IPC and tactical paths cannot drift field-by-field.

**Opportunities covered:** #2.

**Files:**

- **Add** `src/shared/sealiftStackState.ts`
- **Add** `src/shared/sealiftStackState.test.ts`
- **Edit** `src/main/main.ts` (two invalid-payload returns)
- **Edit** `src/main/game-actions/gameActionsCore.ts` (inactive tactical early return)
- **Edit** `src/main/tacticalBattle/tacticalSealiftStackState.ts` (empty template)

**Steps:**

1. Add `emptySealiftStackState(h3Index: string = ''): SealiftStackState` in `src/shared/sealiftStackState.ts` returning exactly:

   ```ts
   {
     h3Index,
     showSealiftSection: false,
     contextMode: 'unsupported',
     controlsDisabled: true,
     hasEmbarkedUnitsInStack: false,
     debarkAllowedAtHex: false,
     navalRows: [],
     landOptions: [],
   }
   ```

   Import the type from `./ipc/sealiftTypes` (or via existing barrel if that is the local convention — prefer the domain module to avoid pulling unrelated IPC types). Orienting comment on the function. Shared module: no logging required (pure factory; shared code historically does not use main `logger`).

2. Replace all four call sites. For `main.ts` invalid payloads use `emptySealiftStackState()` or `emptySealiftStackState('')`. For the other two, pass the real `h3Index` argument as today.

3. Test: default `h3Index` is `''`; custom `h3Index` is preserved; `navalRows` / `landOptions` are empty arrays; `contextMode` is `'unsupported'`.

**Verification:**

- Full bar.
- Grep: `rg "contextMode: 'unsupported'" src/main` should only hit the factory (in shared) **or** comments — no remaining object literals with that field under `src/main` (the factory lives under `src/shared`).

**Stop gate:** Report; wait for go-ahead.

---

### Phase 3 — Logged IPC handler wrapper (res4 overlays only)

**Intent:** Collapse three identical overlay IPC handlers without changing channels, log labels, or empty-array fallbacks.

**Opportunities covered:** #3.

**Files:**

- **Add** `src/main/ipc/loggedIpcHandler.ts`
- **Add** `src/main/ipc/loggedIpcHandler.test.ts`
- **Edit** `src/main/main.ts` (only the three overlay handlers ~city / road-rail / transport-vector)

**Steps:**

1. Implement (names flexible if clearer, but keep ≤6 params):

   ```ts
   registerLoggedIpcHandler<T>(
     ipcMain: { handle: (channel: string, listener: (...args: any[]) => any) => void },
     channel: string,
     logLabel: string,
     handler: () => T,
     fallback: T
   ): void
   ```

   Behavior matching today’s handlers:

   - On invoke: `logDebug(logLabel)` (today uses strings like `'main IPC_GAME.getRes4CityOverlays'` — **copy those strings verbatim** into call sites).
   - `try { return handler(); } catch (err) { logError(\`${logLabel}: failed\`, err); return fallback; }`

   Orienting comments; `logDebug`/`logError` as above.

2. Replace **only** the three res4 overlay handlers. Leave other `ipcMain.handle` sites alone.

3. Tests with a fake `ipcMain`:

   - Happy path: registered channel invokes handler return value; debug log path exercised if you assert via a tiny injectable logger **or** simply assert return value (prefer return-value + that catch returns fallback).
   - Essential failure: handler throws → returns `fallback` (use `[]`).

**Verification:**

- Full bar.
- Grep: the three channels still appear once each as `IPC_GAME.getRes4…` registrations.
- Do not register unrelated handlers through the wrapper in this phase.

**Stop gate:** Report; wait for go-ahead.

---

### Phase 4 — Preload IPC channel drift guard

**Intent:** Fail CI when preload’s local channel maps drift from `src/shared/ipc/channels.ts`, without bundling preload.

**Opportunities covered:** #4.

**Files:**

- **Add** `src/main/preloadIpcChannelParity.test.ts`
- Optionally a tiny pure parser helper colocated (e.g. `src/main/preloadIpcChannelParity.ts`) if it keeps the test readable — keep under 200 lines total.

**Steps:**

1. Import `{ IPC_GAME, IPC_OPENROUTER }` from `../shared/ipc/channels`.
2. Read `src/main/preload.ts` as UTF-8 text (same pattern as `rendererConsolidation.test.ts`).
3. Parse the preload-local `const IPC_GAME = { ... } as const` and `const IPC_OPENROUTER = { ... } as const` object literals into `Record<string, string>` maps. Parsing rules must tolerate ordinary `key: 'value',` lines; do **not** parse `channels.ts` as text (JSDoc inside that object has already bitten similar approaches).
4. Assert for each map name:

   - Every key in shared exists in preload with the **same string value**.
   - Every key in preload exists in shared with the **same string value**.
   - No extra / missing keys.

5. Do **not** modify `preload.ts` or `channels.ts` in this phase unless a real drift is discovered — if drift exists, **stop and report** rather than silently “fixing” channel names (channel renames are a product decision).

**Verification:**

- Full bar (new test must pass via discovery).
- Confirm the test fails if you temporarily edit a preload value in a scratch check, then restore (optional local sanity; do not leave a failing edit).

**Stop gate:** Report; wait for go-ahead before renderer work.

---

### Phase 5 — Build-count sanitizer consolidation

**Intent:** One 1–99 digits-only sanitizer for single- and multi-hex build popups.

**Opportunities covered:** #5.

**Files:**

- **Edit** `src/renderer/gameplay/buildQueuePopupFormatting.ts` (add exported function; remains a leaf — **no new imports**)
- **Edit** `src/renderer/gameplay/buildQueuePopup.ts` (re-export or import from formatting; delete local body)
- **Edit** `src/renderer/gameplay/buildQueueMultiPopup.ts` (delete `sanitizeCount`; import shared)
- **Edit** `src/main/rendererConsolidation.test.ts` (source-text assertion that multi-popup imports the shared sanitizer / no local `function sanitizeCount`)

**Steps:**

1. Move `sanitizeBuildCountInputText` body into `buildQueuePopupFormatting.ts` with a proper orienting comment (contract: digits only, max 2 chars, empty→`'1'`, clamp 1–99 — **preserve exact current logic** from `buildQueuePopup.ts`, including `if (parsed > 99) return '99'` vs `Math.min` — prefer copying the **single-popup** implementation as the canonical one and use it from multi-popup).
2. `buildQueuePopup.ts` imports and may re-export the function if other files imported it from there — grep first:

   ```bash
   rg "sanitizeBuildCountInputText" src
   ```

   Update imports to the formatting module **or** keep a one-line re-export from `buildQueuePopup.ts` to avoid churn; either is fine if behavior is identical.
3. Multi-popup: replace `sanitizeCount(...)` calls with `sanitizeBuildCountInputText(...)`.
4. Add a short assertion in `rendererConsolidation.test.ts` that `buildQueueMultiPopup.ts` source contains an import of `sanitizeBuildCountInputText` and does **not** contain `function sanitizeCount`.

**Verification:**

- Full bar + `npm run check:circular`.
- Human **manual smoke** before Phase 6: open single-hex and multi-hex build popups; typing non-digits / `0` / `100` still clamps to 1–99.

**Stop gate:** Automated green + human smoke OK.

---

### Phase 6 — Support-order line stroke helper

**Intent:** One canvas stroke setup for planned ranged, air-strike, and resolution shot lines.

**Opportunities covered:** #6.

**Files:**

- **Edit** `src/renderer/rendering/orderDrawing.ts`
- **Edit** `src/main/rendererConsolidation.test.ts` (assert helper exists and public drawers still exported / call it)

**Steps:**

1. Extract a private or package-visible helper, e.g. `strokeSupportOrderLines(ctx, mode, segments)` where `segments` is a list of `{ fromH3Index, toH3Index }` (skip equal endpoints as today’s resolution drawer does). The helper must:

   - Call `rangePerimeterStaticLineStyle(mode)`
   - `save` → `globalAlpha = RANGE_PERIMETER_ALPHA` → dash / strokeStyle / lineWidth / round caps → stroke each segment via `hexCenterPx` / `hexCenterPxRelativeTo` → `restore`

2. Rewrite `drawRangedAttackLines`, `drawAirStrikeLines`, and the per-style groups inside `drawRangedResolutionShotLines` to use the helper. **Do not** change public function signatures or ferry drawing.

3. Source-text assertions: helper name present; three public functions still `export function`.

**Verification:**

- Full bar + `npm run check:circular`.
- Human smoke: place pending ranged and air-strike orders; confirm planned dashed connectors still match perimeter colors; during Ready resolution, shot lines (ranged + air-only return fire style) still appear under units / under lightning.

**Stop gate:** Automated green + human smoke OK.

---

### Phase 7 — Pending order replacement + representative selection

**Intent:** Remove copy-paste in `tacticalOrders.ts` without changing pending-array shapes or selection semantics.

**Opportunities covered:** #7.

**Files:**

- **Edit** `src/renderer/gameplay/tacticalOrders.ts`
- **Edit** `src/main/rendererConsolidation.test.ts` (lightweight: public function names still exported; optionally that a private helper name appears once)

**Steps:**

1. Introduce a private helper used by all three `replacePending*ForSelected` functions, roughly:

   - Invalidate via `withTacticalHumanDraftPrefetchInvalidation`
   - Filter current array removing `selectedIds`
   - Push one row per selected id built by a callback

   Air strike callback includes `targetType`. Public signatures stay identical.

2. Collapse `getRepresentativeSelectedUnitIdsByOrigin` to one loop: choose `byId` from tactical `subUnits` or strategic `units`, then the shared filter (human only, unique `h3Index`, preserve selection order). Early return `[...S.selectedUnitIds]` when `!S.gameState` remains.

3. Do not change sidebar label imports, hover refresh exports, or clear-pending behavior in this phase.

**Verification:**

- Full bar + `npm run check:circular`.
- Human smoke: tactical + strategic multi-select ranged / air / ferry targeting still replaces prior pending rows for selected units only; one representative per origin still used for validation where applicable.

**Stop gate:** Automated green + human smoke OK.

---

### Phase 8 — Transient pointer tooltip factory

**Intent:** Share DOM/TTL/reposition plumbing for `#order-block-tooltip` and `#order-slower-tooltip`.

**Opportunities covered:** #8.

**Files:**

- **Add or edit** `src/renderer/map/transientPointerTooltipTtl.ts` **or** add `src/renderer/map/createTransientPointerTooltip.ts` (prefer extending the existing TTL module only if the file stays readable; otherwise new file)
- **Edit** `src/renderer/map/orderBlockHexTooltip.ts`
- **Edit** `src/renderer/map/orderSlowerHexTooltip.ts`
- **Edit** `src/main/rendererConsolidation.test.ts` (assert both modules use the factory; public exports `hide*` / `show*` / `is*Visible` / `reposition*` still exist)

**Steps:**

1. Factory options must cover:

   - `elementId: string`
   - `ttlMs: number` (both use `ORDER_BLOCK_HEX_TOOLTIP_TTL_MS` today)
   - Content mode: plain message → HTML via caller-supplied formatter **or** raw HTML string (block uses `blockingHoverMessageHtmlFromPlainMessage`; slower sets `innerHTML` from caller HTML)

2. Preserve behavior:

   - Clear TTL on hide / before show
   - Suppress terrain tooltip on show (`clearTerrainTooltipTimer` + `hideTerrainTooltipVisual`)
   - Position from `S.lastPointerClientX/Y + TOOLTIP_OFFSET_PX`
   - `hidden` class + `aria-hidden`
   - Reposition no-ops when hidden; reschedules TTL when visible

3. Keep `resolveOrderBlockHexTooltipMessage`, `terrainKindForHoveredHex`, and march invalid-reason helpers in the block module.

4. Public export names in both modules must remain stable (call sites in `renderer.ts` / `mainMapInteractions.ts` / hover refresh must not need renames). If needed, thin wrappers around the factory instance.

**Verification:**

- Full bar + `npm run check:circular`.
- Human smoke: invalid march/ranged hover shows Blocked tooltip; valid slower terrain shows Slower tooltip; neither stacks incorrectly with hex terrain tooltip; pointer move repositions; TTL still dismisses.

**Stop gate:** Automated green + human smoke OK.

---

### Phase 9 — Resolution combat overlays extraction

**Intent:** Single implementation for lightning + casualty overlay selection/draw so tactical and strategic cannot drift; leave shot-line z-order untouched.

**Opportunities covered:** #9.

**Files:**

- **Add** `src/renderer/rendering/resolutionCombatOverlays.ts`
- **Edit** `src/renderer/renderer.ts` (replace both duplicated blocks with one call each)
- **Edit** `src/main/rendererConsolidation.test.ts` (import present; draw-order assertion in both branches)

**Steps:**

1. Extract a function such as `drawResolutionCombatAndCasualtyOverlays(ctx, width, height, anim, hexList, elapsed)` that contains **only** the logic currently shared by:

   - Tactical block after moving units (~2407–2449): `buildResolutionPlaybackState` → meleeCombatHexes union → combatHexes by phase → lightning / unknown markers → casualtyHexes by phase → casualty overlays.
   - Strategic block (~2539–2581): same, using the passed-in `elapsed` (strategic today sets `const elapsed = elapsedStrategic`).

2. **Do not** move `drawRangedResolutionShotLines` into this module. Shot lines must remain **before** `drawUnits` / `drawMovingUnits` in both branches (current z-order: connectors → units → lightning → casualties).

3. `renderer.ts` call sites become thin: after moving-units drawing, call the extracted function with the appropriate `elapsed`.

4. Source-text assertions in `rendererConsolidation.test.ts`:

   - `renderer.ts` imports from `./rendering/resolutionCombatOverlays` (or chosen path).
   - In **both** tactical and strategic sections of `drawGameScene` source order: `drawRangedResolutionShotLines` appears before `drawUnits`, and `drawResolutionCombatAndCasualtyOverlays` (or chosen name) appears after `drawMovingUnits` / unit draw cluster and is the site that implies lightning/casualty (function body in the new module must still call `drawCombatLightning` before `drawCasualtyOverlay`).

5. Record before/after line count for `renderer.ts` in the phase report.

**Verification:**

- Full bar + `npm run check:circular`.
- Human smoke: Ready resolution on strategic and tactical — ranged shot lines under units; lightning above lines/units; death overlays above lightning; air-strike and melee phases still show their combat/casualty hexes.

**Stop gate:** Automated green + human smoke OK. Plan complete after this phase’s report.

---

## Reliability checklist (run every phase)

1. Diff limited to the phase’s file list (plus this document’s completion log if you append notes — optional; prefer chat report).
2. Orienting comments on new/changed fields and non-overriding methods.
3. Main-process logging rules satisfied for new public helpers; no new renderer logging.
4. No plan/phase/opportunity identifiers in source or comments.
5. `npm test` and `npm run build:renderer` green; `npm run check:circular` when renderer files change.
6. Grep gates listed in the phase recorded in the handoff report.
7. On failure: revert the phase; do not start the next phase.

---

## Success definition

1. All nine opportunities implemented as specified.
2. Full verification bar green after Phase 9.
3. Preload/shared channel maps guarded by an automated parity test.
4. Tactical and strategic resolution combat overlays share one implementation; draw order regression-tested via source assertions.
5. No intentional behavior changes; fallback quirk `'origin'` vs `'cellCenter'` preserved and only documented here.
6. Human has smoke-checked Phases 5–9.

---

## Locked / resolved decisions

1. **Scope mix:** Dedup/reuse first; only one tightly scoped `renderer.ts` vertical slice (combat/casualty overlays). No mega-file campaign in this plan.
2. **Preload channels:** Drift-guard test only — **not** esbuild bundling of preload.
3. **Verification bar:** Full `npm test` + `npm run build:renderer` every phase; plus `check:circular` for renderer-touching phases.
4. **Tactical lat/lng miss:** Preserve `[0, 0]` via `'origin'` fallback; do not unify to `cellToLatLng` in this plan.
5. **Cadence:** One phase per change set; stop and wait for go-ahead.
6. **Renderer smoke:** Human manual smoke after Phases 5–9 before proceeding.
7. **Out of scope:** `renderSealiftSection` fork, `requestOrdersFlow` split, full `registerIpcHandlers` split, `gameDb` / `gameActionsCore` decomposition beyond the empty-sealift factory, `@types/leaflet`.

---

## Final verification (after Phase 9)

1. `npm test`
2. `npm run build:renderer`
3. `npm run check:circular`
4. Manual smoke (strategic + tactical): build popups, pending ranged/air lines, Blocked/Slower tooltips, Ready resolution z-order (connectors → units → lightning → casualties).

---

## Phase 0 inventory (baseline, 2026-08-08)

Line counts (`Measure-Object -Line`):

| File | Lines |
|------|------:|
| `src/renderer/renderer.ts` | 3064 |
| `src/main/game-actions/gameActionsCore.ts` | 1678 |
| `src/main/main.ts` | 647 |
| `src/main/tools/tool1Pathfinding.ts` | 916 |
| `src/main/tools/tool2Assessment.ts` | 527 |
| `src/main/tools/tool3CombatEstimation.ts` | 403 |
| `src/main/tools/tacticalTool1Pathfinding.ts` | 470 |
| `src/renderer/rendering/orderDrawing.ts` | 285 |
| `src/renderer/gameplay/tacticalOrders.ts` | 308 |
| `src/renderer/map/orderBlockHexTooltip.ts` | 166 |
| `src/renderer/map/orderSlowerHexTooltip.ts` | 95 |
| `src/renderer/gameplay/buildQueuePopup.ts` | 614 |
| `src/renderer/gameplay/buildQueueMultiPopup.ts` | 308 |
| `src/renderer/gameplay/buildQueuePopupFormatting.ts` | 40 |
| `src/main/preload.ts` | 570 |
| `src/shared/ipc/channels.ts` | 68 |

Grep inventory (before):

| Pattern | Count |
|---------|------:|
| `function h3ToLatLng` under `src/main/tools` (incl. comments) | 7 |
| `contextMode: 'unsupported'` under `src/main` | 2+ (literals in main/gameActions/tactical) |
| `sanitizeBuildCountInputText` under `src/renderer/gameplay` | 4 |
| `function sanitizeCount` under `src/renderer/gameplay` | 1 |
| `ctx.globalAlpha = RANGE_PERIMETER_ALPHA` in `orderDrawing.ts` | 3 |

---

## Phase completion log

### 2026-08-09 — Phases 0–9 executed (continuous batch)

- **Phase 0:** Inventory recorded above; started from green intent (full suite run after implementation).
- **Phase 1:** Added `src/main/tools/h3LatLng.ts` + test; wired tool1/2/3 (`'cellCenter'`) and tactical Tool1 (`'origin'`); re-export `LatLng` from tool modules. Grep: no local `function h3ToLatLng` outside `h3LatLng.ts`.
- **Phase 2:** Added `src/shared/sealiftStackState.ts` + test; replaced empty literals in `main.ts`, `gameActionsCore.ts`, `tacticalSealiftStackState.ts`. Grep: no `contextMode: 'unsupported'` literals under `src/main`.
- **Phase 3:** Added `src/main/ipc/loggedIpcHandler.ts` + test; three res4 overlay handlers in `main.ts` use it with verbatim log labels.
- **Phase 4:** Added `src/main/preloadIpcChannelParity.test.ts` (imports shared maps; parses preload text).
- **Phase 5:** Moved `sanitizeBuildCountInputText` into `buildQueuePopupFormatting.ts`; multi-popup imports it; popup re-exports.
- **Phase 6:** Added `strokeSupportOrderLines` in `orderDrawing.ts`; ranged/air/resolution drawers use it.
- **Phase 7:** Consolidated `replacePendingOrdersForSelected` + single representative-selection loop in `tacticalOrders.ts`.
- **Phase 8:** Added `createTransientPointerTooltip.ts`; block/slower tooltips use it; public exports preserved.
- **Phase 9:** Added `resolutionCombatOverlays.ts`; both `drawGameScene` branches call it; `renderer.ts` ~3064 → **2986** lines. Source-text draw-order assertions in `rendererConsolidation.test.ts`.

**Verification:** `npm test` passed; `npm run build:renderer` passed. `npm run check:circular` still reports pre-existing baseline-drift cycles (gameDb ↔ tools/tactical paths) that were present without this change set; the one new false-positive self-cycle from a comment-parsed import was fixed. Human smoke for Phases 5–9 still recommended (build popups, pending lines, Blocked/Slower tooltips, Ready z-order).
