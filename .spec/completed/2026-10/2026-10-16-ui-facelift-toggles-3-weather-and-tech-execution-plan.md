# UI Facelift Toggles, Plan 3 of 3: Weather and Tech Toggles

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Make Weather a real toggle, on when the app opens, that shows or hides the weather icons on the world map in either view, and make Tech a toggle for the Tech view, off when the app opens. A hex that shows one status icon keeps it centered on the band above the hex center, where the weather icon sits today. A hex that shows both, while the Tech view is on or T is held, shows the tech icon on the left and the weather icon on the right, side by side on that band.

**Requirements:** [ui-facelift-toggles-execution-plan.md](ui-facelift-toggles-execution-plan.md) lists the requested changes and the decisions made for them. This plan is part 3 of the three that build them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and that index disagree, follow this plan and report the disagreement.

**What this plan changes:**

- `src/shared/mapViewMode.ts` and `src/renderer/map/mapViewModeState.ts`: two stored choices, weather icons shown (true at start) and the Tech view chosen (false at start), in place of one Weather-or-Tech view. `isTerrainInspectionShown` takes `techViewChosen`.
- `inspectionStatusIconsForHex` returns a list: the tech icon while the inspection view is on, then the weather icon while Weather is on. Holding T no longer hides the weather icon. `statusIconCentersX` centers one icon, or places two 2 px apart as a pair centered on the hex.
- The world map's status-icon pass and the new-game preview both place their icons with it. The preview's weather icons follow the dialog, not the Weather tab, which is hidden with the minimap there; holding T over the preview now shows tech beside weather.
- `mapModeTabs.ts`: Weather and Tech each flip their own choice and read as pressed while it is on. Their tips say so.
- Unit tests follow; the test total goes from 896 to 897. The smoke run turns Tech on and off and Weather off and on; one new scene.
- `doc/` follows.

**Out of scope:**

- Control and Production, which stay disabled placeholders.
- Saving the choices between sessions. They last until the app closes, as the Tech view did.
- Shrinking the icons on small hexes. A pair can spill past a small hex at low zoom, as one icon can today.

**How this plan was checked:** every step below was applied to a copy of the repository in the state the previous plan leaves, and the result matched the verified files exactly. On that result, the fast loop, the full tests, and the smoke run against the real app in Electron passed. The numbers in Verify come from those runs, and the Exact-match check compares your files with that result.

## Ground Rules

- Follow `AGENTS.md` and every rule in `.cursor/rules/`. These matter most here:
  - **Never commit or push** (rule 11). The reviewer commits after reading your report.
  - **No plan or phase identifiers** (rule 12) in code, comments, tests, `doc/`, or configuration: no plan numbers, no phase names, and no "facelift" outside `.spec/`. Every block in this plan already follows this.
  - Do not add, reword, or "improve" anything this plan does not ask for. The blocks already meet the orienting-comment, file-size, naming, logging, and documentation rules. If you think something is wrong, finish the plan as written and say so in your report.
- **Shell:** Windows PowerShell, at the repository root `F:\Projects\Personal\agent-wars-public`. Run one command at a time; do not chain commands with `&&`.
- **Line endings:** your working tree uses Windows line endings (CRLF). The blocks in this plan show plain lines. Treat each line break in a block as the file's own line break, and keep each file's existing line endings. If your editing tool matches text byte for byte, convert a block to CRLF before matching, or edit line by line.
- **How to apply a step:**
  - "Create" and "Replace the whole file": write exactly the block's content.
  - "Find ... Replace ...": the Find text occurs exactly once in the file at that moment. Match it exactly, including leading spaces. A Find block can be part of a single line.
  - Every code block starts at the left margin of this document, so every space inside a block is part of the text.
  - If a Find text is missing, or occurs more than once, stop and report the step number, the file, and what you found. Do not adapt the edit.
- `static/renderer.js` is a committed build output. It changes whenever `npm run build:renderer` or `npm run ui:smoke` runs. Leave it changed; do not revert it.
- No step needs an API key, and the smoke run makes no model calls.

## Verification Commands

These are used in Before You Start and in Verify.

**Fast loop.** Run these one at a time:

```powershell
npm run build:main
npm run check:renderer-types
npm run lint
npm run naming:check
npm run build:renderer
npm run check:circular
```

Each command exits 0, with two expected outputs and one exception:

- `check:renderer-types` prints `check-renderer-typecheck: ok`. It also prints an `entries=` count, a `resolved baseline entries=` count, and the baseline lines it no longer finds. Those are notes from the check, not failures.
- `naming:check` prints `naming check: ok`.
- `check:circular` is the exception. It exits 1 and prints `check-circular-deps: found circular dependencies`, then exactly two cycle lines starting with ` - `, both through `src/main/tools/standingOrders.ts`. Those two cycles already exist. A third line means this plan added a cycle: stop and report.

**Full tests.** Run these one at a time. `clean:dist` removes compiled copies of deleted tests, so the count is exact.

```powershell
npm run clean:dist
npm test 2>&1 | Tee-Object -FilePath "$env:TEMP\agent-wars-npm-test.log"
$testLog = Get-Content "$env:TEMP\agent-wars-npm-test.log"
($testLog | Select-String -Pattern '^\S+ tests (\d+)$' | ForEach-Object { [int]$_.Matches[0].Groups[1].Value } | Measure-Object -Sum).Sum
($testLog | Select-String -Pattern '^\S+ fail (\d+)$' | ForEach-Object { [int]$_.Matches[0].Groups[1].Value } | Measure-Object -Sum).Sum
```

The `npm test` output ends with the notices check, and the last two commands print the test total and the failure total. Error-looking log lines such as `hex-code-translator h3ToCode: missing mapping` come from tests that check failure paths and are expected.

**Smoke run.**

```powershell
npm run ui:smoke -- --label <label>
```

- The run builds the app and takes about four minutes. It opens the app window three times: it closes the app twice to change its throwaway copy of the match, then reopens it. Do not use the mouse or keyboard in those windows while it runs.
- It prints one `PASS` or `FAIL` line per check, then a summary line: `ui-smoke <label>: P passed, F failed, E page errors, N screenshots in <folder>`.
- The window can show a "map tiles failed to load" toast when the network is slow. That toast is not a failure.
- After a smoke run the SQLite module is built for Electron. `npm test` rebuilds it for Node by itself, and `npm start` works as usual.

## Before You Start

- [ ] **Read**

1. `AGENTS.md` and each file in `.cursor/rules/`.
2. [ui-facelift-toggles-execution-plan.md](ui-facelift-toggles-execution-plan.md): Requested Changes and Decisions.
3. `doc/ux/map-surface.md` and `doc/ux/minimap.md`.
4. `src/shared/inspectionStatusIconLine.ts` and `src/renderer/rendering/inspectionStatusIcons.ts`.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected: `git status --short` prints nothing, or only `.spec/` files. Then check that plan 2 is in and this plan is not:

```powershell
[bool](Select-String -Path static/index.html -Pattern 'map-mode-tabs-toggle' -SimpleMatch -Quiet)
[bool](Select-String -Path src/shared/mapViewMode.ts -Pattern 'DEFAULT_WEATHER_ICONS_SHOWN' -SimpleMatch -Quiet)
```

Expected: `True`, `False`. Otherwise stop and report.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **896**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files, in this order:

- `src/shared/mapViewMode.ts`
- `src/shared/mapViewMode.test.ts`
- `src/shared/inspectionStatusIconLine.ts`
- `src/shared/inspectionStatusIconLine.test.ts`
- `src/shared/newGameMapPreviewTypes.ts`
- `src/shared/newGameMapPreviewCore.ts`
- `src/shared/newGameMapPreviewCore.test.ts`
- `src/renderer/map/mapViewModeState.ts`
- `src/renderer/gameplay/productionOverlayHelpers.ts`
- `src/renderer/map/mapModeTabs.ts`
- `src/renderer/rendering/inspectionStatusIcons.ts`
- `src/renderer/map/newGameMapPreviewRendering.ts`
- `src/renderer/chrome/frameTooltipText.ts`
- `static/index.html`
- `scripts/ui-smoke/ui-smoke-scenes.cjs`
- `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`
- `scripts/ui-smoke/ui-smoke.cjs`
- `doc/ux/map-surface.md`
- `doc/ux/minimap.md`
- `doc/ux/input-map.md`
- `doc/ux/new-game-dialog.md`
- `doc/ux/control-tooltips.md`
- `doc/ui-style-guide.md`
- `doc/region-vs-region.md`
- `doc/how-to-play.md`

- [ ] **Step 1: Replace `src/shared/mapViewMode.ts`**

The one Weather-or-Tech view becomes two starting values, weather icons shown and the Tech view off, and `isTerrainInspectionShown` takes `techViewChosen`. The file is short, so the whole file is given.

Replace the whole file `src/shared/mapViewMode.ts` with exactly this content:

```ts
/**
 * The map's two view choices in the minimap panel's map-mode tabs, each a toggle on its own: Weather shows or hides
 * the weather icons on the world map, and Tech turns on the view that holding T shows: no terrain fill, with hex codes
 * and tech icons.
 *
 * Purpose: The mode tabs, the drawing code, and the tests name the choices and their starting values the same way.
 * When to use: Where the renderer stores or reads the choices, and where it decides whether the inspection view is on.
 * Expected outcome: Plain constants and one pure function.
 * Exceptions: None.
 */

/**
 * Whether weather icons show when the app opens.
 *
 * Purpose: The map shows each hex's weather until the player turns Weather off; the choice lasts until the app closes.
 * When to use: The initial value of the renderer's stored Weather choice.
 * Expected outcome: `true`.
 * Exceptions: None.
 */
export const DEFAULT_WEATHER_ICONS_SHOWN = true;

/**
 * Whether the Tech view is on when the app opens.
 *
 * Purpose: The app opens on the normal map; the player's choice lasts until the app closes.
 * When to use: The initial value of the renderer's stored Tech choice.
 * Expected outcome: `false`.
 * Exceptions: None.
 */
export const DEFAULT_TECH_VIEW_CHOSEN = false;

/**
 * Decides whether the map shows its inspection view: no terrain fill, and on the world map the hex codes and tech icons.
 *
 * Purpose: Holding T shows that view everywhere, as before. Turning Tech on keeps it on, but only on the world map: a
 *   battle and the new-game preview keep their normal view, and Tech applies again when they close. Weather does not
 *   take part: its icons follow their own toggle in either view.
 * When to use: Wherever the renderer used to ask whether T is held. `tKeyHeld` is true while the player holds T,
 *   `techViewChosen` while Tech is on, `inBattle` while a tactical battle is open, and `newGameOverlayOpen` while the
 *   new-game or game-over overlay is open.
 * Expected outcome: True while T is held, or while Tech is on outside a battle and outside the new-game or game-over
 *   overlay.
 * Exceptions: None.
 */
export function isTerrainInspectionShown(input: {
  readonly tKeyHeld: boolean;
  readonly techViewChosen: boolean;
  readonly inBattle: boolean;
  readonly newGameOverlayOpen: boolean;
}): boolean {
  if (input.tKeyHeld) return true;
  return input.techViewChosen && !input.inBattle && !input.newGameOverlayOpen;
}
```

