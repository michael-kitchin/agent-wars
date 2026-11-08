"""Place-name anchors for continents, countries, and states.

The primary anchor is the Natural Earth label point, or a fixed point for a continent.
Extra anchors are interior points of the pieces that are large enough to name.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from pathlib import Path

import fiona
from shapely.geometry import Point, Polygon, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import polylabel

from scripts.basemap_pipeline.vector_grid import split_by_grid, to_lonlat, to_mercator
from scripts.basemap_pipeline.vector_settings import (
    CONTINENT_LABEL_ANCHORS,
    COUNTRY_ANCHOR_CELL_DEG,
    COUNTRY_MIN_FRAGMENT_RADIUS_M,
    MERCATOR_MAX_LAT,
    POLYLABEL_TOLERANCE_M,
    STATE_ANCHOR_CELL_DEG,
    STATE_MIN_FRAGMENT_RADIUS_M,
    STATE_NEVER_LABEL_MIN_ZOOM,
    VECTOR_SCHEMA_VERSION,
)
from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)

_CONTINENTS_SHP = "ne_10m_geography_regions_polys.shp"
_COUNTRIES_SHP = "ne_10m_admin_0_countries.shp"
_STATES_SHP = "ne_10m_admin_1_states_provinces.shp"


def load_continent_features(data_root: Path) -> list[dict[str, object]]:
    """
    Why this exists:
        Continent names use fixed anchors. An inscribed point of the whole continent is a poor label.
    When to use:
        While building the place-name document.
    What to expect:
        One feature per continent, with one anchor from ``CONTINENT_LABEL_ANCHORS``.
    Exceptions:
        ``ValueError`` when a continent name has no table entry. ``fiona.errors.DriverError``
        when the shapefile cannot be opened.
    """

    path = data_root / _CONTINENTS_SHP
    LOGGER.debug("load_continent_features path=%s", path)
    features: list[dict[str, object]] = []
    with fiona.open(path) as source:
        for feature in source:
            properties = feature.get("properties") or {}
            if _text(_property(properties, "featurecla")) != "Continent":
                continue
            name = _text(_property(properties, "name"))
            anchor = _continent_anchor(name)
            if anchor is None:
                raise ValueError(f"no label anchor for continent {name}")
            geometry = _geometry(feature.get("geometry"))
            if geometry is None:
                continue
            features.append(_record(_PendingLabel(
                "continent", f"continent:{name}", name, 0, 0, anchor[0], anchor[1], geometry, None, 0,
            )))
    return features


def load_country_features(data_root: Path) -> list[dict[str, object]]:
    """
    Why this exists:
        Country names start from the Natural Earth label point and add an anchor for each large piece.
    When to use:
        While building the place-name document.
    What to expect:
        One feature per country with a name and a minimum zoom. The first anchor is ``(LABEL_Y, LABEL_X)``.
    Exceptions:
        ``fiona.errors.DriverError`` when the shapefile cannot be opened.
    """

    return _admin_features(_AdminSource(
        data_root / _COUNTRIES_SHP,
        "country",
        "adm0",
        "adm0_a3",
        ("name",),
        "labelrank",
        "min_label",
        "label_y",
        "label_x",
        COUNTRY_ANCHOR_CELL_DEG,
        COUNTRY_MIN_FRAGMENT_RADIUS_M,
        None,
    ))


def load_state_features(data_root: Path) -> list[dict[str, object]]:
    """
    Why this exists:
        State and province names use the same anchor rule as countries, on a finer grid.
    When to use:
        While building the place-name document.
    What to expect:
        One feature per state whose minimum zoom is below 18. ``name_en`` is preferred over ``name``.
    Exceptions:
        ``fiona.errors.DriverError`` when the shapefile cannot be opened.
    """

    return _admin_features(_AdminSource(
        data_root / _STATES_SHP,
        "state",
        "adm1",
        "adm1_code",
        ("name_en", "name"),
        "labelrank",
        "min_label",
        "latitude",
        "longitude",
        STATE_ANCHOR_CELL_DEG,
        STATE_MIN_FRAGMENT_RADIUS_M,
        STATE_NEVER_LABEL_MIN_ZOOM,
    ))


def fragment_anchors(geometry: BaseGeometry, cell_deg: float, min_radius_m: float) -> list[list[float | int]]:
    """
    Why this exists:
        A country or state that is partly on screen still needs a label inside the visible piece.
    When to use:
        After the primary anchor is chosen. Not for continents.
    What to expect:
        ``[lat, lng, radius_m]`` for each cell piece whose inscribed radius is at least ``min_radius_m``.
        Latitude and longitude are rounded to 4 decimals. The radius is an integer. The list follows cell-key order.
        A piece narrower than the radius limit is absent.
    Exceptions:
        None. An empty geometry returns an empty list.
    """

    LOGGER.log(TRACE_LEVEL, "fragment_anchors cell_deg=%s", cell_deg)
    anchors: list[list[float | int]] = []
    for _key, piece in sorted(split_by_grid(geometry, cell_deg).items()):
        polygon = _largest_polygon(to_mercator(piece))
        if polygon is None:
            continue
        point = polylabel(polygon, POLYLABEL_TOLERANCE_M)
        radius = polygon.boundary.distance(point)
        if radius < min_radius_m:
            continue
        located = to_lonlat(point)
        anchors.append([_round_lat(located.y), round(located.x, 4), _whole_metres(radius)])
    return anchors


def build_label_document(data_root: Path) -> dict[str, object]:
    """
    Why this exists:
        The app draws place names from one document.
    When to use:
        From the vector command that writes ``map_labels``.
    What to expect:
        Schema ``1.0.0``, kind ``map_labels``, and features for continents, then countries, then states.
        Each feature's first anchor is its primary point.
    Exceptions:
        ``ValueError`` from a continent that has no fixed anchor. ``fiona.errors.DriverError``
        when a shapefile cannot be opened.
    """

    LOGGER.debug("build_label_document root=%s", data_root)
    features = [
        *load_continent_features(data_root),
        *load_country_features(data_root),
        *load_state_features(data_root),
    ]
    LOGGER.debug("build_label_document features=%s", len(features))
    return {"schema_version": VECTOR_SCHEMA_VERSION, "kind": "map_labels", "features": features}


@dataclass(frozen=True)
class _AdminSource:
    """
    Why this exists:
        Country and state shapefiles use different field names for the same record.
    When to use:
        As the argument to ``_admin_features``.
    What to expect:
        The path, the id prefix, the field names, the cell size, and the radius limit.
        ``skip_min_zoom_at`` is ``None`` when every minimum zoom is kept.
    """

    path: Path
    kind: str
    id_prefix: str
    id_field: str
    name_fields: tuple[str, ...]
    rank_field: str
    min_zoom_field: str
    lat_field: str
    lng_field: str
    cell_deg: float
    min_radius_m: float
    skip_min_zoom_at: float | None


def _admin_features(source: _AdminSource) -> list[dict[str, object]]:
    """
    Why this exists:
        Countries and states are the same kind of record with different field names.
    When to use:
        From the country and state loaders.
    What to expect:
        Features whose name and minimum zoom are present. A minimum zoom at or above
        ``skip_min_zoom_at`` is omitted when that limit is set. The primary anchor is first.
    Exceptions:
        ``fiona.errors.DriverError`` when ``path`` cannot be opened.
    """

    LOGGER.debug("load label features path=%s kind=%s", source.path, source.kind)
    features: list[dict[str, object]] = []
    with fiona.open(source.path) as opened:
        for feature in opened:
            properties = feature.get("properties") or {}
            name = _first_text(properties, source.name_fields)
            min_zoom = _property(properties, source.min_zoom_field)
            identifier = _text(_property(properties, source.id_field))
            if name == "" or min_zoom is None or identifier == "":
                continue
            min_zoom_value = _number(min_zoom)
            if source.skip_min_zoom_at is not None and float(min_zoom_value) >= source.skip_min_zoom_at:
                continue
            geometry = _geometry(feature.get("geometry"))
            if geometry is None:
                continue
            latitude = _property(properties, source.lat_field)
            longitude = _property(properties, source.lng_field)
            if latitude is None or longitude is None:
                continue
            rank = _property(properties, source.rank_field)
            features.append(_record(_PendingLabel(
                source.kind,
                f"{source.id_prefix}:{identifier}",
                name,
                0 if rank is None else _number(rank),
                min_zoom_value,
                float(latitude),
                float(longitude),
                geometry,
                source.cell_deg,
                source.min_radius_m,
            )))
    return features


@dataclass(frozen=True)
class _PendingLabel:
    """
    Why this exists:
        A place-name record has more fields than a function should take one by one.
    When to use:
        As the argument to ``_record``.
    What to expect:
        The identity, the primary point, and, when ``cell_deg`` is set, the grid used for extra anchors.
    """

    kind: str
    feature_id: str
    name: str
    rank: int | float
    min_zoom: int | float
    latitude: float
    longitude: float
    geometry: BaseGeometry
    cell_deg: float | None
    min_radius_m: float


def _record(pending: _PendingLabel) -> dict[str, object]:
    """
    Why this exists:
        Every place-name feature has the same fields. The primary anchor is always first.
    When to use:
        After a feature's identity and label point are known.
    What to expect:
        A document feature. Fragment anchors follow the primary anchor when ``cell_deg`` is set.
        Latitude is clamped to the Web Mercator limit.
    Exceptions:
        None.
    """

    primary = [
        _round_lat(pending.latitude),
        round(pending.longitude, 4),
        _primary_radius_m(pending.geometry, pending.latitude, pending.longitude),
    ]
    anchors: list[list[float | int]] = [primary]
    if pending.cell_deg is not None:
        anchors.extend(fragment_anchors(pending.geometry, pending.cell_deg, pending.min_radius_m))
    return {
        "id": pending.feature_id,
        "kind": pending.kind,
        "name": pending.name,
        "rank": pending.rank,
        "min_zoom": pending.min_zoom,
        "anchors": anchors,
    }


def _primary_radius_m(geometry: BaseGeometry, latitude: float, longitude: float) -> int:
    """
    Why this exists:
        The primary anchor needs a radius so placement can tell a point from a sliver.
    When to use:
        For the Natural Earth or continent label point.
    What to expect:
        The inscribed distance, in whole metres, from that point to the boundary of the polygon that holds it.
        The largest polygon is used when the point is outside every piece.
    Exceptions:
        None. A geometry with no polygon returns 0.
    """

    projected = to_mercator(geometry)
    point = to_mercator(Point(longitude, latitude))
    host = _polygon_containing(projected, point) or _largest_polygon(projected)
    if host is None:
        return 0
    return _whole_metres(host.boundary.distance(point))


def _polygon_containing(geometry: BaseGeometry, point: BaseGeometry) -> Polygon | None:
    """
    Why this exists:
        A label point belongs to one piece of a multipolygon.
    When to use:
        When measuring the primary anchor.
    What to expect:
        The polygon that covers ``point``, or ``None``.
    Exceptions:
        None.
    """

    if isinstance(geometry, Polygon):
        return geometry if geometry.covers(point) else None
    if not hasattr(geometry, "geoms"):
        return None
    for part in geometry.geoms:
        found = _polygon_containing(part, point)
        if found is not None:
            return found
    return None


def _largest_polygon(geometry: BaseGeometry) -> Polygon | None:
    """
    Why this exists:
        A cell clip can return a collection. The label belongs in the largest polygon.
    When to use:
        On a cell piece, after projecting it.
    What to expect:
        The polygon with the greatest area, or ``None`` when the piece has no polygon.
    Exceptions:
        None.
    """

    if geometry.is_empty:
        return None
    if isinstance(geometry, Polygon):
        return geometry
    if not hasattr(geometry, "geoms"):
        return None
    polygons = [part for part in geometry.geoms if isinstance(part, Polygon) and not part.is_empty]
    if not polygons:
        return None
    return max(polygons, key=lambda polygon: polygon.area)


def _geometry(value: object) -> BaseGeometry | None:
    """
    Why this exists:
        A feature with no geometry cannot hold an anchor.
    When to use:
        On the ``geometry`` member of a shapefile feature. Fiona returns its own geometry object, not a dict.
    What to expect:
        The shapely geometry, or ``None`` when it is missing or empty.
    Exceptions:
        ``ValueError`` or ``TypeError`` when the geometry cannot be read.
    """

    if value is None:
        return None
    geometry = shape(value)
    if geometry.is_empty:
        return None
    return geometry


def _continent_anchor(name: str) -> tuple[float, float] | None:
    """
    Why this exists:
        Natural Earth writes continent names in capitals. The anchor table is title case.
    When to use:
        When matching a continent feature to its fixed point.
    What to expect:
        The table point, or ``None`` when the name is not one of the seven continents.
    Exceptions:
        None.
    """

    folded = name.casefold()
    for key, anchor in CONTINENT_LABEL_ANCHORS.items():
        if key.casefold() == folded:
            return anchor
    return None


def _property(properties: dict[str, object], name: str) -> object:
    """
    Why this exists:
        Shapefile field names arrive uppercase from some readers and lowercase from others.
    When to use:
        Before reading one attribute.
    What to expect:
        The value, or ``None`` when the field is absent.
    Exceptions:
        None.
    """

    for key, value in properties.items():
        if str(key).lower() == name:
            return value
    return None


def _first_text(properties: dict[str, object], names: tuple[str, ...]) -> str:
    """
    Why this exists:
        A state name may be in ``name_en`` or only in ``name``.
    When to use:
        When choosing the displayed name.
    What to expect:
        The first non-empty value, or an empty string.
    Exceptions:
        None.
    """

    for name in names:
        text = _text(_property(properties, name))
        if text != "":
            return text
    return ""


def _text(value: object) -> str:
    """
    Why this exists:
        Names and ids are compared after trimming.
    When to use:
        On a shapefile attribute that should be text.
    What to expect:
        The stripped string, or an empty string when the value is null.
    Exceptions:
        None.
    """

    if value is None:
        return ""
    return str(value).strip()


def _number(value: object) -> int | float:
    """
    Why this exists:
        Ranks and minimum zooms are stored as numbers.
    When to use:
        On a numeric shapefile attribute.
    What to expect:
        An int when the value is whole, otherwise a float.
    Exceptions:
        ``ValueError`` when the value is not numeric.
    """

    number = float(value)  # type: ignore[arg-type]
    if number.is_integer():
        return int(number)
    return number


def _round_lat(latitude: float) -> float:
    """
    Why this exists:
        A label past the Mercator limit cannot be drawn on this map.
    When to use:
        On every stored latitude.
    What to expect:
        The latitude clamped to ``MERCATOR_MAX_LAT`` and rounded to 4 decimals.
    Exceptions:
        None.
    """

    clamped = max(-MERCATOR_MAX_LAT, min(MERCATOR_MAX_LAT, latitude))
    return round(clamped, 4)


def _whole_metres(distance: float) -> int:
    """
    Why this exists:
        The document stores the inscribed radius as an integer.
    When to use:
        After measuring a point against a polygon boundary.
    What to expect:
        The distance rounded half away from zero.
    Exceptions:
        None.
    """

    return int(math.copysign(math.floor(abs(distance) + 0.5), distance))
