"""GMTED discovery and the regional elevation mosaic."""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from scripts.basemap_pipeline.proj_runtime import use_current_proj_data

use_current_proj_data()

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.errors import CRSError
from rasterio.merge import merge
from rasterio.warp import reproject

from scripts.basemap_pipeline.basemap_settings import GMTED_FILE_MARKER, PipelineSettings
from scripts.basemap_pipeline.web_mercator import LonLatBox, box_of_tile_range, tile_range_for_box
from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)

# GMTED2010 7.5-arc-second spacing, in degrees.
GMTED_PIXEL_DEG: Final = 1.0 / 480.0
# Nodata value stored in GMTED integer tiles.
GMTED_NODATA: Final = -32768
# Sample spacing for the coverage check, in degrees.
_COVERAGE_STEP_DEG: Final = 0.25
# A sample this close to a tile edge still counts as covered, in degrees.
_COVERAGE_TOLERANCE_DEG: Final = 0.01


@dataclass(frozen=True)
class GmtedFileInfo:
    """
    Why this exists:
        Remember a checked GMTED tile's path, box, and grid origin.
    When to use:
        After ``describe_gmted_file``, before mosaicking.
    What to expect:
        The origin is the raster's upper-left corner, in degrees.
    """

    # Path of the GeoTIFF.
    path: Path
    # Geographic bounds of the tile.
    box: LonLatBox
    # Upper-left longitude, in degrees.
    origin_x: float
    # Upper-left latitude, in degrees.
    origin_y: float


def find_gmted_files(gmted_dir: Path) -> list[Path]:
    """
    Why this exists:
        Collect the median 7.5-arc-second tiles in a folder.
    When to use:
        Before describing or mosaicking elevation.
    What to expect:
        Sorted ``.tif`` paths whose names contain the median marker.
    Exceptions:
        ``FileNotFoundError`` when the folder has none.
    """

    LOGGER.debug("find_gmted_files dir=%s.", gmted_dir)
    paths = sorted(
        path
        for path in gmted_dir.glob("*.tif")
        if GMTED_FILE_MARKER in path.name.lower()
    )
    if not paths:
        raise FileNotFoundError(f"no GMTED median tiles in {gmted_dir}")
    return paths


def describe_gmted_file(path: Path) -> GmtedFileInfo:
    """
    Why this exists:
        Reject a tile that is not the expected GMTED median grid.
    When to use:
        On every file ``find_gmted_files`` returns.
    What to expect:
        A description with the file's bounds and upper-left origin.
    Exceptions:
        ``ValueError`` naming the file when the CRS, spacing, dtype, band count, or nodata differs.
    """

    LOGGER.debug("describe_gmted_file path=%s.", path)
    with rasterio.open(path) as dataset:
        try:
            crs_ok = dataset.crs is not None and dataset.crs.equals(CRS.from_epsg(4326))
        except CRSError:
            crs_ok = False
        spacing_ok = (
            abs(dataset.res[0] - GMTED_PIXEL_DEG) <= 1e-9 and abs(dataset.res[1] - GMTED_PIXEL_DEG) <= 1e-9
        )
        nodata_ok = dataset.nodata is not None and float(dataset.nodata) == float(GMTED_NODATA)
        if not crs_ok or not spacing_ok or dataset.dtypes[0] != "int16" or dataset.count != 1 or not nodata_ok:
            raise ValueError(
                f"{path} is not an EPSG:4326 int16 GMTED median tile "
                f"(crs={dataset.crs}, res={dataset.res}, dtype={dataset.dtypes}, "
                f"bands={dataset.count}, nodata={dataset.nodata})"
            )
        bounds = dataset.bounds
        return GmtedFileInfo(
            path=path,
            box=LonLatBox(bounds.left, bounds.bottom, bounds.right, bounds.top),
            origin_x=float(dataset.transform.c),
            origin_y=float(dataset.transform.f),
        )


def dem_bounds_for(region_box: LonLatBox, settings: PipelineSettings) -> LonLatBox:
    """
    Why this exists:
        Cover every rendered tile, plus a margin so slopes at the edge have neighbors.
    When to use:
        Before checking GMTED coverage or building the mosaic.
    What to expect:
        The low-zoom tile range expanded by ``dem_margin_deg`` on every side,
        stopped at longitude ±180 and latitude ±90.
    """

    LOGGER.log(TRACE_LEVEL, "dem_bounds_for margin=%s.", settings.dem_margin_deg)
    covered = box_of_tile_range(tile_range_for_box(region_box, settings.min_zoom))
    margin = settings.dem_margin_deg
    return LonLatBox(
        max(-180.0, covered.west - margin),
        max(-90.0, covered.south - margin),
        min(180.0, covered.east + margin),
        min(90.0, covered.north + margin),
    )


