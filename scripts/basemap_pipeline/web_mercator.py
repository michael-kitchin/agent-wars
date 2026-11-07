"""Web Mercator tile and pixel math for the basemap prototype."""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import Final

from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)

# WGS84 sphere radius used by Web Mercator, in metres.
EARTH_RADIUS_M: Final = 6378137.0
# Half the width of the Web Mercator world, in metres.
ORIGIN_SHIFT_M: Final = math.pi * EARTH_RADIUS_M
# Pixels on one side of a tile.
TILE_SIZE_PX: Final = 256
# Latitude where Web Mercator stops, in degrees.
MAX_MERCATOR_LAT_DEG: Final = 85.0511287798066


@dataclass(frozen=True)
class LonLatBox:
    """
    Why this exists:
        Carry a longitude/latitude rectangle without confusing axis order.
    When to use:
        For a region, a DEM clip, or a composite crop.
    What to expect:
        Degrees. West and south are the minimums. Nothing is clamped here.
    """

    # Western edge, in degrees.
    west: float
    # Southern edge, in degrees.
    south: float
    # Eastern edge, in degrees.
    east: float
    # Northern edge, in degrees.
    north: float


@dataclass(frozen=True)
class TileRange:
    """
    Why this exists:
        Name the inclusive XYZ tiles that cover a rectangle at one zoom.
    When to use:
        Before rendering or counting tiles.
    What to expect:
        ``x_max`` and ``y_max`` are inclusive. Y increases south.
    """

    # Tile zoom.
    zoom: int
    # Western tile column, inclusive.
    x_min: int
    # Eastern tile column, inclusive.
    x_max: int
    # Northern tile row, inclusive.
    y_min: int
    # Southern tile row, inclusive.
    y_max: int

    def tile_count(self) -> int:
        """
        Why this exists:
            Report how many tiles the range contains.
        When to use:
            In validation output and tests.
        What to expect:
            The product of the inclusive column count and row count.
        """

        count = (self.x_max - self.x_min + 1) * (self.y_max - self.y_min + 1)
        LOGGER.log(TRACE_LEVEL, "tile_count zoom=%s count=%s.", self.zoom, count)
        return count


@dataclass(frozen=True)
class TileBlock:
    """
    Why this exists:
        Render and shade a small group of tiles together.
    When to use:
        When walking a tile range in blocks.
    What to expect:
        Inclusive tile indexes. Pixel size follows ``TILE_SIZE_PX``.
    """

    # Tile zoom.
    zoom: int
    # Western tile column, inclusive.
    x_min: int
    # Eastern tile column, inclusive.
    x_max: int
    # Northern tile row, inclusive.
    y_min: int
    # Southern tile row, inclusive.
    y_max: int

    def width_px(self) -> int:
        """
        Why this exists:
            Size a block image in pixels.
        When to use:
            When allocating a render buffer.
        What to expect:
            Width of the inclusive tile columns, in pixels.
        """

        width = (self.x_max - self.x_min + 1) * TILE_SIZE_PX
        LOGGER.log(TRACE_LEVEL, "width_px zoom=%s width=%s.", self.zoom, width)
        return width

    def height_px(self) -> int:
        """
        Why this exists:
            Size a block image in pixels.
        When to use:
            When allocating a render buffer.
        What to expect:
            Height of the inclusive tile rows, in pixels.
        """

        height = (self.y_max - self.y_min + 1) * TILE_SIZE_PX
        LOGGER.log(TRACE_LEVEL, "height_px zoom=%s height=%s.", self.zoom, height)
        return height

    def bounds_3857(self) -> tuple[float, float, float, float]:
        """
        Why this exists:
            Give rasterio a Web Mercator window for this block.
        When to use:
            When reading elevation or sampling water for the block.
        What to expect:
            ``(left, bottom, right, top)`` in EPSG:3857 metres.
        """

        left, _, _, top = tile_bounds_3857(self.x_min, self.y_min, self.zoom)
        _, bottom, right, _ = tile_bounds_3857(self.x_max, self.y_max, self.zoom)
        LOGGER.log(TRACE_LEVEL, "bounds_3857 zoom=%s left=%s bottom=%s right=%s top=%s.", self.zoom, left, bottom, right, top)
        return left, bottom, right, top


