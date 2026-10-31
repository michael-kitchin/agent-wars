# Tactical water under a relabeled coastal hex

> **For agentic workers:** Implement this plan phase by phase. Steps use checkbox (`- [ ]`) syntax. Do not commit or push. Do not copy phase names, or any other plan identifier, into code, comments, configuration, lint text, or `doc/`.

**Goal:** An open-water tactical cell stays water when its strategic parent was stored as coastal. Infantry cannot enter it. The strategic hex itself still paints and plays as coastal.

**Architecture:** The terrain cache already omits a tactical row when a child's classified kind matches its parent, and every reader then uses the parent's stored kind. Seeding stores some water-dominant parents as coastal, so the omitted water children become coastal. The cache will compare each child with the parent's stored kind instead, and write an explicit `water` row when they differ. The strategic-map fill will keep the stored coastal color even though the child majority is then water. A battle already in progress keeps the terrain frozen in its snapshot.

**Tech stack:** TypeScript main process and one shared pure function. Renderer change is one call in `drawTerrainHexes`. Node tests after `npm run build:main`.

## Root cause

`buildSnapshot` in [src/main/terrainClassificationCache.ts](src/main/terrainClassificationCache.ts) writes a tactical override row only when a child's classified kind differs from the parent's classified dominant kind:

```ts
if (childKind !== parentKind || isUrban) {
  tacticalOverrideRows.push({ h3Index, terrainKind: childKind, isUrban });
}
```

`seedHexesFromTerrainMetadata` in [src/main/gameDb/seeding/infrastructureSeeding.ts](src/main/gameDb/seeding/infrastructureSeeding.ts) then stores a water-dominant, land-occupiable hex as `coastal` through `storedStrategicTerrainKind` in [src/shared/landTraversalStrategic.ts](src/shared/landTraversalStrategic.ts). A child with no row takes that stored kind. The readers are `tacticalBattleTerrainKindByCell`, battle placement in `computeTacticalBattleSnapshot`, renderer paint, and the terrain tooltip. Under `8139bffffffffff` the classified counts are water 170, desert 66, mountain 52, plains 25, wetlands 17, coastal 13. The 170 open-water children have no row, so they resolve to coastal, which infantry may enter. Cells that differ from water, including the 13 real coastal cells, already have their own rows and are fine.

The cache is rebuilt from metadata at startup. Existing saves pick up the new rows the next time the app starts. A snapshot already saved under `tactical_battle_snapshot_json_v1` is not rebuilt.

## Global constraints

- Do not commit or push.
- Do not change `storedStrategicTerrainKind`, seeding, `STRATEGIC_LAND_MAX_WATER_PCT`, the classifier, anything under `data/generated/`, `EXPECTED_USER_VERSION`, or the database schema.
- Do not change `tacticalBattlePersistence.ts`, `selectUnitBirthOrigin`, or `getStrategicDominantTerrainKind`. Do not refresh terrain when a saved battle is restored.
- Do not edit historical docs, or anything under `.spec/completed/`.
- Orienting comments on every new or updated function and field: why it exists, when to use it, what it returns, and what it throws. Match the short Purpose / When to use / Expected outcome / Exceptions shape in [src/shared/tacticalBattleFootprint.ts](src/shared/tacticalBattleFootprint.ts). Do not use the "Defines the function shape" template.
- A new or updated public main-process function logs once at debug on entry, with counts rather than the whole collection. A thrown metadata error logs at error before the throw. Getter-style reads log at trace. Use `logDebug`, `logError`, and `logTrace` from [src/main/logger.ts](src/main/logger.ts). Do not log inside `src/shared`.
- Mark locals `const`. Mark fields that are not reassigned `readonly`.
- Tests cover the contract cases named in each phase, not accessors or loop structure. A new test file uses plain `assert` functions called from `main()`, and ends with `console.log('<file>.test: ok')`, as [src/main/terrainTacticalMapOverlay.test.ts](src/main/terrainTacticalMapOverlay.test.ts) does.
- PowerShell does not accept `&&`. Run each command in the verify lists as its own step.
- `npm test` rebuilds better-sqlite3 for Node. After the last test run in phase 5, run `npm run rebuild:native:electron` so the desktop app can start. Do not launch the app.
- After the renderer edit, run `npm run build:renderer`. Do not hand-edit `static/renderer.js`.

## Decisions already made

