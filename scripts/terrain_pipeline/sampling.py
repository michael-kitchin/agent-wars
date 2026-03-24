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
from pathlib import Path
from typing import Iterable, List, Sequence, Tuple

import h3
import numpy as np
import rasterio
from rasterio.warp import transform
from shapely.geometry import Point, Polygon

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


def sample_raster_mean(dataset: rasterio.DatasetReader, lonlat_points: Sequence[LonLat]) -> float | None:
    """
    Why this exists:
        Compute deterministic mean values from rasters at predefined sample points.
    When to use:
        Aggregating EarthEnv class prevalence and topographic metrics for a cell.
    What to expect:
        Returns None when no valid raster samples are available at the given points.
    """

    if not lonlat_points:
        return None

    _ensure_proj_data_env()

    xs = [p[0] for p in lonlat_points]
    ys = [p[1] for p in lonlat_points]
    if dataset.crs is None:
        raise ValueError(f"Raster {dataset.name} has no CRS.")

    if str(dataset.crs).upper() not in {"EPSG:4326", "OGC:CRS84"}:
        tx, ty = transform("EPSG:4326", dataset.crs, xs, ys)
        sample_points = list(zip(tx, ty))
    else:
        sample_points = list(zip(xs, ys))

    nodata = dataset.nodata
    values = []
    for row in dataset.sample(sample_points):
        val = float(row[0])
        if nodata is not None and np.isclose(val, nodata):
            continue
        if np.isnan(val):
            continue
        values.append(val)
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
        Per-cell feature extraction in the main pipeline.
    What to expect:
        Returns a mapping from raster key to mean sample value or None.
    """

    out: dict[str, float | None] = {}
    for key, ds in rasters:
        out[key] = sample_raster_mean(ds, lonlat_points)
    return out

