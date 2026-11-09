---
name: Antimeridian mask fix plan
overview: "Stop H3 cells that cross the 180-degree meridian from testing against water and urban polygons around the whole world. Split those cells at the seam before the Web Mercator mask tests, regenerate the global pack and the two affected regional packs, prove that only crossing cells changed, and refresh the affected docs."
todos:
  - id: preconditions-baseline
    content: Check tools, inputs, and the database password; copy the committed global and regional JSON into .test/antimeridian/baseline
    status: completed
  - id: qa-tool
    content: Add antimeridian_qa.py (summary, diff) with tests; reproduce the bug numbers from the baseline
    status: completed
  - id: geometry-fix
    content: Add antimeridian.py and ProjectedCell, split crossing cells at the seam, update call sites, add contract tests; run the Python test suites
    status: completed
  - id: probe
    content: Add the probe subcommand; recompute crossing and sample cells against real masks and an independent oracle before the long run
    status: completed
  - id: global-regen
    content: Regenerate global metadata, landmass, and weather; pass every diff gate
    status: completed
  - id: regional-regen
    content: Regenerate australia_new_zealand and eastern_europe metadata, landmass, and weather; re-run economy and check; pass every diff gate
    status: completed
  - id: package-test-docs
    content: Re-zip only changed files, run npm test, update region-summary-1.md and the terrain pipeline README, write the results file
    status: completed
isProject: false
---

# Antimeridian Mask Fix Execution Plan

This file is the plan. Do not revise it while coding. Record what happens in `.spec/antimeridian-mask-fix-results.md` (template at the end).

## The Problem

Battles in hexes on the 180-degree meridian show a vertical line of urban cells. The cause is in the offline terrain pipeline, not the app.

1. `cell_polygon` in [`scripts/terrain_pipeline/sampling.py`](../scripts/terrain_pipeline/sampling.py) shifts a crossing cell's negative longitudes by +360, so a cell from 179.2 to -179.9 becomes one polygon from 179.2 to 180.07. Raster sampling depends on that, and it stays as it is.
2. `_cell_polygon_wgs84_to_3857` in [`scripts/terrain_pipeline/ocean_mask.py`](../scripts/terrain_pipeline/ocean_mask.py) projects that polygon to EPSG:3857. PROJ wraps 180.07 back to -179.93, so the projected cell runs 40,053 km across the whole map. Every water and urban polygon at that latitude then "intersects" the cell.

The app reads `intersects_urban` from `urban_by_scalerank` (`isTacticalUrbanOverlayHex` in `src/main/terrainClassifierFromMetadata.ts`), so those cells show as urban. The same distortion corrupts the water flags and edge counts.

## Verified Facts

These were measured from the committed data on this machine. Phase 2 must reproduce them exactly.

- PROJ maps longitude 180 to x = 20037508.342789244 and -180 to its negative. That value is `math.pi * 6378137.0`. Longitude 180.1 projects to the same x as -179.9.
- On the west side, Natural Earth's ocean (`F:/Data/ne_10m_ocean.shp`) stops at longitude -179.99999999999991, not -180.0. On the east side it reaches 180.0.
- Pole cells contain a pole, and their boundary spans every longitude. There are two per resolution, at `h3.latlng_to_cell(90, 0, res)` and `h3.latlng_to_cell(-90, 0, res)`. At res-1 they are `81033ffffffffff` and `81f2bffffffffff`. Polygon width does not identify them: the res-1 north-pole cell unwraps to under 180 degrees. Identify them by H3 index.
- Walking the meridian (the `_crossing_cells` helper in Phase 3) finds 28, 86, 216, 595, 1,545, and 4,218 non-pole crossing cells at resolutions 1 through 6, in under a second per resolution.
- Every production caller of the mask functions (`metadata_export_core._row_for_cell`, `pipeline.py`, `calibrate.py`) passes `cell_polygon(cell)`, which is always a `Polygon`.
- Landmass `continent_ids` and `island_ids` come only from the geography polygons (`compute_res1_region_membership`), so the fix can change only `water_pct` in landmass files.
- Global res-1 (`terrain_res1_metadata.json`): 842 records. 28 non-pole cells cross 180. None of them is `all_water`, and all 28 have `intersects_water`, including open mid-Pacific ocean.
- Global res-4 (`terrain_res4_metadata.json`): 288,122 records. 595 non-pole cells cross 180:
  - 367 have `intersects_urban`.
  - 340 are urban under the game's rule (scalerank 5 or lower, `is_res4_urban_overlay_row(row, 5)`).
  - 27 are `all_water`, and 580 have `intersects_water`.
- Global urban total, counting urban res-4 cells at scalerank 5 or lower under their res-1 parent: 4,643 urban cells, 283 producing hexes, median 8, 90th percentile 44. Computed with `statistics.quantiles(values, n=10, method="inclusive")[8]`. These are the "4,643 / 283 / 8" in `doc/region-summary-1.md`. Without crossing cells the total is 4,303 / 264 / 8.
- Regional tactical packs with crossing cells: `australia_new_zealand` has 173 crossing cells, 115 of them with any `urban_by_scalerank` entry intersecting. `eastern_europe` has 234 crossing cells, 117 with such an entry. No other region has crossing cells.
- Estimated side-group shares with every crossing urban cell removed: every group stays inside the ±25% band. Australia and New Zealand totals go from 238 to 234 urban cells, and Eastern Europe from 1,182 to 1,156. The largest shift is Urals, Siberia & Far East, from 22.6% to 20.8% against a band of 15.0% to 25.0%.
- Every res-1 parent of a crossing res-4 cell lies within one grid ring of a crossing res-1 cell. Every res-2 parent of a crossing res-5 cell lies within one ring of a crossing res-2 cell. Two or three of those parents do not cross themselves, so one ring is needed.
- Weather search steps (`weather_water_land_steps_for`) are 2 at res-1, 5 at res-2, and 14 at res-3. Both affected regions are res2/res5.
- The app loads only the metadata, naming, landmass, weather, and road and rail JSON files. It does not read the classification CSVs.

## Settled Decisions

