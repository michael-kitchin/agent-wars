"""Render hillshade blocks and split them into tiles."""

from __future__ import annotations

import json
import logging
import shutil
import time
from dataclasses import dataclass
from pathlib import Path

from scripts.basemap_pipeline.proj_runtime import use_current_proj_data

use_current_proj_data()

import numpy as np
import rasterio
from rasterio.enums import Resampling
from shapely.geometry.base import BaseGeometry

from scripts.basemap_pipeline.basemap_settings import BasemapStyle, OutputPaths, PipelineSettings
from scripts.basemap_pipeline.dem_source import dem_bounds_for, find_gmted_files, read_dem_3857
from scripts.basemap_pipeline.flat_weight_raster import read_flat_weight
from scripts.basemap_pipeline.region_inputs import RegionInputs
from scripts.basemap_pipeline.terrain_shading import (
    crop_margin,
    flat_illumination,
    illumination,
    land_tone,
    row_ground_spacing_m,
    smooth,
    smooth_along_ridge,
    surface_gradients,
    tone_to_gray,
    zoom_exaggeration,
)
from scripts.basemap_pipeline.tile_store import (
    MbtilesMetadata,
    MbtilesWriter,
    TileStats,
    write_tile_file,
)
from scripts.basemap_pipeline.water_coverage import load_water_geometry_3857, water_coverage
from scripts.basemap_pipeline.web_mercator import (
    TILE_SIZE_PX,
    TileBlock,
    blocks_for_range,
    pixel_size_m,
    tile_range_for_box,
)
from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class RenderContext:
    """
    Why this exists:
        Share the open rasters and water geometry across blocks.
    When to use:
        For the duration of one style's render.
    What to expect:
        ``weight_dataset`` is ``None`` for a style that does not flatten.
    """

    # Open elevation mosaic.
    dem_dataset: rasterio.DatasetReader
    # Open flat-weight raster, or ``None`` for a plain style.
    weight_dataset: rasterio.DatasetReader | None
    # Ocean and lakes in EPSG:3857.
    water_geometry_3857: BaseGeometry
    # Zoom, encoding, and halo limits.
    settings: PipelineSettings


@dataclass(frozen=True)
class TileRenderRequest:
    """
    Why this exists:
        Keep the tile command's inputs inside the parameter limit.
    When to use:
        When rendering one style.
    What to expect:
        Paths and the already loaded region. The command opens the rasters.
    """

    # Region whose box selects the tiles.
    region: RegionInputs
    # Plain or stylized recipe.
    style: BasemapStyle
    # Output locations for this region.
    paths: OutputPaths
    # Shared limits.
    settings: PipelineSettings
    # Natural Earth root.
    data_root: Path
    # Folder of GMTED median tiles, used to reject a stale mosaic.
    gmted_dir: Path


def land_with_water_alpha(gray: np.ndarray, coverage: np.ndarray) -> np.ndarray:
    """
    Why this exists:
        Keep land gray and let the caller choose the water color later.
    When to use:
        After shading and water coverage for one block.
    What to expect:
        An RGBA ``uint8`` array. Pixels with zero alpha also have zero RGB.
    """

    LOGGER.log(TRACE_LEVEL, "land_with_water_alpha shape=%s.", gray.shape)
    rgba = np.empty((*gray.shape, 4), dtype=np.uint8)
    rgba[..., 0] = gray
    rgba[..., 1] = gray
    rgba[..., 2] = gray
    alpha = np.rint(255.0 * (1.0 - coverage)).astype(np.uint8)
    rgba[..., 3] = alpha
    rgba[alpha == 0, :3] = 0
    return rgba


