# Regional Data Pipeline Execution Plan

The executing agent follows this plan phase by phase, in order. Each phase ends with a verification block. Don't start a phase until the previous phase's verification passes.

## Goal

Add a regional data pipeline next to the global one. For each of the 23 maps in `data/region-summary-1.md`, it writes a folder of JSON files that a regional game needs, at the same level of detail as the global game:

- Strategic resolution `res_s` is 2 or 3. Tactical resolution `res_t` is 5 or 6. In every pair, `res_t = res_s + 3`, the same step as the global 1/4 pair.
- Files are keyed `res_s` and `res_t` instead of `res1` and `res4`.
- Each region writes to its own folder: `data/generated/regions/<region_id>/`.
- Terrain rules don't change: water and coastal edge counting, arctic, forest and desert means, urban masks, and landmass water percentage all work as they do globally. Only the resolution-dependent inputs change (sample counts, topography grid, island size floor, weather search radius, scalerank cutoffs), using the rules in [Settled Decisions](#settled-decisions).
- The global pipeline keeps producing the same JSON values, including object key order, apart from `generated_at_utc`.

Out of scope: app loader changes, origin units, side groups, and production costs. The game can't load regional packs yet. These files are the data those later features will read.

## Background the Agent Needs

The global pipeline lives in three Python packages. Each writes into `data/generated/`:

- `scripts/terrain_pipeline/metadata_cli.py` writes `terrain_res1_metadata.json` (842 records) and `terrain_res4_metadata.json` (all res-4 cells). Water is ocean-only at the strategic resolution and ocean plus lakes at the tactical resolution. Urban masks apply only at the tactical resolution. Strategic cells take 25 raster samples from the 50 km topography grids; tactical cells take 4 samples from the 5 km grids.
- `scripts/terrain_pipeline/landmass_cli.py` writes `terrain_res1_landmass.json`. `water_pct` is the percent of a cell's tactical children that classify as `water`.
- `scripts/terrain_pipeline/road_rail_sides_cli.py` and `road_rail_vectors_cli.py` write `terrain_res4_road_rail_sides.json` and `terrain_res4_road_rail_vectors.json`. Only road and rail features with scalerank 0 to 4 are kept.
- `scripts/naming_pipeline/generate_hex_naming.py` writes `terrain_res1_naming.json` and `terrain_res4_naming.json`. Cities appear only in the tactical file.
- `scripts/weather_pipeline/generate_res1_weather.py` writes `terrain_res1_weather.json` from the strategic metadata and WorldClim. A water hex copies the nearest land hex within 2 grid steps.

Natural Earth scaleranks in `F:\Data` (lower is more important):

- Roads: 3 to 10. The global filter (0 to 4) keeps ranks 3 and 4: 15,731 features.
- Railroads: 4 to 10. The global filter keeps rank 4 only: 2,845 features.
- Urban areas: 2 to 9. The app treats ranks 0 to 5 as urban at runtime.
- Airports: 2 to 9. Seaports: 3 to 8. The app counts ranks 0 to 5 as major facilities at runtime.
- Populated places: 0 to 10. The app labels ranks 0 to 4 on the tactical map. Rank 5 has only 2 places; rank 6 has 1,315.

The urban, airport, seaport, and city-label cutoffs are applied by the app when it reads the files, so the JSON stores every rank. Only the road and rail cutoff is applied when the file is written.

Python tests use `unittest`, not pytest. Docstrings use the `Why this exists / When to use / What to expect` form already in `scripts/terrain_pipeline/`.

## Settled Decisions

These were decided before this plan was written. Don't revisit them.

### Output Folder and Files

Each region folder `data/generated/regions/<region_id>/` holds:

- `region_manifest.json`: resolution pair, scalerank policy, derived constants, footprint rules and counts, and the role of every strategic hex.
- `terrain_res_s_metadata.json` and `terrain_res_t_metadata.json`
- `terrain_res_s_naming.json` and `terrain_res_t_naming.json`
- `terrain_res_s_landmass.json`
- `terrain_res_s_weather.json`
- `terrain_res_t_road_rail_sides.json`
- `terrain_res_t_road_rail_vectors.json`
- `qa/landmass_qa.json`

Cross-region QA goes in `data/generated/regions/qa/`. Every regional data file uses the same envelope and record keys as its global twin. The envelope `resolution` field holds the real H3 resolution (2, 3, 5, or 6). Only the filenames carry `res_s` and `res_t`.

The strategic cell set is the region footprint. The tactical cell set is every child of every footprint cell at `res_t`. That keeps the app's existing join contracts: every tactical cell has a strategic parent, and landmass rows match strategic metadata rows exactly.

### Resolution Profile

One rule set picks the resolution-dependent inputs. It gives the same answers as today for 1 and 4:

- Sample count: 25 for strategic cells, 4 for tactical cells.
- Topography grid: the 50 km grids when the average H3 edge length is at least 100 km, otherwise the 5 km grids. That gives 50 km for resolutions 1 and 2, and 5 km for resolutions 3 to 6. A resolution-3 cell is about 120 km across, so the 50 km grid would give it only a handful of distinct pixels.
- Lakes join the water mask at the tactical resolution only.
- Urban masks apply at the tactical resolution only.

### Other Scaled Constants

- Island floor for landmass membership: `2000 km² × average_area(res_s) / average_area(1)`. That's about 284.7 km² at resolution 2 and 40.6 km² at resolution 3. It keeps the same ratio of island size to strategic hex.
- Weather search radius in grid steps: `round(2 × edge(1) / edge(res_s))`. That's 5 at resolution 2 and 14 at resolution 3, about the same distance in kilometers as 2 steps at resolution 1.
- Unchanged: the land water threshold (85 percent), classifier thresholds, edge rules, urban rules, and the high-latitude road ring expansion.

### Scalerank Policy

One policy per tactical resolution. The resolution 4 row mirrors today's global values.

| Tactical res | Roads max | Rail max | Urban max | Airport max | Seaport max | City label max |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 4 (global) | 4 | 4 | 5 | 5 | 5 | 4 |
| 5 (2/5 maps) | 6 | 6 | 6 | 6 | 6 | 6 |
| 6 (3/6 maps) | 8 | 8 | 7 | 8 | 8 | 7 |

The minimum is 0 for every layer. Here's the reasoning, which the README must repeat:

- One H3 resolution step is about 2.65 times finer in linear terms. One Natural Earth scalerank step is roughly one zoom level, about 2 times finer. So each resolution step is worth about 1.4 scalerank steps: about +1 for tactical resolution 5 and about +3 for resolution 6.
- Roads and rail sit at the top of that range. A tactical battle covers one strategic hex, which is 7 times smaller in area at resolution 5 and 49 times smaller at resolution 6. Keeping a similar share of road cells per battle needs about 2.6 and 7 times more line length per square kilometer. Natural Earth tops out at about 3.6 times the global road set.
- Urban stays near the bottom of the range. A large urban polygon covers about the same share of cells at any resolution, so urban share rises on its own at finer resolutions.
- Airports and seaports get the wider range because their count per battle falls with battle area.
- City labels skip rank 5, which has only 2 places.

The policy goes into every manifest. The road and rail maxima also filter the road/rail files. Urban, airport, seaport, and city-label maxima are recorded for a later loader; those JSON files still store every rank, as the global files do. The summary's urban column was counted at scalerank 5, and the density report repeats that cutoff beside the policy cutoff. Don't edit this table to match the summary. The user adjusts it after reading the report.

### Footprint Rules

Each region definition lists member countries (Natural Earth `ADM0_A3`), with optional admin-1 include or exclude lists (`iso_3166_2`), a centroid box, reach distances, and target counts from the summary. For each candidate strategic cell:

1. Drop the cell if its centroid is outside the region's centroid box. A box with `lon_min > lon_max` wraps across the antimeridian.
2. `land_km2` is the cell's overlap with all Natural Earth admin-0 country polygons. `member_km2` is its overlap with the member geometry.
3. If `land_km2 >= 1.0`, the cell is land. It's member land when `member_km2 >= 0.5 × land_km2`; otherwise it's non-member land. If `land_km2 < 1.0`, the cell is water.
4. Desert trim, for regions that set it: a member land cell is settled when it contains a populated place, intersects an urban polygon, or has `land_km2 < 0.95 × cell_area_km2` (coast or open water inside it). Drop member land cells farther than `desert_trim_reach_km` from the nearest settled member land cell.
5. The remaining member land cells get role `land`.
6. Water cells within `sea_reach_km` of a `land` cell get role `sea`.
7. Non-member land cells within `neutral_reach_km` of a `land` cell get role `neutral_border`.

Distances run between cell centroids along the great circle. Admin-0 polygons include inland lakes such as Lake Victoria and exclude the Caspian Sea, so the Caspian counts as sea, which matches the summary's "9 Caspian".

Tuning targets: land within 10 percent of the summary count. For sea and neutral border, the agent picks the 25 km reach step that gets closest to the target.

## Ground Rules

