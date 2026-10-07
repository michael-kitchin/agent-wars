"""
Compute res1 ``water_pct`` from res4 metadata child terrain classification.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import h3

from .config import ClassifierThresholds, PipelineConfig
from .metadata_classifier import classify_res4_metadata_row

LOGGER = logging.getLogger(__name__)

CORRIDOR_WATER_ASSERT_HEXES = (
    "813e7ffffffffff",  # GK
    "81533ffffffffff",  # GT
    "812dbffffffffff",  # FF
    "81523ffffffffff",  # H6
)


def load_metadata_rows_by_h3(path: Path) -> dict[str, dict[str, Any]]:
    """
    Why this exists:
        Index tactical metadata JSON rows by ``h3_index`` for child lookups during landmass export.
    When to use:
        Once at the start of landmass export after validate confirms the file exists.
    What to expect:
        Raises ``RuntimeError`` on a missing file, an invalid envelope, or duplicate h3 keys.
        Error text uses the file name so the global res-4 file keeps its current messages.
    """

    LOGGER.debug("Loading metadata rows from %s.", path)
    label = path.name
    if not path.is_file():
        raise RuntimeError(f"Missing res4 metadata JSON (expected at {path}).")
    parsed = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(parsed, dict):
        raise RuntimeError(f"{label}: expected object envelope.")
    records = parsed.get("records")
    if not isinstance(records, list) or len(records) == 0:
        raise RuntimeError(f"{label}: records must be a non-empty array.")
    by_h3: dict[str, dict[str, Any]] = {}
    for row in records:
        if not isinstance(row, dict):
            raise RuntimeError(f"{label}: each record must be an object.")
        h3_index = row.get("h3_index")
        if not isinstance(h3_index, str) or not h3_index:
            raise RuntimeError(f"{label}: h3_index must be a non-empty string.")
        if h3_index in by_h3:
            raise RuntimeError(f"{label}: duplicate h3_index {h3_index}.")
        by_h3[h3_index] = row
    LOGGER.debug("Loaded %d metadata rows from %s.", len(by_h3), path)
    return by_h3


def load_res4_metadata_by_h3(path: Path) -> dict[str, dict[str, Any]]:
    """
    Why this exists:
        Keep the global landmass call site on the historical function name.
    When to use:
        Global landmass export that reads ``terrain_res4_metadata.json``.
    What to expect:
        Same result and error text as ``load_metadata_rows_by_h3`` for that filename.
    """

    return load_metadata_rows_by_h3(path)


def compute_water_pct_from_children(
    h3_index: str,
    child_rows_by_h3: dict[str, dict[str, Any]],
    thresholds: ClassifierThresholds,
    *,
    child_resolution: int,
    nodata_fallback: str = "water",
) -> float:
    """
    Why this exists:
        Derive a strategic water fraction as the percent of tactical children classified ``water``.
    When to use:
        For each strategic cell during landmass JSON export.
    What to expect:
        0–100 rounded to four decimals. Raises ``RuntimeError`` if any child row is missing.
    """

    LOGGER.debug("Computing water percent for %s from resolution %d children.", h3_index, child_resolution)
    children = h3.cell_to_children(h3_index, child_resolution)
    if not children:
        return 100.0
    water_count = 0
    for child in children:
        row = child_rows_by_h3.get(child)
        if row is None:
            raise RuntimeError(
                f"res4 metadata missing child {child} of res1 hex {h3_index}; "
                "run metadata export before landmass export."
            )
        kind = classify_res4_metadata_row(row, thresholds, nodata_fallback=nodata_fallback)
        if kind == "water":
            water_count += 1
    pct = 100.0 * water_count / len(children)
    return round(max(0.0, min(100.0, pct)), 4)


def compute_res1_water_pct_from_res4(
    h3_index: str,
    res4_metadata_by_h3: dict[str, dict[str, Any]],
    thresholds: ClassifierThresholds,
    *,
    nodata_fallback: str = "water",
) -> float:
    """
    Why this exists:
        Keep the global landmass call site on the historical function name.
    When to use:
        Global landmass export, where tactical children are resolution 4.
    What to expect:
        Same 0–100 result as ``compute_water_pct_from_children`` with ``child_resolution=4``.
    """

    return compute_water_pct_from_children(
        h3_index,
        res4_metadata_by_h3,
        thresholds,
        child_resolution=4,
        nodata_fallback=nodata_fallback,
    )


def assert_corridor_water_pct_below_threshold(
    records_by_h3: dict[str, dict[str, Any]],
    *,
    threshold: float,
) -> None:
    """
    Why this exists:
        Guard against regressions where corridor desert hexes retain implausible polygon-gap water values.
    When to use:
        After landmass export, before writing JSON.
    What to expect:
        Raises ``RuntimeError`` when any named corridor hex has ``water_pct >= threshold``.
    """
    for h3_index in CORRIDOR_WATER_ASSERT_HEXES:
        row = records_by_h3.get(h3_index)
        if row is None:
            raise RuntimeError(f"Corridor QA missing h3_index {h3_index}.")
        water_pct = float(row["water_pct"])
        if water_pct >= threshold:
            raise RuntimeError(
                f"Corridor hex {h3_index} water_pct {water_pct} >= threshold {threshold}."
            )


def res4_metadata_path(config: PipelineConfig) -> Path:
    """Resolve bundled res4 metadata output path from pipeline config."""
    return config.output_dir / config.terrain_res4_metadata_filename
