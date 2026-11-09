# Regional economy from packs, side-group balance, urban-share control win, and on-map battle margins

> **For agentic workers:** Implement this plan phase by phase, in order. Finish each phase's verification before starting the next. Do not copy phase titles or numbers into source, comments, configuration, tests, or `doc/`. Do not commit or push. Do not edit `static/renderer.js` by hand; rebuild it with `npm run build:renderer`. Do not edit files under `.spec/completed/`.
>
> **Stop rule.** If a verification step produces a number or a pass/fail result that differs from what this plan says to expect, stop. Do not change thresholds, tolerances, expected values, or side-group membership to make it pass. Write down the command, the expected result, and the actual result, and report back. The only exceptions are differences this plan explicitly allows (for example, side-group shares within ±2.0 percentage points).

## Goal

1. **Battle margins.** Tactical cells outside a regional map stay out of a battle. Today, a margin cell whose strategic hex is not on the loaded map is painted, moved through, and briefed with the enclosing hex's terrain, which is made up.
2. **Economy.** The regional pipeline computes each map's economy from that map's own pack and writes it into `region_manifest.json`. The economy is the unit costs, the build minimums, the Advanced threshold, and the strategic strike size. The app reads it from the manifest, and the hand-copied numbers in `src/shared/regionalRulesCatalog.ts` go away.
3. **Side-group balance.** The pipeline measures each side group's share of production. `regional:check` fails when any group's share of the map's urban cells is outside ±25% of an equal share. The side-group rules change so all 23 maps pass.
4. **Control win.** On regional maps, a side wins by control when it holds enemy home hexes that together contain at least 75% of the enemy home's generated urban cells. The global map keeps today's rule: control every enemy home hex.

## Why

- **Battle margins.** 922 of 5,118 regional land hexes, about 18%, sit next to a strategic hex that is not on the map. A battle in one of them has 14–36% of its 607 cells off the map. Those cells borrow the enclosing hex's terrain kind and have no roads, cities, or origin areas, and the AI briefing shows them as real ground.
- **Economy.** The catalog was copied from a 7 October estimate. That estimate counted Natural Earth urban polygons with scalerank ≤ 5 on pre-tuning footprints. The packs count scalerank ≤ 6 on resolution-5 maps and ≤ 7 on resolution-6 maps, and their footprints changed. Several maps are now priced well off: Northern Europe infantry is 40 in the catalog and should be 25.
- **Side-group balance.** Side groups were balanced on the same old counts. On the real counts, 17 of 23 maps have a group outside ±25% of an equal share. Examples: Cuba holds 8% of the Caribbean's production, and Highveld holds 42% of Southern Africa's.
- **Control win.** Groups balanced on production can be very different sizes: one can be 2 hexes and another more than 100. Requiring every hex makes the large group nearly impossible to defeat. Weighting control by urban cells fixes that without forcing equal sizes.

## Decisions already made (do not revisit)

- **Scope:** the four goals above. The antimeridian (180°) data bug, changes to urban scalerank ceilings, group-size limits, and any change to the global game's rules are out of scope.
- **Off-map margin cells:** left out of the battle, the same way the strategic map ends at its edge. No pack rebuild, and no perimeter terrain is shipped.
- **Where economy numbers live:** an `economy` block in each manifest. `regionalRulesCatalog.ts` keeps only map ids, resolutions, and the control-win constant.
- **Global baseline:** frozen constants in the pipeline (see "Economy method"). They are not recomputed from the global pack.
- **Urban ceiling:** keep the manifest values for `urban_overlay_max`: 6 on resolution-2 maps, 7 on resolution-3 maps.
- **Producing hexes:** only hexes whose manifest role is `land` count, for both the economy and balance. Sea and neutral-border hexes are ignored.
- **Balance tolerance:** each group's share must be at least 0.75 and at most 1.25 times `1 / number_of_groups`. Both ends are inclusive.
- **Control win:** regional maps only, threshold 0.75 (at least 75%). It is measured on generated (baseline) urban counts, which air strikes do not change.
- **Saved games:** regional saves made before this change may stop loading. They must fail with a clear message, not load into a game that cannot be won. A battle snapshot saved mid-battle keeps the cell list it was created with.
- **Side-group membership:** Phase 5 gives it exactly for every map that changes. Do not design your own groups.

## Rules that apply to every phase

These restate the rules in `.cursor/rules`. Follow them for every new or changed line.

- **Reliable, understandable code.** Double-check first-time code. Prefer small pure functions with one job.
- **Logging.**
  - TypeScript main-process code: every new or changed public function logs `logDebug` on entry, every caught exception logs `logError`, and getter-style functions that change nothing log `logTrace`. Use `src/main/logger`.
  - `src/shared/` must not import the main logger. `src/shared/tacticalRanges.ts` documents this. Shared functions in this plan do not log; their callers log at their boundary.
  - Python: `LOGGER.debug` at the start of each public function, `LOGGER.error(..., exc_info=True)` for each caught exception. Only `regional_cli.py` prints.
- **Tests.** Cover the happy paths and the essential failure contracts only. No tests for boilerplate.
- **Orienting comments.** Every new or changed field and non-overriding function gets one: why it exists, when to use it, what to expect, exceptions. TypeScript follows `src/shared/tacticalBattleFootprint.ts`. Python follows the docstrings in `scripts/regional_pipeline/side_group_catalog.py` ("Why this exists / When to use / What to expect / Exceptions").
- **Reuse.** One implementation of the economy method, used by both the economy step and the pack check. One implementation of the control-progress rule, used by both win evaluation and the prompt.
- **Mutability.** TypeScript: `const`, `readonly`, `ReadonlyMap`, `ReadonlySet`. Python: `Final`, frozen dataclasses, tuples for fixed sequences.
- **Size limits.** Files: desirable 600 lines, hard limit 1000. Arguments: desirable 6, hard limit 10. Use a parameter object above that.
- **Naming.** Follow `doc/naming-conventions-contract-v1.md`. CamelCase files and functions under `src/`, PascalCase types. Role suffixes only: `Handler`, `Helpers`, `Guards`, `Adapter`, `Pipeline`, `Core`, `Types`. No `Utils` or `Impl`. Python modules are snake_case, like the existing ones.
- **No commit or push.** No plan identifiers in anything version-controlled.
- **Living docs** are updated in place (final phase). Keep the misspelled file name `doc/devleopment-plan-v3.4.md` as it is.

**Commands:**
- Run pipeline commands from the repository root on the machine that has Natural Earth and the rasters in `F:/Data`.
- Python tests: `npm run regional:test`.
- TypeScript: `npm run build:main`, then the named `node dist/...test.js` files. The renderer: `npm run build:renderer`. The full suite: `npm test`.

**Version control facts:**
- `data/generated/**/*.json` is gitignored. Only the `*.json.zip` files are tracked.
- The pipeline edits the JSON files. `npm run regional:zip` is what makes those edits shippable.
- **Never run `npm run regional:extract`** during this work. It restores JSON from the zips and would undo every manifest change that has not been zipped yet.

---

## Economy method

This is the exact algorithm. Implement it once in Python. Use it for both the economy step and the pack check.

**Inputs for one map:**
- `urban_overlay_max` from the manifest's `scalerank_policy`.
- The manifest's `hexes` array (`h3_index`, `role`, `side_group_id`) and `side_groups` array.
- `res_s` from the manifest.
- Every record in `terrain_res_t_metadata.json`.

**Urban cells per strategic hex:** a tactical record is urban when `is_res4_urban_overlay_row(record, urban_overlay_max)` from `scripts/terrain_pipeline/metadata_classifier.py` returns true. That is the same test as the app's `isTacticalUrbanOverlayHex`. Count urban records per `h3.cell_to_parent(record["h3_index"], res_s)`.

**Producing values:** the urban counts of hexes whose role is `land` and whose count is at least 1, sorted ascending. Call the list `values`. Raise `ValueError` when it has fewer than 5 entries. `producing_hex_count` is `len(values)`. `urban_cell_count` is `sum(values)`. A land hex whose `side_group_id` is missing or is not in `side_groups` raises `ValueError`.

**Frozen global baseline.** These were measured on 7 October 2026 on the global res1/res4 data, with urban scalerank ≤ 5 and 264 producing hexes. Keep them in one constants block with that provenance comment.

| Name | Value |
|---|---|
| Share of producing hexes with ≥ 2 urban cells (armor gate) | 0.894 |
| Share with ≥ 5 (air gate) | 0.621 |
| Share with ≥ 10 (naval gate) | 0.436 |
| Share with ≥ 21 (Advanced threshold) | 0.235 |
| Geometric-mean urban cells of hexes able to build infantry (≥ 1) | 7.75 |
| … armor (≥ 2) | 9.88 |
| … air (≥ 5) | 17.16 |
| … naval (≥ 10) | 25.43 |
| Global infantry cost | 20 |
| Global strategic strike urban cells | 9 |

**Share-matched threshold** for a target share `s`:
- For each integer `t` from 1 through `max(values)` inclusive, compute `share(t) = count(v >= t) / len(values)`.
- Choose the `t` with the smallest `abs(share(t) - s)`.
- On a tie, keep the smaller `t`. Iterate upward and replace the best only when the new difference is strictly smaller.
- `armor_min = threshold(0.894)`, `air_min = threshold(0.621)`, `naval_min = threshold(0.436)`, `advanced_min = threshold(0.235)`.

