# Weather Pipeline

Offline CHELSA weather for every strategic hex. The global command writes the resolution-1 pack. A regional `weather` step calls the same writer for that region's strategic cells.

Combat tags and penalties are in [combat rules §4.9](../../doc/combat-rules-v3.md). The month rule the game uses is `classifyWeatherMonth` in `src/shared/weatherBonusRules.ts`.

## What this generates

- `data/generated/terrain_res1_weather.json`
  - `version`: `1`
  - `records[]`, sorted by `h3Index`: `h3Index`, `months` (twelve objects)
  - each month: `display` (`snow`, `rain`, `heat`, or `mild`) and `countsAsHeat`

The file is compact JSON. The pipeline reads CHELSA V2.1 `tas` and `pr` for 1981-2010 from `CHELSA_DIR`. Month 0 is January because the files are opened as `01` through `12`. The app reads index 0 as January (`monthIndex` in `src/shared/gameCalendar.ts`).

Every hex is the mean of a 20 by 20 pixel box around its centroid. Nodata is ignored. Longitude wraps. A centroid outside the raster, or a window of all nodata, copies the nearest sampled hex within the step radius and is otherwise mild.

`all_water` is not read. The global radius is `GLOBAL_WATER_LAND_STEPS` (2). A region uses `weather_water_land_steps_for`: 2 at resolution 1, 5 at resolution 2, 14 at resolution 3. The copied hex comes from that same pack.

Extracted JSON under `data/generated/` is gitignored. `terrain_res1_weather.json` is listed in `scripts/generated-data-manifest.cjs`. `npm run generated:zip` with no filename refreshes every present file in that list, and skips names that are not extracted. A filename argument archives only that file.

A regional pack writes `data/generated/regions/<region_id>/terrain_res_s_weather.json`. That file is in the regional archive (`npm run regional:zip`), not in `generated-data-manifest.cjs`. The pack layout is in [../regional_pipeline/README.md](../regional_pipeline/README.md).

## Classification

A month is classified in `classify_month` (`weather_pack.py`), which matches the TypeScript thresholds:

| Check | Python | TypeScript | Result |
| --- | --- | --- | --- |
| Mean at or below 0°C | `SNOW_MEAN_C` | `WEATHER_SNOW_MEAN_C` | `snow`, `countsAsHeat` false |
| Otherwise, precipitation at or above 120 mm | `RAIN_MM` | `WEATHER_RAIN_PRECIP_MM` | `rain`; `countsAsHeat` when the mean is also at or above 23°C |
| Otherwise, mean at or above 23°C | `HEAT_MEAN_C` | `WEATHER_HEAT_MEAN_C` | `heat` |
| Otherwise | falls through | falls through | `mild` |

Each record needs `h3_index`.

## Prerequisites

1. The same Python environment as the terrain pipeline (Python 3.13+). Weather needs `rasterio` and `h3` from:

   ```powershell
   python -m pip install -r scripts/terrain_pipeline/requirements.txt
   ```

   Weather does not open PostgreSQL.

2. Strategic metadata that includes `h3_index`. The global default is `data/generated/terrain_res1_metadata.json`. `npm run generated:extract` writes that file from the tracked zip. Run `python -m scripts.terrain_pipeline.metadata_cli run` only when the metadata itself should change. See [../terrain_pipeline/README.md](../terrain_pipeline/README.md).

3. CHELSA V2.1 1981-2010 monthly temperature and precipitation GeoTIFFs under `CHELSA_DIR`. There is no download. Terms for that data are in `THIRD-PARTY-NOTICES.md`.

## Source directory

`CHELSA_DIR` in `chelsa_source.py` is `F:\Data\chelsea`. There is no path flag. Global export and the regional `weather` step both read that constant, including when regional `--data-root` points somewhere else.

Temperature files are `tas/1981-2010/CHELSA_tas_01_1981-2010_V.2.1.tif` through month `12`. Precipitation uses the same layout under `pr`. A missing file raises `RuntimeError` and lists the missing paths. A file that is not the expected scale, offset, nodata, dtype, or variable tag raises `RuntimeError` naming that file.

The shared Natural Earth and EarthEnv layout is in [../terrain_pipeline/README.md](../terrain_pipeline/README.md#source-directory).

## Run

After the metadata JSON is on disk. The default paths are `METADATA_PATH` and `OUTPUT_JSON` in `generate_res1_weather.py`, both under the repository root, so the current directory does not matter:

```powershell
python -m scripts.weather_pipeline.generate_res1_weather --verbose
```

`--metadata` and `--output` are paths from the current directory when they are not absolute. Example, from the repository root:

```powershell
python -m scripts.weather_pipeline.generate_res1_weather --metadata data/generated/terrain_res1_metadata.json --output data/generated/terrain_res1_weather.json
```

There is no `weather:generate` npm script. Tests:

```powershell
npm run weather:test
```

Archive one file, from the repository root:

```powershell
npm run generated:zip -- terrain_res1_weather.json
```

## Regional packs

`export_region_weather` in `scripts/regional_pipeline/regional_weather.py` calls `write_weather_pack` with that region's strategic metadata and `weather_water_land_steps_for`. The search is 2 rings at strategic resolution 1, 5 at resolution 2, and 14 at resolution 3, so the ground distance stays similar as hexes shrink. A hex the raster does not cover copies a sampled hex from the other cells in that region's metadata only.

`npm run regional:generate` runs this as the `weather` step. With `--skip-existing` (that npm script sets the flag) it skips the step when `terrain_res_s_weather.json` is already a file, including a file that would fail `regional:check`. `npm run regional:check` fails the weather file when its cell set is not the region's strategic cells, or when any record has other than twelve months. Delete the file before generating again. The command list is in [../regional_pipeline/README.md](../regional_pipeline/README.md#commands).

## Troubleshooting

- **Missing metadata**: the default path is `data/generated/terrain_res1_metadata.json` under the repository root. Extract the tracked zip with `npm run generated:extract`, or pass `--metadata`.
- **`missing CHELSA files`**: one or more of the 24 paths under `CHELSA_DIR` is not a file. The error lists each missing path. Put the file at that path. The export does not download it.
- **A file fails the CHELSA contract**: the error names the path and the failed check (scale, variable tag, shape, or a file that cannot be opened). Replace that file with the 1981-2010 V2.1 climatology.
- **Weather still reads `F:\Data\chelsea` after `--data-root`**: expected. `--data-root` does not redirect CHELSA. Change `CHELSA_DIR`.
