"""Recompute crossing and sample cells against the real masks and check them before a full export."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Final, Mapping

import h3
import rasterio
from shapely.affinity import translate
from shapely.geometry import box
from shapely.geometry.base import BaseGeometry
from shapely.prepared import prep

from .antimeridian import is_pole_cell
from .antimeridian_qa import METADATA_MASK_FIELDS, crossing_cells, load_records_by_cell
from .config import PipelineConfig, build_default_config
from .metadata_export_core import (
    MetadataMaskSources,
    PointIndexes,
    build_mask_contexts,
    build_metadata_rows,
    build_point_indexes,
    close_rasters,
    load_metadata_mask_sources,
    open_metadata_rasters,
)
from .resolution_profile import ResolutionProfile, strategic_profile, tactical_profile
from .sampling import cell_polygon

LOGGER = logging.getLogger(__name__)

# Baseline file names, matching the global export.
STRATEGIC_BASELINE_FILENAME: Final = "terrain_res1_metadata.json"
TACTICAL_BASELINE_FILENAME: Final = "terrain_res4_metadata.json"

# Most crossing cells that may still intersect urban polygons after the fix. Few urban polygons lie
# within one tactical cell of 180 degrees, so a larger number means the split did not take effect.
MAX_TACTICAL_CROSSING_URBAN_AFTER: Final = 30

# Share of crossing cells allowed to disagree with the longitude and latitude oracle. Straight edges in
# EPSG:3857 and in degrees differ slightly, so a polygon grazing a cell can land on either side.
ORACLE_DISAGREEMENT_SHARE: Final = 0.01

# Most mismatches listed per category, to keep output readable.
MISMATCH_LIST_LIMIT: Final = 20


@dataclass(frozen=True)
class ProbeInputs:
    """
    Why this exists:
        Bundle the loaded masks, point indexes, and rasters shared by both resolution passes.
    When to use:
        Built once in ``run_probe`` and passed to ``_probe_resolution``.
    What to expect:
        Immutable references. The caller closes ``rasters``.
    """

    # Unclipped water and urban polygons in WGS84.
    sources: MetadataMaskSources
    # Airport and seaport counts at resolutions 1 and 4.
    points: PointIndexes
    # Open land-cover and topography rasters.
    rasters: Mapping[str, rasterio.DatasetReader]


@dataclass(frozen=True)
class OracleMasks:
    """
    Why this exists:
        Hold prepared WGS84 masks for the oracle, which tests split cells in degrees instead of meters.
    When to use:
        Built per resolution in ``_probe_resolution``.
    What to expect:
        ``urban`` is None when the profile omits urban metrics.
    """

    # Prepared water union for the resolution (ocean only, or ocean plus lakes).
    water: Any
    # Prepared aggregate urban union, or None.
    urban: Any | None


def _oracle_pieces(cell: str) -> list[BaseGeometry]:
    """
    Why this exists:
        Give an independent picture of a crossing cell, split in longitude and latitude rather than
        in EPSG:3857.
    When to use:
        For crossing cells only.
    What to expect:
        The non-empty pieces of ``cell_polygon(cell)`` on each side of 180 degrees, all within
        longitudes -180 to 180.
    """

    poly = cell_polygon(cell)
    east = poly.intersection(box(-180.0, -90.0, 180.0, 90.0))
    west = translate(poly.intersection(box(180.0, -90.0, 540.0, 90.0)), xoff=-360.0)
    return [piece for piece in (east, west) if not piece.is_empty and piece.area > 0.0]


def _sample_cells(baseline: dict[str, dict[str, Any]], crossing: set[str], sample_every: int) -> list[str]:
    """
    Why this exists:
        Keep the probe short: every crossing and pole cell, plus a spread of ordinary cells.
    When to use:
        For the tactical pass, where computing every cell takes hours.
    What to expect:
        Sorted cells: crossing cells, pole cells, and every ``sample_every``-th remaining cell.
    """

    remaining = [cell for cell in sorted(baseline) if cell not in crossing and not is_pole_cell(cell)]
    chosen = set(crossing) | {cell for cell in baseline if is_pole_cell(cell)} | set(remaining[::sample_every])
    return sorted(chosen)


def _compare_rows(
    rows: list[dict[str, Any]],
    baseline: dict[str, dict[str, Any]],
    crossing: set[str],
    oracle: OracleMasks,
) -> dict[str, Any]:
    """
    Why this exists:
        Check that only crossing cells changed, only in mask fields, and that they now agree with the oracle.
    When to use:
        After ``build_metadata_rows`` on the probe cells.
    What to expect:
        Mismatch lists (up to 20 each) and before and after crossing totals for the water and urban flags.
    """

    ordinary_mismatches: list[str] = []
    crossing_non_mask: list[dict[str, Any]] = []
    disagreements: list[dict[str, Any]] = []
    disagreement_count = 0
    totals = {"before": dict.fromkeys(("all_water", "intersects_water", "intersects_urban"), 0)}
    totals["after"] = dict(totals["before"])
    for row in rows:
        new = json.loads(json.dumps(row))
        cell = str(new["h3_index"])
        old = baseline[cell]
        if cell not in crossing:
            if new != old:
                ordinary_mismatches.append(cell)
            continue
        changed = sorted(key for key in set(old) | set(new) if old.get(key) != new.get(key))
        outside = [key for key in changed if key not in METADATA_MASK_FIELDS]
        if outside:
            crossing_non_mask.append({"cell": cell, "fields": outside})
        for key in totals["before"]:
            totals["before"][key] += int(bool(old.get(key)))
            totals["after"][key] += int(bool(new.get(key)))
        pieces = _oracle_pieces(cell)
        expected = {"intersects_water": any(oracle.water.intersects(piece) for piece in pieces)}
        if oracle.urban is not None:
            expected["intersects_urban"] = any(oracle.urban.intersects(piece) for piece in pieces)
        differing = {key: value for key, value in expected.items() if bool(new.get(key)) != value}
        if differing:
            disagreement_count += 1
            if len(disagreements) < MISMATCH_LIST_LIMIT:
                center = [round(value, 3) for value in h3.cell_to_latlng(cell)]
                disagreements.append({"cell": cell, "center": center, "oracle": differing})
    return {
        "compared_cells": len(rows),
        "crossing_cells": len(crossing),
        "ordinary_mismatch_count": len(ordinary_mismatches),
        "ordinary_mismatches": ordinary_mismatches[:MISMATCH_LIST_LIMIT],
        "crossing_non_mask_mismatch_count": len(crossing_non_mask),
        "crossing_non_mask_mismatches": crossing_non_mask[:MISMATCH_LIST_LIMIT],
        "oracle_disagreement_count": disagreement_count,
        "oracle_disagreements": disagreements,
        "crossing_totals": totals,
    }


def _probe_resolution(
    profile: ResolutionProfile,
    baseline: dict[str, dict[str, Any]],
    inputs: ProbeInputs,
    sample_every: int | None,
) -> dict[str, Any]:
    """
    Why this exists:
        Run the production row builder on the probe cells for one resolution and compare the result.
    When to use:
        From ``run_probe`` once per resolution. Pass ``sample_every=None`` to probe every baseline cell.
    What to expect:
        The ``_compare_rows`` report plus a ``passed`` flag for the mismatch and oracle limits.
    """

    LOGGER.debug("Probing resolution %d (sample_every=%s).", profile.resolution, sample_every)
    crossing = crossing_cells(baseline)
    cells = sorted(baseline) if sample_every is None else _sample_cells(baseline, crossing, sample_every)
    masks = build_mask_contexts(inputs.sources, profile, None)
    rows = build_metadata_rows(cells, profile, masks, inputs.points, inputs.rasters)
    water = inputs.sources.ocean_and_lakes_wgs84 if profile.include_lakes else inputs.sources.ocean_wgs84
    urban = prep(inputs.sources.urban_aggregate_wgs84) if profile.include_urban else None
    report = _compare_rows(rows, baseline, crossing, OracleMasks(water=prep(water), urban=urban))
    allowed = max(1, int(len(crossing) * ORACLE_DISAGREEMENT_SHARE))
    report["oracle_disagreement_limit"] = allowed
    report["passed"] = (
        report["ordinary_mismatch_count"] == 0
        and report["crossing_non_mask_mismatch_count"] == 0
        and report["oracle_disagreement_count"] <= allowed
    )
    LOGGER.debug("Probe resolution %d passed=%s.", profile.resolution, report["passed"])
    return report


def run_probe(baseline_dir: Path, sample_every: int) -> dict[str, Any]:
    """
    Why this exists:
        Prove the antimeridian split on real masks in minutes, before a global export that takes hours.
    When to use:
        After the geometry change and before ``metadata_cli run``, with the committed global metadata
        extracted into ``baseline_dir``.
    What to expect:
        A report per resolution and an overall ``passed`` flag. It fails when an ordinary or pole cell
        changed, a crossing cell changed outside the mask fields, the oracle disagrees too often, tactical
        crossing cells still intersect urban polygons more than 30 times, or no strategic crossing cell
        became all water.
    Exceptions:
        ``ValueError`` when ``sample_every`` is below 1. File, shapefile, and raster errors propagate.
    """

    LOGGER.debug("run_probe baseline_dir=%s sample_every=%d.", baseline_dir, sample_every)
    if sample_every < 1:
        raise ValueError(f"sample_every must be at least 1, got {sample_every}.")
    config: PipelineConfig = build_default_config()
    strategic_baseline = load_records_by_cell(baseline_dir / STRATEGIC_BASELINE_FILENAME)
    tactical_baseline = load_records_by_cell(baseline_dir / TACTICAL_BASELINE_FILENAME)
    sources = load_metadata_mask_sources(config)
    points = build_point_indexes(config, (config.res_parent, config.res_child))
    rasters = open_metadata_rasters(config)
    try:
        inputs = ProbeInputs(sources=sources, points=points, rasters=rasters)
        strategic = _probe_resolution(strategic_profile(config.res_parent, config), strategic_baseline, inputs, None)
        tactical = _probe_resolution(tactical_profile(config.res_child, config), tactical_baseline, inputs, sample_every)
    finally:
        close_rasters(rasters)
    tactical_urban_after = tactical["crossing_totals"]["after"]["intersects_urban"]
    strategic_water_after = strategic["crossing_totals"]["after"]["all_water"]
    passed = (
        strategic["passed"]
        and tactical["passed"]
        and tactical_urban_after <= MAX_TACTICAL_CROSSING_URBAN_AFTER
        and strategic_water_after > 0
    )
    LOGGER.debug("run_probe passed=%s.", passed)
    return {
        "passed": passed,
        "strategic": strategic,
        "tactical": tactical,
        "tactical_crossing_urban_after_limit": MAX_TACTICAL_CROSSING_URBAN_AFTER,
    }
