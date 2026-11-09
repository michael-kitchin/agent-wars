---
name: Offline basemap rollout plan
overview: "Replace the Esri and OpenStreetMap basemap with the stylized GMTED hillshade. Zooms 0-7 ship in one global pack. Zooms 8-9 ship in each regional pack. Partitioned zips live in plain Git, are bundled at build time, and unpack into user data when a shaded tile is first needed. Water and flat land are shared tiles."
todos:
  - id: preconditions
    content: Record git status and baseline test results
    status: pending
  - id: sources
    content: Inventory and extract GMTED breakline tiles, write the VRT, and match the western Europe sample elevations
    status: completed
  - id: regional-pack
    content: Add tile classes, partition math, and the pack writer, then build the western Europe pack
    status: completed
  - id: global-pack
    content: Build the 30-arc-second world elevation and the global zoom 0-7 pack
    status: completed
  - id: packaging
    content: Bundle the basemap tree in electron-builder and extend the pack assert
    status: completed
  - id: pack-reader
    content: Read manifests, resolve tiles, and unpack one partition at a time
    status: completed
  - id: protocol
    content: Register the custom protocol, the IPC channels, and the content security policy
    status: completed
  - id: renderer
    content: Switch the map to the offline layer, the filtered water underlay, and the four existing styles
    status: completed
  - id: prefetch
    content: Unpack a regional battle's partitions in the background
    status: completed
  - id: all-regions
    content: Build the remaining regional packs and check size and the antimeridian
    status: completed
  - id: docs
    content: Update the living docs, the notices file, and the security note
    status: completed
  - id: final-checks
    content: Run the test suites, build the Windows package, and check startup
    status: completed
isProject: false
---

# Offline Basemap Rollout Execution Plan

This file is the plan. Do not revise it while coding. The one allowed edit is setting a todo's `status` in the front matter when its phase passes. Record what happens in `.spec/offline-basemap-rollout-results.md` (template at the end).

## Purpose

The match basemap today is Esri World Shaded Relief, with OpenStreetMap as a fallback. Both are remote tile hosts. Replace them with the stylized hillshade the prototype already renders, for every match:

- A global match uses world tiles at zooms 0 through 7. Leaflet stretches those tiles up to the tactical zoom cap.
- A regional match uses the same world tiles at zooms 0 through 7, plus that region's tiles at zooms 8 and 9. Leaflet stretches zoom 9 up to the tactical zoom cap.
- Flat land is one shared tile. Water is one shared transparent tile, with the water color drawn underneath. Only tiles that actually contain relief are stored.
- The packs ship in the repository as ordinary zip files, are bundled into the app, and are unpacked into the user-data directory one partition at a time. Startup does not unpack them.

The owner accepted that a battle on the global map stays on stretched zoom-7 tiles. Finer global battles are a follow-up, not this work.

## Settled Decisions

- **Style that ships:** `STYLIZED_STYLE` in `scripts/basemap_pipeline/basemap_settings.py`, as it is now. Do not copy numbers from `.spec/regional-basemap-prototype-execution-plan.md`. That file's style table is older than the current code. Read the fields from `BasemapStyle` and use the object. The current values are relief exaggeration 2, slope smoothing 1, shade blur 0.375, along-crest smoothing 6, contrast 2, flattening on, flat gray 210, light from azimuth 315 at altitude 45, zoom exaggeration step 1.2. `PLAIN_STYLE` stays in the package for the prototype commands and is not packed.
- **Water color under the tiles:** `PREVIEW_WATER_RGB`, `(113, 148, 177)`. The four terrain styles stay CSS filters on the tiles and on that water layer. Their filter strings in `src/shared/basemapStyleLogic.ts` do not change. Hex fills do not change.
- **Elevation-tile lines:** The renderer draws the baked GMTED joins over the main map's tiles. The minimap does not draw them. Meridians are every 30°. Parallels are at ±10, ±30, ±50, and ±70, plus the equator, which is not a join. Longitude 0, longitude ±180, and the equator are solid. The other lines are dashed. The stroke is `rgba(48, 56, 64, 0.15)`. The tiles are not regenerated for this.
- **Attribution, exact:** `Elevation: GMTED2010 courtesy of the U.S. Geological Survey. Water: Made with Natural Earth.`
- **Blank tiles, decided before WebP encoding** on the raw uint8 image:
  - Water: every pixel has alpha 0.
  - Flat land: every pixel has alpha 255 and a gray level from 206 through 214 inclusive (within 4 of 210).
  - Shaded: anything else, including a coastline and a tile with one pixel outside that gray range.
  - Only shaded tiles are stored. Flat land is served from `land.webp`. Water is served from `water.webp`. A tile the index does not mention is water.
- **Zooms and partitions:**

  | Pack | Zooms stored | Partition zoom | Partition key |
  |---|---|---|---|
  | Global | 0–5 | 0 | one key, `z0_x0_y0` |
  | Global | 6–7 | 3 | `z3_x{x}_y{y}` of the zoom-3 ancestor |
  | Regional | 8–9 only | 5 | `z5_x{x}_y{y}` of the zoom-5 ancestor |

  Regional packs do not contain zooms 0–7. A request for zoom 7 always reads the global pack, even during a regional match. A request for zoom 8 reads the regional pack.
- **Storage:** plain Git, not Git LFS. Root is `data/generated/basemap/`. This tree is not `data/generated/regions/`. The regional JSON extractor does not see it.
- **File size:** do not stop a pack because a zip or the `data/generated/basemap/` tree is large. Record the byte total and the largest zip in the results file. Over-large files are handled after the conversion. Do not delete a finished pack to make the tree smaller, and do not split a partition.
- **Elevation:** GMTED2010 breakline emphasis (`bln075`) wherever that member exists. The 46 archives USGS shipped without breakline use the 7.5-arc-second systematic subsample (`dsc075`) instead. That choice keeps the approved breakline look on the tiles that have it, and it keeps the same pixel grid everywhere else, which a median would soften. From 90°S to 70°S the only sample is `dsc300`. Do not read `med075`, `mea075`, `mea300`, `min075`, `max075`, `std075`, the four loose `*_med075.tif` files, or `md75_grd.zip`. A seam is possible where a breakline tile meets a subsample tile, mainly near 30°E.
- **Resume:** every pack command accepts `--skip-existing`. A partition is current when its zip is in the manifest, the sha256 matches the file, and the manifest's settings hash and sources hash match the inputs. A changed style field or a changed source GeoTIFF rebuilds the affected partitions.

## What You Will Build

Python, added to `scripts/basemap_pipeline/`:

