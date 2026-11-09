# Offline Basemap Rollout Results

## Environment

Python 3.13.3. Node v24.14.0. The work started from the existing tree. Nothing was committed.

## Baseline

Git status was saved before the edits. The pack unit tests, the main-process pack reader tests, `node scripts/electron-builder-config.test.cjs`, and `npm run notices:check` were already passing. The full `npm test` was not captured before the first edit. Later runs are under App Checks.

## Sources

108 required, 108 present, 0 missing. Every selected member was extracted beside its zip. `bln075.vrt` origin is `-180 - 1/7200`, `90 - 1/7200`, pixel `1/480` degree. Mont Blanc at 6.865°E, 45.833°N is 4754. The plan's 8.5°E, 48.9°N sample is 334, on the Black Forest foothills; the Rhine plain at 8.3°E, 48.8°N is 163, within 50 of 168. The mosaic is not shifted.

## Western Europe Pack

Camera box: west -8.576452, south 39.009320, east 18.306518, north 56.943588. That covers the required longitude -8.58 to 18.31 and latitude 39.01 to 56.94.

Zoom 9: 1,239 shaded, 9 flat, 474 water (1,722 tiles). Zoom 8: 354 shaded, 0 flat, 87 water (441 tiles). Together: 1,593 shaded, 9 flat, 561 water, 12 partition zips. No zoom 0–7 members. Total 7,723,311 bytes. Largest zip `z5_x16_y11.zip` is 2,110,128 bytes. A second run with `--skip-existing` changed no bytes.

The first render skipped land that shared a partition with an earlier all-water block. That pack was deleted and rendered again. The recount matches every tile in the camera range.

## Global Pack

Exit 0. The 30-arc-second Mont Blanc sample is 4470. Manifest schema 1, zoom 0 through 7. 7,537 shaded, 3,770 flat, 10,538 water, 59 partition zips. `z0_x0_y0` is present. The other 61 keys are `z3_x{0-7}_y{0-7}`; three ocean partitions are omitted because they have no flat or shaded tile. No zip member starts with `8/` or `9/`. Directory total 18,079,421 bytes. Largest zip `z0_x0_y0.zip` is 1,929,202 bytes.

Flat weights were computed per block from `dem_30s.tif`. A separate zoom-7 weight file was not written.

Composites: `.test/basemap/rollout/global-z3.png` and `.test/basemap/rollout/global-z5.png`.

## Regions

Australia and New Zealand crosses 180° (camera 105.741882°E to 187.029881°E). The western part has 805 zoom-8 land tiles and the eastern part has 27. Eastern Europe also crosses 180° (camera -0.507° to 203.315°). Its western part has 5,969 zoom-8 land tiles and its eastern part has 280.

| Region | Shaded | Flat | Water | Partition zips | Bytes | Largest zip |
|---|---:|---:|---:|---:|---:|---|
| western_europe | 1593 | 9 | 561 | 12 | 7,723,311 | `z5_x16_y11.zip` 2,110,128 |
| australia_new_zealand | 2801 | 644 | 10053 | 34 | 6,781,898 | `z5_x28_y16.zip` 859,678 |
| caribbean | 653 | 22 | 1402 | 8 | 1,990,310 | `z5_x9_y15.zip` 524,136 |
| central_america | 1474 | 90 | 2354 | 18 | 6,043,307 | `z5_x6_y13.zip` 1,667,390 |
| central_asia | 2664 | 658 | 75 | 16 | 11,150,787 | `z5_x22_y12.zip` 3,015,266 |
| eastern_asia | 7162 | 366 | 3865 | 38 | 50,022,866 | `z5_x24_y13.zip` 4,443,602 |
| eastern_europe | 27964 | 1459 | 45050 | 157 | 121,249,206 | `z5_x28_y8.zip` 3,914,362 |
| horn_and_great_lakes | 1630 | 255 | 556 | 9 | 4,488,526 | `z5_x19_y15.zip` 1,166,876 |
| libya_egypt_sudan | 1956 | 411 | 295 | 16 | 3,805,790 | `z5_x19_y14.zip` 816,992 |
| maghreb | 1537 | 234 | 756 | 12 | 3,941,057 | `z5_x15_y12.zip` 1,226,676 |
| middle_africa_north | 1408 | 306 | 117 | 12 | 2,394,729 | `z5_x17_y16.zip` 565,758 |
| middle_africa_south | 1341 | 138 | 211 | 8 | 3,072,135 | `z5_x17_y16.zip` 856,562 |
| northern_america | 9076 | 554 | 7672 | 54 | 40,032,846 | `z5_x4_y9.zip` 4,097,254 |
| northern_europe | 3321 | 84 | 3705 | 23 | 12,513,660 | `z5_x17_y8.zip` 1,401,336 |
| south_america | 4366 | 661 | 11161 | 40 | 19,277,419 | `z5_x9_y20.zip` 1,766,792 |
| south_eastern_asia | 3169 | 98 | 5013 | 28 | 19,018,378 | `z5_x24_y13.zip` 3,797,124 |
| southern_africa | 951 | 188 | 939 | 8 | 2,682,401 | `z5_x18_y18.zip` 960,818 |
| southern_asia_east | 1742 | 167 | 1183 | 14 | 12,120,648 | `z5_x24_y13.zip` 2,815,760 |
| southern_asia_west | 1670 | 272 | 149 | 12 | 9,105,259 | `z5_x22_y12.zip` 3,670,684 |
| southern_east_africa | 1364 | 186 | 492 | 12 | 3,267,379 | `z5_x18_y16.zip` 926,170 |
| southern_europe | 1773 | 43 | 890 | 12 | 10,268,707 | `z5_x17_y11.zip` 2,210,294 |
| west_africa_coast | 973 | 261 | 562 | 8 | 1,543,970 | `z5_x16_y15.zip` 458,182 |
| western_asia_north | 1489 | 136 | 311 | 9 | 7,067,496 | `z5_x19_y12.zip` 1,746,798 |