- [ ] **Step 2: Replace `src/shared/mapViewMode.test.ts`**

The same five tests, for the two choices. The whole file is given.

Replace the whole file `src/shared/mapViewMode.test.ts` with exactly this content:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_TECH_VIEW_CHOSEN, DEFAULT_WEATHER_ICONS_SHOWN, isTerrainInspectionShown } from './mapViewMode';

/**
 * The world map with Tech off and no key held.
 *
 * Purpose: Each test changes only the inputs it is about.
 * When to use: Spread into each test's input.
 * Expected outcome: An input for which the inspection view is off.
 * Exceptions: None.
 */
const WORLD_MAP: Parameters<typeof isTerrainInspectionShown>[0] = {
  tKeyHeld: false,
  techViewChosen: false,
  inBattle: false,
  newGameOverlayOpen: false,
};

test('a session starts with weather icons shown and the Tech view off', () => {
  assert.equal(DEFAULT_WEATHER_ICONS_SHOWN, true);
  assert.equal(DEFAULT_TECH_VIEW_CHOSEN, false);
});

test('with Tech off, the inspection view shows only while T is held', () => {
  assert.equal(isTerrainInspectionShown(WORLD_MAP), false);
  assert.equal(isTerrainInspectionShown({ ...WORLD_MAP, tKeyHeld: true }), true);
});

test('the Tech view shows the inspection view on the world map', () => {
  assert.equal(isTerrainInspectionShown({ ...WORLD_MAP, techViewChosen: true }), true);
});

test('the Tech view does not apply in a battle or under the new-game overlay', () => {
  assert.equal(isTerrainInspectionShown({ ...WORLD_MAP, techViewChosen: true, inBattle: true }), false);
  assert.equal(isTerrainInspectionShown({ ...WORLD_MAP, techViewChosen: true, newGameOverlayOpen: true }), false);
});

test('holding T shows the inspection view in a battle and under the overlay, whatever Tech is', () => {
  assert.equal(isTerrainInspectionShown({ ...WORLD_MAP, tKeyHeld: true, inBattle: true }), true);
  assert.equal(isTerrainInspectionShown({ ...WORLD_MAP, tKeyHeld: true, techViewChosen: true, newGameOverlayOpen: true }), true);
});
```

- [ ] **Step 3: Edit `src/shared/inspectionStatusIconLine.ts`**

`inspectionStatusIconsForHex` returns a list: the tech icon while the inspection view is on, then the weather icon while the Weather tab is on. The new `statusIconCentersX` centers one icon, or places two side by side as a centered pair.

1. In `src/shared/inspectionStatusIconLine.ts`, find these lines. Together they occur exactly once:

```ts
 * Decides which single status icon a strategic world hex shows, and how large it is.
 *
 * Purpose: Weather shows while T is not held. Tech replaces it while T is held. Size and band offset stay pure so tests can lock them.
```

Replace them with:

```ts
 * Decides which status icons a strategic world hex shows, how large they are, and where each sits on the band.
 *
 * Purpose: Weather shows while the Weather tab is on. Tech shows while the inspection view is on: T held or the Tech
 *   tab on. A hex that shows both draws them side by side. Size, band offset, and spacing stay pure so tests can lock
 *   them.
```

2. In `src/shared/inspectionStatusIconLine.ts`, find these lines. Together they occur exactly once:

```ts
   * Whether T is held.
   *
   * Contract: True selects a tech icon. False selects a weather icon.
   * When to use: Pass `isMapInspectionModeHeld`.
   * Expected outcome: The other icon is never returned for this hold state.
```

Replace them with:

```ts
   * Whether the inspection view is on: T is held, or the Tech tab is on.
   *
   * Contract: True allows a tech icon. It does not affect the weather icon.
   * When to use: Pass `isMapInspectionModeHeld`.
   * Expected outcome: False never returns a tech icon.
```

3. In `src/shared/inspectionStatusIconLine.ts`, find these lines. Together they occur exactly once:

```ts
   * Whether the match awards a tech tier.
   *
   * Contract: Only `true` can show a tech icon, and only while T is held. Low and High use the same icon.
```

Replace them with:

```ts
   * Whether the Weather tab is on.
   *
   * Contract: True allows a weather icon. It does not affect the tech icon.
   * When to use: Pass `areWeatherIconsShown`.
   * Expected outcome: False never returns a weather icon.
   * Exceptions: None.
   */
  readonly weatherIconsShown: boolean;
  /**
   * Whether the match awards a tech tier.
   *
   * Contract: Only `true` can show a tech icon, and only while the inspection view is on. Low and High use the same icon.
```

4. In `src/shared/inspectionStatusIconLine.ts`, find this line. It occurs exactly once:

```ts
   * Contract: Only `true` can show a weather icon, and only while T is not held. Low and High use the same icon.
```

Replace it with:

```ts
   * Contract: Only `true` can show a weather icon, and only while the Weather tab is on. Low and High use the same icon.
```

5. In `src/shared/inspectionStatusIconLine.ts`, find this line. It occurs exactly once:

```ts
   * Contract: Only `mild`, `rain`, `snow`, and `heat` count, and only while T is not held and the weather bonus is on.
```

Replace it with:

```ts
   * Contract: Only `mild`, `rain`, `snow`, and `heat` count, and only while the Weather tab and the weather bonus are on.
```

6. In `src/shared/inspectionStatusIconLine.ts`, find these lines. Together they occur exactly once:

```ts
 * The one status icon to paint for a hex.
 *
 * Purpose: Tech and weather cannot both be set. The drawer centers whichever side is present.
 * When to use: The return value of `inspectionStatusIconsForHex`.
 * Expected outcome: A tech tier while T is held, or a weather state while T is not held.
```

Replace them with:

```ts
 * One status icon to paint for a hex.
 *
 * Purpose: A hex can show a tech icon, a weather icon, or both. The drawer places them with `statusIconCentersX`.
 * When to use: The entries of the list `inspectionStatusIconsForHex` returns.
 * Expected outcome: A tech tier, or a weather state.
```

7. In `src/shared/inspectionStatusIconLine.ts`, find these lines. Together they occur exactly once:

```ts
 * Returns the one status icon for a world hex, or null when that hex shows none.
 *
 * Purpose: T held selects tech. T released selects weather. A missing bonus or a missing hex fact omits the icon.
 * When to use: Once per world hex while the strategic map is outside a battle and outside battle-detail zoom.
 * Expected outcome: A tech icon, a weather icon, or null. Never both.
 * Exceptions: None.
 */
