"""Read-only access to one regional pack."""

from __future__ import annotations

import json
import logging
import zipfile
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Mapping

from scripts.basemap_pipeline.basemap_settings import OutputPaths
from scripts.basemap_pipeline.web_mercator import LonLatBox
from scripts.regional_pipeline.region_manifest import read_manifest
from scripts.regional_pipeline.region_paths import METADATA_T_FILENAME
from scripts.terrain_pipeline.geometry_bounds import bounds_for_cells
from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)


def read_region_json(region_id: str, filename: str, regions_root: Path) -> dict:
    """
    Why this exists:
        Read a regional JSON document without extracting it into ``data/generated``.
    When to use:
        When the plain file is present, or only its ``.json.zip`` sibling is.
    What to expect:
        The parsed document.
    Exceptions:
        ``FileNotFoundError`` naming both candidate paths when neither exists.
    """

    plain = regions_root / region_id / filename
    zipped = regions_root / region_id / f"{filename}.zip"
    LOGGER.log(TRACE_LEVEL, "read_region_json region=%s filename=%s.", region_id, filename)
    if plain.is_file():
        return json.loads(plain.read_text(encoding="utf-8"))
    if zipped.is_file():
        with zipfile.ZipFile(zipped) as archive:
            return json.loads(archive.read(filename))
    raise FileNotFoundError(f"{plain} and {zipped}")


def cells_box(cells: list[str] | tuple[str, ...] | set[str]) -> LonLatBox:
    """
    Why this exists:
        Bound a set of H3 cells for tiles and composites.
    When to use:
        For a region's strategic cells or one battle footprint.
    What to expect:
        A longitude/latitude box with no extra margin.
    Exceptions:
        ``ValueError`` when the set is empty, wider than 180 degrees, or crosses the antimeridian.
    """

    cell_list = list(cells)
    LOGGER.log(TRACE_LEVEL, "cells_box count=%s.", len(cell_list))
    if not cell_list:
        raise ValueError("no cells")
    bounds = bounds_for_cells(cell_list, margin_deg=0.0)
    if bounds is None:
        raise ValueError(
            "region is wider than 180 degrees or crosses the antimeridian; this prototype does not support it"
        )
    west, south, east, north = bounds
    return LonLatBox(west, south, east, north)


@dataclass(frozen=True)
class RegionInputs:
    """
    Why this exists:
        Carry the manifest facts tile commands need.
    When to use:
        After ``load_region_inputs``.
    What to expect:
        Roles are a read-only mapping of strategic cell id to a role value such as ``land``.
    """

    # Catalog id.
    region_id: str
    # Human-readable map name.
    display_name: str
    # Strategic H3 resolution.
    strategic_resolution: int
    # Tactical H3 resolution.
    tactical_resolution: int
    # Strategic cell id to role value.
    roles: Mapping[str, str]
    # Geographic box of the strategic cells.
    box: LonLatBox


def load_region_inputs(region_id: str, regions_root: Path, paths: OutputPaths) -> RegionInputs:
    """
    Why this exists:
        Load one region and keep a manifest copy outside ``data/generated``.
    When to use:
        At the start of a command that needs the region.
    What to expect:
        A ``RegionInputs`` whose box contains the strategic cells.
    Exceptions:
        ``FileNotFoundError`` when the manifest is missing.
        ``KeyError`` when ``read_manifest`` does not know the region.
        ``ValueError`` when the file's region id does not match ``region_id``.
    """

    LOGGER.debug("load_region_inputs region=%s root=%s.", region_id, regions_root)
    document = read_region_json(region_id, "region_manifest.json", regions_root)
    paths.manifest_copy_path.parent.mkdir(parents=True, exist_ok=True)
    paths.manifest_copy_path.write_text(json.dumps(document), encoding="utf-8")
    manifest = read_manifest(paths.manifest_copy_path)
    if manifest.region_id != region_id:
        raise ValueError(f"manifest region id {manifest.region_id} does not match {region_id}")
    roles = {cell: role.value for cell, role in manifest.footprint.roles.items()}
    return RegionInputs(
        region_id=manifest.region_id,
        display_name=manifest.display_name,
        strategic_resolution=manifest.footprint.strategic_resolution,
        tactical_resolution=manifest.footprint.tactical_resolution,
        roles=MappingProxyType(roles),
        box=cells_box(list(roles)),
    )


def load_tactical_rows(region_id: str, regions_root: Path) -> dict[str, dict]:
    """
    Why this exists:
        Index tactical metadata by cell so battle outlines can classify terrain.
    When to use:
        When drawing a battle composite or a preview overlay.
    What to expect:
        A dict of metadata records. Cells absent from the file are simply missing.
    Exceptions:
        ``FileNotFoundError`` when the metadata file is missing.
        ``ValueError`` when a record has no ``h3_index``.
    """

    LOGGER.log(TRACE_LEVEL, "load_tactical_rows region=%s.", region_id)
    document = read_region_json(region_id, METADATA_T_FILENAME, regions_root)
    rows: dict[str, dict] = {}
    for record in document["records"]:
        cell = record.get("h3_index")
        if not cell:
            raise ValueError("tactical metadata record has no h3_index")
        rows[str(cell)] = record
    return rows
