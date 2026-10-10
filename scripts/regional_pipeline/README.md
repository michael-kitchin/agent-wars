# Regional Packs

The game loads one of these packs when a regional match starts. They are the 23 maps in `doc/region-summary-1.md`. The manifest carries side groups, origin units, and the economy. A packaged app ships `*.json.zip` and extracts one region the first time it is played. Only the zips are tracked; never run `regional:extract` with unzipped manifest edits.

Each region is a directory under `data/generated/regions/<region_id>/`:

- `region_manifest.json` lists the strategic cells and the role of each cell (`land`, `sea`, or `neutral_border`). Schema 1.2.0 also lists `side_groups`, `origin_units`, `economy`, and `side_group_balance`. The economy block is the map's prices, gates, and strike size, measured against a frozen global baseline. Each side group's urban share must sit within ±25% of an equal share. Rewriting side groups with the origins step clears both blocks.
- `terrain_res_t_origin_units.json` maps each tactical land cell to an origin unit id.
- `terrain_res_s_metadata.json` and `terrain_res_t_metadata.json` are strategic and tactical terrain.
- `terrain_res_s_naming.json` and `terrain_res_t_naming.json` are the matching names. City rows are only in the tactical file.
- `terrain_res_s_landmass.json` and `terrain_res_s_weather.json` cover the strategic cells.
- `terrain_res_t_road_rail_sides.json` and `terrain_res_t_road_rail_vectors.json` are tactical roads and rail.
- `qa/landmass_qa.json` is the landmass summary for that region.

`res_s` is the strategic H3 resolution (2 or 3). `res_t` is the tactical resolution, always three steps finer (5 or 6). The envelope field `resolution` stores that real H3 resolution.

## Footprints

A strategic cell is member land when it has at least 1 km² of land and at least half of that land belongs to a member country. Water within the sea reach of member land is sea. Every region also keeps water, and non-member land that is only a minor island, within two hexes of member land. A minor island is a land polygon smaller than one average strategic hex. A larger landmass is not given a sea role. Cells that already have a role, including a neutral border, are left alone. The two-ring halo is not clipped by the centroid window. Other land within the neutral reach is a neutral border. Libya, Egypt, and Sudan also drop unsettled member land farther than the desert-trim reach from settled member land.

Reaches were chosen as the 25 km step from 0 to 800 closest to the map's target counts, with ties toward the smaller reach. The table, the Burkina Faso addition, the Libya trim, and the land counts that remain more than 10% off are in `.spec/regional-footprint-tuning-results.md`.

West Africa includes Guinea, Guinea-Bissau, and The Gambia because the coast from Côte d'Ivoire to Senegal spans them. Burkina Faso was added while tuning. Overseas parts of France, the Netherlands, Spain, Portugal, Norway, and the United States drop out through the centroid window or an admin-1 exclusion, except the French and Dutch Caribbean and French Guiana. Southern Asia East excludes the Andaman and Nicobar Islands and Lakshadweep. Madagascar, Western Sahara, the Falklands, the Sahel, Cyprus, Northern Cyprus, and the UN buffer are not in any region.

## Resolution and Scalerank

Strategic cells use 25 area samples and no lakes or urban mask. Tactical cells use 4 samples and include lakes and urban ranks. Topography uses the 50 km grids when the average hex edge is at least 100 km, and the 5 km grids otherwise.

The island floor and the weather search scale with hex size. At strategic resolution 1 the island floor is 2,000 km² and the weather search is 2 rings. At resolution 2 those are about 285 km² and 5 rings. At resolution 3 they are about 41 km² and 14 rings. A cell is water for landmass when its water percent is at least 85.

Roads and rail are filtered when the file is written. Urban areas, airports, seaports, and city labels keep every rank in the JSON. The manifest records the ceiling a later loader should use. The ceiling rises by about 1.4 scalerank steps per H3 resolution step. Roads and rail use the wide end of that range, because a tactical battle covers a much smaller strategic hex. Urban polygons stay near the narrow end, because large polygons already cover a similar share of cells. Airports and seaports use the wider range, because fewer of them fall inside a smaller battle. City labels used to skip rank 5, which has only two places. The global ceiling is now 6, so those two places are included.

| Tactical resolution | Roads | Rail | Urban | Airports | Seaports | City labels |
| --- | --- | --- | --- | --- | --- | --- |
| 4 (global) | 4 | 4 | 5 | 5 | 5 | 6 |
| 5 | 6 | 6 | 6 | 6 | 6 | 7 |
| 6 | 8 | 8 | 7 | 8 | 8 | 8 |

The minimum rank is 0 for every layer.

## Commands

From the repository root. Natural Earth, the EarthEnv rasters, and the extra shapefiles live in the [source directory](../terrain_pipeline/README.md#source-directory). `validate`, `footprint`, `run`, and `origins` take `--data-root` (default `F:/Data` in `regional_cli.py`). `regional:validate`, `regional:footprint`, `regional:generate`, and the `origins` command below omit that flag. `economy`, `check`, `report`, and `zip` read generated packs. The regional `weather` step still reads `WORLDCLIM_DIR`, described in that source-directory section.

1. `npm run regional:validate`
2. `npm run regional:footprint`
3. `npm run regional:generate`
4. `python -m scripts.regional_pipeline.regional_cli origins --all`
5. `npm run regional:economy`
6. `npm run regional:check`
7. `npm run regional:report`
8. `npm run regional:zip`

`regional:generate` skips a step whose output is already complete, so it can be run again after an interruption. A tactical metadata file is complete only when its record count matches the full child set. `regional:extract` restores JSON from the regional archives. These commands are not part of `build`, `start`, or the global `generated:*` scripts.

Western Europe strategic metadata (232 cells) took 18 seconds. Its tactical metadata (79,576 cells) took 0.67 hours, and Eastern Europe tactical metadata (103,586 cells) took 0.87 hours. Those runs sampled each raster pixel by pixel. A regional pass now reads each lon/lat raster once for the map bounds. Caribbean tactical metadata (96,383 cells) then took 6.0 minutes.
