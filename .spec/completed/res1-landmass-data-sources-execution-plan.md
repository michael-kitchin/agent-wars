# Res1 Landmass Data Sources — Execution Plan

## Goal

Replace the **data sources** backing `terrain_res1_landmass.json` while keeping **route-finding rules unchanged**:

1. **`water_pct`** — derive from the same res4 terrain classification pipeline that powers res1 tooltip descriptions (not from polygon-gap geometry).
2. **`continent_ids` / `island_ids`** — derive from `F:/Data/ne_10m_geography_regions_polys.shp`, using `FEATURECLA` filters and **`NE_ID`** as the stored id.

No changes to `canLandUnitTraverseEdge`, `landUnitCanOccupyHex`, pathfinding integration, order validation, or the 90% water threshold constant in this work — only regenerated JSON, ETL, loader, docs, and tests.

Supersedes the **data-source** sections of `.spec/completed/res1-landmass-pathfinding-execution-plan.md` (movement rules there remain valid).

---

## Confirmed product decisions

| Topic | Decision |
|-------|----------|
| Polygon source | `ne_10m_geography_regions_polys.shp` under `F:/Data` |
| Continent polygons | `FEATURECLA == "Continent"` **plus** `FEATURECLA == "Isthmus"` (isthmus features use `NE_ID` and populate **`continent_ids`**, not `island_ids`) |
| Island polygons | `FEATURECLA == "Island"` only — exclude `"Island group"`, `"Coast"`, and all other classes |
| Stored polygon id | Shapefile property **`NE_ID`** (e.g. Africa = `1159104365`, Asia = `1159104597`) |
| Island area filter | **1000 km² minimum** — locked (`PipelineConfig.island_min_area_km2 = 1000.0`). Compute area from geometry in an equal-area projection (~173 qualifying islands from 295 raw Island rows). |
| Duplicate `NE_ID` | One logical feature may have multiple polygon rows; dedupe ids in output arrays. |
| `water_pct` meaning | Fraction of res4 child hexes classified as terrain kind **`water`** (after classifier + urban overlay). Range 0–100; same field name and 90% step threshold. |
| Route rules | Unchanged: block step when destination `water_pct >= 90`; allow when shared continent or island id; occupiability requires continent or island id. |

### Why include Isthmus

Panama strategic hex **I8** (`8167bffffffffff`) intersects NE **`Isthmus`** (`CENTRAL AMERICA`, `NE_ID` `1159104347`) but not **`Continent`** polygons. Under Continent-only filtering it would get **empty** `continent_ids` and break isthmus crossing under unchanged rules. Isthmus features are continent-equivalent for membership only.

Verified NE intersection previews (implementer re-check after ETL):

| Hex | Code | Expected NE membership (names) |
|-----|------|--------------------------------|
| Sinai | GK | Africa + Asia |
| Arabia | GT | Asia |
| Levant | FF | Africa + Asia |
| Panama | I8 | Isthmus (→ `continent_ids`) |

---

## Why this change

Investigation showed a mismatch between player-visible terrain and landmass `water_pct` computed as `100 − (USGS polygon coverage)`:

| Hex | Old `water_pct` (polygon gap) | Res4 `water` child % (tooltip source) |
|-----|-------------------------------|---------------------------------------|
| GT | 100% | ~2% |
| FF | 99% | ~10% |
| H6 | 100% | ~11% |
| GK | 34% | ~9% |

Arabian peninsula hexes also had empty `continent_ids` under USGS shapes; NE geography regions assign continent polygons correctly once exported.

---

## Architecture (unchanged runtime)

```
terrain_res1_landmass.json
  → terrainLandMassLoad.ts (cache)
  → landTraversalRes1.ts (predicates — no rule changes)
  → pathfinding / validation / AI / preview
```

Only the JSON generator, loader schema parsing, tests, and docs change materially.

---

## Data contracts

### Output: `terrain_res1_landmass.json`

Bump **`schema_version` to `2.0.0`**.

**Envelope:**

```json
{
  "schema_version": "2.0.0",
  "resolution": 1,
  "generated_at_utc": "...",
  "record_count": 842,
  "polygon_source": {
    "shapefile": "ne_10m_geography_regions_polys.shp",
    "continent_featurecla": ["Continent", "Isthmus"],
    "island_featurecla": "Island",
    "id_property": "NE_ID",
    "island_min_area_km2": 1000.0
  },
  "water_pct_source": {
    "method": "res4_child_water_terrain_fraction",
    "requires": ["terrain_res4_metadata.json"]
  },
  "records": [ ... ]
}
```

