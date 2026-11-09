# Regional Basemap Prototype Results

## Current pictures

The files under `.test/basemap/western_europe/` were regenerated after the median run recorded below. They use the four `bln075` GeoTIFFs, the breakline-emphasis statistic on the same 7.5-arc-second grid. `F:/Data` has no finer elevation. WorldClim is climate, the islands package is vectors, and `md75_grd.zip` is the global median ArcGrid at this same resolution. Samples on that mosaic: Rhine plain 168, Beauce 143, Feldberg 1493, Mont Blanc 4754, Biscay 0.

`relief_exaggeration` is 2 on both styles, so native-zoom slopes are doubled and each coarser zoom still multiplies by 1.2. Stylized relief blur is a Gaussian sigma of 0.375 pixels, and the slope used for flattening is smoothed by 1 pixel. Both styles also smooth elevation along the crest by 6 pixels at the zoom being drawn, and leave the slope across the crest alone. The latest pass rewrote both tile sets, the composites, and the preview. Stylized unique bytes are 29.1% larger than plain, and stylized zoom 9 has 2 uniform flat-land tiles. The size table is `report.md` in that folder.

The strategic zoom-6 composites and the battle `831f80fffffffff` zoom-9 composites were rewritten, with and without outlines, and so was `preview/index.html`.

## Environment

Python 3.13.3. numpy 2.3.3, rasterio 1.5.0, shapely 2.1.2, h3 4.4.2, pyproj 3.7.2, scipy 1.18.1, Pillow 11.3.0, libwebp 1.5.0, WebP support true. scipy was the only new package. The terrain, weather, and regional suites were already green before it was installed.

h3 4.4.2 reproduces the footprint used here: 607 cells and 343 core cells with the battle hex and its neighbors, and 343 core cells for the hex alone.

The process inherits `PROJ_LIB` from an older PostGIS database (layout minor 2). GDAL in rasterio rejects that database, and pyproj's own database is layout minor 4, which this GDAL also rejects. Before rasterio starts, the pipeline points `PROJ_LIB` and `PROJ_DATA` at rasterio's database (layout minor 6) when the inherited one is older. pyproj keeps using its own data. A current inherited database is left alone.

GMTED files used, each 276,634,079 bytes:

- `F:/Data/gmted2010/30n030w_20101117_gmted_med075.tif`
- `F:/Data/gmted2010/30n000e_20101117_gmted_med075.tif`
- `F:/Data/gmted2010/50n030w_20101117_gmted_med075.tif`
- `F:/Data/gmted2010/50n000e_20101117_gmted_med075.tif`

They were extracted from the matching `GMTED2010N*_075.zip` archives in that folder. The global median grid `md75_grd.zip` (2,932,412,226 bytes) is also there. This section describes that first median render. The pictures now on disk use `bln075`, recorded under Current pictures.

Before this work, `git status --short` listed only `.spec/regional-basemap-prototype-execution-plan.md` (untracked). Baseline suites: terrain 71 tests OK, weather 2 tests OK, regional 44 tests OK.

## Validate Output

```
region id: western_europe
res_s: 3
res_t: 6
land: 117
neutral_border: 90
sea: 39
region box: -8.576452,39.009320,18.306518,56.943588
zoom 5: x 15-17 y 9-12 tiles 12
zoom 6: x 30-35 y 19-24 tiles 36
zoom 7: x 60-70 y 39-48 tiles 110
zoom 8: x 121-141 y 78-97 tiles 420
zoom 9: x 243-282 y 157-195 tiles 1560
total tiles: 2138
strategic composite: 1225 by 1238
dem bounds: -12.250000,30.952162,23.500000,62.606396
dem pixels: 260746200
gmted coverage: ok
shapefiles: ok
battle 831f80fffffffff: role land cells 607 core 343 box 5.743982,47.240754,8.098804,48.721065 crop 858 by 806 pad 898 by 846
terrain 831f80fffffffff: forest 293 plains 280 desert 20 mountain 14
```

These match the measured extents and counts. `validate --battle 8928308280fffff` exits 2 with `battle hex 8928308280fffff is not on the map`. `validate --region no_such_region` exits 2 and names both the missing json file and the missing zip.

