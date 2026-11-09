---
name: CHELSA weather source plan
overview: "Sample strategic weather from CHELSA V2.1 1981-2010 monthly climatologies. Every hex, land or water, uses a 10-arc-minute box mean. Regenerate the global pack and all regional packs, then replace the WorldClim credits."
todos:
  - id: preconditions
    content: Record git status, baseline tests, and a copy of the 24 tracked weather zips
    status: completed
  - id: source-module
    content: Add the CHELSA reader and its unit tests
    status: completed
  - id: pack-builder
    content: Sample every hex from CHELSA and keep the pack schema
    status: completed
  - id: selective-zip
    content: Let the global zip script archive one named JSON file
    status: completed
  - id: probe
    content: Check real CHELSA values at fixed points before regenerating packs
    status: completed
  - id: global-pack
    content: Regenerate and compare the global weather pack, then zip it
    status: completed
  - id: regional-packs
    content: Regenerate, compare, check, and zip every regional weather pack
    status: completed
  - id: docs
    content: Update the living docs and the notices check
    status: completed
  - id: final-checks
    content: Run the test suites and write the results file
    status: completed
isProject: false
---

# CHELSA Weather Source Execution Plan

This file is the plan. Do not revise it while coding. The one allowed edit is setting a todo's `status` in the front matter when its phase passes. Record what happens in `.spec/chelsa-weather-source-results.md` (template at the end).

## Purpose

Strategic weather is classified from WorldClim 2.1 10-arc-minute temperature and precipitation for 1970-2000. A land hex is one pixel at its centroid. A water hex copies the nearest land hex.

Switch the source to CHELSA V2.1 monthly climatologies for 1981-2010. Sample every strategic hex, land or water, as the mean of a 10-arc-minute box. Keep the classification thresholds and the JSON shape. Regenerate the global pack and all 23 regional packs.

## Settled Decisions

- **Files.** Temperature is `F:\Data\chelsea\tas\1981-2010\CHELSA_tas_{MM}_1981-2010_V.2.1.tif`. Precipitation is `F:\Data\chelsea\pr\1981-2010\CHELSA_pr_{MM}_1981-2010_V.2.1.tif`. `{MM}` is `01` through `12`. There is no path flag and no download. Do not read `F:\Data\chelsea\chelsa02\...` and do not move files into place. If a final path is missing, stop and list it.
- **Measured raster contract.** One `uint16` band, nodata `65535`, scale `0.1`, offset `0`. Width 43200, height 20880, pixel 1/120 degree, WGS84, north edge about 84°N. Overviews exist. Do not read them and do not pass `out_shape`. `rasterio` returns raw integers from `read`; it does not apply the scale. Tag `variable` is `tas` or `pr`. Tag `variable_unit` is `K` for temperature and `kg m-2 month-1` for precipitation.
- **Conversions.** Degrees Celsius are `raw * 0.1 - 273.15`. The file offset is 0, so do not also add 273. Millimetres are `raw * 0.1`. `kg m-2 month-1` is already a monthly total in millimetres. Do not divide by the days in the month. Do not round before classification.
- **Window.** 20 by 20 full-resolution pixels, which is 10 arc-minutes. The pixel that contains the centroid sits at index 10 of each axis: rows `[row - 10, row + 10)` and columns `[col - 10, col + 10)`, clipped at the north and south edges and wrapped across longitude. Ignore nodata. If the centroid lies outside the raster, or every pixel in the clipped window is nodata, the year is missing.
- **Missing years.** A hex with a missing year copies the nearest hex in the same pack that did sample, within the existing step radius. Ties keep the lesser H3 index string. Past that radius the year is mild. `all_water` is not read. The radius stays 2, 5, and 14. The manifest field `weather_water_land_steps` stays as it is.
- **Unchanged game rules.** Thresholds stay `SNOW_MEAN_C` 0, `RAIN_MM` 120, `HEAT_MEAN_C` 23, and the matching constants in `src/shared/weatherBonusRules.ts`. Pack `version` stays `1`. Month 0 stays January. Compact JSON stays `separators=(",", ":")`, sorted by `h3Index`.
- **License.** CHELSA V2.1 is CC0 1.0. EarthEnv consensus land cover stays CC BY-NC 4.0, and that term still prevents commercial use of the application as distributed. Do not write that commercial use is now allowed. Do not copy the contact address stored in the raster tags.