- Remove root-level `island_min_area_km2` (relocate under `polygon_source`).
- **`continent_featurecla`** is an array in v2 (Continent + Isthmus).

**Per-record** (unchanged keys):

| Field | Source |
|-------|--------|
| `h3_index` | res1 H3 index |
| `water_pct` | res4 child `water` terrain fraction |
| `continent_ids` | sorted unique `NE_ID`s from Continent **or** Isthmus polygons |
| `island_ids` | sorted unique `NE_ID`s from qualifying Island polygons |

Intersection rule (unchanged): Lambert Azimuthal Equal-Area centered on cell centroid; assign id when intersection area > `INTERSECTION_AREA_EPSILON_M2` (1.0 m²).

Record count remains **842** (all global res1 cells — same as today).

### `water_pct` computation (must match tooltip source)

Tooltip (`terrainTooltipRes1State.ts` → `getRes1TerrainSummary()`):

- For each res4 child (`cellToChildren(h3, 4)`), count terrain kind **`water`**.
- Tooltip may apply **runtime** overrides (rubble, etc.); ETL matches **static pipeline classification** from metadata — document this intentional scope.

**ETL steps:**

1. Load `terrain_res4_metadata.json` into a map by `h3_index`.
2. For each res4 child, derive `water_relation` using **ocean + lakes** mask (same as res4 in `pipeline.py`, not res1 ocean-only).
3. Classify with `classifier.classify_cell()` and `PipelineConfig.thresholds`.
4. Apply **urban overlay** when aggregate urban mask relation ≠ `no_water` (same as `pipeline.py` `_classify_cells_for_resolution` for res4).
5. `water_pct = round(100 * water_child_count / child_count, 4)`.
6. Missing res4 child row → **fail export** with explicit error.