**Scale.** `geomean(xs) = exp(mean(log(x) for x in xs))`. Every list below is non-empty, because each threshold is at most `max(values)`.
- `ratio_inf = geomean(values) / 7.75`
- `ratio_armor = geomean(v for v in values if v >= armor_min) / 9.88`
- `ratio_air = geomean(v for v in values if v >= air_min) / 17.16`
- `ratio_naval = geomean(v for v in values if v >= naval_min) / 25.43`
- `scale = geomean([ratio_inf, ratio_armor, ratio_air, ratio_naval])`

**Rounding and prices.** Use half-up rounding: `round_half_up(x) = math.floor(x + 0.5)`. Never use the built-in `round`, which rounds halves to even.
- `raw = 20 * scale`
- `infantry = 5 * round_half_up(raw / 5)` when `raw >= 20`, otherwise `max(1, round_half_up(raw))`
- `armor = 2 * infantry`, `naval = 5 * infantry`, `air = 3 * infantry`
- `strike = max(1, round_half_up(9 * scale))`

**Side-group balance:**
- For each group in `side_groups`, in file order, sum the urban counts of `land` hexes whose `side_group_id` is that group.
- `share = group_sum / sum_of_all_group_sums`, `fair = 1 / number_of_groups`, `ratio = share / fair`.
- A group is within tolerance when `0.75 <= ratio <= 1.25`. The map passes when every group does.
- Raise `ValueError` when the total is 0 or there are fewer than 2 groups.

**Golden values for unit tests.** Each input is the `values` list.

| Input | Scale (4 dp) | Infantry / armor / naval / air | Armor / air / naval / Advanced minimums | Strike |
|---|---|---|---|---|
| `[1,1,2,3,5,8,13,21,34,55]` | 0.9668 | 19 / 38 / 95 / 57 | 2 / 4 / 9 / 22 | 9 |
| the 20 even numbers 2–40 | 1.7288 | 35 / 70 / 175 / 105 | 5 / 17 / 23 / 31 | 16 |
| `[1,1,1,1,1]` | 0.0740 | 1 / 2 / 5 / 3 | 1 / 1 / 1 / 1 | 1 |
| `[8]*10` | 0.5917 | 12 / 24 / 60 / 36 | 1 / 1 / 1 / 1 | 5 |

- Threshold ties: `threshold([1,2,3,4], 0.5) == 3`, `threshold([1,1,2,2], 0.75) == 1`, `threshold([1,2,3,4], 0.25) == 4`.
- Rounding: `round_half_up(2.5) == 3`, `round_half_up(3.5) == 4`, and a raw infantry of 22.5 becomes 25.

## Manifest additions (schema 1.2.0)

The economy step sets `"schema_version": "1.2.0"` and writes two top-level keys. Field names are exact.

```json
"economy": {
  "method_version": 1,
  "urban_overlay_max": 7,
  "producing_hex_count": 103,
  "urban_cell_count": 4317,
  "median_urban_cells_per_producing_hex": 23,
  "scale": 2.907,
  "infantry_cost": 60,
  "armor_cost": 120,
  "naval_cost": 300,
  "air_cost": 180,
  "armor_min_urban_cells": 7,
  "air_min_urban_cells": 17,
  "naval_min_urban_cells": 31,
  "advanced_min_urban_cells": 59,
  "strategic_strike_urban_cells": 26
},
"side_group_balance": {
  "tolerance": 0.25,
  "within_tolerance": true,
  "groups": [
    { "id": "northern_france_belgium", "urban_cell_count": 1183, "share": 0.274, "ratio_to_fair_share": 1.096, "within_tolerance": true }
  ]
}
```

- `scale`, `share`, and `ratio_to_fair_share` are stored with half-up to 3 decimals: `round_half_up(x * 1000) / 1000`. Do not use Python's built-in `round`. Prices and pass/fail use the unrounded values.
- `median_urban_cells_per_producing_hex` is `statistics.median(values)` and may end in `.5`.
- `groups` follows the order of the manifest's `side_groups` array.
- **Meaning of 1.2.0:** the economy and balance blocks match the current side groups. The origins step rewrites side groups, so it removes both keys and sets the schema back to 1.1.0.

---

## Phase 1: Leave off-map margin cells out of battles

This phase is code only and independent of the rest. On the global map, nothing changes.

**Edit** `src/shared/loadedStrategicFootprint.ts`:
- Add `let footprintVersion = 0;`, with an orienting comment.
- Increment it on every call to `setLoadedStrategicFootprint`, including calls with `null`.
- Export `loadedStrategicFootprintVersion(): number`. Comment: cache keys include it, so a cache built for one footprint is never reused for another. No logging; this is the shared layer.

**Edit** `src/shared/tacticalBattleFootprint.ts`:
- In `buildTacticalBattleFootprint`:
  - Always keep every core child.
  - Keep a margin cell only when `isOnMap(strategicParentOf(cell))`. Import `isOnMap` from `./loadedStrategicFootprint`.
  - Sort and assign codes after filtering. That keeps codes contiguous.
- Import `activeGameMap` from `./activeGameMap`.
- Change the cache key to `${activeGameMap().id}:${strategicH3Resolution()}:${tacticalH3Resolution()}:${loadedStrategicFootprintVersion()}:${enclosingStrategicH3Index}`.
  - `setActiveGameMap` already clears this cache. The version still matters because `setLoadedStrategicFootprint` can run without a profile change. The renderer (`src/renderer/core/installRendererGameMap.ts`) installs the profile before the footprint; a lookup between those two lines would still see the previous footprint. Nothing in the current profile-reset callbacks does that lookup. The version makes the footprint setter itself invalidate the cache.
- Update the orienting comments:
  - Module header and `h3Indexes`: "A normal hexagon has 607 entries when all six neighboring strategic hexes are on the map. On a regional map's edge, margin cells whose strategic hex is not on the map are left out."
  - `tacticalBattleTerrainKindByCell`: the parent-then-enclosing fallback now only covers an on-map cell with no tactical row. Off-map cells no longer reach it.
- Do not add logging. The module's documented contract says it does not log.

Do not change any other battle code. Pathfinding, drawing, and hit tests read the snapshot's `tacticalChildH3Indexes`. `computeTacticalBattleSnapshot` copies `footprint.h3Indexes` onto that list once, so a new battle inherits the filtered cells.

Two facts to leave alone:
- Drawing and movement keep using the snapshot list. Do not rebuild that list from `tacticalBattleFootprint` on load.
- `initTacticalCoordinateRegistry` (`src/main/briefing/map/hexCoordinates.ts`) rebuilds codes from `tacticalBattleFootprint`, not from the saved list. A new battle's snapshot and its later code lookup match. A battle saved before this change keeps its old cell list and gets codes from the filtered footprint. Leave the registry function alone.

Both processes already use the same strategic hex set. `installRegionalPack` passes every manifest hex. `seedHexesFromTerrainMetadata` inserts `getOrderedHexList()`, which returns that footprint. Fog masks terrain and keeps every hex row. `installRendererGameMap` copies `state.hexes`. `isOnMap` is true for every hex when the footprint is null, so the global 607-cell footprint stays.

**Edit** `src/shared/tacticalBattleTypes.ts`: the `tacticalChildH3Indexes` contract says the list is the enclosing hex's children plus three neighboring rings, and a superset of those children. Say that on a regional map's edge, margin cells whose strategic hex is not on the map are left out, and the list is still a superset of the core children.

**Tests** (`src/shared/tacticalBattleFootprint.test.ts`):
- The existing global assertions stay unchanged (343 core, 607 footprint for `81263ffffffffff`).
- Add, using the resolution-3/6 profile the file already builds (enclosing hex = `strategicCellAt(12, 34)`):
  - Footprint = `[enclosing]` only: `h3Indexes.length === 343`, and the set equals `coreChildH3Indexes`.
  - Footprint = `gridDisk(enclosing, 1)` (enclosing plus six neighbors): `h3Indexes.length === 607`.
  - Footprint = enclosing plus one neighbor: `343 < length < 607`, and every cell's `strategicParentOf` is the enclosing hex or that neighbor.
  - Calling `setLoadedStrategicFootprint` with a different list between two calls returns a different record that matches the new list. This proves the cache key reacts.
- Restore with `setLoadedStrategicFootprint(null)` in a `finally`.

**Docs:** update these to say margin cells off a regional map's edge are not part of the battle:
- `doc/combat-rules-v3.md` §12 (opening paragraph and §12.3).
- `doc/ai-commander-prompts/tactical-prompt.md` (the opening line, "One footprint", and §2.4).
- `doc/game-vision-v2.md` (the two tactical-level paragraphs).
- `doc/ux/map-surface.md` (the two "three neighboring rings" mentions).
- `doc/region-summary-1.md` (line 8).
- `doc/devleopment-plan-v3.4.md`, the battle-size lines (about lines 516 and 538). Keep the file name as it is. Do not copy a phase title into that file.

**Prompt:** in `buildTacticalLatLngPreamble` (`src/main/openRouter/promptText.ts`), change the geography clause to `the enclosing strategic hex's tactical cells plus up to three neighboring rings (cells beyond a regional map's edge are not part of the battle)`. Grep the tests for the old sentence and update every assertion that quotes it. No test file currently quotes it; an empty grep is the expected result.

