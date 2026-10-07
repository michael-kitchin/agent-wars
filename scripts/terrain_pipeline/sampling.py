"""
Deterministic point-in-cell sampling utilities for terrain aggregation.

The pipeline's area-weighted contract is implemented via deterministic uniform-point
integration over each H3 cell polygon, which provides stable approximations and
reproducible outputs across runs.
"""

from __future__ import annotations

import logging
import math
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Sequence, Tuple

import h3
import numpy as np
import rasterio
from rasterio.transform import rowcol
from rasterio.warp import transform
from rasterio.windows import Window
from shapely.geometry import Point, Polygon

from .logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)

LonLat = Tuple[float, float]


def _ensure_proj_data_env() -> None:
    """
    Why this exists:
        Avoid cross-install PROJ database conflicts on systems with PostGIS and Rasterio.
    When to use:
        Before CRS transforms in raster sampling logic.
    What to expect:
        Forces PROJ_LIB to Rasterio's bundled proj_data directory.
    """

    pkg_dir = Path(rasterio.__file__).resolve().parent
    proj_data = pkg_dir / "proj_data"
    if proj_data.exists():
        os.environ["PROJ_LIB"] = str(proj_data)


def cell_polygon(cell: str) -> Polygon:
    """
    Why this exists:
        Convert H3 cells into shapely polygons for deterministic spatial sampling.
    When to use:
        Before generating integration sample points for raster aggregation.
    What to expect:
        Returns a lon/lat polygon in EPSG:4326 coordinates.
    """

    boundary_latlng = h3.cell_to_boundary(cell)
    boundary_lonlat = [(lng, lat) for lat, lng in boundary_latlng]

    # Handle antimeridian-crossing cells by unwrapping longitudes to one branch.
    lngs = [lng for lng, _ in boundary_lonlat]
    if lngs and (max(lngs) - min(lngs) > 180.0):
        unwrapped = []
        for lng, lat in boundary_lonlat:
            if lng < 0:
                unwrapped.append((lng + 360.0, lat))
            else:
                unwrapped.append((lng, lat))
        poly = Polygon(unwrapped)
    else:
        poly = Polygon(boundary_lonlat)

    if not poly.is_valid:
        poly = poly.buffer(0)
    return poly


def deterministic_points_within_polygon(poly: Polygon, count: int) -> List[LonLat]:
    """
    Why this exists:
        Produce reproducible sample points inside a polygon for area-weight integration.
    When to use:
        Computing class prevalence or topo means per H3 cell.
    What to expect:
        Returns exactly `count` lon/lat points or raises ValueError if polygon is invalid.
    """

    if count <= 0:
        raise ValueError("count must be positive")
    if poly.is_empty or not poly.is_valid:
        raise ValueError("polygon must be non-empty and valid")

    minx, miny, maxx, maxy = poly.bounds
    width = maxx - minx
    height = maxy - miny
    if width <= 0 or height <= 0:
        raise ValueError("polygon bounds are degenerate")

    # Deterministic low-discrepancy sequence based on golden ratio increments.
    points: List[LonLat] = []
    i = 0
    phi = (1 + math.sqrt(5)) / 2
    inv_phi = 1 / phi
    inv_phi2 = 1 / (phi * phi)
    max_iters = count * 50
    while len(points) < count and i < max_iters:
        u = (0.5 + i * inv_phi) % 1.0
        v = (0.5 + i * inv_phi2) % 1.0
        x = minx + u * width
        y = miny + v * height
        p = Point(x, y)
        if poly.contains(p) or poly.touches(p):
            points.append((x, y))
        i += 1

    if len(points) < count:
        LOGGER.debug(
            "Low-discrepancy sampling underfilled polygon; falling back to representative points. "
            "Requested=%d, got=%d.",
            count,
            len(points),
        )
        centroid = poly.centroid
        while len(points) < count:
            points.append((centroid.x, centroid.y))

    normalized: List[LonLat] = []
    for x, y in points:
        if x > 180.0:
            normalized.append((x - 360.0, y))
        else:
            normalized.append((x, y))
    return normalized