def render_block(
    context: RenderContext,
    block: TileBlock,
    style: BasemapStyle,
    flat_weight_values: np.ndarray | None = None,
) -> np.ndarray:
    """
    Why this exists:
        Shade one block, including the halo needed by blur and gradients.
    When to use:
        For every block of every native zoom.
    What to expect:
        An RGBA ``uint8`` array covering the block, with the halo removed.
        ``flat_weight_values``, when given, replaces the weight raster and must
        already match the block's pixel shape.
    Exceptions:
        ``ValueError`` when the style flattens terrain and neither a weight array nor a weight raster is available.
    """

    LOGGER.log(TRACE_LEVEL, "render_block zoom=%s x=%s-%s y=%s-%s.", block.zoom, block.x_min, block.x_max, block.y_min, block.y_max)
    settings = context.settings
    pixel = pixel_size_m(block.zoom)
    halo = settings.halo_px
    left, bottom, right, top = block.bounds_3857()
    halo_bounds = (left - halo * pixel, bottom - halo * pixel, right + halo * pixel, top + halo * pixel)
    shape = (block.height_px() + 2 * halo, block.width_px() + 2 * halo)
    resampling = Resampling.bilinear if block.zoom == settings.max_native_zoom else Resampling.average
    dem = read_dem_3857(context.dem_dataset, halo_bounds, shape, resampling)
    spacing = row_ground_spacing_m(top + halo * pixel, shape[0], pixel)
    rise_east, rise_north = surface_gradients(dem, spacing)
    dem = smooth_along_ridge(dem, rise_east, rise_north, style.ridge_smooth_sigma_px, style.flat_slope_deg)
    rise_east, rise_north = surface_gradients(dem, spacing)
    factor = zoom_exaggeration(block.zoom, settings.max_native_zoom, style)
    shaded = illumination(rise_east * factor, rise_north * factor, style)
    deviation = crop_margin(smooth(shaded - flat_illumination(style), style.shade_blur_sigma_px), halo)
    if flat_weight_values is not None:
        weight = flat_weight_values
    elif style.flatten_gentle_terrain:
        if context.weight_dataset is None:
            raise ValueError("style flattens terrain but no flat-weight raster is open")
        weight = read_flat_weight(context.weight_dataset, block)
    else:
        weight = np.ones(deviation.shape, dtype=np.float64)
    gray = tone_to_gray(land_tone(deviation, weight, style))
    coverage = water_coverage(
        context.water_geometry_3857,
        block.bounds_3857(),
        (block.height_px(), block.width_px()),
        settings.water_supersample,
    )
    return land_with_water_alpha(gray, coverage)


def split_block(rgba: np.ndarray, block: TileBlock):
    """
    Why this exists:
        Cut a rendered block back into individual tiles.
    When to use:
        Immediately after ``render_block``.
    What to expect:
        ``(x, y, tile)`` in row-major order. Each tile is 256 pixels.
    """

    LOGGER.log(TRACE_LEVEL, "split_block zoom=%s.", block.zoom)
    for y in range(block.y_min, block.y_max + 1):
        for x in range(block.x_min, block.x_max + 1):
            row = (y - block.y_min) * TILE_SIZE_PX
            col = (x - block.x_min) * TILE_SIZE_PX
            yield x, y, rgba[row : row + TILE_SIZE_PX, col : col + TILE_SIZE_PX]