- **Fix location:** split crossing cells at the seam for the EPSG:3857 mask tests. Do not change `cell_polygon`, the raster sampling, or the projected mask unions.
- **Unchanged cells:** every cell that does not cross 180, and every pole cell, must produce the same output as today. The diff gates enforce this at record level.
- **Global regeneration:** full re-run of the global metadata, landmass, and weather exports. If any record outside the allowed set differs, STOP and report. Do not try to explain it away.
- **Regional regeneration:** only `australia_new_zealand` and `eastern_europe`, and only the metadata, landmass, and weather steps. Then re-run the economy step for those two regions and update `doc/region-summary-1.md`.
- **Side groups:** membership in `side_group_catalog.py` stays as it is. Use the fallback procedure in Phase 6 only if a group fails the ±25% band.
- **Database password:** the user sets `AGENT_WARS_DB_PASSWORD` as a user environment variable. Load it into the shell without printing it.
- **Out of scope:** road and rail sides, regional origin assignment, regional land overlap or footprint, and pole-cell handling. These are listed under Follow-ups. Do not change them.

## Rules for the Implementing Agent

- Never commit or push. Do not run `git add`, `git commit`, `git push`, `git checkout -- <file>`, `git restore`, `git stash`, or `git reset`.
- Do not put phase numbers, gate names, or any other label from this file into code, comments, tests, docstrings, log messages, or `doc/`. The words "phase" and "gate" must not appear in anything you add outside `.spec/` and `.test/`.
- Finish each phase and pass its checks before starting the next. When a check fails, follow the Stop Protocol. Do not loosen a check, skip a check, or patch data by hand.
- Python style in `scripts/terrain_pipeline/`:
  - Start each module with a one-line docstring.
  - Use `from __future__ import annotations`.
  - Give every function a docstring with "Why this exists:", "When to use:", "What to expect:", and, when it raises, "Exceptions:".
  - Put a `#` comment line above every dataclass field and module constant.
  - Mark constants `Final` and dataclasses `@dataclass(frozen=True)`.
- Logging: use `LOGGER = logging.getLogger(__name__)` and `TRACE_LEVEL` from `.logging_utils`.
  - Per-cell computations that return values without changing state log at `TRACE_LEVEL`. They run hundreds of thousands of times per export, and `--verbose` turns on debug.
  - Splitting a cell logs once at debug.
  - Command entry points log at debug.
  - Every caught exception logs at error before it is re-raised or turned into an exit code.
- Keep every file under 600 lines and every function at 6 named parameters or fewer.
- Tests use `unittest`, like the existing files in `scripts/terrain_pipeline/tests/`. Test contracts only. Do not test private helpers directly or assert log output.
- Never print the database password. Never write it to a file.
- Do not run these commands, because each one rewrites more data than this plan allows:
  - `npm run generated:zip`, `npm run regional:extract`, `npm run regional:zip`, `npm run regional:generate`, `npm run regional:footprint`, and `npm run terrain:generate`.
  - `python -m scripts.terrain_pipeline.cli run`.
  - `metadata_cli run --max-child-cells`, which overwrites the shipped files with partial ones.
  - `regional_cli origins`, except in the Phase 6 fallback.
- Long commands (global metadata, regional runs) run in the background with output redirected to a log under `.test/antimeridian/logs/`. Poll the log tail every few minutes. Do not start a second long run while one is active.
- All scratch output goes under `.test/antimeridian/`, which is gitignored. Create `.test/antimeridian/logs/` at the start.

## Phase 1: Preconditions and Baseline

All of this phase is read-only for tracked files.

1. Run `git status --short` and save the output to `.test/antimeridian/logs/git-status-before.txt`. Files that are already changed are not yours. Do not touch them, and list them in the results file.
2. Check the Python environment. This must print versions with h3 at 4.4 or later and shapely at 2.1 or later:

   ```powershell
   python -c "import h3, shapely, pyproj, rasterio, fiona; print(h3.__version__, shapely.__version__, pyproj.__version__)"
   ```

3. Check the inputs. Every line must print `True`:

   ```powershell
   foreach ($f in 'ne_10m_ocean.shp','ne_10m_lakes.shp','ne_10m_urban_areas.shp','ne_10m_airports.shp','ne_10m_ports.shp','ne_10m_geography_regions_polys.shp','consensus_full_class_1.tif','elevation_50KMma_GMTEDma.tif') { Test-Path "F:/Data/$f" }
   Test-Path F:\Data\worldclim
   (Test-NetConnection localhost -Port 5432 -WarningAction SilentlyContinue).TcpTestSucceeded
   ```

4. Load the password into this shell without printing it. Repeat this in every new shell session before running a metadata command:

   ```powershell
   if (-not $env:AGENT_WARS_DB_PASSWORD) { $env:AGENT_WARS_DB_PASSWORD = [Environment]::GetEnvironmentVariable('AGENT_WARS_DB_PASSWORD','User') }
   if ($env:AGENT_WARS_DB_PASSWORD) { 'password set' } else { 'password NOT set' }
   ```

   If it prints `password NOT set`, STOP and ask the user to set it.
5. Run `python -m scripts.terrain_pipeline.metadata_cli validate --verbose`. It must exit 0.
6. Copy the committed global JSON out of the zips into the baseline folder:

   ```powershell
   python -c "import zipfile, pathlib; src = pathlib.Path('data/generated'); dst = pathlib.Path('.test/antimeridian/baseline/global'); dst.mkdir(parents=True, exist_ok=True); [zipfile.ZipFile(src / (n + '.zip')).extract(n, dst) for n in ('terrain_res1_metadata.json', 'terrain_res4_metadata.json', 'terrain_res1_landmass.json', 'terrain_res1_weather.json')]; print(sorted(p.name for p in dst.iterdir()))"
   ```

7. Check that the working copies in `data/generated/` equal the baseline byte for byte. The extracted JSON is gitignored, and the exports overwrite it, so a difference means local regenerated data that is not in any zip would be lost. If this prints any `False`, STOP and ask the user:

   ```powershell
   python -c "import pathlib; b = pathlib.Path('.test/antimeridian/baseline/global'); [print(p.name, p.read_bytes() == (pathlib.Path('data/generated') / p.name).read_bytes()) for p in sorted(b.iterdir())]"
   ```

