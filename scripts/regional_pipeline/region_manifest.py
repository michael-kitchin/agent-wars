"""Read and write the JSON manifest for one regional pack."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Final

import h3

from scripts.terrain_pipeline.config import build_default_config
from scripts.terrain_pipeline.metadata_io import write_json_document
from scripts.terrain_pipeline.resolution_profile import topo_keys_for_resolution

from .footprint import MEMBER_SHARE_MIN, MIN_LAND_KM2, MIN_SEA_RINGS
from .region_catalog import region_by_id
from .region_models import HexRole, RegionDefinition, RegionFootprint
from .region_paths import (
    LANDMASS_S_FILENAME,
    METADATA_S_FILENAME,
    METADATA_T_FILENAME,
    NAMING_S_FILENAME,
    NAMING_T_FILENAME,
    ROAD_RAIL_SIDES_T_FILENAME,
    ROAD_RAIL_VECTORS_T_FILENAME,
    RegionPaths,
    WEATHER_S_FILENAME,
)
from .regional_scaling import island_min_area_km2_for, minor_island_max_km2_for, weather_water_land_steps_for
from .scalerank_policy import ScalerankPolicy, policy_to_json

LOGGER = logging.getLogger(__name__)

# Schema written by footprint classification, before side groups are attached.
MANIFEST_SCHEMA_VERSION: Final = "1.0.0"
# Schemas a reader accepts. Side-group output uses 1.1.0.
ACCEPTED_MANIFEST_SCHEMA_VERSIONS: Final = frozenset({"1.0.0", "1.1.0", "1.2.0"})
# Schema required once side groups have been written.
SIDE_GROUP_MANIFEST_SCHEMA_VERSION: Final = "1.1.0"
# Schema written once economy and side-group balance are stored.
ECONOMY_MANIFEST_SCHEMA_VERSION: Final = "1.2.0"


@dataclass(frozen=True)
class RegionManifest:
    """
    Why this exists:
        Carry the catalog identity, overlay policy, and footprint loaded from a manifest file.
    When to use:
        After ``read_manifest``, before a regional export step.
    What to expect:
        ``footprint`` lists the strategic cells and their roles. Display name and policy match the file.
    """

    # Catalog id.
    region_id: str
    # Human-readable map name from the file.
    display_name: str
    # Overlay ceilings recorded in the file.
    policy: ScalerankPolicy
    # Strategic cells and roles.
    footprint: RegionFootprint


def build_manifest_document(
    definition: RegionDefinition,
    footprint: RegionFootprint,
    policy: ScalerankPolicy,
) -> dict[str, Any]:
    """
    Why this exists:
        Assemble the manifest JSON for one classified footprint.
    When to use:
        When ``footprint --write`` saves a region.
    What to expect:
        Derived constants come from the scaling helpers and the resolution profile, not from hand-entered numbers.
        Hexes are sorted by cell id.
    """

    LOGGER.debug("build_manifest_document region=%s hexes=%d.", definition.region_id, len(footprint.roles))
    config = build_default_config()
    counts = footprint.counts()
    return {
        "schema_version": MANIFEST_SCHEMA_VERSION,
        "region_id": definition.region_id,
        "display_name": definition.display_name,
        "res_s": definition.strategic_resolution,
        "res_t": definition.tactical_resolution,
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "scalerank_policy": policy_to_json(policy),
        "derived_constants": {
            "island_min_area_km2": island_min_area_km2_for(definition.strategic_resolution, config.island_min_area_km2),
            "weather_water_land_steps": weather_water_land_steps_for(definition.strategic_resolution),
            "land_water_threshold_pct": config.land_water_threshold_pct,
            "strategic_sample_count": config.area_weighted_samples_per_cell_res1,
            "tactical_sample_count": config.area_weighted_samples_per_cell_res4,
            "strategic_topo_keys": list(topo_keys_for_resolution(definition.strategic_resolution)),
            "tactical_topo_keys": list(topo_keys_for_resolution(definition.tactical_resolution)),
        },
        "footprint": {
            "rules": {
                "min_land_km2": MIN_LAND_KM2,
                "member_share_min": MEMBER_SHARE_MIN,
                "sea_reach_km": definition.sea_reach_km,
                "neutral_reach_km": definition.neutral_reach_km,
                "desert_trim_reach_km": definition.desert_trim_reach_km,
                "min_sea_rings": MIN_SEA_RINGS,
                "minor_island_max_km2": minor_island_max_km2_for(definition.strategic_resolution),
            },
            "targets": {
                "land": definition.targets.land,
                "sea": definition.targets.sea,
                "neutral_border": definition.targets.neutral_border,
            },
            "actual": {
                "land": counts.land,
                "sea": counts.sea,
                "neutral_border": counts.neutral_border,
            },
        },
        "files": {
            "metadata_s": METADATA_S_FILENAME,
            "metadata_t": METADATA_T_FILENAME,
            "naming_s": NAMING_S_FILENAME,
            "naming_t": NAMING_T_FILENAME,
            "landmass_s": LANDMASS_S_FILENAME,
            "weather_s": WEATHER_S_FILENAME,
            "road_rail_sides_t": ROAD_RAIL_SIDES_T_FILENAME,
            "road_rail_vectors_t": ROAD_RAIL_VECTORS_T_FILENAME,
        },
        "hexes": [
            {"h3_index": cell, "role": footprint.roles[cell].value}
            for cell in footprint.strategic_cells()
        ],
    }


def write_manifest(paths: RegionPaths, document: dict[str, Any]) -> None:
    """
    Why this exists:
        Save a manifest with the same pretty JSON layout as the global metadata files.
    When to use:
        After ``build_manifest_document``.
    What to expect:
        Creates the region folder and writes ``region_manifest.json``.
    """

    LOGGER.debug("write_manifest path=%s.", paths.manifest)
    paths.folder.mkdir(parents=True, exist_ok=True)
    write_json_document(paths.manifest, document)
    LOGGER.info("Wrote %s.", paths.manifest)


def read_manifest(path: Path) -> RegionManifest:
    """
    Why this exists:
        Load a manifest and reject a file that does not match the catalog.
    When to use:
        Before a regional export or a pack check.
    What to expect:
        A manifest whose resolutions, id, roles, and cell resolutions match the catalog.
    Exceptions:
        ``ValueError`` naming the file and the problem. ``KeyError`` when the region id is unknown.
    """

    LOGGER.debug("read_manifest path=%s.", path)
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
        if document.get("schema_version") not in ACCEPTED_MANIFEST_SCHEMA_VERSIONS:
            raise ValueError(f"{path}: schema_version must be 1.0.0, 1.1.0, or 1.2.0.")
        definition = region_by_id(str(document["region_id"]))
        if int(document["res_s"]) != definition.strategic_resolution or int(document["res_t"]) != definition.tactical_resolution:
            raise ValueError(f"{path}: resolutions do not match the catalog.")
        policy_json = document["scalerank_policy"]
        policy = ScalerankPolicy(
            road_max=int(policy_json["road_max"]),
            rail_max=int(policy_json["rail_max"]),
            urban_overlay_max=int(policy_json["urban_overlay_max"]),
            major_airport_max=int(policy_json["major_airport_max"]),
            major_seaport_max=int(policy_json["major_seaport_max"]),
            city_label_max=int(policy_json["city_label_max"]),
        )
        roles: dict[str, HexRole] = {}
        for entry in document["hexes"]:
            cell = str(entry["h3_index"])
            if h3.get_resolution(cell) != definition.strategic_resolution:
                raise ValueError(f"{path}: {cell} is not resolution {definition.strategic_resolution}.")
            try:
                roles[cell] = HexRole(str(entry["role"]))
            except ValueError as exc:
                raise ValueError(f"{path}: unknown role {entry['role']!r} for {cell}.") from exc
    except Exception:
        LOGGER.error("Failed to read manifest %s.", path, exc_info=True)
        raise
    return RegionManifest(
        region_id=definition.region_id,
        display_name=str(document["display_name"]),
        policy=policy,
        footprint=RegionFootprint(
            region_id=definition.region_id,
            strategic_resolution=definition.strategic_resolution,
            tactical_resolution=definition.tactical_resolution,
            roles=roles,
        ),
    )
