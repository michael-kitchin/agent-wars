---
name: Regional basemap prototype plan
overview: "Render a self-hosted hillshade basemap for the Western Europe regional map from GMTED2010 elevation and Natural Earth water, in a plain style and a stylized style (slope-keyed flattening, 2x relief contrast, light blur). Tiles carry gray land with transparent water. Produce deduplicated MBTiles, a z/x/y tile folder, a local Leaflet preview, a full-region composite at zoom 6, a Rhine-valley battle composite at zoom 9, and a size report. The app does not change."
todos:
  - id: preconditions
    content: Record git status and baseline test results, check tools and inputs, install the new requirements, confirm the GMTED2010 median tiles are on disk
    status: completed
  - id: tile-math
    content: Add the basemap_pipeline package, settings, and Web Mercator tile math with tests
    status: completed
  - id: region-inputs
    content: Read region files read-only, build the battle footprint, add the validate command, and match every verified fact
    status: completed
  - id: dem-mosaic
    content: Validate the GMTED tiles, write the region DEM mosaic, and check sample elevations
    status: completed
  - id: shading-math
    content: Add slope, illumination, flat weight, and tone functions with synthetic contract tests
    status: completed
  - id: flat-weights
    content: Write the zoom-9 flat-weight raster with overviews, then check mountain windows and record the preview image
    status: completed
  - id: water-coverage
    content: Load and cache Natural Earth ocean and lakes, compute anti-aliased water coverage per block, with tests and sample points
    status: completed
  - id: tiles
    content: Render plain and stylized tiles into deduplicated MBTiles and a tile folder, then pass tile-count, spot, and seam checks
    status: completed
  - id: composites
    content: Build the strategic and battle composites from the MBTiles, with and without outlines, then pass size, pixel-exactness, and relief checks
    status: completed
  - id: preview-report
    content: Write the Leaflet preview page and the size report
    status: completed
  - id: docs-rerun
    content: Add the package README and npm test script, re-run everything into a fresh folder, compare, re-run baseline tests, and write the results file
    status: completed
isProject: false
---

# Regional Basemap Prototype Execution Plan

This file is the plan. Do not revise it while coding. The one allowed edit is setting a todo's `status` in the front matter when its phase passes. Record what happens in `.spec/regional-basemap-prototype-results.md` (template at the end).

## Purpose

The app's basemap comes from Esri and OpenStreetMap tile servers whose terms do not allow this use. This prototype tests a replacement for one region: a hillshade rendered offline from public-domain data and stored as tiles. The owner will judge two things by eye and from the report:

1. Does a stylized hillshade (gentle terrain flattened, steep terrain shaded at twice the contrast, lightly blurred) read better than a plain hillshade?
2. How large are the tiles, and how much does flattening save?

Nothing here ships. The app (`src/`, `static/`), `doc/`, `data/generated/`, and `THIRD-PARTY-NOTICES.md` do not change.

## What You Will Build

A new Python package, `scripts/basemap_pipeline/`, with one command-line entry point (`basemap_cli.py`). Its subcommands write everything under `.test/basemap/western_europe/` (gitignored):

| Output | Path under `.test/basemap/western_europe/` |
|---|---|
| Region manifest copy | `work/region_manifest.json` |
| DEM mosaic (EPSG:4326, int16) | `work/dem_4326.tif` |
| Flat-weight raster (EPSG:3857, zoom-9 pixels, with overviews), quick-look PNG | `work/flat_weight_z9.tif`, `work/flat_weight_preview.png` |
| Cached water geometry and its description | `work/water_3857.wkb`, `work/water_3857.json` |
| Tile statistics per style | `work/tile_stats_plain.json`, `work/tile_stats_stylized.json` |
| Deduplicated MBTiles per style | `western_europe_plain.mbtiles`, `western_europe_stylized.mbtiles` |
| Tile folders per style | `tiles/plain/{z}/{x}/{y}.webp`, `tiles/stylized/{z}/{x}/{y}.webp` |
| Strategic composites (zoom 6, whole region) | `composites/strategic_z6_plain.png`, `composites/strategic_z6_plain_hexes.png`, `composites/strategic_z6_stylized.png`, `composites/strategic_z6_stylized_hexes.png` |
| Battle composites (zoom 9, one battle footprint) | `composites/battle_831f80fffffffff_z9_plain.png`, `..._plain_cells.png`, `..._stylized.png`, `..._stylized_cells.png` |
| Local preview page | `preview/index.html`, `preview/overlays.js` |
| Size report | `report.json`, `report.md` |
| Logs | `logs/` |

Tiles hold gray land and transparent water. The preview page and the composites draw `PREVIEW_WATER_RGB` underneath, so water shows in that color. An app that uses these tiles must draw its water color under the tile layer.

## Data the Owner Downloads

The pipeline reads GMTED2010 elevation that is not on disk yet. Phase 1 stops until the owner has done this:

1. Sign in to USGS EarthExplorer (https://earthexplorer.usgs.gov, free account), or open the GMTED2010 viewer (https://topotools.cr.usgs.gov/gmted_viewer/viewer.htm).
2. Find the GMTED2010 dataset (under Digital Elevation). Select the four 7.5-arc-second tiles that cover 30°N to 70°N and 30°W to 30°E. These are the tiles for 30–50°N and 50–70°N, each in 30°W–0° and 0°–30°E.
3. For each tile, download the median statistic product. Its file name contains `med075`. Unzip it if it arrives zipped.
4. Put the `.tif` files (with any sidecar files) directly in `F:/Data/gmted2010`.

## Verified Facts

These were measured from the committed regional zips with h3 4.5.0. Phase 3 must reproduce the extents exactly.

- `data/generated/regions/western_europe/` holds only `.json.zip` files. Read them from the zips. Do not extract into `data/generated/`.
- Manifest: `res_s` 3, `res_t` 6, 246 strategic cells: 117 `land`, 90 `neutral_border`, 39 `sea`.
- Region box, from `bounds_for_cells(strategic cells, margin_deg=0.0)` in `scripts/terrain_pipeline/geometry_bounds.py`: west -8.576452, south 39.009320, east 18.306518, north 56.943588.
- Tile ranges covering the region box (x and y inclusive), using `lonlat_to_tile` below:

  | Zoom | x | y | Tiles |
  |---|---|---|---|
  | 5 | 15–17 | 9–12 | 12 |
  | 6 | 30–35 | 19–24 | 36 |
  | 7 | 60–70 | 39–48 | 110 |
  | 8 | 121–141 | 78–97 | 420 |
  | 9 | 243–282 | 157–195 | 1,560 |
  | Total | | | 2,138 |

- The zoom-5 range spans longitude -11.25 to 22.5 and latitude 31.952162 to 61.606396. Every higher zoom's range lies inside it, so every tile the pipeline renders lies inside it.
- DEM bounds (zoom-5 range plus 1 degree on every side): west -12.25, south 30.952162, east 23.5, north 62.606396. The four GMTED tiles listed above cover them. At 7.5 arc-seconds this is about 261 million pixels (17,160 by about 15,195).
- Flat-weight raster: the zoom-5 range expressed in zoom-9 tiles is x 240–287 and y 144–207, so the raster is 12,288 by 16,384 pixels at 305.748113140705 m per pixel. That is 48 blocks of 8 by 8 tiles.
- Strategic composite at zoom 6, cropped to the region box: 1,225 by 1,238 pixels.
- Battle hex `831f80fffffffff` (Rhine valley, between the Vosges and the Black Forest): centre 47.984658°N 6.917932°E, role `land`. Its footprint is 607 cells, 343 of them core cells, both with every manifest cell on the map and with only the hex and its six neighbors. Footprint box from `bounds_for_cells`: west 5.743982, south 47.240754, east 8.098804, north 48.721065. Cropped at zoom 9: 858 by 806 pixels, or 898 by 846 with the 20-pixel pad.
- Battle terrain from `classify_metadata_row_without_urban(row, ClassifierThresholds())`: forest 293, plains 280, desert 20, mountain 14. The classifier checks forest before mountain, so most steep cells here are forest.
- Battle cells by `slope_mean`: 199 are below 2 degrees (35 forest, 157 plains, 7 desert) and 191 are 5 degrees or more (174 forest, 3 plains, 14 mountain).
- The game builds a battle footprint in `buildTacticalBattleFootprint` (`src/shared/tacticalBattleFootprint.ts`): the enclosing hex's tactical children, plus every cell within `TACTICAL_BATTLE_MARGIN_RINGS` (3) rings of a child whose strategic parent is on the map.
- WebP behavior, measured with Pillow 12.3 and libwebp 1.6, lossy at quality 80 and method 4:
  - A uniform gray 210 tile, and gray-210 areas inside a varied tile, decode as exactly 210. Gray 209 decodes as 210.
  - Uniform blue (190, 205, 218) does not decode uniformly, and decodes differently inside a varied tile. That is why water is transparent.
  - The alpha plane decodes exactly, and an all-transparent tile decodes with alpha 0 everywhere.
- Leaflet is vendored at `static/vendor/leaflet/` (`leaflet.js`, `leaflet.css`).
- A one-patch experiment earlier estimated the stylized tiles at about 35% fewer bytes than plain ones. That is a prediction to test, not a pass condition.

## Settled Decisions

- **Region and battle:** `western_europe`, battle hex `831f80fffffffff`. The commands take both as arguments, so other regions and battles need no code change.
- **Elevation:** GMTED2010 7.5-arc-second median (`med075`) for every zoom, including the strategic zooms. The game's own slope and TRI values also come from GMTED medians.
- **Water:** the union of `ne_10m_ocean.shp` and `ne_10m_lakes.shp`, the same pair as the tactical water mask. Paths come from `InputRasterSet` in `scripts/terrain_pipeline/config.py`. Water is clipped to the DEM bounds, not the region box, because low-zoom tiles reach past the region box.
- **Transparent water:** a tile's alpha is `1 - water coverage`, with anti-aliased coastlines. Tile RGB is gray land only. This keeps every tile free of the color shifts WebP gives blue, and it lets the app choose its water color later.
- **Flat land is gray 210,** a value lossy WebP decodes exactly. Blank flat tiles then match the flat areas inside varied tiles.
- **Every tile is lossy WebP** at quality 80 and method 4. Fully opaque tiles are saved as RGB, and tiles with any transparency as RGBA. MBTiles stores each distinct tile once (map, images, and a `tiles` view).
- **Zooms:** native tiles at zooms 5 through 9 for the region box. The preview zooms to 12 by stretching zoom-9 tiles.
- **Two styles:** `plain` (standard hillshade) and `stylized`. Both use the same light, tones, and zoom exaggeration, so the comparison isolates flattening, contrast, and blur.
- **Flattening is keyed to slope, not brightness.** Slope is computed once at zoom 9, smoothed, mapped through a 2° to 5° ramp, and stored as a raster. Lower zooms read that raster averaged down through its overviews. Brightness cannot be used: a 20° slope facing northeast renders 0.043 below flat under a northwest light.
- **Composites** are stitched from tiles read back out of the MBTiles over `PREVIEW_WATER_RGB`, so they show what a map would show.
- **Reuse:** cell bounds come from `bounds_for_cells` and polygon clipping from `clip_polygonal_to_bounds`, both in `scripts/terrain_pipeline/geometry_bounds.py`.
- **Dependencies:** numpy, scipy, and Pillow, added in `scripts/basemap_pipeline/requirements.txt`. These are offline tools and nothing ships, so `THIRD-PARTY-NOTICES.md` does not change.
- **Guards for other inputs:** regions that cross the 180-degree meridian are rejected. A DEM mosaic over `dem_max_pixels` (600 million) is rejected with a clear message. Composites near a map edge are clamped to the rendered tiles. Outputs that are older than their inputs are rejected.
- **Out of scope:** app integration, other regions, global zooms 0 to 4, and any change to existing pipeline modules.

## Style Definition

All values live in `basemap_settings.py`. Use exactly these.

| Field | `plain` | `stylized` | Meaning |
|---|---|---|---|
| `light_azimuth_deg` | 315 | 315 | Light comes from the northwest. |
| `light_altitude_deg` | 45 | 45 | Sun height above the horizon. |
| `zoom_exaggeration_step` | 1.2 | 1.2 | Vertical exaggeration is `step ** (9 - zoom)`. Coarser pixels flatten slopes, and this restores them. |
| `flatten_gentle_terrain` | False | True | Use the flat-weight raster. |
| `flat_slope_deg` | 2.0 | 2.0 | Slope at or below this gets no shading. |
| `full_relief_slope_deg` | 5.0 | 5.0 | Slope at or above this gets full shading. 5° is `mountain_slope_mean_min` in `ClassifierThresholds`. |
| `slope_smoothing_sigma_px` | 2.0 | 2.0 | Gaussian blur on zoom-9 slope before the ramp. Used only to build the flat-weight raster. |
| `contrast_gain` | 1.0 | 2.0 | Multiplies relief deviation from flat. |
| `shade_blur_sigma_px` | 0.0 | 1.5 | Gaussian blur on relief deviation, in that zoom's pixels. |
| `flat_tone` | 210 / 255 | 210 / 255 | Gray level of flat land (gray 210). |
| `shadow_tone` | 0.25 | 0.25 | Darkest land gray. |
| `highlight_tone` | 1.0 | 1.0 | Lightest land gray. |

`PREVIEW_WATER_RGB = (190, 205, 218)` is a module constant, not a style field. It is the color drawn under the tiles in the preview and composites.

Per pixel at zoom `z`:

1. `p`, `q` are the rise per metre toward east and north, from the DEM and the true ground spacing of each row.
2. Illumination `I` uses `p` and `q` multiplied by `1.2 ** (9 - z)`.
3. Deviation `d = I - sin(altitude)`, then Gaussian blur by `shade_blur_sigma_px`.
4. Weight `w` is the flat-weight raster read at zoom `z` (stylized), or 1 (plain).
5. `d' = contrast_gain * w * d`.
6. Tone is `flat_tone + d' * (flat_tone - shadow_tone) / sin(altitude)` when `d' < 0`, otherwise `flat_tone + d' * (highlight_tone - flat_tone) / (1 - sin(altitude))`, clamped to `[shadow_tone, highlight_tone]`.
7. Gray is `rint(tone * 255)`. Alpha is `rint(255 * (1 - c))` for water coverage `c`. Where alpha is 0, RGB is set to 0.

When `w` is exactly 0 and `c` is exactly 0, the pixel is exactly gray 210 and opaque. That is what makes flat tiles uniform.

## Rules for the Implementing Agent

- Read `AGENTS.md` and every file in `.cursor/rules/` before writing code.
- Never commit or push. Do not run `git add`, `git commit`, `git push`, `git checkout -- <file>`, `git restore`, `git stash`, or `git reset`.
- Do not put phase numbers or any other label from this file into code, comments, tests, docstrings, log messages, or the README. The words "phase" and "gate" must not appear in anything you add outside `.spec/` and `.test/`.
- Finish each phase and pass its checks before starting the next. When a check fails, follow the Stop Protocol. Do not loosen a check, skip one, or hand-edit an output. Items marked "Record" are observations: write them down and continue.
- Change only these existing files: `package.json` (one script line) and `scripts/terrain_pipeline/README.md` (one bullet). Do not change any existing Python module. Reuse these public names instead:
  - `bounds_for_cells` and `clip_polygonal_to_bounds` from `scripts/terrain_pipeline/geometry_bounds.py`
  - `load_ocean_union_wgs84` from `scripts/terrain_pipeline/ocean_mask.py`
  - `InputRasterSet` and `ClassifierThresholds` from `scripts/terrain_pipeline/config.py`
  - `classify_metadata_row_without_urban` from `scripts/terrain_pipeline/metadata_classifier.py`
  - `configure_logging` and `TRACE_LEVEL` from `scripts/terrain_pipeline/logging_utils.py`
  - `read_manifest` from `scripts/regional_pipeline/region_manifest.py`
  - `REGIONS_ROOT`, `MANIFEST_FILENAME`, and `METADATA_T_FILENAME` from `scripts/regional_pipeline/region_paths.py`
- Never write under `data/generated/`. Do not run `npm run regional:extract`, `npm run generated:zip`, `npm run regional:zip`, or any `regional:*` or `terrain:*` generation script. The `*:test` scripts are allowed.
- Python style, matching `scripts/terrain_pipeline/`:
  - Start each module with a one-line docstring, then `from __future__ import annotations`. Use built-in generics and `X | None` in type hints.
  - Give every function and method a docstring with "Why this exists:", "When to use:", "What to expect:", and, when it raises, "Exceptions:". This includes `__enter__`, `__exit__`, and properties.
  - Put a `#` comment line above every dataclass field and every module constant.
  - Mark constants `Final`. Make dataclasses `@dataclass(frozen=True)`. Wrap constant mappings, and mappings held by frozen dataclasses, in `types.MappingProxyType`.
  - Keep every file under 600 lines and every function at 6 named parameters or fewer. Use the dataclasses below as parameter objects.
- Logging (`.cursor/rules/02-backend-logging.mdc`): `LOGGER = logging.getLogger(__name__)` in every module.
  - Public functions that write files or change state log at debug on each call, with the paths and counts that matter. This includes `add_tile` and the subcommand handlers.
  - Pure computations that only return values log at `TRACE_LEVEL`.
  - Every caught exception logs at error before it is re-raised or becomes an exit code.
  - Progress lines for the owner (one per zoom per style) use `print`, like `scripts/weather_pipeline/weather_pack.py`.
- Every command creates the folders it writes into (`mkdir(parents=True, exist_ok=True)`).
- Tests use `unittest` in `scripts/basemap_pipeline/tests/`, importing `scripts.basemap_pipeline...` like `scripts/weather_pipeline/tests/test_weather_pack.py`. Test contracts only. Do not test private helpers or log output. Tests must not need GMTED, Natural Earth, files under `data/generated/`, or network access. Use temporary folders for any file a test writes.
- Run every command from the repository root in PowerShell.
- Run `tiles`, `weights`, and `all` with output sent to a log, for example `... 2>&1 | Tee-Object -FilePath .test/basemap/western_europe/logs/tiles-plain.log`. Do not start a second long command while one is running.
- Save the check scripts below under `.test/basemap/checks/` exactly as written, and run them from the repository root as `python .test/basemap/checks/<name>.py`.

## Module Layout

All under `scripts/basemap_pipeline/`.

| File | Contents |
|---|---|
| `__init__.py` | One-line docstring only. |
| `requirements.txt` | New dependencies (Phase 1). |
| `basemap_settings.py` | `BasemapStyle`, `PLAIN_STYLE`, `STYLIZED_STYLE`, `STYLES_BY_NAME`, `PipelineSettings`, `DEFAULT_SETTINGS`, `OutputPaths`, path defaults, `PREVIEW_WATER_RGB`, outline colors. |
| `web_mercator.py` | `LonLatBox`, `TileRange`, `TileBlock`, tile and pixel math. |
| `region_inputs.py` | Read-only region JSON access, `RegionInputs`, `load_region_inputs`, `load_tactical_rows`, `cells_box`. |
| `battle_footprint.py` | `BattleFootprint`, `battle_footprint`. |
| `dem_source.py` | GMTED discovery and checks, DEM bounds and size guard, the mosaic, `read_dem_3857`. |
| `terrain_shading.py` | Pure numpy: spacing, gradients, slope, illumination, smoothing, flat weight, tone. |
| `flat_weight_raster.py` | Writing and reading the flat-weight raster, and its quick-look PNG. |
| `water_coverage.py` | Water geometry loading and caching, per-block coverage. |
| `tile_rendering.py` | `RenderContext`, `render_block`, `split_block`, `land_with_water_alpha`. |
| `tile_store.py` | `MbtilesWriter`, `MbtilesMetadata`, `TileStats`, `write_tile_file`, `read_tile`, `decode_tile`, `is_uniform`. |
| `composites.py` | `crop_rect`, `CompositeFrame`, `stitch_box`, `draw_cell_outlines`, the two composite writers. |
| `preview_page.py` | `write_preview`. |
| `basemap_report.py` | `write_report`. |
| `basemap_cli.py` | argparse subcommands and exit codes. |
| `README.md` | Phase 11. |
| `tests/__init__.py` and `tests/test_*.py` | Contract tests. |

## Phase 1: Preconditions and Inputs

1. Create `.test/basemap/western_europe/logs/` and `.test/basemap/checks/`. Run `git status --short` and save the output to `.test/basemap/western_europe/logs/git-status-before.txt`. Files already changed are not yours: do not touch them, and list them in the results file.
2. Record the baseline of the existing Python suites. Save each one's output, then record pass or fail and the failure count. They do not have to pass: Phase 11 compares against this.

   ```powershell
   npm run terrain:test 2>&1 | Tee-Object -FilePath .test/basemap/western_europe/logs/baseline-terrain-test.txt
   npm run weather:test 2>&1 | Tee-Object -FilePath .test/basemap/western_europe/logs/baseline-weather-test.txt
   npm run regional:test 2>&1 | Tee-Object -FilePath .test/basemap/western_europe/logs/baseline-regional-test.txt
   ```

3. This must print a Python version of 3.13 or later and the package versions. `node --version` must print a version:

   ```powershell
   python -c "import sys, h3, rasterio, shapely, fiona, pyproj, numpy; print(sys.version.split()[0], h3.__version__, rasterio.__version__, shapely.__version__, numpy.__version__)"
   node --version
   ```

4. Create `scripts/basemap_pipeline/requirements.txt` with exactly:

   ```text
   -r ../terrain_pipeline/requirements.txt
   numpy>=2.1
   scipy>=1.14.1
   Pillow>=11.0
   ```

   Then install it, and check that WebP support is present (the last value must be `True`):

   ```powershell
   python -m pip install -r scripts/basemap_pipeline/requirements.txt
   python -c "import scipy, PIL; from PIL import features; print(scipy.__version__, PIL.__version__, features.version('webp'), features.check('webp'))"
   ```

5. Every line must print `True`:

   ```powershell
   foreach ($f in 'F:/Data/ne_10m_ocean.shp','F:/Data/ne_10m_lakes.shp','data/generated/regions/western_europe/region_manifest.json.zip','data/generated/regions/western_europe/terrain_res_t_metadata.json.zip','static/vendor/leaflet/leaflet.js','static/vendor/leaflet/leaflet.css') { Test-Path $f }
   ```

6. List the GMTED files. There must be at least four, and every name must contain `med075`. If there are fewer, STOP and ask the owner to follow [Data the Owner Downloads](#data-the-owner-downloads):

   ```powershell
   Get-ChildItem F:/Data/gmted2010 -Filter *.tif | Where-Object { $_.Name -match 'med075' } | Select-Object Name, Length
   ```

7. Describe each file. Every file must show `EPSG:4326`, a resolution of 0.0020833 in both directions, `int16`, one band, and nodata -32768. If any differs, STOP:

   ```powershell
   python -c "import glob, rasterio; [print(p, (d := rasterio.open(p)).crs, d.res, d.dtypes, d.count, d.nodata, d.bounds) for p in sorted(glob.glob('F:/Data/gmted2010/*med075*.tif'))]"
   ```

Checks: every step above passed. The baseline results are recorded.

## Phase 2: Package Skeleton, Settings, and Tile Math

Create `__init__.py`, `basemap_settings.py`, `web_mercator.py`, `tests/__init__.py`, and `tests/test_web_mercator.py`.

### `basemap_settings.py`

- `BasemapStyle` (frozen dataclass): `name` plus every field in [Style Definition](#style-definition).
- `PLAIN_STYLE` and `STYLIZED_STYLE` with the values in that table. `STYLES_BY_NAME: Final = MappingProxyType({"plain": PLAIN_STYLE, "stylized": STYLIZED_STYLE})`.
- `PipelineSettings` (frozen dataclass) and `DEFAULT_SETTINGS` with: `min_zoom` 5, `max_native_zoom` 9, `strategic_composite_zoom` 6, `tactical_composite_zoom` 9, `preview_max_zoom` 12, `block_tiles` 8, `halo_px` 16, `water_supersample` 4, `webp_quality` 80, `webp_method` 4, `dem_margin_deg` 1.0, `dem_max_pixels` 600,000,000, `battle_pad_px` 20.
- Constants:
  - `DEFAULT_GMTED_DIR = Path("F:/Data/gmted2010")`
  - `GMTED_FILE_MARKER = "med075"`
  - `DEFAULT_OUTPUT_ROOT = Path(".test/basemap")`
  - `LEAFLET_DIR = Path("static/vendor/leaflet")`
  - `PREVIEW_WATER_RGB = (190, 205, 218)`
- `OutputPaths` (frozen dataclass with `output_root: Path` and `region_id: str`). Properties, each returning a `Path` without creating it: `region_dir`, `work_dir`, `logs_dir`, `manifest_copy_path`, `dem_path`, `weight_path`, `weight_preview_path`, `water_cache_path`, `water_cache_info_path`, `composites_dir`, `preview_dir`, `report_json_path`, `report_md_path`. Methods: `tiles_dir(style_name)`, `mbtiles_path(style_name)` (`<region_id>_<style>.mbtiles`), and `stats_path(style_name)`. File names are in [What You Will Build](#what-you-will-build).
- Outline colors as read-only mappings of RGBA tuples:
  - `ROLE_OUTLINE_RGBA`: `land` (60, 60, 60, 170), `neutral_border` (130, 130, 130, 150), `sea` (40, 90, 160, 150).
  - `TERRAIN_OUTLINE_RGBA`: `mountain` (200, 40, 40, 230), `forest` (30, 130, 60, 210), `plains` (90, 90, 90, 130), `desert` (200, 140, 40, 210), `arctic` (120, 160, 200, 210).
  - `OTHER_TERRAIN_OUTLINE_RGBA = (40, 90, 160, 190)` for every other kind, and for a cell without a metadata row.

### `web_mercator.py`

Write these exactly, adding the required docstrings and comments. `range_at_zoom` raises, so its docstring needs "Exceptions:".

```python
EARTH_RADIUS_M: Final = 6378137.0
ORIGIN_SHIFT_M: Final = math.pi * EARTH_RADIUS_M
TILE_SIZE_PX: Final = 256
MAX_MERCATOR_LAT_DEG: Final = 85.0511287798066


@dataclass(frozen=True)
class LonLatBox:
    west: float
    south: float
    east: float
    north: float


@dataclass(frozen=True)
class TileRange:
    zoom: int
    x_min: int
    x_max: int  # inclusive
    y_min: int
    y_max: int  # inclusive

    def tile_count(self) -> int:
        return (self.x_max - self.x_min + 1) * (self.y_max - self.y_min + 1)


@dataclass(frozen=True)
class TileBlock:
    zoom: int
    x_min: int
    x_max: int  # inclusive
    y_min: int
    y_max: int  # inclusive

    def width_px(self) -> int:
        return (self.x_max - self.x_min + 1) * TILE_SIZE_PX

    def height_px(self) -> int:
        return (self.y_max - self.y_min + 1) * TILE_SIZE_PX

    def bounds_3857(self) -> tuple[float, float, float, float]:
        left, _, _, top = tile_bounds_3857(self.x_min, self.y_min, self.zoom)
        _, bottom, right, _ = tile_bounds_3857(self.x_max, self.y_max, self.zoom)
        return left, bottom, right, top


def pixel_size_m(zoom: int) -> float:
    return 2.0 * ORIGIN_SHIFT_M / (TILE_SIZE_PX * 2**zoom)


def global_pixel(lon: float, lat: float, zoom: int) -> tuple[float, float]:
    lat = max(min(lat, MAX_MERCATOR_LAT_DEG), -MAX_MERCATOR_LAT_DEG)
    world = TILE_SIZE_PX * 2**zoom
    x = (lon + 180.0) / 360.0 * world
    y = (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * world
    return x, y


def lonlat_to_tile(lon: float, lat: float, zoom: int) -> tuple[int, int]:
    x, y = global_pixel(lon, lat, zoom)
    last = 2**zoom - 1
    return min(int(x // TILE_SIZE_PX), last), min(int(y // TILE_SIZE_PX), last)


def tile_range_for_box(box: LonLatBox, zoom: int) -> TileRange:
    x_min, y_min = lonlat_to_tile(box.west, box.north, zoom)
    x_max, y_max = lonlat_to_tile(box.east, box.south, zoom)
    return TileRange(zoom, x_min, x_max, y_min, y_max)


def tile_bounds_3857(x: int, y: int, zoom: int) -> tuple[float, float, float, float]:
    span = 2.0 * ORIGIN_SHIFT_M / 2**zoom
    left = -ORIGIN_SHIFT_M + x * span
    top = ORIGIN_SHIFT_M - y * span
    return left, top - span, left + span, top


def tms_row(y: int, zoom: int) -> int:
    return (2**zoom - 1) - y


def latitude_of_y(y_m: float) -> float:
    return math.degrees(math.atan(math.sinh(y_m / EARTH_RADIUS_M)))


def box_of_tile_range(tile_range: TileRange) -> LonLatBox:
    left, _, _, top = tile_bounds_3857(tile_range.x_min, tile_range.y_min, tile_range.zoom)
    _, bottom, right, _ = tile_bounds_3857(tile_range.x_max, tile_range.y_max, tile_range.zoom)
    return LonLatBox(
        west=left / ORIGIN_SHIFT_M * 180.0,
        south=latitude_of_y(bottom),
        east=right / ORIGIN_SHIFT_M * 180.0,
        north=latitude_of_y(top),
    )


def range_at_zoom(tile_range: TileRange, zoom: int) -> TileRange:
    if zoom < tile_range.zoom:
        raise ValueError(f"zoom {zoom} is below {tile_range.zoom}")
    factor = 2 ** (zoom - tile_range.zoom)
    return TileRange(
        zoom,
        tile_range.x_min * factor,
        (tile_range.x_max + 1) * factor - 1,
        tile_range.y_min * factor,
        (tile_range.y_max + 1) * factor - 1,
    )


def blocks_for_range(tile_range: TileRange, block_tiles: int) -> list[TileBlock]:
    return [
        TileBlock(
            tile_range.zoom,
            x0,
            min(x0 + block_tiles - 1, tile_range.x_max),
            y0,
            min(y0 + block_tiles - 1, tile_range.y_max),
        )
        for y0 in range(tile_range.y_min, tile_range.y_max + 1, block_tiles)
        for x0 in range(tile_range.x_min, tile_range.x_max + 1, block_tiles)
    ]
```

### `tests/test_web_mercator.py`

- `pixel_size_m(9)` equals 305.748113140705 within 1e-6.
- `lonlat_to_tile(0.0, 0.0, 1)` is `(1, 1)`, and `lonlat_to_tile(-180.0, 85.0, 0)` is `(0, 0)`.
- `tile_bounds_3857(0, 0, 0)` equals `(-ORIGIN_SHIFT_M, -ORIGIN_SHIFT_M, ORIGIN_SHIFT_M, ORIGIN_SHIFT_M)`.
- `tms_row(0, 1)` is 1.
- With the region box from [Verified Facts](#verified-facts), `tile_range_for_box` returns each row of the tile-range table, and the counts sum to 2,138.
- `range_at_zoom` of the zoom-5 range at zoom 9 is x 240–287, y 144–207. At zoom 4 it raises `ValueError`.
- `blocks_for_range` of the zoom-9 range with 8-tile blocks covers every tile exactly once.

Checks: `python -m unittest discover -s scripts/basemap_pipeline/tests -p "test_*.py" -v` passes.

## Phase 3: Region Inputs, Battle Footprint, and Validate

Create `region_inputs.py`, `battle_footprint.py`, `basemap_cli.py` (with only `validate` for now), `tests/test_region_inputs.py`, and `tests/test_battle_footprint.py`. Also start `dem_source.py` and `composites.py` with the functions named below.

### `region_inputs.py`

- `read_region_json(region_id, filename, regions_root) -> dict`: read `regions_root / region_id / filename` if it exists, otherwise the member named `filename` inside `filename + ".zip"`. Read only. Raises `FileNotFoundError` naming both paths when neither exists.
- `cells_box(cells) -> LonLatBox`: from `bounds_for_cells(cells, margin_deg=0.0)`. When it returns `None` (an empty set or a cell crossing the 180-degree meridian), raise `ValueError` saying that regions crossing the 180-degree meridian are not supported.
- `RegionInputs` (frozen dataclass): `region_id`, `display_name`, `strategic_resolution`, `tactical_resolution`, `roles` (a read-only `Mapping[str, str]` from cell to role value, such as `"land"`), and `box: LonLatBox`.
- `load_region_inputs(region_id, regions_root, paths) -> RegionInputs`: write the manifest JSON (from `read_region_json`) to `paths.manifest_copy_path`, then call `read_manifest` on that file. It validates the manifest against the catalog, and raises `KeyError` for an unknown region. Raise `ValueError` when the manifest's region id differs from `region_id`. Build `roles` from `manifest.footprint.roles`, using each role's `.value`, and `box` from `cells_box`.
- `load_tactical_rows(region_id, regions_root) -> dict[str, dict]`: the tactical metadata records keyed by `h3_index`.

### `battle_footprint.py`

- `TACTICAL_BATTLE_MARGIN_RINGS: Final = 3`. Its comment names `TACTICAL_BATTLE_MARGIN_RINGS` in `src/shared/tacticalBattleFootprint.ts` as the source.
- `BattleFootprint` (frozen dataclass): `enclosing_cell`, `core_cells: tuple[str, ...]`, `cells: tuple[str, ...]` (sorted).
- `battle_footprint(enclosing_cell, on_map_cells, tactical_resolution) -> BattleFootprint` mirrors `buildTacticalBattleFootprint`:
  1. First, raise `ValueError` naming the cell when `enclosing_cell` is not in `on_map_cells`. Do this before any H3 call, so a malformed id gets the same message.
  2. The core is `h3.cell_to_children(enclosing_cell, tactical_resolution)`. Every core cell is kept.
  3. A cell from `h3.grid_disk(core_cell, TACTICAL_BATTLE_MARGIN_RINGS)` is added when `h3.cell_to_parent(cell, h3.get_resolution(enclosing_cell))` is in `on_map_cells`.

### Start `dem_source.py`

Write `GMTED_PIXEL_DEG`, `GMTED_NODATA`, `GmtedFileInfo`, `find_gmted_files`, `describe_gmted_file`, `dem_bounds_for`, `dem_pixel_count`, `require_dem_size`, and `require_gmted_coverage` now, as specified in Phase 4.

### Start `composites.py`

Write `crop_rect` now, exactly as below. The rest of `composites.py` comes in Phase 9.

```python
def crop_rect(box: LonLatBox, zoom: int, pad_px: int) -> tuple[int, int, int, int]:
    x0, y0 = global_pixel(box.west, box.north, zoom)
    x1, y1 = global_pixel(box.east, box.south, zoom)
    return math.floor(x0) - pad_px, math.floor(y0) - pad_px, math.ceil(x1) + pad_px, math.ceil(y1) + pad_px
```

### Tests

- `test_region_inputs.py`:
  - In a temporary folder, `read_region_json` reads a plain JSON file, reads the same document from a `.json.zip` when the plain file is absent, and raises `FileNotFoundError` when both are absent.
  - `cells_box` of `{h3.latlng_to_cell(0.0, 180.0, 3)}` raises `ValueError`.
  - `cells_box` of one ordinary cell returns a box that contains that cell's centre.
- `test_battle_footprint.py`:
  - With `on_map_cells = set(h3.grid_disk("831f80fffffffff", 1))`, the footprint has 607 cells and 343 core cells.
  - With `on_map_cells = {"831f80fffffffff"}`, it has 343 cells.
  - A cell not in `on_map_cells` raises `ValueError`.

### `validate` subcommand

Common arguments on every subcommand: `--region` (required), `--regions-root` (default `REGIONS_ROOT`), `--output-root` (default `DEFAULT_OUTPUT_ROOT`), and `--verbose`. `validate` adds `--gmted-dir` (default `DEFAULT_GMTED_DIR`), `--data-root` (default `InputRasterSet().root`), and `--battle` (repeatable).

It fails, with exit code 2, when:

- `LEAFLET_DIR / "leaflet.js"` is missing (the message says to run from the repository root)
- Pillow reports no WebP support
- either shapefile is missing
- GMTED files are missing, fail their checks, or do not cover the DEM bounds
- the DEM is over `dem_max_pixels`
- a battle is not on the map

It prints one `key: value` line per item, in this order:

- region id
- `res_s` and `res_t`
- the count of each role
- the region box (6 decimals)
- one line per zoom from `min_zoom` to `max_native_zoom`, with the x range, y range, and tile count
- the total tile count
- the strategic composite size
- the DEM bounds (6 decimals) and DEM pixel count
- `gmted coverage: ok`
- `shapefiles: ok`
- for each battle: its role, cell count, core count, box (6 decimals), and zoom-9 crop size with and without the pad

Exit codes for every subcommand: 0 on success. 2 for `FileNotFoundError`, `ValueError`, or `KeyError`: print the message to stderr and log it at error. 1 for anything else, after logging the exception at error.

Checks:

1. The tests pass.
2. Run this, and save the output to `.test/basemap/western_europe/logs/validate.txt`. Every extent, count, and size must match [Verified Facts](#verified-facts) exactly. The DEM pixel count must be under 600,000,000:

   ```powershell
   python -m scripts.basemap_pipeline.basemap_cli validate --region western_europe --battle 831f80fffffffff
   ```

3. Running `validate --region western_europe --battle 8928308280fffff` must exit 2 with a message saying the battle hex is not on the map. Running `validate --region no_such_region` must exit 2.

## Phase 4: DEM Mosaic

Finish `dem_source.py` and add the `dem` subcommand (it takes `--gmted-dir`).

- `GMTED_PIXEL_DEG: Final = 1.0 / 480.0` and `GMTED_NODATA: Final = -32768`.
- `find_gmted_files(gmted_dir) -> list[Path]`: sorted `.tif` files whose lowercase name contains `GMTED_FILE_MARKER`. Raises `FileNotFoundError` when there are none.
- `GmtedFileInfo` (frozen dataclass: `path`, `box: LonLatBox`, `origin_x`, `origin_y`) and `describe_gmted_file(path) -> GmtedFileInfo`. Raises `ValueError` naming the file unless the CRS is EPSG:4326, both resolutions are within 1e-9 of `GMTED_PIXEL_DEG`, the dtype is `int16`, the band count is 1, and nodata is `GMTED_NODATA`.
- `dem_bounds_for(region_box, settings) -> LonLatBox`: `box_of_tile_range(tile_range_for_box(region_box, settings.min_zoom))`, widened by `settings.dem_margin_deg` on every side.
- `dem_pixel_count(bounds) -> int`: `ceil((east - west) / GMTED_PIXEL_DEG) * ceil((north - south) / GMTED_PIXEL_DEG)`.
- `require_dem_size(bounds, settings)`: raise `ValueError` when `dem_pixel_count` exceeds `settings.dem_max_pixels`. The message gives both numbers and says the region is too large for this prototype's in-memory mosaic.
- `require_gmted_coverage(infos, bounds)`: sample a grid of points every 0.25 degrees across `bounds` (edges included). Each point must fall inside some file's box, with a tolerance of 0.01 degrees. Otherwise raise `ValueError` listing up to five uncovered points.
- `build_dem_mosaic(infos, bounds, out_path) -> Path`:
  1. Snap `bounds` outward to the first file's pixel grid. With origin `x0`, `y0` and pixel size `r`:
     - west = `x0 + floor((west - x0) / r) * r`
     - east = `x0 + ceil((east - x0) / r) * r`
     - north = `y0 - floor((y0 - north) / r) * r`
     - south = `y0 - ceil((y0 - south) / r) * r`
  2. With every file open, call `rasterio.merge.merge(datasets, bounds=(west, south, east, north), nodata=GMTED_NODATA)`.
  3. Write the result as a tiled (256), DEFLATE-compressed int16 GeoTIFF with nodata set, and return its path.

  Peak memory is about 1.5 GB.
- `read_dem_3857`, exactly as below (add the docstring):

  ```python
  def read_dem_3857(
      dataset: rasterio.DatasetReader,
      bounds_3857: tuple[float, float, float, float],
      shape: tuple[int, int],
      resampling: Resampling,
  ) -> np.ndarray:
      rows, cols = shape
      destination = np.full(shape, np.nan, dtype=np.float32)
      reproject(
          source=rasterio.band(dataset, 1),
          destination=destination,
          src_nodata=dataset.nodata,
          dst_transform=rasterio.transform.from_bounds(*bounds_3857, width=cols, height=rows),
          dst_crs="EPSG:3857",
          dst_nodata=np.nan,
          resampling=resampling,
      )
      destination[~np.isfinite(destination)] = 0.0
      return destination
  ```

  Missing data becomes sea level, which matches open ocean. Callers pass `Resampling.bilinear` at `max_native_zoom` and `Resampling.average` below it.

The `dem` subcommand loads the region, validates the GMTED files, checks the DEM size and coverage of `dem_bounds_for(region box)`, writes `paths.dem_path`, and prints the elapsed time.

Checks:

1. Run `python -m scripts.basemap_pipeline.basemap_cli dem --region western_europe 2>&1 | Tee-Object -FilePath .test/basemap/western_europe/logs/dem.log`. It exits 0.
2. Save as `.test/basemap/checks/check_dem.py` and run it. Every named point must print `OK`. Record the `biscay` value; it must be -32768 or 0.

   ```python
   import rasterio

   POINTS = {
       "rhine_plain": (7.60, 48.30, 100, 250),
       "beauce": (1.70, 48.25, 100, 200),
       "feldberg": (8.004, 47.874, 1200, 1500),
       "mont_blanc": (6.865, 45.833, 3800, 4810),
   }
   with rasterio.open(".test/basemap/western_europe/work/dem_4326.tif") as ds:
       print("crs", ds.crs, "res", ds.res, "size", ds.width, ds.height, "nodata", ds.nodata)
       print("bounds", ds.bounds)
       for name, (lon, lat, low, high) in POINTS.items():
           value = int(next(ds.sample([(lon, lat)]))[0])
           print(name, value, "OK" if low <= value <= high else "OUT OF RANGE")
       print("biscay", int(next(ds.sample([(-4.0, 45.5)]))[0]))
   ```

3. The printed bounds contain west -12.25, south 30.952162, east 23.5, north 62.606396.

## Phase 5: Shading Math

Create `terrain_shading.py` and `tests/test_terrain_shading.py`. This module is pure numpy and scipy, with no file access. It imports `EARTH_RADIUS_M` from `web_mercator.py` and `BasemapStyle` from `basemap_settings.py`. Write these functions exactly, adding the required docstrings:

```python
def row_ground_spacing_m(top_y_3857: float, rows: int, pixel_size: float) -> np.ndarray:
    centers = top_y_3857 - (np.arange(rows) + 0.5) * pixel_size
    latitudes = np.arctan(np.sinh(centers / EARTH_RADIUS_M))
    return pixel_size * np.cos(latitudes)


def surface_gradients(dem: np.ndarray, spacing_rows: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    d_row, d_col = np.gradient(dem.astype(np.float64))
    spacing = spacing_rows[:, None]
    rise_east = d_col / spacing
    rise_north = -d_row / spacing  # rows run south
    return rise_east, rise_north


def slope_degrees(rise_east: np.ndarray, rise_north: np.ndarray) -> np.ndarray:
    return np.degrees(np.arctan(np.hypot(rise_east, rise_north)))


def flat_illumination(style: BasemapStyle) -> float:
    return math.sin(math.radians(style.light_altitude_deg))


def illumination(rise_east: np.ndarray, rise_north: np.ndarray, style: BasemapStyle) -> np.ndarray:
    azimuth = math.radians(style.light_azimuth_deg)
    altitude = math.radians(style.light_altitude_deg)
    light_east = math.sin(azimuth) * math.cos(altitude)
    light_north = math.cos(azimuth) * math.cos(altitude)
    light_up = math.sin(altitude)
    length = np.sqrt(rise_east * rise_east + rise_north * rise_north + 1.0)
    return np.clip((-rise_east * light_east - rise_north * light_north + light_up) / length, 0.0, 1.0)


def smooth(values: np.ndarray, sigma_px: float) -> np.ndarray:
    if sigma_px <= 0.0:
        return values.astype(np.float64, copy=True)
    return scipy.ndimage.gaussian_filter(values.astype(np.float64), sigma=sigma_px, mode="nearest")


def flat_weight(slope_deg: np.ndarray, style: BasemapStyle) -> np.ndarray:
    if not style.flatten_gentle_terrain:
        return np.ones(slope_deg.shape, dtype=np.float64)
    span = style.full_relief_slope_deg - style.flat_slope_deg
    t = np.clip((slope_deg - style.flat_slope_deg) / span, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def zoom_exaggeration(zoom: int, max_native_zoom: int, style: BasemapStyle) -> float:
    return style.zoom_exaggeration_step ** (max_native_zoom - zoom)


def land_tone(deviation: np.ndarray, weight: np.ndarray, style: BasemapStyle) -> np.ndarray:
    flat = flat_illumination(style)
    scaled = style.contrast_gain * weight * deviation
    dark_scale = (style.flat_tone - style.shadow_tone) / flat
    light_scale = (style.highlight_tone - style.flat_tone) / (1.0 - flat)
    tone = np.where(scaled < 0.0, style.flat_tone + scaled * dark_scale, style.flat_tone + scaled * light_scale)
    return np.clip(tone, style.shadow_tone, style.highlight_tone)


def tone_to_gray(tone: np.ndarray) -> np.ndarray:
    return np.rint(tone * 255.0).astype(np.uint8)
```

### `tests/test_terrain_shading.py`

Build planes directly from rises. For a slope of `s` degrees, set `rise = tan(s)`. For a plane facing northeast, set `rise_east = rise_north = -tan(20°)/sqrt(2)`.

- Flat terrain (zero rises):
  - illumination equals `flat_illumination`
  - for both styles, `tone_to_gray(land_tone(...))` is exactly 210 everywhere
  - `flat_weight` is exactly 0 for `STYLIZED_STYLE`
- 10° slopes: west-facing (`rise_east = +tan`) and north-facing (`rise_north = -tan`) planes are brighter than flat, and east-facing and south-facing planes are darker.
- The northeast-facing 20° plane: its illumination is within 0.05 of flat, but `flat_weight(slope_degrees(...), STYLIZED_STYLE)` is exactly 1, and its stylized gray is not 210. This test protects the decision to key flattening to slope.
- `flat_weight` for `STYLIZED_STYLE` is exactly 0 at 1°, exactly 1 at 10°, and strictly between 0 and 1 at 3.5°. For `PLAIN_STYLE` it is 1 at 0°.
- `surface_gradients` on a DEM that rises 100 m per column, with 1,000 m spacing everywhere, gives `rise_east` of 0.1 and `rise_north` of 0 in the interior.
- With the same negative deviation and weight 1, the stylized tone's distance from `flat_tone` is larger than the plain tone's (contrast gain).

Checks: all tests pass.

## Phase 6: Flat-Weight Raster

Create `flat_weight_raster.py` and the `weights` subcommand.

- `weight_raster_range(region_box, settings) -> TileRange`: `range_at_zoom(tile_range_for_box(region_box, settings.min_zoom), settings.max_native_zoom)`.
- `write_flat_weight_raster(dem_path, region_box, out_path, settings) -> Path`:
  1. Create a GeoTIFF: EPSG:3857, `uint8`, one band, tiled at 256, DEFLATE, no nodata. With `px = pixel_size_m(max_native_zoom)`, the transform is `from_origin(left, top, px, px)` using the range's 3857 corners. The width and height are the range's tile counts times 256.
  2. For each block from `blocks_for_range(range, settings.block_tiles)`:
     1. Read the DEM over the block bounds widened by `halo_px * px`, using `read_dem_3857` with bilinear resampling.
     2. Compute spacing with `row_ground_spacing_m(top + halo_px * px, rows, px)`, then the gradients and `slope_degrees`, with no exaggeration.
     3. Apply `smooth(slope, STYLIZED_STYLE.slope_smoothing_sigma_px)`, then `flat_weight(..., STYLIZED_STYLE)`.
     4. Crop the halo, and write `np.rint(weight * 255)` as `uint8` at `Window((block.x_min - range.x_min) * 256, (block.y_min - range.y_min) * 256, block.width_px(), block.height_px())`.
  3. Reopen in `r+` mode and call `build_overviews([2, 4, 8, 16], Resampling.average)`.
- `read_flat_weight(dataset, block) -> np.ndarray`:
  1. Compute the window from `block.bounds_3857()` and the dataset transform:
     - `col_off = (left - ds_left) / px9`
     - `row_off = (ds_top - top) / px9`
     - `width = (right - left) / px9`
     - `height = (top - bottom) / px9`
  2. Raise `ValueError` if any of these is more than 1e-6 from an integer.
  3. Read with `out_shape=(block.height_px(), block.width_px())` and `resampling=Resampling.average`, and return `values / 255.0` as float64.
- `write_flat_weight_preview(weight_path, png_path)`: read the band at 1/16 size and save it as a grayscale PNG.

The `weights` subcommand raises `FileNotFoundError` saying "run dem first" when `paths.dem_path` is missing. It then writes the raster and the preview and prints the elapsed time.

Checks:

1. Run `weights` with output to `logs/weights.log`. It exits 0.
2. Save as `.test/basemap/checks/check_weights.py` and run it. It must print width 12288, height 16384, resolution 305.748113140705, and overviews `[2, 4, 8, 16]`, and both `alps_eiger` and `vosges_hohneck` must print `max 255`. Record every other value:

   ```python
   import rasterio
   from rasterio.windows import Window
   from pyproj import Transformer

   to_3857 = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
   WINDOWS = {
       "alps_eiger": (8.005, 46.577),
       "vosges_hohneck": (7.02, 48.04),
       "rhine_plain": (7.60, 48.30),
       "beauce": (1.70, 48.25),
   }
   with rasterio.open(".test/basemap/western_europe/work/flat_weight_z9.tif") as ds:
       print("size", ds.width, ds.height, "res", ds.res, "overviews", ds.overviews(1))
       for name, (lon, lat) in WINDOWS.items():
           row, col = ds.index(*to_3857.transform(lon, lat))
           data = ds.read(1, window=Window(col - 8, row - 8, 17, 17))
           print(name, "max", int(data.max()), "mean", round(float(data.mean()), 1))
       small = ds.read(1, out_shape=(ds.height // 16, ds.width // 16))
       print("share zero", round(float((small == 0).mean()), 3), "share full", round(float((small == 255).mean()), 3))
   ```

3. Record: if your tools can display images, open `work/flat_weight_preview.png`. Note whether the Alps, Pyrenees, Massif Central, Vosges, and Black Forest show light, whether the Paris basin, North German Plain, and Rhine valley floor show dark, and anything else that stands out. If you cannot view images, write "not viewed".

## Phase 7: Water Coverage

Create `water_coverage.py` and `tests/test_water_coverage.py`.

- `load_water_geometry_3857(data_root, clip_box, paths) -> BaseGeometry`. The cache description is `{"clip_box": [west, south, east, north], "ocean": "<path>", "lakes": "<path>"}`, with paths as strings.
  - When `paths.water_cache_path` and `paths.water_cache_info_path` both exist, and the stored description equals the current one, load the cache with `shapely.wkb.loads` and return it.
  - Otherwise:
    1. Call `load_ocean_union_wgs84` for `data_root / InputRasterSet().ocean_shapefile_name` and for `data_root / InputRasterSet().lake_shapefile_name`, and take their `unary_union`.
    2. Clip it with `clip_polygonal_to_bounds` to `(clip_box.west, clip_box.south, clip_box.east, clip_box.north)`.
    3. Project it with `shapely.ops.transform` and a `pyproj.Transformer` from EPSG:4326 to EPSG:3857 with `always_xy=True`, then apply `make_valid`.
    4. Write the WKB and then the description.
  - It prints `water geometry: cached` or `water geometry: built`.
  - Callers always pass `clip_box = dem_bounds_for(region.box, settings)`. The first call takes a few minutes, because it dissolves the global ocean.
- `water_coverage`, exactly as below (add the docstring):

  ```python
  def water_coverage(
      geometry_3857: BaseGeometry,
      bounds_3857: tuple[float, float, float, float],
      shape: tuple[int, int],
      supersample: int,
  ) -> np.ndarray:
      rows, cols = shape
      clipped = clip_polygonal_to_bounds(geometry_3857, bounds_3857)
      if clipped.is_empty:
          return np.zeros(shape, dtype=np.float64)
      fine = rasterize(
          [(clipped, 1)],
          out_shape=(rows * supersample, cols * supersample),
          transform=rasterio.transform.from_bounds(*bounds_3857, width=cols * supersample, height=rows * supersample),
          fill=0,
          dtype="uint8",
          all_touched=False,
      )
      return fine.reshape(rows, supersample, cols, supersample).mean(axis=(1, 3))
  ```

### `tests/test_water_coverage.py`

Use bounds of 0 to 1000 by 0 to 1000 m, a shape of 10 by 10, and a supersample of 4.

- With water from x 0 to 500 (full height), the left five columns are exactly 1 and the right five exactly 0.
- With the water edge at x 550, column 5 is exactly 0.5.
- An empty polygon gives all zeros.

Checks:

1. The tests pass.
2. Save as `.test/basemap/checks/check_water.py` and run it. `biscay` and `lake_geneva` must print 1.0, and `rhine_plain` must print 0.0:

   ```python
   import pathlib, sys
   sys.path.insert(0, str(pathlib.Path.cwd()))
   from pyproj import Transformer
   from scripts.basemap_pipeline.basemap_settings import DEFAULT_SETTINGS, OutputPaths, DEFAULT_OUTPUT_ROOT
   from scripts.basemap_pipeline.dem_source import dem_bounds_for
   from scripts.basemap_pipeline.water_coverage import load_water_geometry_3857, water_coverage
   from scripts.basemap_pipeline.web_mercator import LonLatBox
   from scripts.terrain_pipeline.config import InputRasterSet

   region_box = LonLatBox(-8.576452, 39.009320, 18.306518, 56.943588)
   paths = OutputPaths(DEFAULT_OUTPUT_ROOT, "western_europe")
   geometry = load_water_geometry_3857(InputRasterSet().root, dem_bounds_for(region_box, DEFAULT_SETTINGS), paths)
   to_3857 = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
   for name, (lon, lat) in {"biscay": (-4.0, 45.5), "lake_geneva": (6.55, 46.45), "rhine_plain": (7.60, 48.30)}.items():
       x, y = to_3857.transform(lon, lat)
       coverage = water_coverage(geometry, (x - 50.0, y - 50.0, x + 50.0, y + 50.0), (1, 1), 4)
       print(name, float(coverage[0, 0]))
   ```

   The first run prints `water geometry: built`. Run it again: it must print `water geometry: cached`. In Phase 8, both `tiles` logs must show `water geometry: cached`.

## Phase 8: Tiles

Create `tile_rendering.py`, `tile_store.py`, `tests/test_tile_store.py`, and the `tiles` subcommand (`--style`, required, with the choices from `STYLES_BY_NAME`, and `--data-root`).

### `tile_rendering.py`

- `RenderContext` (frozen dataclass): `dem_dataset`, `weight_dataset` (or `None` for plain), `water_geometry_3857`, and `settings`.
- `land_with_water_alpha(gray, coverage) -> np.ndarray` returns an RGBA `uint8` array:
  - RGB is `gray` in all three channels.
  - Alpha is `np.rint(255 * (1 - coverage))`.
  - Where alpha is 0, RGB is 0.
- `render_block(context, block, style) -> np.ndarray` returns an RGBA `uint8` array of shape `(height_px, width_px, 4)`:
  1. `px = pixel_size_m(block.zoom)`, `halo = settings.halo_px`, and halo bounds are the block bounds widened by `halo * px`.
  2. Get the DEM from `read_dem_3857` over the halo bounds, with shape `(height + 2 * halo, width + 2 * halo)`. Use bilinear resampling at `max_native_zoom` and average below it.
  3. Get spacing from `row_ground_spacing_m(top + halo * px, rows, px)`, then the rises from `surface_gradients`.
  4. With `factor = zoom_exaggeration(block.zoom, settings.max_native_zoom, style)`, compute `deviation = smooth(illumination(rise_east * factor, rise_north * factor, style) - flat_illumination(style), style.shade_blur_sigma_px)`, then crop the halo.
  5. The weight is `read_flat_weight(context.weight_dataset, block)` when `style.flatten_gentle_terrain`, otherwise ones. Raise `ValueError` when the style flattens but `weight_dataset` is `None`.
  6. Compute `gray = tone_to_gray(land_tone(deviation, weight, style))` and `coverage = water_coverage(context.water_geometry_3857, block.bounds_3857(), core shape, settings.water_supersample)`, then return `land_with_water_alpha(gray, coverage)`.
- `split_block(rgba, block)` yields `(x, y, tile_rgba)` for each tile, in row-major order.

### `tile_store.py`

- `is_uniform(rgba) -> bool`: every pixel equals `rgba[0, 0]`.
- `decode_tile(data) -> np.ndarray`: decode with Pillow and return an RGBA `uint8` array.
- `MbtilesMetadata` (frozen dataclass): `name`, `description`, `attribution`, `bounds: LonLatBox`, `min_zoom`, `max_zoom`.
- `TileStats` (frozen dataclass):
  - Read-only per-zoom mappings `tiles`, `uniform_flat_land`, `uniform_water`, `uniform_other`, and `encoded_bytes`, plus `unique_images` and `unique_bytes`.
  - `to_json() -> dict`, whose keys are exactly these field names. Per-zoom mappings are keyed by the zoom as a string, for example `{"uniform_flat_land": {"5": 0, "9": 41}}`.
  - `TileStats.from_json(document)`.
- `MbtilesWriter(path, metadata, webp_quality, webp_method, flat_land_gray)` is a context manager. It keeps its own counters while it runs.
  - On enter, delete any existing file at `path`, create the parent folder, and create this schema:

    ```sql
    CREATE TABLE metadata (name TEXT, value TEXT);
    CREATE TABLE map (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_id TEXT);
    CREATE TABLE images (tile_id TEXT, tile_data BLOB);
    CREATE UNIQUE INDEX map_index ON map (zoom_level, tile_column, tile_row);
    CREATE UNIQUE INDEX images_id ON images (tile_id);
    CREATE VIEW tiles AS
      SELECT map.zoom_level AS zoom_level, map.tile_column AS tile_column, map.tile_row AS tile_row, images.tile_data AS tile_data
      FROM map JOIN images ON images.tile_id = map.tile_id;
    ```

  - `add_tile(zoom, x, y, rgba) -> bytes`:
    1. `tile_id` is the SHA-256 hex digest of `rgba.tobytes()`.
    2. When the id is new, encode with Pillow as WebP at `quality=webp_quality` and `method=webp_method`: `Image.fromarray(rgba[..., :3])` when every alpha is 255, otherwise `Image.fromarray(rgba)`. Do not pass `mode`. Insert the result into `images`.
    3. Always insert into `map`, with `tile_row = tms_row(y, zoom)`.
    4. Update the counters. A uniform tile counts as water when its alpha is 0, as flat land when it is opaque with gray `flat_land_gray`, and otherwise as other.
    5. Return the encoded bytes.
  - On a clean exit, write the `metadata` rows (`name`, `format` = `webp`, `bounds` = `"west,south,east,north"`, `minzoom`, `maxzoom`, `type` = `baselayer`, `version` = `1`, `description`, `attribution`) and commit. On an exception, close without committing and let it propagate.
  - `stats() -> TileStats` builds a new frozen record from the counters.
- `write_tile_file(root, zoom, x, y, data)`: write `root / str(zoom) / str(x) / f"{y}.webp"`, creating folders as needed.
- `read_tile(mbtiles_path, zoom, x, y) -> bytes | None`: select from the `tiles` view with the TMS row.

### `tests/test_tile_store.py`

Write four 256-pixel tiles into a temporary MBTiles, all at zoom 9:

- A: uniform opaque gray 210, at x 1, y 2
- B: identical to A, at x 1, y 3
- C: random opaque gray, at x 2, y 2
- D: fully transparent, at x 2, y 3

Check that:

- `map` has 4 rows and `images` has 3.
- The `tiles` view returns 4 rows, and `read_tile` finds each tile by its XYZ coordinates.
- A decodes to exactly gray 210 with alpha 255 everywhere, and D decodes with alpha 0 everywhere.
- `metadata` has `format` set to `webp` and the zoom range.
- The stats count 2 flat-land tiles and 1 water tile.

### `tiles` subcommand

1. Open `paths.dem_path`. For stylized, also open `paths.weight_path`:
   - When the weight raster is missing, raise `FileNotFoundError` saying "run weights first".
   - When it is older than the DEM, raise `ValueError` saying "run weights again".
2. Load the water geometry with `load_water_geometry_3857(data_root, dem_bounds_for(region.box, settings), paths)` and build a `RenderContext`.
3. Delete `paths.tiles_dir(style)` if it exists, so stale tiles cannot survive.
4. Open an `MbtilesWriter` on `paths.mbtiles_path(style)`, with:
   - `flat_land_gray = int(tone_to_gray(np.array(style.flat_tone)))`
   - `name` `<region_id>_<style>`
   - the region box as bounds
   - attribution `Elevation: GMTED2010 courtesy of the U.S. Geological Survey. Water: Made with Natural Earth.`
5. For each zoom from `min_zoom` to `max_native_zoom`:
   1. Take `tile_range_for_box(region.box, zoom)` and each block from `blocks_for_range`.
   2. For each block, call `render_block` and `split_block`. Add each tile to the writer, and write it with `write_tile_file` under `paths.tiles_dir(style)`.
   3. Print one line: tiles, uniform counts, encoded KB, and elapsed seconds.
6. Write the stats JSON to `paths.stats_path(style)`.

Checks:

1. The tests pass.
2. Run `tiles --region western_europe --style plain`, then `tiles --region western_europe --style stylized`, each with output to its own log. Both exit 0, and both logs show `water geometry: cached`.
3. Each style's per-zoom tile counts are 12, 36, 110, 420, and 1,560 (2,138 in total). `SELECT COUNT(*) FROM tiles` in each MBTiles is 2,138. Each tile folder holds 2,138 `.webp` files:

   ```powershell
   foreach ($s in 'plain','stylized') { (Get-ChildItem .test/basemap/western_europe/tiles/$s -Recurse -Filter *.webp).Count }
   ```

4. Save as `.test/basemap/checks/check_tiles.py` and run it. These must hold:
   - `biscay` prints `transparent` in both styles.
   - `eiger` prints `varied` in both styles.
   - The stylized total of flat-land uniform tiles is at least the plain total.

   Record both totals and the per-zoom counts.

   ```python
   import json, pathlib, sys
   sys.path.insert(0, str(pathlib.Path.cwd()))
   from scripts.basemap_pipeline.tile_store import decode_tile, is_uniform, read_tile
   from scripts.basemap_pipeline.web_mercator import lonlat_to_tile

   base = ".test/basemap/western_europe"
   for style in ("plain", "stylized"):
       for name, (lon, lat) in {"biscay": (-4.0, 45.5), "eiger": (8.005, 46.577)}.items():
           x, y = lonlat_to_tile(lon, lat, 9)
           rgba = decode_tile(read_tile(f"{base}/western_europe_{style}.mbtiles", 9, x, y))
           kind = "transparent" if (rgba[..., 3] == 0).all() else ("uniform" if is_uniform(rgba) else "varied")
           print(style, name, kind)
       stats = json.loads(pathlib.Path(f"{base}/work/tile_stats_{style}.json").read_text(encoding="utf-8"))
       print(style, "flat-land uniform total", sum(stats["uniform_flat_land"].values()), "by zoom", stats["uniform_flat_land"])
   ```

5. Save as `.test/basemap/checks/check_seams.py` and run it. For both styles, `ratio` must be 1.5 or less. A larger ratio means block edges differ from tile edges, which points to a halo or alignment bug:

   ```python
   import pathlib, sys
   sys.path.insert(0, str(pathlib.Path.cwd()))
   import numpy as np
   from scripts.basemap_pipeline.tile_store import decode_tile, read_tile

   base = ".test/basemap/western_europe"
   X0, X1, Y0, Y1, BLOCK = 243, 282, 157, 195, 8
   for style in ("plain", "stylized"):
       path = f"{base}/western_europe_{style}.mbtiles"
       cache = {}
       def tile(x, y):
           if (x, y) not in cache:
               cache[(x, y)] = decode_tile(read_tile(path, 9, x, y)).astype(float)
           return cache[(x, y)]
       block_diffs, tile_diffs = [], []
       for y in range(Y0, Y1 + 1):
           for x in range(X0, X1):
               left, right = tile(x, y), tile(x + 1, y)
               opaque = (left[:, -1, 3] == 255) & (right[:, 0, 3] == 255)
               if opaque.sum() < 128:
                   continue
               diff = float(np.abs(left[:, -1, 0] - right[:, 0, 0])[opaque].mean())
               (block_diffs if (x + 1 - X0) % BLOCK == 0 else tile_diffs).append(diff)
       ratio = np.mean(block_diffs) / max(np.mean(tile_diffs), 1e-9)
       print(style, "block seams", len(block_diffs), round(float(np.mean(block_diffs)), 3),
             "tile seams", len(tile_diffs), round(float(np.mean(tile_diffs)), 3), "ratio", round(float(ratio), 3))
   ```

## Phase 9: Composites

Finish `composites.py` and add the `composites` subcommand (`--battle`, repeatable, at least one required).

- `CompositeFrame` (frozen dataclass): `image` (a Pillow RGB image), `left_px`, `top_px`, `zoom`, and `clamped: bool`.
- `stitch_box(mbtiles_path, zoom, box, pad_px) -> CompositeFrame`:
  1. Take `crop_rect(box, zoom, pad_px)`.
  2. Clamp it to the pixel extent of `tile_range_for_box(region box, zoom)`, which the caller passes through a parameter object (see below). Set `clamped` when anything changed.
  3. Make an RGBA canvas filled with `PREVIEW_WATER_RGB` and alpha 255, covering tile columns `left // 256` through `(right - 1) // 256` and the matching rows.
  4. For each tile, `canvas.alpha_composite(Image.fromarray(decode_tile(data)), dest=(px, py))`. Let Pillow infer the mode from the array shape, and do not pass `mode`. Raise `ValueError` naming `z/x/y` for any missing tile.
  5. Crop to the rectangle and convert to RGB.

  Use a frozen `CompositeRequest(mbtiles_path, zoom, box, pad_px, rendered_range)` as the single parameter, to stay within the parameter limit.
- `draw_cell_outlines(frame, colored_cells) -> Image`: on a copy of the image, using `ImageDraw.Draw(copy, "RGBA")`, draw each `(cell, rgba)` polygon outline (width 1) at `global_pixel(lng, lat, zoom)` minus `(left_px, top_px)`, for each vertex of `h3.cell_to_boundary(cell)`.
- `write_strategic_composites(paths, region, settings)`: for each style, stitch the region box at `strategic_composite_zoom` with no pad. Save `strategic_z<zoom>_<style>.png` bare, then `strategic_z<zoom>_<style>_hexes.png` with every strategic cell outlined in `ROLE_OUTLINE_RGBA[role]`.
- `write_battle_composites(paths, region, footprint, tactical_rows, settings)`: for each style, stitch `cells_box(footprint.cells)` at `tactical_composite_zoom` with `battle_pad_px`.
  - Save `battle_<cell>_z<zoom>_<style>.png` bare.
  - Then save `battle_<cell>_z<zoom>_<style>_cells.png` with every footprint cell outlined in the color for its `classify_metadata_row_without_urban(row, ClassifierThresholds())` result.
  - Print a note when the frame was clamped.

The subcommand raises `FileNotFoundError` saying "run tiles first" when either MBTiles file is missing. It writes the strategic set once and a battle set for each `--battle`.

Checks:

1. Run `composites --region western_europe --battle 831f80fffffffff`. It exits 0, writes 8 PNG files, and prints no clamp note.
2. Strategic composites are 1,225 by 1,238 pixels. Battle composites are 898 by 846.
3. Save as `.test/basemap/checks/check_composites.py` and run it. These must hold:
   - Every `mismatches` value is 0. The composites must equal the tiles pixel for pixel, which proves stitching has no offset.
   - The stylized `flat_mean_offset` is smaller than the plain one.
   - The stylized `flat_exact_share` is larger than the plain one.
   - The stylized `steep_std` is larger than the plain one.

   ```python
   import json, pathlib, random, sys, zipfile
   sys.path.insert(0, str(pathlib.Path.cwd()))
   import h3
   import numpy as np
   from PIL import Image, ImageDraw
   from scripts.basemap_pipeline.basemap_settings import PREVIEW_WATER_RGB
   from scripts.basemap_pipeline.battle_footprint import battle_footprint
   from scripts.basemap_pipeline.composites import crop_rect
   from scripts.basemap_pipeline.region_inputs import cells_box
   from scripts.basemap_pipeline.tile_store import decode_tile, read_tile
   from scripts.basemap_pipeline.web_mercator import LonLatBox, global_pixel

   base = ".test/basemap/western_europe"
   region = "data/generated/regions/western_europe"
   manifest = json.load(zipfile.ZipFile(f"{region}/region_manifest.json.zip").open("region_manifest.json"))
   rows = {r["h3_index"]: r for r in json.load(zipfile.ZipFile(f"{region}/terrain_res_t_metadata.json.zip").open("terrain_res_t_metadata.json"))["records"]}
   footprint = battle_footprint("831f80fffffffff", {h["h3_index"] for h in manifest["hexes"]}, 6)
   region_box = LonLatBox(-8.576452112070514, 39.00932034069168, 18.306517515815266, 56.943587737159774)
   frames = {
       "strategic": (6, crop_rect(region_box, 6, 0), "strategic_z6_{style}.png"),
       "battle": (9, crop_rect(cells_box(footprint.cells), 9, 20), "battle_831f80fffffffff_z9_{style}.png"),
   }

   def tile_over_water(style, zoom, x, y):
       canvas = Image.new("RGBA", (256, 256), (*PREVIEW_WATER_RGB, 255))
       canvas.alpha_composite(Image.fromarray(decode_tile(read_tile(f"{base}/western_europe_{style}.mbtiles", zoom, x, y))))
       return np.asarray(canvas.convert("RGB"))

   random.seed(7)
   for name, (zoom, (left, top, right, bottom), pattern) in frames.items():
       for style in ("plain", "stylized"):
           image = np.asarray(Image.open(f"{base}/composites/{pattern.format(style=style)}").convert("RGB"))
           mismatches = 0
           for _ in range(200):
               r, c = random.randrange(image.shape[0]), random.randrange(image.shape[1])
               gx, gy = left + c, top + r
               expected = tile_over_water(style, zoom, gx // 256, gy // 256)[gy % 256, gx % 256]
               mismatches += int((image[r, c] != expected).any())
           print(name, style, "mismatches", mismatches)

   left, top, right, bottom = frames["battle"][1]
   def mask_for(cells):
       mask = Image.new("L", (right - left, bottom - top), 0)
       draw = ImageDraw.Draw(mask)
       for cell in cells:
           draw.polygon([tuple(np.subtract(global_pixel(lng, lat, 9), (left, top))) for lat, lng in h3.cell_to_boundary(cell)], fill=255)
       return np.asarray(mask) > 0

   flat = mask_for([c for c in footprint.cells if (rows[c].get("slope_mean") or 0.0) < 2.0])
   steep = mask_for([c for c in footprint.cells if (rows[c].get("slope_mean") or 0.0) >= 5.0])
   for style in ("plain", "stylized"):
       gray = np.asarray(Image.open(f"{base}/composites/battle_831f80fffffffff_z9_{style}.png").convert("L")).astype(float)
       print(style, "flat_mean_offset", round(float(np.abs(gray[flat] - 210).mean()), 2),
             "flat_exact_share", round(float((gray[flat] == 210).mean()), 3),
             "steep_std", round(float(gray[steep].std()), 2))
   ```

4. Record: if your tools can display images, open the eight composites. Note whether the Rhine valley floor reads as flat, whether the Vosges and Black Forest read as strong relief, whether coastlines look smooth, and anything that looks wrong. If you cannot view images, write "not viewed". The owner will review them.

## Phase 10: Preview Page and Report

Create `preview_page.py`, `basemap_report.py`, and the `preview` (`--battle`, repeatable) and `report` subcommands.

### `preview_page.py`

`write_preview(paths, region, footprints, tactical_rows, settings)`:

- Write `paths.preview_dir / "overlays.js"` as `window.BASEMAP_PREVIEW = <json>;`. The JSON object holds:
  - `box` (west, south, east, north), `minZoom` (`min_zoom`), `maxNativeZoom` (`max_native_zoom`), and `maxZoom` (`preview_max_zoom`).
  - `strategicHexes`: a GeoJSON FeatureCollection of the strategic cells, each with `role` and `color` properties.
  - `battles`: a list of `{cell, cells}`, where `cells` is a FeatureCollection of footprint cells with `terrain` and `color` properties.

  Rings are `[lng, lat]` and closed, so the first point is repeated. Colors are `#rrggbb` strings from the RGBA tables, without alpha.
- Write `paths.preview_dir / "index.html"` from this `string.Template`:
  - `$leaflet_dir` is `os.path.relpath(LEAFLET_DIR.resolve(), paths.preview_dir.resolve())` with forward slashes. When `relpath` raises `ValueError` (different drives), use `LEAFLET_DIR.resolve().as_uri()`.
  - `$water_css` is `PREVIEW_WATER_RGB` as `#rrggbb`.
  - `$title` is `"<display name> basemap preview"`.

  The subcommand raises `FileNotFoundError` saying "run tiles first" when either tile folder is missing.

  ```html
  <!doctype html>
  <html lang="en">
  <head>
  <meta charset="utf-8">
  <title>$title</title>
  <link rel="stylesheet" href="$leaflet_dir/leaflet.css">
  <style>html, body, #map { height: 100%; margin: 0; background: $water_css; }</style>
  </head>
  <body>
  <div id="map"></div>
  <script src="$leaflet_dir/leaflet.js"></script>
  <script src="overlays.js"></script>
  <script>
  const data = window.BASEMAP_PREVIEW;
  const bounds = L.latLngBounds([[data.box.south, data.box.west], [data.box.north, data.box.east]]);
  const tileOptions = { minZoom: data.minZoom, maxNativeZoom: data.maxNativeZoom, maxZoom: data.maxZoom, bounds: bounds };
  const stylized = L.tileLayer('../tiles/stylized/{z}/{x}/{y}.webp', tileOptions);
  const plain = L.tileLayer('../tiles/plain/{z}/{x}/{y}.webp', tileOptions);
  const map = L.map('map', { minZoom: data.minZoom, maxZoom: data.maxZoom, layers: [stylized] });
  const outline = (feature) => ({ color: feature.properties.color, weight: 1, fill: false });
  const overlays = { 'Strategic hexes': L.geoJSON(data.strategicHexes, { style: outline }) };
  for (const battle of data.battles) overlays['Battle ' + battle.cell] = L.geoJSON(battle.cells, { style: outline });
  L.control.layers({ 'Stylized': stylized, 'Plain': plain }, overlays, { collapsed: false }).addTo(map);
  map.fitBounds(bounds);
  </script>
  </body>
  </html>
  ```

### `basemap_report.py`

`write_report(paths) -> dict` reads both stats JSON files and the two MBTiles file sizes, then writes:

- `report.json`, holding for each style: the per-zoom stats, totals, `unique_images`, `unique_bytes`, and `mbtiles_bytes`; plus `stylized_vs_plain_unique_bytes_pct` = `100 * (stylized / plain - 1)` rounded to 1 decimal.
- `report.md`: a table with one row per zoom per style (tiles, uniform flat land, uniform water, encoded KB, average KB per tile), then totals and the percentage.

It raises `FileNotFoundError` naming any missing input.

Checks:

1. Run `preview --region western_europe --battle 831f80fffffffff`, then `report --region western_europe`. Both exit 0.
2. `node --check .test/basemap/western_europe/preview/overlays.js` exits 0.
3. Save as `.test/basemap/checks/check_preview.py` and run it. It must print `leaflet found True`:

   ```python
   import pathlib, re, urllib.parse, urllib.request

   preview = pathlib.Path(".test/basemap/western_europe/preview")
   source = re.search(r'src="([^"]*leaflet[.]js)"', (preview / "index.html").read_text(encoding="utf-8")).group(1)
   if source.startswith("file:"):
       path = pathlib.Path(urllib.request.url2pathname(urllib.parse.urlparse(source).path))
   else:
       path = preview / source
   print("leaflet found", path.resolve().is_file())
   ```

4. In `report.json`, each style's per-zoom tiles sum to 2,138. Copy `report.md` into the results file.

## Phase 11: Docs, Test Script, Clean Re-Run, and Results

1. Add `"basemap:test": "python -m unittest discover -s scripts/basemap_pipeline/tests -p \"test_*.py\" -v"` to `package.json` scripts, after `regional:test`. Run `npm run basemap:test`. It passes.
2. Add `all` to the CLI (`--gmted-dir`, `--data-root`, and `--battle`, repeatable and required). It runs `validate`, `dem`, `weights`, `tiles` for plain, `tiles` for stylized, `composites`, `preview`, and `report` in that order, and stops at the first failure with that step's exit code.
3. Write `scripts/basemap_pipeline/README.md` in the voice of `scripts/weather_pipeline/README.md`, with these sections:
   - What it makes, and that the output is a prototype under `.test/`.
   - Inputs, including the GMTED download steps from this plan and `--gmted-dir`.
   - Commands, in order.
   - Outputs.
   - The two styles and their settings, naming `PLAIN_STYLE` and `STYLIZED_STYLE` in `basemap_settings.py`.
   - Why flattening uses slope, not brightness.
   - Why water is transparent and flat land is gray 210. Say that an app using the tiles must draw its water color underneath.
   - The MBTiles layout.
   - Limits: one region at a time, no meridian crossing, the DEM size limit, zooms 5 to 9.
   - Licensing: GMTED2010 courtesy of the U.S. Geological Survey, and Made with Natural Earth.
4. Add one bullet to the Source directory list in `scripts/terrain_pipeline/README.md`: "The basemap prototype reads ocean and lake shapefiles from `--data-root` (default `InputRasterSet.root`) and GMTED2010 from `--gmted-dir`. See [../basemap_pipeline/README.md](../basemap_pipeline/README.md)."
5. Clean re-run: rename `.test/basemap/western_europe` to `.test/basemap/western_europe-first-run`. Create `.test/basemap/western_europe/logs/`, then run `all --region western_europe --battle 831f80fffffffff` with output to `logs/all.log`. It exits 0.
6. Save as `.test/basemap/checks/check_rerun.py` and run it to compare the two runs. It must print `identical`. If it does not, STOP: the output is not deterministic.

   ```python
   import json, pathlib

   def comparable(path):
       document = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
       return {key: ({k: v for k, v in value.items() if k != "mbtiles_bytes"} if isinstance(value, dict) else value)
               for key, value in document.items()}

   first = comparable(".test/basemap/western_europe-first-run/report.json")
   second = comparable(".test/basemap/western_europe/report.json")
   print("identical" if first == second else "DIFFERENT")
   ```

7. Re-run `check_tiles.py`, `check_seams.py`, `check_composites.py`, and `check_preview.py` against the new folder. They pass.
8. Run `npm run terrain:test`, `npm run weather:test`, and `npm run regional:test`. Each must have the same result and failure count as its Phase 1 baseline. A new failure is a regression: STOP.
9. Run `git status --short`. Beyond the files listed in Phase 1, it may show only:
   - `scripts/basemap_pipeline/` (new)
   - `package.json`
   - `scripts/terrain_pipeline/README.md`
   - the results file

   Anything else, STOP.
10. Check `doc/` as `AGENTS.md` describes. No document should need changes, because nothing user-visible or shipped changed. Say so in the results file.
11. Write the results file.

## Stop Protocol

When a check fails or anything is unexpected:

1. Stop work. Do not start the next phase.
2. Write in the results file the phase, the command, the full output, and what you expected.
3. Leave every output in place.
4. Ask the owner how to proceed. Do not change this plan, loosen a check, or work around the problem.

## Results File Template

Create `.spec/regional-basemap-prototype-results.md` with these sections:

```markdown
# Regional Basemap Prototype Results

## Environment
Python, package, Pillow, and libwebp versions. GMTED file names and sizes. Files already changed before starting. Baseline test results.

## Validate Output
Paste of logs/validate.txt. Any difference from Verified Facts.

## DEM
check_dem.py output. The biscay value. Elapsed time.

## Flat Weights
check_weights.py output. What the preview image shows, or "not viewed".

## Water
check_water.py output.

## Tiles
Per-zoom lines printed by each tiles run. check_tiles.py and check_seams.py output. Elapsed time per style.

## Composites
check_composites.py output. What each composite shows, or "not viewed".

## Report
Paste of report.md. The stylized-vs-plain percentage next to the predicted -35%.

## Clean Re-Run
Comparison result. Total elapsed time for `all`.

## Tests
basemap:test, and terrain:test, weather:test, and regional:test against their baselines.

## Changed Files
git status after.

## Docs
Which documents were checked, and why none changed.

## Observations for the Owner
Anything worth tuning: flat thresholds, gain, blur, tones, preview water color, zoom exaggeration.

## Follow-Ups (Not in This Change)
App integration through a custom protocol, with water drawn under the tile layer. Global zooms 0 to 7. The other regions. Removing the Esri and OpenStreetMap providers. The GMTED notice in THIRD-PARTY-NOTICES.md when tiles ship.
```