**Verify:**
1. `npm run build:main`
2. `node dist/shared/tacticalBattleFootprint.test.js`, plus any prompt test you edited.
3. `npm run build:renderer`
4. `npm test`, all green.

---

## Phase 2: Economy calculator (pure Python)

**Create** `scripts/regional_pipeline/regional_economy.py`. It must not open files.

- Frozen dataclass `GlobalEconomyBaseline` with the frozen constants. Export one instance, `GLOBAL_ECONOMY_BASELINE`, with the provenance comment.
- `METHOD_VERSION: Final = 1`, `BALANCE_TOLERANCE: Final = 0.25`, `MIN_PRODUCING_HEXES: Final = 5`.
- `round_half_up(value: float) -> int`.
- `geometric_mean(values: Sequence[float]) -> float`. Raises `ValueError` on an empty list or a value ≤ 0.
- `share_matched_threshold(values: Sequence[int], target_share: float) -> int`.
- Frozen dataclass `RegionalEconomy` with these fields: `producing_hex_count`, `urban_cell_count`, `median_urban_cells_per_producing_hex`, `scale` (unrounded), `infantry_cost`, `armor_cost`, `naval_cost`, `air_cost`, `armor_min_urban_cells`, `air_min_urban_cells`, `naval_min_urban_cells`, `advanced_min_urban_cells`, `strategic_strike_urban_cells`.
- `compute_regional_economy(producing_values: Sequence[int], baseline: GlobalEconomyBaseline = GLOBAL_ECONOMY_BASELINE) -> RegionalEconomy`. Implements "Economy method". Ignores values below 1. Raises `ValueError` when fewer than `MIN_PRODUCING_HEXES` remain.
- Frozen dataclasses:
  - `SideGroupShare`: `group_id`, `urban_cell_count`, `share`, `ratio_to_fair_share`, `within_tolerance`.
  - `SideGroupBalance`: `groups: tuple[SideGroupShare, ...]`, `within_tolerance: bool`.
- `compute_side_group_balance(urban_by_group: Mapping[str, int], group_order: Sequence[str], tolerance: float = BALANCE_TOLERANCE) -> SideGroupBalance`. A group in `group_order` that is missing from the mapping counts as 0. Raises `ValueError` when the total is 0 or `group_order` has fewer than 2 ids.
- `economy_to_json(economy: RegionalEconomy, urban_overlay_max: int) -> dict[str, Any]` and `balance_to_json(balance: SideGroupBalance, tolerance: float) -> dict[str, Any]`. They produce exactly the JSON shapes above.

**Create** `scripts/regional_pipeline/tests/test_regional_economy.py` (unittest):
- The four golden rows. Check scale with `assertAlmostEqual(places=4)` and every integer exactly.
- The three threshold tie cases and the three rounding cases.
- Fewer than 5 producing values raises `ValueError`.
- Balance:
  - `{"a": 30, "b": 30, "c": 40}` with order `["a","b","c"]` passes (ratios 0.9, 0.9, 1.2).
  - `{"a": 20, "b": 40, "c": 40}` fails only `a` (ratios 0.6, 1.2, 1.2).
  - `{"a": 25, "b": 15}` passes, with ratios exactly 1.25 and 0.75 (inclusive bounds).
- `economy_to_json` produces exactly the manifest key set, including `method_version: 1`.

**Verify:** `npm run regional:test`. All tests pass, old and new.

---

## Phase 3: The economy step writes manifests

**Create** `scripts/regional_pipeline/economy_assignment.py` (the I/O around Phase 2):

- `count_urban_cells_by_strategic_hex(tactical_records: Iterable[Mapping[str, Any]], strategic_resolution: int, urban_overlay_max: int) -> dict[str, int]`. Uses `is_res4_urban_overlay_row` and `h3.cell_to_parent`. Omits hexes with 0.
- `measure_region_economy(region_id: str, root: Path = REGIONS_ROOT) -> tuple[RegionalEconomy, SideGroupBalance, dict[str, Any]]`.
  - Reads the manifest JSON and `terrain_res_t_metadata.json` through `RegionPaths.for_region(region_id, root)`.
  - Takes the strategic resolution from the manifest's `res_s`. It does not call `read_manifest`, which also checks the hex list against the catalog.
  - Returns the economy, the balance, and the loaded manifest document.
  - Raises `ValueError` when:
    - the schema is not 1.1.0 or 1.2.0,
    - `side_groups` is missing,
    - the tactical file is missing, or
    - Phase 2 raises.
- `assign_region_economy(region_id: str, root: Path = REGIONS_ROOT) -> tuple[RegionalEconomy, SideGroupBalance]`.
  - Calls `measure_region_economy`.
  - Sets `economy` and `side_group_balance`, and sets `schema_version` to `"1.2.0"`.
  - Writes with `write_json_document` and leaves every other key untouched.
  - Logs one INFO line with the infantry cost and whether balance passed.

**Edit** `scripts/regional_pipeline/region_manifest.py`:
- Add `"1.2.0"` to `ACCEPTED_MANIFEST_SCHEMA_VERSIONS`.
- Add `ECONOMY_MANIFEST_SCHEMA_VERSION: Final = "1.2.0"`.
- Make the error text in `read_manifest` list all three versions.

**Edit** `scripts/regional_pipeline/origin_assignment.py`:
- Add `"1.2.0"` to `_READABLE_SCHEMAS`.
- Before writing, `document.pop("economy", None)` and `document.pop("side_group_balance", None)`. Keep writing schema 1.1.0.
- In the skip-when-finished check, treat 1.1.0 and 1.2.0 as finished.
- In the docstring, say that rewriting side groups clears the economy and balance.
- The readable-schema error string names `1.0.0`, `1.1.0`, and `1.2.0`, the same three versions as `read_manifest`.

**Edit** `scripts/regional_pipeline/regional_cli.py`:
- Add the subcommand `economy`, with `--region REGION_ID` or `--all` (mutually exclusive, required) and an optional `--markdown`.
- For each region, call `assign_region_economy` and print one line:
  `region_id scale=… infantry=… armor=… naval=… air=… mins=a/air/n advanced=… strike=… balance=PASS|FAIL`.
- For each failing group, print an indented line `  FAIL group_id share=…% ratio=…`.
- With `--markdown`, also print two Markdown tables:
  - Economy: map id, infantry, armor, naval, air, minimums, Advanced, strike, scale.
  - Balance: map id, then each group as `display name share% (land hexes)`, using `side_groups[].land_hex_count`.
- Return 0 even when balance fails; `check` is the gate.
- A region that raises is printed as `region_id ERROR message` and logged with `LOGGER.error`. The run continues, and the command returns 1 at the end.

**Edit** `package.json`: add `"regional:economy": "python -m scripts.regional_pipeline.regional_cli economy --all"` next to the other `regional:*` scripts.

**Create** `scripts/regional_pipeline/tests/test_economy_assignment.py`:
- Use a temporary directory and region id `western_europe` with `root=tmp`, so `RegionPaths.for_region("western_europe", tmp)` points there.
- That catalog entry is resolution 3/6. Build real cells with `h3.latlng_to_cell(lat, lng, 3)` and `h3.cell_to_children(cell, 6)`.
- Write a fake manifest with `"schema_version": "1.1.0"`, `"res_s": 3`, `"res_t": 6`, `scalerank_policy` with `urban_overlay_max: 7`, 6 land hexes in 2 groups, and `side_groups`.
- Write a fake tactical metadata file whose records carry `urban_by_scalerank`.
- Assert:
  - Both blocks are written and the schema is 1.2.0.
  - Other keys are unchanged.
  - A second run produces byte-identical output.

**Run:**
1. `npm run regional:test`, all pass.
2. `npm run regional:economy`.

**Verify (binding):** the printed economy for every map equals this table exactly. Side groups do not affect it. The Australia & NZ and Eastern Europe rows include known bad urban cells along the 180° meridian; that is expected for now.