- The strategic coastal label stays. Land movement, embark, and the strategic briefing keep treating that hex as coastal.
- The comparison that decides a tactical row uses the parent's stored kind (`storedStrategicTerrainKind`), not the classified dominant kind. A child whose classified kind equals that stored kind still has no row. An urban child still gets a row.
- This is the only case that changes: a parent whose classified kind is `water` and whose stored kind is `coastal`. Its open-water children gain a `water` row. Every other parent stores the same kind it classifies as, so its rows stay as they are.
- The strategic hex polygon paints the stored kind when that kind is `coastal`. The tooltip's child-kind percentages keep showing the real mix, including the water share. Tactical zoom and battle paint use the per-cell kind, so open water paints as water there.
- A battle started before this change keeps its frozen terrain. Do not move units that are already standing on those cells.
- New units raised after the change are born on a real land cell. `selectUnitBirthOrigin` already skips `terrainKind === 'water'`. Do not change that function. Existing units keep the birth cell already stored on their row.

## Review focus

- `strategicKindByH3` in the snapshot stays the classified dominant kind. Seeding applies `storedStrategicTerrainKind` itself. Do not store the relabeled kind in that map.
- Land-mass loading moves earlier in `buildSnapshot`. Delete it from the old site. Do not load it twice. Leave `ensureWeatherPackLoaded()` where it is.
- The orphan error message stays `terrain metadata: res4 child ${h3Index} parent ${parentH3} missing from res1 map`. The error log names the new function, not `buildSnapshot`.
- Phase 2 makes a relabeled strategic hex's child majority water. That fill flip is expected until phase 3. Do not "fix" it by dropping the new water rows or by painting children coastal.
- Do not paint the tactical-zoom child loop or `paintBattleFootprintTerrain` with the strategic fill helper. Those paths must show water on an open-water cell.
- The real-data test checks every classified tactical cell, not a sample. On failure, name the first cell id.

## File map

- New: [src/main/terrainTacticalOverrideRows.ts](src/main/terrainTacticalOverrideRows.ts), [src/main/terrainTacticalOverrideRows.test.ts](src/main/terrainTacticalOverrideRows.test.ts)
- Edited: [src/main/terrainClassificationCache.ts](src/main/terrainClassificationCache.ts), [src/shared/landTraversalStrategic.ts](src/shared/landTraversalStrategic.ts), [src/shared/landTraversalStrategic.test.ts](src/shared/landTraversalStrategic.test.ts), [src/renderer/rendering/terrainRendering.ts](src/renderer/rendering/terrainRendering.ts), [doc/combat-rules-v3.md](doc/combat-rules-v3.md), [doc/terrain-pipeline.md](doc/terrain-pipeline.md)

## Phase 1: Pure override-row builder

**Produces:** The row decision, with unit tests. `buildSnapshot` is unchanged, so the game behaves as it does today.

- [x] Add `src/main/terrainTacticalOverrideRows.ts`.
  - `export type TacticalClassifiedCell` with readonly `h3Index`, `parentH3`, `childKind` (`PipelineTerrainKind`), and `isUrban`.
  - `export type TacticalOverrideRow` with readonly `h3Index`, `terrainKind` (`PipelineTerrainKind`), and `isUrban`.
  - `export function buildStoredStrategicKindByH3(strategicKindByH3, landMassByH3): Map<string, PipelineTerrainKind>`. For each entry, return `storedStrategicTerrainKind(kind, landMassByH3.get(h3) ?? null)`. Import that function from `../shared/landTraversalStrategic`. Log once at debug on entry with the input size. Do not log per hex.
  - `export function buildTacticalOverrideRows(cells, storedParentKindByH3): TacticalOverrideRow[]`. Emit a row when `cell.childKind !== storedParentKind || cell.isUrban`. The row's `terrainKind` is `cell.childKind`. When the parent is missing, build `new Error` with the message above, call `logError('terrainTacticalOverrideRows buildTacticalOverrideRows: orphan res4 row', err)`, then throw. Log once at debug on entry with `cellCount`, and once at debug before a normal return with `rowCount`.
  - Each type field and both functions get an orienting comment. The comment on `buildTacticalOverrideRows` says why the stored kind is the comparison: readers fall back to the parent's stored `terrain_kind`, and seeding can relabel a water-dominant hex as coastal.
- [x] Add `src/main/terrainTacticalOverrideRows.test.ts`. H3 strings are map keys only. No H3 library calls.
  - Classified `water`, land-mass `waterPct` 49.5 and one continent id. `buildStoredStrategicKindByH3` yields `coastal`. Then `buildTacticalOverrideRows`: a `water` child has a row with `terrainKind: 'water'`; a `coastal` child has no row; a `desert` child has a row with `terrainKind: 'desert'`.
  - Classified `water`, land-mass with empty continent and island ids. The stored kind is `water`. A `water` child has no row. An urban `water` child has a row with `terrainKind: 'water'` and `isUrban: true`.
  - Classified `plains`, any land-mass record. The stored kind is `plains`. A `plains` child has no row. A `water` child has a row with `terrainKind: 'water'`. This is the case that must stay the same as today.
  - A child whose parent is absent from the stored map throws, and the message contains `missing from res1 map`.
