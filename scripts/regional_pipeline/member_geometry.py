"""Load Natural Earth admin polygons and build one region's member land."""

from __future__ import annotations

import logging
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Any

import fiona
from pyproj import CRS, Transformer
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import transform, unary_union
from shapely.validation import make_valid

from .region_models import RegionDefinition

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True, eq=False)
class AdminLayers:
    """
    Why this exists:
        Keep admin-0 and admin-1 polygons in memory for membership tests and member geometry.
    When to use:
        After ``load_admin_layers``, before validating codes or building a footprint.
    What to expect:
        Geometries are valid WGS84 polygons. Admin-1 records are ``(adm0_a3, iso_3166_2, geometry)``.
    """

    # Admin-0 code to country geometry.
    admin0_by_code: Mapping[str, BaseGeometry]
    # Every admin-1 polygon with its country code and ``iso_3166_2`` code.
    admin1_records: tuple[tuple[str, str, BaseGeometry], ...]

    def __post_init__(self) -> None:
        """
        Why this exists:
            Freeze the admin-0 map.
        When to use:
            Called by the dataclass constructor.
        What to expect:
            ``admin0_by_code`` becomes a mapping proxy.
        """

        object.__setattr__(self, "admin0_by_code", MappingProxyType(dict(self.admin0_by_code)))


def _resolve_field_names(schema_props: dict[str, Any], required_fields: tuple[str, ...]) -> dict[str, str]:
    """
    Why this exists:
        Match Natural Earth field names when the shapefile uses a different letter case.
    When to use:
        While reading admin-0 and admin-1 properties.
    What to expect:
        A map from the requested name to the schema key.
    Exceptions:
        ``ValueError`` when a requested field is missing.
    """

    folded = {key.casefold(): key for key in schema_props}
    resolved: dict[str, str] = {}
    missing: list[str] = []
    for required in required_fields:
        actual = folded.get(required.casefold())
        if actual is None:
            missing.append(required)
        else:
            resolved[required] = actual
    if missing:
        raise ValueError(f"Shapefile is missing required fields: {', '.join(missing)}")
    return resolved


def _to_wgs84(feature_geometry: object, xy_transform: Any | None) -> BaseGeometry | None:
    """
    Why this exists:
        Turn one Fiona geometry into a valid WGS84 polygon.
    When to use:
        For every admin feature while loading layers.
    What to expect:
        None for empty geometry. Invalid polygons are repaired with ``make_valid``.
    """

    if feature_geometry is None:
        return None
    geom = shape(feature_geometry)
    if geom.is_empty:
        return None
    if xy_transform is not None:
        geom = transform(xy_transform, geom)
    geom = make_valid(geom)
    if geom.is_empty:
        return None
    return geom


def _xy_transform(collection: fiona.Collection) -> Any | None:
    """
    Why this exists:
        Reproject a shapefile that is not already WGS84.
    When to use:
        Once per admin shapefile.
    What to expect:
        None when the source is EPSG:4326. Otherwise a transform callable.
    """

    if collection.crs is None:
        return None
    source = CRS.from_user_input(collection.crs)
    if source.equals(CRS.from_epsg(4326)):
        return None
    return Transformer.from_crs(source, CRS.from_epsg(4326), always_xy=True).transform


def load_admin_layers(data_root: Path) -> AdminLayers:
    """
    Why this exists:
        Read the admin-0 and admin-1 shapefiles used to decide member land.
    When to use:
        Once per process before validating codes or building footprints.
    What to expect:
        One geometry per admin-0 code and one record per admin-1 feature.
    Exceptions:
        ``FileNotFoundError`` when a shapefile is missing, and ``ValueError`` when a required field is missing.
    """

    LOGGER.debug("load_admin_layers data_root=%s.", data_root)
    countries_path = data_root / "ne_10m_admin_0_countries.shp"
    states_path = data_root / "ne_10m_admin_1_states_provinces.shp"
    admin0: dict[str, BaseGeometry] = {}
    admin1: list[tuple[str, str, BaseGeometry]] = []
    try:
        with fiona.open(countries_path) as countries:
            fields = _resolve_field_names(dict(countries.schema["properties"]), ("ADM0_A3",))
            xy = _xy_transform(countries)
            for feature in countries:
                props = feature.get("properties") or {}
                code = str(props.get(fields["ADM0_A3"]) or "").strip()
                geom = _to_wgs84(feature.get("geometry"), xy)
                if code and geom is not None:
                    admin0[code] = geom
        with fiona.open(states_path) as states:
            fields = _resolve_field_names(dict(states.schema["properties"]), ("adm0_a3", "iso_3166_2"))
            xy = _xy_transform(states)
            for feature in states:
                props = feature.get("properties") or {}
                adm0 = str(props.get(fields["adm0_a3"]) or "").strip()
                iso = str(props.get(fields["iso_3166_2"]) or "").strip()
                geom = _to_wgs84(feature.get("geometry"), xy)
                if adm0 and iso and geom is not None:
                    admin1.append((adm0, iso, geom))
    except Exception:
        LOGGER.error("Failed to load admin layers from %s.", data_root, exc_info=True)
        raise
    LOGGER.info("Loaded %d admin-0 and %d admin-1 geometries.", len(admin0), len(admin1))
    return AdminLayers(admin0_by_code=admin0, admin1_records=tuple(admin1))


def validate_member_codes(definition: RegionDefinition, layers: AdminLayers) -> None:
    """
    Why this exists:
        Catch catalog codes that are not in this Natural Earth edition before a footprint is built.
    When to use:
        During validate, once layers are loaded.
    What to expect:
        Returns when every admin-0 and admin-1 code exists and each admin-1 code belongs to its member.
    Exceptions:
        ``ValueError`` listing every unknown or mismatched code.
    """

    LOGGER.debug("validate_member_codes region=%s members=%d.", definition.region_id, len(definition.members))
    admin1_owner = {iso: adm0 for adm0, iso, _geom in layers.admin1_records}
    problems: list[str] = []
    for member in definition.members:
        if member.adm0_a3 not in layers.admin0_by_code:
            problems.append(f"unknown ADM0_A3 {member.adm0_a3}")
        for code in member.include_admin1 + member.exclude_admin1:
            owner = admin1_owner.get(code)
            if owner is None:
                problems.append(f"unknown iso_3166_2 {code}")
            elif owner != member.adm0_a3:
                problems.append(f"{code} belongs to {owner}, not {member.adm0_a3}")
    if problems:
        message = f"{definition.region_id}: " + "; ".join(problems)
        raise ValueError(message)


def build_member_geometry(definition: RegionDefinition, layers: AdminLayers) -> BaseGeometry:
    """
    Why this exists:
        Union the land that can count as member land for one region.
    When to use:
        While building footprint candidates.
    What to expect:
        A whole country uses its admin-0 polygon. An include or exclude list uses that country's admin-1 polygons.
    """

    LOGGER.debug("build_member_geometry region=%s.", definition.region_id)
    parts: list[BaseGeometry] = []
    for member in definition.members:
        if not member.include_admin1 and not member.exclude_admin1:
            parts.append(layers.admin0_by_code[member.adm0_a3])
            continue
        selected = [
            geom
            for adm0, iso, geom in layers.admin1_records
            if adm0 == member.adm0_a3
            and (not member.include_admin1 or iso in member.include_admin1)
            and iso not in member.exclude_admin1
        ]
        parts.append(unary_union(selected))
    return unary_union(parts)