1. **Never commit or push.** Leave every change in the working tree.
2. **One phase at a time.** Finish a phase's verification before starting the next. If verification fails and the cause isn't clear after two focused attempts, stop and report the command and its output.
3. **No plan identifiers in versioned files.** Don't write phase names or numbers, or headings from this plan, into code, comments, docstrings, tests, config, README files, `doc/`, or `package.json`.
4. **Global behavior is frozen.** Shared refactors must keep global outputs identical, apart from `generated_at_utc`. The [Global Regression Check](#global-regression-check) proves it. Don't change classifier thresholds, global filenames, schema versions, or JSON keys.
5. **Python environment.** At the start of every session, from the repo root: `.\.venv\Scripts\Activate.ps1`. Every `python` command in this plan assumes that venv. Postgres isn't needed. Never call `validate_environment` or `run_all` on the global metadata exporter in this work, because both require the database.
6. **Python naming.** Modules and functions are `snake_case`; classes are `PascalCase`. New identifiers say `strategic` and `tactical`, not `res1` and `res4`. Keep existing global names unless a step here renames them.
7. **Orienting comments.** Every new or changed module, class, function, and method has a docstring with `Why this exists:`, `When to use:`, and `What to expect:` sections (include exceptions under What to expect). Every new module-level constant and dataclass field has a `#` comment on the line above it saying why it exists.
8. **Logging.** Each module defines `LOGGER = logging.getLogger(__name__)`. Public functions log `LOGGER.debug` on entry with their key inputs (region id, resolution, cell counts, paths). Every `except` block logs `LOGGER.error(..., exc_info=True)` before re-raising. Getter-style functions that don't change state log at trace level with `LOGGER.log(TRACE_LEVEL, ...)`, using the `TRACE_LEVEL` constant added to `logging_utils.py` in the first phase.
9. **Immutability.** Use `@dataclass(frozen=True)` for value objects, tuples or `frozenset` for collection fields, and `Final` for module constants.
10. **Arguments.** At most 6 named parameters per function, with 10 as a hard ceiling. Use a frozen dataclass parameter object past that.
11. **File size.** At most 600 physical lines per source file, with 1,000 as a hard ceiling. Count with `(Get-Content -LiteralPath <file>).Count`. Split by responsibility if a file passes 600.
12. **Tests.** Test happy paths and essential failure cases for new contracts only. Don't test dataclass constructors, getters, or argument parsing. Put new tests next to the code they cover: `scripts/<package>/tests/test_<module>.py`.
13. **Samples are contracts for names and behavior.** Add the docstrings and field comments the rules above require even when a sample omits them.

## Implementation Traps

These are the mistakes most likely to pass a quick read and still break the work:

1. Naming filters are per resolution. Filter strategic cell lists against the strategic cells only, and tactical cell lists against the tactical cells only. A cell is never required to be in both sets; the two sets use different resolutions.
2. Clip polygon features only when `clip_bounds` is not `None`. The global naming and metadata paths pass `None` and must not run `clip_by_rect` or `make_valid` on those geometries.
3. `bounds_for_cells` returning `None` means "do not clip". That is expected for any cell set that crosses the antimeridian, including Eastern Europe. Don't treat `None` as a failure, and don't special-case a region id in code.
4. `--max-tactical-cells` is a smoke test for tactical metadata only. `skip_existing` regenerates tactical metadata when `record_count` is not the full tactical cell count. Don't pass the cap to the full generation command.
5. `max_features` counts shapefile features as they are read, including features skipped for scalerank. It does not count kept rows.
6. The road and rail `resolution` field follows the scan options. Global options use 4. Write `rail_scalerank_filter` only when the rail range differs from the road range.
7. Vector points are `[lat, lng]`, the order `_line_points_latlng` already writes.
8. Point the existing metadata tests at the moved functions, as Phase 1 describes. Don't delete those tests.
9. These Natural Earth `ADM0_A3` codes are already correct: `ALD` is Åland, `KAS` is the Siachen Glacier, `USG` is Guantanamo Bay, and `SDS` is South Sudan. Don't replace them.
10. The compare tool checks JSON values and object key order exactly. Don't loosen it to approximate numbers. A mismatch means the refactor changed behavior.
11. The summary's urban column was counted at scalerank 5 at every tactical resolution. The policy table below is intentional, and the density report also reports the scalerank-5 figures so they can be compared with the summary. Don't change the policy table to match that column.

## Global Regression Check

Phase 0 captures global outputs before any code changes. Later phases regenerate the artifacts they touch into an `after` folder and compare. Both folders sit under `data/generated/qa/global-regression/`, which `.gitignore` already covers.

Set paths once per session:

```powershell
$before = "data/generated/qa/global-regression/before"
$after = "data/generated/qa/global-regression/after"
New-Item -ItemType Directory -Force -Path $after | Out-Null
```

Regenerate an artifact with the command for it:

- **Metadata** (strategic in full, the first 3,000 tactical cells):

  ```powershell
  @'
  from dataclasses import replace
  from pathlib import Path
  from scripts.terrain_pipeline.config import build_default_config
  from scripts.terrain_pipeline.metadata_pipeline import TerrainMetadataExporter
  out = Path("data/generated/qa/global-regression/after")
  cfg = replace(build_default_config(), output_dir=out, qa_dir=out / "qa")
  TerrainMetadataExporter(cfg).run(max_child_cells=3000)
  '@ | python -
  ```

- **Landmass** (needs the full tactical metadata next to it). Copy the extracted `data/generated/terrain_res4_metadata.json`, not the capped metadata file in the regression folder:

  ```powershell
  New-Item -ItemType Directory -Force -Path "$after-landmass" | Out-Null
  Copy-Item data/generated/terrain_res4_metadata.json "$after-landmass/terrain_res4_metadata.json"
  @'
  from dataclasses import replace
  from pathlib import Path
  from scripts.terrain_pipeline.config import build_default_config
  from scripts.terrain_pipeline.landmass import LandMassExporter
  out = Path("data/generated/qa/global-regression/after-landmass")
  cfg = replace(build_default_config(), output_dir=out, qa_dir=out / "qa")
  LandMassExporter(cfg).run()
  '@ | python -
  ```

- **Weather** (after the weather phase adds CLI flags). After that phase, don't set `OUTPUT_JSON` and call `main()`. That snippet is only for the baseline capture:

  ```powershell
  python -m scripts.weather_pipeline.generate_res1_weather --output "$after/terrain_res1_weather.json"
  ```

- **Naming:**

  ```powershell
  python -m scripts.naming_pipeline.generate_hex_naming run --output-res1 "$after/terrain_res1_naming.json" --output-res4 "$after/terrain_res4_naming.json" --max-child-cells 3000
  ```

- **Road/rail sides and vectors:**

  ```powershell
  python -m scripts.terrain_pipeline.road_rail_sides_cli run --mode fast --max-features 300 --output-dir $after
  python -m scripts.terrain_pipeline.road_rail_vectors_cli run --max-features 300 --output-dir $after
  ```

Compare each regenerated file with its baseline. Each command must print `equal` and exit 0:

```powershell
python -m scripts.terrain_pipeline.json_compare_cli "$before/<file>" "$after/<file>"
```

The landmass baseline is `"$before-landmass/terrain_res1_landmass.json"`, compared with `"$after-landmass/terrain_res1_landmass.json"`.

## Phase 0: Baselines and Compare Tool

**Create** `scripts/terrain_pipeline/json_compare_cli.py`:

- `compare_json_documents(left: Any, right: Any, ignore_keys: frozenset[str]) -> list[str]` returns up to 20 JSON paths (for example `records[12].water_edges`) where the documents differ. It drops any dict key in `ignore_keys` at every depth. Dicts compare by key sequence, so a reordered object is a difference. Lists compare by position. Numbers compare exactly (`==`), with no tolerance.
- `main(argv: list[str] | None = None) -> int` takes positional `left` and `right` paths and a repeatable `--ignore-key` option (default `generated_at_utc`). It prints `equal` and returns 0, or prints the differing paths and returns 1.

**Modify** `scripts/terrain_pipeline/logging_utils.py`: add `TRACE_LEVEL: Final = 5` with a comment, and register it with `logging.addLevelName(TRACE_LEVEL, "TRACE")` inside `configure_logging`.

**Test** `scripts/terrain_pipeline/tests/test_json_compare_cli.py`:

- Documents that differ only in a nested `generated_at_utc` compare equal.
- A changed nested value is reported with its path.

The extracted archives are not the baselines. `generated:extract` only puts the full `terrain_res4_metadata.json` in place so the landmass command can copy it. The baselines are the regenerated files written by the commands below. Don't point the compare tool at the extracted global JSON.

**Capture the baselines** before touching any other file:

```powershell
npm run generated:extract
$before = "data/generated/qa/global-regression/before"
New-Item -ItemType Directory -Force -Path $before | Out-Null
```

Then run each command from the Global Regression Check with these changes:

- Write to `$before` instead of `$after`, including `"$before-landmass"` for the landmass folder and its copied tactical metadata. In the Python snippets, the `out` path ends in `before` or `before-landmass`.
- Weather has no CLI flags yet, so use this instead:

  ```powershell
  @'
  from pathlib import Path
  import scripts.weather_pipeline.generate_res1_weather as weather
  weather.OUTPUT_JSON = Path("data/generated/qa/global-regression/before/terrain_res1_weather.json")
  weather.main()
  '@ | python -
  ```

Verify:

```powershell
python -m unittest discover -s scripts/terrain_pipeline/tests -p "test_*.py" -v
python -m unittest discover -s scripts/naming_pipeline/tests -p "test_*.py" -v
Get-ChildItem $before, "$before-landmass" -Filter *.json | Select-Object Name, Length
```

Done when all tests pass and these 8 baseline files exist and aren't empty: `terrain_res1_metadata.json`, `terrain_res4_metadata.json`, `terrain_res1_naming.json`, `terrain_res4_naming.json`, `terrain_res1_weather.json`, `terrain_res4_road_rail_sides.json`, `terrain_res4_road_rail_vectors.json`, and `before-landmass/terrain_res1_landmass.json`.

## Phase 1: Resolution Profile and Metadata Export Core

The metadata exporter becomes reusable for any cell list and resolution. The global exporter keeps its public API and output.

**Create** `scripts/terrain_pipeline/geometry_bounds.py`:

- `bounds_for_cells(cells: Iterable[str], margin_deg: float = 1.0) -> tuple[float, float, float, float] | None` takes the union of `sampling.cell_polygon(cell).bounds` and pads it by `margin_deg`, clamping latitude to ±90. It returns `None` when any polygon reaches past ±180 longitude or the width exceeds 180 degrees. `None` means the set crosses the antimeridian, so callers must not clip.
- `clip_polygonal_to_bounds(geom: BaseGeometry, bounds: tuple[float, float, float, float] | None) -> BaseGeometry` returns `geom` unchanged when `bounds` is `None`. Otherwise it runs `shapely.clip_by_rect`, then `make_valid`, and keeps only Polygon and MultiPolygon parts. It returns `Polygon()` when nothing polygonal remains.
- `bounds_intersect(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> bool`

**Create** `scripts/terrain_pipeline/resolution_profile.py`:

```python
@dataclass(frozen=True)
class ResolutionProfile:
    # H3 resolution the profile describes.
    resolution: int
    # Deterministic raster sample points per cell.
    sample_count: int
    # (tri, slope, elevation_max) raster keys, as named by open_metadata_rasters.
    topo_keys: tuple[str, str, str]
    # Merge lakes into the water mask (tactical cells only).
    include_lakes: bool
    # Compute urban mask metrics (tactical cells only).
    include_urban: bool

COARSE_TOPO_KEYS: Final = ("tri_50KMmn_GMTEDmd", "slope_50KMmn_GMTEDmd", "elevation_50KMma_GMTEDma")
FINE_TOPO_KEYS: Final = ("tri_5KMmn_GMTEDmd", "slope_5KMmn_GMTEDmd", "elevation_5KMma_GMTEDma")
COARSE_TOPO_MIN_EDGE_KM: Final = 100.0

def topo_keys_for_resolution(resolution: int) -> tuple[str, str, str]:
    edge_km = h3.average_hexagon_edge_length(resolution, unit="km")
    return COARSE_TOPO_KEYS if edge_km >= COARSE_TOPO_MIN_EDGE_KM else FINE_TOPO_KEYS

def strategic_profile(resolution: int, config: PipelineConfig) -> ResolutionProfile:
    return ResolutionProfile(resolution, config.area_weighted_samples_per_cell_res1,
                             topo_keys_for_resolution(resolution), include_lakes=False, include_urban=False)

def tactical_profile(resolution: int, config: PipelineConfig) -> ResolutionProfile:
    return ResolutionProfile(resolution, config.area_weighted_samples_per_cell_res4,
                             topo_keys_for_resolution(resolution), include_lakes=True, include_urban=True)
```

**Modify** `scripts/terrain_pipeline/urban_scalerank.py`: split `load_urban_contexts_by_scalerank` in two. The new `load_urban_geometries_by_scalerank(shapefile_path) -> tuple[BaseGeometry, list[tuple[int, BaseGeometry]]]` returns the aggregate WGS84 union and the sorted per-rank WGS84 unions, skipping empty ones. `load_urban_contexts_by_scalerank` calls it and builds contexts exactly as it does now.

**Create** `scripts/terrain_pipeline/metadata_export_core.py`. Move the cell loop out of `metadata_pipeline.py` without changing its logic:

- `compose_forest_mean` (moved). `metadata_pipeline.py` imports it back so existing tests keep importing it from there.
- `MetadataMaskSources` (frozen): `ocean_wgs84`, `ocean_and_lakes_wgs84` (`unary_union((ocean, lakes))`), `urban_aggregate_wgs84`, and `urban_by_rank_wgs84: tuple[tuple[int, BaseGeometry], ...]`.
- `load_metadata_mask_sources(config) -> MetadataMaskSources` loads each shapefile once, using `load_ocean_union_wgs84` and `load_urban_geometries_by_scalerank`.
- `MetadataMaskContexts` (frozen): `water`, `urban_aggregate` (`None` when urban is off), and `urban_by_rank`.
- `build_mask_contexts(sources, profile, clip_bounds) -> MetadataMaskContexts` chooses ocean or ocean plus lakes from `profile.include_lakes`, clips every geometry with `clip_polygonal_to_bounds`, and builds contexts with `build_ocean_predicate_context`. It skips urban ranks whose clipped geometry is empty; they have no cells to report, so the sparse output doesn't change.
- `open_metadata_rasters(config) -> dict[str, DatasetReader]` (moved from `_open_required_rasters`) and `close_rasters(rasters) -> None`.
- `PointIndexes` (frozen): `airports` and `seaports`. `build_point_indexes(config, resolutions: tuple[int, ...]) -> PointIndexes` wraps `build_pair_indexes`.
- `build_metadata_rows(cells, profile, masks, points, rasters) -> list[dict[str, Any]]` is the old `_export_resolution` loop body. It replaces `resolution == res_parent` checks with `profile` fields and keeps the progress log every 10,000 cells. It does not open or close rasters. It still builds `HexMetadataRecordRes1`, and `HexMetadataRecordRes4` when `profile.include_urban` is true, then serializes with `record_res1_to_json_dict` or `record_res4_to_json_dict`. Strategic rows therefore still omit urban keys.
- `write_metadata_file(out_path, resolution, rows) -> None` sorts by `h3_index`, wraps with `build_metadata_envelope`, writes with `write_json_document`, and logs the record count.

**Modify** `scripts/terrain_pipeline/metadata_pipeline.py`. `TerrainMetadataExporter.run` now loads the sources and rasters once, then calls `build_mask_contexts(..., clip_bounds=None)`, `build_metadata_rows`, and `write_metadata_file`: first with `strategic_profile(cfg.res_parent, cfg)` and the res-1 filename, then with `tactical_profile(cfg.res_child, cfg)` and the res-4 filename. Close the rasters in `finally`. Delete `_water_context_for_resolution`, `_topo_keys_for_resolution`, `_open_required_rasters`, and `_export_resolution`. Global `run` still passes `(cfg.res_parent, cfg.res_child)` to `build_point_indexes`.

`build_point_indexes(config, resolutions)` calls the existing `build_pair_indexes(config.input_rasters.root, config.input_rasters.airport_shapefile_name, config.input_rasters.seaport_shapefile_name, resolutions)` and returns a `PointIndexes`.

Add an early branch in `ocean_mask.build_ocean_predicate_context` for an empty geometry: skip projection and return a context prepared from an empty `Polygon()`. Leave the non-empty path as it is, including its existing `make_valid`. A landlocked region whose clipped ocean is empty depends on the empty branch, and the empty-clip test below covers it.

**Update** `scripts/terrain_pipeline/tests/test_metadata_pipeline.py`. Keep importing `compose_forest_mean` from `metadata_pipeline`. Point the missing-shapefile test at `load_metadata_mask_sources` (it still raises `FileNotFoundError`). Point the missing-raster test at `open_metadata_rasters`, and expect the error log from `scripts.terrain_pipeline.metadata_export_core`. Don't delete these tests.

**Test** `scripts/terrain_pipeline/tests/test_resolution_profile.py`:

- Strategic resolution 1: 25 samples, coarse keys, no lakes, no urban.
- Tactical resolution 4: 4 samples, fine keys, lakes, urban.
- Strategic resolution 2 is coarse. Strategic resolution 3 and tactical resolutions 5 and 6 are fine.

**Test** `scripts/terrain_pipeline/tests/test_metadata_export_core.py`:

- Clipping doesn't change metrics. Take a 2-by-2-degree square "ocean" polygon around a resolution-4 cell's centroid. `mask_metrics_for_cell_polygon` gives equal results for a context built from the full square and one clipped to `bounds_for_cells([cell])`.
- An empty clip (bounds far from the polygon) builds a context, and the cell metrics come back `intersects=False`, `all_in_mask=False`, and `mask_edges=0`.
- `bounds_for_cells` returns `None` for a resolution-2 cell that crosses the antimeridian. Pick the first cell in `h3.grid_disk(h3.latlng_to_cell(66.0, 179.9, 2), 1)` whose `cell_polygon(c).bounds[2] > 180`.

Verify:

```powershell
python -m unittest discover -s scripts/terrain_pipeline/tests -p "test_*.py" -v
```

Then run the Global Regression Check for metadata and compare both metadata files. Done when tests pass, both metadata files print `equal`, and every touched file is 600 lines or fewer.

## Phase 2: Landmass and Weather Parameterization

**Modify** `scripts/terrain_pipeline/res1_water_pct.py`:

- Add `load_metadata_rows_by_h3(path: Path) -> dict[str, dict[str, Any]]`, the body of `load_res4_metadata_by_h3` with `path.name` in error messages in place of the literal filename. The global messages don't change because the global filename is the same.
- Add `compute_water_pct_from_children(h3_index, child_rows_by_h3, thresholds, *, child_resolution: int, nodata_fallback: str = "water") -> float`, the old body with `h3.cell_to_children(h3_index, child_resolution)`.
- `load_res4_metadata_by_h3` and `compute_res1_water_pct_from_res4` become one-line wrappers. The second passes `child_resolution=4`.

**Modify** `scripts/terrain_pipeline/landmass.py`:

- Rename `Res1LandMassRecord` to `LandMassRecord`. Search all of `scripts/` and update every reference.
- Add frozen `GeographyIndex` with `continent_tier`, `islands`, and `island_tree`, plus `load_geography_index(config, island_min_area_km2: float) -> GeographyIndex`.
- Give `compute_res1_landmass_record` a keyword `child_resolution: int = 4` and call `compute_water_pct_from_children`.
- Add `build_landmass_records(cells, geography, child_rows_by_h3, config, *, child_resolution) -> list[LandMassRecord]`, the loop from `LandMassExporter.run` with its progress logging.
- Extend `build_landmass_envelope` with keyword defaults `resolution: int = 1`, `water_pct_method: str = "res4_child_water_terrain_fraction"`, and `water_pct_requires: tuple[str, ...] = ("terrain_res4_metadata.json",)`. Emit `requires` as a list.
- `LandMassExporter.run` uses these helpers, still calls `assert_corridor_water_pct_below_threshold`, and still writes the QA file. The new envelope keywords are keyword-only. Their defaults must emit today's `"resolution": 1` and the current `water_pct_source` strings. Regional export passes the regional values and does not call the corridor assertion.

**Create** `scripts/weather_pipeline/__init__.py` (module docstring only) and `scripts/weather_pipeline/weather_pack.py`. Move from `generate_res1_weather.py`: the threshold constants, the WorldClim directory and URLs, `download_and_extract`, `classify_month`, `mild_year`, and `sample_year`. Add:

- `GLOBAL_WATER_LAND_STEPS: Final = 2`
- `nearest_land_months(origin, land_months, max_steps: int)`, the old body with `max_steps` replacing the constant.
- `open_worldclim_bands(worldclim_dir: Path) -> tuple[list[DatasetReader], list[DatasetReader]]` downloads if needed, opens 12 temperature and 12 precipitation bands sorted by name, and raises `RuntimeError` if either count isn't 12.
- `build_weather_payload(metadata_records, tavg, prec, max_steps: int) -> dict[str, Any]`, the record loop from `main`. It returns `{"version": 1, "records": [...]}` sorted by `h3Index`.
- `write_weather_pack(metadata_path: Path, output_path: Path, max_steps: int) -> int` reads the metadata, opens the bands, builds the payload, writes `json.dumps(payload, separators=(",", ":"))`, closes the bands in `finally`, logs, and returns the record count.

**Modify** `scripts/weather_pipeline/generate_res1_weather.py` to a thin CLI: `main(argv: list[str] | None = None) -> int` parses `--metadata` (default: the current `METADATA_PATH`) and `--output` (default: the current `OUTPUT_JSON`), then calls `write_weather_pack(..., GLOBAL_WATER_LAND_STEPS)`.

**Test** `scripts/weather_pipeline/tests/test_weather_pack.py` (also add `scripts/weather_pipeline/tests/__init__.py`):

- `classify_month`: 0 °C is snow; 25 °C with 130 mm is rain that counts as heat; 23 °C with 10 mm is heat; 15 °C with 10 mm is mild.
- `nearest_land_months`: with a land year on a cell from `h3.grid_ring(origin, 3)`, `max_steps=2` returns a mild year and `max_steps=3` returns the land year.

**Modify** `package.json`: add `"weather:test": "python -m unittest discover -s scripts/weather_pipeline/tests -p \"test_*.py\" -v"`.

Verify:

```powershell
python -m unittest discover -s scripts/terrain_pipeline/tests -p "test_*.py" -v
npm run weather:test
```

Then run the Global Regression Check for landmass and weather. Done when tests pass and both comparisons print `equal`.

## Phase 3: Naming Parameterization

**Create** `scripts/naming_pipeline/naming_json_writers.py`. Move from `generate_hex_naming.py`: `SCHEMA_VERSION`, `RowGroupCursor` (if it's defined in that file), `_group_rows`, `_make_group_cursor`, and `_write_pretty_record`. Rename the two writers and give each a required keyword resolution:

- `_write_res1_json` becomes `write_strategic_naming_json(conn, cells, out_path, *, resolution: int) -> None`. It writes `"resolution": {resolution}` in place of the literal `1`.
- `_write_res4_json` becomes `write_tactical_naming_json(conn, cells, out_path, *, resolution: int) -> None`. It writes `"resolution": {resolution}` in place of the literal `4`.

The SQLite table names (`countries_res1`, `cities_res4`, and the rest) don't change. Add one comment in `naming_tables.py` saying the `res1` tables hold strategic rows and the `res4` tables hold tactical rows, for any resolution pair.

**Modify** `scripts/naming_pipeline/generate_hex_naming.py`:

```python
@dataclass(frozen=True)
class NamingScope:
    # H3 resolution for countries, states, and water at the strategic level.
    strategic_resolution: int
    # H3 resolution for the tactical file, including city points.
    tactical_resolution: int
    # Strategic cells to write, sorted.
    strategic_cells: tuple[str, ...]
    # Tactical cells to write, sorted.
    tactical_cells: tuple[str, ...]
    # When True, rows outside the cell sets above are skipped on insert.
    filter_cells: bool
    # WGS84 bounds for clipping polygons before H3 overlap; None means no clip.
    clip_bounds: tuple[float, float, float, float] | None
```

- Replace the `res4_cell_filter` keyword on `_insert_countries`, `_insert_states`, `_insert_cities`, and `_insert_water` with `scope: NamingScope`. Use `scope.strategic_resolution` and `scope.tactical_resolution` in place of the literals 1 and 4. Build each frozenset once per insert function, not once per feature. When `scope.filter_cells` is False, keep today's behavior: insert every strategic overlap cell, and insert every tactical overlap cell. When it is True, filter the two lists separately:
  - Strategic cells (the ones inserted into the `res1` tables, and strategic water) must be in `scope.strategic_cells`.
  - Tactical cells (the ones inserted into the `res4` tables, cities, and tactical water) must be in `scope.tactical_cells`.
  - Don't drop a strategic cell because it is absent from the tactical set, or the reverse. The sets use different resolutions, so almost no id appears in both.
- Clip a polygon feature only when `scope.clip_bounds` is not `None`. In that case, skip the feature when `geom.bounds` misses the clip bounds, then run `clip_polygonal_to_bounds` before `_h3_overlap_cells`, and skip an empty result. When `clip_bounds` is `None`, pass the geometry through unchanged. City points don't need clipping; the cell filter handles them.
- Add `run_naming_export(*, data_root: Path, scope: NamingScope, output_strategic: Path, output_tactical: Path) -> None`. It runs the body of `run_pipeline` after cell generation.
- Add `global_naming_scope(max_child_cells: int | None) -> NamingScope`. It enumerates the full res-1 and res-4 lists, applies the existing tactical cap, and sets `clip_bounds = None`. `strategic_cells` is always the full res-1 list, including when the tactical list is capped. `filter_cells` is True only when the tactical list is capped, which filters tactical inserts down to that cap and leaves strategic inserts complete.
- `run_pipeline` keeps its signature and calls `run_naming_export(scope=global_naming_scope(max_child_cells), ...)`.

**Update** `scripts/naming_pipeline/tests/test_generate_hex_naming.py` to import the writers from `naming_json_writers` and pass `resolution=1` and `resolution=4`. Add one test: `write_tactical_naming_json(..., resolution=6)` writes `"resolution": 6`.

Verify:

```powershell
python -m unittest discover -s scripts/naming_pipeline/tests -p "test_*.py" -v
python -m unittest discover -s scripts/terrain_pipeline/tests -p "test_*.py" -v
```

Then run the Global Regression Check for naming. Done when tests pass and both naming files print `equal`. `generate_hex_naming.py` must stay under 1,000 lines. If this phase pushes it over 800, move `_insert_countries`, `_insert_states`, `_insert_cities`, and `_insert_water` into `scripts/naming_pipeline/naming_insert.py` and leave `generate_hex_naming.py` as the orchestrator. Don't delete docstrings to make the line count.

## Phase 4: Road and Rail Parameterization

**Modify** `scripts/terrain_pipeline/road_rail_sides.py`:

- Add `h3_cells_for_linestring(line, *, resolution: int, use_fast_segment_grid_path: bool = DEFAULT_FAST_MODE) -> list[str]`, the body of `h3_cells_for_linestring_res4` with every `RESOLUTION` in that body replaced by `resolution` (endpoint sampling, the grid-path fallback, and densification). `_expand_h3_cells_disk1` stays unchanged; it expands whatever cells it is given. `h3_cells_for_linestring_res4` becomes a wrapper that passes `RESOLUTION`.
- Add `feature_has_scalerank_in_range(props, scalerank_min: int, scalerank_max: int) -> bool`, the body of `_feature_has_export_scalerank` with parameters. `_feature_has_export_scalerank` becomes a wrapper that passes the global constants.
- Move the `RoadRailSidesExporter` class, including `run_qa_line_cell_coverage`, to a new module, `road_rail_sides_export.py`.

**Create** `scripts/terrain_pipeline/road_rail_sides_export.py`:

```python
@dataclass(frozen=True)
class RoadRailScanOptions:
    # H3 resolution of the cells that receive side masks.
    resolution: int = RESOLUTION
    # Inclusive scalerank range per layer, keyed "road" and "rail".
    # Default is the module-level GLOBAL_LAYER_RANGES constant, not a fresh dict.
    scalerank_range_by_layer: Mapping[str, tuple[int, int]] = GLOBAL_LAYER_RANGES
    # Only these cells get masks; None means every touched cell.
    cell_filter: frozenset[str] | None = None
    # Skip features whose bounds miss this WGS84 box; None means no prefilter.
    feature_bounds: tuple[float, float, float, float] | None = None
    # Debug cap on features read per layer.
    max_features: int | None = None
    # Candidate-cell strategy; True is the fast grid-path mode.
    use_fast_segment_grid_path: bool = DEFAULT_FAST_MODE
```

Define `GLOBAL_LAYER_RANGES` above the dataclass as a `MappingProxyType` of `{"road": (ROAD_RAIL_EXPORT_SCALERANK_MIN, ROAD_RAIL_EXPORT_SCALERANK_MAX), "rail": (ROAD_RAIL_EXPORT_SCALERANK_MIN, ROAD_RAIL_EXPORT_SCALERANK_MAX)}`.

- `scan_road_rail_side_masks(road_path, rail_path, options) -> dict[str, tuple[list[bool], list[bool]]]` is the `accumulate` logic from `run_export`. It applies each layer's range through `feature_has_scalerank_in_range` and uses `h3_cells_for_linestring(..., resolution=options.resolution)`. `max_features` counts features as they are read, including scalerank skips, and stops before the next feature once the count reaches the cap. When set, it skips features outside `feature_bounds` and candidate cells outside `cell_filter` before clipping to the cell polygon. It keeps the current info logs, now naming each layer's range.
- `build_road_rail_sides_envelope(masks_by_cell, *, options, road_path, rail_path) -> dict[str, Any]` writes the same keys as today, in the same order. `resolution` is `options.resolution`. `route_scalerank_filter` holds the road range. When the rail range differs, it also writes `rail_scalerank_filter` with the same `{min, max}` shape. With global defaults the rail key is absent and the output matches today, including `inputs` path strings and sha256 values.
- `write_road_rail_sides_json(out_path, envelope) -> None` handles the temporary-file write and replace, plus the zero-record error log.
- `RoadRailSidesExporter.run_export` calls these three with default options and the CLI's `max_features` and mode.

**Update** imports in `road_rail_sides_cli.py` and `tests/test_road_rail_sides.py` (`RoadRailSidesExporter` now comes from `road_rail_sides_export`).

**Modify** `scripts/terrain_pipeline/road_rail_vectors_cli.py`:

```python
@dataclass(frozen=True)
class VectorExportOptions:
    # Douglas-Peucker tolerance in WGS84 degrees.
    simplify_deg: float
    # Debug cap on features read per layer.
    max_features: int | None
    # Inclusive scalerank range per layer, keyed "road" and "rail".
    scalerank_range_by_layer: Mapping[str, tuple[int, int]]
    # When set with point_cells, keep a row only if one of its points falls in that set.
    point_resolution: int | None = None
    # Strategic cells that keep a vector row. None keeps every row.
    point_cells: frozenset[str] | None = None
```

- `collect_vector_rows(*, kind: str, shapefile_path: Path, options: VectorExportOptions) -> list[dict[str, object]]` replaces `_collect_rows_for_layer`. `max_features` counts features read, including scalerank skips, the same way the function does today. Points stay `[lat, lng]`. When `point_cells` is not `None`, keep a row only if some point satisfies `h3.latlng_to_cell(lat, lng, point_resolution) in point_cells`.
- `build_vectors_payload(rows, *, road_path, rail_path, options) -> dict[str, Any]` builds the current payload. The `inputs` block keeps its current keys.
- `run_export` builds global options (0 to 4 for both layers, `point_cells=None`) and keeps its output value-identical, including key order.

**Test** in `tests/test_road_rail_sides.py`:

- `feature_has_scalerank_in_range({"scalerank": 6}, 0, 6)` is True; rank 7 is False.
- `h3_cells_for_linestring` on a short line with `resolution=6` returns only cells where `h3.get_resolution(c) == 6`.

Verify:

```powershell
python -m unittest discover -s scripts/terrain_pipeline/tests -p "test_*.py" -v
(Get-Content -LiteralPath scripts/terrain_pipeline/road_rail_sides.py).Count
(Get-Content -LiteralPath scripts/terrain_pipeline/road_rail_sides_export.py).Count
```

Then run the Global Regression Check for road/rail sides and vectors. Done when tests pass, both files print `equal`, and both modules are 600 lines or fewer. If `road_rail_sides.py` is still over 600 after the class move, move `h3_cells_for_linestring` and its line-sampling helpers into `scripts/terrain_pipeline/road_rail_cells.py`. The global wrapper names stay importable from `road_rail_sides.py`.

## Phase 5: Regional Package Foundation

**Create** `scripts/regional_pipeline/__init__.py` (module docstring only) and these modules.

`region_models.py`:

- `MemberUnit` (frozen): `adm0_a3: str`, `include_admin1: tuple[str, ...] = ()`, and `exclude_admin1: tuple[str, ...] = ()`. Admin-1 codes are Natural Earth `iso_3166_2` values. Use include or exclude, not both.
- `CentroidBox` (frozen): `lat_min`, `lat_max`, `lon_min`, `lon_max`, plus `contains(lat: float, lng: float) -> bool`. When `lon_min > lon_max`, the box wraps: a longitude matches if `lng >= lon_min or lng <= lon_max`.
- `FootprintTargets` and `FootprintCounts` (frozen): `land`, `sea`, and `neutral_border`, all `int`.
- `HexRole(str, Enum)`: `LAND = "land"`, `SEA = "sea"`, and `NEUTRAL_BORDER = "neutral_border"`.
- `RegionDefinition` (frozen): `region_id`, `display_name`, `strategic_resolution`, `tactical_resolution`, `members: tuple[MemberUnit, ...]`, `centroid_box`, `sea_reach_km: float`, `neutral_reach_km: float`, `desert_trim_reach_km: float | None`, and `targets: FootprintTargets`.
- `RegionFootprint` (frozen): `region_id`, `strategic_resolution`, `tactical_resolution`, and `roles: Mapping[str, HexRole]` (wrap in `MappingProxyType`). Methods: `strategic_cells() -> list[str]` (sorted keys), `tactical_cells() -> list[str]` (sorted union of `h3.cell_to_children(c, tactical_resolution)`), and `counts() -> FootprintCounts`.

`region_catalog.py` holds `REGION_DEFINITIONS: Final[tuple[RegionDefinition, ...]]` with exactly the 23 definitions in [Region Catalog](#region-catalog), plus `region_by_id(region_id) -> RegionDefinition` (raises `KeyError` naming the valid ids) and `all_region_ids() -> list[str]`.

`scalerank_policy.py`:

```python
@dataclass(frozen=True)
class ScalerankPolicy:
    road_max: int
    rail_max: int
    urban_overlay_max: int
    major_airport_max: int
    major_seaport_max: int
    city_label_max: int

SCALERANK_MIN: Final = 0
GLOBAL_TACTICAL_POLICY: Final = ScalerankPolicy(4, 4, 5, 5, 5, 4)
POLICY_BY_TACTICAL_RESOLUTION: Final = MappingProxyType({
    4: GLOBAL_TACTICAL_POLICY,
    5: ScalerankPolicy(6, 6, 6, 6, 6, 6),
    6: ScalerankPolicy(8, 8, 7, 8, 8, 7),
})
```

Also add `policy_for_tactical_resolution(resolution) -> ScalerankPolicy` (raises `ValueError` for other resolutions) and `policy_to_json(policy) -> dict[str, int]`, which includes `scalerank_min`. The class docstring states the scalerank reasoning in its own words: about 1.4 scalerank steps per H3 resolution step, roads and rail at the wide end, urban near the narrow end, and city labels skipping rank 5. It doesn't name this plan or its headings.

`regional_scaling.py`:

- `center_spacing_km(resolution) -> float`: `h3.average_hexagon_edge_length(resolution, unit="km") * math.sqrt(3)`.
- `island_min_area_km2_for(strategic_resolution, global_min_km2: float = 2000.0) -> float`: `global_min_km2 * average_hexagon_area(res) / average_hexagon_area(1)`, both in `km^2`.
- `weather_water_land_steps_for(strategic_resolution, global_steps: int = 2) -> int`: `max(global_steps, round(global_steps * edge(1) / edge(res)))`.

`region_paths.py`:

- `REGIONS_ROOT: Final = Path("data/generated/regions")`, one `Final` filename constant per file in [Output Folder and Files](#output-folder-and-files), and `REGIONAL_QA_DIR = REGIONS_ROOT / "qa"`.
- `RegionPaths` (frozen) with `folder: Path`. It has one property per file, plus `qa_dir` and `landmass_qa`, each logging at trace level. `RegionPaths.for_region(region_id, root=REGIONS_ROOT)` builds it.

`regional_cli.py`, using `argparse` subcommands with a shared `--verbose` flag and `configure_logging`:

- `list` prints one line per region: id, `res_s/res_t`, and targets.
- `validate --data-root F:/Data` checks that these exist under the data root: `ne_10m_admin_0_countries.shp`, `ne_10m_admin_1_states_provinces.shp`, `ne_10m_populated_places.shp`, `ne_10m_urban_areas.shp`, `ne_10m_ocean.shp`, `ne_10m_lakes.shp`, `ne_10m_airports.shp`, `ne_10m_ports.shp`, `ne_10m_roads.shp`, `ne_10m_railroads.shp`, `ne_10m_geography_marine_polys.shp`, `ne_10m_geography_regions_polys.shp`, and every raster named in `InputRasterSet`. It also checks the catalog: unique ids, `res_t == res_s + 3`, `res_s` in {2, 3}, and a policy for each tactical resolution. It returns exit code 1 with a list of problems, or 0.

**Test** (all under `scripts/regional_pipeline/tests/`, with an `__init__.py`):

- `test_region_catalog.py`: 23 unique ids matching `^[a-z][a-z0-9_]*$`; every pair is (2, 5) or (3, 6); `targets` match the catalog table for three spot regions (`western_europe`, `caribbean`, `eastern_europe`); no member sets both include and exclude lists.
- `test_scalerank_policy.py`: tactical 4, 5, and 6 return the table rows; tactical 7 raises `ValueError`.
- `test_regional_scaling.py`: the island floor is 2000.0 at resolution 1, about 284.7 at 2, and about 40.6 at 3 (`places=1`); weather steps are 2, 5, and 14.
- `test_region_models.py`: a wrapping box with `lon_min=12, lon_max=-168` contains longitudes 100 and -170 and excludes 0.

**Modify** `package.json`: add `"regional:test": "python -m unittest discover -s scripts/regional_pipeline/tests -p \"test_*.py\" -v"` and `"regional:validate": "python -m scripts.regional_pipeline.regional_cli validate --verbose"`.

Verify:

```powershell
npm run regional:test
npm run regional:validate
python -m scripts.regional_pipeline.regional_cli list
```

If `regional_cli.py` passes 600 lines in this phase or a later one, move the subcommand bodies into `scripts/regional_pipeline/regional_cli_handlers.py` and leave argument parsing in `regional_cli.py`.

Done when tests pass, `validate` exits 0, and `list` prints 23 regions.

## Phase 6: Footprint Builder and Tuning

**Create** `scripts/regional_pipeline/member_geometry.py`:

- `AdminLayers` (frozen) holds admin-0 geometry by `ADM0_A3`, and admin-1 records as `(adm0_a3, iso_3166_2, geometry)`. Geometries are WGS84, repaired with `make_valid`. Resolve field names case-insensitively, as `generate_hex_naming._resolve_field_names` does.
- `load_admin_layers(data_root: Path) -> AdminLayers`
- `validate_member_codes(definition, layers) -> None` raises `ValueError` listing every unknown `ADM0_A3`, unknown `iso_3166_2`, or admin-1 code whose `adm0_a3` doesn't match its member.
- `build_member_geometry(definition, layers) -> BaseGeometry`. A whole-country member uses its admin-0 polygon. A member with include or exclude lists uses the union of that country's admin-1 polygons, filtered by the list. Return the `unary_union` of all members.

Extend `regional_cli validate` to call `validate_member_codes` for every region.

**Create** `scripts/regional_pipeline/cell_land_overlap.py`:

- `overlap_km2(cell: str, geometry: BaseGeometry) -> float` computes `h3.cell_area(cell, "km^2") * inter_area / poly.area`, where `poly = sampling.cell_polygon(cell)`. When `poly.bounds[2] > 180` (an unwrapped antimeridian cell), add the intersection with `shapely.affinity.translate(geometry, xoff=360)`. Within one cell, the ratio of planar-degree areas is accurate enough for these thresholds.
- `CountryLandIndex` builds an `STRtree` over admin-0 geometries. `CountryLandIndex.from_layers(layers)` creates it. `land_km2(cell) -> float` sums `overlap_km2` over tree hits. Query with `poly`, and also with `translate(poly, xoff=-360)` when the cell is unwrapped.

**Create** `scripts/regional_pipeline/footprint_inputs.py`:

- `FootprintInputs` (frozen): `layers`, `land_index`, `populated_points: tuple[tuple[float, float], ...]` (lat, lng), and `urban_wgs84` (union of all urban polygons).
- `load_footprint_inputs(data_root) -> FootprintInputs`
- `build_footprint_candidates(definition, inputs, max_reach_km: float) -> list[CandidateCell]` (`CandidateCell` is defined in `footprint.py`):
  1. Member geometry from `build_member_geometry`.
  2. Touching cells: for each polygon part, `h3.h3shape_to_cells_experimental(h3.geo_to_h3shape(part.__geo_interface__), res_s, contain="overlap")`.
  3. Ring depth `k = ceil(max_reach_km / center_spacing_km(res_s)) + 1`. Candidates are the union of `h3.grid_disk(c, k)` over touching cells.
  4. Fill each candidate's fields. `lat` and `lng` come from `h3.cell_to_latlng`, and `in_box` comes from `CentroidBox.contains`. Explode only `Polygon` and `MultiPolygon` parts. The settled flag uses a set of strategic cells that contain a populated point (`h3.latlng_to_cell`) or overlap the urban union (`h3shape_to_cells_experimental` on urban parts whose bounds meet the member bounds), or whose `land_km2 < 0.95 * cell_area_km2`.

**Create** `scripts/regional_pipeline/footprint.py`, pure logic with no file input. It defines `CandidateCell` (frozen): `h3_index`, `lat`, `lng`, `in_box`, `land_km2`, `member_km2`, `cell_area_km2`, and `settled`. `footprint_inputs.py` imports `CandidateCell` and `SETTLED_LAND_SHARE_MAX` from here, so the import runs one way only.

```python
MIN_LAND_KM2: Final = 1.0
MEMBER_SHARE_MIN: Final = 0.5
SETTLED_LAND_SHARE_MAX: Final = 0.95  # also used by footprint_inputs

def classify_footprint(definition: RegionDefinition, candidates: Sequence[CandidateCell]) -> RegionFootprint:
    in_box = [c for c in candidates if c.in_box]
    member = [c for c in in_box if c.land_km2 >= MIN_LAND_KM2 and c.member_km2 >= MEMBER_SHARE_MIN * c.land_km2]
    other_land = [c for c in in_box if c.land_km2 >= MIN_LAND_KM2 and c not in member]
    water = [c for c in in_box if c.land_km2 < MIN_LAND_KM2]
    if definition.desert_trim_reach_km is not None:
        settled = [c for c in member if c.settled]
        member = [c for c in member if _nearest_km(c, settled) <= definition.desert_trim_reach_km]
    if not member:
        raise ValueError(f"Region {definition.region_id} has no member land cells.")
    roles = {c.h3_index: HexRole.LAND for c in member}
    roles |= {c.h3_index: HexRole.SEA for c in water if _nearest_km(c, member) <= definition.sea_reach_km and definition.sea_reach_km > 0}
    roles |= {c.h3_index: HexRole.NEUTRAL_BORDER for c in other_land if _nearest_km(c, member) <= definition.neutral_reach_km and definition.neutral_reach_km > 0}
    return RegionFootprint(...)
```

Use a set of member ids rather than `c not in member` on a list. `_nearest_km` is the brute-force minimum of `h3.great_circle_distance((a.lat, a.lng), (b.lat, b.lng), unit="km")`, returning `math.inf` for an empty list. Candidate lists hold a few thousand cells at most, so brute force is fine.

Also add `sweep_footprint_counts(definition, candidates, axis: str, reaches_km: Sequence[float]) -> list[tuple[float, FootprintCounts]]` for axis `"trim"`, `"sea"`, or `"neutral"`. For each reach, it runs `classify_footprint` on `dataclasses.replace(definition, <axis field>=reach)`.

**Create** `scripts/regional_pipeline/region_manifest.py`:

- `MANIFEST_SCHEMA_VERSION: Final = "1.0.0"`
- `build_manifest_document(definition, footprint, policy) -> dict[str, Any]` builds this document:

  ```json
  {
    "schema_version": "1.0.0",
    "region_id": "western_europe",
    "display_name": "Western Europe",
    "res_s": 3,
    "res_t": 6,
    "generated_at_utc": "<ISO-8601 UTC>",
    "scalerank_policy": {"scalerank_min": 0, "road_max": 8, "rail_max": 8, "urban_overlay_max": 7, "major_airport_max": 8, "major_seaport_max": 8, "city_label_max": 7},
    "derived_constants": {"island_min_area_km2": 40.65, "weather_water_land_steps": 14, "land_water_threshold_pct": 85.0, "strategic_sample_count": 25, "tactical_sample_count": 4, "strategic_topo_keys": ["tri_5KMmn_GMTEDmd", "slope_5KMmn_GMTEDmd", "elevation_5KMma_GMTEDma"], "tactical_topo_keys": ["tri_5KMmn_GMTEDmd", "slope_5KMmn_GMTEDmd", "elevation_5KMma_GMTEDma"]},
    "footprint": {
      "rules": {"min_land_km2": 1.0, "member_share_min": 0.5, "sea_reach_km": 100.0, "neutral_reach_km": 100.0, "desert_trim_reach_km": null},
      "targets": {"land": 136, "sea": 38, "neutral_border": 91},
      "actual": {"land": 0, "sea": 0, "neutral_border": 0}
    },
    "files": {"metadata_s": "terrain_res_s_metadata.json", "metadata_t": "terrain_res_t_metadata.json", "naming_s": "terrain_res_s_naming.json", "naming_t": "terrain_res_t_naming.json", "landmass_s": "terrain_res_s_landmass.json", "weather_s": "terrain_res_s_weather.json", "road_rail_sides_t": "terrain_res_t_road_rail_sides.json", "road_rail_vectors_t": "terrain_res_t_road_rail_vectors.json"},
    "hexes": [{"h3_index": "83...", "role": "land"}]
  }
  ```

  Sort `hexes` by `h3_index`. Compute `derived_constants` from `regional_scaling` and `resolution_profile`. The numbers above are an example; never hand-enter them.
- `write_manifest(paths: RegionPaths, document) -> None` uses `metadata_io.write_json_document`.
- `RegionManifest` (frozen): `region_id`, `display_name`, `policy`, and `footprint: RegionFootprint`. `read_manifest(path) -> RegionManifest` validates `schema_version`, that `res_s`, `res_t`, and `region_id` match the catalog, that every role is known, and that every `h3_index` has resolution `res_s`. It raises `ValueError` naming the file and the problem.

**Add** to `regional_cli.py`: `footprint (--region ID | --all) [--sweep trim|sea|neutral] [--write] --data-root F:/Data`.

- Load `FootprintInputs` once per process. Build candidates with `max_reach_km` set to the largest of 800 and the definition's reaches.
- Without `--sweep`, print one row per region: land, sea, and neutral as actual/target with percent deviation.
- With `--sweep`, print counts for reaches 0 to 800 km in 25 km steps.
- With `--write`, write the manifest.

**Test** `scripts/regional_pipeline/tests/test_footprint.py`. Use synthetic `CandidateCell` lists built from real resolution-3 cells around one point (`h3.grid_disk(h3.latlng_to_cell(48.0, 8.0, 3), 4)`), with land and member values set by hand:

- A cell with `member_km2 = 0.6 * land_km2` is `land`; one at `0.4` is excluded when the neutral reach is 0.
- A water cell 1 ring from land is `sea` with a 200 km reach and excluded with a 0 reach.
- Non-member land 1 ring away is `neutral_border` with a 200 km reach.
- A cell outside the box gets no role even when it would qualify.
- Desert trim removes an unsettled member cell 4 rings from the only settled cell when the trim reach is 150 km.
- No member land raises `ValueError`.

**Test** `scripts/regional_pipeline/tests/test_cell_land_overlap.py`: a cell's own polygon gives `overlap_km2` within 1 percent of `h3.cell_area`; a polygon 10 degrees away gives 0.

### Footprint Tuning

Tune in this order. Edit only `region_catalog.py`, then re-run.

1. Run `python -m scripts.regional_pipeline.regional_cli footprint --all` and save the table.
2. `libya_egypt_sudan`: run `--sweep trim` and set `desert_trim_reach_km` to the 25 km step whose land count is closest to 262.
3. For each region whose land count is off by more than 10 percent, apply only the fallback listed for it below, then re-run. If none is listed, or it doesn't help, leave the region as it is and record the gap.
   - `northern_america`: change `centroid_box.lat_max` in 1 degree steps between 52 and 62.
   - `eastern_europe`: if land is high, lower `lat_max` to 77.
   - `northern_europe`: if land is high, remove `ISL`, then `FRO`.
   - `west_africa_coast`: if land is low, add `BFA`. If land is high, remove `GIN`, then `GNB`.
4. For each region with a sea target above 0, run `--sweep sea` and set `sea_reach_km` to the closest step. Break ties toward the smaller reach. Regions with a sea target of 0 keep 0.
5. Do the same with `--sweep neutral` for `western_europe`, `western_asia_north`, and `south_eastern_asia`. Every other region keeps `neutral_reach_km = 0.0`.
6. Run `footprint --all --write`.
7. Write `.spec/regional-footprint-tuning-results.md`: the final table (targets, actuals, deviations, chosen reaches), every fallback applied, and every region still off target.

Verify:

```powershell
npm run regional:test
npm run regional:validate
python -m scripts.regional_pipeline.regional_cli footprint --all
Get-ChildItem data/generated/regions -Recurse -Filter region_manifest.json | Measure-Object
```

Done when tests pass, 23 manifests exist, every region's land count is within 10 percent or recorded in the results file, and the results file is written.

## Phase 7: Regional Metadata

**Create** `scripts/regional_pipeline/regional_metadata.py`:

- `SharedMetadataInputs` (frozen): `config: PipelineConfig`, `sources: MetadataMaskSources`, and `rasters: Mapping[str, DatasetReader]`.
- `open_shared_metadata_inputs(config) -> SharedMetadataInputs` and `close_shared_metadata_inputs(shared) -> None`.
- `export_region_metadata(manifest, paths, shared, *, max_tactical_cells: int | None = None) -> None`:
  1. Strategic cells come from `manifest.footprint.strategic_cells()`. Tactical cells come from `tactical_cells()`, capped to a sorted prefix when `max_tactical_cells` is set.
  2. `clip_bounds = bounds_for_cells(strategic_cells)` for every region. `None` means do not clip. Eastern Europe is expected to return `None` because Russia crosses the antimeridian. Don't hard-code that region id.
  3. `points = build_point_indexes(config, (res_s, res_t))`.
  4. Strategic pass: `strategic_profile(res_s, config)`, then `build_mask_contexts`, `build_metadata_rows`, and `write_metadata_file(paths.metadata_s, res_s, rows)`.
  5. Tactical pass: the same with `tactical_profile(res_t, config)` and `paths.metadata_t`.
  6. Log wall time per pass at info level.

**Create** `scripts/regional_pipeline/regional_steps.py`:

- `STEP_ORDER: Final = ("metadata", "naming", "landmass", "weather", "road-rail-sides", "road-rail-vectors")`
- `RunOptions` (frozen): `steps: tuple[str, ...]`, `data_root: Path`, `skip_existing: bool`, and `max_tactical_cells: int | None`.
- `run_region_steps(region_ids: Sequence[str], options: RunOptions) -> None` reads each manifest (it must exist), runs the requested steps in `STEP_ORDER`, and opens the shared metadata inputs once per process, only when `metadata` is requested. With `skip_existing`, it skips a step whose output files all exist, except tactical metadata: that file is complete only when its `record_count` equals `len(manifest.footprint.tactical_cells())`. A smaller file was written by the smoke-test cap and must be regenerated. Wire in only the `metadata` step now. The other steps raise `NotImplementedError` until later phases add them.

**Create** `scripts/regional_pipeline/pack_checks.py`:

- `CheckResult` (frozen): `file`, `status` (`"PASS"`, `"FAIL"`, `"WARN"`, or `"SKIP"`), and `detail`.
- `check_region_pack(region_id, root=REGIONS_ROOT) -> list[CheckResult]`. A missing file is `SKIP`. Checks:
  - Manifest: `read_manifest` succeeds.
  - Strategic metadata: `schema_version == "2.0.0"`, `resolution == res_s`, `record_count == len(records)`, and the `h3_index` set equals the strategic cells.
  - Tactical metadata: the same against `res_t` and the tactical cells, and every record has `urban_by_scalerank`.
  - Sanity, as `WARN` rather than `FAIL`: at least 80 percent of `sea` hexes have `all_water` true, and at least 95 percent of `land` hexes have it false.

**Add** to `regional_cli.py`:

- `run (--region ID | --all) [--steps a,b,...] [--skip-existing] [--max-tactical-cells N] --data-root F:/Data`
- `check (--region ID | --all)` prints one line per result and exits 1 if any `FAIL`.

Verify (the full runs can take hours; run them in the background and watch the logs):

```powershell
python -m scripts.regional_pipeline.regional_cli run --region western_europe --steps metadata --max-tactical-cells 2000 --verbose
python -m scripts.regional_pipeline.regional_cli run --region western_europe --steps metadata --verbose
python -m scripts.regional_pipeline.regional_cli check --region western_europe
python -m scripts.regional_pipeline.regional_cli run --region eastern_europe --steps metadata --verbose
python -m scripts.regional_pipeline.regional_cli check --region eastern_europe
```

After the capped run, confirm `terrain_res_t_metadata.json` has `record_count` 2000 and `resolution` 6. Don't run `check` on that file; the check compares it with the full tactical cell set and will fail until the next command overwrites it. Record each full run's wall time. If one region's metadata takes more than 4 hours, stop and report the timings. Don't add multiprocessing without the user's approval. Don't pass `--max-tactical-cells` to any later command.

Done when both full runs finish and `check` shows no `FAIL` for either region.

## Phase 8: Regional Naming

**Create** `scripts/regional_pipeline/regional_naming.py`: `export_region_naming(manifest, paths, data_root) -> None`. It builds a `NamingScope` (strategic and tactical resolutions from the manifest, cell tuples from the footprint, `filter_cells=True`, `clip_bounds=bounds_for_cells(strategic_cells)`) and calls `run_naming_export(..., output_strategic=paths.naming_s, output_tactical=paths.naming_t)`.

Wire the `naming` step into `run_region_steps`. Extend `check_region_pack`:

- Naming files: `schema_version == "1.2.0"`, the right resolution, `record_count` matches, and the `h3_index` sets equal the strategic and tactical cells.
- Tactical records have `cities`; strategic records don't.

Verify:

```powershell
python -m scripts.regional_pipeline.regional_cli run --region western_europe --steps naming --verbose
python -m scripts.regional_pipeline.regional_cli check --region western_europe
@'
import json, h3
cell = h3.latlng_to_cell(48.8566, 2.3522, 6)
data = json.load(open("data/generated/regions/western_europe/terrain_res_t_naming.json", encoding="utf-8"))
row = next(r for r in data["records"] if r["h3_index"] == cell)
print([c["name"] for c in row["cities"]])
'@ | python -
```

Done when `check` has no `FAIL` and the printed list includes `Paris`.

## Phase 9: Regional Landmass and Weather

**Create** `scripts/regional_pipeline/regional_landmass.py`: `export_region_landmass(manifest, paths, config) -> None`.

1. `island_km2 = island_min_area_km2_for(res_s)`, then `geography = load_geography_index(config, island_km2)`.
2. `child_rows = load_metadata_rows_by_h3(paths.metadata_t)`
3. `records = build_landmass_records(strategic_cells, geography, child_rows, config, child_resolution=res_t)`
4. Write `build_landmass_envelope(records=..., island_min_area_km2=island_km2, resolution=res_s, water_pct_method="tactical_child_water_terrain_fraction", water_pct_requires=("terrain_res_t_metadata.json",))` to `paths.landmass_s`.
5. Write `build_qa_summary(records)` to `paths.landmass_qa`. The global spot-check hexes aren't in regional sets, so `spot_checks` comes out empty.

Skip the global corridor assertion. It names res-1 hexes.

**Create** `scripts/regional_pipeline/regional_weather.py`: `export_region_weather(manifest, paths) -> None` calls `write_weather_pack(paths.metadata_s, paths.weather_s, weather_water_land_steps_for(res_s))`. Land months come only from region cells, so a sea hex copies the nearest land hex inside the region.

Wire both steps. Extend `check_region_pack`:

- Landmass: `resolution == res_s`, the key set equals the strategic cells, and every `water_pct` is between 0 and 100.
- Weather: the `h3Index` set equals the strategic cells, and every row has 12 months.
- Sanity `WARN`: at least 80 percent of `sea` hexes have `water_pct >= 85`.

Verify:

```powershell
python -m scripts.regional_pipeline.regional_cli run --region western_europe --steps landmass,weather --verbose
python -m scripts.regional_pipeline.regional_cli run --region eastern_europe --steps naming,landmass,weather --verbose
python -m scripts.regional_pipeline.regional_cli check --all
```

Done when `check` shows no `FAIL` for either region. The other 21 regions show `SKIP` for their data files.

## Phase 10: Regional Road and Rail

**Create** `scripts/regional_pipeline/regional_road_rail.py`:

- `export_region_road_rail_sides(manifest, paths, data_root) -> None` builds `RoadRailScanOptions(resolution=res_t, scalerank_range_by_layer={"road": (0, policy.road_max), "rail": (0, policy.rail_max)}, cell_filter=frozenset(tactical_cells), feature_bounds=bounds_for_cells(strategic_cells))` with fast mode, then scans, builds the envelope, and writes `paths.road_rail_sides_t`.
- `export_region_road_rail_vectors(manifest, paths, data_root) -> None` builds `VectorExportOptions` with the same ranges, the default `simplify_deg` of `2.5e-5`, `point_resolution=res_s`, and `point_cells=frozenset(strategic_cells)`. It writes `build_vectors_payload(...)` with compact separators, as the global CLI does, to `paths.road_rail_vectors_t`.

Wire both steps. Extend `check_region_pack`:

- Sides: `resolution == res_t`, every `h3_index` is a tactical cell, `route_scalerank_filter.max == policy.road_max`, and `record_count > 0` (`WARN` if 0).
- Vectors: `rows` aren't empty, and every `kind` is `road` or `rail`.

Verify:

```powershell
python -m scripts.regional_pipeline.regional_cli run --region western_europe --steps road-rail-sides,road-rail-vectors --verbose
python -m scripts.regional_pipeline.regional_cli run --region eastern_europe --steps road-rail-sides,road-rail-vectors --verbose
python -m scripts.regional_pipeline.regional_cli check --all
```

Done when `check` shows no `FAIL`, and both regions have more than 0 side records and vector rows.

## Phase 11: Density Report

**Create** `scripts/regional_pipeline/density_report.py`. One metrics function serves both packs. Inputs are file paths, a policy, and an optional role map; the global pack has no role map.

- Strategic land hexes are landmass rows with `water_pct < 85`. For a region, they must also have role `land`.
- Tactical land cells are tactical metadata rows where `classify_res4_metadata_row(row, thresholds) != "water"`. For a region, the cell's parent must be a strategic land hex.
- Metrics:
  - `urban_share`: tactical land cells where `is_res4_urban_overlay_row(row, max_scalerank=policy.urban_overlay_max)`, divided by tactical land cells.
  - `road_share` and `rail_share`: tactical land cells with any true road or rail side, divided by tactical land cells.
  - `airports_per_100_land_hexes` and `seaports_per_100_land_hexes`: tactical cells with a row `count > 0` and `0 <= scalerank <= max`, times 100, divided by strategic land hexes.
  - `city_labels_per_land_hex`: tactical naming cells with at least one city where `0 <= scalerank <= city_label_max`, divided by strategic land hexes.
  - `urban_cells_total`, `producing_hexes` (strategic hexes with at least one urban tactical child), and the nearest-rank `median`, `p75`, and `p90` of urban cells per producing hex. Compute these at the policy maximum and at 5, so they can be compared with the summary.
  - `urban_share`, airport, seaport, and city-label metrics also at policy max minus 1 and plus 1 (rows keyed by the maximum used). Those layers keep every rank, so the user can see what a policy change would do without regenerating.
- `build_density_report(regions_root, generated_dir) -> dict`: a `global` block (global files with `GLOBAL_TACTICAL_POLICY`) and one block per region whose metadata, landmass, naming, and sides files all exist. Each region block gets a `ratio_to_global` entry per share or per-hex metric and a `flags` list naming any ratio below 0.5 or above 2.0.
- `write_density_report(report, out_path) -> None`

**Add** `regional_cli report` to write `data/generated/regions/qa/density_report.json` and print a fixed-width table: region, then each share metric with its ratio.

**Test** `scripts/regional_pipeline/tests/test_density_report.py` with tiny in-memory rows:

- Urban share counts a rank-6 urban row with maximum 6 and skips it with maximum 5.
- City-label counting skips a rank-7 city with maximum 6.
- Nearest-rank percentiles of `[1, 2, 3, 4, 10]`: median 3, p90 10.

**Modify** `package.json`: add `"regional:footprint": "python -m scripts.regional_pipeline.regional_cli footprint --all --write"`, `"regional:generate": "python -m scripts.regional_pipeline.regional_cli run --all --skip-existing --verbose"`, `"regional:check": "python -m scripts.regional_pipeline.regional_cli check --all"`, and `"regional:report": "python -m scripts.regional_pipeline.regional_cli report"`.

Verify:

```powershell
npm run regional:test
npm run regional:report
```

Done when tests pass and the report has a `global` block plus `western_europe` and `eastern_europe` blocks with ratios.

## Phase 12: Zip, Extract, and Docs

**Create** `scripts/generated-data-zip-helpers.cjs`. Move from the two existing scripts, adding a directory parameter:

- `zipJsonFile(pythonCmd, dir, jsonFilename)`
- `extractZip(pythonCmd, dir, zipFilename, jsonFilename)`
- `shouldExtractGeneratedJson(zipPath, jsonPath)`

Give each a JSDoc block with Purpose, When to use, Expected outcome, and Exceptions. `zip-generated-data.cjs` and `extract-generated-data.cjs` call these with `generatedDir`. `extract-generated-data.cjs` still exports `shouldExtractGeneratedJson` and `REQUIRED_GENERATED_JSON_FILES` for `scripts/generated-data-packaging.test.cjs`.

**Create** `scripts/generated-regional-manifest.cjs`, exporting `REGIONS_DIR_SEGMENTS = ['data', 'generated', 'regions']` and a frozen `REGIONAL_JSON_FILES` with `region_manifest.json` and the eight data filenames.

**Create** `scripts/zip-regional-data.cjs` and `scripts/extract-regional-data.cjs`. Each walks the immediate subfolders of `data/generated/regions/`, skipping `qa`, and zips or extracts every listed file present. Extraction never fails on a missing region; the app doesn't need these packs yet. Guard `main()` with `if (require.main === module)`.

**Modify** `package.json`: add `"regional:zip": "node scripts/zip-regional-data.cjs"` and `"regional:extract": "node scripts/extract-regional-data.cjs"`. Don't add either to `build`, `start`, or `generated:*`.

**Create** `scripts/regional_pipeline/README.md`, a runbook covering:

- What the packs are, and that the app doesn't load them yet.
- The folder and file list, including `res_s` and `res_t`.
- The footprint rules, tuning steps, and results file.
- The resolution profile and scaled constants.
- The scalerank table with its reasoning.
- Command order: `regional:validate`, `regional:footprint`, `regional:generate`, `regional:check`, `regional:report`, `regional:zip`.
- The measured metadata runtimes, in hours, without naming a phase or a heading from this plan.
- That the source table is `data/region-summary-1.md`.

**Modify** `doc/terrain-pipeline.md`: add a short `## Regional Packs` section with the folder location, the fact that the app doesn't load them yet, and a link to the runbook. **Modify** `scripts/terrain_pipeline/README.md`: add one line linking to the regional runbook.

Verify:

```powershell
node --test scripts/generated-data-packaging.test.cjs
npm run generated:extract
npm run regional:zip
Remove-Item data/generated/regions/western_europe/terrain_res_s_weather.json
npm run regional:extract
python -m scripts.regional_pipeline.regional_cli check --region western_europe
git status --short data/generated
```

Done when:

- The packaging test passes.
- `generated:extract` changes no tracked file.
- The weather file comes back and `check` passes.
- `git status` lists new `.json.zip` files under `data/generated/regions/` and no extracted `.json` files.

Don't run `npm run generated:zip`. It rewrites the tracked global archives.

## Phase 13: Full Generation and Handoff

1. Run `npm run regional:generate` in the background. It skips finished steps, so it can resume after an interruption. Watch the log for errors.
2. Run `npm run regional:check`. Every region has no `FAIL`. List every `WARN` in the results file.
3. Run `npm run regional:report`.
4. Run `npm run regional:zip`.
5. Run every test suite: `npm run terrain:test`, `npm run regional:test`, `npm run weather:test`, the naming suite, and `node --test scripts/generated-data-packaging.test.cjs`.
6. Append to `.spec/regional-footprint-tuning-results.md`: the density table (ratios and flags), the runtime per region, the total zip size under `data/generated/regions/`, and the questions for the user. Those questions cover policy changes suggested by flagged ratios, and regions still off their footprint targets.
7. Check every new or modified source file against the 600-line limit. Search `scripts/`, `doc/`, and `package.json` for phase numbers and headings from this plan. This plan file is the exception.
8. Stop. Don't commit.

## Region Catalog

Use this as the starting `REGION_DEFINITIONS`. Footprint tuning changes only the reach values, box edges, and member fallbacks it names. `_whole(*codes)` is a private helper returning `tuple(MemberUnit(c) for c in codes)`. Keep member codes in alphabetical order within each `_whole` call.

Construct every `RegionDefinition`, `CentroidBox`, `MemberUnit`, and `FootprintTargets` with keyword arguments. The block below is the data, written positionally to stay compact. The positional order, if needed while translating, is `region_id`, `display_name`, `strategic_resolution`, `tactical_resolution`, `members`, `centroid_box`, `sea_reach_km`, `neutral_reach_km`, `desert_trim_reach_km`, `targets`. `CentroidBox` is `lat_min`, `lat_max`, `lon_min`, `lon_max`. `FootprintTargets` is `land`, `sea`, `neutral_border`.

```python
REGION_DEFINITIONS: Final[tuple[RegionDefinition, ...]] = (
    RegionDefinition("western_europe", "Western Europe", 3, 6,
        _whole("AUT", "BEL", "CHE", "DEU", "FRA", "LIE", "LUX", "MCO", "NLD"),
        CentroidBox(41.0, 56.0, -5.5, 17.5), 100.0, 100.0, None, FootprintTargets(136, 38, 91)),
    RegionDefinition("southern_europe", "Southern Europe", 3, 6,
        _whole("ALB", "AND", "BIH", "ESP", "GIB", "GRC", "HRV", "ITA", "KOS", "MKD", "MLT", "MNE", "PRT", "SMR", "SRB", "SVN", "VAT"),
        CentroidBox(34.5, 47.5, -10.0, 30.0), 100.0, 0.0, None, FootprintTargets(189, 99, 0)),
    RegionDefinition("northern_europe", "Northern Europe", 3, 6,
        _whole("ALD", "DNK", "EST", "FIN", "FRO", "GBR", "GGY", "IMN", "IRL", "ISL", "JEY", "LTU", "LVA", "NOR", "SWE"),
        CentroidBox(49.0, 66.0, -25.0, 32.0), 100.0, 0.0, None, FootprintTargets(243, 68, 0)),
    RegionDefinition("eastern_europe", "Eastern Europe", 2, 5,
        _whole("BGR", "BLR", "CZE", "HUN", "MDA", "POL", "ROU", "RUS", "SVK", "UKR"),
        CentroidBox(40.0, 82.0, 12.0, -168.0), 250.0, 0.0, None, FootprintTargets(308, 42, 0)),
    RegionDefinition("northern_america", "Northern America", 2, 5,
        (MemberUnit("CAN", exclude_admin1=("CA-NT", "CA-NU", "CA-YT")),
         MemberUnit("USA", exclude_admin1=("US-AK", "US-HI"))),
        CentroidBox(24.0, 62.0, -130.0, -52.0), 250.0, 0.0, None, FootprintTargets(208, 79, 0)),
    RegionDefinition("central_america", "Central America", 3, 6,
        _whole("BLZ", "CRI", "GTM", "HND", "MEX", "NIC", "PAN", "SLV"),
        CentroidBox(7.0, 33.0, -118.0, -77.0), 0.0, 0.0, None, FootprintTargets(276, 0, 0)),
    RegionDefinition("caribbean", "Caribbean", 3, 6,
        _whole("ABW", "AIA", "ATG", "BHS", "BJN", "BLM", "BRB", "CUB", "CUW", "CYM", "DMA", "DOM", "GRD", "HTI",
               "JAM", "KNA", "LCA", "MAF", "MSR", "PRI", "SER", "SXM", "TCA", "TTO", "USG", "VCT", "VGB", "VIR")
        + (MemberUnit("FRA", include_admin1=("FR-GP", "FR-MQ")),
           MemberUnit("NLD", include_admin1=("NL-BQ1", "NL-BQ2", "NL-BQ3"))),
        CentroidBox(9.5, 27.5, -85.5, -59.0), 100.0, 0.0, None, FootprintTargets(120, 165, 0)),
    RegionDefinition("south_america", "South America", 2, 5,
        _whole("ARG", "BOL", "BRA", "BRI", "CHL", "COL", "ECU", "GUY", "PER", "PRY", "SPI", "SUR", "URY", "VEN")
        + (MemberUnit("FRA", include_admin1=("FR-GF",)),),
        CentroidBox(-56.0, 13.0, -81.5, -34.0), 250.0, 0.0, None, FootprintTargets(265, 78, 0)),
    RegionDefinition("maghreb", "Maghreb", 3, 6,
        _whole("DZA", "MAR", "TUN"),
        CentroidBox(18.0, 38.0, -17.5, 12.0), 100.0, 0.0, None, FootprintTargets(296, 30, 0)),
    RegionDefinition("libya_egypt_sudan", "Libya, Egypt, Sudan", 3, 6,
        _whole("BRT", "EGY", "LBY", "SDN"),
        CentroidBox(8.0, 34.0, 9.0, 39.0), 100.0, 0.0, 300.0, FootprintTargets(262, 26, 0)),
    RegionDefinition("west_africa_coast", "West Africa Coast", 3, 6,
        _whole("BEN", "CIV", "GHA", "GIN", "GMB", "GNB", "LBR", "NGA", "SEN", "SLE", "TGO"),
        CentroidBox(4.0, 17.0, -18.0, 15.0), 100.0, 0.0, None, FootprintTargets(307, 43, 0)),
    RegionDefinition("middle_africa_north", "Middle Africa North", 3, 6,
        _whole("CAF", "CMR", "GAB", "GNQ", "TCD"),
        CentroidBox(-4.5, 23.5, 8.0, 27.5), 100.0, 0.0, None, FootprintTargets(270, 17, 0)),
    RegionDefinition("middle_africa_south", "Middle Africa South", 3, 6,
        _whole("AGO", "COD", "COG"),
        CentroidBox(-18.5, 5.5, 11.0, 31.5), 0.0, 0.0, None, FootprintTargets(340, 0, 0)),
    RegionDefinition("horn_and_great_lakes", "Horn and Great Lakes", 3, 6,
        _whole("BDI", "DJI", "ERI", "ETH", "KEN", "RWA", "SDS", "SOL", "SOM", "UGA"),
        CentroidBox(-5.0, 18.5, 23.0, 52.0), 0.0, 0.0, None, FootprintTargets(345, 0, 0)),
    RegionDefinition("southern_east_africa", "Southern East Africa", 3, 6,
        _whole("MOZ", "MWI", "TZA", "ZMB", "ZWE"),
        CentroidBox(-27.0, -0.5, 21.5, 41.0), 100.0, 0.0, None, FootprintTargets(256, 26, 0)),
    RegionDefinition("southern_africa", "Southern Africa", 3, 6,
        _whole("BWA", "LSO", "NAM", "SWZ", "ZAF"),
        CentroidBox(-35.0, -16.5, 11.5, 33.5), 100.0, 0.0, None, FootprintTargets(237, 81, 0)),
    RegionDefinition("western_asia_north", "Western Asia North", 3, 6,
        _whole("ARM", "AZE", "GEO", "IRQ", "ISR", "JOR", "KWT", "LBN", "PSX", "SYR", "TUR"),
        CentroidBox(28.3, 42.5, 25.5, 51.0), 100.0, 100.0, None, FootprintTargets(188, 39, 50)),
    RegionDefinition("central_asia", "Central Asia", 3, 6,
        _whole("KAB", "KAZ", "KGZ", "TJK", "TKM", "UZB"),
        CentroidBox(35.0, 56.0, 46.0, 88.0), 100.0, 0.0, None, FootprintTargets(335, 9, 0)),
    RegionDefinition("southern_asia_west", "Southern Asia West", 3, 6,
        _whole("AFG", "IRN", "PAK"),
        CentroidBox(23.5, 40.0, 44.0, 78.0), 100.0, 0.0, None, FootprintTargets(297, 20, 0)),
    RegionDefinition("southern_asia_east", "Southern Asia East", 3, 6,
        _whole("BGD", "BTN", "KAS", "LKA", "NPL")
        + (MemberUnit("IND", exclude_admin1=("IN-AN", "IN-LD")),),
        CentroidBox(5.5, 37.5, 68.0, 97.5), 0.0, 0.0, None, FootprintTargets(352, 0, 0)),
    RegionDefinition("eastern_asia", "Eastern Asia", 2, 5,
        _whole("CHN", "HKG", "JPN", "KOR", "MAC", "MNG", "PRK", "TWN"),
        CentroidBox(17.5, 54.0, 73.0, 146.0), 250.0, 0.0, None, FootprintTargets(216, 57, 0)),
    RegionDefinition("south_eastern_asia", "South-Eastern Asia", 2, 5,
        _whole("BRN", "IDN", "KHM", "LAO", "MMR", "MYS", "PHL", "SGP", "THA", "TLS", "VNM"),
        CentroidBox(-11.5, 28.6, 92.0, 141.5), 250.0, 250.0, None, FootprintTargets(143, 83, 31)),
    RegionDefinition("australia_new_zealand", "Australia and New Zealand", 2, 5,
        _whole("AUS", "NZL"),
        CentroidBox(-48.0, -9.0, 112.0, 179.0), 250.0, 0.0, None, FootprintTargets(146, 148, 0)),
)
```

Membership assumptions to repeat in the results file:

- `west_africa_coast` includes Guinea, Guinea-Bissau, and Gambia. The summary's "Côte d'Ivoire to Senegal" group spans them, and its land count is too high for the eight countries named as origin units alone.
- Overseas parts of France, the Netherlands, Spain, Portugal, Norway, and the United States drop out through the centroid boxes or admin-1 exclusions. The exceptions are the French and Dutch Caribbean (included in `caribbean`) and French Guiana (included in `south_america`).
- `southern_asia_east` excludes the Andaman and Nicobar Islands and Lakshadweep. `KAS` is the Siachen Glacier polygon, not a substitute for Kashmir, which is already inside `IND`.
- `caribbean` includes `USG`, which is the Guantanamo Bay polygon, and `ALD` in `northern_europe` is Åland. `SDS` is South Sudan. These codes match Natural Earth.
- Madagascar, Western Sahara, the Falklands, and the Sahel countries belong to no region.

## Interface Summary

Names later phases rely on, by module:

- `terrain_pipeline.logging_utils`: `TRACE_LEVEL`
- `terrain_pipeline.json_compare_cli`: `compare_json_documents`, `main`
- `terrain_pipeline.geometry_bounds`: `bounds_for_cells`, `clip_polygonal_to_bounds`, `bounds_intersect`
- `terrain_pipeline.resolution_profile`: `ResolutionProfile`, `topo_keys_for_resolution`, `strategic_profile`, `tactical_profile`
- `terrain_pipeline.metadata_export_core`: `compose_forest_mean`, `MetadataMaskSources`, `load_metadata_mask_sources`, `MetadataMaskContexts`, `build_mask_contexts`, `open_metadata_rasters`, `close_rasters`, `PointIndexes`, `build_point_indexes`, `build_metadata_rows`, `write_metadata_file`
- `terrain_pipeline.urban_scalerank`: `load_urban_geometries_by_scalerank`
- `terrain_pipeline.res1_water_pct`: `load_metadata_rows_by_h3`, `compute_water_pct_from_children`
- `terrain_pipeline.landmass`: `LandMassRecord`, `GeographyIndex`, `load_geography_index`, `build_landmass_records`, `build_landmass_envelope`, `build_qa_summary`
- `terrain_pipeline.road_rail_sides`: `h3_cells_for_linestring`, `feature_has_scalerank_in_range`
- `terrain_pipeline.road_rail_sides_export`: `RoadRailScanOptions`, `scan_road_rail_side_masks`, `build_road_rail_sides_envelope`, `write_road_rail_sides_json`, `RoadRailSidesExporter`
- `terrain_pipeline.road_rail_vectors_cli`: `VectorExportOptions`, `collect_vector_rows`, `build_vectors_payload`
- `naming_pipeline.naming_json_writers`: `write_strategic_naming_json`, `write_tactical_naming_json`
- `naming_pipeline.generate_hex_naming`: `NamingScope`, `global_naming_scope`, `run_naming_export`
- `weather_pipeline.weather_pack`: `GLOBAL_WATER_LAND_STEPS`, `classify_month`, `nearest_land_months`, `open_worldclim_bands`, `build_weather_payload`, `write_weather_pack`
- `regional_pipeline.region_models`: `MemberUnit`, `CentroidBox`, `FootprintTargets`, `FootprintCounts`, `HexRole`, `RegionDefinition`, `RegionFootprint`
- `regional_pipeline.region_catalog`: `REGION_DEFINITIONS`, `region_by_id`, `all_region_ids`
- `regional_pipeline.scalerank_policy`: `ScalerankPolicy`, `SCALERANK_MIN`, `GLOBAL_TACTICAL_POLICY`, `policy_for_tactical_resolution`, `policy_to_json`
- `regional_pipeline.regional_scaling`: `center_spacing_km`, `island_min_area_km2_for`, `weather_water_land_steps_for`
- `regional_pipeline.region_paths`: `REGIONS_ROOT`, `REGIONAL_QA_DIR`, `RegionPaths`
- `regional_pipeline.member_geometry`: `AdminLayers`, `load_admin_layers`, `validate_member_codes`, `build_member_geometry`
- `regional_pipeline.cell_land_overlap`: `overlap_km2`, `CountryLandIndex`
- `regional_pipeline.footprint`: `MIN_LAND_KM2`, `MEMBER_SHARE_MIN`, `SETTLED_LAND_SHARE_MAX`, `CandidateCell`, `classify_footprint`, `sweep_footprint_counts`
- `regional_pipeline.footprint_inputs`: `FootprintInputs`, `load_footprint_inputs`, `build_footprint_candidates`
- `regional_pipeline.region_manifest`: `MANIFEST_SCHEMA_VERSION`, `RegionManifest`, `build_manifest_document`, `write_manifest`, `read_manifest`
- `regional_pipeline.regional_metadata`: `SharedMetadataInputs`, `open_shared_metadata_inputs`, `close_shared_metadata_inputs`, `export_region_metadata`
- `regional_pipeline.regional_naming`: `export_region_naming`
- `regional_pipeline.regional_landmass`: `export_region_landmass`
- `regional_pipeline.regional_weather`: `export_region_weather`
- `regional_pipeline.regional_road_rail`: `export_region_road_rail_sides`, `export_region_road_rail_vectors`
- `regional_pipeline.regional_steps`: `STEP_ORDER`, `RunOptions`, `run_region_steps`
- `regional_pipeline.pack_checks`: `CheckResult`, `check_region_pack`
- `regional_pipeline.density_report`: `build_density_report`, `write_density_report`
