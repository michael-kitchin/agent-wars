# Terrain Pipeline

Offline EarthEnv-to-H3 terrain generation for milestone 1.2.

## What this generates

- `data/generated/terrain_res1_base.csv`
  - columns: `h3_index,terrain`
- `data/generated/terrain_res4_exceptions.csv`
  - columns: `h3_index,parent_h3,terrain,parent_terrain`
- `data/generated/terrain_generation_metadata.json`
- QA summaries in `data/generated/qa/`

### Terrain feature metadata (JSON, optional)

Separate entrypoint — per-hex mask and raster-derived means for **all** res-1 and res-4 cells (no terrain label, no res-4 parent filtering):

- `data/generated/terrain_res1_metadata.json`
- `data/generated/terrain_res4_metadata.json`

Res-1 records include water-mask metrics, raster means, and point counts:

- `airport_count_total`
- `airport_count_by_scalerank` (sparse array; includes sentinel `-1` bucket when needed)
- `seaport_count_total`
- `seaport_count_by_scalerank` (sparse array; includes sentinel `-1` bucket when needed)

Res-4 records include all res-1 fields plus urban metrics:

- aggregate: `all_urban`, `intersects_urban`, `urban_edges`
- per-rank: `urban_by_scalerank[]` with `scalerank`, `all_urban`, `intersects_urban`, `urban_edges`

## Prerequisites

1. Python 3.13+
2. Python packages (install once into the **same** environment you use for `python -m scripts.terrain_pipeline...`):

   ```powershell
   python -m pip install -r scripts/terrain_pipeline/requirements.txt
   ```

   If you use a project venv (`.venv`), activate it first, or run  
   `.\.venv\Scripts\python.exe -m pip install -r scripts/terrain_pipeline/requirements.txt`.  
   A missing `h3` (or `rasterio`, etc.) usually means this step was skipped or pip targeted a different Python than your CLI.

3. Local PostgreSQL database `agent_wars_1` reachable on `localhost:5432`.
4. PostgreSQL extensions installed in that DB:
   - `postgis`
   - `h3`
5. Source rasters in `F:\Data` (EarthEnv land-cover classes 1-12 + topography files).
6. **Water + urban + point shapefiles** at `F:\Data\<...>`:
   - water masks: defaults **`ne_10m_ocean.shp`**, **`ne_10m_lakes.shp`**
   - urban polygons: default **`ne_10m_urban_areas.shp`**
   - airports: default **`ne_10m_airports.shp`** (`featurecla == "Airport"`)
   - seaports: default **`ne_10m_ports.shp`** (`featurecla == "Seaport"`)

   Ocean drives res-1 water; lakes are merged with ocean for res-4 water; urban polygons are applied only to res-4 cells that are not fully in water. Airport/seaport points are assigned to exactly one hex per resolution using `h3.latlng_to_cell(...)`. Paths are `InputRasterSet.root` / `InputRasterSet.*_shapefile_name` in `config.py`. Phase 1 validates these files are present and readable. Sidecar files (`.dbf`, `.shx`, `.prj`, …) must accompany each `.shp` where required by the driver.