export function inspectionStatusIconsForHex(input: InspectionStatusIconInput): InspectionStatusIcon | null {
  if (input.mapInspectionHeld) {
    if (input.techBonusEnabled !== true) return null;
    if (!Number.isFinite(input.baselineUrbanHexCount) || input.baselineUrbanHexCount <= 0) return null;
    return { kind: 'tech', level: techLevelFromUrbanHexCount(input.baselineUrbanHexCount) };
  }
  if (input.weatherBonusEnabled !== true) return null;
  const weather = knownWeather(input.weather);
  if (weather == null) return null;
  return { kind: 'weather', state: weather };
```

Replace them with:

```ts
 * Returns the status icons for a world hex, left to right, or an empty list when that hex shows none.
 *
 * Purpose: The inspection view allows tech. The Weather tab allows weather. Each is decided on its own, so a hex can
 *   show both. A missing bonus or a missing hex fact omits that icon.
 * When to use: Once per world hex while the strategic map is outside a battle and outside battle-detail zoom.
 * Expected outcome: No icon, one icon, or the tech icon then the weather icon.
 * Exceptions: None.
 */
export function inspectionStatusIconsForHex(input: InspectionStatusIconInput): readonly InspectionStatusIcon[] {
  const icons: InspectionStatusIcon[] = [];
  const urbanCount = input.baselineUrbanHexCount;
  if (input.mapInspectionHeld && input.techBonusEnabled === true && Number.isFinite(urbanCount) && urbanCount > 0) {
    icons.push({ kind: 'tech', level: techLevelFromUrbanHexCount(urbanCount) });
  }
  const weather = input.weatherIconsShown && input.weatherBonusEnabled === true ? knownWeather(input.weather) : null;
  if (weather != null) icons.push({ kind: 'weather', state: weather });
  return icons;
}

/**
 * Space between two status icons on the same hex, in pixels.
 *
 * Purpose: A tech icon and a weather icon read as a pair without touching.
 * When to use: `statusIconCentersX`.
 * Expected outcome: `2`.
 * Exceptions: None.
 */
export const STATUS_ICON_GAP_PX = 2;

/**
 * Returns the horizontal center of each status icon on a hex's band.
 *
 * Purpose: One icon is centered on the hex. Two sit side by side as a pair centered on the hex, `STATUS_ICON_GAP_PX`
 *   apart, in the order `inspectionStatusIconsForHex` returns them.
 * When to use: After the icons and their size are known, with the hex centroid's x.
 * Expected outcome: `count` centers, left to right. One icon: `[centerX]`. Two icons of 16 px: `centerX - 9` and
 *   `centerX + 9`. Zero icons: an empty list.
 * Exceptions: None.
 */
export function statusIconCentersX(centerX: number, iconPx: number, count: number): number[] {
  const step = iconPx + STATUS_ICON_GAP_PX;
  const firstX = centerX - ((count - 1) * step) / 2;
  return Array.from({ length: Math.max(0, count) }, (_, i) => firstX + i * step);
```

- [ ] **Step 4: Edit `src/shared/inspectionStatusIconLine.test.ts`**

The icon test covers both icons, each alone, and none. A new test covers the centers. The test count goes up by one.

1. In `src/shared/inspectionStatusIconLine.test.ts`, find this line. It occurs exactly once:

```ts
  inspectionStatusIconsForHex,
```

Replace it with:

```ts
  inspectionStatusIconsForHex,
  statusIconCentersX,
```

2. In `src/shared/inspectionStatusIconLine.test.ts`, find these lines. Together they occur exactly once:

```ts
 * Checks which single status icon a world hex receives.
 *
 * Purpose: T held shows tech. T released shows weather. A missing bonus or a missing hex fact shows nothing.
 * When to use: From this file's runner.
 * Expected outcome: Tech while held when the bonus is on and the urban count is a positive finite number. Weather while released when that bonus is on and the word is known. Null otherwise.
 * Exceptions: AssertionError when a missing count becomes Basic, an unknown weather becomes Mild, or the other icon leaks into the hold state.
 */
test('one status icon follows the hold and the bonus', () => {
  assert.deepEqual(
    inspectionStatusIconsForHex({
      mapInspectionHeld: true,
      techBonusEnabled: true,
      weatherBonusEnabled: true,
      baselineUrbanHexCount: 21,
      weather: 'heat',
    }),
    { kind: 'tech', level: 'advanced' }
  );
  assert.deepEqual(
    inspectionStatusIconsForHex({
      mapInspectionHeld: true,
      techBonusEnabled: true,
      weatherBonusEnabled: false,
      baselineUrbanHexCount: 20,
      weather: null,
    }),
    { kind: 'tech', level: 'basic' }
  );
  assert.equal(
    inspectionStatusIconsForHex({
      mapInspectionHeld: true,
      techBonusEnabled: false,
      weatherBonusEnabled: true,
      baselineUrbanHexCount: 21,
      weather: 'heat',
    }),
    null
  );
  assert.equal(
    inspectionStatusIconsForHex({
      mapInspectionHeld: true,
      techBonusEnabled: true,
      weatherBonusEnabled: true,
      baselineUrbanHexCount: 0,
      weather: 'mild',
    }),
    null
  );
  assert.equal(
    inspectionStatusIconsForHex({
      mapInspectionHeld: true,
      techBonusEnabled: true,
      weatherBonusEnabled: false,
      baselineUrbanHexCount: Number.NaN,
      weather: null,
    }),
    null
  );
  assert.equal(
    inspectionStatusIconsForHex({
      mapInspectionHeld: true,
      techBonusEnabled: true,
      weatherBonusEnabled: true,
      baselineUrbanHexCount: -1,
      weather: 'snow',
    }),
    null
  );
  assert.deepEqual(
    inspectionStatusIconsForHex({
      mapInspectionHeld: false,
      techBonusEnabled: true,
      weatherBonusEnabled: true,
      baselineUrbanHexCount: 21,
      weather: 'heat',
    }),
    { kind: 'weather', state: 'heat' }
  );
  assert.equal(
    inspectionStatusIconsForHex({
      mapInspectionHeld: false,
      techBonusEnabled: true,
      weatherBonusEnabled: false,
      baselineUrbanHexCount: 21,
      weather: 'heat',
    }),
    null
  );
  assert.equal(
    inspectionStatusIconsForHex({
      mapInspectionHeld: false,
      techBonusEnabled: true,
      weatherBonusEnabled: true,
      baselineUrbanHexCount: 21,
      weather: 'fog',
    }),
    null
  );
  assert.equal(
    inspectionStatusIconsForHex({
      mapInspectionHeld: false,
      techBonusEnabled: true,
      weatherBonusEnabled: true,
      baselineUrbanHexCount: 21,
      weather: null,
    }),
    null
  );
```

Replace them with:

```ts
 * Checks which status icons a world hex receives.
 *
 * Purpose: The inspection view allows tech, and the Weather tab allows weather, each on its own. A missing bonus or a
 *   missing hex fact omits that icon.
 * When to use: From this file's runner.
 * Expected outcome: Tech then weather when both apply. Weather alone when the tech icon cannot show: the tech bonus is
 *   off, or the urban count cannot produce units. Tech alone when the weather word is unknown. An empty list when
 *   neither applies.
 * Exceptions: AssertionError when a missing count becomes Basic, an unknown weather becomes Mild, or a toggle leaks into
 *   the other icon.
 */
test('status icons follow the inspection view, the Weather tab, and the bonuses', () => {
  const both = {
    mapInspectionHeld: true,
    weatherIconsShown: true,
    techBonusEnabled: true,
    weatherBonusEnabled: true,
    baselineUrbanHexCount: 21,
    weather: 'heat',
  };
  assert.deepEqual(inspectionStatusIconsForHex(both), [
    { kind: 'tech', level: 'advanced' },
    { kind: 'weather', state: 'heat' },
  ]);
  assert.deepEqual(inspectionStatusIconsForHex({ ...both, weatherIconsShown: false, baselineUrbanHexCount: 20 }), [
    { kind: 'tech', level: 'basic' },
  ]);
  assert.deepEqual(inspectionStatusIconsForHex({ ...both, mapInspectionHeld: false }), [{ kind: 'weather', state: 'heat' }]);
  assert.deepEqual(inspectionStatusIconsForHex({ ...both, techBonusEnabled: false }), [{ kind: 'weather', state: 'heat' }]);
  assert.deepEqual(inspectionStatusIconsForHex({ ...both, weather: 'fog' }), [{ kind: 'tech', level: 'advanced' }]);
  assert.deepEqual(inspectionStatusIconsForHex({ ...both, baselineUrbanHexCount: -1 }), [{ kind: 'weather', state: 'heat' }]);
  assert.deepEqual(inspectionStatusIconsForHex({ ...both, techBonusEnabled: false, weatherBonusEnabled: false }), []);
  assert.deepEqual(inspectionStatusIconsForHex({ ...both, baselineUrbanHexCount: Number.NaN, weather: 'fog' }), []);
  assert.deepEqual(inspectionStatusIconsForHex({ ...both, baselineUrbanHexCount: 0, weather: null }), []);
});

/**
 * Checks where each status icon sits across a hex.
 *
 * Purpose: One icon is centered. Two sit side by side, centered as a pair, 2 px apart.
 * When to use: From this file's runner.
 * Expected outcome: One 16 px icon at the center. Two 16 px icons 9 px either side of it.
 * Exceptions: AssertionError when the pair is off center or the gap drifts.
 */
test('one status icon is centered, and two sit side by side as a centered pair', () => {
  assert.deepEqual(statusIconCentersX(100, 16, 1), [100]);
  assert.deepEqual(statusIconCentersX(100, 16, 2), [91, 109]);
  assert.deepEqual(statusIconCentersX(100, 16, 0), []);
```

- [ ] **Step 5: Edit `src/shared/newGameMapPreviewTypes.ts`**

The preview's weather input no longer takes the hold.

In `src/shared/newGameMapPreviewTypes.ts`, delete these lines, including the line break at the end. Together they occur exactly once:

```ts
   * Whether T is held.
   *
   * Contract: True hides the weather icon. Tech uses `previewTechIcon`.
   * When to use: `isMapInspectionModeHeld`.
   * Expected outcome: True returns null from `previewWeatherIcon`.
   * Exceptions: None.
   */
  readonly mapInspectionHeld: boolean;
  /**
```

- [ ] **Step 6: Edit `src/shared/newGameMapPreviewCore.ts`**

Holding T keeps the preview's weather icons.

In `src/shared/newGameMapPreviewCore.ts`, find these lines. Together they occur exactly once:

```ts
 * Purpose: The preview follows the dialog's month and weather bonus. Holding T hides this icon. Tech icons are chosen separately and appear while T is held.
 * When to use: Once per hex per frame, with values read from the dialog and the view, not from a cached copy.
 * Expected outcome: A display state, including `mild`. Null when the bonus is off, T is held, the view is at battle-detail zoom, or the year is not twelve known states.
 * Exceptions: None.
 */
export function previewWeatherIcon(input: PreviewWeatherIconInput): WeatherState | null {
  if (input.tacticalZoom || input.mapInspectionHeld || input.weatherBonusLevel === 'off') return null;
```

Replace them with:

```ts
 * Purpose: The preview follows the dialog's month and weather bonus. The Weather tab does not apply here: the minimap panel is hidden while the overlay is open. Holding T keeps this icon; tech icons are chosen separately and sit beside it while T is held.
 * When to use: Once per hex per frame, with values read from the dialog and the view, not from a cached copy.
 * Expected outcome: A display state, including `mild`. Null when the bonus is off, the view is at battle-detail zoom, or the year is not twelve known states.
 * Exceptions: None.
 */
export function previewWeatherIcon(input: PreviewWeatherIconInput): WeatherState | null {
  if (input.tacticalZoom || input.weatherBonusLevel === 'off') return null;
```

- [ ] **Step 7: Edit `src/shared/newGameMapPreviewCore.test.ts`**

The weather test drops the hold case.

1. In `src/shared/newGameMapPreviewCore.test.ts`, find this line. It occurs exactly once:

```ts
test('preview weather icon follows the start month unless the bonus, inspection, or zoom hides it', () => {
```

Replace it with:

```ts
test('preview weather icon follows the start month unless the bonus or zoom hides it', () => {
```

2. In `src/shared/newGameMapPreviewCore.test.ts`, delete this line, including the line break at the end. It occurs exactly once:

```ts
    mapInspectionHeld: false,
```

3. In `src/shared/newGameMapPreviewCore.test.ts`, delete this line, including the line break at the end. It occurs exactly once:

```ts
  assert.equal(previewWeatherIcon({ ...shown, mapInspectionHeld: true }), null);
```

- [ ] **Step 8: Replace `src/renderer/map/mapViewModeState.ts`**

Two stored choices, each with a getter and a setter, in place of one view. The whole file is given.

Replace the whole file `src/renderer/map/mapViewModeState.ts` with exactly this content:

```ts
/**
 * The two view choices the player made in the map-mode tabs: whether weather icons show, and whether the Tech view is
 * on. This module holds them for the rest of the session; they are not saved, so the app opens with weather icons shown
 * and the Tech view off each time.
 *
 * Purpose: The mode tabs write the choices and the drawing code reads them, without either importing the other.
 * When to use: Through the getters and setters below.
 * Expected outcome: `DEFAULT_WEATHER_ICONS_SHOWN` and `DEFAULT_TECH_VIEW_CHOSEN` until the player changes them.
 * Exceptions: None.
 */
import { DEFAULT_TECH_VIEW_CHOSEN, DEFAULT_WEATHER_ICONS_SHOWN } from '../../shared/mapViewMode';

/**
 * Whether Weather is on in the mode tabs.
 *
 * Purpose: The single record of that choice for this session.
 * When to use: Only through `areWeatherIconsShown` and `setWeatherIconsShown`.
 * Expected outcome: Starts as `DEFAULT_WEATHER_ICONS_SHOWN`.
 * Exceptions: None.
 */
let weatherIconsShown = DEFAULT_WEATHER_ICONS_SHOWN;

/**
 * Whether Tech is on in the mode tabs.
 *
 * Purpose: The single record of that choice for this session.
 * When to use: Only through `isTechViewChosen` and `setTechViewChosen`.
 * Expected outcome: Starts as `DEFAULT_TECH_VIEW_CHOSEN`.
 * Exceptions: None.
 */
let techViewChosen = DEFAULT_TECH_VIEW_CHOSEN;

/**
 * Returns whether the world map shows weather icons.
 *
 * Purpose: The status-icon pass and the Weather tab follow the same choice.
 * When to use: Each time the status icons are drawn, and when the mode tabs redraw their pressed state.
 * Expected outcome: True while Weather is on.
 * Exceptions: None.
 */
export function areWeatherIconsShown(): boolean {
  return weatherIconsShown;
}

/**
 * Records whether the world map shows weather icons.
 *
 * Purpose: The choice lasts for the session, across turns, battles, and new matches.
 * When to use: Only from the Weather tab.
 * Expected outcome: Later calls to `areWeatherIconsShown` return `shown`. Nothing is redrawn here.
 * Exceptions: None.
 */
export function setWeatherIconsShown(shown: boolean): void {
  weatherIconsShown = shown;
}

/**
 * Returns whether the player turned the Tech view on.
 *
 * Purpose: Drawing code and the Tech tab follow the same choice.
 * When to use: Each time the inspection view is decided, and when the mode tabs redraw their pressed state.
 * Expected outcome: True while Tech is on.
 * Exceptions: None.
 */
export function isTechViewChosen(): boolean {
  return techViewChosen;
}

/**
 * Records whether the player turned the Tech view on.
 *
 * Purpose: The choice lasts for the session, across turns, battles, and new matches.
 * When to use: Only from the Tech tab.
 * Expected outcome: Later calls to `isTechViewChosen` return `chosen`. Nothing is redrawn here.
 * Exceptions: None.
 */
export function setTechViewChosen(chosen: boolean): void {
  techViewChosen = chosen;
}
```

- [ ] **Step 9: Edit `src/renderer/gameplay/productionOverlayHelpers.ts`**

The inspection view reads the Tech choice.

1. In `src/renderer/gameplay/productionOverlayHelpers.ts`, find this line. It occurs exactly once:

```ts
import { getMapViewMode } from '../map/mapViewModeState';
```

Replace it with:

```ts
import { isTechViewChosen } from '../map/mapViewModeState';
```

2. In `src/renderer/gameplay/productionOverlayHelpers.ts`, find this line. It occurs exactly once:

```ts
   * Contract: True while the inspection view is on: T is held, or Tech is chosen on the world map outside a battle and outside the new-game or game-over overlay.
```

Replace it with:

```ts
   * Contract: True while the inspection view is on: T is held, or Tech is on, on the world map outside a battle and outside the new-game or game-over overlay.
```

3. In `src/renderer/gameplay/productionOverlayHelpers.ts`, find these lines. Together they occur exactly once:

```ts
 *   it along; the answer now also covers the Tech view chosen in the mode tabs.
 * When to use: Wherever drawing depends on the inspection view.
 * Expected outcome: True while T is held, or while the Tech view is chosen outside a battle and outside the new-game
 *   or game-over overlay. See `isTerrainInspectionShown`.
 * Exceptions: None.
 */
export function isMapInspectionModeHeld(): boolean {
  const mapViewMode = getMapViewMode();
  return isTerrainInspectionShown({
    tKeyHeld: S.hideTerrainFillWhileHeld,
    mapViewMode,
    inBattle: S.tacticalBattleSnapshot != null,
    // Drawing asks this for every hex, so the page is read only while the answer can depend on it.
    newGameOverlayOpen: mapViewMode === 'tech' && isNewGameOverlayOpen(),
```

Replace them with:

```ts
 *   it along; the answer now also covers the Tech view turned on in the mode tabs.
 * When to use: Wherever drawing depends on the inspection view.
 * Expected outcome: True while T is held, or while the Tech view is on outside a battle and outside the new-game or
 *   game-over overlay. See `isTerrainInspectionShown`.
 * Exceptions: None.
 */
export function isMapInspectionModeHeld(): boolean {
  const techViewChosen = isTechViewChosen();
  return isTerrainInspectionShown({
    tKeyHeld: S.hideTerrainFillWhileHeld,
    techViewChosen,
    inBattle: S.tacticalBattleSnapshot != null,
    // Drawing asks this for every hex, so the page is read only while the answer can depend on it.
    newGameOverlayOpen: techViewChosen && isNewGameOverlayOpen(),
```

- [ ] **Step 10: Edit `src/renderer/map/mapModeTabs.ts`**

Weather and Tech each toggle their own choice.

1. In `src/renderer/map/mapModeTabs.ts`, find these lines. Together they occur exactly once:

```ts
 * The row of map-mode tabs under the minimap overview: Weather and Tech choose the map view, Control and Production are
 * disabled placeholders in the markup, and Legend opens or closes the terrain legend. The row starts hidden, and the
 * toggle on the overview's lower-left corner shows and hides it.
 *
 * Purpose: Keeps the tabs, the row's toggle, the stored view, and the legend in step.
 * When to use: `wireMapModeTabs` once at startup.
 * Expected outcome: Exactly one of Weather and Tech reads as pressed, and Legend reads as pressed while the legend is
 *   open. The toggle reads as expanded while the row shows.
 * Exceptions: None; missing elements are skipped.
 */
import type { MapViewMode } from '../../shared/mapViewMode';
import { mapModeTabsHideTooltipText, mapModeTabsShowTooltipText } from '../chrome/frameTooltipText';
import { layoutMapChrome } from './mapChromeLayout';
import { getMapViewMode, setMapViewMode } from './mapViewModeState';

/**
 * Sets each tab's pressed state from the stored view and the legend.
 *
 * Purpose: The tabs are the only sign of which view is on, so they must never disagree with it.
 * When to use: After the view changes or the legend opens or closes.
 * Expected outcome: `aria-pressed` on Weather and Tech matches the stored view; `aria-pressed` and `aria-expanded` on
 *   Legend match whether `#terrain-legend` is shown.
 * Exceptions: None.
 */
function syncMapModeTabs(): void {
  const mode = getMapViewMode();
  document.getElementById('map-mode-weather')?.setAttribute('aria-pressed', String(mode === 'weather'));
  document.getElementById('map-mode-tech')?.setAttribute('aria-pressed', String(mode === 'tech'));
```

Replace them with:

```ts
 * The row of map-mode tabs under the minimap overview: Weather shows or hides the weather icons and Tech turns the Tech
 * view on or off, each a toggle on its own; Control and Production are disabled placeholders in the markup; and Legend
 * opens or closes the terrain legend. The row starts hidden, and the toggle on the overview's lower-left corner shows
 * and hides it.
 *
 * Purpose: Keeps the tabs, the row's toggle, the stored choices, and the legend in step.
 * When to use: `wireMapModeTabs` once at startup.
 * Expected outcome: Weather reads as pressed while its icons show, Tech while its view is on, and Legend while the
 *   legend is open. The toggle reads as expanded while the row shows.
 * Exceptions: None; missing elements are skipped.
 */
import { mapModeTabsHideTooltipText, mapModeTabsShowTooltipText } from '../chrome/frameTooltipText';
import { layoutMapChrome } from './mapChromeLayout';
import { areWeatherIconsShown, isTechViewChosen, setTechViewChosen, setWeatherIconsShown } from './mapViewModeState';

/**
 * Sets each tab's pressed state from the stored choices and the legend.
 *
 * Purpose: The tabs are the only sign of which choices are on, so they must never disagree with them.
 * When to use: After a choice changes or the legend opens or closes.
 * Expected outcome: `aria-pressed` on Weather and on Tech matches its stored choice; `aria-pressed` and
 *   `aria-expanded` on Legend match whether `#terrain-legend` is shown.
 * Exceptions: None.
 */
function syncMapModeTabs(): void {
  document.getElementById('map-mode-weather')?.setAttribute('aria-pressed', String(areWeatherIconsShown()));
  document.getElementById('map-mode-tech')?.setAttribute('aria-pressed', String(isTechViewChosen()));
```

2. In `src/renderer/map/mapModeTabs.ts`, find these lines. Together they occur exactly once:

```ts
 * Switches the map to a view, unless it is already showing.
 *
 * Purpose: The view decides the terrain fill, the hex codes, and the status icons, which the canvas draws.
 * When to use: From the Weather and Tech tabs.
 * Expected outcome: The view is stored, the tabs follow, and the map is redrawn.
 * Exceptions: None.
 */
function chooseMapView(mode: MapViewMode, requestRedraw: () => void): void {
  if (getMapViewMode() === mode) return;
  setMapViewMode(mode);
```

Replace them with:

```ts
 * Turns the weather icons on the world map on or off.
 *
 * Purpose: The canvas draws the weather icons from the stored choice, in either view.
 * When to use: From the Weather tab.
 * Expected outcome: The choice flips, the tab follows, and the map is redrawn. The Tech view is not touched.
 * Exceptions: None.
 */
function toggleWeatherIcons(requestRedraw: () => void): void {
  setWeatherIconsShown(!areWeatherIconsShown());
  syncMapModeTabs();
  requestRedraw();
}

/**
 * Turns the Tech view on or off.
 *
 * Purpose: The Tech view decides the terrain fill, the hex codes, and the tech icons, which the canvas draws.
 * When to use: From the Tech tab.
 * Expected outcome: The choice flips, the tab follows, and the map is redrawn. The weather icons are not touched.
 * Exceptions: None.
 */
function toggleTechView(requestRedraw: () => void): void {
  setTechViewChosen(!isTechViewChosen());
```

3. In `src/renderer/map/mapModeTabs.ts`, find these lines. Together they occur exactly once:

```ts
 * Expected outcome: Clicks show or hide the row, or change the view or the legend, and the tabs show the session's
 *   starting state. The row's starting state, hidden, comes from the markup.
```

Replace them with:

```ts
 * Expected outcome: Clicks show or hide the row, turn Weather or Tech on or off, or open or close the legend, and the
 *   tabs show the session's starting state. The row's starting state, hidden, comes from the markup.
```

4. In `src/renderer/map/mapModeTabs.ts`, find these lines. Together they occur exactly once:

```ts
  document.getElementById('map-mode-weather')?.addEventListener('click', () => chooseMapView('weather', requestRedraw));
  document.getElementById('map-mode-tech')?.addEventListener('click', () => chooseMapView('tech', requestRedraw));
```

Replace them with:

```ts
  document.getElementById('map-mode-weather')?.addEventListener('click', () => toggleWeatherIcons(requestRedraw));
  document.getElementById('map-mode-tech')?.addEventListener('click', () => toggleTechView(requestRedraw));
```

- [ ] **Step 11: Edit `src/renderer/rendering/inspectionStatusIcons.ts`**

The pass draws every icon the selector returns, at the centers `statusIconCentersX` gives.

1. In `src/renderer/rendering/inspectionStatusIcons.ts`, find these lines. Together they occur exactly once:

```ts
 * Draws one status icon above a strategic world hex.
 *
 * Purpose: Weather shows while T is not held. Tech replaces it, at the same enlarged size, while T is held.
 * When to use: Immediately after the strategic hex-code pass.
 * Expected outcome: One centered icon on each qualifying world hex. Nothing in a tactical battle or at battle-detail zoom.
```

Replace them with:

```ts
 * Draws the status icons above a strategic world hex: the weather icon while the Weather tab is on, and the tech icon
 * while the inspection view is on (T held or the Tech tab on).
 *
 * Purpose: Each icon follows its own toggle, so a hex can show both. They share one size and one band.
 * When to use: Immediately after the strategic hex-code pass.
 * Expected outcome: One centered icon, or a centered tech-then-weather pair, on each qualifying world hex. Nothing in a
 *   tactical battle or at battle-detail zoom.
```

2. In `src/renderer/rendering/inspectionStatusIcons.ts`, find this line. It occurs exactly once:

```ts
  inspectionStatusIconsForHex,
```

Replace it with:

```ts
  inspectionStatusIconsForHex,
  statusIconCentersX,
```

3. In `src/renderer/rendering/inspectionStatusIcons.ts`, find this line. It occurs exactly once:

```ts
import { getMainLeafletMapForProjection } from '../map/leafletMainMapProjection';
```

Replace it with:

```ts
import { getMainLeafletMapForProjection } from '../map/leafletMainMapProjection';
import { areWeatherIconsShown } from '../map/mapViewModeState';
```

4. In `src/renderer/rendering/inspectionStatusIcons.ts`, find this line. It occurs exactly once:

```ts
 * Placement for the one status icon on a hex.
```

Replace it with:

```ts
 * Placement for one status icon on a hex.
```

5. In `src/renderer/rendering/inspectionStatusIcons.ts`, find this line. It occurs exactly once:

```ts
   * Contract: The hex centroid x.
```

Replace it with:

```ts
   * Contract: The hex centroid x for a lone icon, or one of the two centers `statusIconCentersX` returns for a pair.
```

6. In `src/renderer/rendering/inspectionStatusIcons.ts`, find this line. It occurs exactly once:

```ts
   * SVG path for the one icon.
```

Replace it with:

```ts
   * SVG path for this icon.
```

7. In `src/renderer/rendering/inspectionStatusIcons.ts`, find this line. It occurs exactly once:

```ts
 * When to use: One preview hex that is showing a weather icon, or a tech icon while T is held.
```

Replace it with:

```ts
 * When to use: Each icon of a preview hex: its weather icon, and its tech icon while T is held.
```

8. In `src/renderer/rendering/inspectionStatusIcons.ts`, find these lines. Together they occur exactly once:

```ts
 * Draws one status icon centered on a hex band.
 *
 * Purpose: Paints the one chosen image at the band center.
 * When to use: After the selector returns a tech or weather icon.
```

Replace them with:

```ts
 * Draws one status icon centered on its placement.
 *
 * Purpose: Paints one chosen image on the band.
 * When to use: For each icon the selector returns.
```

9. In `src/renderer/rendering/inspectionStatusIcons.ts`, find these lines. Together they occur exactly once:

```ts
 * Draws the status icon above each qualifying world hex.
 *
 * Purpose: Weather shows while T is not held. Tech replaces it while T is held. Neither requires a production label.
 * When to use: On the next line after each `drawStrategicInspectionHexCodes` call.
 * Expected outcome: No-op in a tactical battle or at battle-detail zoom. Otherwise one icon per qualifying hex. An unexplored hex is not passed a weather word, because the renderer snapshot still stores weather there.
```

Replace them with:

```ts
 * Draws the status icons above each qualifying world hex.
 *
 * Purpose: Weather shows while the Weather tab is on. Tech shows while the inspection view is on. Neither requires a
 *   production label.
 * When to use: On the next line after each `drawStrategicInspectionHexCodes` call.
 * Expected outcome: No-op in a tactical battle or at battle-detail zoom. Otherwise one icon, or a tech-then-weather
 *   pair side by side, per qualifying hex. An unexplored hex is not passed a weather word, because the renderer snapshot
 *   still stores weather there.
```

10. In `src/renderer/rendering/inspectionStatusIcons.ts`, find this line. It occurs exactly once:

```ts
  const mapInspectionHeld = isMapInspectionModeHeld();
```

Replace it with:

```ts
  const mapInspectionHeld = isMapInspectionModeHeld();
  const weatherIconsShown = areWeatherIconsShown();
```

11. In `src/renderer/rendering/inspectionStatusIcons.ts`, find these lines. Together they occur exactly once:

```ts
      const icon = inspectionStatusIconsForHex({
        mapInspectionHeld,
```

Replace them with:

```ts
      const icons = inspectionStatusIconsForHex({
        mapInspectionHeld,
        weatherIconsShown,
```

12. In `src/renderer/rendering/inspectionStatusIcons.ts`, find these lines. Together they occur exactly once:

```ts
      if (!icon) continue;
      const pts = projectHexBoundaryToContainerPoints(hx.h3Index, map, leaflet);
      if (pts.length === 0) continue;
      const centroid = projectedCentroid(pts);
      const assetPath = icon.kind === 'tech'
        ? techInspectionIconAssetPath(icon.level)
        : weatherInspectionIconAssetPath(icon.state);
      drawStatusIcon(ctx, deps, {
        centerX: centroid.x,
        centerY: centroid.y - strategicOverlayBandOffsetPx(spanForProjectedHex(pts)),
        iconPx: inspectionStatusIconDrawPx({
          productionSurface: surface === 'button' ? 'button' : 'canvas',
          hasInfraSymbols: deps.hasInfraSymbols(hx.h3Index, unitHexes),
          hasVisibleUnits: unitHexes.has(hx.h3Index),
        }),
        assetPath,
```

Replace them with:

```ts
      if (icons.length === 0) continue;
      const pts = projectHexBoundaryToContainerPoints(hx.h3Index, map, leaflet);
      if (pts.length === 0) continue;
      const centroid = projectedCentroid(pts);
      const centerY = centroid.y - strategicOverlayBandOffsetPx(spanForProjectedHex(pts));
      const iconPx = inspectionStatusIconDrawPx({
        productionSurface: surface === 'button' ? 'button' : 'canvas',
        hasInfraSymbols: deps.hasInfraSymbols(hx.h3Index, unitHexes),
        hasVisibleUnits: unitHexes.has(hx.h3Index),
      });
      const centersX = statusIconCentersX(centroid.x, iconPx, icons.length);
      icons.forEach((icon, i) => {
        const assetPath = icon.kind === 'tech'
          ? techInspectionIconAssetPath(icon.level)
          : weatherInspectionIconAssetPath(icon.state);
        drawStatusIcon(ctx, deps, { centerX: centersX[i]!, centerY, iconPx, assetPath });
```

- [ ] **Step 12: Edit `src/renderer/map/newGameMapPreviewRendering.ts`**

The preview places its tech and weather icons the same way.

1. In `src/renderer/map/newGameMapPreviewRendering.ts`, find this line. It occurs exactly once:

```ts
  inspectionStatusIconDrawPx,
```

Replace it with:

```ts
  inspectionStatusIconDrawPx,
  statusIconCentersX,
```

2. In `src/renderer/map/newGameMapPreviewRendering.ts`, find this text. It occurs exactly once:

```ts
Weather icons follow the month on every strategic hex, and tech icons follow the tech bonus on every strategic hex while T is held.
```

Replace it with:

```ts
Weather icons follow the month on every strategic hex, and tech icons follow the tech bonus on every strategic hex while T is held; a hex with both shows the tech-then-weather pair, as on the world map.
```

3. In `src/renderer/map/newGameMapPreviewRendering.ts`, find these lines. Together they occur exactly once:

```ts
      weatherByMonth: hex.weatherByMonth,
      mapInspectionHeld: inspectionHeld,
```

Replace them with:

```ts
      weatherByMonth: hex.weatherByMonth,
```

4. In `src/renderer/map/newGameMapPreviewRendering.ts`, find these lines. Together they occur exactly once:

```ts
    const assetPath = tech
      ? techInspectionIconAssetPath(tech)
      : weather
        ? weatherInspectionIconAssetPath(weather)
        : null;
    if (assetPath) icons.push(statusIconPlacement(pts, assetPath));
```

Replace them with:

```ts
    // Tech then weather, left to right, the same order as the world map's status icons.
    const assetPaths: string[] = [];
    if (tech) assetPaths.push(techInspectionIconAssetPath(tech));
    if (weather) assetPaths.push(weatherInspectionIconAssetPath(weather));
    icons.push(...statusIconPlacements(pts, assetPaths));
```

5. In `src/renderer/map/newGameMapPreviewRendering.ts`, find these lines. Together they occur exactly once:

```ts
 * Places one status icon on the band above a hex center.
 *
 * Purpose: Weather and tech share the band and the plain 16.5px size, because the preview draws no units or infrastructure.
 * When to use: A preview hex that has a weather or tech icon this frame.
 * Expected outcome: A placement whose asset is the chosen icon.
 * Exceptions: None.
 */
function statusIconPlacement(pts: readonly { x: number; y: number }[], assetPath: string): StatusIconPlacement {
```

Replace them with:

```ts
 * Places a preview hex's status icons on the band above its center.
 *
 * Purpose: Weather and tech share the band and the plain 16.5px size, because the preview draws no units or
 *   infrastructure. One icon is centered, and two sit side by side as a centered pair (`statusIconCentersX`).
 * When to use: Each preview hex, with the asset paths of the icons it shows this frame, tech first.
 * Expected outcome: One placement per asset path, left to right. None when the list is empty.
 * Exceptions: None.
 */
function statusIconPlacements(
  pts: readonly { x: number; y: number }[],
  assetPaths: readonly string[]
): StatusIconPlacement[] {
  if (assetPaths.length === 0) return [];
```

6. In `src/renderer/map/newGameMapPreviewRendering.ts`, find these lines. Together they occur exactly once:

```ts
  return {
    centerX: sumX / pts.length,
    centerY,
    iconPx: inspectionStatusIconDrawPx({
      productionSurface: 'canvas',
      hasInfraSymbols: false,
      hasVisibleUnits: false,
    }),
    assetPath,
  };
```

Replace them with:

```ts
  const iconPx = inspectionStatusIconDrawPx({
    productionSurface: 'canvas',
    hasInfraSymbols: false,
    hasVisibleUnits: false,
  });
  const centersX = statusIconCentersX(sumX / pts.length, iconPx, assetPaths.length);
  return assetPaths.map((assetPath, i) => ({ centerX: centersX[i]!, centerY, iconPx, assetPath }));
```

- [ ] **Step 13: Edit `src/renderer/chrome/frameTooltipText.ts`**

The Weather and Tech tips describe toggles.

1. In `src/renderer/chrome/frameTooltipText.ts`, find this line. It occurs exactly once:

```ts
 * Purpose: Says Weather is the map's normal view.
```

Replace it with:

```ts
 * Purpose: Says Weather is a toggle for the weather icons, and when they can show.
```

2. In `src/renderer/chrome/frameTooltipText.ts`, find this line. It occurs exactly once:

```ts
  "Show the map as usual: terrain, and each hex's weather while the weather bonus is on.";
```

Replace it with:

```ts
  "Show or hide each hex's weather icon on the world map, while the weather bonus is on.";
```

3. In `src/renderer/chrome/frameTooltipText.ts`, find these lines. Together they occur exactly once:

```ts
 * Purpose: Says what Tech shows, where it applies, how long it lasts, and how it relates to holding T.
 * When to use: `#map-mode-tech`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const mapTechModeTooltipText =
  "Show each hex's code, production, and tech tier instead of terrain on the world map, until you choose Weather. Holding T shows the same view while the key is down.";
```

Replace them with:

```ts
 * Purpose: Says Tech is a toggle, what its view shows and where, and how it relates to holding T.
 * When to use: `#map-mode-tech`.
 * Expected outcome: The control tip shows these sentences.
 * Exceptions: None.
 */
export const mapTechModeTooltipText =
  "Turn the Tech view on or off: each hex's code, production, and tech tier instead of terrain on the world map. Holding T shows the same view while the key is down.";
```

- [ ] **Step 14: Checkpoint: build, types, and lint**

Run these one at a time:

```powershell
npm run build:main
npm run check:renderer-types
npm run lint
```

Each exits 0, and `check:renderer-types` prints `check-renderer-typecheck: ok`. An error here comes from the steps above: open the file the error names, compare it with its step, fix your copying mistake, and run the three again. If the steps as written cannot compile, stop and report.

- [ ] **Step 15: Edit `static/index.html`**

The Weather and Tech tips, the same as the constants.

In `static/index.html`, find these lines. Together they occur exactly once:

```html
        <button type="button" id="map-mode-weather" class="map-mode-btn" aria-pressed="true" data-control-tooltip="Show the map as usual: terrain, and each hex's weather while the weather bonus is on."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 12.5h7a2.6 2.6 0 0 0 .3-5.2 4 4 0 0 0-7.6.9 2.2 2.2 0 0 0 .3 4.3z"></path></svg><span>Weather</span></button>
        <button type="button" id="map-mode-tech" class="map-mode-btn" aria-pressed="false" data-control-tooltip="Show each hex's code, production, and tech tier instead of terrain on the world map, until you choose Weather. Holding T shows the same view while the key is down."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 5h6v6H5zM7 2.5V5M9 2.5V5M7 11v2.5M9 11v2.5M2.5 7H5M2.5 9H5M11 7h2.5M11 9h2.5"></path></svg><span>Tech</span></button>
```

Replace them with:

```html
        <button type="button" id="map-mode-weather" class="map-mode-btn" aria-pressed="true" data-control-tooltip="Show or hide each hex's weather icon on the world map, while the weather bonus is on."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 12.5h7a2.6 2.6 0 0 0 .3-5.2 4 4 0 0 0-7.6.9 2.2 2.2 0 0 0 .3 4.3z"></path></svg><span>Weather</span></button>
        <button type="button" id="map-mode-tech" class="map-mode-btn" aria-pressed="false" data-control-tooltip="Turn the Tech view on or off: each hex's code, production, and tech tier instead of terrain on the world map. Holding T shows the same view while the key is down."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 5h6v6H5zM7 2.5V5M9 2.5V5M7 11v2.5M9 11v2.5M2.5 7H5M2.5 9H5M11 7h2.5M11 9h2.5"></path></svg><span>Tech</span></button>
```

- [ ] **Step 16: Edit `scripts/ui-smoke/ui-smoke-scenes.cjs`**

A new scene: Weather turned off.

In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find this line. It occurs exactly once:

```js
  mapTech: 'map-tech',
```

Replace it with:

```js
  mapTech: 'map-tech',
  mapWeatherOff: 'map-weather-off',
```

- [ ] **Step 17: Edit `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`**

The Tech check expects Weather to stay pressed, and a new check reads Weather off.

1. In `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, find these lines. Together they occur exactly once:

```js
 * Expected outcome: The Tech view and the open legend, both chosen from the shown row.
 * Exceptions: None.
 */
const TABS_SHOWN_SCENES = Object.freeze([SCENES.mapTech, SCENES.legendOpen]);
```

Replace them with:

```js
 * Expected outcome: The Tech view, Weather turned off, and the open legend, all chosen from the shown row.
 * Exceptions: None.
 */
const TABS_SHOWN_SCENES = Object.freeze([SCENES.mapTech, SCENES.mapWeatherOff, SCENES.legendOpen]);
```

2. In `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, find this line. It occurs exactly once:

```js
    name: 'map-mode-tech-chosen',
```

Replace it with:

```js
    name: 'map-mode-tech-on-keeps-weather',
```

3. In `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, find this line. It occurs exactly once:

```js
      return line === 'Weather pressed=false, Tech pressed=true' ? null : `the view tabs read "${line}"`;
```

Replace it with:

```js
      return line === 'Weather pressed=true, Tech pressed=true' ? null : `the view tabs read "${line}"`;
    },
  },
  {
    name: 'map-mode-weather-off',
    scenes: [SCENES.mapWeatherOff],
    needs: ['#map-mode-weather', '#map-mode-tech'],
    run: (p, el) => {
      const line = `Weather pressed=${el('#map-mode-weather').pressed}, Tech pressed=${el('#map-mode-tech').pressed}`;
      return line === 'Weather pressed=false, Tech pressed=false' ? null : `the view tabs read "${line}"`;
```

- [ ] **Step 18: Edit `scripts/ui-smoke/ui-smoke.cjs`**

The run turns Tech on and off, then turns Weather off and on, recording each.

1. In `scripts/ui-smoke/ui-smoke.cjs`, find this line. It occurs exactly once:

```js
  // hides them in the small window below. Choose the Tech view and record it, then go back to Weather.
```

Replace it with:

```js
  // hides them in the small window below. Turn the Tech view on and record it with the weather icons still on, then
  // turn it off. Turn Weather off and record the map without weather icons, then turn it back on.
```

2. In `scripts/ui-smoke/ui-smoke.cjs`, find this line. It occurs exactly once:

```js
  await recordScene(page, report, outDir, SCENES.mapTech);
```

Replace it with:

```js
  await recordScene(page, report, outDir, SCENES.mapTech);
  await page.click('#map-mode-tech');
  await page.click('#map-mode-weather');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.mapWeatherOff);
```

The next line in the file is `await page.click('#map-mode-weather');`. It used to return to the Weather view. After this step it turns Weather back on, so the later scenes still show weather icons. Leave it.

- [ ] **Step 19: Edit `doc/ux/map-surface.md`**

Weather and tech icons each follow their own toggle, and a hex with both shows the pair.

1. In `doc/ux/map-surface.md`, find these lines. Together they occur exactly once:

````markdown
- On the strategic map, outside a battle and outside battle-detail zoom, one icon sits on the band above the hex center, whether or not that hex is showing a production label. While the inspection view is off, the icon is that hex's weather, when the weather bonus is on and the hex has weather. Fog of war leaves an unexplored hex without that icon. While T is held or the Tech view is chosen, the weather icon is hidden, and the icon is that hex's tech tier when the tech bonus is on and the hex's original urban count can produce units. Fog of war does not hide the tech icon. A hex that does not qualify shows no icon while that view is on. The two icons are the same size, one and a half times the height of that hex's production text. That height is the shorter production text when the hex shows a build button, an airport or seaport glyph, or a unit, and the plain height otherwise, including a hex that is not showing the text. The icon is centered. The glyphs match the Tech and Weather icons in the [hex tooltip](hex-tooltips.md). These icons have no tooltip of their own. The hex tooltip still appears on hover.
- Overlays from [map-overlays.md](map-overlays.md).

When no match is loaded, the basemap can still be visible beside the new-game setup panel. While that overlay is open, the canvas draws the dialog's map preview instead of the loaded match, as in [new-game-dialog.md](new-game-dialog.md). Units, hex codes, production labels, build markers, battle-entry markers, road and rail lines, and other match chrome stay hidden. The minimap panel, the terrain legend, and the map's + and − zoom control are hidden. Opening the overlay frames the main view. On Global that frame is one zoom level closer than the world fit. Changing a home does not move it. Changing the tab or the regional region does. Fog of war does not hide the preview icons. Holding T draws the global preview's strategic hex grid, hides the weather icons, and does not show hex codes or production labels. Releasing T hides that global grid and leaves the home regions drawn. A regional preview keeps its hex grid. While Tech bonus is Low or High, that hold shows the previewed map's tech icons on every strategic hex that can produce units. Basic and Advanced use that map's Advanced threshold. Off hides them. Battle-detail zoom of that map's strategic hexes hides both icons.
````

Replace them with:

````markdown
- On the strategic map, outside a battle and outside battle-detail zoom, status icons sit on the band above the hex center, whether or not that hex is showing a production label. The weather icon is that hex's weather, while Weather is on in the [minimap panel](minimap.md), the weather bonus is on, and the hex has weather, in either view. Weather is on when the app opens. Fog of war leaves an unexplored hex without that icon. The tech icon is that hex's tech tier, while T is held or the Tech view is chosen, the tech bonus is on, and the hex's original urban count can produce units. Fog of war does not hide the tech icon. One icon is centered on the band. A hex that shows both has them side by side, tech on the left and weather on the right, 2 px apart, centered as a pair (`statusIconCentersX` in `src/shared/inspectionStatusIconLine.ts`). The two icons are the same size, one and a half times the height of that hex's production text. That height is the shorter production text when the hex shows a build button, an airport or seaport glyph, or a unit, and the plain height otherwise, including a hex that is not showing the text. The glyphs match the Tech and Weather icons in the [hex tooltip](hex-tooltips.md). These icons have no tooltip of their own. The hex tooltip still appears on hover.
- Overlays from [map-overlays.md](map-overlays.md).

When no match is loaded, the basemap can still be visible beside the new-game setup panel. While that overlay is open, the canvas draws the dialog's map preview instead of the loaded match, as in [new-game-dialog.md](new-game-dialog.md). Units, hex codes, production labels, build markers, battle-entry markers, road and rail lines, and other match chrome stay hidden. The minimap panel, the terrain legend, and the map's + and − zoom control are hidden. Opening the overlay frames the main view. On Global that frame is one zoom level closer than the world fit. Changing a home does not move it. Changing the tab or the regional region does. Fog of war does not hide the preview icons. Holding T draws the global preview's strategic hex grid, and does not show hex codes or production labels. Releasing T hides that global grid and leaves the home regions drawn. A regional preview keeps its hex grid. While Tech bonus is Low or High, that hold shows the previewed map's tech icons on every strategic hex that can produce units, beside the weather icons as on the world map. Basic and Advanced use that map's Advanced threshold. Off hides them. The preview's weather icons follow the dialog, not the Weather tab, which is hidden with the minimap panel. Battle-detail zoom of that map's strategic hexes hides both icons.
````

2. In `doc/ux/map-surface.md`, find this text. It occurs exactly once:

````markdown
On the strategic map, outside battle-detail zoom, the hex codes stay up for that same hold, and the weather icon is hidden. The tech icon is shown where the information list says it applies. Release or blur restores the fill, removes the codes, and restores the weather icon, except on the world map while the Tech view is chosen: that view stays.
````

Replace it with:

````markdown
On the strategic map, outside battle-detail zoom, the hex codes stay up for that same hold, and the tech icon is shown where the information list says it applies, beside the weather icon while Weather is on. Release or blur restores the fill and removes the codes and the tech icons, except on the world map while the Tech view is chosen: that view stays.
````

3. In `doc/ux/map-surface.md`, find this text. It occurs exactly once:

````markdown
On the strategic map, outside battle-detail zoom, hex codes are shown, the weather icon is hidden, and the tech icon is shown where it applies.
````

Replace it with:

````markdown
On the strategic map, outside battle-detail zoom, hex codes are shown, and the tech icon is shown where it applies, beside the weather icon while Weather is on.
````

4. In `doc/ux/map-surface.md`, find this line. It occurs exactly once:

````markdown
- The weather icon appears on the strategic map outside a battle and outside battle-detail zoom, while the inspection view is off, on each world hex that has weather while the weather bonus is on, including a hex with no production label. An unexplored hex has none. While T is held or the Tech view is chosen, the weather icon is hidden. The tech icon is shown on that same band on each world hex whose original urban count can produce units, while the tech bonus is on, including an unexplored hex. A hex with no tech icon shows no status icon while that view is on. Neither icon appears in a battle or at battle-detail zoom. While the new-game overlay is open, weather and tech follow that dialog on every strategic hex of that preview, including on hexes the loaded match has not explored.
````

Replace it with:

````markdown
- The weather icon appears on the strategic map outside a battle and outside battle-detail zoom, while Weather is on, on each world hex that has weather while the weather bonus is on, including a hex with no production label, in either view. An unexplored hex has none. The tech icon is shown on that same band while T is held or the Tech view is chosen, on each world hex whose original urban count can produce units, while the tech bonus is on, including an unexplored hex. A hex with both shows the pair, tech on the left. Neither icon appears in a battle or at battle-detail zoom. While the new-game overlay is open, weather and tech follow that dialog on every strategic hex of that preview, including on hexes the loaded match has not explored.
````

5. In `doc/ux/map-surface.md`, find these lines. Together they occur exactly once:

````markdown
| Held T | Hides terrain fill. Outside battle-detail zoom, shows hex codes, hides the weather icon, and shows the tech icon where it applies | Hides terrain fill |
| Tech view | The same as held T, until the player chooses Weather. No effect while the new-game or game-over overlay is open; Tech applies again when it closes | No effect; the battle keeps its normal view, and Tech applies again after the battle |
````

Replace them with:

````markdown
| Held T | Hides terrain fill. Outside battle-detail zoom, shows hex codes and the tech icon where it applies | Hides terrain fill |
| Tech view | The same as held T, until the player turns Tech off. No effect while the new-game or game-over overlay is open; Tech applies again when it closes | No effect; the battle keeps its normal view, and Tech applies again after the battle |
| Weather | Shows or hides the weather icons, in either view | No effect; a battle shows no weather icons |
````

- [ ] **Step 20: Edit `doc/ux/minimap.md`**

Weather and Tech are toggles.

1. In `doc/ux/minimap.md`, find this line. It occurs exactly once:

````markdown
Show where the main view sits in the loaded map once the player has zoomed in, and let the player choose the map's view and open the terrain legend.
````

Replace it with:

````markdown
Show where the main view sits in the loaded map once the player has zoomed in, and let the player turn the weather icons and the Tech view on and off and open the terrain legend.
````

2. In `doc/ux/minimap.md`, find these lines. Together they occur exactly once:

````markdown
  - Weather: the map's normal view. Chosen when the app opens.
  - Tech: the view that holding T shows, kept on. On the world map, terrain fill is hidden, and each hex shows its code and its tech icon where one applies, as described in [map-surface.md](map-surface.md). A battle, the new-game preview, and the game-over screen keep their normal view; Tech applies again when they close.
  - Control and Production: disabled placeholders with the tip "<name> is not available in this version."
  - Legend: opens or closes the [terrain legend](terrain-legend.md).
- The chosen view, Weather or Tech, and Legend while the legend is open, read as pressed: a lighter tab with a teal mark on its top edge, next to the overview.
````

Replace them with:

````markdown
  - Weather: shows or hides each hex's weather icon on the world map, in either view, as described in [map-surface.md](map-surface.md). On when the app opens.
  - Tech: turns on or off the view that holding T shows. On the world map, terrain fill is hidden, and each hex shows its code and its tech icon where one applies, beside its weather icon while Weather is on, as described in [map-surface.md](map-surface.md). Off when the app opens. A battle, the new-game preview, and the game-over screen keep their normal view; Tech applies again when they close.
  - Control and Production: disabled placeholders with the tip "<name> is not available in this version."
  - Legend: opens or closes the [terrain legend](terrain-legend.md).
- Weather while its icons are on, Tech while its view is on, and Legend while the legend is open, read as pressed: a lighter tab with a teal mark on its top edge, next to the overview.
````

3. In `doc/ux/minimap.md`, find this line. It occurs exactly once:

````markdown
- When the player clicks Weather or Tech, the map switches to that view and the tab reads as pressed. Clicking the view already chosen does nothing.
````

Replace it with:

````markdown
- When the player clicks Weather, the weather icons turn off, or on if they are off, and the tab follows. When the player clicks Tech, the Tech view turns on, or off if it is on, and the tab follows. Neither changes the other.
````

4. In `doc/ux/minimap.md`, find this line. It occurs exactly once:

````markdown
- Holding T shows the Tech view while the key is down, as described in [input-map.md](input-map.md). It does not change the chosen view.
````

Replace it with:

````markdown
- Holding T shows the Tech view while the key is down, as described in [input-map.md](input-map.md). It does not change Weather or Tech.
````

5. In `doc/ux/minimap.md`, find this line. It occurs exactly once:

````markdown
- Weather view or Tech view: chosen with the map-mode tabs. The choice lasts until the app closes, across turns, battles, and new matches. It is not saved.
````

Replace it with:

````markdown
- Weather on or off, and Tech on or off: each set with its own tab. Both last until the app closes, across turns, battles, and new matches. Neither is saved.
````

6. In `doc/ux/minimap.md`, find these lines. Together they occur exactly once:

````markdown
- Exactly one of Weather and Tech reads as pressed.
- Choosing a view never changes the match, the selection, or queued orders.
- Hiding the tabs never changes the chosen view.
````

Replace them with:

````markdown
- Weather reads as pressed exactly while its icons are on, and Tech exactly while its view is on. Either, both, or neither can be pressed.
- Turning Weather or Tech on or off never changes the match, the selection, or queued orders.
- Hiding the tabs never changes Weather or Tech.
````

- [ ] **Step 21: Edit `doc/ux/input-map.md`**

Holding T no longer hides the weather icons.

1. In `doc/ux/input-map.md`, find this line. It occurs exactly once:

````markdown
| Click | Map-mode tabs under the minimap | Weather or Tech chooses the map view. Legend opens or closes the terrain legend. | [minimap.md](minimap.md) |
````

Replace it with:

````markdown
| Click | Map-mode tabs under the minimap | Weather turns the weather icons on or off. Tech turns the Tech view on or off. Legend opens or closes the terrain legend. | [minimap.md](minimap.md) |
````

2. In `doc/ux/input-map.md`, find this text. It occurs exactly once:

````markdown
On the strategic map, outside battle-detail zoom, also shows hex codes, hides the weather icon, and shows the tech icon where [map-surface.md](map-surface.md) says it applies. Restores the fill, removes the codes, and restores the weather icon on release, except on the world map while the Tech view is chosen: holding or releasing T changes nothing there.
````

Replace it with:

````markdown
On the strategic map, outside battle-detail zoom, also shows hex codes and the tech icon where [map-surface.md](map-surface.md) says it applies, beside the weather icon while Weather is on. Restores the fill and removes the codes and the tech icons on release, except on the world map while the Tech view is chosen: holding or releasing T changes nothing there.
````

3. In `doc/ux/input-map.md`, find this text. It occurs exactly once:

````markdown
- Window blur stops keyboard pan, clears the held-Shift flag, and, if T was held, restores terrain fill, removes the hex codes, and restores the weather icon, except on the world map while the Tech view is chosen: that view stays.
````

Replace it with:

````markdown
- Window blur stops keyboard pan, clears the held-Shift flag, and, if T was held, restores terrain fill and removes the hex codes and the tech icons, except on the world map while the Tech view is chosen: that view stays.
````

4. In `doc/ux/input-map.md`, find this text. It occurs exactly once:

````markdown
On the strategic map, outside battle-detail zoom, the hex codes stay up, the weather icon is hidden, and the tech icon is shown when [map-surface.md](map-surface.md) says it applies. Releasing the key restores the fill, removes the codes, and restores the weather icon, except on the world map while the Tech view stays chosen.
````

Replace it with:

````markdown
On the strategic map, outside battle-detail zoom, the hex codes stay up, and the tech icon is shown when [map-surface.md](map-surface.md) says it applies, beside the weather icon while Weather is on. Releasing the key restores the fill and removes the codes and the tech icons, except on the world map while the Tech view stays chosen.
````

- [ ] **Step 22: Edit `doc/ux/new-game-dialog.md`**

The preview keeps its weather icons while T is held, in the information list and in the keyboard section.

1. In `doc/ux/new-game-dialog.md`, find this text. It occurs exactly once:

````markdown
Low and High use the same glyph. Off hides the icons. Holding T hides the weather icons. While T is held and Tech bonus is Low or High, each strategic hex whose original urban count can produce units shows that map's tech icon, Basic or Advanced, on the same band.
````

Replace it with:

````markdown
The Weather tab does not apply to the preview, because the minimap panel is hidden while the overlay is open. Low and High use the same glyph. Off hides the icons. While T is held and Tech bonus is Low or High, each strategic hex whose original urban count can produce units shows that map's tech icon, Basic or Advanced, on the same band, beside the weather icon as in a match.
````

2. In `doc/ux/new-game-dialog.md`, find this text. It occurs exactly once:

````markdown
While this overlay is open, holding T draws the strategic hex grid on the global map, hides the weather icons, and shows that map's tech icons. A regional preview keeps its hex grid. It does not show hex codes or production labels. Releasing T hides the global grid again and leaves the home regions drawn.
````

Replace it with:

````markdown
While this overlay is open, holding T draws the strategic hex grid on the global map and shows that map's tech icons beside the weather icons. A regional preview keeps its hex grid. It does not show hex codes or production labels. Releasing T hides the global grid and the tech icons again and leaves the home regions and the weather icons drawn.
````

- [ ] **Step 23: Edit `doc/ux/control-tooltips.md`**

The Weather and Tech tips.

In `doc/ux/control-tooltips.md`, find these lines. Together they occur exactly once:

````markdown
- Weather map mode: Show the map as usual: terrain, and each hex's weather while the weather bonus is on.
- Tech map mode: Show each hex's code, production, and tech tier instead of terrain on the world map, until you choose Weather. Holding T shows the same view while the key is down.
````

Replace them with:

````markdown
- Weather map mode: Show or hide each hex's weather icon on the world map, while the weather bonus is on.
- Tech map mode: Turn the Tech view on or off: each hex's code, production, and tech tier instead of terrain on the world map. Holding T shows the same view while the key is down.
````

- [ ] **Step 24: Edit `doc/ui-style-guide.md`**

The status-icon and new-game notes.

1. In `doc/ui-style-guide.md`, find this text. It occurs exactly once:

````markdown
- **Strategic status icons (live):** Outside a battle and outside battle-detail zoom, one icon sits above each world hex. Weather shows while the inspection view is off. Choosing Tech, or holding T, replaces it with the tech icon.
````

Replace it with:

````markdown
- **Strategic status icons (live):** Outside a battle and outside battle-detail zoom, status icons sit above each world hex. Weather shows while the Weather tab is on, in either view. Turning Tech on, or holding T, adds the tech icon. One icon is centered; a hex with both shows them side by side, tech on the left, 2 px apart.
````

2. In `doc/ui-style-guide.md`, find this text. It occurs exactly once:

````markdown
Weather icons sit on every strategic hex until that hold, and tech icons replace them while it lasts.
````

Replace it with:

````markdown
Weather icons sit on every strategic hex, and tech icons sit beside them while that hold lasts.
````

- [ ] **Step 25: Edit `doc/region-vs-region.md`**

The preview's icons while T is held.

In `doc/region-vs-region.md`, find this text. It occurs exactly once:

````markdown
Weather icons sit on every strategic hex until that hold, and tech icons replace them while it lasts.
````

Replace it with:

````markdown
Weather icons sit on every strategic hex, and tech icons sit beside them while that hold lasts.
````

- [ ] **Step 26: Edit `doc/how-to-play.md`**

Tech and Weather are toggles.

In `doc/how-to-play.md`, find this line. It occurs exactly once:

````markdown
- **Seeing them:** the flag tooltip lists a unit's bonuses. A hex tooltip shows that hex's weather and terrain effects. Click the toggle on the minimap's lower-left corner to show the Weather, Tech, and Legend buttons under it, then choose **Tech**, or hold T, to see each hex's tech tier.
````

Replace it with:

````markdown
- **Seeing them:** the flag tooltip lists a unit's bonuses. A hex tooltip shows that hex's weather and terrain effects. Click the toggle on the minimap's lower-left corner to show the Weather, Tech, and Legend buttons under it, then turn on **Tech**, or hold T, to see each hex's tech tier. **Weather** turns the weather icons on the map off and on.
````

## Verify

- [ ] **Step 27: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 28: Full tests**

Run the full tests. Expected: exit 0, test total **897**, failure total **0**.

- [ ] **Step 29: Exact match**

This proves that every file this plan creates or edits matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" src/shared/mapViewMode.ts src/shared/mapViewMode.test.ts src/shared/inspectionStatusIconLine.ts src/shared/inspectionStatusIconLine.test.ts src/shared/newGameMapPreviewTypes.ts src/shared/newGameMapPreviewCore.ts src/shared/newGameMapPreviewCore.test.ts src/renderer/map/mapViewModeState.ts src/renderer/gameplay/productionOverlayHelpers.ts src/renderer/map/mapModeTabs.ts src/renderer/rendering/inspectionStatusIcons.ts src/renderer/map/newGameMapPreviewRendering.ts src/renderer/chrome/frameTooltipText.ts static/index.html scripts/ui-smoke/ui-smoke-scenes.cjs scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs scripts/ui-smoke/ui-smoke.cjs doc/ux/map-surface.md doc/ux/minimap.md doc/ux/input-map.md doc/ux/new-game-dialog.md doc/ux/control-tooltips.md doc/ui-style-guide.md doc/region-vs-region.md doc/how-to-play.md
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `src/shared/mapViewMode.ts` | `d1a2cfc20ec53053` |
| `src/shared/mapViewMode.test.ts` | `06aef6af4d2bd8f2` |
| `src/shared/inspectionStatusIconLine.ts` | `c5a663be11b2d80f` |
| `src/shared/inspectionStatusIconLine.test.ts` | `599cfd0ba088e949` |
| `src/shared/newGameMapPreviewTypes.ts` | `06669887bbff35d0` |
| `src/shared/newGameMapPreviewCore.ts` | `21266c6e70b25fbe` |
| `src/shared/newGameMapPreviewCore.test.ts` | `4f762e1bff1813ce` |
| `src/renderer/map/mapViewModeState.ts` | `e26c5c013395d37d` |
| `src/renderer/gameplay/productionOverlayHelpers.ts` | `845b377df816cbab` |
| `src/renderer/map/mapModeTabs.ts` | `21b98b45ef06ac65` |
| `src/renderer/rendering/inspectionStatusIcons.ts` | `23d1c92b93258152` |
| `src/renderer/map/newGameMapPreviewRendering.ts` | `b6fff592b19b4a17` |
| `src/renderer/chrome/frameTooltipText.ts` | `3e88f3dd30b1eccf` |
| `static/index.html` | `6a20d77ceacf9c72` |
| `scripts/ui-smoke/ui-smoke-scenes.cjs` | `d41e9ca04e88b06a` |
| `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs` | `b19743e9c83433da` |
| `scripts/ui-smoke/ui-smoke.cjs` | `b3d8e019b93843ef` |
| `doc/ux/map-surface.md` | `e6a9b7b27fa2bc2e` |
| `doc/ux/minimap.md` | `d182c520664c5887` |
| `doc/ux/input-map.md` | `f1fd83f0d0a65ce4` |
| `doc/ux/new-game-dialog.md` | `9590329f8b0a84d4` |
| `doc/ux/control-tooltips.md` | `ab394d491cedc27f` |
| `doc/ui-style-guide.md` | `6fc6c89577d2de47` |
| `doc/region-vs-region.md` | `9a11ea94c86294f5` |
| `doc/how-to-play.md` | `478895063a5cb3ec` |

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.

- [ ] **Step 30: Smoke run**

```powershell
npm run ui:smoke -- --label weather-and-tech
```

Expected summary line:

```text
ui-smoke weather-and-tech: 575 passed, 0 failed, 0 page errors, 44 screenshots in F:\Projects\Personal\agent-wars-public\.test\ui-smoke\weather-and-tech
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/weather-and-tech/report.json`.

- [ ] **Step 31: Look at the screenshots**

Open each screenshot in `.test/ui-smoke/weather-and-tech/` named below and compare it with the expected image in `.spec/`. The layout, the text, and the controls must match. Two differences are expected: the expected images were made without map tiles, so their basemap is plain grey, and they can show a "map tiles failed to load" toast. The small origin flags beside unit names can also differ from run to run.

- `14-map-tech.png` against [ui-facelift-toggles-3-expected-tech.png](ui-facelift-toggles-3-expected-tech.png): the Tech view with Weather still on: Weather and Tech both pressed. Hexes that can produce units show the tech icon and the weather icon side by side above the hex code; other explored hexes show the weather icon alone, centered.
- `15-map-weather-off.png` against [ui-facelift-toggles-3-expected-weather-off.png](ui-facelift-toggles-3-expected-weather-off.png): the normal view with Weather turned off: neither tab pressed (Weather keeps a thin focus outline from the click), terrain fill back, and no weather icons on any hex.

Describe what you see in your report. If an arrangement differs, stop and report.

## Report

Report, in this order:

1. The final `git status --short`.
2. The test total and failure total from Step 28.
3. The output of the Exact-match check.
4. The smoke summary line, and any `FAIL`, `NOTE`, or `PAGE-ERROR` lines.
5. What you saw in each screenshot from Step 31.
6. Anything you think is wrong in this plan, without having changed it.
7. The `doc/` files you changed. This plan changes exactly the `doc/` files listed under Steps.

Do not commit.

## For the Reviewer

These checks need a person at the app with real data. Run `npm start` after the report is in.

1. With `npm start`, start or reopen a match with the weather and tech bonuses on, and show the tabs. Weather is pressed and Tech is not.
2. Click Tech: terrain fill hides and the hex codes show. Hexes that can produce units show the tech icon on the left and the weather icon on the right; other hexes show their weather icon alone. Weather stays pressed.
3. Click Weather: the weather icons go in this view, and the tech icons are centered. Click Tech: the normal map, with no weather icons. Click Weather: they return.
4. With Tech off, hold T: the same pair as the Tech view. Release: back to the weather icons alone.
5. Open New game…: the preview shows weather icons for the chosen month, even if Weather was off in the match. Hold T with Tech bonus on: the tech icon sits beside the weather icon.
6. In a battle, the tabs still click, and no status icons show.

## Next

This completes the toggles. The release plans 2 and 3 and their shot list, in `.spec/completed/`, now describe these controls; capture the screenshots and run them next.
