# Terrain Pipeline

Offline EarthEnv-to-H3 terrain generation for milestone 1.2.

## What this generates

- `data/generated/terrain_res1_base.csv`
  - columns: `h3_index,terrain`
- `data/generated/terrain_res4_exceptions.csv`
  - columns: `h3_index,parent_h3,terrain,parent_terrain`
- `data/generated/terrain_generation_metadata.json`
- QA summaries in `data/generated/qa/`

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
6. **Water shapefiles** at `F:\Data\<ocean_shapefile_name>` and `F:\Data\<lake_shapefile_name>` (defaults **`ne_10m_ocean.shp`** and **`ne_10m_lakes.shp`**). Paths are `InputRasterSet.root` / `InputRasterSet.*_shapefile_name` in `config.py`. Phase 1 validates both files load. Sidecar files (`.dbf`, `.shx`, `.prj`, …) must accompany each `.shp` where required by the driver.

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

## Classification notes

- Pipeline terrain labels: `ocean|coastal|land|forest|mountain|desert|arctic`
- **Ocean / coastal (shapefiles):** Build the H3 cell polygon (WGS84), dissolve ocean and lake shapefiles to geometries (reproject to WGS84 if needed), union them into one water mask, then test in **EPSG:3857** (same idea as Web Mercator tiles) using Shapely:
  - Ocean geometry **`covers`** the cell → **`ocean`**
  - **`intersects`** but not **`covers`** → **`coastal`**
  - No intersection → **interior** biome stack (no other coastal rule).
- **Interior biomes:** area-sampled land-cover means and topography — `arctic` → `forest` → `mountain` → `desert` → `land` (`ClassifierThresholds` in `config.py`).
- Area sample counts: `area_weighted_samples_per_cell_res1` / `area_weighted_samples_per_cell_res4` on `PipelineConfig`.
- QA / legend ordering (config `precedence`): `ocean`, `coastal`, `arctic`, `forest`, `mountain`, `desert`, `land`.
- The app maps pipeline kinds to passability: `ocean`→`water`, `coastal`→`coastal`, other kinds→`land`.

### PostgreSQL dev reset

If `terrain_gen` is inconsistent with this repo, run `DROP SCHEMA IF EXISTS terrain_gen CASCADE;` then `cli run` (or re-apply `sql/001_stage_schema.sql` before running phases as needed).

## Credentials

Set DB password in environment variable before running (never commit secrets):

```powershell
$env:AGENT_WARS_DB_PASSWORD = "your_password"
```

Override DB user only if not `postgres` (see `DbConfig.user` in `config.py`).

## Troubleshooting

- **Missing extension error**: install `postgis` / `h3` in `agent_wars_1`.
- **Missing raster error**: verify files exist in `F:\Data` with exact names.
- **PROJ / `proj.db` version warnings** (e.g. PostgreSQL PostGIS vs Rasterio): phase 1 forces `PROJ_LIB` to Rasterio’s bundled `proj_data` before opening GeoTIFFs. If you still see conflicts, unset a global `PROJ_LIB` that points at `PostgreSQL\...\share\contrib\postgis...\proj` for the shell that runs the pipeline.
- **Shapefile “not a supported format” from Rasterio**: only `.tif` inputs are opened with Rasterio; the ocean `.shp` is opened with Fiona. If you see this error, update the pipeline (older builds mistakenly passed the shapefile through `rasterio.open`).
- **Performance concerns**: use `--max-child-cells` first to validate setup, then run full.
- **Unexpected terrain distributions**: inspect QA CSVs and metadata threshold values.