8. Copy the committed regional JSON for both regions into the baseline folder:

   ```powershell
   python -c "import zipfile, pathlib; [ (lambda d, o: (o.mkdir(parents=True, exist_ok=True), [zipfile.ZipFile(z).extractall(o) for z in sorted(d.glob('*.json.zip'))]))(pathlib.Path('data/generated/regions') / r, pathlib.Path('.test/antimeridian/baseline/regions') / r) for r in ('australia_new_zealand', 'eastern_europe')]; [print(r, sorted(p.name for p in (pathlib.Path('.test/antimeridian/baseline/regions') / r).glob('*.json'))) for r in ('australia_new_zealand', 'eastern_europe')]"
   ```

   Each region must list 10 files: `region_manifest.json`, `terrain_res_s_metadata.json`, `terrain_res_t_metadata.json`, `terrain_res_s_naming.json`, `terrain_res_t_naming.json`, `terrain_res_s_landmass.json`, `terrain_res_s_weather.json`, `terrain_res_t_road_rail_sides.json`, `terrain_res_t_road_rail_vectors.json`, and `terrain_res_t_origin_units.json`.

Checks: every step above passed, and the baseline folders hold 4 global files and 10 files per region.

## Phase 2: QA Tool and Bug Reproduction

Create `scripts/terrain_pipeline/antimeridian.py` with only the cell predicates for now. Phase 3 adds nothing more to this module. Then create `scripts/terrain_pipeline/antimeridian_qa.py`. Both are permanent, reusable tools. Write them so the next developer can run them after any future regeneration.

### `scripts/terrain_pipeline/antimeridian.py`

```python
"""H3 cells whose boundary crosses the 180-degree meridian, and the Web Mercator constants used to split them."""

from __future__ import annotations

import logging
import math
from typing import Final

import h3

from .logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)

# EPSG:3857 x of longitude 180. PROJ returns exactly this for 180 and its negative for -180.
WEB_MERCATOR_HALF_WIDTH_M: Final = math.pi * 6378137.0

# Distance between the east and west edges of the EPSG:3857 map at any latitude.
WEB_MERCATOR_WORLD_WIDTH_M: Final = 2.0 * WEB_MERCATOR_HALF_WIDTH_M

# Gap left on each side of the 180-degree seam when a cell is split. Natural Earth's west-side ocean
# edge sits at longitude -179.99999999999991, about 1e-8 m short of the map edge, so a piece clipped
# exactly at the seam would not be covered by the ocean.
ANTIMERIDIAN_SEAM_INSET_M: Final = 1.0
```

Functions, with docstrings in the house style:

- `is_pole_cell(cell: str) -> bool`. Returns whether `cell` is `h3.latlng_to_cell(90.0, 0.0, res)` or `h3.latlng_to_cell(-90.0, 0.0, res)`, where `res = h3.get_resolution(cell)`. Logs at trace.
- `crosses_antimeridian(cell: str) -> bool`. Uses the same rule `cell_polygon` uses to decide whether to shift longitudes: the longitudes from `h3.cell_to_boundary(cell)` span more than 180.0. It returns False for pole cells. Logs at trace. The docstring says that pole cells are excluded because no longitude and latitude ring describes a cap around a pole, so they keep the unsplit projection.

### `scripts/terrain_pipeline/antimeridian_qa.py`

This is a command-line tool run as `python -m scripts.terrain_pipeline.antimeridian_qa <command>`. It uses `argparse` subcommands and calls `configure_logging(args.verbose)`. It writes a JSON result to stdout with `json.dumps(result, indent=2, sort_keys=True)`. Exit codes: 0 when the check passes, 2 when a check fails, and 1 when an exception is caught (log it at error first).

Shared helpers:

- `load_records_by_cell(path: Path) -> dict[str, dict[str, Any]]`. Reads a JSON document with a `records` list. Each record's key is `h3_index`, or `h3Index` for weather packs. Raises `ValueError` when a record has neither key or a key repeats.
- `crossing_cells(cells: Iterable[str]) -> set[str]`. The subset where `crosses_antimeridian` is true.

Field sets, as module constants, each with a comment:

- `METADATA_MASK_FIELDS: Final = frozenset({"total_edges", "water_edges", "all_water", "intersects_water", "all_urban", "intersects_urban", "urban_edges", "urban_by_scalerank"})`
- `LANDMASS_MASK_FIELDS: Final = frozenset({"water_pct"})`
- `WEATHER_MASK_FIELDS: Final = frozenset({"months"})`
- `MANIFEST_ECONOMY_KEYS: Final = frozenset({"economy", "side_group_balance"})`

Subcommands:

1. `summary --metadata PATH [--urban-max N] [--parent-resolution R] [--verbose]`.
   - Prints: `resolution` (from the first record via `h3.get_resolution`), `record_count`, `pole_cells` (sorted list present in the file), `crossing_count`, and for crossing cells the counts of `all_water`, `intersects_water`, and `intersects_urban`.
   - When records have `urban_by_scalerank`, it also prints:
     - `crossing_urban_overlay`: the count where `is_res4_urban_overlay_row(dict(row), urban_max)` holds. Import it from `scripts.terrain_pipeline.metadata_classifier`.
     - `urban_rollup`: urban cells, producing hexes, median, and `p90`. Group the urban rows by `h3.cell_to_parent(cell, parent_resolution)`. Median comes from `statistics.median`, and `p90` from `statistics.quantiles(values, n=10, method="inclusive")[8]`.
     - `crossing_urban_cells`: up to 50 crossing cells that are still `intersects_urban`, each with its `h3.cell_to_latlng` rounded to 3 places.
   - Defaults are `--urban-max 5` and `--parent-resolution 1`. Always exit 0.
2. `diff --before PATH --after PATH --kind {metadata,landmass,weather} --rings K [--verbose]`.
   - Allowed cells are the union of `h3.grid_disk(cell, K)` over the crossing cells in the before file.
   - Changeable fields come from `--kind`.
   - Report:
     - `added` and `removed`: cell keys in only one file.
     - `changed_allowed`: count of cells that changed only in changeable fields and are in the allowed set.
     - `changed_fields`: per-field change counts.
     - `violations`: up to 20 entries, each with the cell, `reason`, and the differing field names.
   - A violation is one of these:
     - A changed cell outside the allowed set.
     - A change to any field outside the changeable set, anywhere.
     - Any added or removed cell.
   - Pole cells are never crossing cells, so any change to one is a violation.
   - Exit 2 when there is any violation or any added or removed key.
3. `manifest-diff --before PATH --after PATH [--verbose]`. Loads both manifest documents and drops `MANIFEST_ECONOMY_KEYS` and `schema_version` from each. It fails (exit 2) when what remains differs, naming the differing top-level keys. It prints the before and after `economy` and `side_group_balance` blocks for the results file.

Keep the probe out of this phase. Phase 4 adds it as a fourth subcommand that delegates to `antimeridian_probe.py`.

