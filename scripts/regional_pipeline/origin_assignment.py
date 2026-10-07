"""Assign origin areas and side groups for one regional pack.

The step reads the manifest and admin polygons. It does not read tactical metadata.
A tactical cell is claimed by the admin polygon that contains its center. When more
than one polygon contains the center, the larger land overlap wins.
"""

from __future__ import annotations

import json
import logging
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import fiona
import h3
from shapely import STRtree
from shapely.geometry.base import BaseGeometry
from shapely.validation import make_valid

from scripts.naming_pipeline.country_codes import build_country_code_by_adm0_a3
from scripts.terrain_pipeline.metadata_io import write_json_document
from scripts.terrain_pipeline.sampling import cell_polygon

from .member_geometry import _resolve_field_names, _to_wgs84, _xy_transform
from .region_catalog import region_by_id
from .region_models import HexRole, RegionDefinition
from .region_paths import REGIONAL_QA_DIR, RegionPaths
from .side_group_catalog import (
    AdminArea,
    SideGroupRule,
    groups_for_region,
    origin_identity,
    side_group_for,
)

LOGGER = logging.getLogger(__name__)

# Manifest versions this step can read. The step writes 1.1.0.
_READABLE_SCHEMAS = frozenset({"1.0.0", "1.1.0"})
_WRITTEN_SCHEMA = "1.1.0"
_ORIGIN_SCHEMA = "1.0.0"


@dataclass(frozen=True)
class _PlacedArea:
    """
    Why this exists:
        Keep one admin polygon together with the catalog area it represents.
    When to use:
        While claiming tactical cells.
    What to expect:
        ``member`` is false for provinces outside the map's member filters.
        ``group`` is set only for members.
    """

    # Catalog fields.
    area: AdminArea
    # Valid WGS84 geometry.
    geometry: BaseGeometry
    # True when the province is inside the map's member list.
    member: bool
    # Side group for a member province.
    group: SideGroupRule | None


def _is_member(definition: RegionDefinition, adm0_a3: str, iso_3166_2: str | None) -> bool:
    """
    Why this exists:
        Apply the catalog include and exclude lists.
    When to use:
        Once per admin-1 feature.
    What to expect:
        False for a country that is not a member, an excluded province, or a province outside an include list.
    """

    for member in definition.members:
        if member.adm0_a3 != adm0_a3:
            continue
        if member.include_admin1 and iso_3166_2 not in member.include_admin1:
            return False
        if member.exclude_admin1 and iso_3166_2 in member.exclude_admin1:
            return False
        return True
    return False


def _load_country_codes(data_root: Path) -> dict[str, str | None]:
    """
    Why this exists:
        Map admin-0 codes to alpha-2 codes for origin ids.
    When to use:
        Once per origins run.
    What to expect:
        The same map the naming pipeline builds from the countries shapefile.
    """

    LOGGER.debug("_load_country_codes data_root=%s.", data_root)
    path = data_root / "ne_10m_admin_0_countries.shp"
    with fiona.open(path) as countries:
        fields = _resolve_field_names(dict(countries.schema["properties"]), ("ADM0_A3", "ISO_A2_EH", "ISO_A2"))
        rows = [
            (feature["properties"].get(fields["ADM0_A3"]), feature["properties"].get(fields["ISO_A2_EH"]), feature["properties"].get(fields["ISO_A2"]))
            for feature in countries
        ]
    return build_country_code_by_adm0_a3(rows)