## What You Will Change

| File | Change |
| --- | --- |
| `scripts/weather_pipeline/chelsa_source.py` | New. Paths, open, validate, window mean, unit conversion. |
| `scripts/weather_pipeline/tests/test_chelsa_source.py` | New. Synthetic GeoTIFFs only. |
| `scripts/weather_pipeline/weather_pack.py` | Remove the WorldClim download. Sample every hex. |
| `scripts/weather_pipeline/tests/test_weather_pack.py` | Rename the search test. Add payload tests and one writer test. |
| `scripts/weather_pipeline/generate_res1_weather.py` | Docstring only. |
| `scripts/weather_pipeline/__init__.py` | Module docstring only. |
| `scripts/regional_pipeline/regional_weather.py` | Docstring only. |
| `scripts/regional_pipeline/regional_scaling.py` | Docstring of `weather_water_land_steps_for` only. Do not change the arithmetic or the name. |
| `scripts/zip-generated-data.cjs` | Accept file-name arguments. |
| `src/main/weather/weatherPackLoad.ts` | One comment sentence. No behavior change. |
| Living docs and notices | Listed in Phase 8. |

`weather_pack.py` is 242 lines. Keep it and `chelsa_source.py` under 600 lines. A function takes at most six named arguments.

`chelsa_source.py` must not import `weather_pack`. Classification stays in `weather_pack.py`.

## Rules for the Implementer

- Do not commit or push.
- Do not put identifiers from this plan into code, comments, configuration, or `doc/`.
- Match `weather_pack.py`. Constants and dataclass fields get a one-line comment, as `SNOW_MEAN_C` does. Functions get the three-part docstring: why it exists, when to use it, what to expect. Log debug once per export or per open. Log trace per hex, not per pixel, and do not format a pixel array into a log line. Log caught exceptions at error and reraise. Info, once per 500 metadata rows, reports how many rows are done so a long run does not look stuck.
- Tests cover the happy path and the essential failures named below. Do not add a dependency. `numpy` is already installed with `rasterio`.
- Do not edit `src/shared/weatherBonusRules.ts`, `doc/ai-commander-prompts/`, `doc/ux/`, `doc/devleopment-plan-v3.4.md`, `doc/poc-analysis.md`, `doc/market-research.md`, or anything under `.spec/completed/`.
- Do not run `npm run regional:generate`. That script passes `--skip-existing` and would keep the old weather files. Do not run `npm run generated:zip` with no file name. That rewrites every global archive.

## Shared Signatures

`scripts/weather_pipeline/chelsa_source.py`:

```python
CHELSA_DIR: Final = Path(r"F:\Data\chelsea")
CHELSA_PERIOD: Final = "1981-2010"
CHELSA_NODATA: Final = 65535
CHELSA_SCALE: Final = 0.1
KELVIN_TO_CELSIUS: Final = 273.15
SAMPLE_WINDOW_PX: Final = 20

@dataclass(frozen=True)
class ChelsaBands:
    temperature: tuple[rasterio.DatasetReader, ...]
    precipitation: tuple[rasterio.DatasetReader, ...]
    def close(self) -> None: ...

def chelsa_month_path(chelsa_dir: Path, variable: str, month: int) -> Path: ...
def celsius_from_raw(raw: float) -> float: ...
def precip_mm_from_raw(raw: float) -> float: ...
def window_mean_raw(dataset: rasterio.DatasetReader, lat: float, lng: float) -> float | None: ...
def open_chelsa_bands(chelsa_dir: Path) -> ChelsaBands: ...
```

`chelsa_month_path` returns `chelsa_dir / variable / CHELSA_PERIOD / f"CHELSA_{variable}_{month:02d}_{CHELSA_PERIOD}_V.2.1.tif"`. `variable` is `tas` or `pr`. `month` is 1 through 12.

`celsius_from_raw` returns `raw * CHELSA_SCALE - KELVIN_TO_CELSIUS`. `precip_mm_from_raw` returns `raw * CHELSA_SCALE`.

`open_chelsa_bands` builds the 24 paths first. If any path is not a file, raise `RuntimeError` and mention every missing path. Open nothing in that case. Then open in month order, January first. On any later failure, close the datasets already opened and then raise. Validate each dataset before accepting it:

- one band, dtype `uint16`
- nodata equal to `65535`
- `scales[0]` within `1e-6` of `0.1`, and `offsets[0]` within `1e-6` of `0`
- tag `variable` equal to `tas` or `pr` for that file
- same width and height as the first dataset
- pixel width and height within `1e-8` degrees of the first dataset
- origin (the affine `c` and `f`) within `1e-4` degrees of the first dataset

A zero-byte file fails at `rasterio.open`. The message names that path. Store each dataset at index `month - 1`. `ChelsaBands.temperature[0]` is January. Do not discover files with a glob.

`window_mean_raw` uses the dataset's own `index(lng, lat)`. Fold longitude `180` to `-180` before that call. If `row` is outside `[0, height)`, return `None`. Wrap `col` with modulo `width`. Read full-resolution windows with `rasterio.windows.Window`. Concatenate the two column spans when the window crosses the last column. Compare pixels to `int(dataset.nodata)` and ignore those. Return the arithmetic mean of the remaining raw values, or `None` when none remain. Do not apply scale inside this function.

`scripts/weather_pipeline/weather_pack.py` after the edit:

```python
def nearest_sampled_months(
    origin: str,
    sampled_months: dict[str, list[dict[str, object]]],
    max_steps: int,
) -> list[dict[str, object]]: ...

def sample_climate_year(lat: float, lng: float, bands: ChelsaBands) -> list[dict[str, object]] | None: ...

def build_weather_payload(
    metadata_records: list[dict[str, Any]],
    sample_year_at: Callable[[float, float], list[dict[str, object]] | None],
    max_steps: int,
) -> dict[str, Any]: ...

def write_weather_pack(
    metadata_path: Path,
    output_path: Path,
    max_steps: int,
    chelsa_dir: Path = CHELSA_DIR,
) -> int: ...
```

`nearest_sampled_months` is the current `nearest_land_months` loop with a new name and docstring. Keep the loop. It searches `h3.grid_disk` outward and stops at the first distance that has a sampled hex. Ties keep the lesser cell id.

`sample_climate_year` zips the twelve temperature datasets with the twelve precipitation datasets, `strict=True`. For each month, a `None` from either `window_mean_raw` returns `None` for the whole year. Otherwise classify `celsius_from_raw` and `precip_mm_from_raw`.

`build_weather_payload` calls `sample_year_at` for every record, including a record whose `all_water` is true. `None` is a missing year and is filled by `nearest_sampled_months` from the years that did sample. Return `{"version": 1, "records": [...]}` sorted by `h3Index`. Each record is `{"h3Index", "months"}`.

`write_weather_pack` opens `chelsa_dir`, builds the payload, writes compact JSON, and closes the bands in a `finally`. Return the record count. The console line and the info log include the record count and how many years were sampled, copied, and mild. Those three counts sum to the record count.

Delete `WORLDCLIM_DIR`, `TAVG_URL`, `PREC_URL`, `download_and_extract`, `sample_year`, `open_worldclim_bands`, and the `urllib` and `zipfile` imports.

## The Window

This is the read. `half` is `SAMPLE_WINDOW_PX // 2`, which is 10.

```python
if lng == 180:
    lng = -180.0
row, col = dataset.index(lng, lat)
if row < 0 or row >= dataset.height:
    return None
width = dataset.width
col %= width
row_start = max(0, row - half)
row_stop = min(dataset.height, row + half)
if row_stop <= row_start:
    return None
col_start = col - half
if col_start < 0:
    spans = [(col_start + width, width), (0, col + half)]
elif col + half > width:
    spans = [(col_start, width), (0, (col + half) % width)]
else:
    spans = [(col_start, col + half)]
```

Read each span whose end is greater than its start. The centroid pixel is inside the window: it is the first pixel of the second half, so a 20-pixel window is 10 pixels to one side of that pixel and 10 pixels that start on it. Do not put the corner of the window on the centroid.

## Phase 1: Preconditions

From the repository root.

1. Record `git status --short` and `python --version` in the results file.
2. Run `npm run weather:test` and `npm run regional:test`. Record the tails. Both already pass. If one fails, stop. Do not start the next phase on a red baseline.
3. Copy the tracked weather archives to `.test/chelsa_weather/baseline/`. `.test/` is gitignored.

