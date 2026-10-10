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
5. The files listed under [Source directory](#source-directory). Classification and metadata phase 1 check the EarthEnv rasters plus `ne_10m_ocean.shp`, `ne_10m_lakes.shp`, `ne_10m_urban_areas.shp`, `ne_10m_airports.shp`, and `ne_10m_ports.shp`. Landmass validation checks `ne_10m_geography_regions_polys.shp`. Road and rail validation checks `ne_10m_roads.shp` and `ne_10m_railroads.shp`.

Phase 1 validation also requires `AGENT_WARS_DB_PASSWORD` (see [Credentials](#credentials)) so it can open a test connection to Postgres.

## Source directory

Offline generation reads Natural Earth vectors and EarthEnv rasters from directories outside this repo. Each setting below ships as `F:/Data`. Weather ships as `F:\Data\worldclim`. Point every setting you run at your directory. A setting you leave unchanged still reads its shipped path. Plans in `.spec/completed/` still name `F:/Data`. That was the directory on the machine where those plans were written. Change the settings in this section for a local setup.

Which setting a command reads:

- Classification (`cli`), metadata export, landmass export, and calibration use `InputRasterSet.root` in `scripts/terrain_pipeline/config.py`. Change that field. Those commands have no path flag.
- Road and rail commands (`road_rail_sides_cli`, including `qa-line-coverage`, and `road_rail_vectors_cli`) take `--data-root`. The default string `F:/Data` is set in those two files, separate from `InputRasterSet.root`. Example: `python -m scripts.terrain_pipeline.road_rail_sides_cli run --mode fast --data-root D:\gis`. `npm run terrain:generate` runs metadata, which uses `InputRasterSet.root`, then `terrain:generate:road-rail`, which uses `--data-root`. That script, `terrain:generate:road-rail:high-fidelity`, and `terrain:generate:road-rail-vectors` omit `--data-root`.
- Regional `validate`, `footprint`, `run`, and `origins` take `--data-root` (default `F:/Data` in `scripts/regional_pipeline/regional_cli.py`). See [../regional_pipeline/README.md](../regional_pipeline/README.md).
- Hex naming takes `--data-root` on `python -m scripts.naming_pipeline.generate_hex_naming`. The default is `DEFAULT_DATA_ROOT` in `generate_hex_naming.py`.
- Weather reads `WORLDCLIM_DIR` in `scripts/weather_pipeline/weather_pack.py`. Global weather export and the regional `weather` step both use it, including when regional `--data-root` points elsewhere. The export downloads `wc2.1_10m_tavg_*.tif` and `wc2.1_10m_prec_*.tif` into that folder when those files are absent.

Put the shapefiles and EarthEnv rasters directly in the directory the command reads. Each `.shp` needs the sidecar files the driver requires (`.dbf`, `.shx`, `.prj`, and any others shipped with that layer).

### Files the terrain pipeline reads

Shapefile names for ocean, lakes, urban areas, airports, seaports, and geography regions are fields on `InputRasterSet` in `config.py`. Road and rail names are `RoadRailSidesExporter.road_shapefile_name` and `rail_shapefile_name`. `road_rail_vectors_cli._validate_inputs` repeats those two filenames as literals. Raster names are `InputRasterSet.landcover_by_class` and `InputRasterSet.topo_files`.

Airport and seaport points are assigned with `h3.latlng_to_cell`. Water and urban label rules are under [Classification notes](#classification-notes).

| File | Role |
| --- | --- |
| `ne_10m_ocean.shp` | Res-1 water, and the ocean polygons in the res-4 water mask |
| `ne_10m_lakes.shp` | Merged with the ocean polygons for the res-4 water mask |
| `ne_10m_urban_areas.shp` | Res-4 urban metrics and the classification urban label |
| `ne_10m_airports.shp` | Airport points (`featurecla` `Airport`) |
| `ne_10m_ports.shp` | Seaport points (`featurecla` `Port`) |
| `ne_10m_geography_regions_polys.shp` | Landmass continent and island ids |
| `ne_10m_roads.shp` | Road side masks and display vectors |
| `ne_10m_railroads.shp` | Rail side masks and display vectors |
| `consensus_full_class_1.tif` through `consensus_full_class_12.tif` | EarthEnv consensus land cover, classes 1 through 12; every file is required |
| `tri_5KMmn_GMTEDmd.tif` | EarthEnv topography |
| `tri_5KMma_GMTEDmd.tif` | EarthEnv topography |
| `tri_50KMmn_GMTEDmd.tif` | EarthEnv topography |
| `tri_50KMma_GMTEDmd.tif` | EarthEnv topography |
| `slope_5KMmn_GMTEDmd.tif` | EarthEnv topography |
| `slope_5KMma_GMTEDmd.tif` | EarthEnv topography |
| `slope_50KMmn_GMTEDmd.tif` | EarthEnv topography |
| `slope_50KMma_GMTEDmd.tif` | EarthEnv topography |
| `elevation_5KMmn_GMTEDmn.tif` | EarthEnv topography |
| `elevation_5KMma_GMTEDma.tif` | EarthEnv topography |
| `elevation_50KMmn_GMTEDmn.tif` | EarthEnv topography |
| `elevation_50KMma_GMTEDma.tif` | EarthEnv topography |

### Files regional packs and hex naming also read

Regional and naming commands read these from their `--data-root`. Regional `validate` checks `_REQUIRED_SHAPEFILES` in `regional_cli.py` plus every raster named on `InputRasterSet`. Hex naming reads the admin, populated-places, lakes, and marine layers (`COUNTRIES_SHP`, `STATES_SHP`, `CITIES_SHP`, `LAKES_SHP`, `MARINE_POLYS_SHP` in `generate_hex_naming.py`). Lakes are listed in the terrain table above.

| File | Role |
| --- | --- |
| `ne_10m_admin_0_countries.shp` | Regional members, origins, and hex naming |
| `ne_10m_admin_1_states_provinces.shp` | Admin-1 exclusions, origins, and hex naming |
| `ne_10m_populated_places.shp` | City labels, footprints, and tactical naming |
| `ne_10m_geography_marine_polys.shp` | Sea and ocean names |
| `ne_10m_land.shp` | Regional footprints (landmass index). `regional:validate` does not check this file |

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

### Res-1 land-mass export (strategic land-unit pathfinding)

Per-res-1 hex continent/island membership and water percentage for strategic land-unit movement.

**Polygon source:** `ne_10m_geography_regions_polys.shp` in the [source directory](#source-directory) (`InputRasterSet.geography_regions_shapefile_name`).

- Continent-tier: `FEATURECLA` in `Continent`, `Isthmus` → stored in `continent_ids` using `NE_ID`
- Islands: `FEATURECLA == Island` with area ≥ **2000 km²** → stored in `island_ids` using `NE_ID`

**Water source:** fraction of res4 child hexes classified as terrain `water` from `terrain_res4_metadata.json` (same classifier as UI tooltips).

**Prerequisites:** run metadata export first:

```powershell
python -m scripts.terrain_pipeline.metadata_cli run
```

Output: `data/generated/terrain_res1_landmass.json` (842 records, schema 2.0.0).

Validation:

```powershell
python -m scripts.terrain_pipeline.landmass_cli validate
```

Full export (intersection against all res-1 cells; can take ~10 minutes):

```powershell
python -m scripts.terrain_pipeline.landmass_cli run --verbose
```

Corridor QA after export:

```powershell
python scripts/terrain_pipeline/qa_landmass_corridor.py
```

Or via npm:

```powershell
npm run terrain:generate:landmass
```

QA summary: `data/generated/qa/terrain_res1_landmass_qa.json`.

Archive for git (extracted JSON is gitignored; CI and `npm run build` extract from zip):

```powershell
npm run generated:zip
```

Commit `data/generated/terrain_res1_landmass.json.zip` (not the extracted `.json`).

**Note:** USGS `USGSEsriWCMC_GlobalIslandsv2_*` shapefiles are no longer used by this project.

### Road/rail side-mask export (separate CLI)

Per-touched-res4 JSON describing which cell sides are used by Natural Earth roads and railroads (for glyphs and pathfinding). Inputs are `ne_10m_roads.shp` and `ne_10m_railroads.shp` under `--data-root` (see [Source directory](#source-directory)). Output: `data/generated/terrain_res4_road_rail_sides.json` (naming-style envelope: `schema_version`, `resolution`, `generated_at_utc`, `record_count`, `side_ordering_contract`, `inputs`, `records`). Each record has `h3_index`, `road_sides`, and `rail_sides` (equal-length boolean arrays; length 5 or 6). Side index semantics are defined only by the global `side_ordering_contract` string. The Electron renderer draws these segments together with reduced city labels only while **res4 hexes are visible** and the **`t` inspection key is held**; that path is display-only and does not affect gameplay state.

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

Regional packs, which the app does not load yet, are described in [../regional_pipeline/README.md](../regional_pipeline/README.md).

## Troubleshooting

- **Missing extension error**: install `postgis` / `h3` in `agent_wars_1`.
- **Missing raster error**: verify the [source directory](#source-directory) files exist under the path that command reads, with those exact names.
- **PROJ / `proj.db` version warnings** (e.g. PostgreSQL PostGIS vs Rasterio): phase 1 forces `PROJ_LIB` to Rasterio’s bundled `proj_data` before opening GeoTIFFs. If you still see conflicts, unset a global `PROJ_LIB` that points at `PostgreSQL\...\share\contrib\postgis...\proj` for the shell that runs the pipeline.
- **Shapefile “not a supported format” from Rasterio**: only `.tif` inputs are opened with Rasterio; the ocean `.shp` is opened with Fiona. If you see this error, update the pipeline (older builds mistakenly passed the shapefile through `rasterio.open`).
- **Performance concerns**: use `--max-child-cells` first to validate setup, then run full.
- **Unexpected terrain distributions**: inspect QA CSVs and metadata threshold values.
