# Map Label Detail, City-Named States, and Night Roads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Map annotations follow the view actually on screen in every game state, a state name steps aside for a same-named city in view, and Night roads and rails read correctly.

**Architecture:** Three changes, executed in order because they share files. (1) One function decides whether names and borders use the detail view, so the new-game preview stops inheriting a battle underneath it. (2) The city pass records cities that would be drawn with T released, and the label pass drops states with those names. (3) Road and rail colors move from hard-coded values into `MapTheme`.

**Tech Stack:** TypeScript, Leaflet (SVG polylines), HTML canvas, `node:test`, Playwright smoke run on Electron.

**Spec:** The Requirements section below. The owner confirmed each decision in it.

## Requirements

**R1. Annotations follow the view, in every game state.**
- Root cause: `shouldRenderTacticalHexes()` in `src/renderer/map/terrainView.ts` returns true whenever `S.tacticalBattleSnapshot` exists. A battle keeps running under the new-game screen, so `drawMapLabels` and `syncAdminBorderLayers` stay in battle mode at world zoom.
- While the new-game or game-over overlay is open, names and borders use the preview's own "one strategic hex fills the view" test (the existing `previewAtBattleDetailZoom` latch). This holds with no match, a strategic match, or a battle underneath.
- While it is closed, behavior is unchanged: `shouldRenderTacticalHexes()` decides.
- Roads, rails, and city points stay hidden on the preview, as they are today. Their data exists only for the loaded match. Do not change that gate.

**R2. A displayed city hides a same-named state or province name.**
- It applies only to `kind === 'state'`. Country and continent names are never hidden.
- Names match ignoring accents and letter case. `Quebec` matches `Québec`. `Aichi Prefecture` does not match `Aichi`.
- A city counts in a frame when its cell center is inside the view and the cell would be drawn with T released. On the strategic map that means the parent hex is explored. A battle has no fog gate, so every city in the battle view counts. The existing fog skip stays as it is: holding T still visits unexplored cells, and those cells do not count.
- Holding T replaces a counted city's name with a hex code and does not bring the state name back, so the label does not flicker. Holding T over fog does not hide a new state name. An airport or seaport cell shows a glyph instead of a dot, and it still counts when the cell would have counted with T released.
- The match is across the whole view, as requested. The city does not have to be inside that state.

**R3. Night road and rail colors.** Every other theme stays exactly as it is.

| Line | Part | Night value | Opacity (unchanged constant) |
| --- | --- | --- | --- |
| Road | center | `#8b95a3` | 1 |
| Road | outline | `#0a0e14` | `TACTICAL_MAP_OVERLAY_VECTOR_TRANSPORT_HALO_OPACITY` (0.75) |
| Rail | dashes | `#dfe6ee` | `TACTICAL_MAP_OVERLAY_VECTOR_RAIL_CENTER_OPACITY` (0.75) |
| Rail | halo | `#0a0e14` | `TACTICAL_MAP_OVERLAY_VECTOR_RAIL_HALO_OPACITY` (0.5) |

## Global Constraints

- **Never run `git commit` or `git push`.** The owner reviews all changes first (`.cursor/rules/11-no-commit-or-push.mdc`). This plan has no commit steps.
- Never put a phase number, task number, or this file's name into code, comments, tests, or `doc/` (rule 12).
- Every new or changed field and function gets an orienting comment in the file's existing form: `Purpose:`, `When to use:`, `Expected outcome:`, `Exceptions:` (rule 04).
- Test contracts only: happy paths and essential failures (rule 03).
- Files stay under 600 lines where possible and under 1000 always (rule 09). Functions take at most 6 arguments (rule 10). Names follow `doc/naming-conventions-contract-v1.md`: no `Utils` or `Impl`.
- Do not change `visibleLabelKinds`, `adminBorderGroupsForView`, `labelKindOpacity`, or `shouldRenderTacticalHexes`.
- `static/renderer.js` is tracked build output. `npm run build` rewrites it. Never edit it by hand.
- Do not bump the version or add release notes.
- Shell is PowerShell 5.1: chain with `;` and `if ($?) { ... }`, never `&&`. Run everything from the repository root.
- Execute Phase A, then Phase B, then Phase C. They share `mapLabelLayer.ts`, `doc/ux/map-surface.md`, and `doc/README.md`. Do not run the phases at the same time.
- `npm run ui:smoke` rebuilds the native module for Electron, and `npm test` rebuilds it for Node. Both scripts do this themselves. Do not skip it.
- If a step's actual result differs from its stated result, stop and report it. Do not change the plan's values or weaken a test to get past it.

## Review Focus