def render_style_tiles(request: TileRenderRequest) -> TileStats:
    """
    Why this exists:
        Render one style into an MBTiles archive and an XYZ folder.
    When to use:
        After the DEM exists, and after weights exist for a flattening style.
    What to expect:
        One progress line per zoom. Returns the tile statistics.
    Exceptions:
        ``FileNotFoundError`` when a required raster is missing.
        ``ValueError`` when the weight raster or the DEM is older than its inputs.
    """

    style = request.style
    paths = request.paths
    settings = request.settings
    LOGGER.debug("render_style_tiles region=%s style=%s.", request.region.region_id, style.name)
    _require_fresh_inputs(request)
    water = load_water_geometry_3857(
        request.data_root,
        dem_bounds_for(request.region.box, settings),
        paths,
    )
    tiles_dir = paths.tiles_dir(style.name)
    if tiles_dir.exists():
        shutil.rmtree(tiles_dir)
    metadata = MbtilesMetadata(
        name=f"{request.region.region_id}_{style.name}",
        description=f"{request.region.display_name} {style.name} hillshade",
        attribution="Elevation: GMTED2010 courtesy of the U.S. Geological Survey. Water: Made with Natural Earth.",
        bounds=request.region.box,
        min_zoom=settings.min_zoom,
        max_zoom=settings.max_native_zoom,
    )
    flat_land_gray = int(tone_to_gray(np.array(style.flat_tone)))
    dem_dataset = rasterio.open(paths.dem_path)
    weight_dataset = rasterio.open(paths.weight_path) if style.flatten_gentle_terrain else None
    try:
        context = RenderContext(dem_dataset, weight_dataset, water, settings)
        with MbtilesWriter(
            paths.mbtiles_path(style.name),
            metadata,
            settings.webp_quality,
            settings.webp_method,
            flat_land_gray,
        ) as writer:
            for zoom in range(settings.min_zoom, settings.max_native_zoom + 1):
                started = time.perf_counter()
                before = writer.stats()
                tile_range = tile_range_for_box(request.region.box, zoom)
                for block in blocks_for_range(tile_range, settings.block_tiles):
                    rgba = render_block(context, block, style)
                    for x, y, tile in split_block(rgba, block):
                        encoded = writer.add_tile(zoom, x, y, tile)
                        write_tile_file(tiles_dir, zoom, x, y, encoded)
                after = writer.stats()
                _print_zoom(zoom, before, after, time.perf_counter() - started)
            stats = writer.stats()
    finally:
        dem_dataset.close()
        if weight_dataset is not None:
            weight_dataset.close()
    paths.stats_path(style.name).parent.mkdir(parents=True, exist_ok=True)
    paths.stats_path(style.name).write_text(json.dumps(stats.to_json(), indent=2), encoding="utf-8")
    return stats


def _require_fresh_inputs(request: TileRenderRequest) -> None:
    """
    Why this exists:
        Refuse to shade a mosaic or weight raster that is older than what it was built from.
    When to use:
        At the start of ``render_style_tiles``.
    What to expect:
        Returns when the DEM is current and, for a flattening style, the weights are newer than the DEM.
    Exceptions:
        ``FileNotFoundError`` or ``ValueError`` telling the operator which command to run again.
    """

    dem_path = request.paths.dem_path
    if not dem_path.is_file():
        raise FileNotFoundError("run dem first")
    sources = find_gmted_files(request.gmted_dir)
    if any(dem_path.stat().st_mtime < path.stat().st_mtime for path in sources):
        raise ValueError("run dem again")
    if not request.style.flatten_gentle_terrain:
        return
    weight_path = request.paths.weight_path
    if not weight_path.is_file():
        raise FileNotFoundError("run weights first")
    if weight_path.stat().st_mtime < dem_path.stat().st_mtime:
        raise ValueError("run weights again")


def _print_zoom(zoom: int, before: TileStats, after: TileStats, elapsed: float) -> None:
    """
    Why this exists:
        Show one progress line per zoom without waiting for the whole style.
    When to use:
        After the blocks at that zoom have been written.
    What to expect:
        A single printed line with tile counts, encoded kilobytes, and seconds.
    """

    def added(field: str) -> int:
        """
        Why this exists:
            Count what this zoom added to one statistics field.
        When to use:
            While formatting one progress line.
        What to expect:
            The difference for this zoom, or 0 when the zoom is absent.
        """

        return _zoom_value(after, field, zoom) - _zoom_value(before, field, zoom)

    encoded_kb = added("encoded_bytes") / 1000.0
    print(
        f"zoom {zoom}: tiles {added('tiles')} "
        f"flat {added('uniform_flat_land')} water {added('uniform_water')} "
        f"other {added('uniform_other')} encoded_kb {encoded_kb:.1f} seconds {elapsed:.1f}"
    )


def _zoom_value(stats: TileStats, field: str, zoom: int) -> int:
    """
    Why this exists:
        Read one zoom from a statistics mapping that may not have that zoom yet.
    When to use:
        When differencing counters around one zoom.
    What to expect:
        The integer count, or 0.
    """

    return int(getattr(stats, field).get(str(zoom), 0))