def dem_pixel_count(bounds: LonLatBox) -> int:
    """
    Why this exists:
        Estimate the mosaic size before allocating it.
    When to use:
        From the size guard.
    What to expect:
        Width times height after rounding each side up to a whole pixel.
    """

    width = math.ceil((bounds.east - bounds.west) / GMTED_PIXEL_DEG)
    height = math.ceil((bounds.north - bounds.south) / GMTED_PIXEL_DEG)
    count = int(width * height)
    LOGGER.log(TRACE_LEVEL, "dem_pixel_count count=%s.", count)
    return count


def require_dem_size(bounds: LonLatBox, settings: PipelineSettings) -> None:
    """
    Why this exists:
        Refuse a mosaic that would not fit this prototype's memory budget.
    When to use:
        After ``dem_bounds_for`` and before merging.
    What to expect:
        Returns when the count is within the limit.
    Exceptions:
        ``ValueError`` naming both counts when the region is too large.
    """

    count = dem_pixel_count(bounds)
    LOGGER.log(TRACE_LEVEL, "require_dem_size count=%s limit=%s.", count, settings.dem_max_pixels)
    if count > settings.dem_max_pixels:
        raise ValueError(
            f"DEM has {count} pixels, above the limit of {settings.dem_max_pixels}. "
            "The region is too large for this prototype's in-memory mosaic."
        )


def require_shared_pixel_grid(infos: list[GmtedFileInfo]) -> None:
    """
    Why this exists:
        Tiles may start at different corners and still share one pixel phase.
    When to use:
        Before snapping the mosaic to the first file's grid.
    What to expect:
        Returns when every origin differs from the first by a whole number of pixels.
    Exceptions:
        ``ValueError`` naming a file that is on a different grid.
    """

    LOGGER.log(TRACE_LEVEL, "require_shared_pixel_grid files=%s.", len(infos))
    if not infos:
        raise ValueError("no GMTED files")
    first = infos[0]
    for info in infos[1:]:
        dx = (info.origin_x - first.origin_x) / GMTED_PIXEL_DEG
        dy = (info.origin_y - first.origin_y) / GMTED_PIXEL_DEG
        if abs(dx - round(dx)) > 1e-4 or abs(dy - round(dy)) > 1e-4:
            raise ValueError(f"{info.path} is not on the same pixel grid as {first.path}")


def require_gmted_coverage(infos: list[GmtedFileInfo], bounds: LonLatBox) -> None:
    """
    Why this exists:
        Fail before a long mosaic when a tile is missing.
    When to use:
        After the files have been described.
    What to expect:
        Returns when every sample point, including the edges, falls in some tile.
    Exceptions:
        ``ValueError`` listing up to five uncovered points.
    """

    LOGGER.log(TRACE_LEVEL, "require_gmted_coverage files=%s.", len(infos))
    uncovered: list[str] = []
    for lon, lat in _coverage_points(bounds):
        if not any(_contains(info.box, lon, lat) for info in infos):
            uncovered.append(f"({lon:.4f}, {lat:.4f})")
            if len(uncovered) == 5:
                break
    if uncovered:
        raise ValueError(f"GMTED tiles do not cover {', '.join(uncovered)}")


def files_overlapping(infos: list[GmtedFileInfo], bounds: LonLatBox) -> list[GmtedFileInfo]:
    """
    Why this exists:
        Keep tiles that do not meet the mosaic out of the merge.
    When to use:
        After the coverage check.
    What to expect:
        The overlapping files, still in the input order.
    Exceptions:
        ``ValueError`` when none overlap.
    """

    LOGGER.log(TRACE_LEVEL, "files_overlapping candidates=%s.", len(infos))
    selected = [info for info in infos if _overlaps(info.box, bounds)]
    if not selected:
        raise ValueError("no GMTED file intersects the DEM bounds")
    return selected