Phase 1 validation also requires `AGENT_WARS_DB_PASSWORD` (see [Credentials](#credentials)) so it can open a test connection to Postgres.

## Run

Validation only (phase 1):

```powershell
python -m scripts.terrain_pipeline.cli validate --verbose
```

Full pipeline (phases 1-6):

```powershell
python -m scripts.terrain_pipeline.cli run --verbose
```

Debug dry-run with limited res-4 processing:

```powershell
python -m scripts.terrain_pipeline.cli run --max-child-cells 5000 --verbose
```

### Metadata export (separate CLI)

Validation only (same phase-1 gates as classification: DB, rasters, shapefiles):

```powershell
python -m scripts.terrain_pipeline.metadata_cli validate --verbose
```

Full metadata export (validate, then write the two metadata JSON files under `data/generated/`):

```powershell
python -m scripts.terrain_pipeline.metadata_cli run --verbose
```

Debug dry-run with limited res-4 cells:

```powershell
python -m scripts.terrain_pipeline.metadata_cli run --max-child-cells 5000 --verbose
```

### Road/rail side-mask export (separate CLI)

Per-touched-res4 JSON describing which cell sides are used by Natural Earth roads and railroads (for glyphs and pathfinding). Inputs default to `F:/Data/ne_10m_roads.shp` and `F:/Data/ne_10m_railroads.shp`. Output: `data/generated/terrain_res4_road_rail_sides.json` (naming-style envelope: `schema_version`, `resolution`, `generated_at_utc`, `record_count`, `side_ordering_contract`, `inputs`, `records`). Each record has `h3_index`, `road_sides`, and `rail_sides` (equal-length boolean arrays; length 5 or 6). Side index semantics are defined only by the global `side_ordering_contract` string. The Electron renderer draws these segments together with reduced city labels only while **res4 hexes are visible** and the **`t` inspection key is held**; that path is display-only and does not affect gameplay state.

Validation:

```powershell
python -m scripts.terrain_pipeline.road_rail_sides_cli validate
```

Full export (can be long; use `--max-features` for a bounded dry run):

```powershell
python -m scripts.terrain_pipeline.road_rail_sides_cli run --mode fast --verbose
```

Debug dry-run (reads at most N features from **each** of road and rail layers):

```powershell
python -m scripts.terrain_pipeline.road_rail_sides_cli run --max-features 500 --verbose
```

Optional quality/speed mode:

- `--mode fast` (default): uses segment H3 grid-path candidate discovery; tuned for sub-hour full runs.
- `--mode high-fidelity`: uses denser arclength interpolation candidate discovery; slower.

### Optional road/rail vector export (Leaflet display-only)

Display-only road/rail vectors for Leaflet overlays (does not change boolean pathfinding contracts):

```powershell
python -m scripts.terrain_pipeline.road_rail_vectors_cli run --verbose
```

Output: `data/generated/terrain_res4_road_rail_vectors.json` (rows of `{ kind, points }`, where points are WGS84 `[lat, lng]` tuples).

QA (densified line→cell vs thin-buffer polygon overlap): compares the production sampling method to ``line.buffer(buffer_deg)`` + ``h3shape_to_cells_experimental`` overlap. At default constants, **``cells_only_in_buffered`` should be empty** (no res4 cell in the QA corridor is missed by sampling). ``cells_only_in_densified`` may still be non-zero in high latitudes because production adds a **ring-1 H3 expansion** when ``|lat| >= 55°`` while the QA buffer stays a thin strip. Optional CI gate: ``--fail-on-buffer-miss`` exits 2 when any line part has buffered-only cells.

```powershell
python -m scripts.terrain_pipeline.road_rail_sides_cli qa-line-coverage --max-features 2000 --verbose
python -m scripts.terrain_pipeline.road_rail_sides_cli qa-line-coverage --buffer-deg 0.00003 --fail-on-buffer-miss
```

## Classification notes

- Pipeline terrain labels (classification CSV path): `water|coastal|plains|urban|forest|mountain|desert|arctic`
- **Ocean / coastal (shapefiles):** Build the H3 cell polygon (WGS84), then test in **EPSG:3857** using Shapely (same idea as Web Mercator tiles):
  - **Res-1:** dissolved **ocean** shapefile only (reproject to WGS84 if needed).
  - **Res-4:** dissolved **ocean ∪ lakes** union (same predicate rules as ocean-only).
  - Water geometry **`covers`** the cell → **`water`**; **`intersects`** but not **`covers`** → **`coastal`**; no intersection → **interior** biome stack (no other coastal rule).
- **Interior biomes:** area-sampled land-cover means and topography — `arctic` → `forest` → `mountain` → `desert` → `plains` (`ClassifierThresholds` in `config.py`).
- **Urban (res-4 only):** Metadata export records aggregate urban metrics and `urban_by_scalerank` intersection metrics; app/runtime consumers decide whether to render an urban variation from those fields.
- Area sample counts: `area_weighted_samples_per_cell_res1` / `area_weighted_samples_per_cell_res4` on `PipelineConfig`.
- QA / legend ordering (config `precedence`): `water`, `coastal`, `urban`, `arctic`, `forest`, `mountain`, `desert`, `plains`.
- The app maps pipeline kinds to passability: `water`→`water`, `coastal`→`coastal`, other base kinds→`land`.

### PostgreSQL dev reset

If `terrain_gen` is inconsistent with this repo, run `DROP SCHEMA IF EXISTS terrain_gen CASCADE;` then `cli run` (or re-apply `sql/001_stage_schema.sql` before running phases as needed).

## Credentials

Set DB password in environment variable before running (never commit secrets):

```powershell
$env:AGENT_WARS_DB_PASSWORD = "your_password"
```

Override DB user only if not `postgres` (see `DbConfig.user` in `config.py`).

## Renderer overlays (city / transport display)

Pipeline artifacts feed the Electron **main** terrain classification cache and IPC getters; the **renderer** draws res4 city stars, labels, optional Leaflet vector lines, and canvas transport chords using those payloads. Refactors and file-size work for that side of the stack are planned in [`.spec/maintainability-consolidation-execution-plan-v4.md`](../.spec/maintainability-consolidation-execution-plan-v4.md) (incremental consolidation) and [`.spec/file-size-decomposition-plan-v1.md`](../.spec/file-size-decomposition-plan-v1.md) (broader `renderer.ts` / IPC type decomposition). This README stays focused on **offline generation**; use those specs when changing overlay modules or splitting the renderer entry file.

## Troubleshooting

- **Missing extension error**: install `postgis` / `h3` in `agent_wars_1`.
- **Missing raster error**: verify files exist in `F:\Data` with exact names.
- **PROJ / `proj.db` version warnings** (e.g. PostgreSQL PostGIS vs Rasterio): phase 1 forces `PROJ_LIB` to Rasterio’s bundled `proj_data` before opening GeoTIFFs. If you still see conflicts, unset a global `PROJ_LIB` that points at `PostgreSQL\...\share\contrib\postgis...\proj` for the shell that runs the pipeline.
- **Shapefile “not a supported format” from Rasterio**: only `.tif` inputs are opened with Rasterio; the ocean `.shp` is opened with Fiona. If you see this error, update the pipeline (older builds mistakenly passed the shapefile through `rasterio.open`).
- **Performance concerns**: use `--max-child-cells` first to validate setup, then run full.
- **Unexpected terrain distributions**: inspect QA CSVs and metadata threshold values.
