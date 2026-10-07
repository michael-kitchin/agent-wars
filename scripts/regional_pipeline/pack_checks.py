"""Check a regional pack against its manifest."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from scripts.naming_pipeline.naming_json_writers import SCHEMA_VERSION as NAMING_SCHEMA_VERSION
from scripts.terrain_pipeline.metadata_models import TERRAIN_HEX_METADATA_SCHEMA_VERSION

from .region_manifest import RegionManifest, read_manifest
from .region_paths import REGIONS_ROOT, RegionPaths

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class CheckResult:
    """
    Why this exists:
        Report one pack check without stopping the rest of the checks.
    When to use:
        The check command, which prints every result and exits 1 when any status is FAIL.
    What to expect:
        ``SKIP`` means the file is absent. ``WARN`` does not fail the command.
    """

    # File or check name.
    file: str
    # PASS, FAIL, WARN, or SKIP.
    status: str
    # Short explanation.
    detail: str


def _load(path: Path) -> dict[str, Any] | None:
    """
    Why this exists:
        Read one JSON file when it exists.
    When to use:
        At the start of a file check.
    What to expect:
        None when the file is missing. Raises ``json.JSONDecodeError`` when the file is not JSON.
    """

    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _metadata_results(
    path: Path,
    *,
    resolution: int,
    expected_cells: set[str],
    require_urban: bool,
) -> list[CheckResult]:
    """
    Why this exists:
        Check one metadata file against the manifest cell set.
    When to use:
        For strategic and tactical metadata.
    What to expect:
        SKIP when the file is missing. FAIL when the schema, resolution, or cell set disagrees.
    """

    document = _load(path)
    if document is None:
        return [CheckResult(path.name, "SKIP", "file missing")]
    records = document.get("records", [])
    problems: list[str] = []
    if document.get("schema_version") != TERRAIN_HEX_METADATA_SCHEMA_VERSION:
        problems.append(f"schema_version {document.get('schema_version')}")
    if document.get("resolution") != resolution:
        problems.append(f"resolution {document.get('resolution')}")
    if document.get("record_count") != len(records):
        problems.append("record_count does not match records")
    found = {str(row.get("h3_index")) for row in records}
    if found != expected_cells:
        problems.append(f"cell set {len(found)} vs {len(expected_cells)}")
    if require_urban and any("urban_by_scalerank" not in row for row in records):
        problems.append("a record is missing urban_by_scalerank")
    if problems:
        return [CheckResult(path.name, "FAIL", "; ".join(problems))]
    return [CheckResult(path.name, "PASS", f"{len(records)} records")]


def _sanity(manifest: RegionManifest, strategic: dict[str, Any] | None) -> list[CheckResult]:
    """
    Why this exists:
        Flag sea and land hexes whose water flag disagrees with the footprint role.
    When to use:
        After the strategic metadata file has been loaded.
    What to expect:
        WARN when fewer than 80 percent of sea hexes are all water, or fewer than 95 percent of land hexes are not.
        SKIP when strategic metadata is missing.
    """

    if strategic is None:
        return [CheckResult("metadata-sanity", "SKIP", "strategic metadata missing")]
    by_cell = {str(row["h3_index"]): row for row in strategic.get("records", [])}
    sea = [cell for cell, role in manifest.footprint.roles.items() if role.value == "sea"]
    land = [cell for cell, role in manifest.footprint.roles.items() if role.value == "land"]
    sea_ok = sum(1 for cell in sea if by_cell.get(cell, {}).get("all_water") is True)
    land_ok = sum(1 for cell in land if by_cell.get(cell, {}).get("all_water") is False)
    sea_ratio = 1.0 if not sea else sea_ok / len(sea)
    land_ratio = 1.0 if not land else land_ok / len(land)
    if sea_ratio < 0.80 or land_ratio < 0.95:
        return [CheckResult(
            "metadata-sanity",
            "WARN",
            f"sea all_water {sea_ratio:.0%}, land not all_water {land_ratio:.0%}",
        )]
    return [CheckResult("metadata-sanity", "PASS", f"sea {sea_ratio:.0%}, land {land_ratio:.0%}")]


def check_region_pack(region_id: str, root: Path = REGIONS_ROOT) -> list[CheckResult]:
    """
    Why this exists:
        Decide whether one regional folder matches its manifest.
    When to use:
        The check command. Missing files are SKIP so a partial pack can be checked.
    What to expect:
        One or more results. A missing manifest is a single FAIL.
    """

    LOGGER.debug("check_region_pack region=%s root=%s.", region_id, root)
    paths = RegionPaths.for_region(region_id, root)
    if not paths.manifest.is_file():
        return [CheckResult(paths.manifest.name, "FAIL", "manifest missing")]
    try:
        manifest = read_manifest(paths.manifest)
    except Exception as exc:
        LOGGER.error("Manifest check failed for %s.", region_id, exc_info=True)
        return [CheckResult(paths.manifest.name, "FAIL", str(exc))]
    results = [CheckResult(paths.manifest.name, "PASS", manifest.region_id)]
    strategic_cells = set(manifest.footprint.strategic_cells())
    tactical_cells = set(manifest.footprint.tactical_cells())
    strategic = _load(paths.metadata_s)
    results.extend(_metadata_results(
        paths.metadata_s,
        resolution=manifest.footprint.strategic_resolution,
        expected_cells=strategic_cells,
        require_urban=False,
    ))
    results.extend(_metadata_results(
        paths.metadata_t,
        resolution=manifest.footprint.tactical_resolution,
        expected_cells=tactical_cells,
        require_urban=True,
    ))
    results.extend(_sanity(manifest, strategic))
    results.extend(_naming_results(
        paths.naming_s,
        resolution=manifest.footprint.strategic_resolution,
        expected_cells=strategic_cells,
        expect_cities=False,
    ))
    results.extend(_naming_results(
        paths.naming_t,
        resolution=manifest.footprint.tactical_resolution,
        expected_cells=tactical_cells,
        expect_cities=True,
    ))
    results.extend(_landmass_results(paths.landmass_s, manifest))
    results.extend(_weather_results(paths.weather_s, strategic_cells))
    results.extend(_sides_results(paths.road_rail_sides_t, manifest, tactical_cells))
    results.extend(_vector_results(paths.road_rail_vectors_t))
    return results


def _naming_results(
    path: Path,
    *,
    resolution: int,
    expected_cells: set[str],
    expect_cities: bool,
) -> list[CheckResult]:
    """
    Why this exists:
        Check a naming file's schema, resolution, and whether city rows belong at that level.
    When to use:
        From ``check_region_pack``.
    What to expect:
        SKIP when the file is missing. FAIL when the schema or city key disagrees.
    """

    document = _load(path)
    if document is None:
        return [CheckResult(path.name, "SKIP", "file missing")]
    records = document.get("records", [])
    problems: list[str] = []
    if document.get("schema_version") != NAMING_SCHEMA_VERSION:
        problems.append(f"schema_version {document.get('schema_version')}")
    if document.get("resolution") != resolution:
        problems.append(f"resolution {document.get('resolution')}")
    if document.get("record_count") != len(records):
        problems.append("record_count does not match records")
    found = {str(row.get("h3_index")) for row in records}
    if found != expected_cells:
        problems.append(f"cell set {len(found)} vs {len(expected_cells)}")
    for row in records:
        has_cities = "cities" in row
        if has_cities != expect_cities:
            problems.append("city key does not match the naming level")
            break
    if problems:
        return [CheckResult(path.name, "FAIL", "; ".join(problems))]
    return [CheckResult(path.name, "PASS", f"{len(records)} records")]


def _landmass_results(path: Path, manifest: RegionManifest) -> list[CheckResult]:
    """
    Why this exists:
        Check that landmass rows cover the strategic cells and use a percentage.
    When to use:
        From ``check_region_pack``.
    What to expect:
        SKIP when the file is missing. FAIL when the resolution, cell set, or a water percent is out of range.
    """

    document = _load(path)
    if document is None:
        return [CheckResult(path.name, "SKIP", "file missing")]
    records = document.get("records", [])
    found = {str(row.get("h3_index")) for row in records}
    expected = set(manifest.footprint.strategic_cells())
    problems: list[str] = []
    if document.get("resolution") != manifest.footprint.strategic_resolution:
        problems.append(f"resolution {document.get('resolution')}")
    if found != expected:
        problems.append(f"cell set {len(found)} vs {len(expected)}")
    if any(not 0 <= float(row.get("water_pct", -1)) <= 100 for row in records):
        problems.append("water_pct outside 0..100")
    if problems:
        return [CheckResult(path.name, "FAIL", "; ".join(problems))]
    sea = [cell for cell, role in manifest.footprint.roles.items() if role.value == "sea"]
    by_cell = {str(row.get("h3_index")): row for row in records}
    watery = sum(1 for cell in sea if float(by_cell.get(cell, {}).get("water_pct", 0)) >= 85)
    sea_ratio = 1.0 if not sea else watery / len(sea)
    results = [CheckResult(path.name, "PASS", f"{len(records)} records")]
    if sea_ratio < 0.80:
        results.append(CheckResult("landmass-sea", "WARN", f"{sea_ratio:.0%} of sea hexes have water_pct >= 85"))
    return results


def _weather_results(path: Path, strategic_cells: set[str]) -> list[CheckResult]:
    """
    Why this exists:
        Check that every strategic cell has twelve weather months.
    When to use:
        From ``check_region_pack``.
    What to expect:
        SKIP when the file is missing. WARN when sea hexes are not mostly water in the landmass sense is handled separately.
        FAIL when the cell set or month count disagrees.
    """

    document = _load(path)
    if document is None:
        return [CheckResult(path.name, "SKIP", "file missing")]
    records = document.get("records", [])
    found = {str(row.get("h3Index")) for row in records}
    problems: list[str] = []
    if found != strategic_cells:
        problems.append(f"cell set {len(found)} vs {len(strategic_cells)}")
    if any(len(row.get("months", [])) != 12 for row in records):
        problems.append("a record does not have 12 months")
    detail = "; ".join(problems) or f"{len(records)} records"
    return [CheckResult(path.name, "FAIL" if problems else "PASS", detail)]


def _sides_results(path: Path, manifest: RegionManifest, tactical_cells: set[str]) -> list[CheckResult]:
    """
    Why this exists:
        Check that side masks use the tactical resolution and the road scalerank ceiling.
    When to use:
        From ``check_region_pack``.
    What to expect:
        SKIP when missing. WARN when the file has zero records. FAIL when a cell or the scalerank ceiling disagrees.
    """

    document = _load(path)
    if document is None:
        return [CheckResult(path.name, "SKIP", "file missing")]
    records = document.get("records", [])
    problems: list[str] = []
    if document.get("resolution") != manifest.footprint.tactical_resolution:
        problems.append(f"resolution {document.get('resolution')}")
    if any(str(row.get("h3_index")) not in tactical_cells for row in records):
        problems.append("a cell is outside the tactical set")
    road_max = document.get("route_scalerank_filter", {}).get("max")
    if road_max != manifest.policy.road_max:
        problems.append(f"road max {road_max}")
    if problems:
        return [CheckResult(path.name, "FAIL", "; ".join(problems))]
    if document.get("record_count", 0) == 0:
        return [CheckResult(path.name, "WARN", "zero records")]
    return [CheckResult(path.name, "PASS", f"{len(records)} records")]


def _vector_results(path: Path) -> list[CheckResult]:
    """
    Why this exists:
        Check that display vectors contain road or rail rows.
    When to use:
        From ``check_region_pack``.
    What to expect:
        SKIP when missing. FAIL when a row kind is neither road nor rail or the row list is empty.
    """

    document = _load(path)
    if document is None:
        return [CheckResult(path.name, "SKIP", "file missing")]
    rows = document.get("rows", [])
    if not rows:
        return [CheckResult(path.name, "FAIL", "rows empty")]
    if any(row.get("kind") not in {"road", "rail"} for row in rows):
        return [CheckResult(path.name, "FAIL", "a row kind is not road or rail")]
    return [CheckResult(path.name, "PASS", f"{len(rows)} rows")]