### Tests: `scripts/terrain_pipeline/tests/test_antimeridian_qa.py`

Contract tests only. Build tiny JSON documents in a `tempfile.TemporaryDirectory()`, using a real crossing cell and a real ordinary cell. Find the crossing cell with `h3.latlng_to_cell(58.04, 179.62, 4)`, then `h3.grid_disk(..., 1)`, and pick one where `crosses_antimeridian` holds. The ordinary cell is `h3.latlng_to_cell(48.0, 8.0, 4)`. Run `diff` through its Python function, not a subprocess.

- A crossing cell whose `intersects_urban` changed passes.
- An ordinary cell whose `intersects_urban` changed fails, with a violation for that cell.
- A crossing cell whose `forest_mean` changed fails.
- `crosses_antimeridian` is false for `h3.latlng_to_cell(90.0, 0.0, 1)` and true for the crossing cell above.

### Reproduce the bug

```powershell
python -m scripts.terrain_pipeline.antimeridian_qa summary --metadata .test/antimeridian/baseline/global/terrain_res1_metadata.json > .test/antimeridian/logs/summary-before-res1.json
python -m scripts.terrain_pipeline.antimeridian_qa summary --metadata .test/antimeridian/baseline/global/terrain_res4_metadata.json > .test/antimeridian/logs/summary-before-res4.json
python -m scripts.terrain_pipeline.antimeridian_qa summary --metadata .test/antimeridian/baseline/regions/australia_new_zealand/terrain_res_t_metadata.json --urban-max 6 --parent-resolution 2 > .test/antimeridian/logs/summary-before-anz-t.json
python -m scripts.terrain_pipeline.antimeridian_qa summary --metadata .test/antimeridian/baseline/regions/eastern_europe/terrain_res_t_metadata.json --urban-max 6 --parent-resolution 2 > .test/antimeridian/logs/summary-before-ee-t.json
```

Checks:

- `npm run terrain:test` passes.
- res-1 summary: `record_count` 842, `crossing_count` 28, crossing `all_water` 0, crossing `intersects_water` 28, and `pole_cells` lists `81033ffffffffff` and `81f2bffffffffff`.
- res-4 summary:
  - `record_count` 288122, `crossing_count` 595.
  - Crossing `intersects_urban` 367, `crossing_urban_overlay` 340.
  - Crossing `all_water` 27, crossing `intersects_water` 580.
  - `urban_rollup`: 4643 cells, 283 producing hexes, median 8, `p90` 44.
- `australia_new_zealand` tactical `crossing_count` 173. `eastern_europe` tactical `crossing_count` 234.

Any other number means the tool or the baseline is wrong. STOP.

## Phase 3: Geometry Fix and Contract Tests

### Changes to `scripts/terrain_pipeline/ocean_mask.py`

1. Fix the module docstring. It currently says EPSG:3857 "avoids many antimeridian issues". Replace that clause with a sentence saying that H3 cells crossing 180 degrees are split at the map seam before these tests (see `project_cell_for_masks`).
2. Imports to add: `from shapely import get_parts`, `from shapely.affinity import translate`, `box` from `shapely.geometry`, `from .antimeridian import ANTIMERIDIAN_SEAM_INSET_M, WEB_MERCATOR_HALF_WIDTH_M, WEB_MERCATOR_WORLD_WIDTH_M, crosses_antimeridian`, and `from .logging_utils import TRACE_LEVEL`. `antimeridian.py` must not import `ocean_mask`.
3. Add the dataclass, near `MaskPolygonMetrics`:

   ```python
   @dataclass(frozen=True)
   class ProjectedCell:
       """
       Why this exists:
           Carry a cell's EPSG:3857 area and boundary edges together, so a cell split at 180 degrees
           is tested the same way as any other cell.
       When to use:
           Build with ``project_cell_for_masks``, then pass to ``_mask_metrics_for_projected_cell``.
       What to expect:
           Ordinary cells have a Polygon area and one segment per edge. A cell crossing 180 degrees has
           one area piece near each edge of the map, and an edge that crosses the seam has two segments.
       """

       # Area for covers and intersects tests. A MultiPolygon only for a cell split at 180 degrees.
       area: Polygon | MultiPolygon
       # One entry per boundary edge in ring order. Each entry holds the edge's segments on each side of the seam.
       edges: tuple[tuple[LineString, ...], ...]
   ```

4. Add `project_cell_for_masks(cell_poly_wgs84: Polygon | MultiPolygon, *, cell: str | None = None) -> ProjectedCell`. This is public.
   - When `cell` is not None and `crosses_antimeridian(cell)`, return `_project_antimeridian_cell(cell, cell_poly_wgs84)`.
   - Otherwise compute `projected = _cell_polygon_wgs84_to_3857(cell_poly_wgs84)` and return `ProjectedCell(area=projected, edges=tuple((edge,) for edge in _exterior_edges_3857(projected)))`. This must be the existing code path, unchanged, so ordinary and pole cells give byte-identical output.
   - Log at trace with the cell id and whether the cell was split.
   - Docstring: pass the H3 index whenever the polygon came from `cell_polygon`. Without it, a crossing cell is projected the old way and spans the whole map.
5. Add the private helpers:
   - `_shifted_lonlat_to_3857(lng: float, lat: float) -> tuple[float, float]`. For `lng > 180.0`, project `(lng - 360.0, lat)` with `_transformer_wgs84_to_3857` and add `WEB_MERCATOR_WORLD_WIDTH_M` to x. Otherwise project `(lng, lat)` as is. The result is one continuous x range past the east edge of the map, so the ring never wraps.
   - `_split_at_seam(geom: BaseGeometry) -> list[BaseGeometry]`. With `minx, miny, maxx, maxy = geom.bounds`:
     - The east piece is `geom.intersection(box(minx - 1.0, miny - 1.0, WEB_MERCATOR_HALF_WIDTH_M - ANTIMERIDIAN_SEAM_INSET_M, maxy + 1.0))`.
     - The west piece is `translate(geom.intersection(box(WEB_MERCATOR_HALF_WIDTH_M + ANTIMERIDIAN_SEAM_INSET_M, miny - 1.0, maxx + 1.0, maxy + 1.0)), xoff=-WEB_MERCATOR_WORLD_WIDTH_M)`.
     - Return the non-empty pieces, east first.
   - `_parts_with_extent(geom: BaseGeometry, kind: type) -> list[BaseGeometry]`. Returns the parts from `get_parts(geom)` that are instances of `kind` with non-zero `area` (polygons) or `length` (lines). A clip can return a multi-geometry, a point, or a collection, and only real polygons and segments matter.
   - `_project_antimeridian_cell(cell: str, cell_poly_wgs84: Polygon | MultiPolygon) -> ProjectedCell`:
     1. Raise `ValueError` (log at error first) when `cell_poly_wgs84` is not a `Polygon`. The message names the cell and the geometry type.
     2. Build `continuous = Polygon([_shifted_lonlat_to_3857(lng, lat) for lng, lat in list(cell_poly_wgs84.exterior.coords)[:-1]])`.
     3. Area pieces are the Polygon parts of every piece from `_split_at_seam(continuous)`. Raise `ValueError` when none remain. The area is that single Polygon, or `MultiPolygon(pieces)`.
     4. For each `edge` in `_exterior_edges_3857(continuous)`, which reuses the existing zero-length skip, the edge's segments are the LineString parts of `_split_at_seam(edge)`. Raise `ValueError` naming the cell and edge index when an edge has no segment.
     5. Log at debug: the cell, the number of area pieces, and the number of edges.
     6. Return the `ProjectedCell`.