**Do not use** for `water_pct:** polygon-gap fraction, metadata `all_water` alone, or res1 ocean-only mask.

**Parity guard:** add one Python test with fixed metadata rows whose expected kind matches `terrainClassifierFromMetadata.test.ts` cases (water, coastal, desert, urban override).

---

## Phase 1 — Shapefile validation and configuration

**Purpose:** Fail fast; lock input contract.

### Tasks

1. **`config.py`:** add `geography_regions_shapefile_name = "ne_10m_geography_regions_polys.shp"`. Stop referencing USGS shapefiles in landmass code (leave deprecated config fields commented if needed).

2. **`geography_regions.py` (new):**
   - `load_geography_region_features(path, island_min_area_km2) -> tuple[list[RegionFeature], list[RegionFeature]]`
   - Continents list: `FEATURECLA in ("Continent", "Isthmus")`.
   - Islands list: `FEATURECLA == "Island"`, area ≥ 1000 km² (Mollweide or LAEA area).
   - Parse `NE_ID` as `int`; skip invalid rows.
   - Simplify geometry `0.005` tolerance.
   - DEBUG log: continent count (expect **7** Continent + **4** Isthmus = **11** continent-tier features), island count (~**173** at 1000 km²).

3. **`landmass_cli validate`:**
   - Shapefile exists; CRS EPSG:4326.
   - Continent-tier feature count = **11** (7 Continent + 4 Isthmus — assert exact count so shapefile upgrades are caught).
   - Island count ≥ 170 (allow small drift; log actual count).
   - All retained features have valid `NE_ID`.

4. **Tests:** `tests/test_geography_regions.py` (mock fiona features).

### Verification

```bash
python -m scripts.terrain_pipeline.landmass_cli validate
pytest scripts/terrain_pipeline/tests/test_geography_regions.py -q
```

---

## Phase 2 — Polygon membership ETL

**Purpose:** Replace USGS loaders; remove polygon-gap water calculation.

### Tasks

1. Refactor `landmass.py`:
   - Use `geography_regions.py`.
   - `compute_res1_region_membership(...) -> (continent_ids, island_ids)`.
   - Keep LAEA intersection logic unchanged.

2. Remove polygon-gap `water_pct` from membership function (temporary `0.0` until Phase 3).

3. **`build_qa_summary`:** add fixed h3 spot-checks (hard-code indices from strategic naming):

   | Code | h3_index |
   |------|----------|
   | GK | `813e7ffffffffff` |
   | GT | `81533ffffffffff` |
   | FF | `812dbffffffffff` |
   | H6 | `81523ffffffffff` |
   | IG | `81527ffffffffff` |
   | JC | `8152bffffffffff` |
   | JG | `8152fffffffffff` |
   | HZ | `8153bffffffffff` |
   | I8 | `8167bffffffffff` |

4. **Tests:** `tests/test_landmass.py` — synthetic overlap, dual-id, island area exclusion, isthmus → `continent_ids`.

### Verification

```bash
pytest scripts/terrain_pipeline/tests/test_landmass.py -q
```

---

## Phase 3 — Terrain-derived `water_pct`

**Purpose:** Populate `water_pct` from res4 classification.

### Tasks

1. **`res1_water_pct.py` (new):**
   - `classify_res4_hex_from_metadata(row, thresholds, ocean_lakes_ctx, urban_ctx) -> str` — extract shared logic; mirror `pipeline.py` res4 path.
   - `compute_res1_water_pct_from_res4(h3_index, ...) -> float`

2. **`landmass_cli validate`:** require `terrain_res4_metadata.json` exists with `record_count > 0`.

3. Wire into `LandMassExporter.run()`.

4. **Tests:** `tests/test_res1_water_pct.py` + classifier parity case.

5. Corridor water assertions (post-compute, pre-write): GK/GT/FF/H6 all `water_pct < 90`.

### Verification

```bash
pytest scripts/terrain_pipeline/tests/test_res1_water_pct.py -q
python -m scripts.terrain_pipeline.landmass_cli validate
```

---

## Phase 4 — TypeScript loader (schema v2) **before regeneration**

**Purpose:** Accept v2 envelope so regenerated JSON does not break the app/tests.

**Critical ordering:** complete this phase **before** Phase 5 regeneration. `parseRes1LandMassEnvelope` currently hard-rejects non-`1.0.0` schema.

### Tasks

1. **`terrainLandMassLoad.ts`:**
   - `EXPECTED_LANDMASS_SCHEMA_VERSION = '2.0.0'`
   - Parse `polygon_source` / `water_pct_source` (optional metadata; DEBUG log).
   - Accept `island_min_area_km2` from `polygon_source`; tolerate root-level field on v1 only during local transition (remove v1 tolerance once v2 JSON lands).

2. **`Res1LandMassRecord` / `landTraversalRes1.ts`:** no field changes.

3. Optional copy tweak: `LAND_UNIT_ROUTE_STEP_BLOCKED_REASON` → mention "water terrain" not polygon water.

4. **Tests:** extend `terrainLandMassLoad.test.ts`:
   - Inline **v2 minimal fixture** (2 records) — do not depend on bundled file yet.
   - Keep bundled-file count test; it will fail until Phase 5 (skip or mark pending until then).

### Verification

```bash
npm run build
npm run test -- src/main/terrainLandMassLoad.test.ts
```

---

## Phase 5 — Regenerate JSON, QA, and acceptance

### Tasks

1. Run (after res4 metadata exists):

```bash
python -m scripts.terrain_pipeline.metadata_cli run   # if res4 metadata stale
python -m scripts.terrain_pipeline.landmass_cli run --verbose
```

2. Review `data/generated/qa/terrain_res1_landmass_qa.json`:
   - `record_count === 842`
   - Spot-checks populated for corridor + I8
   - I8: non-empty `continent_ids` (Isthmus NE_ID), `water_pct < 90`
   - GK/GT/FF: non-empty `continent_ids`; `water_pct < 90`

3. **Acceptance script (required, not optional):** `scripts/terrain_pipeline/qa_landmass_corridor.py`
   - Print spot-check table.
   - BFS land-mass routes using **existing rule logic** reimplemented in Python (or call Node after build) for:
     - GK → GT (expect path)
     - JC → H6 (expect path)
     - I8 reachable from at least one North American and one South American neighbor (via shared continent id on isthmus)

4. Update bundled `terrain_res1_landmass.json` in working tree (owner reviews before commit per project rule).

5. Re-enable / fix `terrainLandMassLoad.test.ts` bundled count test.

### Verification

```bash
python scripts/terrain_pipeline/qa_landmass_corridor.py
npm run build
npm run test -- src/main/terrainLandMassLoad.test.ts src/shared/landTraversalRes1.test.ts
```

Manual: march preview GK → GT / FF — block reason must not cite 90% water for those desert hexes.

---

## Phase 6 — Update existing tests and fixtures

### Tasks

1. **`landTraversalRes1.test.ts`:** replace USGS-style ids with NE_ID constants:
   - Africa `1159104365`, Asia `1159104597`, North America `1159104607`, South America `1159104361`
   - Add corridor regression using inline records (GK/GT/FF h3 indices above)

2. **`tool1Pathfinding.test.ts`:** update mock landmass maps (NE ids, low `water_pct`).

3. **`gameActionsMultiSelect.test.ts`:** re-verify `findOpenOceanHexPair` still finds adjacent hexes with empty continent **and** island ids after regeneration; adjust seed map if NE coverage eliminates all such pairs.

4. Python tests from Phases 1–3 must pass.

### Verification

```bash
npm run test -- src/shared/landTraversalRes1.test.ts src/main/tools/tool1Pathfinding.test.ts src/main/gameActionsMultiSelect.test.ts
pytest scripts/terrain_pipeline/tests/ -q
```

---

## Phase 7 — Documentation and cleanup

### Tasks

1. Update `scripts/terrain_pipeline/README.md` landmass section (NE shapefile, Isthmus rule, NE_ID, 1000 km², res4 dependency, run order).

2. `landmass.py` module docstring → link this spec.

3. **Remove USGS landmass inputs** (no longer used anywhere in this repo after Phases 1–3):
   - Delete `continents_shapefile_name` and `bigislands_shapefile_name` from `InputRasterSet` in `config.py` (or remove landmass references entirely).
   - Remove `_continents_path` / `_bigislands_path` and USGS loaders from `landmass.py`.
   - Remove USGS paths from `landmass_cli validate` and README prerequisites.
   - Note for operators: `USGSEsriWCMC_GlobalIslandsv2_Continents.shp` and `USGSEsriWCMC_GlobalIslandsv2_BigIslands.shp` under `F:/Data` may be deleted if no other project needs them.

4. After all phases pass, copy this file to `.spec/completed/` (optional archival).

### Verification

No active docs or config reference USGS shapefiles as a landmass source.

---

## Regression risks and mitigations

| Risk | Mitigation |
|------|------------|
| Schema bump breaks app before JSON regen | Phase 4 loader **before** Phase 5 regen |
| Panama I8 loses membership | Include Isthmus in continent-tier filter; assert I8 in QA |
| Classifier drift Python ↔ TS | Shared thresholds in `config.py`; parity unit test |
| `gameActionsMultiSelect` open-ocean pair missing | Re-run test after regen; pick hexes with no NE overlap |
| NE shapefile version drift | Phase 1 asserts continent-tier count = 11 |
| Isthmus mis-filed as island | Only Isthmus/Continent → `continent_ids`; Island → `island_ids` |
| Silent `water_pct: 0` if res4 missing | Fail validate + export |
| ID integer precision | NE_ID fits JS safe integer; store as JSON number |

---

## Explicit non-goals

- Changing 90% threshold, overlap rule, or seaport debark.
- Replacing `landTraversalRes1.ts` predicate logic.
- Including `"Coast"`, `"Island group"`, or other FEATURECLA values (except Isthmus as confirmed).
- Using metadata `all_water` or polygon-gap fraction for `water_pct`.
- Committing or pushing without owner review.

---

## Implementer checklist (code quality / user rules)

- Add orienting comments on all new public functions and fields (TypeScript + Python).
- DEBUG log public export/load paths; ERROR on caught export failures.
- Keep source files under 600 lines; split modules as planned.
- Do not embed phase numbers or plan stage names in code, comments, or config.
- Do not commit generated JSON unless explicitly asked.
- Tests: happy path + essential failures only (missing shapefile, missing res4 row, invalid NE_ID).

---

## Phase dependency diagram

```mermaid
flowchart LR
  P1[Phase 1 NE validate]
  P2[Phase 2 Membership ETL]
  P3[Phase 3 Water pct]
  P4[Phase 4 TS loader v2]
  P5[Phase 5 Regenerate JSON]
  P6[Phase 6 Test updates]
  P7[Phase 7 Docs]

  P1 --> P2 --> P3 --> P4 --> P5 --> P6 --> P7
```

Phases 1–3 are Python-only testable. Phase 4 must precede Phase 5.

---

## Quick reference: files to touch

| Area | Files |
|------|-------|
| Config | `scripts/terrain_pipeline/config.py` |
| NE loader | `scripts/terrain_pipeline/geography_regions.py` (new) |
| Water pct | `scripts/terrain_pipeline/res1_water_pct.py` (new) |
| QA script | `scripts/terrain_pipeline/qa_landmass_corridor.py` (new, required) |
| ETL | `scripts/terrain_pipeline/landmass.py`, `landmass_cli.py` |
| Tests | `test_geography_regions.py`, `test_landmass.py`, `test_res1_water_pct.py` |
| Loader | `src/main/terrainLandMassLoad.ts`, `terrainLandMassLoad.test.ts` |
| Predicates | `src/shared/landTraversalRes1.ts` (error message optional) |
| Tests | `landTraversalRes1.test.ts`, `tool1Pathfinding.test.ts`, `gameActionsMultiSelect.test.ts` |
| Docs | `scripts/terrain_pipeline/README.md` |