def _load_areas(definition: RegionDefinition, data_root: Path, country_codes: dict[str, str | None]) -> list[_PlacedArea]:
    """
    Why this exists:
        Read admin-1 polygons and attach a side group to each member province.
    When to use:
        Once per region.
    What to expect:
        Member provinces that match no group raise. Non-members are kept so neutral-border land still has an origin.
    Exceptions:
        ``ValueError`` from the catalog when a member province matches no group.
    """

    LOGGER.debug("_load_areas region=%s.", definition.region_id)
    path = data_root / "ne_10m_admin_1_states_provinces.shp"
    placed: list[_PlacedArea] = []
    problems: list[str] = []
    with fiona.open(path) as states:
        fields = _resolve_field_names(
            dict(states.schema["properties"]),
            ("adm0_a3", "iso_3166_2", "name", "region", "region_sub", "latitude", "longitude"),
        )
        transform = _xy_transform(states)
        for feature in states:
            props = feature["properties"]
            adm0 = str(props.get(fields["adm0_a3"]) or "").strip()
            if not adm0:
                continue
            geometry = _to_wgs84(feature["geometry"], transform)
            if geometry is None or geometry.is_empty:
                continue
            if not geometry.is_valid:
                geometry = make_valid(geometry)
            iso = str(props.get(fields["iso_3166_2"]) or "").strip() or None
            area = AdminArea(
                adm0_a3=adm0,
                iso_3166_2=iso,
                name=str(props.get(fields["name"]) or iso or adm0),
                region=str(props.get(fields["region"]) or "").strip() or None,
                region_sub=str(props.get(fields["region_sub"]) or "").strip() or None,
                latitude=float(props.get(fields["latitude"]) or 0.0),
                longitude=float(props.get(fields["longitude"]) or 0.0),
                country_code=country_codes.get(adm0) or "",
            )
            member = _is_member(definition, adm0, iso)
            group = None
            if member:
                try:
                    group = side_group_for(definition.region_id, area)
                except ValueError as exc:
                    if definition.centroid_box.contains(area.latitude, area.longitude):
                        problems.append(str(exc))
                        continue
                    LOGGER.info(
                        "Skipping %s %s; its centroid is outside %s.",
                        adm0,
                        area.name,
                        definition.region_id,
                    )
                    member = False
            placed.append(_PlacedArea(area=area, geometry=geometry, member=member, group=group))
    if problems:
        LOGGER.error("%s has %d unmatched member provinces.", definition.region_id, len(problems))
        raise ValueError("\n".join(problems))
    LOGGER.info("Loaded %d admin areas for %s.", len(placed), definition.region_id)
    return placed


def _h3_shape(geometry: BaseGeometry) -> Any | None:
    """
    Why this exists:
        Convert a shapefile polygon into the shape h3 fills with cells.
    When to use:
        Once per admin polygon.
    What to expect:
        None when the geometry has no polygon rings. Latitudes and longitudes are swapped into h3 order.
    """

    polygons = [geometry] if geometry.geom_type == "Polygon" else list(getattr(geometry, "geoms", []))
    shapes: list[Any] = []
    for polygon in polygons:
        if polygon.geom_type != "Polygon" or polygon.exterior is None:
            continue
        outer = [(lat, lng) for lng, lat in polygon.exterior.coords]
        holes = [[(lat, lng) for lng, lat in ring.coords] for ring in polygon.interiors]
        shapes.append(h3.LatLngPoly(outer, *holes))
    if not shapes:
        return None
    if len(shapes) == 1:
        return shapes[0]
    return h3.LatLngMultiPoly(*shapes)


def _near_footprint(definition: RegionDefinition, geometry: BaseGeometry) -> bool:
    """
    Why this exists:
        Keep neutral-border provinces next to the map and skip the rest of the world.
    When to use:
        Before filling tactical cells.
    What to expect:
        True when the geometry's bounds meet the catalog window expanded by 20 degrees.
        A window that crosses the antimeridian keeps any geometry in that latitude band.
    """

    min_lng, min_lat, max_lng, max_lat = geometry.bounds
    box = definition.centroid_box
    if max_lat < box.lat_min - 20 or min_lat > box.lat_max + 20:
        return False
    if box.lon_min > box.lon_max:
        return True
    return not (max_lng < box.lon_min - 20 or min_lng > box.lon_max + 20)


def _claim_cells(areas: list[_PlacedArea], resolution: int) -> dict[str, list[int]]:
    """
    Why this exists:
        Find tactical cells whose centers fall in each admin polygon.
    When to use:
        After admin polygons are loaded.
    What to expect:
        A map from cell id to area indexes. A polygon h3 cannot fill is skipped and logged.
    """

    LOGGER.debug("_claim_cells areas=%d resolution=%d.", len(areas), resolution)
    claimed: dict[str, list[int]] = {}
    for index, placed in enumerate(areas):
        try:
            shape_arg = _h3_shape(placed.geometry)
            if shape_arg is None:
                continue
            cells = h3.polygon_to_cells(shape_arg, resolution)
        except Exception:
            LOGGER.error("Could not fill cells for %s %s.", placed.area.adm0_a3, placed.area.name, exc_info=True)
            continue
        for cell in cells:
            claimed.setdefault(cell, []).append(index)
    LOGGER.info("Claimed %d tactical cells.", len(claimed))
    return claimed