def build_dem_mosaic(infos: list[GmtedFileInfo], bounds: LonLatBox, out_path: Path) -> Path:
    """
    Why this exists:
        Write one int16 elevation raster for the region.
    When to use:
        After coverage, grid, and size checks.
    What to expect:
        A tiled, DEFLATE-compressed GeoTIFF. Missing samples stay nodata. Returns ``out_path``.
    """

    LOGGER.debug("build_dem_mosaic files=%s out=%s.", len(infos), out_path)
    snapped = _snap_outward(bounds, infos[0].origin_x, infos[0].origin_y)
    datasets = [rasterio.open(info.path) for info in infos]
    try:
        array, transform = merge(
            datasets,
            bounds=(snapped.west, snapped.south, snapped.east, snapped.north),
            nodata=GMTED_NODATA,
        )
    finally:
        for dataset in datasets:
            dataset.close()
    band = np.asarray(array[0])
    if band.dtype != np.int16:
        missing = ~np.isfinite(band) if np.issubdtype(band.dtype, np.floating) else np.zeros(band.shape, dtype=bool)
        band = np.where(missing, GMTED_NODATA, np.rint(band)).astype(np.int16)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    profile = {
        "driver": "GTiff",
        "height": band.shape[0],
        "width": band.shape[1],
        "count": 1,
        "dtype": "int16",
        "crs": "EPSG:4326",
        "transform": transform,
        "nodata": GMTED_NODATA,
        "tiled": True,
        "blockxsize": 256,
        "blockysize": 256,
        "compress": "deflate",
    }
    with rasterio.open(out_path, "w", **profile) as dataset:
        dataset.write(band, 1)
    return out_path


def read_dem_3857(
    dataset: rasterio.DatasetReader,
    bounds_3857: tuple[float, float, float, float],
    shape: tuple[int, int],
    resampling: Resampling,
) -> np.ndarray:
    """
    Why this exists:
        Sample the geographic mosaic onto one Web Mercator block.
    When to use:
        While shading or building flat weights. Use bilinear at the native zoom and average below it.
    What to expect:
        A float32 array. Missing data becomes sea level, which matches open ocean.
    """

    LOGGER.log(TRACE_LEVEL, "read_dem_3857 shape=%s resampling=%s.", shape, resampling)
    rows, cols = shape
    destination = np.full(shape, np.nan, dtype=np.float32)
    reproject(
        source=rasterio.band(dataset, 1),
        destination=destination,
        src_nodata=dataset.nodata,
        dst_transform=rasterio.transform.from_bounds(*bounds_3857, width=cols, height=rows),
        dst_crs="EPSG:3857",
        dst_nodata=np.nan,
        resampling=resampling,
    )
    destination[~np.isfinite(destination)] = 0.0
    return destination


def _coverage_points(bounds: LonLatBox) -> list[tuple[float, float]]:
    """
    Why this exists:
        Sample the DEM rectangle, including its edges.
    When to use:
        From ``require_gmted_coverage``.
    What to expect:
        Longitude and latitude pairs every quarter degree.
    """

    longitudes = _inclusive_steps(bounds.west, bounds.east)
    latitudes = _inclusive_steps(bounds.south, bounds.north)
    return [(lon, lat) for lat in latitudes for lon in longitudes]


def _inclusive_steps(start: float, stop: float) -> list[float]:
    """
    Why this exists:
        Include both ends of a coverage axis.
    When to use:
        When building the coverage sample grid.
    What to expect:
        Values from ``start`` to ``stop`` at the coverage step.
    """

    values = [float(value) for value in np.arange(start, stop, _COVERAGE_STEP_DEG)]
    if not values or abs(values[-1] - stop) > 1e-9:
        values.append(stop)
    return values


def _contains(box: LonLatBox, lon: float, lat: float) -> bool:
    """
    Why this exists:
        Accept a sample that sits just outside a tile edge.
    When to use:
        During the coverage check.
    What to expect:
        True when the point is inside the box or within the coverage tolerance.
    """

    return (
        box.west - _COVERAGE_TOLERANCE_DEG <= lon <= box.east + _COVERAGE_TOLERANCE_DEG
        and box.south - _COVERAGE_TOLERANCE_DEG <= lat <= box.north + _COVERAGE_TOLERANCE_DEG
    )


def _overlaps(left: LonLatBox, right: LonLatBox) -> bool:
    """
    Why this exists:
        Skip a GMTED tile that misses the mosaic.
    When to use:
        When choosing files to merge.
    What to expect:
        True when the boxes overlap, not merely touch.
    """

    return left.west < right.east and right.west < left.east and left.south < right.north and right.south < left.north


def _snap_outward(bounds: LonLatBox, origin_x: float, origin_y: float) -> LonLatBox:
    """
    Why this exists:
        Align the mosaic to the GMTED pixel grid without dropping an edge sample.
    When to use:
        Immediately before ``rasterio.merge``.
    What to expect:
        A box on the source grid that contains ``bounds``.
    """

    pixel = GMTED_PIXEL_DEG
    west = origin_x + math.floor((bounds.west - origin_x) / pixel) * pixel
    east = origin_x + math.ceil((bounds.east - origin_x) / pixel) * pixel
    north = origin_y - math.floor((origin_y - bounds.north) / pixel) * pixel
    south = origin_y - math.ceil((origin_y - bounds.south) / pixel) * pixel
    return LonLatBox(west, south, east, north)
