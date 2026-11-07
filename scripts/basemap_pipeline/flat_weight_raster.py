"""Zoom-9 flat-weight raster and its quick-look image."""

from __future__ import annotations

import logging
from pathlib import Path

from scripts.basemap_pipeline.proj_runtime import use_current_proj_data

use_current_proj_data()

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.windows import Window

from scripts.basemap_pipeline.basemap_settings import STYLIZED_STYLE, PipelineSettings
from scripts.basemap_pipeline.dem_source import read_dem_3857
from scripts.basemap_pipeline.terrain_shading import (
    crop_margin,
    flat_weight,
    row_ground_spacing_m,
    slope_degrees,
    smooth,
    surface_gradients,
)
from scripts.basemap_pipeline.web_mercator import (
    TILE_SIZE_PX,
    LonLatBox,
    TileBlock,
    TileRange,
    blocks_for_range,
    pixel_size_m,
    range_at_zoom,
    tile_bounds_3857,
    tile_range_for_box,
)
from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)


def weight_raster_range(region_box: LonLatBox, settings: PipelineSettings) -> TileRange:
    """
    Why this exists:
        Cover the low-zoom tiles at the native zoom, which is where slope is measured.
    When to use:
        Before creating the flat-weight raster.
    What to expect:
        The min-zoom tile range expanded to ``max_native_zoom``.
    """

    LOGGER.log(TRACE_LEVEL, "weight_raster_range native=%s.", settings.max_native_zoom)
    return range_at_zoom(tile_range_for_box(region_box, settings.min_zoom), settings.max_native_zoom)


def write_flat_weight_raster(
    dem_path: Path,
    region_box: LonLatBox,
    out_path: Path,
    settings: PipelineSettings,
) -> Path:
    """
    Why this exists:
        Store slope-keyed flatten weights once, then average them at coarser zooms.
    When to use:
        After the DEM mosaic exists.
    What to expect:
        An EPSG:3857 uint8 GeoTIFF with overviews. Returns ``out_path``.
    """

    LOGGER.debug("write_flat_weight_raster dem=%s out=%s.", dem_path, out_path)
    tile_range = weight_raster_range(region_box, settings)
    pixel = pixel_size_m(settings.max_native_zoom)
    left, _, _, top = tile_bounds_3857(tile_range.x_min, tile_range.y_min, tile_range.zoom)
    width = (tile_range.x_max - tile_range.x_min + 1) * TILE_SIZE_PX
    height = (tile_range.y_max - tile_range.y_min + 1) * TILE_SIZE_PX
    out_path.parent.mkdir(parents=True, exist_ok=True)
    profile = {
        "driver": "GTiff",
        "height": height,
        "width": width,
        "count": 1,
        "dtype": "uint8",
        "crs": "EPSG:3857",
        "transform": rasterio.transform.from_origin(left, top, pixel, pixel),
        "tiled": True,
        "blockxsize": 256,
        "blockysize": 256,
        "compress": "deflate",
    }
    with rasterio.open(dem_path) as dem_dataset, rasterio.open(out_path, "w", **profile) as weight_dataset:
        for block in blocks_for_range(tile_range, settings.block_tiles):
            _write_weight_block(dem_dataset, weight_dataset, block, tile_range, pixel, settings)
    with rasterio.open(out_path, "r+") as dataset:
        dataset.build_overviews([2, 4, 8, 16], Resampling.average)
    return out_path


def read_flat_weight(dataset: rasterio.DatasetReader, block: TileBlock) -> np.ndarray:
    """
    Why this exists:
        Read flatten weights for one block, averaged when the block is coarser than zoom 9.
    When to use:
        While rendering a stylized block.
    What to expect:
        Float weights from 0 to 1, shaped like the block in pixels.
    Exceptions:
        ``ValueError`` when the block is not aligned to the raster grid.
    """

    LOGGER.log(TRACE_LEVEL, "read_flat_weight zoom=%s.", block.zoom)
    left, bottom, right, top = block.bounds_3857()
    pixel = abs(dataset.res[0])
    origin_x = dataset.transform.c
    origin_y = dataset.transform.f
    window = Window(
        _aligned_offset((left - origin_x) / pixel),
        _aligned_offset((origin_y - top) / pixel),
        _aligned_offset((right - left) / pixel),
        _aligned_offset((top - bottom) / pixel),
    )
    values = dataset.read(
        1,
        window=window,
        out_shape=(block.height_px(), block.width_px()),
        resampling=Resampling.average,
    )
    return values.astype(np.float64) / 255.0


def write_flat_weight_preview(weight_path: Path, png_path: Path) -> Path:
    """
    Why this exists:
        Make the flat-weight raster easy to look at.
    When to use:
        After ``write_flat_weight_raster``.
    What to expect:
        A grayscale PNG at 1/16 resolution. Returns ``png_path``.
    """

    LOGGER.debug("write_flat_weight_preview src=%s png=%s.", weight_path, png_path)
    with rasterio.open(weight_path) as dataset:
        small = dataset.read(1, out_shape=(dataset.height // 16, dataset.width // 16))
    png_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(small).save(png_path)
    return png_path


def _write_weight_block(
    dem_dataset: rasterio.DatasetReader,
    weight_dataset: rasterio.io.DatasetWriter,
    block: TileBlock,
    tile_range: TileRange,
    pixel: float,
    settings: PipelineSettings,
) -> None:
    """
    Why this exists:
        Shade one block of slope into the weight raster.
    When to use:
        From ``write_flat_weight_raster``.
    What to expect:
        Writes uint8 weights with the halo removed. Does not build overviews.
    """

    halo = settings.halo_px
    left, bottom, right, top = block.bounds_3857()
    halo_bounds = (left - halo * pixel, bottom - halo * pixel, right + halo * pixel, top + halo * pixel)
    shape = (block.height_px() + 2 * halo, block.width_px() + 2 * halo)
    dem = read_dem_3857(dem_dataset, halo_bounds, shape, Resampling.bilinear)
    spacing = row_ground_spacing_m(top + halo * pixel, shape[0], pixel)
    rise_east, rise_north = surface_gradients(dem, spacing)
    slope = smooth(slope_degrees(rise_east, rise_north), STYLIZED_STYLE.slope_smoothing_sigma_px)
    weight = crop_margin(flat_weight(slope, STYLIZED_STYLE), halo)
    window = Window(
        (block.x_min - tile_range.x_min) * TILE_SIZE_PX,
        (block.y_min - tile_range.y_min) * TILE_SIZE_PX,
        block.width_px(),
        block.height_px(),
    )
    weight_dataset.write(np.rint(weight * 255.0).astype(np.uint8), 1, window=window)


def _aligned_offset(value: float) -> int:
    """
    Why this exists:
        Accept the tiny float error in Web Mercator edges.
    When to use:
        When turning a block bound into a raster window.
    What to expect:
        The nearest integer.
    Exceptions:
        ``ValueError`` when the value is more than 1e-4 from an integer.
    """

    rounded = round(value)
    if abs(value - rounded) > 1e-4:
        raise ValueError(f"flat-weight window offset {value} is not aligned to the raster")
    return int(rounded)
