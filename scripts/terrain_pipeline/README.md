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
2. Python packages:
   - `psycopg[binary]`
   - `rasterio`
   - `h3`
   - `shapely`
3. Local PostgreSQL database `agent_wars_1` reachable on `localhost:5432`.
4. PostgreSQL extensions installed in that DB:
   - `postgis`
   - `h3`
5. Source rasters in `F:\Data` (EarthEnv land-cover classes 1-12 + topography files).

## Credentials

Set DB password in environment variable before running:

PowerShell:

```powershell
$env:AGENT_WARS_DB_PASSWORD = "your_password"
```

The pipeline intentionally does not store DB passwords in repository files.

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

- Terrain labels: `ocean|land|forest|mountain|desert|arctic`
- Precedence: `ocean -> arctic -> forest -> mountain -> desert -> land`
- Inland water is treated as `ocean` for gameplay.
- Water and mountain behavior are intentionally liberal to improve feature visibility.

## Troubleshooting

- **Missing extension error**: install `postgis` / `h3` in `agent_wars_1`.
- **Missing raster error**: verify files exist in `F:\Data` with exact names.
- **Performance concerns**: use `--max-child-cells` first to validate setup, then run full.
- **Unexpected terrain distributions**: inspect QA CSVs and metadata threshold values.