```powershell
New-Item -ItemType Directory -Force -Path .test\chelsa_weather\baseline\regions | Out-Null
Copy-Item data\generated\terrain_res1_weather.json.zip .test\chelsa_weather\baseline\
Get-ChildItem data\generated\regions -Directory | Where-Object { $_.Name -ne 'qa' } | ForEach-Object {
  $source = Join-Path $_.FullName 'terrain_res_s_weather.json.zip'
  Copy-Item $source (Join-Path '.test\chelsa_weather\baseline\regions' ($_.Name + '.zip'))
}
```

The baseline directory then holds one global zip and one zip per region. The count is 24 on this tree. If it is not 24, stop and list the paths. Do not copy loose JSON. The zip is the archived pack.

Also list which of the 24 CHELSA paths from Settled Decisions are missing. Phases 2 through 4 do not need those files. Phase 5 does.

## Phase 2: CHELSA Reader

Create `chelsa_source.py` and `tests/test_chelsa_source.py`. Tests write GeoTIFFs under `tempfile.TemporaryDirectory`. They do not read `F:\Data`.

Write a uint16 GeoTIFF with `nodata` 65535, CRS `EPSG:4326`, and this profile unless a test says otherwise: width 30, height 30, `Affine(1, 0, 0, 0, -1, 30)`. Before the write context closes, set `scales` to `(0.1,)`, `offsets` to `(0.0,)`, and tag `variable`. Reopen and read those back in the test setup. If they do not round-trip, stop. Do not weaken the validator.

Tests, in `ChelsaSourceTests`:

1. `test_window_mean_ignores_nodata`. Fill 2771. Set a block inside the sampled window to 65535. Sample at `dataset.xy(15, 15)`. The raw mean is 2771 within `1e-6`, and `celsius_from_raw` of that mean is `3.95` within `1e-6`. A mean that included 65535 cannot land on 2771.
2. `test_window_wraps_longitude`. Fill columns 20 through 29 with 3000 and columns 0 through 9 with 1000, every row. `dataset.xy(15, 0)` returns `(lng, lat)`. Require `dataset.index(lng, lat)` to be `(15, 0)`. The raw mean at that point is 2000 within `1e-6`. A reader that clips instead of wrapping returns 1000.
3. `test_outside_latitude_returns_none`. The same raster at latitude 89 and longitude 0 returns `None`.
4. `test_missing_files_are_listed_before_open`. An empty directory raises `RuntimeError` whose message contains `CHELSA_tas_01_1981-2010_V.2.1.tif` and `CHELSA_pr_12_1981-2010_V.2.1.tif`.
5. `test_wrong_scale_is_rejected`. One temperature file with scale `1.0`, and the other 23 files valid, raises `RuntimeError` naming the bad file.
6. `test_width_mismatch_is_rejected`. One precipitation file has width 31. `RuntimeError` names that file.
7. `test_failed_open_releases_handles`. Twenty-three valid files and a zero-byte `CHELSA_pr_12_1981-2010_V.2.1.tif`. The first call raises. Replace the empty file with a valid one. The second call returns bands, and `close()` leaves the files replaceable. This is the Windows lock check.

Check: `npm run weather:test` passes, including the existing `WeatherPackTests`.

## Phase 3: Pack Builder

Edit `weather_pack.py` and `tests/test_weather_pack.py`.

Keep `test_classify_month_boundaries` as it is. Rename `nearest_land_months` to `nearest_sampled_months` in the step-limit test. Keep its assertions.

Add these payload tests. They pass a fake sampler and do not open rasters.

- `test_water_hex_is_sampled_and_missing_year_copies_neighbor`. Two cells one ring apart. The origin's sampler returns `None`. The neighbor's sampler returns twelve heat months, and the neighbor record has `all_water` true. `max_steps` 2. The origin record's months are that heat year. The neighbor record's months are that heat year, which shows the water hex was sampled rather than skipped.
- `test_missing_year_without_neighbor_is_mild`. One record, sampler returns `None`, `max_steps` 2. Months equal `mild_year()`.

