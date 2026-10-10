# Weather Pipeline

Offline WorldClim weather for every strategic hex. The global command writes the resolution-1 pack. A regional `weather` step calls the same writer for that region's strategic cells.

Combat tags and penalties are in [combat rules §4.9](../../doc/combat-rules-v3.md). The month rule the game uses is `classifyWeatherMonth` in `src/shared/weatherBonusRules.ts`.

## What this generates

- `data/generated/terrain_res1_weather.json`
  - `version`: `1`
  - `records[]`, sorted by `h3Index`: `h3Index`, `months` (twelve objects)
  - each month: `display` (`snow`, `rain`, `heat`, or `mild`) and `countsAsHeat`

The file is compact JSON. `open_worldclim_bands` opens bands in filename order. The zips from `TAVG_URL` and `PREC_URL` contain `wc2.1_10m_tavg_01.tif` through `_12.tif` and the matching `prec` files, so that order is January through December. The app reads index 0 as January (`monthIndex` in `src/shared/gameCalendar.ts`).

Extracted JSON under `data/generated/` is gitignored. `terrain_res1_weather.json` is listed in `scripts/generated-data-manifest.cjs`. `npm run generated:zip` refreshes every present file in that list, and skips names that are not extracted.

A regional pack writes `data/generated/regions/<region_id>/terrain_res_s_weather.json`. That file is in the regional archive (`npm run regional:zip`), not in `generated-data-manifest.cjs`. The pack layout is in [../regional_pipeline/README.md](../regional_pipeline/README.md).

## Classification

Land hexes are sampled at the H3 centroid. A month is classified in `classify_month` (`weather_pack.py`), which matches the TypeScript thresholds:

| Check | Python | TypeScript | Result |
| --- | --- | --- | --- |
| Mean at or below 0°C | `SNOW_MEAN_C` | `WEATHER_SNOW_MEAN_C` | `snow`, `countsAsHeat` false |
| Otherwise, precipitation at or above 120 mm | `RAIN_MM` | `WEATHER_RAIN_PRECIP_MM` | `rain`; `countsAsHeat` when the mean is also at or above 23°C |
| Otherwise, mean at or above 23°C | `HEAT_MEAN_C` | `WEATHER_HEAT_MEAN_C` | `heat` |
| Otherwise | falls through | falls through | `mild` |

A metadata row is water only when `all_water` is boolean true. A missing field, or any other value, is sampled as land. A water row copies the nearest land hex by H3 grid distance inside `GLOBAL_WATER_LAND_STEPS` (2 rings at resolution 1). Ties keep the lesser H3 index string. Open ocean past that radius is mild all year. A land centroid with nodata or NaN on any band is mild all year. Each record needs `h3_index`.

## Prerequisites

1. The same Python environment as the terrain pipeline (Python 3.13+). Weather needs `rasterio` and `h3` from:

   ```powershell
   python -m pip install -r scripts/terrain_pipeline/requirements.txt
   ```

   Weather does not open PostgreSQL.

2. Strategic metadata that includes `all_water` and `h3_index`. The global default is `data/generated/terrain_res1_metadata.json`. `npm run generated:extract` writes that file from the tracked zip. Run `python -m scripts.terrain_pipeline.metadata_cli run` only when the metadata itself should change. See [../terrain_pipeline/README.md](../terrain_pipeline/README.md).

3. WorldClim 2.1 10-arc-minute temperature and precipitation GeoTIFFs. The export downloads them when they are absent. Terms for that data are in `THIRD-PARTY-NOTICES.md`.

## Source directory

`WORLDCLIM_DIR` in `weather_pack.py` is `F:\Data\worldclim`. There is no path flag. Global export and the regional `weather` step both read that constant, including when regional `--data-root` points somewhere else.

`download_and_extract` looks for `wc2.1_10m_tavg_*.tif` and `wc2.1_10m_prec_*.tif` directly in `WORLDCLIM_DIR`. The glob is not recursive. If either set is missing, it downloads the matching zip from `TAVG_URL` or `PREC_URL` and extracts it into that directory. A later run skips a set that already has one tif. `open_worldclim_bands` then requires exactly 12 temperature files and 12 precipitation files, sorted by filename.

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

Archive. The command rewrites every present archive in `scripts/generated-data-manifest.cjs`, not only the weather file:

```powershell
npm run generated:zip
```

## Regional packs

`export_region_weather` in `scripts/regional_pipeline/regional_weather.py` calls `write_weather_pack` with that region's strategic metadata and `weather_water_land_steps_for`. The search is 2 rings at strategic resolution 1, 5 at resolution 2, and 14 at resolution 3, so the ground distance stays similar as hexes shrink. A cell with `all_water` true copies land from the other cells in that region's metadata only.

`npm run regional:generate` runs this as the `weather` step. With `--skip-existing` (that npm script sets the flag) it skips the step when `terrain_res_s_weather.json` is already a file, including a file that would fail `regional:check`. `npm run regional:check` fails the weather file when its cell set is not the region's strategic cells, or when any record has other than twelve months. Delete the file before generating again. The command list is in [../regional_pipeline/README.md](../regional_pipeline/README.md#commands).

## Troubleshooting

- **Missing metadata**: the default path is `data/generated/terrain_res1_metadata.json` under the repository root. Extract the tracked zip with `npm run generated:extract`, or pass `--metadata`.
- **`expected 12 tavg and 12 prec tifs`**: the directory has a partial set, extra matches, or the tifs are in a subdirectory. One matching tif makes `download_and_extract` skip that set, and the glob does not look in subfolders. Remove the incomplete or extra `wc2.1_10m_tavg_*.tif` or `wc2.1_10m_prec_*.tif` files directly under `WORLDCLIM_DIR` and run again. If the zip is already there, the next run extracts it. Delete the zip as well when that extract is the bad copy.
- **Download or zip errors**: `download_and_extract` raises `OSError` or `zipfile.BadZipFile`. Check that `F:\Data\worldclim` is writable and that `TAVG_URL` and `PREC_URL` are reachable.
- **Weather still reads `F:\Data\worldclim` after `--data-root`**: expected. Change `WORLDCLIM_DIR`.
