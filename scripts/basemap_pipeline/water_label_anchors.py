"""Water place-name anchors for oceans, seas, gulfs, bays, straits, channels, and lakes.

The marine file has no label point, so the primary anchor is an interior point of the largest piece.
Straits and channels keep only that point.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import fiona
from shapely.geometry import box, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import polylabel

from scripts.basemap_pipeline.label_anchors import (
    first_label_text,
    fragment_anchors,
    label_number,
    label_property,
    label_text,
    largest_polygon,
    round_label_latitude,
    whole_metres,
)
from scripts.basemap_pipeline.vector_grid import to_lonlat, to_mercator
from scripts.basemap_pipeline.vector_settings import (
    COUNTRY_ANCHOR_CELL_DEG,
    COUNTRY_MIN_FRAGMENT_RADIUS_M,
    LAKE_LABEL_MAX_SCALERANK,
    LAKE_LABEL_SHP,
    MAJOR_LAKE_MAX_SCALERANK,
    MAJOR_MARINE_MAX_SCALERANK,
    MARINE_LABEL_CLASSES,
    MARINE_LABEL_SHP,
    MERCATOR_MAX_LAT,
    NARROW_MARINE_CLASSES,
    OCEAN_ANCHOR_CELL_DEG,
    OCEAN_MIN_FRAGMENT_RADIUS_M,
    POLYLABEL_TOLERANCE_M,
    STATE_ANCHOR_CELL_DEG,
    STATE_MIN_FRAGMENT_RADIUS_M,
)

LOGGER = logging.getLogger(__name__)


def load_water_features(data_root: Path) -> list[dict[str, object]]:
    """
    Why this exists:
        Oceans, seas, gulfs, bays, straits, channels, and large lakes share the place-name document.
    When to use:
        From ``build_label_document``, after the land features.
    What to expect:
        Marine features, then lakes. A strait or channel has ``"narrow": true`` and one anchor.
        Other records omit ``narrow``.
    Exceptions:
        ``fiona.errors.DriverError`` when a shapefile cannot be opened.
        ``ValueError`` when a rank or minimum zoom is not numeric.
    """

    LOGGER.debug("load_water_features root=%s", data_root)
    return [
        *_features_from(data_root / MARINE_LABEL_SHP, _marine_record),
        *_features_from(data_root / LAKE_LABEL_SHP, _lake_record),
    ]


@dataclass(frozen=True)
class _WaterIdentity:
    """
    Why this exists:
        The name, kind, and rank are known before the geometry is read.
    When to use:
        As the argument to ``_record_from_feature``.
    What to expect:
        The fields stored on a water feature, including whether it is narrow.
    Exceptions:
        None.
    """

    kind: str
    feature_id: str
    name: str
    rank: int | float
    min_zoom: int | float
    narrow: bool


@dataclass(frozen=True)
class _WaterLabel:
    """
    Why this exists:
        A water record has more fields than a function should take one by one.
    When to use:
        As the argument to ``_water_record``.
    What to expect:
        The identity, whether fragment anchors are skipped, and the grid used when they are not.
    Exceptions:
        None.
    """

    kind: str
    feature_id: str
    name: str
    rank: int | float
    min_zoom: int | float
    narrow: bool
    geometry: BaseGeometry
    cell_deg: float
    min_radius_m: float


def _features_from(path: Path, read_record) -> list[dict[str, object]]:
    """
    Why this exists:
        Marine polygons and lakes are the same loop with different field rules.
    When to use:
        From ``load_water_features``, once per shapefile.
    What to expect:
        The records ``read_record`` kept. A debug line names the path and the kept count.
    Exceptions:
        ``fiona.errors.DriverError`` when ``path`` cannot be opened.
    """

    LOGGER.debug("load water labels path=%s", path)
    features: list[dict[str, object]] = []
    with fiona.open(path) as opened:
        for feature in opened:
            record = read_record(feature)
            if record is not None:
                features.append(record)
    LOGGER.debug("load water labels path=%s kept=%s", path, len(features))
    return features


def _marine_record(feature: dict[str, object]) -> dict[str, object] | None:
    """
    Why this exists:
        Only oceans, seas, gulfs, bays, straits, and channels are named.
    When to use:
        On one marine shapefile feature.
    What to expect:
        A water record, or ``None`` when the class, name, id, minimum zoom, or geometry is unusable.
    Exceptions:
        ``ValueError`` when the rank or minimum zoom is not numeric.
    """

    properties = _properties(feature)
    feature_class = label_text(label_property(properties, "featurecla")).lower()
    if feature_class not in MARINE_LABEL_CLASSES:
        return None
    name = first_label_text(properties, ("name_en", "name"))
    identifier = label_text(label_property(properties, "ne_id"))
    min_label = label_property(properties, "min_label")
    if name == "" or identifier == "" or min_label is None:
        return None
    rank = _rank(properties)
    if feature_class == "ocean":
        kind = "ocean"
    elif rank <= MAJOR_MARINE_MAX_SCALERANK:
        kind = "major_water"
    else:
        kind = "minor_water"
    return _record_from_feature(
        _WaterIdentity(
            kind,
            f"marine:{identifier}",
            name,
            rank,
            label_number(min_label),
            feature_class in NARROW_MARINE_CLASSES,
        ),
        feature,
    )


def _lake_record(feature: dict[str, object]) -> dict[str, object] | None:
    """
    Why this exists:
        Large lakes use the lake name, including the word Lake, rather than the short English form.
    When to use:
        On one lake shapefile feature. The feature class is not filtered.
    What to expect:
        A major or minor water record, or ``None`` when the lake is small, unnamed, or has no geometry.
    Exceptions:
        ``ValueError`` when the rank or minimum zoom is not numeric.
    """

    properties = _properties(feature)
    rank_value = label_property(properties, "scalerank")
    if rank_value is None:
        return None
    rank = label_number(rank_value)
    if rank > LAKE_LABEL_MAX_SCALERANK:
        return None
    name = first_label_text(properties, ("name", "name_en"))
    identifier = label_text(label_property(properties, "ne_id"))
    min_label = label_property(properties, "min_label")
    if name == "" or identifier == "" or min_label is None:
        return None
    kind = "major_water" if rank <= MAJOR_LAKE_MAX_SCALERANK else "minor_water"
    return _record_from_feature(
        _WaterIdentity(kind, f"lake:{identifier}", name, rank, label_number(min_label), False),
        feature,
    )


def _record_from_feature(identity: _WaterIdentity, feature: dict[str, object]) -> dict[str, object] | None:
    """
    Why this exists:
        Marine and lake records share the geometry and anchor steps.
    When to use:
        After the identity fields are known.
    What to expect:
        A document feature, or ``None`` when the geometry is missing or lies outside the Mercator limit.
    Exceptions:
        ``ValueError`` or ``TypeError`` when the geometry cannot be read.
    """

    geometry = _geometry(feature.get("geometry"))
    if geometry is None:
        return None
    cell_deg, min_radius_m = _anchor_limits(identity.kind)
    return _water_record(_WaterLabel(
        identity.kind,
        identity.feature_id,
        identity.name,
        identity.rank,
        identity.min_zoom,
        identity.narrow,
        geometry,
        cell_deg,
        min_radius_m,
    ))


def _anchor_limits(kind: str) -> tuple[float, float]:
    """
    Why this exists:
        Oceans, major water, and minor water use different fragment grids.
    When to use:
        Before building anchors. A narrow record ignores the result.
    What to expect:
        The cell size in degrees and the minimum fragment radius in metres.
    Exceptions:
        None.
    """

    if kind == "ocean":
        return OCEAN_ANCHOR_CELL_DEG, OCEAN_MIN_FRAGMENT_RADIUS_M
    if kind == "major_water":
        return COUNTRY_ANCHOR_CELL_DEG, COUNTRY_MIN_FRAGMENT_RADIUS_M
    return STATE_ANCHOR_CELL_DEG, STATE_MIN_FRAGMENT_RADIUS_M


def _water_record(pending: _WaterLabel) -> dict[str, object] | None:
    """
    Why this exists:
        The primary anchor is an interior point, because these shapefiles have no label point.
    When to use:
        After a water feature's identity and geometry are known.
    What to expect:
        A document feature. Fragment anchors follow the primary anchor unless the body is narrow.
        ``narrow`` is written only when it is true.
    Exceptions:
        None. An empty clip or a geometry with no polygon returns ``None``.
    """

    clipped = pending.geometry.intersection(box(-180, -MERCATOR_MAX_LAT, 180, MERCATOR_MAX_LAT))
    if clipped.is_empty:
        return None
    polygon = largest_polygon(to_mercator(clipped))
    if polygon is None:
        return None
    point = polylabel(polygon, POLYLABEL_TOLERANCE_M)
    located = to_lonlat(point)
    anchors: list[list[float | int]] = [[
        round_label_latitude(located.y),
        round(located.x, 4),
        whole_metres(polygon.boundary.distance(point)),
    ]]
    if not pending.narrow:
        anchors.extend(fragment_anchors(clipped, pending.cell_deg, pending.min_radius_m))
    record: dict[str, object] = {
        "id": pending.feature_id,
        "kind": pending.kind,
        "name": pending.name,
        "rank": pending.rank,
        "min_zoom": pending.min_zoom,
        "anchors": anchors,
    }
    if pending.narrow:
        record["narrow"] = True
    return record


def _rank(properties: dict[str, object]) -> int | float:
    """
    Why this exists:
        A missing rank should not reject a named marine body.
    When to use:
        On a marine record that already has a name and a minimum zoom.
    What to expect:
        The numeric scalerank, or 0 when the field is absent.
    Exceptions:
        ``ValueError`` when the value is not numeric.
    """

    value = label_property(properties, "scalerank")
    if value is None:
        return 0
    return label_number(value)


def _properties(feature: dict[str, object]) -> dict[str, object]:
    """
    Why this exists:
        Fiona may omit the properties member.
    When to use:
        Before reading fields.
    What to expect:
        A dictionary copied from a mapping, including a Fiona properties object, or an empty dictionary.
    Exceptions:
        None.
    """

    properties = feature.get("properties") or {}
    try:
        return {str(key): value for key, value in properties.items()}
    except AttributeError:
        return {}


def _geometry(value: object) -> BaseGeometry | None:
    """
    Why this exists:
        A feature with no geometry cannot hold an anchor.
    When to use:
        On the ``geometry`` member of a shapefile feature.
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