def _winner(cell: str, indexes: list[int], areas: list[_PlacedArea]) -> _PlacedArea:
    """
    Why this exists:
        Pick one province when several contain the same cell center.
    When to use:
        For a contested tactical cell.
    What to expect:
        The province with the larger polygon overlap. Equal area keeps the earlier index.
    """

    if len(indexes) == 1:
        return areas[indexes[0]]
    polygon = cell_polygon(cell)
    best_index = indexes[0]
    best_area = -1.0
    for index in indexes:
        overlap = polygon.intersection(areas[index].geometry).area
        if overlap > best_area:
            best_area = overlap
            best_index = index
    return areas[best_index]


def _origin_record(region_id: str, placed: _PlacedArea) -> tuple[str, str, str, str | None]:
    """
    Why this exists:
        Turn a winning province into the origin fields stored on a cell.
    When to use:
        For each claimed tactical cell inside the footprint.
    What to expect:
        Id, display name, country code, and ISO 3166-2 or null. A missing country code uses the admin-0 code.
    """

    area = placed.area
    if not area.country_code:
        area = AdminArea(
            adm0_a3=area.adm0_a3,
            iso_3166_2=area.iso_3166_2,
            name=area.name,
            region=area.region,
            region_sub=area.region_sub,
            latitude=area.latitude,
            longitude=area.longitude,
            country_code=area.adm0_a3,
        )
        placed = _PlacedArea(area=area, geometry=placed.geometry, member=placed.member, group=placed.group)
    origin_id, display_name, iso_code = origin_identity(region_id, placed.area)
    return origin_id, display_name, placed.area.country_code, iso_code