- [x] Verify, as two separate commands: `npm run build:main`, then `node dist/main/terrainTacticalOverrideRows.test.js`. The second command prints `terrainTacticalOverrideRows.test: ok`.

## Phase 2: Use the builder in the terrain cache

**Produces:** Open-water children of a relabeled hex have explicit `water` rows. Battle snapshots started after the change, placement, movement, the tactical briefing, battle paint, tactical-zoom paint, and the tooltip all follow those rows. The strategic hex polygon will paint water until phase 3. That is expected.

- [x] In `buildSnapshot`, move these lines from their current place (after the naming and overlay work) to immediately before the override-row loop:
  - `const landMassEnv = loadTerrainStrategicLandMassBundled();`
  - `const strategicLandMassByH3 = buildStrategicLandMassByH3(landMassEnv);`
  - `const expectedStrategicHexes = strategicEnv.records.map((row) => row.h3_index);`
  - `assertLandMassMatchesHexList(strategicLandMassByH3, expectedStrategicHexes);`

  Delete that block from the old site. Leave `ensureWeatherPackLoaded()` where it is.
- [x] Replace the inline override loop with:

```ts
const storedStrategicKindByH3 = buildStoredStrategicKindByH3(strategicKindByH3, strategicLandMassByH3);
const tacticalOverrideRows = buildTacticalOverrideRows(tacticalClassifiedRows, storedStrategicKindByH3);
```

  Type `tacticalClassifiedRows` as `TacticalClassifiedCell[]`. Keep `strategicKindByH3` classified.
- [x] Add `storedCoastalRelabelCount` to the existing `buildSnapshot: done` debug object. Count entries where the stored kind differs from the classified kind.
- [x] Update the orienting comment on the `tacticalOverrideRows` snapshot field. A row is a cell whose classified kind differs from the parent's stored kind, or any urban cell. A cell with no row reads as the parent's stored `terrain_kind`.
- [x] Add one real-data test to `src/main/terrainTacticalOverrideRows.test.ts`. Follow the skip in `testOverlayIpcGettersShapeAfterCacheLoad`: `clearTerrainClassificationCacheForTests()`, then `ensureTerrainClassificationCacheLoaded()` inside try/catch. On throw, log a skip line and return. Then:
  - `stored` comes from `buildStoredStrategicKindByH3(getTerrainStrategicKindsFromCache(), getStrategicLandMassByH3())`.
  - `rowByH3` comes from `getTacticalTerrainOverridesForRenderer()`.
  - For every row of `getTacticalFeatureRowsForSeeding()`, `(rowByH3.get(cell.h3Index)?.terrainKind ?? stored.get(cell.parentH3Index)) === cell.terrainKind`. The assertion message includes the first failing `h3Index`, the classified kind, the stored parent kind, and the row kind or `missing`.
  - On the default global pack, `stored.get('8139bffffffffff') === 'coastal'` and `rowByH3.get('8439ac1ffffffff')?.terrainKind === 'water'`. If the cache loaded and either id is absent, fail. Do not skip a loaded cache that lacks them.
  - Call `clearTerrainClassificationCacheForTests()` before returning, including on assertion failure (use try/finally).
- [x] Verify. Run `npm run build:main`, then each test file on its own:
  - `node dist/main/terrainTacticalOverrideRows.test.js`
  - `node dist/main/terrainMetadataParity.test.js`
  - `node dist/main/terrainTacticalMapOverlay.test.js`
  - `node dist/main/gameDb.test.js`
  - `node dist/main/tacticalBattle/computeTacticalBattleSnapshotDb.test.js`
  - `node dist/main/freshMatchLoad.test.js`
  - `node dist/main/unitOrigin/unitBirthOrigin.test.js`

  If a test fails because it required an exact override-row count, read that test's contract before editing it. A count of "some rows exist" stays. Do not weaken an assertion that is not about that count. `unitBirthOrigin.test.js` still requires a birth cell inside the unit's hex and a pipeline terrain kind. Do not change `selectUnitBirthOrigin` to make it pass.

## Phase 3: Keep the strategic fill coastal

**Produces:** A relabeled hex's strategic polygon paints coastal. Its open-water children still paint water at tactical zoom and in a battle.