1. **Closing New Game returns to a running battle.** State names must come back and continent names must leave, and the battle header must still be up so the later beat can run. Pinned by the smoke checks in Task 2.
2. **A city whose hex touches the view edge while its center is off screen.** The state name stays. Pinned by `cityCenterIsInView` tests in Task 3.
3. **A tied city label such as `A / B`.** Each name counts, and a city really named `Londonderry/Derry` is not split. Pinned in Task 3.
4. **A stale city set when the overlay opens or a frame draws no cities.** No state stays hidden. Pinned by clearing at the top of `paintMapFrame` and a source contract test in Task 4.
5. **Holding T over fog.** An unexplored city does not hide a state name. An explored city stays counted while its label is a hex code. Pinned by the explored guard in Task 4. The battle loop has no such guard.
6. **Changing theme with no pan.** Roads must recolor at once, because the layer otherwise rebuilds only when the view moves. Pinned by the smoke check in Task 6.

## File Map

| File | Change | Responsibility |
| --- | --- | --- |
| `src/shared/mapLabelRules.ts` | Modify | Pure rule `annotationViewIsDetail` |
| `src/shared/mapLabelRules.test.ts` | Create | Contract tests for that rule and its wiring |
| `src/renderer/map/mapAnnotationView.ts` | Create | Preview detail latch and the single view reader |
| `src/renderer/map/newGameMapPreviewRendering.ts` | Modify | Use the moved latch |
| `src/renderer/map/mapLabelLayer.ts` | Modify | Use the reader; filter city-named states; publish drawn kinds |
| `src/renderer/map/initCore.ts` | Modify | Give borders the reader |
| `src/renderer/map/adminBorderLayers.ts` | Modify | Comment only |
| `src/shared/mapLabelCityNames.ts` | Create | Pure name matching and the in-view test |
| `src/shared/mapLabelCityNames.test.ts` | Create | Contract tests |
| `src/renderer/map/visibleCityNames.ts` | Create | City names that count for this frame |
| `src/renderer/rendering/tacticalCityOverlays.ts` | Modify | Record cities that would show with T released |
| `src/renderer/chrome/controlTooltipText.ts` | Modify | Name roads and rails in the theme tip |
| `src/renderer/rendering/gameScene.ts` | Modify | Clear the set each frame |
| `src/shared/mapThemes.ts` and `.test.ts` | Modify | Transport colors per theme |
| `src/shared/tacticalMapOverlayConstants.ts` | Modify | Comments only |
| `src/renderer/map/tacticalTransportVectorLayer.ts` | Modify | Draw with theme colors |
| `src/renderer/map/mapThemeApply.ts` | Modify | Push the theme to that layer |
| `scripts/ui-smoke/ui-smoke-map-label-checks.cjs` | Create | Overlay-over-battle check |
| `scripts/ui-smoke/ui-smoke.cjs` | Modify | Run that check |
| `scripts/ui-smoke/ui-smoke-map-theme-scenes.cjs` | Modify | Road color checks |

---

## Phase A: Annotations Follow the View (R1)

### Task 1: The pure view rule

**Files:**
- Modify: `src/shared/mapLabelRules.ts` (add after `visibleLabelKinds`, before `COUNTRY_LABEL_OPACITY`)
- Create: `src/shared/mapLabelRules.test.ts`

**Interfaces:**
- Produces:
  - `export interface MapAnnotationViewInput { readonly overlayOpen: boolean; readonly previewAtDetailZoom: boolean; readonly readMatchDetailView: () => boolean; }`
  - `export function annotationViewIsDetail(input: MapAnnotationViewInput): boolean`

- [ ] **Step 1: Write the failing test** in `src/shared/mapLabelRules.test.ts`, with a file header in the style of `src/shared/mapThemes.test.ts`.

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { annotationViewIsDetail } from './mapLabelRules';

test('an open overlay uses the preview zoom and never reads the match', () => {
  const readMatchDetailView = (): boolean => {
    throw new Error('the match flag must not be read while the overlay is open');
  };
  assert.equal(annotationViewIsDetail({ overlayOpen: true, previewAtDetailZoom: false, readMatchDetailView }), false);
  assert.equal(annotationViewIsDetail({ overlayOpen: true, previewAtDetailZoom: true, readMatchDetailView }), true);
});

