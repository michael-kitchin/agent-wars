# Basemap pipeline

This package builds two things. The prototype commands write a one-region preview under `.test/basemap/` and are not what the match loads. The pack commands write the hillshade the app loads from `data/generated/basemap/` through the `agentwars-basemap` protocol.

## What it makes

Gray land with transparent water, in two styles. `plain` is a standard hillshade. `stylized` flattens gentle slopes, doubles the contrast of steep slopes, and applies a light blur: a Gaussian sigma of 0.375 pixels on the relief and 1 pixel on the slope used for flattening. Plain does not use that blur. Both smooth elevation along the crest (`ridge_smooth_sigma_px` is 6 pixels at the zoom being drawn) so a ridgeline stays continuous without blurring across the slope. Both use the same light, the same gray ramp, and the same relief: native slopes are doubled (`relief_exaggeration` is 2), and each coarser zoom multiplies that by `zoom_exaggeration_step` (1.2). The comparison is flattening, contrast, and that light blur.

An app that uses the tiles must draw its water color underneath the tile layer. `PREVIEW_WATER_RGB` in `basemap_settings.py` is only the color the pipeline preview and the composites use. The app's water color comes from the active map theme.

## Inputs

Natural Earth ocean and lakes come from `--data-root` (default `InputRasterSet.root` in `scripts/terrain_pipeline/config.py`).

Elevation is GMTED2010 7.5-arc-second breakline emphasis. The file name contains `bln075`. That is the finest elevation in `F:/Data`, and the statistic that keeps ridges and valleys. The median (`med075`), the mean, and the global ArcGrid `md75_grd.zip` are the same resolution and are not read. Put the GeoTIFFs in `--gmted-dir` (default `F:/Data/gmted2010`).

