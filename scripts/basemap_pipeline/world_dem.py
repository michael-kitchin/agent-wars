"""Build the 30-arc-second world elevation from the GMTED mosaics."""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import Affine
from rasterio.windows import Window

from scripts.basemap_pipeline.dem_source import GMTED_NODATA
from scripts.basemap_pipeline.gmted_sources import COARSE_PIXEL_DEG, REGISTRATION_SHIFT_DEG
from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)

# World grid on the GMTED pixel phase.
WORLD_WIDTH = 43200
WORLD_HEIGHT = 21600
WORLD_WEST = -180.0 - REGISTRATION_SHIFT_DEG
WORLD_NORTH = 90.0 - REGISTRATION_SHIFT_DEG
# First output row whose north edge is the Antarctica join at 70 degrees south.
ANTARCTICA_ROW = 19200
# Output rows written at once. Four times that many source rows are read.
_ROW_BLOCK = 64


def build_world_dem(fine_vrt: Path, coarse_vrt: Path, destination: Path) -> Path:
    """
    Why this exists:
        Give global zooms one elevation raster instead of hundreds of tiles.
    When to use:
        After ``bln075.vrt`` and ``dsc300.vrt`` exist.
    What to expect:
        A tiled int16 GeoTIFF. North of 70 degrees south is the 4 by 4 mean of the
        7.5-arc-second mosaic. Antarctica is copied from the 30-arc-second mosaic.
        Overviews cover zooms below the native spacing.
    Exceptions:
        ``ValueError`` when a mosaic origin is not on the world grid.
    """

    LOGGER.debug("build_world_dem fine=%s coarse=%s dest=%s.", fine_vrt, coarse_vrt, destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    transform = Affine(COARSE_PIXEL_DEG, 0.0, WORLD_WEST, 0.0, -COARSE_PIXEL_DEG, WORLD_NORTH)
    profile = {
        "driver": "GTiff",
        "width": WORLD_WIDTH,
        "height": WORLD_HEIGHT,
        "count": 1,
        "dtype": "int16",
        "crs": "EPSG:4326",
        "transform": transform,
        "nodata": GMTED_NODATA,
        "tiled": True,
        "blockxsize": 256,
        "blockysize": 256,
        "compress": "deflate",
        "BIGTIFF": "YES",
    }
    with rasterio.open(fine_vrt) as fine, rasterio.open(coarse_vrt) as coarse, rasterio.open(destination, "w", **profile) as output:
        _require_origin(fine, WORLD_WEST, WORLD_NORTH)
        _require_origin(coarse, WORLD_WEST, WORLD_NORTH - 160.0)
        for row in range(0, ANTARCTICA_ROW, _ROW_BLOCK):
            height = min(_ROW_BLOCK, ANTARCTICA_ROW - row)
            _write_averaged(fine, output, row, height)
            print(f"world elevation rows {row + height}/{WORLD_HEIGHT}", flush=True)
        for row in range(ANTARCTICA_ROW, WORLD_HEIGHT, _ROW_BLOCK):
            height = min(_ROW_BLOCK, WORLD_HEIGHT - row)
            _write_copied(coarse, output, row, height)
            print(f"world elevation rows {row + height}/{WORLD_HEIGHT}", flush=True)
    with rasterio.open(destination, "r+") as dataset:
        dataset.build_overviews([2, 4, 8, 16, 32, 64], Resampling.average)
    return destination


def sample_elevation(path: Path, lon: float, lat: float) -> int:
    """
    Why this exists:
        Check one known summit or plain after a mosaic is written.
    When to use:
        From the sources and global-pack commands.
    What to expect:
        The integer sample at that longitude and latitude. Nodata stays -32768.
    """

    LOGGER.log(TRACE_LEVEL, "sample_elevation path=%s lon=%s lat=%s.", path, lon, lat)
    with rasterio.open(path) as dataset:
        row, column = dataset.index(lon, lat)
        return int(dataset.read(1, window=Window(column, row, 1, 1))[0, 0])


def _write_averaged(source, output, row: int, height: int) -> None:
    """
    Why this exists:
        Turn 7.5-arc-second samples into 30-arc-second samples.
    When to use:
        For output rows north of the Antarctica join.
    What to expect:
        Each output pixel is the mean of the 16 source pixels that cover it, ignoring nodata.
    """

    window = Window(0, row * 4, WORLD_WIDTH * 4, height * 4)
    raw = source.read(1, window=window).astype(np.float32)
    raw[raw == GMTED_NODATA] = np.nan
    grouped = raw.reshape(height, 4, WORLD_WIDTH, 4)
    with np.errstate(invalid="ignore"):
        mean = np.nanmean(grouped, axis=(1, 3))
    filled = np.where(np.isnan(mean), GMTED_NODATA, np.rint(mean)).astype(np.int16)
    output.write(filled, 1, window=Window(0, row, WORLD_WIDTH, height))


def _write_copied(source, output, row: int, height: int) -> None:
    """
    Why this exists:
        Copy Antarctica without averaging it a second time.
    When to use:
        For output rows at and south of 70 degrees south.
    What to expect:
        The same pixels as the 30-arc-second mosaic.
    """

    local = row - ANTARCTICA_ROW
    values = source.read(1, window=Window(0, local, WORLD_WIDTH, height))
    output.write(values, 1, window=Window(0, row, WORLD_WIDTH, height))


def _require_origin(dataset, west: float, north: float) -> None:
    """
    Why this exists:
        A shifted mosaic would split the 4 by 4 blocks.
    When to use:
        Before the first read of each mosaic.
    What to expect:
        Returns when the upper-left corner matches.
    Exceptions:
        ``ValueError`` naming the actual origin.
    """

    origin_x = float(dataset.transform.c)
    origin_y = float(dataset.transform.f)
    if abs(origin_x - west) > 1e-8 or abs(origin_y - north) > 1e-8:
        raise ValueError(f"mosaic origin {origin_x}, {origin_y} is not {west}, {north}")