Add `test_write_weather_pack_uses_month_order_and_units`. Build 24 tiny uniform rasters in a temp `chelsa_dir` with the real directory layout. January temperature raw `2631` (`-10.05°C`) and precipitation raw `100` (10 mm). July temperature raw `3031` (`29.95°C`) and precipitation raw `500` (50 mm). The other months are temperature raw `2881` (`14.95°C`) and precipitation raw `100`. The metadata document is `{"records": [{"h3_index": h3.latlng_to_cell(15.0, 15.0, 1)}]}`. That cell's centroid is about 14.27°N, 14.28°E, inside the 30° raster. Call `write_weather_pack` with that temp directory. January is `snow` and `countsAsHeat` false. July is `heat` and `countsAsHeat` true. Month index 1 is `mild`.

Those three months catch a forgotten kelvin subtraction, a forgotten scale, and a swapped July. Do not assert the raw floats in the JSON. The JSON stores `display` and `countsAsHeat` only.

Update the one purpose sentence on `MILD_YEAR` in `src/main/weather/weatherPackLoad.ts` from "Open ocean and test fixtures still have a year to read." to "A hex the pack does not list still has a year to read." Change nothing else in that file. `src/main/gameMap/newGameMapPreview.ts` already says a missing hex is mild. Leave it.

Docstrings: `generate_res1_weather.main`, the package `__init__.py`, `export_region_weather`, and `weather_water_land_steps_for`. The search radius is how far a hex with no sample looks for a hex that has one. It is not a water-to-land copy. Do not rename `weather_water_land_steps_for`. `scripts/regional_pipeline/tests/test_regional_scaling.py` stays as it is.

Check:

```powershell
npm run weather:test
npm run regional:test
```

Search `scripts/` and `src/`, case-insensitive, for `worldclim`, `TAVG_URL`, `PREC_URL`, `download_and_extract`, `open_worldclim`, `nearest_land_months`, and `wc2.1`. No hits.

## Phase 4: Selective Global Zip

`scripts/zip-regional-data.cjs` already accepts file names and already rejects an unknown name. Do not edit it. Do not edit `extract-generated-data.cjs`, `extract-regional-data.cjs`, or `generated-data-zip-helpers.cjs`.

`scripts/zip-generated-data.cjs` currently ignores arguments and rezips every present file in `GENERATED_JSON_TO_ZIP`. Change it:

- No arguments: keep today's behavior, including skipping a listed file that is not on disk.
- One or more arguments: each must be a member of `GENERATED_JSON_TO_ZIP`. An unknown name throws `zip-generated-data: unknown file <name>` before any zip is written and before the directory listing.
- A known name whose JSON is not a file throws before any zip is written. Do not skip it. Phase 6 depends on that failure.

Check, from the repository root:

```powershell
node scripts/zip-generated-data.cjs not-a-real-file.json
```

Exit code 1, stderr contains `unknown file`, and the output does not contain `zipped`. Do not run `npm run generated:zip` with no arguments.

`npm run regional:zip -- terrain_res_s_weather.json` is the regional command used in Phase 7. Do not run it in this phase.

## Phase 5: Real-Data Probe

Stop if any of the 24 CHELSA paths is missing. Do not wait and do not read the download folder.

Write `.test/chelsa_weather/probe_points.py`. It imports `window_mean_raw`, `celsius_from_raw`, `precip_mm_from_raw`, `open_chelsa_bands`, and `classify_month`. It prints one line per point and exits 1 on the first miss. Close the bands before exiting, including on a failure. Delete nothing in `F:\Data`. The hex row uses `h3.cell_to_latlng("8101bffffffffff")`.

| Point | Latitude | Longitude | Pass condition |
| --- | --- | --- | --- |
| Paris, January | 48.85 | 2.35 | 3.4 to 4.4°C, 50 to 60 mm, display `mild` |
| Moscow, January | 55.75 | 37.6 | -8.5 to -6.5°C, display `snow` |
| Moscow, July | 55.75 | 37.6 | 17 to 21°C, at least 20°C warmer than its January, display `mild` |
| Manaus, January | -3.1 | -60 | above 23°C, above 250 mm, display `rain`, `countsAsHeat` true |
| Manaus, July | -3.1 | -60 | precipitation below 120 mm, display `heat` |
| Atlantic, January | 0 | -30 | above 23°C, above 150 mm, display `rain`, `countsAsHeat` true |
| Dateline, January | 0 | 179.95 | 24 to 30°C, 100 to 180 mm |
| North of the raster | 89 | 0 | `window_mean_raw` returns `None` |
| `8101bffffffffff` | the H3 centroid | January | display `snow` and `countsAsHeat` false |

