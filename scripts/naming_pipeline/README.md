# Hex Naming

Offline Natural Earth names for strategic and tactical hexes. The global command writes the resolution-1 and resolution-4 files the app loads for tooltips, city labels, and unit origins. A regional naming step calls the same exporter for one map's cells.

What the app does with the files is in [doc/terrain-pipeline.md](../../doc/terrain-pipeline.md#hex-naming-data).

## What this generates

- `data/generated/terrain_res1_naming.json` (strategic, resolution 1; no cities)
- `data/generated/terrain_res4_naming.json` (tactical, resolution 4; includes cities)

Schema `1.2.0` (`SCHEMA_VERSION` in `naming_json_writers.py`). Pretty JSON, UTF-8, newline `\n`. Envelope fields:

- `schema_version`
- `resolution` (the real H3 resolution)
- `generated_at_utc`
- `record_count`
- `records`

Each record has `h3_index`, then `states`, `countries`, and `water`. A tactical record inserts `cities` before `states`. Arrays are ordered by scalerank, then name. A cell is still written when every array is empty.

| Array | Fields | Natural Earth source |
| --- | --- | --- |
| `countries` | `name`, `continent`, `region`, `population`, `scalerank`, `country_code` | `NAME`, `CONTINENT`, `SUBREGION` (stored as `region`), `POP_EST`, `SCALERANK` |
| `states` | `name`, `country`, `scalerank`, `country_code` | `NAME`, `ADMIN`, `SCALERANK` |
| `cities` (tactical only) | `name`, `state`, `country`, `population`, `scalerank`, `country_code` | `NAME`, `ADM1NAME`, `ADM0NAME`, `POP_MAX`, `SCALERANK` |
| `water` | `name`, `type` (`lake` or `ocean`), `scalerank` | `NAME`, `SCALERANK` |

`country_code` is two uppercase ASCII letters, or `null`. Water rows have no country code. `readCountryCodeOrNull` in `src/main/terrainNamingLoad.ts` rejects a missing key and any other value. The letters come from Natural Earth's ISO alpha-2 fields. How the app uses the codes is in [doc/terrain-pipeline.md](../../doc/terrain-pipeline.md#hex-naming-data).

Extracted JSON under `data/generated/` is gitignored. Both global naming files are listed in `scripts/generated-data-manifest.cjs`. `npm run generated:zip` refreshes every present file in that list, and skips names that are not extracted. Regional naming files are in the regional archive (`npm run regional:zip`), not in that global list.

A regional pack writes `terrain_res_s_naming.json` and `terrain_res_t_naming.json`. City rows stay in the tactical file. Those names are in [../regional_pipeline/README.md](../regional_pipeline/README.md).

## Prerequisites

1. The same Python environment as the terrain pipeline (Python 3.13+). Naming needs `fiona`, `h3`, `shapely`, and `pyproj` from:

   ```powershell
   python -m pip install -r scripts/terrain_pipeline/requirements.txt
   ```

   Naming does not open PostgreSQL. It builds a temporary SQLite file under a `hex_naming_` directory and deletes that directory when the export finishes.

2. The five shapefiles under [Source directory](#source-directory), each with the sidecar files the driver needs (`.dbf`, `.shx`, `.prj`, and any others shipped with that layer).

## Source directory

`--data-root` defaults to `DEFAULT_DATA_ROOT` (`F:/Data`) in `generate_hex_naming.py`. Put the shapefiles directly in that directory. The shared layout, including lakes, is in [../terrain_pipeline/README.md](../terrain_pipeline/README.md#source-directory).

| File | Constant | Role |
| --- | --- | --- |
| `ne_10m_admin_0_countries.shp` | `COUNTRIES_SHP` | Countries, and the `ADM0_A3` to country-code map |
| `ne_10m_admin_1_states_provinces.shp` | `STATES_SHP` | States and provinces |
| `ne_10m_populated_places.shp` | `CITIES_SHP` | Cities, tactical file only |
| `ne_10m_lakes.shp` | `LAKES_SHP` | Lake names (`type` `lake`) |
| `ne_10m_geography_marine_polys.shp` | `MARINE_POLYS_SHP` | Sea and ocean names (`type` `ocean`) |

`validate` checks that each layer has the fields in `REQUIRED_FIELDS_BY_LAYER`. Lookup is case-insensitive.

| Layer | Required fields |
| --- | --- |
| countries | `name`, `continent`, `subregion`, `pop_est`, `scalerank`, `adm0_a3`, `iso_a2`, `iso_a2_eh` |
| states | `name`, `admin`, `scalerank`, `adm0_a3` |
| cities | `name`, `adm1name`, `adm0name`, `pop_max`, `scalerank`, `adm0_a3`, `iso_a2` |
| water | `name`, `scalerank` |

## Run

From the repository root. `--data-root` defaults to the absolute path `F:/Data`. `--output-res1` and `--output-res4` default to `data/generated/terrain_res1_naming.json` and `data/generated/terrain_res4_naming.json` relative to the current directory, so a run from another directory writes those files there.

Validation only (files present, required fields present):

```powershell
python -m scripts.naming_pipeline.generate_hex_naming validate --verbose
```

Full export (every res-1 cell and every res-4 cell):

```powershell
python -m scripts.naming_pipeline.generate_hex_naming run --verbose
```

Debug cap on the tactical file. `--max-child-cells N` keeps the first N cells of the sorted global resolution-4 list, with N below 0 treated as 0. A cap at or above the full resolution-4 count keeps every tactical cell. The strategic file is still every resolution-1 cell. The flag turns `filter_cells` on, so city points and tactical polygon overlaps outside that slice are dropped. Strategic overlaps still use the full resolution-1 set. Do not archive that tactical file.

```powershell
python -m scripts.naming_pipeline.generate_hex_naming run --max-child-cells 5000 --verbose
```

Other flags: `--data-root`, `--output-res1`, `--output-res4`. There is no `naming:generate` npm script. The `naming:check` script in `package.json` is the TypeScript identifier check, not this exporter.

Tests:

```powershell
python -m unittest discover -s scripts/naming_pipeline/tests -p "test_*.py" -v
```

Archive. The command rewrites every present archive in `scripts/generated-data-manifest.cjs`, not only the naming files:

```powershell
npm run generated:zip
```

## How rows are assigned

Country, state, lake, and marine polygons are reprojected to WGS84 when the shapefile is not already WGS84. An invalid geometry is repaired with `buffer(0)`. Overlap uses `h3.h3shape_to_cells_experimental` with `contain="overlap"`, once at the strategic resolution and once at the tactical resolution.

A city is the H3 cell of its point (`h3.latlng_to_cell`), or of `representative_point()` when the geometry is not a point. Cities are written only at the tactical resolution.

Country codes come from the countries layer: `ISO_A2_EH`, then `ISO_A2`, keyed by `ADM0_A3` (`country_codes.py`). `-99`, blanks, and values that are not two ASCII letters become `null`. A repeated `ADM0_A3` keeps the first non-null code. States and cities look up that map. A country or city whose `ADM0_A3` is missing from the map falls back to that row's `ISO_A2`. A state has no `ISO_A2` column, so a missing key stays `null`. Lookup keeps a mapped `null`.

Water names that Natural Earth spells in all capitals (`INDIAN OCEAN`) become title case in `normalize_water_name`. `of`, `and`, and `the` stay lowercase after the first word. Any other spelling is kept.

Duplicate rows that share a cell and the unique key in `naming_tables.py` are ignored. A country or city with an empty name is skipped. A state is skipped when `name` or `ADMIN` is empty. A water name that is empty or only whitespace is skipped. An empty geometry is skipped. The global command leaves polygons unclipped (`clip_bounds` is `None`).

## Regional packs

`export_region_naming` uses the same assignment rules for one region's cells. `filter_cells` is true. Polygons are clipped to `bounds_for_cells` when that returns a box (the strategic cells, padded by 1°). It returns `None` for an empty cell list, a cell whose bounds pass ±180° longitude, or a padded box that passes ±180° or is wider than 180°. The polygons are then left unclipped. City points are not clipped. They are dropped only when they fall outside the tactical cell set. Resolutions are the region's `res_s` and `res_t` (2 or 3, and 5 or 6), stored in the envelope `resolution` field.

That step is part of `npm run regional:generate`. It reads the manifest, not the tactical metadata file. With `--skip-existing` (that npm script sets the flag) it skips the step when both naming files already exist, including a pair that would fail `regional:check`. `npm run regional:check` fails a naming file when the schema, resolution, `record_count`, cell set, or presence of `cities` disagrees with that level. Delete those files before generating again. The command list is in [../regional_pipeline/README.md](../regional_pipeline/README.md#commands).

## Troubleshooting

- **`Missing required shapefiles`**: a file is not directly under `--data-root`, or the name does not match the constant in the table above.
- **Missing field**: the error includes the shapefile path and the missing field names (`Shapefile is missing required fields`). Matching is case-insensitive, so this is a missing column.
- **Capped tactical file**: `--max-child-cells` slices the sorted global resolution-4 list. It is a dry run, not a regional pack and not a file to archive.
- **Regional names ignore `--output-res1`**: regional export goes through `export_region_naming` and writes the paths on `RegionPaths`, under `data/generated/regions/<region_id>/`.