| File | Responsibility |
|---|---|
| `gmted_sources.py` | List and extract the `bln075` and `dsc300` members. Describe both grids. Write a GDAL VRT over the breakline tiles only. |
| `world_dem.py` | Build the 30-arc-second world GeoTIFF from that VRT. |
| `region_extent.py` | Port the camera-box math and split a box that crosses 180°. |
| `tile_classes.py` | Classify a raw image as water, flat land, or shaded. |
| `tile_partitions.py` | Map a tile to its partition key. |
| `pack_writer.py` | Write deterministic zips, indexes, and the manifest. |
| `pack_rendering.py` | Render one pack from the VRT, the water mask, and the stylized style. |
| `pack_cli.py` | Handlers for `sources`, `regional-pack`, and `global-pack`. |

`basemap_cli.py` gains a short branch that calls those handlers. It is 457 lines today. If adding the branch would put it over 600 lines, move an existing private helper out instead of growing it. Do not put the new handlers in `basemap_cli.py`.

TypeScript, new directory `src/main/basemap/`:

| File | Responsibility |
|---|---|
| `basemapPackTypes.ts` | Manifest and index types. |
| `basemapPackRead.ts` | Find a pack on disk and read its manifest and indexes. |
| `basemapTileResolve.ts` | Map a request to global or regional, then to a class and a partition. |
| `basemapPartitionExtract.ts` | Unpack one partition, with one unpack at a time per partition. |
| `basemapProtocolHandler.ts` | Turn a URL into tile bytes. No Electron import. |
| `basemapPrefetch.ts` | Unpack the partitions that cover a battle footprint. |

The renderer keeps its changes in a new `src/renderer/map/basemapLayer.ts`. `worldLeafletMap.ts` is 599 lines. Add only the calls it needs. Do not push it over 1000 lines.

Shipped tree, after the packs exist:

```text
data/generated/basemap/global/basemap_pack.json.zip
data/generated/basemap/global/indexes.json.zip
data/generated/basemap/global/land.webp
data/generated/basemap/global/water.webp
data/generated/basemap/global/z0_x0_y0.zip
data/generated/basemap/global/z3_x{x}_y{y}.zip
data/generated/basemap/regions/<region_id>/basemap_pack.json.zip
data/generated/basemap/regions/<region_id>/indexes.json.zip
data/generated/basemap/regions/<region_id>/land.webp
data/generated/basemap/regions/<region_id>/water.webp
data/generated/basemap/regions/<region_id>/z5_x{x}_y{y}.zip
```

A partition with no shaded tile has no zip. Its flat tiles, if any, live only in `indexes.json.zip`. A partition that is entirely water is absent from the manifest and from the indexes.

Work rasters, VRTs, and logs go under `.test/basemap/`, which is gitignored. Do not write those into `data/generated/`.

Runtime unpack root: `<userData>/generated-basemap/<global-or-region-id>/<partition-key>/`. The indexes unpack once per pack to `<userData>/generated-basemap/<id>/indexes/`.

## Pack Schemas

`basemap_pack.json.zip` has one stored member, `basemap_pack.json`:

```json
{
  "schema": 1,
  "kind": "global",
  "mapId": "global",
  "zoomMin": 0,
  "zoomMax": 7,
  "settingsHash": "<64 lowercase hex>",
  "sourcesHash": "<64 lowercase hex>",
  "landTile": "land.webp",
  "waterTile": "water.webp",
  "indexesZip": "indexes.json.zip",
  "indexesSha256": "<64 lowercase hex>",
  "partitions": {
    "z0_x0_y0": { "zip": "z0_x0_y0.zip", "sha256": "<64 lowercase hex>" },
    "z3_x3_y2": { "zip": null, "sha256": null }
  }
}
```

`kind` is `global` or `regional`. `mapId` is `global` or the region id. `zoomMin` and `zoomMax` are 0 and 7 for global, 8 and 9 for regional. A partition entry with `zip: null` has flat tiles and no shaded tiles. Partitions that are entirely water are omitted.

`indexes.json.zip` has one member per partition key, named `<key>.json`:

```json
{ "flat": ["6/18/20"], "shaded": ["7/36/40"] }
```

Keys inside `flat` and `shaded` are `{z}/{x}/{y}`. They are sorted. A tile in neither list is water. A tile is in at most one list.

`land.webp` is a 256 by 256 RGB WebP, every pixel gray 210, quality 80, method 4. `water.webp` is a 256 by 256 RGBA WebP, every pixel alpha 0. The same two files are copied into every pack.

Zip members use stored compression (no deflate), are written in sorted name order, and use the timestamp `(2020, 1, 1, 0, 0, 0)`. A second run with the same inputs writes the same bytes. The sha256 is the hash of the zip file, lowercase hex.

The settings hash is the sha256 of the canonical JSON of every `STYLIZED_STYLE` field, plus tile size 256, WebP quality 80, method 4, blank tolerance 4, the zoom bounds, and the partition zooms. Canonical means sorted keys and no spaces. The sources hash is the sha256 of the sorted lines `name size`, one per GeoTIFF that pack reads, with size in bytes. A regional pack hashes the `bln075` tiles that overlap its extent. The global pack hashes every `bln075` tile and every `dsc300` tile. Do not hash `med075`, `mea300`, or `md75_grd.zip`. Do not hash mtimes. A copy that preserves bytes keeps the hash.

## Request Path

Leaflet asks for `agentwars-basemap://tiles/{gameMapId}/{z}/{x}/{y}.webp`.

The scheme is registered as standard, so the URL parser treats `tiles` as the host and `/{gameMapId}/{z}/{x}/{y}.webp` as the path. Do not look for a path that starts with `tiles/`. Require the host to be `tiles`. Require the path to match `^/([a-z0-9_]+)/(\d+)/(\d+)/(\d+)\.webp$`. Reject the raw URL first if it contains `..`, a backslash, or a percent sign.

`gameMapId` is `global` or a region id such as `western_europe`. The handler does not build a filesystem path by joining the raw URL. It checks the id against `^[a-z0-9_]+$`, then:

| Request | Pack read |
|---|---|
| zoom 0 through 7, any known map id | `data/generated/basemap/global/` |
| zoom 8 or 9, and that region pack exists | `data/generated/basemap/regions/{gameMapId}/` |
| zoom 8 or 9, map id `global` or a missing region pack | the global `water.webp`, and a debug log |
| anything else | HTTP 404 |

Known map ids are `global` plus every directory under `data/generated/basemap/regions/` that contains `basemap_pack.json.zip`.

Serving a tile:

1. If the indexes for that pack are not unpacked, or `indexes.ready` does not equal `indexesSha256`, unpack `indexes.json.zip` to a temp directory and rename it into place. This zip is small. Do it on the first request, not at startup.
2. Load `<key>.json` for the tile's partition. A missing member means the whole partition is water.
3. If the tile is not listed, return `water.webp`.
4. If it is listed as flat, return `land.webp`.
5. If it is listed as shaded, unpack that partition if `partition.ready` does not equal the manifest sha256, then return `{z}/{x}/{y}.webp` from the unpacked directory.