6. Change `_mask_metrics_for_projected_cell(projected: ProjectedCell, mask_ctx)`:
   - `covers = mask_ctx.covers(projected.area)` and `intersects = mask_ctx.intersects(projected.area)`.
   - `mask_edges` counts the edges whose segments are all covered: `all(mask_ctx.covers(segment) for segment in segments)`.
   - `total_edges = len(projected.edges)`.
   - Remove `_count_edges_fully_covered_by_ocean`, which this replaces. Update the docstrings that mention it.
7. Add a keyword-only `cell: str | None = None` to `mask_metrics_for_cell_polygon` and `ocean_relation_for_cell_polygons`, and pass it to `project_cell_for_masks`. Positional calls in existing tests stay valid. Update both docstrings to say: pass `cell` for polygons from `cell_polygon`.
8. Update `_cell_polygon_wgs84_to_3857`'s docstring. It is now the path for cells that do not cross 180, and is used through `project_cell_for_masks`.

### Call sites

- [`scripts/terrain_pipeline/metadata_export_core.py`](../scripts/terrain_pipeline/metadata_export_core.py):
  - Replace the import of `_cell_polygon_wgs84_to_3857` with `ProjectedCell` and `project_cell_for_masks`.
  - In `_row_for_cell`, use `projected = project_cell_for_masks(poly, cell=cell)`.
  - `_urban_rank_entries(projected_cell: ProjectedCell, ...)`. Update its type and its docstring line ("the cell already in EPSG:3857" becomes "the projected cell from `project_cell_for_masks`").
  - `deterministic_points_within_polygon(poly, ...)` keeps the WGS84 `poly`. Do not change sampling.
- [`scripts/terrain_pipeline/pipeline.py`](../scripts/terrain_pipeline/pipeline.py), around lines 518 to 536: pass `cell=cell` to both `ocean_relation_for_cell_polygons` calls.
- [`scripts/terrain_pipeline/calibrate.py`](../scripts/terrain_pipeline/calibrate.py), around line 78: pass `cell=cell`.
- Search `scripts/` for `_cell_polygon_wgs84_to_3857`, `_mask_metrics_for_projected_cell`, `mask_metrics_for_cell_polygon(`, and `ocean_relation_for_cell_polygons(`. Every call that has a cell id in scope passes `cell=`. Tests that pass plain boxes stay as they are.

### Tests: `scripts/terrain_pipeline/tests/test_antimeridian.py`

Use a module-level helper `_crossing_cells(resolution)`. It walks the meridian at `lat` from -89.9 to 89.9 in steps of 0.02, takes `h3.grid_disk(h3.latlng_to_cell(lat, 180.0, resolution), 1)`, and keeps the cells where `crosses_antimeridian` holds. Pick the sample crossing cell `C` as the crossing res-4 cell nearest latitude 58. Build masks with `build_ocean_predicate_context(...)` from WGS84 boxes. Lat0 is C's center latitude.

1. **Far urban polygon at the same latitude.** Mask `box(17.5, lat0 - 0.3, 18.5, lat0 + 0.3)`. `mask_metrics_for_cell_polygon(cell_polygon(C), ctx, cell=C)` must have `intersects` False and `mask_edges` 0. This is the regression test.
2. **Water on both sides of the seam.** Mask is the union of `box(170.0, lat0 - 2.0, 180.0, lat0 + 2.0)` and `box(-179.99999999999991, lat0 - 2.0, -170.0, lat0 + 2.0)`. Expect `all_in_mask` True and `mask_edges == total_edges`. `ocean_relation_for_cell_polygons(..., cell=C)` returns `"in_water"`.
3. **Water on the east side only.** Mask `box(170.0, lat0 - 2.0, 180.0, lat0 + 2.0)`. Expect `intersects` True, `all_in_mask` False, and `0 < mask_edges < total_edges`. The relation is `"coastal_band"`.
4. **Ordinary and pole cells are unchanged.** For `h3.latlng_to_cell(48.0, 8.0, 4)` with mask `box(7.0, 47.0, 8.0, 49.0)`, and for `h3.latlng_to_cell(90.0, 0.0, 1)` with mask `box(-180.0, 80.0, 180.0, 85.0)`, the metrics with `cell=` equal the metrics without it. `MaskPolygonMetrics` is a frozen dataclass, so compare with `==`. Do not let a WGS84 mask reach latitude 90: Web Mercator sends it to infinity.
5. **Every crossing cell projects.** For each resolution 1 through 6 and every cell from `_crossing_cells`, `project_cell_for_masks(cell_polygon(c), cell=c)` returns an area whose bounds lie within ±`WEB_MERCATOR_HALF_WIDTH_M`. Each Polygon part has an x-extent (`maxx - minx`) less than `WEB_MERCATOR_HALF_WIDTH_M`. The old projection gives about twice that, so this is the check that fails without the fix. Every edge has at least one segment, and `len(edges) >= 5`. Also check that resolution 4 finds exactly 595 crossing cells, which matches the global pack.

Checks: `npm run terrain:test`, `npm run regional:test`, and `npm run weather:test` all pass. Report the test counts.

## Phase 4: Real-Data Probe Before the Long Run

The global metadata export takes several hours. The probe runs the production row builder on a few hundred cells against the real masks first.