Moscow's July temperature is about 19°C, so July is mild there. Do not require July to be heat. Manaus July is drier than January. That pair is the month-order check: a swapped July fails Manaus and also fails the 20°C Moscow gap. The Atlantic row is the ocean-value check. Longitude 179.95 falls in column 43194, so its 20-pixel window crosses the last column. The ocean there is smooth, and a clipped read can still land inside the range. `test_window_wraps_longitude` is the check that rejects a clip.

These ranges were measured with the window in this plan. A miss means the reader does not match that window or the units. Do not widen a range.

Check: `python .test/chelsa_weather/probe_points.py` exits 0. Record the printed lines and the elapsed time.

## Phase 6: Global Pack

1. `npm run generated:extract` so `data/generated/terrain_res1_metadata.json` is present.
2. `python -m scripts.weather_pipeline.generate_res1_weather --verbose`
3. Compare, then zip. Write `.test/chelsa_weather/compare_weather.py`. It reads the baseline zip in memory and the new JSON on disk. Metadata records use `h3_index`. Weather records use `h3Index`. A row is water when `all_water` is boolean true. Any other value, including a missing field, is land.

Gates for the global pack:

- The new and old `h3Index` sets are equal.
- Every record has 12 months, and each month has a known `display` and a boolean `countsAsHeat`.
- Water hexes number at least 100. Fewer than 100 means the metadata key was not joined. Stop.
- Among water hex-months, at least half have a `display` other than `mild`. Fewer than half means water hexes were not sampled.
- A land hex-month counts as changed when `display` or `countsAsHeat` differs. Changed land hex-months divided by all land hex-months is at most `0.25`. Above that, stop. Do not raise the limit.

The water gates catch a sampler that still skips `all_water`. The land gate catches a unit or month-order bug that the probe missed. A real climate shift can also cross 0.25. Stopping is the intended result. Report the counts and wait.

Also require hex `8101bffffffffff` to have January `snow` and `countsAsHeat` false. That is the assertion in `src/main/weather/weatherPackLoad.test.ts`. Do not edit that assertion. If the hex is not snow, the conversion is wrong.

4. After the compare exits 0:

```powershell
npm run generated:zip -- terrain_res1_weather.json
```

The `--` is required. Without it, npm does not pass the file name. The command prints `zipped terrain_res1_weather.json` and does not print any other `zipped` line.

Record sampled, copied, and mild counts, the land-change fraction, the water non-mild fraction, and the water hex count.

## Phase 7: Regional Packs

Do not rewrite manifests. Do not run footprint, metadata, naming, landmass, origins, or economy.

1. Restore strategic metadata where the JSON is missing. This command skips a JSON file that is already newer than its zip:

```powershell
npm run regional:extract -- terrain_res_s_metadata.json
```

2. Regenerate weather for every region. This does not pass `--skip-existing`:

```powershell
python -m scripts.regional_pipeline.regional_cli run --all --steps weather --verbose
```

The run opens the 24 rasters once per region and reads windows. It can take a long time. Progress lines every 500 rows mean it is working. Do not load a full band to speed it up, and do not add processes.

3. Extend `compare_weather.py` to every baseline file under `.test/chelsa_weather/baseline/regions/<region_id>.zip` against `data/generated/regions/<region_id>/terrain_res_s_weather.json`. Read that region's `terrain_res_s_metadata.json` for `all_water`, using `h3_index`.

Regional gates:

- Equal cell sets, twelve months, known displays, boolean heat flags.
- The same 0.25 land hex-month limit. Do not raise it.
- Do not apply the global "half of water months are non-mild" gate. A region's water hexes can be lakes and legitimately mild.
- A region with zero water hexes passes the water portion.

4. `npm run regional:check`. A weather failure is a mismatched cell set or a record without twelve months. Fix the writer and rerun. Do not edit `pack_checks.py` to make a bad file pass.

5. Zip only after every region compares clean and `regional:check` passes:

```powershell
npm run regional:zip -- terrain_res_s_weather.json
```

Confirm the output zips `terrain_res_s_weather.json` once per region and does not zip metadata, naming, or road files.

Record one row per region: sampled, copied, mild, land-change fraction, and whether the zip was written.

## Phase 8: Docs and Notices

Update living docs in place. Do not copy this plan into `doc/`. Search `doc/`, `scripts/`, and the root `README.md` for `WorldClim`, `worldclim`, `WORLDCLIM`, and `wc2.1`. Hits under `.spec/completed/` and the three historical docs stay. Every other hit changes in this phase.

`scripts/weather_pipeline/README.md`:

- The pipeline reads CHELSA V2.1 `tas` and `pr` for 1981-2010 from `CHELSA_DIR`.
- Month 0 is January because the files are opened as `01` through `12`, not because a zip sorts that way.
- Every hex is the mean of a 20 by 20 pixel box around its centroid. Nodata is ignored. Longitude wraps. A centroid outside the raster, or a window of all nodata, copies the nearest sampled hex within the step radius and is otherwise mild.
- `all_water` is not read. The global radius is `GLOBAL_WATER_LAND_STEPS` (2). A region uses `weather_water_land_steps_for`: 2 at resolution 1, 5 at resolution 2, 14 at resolution 3. The copied hex comes from that same pack.
- There is no download. A missing file raises `RuntimeError` and lists the missing paths. Replace the troubleshooting bullets that say to delete `wc2.1` files or to check `TAVG_URL`. The new bullets are: a missing path, a file that is not the expected scale or variable, and a weather directory that is still `F:\Data\worldclim` after someone expected `--data-root` to redirect it. `--data-root` does not redirect CHELSA. Change `CHELSA_DIR`.
- Keep the threshold table and the `npm run weather:test` command.

`scripts/terrain_pipeline/README.md` source-directory section: weather reads `CHELSA_DIR` in `scripts/weather_pipeline/chelsa_source.py`. Global export and the regional `weather` step both use it. The export does not download.

`scripts/regional_pipeline/README.md`: the sentence that says the weather step reads `WORLDCLIM_DIR` now names `CHELSA_DIR`.

`doc/terrain-pipeline.md` opening credits sentence: EarthEnv consensus land cover is CC BY-NC 4.0, and CHELSA V2.1 is CC0 1.0. The EarthEnv term prevents commercial use of the application as distributed. Credits are in `THIRD-PARTY-NOTICES.md`.

Replace the weather paragraph's source and sampling sentences with: the file is CHELSA V2.1 1981-2010 temperature and precipitation, reduced to the mean of a 10-arc-minute box around each hex centroid, land and water. Classification thresholds stay the sentence that is already there. A centroid the raster does not cover copies the nearest sampled hex in that pack: two resolution-1 steps for the global pack, and the manifest's `weather_water_land_steps` for a region (5 at resolution 2, 14 at resolution 3). Beyond that radius the year is mild. A hex the pack does not list is mild. Keep the sentences about startup failure and about the renderer.

`doc/combat-rules-v3.md` section 4.9, the sampling sentence only. Thresholds in that paragraph stay. The new sampling sentence: every hex, land or water, uses the mean of a 10-arc-minute box around its centroid. A hex the climate raster does not cover copies the nearest sampled hex within the search radius, and is mild all year when none is that close, with the existing link to the terrain pipeline.

Root `README.md` climate row:

`| Climate | Each hex's weather in each month | [CHELSA V2.1](https://www.chelsa-climate.org/datasets/chelsa_climatologies) 1981-2010 monthly mean temperature and precipitation, averaged over a 10-arc-minute box |`

After the classification paragraph, add: the mean is the CHELSA 30-arc-second cells in that box, for land and water. Temperature is converted from kelvin. A centroid the raster does not cover copies the nearest sampled hex in that pack.

Replace the license paragraph's WorldClim sentences with: the terrain uses EarthEnv consensus land cover, which is CC BY-NC 4.0. That term prevents commercial use of the application as distributed.