| Map | Urban cells | Producing hexes | Scale | Inf | Armor | Naval | Air | Min armor/air/naval | Advanced | Strike |
|---|---|---|---|---|---|---|---|---|---|---|
| australia_new_zealand | 238 | 39 | 0.480 | 10 | 20 | 50 | 30 | 2/4/5 | 10 | 4 |
| caribbean | 154 | 20 | 0.597 | 12 | 24 | 60 | 36 | 3/5/6 | 12 | 5 |
| central_america | 629 | 79 | 0.571 | 11 | 22 | 55 | 33 | 3/5/7 | 9 | 5 |
| central_asia | 940 | 71 | 0.877 | 18 | 36 | 90 | 54 | 3/5/10 | 15 | 8 |
| eastern_asia | 2807 | 108 | 1.617 | 30 | 60 | 150 | 90 | 3/9/16 | 36 | 15 |
| eastern_europe | 1182 | 106 | 0.833 | 17 | 34 | 85 | 51 | 3/6/10 | 15 | 7 |
| horn_and_great_lakes | 269 | 38 | 0.573 | 11 | 22 | 55 | 33 | 3/6/8 | 10 | 5 |
| libya_egypt_sudan | 525 | 51 | 0.690 | 14 | 28 | 70 | 42 | 2/5/6 | 15 | 6 |
| maghreb | 656 | 52 | 0.960 | 19 | 38 | 95 | 57 | 4/7/10 | 21 | 9 |
| middle_africa_north | 114 | 21 | 0.427 | 9 | 18 | 45 | 27 | 3/4/5 | 8 | 4 |
| middle_africa_south | 162 | 32 | 0.390 | 8 | 16 | 40 | 24 | 2/4/5 | 6 | 4 |
| northern_america | 1783 | 119 | 1.000 | 20 | 40 | 100 | 60 | 2/6/11 | 20 | 9 |
| northern_europe | 1778 | 85 | 1.286 | 25 | 50 | 125 | 75 | 3/7/12 | 26 | 12 |
| south_america | 892 | 135 | 0.488 | 10 | 20 | 50 | 30 | 2/4/6 | 9 | 4 |
| south_eastern_asia | 274 | 43 | 0.427 | 9 | 18 | 45 | 27 | 2/3/5 | 7 | 4 |
| southern_africa | 730 | 58 | 0.846 | 17 | 34 | 85 | 51 | 3/6/9 | 13 | 8 |
| southern_asia_east | 2367 | 180 | 0.976 | 20 | 40 | 100 | 60 | 3/8/11 | 18 | 9 |
| southern_asia_west | 2765 | 113 | 1.727 | 35 | 70 | 175 | 105 | 6/10/19 | 34 | 16 |
| southern_east_africa | 284 | 45 | 0.497 | 10 | 20 | 50 | 30 | 3/4/6 | 9 | 4 |
| southern_europe | 3655 | 114 | 2.087 | 40 | 80 | 200 | 120 | 5/12/19 | 41 | 19 |
| west_africa_coast | 1068 | 90 | 0.783 | 16 | 32 | 80 | 48 | 2/5/9 | 15 | 7 |
| western_asia_north | 1611 | 104 | 1.094 | 20 | 40 | 100 | 60 | 3/8/12 | 20 | 10 |
| western_europe | 4317 | 103 | 2.907 | 60 | 120 | 300 | 180 | 7/17/31 | 59 | 26 |

`balance=FAIL` on 17 maps is expected here. Phase 5 fixes it.

Then run `npm run regional:zip`. The app still works. Its schema test is the string check `schema < '1.1.0'`, which already accepts `1.2.0` and ignores unknown keys. Do not teach the app to reject `1.2.0` in this phase. Phase 6 is what raises the floor.

---

## Phase 4: The pack check enforces economy and balance

**Edit** `scripts/regional_pipeline/pack_checks.py`:

- `_side_group_results` accepts schema 1.1.0 or 1.2.0. Its schema failure text names both.
- Add `_economy_results(paths: RegionPaths, region_id: str, root: Path) -> list[CheckResult]`. Call it from `check_region_pack` right after `_side_group_results`. It runs these checks in order and stops at the first FAIL:
  1. If the schema is not 1.2.0 or `economy` is absent: FAIL `economy missing; run npm run regional:economy`.
  2. Call `measure_region_economy`. Compare the stored `economy` with a fresh `economy_to_json(...)` field for field, after the same 3-decimal half-up. Integers match exactly. A median of `n.5` matches exactly. A difference is FAIL `economy is stale; run npm run regional:economy`.
  3. Compare the stored `side_group_balance` with a fresh `balance_to_json(...)` field for field, after the same 3-decimal half-up on `share` and `ratio_to_fair_share`. A difference is FAIL `side_group_balance is stale; run npm run regional:economy`.
  4. If the fresh balance fails: FAIL `side groups out of balance: <id> <share>% (<ratio>x), …`, listing only the failing groups.
  5. Otherwise, PASS `economy and side-group balance current`.
- Catch `ValueError` from the measurement, log it with `LOGGER.error(..., exc_info=True)`, and return one FAIL with its message.
- This loads the tactical metadata a second time per map. That is acceptable; do not restructure the other checks to share it.

**Tests** (in `test_economy_assignment.py`), on the fake region:
- After `assign_region_economy`: PASS.
- After editing `infantry_cost` in the written file: the stale FAIL.
- With fake urban counts that leave one group at a ratio below 0.75: the balance FAIL.

**Verify:**
1. `npm run regional:test`, all pass.
2. `npm run regional:check`:
   - Every line that passed before this phase still passes.
   - The new economy line PASSes on exactly these 6 maps: `middle_africa_south`, `northern_europe`, `southern_asia_west`, `southern_east_africa`, `western_asia_north`, `western_europe`.
   - It FAILs with "side groups out of balance" on the other 17.
   - No map reports "economy missing" or "stale". A missing or stale economy stops.
   - If a map's balance pass/fail differs from this list, record it and continue. Phase 5's verification is the binding one.

---

## Phase 5: New side-group rules and regenerated groups

**Edit** `scripts/regional_pipeline/side_group_catalog.py`. For each map below, replace its tuple with the code shown. Rules are first-match, so keep the order exactly as written. Within one map, every rule with the same group id must use the same display name. Leave these six maps unchanged: `middle_africa_south`, `northern_europe`, `southern_asia_west`, `southern_east_africa`, `western_asia_north`, `western_europe`.

**Constants and docstring:**
- Replace the module constants `_EAST_CHINA` and `_SOUTH_CHINA` with `_SOUTH_EAST_CHINA = "south_east_china_taiwan"`. Keep `_NORTH_CHINA` and `_KOREA`.
- Update the module docstring: membership is balanced on the packs' urban counts to within ±25% of an equal share, and `regional:check` enforces this.

Every ISO 3166-2 code and Natural Earth region name below has been checked against `ne_10m_admin_1_states_provinces.shp`. `_regions` folds accents and punctuation through `fold_name`, so "Castilla y León" and "Valle d'Aosta" match.