def pixel_size_m(zoom: int) -> float:
    """
    Why this exists:
        Convert a zoom into the ground size of one Web Mercator pixel at the equator.
    When to use:
        When spacing elevation samples or sizing the flat-weight raster.
    What to expect:
        Metres per pixel. The same value applies in both axes before latitude scaling.
    """

    size = 2.0 * ORIGIN_SHIFT_M / (TILE_SIZE_PX * 2**zoom)
    LOGGER.log(TRACE_LEVEL, "pixel_size_m zoom=%s size=%s.", zoom, size)
    return size


def global_pixel(lon: float, lat: float, zoom: int) -> tuple[float, float]:
    """
    Why this exists:
        Place a longitude and latitude on the world pixel grid.
    When to use:
        When cropping a composite or projecting a hex vertex.
    What to expect:
        Floating pixel coordinates. Latitude is clamped to the Mercator limit. Y increases south.
    """

    lat = max(min(lat, MAX_MERCATOR_LAT_DEG), -MAX_MERCATOR_LAT_DEG)
    world = TILE_SIZE_PX * 2**zoom
    x = (lon + 180.0) / 360.0 * world
    y = (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * world
    LOGGER.log(TRACE_LEVEL, "global_pixel lon=%s lat=%s zoom=%s.", lon, lat, zoom)
    return x, y


def lonlat_to_tile(lon: float, lat: float, zoom: int) -> tuple[int, int]:
    """
    Why this exists:
        Find the XYZ tile that contains a point.
    When to use:
        When ranging a box or sampling one location in a tile archive.
    What to expect:
        Column and row clamped to the zoom's last tile.
    """

    x, y = global_pixel(lon, lat, zoom)
    last = 2**zoom - 1
    # Floor division of a tiny negative pixel is -1, which is not a tile.
    tile = _clamp_tile_index(x, last), _clamp_tile_index(y, last)
    LOGGER.log(TRACE_LEVEL, "lonlat_to_tile lon=%s lat=%s zoom=%s tile=%s.", lon, lat, zoom, tile)
    return tile


def tile_range_for_box(box: LonLatBox, zoom: int) -> TileRange:
    """
    Why this exists:
        Cover a longitude/latitude box with inclusive tiles.
    When to use:
        When choosing which tiles to render for a region.
    What to expect:
        The tiles touched by the northwest and southeast corners.
    Exceptions:
        ``ValueError`` when the box is inverted or crosses the antimeridian.
    """

    x_min, y_min = lonlat_to_tile(box.west, box.north, zoom)
    x_max, y_max = lonlat_to_tile(box.east, box.south, zoom)
    if box.west > box.east or box.south > box.north or x_min > x_max or y_min > y_max:
        raise ValueError("tile range is empty; the box is inverted or crosses the antimeridian")
    LOGGER.log(TRACE_LEVEL, "tile_range_for_box zoom=%s x=%s-%s y=%s-%s.", zoom, x_min, x_max, y_min, y_max)
    return TileRange(zoom, x_min, x_max, y_min, y_max)


def tile_bounds_3857(x: int, y: int, zoom: int) -> tuple[float, float, float, float]:
    """
    Why this exists:
        Convert one XYZ tile into a Web Mercator rectangle.
    When to use:
        When reading rasters for a tile or a block.
    What to expect:
        ``(left, bottom, right, top)`` in metres.
    """

    span = 2.0 * ORIGIN_SHIFT_M / 2**zoom
    left = -ORIGIN_SHIFT_M + x * span
    top = ORIGIN_SHIFT_M - y * span
    LOGGER.log(TRACE_LEVEL, "tile_bounds_3857 x=%s y=%s zoom=%s.", x, y, zoom)
    return left, top - span, left + span, top


def tms_row(y: int, zoom: int) -> int:
    """
    Why this exists:
        Store XYZ rows in an MBTiles file, which counts rows from the south.
    When to use:
        When inserting or selecting a tile.
    What to expect:
        The TMS row for an XYZ row at this zoom.
    """

    row = (2**zoom - 1) - y
    LOGGER.log(TRACE_LEVEL, "tms_row y=%s zoom=%s row=%s.", y, zoom, row)
    return row


def latitude_of_y(y_m: float) -> float:
    """
    Why this exists:
        Turn a Web Mercator northing back into latitude.
    When to use:
        When describing the geographic box of a tile range.
    What to expect:
        Latitude in degrees.
    """

    latitude = math.degrees(math.atan(math.sinh(y_m / EARTH_RADIUS_M)))
    LOGGER.log(TRACE_LEVEL, "latitude_of_y y_m=%s latitude=%s.", y_m, latitude)
    return latitude


def box_of_tile_range(tile_range: TileRange) -> LonLatBox:
    """
    Why this exists:
        Recover the geographic rectangle covered by a tile range.
    When to use:
        When padding a DEM beyond the region box but inside the rendered tiles.
    What to expect:
        The outer edges of the inclusive tiles.
    """

    left, _, _, top = tile_bounds_3857(tile_range.x_min, tile_range.y_min, tile_range.zoom)
    _, bottom, right, _ = tile_bounds_3857(tile_range.x_max, tile_range.y_max, tile_range.zoom)
    box = LonLatBox(
        west=left / ORIGIN_SHIFT_M * 180.0,
        south=latitude_of_y(bottom),
        east=right / ORIGIN_SHIFT_M * 180.0,
        north=latitude_of_y(top),
    )
    LOGGER.log(TRACE_LEVEL, "box_of_tile_range zoom=%s west=%s south=%s east=%s north=%s.", tile_range.zoom, box.west, box.south, box.east, box.north)
    return box


def range_at_zoom(tile_range: TileRange, zoom: int) -> TileRange:
    """
    Why this exists:
        Express a coarse tile range as the fine tiles that exactly cover it.
    When to use:
        When the flat-weight raster is built at the native zoom from the low-zoom range.
    What to expect:
        An inclusive range at ``zoom``.
    Exceptions:
        ``ValueError`` when ``zoom`` is below ``tile_range.zoom``.
    """

    if zoom < tile_range.zoom:
        raise ValueError(f"zoom {zoom} is below {tile_range.zoom}")
    factor = 2 ** (zoom - tile_range.zoom)
    scaled = TileRange(
        zoom,
        tile_range.x_min * factor,
        (tile_range.x_max + 1) * factor - 1,
        tile_range.y_min * factor,
        (tile_range.y_max + 1) * factor - 1,
    )
    LOGGER.log(TRACE_LEVEL, "range_at_zoom from=%s to=%s.", tile_range.zoom, zoom)
    return scaled


def blocks_for_range(tile_range: TileRange, block_tiles: int) -> list[TileBlock]:
    """
    Why this exists:
        Split a tile range into blocks that cover every tile once.
    When to use:
        When rendering or writing the flat-weight raster.
    What to expect:
        Row-major blocks. Edge blocks may be smaller than ``block_tiles``.
    Exceptions:
        ``ValueError`` when ``block_tiles`` is below 1.
    """

    if block_tiles < 1:
        raise ValueError("block size must be at least one tile")

    blocks = [
        TileBlock(
            tile_range.zoom,
            x0,
            min(x0 + block_tiles - 1, tile_range.x_max),
            y0,
            min(y0 + block_tiles - 1, tile_range.y_max),
        )
        for y0 in range(tile_range.y_min, tile_range.y_max + 1, block_tiles)
        for x0 in range(tile_range.x_min, tile_range.x_max + 1, block_tiles)
    ]
    LOGGER.log(TRACE_LEVEL, "blocks_for_range zoom=%s blocks=%s.", tile_range.zoom, len(blocks))
    return blocks


def _clamp_tile_index(pixel: float, last: int) -> int:
    """
    Why this exists:
        Keep a pixel that falls just outside the world square on a real tile.
    When to use:
        From ``lonlat_to_tile`` after converting longitude and latitude.
    What to expect:
        An index from 0 through ``last``.
    """

    return min(max(int(pixel // TILE_SIZE_PX), 0), last)
