# Terrain pipeline (runtime)

How generated Earth hex data reaches the Electron app. **How to regenerate the files** (Python, PostGIS, EarthEnv, Natural Earth shapefiles, credentials) is documented in [`scripts/terrain_pipeline/README.md`](../scripts/terrain_pipeline/README.md). Do not copy that runbook here.

The engine under `src/` wins if this file drifts.

## What the game loads

Build/start extracts a pack into `data/generated/` (`npm run generated:extract`). Startup fails fast if required metadata is missing or invalid (including empty res-4 metadata). Packaged builds include those JSON files.

Typical runtime inputs (names may grow; the extract/assert scripts are the checklist):

- Res-1 base terrain and res-4 exceptions / kind maps
- Per-hex feature metadata (urban, airport, seaport counts and flags)
- Road/rail side masks and optional vector overlays
- Landmass connectivity used by strategic land pathfinding
- Hex naming data (`terrain_res1_naming.json` and `terrain_res4_naming.json`) for hex tooltips and unit origins
- Res-1 monthly weather (`terrain_res1_weather.json`) for the optional weather bonus

## Hex naming data

The naming files list the countries, states, cities, and water bodies that overlap each res-1 and res-4 hex, taken from Natural Earth. Naming schema `1.2.0` adds `country_code` to every country, state, and city row: an uppercase ISO 3166-1 alpha-2 code, or `null` when Natural Earth has none (disputed and special areas such as Somaliland). The loader rejects any other value. Country codes come from `ISO_A2_EH`, falling back to `ISO_A2`, and resolve through `ADM0_A3` so states and cities use the same code as their country. Water names that Natural Earth spells in all capitals (`INDIAN OCEAN`) are converted to title case, so they match the other water names.

Regenerate with `python -m scripts.naming_pipeline.generate_hex_naming run`, then `npm run generated:zip`. Only the `.json.zip` files are tracked.

The main process uses the codes for the flags in hex tooltips and for each new unit's country of origin. National flag images are vendored in `static/flags/`. Subdivision SVGs, one file per ISO 3166-2 code, are in `static/flags/subdivisions/` with `ATTRIBUTION.md`. The match still shows the national flag. See [`static/flags/README.md`](../static/flags/README.md).

A birth cell's country is its largest city (population, then lower scalerank, then name). With no city that names a country, it is the country row with the most states in the cell, then lower scalerank, then name. With no country row, it is the country of the most prominent state. The stored name is the canonical country name for that ISO code. A cell with none of those rows has no country.

Main-process classification (`terrainClassificationCache.ts` and related) turns that cache into hex kinds, infrastructure counts, and overlay records. SQLite is seeded from the cache; res-4 feature overrides (rubble after strikes, destroyed ports) live in the match DB and overlay the pack.

## Weather

`terrain_res1_weather.json` holds twelve months for every res-1 hex. January is month 0. Each month stores the weather the player sees (`mild`, `rain`, `snow`, or `heat`) and whether that month counts as heat for acclimation. A hot wet month is stored as rain that still counts as heat.

The file is fixed climatology from WorldClim 2.1 10-arc-minute temperature and precipitation, sampled at each land hex's centroid. Classification uses the thresholds in `weatherBonusRules.ts`: snow at or below 0°C, otherwise rain at or above 120 mm, otherwise heat at or above 23°C, otherwise mild. A water hex copies the nearest land hex within two res1 steps. Open ocean beyond that, and a land centroid with no sample, is mild all year. Startup fails if the pack is missing or empty, the same way it fails for the other terrain files. An unknown hex reads as twelve mild months.

How to regenerate the pack stays in `scripts/weather_pipeline/`. Only the `.json.zip` is tracked. The rules that turn those months into tags and penalties are in [combat rules §4.9](combat-rules-v3.md). The renderer never reads the pack. Main stamps the current month's weather and each unit's tags onto the snapshot.

## Resolutions

- **Strategic map:** H3 resolution **1** on the global map (`strategicH3Resolution()`).
- **Tactical battles:** H3 resolution **4** on the global map (`tacticalH3Resolution()`), the children of one contested strategic cell.

Both functions live in `src/shared/h3Resolutions.ts`. `GLOBAL_STRATEGIC_H3_RESOLUTION` and `GLOBAL_TACTICAL_H3_RESOLUTION` are the global values. The tracked global JSON files keep the names `terrain_res1_*` and `terrain_res4_*`.

Parent-child mapping is H3's native hierarchy (three steps, 343 tactical cells under one strategic hex). Terrain kinds on a tactical cell can differ from the parent (coastal, forest, mountain, urban flags, rubble).

## What this is not

- Not a live GIS query at play time. Regeneration is an offline `npm run terrain:generate` (metadata CLI, then road/rail sides). High-fidelity road/rail and vector CLIs are separate npm scripts (see root `package.json`).
- Not player-facing save data. Destroyed urban/airports/seaports are match state on top of the generated baseline.

## Regional Packs

Regional maps live under `data/generated/regions/<region_id>/`. Each folder holds a manifest plus strategic (`res_s`) and tactical (`res_t`) JSON. Manifest schema 1.1.0 records side groups and origin areas. The economy numbers for those maps are in `src/shared/regionalRulesCatalog.ts`. The app does not load these packs yet. The runbook is [scripts/regional_pipeline/README.md](../scripts/regional_pipeline/README.md).

## Related

- Movement, combat, and weather: [combat-rules-v3.md](combat-rules-v3.md) §4.9 and §12
- Root README “Terrain generation pipeline” section
- Python tests: `npm run terrain:test`