```python
    "eastern_asia": (
        _rule("japan", "Japan", countries=frozenset({"JPN"})),
        _rule(_KOREA, "Korea, Manchuria & Inner Mongolia", countries=frozenset({"PRK", "KOR"})),
        _rule(_KOREA, "Korea, Manchuria & Inner Mongolia", iso_codes=frozenset({"CN-NM"})),
        _rule(_KOREA, "Korea, Manchuria & Inner Mongolia", regions=_regions("CHN", "Northeast China")),
        _rule(_NORTH_CHINA, "North China, the northwest & Mongolia", iso_codes=frozenset({"CN-SD", "CN-HA"})),
        _rule(_NORTH_CHINA, "North China, the northwest & Mongolia", countries=frozenset({"MNG"})),
        _rule(_NORTH_CHINA, "North China, the northwest & Mongolia", regions=_regions("CHN", "North China", "Northwest China")),
        _rule(_SOUTH_EAST_CHINA, "South & east China, Taiwan", countries=frozenset({"TWN", "HKG", "MAC"})),
        _rule(_SOUTH_EAST_CHINA, "South & east China, Taiwan", regions=_regions(
            "CHN", "East China", "South Central China", "Southwest China",
        )),
        _rule(_SOUTH_EAST_CHINA, "South & east China, Taiwan", countries=frozenset({"CHN"}), missing_region=True),
    ),
    "southern_europe": (
        _rule("portugal_western_spain", "Portugal & western Spain", countries=frozenset({"PRT", "GIB"})),
        _rule("portugal_western_spain", "Portugal & western Spain", regions=_regions(
            "ESP", "Galicia", "Asturias", "Cantabria", "Castilla y León", "Extremadura", "Andalucía", "Madrid",
        )),
        _rule("eastern_spain", "Eastern Spain", countries=frozenset({"ESP", "AND"})),
        _rule("northwestern_italy", "Northwestern Italy", regions=_regions(
            "ITA", "Piemonte", "Valle d'Aosta", "Lombardia", "Liguria", "Emilia-Romagna",
        )),
        _rule("venetia_balkans_greece", "Venetia, the Balkans & Greece", regions=_regions(
            "ITA", "Veneto", "Friuli-Venezia Giulia", "Trentino-Alto Adige",
        )),
        _rule("southern_italy", "Southern Italy", regions=_regions(
            "ITA", "Apulia", "Campania", "Sicily", "Calabria", "Basilicata", "Abruzzo", "Molise",
        )),
        _rule("southern_italy", "Southern Italy", countries=frozenset({"MLT"})),
        _rule("central_italy", "Central Italy", regions=_regions(
            "ITA", "Toscana", "Lazio", "Umbria", "Marche", "Sardegna",
        )),
        _rule("central_italy", "Central Italy", countries=frozenset({"SMR", "VAT"})),
        _rule("venetia_balkans_greece", "Venetia, the Balkans & Greece", countries=frozenset({
            "ALB", "BIH", "HRV", "GRC", "KOS", "MKD", "MNE", "SRB", "SVN",
        })),
    ),
    "northern_america": (
        _rule("northeast_quebec_maritimes", "Northeast, Mid-Atlantic, Quebec & Maritimes", iso_codes=frozenset({
            "US-MD", "US-DE", "US-WV", "US-DC",
        })),
        _rule("south_atlantic", "South Atlantic", region_subs=_subs("USA", "South Atlantic")),
        _rule("south_central", "South Central", region_subs=_subs("USA", "West South Central", "East South Central")),
        _rule("great_lakes_ontario", "Great Lakes & Ontario", region_subs=_subs("USA", "East North Central") | _subs("CAN", "Ontario")),
        _rule("northeast_quebec_maritimes", "Northeast, Mid-Atlantic, Quebec & Maritimes", region_subs=_subs(
            "USA", "New England", "Middle Atlantic",
        ) | _subs("CAN", "Quebec", "Atlantic Canada")),
        _rule("mountain_plains_prairies", "Mountain, Plains & Prairies", region_subs=_subs(
            "USA", "Mountain", "West North Central",
        ) | _subs("CAN", "Prairies")),
        _rule("pacific_british_columbia", "Pacific & British Columbia", region_subs=_subs("USA", "Pacific") | _subs("CAN", "British Columbia")),
    ),
    "southern_asia_east": (
        _rule("south_india_sri_lanka", "South India, Chhattisgarh & Sri Lanka", iso_codes=frozenset({"IN-CT"})),
        _rule("north_east_india", "North & East India, Bangladesh, Nepal, Bhutan", iso_codes=frozenset({"IN-UT"})),
        _rule("west_india", "West India", regions=_regions("IND", "West")),
        _rule("central_india", "Central India", regions=_regions("IND", "Central")),
        _rule("south_india_sri_lanka", "South India, Chhattisgarh & Sri Lanka", regions=_regions("IND", "South")),
        _rule("south_india_sri_lanka", "South India, Chhattisgarh & Sri Lanka", countries=frozenset({"LKA"})),
        _rule("north_east_india", "North & East India, Bangladesh, Nepal, Bhutan", regions=_regions(
            "IND", "North", "Northeast", "East",
        )),
        _rule("north_east_india", "North & East India, Bangladesh, Nepal, Bhutan", countries=frozenset({"BGD", "NPL", "BTN", "IND", "KAS"})),
    ),
    "central_asia": (
        _rule("kazakhstan_northern_kyrgyzstan", "Kazakhstan & northern Kyrgyzstan", iso_codes=frozenset({
            "KG-C", "KG-Y", "KG-T", "KG-GB",
        })),
        _rule("kazakhstan_northern_kyrgyzstan", "Kazakhstan & northern Kyrgyzstan", countries=frozenset({"KAZ", "KAB"})),
        _rule("tashkent_ferghana_tajikistan", "Tashkent, Ferghana & Tajikistan", countries=frozenset({"UZB"}), lon_min=67.500001),
        _rule("western_uzbekistan_turkmenistan", "Western Uzbekistan & Turkmenistan", countries=frozenset({"UZB", "TKM"})),
        _rule("tashkent_ferghana_tajikistan", "Tashkent, Ferghana & Tajikistan", countries=frozenset({"KGZ", "TJK"})),
    ),
    "central_america": (
        _rule("nw_mexico", "NW Mexico", iso_codes=frozenset({
            "MX-SON", "MX-BCN", "MX-BCS", "MX-CHH", "MX-SIN", "MX-COA", "MX-DUR", "MX-NAY",
        })),
        _rule("ne_mexico_bajio", "NE Mexico & the Bajio", iso_codes=frozenset({
            "MX-TAM", "MX-NLE", "MX-SLP", "MX-HID", "MX-QUE", "MX-GUA", "MX-ZAC", "MX-AGU",
        })),
        _rule("central_western_mexico", "Central & western Mexico", iso_codes=frozenset({
            "MX-MEX", "MX-DIF", "MX-MOR", "MX-PUE", "MX-TLA", "MX-JAL", "MX-MIC", "MX-COL",
        })),
        _rule("southern_mexico_isthmus", "Southern Mexico & the isthmus", countries=frozenset({
            "MEX", "BLZ", "CRI", "GTM", "HND", "NIC", "PAN", "SLV",
        })),
    ),
    "southern_africa": (
        _rule("gauteng_limpopo", "Gauteng & Limpopo", iso_codes=frozenset({"ZA-GT", "ZA-LP"})),
        _rule("highveld", "Highveld", iso_codes=frozenset({"ZA-FS", "ZA-NW", "ZA-MP"})),
        _rule("east", "East", iso_codes=frozenset({"ZA-NL", "ZA-EC"})),
        _rule("cape_neighbours", "Cape & neighbours", countries=frozenset({"ZAF", "NAM", "BWA", "LSO", "SWZ"})),
    ),
    "maghreb": (
        _rule("morocco", "Morocco", countries=frozenset({"MAR", "SAH"})),
        _rule("tunisia_eastern_algeria", "Tunisia & eastern Algeria", iso_codes=frozenset({
            "DZ-04", "DZ-05", "DZ-07", "DZ-12", "DZ-18", "DZ-19", "DZ-21",
            "DZ-23", "DZ-24", "DZ-25", "DZ-36", "DZ-40", "DZ-41", "DZ-43",
        })),
        _rule("western_central_algeria", "Western & central Algeria", countries=frozenset({"DZA"})),
        _rule("tunisia_eastern_algeria", "Tunisia & eastern Algeria", countries=frozenset({"TUN"})),
    ),
    "west_africa_coast": (
        _rule("western_nigeria", "Western Nigeria", iso_codes=frozenset({
            "NG-LA", "NG-OG", "NG-OY", "NG-OS", "NG-ON", "NG-EK", "NG-ED", "NG-KW",
        })),
        _rule("northern_eastern_nigeria", "Northern & eastern Nigeria", countries=frozenset({"NGA"})),
        _rule("western_ghana_to_senegal", "Western Ghana to Senegal", iso_codes=frozenset({"GH-WP"})),
        _rule("ghana_togo_benin", "Ghana, Togo & Benin", countries=frozenset({"GHA", "TGO", "BEN"})),
        _rule("western_ghana_to_senegal", "Western Ghana to Senegal", countries=frozenset({
            "CIV", "SEN", "SLE", "BFA", "GIN", "GNB", "GMB", "LBR",
        })),
    ),
    "eastern_europe": (
        _rule("central_northwestern_russia", "Central & northwestern Russia", iso_codes=frozenset({
            "RU-VOR", "RU-NIZ", "RU-KIR", "RU-PNZ", "RU-MO", "RU-CU", "RU-ME",
        })),
        _rule("ukraine_belarus_lower_danube", "Ukraine, Belarus, Moldova, Romania & Bulgaria", iso_codes=frozenset({"UA-43", "UA-40"})),
        _rule("volga_russia", "Volga Russia", regions=_regions("RUS", "Volga")),
        _rule("urals_siberia_far_east", "Urals, Siberia & Far East", regions=_regions("RUS", "Urals", "Siberian", "Far Eastern")),
        _rule("central_northwestern_russia", "Central & northwestern Russia", regions=_regions("RUS", "Central", "Northwestern")),
        _rule("ukraine_belarus_lower_danube", "Ukraine, Belarus, Moldova, Romania & Bulgaria", countries=frozenset({
            "UKR", "BLR", "MDA", "ROU", "BGR",
        })),
        _rule("central_europe", "Poland, Czechia, Slovakia & Hungary", countries=frozenset({"POL", "CZE", "SVK", "HUN"})),
    ),
    "south_america": (
        _rule("southeast_brazil", "Southeast Brazil", iso_codes=frozenset({
            "BR-SP", "BR-RJ", "BR-ES", "BR-PR", "BR-SC", "BR-RS",
        })),
        _rule("venezuela_colombia_ecuador_guianas", "Venezuela, Colombia, Ecuador & the Guianas", iso_codes=frozenset({"BR-RR", "BR-AP"})),
        _rule("central_northern_brazil_paraguay", "Central & northern Brazil, Paraguay", countries=frozenset({"BRA", "PRY"})),
        _rule("argentina_uruguay", "Argentina & Uruguay", countries=frozenset({"ARG", "URY", "SPI"})),
        _rule("andes", "Chile, Bolivia & Peru", countries=frozenset({"CHL", "BOL", "PER"})),
        _rule("venezuela_colombia_ecuador_guianas", "Venezuela, Colombia, Ecuador & the Guianas", countries=frozenset({
            "VEN", "COL", "ECU", "GUY", "SUR", "FRA", "BRI",
        })),
    ),
    "south_eastern_asia": (
        _rule("central_thailand", "Central Thailand", regions=_regions("THA", "Central", "Western", "Eastern")),
        _rule("myanmar_northern_thailand_indochina", "Myanmar, northern Thailand & Indochina", regions=_regions(
            "THA", "Northern", "Northeastern",
        )),
        _rule("malaysia_southern_thailand_philippines", "Malaysia, southern Thailand, Brunei & the Philippines", regions=_regions(
            "THA", "Southern",
        )),
        _rule("indonesia_timor", "Indonesia & Timor-Leste", countries=frozenset({"IDN", "TLS"})),
        _rule("malaysia_southern_thailand_philippines", "Malaysia, southern Thailand, Brunei & the Philippines", countries=frozenset({
            "MYS", "SGP", "BRN", "PHL",
        })),
        _rule("myanmar_northern_thailand_indochina", "Myanmar, northern Thailand & Indochina", countries=frozenset({
            "MMR", "KHM", "LAO", "VNM",
        })),
    ),
    "caribbean": (
        _rule("puerto_rico_leeward_islands", "Puerto Rico & the Leeward Islands", countries=frozenset({
            "PRI", "VIR", "VGB", "AIA", "KNA", "ATG", "MSR", "BLM", "MAF", "SXM",
        })),
        _rule("hispaniola", "Hispaniola", countries=frozenset({"DOM", "HTI"})),
        _rule("cuba_jamaica_bahamas", "Cuba, Jamaica & the Bahamas", countries=frozenset({
            "CUB", "JAM", "BHS", "CYM", "TCA", "USG", "SER", "BJN",
        })),
        _rule("southern_antilles_trinidad", "Southern Antilles & Trinidad", countries=frozenset({
            "BRB", "DMA", "GRD", "LCA", "TTO", "VCT", "ABW", "CUW", "FRA", "NLD",
        })),
    ),
    "australia_new_zealand": (
        _rule("tasman", "Tasman (Victoria, Tasmania, NZ)", iso_codes=frozenset({"AU-VIC", "AU-TAS"})),
        _rule("tasman", "Tasman (Victoria, Tasmania, NZ)", countries=frozenset({"NZL"})),
        _rule("new_south_wales_act", "New South Wales & ACT", iso_codes=frozenset({"AU-NSW", "AU-ACT", "AU-X02~"})),
        _rule("north_west_australia", "Queensland, NT, WA & SA", iso_codes=frozenset({"AU-QLD", "AU-WA", "AU-SA", "AU-NT"})),
    ),
    "middle_africa_north": (
        _rule("northern_cameroon_chad", "Northern Cameroon & Chad", iso_codes=frozenset({"CM-EN", "CM-NO", "CM-AD"})),
        _rule("northern_cameroon_chad", "Northern Cameroon & Chad", countries=frozenset({"TCD"})),
        _rule("gulf_of_guinea_coast", "Gabon, Equatorial Guinea & coastal Cameroon", iso_codes=frozenset({"CM-LT", "CM-SU"})),
        _rule("central_western_cameroon", "Central & western Cameroon", countries=frozenset({"CMR"})),
        _rule("gulf_of_guinea_coast", "Gabon, Equatorial Guinea & coastal Cameroon", countries=frozenset({"GAB", "GNQ"})),
        _rule("central_african_republic", "Central African Republic", countries=frozenset({"CAF"})),
    ),
    "horn_and_great_lakes": (
        _rule("red_sea_somali_coast", "Eritrea, Tigray, Djibouti & the Somali lands", iso_codes=frozenset({
            "ET-SO", "ET-AF", "ET-DD", "ET-TI",
        })),
        _rule("ethiopia", "Ethiopia", countries=frozenset({"ETH"})),
        _rule("kenya", "Kenya", countries=frozenset({"KEN"})),
        _rule("great_lakes_south_sudan", "Great Lakes & South Sudan", countries=frozenset({"UGA", "BDI", "RWA", "SDS"})),
        _rule("red_sea_somali_coast", "Eritrea, Tigray, Djibouti & the Somali lands", countries=frozenset({"ERI", "DJI", "SOM", "SOL"})),
    ),
```

