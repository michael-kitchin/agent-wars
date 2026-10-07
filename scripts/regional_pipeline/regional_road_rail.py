"""Export tactical road and rail masks and display lines for one region."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from types import MappingProxyType

from scripts.terrain_pipeline.geometry_bounds import bounds_for_cells
from scripts.terrain_pipeline.road_rail_sides_export import RoadRailScanOptions, RoadRailSidesExporter
from scripts.terrain_pipeline.road_rail_vectors_cli import (
    VectorExportOptions,
    _validate_inputs,
    build_vectors_payload,
    collect_vector_rows,
)

from .region_manifest import RegionManifest
from .region_paths import RegionPaths
from .scalerank_policy import SCALERANK_MIN

LOGGER = logging.getLogger(__name__)


def export_region_road_rail_sides(manifest: RegionManifest, paths: RegionPaths, data_root: Path) -> None:
    """
    Why this exists:
        Write side masks for tactical cells, using the region's road and rail scalerank ceilings.
    When to use:
        After the manifest exists.
    What to expect:
        Fast segment mode. Features outside the strategic bounding box are skipped when a box exists.
        Cells outside the tactical set are dropped.
    """

    LOGGER.debug("export_region_road_rail_sides region=%s.", manifest.region_id)
    policy = manifest.policy
    strategic = manifest.footprint.strategic_cells()
    scan = RoadRailScanOptions(
        resolution=manifest.footprint.tactical_resolution,
        scalerank_range_by_layer=MappingProxyType({
            "road": (SCALERANK_MIN, policy.road_max),
            "rail": (SCALERANK_MIN, policy.rail_max),
        }),
        use_fast_segment_grid_path=True,
        feature_bounds=bounds_for_cells(strategic),
        cell_filter=frozenset(manifest.footprint.tactical_cells()),
    )
    exporter = RoadRailSidesExporter(
        data_root=data_root,
        output_dir=paths.folder,
        output_filename=paths.road_rail_sides_t.name,
    )
    exporter.validate_inputs()
    exporter.run_export(scan=scan)


def export_region_road_rail_vectors(manifest: RegionManifest, paths: RegionPaths, data_root: Path) -> None:
    """
    Why this exists:
        Write display-only road and rail lines that touch the region's strategic cells.
    When to use:
        After the manifest exists.
    What to expect:
        Compact JSON. A line is kept when any vertex falls in a strategic cell.
    """

    LOGGER.debug("export_region_road_rail_vectors region=%s.", manifest.region_id)
    policy = manifest.policy
    options = VectorExportOptions(
        road_min=SCALERANK_MIN,
        road_max=policy.road_max,
        rail_min=SCALERANK_MIN,
        rail_max=policy.rail_max,
        point_resolution=manifest.footprint.strategic_resolution,
        point_cells=frozenset(manifest.footprint.strategic_cells()),
    )
    road_path, rail_path = _validate_inputs(data_root)
    rows = collect_vector_rows(kind="road", shapefile_path=road_path, options=options)
    rows.extend(collect_vector_rows(kind="rail", shapefile_path=rail_path, options=options))
    payload = build_vectors_payload(
        rows=rows,
        road_path=road_path,
        rail_path=rail_path,
        simplify_deg=options.simplify_deg,
        max_features=options.max_features,
    )
    paths.folder.mkdir(parents=True, exist_ok=True)
    paths.road_rail_vectors_t.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    LOGGER.info("Wrote %s (%d rows).", paths.road_rail_vectors_t, len(rows))