def _raster_values_at_lonlat_points(
    dataset: rasterio.DatasetReader, lonlat_points: Sequence[LonLat]
) -> List[float]:
    """
    Why this exists:
        Shared point-in-raster read path for means and per-edge water fractions.
    When to use:
        Inside sample_raster_mean and edge-water sampling.
    What to expect:
        List of valid sample values only (nodata and NaN skipped). May be empty.
    """

    if not lonlat_points:
        return []

    _ensure_proj_data_env()

    xs = [p[0] for p in lonlat_points]
    ys = [p[1] for p in lonlat_points]
    if dataset.crs is None:
        raise ValueError(f"Raster {dataset.name} has no CRS.")

    if not _dataset_is_lonlat(dataset):
        tx, ty = transform("EPSG:4326", dataset.crs, xs, ys)
        sample_points = list(zip(tx, ty))
    else:
        sample_points = list(zip(xs, ys))

    nodata = dataset.nodata
    values: List[float] = []
    for row in dataset.sample(sample_points):
        val = float(row[0])
        if nodata is not None and np.isclose(val, nodata):
            continue
        if np.isnan(val):
            continue
        values.append(val)
    return values


def sample_raster_mean(dataset: rasterio.DatasetReader, lonlat_points: Sequence[LonLat]) -> float | None:
    """
    Why this exists:
        Compute deterministic mean values from rasters at predefined sample points.
    When to use:
        Aggregating EarthEnv class prevalence and topographic metrics for a cell.
    What to expect:
        Returns None when no valid raster samples are available at the given points.
    """

    values = _raster_values_at_lonlat_points(dataset, lonlat_points)
    if not values:
        return None
    return float(np.mean(values))


def sample_many_rasters(
    rasters: Iterable[tuple[str, rasterio.DatasetReader]],
    lonlat_points: Sequence[LonLat],
) -> dict[str, float | None]:
    """
    Why this exists:
        Aggregate all needed raster values for one cell in one deterministic pass.
    When to use:
        Per-cell feature extraction when the rasters are not already loaded into a window.
    What to expect:
        Returns a mapping from raster key to mean sample value or None.
    """

    LOGGER.log(TRACE_LEVEL, "sample_many_rasters points=%d.", len(lonlat_points))
    out: dict[str, float | None] = {}
    for key, ds in rasters:
        out[key] = sample_raster_mean(ds, lonlat_points)
    return out


@dataclass(frozen=True, eq=False)
class SampleWindow:
    """
    Why this exists:
        Hold one raster's pixels for a regional bounding box so cell sampling does not reopen the file.
    When to use:
        Built once per metadata pass by ``read_sample_window``, then queried for every cell.
    What to expect:
        Lookups use the dataset affine and match ``DatasetReader.sample`` inside the window.
    """

    # Pixel block covering the requested bounds, padded by one pixel.
    values: np.ndarray
    # Full-dataset affine. Lookups must use this, not a window affine, to match rasterio's index.
    transform: rasterio.Affine
    # Dataset row of ``values[0, 0]``.
    row_off: int
    # Dataset column of ``values[0, 0]``.
    col_off: int
    # Source nodata value. ``None`` when the dataset does not define one.
    nodata: float | None


def _dataset_is_lonlat(dataset: rasterio.DatasetReader) -> bool:
    """
    Why this exists:
        Lon/lat sample points address a raster directly only when its grid is geographic WGS84.
    When to use:
        Before a window read, and before the per-pixel path decides whether to reproject.
    What to expect:
        True for EPSG:4326 and OGC:CRS84. False when the CRS is missing or projected.
    """

    LOGGER.log(TRACE_LEVEL, "_dataset_is_lonlat name=%s crs=%s.", dataset.name, dataset.crs)
    crs = dataset.crs
    if crs is None:
        return False
    return str(crs).upper() in {"EPSG:4326", "OGC:CRS84"}


def read_sample_windows(
    rasters: Sequence[tuple[str, rasterio.DatasetReader]],
    bounds: tuple[float, float, float, float],
) -> list[tuple[str, SampleWindow]] | None:
    """
    Why this exists:
        Load regional raster windows only when those windows can be addressed in lon/lat.
    When to use:
        Once per metadata pass when a clip box is available.
    What to expect:
        One window per raster. Returns ``None`` when any raster is not EPSG:4326 or OGC:CRS84,
        so the caller keeps ``sample_many_rasters``, which reprojects points into the dataset CRS.
    """

    LOGGER.debug("read_sample_windows rasters=%d bounds=%s.", len(rasters), bounds)
    if any(not _dataset_is_lonlat(dataset) for _, dataset in rasters):
        LOGGER.debug("Raster windows skipped because a dataset is not lon/lat.")
        return None
    return [(key, read_sample_window(dataset, bounds)) for key, dataset in rasters]