`doc/game-vision-v2.md`: replace "Monthly weather is classified from WorldClim 2.1." with "Monthly weather is classified from CHELSA V2.1 1981-2010 climatologies." In the credits sentence, remove "and WorldClim's ban on redistribution without permission". Replace "Terrain and weather derived from EarthEnv consensus land cover and WorldClim ship with the application, under terms that prevent commercial use of the application as distributed, so a paid Steam build waits on permission from those data authors or on replacement earth data." with "Terrain derived from EarthEnv consensus land cover ships with the application, under terms that prevent commercial use of the application as distributed, so a paid Steam build waits on permission from those data authors or on replacement earth data." Leave the rest of that paragraph.

`THIRD-PARTY-NOTICES.md` intro: "EarthEnv consensus land cover is CC BY-NC 4.0. That term prevents commercial use of the application as distributed."

Replace the `## WorldClim` section with:

```markdown
## CHELSA

Monthly weather in the generated packs is classified from CHELSA version 2.1 monthly mean temperature (`tas`) and precipitation (`pr`) for 1981-2010. Each hex uses the mean of a 10-arc-minute box around its centroid. The rasters are not shipped. The classification into mild, rain, snow, and heat is a modification of that data. The generated weather packs, `data/generated/terrain_res1_weather.json.zip` and each region's `terrain_res_s_weather.json.zip`, are tracked in this repository and included in the application.

CHELSA V2.1 is published under Creative Commons Zero 1.0 (CC0 1.0). https://creativecommons.org/publicdomain/zero/1.0/

https://www.chelsa-climate.org/datasets/chelsa_climatologies

https://doi.org/10.16904/envidat.228

Cite: Karger, D.N., Conrad, O., Böhner, J., Kawohl, T., Kreft, H., Soria-Auza, R.W., Zimmermann, N.E., Linder, H.P., Kessler, M. (2017). Climatologies at high resolution for the earth's land surface areas. Scientific Data 4: 170122. https://doi.org/10.1038/sdata.2017.122

Cite: Karger, D.N., Conrad, O., Böhner, J., Kawohl, T., Kreft, H., Soria-Auza, R.W., Zimmermann, N.E., Linder, H.P., Kessler, M. (2021). Climatologies at high resolution for the earth's land surface areas. EnviDat. https://doi.org/10.16904/envidat.228
```

`scripts/thirdPartyNotices/noticeCheck.cjs`: replace the `WorldClim` fixed requirement with heading `CHELSA` and snippet `Creative Commons Zero 1.0 (CC0 1.0)`.

`doc/README.md` does not name WorldClim. Leave it unless the search shows a stale sentence.

Check: `npm run notices:check` passes.

## Phase 9: Final Checks

1. `npm run weather:test`, `npm run regional:test`, and `npm test`. `npm test` includes `notices:check` and `weatherPackLoad.test.ts`. The known hex stays snow in January. An unknown index stays mild all year.
2. Write the results file. Set each todo in this plan's front matter to `completed` only if that phase's checks passed.

## Stop Protocol

When a check fails or a gate trips:

1. Stop. Do not start the next phase.
2. Write the phase, the command, the output, and what you expected in the results file.
3. Leave the new JSON in place. The baseline zips are the rollback. Do not copy them back unless the owner asks.
4. Ask the owner. Do not change this plan, widen a probe range, or raise the 0.25 land-change limit.

## Results File Template

Create `.spec/chelsa-weather-source-results.md` with these sections:

```markdown
# CHELSA Weather Source Results

## Environment
Python version and git status from before the work.

## Baseline
Tails of weather:test and regional:test. Baseline zip count.

## Probe
The printed point lines and the elapsed time. Any CHELSA path that was missing when this phase started.

## Global Pack
Sampled, copied, and mild counts. Water hex count. Water non-mild fraction. Land-change fraction. Whether the selective zip printed only the weather file.

## Regions
One row per region: sampled, copied, mild, land-change fraction, zip written.

## Docs
The documents that changed. Leftover WorldClim hits and why each was left.

## Checks
weather:test, regional:test, notices:check, and npm test.

## Note for the Owner
Ocean hexes now have their own climate. At Default, untagged naval units are slowed by snow. At High, they are also slowed by rain. Birth tags on water hexes follow that hex's own year.
```

## Follow-Ups (Not in This Change)

- A path flag for `CHELSA_DIR`.
- Finer than a 10-arc-minute box.
- Sampling the hex polygon instead of the box around the centroid.