test('a closed overlay follows the match', () => {
  assert.equal(annotationViewIsDetail({ overlayOpen: false, previewAtDetailZoom: true, readMatchDetailView: () => false }), false);
  assert.equal(annotationViewIsDetail({ overlayOpen: false, previewAtDetailZoom: false, readMatchDetailView: () => true }), true);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run build:main`
Expected: FAIL, TypeScript error that `annotationViewIsDetail` is not exported.

- [ ] **Step 3: Implement** the interface and function in `mapLabelRules.ts`. Body: `input.overlayOpen ? input.previewAtDetailZoom : input.readMatchDetailView()`. `readMatchDetailView` is a function because reading the match flag can change it. The comment must say so. Comment every interface field.

- [ ] **Step 4: Run it and confirm it passes**

Run: `npm run build:main; if ($?) { node --test dist/shared/mapLabelRules.test.js }`
Expected: PASS, 2 tests.

### Task 2: Wire names and borders to the rule

**Files:**
- Create: `src/renderer/map/mapAnnotationView.ts`, `scripts/ui-smoke/ui-smoke-map-label-checks.cjs`
- Modify: `src/renderer/map/newGameMapPreviewRendering.ts:57-65,88,112,240-245`, `src/renderer/map/mapLabelLayer.ts:24,170-187`, `src/renderer/map/initCore.ts:372`, `src/renderer/map/adminBorderLayers.ts:108-113`, `scripts/ui-smoke/ui-smoke.cjs` (after line 377), `src/shared/mapLabelRules.test.ts`
- Docs: `doc/ux/map-surface.md`, `doc/README.md`, `doc/ux-specification.md`

**Interfaces:**
- Consumes: `annotationViewIsDetail` from Task 1; `isNewGameOverlayOpen` from `src/renderer/gameplay/newGameBanner.ts`; `shouldRenderTacticalHexes` from `src/renderer/map/terrainView.ts`.
- Produces, from `mapAnnotationView.ts`:
  - `export function isNewGameMapPreviewAtDetailZoom(): boolean`
  - `export function setNewGameMapPreviewAtDetailZoom(atDetailZoom: boolean): void`
  - `export function mapAnnotationsUseDetailView(): boolean`
- Produces: the `#map-label-overlay` attribute `data-drawn-label-kinds`, a comma-joined sorted list of the kinds drawn in the last frame, empty when none.

- [ ] **Step 1: Add the drawn-kinds attribute and the smoke check, before the fix.** In `drawMapLabels`:
  - The function returns before `clearRect` when the canvas, context, or metrics are missing. Leave the attribute alone on that path.
  - Immediately after `ctx.clearRect`, and before `if (!theme || !map || labelFeatures.length === 0) return`, set `canvas.dataset.drawnLabelKinds = ''`.
  - After the paint loop, set it to `[...new Set(placed.map((label) => label.kind))].sort().join(',')`.
  - Add a short comment saying the smoke run reads it because a canvas has no DOM to inspect.

  Create `ui-smoke-map-label-checks.cjs`, exporting `async function checkNewGameOverBattleLabels(page, report)`. Follow the header style of `ui-smoke-map-theme-scenes.cjs`. Read kinds with one helper that returns `null` when `#map-label-overlay` or `dataset.drawnLabelKinds` is missing, and otherwise `value.split(',').filter(Boolean)`. A missing attribute is a failure, with detail `attribute missing`. Do not let a missing element throw. Record with `report.results.push({ scene: 'map-labels', check, status: ok ? 'PASS' : 'FAIL', detail: ok ? '' : detail })`.
  1. `await openNewGameOverlay(page)`, then wait `SETTLE_MS.overlay`. This opens the menu and New game. It must not click Start. `openNewGameOverlayFromModelTab` advances the match epoch and resets the new-game form. `closeNewGameOverlayToMatch` restores the camera, the orders, and the selection.
  2. Read the kinds. Record check `new game over a battle uses world names`, ok when the list includes `continent` and does not include `state`. The framed preview is one zoom past the world fit, so a country name may also be present. Put the kinds in `detail`.
  3. `await page.click('#new-game-dialog-close')`, wait until `#game-over-overlay` has class `hidden`, wait `SETTLE_MS.resize`.
  4. Read the kinds again. Record check `closing new game restores battle names`, ok when the list includes `state` and does not include `continent`. Put the kinds in `detail`.
  5. Record check `closing new game leaves the battle`, ok when `#battle-header-status` is visible and its text is non-empty. The later beat clicks Ready on this same battle. If this check fails, stop.

  In `ui-smoke.cjs`, call it after `recordScene(page, report, outDir, SCENES.battleOrders)` and before the `// The battle header at the 800 x 600 minimum` comment. `SETTLE_MS` comes from `ui-smoke-scenes.cjs`, and `openNewGameOverlay` from `ui-smoke-new-game.cjs`.

- [ ] **Step 2: Run the smoke and confirm the bug is caught**

Run: `npm run ui:smoke -- --label labels-before`
Expected: the run reports `FAIL` for `new game over a battle uses world names`, `PASS` for `closing new game restores battle names` and `closing new game leaves the battle`, and the process exits with an error. The old code never draws `continent` in battle mode. If the world-names check passes, if either of the other two new checks fails, or if the script throws before recording the world-names check, stop and report. A thrown menu click is not the expected label failure.

- [ ] **Step 3: Write the failing wiring test.** Append to `src/shared/mapLabelRules.test.ts`, adding `fs` and `path` imports, in the style of `src/shared/adminBorderRules.test.ts:70-79`:

```ts
function rendererSource(...segments: string[]): string {
  return fs.readFileSync(path.resolve(process.cwd(), 'src', 'renderer', ...segments), 'utf8');
}

test('names and borders read the single annotation view', () => {
  const labels = rendererSource('map', 'mapLabelLayer.ts');
  assert.match(labels, /mapAnnotationsUseDetailView\(\)/);
  assert.doesNotMatch(labels, /shouldRenderTacticalHexes/);
  assert.match(rendererSource('map', 'initCore.ts'), /setAdminBorderTacticalReader\(mapAnnotationsUseDetailView\)/);
});
```

Run: `npm run build:main; if ($?) { node --test dist/shared/mapLabelRules.test.js }`
Expected: FAIL on `names and borders read the single annotation view`.

- [ ] **Step 4: Create `mapAnnotationView.ts`.**
  - Move the module variable `previewBattleDetail` and its comment here, renamed `previewAtDetailZoom`, default false.
  - The getter and setter read and write it.
  - `mapAnnotationsUseDetailView()` returns `annotationViewIsDetail({ overlayOpen: isNewGameOverlayOpen(), previewAtDetailZoom, readMatchDetailView: shouldRenderTacticalHexes })`.
  - This module must import only those three things.

- [ ] **Step 5: Switch `newGameMapPreviewRendering.ts` to the moved latch.** Remove the local variable. In `resetNewGameMapPreviewZoom` and `noteNewGameMapPreviewRequest`, call `setNewGameMapPreviewAtDetailZoom(false)`. In `previewAtBattleDetailZoom`, keep the same hysteresis using `isNewGameMapPreviewAtDetailZoom()` and the setter, and return the getter's value. Behavior of the weather and tech icons must not change.

- [ ] **Step 6: Wire the two readers.**
  - In `mapLabelLayer.ts`, remove the `shouldRenderTacticalHexes` import and set `const tacticalView = mapAnnotationsUseDetailView();` in `drawMapLabels`.
  - In `initCore.ts:372`, pass `mapAnnotationsUseDetailView` to `setAdminBorderTacticalReader`. Keep the `shouldRenderTacticalHexes` import if that file still uses it, and remove it if not.
  - In `adminBorderLayers.ts:108-113`, update the comment to name `mapAnnotationsUseDetailView`.
  - Do not import the reader in `adminBorderLayers.ts`. That is what the injected reader avoids: `worldLeafletMap.ts` imports the border module, and `terrainView.ts` imports `worldLeafletMap.ts`.

- [ ] **Step 7: Verify**

Run: `npm run build:main; if ($?) { node --test dist/shared/mapLabelRules.test.js }; npm run check:circular; npm run check:renderer-types`
Expected: tests PASS (3 tests), no new cycle. Typecheck shows no new errors in the files you touched.

Run: `npm run ui:smoke -- --label labels-after`
Expected: all checks PASS, including the three `map-labels` checks. Exit 0.

- [ ] **Step 8: Update docs in the same change.**
  - `doc/ux/map-surface.md`, Place names paragraph: after the sentence ending "and does not draw continent names (`visibleLabelKinds` and `labelKindOpacity` in `src/shared/mapLabelRules.ts`).", add that while the new-game or game-over overlay is open, the detail view follows the preview's own strategic hexes (`mapAnnotationsUseDetailView` in `src/renderer/map/mapAnnotationView.ts`), so a battle or match under the overlay does not change the names or borders.
  - Same file, the basemap bullet: change "State borders appear with state names when tactical hexes are showing" so it says they appear with state names in that same detail view.
  - Same file, Code Entry Points: add `src/renderer/map/mapAnnotationView.ts` (`mapAnnotationsUseDetailView`).
  - `doc/README.md`, the paragraph beginning "The match hillshade is": after the `visibleLabelKinds` zoom-gate sentence, add that which view they use is `annotationViewIsDetail` in `src/shared/mapLabelRules.ts`, read through `mapAnnotationsUseDetailView`.
  - `doc/ux-specification.md`, the check file list: add `- The new-game screen over a battle: \`ui-smoke-map-label-checks.cjs\`` after the new-game screen row, in that list's backtick format.
  - `doc/ux/new-game-dialog.md` does not mention place names. Leave it unchanged unless a sentence there describes names or borders following the match under the overlay.

---

## Phase B: A City Hides Its Same-Named State (R2)

The behavior does not depend on Phase A. Run this phase after Phase A. Both edit `mapLabelLayer.ts` and the same map documents.

### Task 3: Pure name matching

**Files:**
- Create: `src/shared/mapLabelCityNames.ts`, `src/shared/mapLabelCityNames.test.ts`

**Interfaces:**
- Produces:
  - `export function normalizedPlaceName(name: string): string`
  - `export function cityNamesInOverlayLabel(label: string): string[]`
  - `export function cityCenterIsInView(center: { readonly x: number; readonly y: number }, view: { readonly width: number; readonly height: number }): boolean`
  - `export function withoutStatesNamedForCities<T extends { readonly kind: MapLabelKind; readonly name: string }>(features: readonly T[], cityNameKeys: ReadonlySet<string>): T[]`

- [ ] **Step 1: Write the failing test**

```ts
test('names match across accents and case only', () => {
  assert.equal(normalizedPlaceName('Québec'), normalizedPlaceName('Quebec'));
  assert.equal(normalizedPlaceName('Bogotá'), normalizedPlaceName('Bogota'));
  assert.equal(normalizedPlaceName("M'Sila"), normalizedPlaceName("M'sila"));
  assert.notEqual(normalizedPlaceName('Aichi Prefecture'), normalizedPlaceName('Aichi'));
});

test('a tied label counts each city and a slash inside a name does not split', () => {
  assert.deepEqual(cityNamesInOverlayLabel('Alpha / Beta'), ['Alpha', 'Beta']);
  assert.deepEqual(cityNamesInOverlayLabel('Londonderry/Derry'), ['Londonderry/Derry']);
});

test('a center outside the view does not count', () => {
  const view = { width: 100, height: 50 };
  assert.equal(cityCenterIsInView({ x: 0, y: 50 }, view), true);
  assert.equal(cityCenterIsInView({ x: -1, y: 25 }, view), false);
  assert.equal(cityCenterIsInView({ x: 50, y: 51 }, view), false);
});

test('only a state name is removed', () => {
  const features = [
    { kind: 'state', name: 'Oaxaca' },
    { kind: 'state', name: 'Jalisco' },
    { kind: 'country', name: 'Oaxaca' },
    { kind: 'continent', name: 'Oaxaca' },
  ] as const;
  const kept = withoutStatesNamedForCities(features, new Set([normalizedPlaceName('OAXACA')]));
  assert.deepEqual(kept, [features[1], features[2], features[3]]);
});

test('an empty city set keeps every feature', () => {
  const features = [{ kind: 'state', name: 'Oaxaca' }] as const;
  assert.deepEqual(withoutStatesNamedForCities(features, new Set()), [features[0]]);
});
```

Add a file header and the imports `node:assert/strict`, `{ test } from 'node:test'`, and the four functions.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run build:main`
Expected: FAIL, cannot find module `./mapLabelCityNames`.

- [ ] **Step 3: Implement.**
  - `normalizedPlaceName`: `name.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en').trim()`.
  - `cityNamesInOverlayLabel`: split on the exact string `' / '`, the joiner in `reduceTacticalCityOverlayLabelsByH3`. Trim each part and drop empty ones.
  - `cityCenterIsInView`: inclusive on all four edges.
  - `withoutStatesNamedForCities`: when the set is empty, return a copy without normalizing. Otherwise keep a feature unless its kind is `state` and its normalized name is in the set.
  - Import `MapLabelKind` as a type from `./mapLabelRules`.

- [ ] **Step 4: Run it and confirm it passes**

Run: `npm run build:main; if ($?) { node --test dist/shared/mapLabelCityNames.test.js }`
Expected: PASS, 5 tests.

### Task 4: Record drawn cities and filter state names

**Files:**
- Create: `src/renderer/map/visibleCityNames.ts`
- Modify: `src/renderer/rendering/tacticalCityOverlays.ts:219-220,258-259`, `src/renderer/rendering/gameScene.ts:761-763`, `src/renderer/map/mapLabelLayer.ts:234-236`, `src/shared/mapLabelCityNames.test.ts`
- Docs: `doc/ux/map-surface.md`, `doc/README.md`, `doc/ux/map-overlays.md` if it describes city names

**Interfaces:**
- Consumes: all four functions from Task 3.
- Produces, from `visibleCityNames.ts`:
  - `export function clearVisibleCityNames(): void`
  - `export function noteVisibleCityLabel(label: string): void` (adds the normalized form of each name from `cityNamesInOverlayLabel`)
  - `export function getVisibleCityNameKeys(): ReadonlySet<string>`
- This module imports only `src/shared/mapLabelCityNames.ts`.

- [ ] **Step 1: Write the failing wiring test.** Append to `mapLabelCityNames.test.ts`, using the same `rendererSource` helper shape as Task 2:

```ts
test('each frame starts with no cities and the label pass reads the set', () => {
  const scene = rendererSource('rendering', 'gameScene.ts');
  const paintBody = scene.slice(scene.indexOf('function paintMapFrame'));
  assert.ok(paintBody.indexOf('clearVisibleCityNames()') >= 0);
  assert.ok(paintBody.indexOf('clearVisibleCityNames()') < paintBody.indexOf('if (overlayOpen)'));
  assert.match(rendererSource('map', 'mapLabelLayer.ts'), /withoutStatesNamedForCities\(/);
  const cityPass = rendererSource('rendering', 'tacticalCityOverlays.ts');
  const battleLoop = cityPass.slice(cityPass.indexOf('if (tactical)'), cityPass.indexOf('for (const parent of'));
  assert.match(battleLoop, /noteCityWhenCenterIsInView\(/);
  assert.doesNotMatch(battleLoop, /exploredHexes/);
  assert.match(cityPass, /if \(exploredHexes\.has\(parent\.h3Index\)\) noteCityWhenCenterIsInView\(/);
});
```

The battle loop counts every city in view. The strategic loop counts a city only when its parent is explored, which is also the gate used when T is not held.

Run: `npm run build:main; if ($?) { node --test dist/shared/mapLabelCityNames.test.js }`
Expected: FAIL on that test.

- [ ] **Step 2: Create `visibleCityNames.ts`.** A module-level `Set<string>`, with a comment stating that the city pass fills it and the label pass reads it later in the same frame.

- [ ] **Step 3: Record cities in `tacticalCityOverlays.ts`.** Add a file-local `noteCityWhenCenterIsInView(cityLabel: string | undefined, centerPx: { x: number; y: number }, viewportWidth: number, viewportHeight: number): void`. It returns early when `cityLabel` is falsy or `cityCenterIsInView` is false, and otherwise calls `noteVisibleCityLabel`. Do not change drawing, including the existing `if (!inspection && !exploredHexes.has(parent.h3Index)) continue` skip.
  - In the battle loop, immediately after `const cityLabel = S.tacticalCityOverlayLabelByH3.get(child);`, call `noteCityWhenCenterIsInView(cityLabel, centerPx, viewportWidth, viewportHeight)`. A battle has no fog gate.
  - In the strategic loop, at the same point, call it only for an explored parent, before the airport branch and before `if (inspection)`:

```ts
if (exploredHexes.has(parent.h3Index)) noteCityWhenCenterIsInView(cityLabel, centerPx, viewportWidth, viewportHeight);
```

  Holding T still reaches unexplored parents. Those calls must not happen. An explored city is still recorded when T replaces its name with a hex code, and when an airport or seaport draws a glyph instead of a dot.

- [ ] **Step 4: Clear each frame.** In `paintMapFrame` in `gameScene.ts`, call `clearVisibleCityNames()` as the first statement. This runs before every branch, including the overlay branch that draws no cities. `drawMapLabels` always runs after `paintMapFrame` in both `redraw` and `resizeAndRedraw`, so the set is current when read.

- [ ] **Step 5: Filter in `labelsForFrame`.** Wrap the existing `labelFeatures.filter(...)` result:

```ts
const candidates = withoutStatesNamedForCities(
  labelFeatures.filter((feature) => (
    featureIsCandidate(feature, kinds, zoom) && longitudeMeets(feature, west, east) && latitudeMeets(feature, south, north)
  )),
  getVisibleCityNameKeys(),
);
```

Update the `labelsForFrame` comment to mention it.

- [ ] **Step 6: Verify**

Run: `npm run build:main; if ($?) { node --test dist/shared/mapLabelCityNames.test.js }; npm run check:circular; npm run check:renderer-types`
Expected: tests PASS (6 tests), no new cycle, no new type errors in touched files.

- [ ] **Step 7: Update docs in the same change.**
  - `doc/ux/map-surface.md`, Place names paragraph: add that a state name is not drawn while a city of the same name, ignoring accents and letter case, would be displayed with T released and with its cell center in the view. Say that holding T does not bring that name back, that holding T over fog does not hide a new one, and that country and continent names are not affected (`withoutStatesNamedForCities` in `src/shared/mapLabelCityNames.ts`).
  - Same file, Code Entry Points: add `src/shared/mapLabelCityNames.ts` and `src/renderer/map/visibleCityNames.ts`.
  - `doc/README.md`, the same paragraph as Task 2: add `withoutStatesNamedForCities`.
  - `doc/ux/map-overlays.md`: search for "city" and add a cross-reference only if it describes city names beside state names.

---

## Phase C: Night Roads and Rails (R3)

The behavior does not depend on the earlier phases. Run this phase after Phase B. Its document edits touch `doc/ux/map-surface.md`.

### Task 5: Transport colors in the theme

**Files:**
- Modify: `src/shared/mapThemes.ts`, `src/shared/mapThemes.test.ts`

**Interfaces:**
- Produces:
  - `export interface MapThemeTransportLineColors { readonly roadCenter: string; readonly roadOutline: string; readonly railCenter: string; readonly railHalo: string; }`
  - `MapTheme.transportLineColors: MapThemeTransportLineColors`

- [ ] **Step 1: Write the failing test** inside the existing `describe('map themes', ...)` in `mapThemes.test.ts`:

```ts
it('dims night roads, lightens night rails, and leaves the other themes alone', () => {
  assert.deepEqual(mapThemeById('night').transportLineColors, {
    roadCenter: '#8b95a3',
    roadOutline: '#0a0e14',
    railCenter: '#dfe6ee',
    railHalo: '#0a0e14',
  });
  for (const id of ['standard', 'topographic', 'nautical']) {
    assert.deepEqual(mapThemeById(id).transportLineColors, {
      roadCenter: '#ffffff',
      roadOutline: '#000000',
      railCenter: '#000000',
      railHalo: '#ffffff',
    });
  }
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run build:main`
Expected: FAIL, `transportLineColors` does not exist on `MapTheme`.

- [ ] **Step 3: Implement.** Add the interface with a commented field for each color, and the commented `MapTheme` field. Add a module constant `LIGHT_THEME_TRANSPORT_LINE_COLORS` before `MAP_THEMES`, with the Standard values above. Use it on Standard, Topographic, and Nautical. Give Night its own literal.

- [ ] **Step 4: Run it and confirm it passes**

Run: `npm run build:main; if ($?) { node --test dist/shared/mapThemes.test.js }`
Expected: PASS, all tests in the file.

### Task 6: Draw with the theme colors

**Files:**
- Modify: `src/renderer/map/tacticalTransportVectorLayer.ts`, `src/renderer/map/mapThemeApply.ts`, `src/shared/tacticalMapOverlayConstants.ts:9-32`, `src/shared/mapThemes.test.ts`, `scripts/ui-smoke/ui-smoke-map-theme-scenes.cjs`, `src/renderer/chrome/controlTooltipText.ts`
- Docs: `doc/ux/terrain-legend.md`, `doc/ux/map-surface.md`, `doc/ux/control-tooltips.md`

**Interfaces:**
- Consumes: `MapTheme.transportLineColors` from Task 5.
- Produces: `export function setTacticalTransportTheme(theme: MapTheme): void`

- [ ] **Step 1: Add the smoke checks.** In `ui-smoke-map-theme-scenes.cjs`. This file's `SETTLE_MS` is the local number `700`, not the object in `ui-smoke-scenes.cjs`. The theme scenes run after the match has started, and zoom 10 is past the tactical fill threshold, so roads are on screen at the Gibraltar picture. The main map does not set `preferCanvas` (`worldLeafletMap.ts`), so the lines are SVG paths. Grid lines use `rgba(...)` and do not match these hex selectors. On the light themes the rail halo is also `#ffffff`, so a white count above zero includes those halos. `#8b95a3` is only the night road center.
  - Add `roadCenter` to each `THEMES` entry: `'#8b95a3'` for night and `'#ffffff'` for the others.
  - Add `async function countRoadCenters(page, color)` returning `page.locator(`#main-map path[stroke="${color}"]`).count()`.
  - Immediately after the `theme-${theme.id}-z10.png` screenshot, record check `roads follow theme`, ok when the count for `theme.roadCenter` is above 0. If it is 0, stop. Do not move the camera to look for roads.
  - In that same place, only when `theme.id === 'night'`: select `standard` with `page.locator('#terrain-legend select').selectOption('standard')` and no camera move. The select replaces itself on every change, so query it again rather than reusing a handle. Wait `SETTLE_MS`. Record check `roads recolor without a pan`, ok when the `#ffffff` count is above 0 and the `#8b95a3` count is 0. Then select `night` the same way and wait `SETTLE_MS`, so the lake picture stays on Night.

- [ ] **Step 2: Write the failing source test** in `mapThemes.test.ts`, adding `fs` and `path` imports:

```ts
it('takes every road and rail color from the theme', () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'src', 'renderer', 'map', 'tacticalTransportVectorLayer.ts'),
    'utf8',
  );
  assert.doesNotMatch(source, /'#(?:ffffff|000000)'/);
  assert.match(source, /transportLineColors/);
});
```

Run: `npm run build:main; if ($?) { node --test dist/shared/mapThemes.test.js }`
Expected: FAIL on that test.

- [ ] **Step 3: Implement in `tacticalTransportVectorLayer.ts`.**
  - Add a commented module variable `let transportColors = mapThemeById(DEFAULT_MAP_THEME_ID).transportLineColors;`.
  - Add `setTacticalTransportTheme(theme)`, which stores `theme.transportLineColors` and sets `lastViewportKey = null`. The existing rebuild test `key !== lastViewportKey` then rebuilds the lines on the next sync. Explain that in its comment.
  - In `buildVectorLayerGroup`, use `transportColors.roadOutline`, `.roadCenter`, `.railHalo`, and `.railCenter` for the four `color` values. Do not change any weight, opacity, or dash.
  - Update that function's `Expected outcome` so it no longer says white and black.

- [ ] **Step 4: Apply the theme.** In `mapThemeApply.ts`, call `setTacticalTransportTheme(theme)` after `setMapLabelTheme(theme)`, and add roads and rails to both comments.

- [ ] **Step 5: Correct the constant comments** in `tacticalMapOverlayConstants.ts:9-32`. Lines naming a road or rail stroke as "black" or "white" should describe its role (outline, center, halo) and say the color comes from `MapTheme.transportLineColors`. Change comments only. Leave the city-label constants alone.

- [ ] **Step 6: Verify**

Run: `npm run build:main; if ($?) { node --test dist/shared/mapThemes.test.js }; npm run check:circular; npm run check:renderer-types`
Expected: tests PASS, no new cycle, no new type errors in touched files.

Run: `npm run ui:smoke -- --label night-roads`
Expected: all checks PASS, including `roads follow theme` four times and `roads recolor without a pan` once. Open `.test/ui-smoke/night-roads/theme-night-z10.png` and confirm roads are dim slate rather than white, and rails are pale dashes where any appear. Do not tune colors. Report any concern to the owner.

- [ ] **Step 7: Update docs in the same change.**
  - `doc/ux/terrain-legend.md`, Purpose: add that the theme also sets road and rail colors, and that Night uses a dim road and pale rail dashes (`transportLineColors` in `src/shared/mapThemes.ts`).
  - `doc/ux/map-surface.md`: in both sentences listing what a theme recolors on the main map ("the elevation-tile lines, the coastline, the borders, and the place names"), add the road and rail lines.
  - `doc/ux/control-tooltips.md` and `mapThemeTooltipText` in `src/renderer/chrome/controlTooltipText.ts` use the same sentence. Change it to `Pick the map colors for land, water, coastlines, borders, roads, rails, and place names. The choices are Standard, Topographic, Nautical, and Night.`
  - Search `doc/ui-style-guide.md` for "theme" and update the map-color statement only if it lists what a theme controls.

---

## Phase D: Whole-Change Verification

### Task 7: Full gates and owner acceptance

**Files:** none, unless a gate fails.

- [ ] **Step 1: Run the full automated gates**

Run: `npm run build; if ($?) { npm test }`
Expected: exit 0. Lint, naming check, renderer typecheck baseline, every test, and notices all pass. If a pre-existing test asserts text you changed legitimately, report it before editing that test.

Run: `npm run check:circular`
Expected: exit 0.

Run: `npm run ui:smoke -- --label final`
Expected: exit 0, every line PASS.

- [ ] **Step 2: Confirm size and naming limits**

Run: `(Get-Content src/renderer/rendering/gameScene.ts | Measure-Object -Line).Lines`
Expected: below 1000. Also confirm each new file is below 600.

Search the changed files for `Phase`, `Task 1` through `Task 7`, and this plan's file name.
Expected: no matches introduced by this work.

- [ ] **Step 3: Confirm docs.** Search `doc/` for any sentence that still says state names follow tactical hexes without the overlay rule, that roads are white, or that a theme recolors land, water, coastlines, borders, and place names without roads and rails. Leave `doc/release-notes/` and the historical documents listed in `AGENTS.md` alone. The theme tooltip source is `mapThemeTooltipText` in `src/renderer/chrome/controlTooltipText.ts`.

- [ ] **Step 4: Report for owner review.** Summarize changed files, name the documents updated, and list this acceptance script for the owner to run with `npm start`:
  1. In a battle, open New game. The map shows continent names at world zoom, then countries from zoom 4, with no state names. Close it, and the battle's state names return.
  2. On that preview, zoom until a strategic hex fills the view. State names and state borders appear. Zoom out, and they leave.
  3. With no match loaded, repeat step 2.
  4. Zoom a strategic match to a city sharing its state's name, such as Oaxaca or Tokyo. The state name is gone while the city is in view, and returns when the city is panned off. Country names stay.
  5. Hold T over that city. The state name stays hidden. Hold T over unexplored ground. That hold does not remove a state name.
  6. In a battle on Night, roads are dim and rails are pale dashes. Change the theme and the lines recolor immediately. The other three themes look as they did.

  Do not commit.
