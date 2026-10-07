"""Export strategic landmass records for one region from its tactical metadata."""

from __future__ import annotations

import logging

from scripts.terrain_pipeline.config import PipelineConfig
from scripts.terrain_pipeline.landmass import (
    build_landmass_envelope,
    build_landmass_records,
    build_qa_summary,
    load_geography_index,
    record_to_json_dict,
)
from scripts.terrain_pipeline.metadata_io import write_json_document
from scripts.terrain_pipeline.res1_water_pct import load_metadata_rows_by_h3

from .region_manifest import RegionManifest
from .region_paths import RegionPaths
from .regional_scaling import island_min_area_km2_for

LOGGER = logging.getLogger(__name__)


def export_region_landmass(manifest: RegionManifest, paths: RegionPaths, config: PipelineConfig) -> None:
    """
    Why this exists:
        Write land and island membership for a region's strategic cells.
    When to use:
        After tactical metadata exists.
    What to expect:
        Writes the landmass file and a QA summary. Does not apply the global corridor assertion.
        Spot checks stay empty when those global hexes are absent.
    """

    LOGGER.debug("export_region_landmass region=%s.", manifest.region_id)
    resolution = manifest.footprint.strategic_resolution
    island_km2 = island_min_area_km2_for(resolution, config.island_min_area_km2)
    geography = load_geography_index(config, island_km2)
    child_rows = load_metadata_rows_by_h3(paths.metadata_t)
    records = build_landmass_records(
        manifest.footprint.strategic_cells(),
        geography,
        child_rows,
        config,
        child_resolution=manifest.footprint.tactical_resolution,
    )
    envelope = build_landmass_envelope(
        records=[record_to_json_dict(record) for record in records],
        island_min_area_km2=island_km2,
        resolution=resolution,
        water_pct_method="tactical_child_water_terrain_fraction",
        water_pct_requires=("terrain_res_t_metadata.json",),
    )
    paths.qa_dir.mkdir(parents=True, exist_ok=True)
    write_json_document(paths.landmass_s, envelope)
    write_json_document(paths.landmass_qa, build_qa_summary(records))
    LOGGER.info("Wrote landmass for %s (%d records).", manifest.region_id, len(records))