def assign_region_origins(region_id: str, data_root: Path, *, force: bool = False) -> dict[str, int]:
    """
    Why this exists:
        Write side groups onto one manifest and origin ids onto tactical land cells.
    When to use:
        After the footprint manifest exists. Safe to repeat.
    What to expect:
        Skips a region whose manifest is already schema 1.1.0 unless ``force`` is set.
        Land hex counts per group are returned. A group with no land hex, or a land hex with no group, raises.
    Exceptions:
        ``ValueError`` when the manifest is missing, the schema is unknown, or the groups do not partition land hexes.
    """

    LOGGER.debug("assign_region_origins region=%s force=%s.", region_id, force)
    definition = region_by_id(region_id)
    paths = RegionPaths.for_region(region_id)
    if not paths.manifest.is_file():
        raise ValueError(f"{paths.manifest} is missing.")
    document = json.loads(paths.manifest.read_text(encoding="utf-8"))
    if document.get("schema_version") not in _READABLE_SCHEMAS:
        raise ValueError(f"{paths.manifest}: schema_version must be 1.0.0 or 1.1.0.")
    if document.get("schema_version") == _WRITTEN_SCHEMA and paths.origin_units_t.is_file() and not force:
        LOGGER.info("Skipping %s; side groups are already written.", region_id)
        return _group_counts(document)

    roles = {str(entry["h3_index"]): HexRole(str(entry["role"])) for entry in document["hexes"]}
    country_codes = _load_country_codes(data_root)
    areas = [area for area in _load_areas(definition, data_root, country_codes) if area.member or _near_footprint(definition, area.geometry)]
    LOGGER.info("Filling cells from %d admin areas for %s.", len(areas), region_id)
    claimed = _claim_cells(areas, definition.tactical_resolution)
    footprint = set(roles)
    winners: dict[str, _PlacedArea] = {}
    for cell, indexes in claimed.items():
        parent = h3.cell_to_parent(cell, definition.strategic_resolution)
        if parent not in footprint:
            continue
        winners[cell] = _winner(cell, indexes, areas)

    member_slots = [index for index, placed in enumerate(areas) if placed.member]
    member_tree = STRtree([areas[index].geometry for index in member_slots]) if member_slots else None

    def member_owner(child: str) -> _PlacedArea | None:
        """
        Why this exists:
            Recover a member province when the cell center falls outside every polygon.
        When to use:
            For a tactical child of a land hex that center-in-polygon did not claim.
        What to expect:
            The member polygon with the largest overlap, or None when the cell misses member land.
        """

        placed = winners.get(child)
        if placed is not None and placed.member:
            return placed
        if member_tree is None:
            return None
        polygon = cell_polygon(child)
        best: _PlacedArea | None = None
        best_overlap = 0.0
        for hit in member_tree.query(polygon):
            candidate = areas[member_slots[int(hit)]]
            overlap = polygon.intersection(candidate.geometry).area
            if overlap > best_overlap:
                best_overlap = overlap
                best = candidate
        if best is not None:
            winners[child] = best
        return best

    group_counts: Counter[str] = Counter()
    hex_groups: dict[str, str] = {}
    for strategic, role in roles.items():
        if role is not HexRole.LAND:
            continue
        votes: Counter[str] = Counter()
        for child in h3.cell_to_children(strategic, definition.tactical_resolution):
            placed = member_owner(child)
            if placed is None or placed.group is None:
                continue
            votes[placed.group.group_id] += 1
        if not votes:
            center = h3.cell_to_latlng(strategic)
            point_lng = center[1]
            point_lat = center[0]
            nearest = min(
                (areas[index] for index in member_slots),
                key=lambda placed: (placed.area.latitude - point_lat) ** 2 + (placed.area.longitude - point_lng) ** 2,
                default=None,
            )
            if nearest is None or nearest.group is None:
                raise ValueError(f"{region_id}: land hex {strategic} has no member tactical cells.")
            LOGGER.info(
                "%s land hex %s has no overlapping member cells; using nearest province %s.",
                region_id,
                strategic,
                nearest.area.name,
            )
            votes[nearest.group.group_id] = 1
        chosen = sorted(votes.items(), key=lambda item: (-item[1], item[0]))[0][0]
        hex_groups[strategic] = chosen
        group_counts[chosen] += 1

    expected = groups_for_region(region_id)
    missing = [rule.display_name for rule in expected if group_counts[rule.group_id] == 0]
    if missing:
        raise ValueError(f"{region_id}: side groups with no land hexes: {', '.join(missing)}.")
    land_total = sum(1 for role in roles.values() if role is HexRole.LAND)
    if sum(group_counts.values()) != land_total:
        raise ValueError(f"{region_id}: group hexes {sum(group_counts.values())} != land hexes {land_total}.")

    origin_units: dict[str, dict[str, Any]] = {}
    records: list[dict[str, str]] = []
    for cell, placed in sorted(winners.items()):
        origin_id, display_name, country_code, iso_code = _origin_record(region_id, placed)
        records.append({"h3_index": cell, "origin_id": origin_id})
        origin_units.setdefault(origin_id, {
            "id": origin_id,
            "name": display_name,
            "country_code": country_code,
            "iso_3166_2": iso_code,
        })

    for entry in document["hexes"]:
        entry.pop("side_group_id", None)
        group_id = hex_groups.get(str(entry["h3_index"]))
        if group_id is not None:
            entry["side_group_id"] = group_id
    document["schema_version"] = _WRITTEN_SCHEMA
    document["side_groups"] = [
        {"id": rule.group_id, "display_name": rule.display_name, "land_hex_count": group_counts[rule.group_id]}
        for rule in expected
    ]
    document["origin_units"] = [origin_units[key] for key in sorted(origin_units)]
    write_json_document(paths.manifest, document)
    write_json_document(paths.origin_units_t, {
        "schema_version": _ORIGIN_SCHEMA,
        "region_id": region_id,
        "resolution": definition.tactical_resolution,
        "record_count": len(records),
        "records": records,
    })
    _write_qa(region_id, {rule.group_id: group_counts[rule.group_id] for rule in expected}, land_total, len(origin_units))
    LOGGER.info(
        "Wrote side groups for %s land_hexes=%d origin_units=%d.",
        region_id,
        land_total,
        len(origin_units),
    )
    return dict(group_counts)


def _group_counts(document: dict[str, Any]) -> dict[str, int]:
    """
    Why this exists:
        Report group sizes from a manifest that was already upgraded.
    When to use:
        When the origins step skips a finished region.
    What to expect:
        A map of group id to land hex count.
    """

    counts: Counter[str] = Counter()
    for entry in document["hexes"]:
        group_id = entry.get("side_group_id")
        if group_id:
            counts[str(group_id)] += 1
    return dict(counts)


def _write_qa(region_id: str, counts: dict[str, int], land_total: int, origin_count: int) -> None:
    """
    Why this exists:
        Keep one cross-region QA file the check can be read by a person.
    When to use:
        After a region is written.
    What to expect:
        Updates that region's entry and leaves other regions in the file alone.
    """

    REGIONAL_QA_DIR.mkdir(parents=True, exist_ok=True)
    path = REGIONAL_QA_DIR / "side_groups_qa.json"
    existing: dict[str, Any] = {"regions": {}}
    if path.is_file():
        existing = json.loads(path.read_text(encoding="utf-8"))
    regions = existing.setdefault("regions", {})
    regions[region_id] = {
        "land_hexes": land_total,
        "origin_units": origin_count,
        "groups": counts,
    }
    write_json_document(path, existing)
