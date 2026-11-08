"""Coastlines from the same water geometry the tiles use."""

from __future__ import annotations

import logging
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import box
from shapely.geometry.base import BaseGeometry
from shapely.ops import transform

from scripts.basemap_pipeline.basemap_settings import OutputPaths
from scripts.basemap_pipeline.vector_grid import encode_lods
from scripts.basemap_pipeline.vector_settings import (
    COAST_LODS,
    MERCATOR_MAX_LAT,
    QUANTUM_DEG,
    VECTOR_SCHEMA_VERSION,
    WORLD_HALF_EXTENT_M,
)
from scripts.basemap_pipeline.water_coverage import load_water_geometry_3857
from scripts.basemap_pipeline.web_mercator import LonLatBox

LOGGER = logging.getLogger(__name__)

_TO_LONLAT = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)
_TO_MERCATOR = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)


def load_world_water_lonlat(data_root: Path, work_dir: Path) -> BaseGeometry:
    """
    Why this exists:
        The hairline and the tiles have to come from one water shape, or the line misses the shore.
    When to use:
        Before building the edge mask. The coastline builder uses the metre geometry directly.
    What to expect:
        Ocean plus lakes in longitude, latitude, clipped to the Web Mercator latitude.
        The first call can take several minutes. A later call uses the cache under ``work_dir``.
    Exceptions:
        ``FileNotFoundError`` or ``ValueError`` from the water loader when a shapefile is missing or empty.
    """

    LOGGER.debug("load_world_water_lonlat root=%s work=%s", data_root, work_dir)
    water_3857 = load_water_geometry_3857(
        data_root,
        LonLatBox(-180.0, -MERCATOR_MAX_LAT, 180.0, MERCATOR_MAX_LAT),
        OutputPaths(work_dir, "water"),
    )
    return transform(_TO_LONLAT.transform, water_3857)


def coast_lines_3857(water_3857: BaseGeometry) -> BaseGeometry:
    """
    Why this exists:
        The water polygon's own edge includes the antimeridian and the Mercator frame, which are not coasts.
    When to use:
        On the water geometry in EPSG:3857, before encoding coastline bands.
    What to expect:
        The water boundary with every line within 1 metre of the frame removed.
    Exceptions:
        None. Empty water returns an empty boundary.
    """

    LOGGER.debug("coast_lines_3857 type=%s", water_3857.geom_type)
    mercator_y = _TO_MERCATOR.transform(0.0, MERCATOR_MAX_LAT)[1]
    frame = box(-WORLD_HALF_EXTENT_M, -mercator_y, WORLD_HALF_EXTENT_M, mercator_y).exterior.buffer(1.0)
    return water_3857.boundary.difference(frame)


def build_coastline_document(lines_3857: BaseGeometry) -> dict[str, object]:
    """
    Why this exists:
        The map draws one coastline band for the zoom it is at.
    When to use:
        After ``coast_lines_3857``.
    What to expect:
        A coastline document. The last band is the detailed one and has no ``max_zoom``.
    Exceptions:
        None.
    """

    LOGGER.debug("build_coastline_document type=%s", lines_3857.geom_type)
    return {
        "schema_version": VECTOR_SCHEMA_VERSION,
        "kind": "coastlines",
        "quantum_deg": QUANTUM_DEG,
        "lods": encode_lods(lines_3857, COAST_LODS),
    }