`libya_egypt_sudan` changes one value only. Edit it in place: add `"EG-MT"` (Matruh) to the `lower_egypt` ISO set.

Italy deliberately has no catch-all rule. An Italian region that matches nothing raises in the origins step, which is what we want. Spain does have one (`eastern_spain`), so Ceuta, Melilla, the Balearics, and the Canaries resolve if they appear.

**Edit** `scripts/regional_pipeline/tests/test_side_group_catalog.py`:
- Rename `test_china_provinces_without_a_region_split_at_the_tropic` to `test_china_provinces_without_a_region_join_south_east_china`. Both `fujian` and `paracel` now expect `"south_east_china_taiwan"`.
- In the Turkey/Uzbekistan test, the eastern Uzbekistan province now expects `"tashkent_ferghana_tajikistan"`. The western one is unchanged.
- Add: within each map, every rule with the same `group_id` has the same `display_name`.
- Add: on `central_asia`, `_area(adm0_a3="KGZ", country_code="KG", iso_3166_2="KG-C")` resolves to `kazakhstan_northern_kyrgyzstan`, and `iso_3166_2="KG-O"` resolves to `tashkent_ferghana_tajikistan`.

**Run, in order:**
1. `npm run regional:test`, all pass.
2. For each changed map, run `python -m scripts.regional_pipeline.regional_cli origins --region <id> --force`. Each one reads `F:/Data` and can take several minutes. The maps are: `australia_new_zealand caribbean central_america central_asia eastern_asia eastern_europe horn_and_great_lakes libya_egypt_sudan maghreb middle_africa_north northern_america south_america south_eastern_asia southern_africa southern_asia_east southern_europe west_africa_coast`.
3. `python -m scripts.regional_pipeline.regional_cli economy --all --markdown`. Save the output; the final phase uses it.
4. `npm run regional:check`.

**Verify (binding):**
- `regional:check` reports no FAIL on any map.
- The economy lines are identical to the Phase 3 table. Any difference is a bug.
- Each group's share is within ±2.0 percentage points of the table below. These shares were simulated from the packs before the change; small drift comes from how the origins step votes each strategic hex.
  - A share outside ±2.0 points on a map that still passes `check`: record it and continue.
  - Any map that fails `check`: stop.

| Map | Expected shares (%) |
|---|---|
| australia_new_zealand | north_west_australia 39.5, tasman 33.6, new_south_wales_act 26.9 |
| caribbean | puerto_rico_leeward_islands 29.9, southern_antilles_trinidad 29.9, cuba_jamaica_bahamas 20.8, hispaniola 19.5 |
| central_america | central_western_mexico 27.8, southern_mexico_isthmus 26.1, nw_mexico 25.4, ne_mexico_bajio 20.7 |
| central_asia | tashkent_ferghana_tajikistan 37.3, kazakhstan_northern_kyrgyzstan 31.7, western_uzbekistan_turkmenistan 31.0 |
| eastern_asia | japan 27.7, south_east_china_taiwan 25.6, north_northwest_china_mongolia 25.2, korea_manchuria 21.4 |
| eastern_europe | urals_siberia_far_east 22.6, volga_russia 21.9, ukraine_belarus_lower_danube 21.8, central_northwestern_russia 17.4, central_europe 16.2 |
| horn_and_great_lakes | kenya 29.0, ethiopia 25.7, red_sea_somali_coast 24.2, great_lakes_south_sudan 21.2 |
| libya_egypt_sudan | lower_egypt 36.4, upper_egypt_sudan 36.4, libya 27.2 |
| maghreb | morocco 37.8, western_central_algeria 31.2, tunisia_eastern_algeria 30.9 |
| middle_africa_north | northern_cameroon_chad 28.1, central_western_cameroon 25.4, gulf_of_guinea_coast 24.6, central_african_republic 21.9 |
| northern_america | south_central 18.9, northeast_quebec_maritimes 17.8, south_atlantic 17.1, great_lakes_ontario 16.8, mountain_plains_prairies 15.4, pacific_british_columbia 14.0 |
| south_america | argentina_uruguay 23.9, southeast_brazil 21.9, central_northern_brazil_paraguay 19.5, andes 19.2, venezuela_colombia_ecuador_guianas 15.6 |
| south_eastern_asia | central_thailand 28.1, malaysia_southern_thailand_philippines 27.4, indonesia_timor 23.0, myanmar_northern_thailand_indochina 21.5 |
| southern_africa | gauteng_limpopo 29.2, highveld 28.8, cape_neighbours 21.1, east 21.0 |
| southern_asia_east | central_india 29.0, west_india 26.9, north_east_india 22.1, south_india_sri_lanka 21.9 |
| southern_europe | venetia_balkans_greece 19.8, northwestern_italy 18.4, eastern_spain 16.4, portugal_western_spain 15.4, central_italy 15.3, southern_italy 14.7 |
| west_africa_coast | northern_eastern_nigeria 29.1, western_nigeria 27.8, ghana_togo_benin 23.7, western_ghana_to_senegal 19.4 |

Then run `npm run regional:zip`.

---

## Phase 6: The app reads the economy from the manifest

**Edit** `src/main/gameMap/regionManifestRead.ts`:
- Add an exported pure function `compareManifestSchemaVersion(a: string, b: string): number`. It compares dot-separated integers, so `"1.10.0"` > `"1.2.0"`. A component that is not an integer throws. It logs `logTrace`. Replace the string comparison with it.
- A manifest older than 1.2.0 throws `${label}: regional pack is out of date (schema ${schema}); run npm run regional:economy`. Log it with `logError` before throwing. Field-validation throws from `parseEconomy` also log `logError` before throwing.
- Add `readonly rules: GameRules` to `RegionManifest`, parsed from `economy` by a new private `parseEconomy(value: unknown, label: string): GameRules`. Field mapping:

| Manifest field | `GameRules` field |
|---|---|
| `infantry_cost` | `infantryCost` |
| `armor_cost` | `armorCost` |
| `naval_cost` | `navalCost` |
| `air_cost` | `airCost` |
| `armor_min_urban_cells` | `armorMinUrbanCells` |
| `air_min_urban_cells` | `airMinUrbanCells` |
| `naval_min_urban_cells` | `navalMinUrbanCells` |
| `advanced_min_urban_cells` | `advancedMinUrbanCells` |
| `strategic_strike_urban_cells` | `strategicStrikeUrbanCells` |

- Each value must be a positive integer; otherwise throw `${label}: economy.<field> must be a positive integer`.
- Throw when armor ≠ 2 × infantry, naval ≠ 5 × infantry, or air ≠ 3 × infantry, naming the field.
- The app ignores `side_group_balance`.