1. Sign in to USGS EarthExplorer (https://earthexplorer.usgs.gov, free account), or open the GMTED2010 viewer (https://topotools.cr.usgs.gov/gmted_viewer/viewer.htm).
2. Find GMTED2010 under Digital Elevation. Select the 7.5-arc-second tiles that cover the region. Western Europe needs 30°N–50°N and 50°N–70°N, each for 30°W–0° and 0°–30°E.
3. Download the breakline-emphasis statistic. Its file name contains `bln075`. Unzip it if it arrives zipped.
4. Put the `.tif` files, with any sidecar files, directly in the `--gmted-dir` folder.

Region JSON is read from `data/generated/regions/<region>/`. A `.json.zip` is read in place and is not extracted.

## Commands

Run these from the repository root, in this order. `all` runs the same sequence and stops at the first failure.

```powershell
python -m pip install -r scripts/basemap_pipeline/requirements.txt
python -m scripts.basemap_pipeline.basemap_cli validate --region western_europe --battle 831f80fffffffff
python -m scripts.basemap_pipeline.basemap_cli dem --region western_europe
python -m scripts.basemap_pipeline.basemap_cli weights --region western_europe
python -m scripts.basemap_pipeline.basemap_cli tiles --region western_europe --style plain
python -m scripts.basemap_pipeline.basemap_cli tiles --region western_europe --style stylized
python -m scripts.basemap_pipeline.basemap_cli composites --region western_europe --battle 831f80fffffffff
python -m scripts.basemap_pipeline.basemap_cli preview --region western_europe --battle 831f80fffffffff
python -m scripts.basemap_pipeline.basemap_cli report --region western_europe
python -m scripts.basemap_pipeline.basemap_cli all --region western_europe --battle 831f80fffffffff
npm run basemap:test
```

`--verbose` turns on debug logging. Progress lines are printed either way.

## Outputs

Under `.test/basemap/<region>/`:

- `work/dem_4326.tif`, `work/flat_weight_z9.tif`, `work/flat_weight_preview.png`
- `work/water_3857.wkb` and `work/water_3857.json`
- `<region>_plain.mbtiles` and `<region>_stylized.mbtiles`
- `tiles/plain/{z}/{x}/{y}.webp` and `tiles/stylized/{z}/{x}/{y}.webp`
- `composites/` for the strategic zoom and the requested battle
- `preview/index.html`
- `report.json` and `report.md`

Native tiles are zooms 5 through 9. The preview stretches zoom 9 up to zoom 12.

## Styles

`PLAIN_STYLE` and `STYLIZED_STYLE` live in `basemap_settings.py`.

Flattening uses slope, not brightness. A slope that faces away from the northwest light can be as dark as a steep slope that faces the light, so a brightness threshold would flatten the wrong ground. Slope is computed once at zoom 9, smoothed, and ramped from 2° to 5°. Lower zooms average that raster through its overviews.

Water is transparent because lossy WebP does not keep a flat blue. Flat land is gray 210 because that byte survives the same encoder. Where the flat weight is 0 and the pixel is land, the byte is exactly 210.

## MBTiles

Each archive has `metadata`, `map`, `images`, and a `tiles` view. `images` stores each distinct WebP once. `map` stores one row per tile, with the row in TMS order. The tile folders use XYZ order, which is what the preview asks Leaflet for. Fully opaque tiles are RGB WebP. Tiles with any transparency are RGBA WebP. Quality is 80 and method is 4.

## Limits

One region at a time. A region that crosses the antimeridian, or is wider than 180°, is rejected. The elevation margin stops at longitude ±180 and latitude ±90. A point past the Mercator limit stays on the edge tile. A DEM above `dem_max_pixels` (600 million) is rejected. Zooms outside 5 through 9 are not rendered.

## Licensing

Elevation: GMTED2010 courtesy of the U.S. Geological Survey. Water, coastlines, borders, and place names: Made with Natural Earth.

## Match packs

`sources` extracts one elevation member from each GMTED zip in `F:/Data/gmted2010` and writes `.test/basemap/world/work/bln075.vrt` and `dsc300.vrt`. A zip that contains `bln075` uses that member. A 7.5-arc-second zip without it uses `dsc075`. Antarctica uses `dsc300`. `regional-pack` writes zooms 8 and 9 for one region. `global-pack` writes the 30-arc-second world elevation and zooms 0 through 7.

```powershell
python -m scripts.basemap_pipeline.basemap_cli sources --gmted-dir F:/Data/gmted2010 --work .test/basemap/world/work
python -m scripts.basemap_pipeline.basemap_cli regional-pack --region western_europe --gmted-dir F:/Data/gmted2010 --work .test/basemap/world/work --output data/generated/basemap/regions/western_europe
python -m scripts.basemap_pipeline.basemap_cli global-pack --gmted-dir F:/Data/gmted2010 --work .test/basemap/world/work --output data/generated/basemap/global
```

`--skip-existing` keeps a partition whose settings hash and sources hash still match. A tile is water when every pixel has alpha 0, flat land when every pixel is opaque and gray 206 through 214, and shaded otherwise. Only shaded tiles are stored. Flat land is `land.webp` and water is `water.webp`. A tile the index does not name is water.

The tree is `data/generated/basemap/global/` and `data/generated/basemap/regions/<id>/`: `basemap_pack.json.zip`, `indexes.json.zip`, `land.webp`, `water.webp`, and one zip per partition that has shaded tiles.

## Vector documents

These commands write coastlines, the coast edge mask, and borders. They do not regenerate tiles. Water, coastlines, and the mask come from the same Natural Earth ocean and lakes the tiles use (`ne_10m_ocean.shp` and `ne_10m_lakes.shp`). Borders come from the land-boundary lines, not from country or state polygons: `ne_10m_admin_0_boundary_lines_land.shp` and `ne_10m_admin_1_states_provinces_lines.shp`. A `featurecla` containing "disputed" or "indefinite" is stored in that level's disputed group.

Coastline bands are zooms 0–3 in 360° cells, 3–5 in 30° cells, 5–7 in 10° cells, and 7 upward in 2° cells. National borders start at zoom 4 (10°, then 2°). State borders use 5° cells through zoom 9 and 1° cells after that. The mask is one 2° grid. Each zip is one compact JSON member under `data/generated/basemap/vectors/`.

```powershell
python -m scripts.basemap_pipeline.vector_cli coast --data-root F:/Data --output data/generated/basemap/vectors --work .test/basemap/vectors/work
python -m scripts.basemap_pipeline.vector_cli mask --data-root F:/Data --output data/generated/basemap/vectors --work .test/basemap/vectors/work
python -m scripts.basemap_pipeline.vector_cli borders --data-root F:/Data --output data/generated/basemap/vectors --work .test/basemap/vectors/work
python -m scripts.basemap_pipeline.vector_cli all --data-root F:/Data --output data/generated/basemap/vectors --work .test/basemap/vectors/work
```

`all` runs coast, mask, borders, and labels. The counts and the zip size are printed and written to `.test/basemap/vectors/work/report.json`. `labels` reads `ne_10m_geography_regions_polys.shp`, `ne_10m_admin_0_countries.shp`, and `ne_10m_admin_1_states_provinces.shp`, and writes `map_labels.json.zip`. Each feature's first anchor is its primary point.