- [x] In [src/shared/landTraversalStrategic.ts](src/shared/landTraversalStrategic.ts), add this function directly after `storedStrategicTerrainKind`. No logging.

```ts
export function strategicMapFillTerrainKind(storedKind: string, childDominantKind: string): string {
  return storedKind === 'coastal' ? 'coastal' : childDominantKind;
}
```

  The comment says seeding can store a water-dominant hex as coastal, so the child majority can be water while the stored kind is coastal, and the strategic polygon follows the stored kind. Any other stored kind already matches the child majority.
- [x] In [src/shared/landTraversalStrategic.test.ts](src/shared/landTraversalStrategic.test.ts), add one test and register it in that file's runner. Stored `coastal` with child majority `water` returns `coastal`. Stored `plains` with child majority `plains` returns `plains`. Stored `water` with child majority `water` returns `water`.
- [x] In `drawTerrainHexes` in [src/renderer/rendering/terrainRendering.ts](src/renderer/rendering/terrainRendering.ts), keep the current parent-kind expression as `const storedKind`. Set `const kind = strategicMapFillTerrainKind(storedKind, deps.getStrategicDominantTerrainKind(hx.h3Index, storedKind))`. Import the helper from the shared module the renderer already uses for shared code. Do not change `getStrategicDominantTerrainKind`, the tactical-zoom child loop, or `paintBattleFootprintTerrain`.
- [x] Verify, each as its own command: `npm run build:main`, `node dist/shared/landTraversalStrategic.test.js`, `npm run check:renderer-types`, `npm run lint`, `npm run build:renderer`. If `check:renderer-types` fails in a file this phase did not edit, stop and report that failure. Do not update the typecheck baseline.

## Phase 4: Living docs

**Produces:** The mechanics and pipeline docs describe the tactical row rule. No new product behavior.

- [x] In [doc/combat-rules-v3.md](doc/combat-rules-v3.md), in the bullet that mentions `storedStrategicTerrainKind` and `STRATEGIC_LAND_MAX_WATER_PCT`, add two sentences after the sentence that says an existing match is not relabeled. The coastal label applies only to the strategic hex. Each tactical cell keeps its classified kind, so an open-water cell under that hex stays water in a battle (`buildTacticalOverrideRows`). A battle already in progress keeps the terrain captured when it started.
- [x] In [doc/terrain-pipeline.md](doc/terrain-pipeline.md), extend the sentence that says a tactical cell's kind can differ from its parent. A row is stored when the cell's kind differs from the parent's stored `terrain_kind`, and for every urban cell. A cell with no row reads as that stored kind.
- [x] Search `doc/` for `tacticalOverrideRows`, `storedStrategicTerrainKind`, and `dominant detail-cell`. Update any other living hit so it matches this behavior. Leave historical docs and `.spec/completed/` unchanged.

## Phase 5: Full verification

**Produces:** The suite is green, the native module is built for Electron again, and the user has a manual check.

- [x] Run `npm test`. It includes lint, `naming:check`, renderer typecheck, the main-process tests, and `notices:check`. No dependency change is expected. If `notices:check` fails, do not edit `THIRD-PARTY-NOTICES.md` unless this work added a dependency, which it must not. The suite stops in `neutralTurn.test.js` on "a loaded neutral ship on open water sails to a coast and unloads". That failure also happens with this change removed. `computeTacticalBattleSnapshotDb.test.js` still fails "defenders occupy fortified core cells and attackers do not" ("contested hex needs two fortifiable core cells"), which also fails on the unchanged tree. Terrain, birth, fresh-match, and `gameDb` tests pass.
- [x] Run `npm run rebuild:native:electron`.
- [x] In the final summary, ask the user to check this by hand. Do not launch the app.
  1. Restart the app.
  2. Start a new battle on a coastal hex that contains open sea, such as `8139bffffffffff` on the Morocco coast. A battle that was already open keeps the old terrain; exit it first.
  3. Offshore cells paint as water. Infantry cannot be ordered onto them. Ships still can.
  4. The tactical briefing map shows `.` on those cells.
  5. `debug.log` lines for `tacticalMarchPlan` show `water` on those cells, not a run of `coastal`.
  6. On the strategic map, that same hex still paints coastal.

## Out of scope

- Refreshing or migrating a persisted in-progress battle.
- Rewriting birth cells already stored on unit rows.
- Changing the strategic coastal relabel, the 85% water cap, embark rules, or seeding.
- Regenerating terrain metadata or changing the Python classifier.
- Forcing the strategic polygon to paint water, or forcing open-water children to paint coastal.