**Edit** `src/shared/regionalRulesCatalog.ts`:
- Remove `rules` from `RegionalMapRules`, from `regionalMapRules(...)`, and from every row. `REGIONAL_RULES_BY_ID` remains the list of known maps and their resolutions.
- Add `export const REGIONAL_CONTROL_WIN_MIN_URBAN_SHARE = 0.75;` with an orienting comment: "A regional control win needs controlled enemy home hexes holding at least this share of the enemy home's generated urban cells."
- Rewrite the file's comments so none of them still claims to hold economy numbers.
- In `src/shared/gameMapTypes.ts`, rewrite the `GameRules` comments that say the regional catalog holds the numbers. Those numbers come from the manifest's `economy` block.

**Edit** every reader of `REGIONAL_RULES_BY_ID[…].rules`. Find them with `grep -rn "REGIONAL_RULES_BY_ID" src`. The known sites:
- `src/main/gameMap/loadGameMap.ts` `installRegionalPack`: `rules: manifest.rules`.
- `src/main/gameMap/listGameMaps.ts`: costs and `advancedMinUrbanCells` come from `manifest.rules`. Zipped manifests go through the same parser.
- `src/main/gameMap/newGameMapPreview.ts`: replace `catalog.rules.advancedMinUrbanCells` with the manifest's rules. Keep `regionalCatalog` only for resolutions, if it is still needed.

**Edit** `src/main/gameMap/regionPackExtract.ts` (packaged builds). Today `readyUserDataDirectory` reuses a cached extract whenever the marker and files exist. After an update, a player who has already played a regional map would keep the old 1.1.0 manifest and hit the out-of-date error. Fix it:
- When `zipDirectory` has `region_manifest.json.zip`, compare the cached `region_manifest.json` text with `regionManifestTextFromZip(...)`. If they differ, log `logDebug` with the region id and return `null`, so the pack is extracted again.
- `extractRegionPack` already writes into a temp directory, writes `pack.ready` last, and replaces the old folder. Do not change it.
- This catches every manifest change. A data-only change that leaves the manifest identical is a known, older limitation; leave it.

**Tests:**
- `src/shared/regionalRulesCatalog.test.ts`: drop the price assertions; keep the id and resolution assertions.
- `src/main/gameMap/westernEuropePack.test.ts`: build the profile's `rules` from the extracted manifest. Assert infantry 60, Advanced 59, and strike 26 (`strategicUrbanCellsDestroyedPerHit`). Keep the existing skip when the pack is not extracted. Do not import the main-process manifest reader from `src/shared`.
- `src/shared/gameRules.test.ts`: drop the Western Europe price assertions. Keep the check that leaving the regional profile restores global infantry 20, Advanced 21, and strike 9. Use a small inline `GameRules` object for the regional half of that test, with infantry 60 so the restore is visible.
- `src/main/gameMap/newGameMapPreview.test.ts`: compare `advancedMinUrbanCells` with the extracted manifest's `rules`.
- `src/main/gameMap/regionManifestRead.test.ts` (create it if absent):
  - `compareManifestSchemaVersion` orders `1.1.0 < 1.2.0 < 1.10.0`. A non-integer component throws.
  - A 1.1.0 manifest text throws the out-of-date message.
  - A 1.2.0 text whose armor is not 2 × infantry throws.
  - Every extracted manifest under `data/generated/regions` parses, and its infantry cost equals the Phase 3 table. Copy the 23 integers into the test. Skip when nothing is extracted.
- `regionPackExtract` (add to the existing test file, or create one), using `setRegionPackUserDataRootForTests` and temporary directories:
  - A cached pack whose manifest differs from the zip's is extracted again.
  - A cached pack that matches is reused.

**Verify:**
1. `npm run build:main`
2. Run the test files above with `node dist/...test.js`.
3. `npm test`, all green.
4. Start the app and open the new-game dialog:
   - Northern Europe shows costs 25/50/125/75, and its three groups are unchanged.
   - Southern Europe lists the six groups from Phase 5.

---

## Phase 7: Urban-share control win on regional maps

**Edit** `src/shared/gameMapTypes.ts`: add `readonly controlWinMinUrbanShare: number | null;` to `GameMapProfile`. Its comment: `null` means a control win needs every enemy home hex; a number means the controlled enemy home hexes must hold at least that share of the enemy home's generated urban cells.

**Set the field on every profile:**
- `src/shared/activeGameMap.ts`: `GLOBAL_GAME_MAP.controlWinMinUrbanShare = null`.
- `src/main/gameMap/loadGameMap.ts`: regional profiles get `controlWinMinUrbanShare: REGIONAL_CONTROL_WIN_MIN_URBAN_SHARE`.
- Every other `GameMapProfile` literal (mostly test fixtures): add `controlWinMinUrbanShare: null`, unless the fixture is meant to be regional. TypeScript will list them.

**Create** `src/main/gameActions/homeControlProgress.ts`:

```ts
export type HomeControlProgress = {
  readonly heldUrbanCells: number;   // generated urban cells in enemy-home hexes the side controls
  readonly totalUrbanCells: number;  // generated urban cells in the whole enemy home
  readonly neededUrbanCells: number; // cells needed for a share win; 0 when the every-hex rule applies
  readonly controlWinMet: boolean;
};

export function computeHomeControlProgress(args: {
  readonly homeHexes: readonly string[];
  readonly controller: 'human' | 'opponent';
  readonly controlByHex: ReadonlyMap<string, string | null | undefined>;
  readonly baselineUrbanCellsForHex: (h3Index: string) => number;
  readonly minUrbanShare: number | null;
}): HomeControlProgress
```

Apply these rules in order:
1. Empty `homeHexes`: `controlWinMet` is false and every count is 0.
2. Compute `heldUrbanCells` and `totalUrbanCells` from the callback in every case. A hex is held only when `controlByHex.get(hex) === controller`. A missing key is not held.
3. When `minUrbanShare === null` or `totalUrbanCells === 0`: `neededUrbanCells = 0`, and `controlWinMet` is true when every home hex is controlled by `controller`.
4. Otherwise: `neededUrbanCells = Math.ceil(minUrbanShare * totalUrbanCells - 1e-9)` and `controlWinMet = heldUrbanCells >= neededUrbanCells`.

The function changes nothing, so it logs `logTrace` with the counts.

**Create** `src/main/gameActions/homeControlProgress.test.ts`:
- Every-hex rule: all hexes held is met; one hex missing is not.
- Share rule with hexes {A: 60, B: 30, C: 10} and minimum 0.75 (75 needed): A + B (90) is met; A + C (70) is not; B + C (40) is not.
- Share rule with a total of 0 falls back to every hex.
- Exactly at the threshold: {A: 75, B: 25}, minimum 0.75, holding A is met.

**Edit** `src/main/gameActions/regionControlWinner.ts`:
- Keep today's early return when either home list is empty, before urban elimination.
- Build `controlByHex` once.
- One private helper computes both progress values and the share it actually applied:
  - `humanProgress`: controller `human`, home hexes = the AI's home.
  - `opponentProgress`: controller `opponent`, home hexes = the human's home.
  - The profile share is `activeGameMap().controlWinMinUrbanShare`. The baseline callback is `(h) => getStrategicProductionContext({ h3Index: h }).urbanHexCount`.
  - When that share is a number and `isTerrainClassificationCacheLoaded()` is false, log one `logError` and use `null`, which falls back to every hex. That applied value is the effective share.
- `controlWinner` keeps today's exclusivity: `human` when `humanProgress.controlWinMet && !opponentProgress.controlWinMet`, and the mirror for `opponent`.
- The urban-elimination path is unchanged and still uses current counts (`sumUrbanHexCountForHexes`).
- Add both progress values and the effective share to the existing `logDebug` payload.
- Rewrite the file header comment to describe both control rules.
- Export `getRegionHomeControlProgressForPrompt(): { ai: HomeControlProgress; human: HomeControlProgress; controlWinMinUrbanShare: number } | null`. It logs `logTrace`.
  - It returns `null` when the scenario is not region-vs-region, or when the effective share is `null` (the global map, or a regional map whose classification cache is not loaded). The winner still uses the every-hex rule in those cases, and the prompt stays on today's wording.
  - When it returns an object, `controlWinMinUrbanShare` is the number the winner used. `ai` is the AI's progress against the human home; `human` is the human's progress against the AI home.
  - Callers do not read `activeGameMap().controlWinMinUrbanShare` themselves.

**Edit** `src/main/gameActions/regionControlWinner.test.ts`:
- Existing tests use the global profile and must pass unchanged.
- Add one regional case if the classification cache can be installed in a test. If it cannot, say so in your report; `homeControlProgress.test.ts` covers the share path.