## DEM

Fresh mosaic, 31.2 seconds:

```
crs GEOGCS["WGS 84", ...] res (0.0020833333333333333, 0.0020833333333333333) size 17161 15195 nodata -32768.0
bounds BoundingBox(left=-12.25013888888889, bottom=30.951944444444443, right=23.50194444444444, top=62.60819444444444)
rhine_plain 165 OK
beauce 140 OK
feldberg 1481 OK
mont_blanc 4713 OK
biscay 0
```

The bounds contain west -12.25, south 30.952162, east 23.5, north 62.606396. Open-ocean Biscay is 0, which is sea level in this mosaic. All four land samples fall inside the published bands.

## Flat Weights

88.5 seconds on the fresh run.

```
size 12288 16384 res (305.748113140705, 305.748113140705) overviews [2, 4, 8, 16]
alps_eiger max 255 mean 255.0
vosges_hohneck max 255 mean 255.0
rhine_plain max 0 mean 0.0
beauce max 0 mean 0.0
share zero 0.662 share full 0.075
```

The preview shows the Alps, Pyrenees, Apennines, Scottish Highlands, Norway, and the Atlas as bright. The Paris basin, the North German plain, and the Rhine valley floor are dark. Ocean is dark as well, because missing elevation is treated as sea level before the slope is measured.

## Water

First sample run printed `water geometry: built`. The immediate repeat printed `water geometry: cached`. Both gave biscay 1.0, lake_geneva 1.0, rhine_plain 0.0. The fresh tile run printed `water geometry: built` for plain and `water geometry: cached` for stylized.

## Tiles

Per zoom on the fresh run. Encoded kilobytes match the earlier render exactly.

Plain, about 117 seconds of zoom time:

```
zoom 5: tiles 12 flat 0 water 0 other 0 encoded_kb 53.7
zoom 6: tiles 36 flat 0 water 1 other 0 encoded_kb 141.1
zoom 7: tiles 110 flat 0 water 11 other 0 encoded_kb 404.4
zoom 8: tiles 420 flat 0 water 79 other 0 encoded_kb 1473.3
zoom 9: tiles 1560 flat 0 water 402 other 0 encoded_kb 4546.8
```

Stylized:

```
zoom 5: tiles 12 flat 0 water 0 other 0 encoded_kb 40.8
zoom 6: tiles 36 flat 0 water 1 other 0 encoded_kb 94.0
zoom 7: tiles 110 flat 0 water 11 other 0 encoded_kb 240.3
zoom 8: tiles 420 flat 0 water 79 other 0 encoded_kb 855.9
zoom 9: tiles 1560 flat 12 water 402 other 0 encoded_kb 2840.3
```

Each style has 2,138 MBTiles rows and 2,138 `.webp` files. Plain has 1,646 unique images. Stylized has 1,635.

Spot check: biscay is transparent in both styles, and the Eiger tile is varied in both. Stylized has 12 uniform flat-land tiles, all at zoom 9. Plain has none.

Seams, both styles:

```
plain block seams 93 4.493 tile seams 816 3.874 ratio 1.16
stylized block seams 93 3.266 tile seams 816 2.694 ratio 1.212
```

Both ratios are under 1.5.

## Composites

Eight PNG files. No clamp note. Strategic pictures are 1,225 by 1,238. Battle pictures are 898 by 846. Two hundred random pixels per picture, seed 7, mismatched 0.

```
plain flat_mean_offset 1.5 flat_exact_share 0.494 steep_std 20.16
stylized flat_mean_offset 0.48 flat_exact_share 0.897 steep_std 27.13
```

The stylized Rhine floor is flatter: 89.7% of the flat cells are exactly gray 210, against 49.4% in the plain picture, and the mean distance from 210 drops from 1.50 to 0.48. Steep cells spread more under the stylized contrast (standard deviation 27.13 against 20.16).

The strategic stylized picture reads as quiet lowlands with the Alps, Pyrenees, Massif Central, and Apennines still clear. Coasts and Lake Geneva look smooth. The battle pictures show the Vosges on the west of the Rhine and the Black Forest on the east. The stylized valley floor is quieter than the plain one, and the two ranges stay the strong relief. Fine grain remains on the valley floor at zoom 9.