Create `scripts/terrain_pipeline/antimeridian_probe.py`, and add a `probe` subcommand to `antimeridian_qa.py` that calls it. The subcommand is `probe --baseline-dir DIR --sample-every N [--verbose]`, with a default of N=500.

1. Load the inputs:
   - `config = build_default_config()` from `.config`.
   - `sources = load_metadata_mask_sources(config)`.
   - `rasters = open_metadata_rasters(config)`, in a `try` with `close_rasters(rasters)` in `finally`.
   - `points = build_point_indexes(config, (1, 4))`.
   - Masks for each resolution from `build_mask_contexts(sources, profile, None)`, with `strategic_profile(1, config)` and `tactical_profile(4, config)` from `.resolution_profile`.
2. Choose the cells:
   - Res-1: every cell in the baseline res-1 file.
   - Res-4: every crossing cell, both pole cells, and every N-th remaining cell in sorted order.
3. Build the rows with `build_metadata_rows(cells, profile, masks, points, rasters)`. This is the same function, with the same arguments, that `TerrainMetadataExporter.run` in `metadata_pipeline.py` uses.
4. Normalize each new row with `json.loads(json.dumps(row))`, so tuples become lists as they do in the written file. Then compare against the baseline records:
   - Ordinary and pole cells must equal the baseline record exactly.
   - Crossing cells may differ only in `METADATA_MASK_FIELDS`.
5. Oracle for crossing cells. Split `cell_polygon(cell)` in longitude and latitude:
   - The east piece is its intersection with `box(-180.0, -90.0, 180.0, 90.0)`.
   - The west piece is `translate(poly.intersection(box(180.0, -90.0, 540.0, 90.0)), xoff=-360.0)`.

   Use prepared WGS84 unions: `sources.ocean_wgs84` at res-1, `sources.ocean_and_lakes_wgs84` at res-4, and `sources.urban_aggregate_wgs84`. The oracle's `intersects_water` is True when any piece intersects the water union, and `intersects_urban` likewise. The new row must agree with the oracle on `intersects_water` and, at res-4, `intersects_urban`. List each disagreement with the cell and its center.
6. Output: JSON with the counts of compared cells, ordinary mismatches, crossing non-mask mismatches, oracle disagreements, and crossing before and after totals for `all_water`, `intersects_water`, and `intersects_urban`. Exit 2 on any failure below.

Run it, in the background, because loading and projecting the ocean takes many minutes:

```powershell
python -m scripts.terrain_pipeline.antimeridian_qa probe --baseline-dir .test/antimeridian/baseline/global --verbose *> .test/antimeridian/logs/probe.log
```

Checks:

- Zero ordinary or pole mismatches. Zero crossing non-mask mismatches.
- Oracle disagreements are at most 1% of the crossing cells at each resolution, rounded down, with a minimum of 1. Each is listed in the results file. More than that means the split is wrong.
- Res-4 crossing `intersects_urban` after the fix is 30 or fewer. Expect a number near 0, because few urban polygons lie within a cell of 180 degrees. A larger number means the fix did not take effect.
- Res-1 crossing `all_water` after the fix is greater than 0. Open mid-Pacific cells must now read as water.

When all pass, add a test to `test_antimeridian_qa.py` only if the probe's comparison logic has a pure function that can be tested without the GIS inputs. Do not add tests that need `F:/Data`.

## Phase 5: Global Regeneration

Run each command in the same shell after loading the password (Phase 1, step 4). Check `$LASTEXITCODE` after each one.

1. Metadata, which takes several hours. Run it in the background:

   ```powershell
   python -m scripts.terrain_pipeline.metadata_cli run --verbose *> .test/antimeridian/logs/metadata.log
   ```

   It is complete when the log shows "Wrote 842 metadata records (resolution 1)" and "Wrote 288122 metadata records (resolution 4)", and the process has exited 0.
2. Landmass, which takes about 10 minutes. Then run the corridor check, which must exit 0:

   ```powershell
   python -m scripts.terrain_pipeline.landmass_cli run --verbose *> .test/antimeridian/logs/landmass.log
   python scripts/terrain_pipeline/qa_landmass_corridor.py *> .test/antimeridian/logs/landmass-corridor.log
   ```

3. Weather:

   ```powershell
   python -m scripts.weather_pipeline.generate_res1_weather --verbose *> .test/antimeridian/logs/weather.log
   ```

4. Diff gates. Each must exit 0:

   ```powershell
   $b = '.test/antimeridian/baseline/global'; $a = 'data/generated'
   python -m scripts.terrain_pipeline.antimeridian_qa diff --before $b/terrain_res1_metadata.json --after $a/terrain_res1_metadata.json --kind metadata --rings 0 > .test/antimeridian/logs/diff-res1-metadata.json
   python -m scripts.terrain_pipeline.antimeridian_qa diff --before $b/terrain_res4_metadata.json --after $a/terrain_res4_metadata.json --kind metadata --rings 0 > .test/antimeridian/logs/diff-res4-metadata.json
   python -m scripts.terrain_pipeline.antimeridian_qa diff --before $b/terrain_res1_landmass.json --after $a/terrain_res1_landmass.json --kind landmass --rings 1 > .test/antimeridian/logs/diff-res1-landmass.json
   python -m scripts.terrain_pipeline.antimeridian_qa diff --before $b/terrain_res1_weather.json --after $a/terrain_res1_weather.json --kind weather --rings 2 > .test/antimeridian/logs/diff-res1-weather.json
   ```

   The rings follow these rules:
   - Metadata changes only on crossing cells, so it gets 0 rings.
   - A res-1 landmass `water_pct` averages res-4 children, and every changed child's parent lies within one ring of a crossing res-1 cell, so landmass gets 1 ring.
   - Weather copies the nearest land within 2 steps for water hexes, so weather gets 2 rings.

5. After-summaries:

   ```powershell
   python -m scripts.terrain_pipeline.antimeridian_qa summary --metadata data/generated/terrain_res1_metadata.json > .test/antimeridian/logs/summary-after-res1.json
   python -m scripts.terrain_pipeline.antimeridian_qa summary --metadata data/generated/terrain_res4_metadata.json > .test/antimeridian/logs/summary-after-res4.json
   ```

Checks:

- All four diffs exit 0.
- Res-4 crossing `intersects_urban` equals the probe's after value.
- `urban_rollup` cells are at least 4,303 and less than 4,643.
- Res-1 crossing `all_water` equals the probe's after value.
- Record the changed-cell counts from each diff.

