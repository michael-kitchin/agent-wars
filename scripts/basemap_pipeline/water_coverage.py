"""Natural Earth water geometry and anti-aliased coverage."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from scripts.basemap_pipeline.proj_runtime import use_current_proj_data

use_current_proj_data()

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.features import rasterize
from shapely import make_valid
from shapely.geometry.base import BaseGeometry
from shapely.ops import transform, unary_union
from shapely.wkb import dumps as dump_wkb
from shapely.wkb import loads as load_wkb

from scripts.basemap_pipeline.basemap_settings import OutputPaths
from scripts.basemap_pipeline.web_mercator import LonLatBox
from scripts.terrain_pipeline.config import InputRasterSet
from scripts.terrain_pipeline.geometry_bounds import clip_polygonal_to_bounds
from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL
from scripts.terrain_pipeline.ocean_mask import load_ocean_union_wgs84

LOGGER = logging.getLogger(__name__)


def load_water_geometry_3857(data_root: Path, clip_box: LonLatBox, paths: OutputPaths) -> BaseGeometry:
    """
    Why this exists:
        Build the ocean-plus-lakes mask once and reuse it.
    When to use:
        Before rendering tiles. Pass the DEM bounds, not the region box.
    What to expect:
        A geometry in EPSG:3857. Prints whether the cache was used.
        The first call dissolves the global ocean and can take several minutes.
    Exceptions:
        ``FileNotFoundError`` or ``ValueError`` from the shapefile loader when a source is missing or empty.
    """

    LOGGER.debug("load_water_geometry_3857 root=%s.", data_root)
    ocean_path = data_root / InputRasterSet().ocean_shapefile_name
    lake_path = data_root / InputRasterSet().lake_shapefile_name
    description = {
        "clip_box": [clip_box.west, clip_box.south, clip_box.east, clip_box.north],
        "ocean": _source_stamp(ocean_path),
        "lakes": _source_stamp(lake_path),
    }
    cached = _read_cache(paths, description)
    if cached is not None:
        print("water geometry: cached")
        return cached
    geometry = _build_water_geometry(ocean_path, lake_path, clip_box)
    paths.water_cache_path.parent.mkdir(parents=True, exist_ok=True)
    if paths.water_cache_info_path.exists():
        paths.water_cache_info_path.unlink()
    paths.water_cache_path.write_bytes(dump_wkb(geometry))
    paths.water_cache_info_path.write_text(json.dumps(description, sort_keys=True), encoding="utf-8")
    print("water geometry: built")
    return geometry


def water_coverage(
    geometry_3857: BaseGeometry,
    bounds_3857: tuple[float, float, float, float],
    shape: tuple[int, int],
    supersample: int,
) -> np.ndarray:
    """
    Why this exists:
        Measure how much of each pixel is water, with a smoother coast than one sample.
    When to use:
        For each rendered block, on the block bounds rather than the halo.
    What to expect:
        Float coverage from 0 to 1. An empty clip is all zeros.
    """

    LOGGER.log(TRACE_LEVEL, "water_coverage shape=%s supersample=%s.", shape, supersample)
    rows, cols = shape
    clipped = clip_polygonal_to_bounds(geometry_3857, bounds_3857)
    if clipped.is_empty:
        return np.zeros(shape, dtype=np.float64)
    fine = rasterize(
        [(clipped, 1)],
        out_shape=(rows * supersample, cols * supersample),
        transform=rasterio.transform.from_bounds(
            *bounds_3857,
            width=cols * supersample,
            height=rows * supersample,
        ),
        fill=0,
        dtype="uint8",
        all_touched=False,
    )
    return fine.reshape(rows, supersample, cols, supersample).mean(axis=(1, 3))


def _source_stamp(path: Path) -> dict[str, str | int]:
    """
    Why this exists:
        Invalidate the water cache when a shapefile is replaced.
    When to use:
        When describing the current inputs.
    What to expect:
        Path, size, and modified time. A missing file still produces a stamp so the loader can fail clearly.
    """

    if not path.is_file():
        return {"path": str(path), "size": -1, "mtime_ns": -1}
    stat = path.stat()
    return {"path": str(path), "size": stat.st_size, "mtime_ns": stat.st_mtime_ns}


def _read_cache(paths: OutputPaths, description: dict) -> BaseGeometry | None:
    """
    Why this exists:
        Skip the dissolve when the clip and the shapefiles are unchanged.
    When to use:
        At the start of ``load_water_geometry_3857``.
    What to expect:
        The cached geometry, or ``None`` when the cache is absent or stale.
    """

    if not paths.water_cache_path.is_file() or not paths.water_cache_info_path.is_file():
        return None
    stored = json.loads(paths.water_cache_info_path.read_text(encoding="utf-8"))
    if stored != json.loads(json.dumps(description, sort_keys=True)):
        return None
    return load_wkb(paths.water_cache_path.read_bytes())


def _build_water_geometry(ocean_path: Path, lake_path: Path, clip_box: LonLatBox) -> BaseGeometry:
    """
    Why this exists:
        Union ocean and lakes, clip them, and project them to Web Mercator.
    When to use:
        On a cache miss.
    What to expect:
        A valid geometry in EPSG:3857, possibly empty.
    """

    ocean = load_ocean_union_wgs84(ocean_path)
    lakes = load_ocean_union_wgs84(lake_path)
    combined = unary_union([ocean, lakes])
    clipped = clip_polygonal_to_bounds(combined, (clip_box.west, clip_box.south, clip_box.east, clip_box.north))
    transformer = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
    projected = transform(transformer.transform, clipped)
    return make_valid(projected)
