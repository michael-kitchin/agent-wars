"""Export strategic and tactical naming for one region."""

from __future__ import annotations

import logging
from pathlib import Path

from scripts.naming_pipeline.generate_hex_naming import NamingScope, run_naming_export
from scripts.terrain_pipeline.geometry_bounds import bounds_for_cells

from .region_manifest import RegionManifest
from .region_paths import RegionPaths

LOGGER = logging.getLogger(__name__)


def export_region_naming(manifest: RegionManifest, paths: RegionPaths, data_root: Path) -> None:
    """
    Why this exists:
        Write naming files whose cells are exactly the region's footprint and its tactical children.
    When to use:
        After the manifest exists. Tactical metadata is not required.
    What to expect:
        Writes both naming files. Polygons are clipped when the strategic cells have a usable bounding box.
    """

    LOGGER.debug("export_region_naming region=%s data_root=%s.", manifest.region_id, data_root)
    strategic = tuple(manifest.footprint.strategic_cells())
    tactical = tuple(manifest.footprint.tactical_cells())
    scope = NamingScope(
        strategic_resolution=manifest.footprint.strategic_resolution,
        tactical_resolution=manifest.footprint.tactical_resolution,
        strategic_cells=strategic,
        tactical_cells=tactical,
        filter_cells=True,
        clip_bounds=bounds_for_cells(strategic),
    )
    paths.folder.mkdir(parents=True, exist_ok=True)
    run_naming_export(
        data_root=data_root,
        scope=scope,
        output_strategic=paths.naming_s,
        output_tactical=paths.naming_t,
    )
