# CHELSA Weather Source Results

## Environment

Python 3.13.3. `git status --short` printed no lines before the work.

## Baseline

`npm run weather:test`: Ran 2 tests in 0.001s, OK.

`npm run regional:test`: Ran 44 tests in 0.058s, OK. The `KeyError: 7` traceback is the expected failure inside `test_unknown_resolution_raises`.

Baseline zip count: 24. Missing CHELSA paths: none.

## Probe

`python .test/chelsa_weather/probe_points.py` exited 0. Elapsed 0.2s inside the script.

```
Paris January: 3.94 C, 54.9 mm, mild PASS
Moscow January: -7.31 C, 50.6 mm, snow PASS
Moscow July: 18.98 C, 84.3 mm, mild, gap 26.29 PASS
Manaus January: 26.24 C, 292.2 mm, rain, countsAsHeat true PASS
Manaus July: 26.52 C, 90.3 mm, heat PASS
Atlantic January: 25.65 C, 197.1 mm, rain, countsAsHeat true PASS
Dateline January: 26.87 C, 135.9 mm PASS
North of raster: None PASS
8101bffffffffff January: 72.51,52.91 -16.10 C, 56.2 mm, snow PASS
```

## Global Pack

`python -m scripts.weather_pipeline.generate_res1_weather --verbose` wrote 842 records: sampled 840, copied 2, mild 0.

Compare: land-change 0.3474 (1801 of 5184 land hex-months). Water hexes 410. Water non-mild 0.6482 (3189 of 4920). Hex `8101bffffffffff` January is snow, `countsAsHeat` false.

The 0.25 land-change limit was not raised. The pack was zipped after the later instruction to finish the remaining phases. `npm run generated:zip -- terrain_res1_weather.json` printed one line: `zipped terrain_res1_weather.json -> terrain_res1_weather.json.zip`.

Land display transitions: mild to rain 813, mild to heat 502, mild to snow 387, heat to rain 30, rain to heat 23, snow to mild 18, heat to mild 16, rain to mild 4, rain to snow 2. Heat-flag-only changes: 6.

## Regions

The weather command reads `region_manifest.json`, which was not on disk. Those manifests were restored from the tracked zips and were not regenerated. The other regional JSON files were restored the same way so `regional:check` could run. The new weather JSON was newer than its zip, so that extract left it in place.

`python -m scripts.regional_pipeline.regional_cli run --all --steps weather --verbose` exited 0.

`npm run regional:check` exited 0. Every region passed `terrain_res_s_weather.json`.

`npm run regional:zip -- terrain_res_s_weather.json` printed `zipped terrain_res_s_weather.json` 23 times and no other file name.

Three regions are over the 0.25 land-change limit. The same mild-to-rain and mild-to-heat shift as the global pack. The limit was not raised.

| Region | Sampled | Copied | Mild | Land-change | Zip written |
| --- | ---: | ---: | ---: | ---: | --- |
| australia_new_zealand | 283 | 0 | 0 | 0.1837 | yes |
| caribbean | 311 | 0 | 0 | 0.6972 | yes |
| central_america | 474 | 0 | 0 | 0.2568 | yes |
| central_asia | 297 | 0 | 0 | 0.0522 | yes |
| eastern_asia | 252 | 0 | 0 | 0.1963 | yes |
| eastern_europe | 336 | 4 | 0 | 0.1601 | yes |
| horn_and_great_lakes | 388 | 0 | 0 | 0.1707 | yes |
| libya_egypt_sudan | 307 | 0 | 0 | 0.0691 | yes |
| maghreb | 319 | 0 | 0 | 0.0407 | yes |
| middle_africa_north | 238 | 0 | 0 | 0.1217 | yes |
| middle_africa_south | 325 | 0 | 0 | 0.1769 | yes |
| northern_america | 269 | 0 | 0 | 0.1628 | yes |
| northern_europe | 389 | 0 | 0 | 0.1335 | yes |
| south_america | 418 | 0 | 0 | 0.2075 | yes |
| south_eastern_asia | 245 | 0 | 0 | 0.5563 | yes |
| southern_africa | 325 | 0 | 0 | 0.0780 | yes |
| southern_asia_east | 416 | 0 | 0 | 0.1485 | yes |
| southern_asia_west | 291 | 0 | 0 | 0.0977 | yes |
| southern_east_africa | 280 | 0 | 0 | 0.1855 | yes |
| southern_europe | 273 | 0 | 0 | 0.1474 | yes |
| west_africa_coast | 359 | 0 | 0 | 0.1227 | yes |
| western_asia_north | 246 | 0 | 0 | 0.1209 | yes |
| western_europe | 246 | 0 | 0 | 0.0870 | yes |

## Docs

Updated: `scripts/weather_pipeline/README.md`, `scripts/terrain_pipeline/README.md`, `scripts/regional_pipeline/README.md`, `scripts/thirdPartyNotices/noticeCheck.cjs`, `doc/terrain-pipeline.md`, `doc/combat-rules-v3.md`, `doc/game-vision-v2.md`, `README.md`, `THIRD-PARTY-NOTICES.md`.

`npm run notices:check` exited 0.

Leftover WorldClim hits are in this plan, this results file, and `.spec/completed/` (`regional-basemap-prototype-results.md`, `antimeridian-mask-fix-execution-plan.md`, `regional-data-pipeline-execution-plan.md`). Those completed plans stay. `doc/devleopment-plan-v3.4.md`, `doc/poc-analysis.md`, and `doc/market-research.md` do not name WorldClim. `doc/`, `scripts/`, and the root `README.md` have no remaining hits.

## Checks

`npm run weather:test`: Ran 12 tests, OK.

`npm run regional:test`: Ran 44 tests, OK.

`npm test` exited 0, including `notices:check` and `weatherPackLoad.test.ts`.

## Note for the Owner

Ocean hexes now have their own climate. At Default, untagged naval units are slowed by snow. At High, they are also slowed by rain. Birth tags on water hexes follow that hex's own year.

The 0.25 land-change limit was not changed. Global land hex-months changed by 0.3474. Caribbean changed by 0.6972, Central America by 0.2568, and South-eastern Asia by 0.5563. Those packs were still zipped.