If a diff reports violations, STOP. Do not re-run hoping for a different result. Report the first 20 violations with their fields.

## Phase 6: Regional Regeneration

Do `australia_new_zealand` first, finish all of its checks, then do `eastern_europe`. Below, `R` stands for the region id. Both regions cross 180 degrees, so `bounds_for_cells` returns None and the export uses the unclipped global masks with per-pixel sampling. Expect about an hour or more per region.

1. Extract only this region's archives into its folder. Do not use `npm run regional:extract`, which extracts all 23 regions:

   ```powershell
   python -c "import zipfile, pathlib; d = pathlib.Path('data/generated/regions/R'); [zipfile.ZipFile(z).extractall(d) for z in sorted(d.glob('*.json.zip'))]; print(sorted(p.name for p in d.glob('*.json')))"
   ```

2. Regenerate. Do not pass `--skip-existing`:

   ```powershell
   python -m scripts.regional_pipeline.regional_cli run --region R --steps metadata,landmass,weather --verbose *> .test/antimeridian/logs/R-run.log
   ```

3. Diff gates. Each must exit 0. Weather uses 5 rings, which is `weather_water_land_steps_for(2)`:

   ```powershell
   $b = '.test/antimeridian/baseline/regions/R'; $a = 'data/generated/regions/R'
   python -m scripts.terrain_pipeline.antimeridian_qa diff --before $b/terrain_res_s_metadata.json --after $a/terrain_res_s_metadata.json --kind metadata --rings 0 > .test/antimeridian/logs/R-diff-s-metadata.json
   python -m scripts.terrain_pipeline.antimeridian_qa diff --before $b/terrain_res_t_metadata.json --after $a/terrain_res_t_metadata.json --kind metadata --rings 0 > .test/antimeridian/logs/R-diff-t-metadata.json
   python -m scripts.terrain_pipeline.antimeridian_qa diff --before $b/terrain_res_s_landmass.json --after $a/terrain_res_s_landmass.json --kind landmass --rings 1 > .test/antimeridian/logs/R-diff-s-landmass.json
   python -m scripts.terrain_pipeline.antimeridian_qa diff --before $b/terrain_res_s_weather.json --after $a/terrain_res_s_weather.json --kind weather --rings 5 > .test/antimeridian/logs/R-diff-s-weather.json
   ```

4. Economy, then the manifest gate, then the pack check:

   ```powershell
   python -m scripts.regional_pipeline.regional_cli economy --region R --markdown *> .test/antimeridian/logs/R-economy.log
   python -m scripts.terrain_pipeline.antimeridian_qa manifest-diff --before .test/antimeridian/baseline/regions/R/region_manifest.json --after data/generated/regions/R/region_manifest.json > .test/antimeridian/logs/R-manifest-diff.json
   python -m scripts.regional_pipeline.regional_cli check --region R *> .test/antimeridian/logs/R-check.log
   ```

Checks:

- All four diffs and `manifest-diff` exit 0.
- The economy log shows balance `PASS`.
- `check` exits 0.
- Record the before and after economy and balance from `manifest-diff`, and the two printed markdown tables from the economy log.
- `terrain_res_t_origin_units.json` and the naming and road and rail files are unchanged from the baseline. Every line must print `True`:

  ```powershell
  python -c "import pathlib; b = pathlib.Path('.test/antimeridian/baseline/regions/R'); a = pathlib.Path('data/generated/regions/R'); [print(n, (b / n).read_bytes() == (a / n).read_bytes()) for n in ('terrain_res_t_origin_units.json', 'terrain_res_s_naming.json', 'terrain_res_t_naming.json', 'terrain_res_t_road_rail_sides.json', 'terrain_res_t_road_rail_vectors.json')]"
  ```

### Fallback when the balance fails

Use this only when the economy log shows `FAIL` for a group. Record every step in the results file.

1. From the printed balance table, take each group's urban share and the band, which is ±25% of an equal share.
2. In [`scripts/regional_pipeline/side_group_catalog.py`](../scripts/regional_pipeline/side_group_catalog.py), list the candidate moves. A candidate moves one admin-1 area between two groups that border each other on the map. In Eastern Europe that means one Russian federal subject by ISO 3166-2 code. In Australia and New Zealand it means one Australian state or territory. Add the move as an `iso_codes` rule placed before the broader rule, as the existing `RU-*` and `AU-*` rules are.
3. For each candidate, re-run `origins --region R --force` and then `economy --region R --markdown`. Revert the candidate before trying the next. Pick the move that puts every group inside the band with the smallest largest deviation from an equal share.
4. Keep every group's display name accurate. If a moved area makes a name wrong, update the name in every rule for that group.
5. With the chosen move applied, re-run `origins --region R --force`, `economy --region R --markdown`, and `check --region R`. Origins rewrites `terrain_res_t_origin_units.json` and the side groups, so that file's unchanged check and `manifest-diff` no longer apply. Record the new manifest `side_groups` instead.
6. If no single move passes, STOP and report. Do not combine moves.

## Phase 7: Packaging, App Tests, and Docs

1. Create the zip helper `.test/antimeridian/zip-files.cjs`. It is not tracked, and it reuses the repository's `zipJsonFile`, so each archive matches the format the build expects:

   ```js
   /* eslint-disable no-console */
   const path = require('path');
   const { resolvePythonExecutable } = require('../../scripts/resolve-python.cjs');
   const { zipJsonFile } = require('../../scripts/generated-data-zip-helpers.cjs');

   const [dir, ...names] = process.argv.slice(2);
   if (!dir || names.length === 0) throw new Error('usage: node .test/antimeridian/zip-files.cjs <dir> <json-name>...');
   const pythonCmd = resolvePythonExecutable();
   if (!pythonCmd) throw new Error('zip-files: no Python found.');
   for (const name of names) zipJsonFile(pythonCmd, path.resolve(dir), name);
   ```

2. Zip only the files whose diff reported at least one changed cell. Include a regional manifest when `manifest-diff` showed an economy or balance change, or when the fallback ran. If the fallback ran, also include `terrain_res_t_origin_units.json`. For example:

   ```powershell
   node .test/antimeridian/zip-files.cjs data/generated terrain_res1_metadata.json terrain_res4_metadata.json terrain_res1_landmass.json terrain_res1_weather.json
   node .test/antimeridian/zip-files.cjs data/generated/regions/australia_new_zealand region_manifest.json terrain_res_s_metadata.json terrain_res_t_metadata.json terrain_res_s_landmass.json terrain_res_s_weather.json
   node .test/antimeridian/zip-files.cjs data/generated/regions/eastern_europe region_manifest.json terrain_res_s_metadata.json terrain_res_t_metadata.json terrain_res_s_landmass.json terrain_res_s_weather.json
   ```