**Edit** `src/main/openRouter/scenarioGoals.ts`:
- Add a small function that builds the regional first sentence: `Your goal is to win the game, and to achieve this you must control enemy home region hexes that together hold at least ${pct}% of the enemy home region's original urban cells, or destroy all enemy home region production capacity.` Here `pct = Math.round(share * 100)`.
- `buildWinConditionReminderClause` takes an optional `controlWinMinUrbanShare?: number | null`. When it is a number and the scenario is region-vs-region, use the regional sentence. Otherwise the output is byte-identical to today's.
- Add a builder for the regional control snippet: `Controlling enemy home region hexes that together hold at least ${pct}% of its original urban cells`.
- Change the signature to `buildRegionVsRegionScenarioObjectiveBlock(state, options?: { controlWinMinUrbanShare?: number | null; progress?: { ai: HomeControlProgress; human: HomeControlProgress } | null })`:
  - With a share, line (1) of the win block uses the regional snippet.
  - With `progress`, add these two lines after the win block:
    - `- Enemy home urban cells in hexes you control: ${ai.heldUrbanCells} of ${ai.totalUrbanCells} (you need ${ai.neededUrbanCells}).`
    - `- Your home urban cells in hexes the enemy controls: ${human.heldUrbanCells} of ${human.totalUrbanCells} (they need ${human.neededUrbanCells}).`
  - With no options, the output is byte-identical to today's.

**Edit** `src/main/openRouter/openRouterBuildSystemPrompt.ts`:
- Call `getRegionHomeControlProgressForPrompt()`. Wrap that call in `try/catch`; on error, `logError` and pass `null`.
- Pass that result's `controlWinMinUrbanShare` into the builders. Pass `progress` only when that share is a number. When the helper returns null, or the effective share is null, pass no options, so the objective block and the hex-count lines stay byte-identical. Do not read `activeGameMap().controlWinMinUrbanShare` here.
- When that effective share is a number, after the two existing hex-count lines (`Your home region control` and `Your control of the enemy's home region`), add one sentence: those hex counts are territory, and the control win is the urban-cell share in the scenario objective. When the effective share is null, those two lines stay byte-identical. `openRouterMatrix.test.ts` asserts the exact strings `Your home region control: 2 of 2 hexes (100%)` and `Your control of the enemy's home region: 1 of 2 hexes (50%)` under the global profile.

**Edit** `src/main/openRouter/promptSpec/coachingTextStrategic.ts` (around line 125):
- Take the effective share as a parameter from the caller. Do not read `activeGameMap()` inside this file.
- With a share active, the bullet reads `- Win by controlling enemy home hexes that hold at least ${pct}% of its original urban cells, or by destroying all enemy home region production capacity. Those are the cells that matter.`
- Otherwise keep today's text. `coachingText.test.ts` asserts `/all enemy home region hexes/i` on that path.
- Do not duplicate the percent formatting; reuse the function from `scenarioGoals.ts`.

Keep these constants as the every-hex wording. They stay byte-identical when the effective share is null, because `openRouterMatrix.test.ts` and `scenarioGoals.test.ts` assert them under the global profile:
- `WIN_CONDITION_REMINDER_FIRST_SENTENCE`
- `REGION_VS_REGION_SCENARIO_WIN_CONTROL_SNIPPET`

**Tests:**
- `variantConformance.test.ts` must still pass unchanged.
- Add the new cases to `src/main/openRouter/scenarioGoals.test.ts`:
  - `buildWinConditionReminderClause({ scenarioId: 'region_vs_region', controlWinMinUrbanShare: 0.75 })` contains `at least 75%`.
  - The objective block with `progress` contains both progress lines with the given numbers.
  - The objective block with no options equals today's output.
  - The one-argument reminder for `region_vs_region` still includes `WIN_CONDITION_REMINDER_FIRST_SENTENCE`.

**Verify:**
1. `npm run build:main`
2. Run `homeControlProgress.test.js`, `regionControlWinner.test.js`, and the prompt tests.
3. `npm test`, all green.

---

## Phase 8: Old regional saves fail clearly

**Edit** `src/main/gameDb.ts`:
- Add an exported function `assertStoredSideGroupsExist(): void`, with an orienting comment. It logs `logDebug` on entry. Skip when side groups are not installed (the global map). When the scenario (`loadScenarioState({ getOne: dbGetOne })`) is region-vs-region, each stored home must match an installed group's `id` or `displayName`. Do not call `getScenarioHomeRegionHexes`: a miss there falls through to the global naming cache and can return hexes for a dead group name. On a miss, log `logError` and throw `This saved ${activeGameMap().displayName} game uses side groups that no longer exist. Start a new game.` A group that keeps its display name still loads, and victory uses that group's current hexes.
- Call it from `loadStoredGameMap` right after `ensureGameMapLoaded(id)` succeeds for a regional id.
- The four existing `loadStoredGameMap` call sites already catch and pass the message to `setGameMapLoadError`. Do not add another catch. The existing-file branch of `openGameDatabaseAtPathForTests` does not call `loadStoredGameMap`. The renderer already shows `gameMapLoadError` as a toast.

**Test:**
- Install side groups with `installSideGroupHomes`, call the function with a stubbed scenario reader that returns region-vs-region and human home `"Not A Group"`, and assert the thrown message. Say in the report that the scenario reader is stubbed.
- A stored display name that matches an installed group does not throw.

**Verify:** `npm run build:main`, the new test, then `npm test`.

---

## Phase 9: Docs, packaging, final verification

**Docs** (update in place):
- `doc/region-vs-region.md`, "How you win":
  - Global maps are unchanged.
  - Regional maps: a control win needs your controlled enemy-home hexes to hold at least 75% of the enemy home's generated urban cells. Bombing does not lower that target. The enemy must not symmetrically meet theirs. A home with no generated urban cells falls back to every hex.
  - Mention the two progress lines in the AI prompt.
- `doc/combat-rules-v3.md` §14: the same rule, in one paragraph. Also the roster paragraphs that name `regionalRulesCatalog.ts` (about lines 60 and 62): regional costs, minimums, and strike size come from the loaded map's manifest.
- `doc/README.md`: the regional-columns sentence names the manifest, not `regionalRulesCatalog.ts`.
- `doc/terrain-pipeline.md`: schema 1.2.0 stores the economy, and those numbers live in the manifest.
- `doc/ai-commander-prompts/strategic-prompt.md`: the regional win sentence and the progress lines. The hex-count lines are territory. The urban lines are the regional control-win test. Grep `doc/ai-commander-prompts` for "control all" and "all enemy home", and fix every match that describes regional play.
- `doc/region-summary-1.md`:
  - Under the title, note that the economy and side groups are now generated from the packs and stored in each manifest, that `npm run regional:economy -- --markdown` prints the current tables, and that the manifest is authoritative.
  - Replace Table 2's rows with the economy table from Phase 5, step 3.
  - Replace Table 1's "Side groups" and "Size ratio" columns with that output's balance table.
  - In "Rules these tables assume", the catalog sentence becomes "The pipeline writes these integers into each manifest's `economy` block."
  - Open issue 1: say option (a) was adopted and groups now pass ±25%.
  - Open issue 9: drop the catalog wording.
- `doc/devleopment-plan-v3.4.md`: grep for "regional", "catalog", and "control every". Update only lines that describe regional economy, side groups, or the win rule. Keep the file name as it is.
- `scripts/regional_pipeline/README.md`:
  - The command order: validate → footprint → generate → origins → economy → check → report → zip.
  - The `economy` and `side_group_balance` blocks, schema 1.2.0, and the rule that origins clears them.
  - The frozen global baseline and the ±25% balance rule.
  - "Only the zips are tracked; never run `regional:extract` with unzipped manifest edits."
- `doc/ux/new-game-dialog.md`: if it says prices come from a catalog, say the manifest instead.

**Package and verify:**
1. `npm run regional:test`, all pass.
2. `npm run regional:check`, no FAIL.
3. `npm run regional:zip`.
4. `npm run build:renderer`, then `npm test`, all green.
5. Start the app:
   - A global new game shows costs 20/40/100/60, unchanged.
   - A regional new game on Southern Africa lists "Cape & neighbours", "East", "Gauteng & Limpopo", and "Highveld", with costs 17/34/85/51.
   - Play to the AI's first strategic prompt and confirm the objective block shows the 75% sentence and both progress lines. The prompt-preview logger writes the prompt to `debug-last-strategic-prompt.txt` in the repository root. If that file is not refreshed, find the setting that enables it in `requestOrdersFlowSupport.ts` and say so in your report; do not change the logger.
   - Optional: open a battle on a Central Asia hex at the map's edge and confirm no ground is drawn past the edge.
6. Run `git status`. Expect these to be modified or new:
   - the source and test files named in this plan;
   - `package.json`;
   - the docs above;
   - this plan, if it is tracked;
   - the regional `*.json.zip` files whose JSON changed: 23 `region_manifest.json.zip`, plus `terrain_res_t_origin_units.json.zip` for the 17 regrouped maps.

   `npm run regional:zip` rewrites every present regional JSON archive. Report any other zip whose JSON bytes did not change. Do not hand-edit zips to quiet that. Manifest JSON files do not appear, because they are gitignored. Report anything else that changed.

## Out of scope

- The antimeridian (180°) data bug. The Australia & NZ and Eastern Europe economies and balance will change when it is fixed; rerun `regional:economy` and `regional:check` then.
- Shipping real terrain for battle margins beyond a regional map's edge.
- Changing urban scalerank ceilings.
- Limiting side-group size.
- A UI indicator for win progress.
- Re-tuning the global game's economy or win rule.
- Player settings for the balance tolerance, the control-win share, or the ring count.
- Migrating battle snapshots saved mid-battle. They keep the cell list they were created with.