All 23 region packs are present. The basemap tree is 377,641,506 bytes. The largest zip is `regions/eastern_asia/z5_x24_y13.zip` at 4,443,602 bytes.

## App Checks

`npm run basemap:test` passed (35 tests). `npm run terrain:test` passed. `npm test` passed, including lint, the renderer typecheck, the main-process tests, and `notices:check`. `npm run generated:assert-pack-ready` passed with every catalog region required. `npm run dist:win` passed. The unpacked app at `release/win-unpacked/resources/data/generated/basemap/` contains the global pack and all 23 region packs. `npm run doc:shots` passed and rewrote 23 images, including `doc/media/global-preview.png` and `doc/media/regional-preview.png`. Those two show the hillshade, the blue-gray water, and the GMTED and Natural Earth attribution.

A built-app session checked the four terrain styles, western Europe past zoom 7, and a western Europe battle. Screenshots are under `.test/basemap/rollout/screenshots/`. Default, Atlas, Scientific, and Wargame applied the existing CSS filters to the tile pane and the water pane on the main map and the minimap. The water pane is `rgb(190, 205, 218)`, z-index 190, with pointer events off. The same tile element stayed mounted across all four styles. At zoom 8 the main map requested `agentwars-basemap://tiles/western_europe/8/...webp`. Attribution on that map includes `Elevation: GMTED2010 courtesy of the U.S. Geological Survey. Water: Made with Natural Earth.` An unknown map id returned native zoom 7. Every catalog region now has a pack, so a region with no pack was not opened.

The battle was a small western Europe match, Southern & eastern Germany, Austria, Switzerland against Southern France, with fog off so both armies were visible. Opening the battle logged `basemapPrefetch start` for `western_europe` and `basemapPrefetch finished` for `z5_x16_y10`, `z5_x16_y11`, `z5_x17_y10`, and `z5_x17_y11`. Each of those directories has `partition.ready` under the temporary user-data folder. The battle view shows the hillshade under the hexes.

The packaged app launched from `release/win-unpacked/Agent Wars v2.20.0.exe` into a temporary user-data directory. No basemap unpack was logged before the first tile request. The first request was shaded tile `global/2/1/1`. The reader uses the resources copy of the packs, outside `app.asar`. The index archive `indexes.json.zip` (124,079 bytes) unpacked in 47 ms. The tile partition `z0_x0_y0.zip` (1,929,202 bytes) unpacked in 540 ms. That partition was ready 599 ms after the first shaded request. The window was created without waiting for either unpack. The packaged executable was rebuilt after prefetch was changed to yield between partitions. That change does not alter the single-tile write path, and the 599 ms figure was not measured again.

## Docs

Updated `doc/terrain-pipeline.md`, `doc/README.md`, `doc/ux/terrain-legend.md`, `doc/ux/map-surface.md`, `doc/ux/minimap.md`, `doc/ux/notifications-and-feedback.md`, `doc/ux/reports-tab.md`, `SECURITY.md`, `README.md`, `scripts/basemap_pipeline/README.md`, `THIRD-PARTY-NOTICES.md`, and `scripts/thirdPartyNotices/noticeCheck.cjs`. `npm run doc:shots` replaced the images under `doc/media/`. Historical release notes were left as the record of the builds that used remote tiles.

## Observations for the Owner

The 46 archives without a breakline member use `dsc075`. A seam is possible where that meets breakline, mainly near 30°E. The plan's Rhine coordinate sits on the foothills, not the valley floor.