3. Round-trip check. Run it with the same directory and file names as each zip command above. Every archive member's bytes must equal the JSON beside it, and the command must exit 0:

   ```powershell
   python -c "import zipfile, pathlib, sys; d = pathlib.Path(sys.argv[1]); bad = [n for n in sys.argv[2:] if zipfile.ZipFile(d / (n + '.zip')).read(n) != (d / n).read_bytes()]; print(d, 'mismatched:', bad); sys.exit(1 if bad else 0)" data/generated terrain_res1_metadata.json terrain_res4_metadata.json terrain_res1_landmass.json terrain_res1_weather.json
   ```

4. Run `git status --short`. The only changed tracked data files are the zips you created. If any other `.json.zip` changed, STOP.
5. Run `npm test`.
   - If a test fails because it asserts a generated-data value, it may be updated in this change, but only when both of these hold:
     - The value belongs to a crossing cell, its parent, or a total that includes them.
     - The new value matches the after-summaries.
   - Record each such test, with the old and new values. Any other failure means STOP.
6. Update [`doc/region-summary-1.md`](../doc/region-summary-1.md). Take every number from the logs. Do not compute numbers by hand.
   - **Table 1, global row:** replace `4,643 / 283 / 8` with the after res-4 `urban_rollup` cells, producing hexes, and median. Use a thousands separator, and write the median as an integer when it is whole. Keep `(game data)`.
   - **Table 1, `eastern-europe` and `australia-nz` rows:** replace each group's urban share in the "Side groups" column with the shares from that region's printed balance table, to one decimal place. Keep the names, the land-hex counts in parentheses, the size ratio, and the last column, which the table labels an earlier estimate.
   - **Table 2:** replace the `eastern_europe` and `australia_new_zealand` rows with the rows from each region's printed economy table.
   - **The sentence under "Urban cells"** that begins "Run at res4, this method reproduces 93% ...". Rewrite it with the after values, where `N` is the urban cells, `M` the median, and `P` the `p90`:
     - When `4,304 <= N`: "Run at res4, this method reproduces X% of the game's res4 urban cells (4,304 of N) with the same distribution (median 8 vs M, 90th percentile 46 vs P)." X is `round(100 * 4304 / N)`.
     - When `4,304 > N`: "Run at res4, this method finds 4,304 urban cells against the game's N, with the same distribution (median 8 vs M, 90th percentile 46 vs P)."
     - Keep the following sentence ("Ratios therefore use the same method on both sides.").
   - Leave Table 3, the "Global baseline" bullet, and the frozen `GlobalEconomyBaseline` in `scripts/regional_pipeline/regional_economy.py` unchanged. Table 3 is built from earlier estimates, and the frozen baseline was measured with the regional method, which never had this defect.
7. Update [`scripts/terrain_pipeline/README.md`](../scripts/terrain_pipeline/README.md). Under "Classification notes", after the Ocean / coastal bullet, add this bullet:

   "- **Cells that cross 180 degrees:** `cell_polygon` shifts such a cell's longitudes to one side of the line for raster sampling. The water and urban tests split it at the EPSG:3857 map seam instead, so each piece is tested on its own side (`project_cell_for_masks` in `ocean_mask.py`). Pole cells keep the unsplit projection. `python -m scripts.terrain_pipeline.antimeridian_qa` summarizes those cells and checks a regenerated file against a baseline."

8. Check `doc/terrain-pipeline.md` and `doc/README.md` for statements that are now wrong. Neither describes the mask projection, so expect no edit. Say in the results file that you checked.
9. Run `git status --short` and list every changed file in the results file.

## Stop Protocol

When a check fails:

1. Do not edit code or data to make the check pass. Do not re-run a long command hoping for a different result.
2. Write in the results file:
   - The failing check, the exact command, and its exit code.
   - The log path.
   - Up to 20 offending cells, with fields and before and after values.
3. Leave the regenerated files in place, so the user can inspect them.
4. Report to the user, and wait.

## Results File Template

Create `.spec/antimeridian-mask-fix-results.md`:

```markdown
# Antimeridian Mask Fix Results

## Environment
- Python, h3, shapely, pyproj versions:
- Files already changed before this work (from git status):

## Baseline Reproduction
- res-1: records / crossing / all_water / intersects_water:
- res-4: records / crossing / intersects_urban / urban overlay / all_water / intersects_water:
- Global urban rollup (cells / producing / median / p90):
- Regional tactical crossing counts:

## Tests
- terrain:test / regional:test / weather:test counts:

## Probe
- Compared cells per resolution:
- Ordinary mismatches / crossing non-mask mismatches:
- Oracle disagreements (listed):
- Crossing before and after (all_water, intersects_water, intersects_urban):

## Global Regeneration
- Durations:
- Diff results per file (changed cells, changed fields, violations):
- After summaries (crossing counts, urban rollup):

## Regional Regeneration
- Per region: diff results, economy before and after, balance before and after, check result, fallback (yes/no, details):

## Packaging and App Tests
- Zipped files:
- Round-trip check:
- npm test result, and any data-asserting tests updated:

## Docs
- Edits made, and documents checked without changes:

## Changed Files
```

## Follow-Ups (Not in This Change)

- **Road and rail side masks:** `road_rail_sides.py` clips Natural Earth lines against the shifted `cell_polygon`. Lines just west of 180 (longitude -179.x) miss crossing cells, so roads on those cells are probably dropped.
- **Regional origin assignment:** `member_owner` in `origin_assignment.py` intersects the shifted `cell_polygon` with unshifted admin polygons, so crossing cells east of 180 may get no origin or the wrong one.
- **Regional land overlap and footprint:** `cell_land_overlap.py` and `landmass_index.py` use the shifted `cell_polygon` against unshifted land.
- **Pole cells:** no longitude and latitude ring describes a cap around a pole. Their water and urban flags come from the unsplit projection and are unreliable.
- **Table 3** in `doc/region-summary-1.md` still uses earlier urban estimates.
- **Manual check for the user:** start a global match and open a battle in a strategic hex on the 180-degree meridian, for example near Chukotka or Fiji. The vertical line of urban cells should be gone.