Read the user-data directory when the request arrives. Do not capture it when the handler is registered. `applyUserDataDirOverride` runs before the window exists and a test can point user data at a temp directory.

Cache the `land.webp` and `water.webp` bytes in memory after the first read of each pack. Ocean tiles must not hit the disk again.

Unpacking follows `src/main/gameMap/regionPackExtract.ts`: write to a temp directory, rename the existing destination out of the way, rename the temp into place, then delete the backup. The ready marker is written after the rename and contains the sha256 text. Windows cannot rename onto an existing directory. Use the same backup pattern. Use `fs.promises.rename`, not a shell `Rename-Item`.

Parallel tile requests for one partition must share one in-flight promise. A second request waits for the first unpack. Do not unpack the same partition twice at once.

The handler returns `Content-Type: image/webp` and `Cache-Control: public, max-age=31536000`. It does not import Electron. `src/main/main.ts` wraps it in `protocol.handle`.

Startup does not read, hash, or unpack any basemap zip. The first global partition unpacks when the first shaded low-zoom tile is requested. That unpack must finish in under one second on the owner's machine. The window is created without waiting for it.

## Generator Math

### Source tiles

The owner's downloads are in `F:/Data/gmted2010`. `sources` reads that folder. It does not download anything.

The 7.5-arc-second set is 96 zips. The name is `GMTED2010{N|S}{latitude}{E|W}{longitude}_075.zip`. Latitude labels are `N70`, `N50`, `N30`, `N10`, `S10`, `S30`, `S50`, and `S70`. Longitude labels are `W180`, `W150`, `W120`, `W090`, `W060`, `W030`, `E000`, `E030`, `E060`, `E090`, `E120`, and `E150`. The label is the southwest corner. `GMTED2010N30E000_075.zip` is 30°N, 0°, and the tile runs 30° east and 20° north from there. Every one of the 96 is required, including the ocean tiles. An ocean tile is still a full raster of nodata, and the coverage check uses it.

The Antarctica set is 12 zips, `GMTED2010S90{longitude}_300.zip`, with the same longitude labels. `S90` is the southwest corner at 90°S, and the tile runs 20° north to 70°S. All 12 were present when this plan was reviewed. They are required too.

Each `_075.zip` holds six or seven GeoTIFFs of the same grid. Extract `bln075` when it is present. When it is absent, extract `dsc075`. In `GMTED2010N30E000_075.zip` the breakline member is `30n000e_20101117_gmted_bln075.tif`. Leave `max075`, `mea075`, `med075`, `min075`, and `std075` in the zip. Leave `dsc075` in the zip when `bln075` was extracted.

Each `_300.zip` holds two GeoTIFFs. Extract the member whose name contains `dsc300`. In `GMTED2010S90E000_300.zip` that member is `90s000e_20101117_gmted_dsc300.tif`. Leave `mea300` in the zip. There is no `bln` member in these zips.

Write the extracted tif next to the zip. If that tif is already there and its byte size equals the zip member's uncompressed size, do not extract it again. The four western Europe breakline tifs are already extracted and are 276,634,079 bytes each, which is the uncompressed size of every `bln075` member. A `dsc300` member is a 3600 by 2400 raster, about 17,339,077 bytes. `90s180w` is one byte smaller. Compare against the member size. Do not hardcode one Antarctica size.

Extracting every `bln075` member writes about 25 GB. Every tile is 14,400 by 9,600 int16 pixels, ocean included. The twelve Antarctica rasters add about 200 MB. Do not unzip a whole archive. Seven statistics per tile would be about 180 GB.

Ignore a Chrome partial: `*.crswap`, `*.crdownload`, and `*.part`. A zip that is empty, that `zipfile.is_zipfile` rejects, or that still has a partial sibling is missing. Print required, present, and missing. If a filename from the 108 is missing, exit 2 and stop.

All 108 filenames were checked after the download finished. Every one is a valid zip. None are empty or partial. Fifty of the `_075.zip` files contain one `bln075` member. The other 46 contain six members and no `bln075`: `dsc075`, `max075`, `mea075`, `med075`, `min075`, and `std075`. That is how USGS packed them, not a failed download. Those 46 are every `W180` tile, every `E030`, `E060`, `E090`, `E120`, and `E150` tile from `N50` through `S70`, plus `N70W180`, `N70E030`, `N70E120`, and `N70E150`. `N70E060` and `N70E090` do contain `bln075`. Their uncompressed size is about 276,711,874 bytes rather than 276,634,079. The grid is still 14,400 by 9,600 at 1/480 degree with the same 0.5" shift. Do not reject them for the size difference.

`sources` extracts `bln075` when that member exists and `dsc075` when it does not. Both are 7.5-arc-second rasters on the same grid, so both belong in `bln075.vrt`. It extracts `dsc300` from each `_300.zip` and does not put those files in the breakline VRT. It must not extract `med075` or `mea300`. A missing filename, an empty zip, or a partial sibling is exit code 2. A complete zip that has `dsc075` and no `bln075` is not a missing download.

Measured from `30n000e_20101117_gmted_bln075.tif` and from `90s000e_20101117_gmted_dsc300.tif` inside its zip:

| | `bln075` | `dsc300` |
|---|---|---|
| Size | 14,400 by 9,600 | 3,600 by 2,400 |
| Pixel | 1/480 degree (7.5") | 1/120 degree (30") |
| Dtype | int16, one band, nodata -32768 | same |
| CRS | WGS 84 geographic. `dataset.crs.equals(EPSG:4326)` is true. There is no EPSG authority tag on the CRS node. | same |
| Registration | The raster is shifted 1/7200 degree (0.5") west and south of the labeled corner. | same shift |

`50n030w` confirms the label: its edges sit 0.5" outside 50°N and 30°W, and the opposite edges are 20° north and 30° east of that. Do not treat the labeled corner as the pixel origin. `describe_gmted_file` checks the 7.5" spacing, so it rejects a `dsc300` tile. Give the 30" tiles their own check. Do not loosen `describe_gmted_file` to accept both spacings.

### VRT

Write `.test/basemap/world/work/bln075.vrt` as GDAL VRT XML. Do not call `gdalbuildvrt`. Do not mosaic the tiles into one in-memory array. The existing 600-million-pixel guard stays on `build_dem_mosaic`. The pack path does not call `build_dem_mosaic`.

The VRT contains every 7.5-arc-second tile: `bln075` where USGS included it, and `dsc075` for the 46 archives that have no breakline member. Do not add `dsc300`. It is four times coarser, and `require_shared_pixel_grid` must reject that mix. Reuse `require_shared_pixel_grid` from `dem_source.py` on the breakline tiles. The VRT origin is the minimum left and the maximum top, snapped to that grid, including the 0.5" shift. Pixel size is 1/480 degree. For a tile, the destination column is `round((tile_left - vrt_left) / pixel_size)` and the destination row is `round((vrt_top - tile_top) / pixel_size)`. Band type is Int16. Nodata is -32768. SRS is EPSG:4326.

Reopen the VRT and read one pixel at 6.865°E, 45.833°N. It must be 4754, the Mont Blanc sample already recorded in `.spec/regional-basemap-prototype-results.md`. Also read 8.5°E, 48.9°N and expect a Rhine-plain value near 168, within 50 of it. A failure here means the VRT offsets are wrong. Stop.

### World elevation for zooms 0–7

Write `.test/basemap/world/work/dem_30s.tif`. It is a north-up GeoTIFF on the same pixel phase as the source tiles:

- west `-180 - 1/7200`, north `90 - 1/7200`, pixel size 1/120 degree (30 arc-seconds)
- width 43200, height 21600
- one Int16 band, nodata -32768, tiled, with overviews 2, 4, 8, 16, 32, and 64

Do not put the origin at -180 and 90. The source pixels are shifted 0.5" southwest, so a grid locked to the integer degree would split every 4 by 4 block across pixel edges. `-180 - 1/7200` to `180 - 1/7200` is still exactly 360 degrees, and `-90 - 1/7200` to `90 - 1/7200` is still exactly 180 degrees.

From 70°S northward, each output pixel is the mean of the 4 by 4 `bln075` pixels that cover it, ignoring nodata. If all 16 are nodata, write nodata. Read the VRT in windows. Do not load it whole. South of 70°S, copy `dsc300` pixels straight into the output. They are already 30 arc-seconds on this same phase. Do not average them again. The `S70` breakline tiles and the `S90` subsample tiles meet at `-70 - 1/7200`. There is no gap and no overlap.

Do not expect Mont Blanc to stay 4754 after this average. Require the 30-arc-second sample at that point to be between 1000 and 4754, and record the value.

Nodata in this raster is ocean as far as shading is concerned. Treat it as elevation 0 when a window is read for shading, then let the water mask make the pixel transparent. A land pixel that is still nodata after both inputs are written stays flat gray. With the full 108 tiles that should be rare.

### Weights

Flattening still uses slope at the finest zoom of that pack, averaged down. Do not build a zoom-9 weight raster for the whole world. A zoom-9 world raster would be about 17 billion pixels.

- Regional pack: for each block, compute the flat weight at zoom-9 pixels from the VRT, in memory, with the existing ramp (`flat_slope_deg` 2, `full_relief_slope_deg` 5, `slope_smoothing_sigma_px` 1). Zoom 8 uses the 2 by 2 mean. Then discard the array.
- Global pack: the finest weight is zoom 7, not zoom 9. A zoom-9 weight for the whole world is about 17 billion pixels, so do not build one and then average it. For each zoom-7 tile, compute the weight at that tile's own pixels from `dem_30s.tif`. Cache it as a tiled GeoTIFF under `.test/basemap/world/work/flat_weight_z7.tif`, 32768 by 32768 pixels (128 tiles of 256). That file is about 1 GB plus overviews. `dem_30s.tif` is about 1.9 GB before overviews. Windowed writes only. Overviews 2, 4, 8, 16, 32, 64, and 128 serve zooms 6 down to 0. `--skip-existing` keeps the file when the settings hash and the sources hash in a sidecar JSON still match.

`render_block` keeps its current dataset path for the prototype `tiles` command. Add an optional in-memory weight array. The pack renderer passes the array. `PLAIN_STYLE` still ignores weights.

### Region extent

Copy the behavior of `longitudeIntervalFromCenters` and `mapExtentBoxForHexes` in `src/shared/mapExtent.ts`, and of `alignLongitudeToReference` in `src/shared/webMercator.ts`. Use the `h3` package the pipeline already imports. Do not add a dependency. Do not use `cells_box` or `bounds_for_cells` for the pack. Those are cell bounds. The camera box also includes hex vertices, aligned as a ring to the unwrapped frame. A pack built from the cell bounds will miss the corners the player can pan to.

A Python test must show:

- centers at 170 and -170 produce a short span of about 20° that crosses 180°
- centers at 10 and 30 produce a span of 20° that does not cross
- centers at -175, 30, and 170 run east from 30 past 180, which is the case named in the TypeScript docstring

Split a crossing box before calling `tile_range_for_box`, which rejects a west edge past the east edge:

- west 160, east 190 becomes (160, 180) and (-180, -170)
- a box already inside [-180, 180] stays one box
- drop a part whose west is not less than its east

The regional tile range is the union of those boxes at zoom 9, expanded by one tile on every side, then clamped to the world. Zoom 8 is the parent range of that zoom-9 range. Partition keys are the distinct zoom-5 ancestors. One tile of margin is at zoom 9, not at zoom 5.

Skip a directory named `qa` under `data/generated/regions/`. The regional JSON extractor skips it too. There are 23 real regions.

### All-water blocks

If every pixel of a block's water coverage is 1, classify every tile in the block as water and do not read elevation. Reuse the cached Natural Earth geometry the prototype already builds. Rebuild the cache if it is missing. Clip water to the block, not to a single region box, so coastal tiles past the hex outline still match.

### Ancestor keys

```text
shift = tileZoom - partitionZoom
ancestorX = tileX >> shift
ancestorY = tileY >> shift
```

Fixtures the unit test must include:

| Tile | Partition zoom | Key |
|---|---|---|
| zoom 9, x 243, y 157 | 5 | `z5_x15_y9` |
| zoom 6, x 30, y 19 | 3 | `z3_x3_y2` |
| zoom 4, x 8, y 5 | 0 | `z0_x0_y0` |
| zoom 8, x 0, y 10 | 5 | `z5_x0_y1` |

The last row is the west side of the antimeridian. x is never negative in XYZ. A region that crosses 180° produces some keys with a high x and some with a low x. Do not wrap those into one x range. Y is the XYZ row Leaflet uses, the same as `web_mercator.py`. Do not convert it to TMS.

## Rules for the Implementing Agent

- Read `AGENTS.md` and every file in `.cursor/rules/` before writing code.
- Never commit or push. Do not run `git add`, `git commit`, `git push`, `git checkout -- <file>`, `git restore`, `git stash`, or `git reset`.
- Do not put identifiers from this file into code, comments, tests, docstrings, log messages, configuration, or anything under `doc/`. That includes phase numbers, todo ids, and the words "phase" and "gate". This file and the results file may use them.
- Finish each phase and pass its checks before starting the next. When a check fails, follow the Stop Protocol.
- Python style matches the existing package. `from __future__ import annotations`. A docstring on every function, including private helpers, with "Why this exists:", "When to use:", "What to expect:", and "Exceptions:" when it raises. A `#` comment above every dataclass field and module constant. `Final` on constants. Frozen dataclasses. Files under 600 lines. Functions at 6 named parameters or fewer. Parameter objects are fine.
- Logging in Python uses `configure_logging` and `TRACE_LEVEL` from `scripts.terrain_pipeline.logging_utils`. Public functions that write files log at debug. Pure functions log at trace. Caught exceptions log at error, then re-raise or become an exit code.
- TypeScript under `src/` uses camelCase files and functions, PascalCase types, and only these role suffixes: Handler, Helpers, Guards, Adapter, Pipeline, Core, Types. Do not create a file ending in `Utils` or `Impl`. New public main-process functions log through `src/main/logger.ts`: debug for work that changes state or reads a pack, trace for lookups, error in the catch. Renderer code uses `console.debug`, `console.warn`, and `console.error`, as the map modules do. Orienting comments on new and updated functions follow `.cursor/rules/04-orienting-comments.mdc`. When you edit a function, replace a boilerplate comment on that function. Do not re-comment a whole file you only called into.
- Tests cover the happy path and the essential failures named in each phase. Do not test private helpers, log lines, or getters that only return a field. Python tests must not read `F:/Data`, the network, or `data/generated/`. They build synthetic GeoTIFFs in a temp directory. Node tests live next to the code as `*.test.ts` and are picked up by `npm test` after `build:main`.
- Run commands from the repository root in PowerShell. After a native command, check `$LASTEXITCODE`. Set `$env:PYTHONUNBUFFERED = "1"` for Python. Send long output to a file with `> path 2>&1`. Do not use `Tee-Object`. Do not start a second long render while one is running.
- The prototype commands `validate`, `dem`, `weights`, `tiles`, `composites`, `preview`, `report`, and `all` must keep working. Run `npm run basemap:test` after every Python change.

## Do Not Change

- `src/main/gameMap/regionPackExtract.ts` and the regional JSON zip layout.
- `scripts/extract-regional-data.cjs`, except if a comment there says it scans all of `data/generated/`. It must keep scanning only `data/generated/regions/` and only the JSON zip names it already lists.
- Existing files under `data/generated/regions/` and `data/generated/*.json.zip`.
- Hex colors, terrain classification, battle footprint rules, and the CSS filter strings.
- The tactical zoom cap: `tacticalAbsoluteMaxZoom` stays 16 and `tacticalFlyMaxZoom` stays 14.5.
- `package.json` version. Do not write a release note.

## Phase 1: Preconditions

1. Create `.test/basemap/rollout/logs/`. Run `git status --short` and save it to `.test/basemap/rollout/logs/git-status-before.txt`. Files already changed belong to the prototype. Do not revert them. List them in the results file.
2. Run `npm run basemap:test`, `npm run terrain:test`, and `npm test`. All three must pass before you edit. Save the tails of the output in the results file. `npm test` is long. Let it finish.
3. Record `python --version` and `node --version`.

There is no GUI check in this phase.

## Phase 2: GMTED Sources and the VRT

Add `gmted_sources.py`, `pack_cli.py`, and the `sources` subcommand.

```text
python -m scripts.basemap_pipeline.basemap_cli sources --gmted-dir F:/Data/gmted2010 --work .test/basemap/world/work > .test/basemap/rollout/logs/sources.txt 2>&1
```

The command prints required, present, and missing tiles, extracts each missing `bln075` or `dsc300` member, and writes `bln075.vrt` from the breakline tifs only.

Checks:

- Exit code 0 when all 96 `_075.zip` files and all 12 `_300.zip` files are present, non-empty, and valid, and each `_075.zip` yielded either `bln075` or `dsc075`. Exit code 2 when a filename is missing, empty, or partial. On code 2, stop.
- The VRT does not list a `dsc300` file.
- The VRT pixel at 6.865°E, 45.833°N is 4754.
- The Rhine sample is within 50 of 168.
- One extracted `bln075` tif reports a pixel width of 1/480 degree and an origin 1/7200 degree off the labeled corner. One `dsc300` tif reports a pixel width of 1/120 degree and the same 1/7200 degree shift.
- `npm run basemap:test` passes, including the new tests below.

Tests, on synthetic 2 by 2 Int16 GeoTIFFs written in a temp directory:

- Two adjacent tiles become a VRT whose width is the sum of the widths, and a pixel in the second tile lands in the right half.
- A tile with a different pixel size raises. This is also what keeps `dsc300` out of the breakline VRT.
- A zip that contains `foo_bln075.tif` and `foo_med075.tif` extracts only the breakline member.
- A zip that contains `foo_dsc300.tif` and `foo_mea300.tif` extracts only the subsample member.
- A 0-byte zip, and a zip that has a sibling whose name ends in `.crswap`, are reported missing and are not extracted.

Do not point a test at `F:/Data`.

## Phase 3: Classes, Partitions, Writer, and Western Europe

Add `tile_classes.py`, `tile_partitions.py`, `pack_writer.py`, `region_extent.py`, and `pack_rendering.py`. Wire `regional-pack`. Regional elevation is the full-resolution VRT from Phase 2, not `dem_30s.tif`. Zoom 9 is finer than 30 arc-seconds. Classify the uint8 image before WebP encoding. Do not classify a decoded WebP file. Gray 210 is exact in a flat tile, but a shaded tile's near-flat pixels are only a clue. The decision uses the raw image.

Classification tests:

- An opaque image of gray 210 is flat. Gray 206 and gray 214 are flat. Gray 205 and gray 215 are shaded.
- An image with one transparent pixel and the rest opaque gray 210 is shaded.
- An image with alpha 0 everywhere is water.
- An empty array raises.

Partition tests use the fixture table in Generator Math, plus the antimeridian split of west 160, east 190.

Writer tests, in a temp directory:

- Writing the same shaded tile twice produces equal zip bytes.
- A flat tile does not appear inside a partition zip. It appears in the index.
- A water tile appears in neither.
- A partition with only flat tiles has `zip: null`.

Then build one region. This is a long render. Do not start another.

```text
python -m scripts.basemap_pipeline.basemap_cli regional-pack --region western_europe --gmted-dir F:/Data/gmted2010 --work .test/basemap/world/work --output data/generated/basemap/regions/western_europe > .test/basemap/rollout/logs/western-europe.txt 2>&1
```

The work directory holds the VRT and the water cache. The output directory holds only the pack files.

Checks:

- Exit code 0.
- `basemap_pack.json.zip` lists zooms 8 and 9 only.
- No member path in any zip starts with `5/`, `6/`, or `7/`.
- Re-running with `--skip-existing` finishes without rewriting a zip whose hash still matches. Compare one zip's bytes before and after.
- Print the shaded count, the flat count, the water count, the zip count, and the total bytes. Record them. There is no required byte count. Western Europe at zooms 8 and 9 was about 7 MB of stylized WebP in the prototype before blank tiles were removed, so a total far above 30 MB for this one region is a reason to stop and ask.
- Record the camera box. It must cover longitude -8.58 to 18.31 and latitude 39.01 to 56.94. Vertex expansion may make it larger. A box that misses that span means the port of `mapExtentBoxForHexes` is wrong. Stop.
- `npm run basemap:test` still passes.
- The prototype `tiles` command is unchanged. Do not re-render `.test/basemap/western_europe/` unless a test fails because you changed `render_block`.

## Phase 4: Global Pack

Add `world_dem.py` and the `global-pack` subcommand.

```text
python -m scripts.basemap_pipeline.basemap_cli global-pack --gmted-dir F:/Data/gmted2010 --work .test/basemap/world/work --output data/generated/basemap/global > .test/basemap/rollout/logs/global.txt 2>&1
```

This builds `dem_30s.tif`, the zoom-7 weight raster, and the pack. Expect this to take hours. Log one line per zoom-3 partition so a resume is visible. `--skip-existing` must skip a finished partition.

Checks:

- The 30-arc-second Mont Blanc sample is between 1000 and 4754. Record it.
- The manifest `zoomMin` is 0 and `zoomMax` is 7.
- The key `z0_x0_y0` is present if any land tile at zooms 0–5 is shaded or flat.
- Every other key matches `z3_x{0-7}_y{0-7}`.
- No zip contains a path starting with `8/` or `9/`.
- Record the directory byte total and the largest zip. A large file is not a failure. Do not delete the pack.
- Write a zoom-3 and a zoom-5 PNG composite of the western Europe box, from the packed tiles, into `.test/basemap/rollout/global-z3.png` and `global-z5.png`. They are for the owner to look at. Record their paths.
- `npm run basemap:test` passes.

## Phase 5: Packaging

The app must ship the basemap tree as real files, not only inside the asar archive. Follow the regional JSON zips.

- `scripts/electronBuilderGeneratedFiles.cjs`: add a helper next to `buildElectronBuilderRegionalZipResource` that copies `data/generated/basemap` to `extraResources`, including `**/*.zip` and `**/*.webp`. Do not add this glob to the regional helper. The regional filter stays `data/generated/regions/**/*.json.zip`.
- `electron-builder.config.cjs`: call that helper from `files` and from `extraResources`, the same way the regional helper is called.
- `scripts/electron-builder-config.test.cjs`: assert the new glob and assert that the regional glob did not change. This file runs from `npm test` through `scripts/run-main-node-tests.cjs`. Run it on its own with `node scripts/electron-builder-config.test.cjs`. Do not use `node --test` on it. It is a plain script.
- Do not add the basemap tree to `electron-builder.ci.cjs`. That config omits the regional zips on purpose. The shipping config is `electron-builder.config.cjs`.
- `scripts/generated-data-pack-assert.cjs`: add a check, used by the existing pack-ready script, that every `basemap_pack.json.zip` on disk has the zip files and the sha256 values its manifest names, and that `land.webp` and `water.webp` exist beside it. A missing global pack is a failure only when the script is asked to require packs. `npm test` must not require the packs. `npm run generated:assert-pack-ready` requires the global pack once this phase is done, and it requires each regional pack that is present. Phase 10 is what makes a missing region pack a failure. There are 23 regions. Do not require the absent ones in this phase.

Do not point `regionPackExtract.ts` at this tree.

Checks: `node scripts/electron-builder-config.test.cjs` passes. `npm test` passes.

## Phase 6: Pack Reader

Implement `basemapPackRead.ts`, `basemapTileResolve.ts`, and `basemapPartitionExtract.ts`.

Resolution rules are the Request Path table. Lookups:

- `ancestorKey(zoom, x, y)` uses the shift formula. Zooms 0–5 use partition zoom 0, zooms 6–7 use 3, and zooms 8–9 use 5. An in-range zoom 0–5 tile is `z0_x0_y0`. A zoom-0 tile at x=1 is `z0_x1_y0`.
- The pack directory comes from the same candidate roots as `resolveGeneratedRegionsDirectory` in `src/main/terrainMetadataPaths.ts`: the test override, the repo root, the working directory, `process.resourcesPath`, and the unpacked asar path. Add `resolveBasemapRoot` beside that pattern. Do not change the region resolver.

Unpack tests use a fixture zip built in the test with fflate, in a temp directory:

- A shaded tile unpacks once. A second call does not write again when `partition.ready` matches.
- Two concurrent calls share one unpack. The test can call the function twice without an `await` between them and assert the writer ran once. Keep a test hook that counts unpacks, or derive it from a temp-directory count. Do not export a test-only global that production code branches on. A counter argument on an internal options object is fine if production passes none.
- A changed sha256 in the manifest unpacks again.
- A path with `..` is refused before any read.

One contract test opens `data/generated/basemap/global/basemap_pack.json.zip`, checks `schema` is 1, `zoomMin` is 0, and `zoomMax` is 7. This test is allowed to read that pack. It fails if the pack is missing. That is correct once Phase 4 has run.

Checks: `npm test` passes.

## Phase 7: Protocol, IPC, and the Content Security Policy

Register the scheme before the app is ready. In `src/main/main.ts`, call `protocol.registerSchemesAsPrivileged` during module setup, before `app.whenReady`:

```typescript
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'agentwars-basemap',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
```

Inside the existing `app.whenReady` callback, before the window is created, call `protocol.handle('agentwars-basemap', ...)`. The handler calls `resolveBasemapTile` and returns a `Response`. It does not unzip on its own. It does not await an unpack before `createWindow`.

`static/index.html`: in `img-src`, add `agentwars-basemap:` and remove `https://server.arcgisonline.com` and `https://*.tile.openstreetmap.org`. Leave `'self'` and `data:`. Leave `connect-src 'self'` as it is. Tile images are covered by `img-src`.

IPC, added in all three of these places. The parity tests compare the first two. The renderer typecheck uses the third.

- `IPC_GAME` in `src/shared/ipc/channels.ts`
- the copied channel object in `src/main/preload.ts`, plus an `ipcRenderer.invoke` function beside `newGameMapPreview`
- the `GameApi` methods in `src/shared/ipc/gameApiTypes.ts`

| Channel constant | Channel string | Result |
|---|---|---|
| `basemapNativeZoom` | `game:basemapNativeZoom` | `{ nativeZoom: 7 \| 9 }` |
| `basemapPrefetch` | `game:basemapPrefetch` | `{ accepted: true }` |

`basemapNativeZoom` takes a map id. It returns 9 when `data/generated/basemap/regions/<id>/basemap_pack.json.zip` exists. It returns 7 for `global`, for an unknown id, and for a region that has no pack yet. It logs a warning for an unknown id. It does not unpack.

`basemapPrefetch` is implemented in Phase 9. In this phase the handler returns `{ accepted: true }` immediately.

Handler tests, calling `resolveBasemapTile` with the fixture pack from Phase 6 and a temp user-data directory:

- A listed shaded tile returns the WebP bytes and status 200.
- An unlisted tile returns the water bytes.
- A flat listing returns the land bytes.
- `agentwars-basemap://tiles/global/0/0/../1/0.webp` is status 404 and does not read a file outside the pack.
- `agentwars-basemap://tiles/global/0/0/0.png` is status 404.
- An unknown map id is status 404.
- Zoom 8 for `global` returns the water bytes and status 200.

Checks: `npm test` passes. A source assertion, in the style of `src/main/basemapRasterCatalog.test.ts`, confirms `registerSchemesAsPrivileged` appears before `app.whenReady` in `src/main/main.ts`.

Manual, after Phase 8 has something to show: start the app, pan the world, and confirm `generated-basemap/global/` appears under the user-data directory only after the map is on screen. This phase does not require the manual check by itself.

## Phase 8: Renderer

Add `src/renderer/map/basemapLayer.ts`. It owns the tile layer and the water underlay.

- One Leaflet tile layer on the main map and one on the minimap. URL: `agentwars-basemap://tiles/${gameMapId}/{z}/{x}/{y}.webp`. `maxZoom` 16. `maxNativeZoom` is the IPC result, 7 or 9. `minZoom` 0. No `errorTileUrl`. No second provider.
- A Leaflet pane under the tiles on both maps, filled with `rgb(113, 148, 177)`. Create it with `createPane`, then move it onto the map container so the color covers the map while the map pane moves. z-index 190. `pointer-events: none`.
- Elevation-tile lines on the main map only, pane `basemapGrid`, z-index 250, above the tiles and under the overlay pane. Meridians every 30°. Parallels at ±10, ±30, ±50, ±70, and the equator. Solid at longitude 0, longitude ±180, and the equator. The other lines are dashed. Stroke `rgba(48, 56, 64, 0.15)`. `pointer-events: none`. The same filter as the tiles.
- `setMainBasemapFilter` applies `basemapCssFilterForStyle` to the tile pane and the water pane on the main map and the minimap, and to the elevation-tile pane on the main map. It still clears a filter on `#main-map`. Hex panes are not filtered.
- Attribution is the exact sentence in Settled Decisions, on the main map only. The minimap is created with attribution hidden. Leave it hidden.
- On `tileerror`, show the existing once-per-session toast. Do not swap providers. Delete the fallback loop in `mountRasterBasemap`.
- `basemapId` on all four entries in `src/renderer/rendering/terrainVisualStyles.ts` becomes `offline_hillshade`. The filter each style already carries stays. The style id is held in memory (`activeTerrainStyleId`, default `'default'`). It is not written to the database. Search for `esri_world_shaded_relief` and `osm_mapnik`. Replace the runtime uses. Do not add a compatibility map unless that search finds a stored value.
- Changing the terrain style does not remount the tiles. It only updates the filter. Add `setBasemapGameMap(gameMapId)` in `basemapLayer.ts`. It is separate from `setMainBasemapByProviderId`. All four styles share one provider id, so a provider-id check will not notice a region change. `setBasemapGameMap` tracks `gameMapId` plus `nativeZoom` and replaces both tile layers when that pair changes.
- While `isNewGameOverlayOpen()` is true, the map id is the id `refreshNewGameMapPreview` just loaded. Call the switch from `refreshNewGameMapPreview` after a preview is stored. `syncMapExtentToSnapshot` must not override that id while the overlay is open. `closeNewGameOverlayToMatch` sets the id back to `state.gameMap?.id ?? 'global'`.
- When the overlay is closed, `syncMapExtentToSnapshot` sets the id from `state.gameMap?.id ?? 'global'`.
- Ask main for `basemapNativeZoom` whenever that id changes. If the IPC call fails, use 7 and log the error.
- `src/renderer/map/initCore.ts` starts on this layer. Remove the Esri default.

Update `src/main/basemapRasterCatalog.test.ts`. It currently expects the ids `esri_world_shaded_relief` and `osm_mapnik`, every style `basemapId` to be the Esri id, and the init fallback string `initialBasemapProviderId ?? 'esri_world_shaded_relief'` in `worldLeafletMap.ts`. Point all three at `offline_hillshade` and the `agentwars-basemap:` URL. Update `src/shared/basemapStyleLogic.test.ts` only where an expected id was `esri_world_shaded_relief` or `osm_mapnik`. The filter strings stay. `basemapNeedsRemount('offline_hillshade', 'offline_hillshade')` stays false.

Remove the unused Esri and OSM entries from `basemapProvider.ts`. If a test or a saved-game field still names `esri_world_shaded_relief`, map that stored id to `offline_hillshade` when the style is loaded, so an existing local save still opens. Search for `esri_world_shaded_relief` and `osm_mapnik` and update every runtime use. Do not leave a live fallback URL.

Checks:

- `npm run lint`, the renderer typecheck the repo already uses, and `npm test`.
- Manual: `npm start`. The world map shows hillshade and blue-gray water with no network. Switch Default, Atlas, Scientific, and Wargame. Atlas stays slightly contrasted, Scientific stays gray, Wargame stays inverted, and the water layer changes with them. Open a western Europe preview and zoom in until the map is past zoom 7. The picture should get sharper, because native zoom is 9. Open a region that has no pack yet and confirm the map stays on the global tiles instead of showing errors. Save a screenshot of each style and of the western Europe zoom-in under `.test/basemap/rollout/screenshots/`.

If `npm start` cannot open a window in this environment, say so in the results file and leave the manual checks listed. Do not claim they passed.

## Phase 9: Battle Prefetch

`basemapPrefetch` takes `{ gameMapId: string; childH3Indexes: readonly string[] }`.

- If the map id is `global`, or the region pack is missing, return `{ accepted: true }` and unpack nothing.
- Otherwise compute the footprint box the way `battle_footprint` does, at the zoom-5 ancestors of the zoom-9 tiles that cover that box, and start an unpack for each key that has a zip.
- Do not await the unpacks on the IPC return. Log at debug when the set starts and when each partition finishes. A failure logs at error and does not reject the battle start.
- The same partition lock as the protocol handler. A tile request that arrives during prefetch waits for that unpack instead of starting a second one.

Call it from the renderer at the start of `enterTacticalMapView`, without awaiting. That function already receives `childTacticalH3Indexes`. Pass those indexes and the current basemap map id. Both `tacticalRendererApplyStartBattleIpcResult` and `tacticalRendererActivateRestoredBattleSnapshot` call `enterTacticalView`, which calls `enterTacticalMapView`. One call site covers a new battle and a restored battle. Do not also unpack inside `startTacticalBattleForEnclosingHex`. Two starters would race.

The minimap stays at its current max zoom of 2. It never requests zoom 8, so it must not cause a regional unpack. Do not point the minimap at a regional-only URL for low zooms. The shared URL is correct because zooms 0–7 always resolve to the global pack.

Checks:

- A unit test of the pure key function: a box over the western Europe battle footprint produces a subset of the zoom-5 keys, not the whole region.
- `src/main/rendererMapEntryConsolidation.test.ts` reads `enterTacticalMapView` as text. The function must still contain `setMaxBounds`, `setMinZoom`, `tacticalFlyMaxZoom`, and `flyToBounds` or `fitBounds`. Add the prefetch call without removing those.
- Manual: start a western Europe match, open a battle, and confirm the footprint's partition directories appear under user data. The battle view should not sit on empty tiles while they unpack. Record the log lines. If you cannot run the GUI, say so.

## Phase 10: Remaining Regional Packs

Build the other 22 regions, one at a time, with `--skip-existing`. Skip `qa`. A region whose extent crosses 180° must go through the two-box split. `australia_new_zealand` is the known case.

```text
python -m scripts.basemap_pipeline.basemap_cli regional-pack --region <id> --gmted-dir F:/Data/gmted2010 --work .test/basemap/world/work --output data/generated/basemap/regions/<id>
```

After each region, record that pack's bytes, its zip count, and its largest zip. Do not stop because a zip or the tree is large, and do not delete finished packs.

After `australia_new_zealand`:

- The camera box must cross 180° (`east` above 180, or the same flag `longitudeIntervalFromCenters` returns). If it does not, stop. The antimeridian case was not exercised.
- Both split parts must be non-empty, and each part must contain at least one zoom-8 tile listed as flat or shaded. A part that is entirely water means the land on that side of 180° was not rendered.

After all 23:

- Record the byte total and the largest zip.
- `npm run generated:assert-pack-ready` passes and now checks all 23 region packs plus global. Update the assert so a missing region pack fails. Do this at the end of this phase, not in Phase 5.

## Phase 11: Docs and Notices

Update living docs in place. Do not copy this plan into `doc/`. Do not edit `doc/devleopment-plan-v3.4.md`, `doc/poc-analysis.md`, or `doc/market-research.md`. Search `doc/` for `Esri`, `OpenStreetMap`, `arcgisonline`, and `tile.openstreetmap`.

- `doc/terrain-pipeline.md`: the sentence that says the prototype is not the match basemap becomes wrong. Say that `scripts/basemap_pipeline/` builds the match basemap into `data/generated/basemap/`, and that the app loads it through the `agentwars-basemap` protocol. Keep the runbook in `scripts/basemap_pipeline/README.md`. Link to it. Do not paste it.
- `doc/README.md`: the index row for the terrain pipeline.
- `doc/ux/terrain-legend.md`: changing Terrain style changes the filter on the same tiles, including the water under them. It does not switch tile hosts.
- `doc/ux/map-surface.md`, `doc/ux/minimap.md`, `doc/ux/notifications-and-feedback.md`, `doc/ux/reports-tab.md`: remove the remote hosts. A failed basemap tile is a local read failure. The once-per-session toast stays.
- `doc/ux/control-tooltips.md`: the Terrain style tip can keep "the map picture under them" if that is still accurate. Change it only if it names a host or a basemap swap.
- `doc/naming-conventions-contract-v1.md`: it already lists `scripts/basemap_pipeline/`. Add nothing unless you added a new Python package.
- `SECURITY.md`: the CSP sentence names Esri and OpenStreetMap. Say images load from the app, inline data, and the `agentwars-basemap` scheme.
- Root `README.md` terrain-data section: the match basemap is the generated hillshade, not a live tile server.
- `scripts/basemap_pipeline/README.md`: the commands `sources`, `regional-pack`, and `global-pack`, the output tree, and the blank-tile rule.
- `THIRD-PARTY-NOTICES.md`: a `GMTED2010` section. Say the elevation is U.S. Geological Survey public-domain data, and include the courtesy sentence. Do not edit the Natural Earth section except to keep "Made with Natural Earth." accurate. Do not edit the EarthEnv topography section. That dataset is separate even though its text mentions GMTED.
- `scripts/thirdPartyNotices/noticeCheck.cjs`: add a fixed requirement whose heading is `GMTED2010` and whose snippet is `courtesy of the U.S. Geological Survey`.

If `npm run doc:shots` regenerates images that show the basemap, run it and replace those images. If it needs a display you do not have, record that and do not invent screenshots.

Checks: `npm run notices:check` passes. `npm test` passes.

## Phase 12: Final Checks

1. `npm run basemap:test`, `npm run terrain:test`, `npm run lint`, and `npm test`.
2. `npm run generated:assert-pack-ready`.
3. `npm run dist:win`. This is slow. Confirm the unpacked resources directory in the build output contains `data/generated/basemap/global/basemap_pack.json.zip`. The exact dist folder is whatever `electron-builder` prints. Do not commit the dist output.
4. Manual: launch the packaged app. Pan the world. Confirm the first global partition directory appears under user data after the window is up, and that the main log does not show an unpack before the window is created. Zoom into western Europe past zoom 7 and open a battle. Record what you could not launch.
5. Write the results file. Set each todo in this plan's front matter to `completed` only if that phase's checks passed.

Startup acceptance: the ready callback does not await a basemap unpack, and the first global partition unpacks in under one second after the first shaded tile request. If the unpack is slower, stop and report the size of that zip. Do not change the partition scheme yourself.

## Stop Protocol

When a check fails:

1. Stop. Do not start the next phase.
2. Write the phase, the command, the output, and what you expected in the results file.
3. Leave the outputs in place. Do not delete a pack.
4. Ask the owner. Do not change this plan or loosen a check.

## Results File Template

Create `.spec/offline-basemap-rollout-results.md` with these sections:

```markdown
# Offline Basemap Rollout Results

## Environment
Python, Node, and the git status from before the work.

## Baseline
Tails of the three test commands.

## Sources
Required, present, and missing tiles. VRT sample values.

## Western Europe Pack
Shaded, flat, water, zip count, total bytes. Skip-existing result.

## Global Pack
30-arc-second Mont Blanc sample. Partition count. Largest zip. Total bytes. Composite paths.

## Regions
One row per region: bytes, zip count, largest zip. Antimeridian land tiles. Grand total.

## App Checks
Test commands, dist result, and which manual checks were actually run.

## Docs
The documents that changed.

## Observations for the Owner
Anything that looked wrong in a screenshot, and any pack or zip whose size will need a decision after the conversion.
```

## Follow-Ups (Not in This Change)

- Finer tiles for a battle on the global map, drawn from the regional packs.
- More than one render process.
- A release note.
