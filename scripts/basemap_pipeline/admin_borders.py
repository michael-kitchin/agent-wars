"""National and state borders from Natural Earth land-boundary lines.

Country and state polygons are not a source. Their outlines retrace the coast.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from pathlib import Path

import fiona
from shapely.geometry import LineString, shape
from shapely.geometry.base import BaseGeometry

from scripts.basemap_pipeline.vector_grid import encode_lods, to_mercator
from scripts.basemap_pipeline.vector_settings import (
    COUNTRY_BORDER_LODS,
    QUANTUM_DEG,
    STATE_BORDER_LODS,
    VECTOR_SCHEMA_VERSION,
    CoastLod,
)

LOGGER = logging.getLogger(__name__)

# Land boundaries only. These files do not follow the shoreline.
BORDER_SOURCES = {
    "country": "ne_10m_admin_0_boundary_lines_land.shp",
    "state": "ne_10m_admin_1_states_provinces_lines.shp",
}

_POLYGON_TYPES = frozenset({"Polygon", "MultiPolygon"})
_DATELINE_GAP_DEG = 0.01


def load_border_lines(path: Path) -> tuple[list[LineString], list[LineString]]:
    """
    Why this exists:
        Disputed and indefinite borders are drawn dashed. Everything else is solid.
    When to use:
        On a Natural Earth land-boundary shapefile.
    What to expect:
        ``(normal, disputed)`` line lists. A missing ``featurecla`` is normal.
        ``featurecla`` text containing "disputed" or "indefinite", in any case, is disputed.
    Exceptions:
        ``ValueError`` naming the file when any feature is a polygon. ``fiona.errors.DriverError``
        when the file cannot be opened.
    """

    LOGGER.debug("load_border_lines path=%s", path)
    normal: list[LineString] = []
    disputed: list[LineString] = []
    with fiona.open(path) as source:
        for feature in source:
            geometry = feature.get("geometry")
            geom_type = None if geometry is None else geometry.get("type")
            if geom_type in _POLYGON_TYPES:
                raise ValueError(f"{path} contains {geom_type}")
            if geom_type is None:
                continue
            properties = feature.get("properties") or {}
            target = disputed if _is_disputed(_featurecla(properties)) else normal
            target.extend(_lines_of(shape(geometry)))
    return normal, disputed


def without_dateline_cuts(lines: Sequence[LineString]) -> list[LineString]:
    """
    Why this exists:
        A shapefile split at longitude 180 leaves a cut there. That cut is not a border.
    When to use:
        On border lines in degrees, before they are projected and simplified.
    What to expect:
        Lines whose longitudes are all within 0.01° of 180 or of -180 are removed.
        A line that merely reaches 179° stays.
    Exceptions:
        None.
    """

    LOGGER.debug("without_dateline_cuts lines=%s", len(lines))
    return [line for line in lines if not _is_dateline_cut(line)]


def build_admin_border_document(data_root: Path) -> dict[str, object]:
    """
    Why this exists:
        The map draws national and state borders from the land-boundary lines, not from polygons.
    When to use:
        When writing the border zip. ``data_root`` holds the two shapefiles.
    What to expect:
        Four groups: country, country_disputed, state, state_disputed. A disputed group may be empty.
    Exceptions:
        ``ValueError`` from ``load_border_lines`` when an input is a polygon file.
        ``FileNotFoundError`` or a fiona error when a shapefile is missing.
    """

    LOGGER.debug("build_admin_border_document root=%s", data_root)
    groups: list[dict[str, object]] = []
    levels: tuple[tuple[str, str, tuple[CoastLod, ...]], ...] = (
        ("country", BORDER_SOURCES["country"], COUNTRY_BORDER_LODS),
        ("state", BORDER_SOURCES["state"], STATE_BORDER_LODS),
    )
    for level, filename, lods in levels:
        normal, disputed = load_border_lines(data_root / filename)
        for group_id, lines in ((level, normal), (f"{level}_disputed", disputed)):
            projected = [to_mercator(line) for line in without_dateline_cuts(lines)]
            groups.append({"id": group_id, "lods": encode_lods(projected, lods)})
    return {
        "schema_version": VECTOR_SCHEMA_VERSION,
        "kind": "admin_borders",
        "quantum_deg": QUANTUM_DEG,
        "groups": groups,
    }


def _featurecla(properties: dict[str, object]) -> object:
    """
    Why this exists:
        Shapefile field names arrive uppercase from some readers and lowercase from others.
    When to use:
        Before classifying a boundary feature.
    What to expect:
        The ``featurecla`` value, or ``None`` when the field is absent.
    Exceptions:
        None.
    """

    for key, value in properties.items():
        if str(key).lower() == "featurecla":
            return value
    return None


def _is_disputed(featurecla: object) -> bool:
    """
    Why this exists:
        The dashed style follows the shapefile's own boundary class.
    When to use:
        On one feature's ``featurecla``.
    What to expect:
        True when the text contains "disputed" or "indefinite". Missing text is false.
    Exceptions:
        None.
    """

    text = "" if featurecla is None else str(featurecla).lower()
    return "disputed" in text or "indefinite" in text


def _is_dateline_cut(line: LineString) -> bool:
    """
    Why this exists:
        The cut is a vertical seam at the antimeridian, not a boundary between places.
    When to use:
        On one line in degrees.
    What to expect:
        True when every longitude is within 0.01° of 180 or of -180.
    Exceptions:
        None.
    """

    longitudes = [point[0] for point in line.coords]
    if not longitudes:
        return False
    return all(min(abs(lng - 180.0), abs(lng + 180.0)) <= _DATELINE_GAP_DEG for lng in longitudes)


def _lines_of(geometry: BaseGeometry) -> list[LineString]:
    """
    Why this exists:
        One feature may hold several lines.
    When to use:
        After reading a feature that is not a polygon.
    What to expect:
        The line pieces. Points are skipped.
    Exceptions:
        None.
    """

    if geometry.is_empty:
        return []
    if isinstance(geometry, LineString):
        return [geometry] if len(geometry.coords) >= 2 else []
    if geometry.geom_type in {"MultiLineString", "GeometryCollection"}:
        pieces: list[LineString] = []
        for part in geometry.geoms:
            pieces.extend(_lines_of(part))
        return pieces
    return []