def read_sample_window(
    dataset: rasterio.DatasetReader,
    bounds: tuple[float, float, float, float],
) -> SampleWindow:
    """
    Why this exists:
        Read the pixels a regional metadata pass will sample, once, instead of once per cell.
    When to use:
        When every sample point lies inside ``bounds`` (west, south, east, north) and the dataset is lon/lat.
    What to expect:
        Returns a window padded by one pixel. Raises ``ValueError`` when the dataset is not EPSG:4326 or
        OGC:CRS84. Raises after logging when the dataset cannot be read.
    """

    LOGGER.debug("read_sample_window dataset=%s bounds=%s.", dataset.name, bounds)
    if not _dataset_is_lonlat(dataset):
        message = (
            f"Raster {dataset.name} CRS {dataset.crs} is not lon/lat. "
            "Window sampling only supports EPSG:4326 and OGC:CRS84."
        )
        LOGGER.error(message)
        raise ValueError(message)
    west, south, east, north = bounds
    try:
        # Fractional indexes of the four corners. Padding by one pixel keeps a sample that sits on
        # the requested bounds addressable after those indexes are floored.
        rows, cols = rowcol(
            dataset.transform,
            [west, east, east, west],
            [north, north, south, south],
            op=float,
        )
        row_off = math.floor(float(min(rows))) - 1
        col_off = math.floor(float(min(cols))) - 1
        height = math.ceil(float(max(rows))) - row_off + 1
        width = math.ceil(float(max(cols))) - col_off + 1
        padded = Window(col_off, row_off, width, height)
        values = dataset.read(1, window=padded, boundless=True)
    except Exception:
        LOGGER.error(
            "Failed to read raster window from %s bounds=%s.",
            dataset.name,
            bounds,
            exc_info=True,
        )
        raise
    return SampleWindow(
        values=values,
        transform=dataset.transform,
        row_off=row_off,
        col_off=col_off,
        nodata=None if dataset.nodata is None else float(dataset.nodata),
    )


def _transform_key(transform: rasterio.Affine) -> tuple[float, float, float, float, float, float]:
    """
    Why this exists:
        Group rasters that share an affine so one cell can compute pixel indexes once.
    When to use:
        From ``sample_many_windows``.
    What to expect:
        Six coefficients. Equal keys mean ``rowcol`` returns the same indexes.
    """

    return (transform.a, transform.b, transform.c, transform.d, transform.e, transform.f)


def _window_values_at_indexes(window: SampleWindow, rows: np.ndarray, cols: np.ndarray) -> np.ndarray:
    """
    Why this exists:
        Read several pixels from one window with one bounds check.
    When to use:
        After ``rowcol`` for that window's dataset affine.
    What to expect:
        A 1-d float array with nodata, NaN, and out-of-window samples removed. May be empty.
    """

    local_rows = np.floor(np.asarray(rows, dtype=np.float64)).astype(np.int64) - window.row_off
    local_cols = np.floor(np.asarray(cols, dtype=np.float64)).astype(np.int64) - window.col_off
    height, width = window.values.shape
    valid = (
        (local_rows >= 0)
        & (local_cols >= 0)
        & (local_rows < height)
        & (local_cols < width)
    )
    if not np.any(valid):
        return np.empty(0, dtype=np.float64)
    values = np.asarray(window.values[local_rows[valid], local_cols[valid]], dtype=np.float64)
    if window.nodata is not None:
        values = values[~np.isclose(values, window.nodata)]
    if values.size:
        values = values[~np.isnan(values)]
    return values


def sample_many_windows(
    windows: Sequence[tuple[str, SampleWindow]],
    lonlat_points: Sequence[LonLat],
) -> dict[str, float | None]:
    """
    Why this exists:
        Compute the same per-raster means as ``sample_many_rasters`` from memory.
    When to use:
        Per cell, after ``read_sample_window`` for each raster in the pass.
    What to expect:
        A mapping from raster key to mean, or ``None`` when every sample is nodata or outside the window.
    """

    LOGGER.log(TRACE_LEVEL, "sample_many_windows rasters=%d points=%d.", len(windows), len(lonlat_points))
    out: dict[str, float | None] = {}
    if not lonlat_points:
        return {key: None for key, _ in windows}
    xs = [point[0] for point in lonlat_points]
    ys = [point[1] for point in lonlat_points]
    indexes_by_transform: dict[tuple[float, float, float, float, float, float], tuple[np.ndarray, np.ndarray]] = {}
    for key, window in windows:
        transform_key = _transform_key(window.transform)
        indexes = indexes_by_transform.get(transform_key)
        if indexes is None:
            rows, cols = rowcol(window.transform, xs, ys)
            indexes = (np.asarray(rows), np.asarray(cols))
            indexes_by_transform[transform_key] = indexes
        values = _window_values_at_indexes(window, indexes[0], indexes[1])
        out[key] = None if values.size == 0 else float(values.mean())
    return out