## Report

```
# Basemap size report

| Style | Zoom | Tiles | Uniform flat land | Uniform water | Encoded KB | Average KB |
| --- | --- | --- | --- | --- | --- | --- |
| plain | 5 | 12 | 0 | 0 | 53.7 | 4.5 |
| plain | 6 | 36 | 0 | 1 | 141.1 | 3.9 |
| plain | 7 | 110 | 0 | 11 | 404.4 | 3.7 |
| plain | 8 | 420 | 0 | 79 | 1473.3 | 3.5 |
| plain | 9 | 1560 | 0 | 402 | 4546.8 | 2.9 |
| plain | total | 2138 | 0 | 493 | 6619.2 |  |
| stylized | 5 | 12 | 0 | 0 | 40.8 | 3.4 |
| stylized | 6 | 36 | 0 | 1 | 94.0 | 2.6 |
| stylized | 7 | 110 | 0 | 11 | 240.3 | 2.2 |
| stylized | 8 | 420 | 0 | 79 | 855.9 | 2.0 |
| stylized | 9 | 1560 | 12 | 402 | 2840.3 | 1.8 |
| stylized | total | 2138 | 12 | 493 | 4071.2 |  |

Stylized versus plain unique bytes: -39.2%.
```

Each style's per-zoom tiles sum to 2,138. Unique bytes are 6,509,976 plain and 3,960,004 stylized. The predicted saving was about 35%. The measured saving is 39.2%. `node --check` on `overlays.js` passed, and the preview's Leaflet script was found.

## Clean Re-Run

The earlier output was moved to `.test/basemap/western_europe-first-run`. `all --region western_europe --battle 831f80fffffffff` then rebuilt `.test/basemap/western_europe` in 407.1 seconds and exited 0. The report comparison printed `identical` (archive byte size excluded). Tile, seam, composite, and preview checks passed again on the fresh folder, with the same seam ratios and the same composite tone numbers.

## Tests

`npm run basemap:test`: 19 tests, OK.

Re-run against the baselines: terrain 71 OK, weather 2 OK, regional 44 OK. Same counts, no new failures.

## Changed Files

```
 M package.json
 M scripts/terrain_pipeline/README.md
?? .spec/regional-basemap-prototype-execution-plan.md
?? .spec/regional-basemap-prototype-results.md
?? scripts/basemap_pipeline/
```

The execution plan was already untracked before this work. `.test/` is gitignored.

## Docs

Checked the index in `doc/README.md`, `doc/terrain-pipeline.md`, `doc/ux-specification.md`, and `THIRD-PARTY-NOTICES.md`. The UX documents and the notices file stay as they are: the app still draws the tile-server basemap, and the GMTED credit waits until tiles ship. `doc/terrain-pipeline.md`, the index, and the naming contract name this prototype and say it is not loaded by the app. The terrain document names the breakline-emphasis GeoTIFFs. Pillow and scipy are Python tools for this prototype, not npm runtime dependencies. `package.json` gained `basemap:test`, and the terrain pipeline README gained one pointer to the prototype README.

## Observations for the Owner

Flattening does what it was meant to do on this battle: most of the Rhine floor becomes gray 210, and the Vosges and Black Forest get stronger contrast. The size result is better than the 35% estimate. Zoom 9 still shows fine texture on the valley floor, so a slightly higher flat-slope cutoff or a little more slope smoothing would quiet it further if that texture is unwanted. Block seams are a bit stronger than ordinary tile seams (ratios 1.16 and 1.21) but stay inside the 1.5 limit.

The recorded comparisons, which were not pass/fail gates, all came out in the expected direction: stylized flat-land tiles are more numerous, the flat mean offset is smaller, the exact-gray share is larger, and the steep standard deviation is larger.

## Follow-Ups (Not in This Change)

App integration through a custom protocol, with water drawn under the tile layer. Global zooms 0 to 7. The other regions. Removing the Esri and OpenStreetMap providers. The GMTED notice in THIRD-PARTY-NOTICES.md when tiles ship.
