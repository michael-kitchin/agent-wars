"""Summarize cells that cross 180 degrees and check regenerated terrain files against a baseline."""

from __future__ import annotations

import argparse
import json
import logging
import statistics
import sys
from pathlib import Path
from types import MappingProxyType
from typing import Any, Final, Iterable

import h3

from .antimeridian import crosses_antimeridian, is_pole_cell
from .logging_utils import TRACE_LEVEL, configure_logging
from .metadata_classifier import is_res4_urban_overlay_row

LOGGER = logging.getLogger(__name__)

# Metadata fields computed from the EPSG:3857 water and urban mask tests.
METADATA_MASK_FIELDS: Final = frozenset(
    {
        "total_edges",
        "water_edges",
        "all_water",
        "intersects_water",
        "all_urban",
        "intersects_urban",
        "urban_edges",
        "urban_by_scalerank",
    }
)

# Landmass fields derived from tactical water classification. Region ids come from geography polygons.
LANDMASS_MASK_FIELDS: Final = frozenset({"water_pct"})

# Weather fields, which copy nearby land climate for water hexes.
WEATHER_MASK_FIELDS: Final = frozenset({"months"})

# Changeable fields for each ``diff --kind`` value.
CHANGEABLE_FIELDS_BY_KIND: Final = MappingProxyType(
    {
        "metadata": METADATA_MASK_FIELDS,
        "landmass": LANDMASS_MASK_FIELDS,
        "weather": WEATHER_MASK_FIELDS,
    }
)

# Regional manifest keys rewritten by the economy step. Everything else must stay the same.
MANIFEST_ECONOMY_KEYS: Final = frozenset({"economy", "side_group_balance"})

# Most violations or sample cells listed in one report, to keep output readable.
REPORT_LIST_LIMIT: Final = 20

# Most crossing cells listed as still intersecting urban polygons.
CROSSING_URBAN_LIST_LIMIT: Final = 50

# Exit code when a check finds a problem.
EXIT_CHECK_FAILED: Final = 2

# Exit code when an exception stops a command.
EXIT_ERROR: Final = 1


def load_records_by_cell(path: Path) -> dict[str, dict[str, Any]]:
    """
    Why this exists:
        Index any terrain JSON document (metadata, landmass, weather) by H3 cell for comparison.
    When to use:
        Before ``summarize_metadata`` or ``diff_records``.
    What to expect:
        A dict keyed by ``h3_index``, or ``h3Index`` for weather packs, holding the full records.
    Exceptions:
        ``ValueError`` when a record has neither key or a key repeats. File and JSON errors propagate.
    """

    LOGGER.debug("load_records_by_cell path=%s.", path)
    document = json.loads(path.read_text(encoding="utf-8"))
    records: dict[str, dict[str, Any]] = {}
    for record in document["records"]:
        cell = record.get("h3_index", record.get("h3Index"))
        if cell is None:
            raise ValueError(f"{path}: record without h3_index or h3Index.")
        if cell in records:
            raise ValueError(f"{path}: duplicate record for {cell}.")
        records[str(cell)] = record
    LOGGER.debug("load_records_by_cell path=%s records=%d.", path, len(records))
    return records


def crossing_cells(cells: Iterable[str]) -> set[str]:
    """
    Why this exists:
        Pick out the cells whose mask results the antimeridian split can change.
    When to use:
        On the cell keys of a baseline file, before summarizing or diffing it.
    What to expect:
        The subset where ``crosses_antimeridian`` holds. Pole cells are never included.
    """

    result = {cell for cell in cells if crosses_antimeridian(cell)}
    LOGGER.log(TRACE_LEVEL, "crossing_cells found=%d.", len(result))
    return result


def _urban_rollup(urban_cells: Iterable[str], parent_resolution: int) -> dict[str, Any]:
    """
    Why this exists:
        Reproduce the urban totals in ``doc/region-summary-1.md``: urban cells grouped by parent hex.
    When to use:
        From ``summarize_metadata`` with the tactical cells that count as urban.
    What to expect:
        Urban cell count, producing parent count, median, and 90th percentile of cells per parent.
        Median and percentile are None when there are fewer than two producing parents.
    """

    per_parent: dict[str, int] = {}
    for cell in urban_cells:
        parent = h3.cell_to_parent(cell, parent_resolution)
        per_parent[parent] = per_parent.get(parent, 0) + 1
    values = sorted(per_parent.values())
    enough = len(values) >= 2
    return {
        "urban_cells": sum(values),
        "producing_hexes": len(values),
        "median": statistics.median(values) if values else None,
        "p90": statistics.quantiles(values, n=10, method="inclusive")[8] if enough else None,
    }


def summarize_metadata(records: dict[str, dict[str, Any]], urban_max: int, parent_resolution: int) -> dict[str, Any]:
    """
    Why this exists:
        Report the mask flags of crossing cells and the urban totals, so a run can be compared to the
        numbers recorded before the fix.
    When to use:
        On a loaded metadata file, global or regional, strategic or tactical.
    What to expect:
        Resolution, record and crossing counts, pole cells present, crossing water and urban counts.
        Files with ``urban_by_scalerank`` also get the overlay count, urban rollup, and up to 50
        crossing cells still intersecting urban polygons.
    Exceptions:
        ``ValueError`` when ``records`` is empty.
    """

    LOGGER.debug("summarize_metadata records=%d urban_max=%d parent=%d.", len(records), urban_max, parent_resolution)
    if not records:
        raise ValueError("Metadata file has no records.")
    crossing = crossing_cells(records)
    crossing_rows = [records[cell] for cell in sorted(crossing)]
    summary: dict[str, Any] = {
        "resolution": h3.get_resolution(next(iter(records))),
        "record_count": len(records),
        "pole_cells": sorted(cell for cell in records if is_pole_cell(cell)),
        "crossing_count": len(crossing),
        "crossing_all_water": sum(1 for row in crossing_rows if row.get("all_water")),
        "crossing_intersects_water": sum(1 for row in crossing_rows if row.get("intersects_water")),
        "crossing_intersects_urban": sum(1 for row in crossing_rows if row.get("intersects_urban")),
    }
    if any("urban_by_scalerank" in row for row in records.values()):
        urban = [cell for cell, row in records.items() if is_res4_urban_overlay_row(dict(row), urban_max)]
        summary["crossing_urban_overlay"] = sum(1 for cell in urban if cell in crossing)
        summary["urban_rollup"] = _urban_rollup(urban, parent_resolution)
        still_urban = [cell for cell in sorted(crossing) if records[cell].get("intersects_urban")]
        summary["crossing_urban_cells"] = [
            {"cell": cell, "center": [round(value, 3) for value in h3.cell_to_latlng(cell)]}
            for cell in still_urban[:CROSSING_URBAN_LIST_LIMIT]
        ]
    return summary


def diff_records(
    before: dict[str, dict[str, Any]],
    after: dict[str, dict[str, Any]],
    changeable_fields: frozenset[str],
    rings: int,
) -> dict[str, Any]:
    """
    Why this exists:
        Prove that a regeneration changed only the cells and fields the antimeridian fix may change.
    When to use:
        After regenerating a file, with the committed version as ``before``.
    What to expect:
        Allowed cells are the crossing cells of ``before`` plus ``rings`` grid rings around them.
        ``passed`` is False when a cell was added or removed, a field outside ``changeable_fields``
        changed, or a cell outside the allowed set changed. Up to 20 violations are listed.
    """

    LOGGER.debug("diff_records before=%d after=%d rings=%d.", len(before), len(after), rings)
    allowed: set[str] = set()
    for cell in crossing_cells(before):
        allowed.update(h3.grid_disk(cell, rings))
    added = sorted(set(after) - set(before))
    removed = sorted(set(before) - set(after))
    changed_fields: dict[str, int] = {}
    violations: list[dict[str, Any]] = []
    violation_count = 0
    changed_allowed = 0
    for cell in sorted(set(before) & set(after)):
        old, new = before[cell], after[cell]
        if old == new:
            continue
        fields = sorted(key for key in set(old) | set(new) if old.get(key) != new.get(key))
        for field in fields:
            changed_fields[field] = changed_fields.get(field, 0) + 1
        outside_fields = [field for field in fields if field not in changeable_fields]
        reason = None
        if outside_fields:
            reason = "field outside the changeable set"
        elif cell not in allowed:
            reason = "cell outside the allowed set"
        if reason is None:
            changed_allowed += 1
            continue
        violation_count += 1
        if len(violations) < REPORT_LIST_LIMIT:
            violations.append({"cell": cell, "reason": reason, "fields": fields})
    passed = violation_count == 0 and not added and not removed
    LOGGER.debug("diff_records passed=%s changed_allowed=%d violations=%d.", passed, changed_allowed, violation_count)
    return {
        "passed": passed,
        "allowed_cell_count": len(allowed),
        "added": added[:REPORT_LIST_LIMIT],
        "added_count": len(added),
        "removed": removed[:REPORT_LIST_LIMIT],
        "removed_count": len(removed),
        "changed_allowed": changed_allowed,
        "changed_fields": dict(sorted(changed_fields.items())),
        "violation_count": violation_count,
        "violations": violations,
    }


def diff_manifests(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    """
    Why this exists:
        Prove that the economy step changed only the economy and balance blocks of a regional manifest.
    When to use:
        After ``regional_cli economy`` rewrites a manifest, with the committed manifest as ``before``.
    What to expect:
        ``passed`` is False when any top-level key other than the economy keys and ``schema_version``
        differs. The before and after economy and balance blocks are returned for the results file.
    """

    LOGGER.debug("diff_manifests region=%s.", before.get("region_id"))
    ignored = MANIFEST_ECONOMY_KEYS | {"schema_version"}
    keys = sorted((set(before) | set(after)) - ignored)
    differing = [key for key in keys if before.get(key) != after.get(key)]
    return {
        "passed": not differing,
        "differing_keys": differing,
        "before": {key: before.get(key) for key in sorted(MANIFEST_ECONOMY_KEYS)},
        "after": {key: after.get(key) for key in sorted(MANIFEST_ECONOMY_KEYS)},
    }


def _build_parser() -> argparse.ArgumentParser:
    """
    Why this exists:
        Define the subcommands and their arguments in one place.
    When to use:
        From ``main`` only.
    What to expect:
        A parser with ``summary``, ``diff``, ``manifest-diff``, and ``probe`` subcommands.
    """

    parser = argparse.ArgumentParser(description="Check H3 cells that cross 180 degrees in terrain files.")
    sub = parser.add_subparsers(dest="command", required=True)

    summary = sub.add_parser("summary", help="Summarize crossing cells and urban totals in a metadata file.")
    summary.add_argument("--metadata", type=Path, required=True)
    summary.add_argument("--urban-max", type=int, default=5, help="Highest urban scalerank that counts as urban.")
    summary.add_argument("--parent-resolution", type=int, default=1, help="Resolution of the producing hexes.")

    diff = sub.add_parser("diff", help="Check a regenerated file against a baseline.")
    diff.add_argument("--before", type=Path, required=True)
    diff.add_argument("--after", type=Path, required=True)
    diff.add_argument("--kind", choices=sorted(CHANGEABLE_FIELDS_BY_KIND), required=True)
    diff.add_argument("--rings", type=int, required=True, help="Grid rings around crossing cells allowed to change.")

    manifest = sub.add_parser("manifest-diff", help="Check that only economy blocks changed in a regional manifest.")
    manifest.add_argument("--before", type=Path, required=True)
    manifest.add_argument("--after", type=Path, required=True)

    probe = sub.add_parser("probe", help="Recompute crossing and sample cells against the real masks.")
    probe.add_argument("--baseline-dir", type=Path, required=True)
    probe.add_argument("--sample-every", type=int, default=500, help="Sample every N-th ordinary res-4 cell.")

    for subparser in (summary, diff, manifest, probe):
        subparser.add_argument("--verbose", action="store_true", help="Enable debug logs.")
    return parser


def _run_command(args: argparse.Namespace) -> dict[str, Any]:
    """
    Why this exists:
        Dispatch one parsed subcommand and return its JSON-ready result.
    When to use:
        From ``main`` only.
    What to expect:
        The result dict. Checks set ``passed``; ``summary`` always passes.
    Exceptions:
        ``ValueError`` for a command the parser does not define. Command errors propagate.
    """

    if args.command == "summary":
        records = load_records_by_cell(args.metadata)
        return {"passed": True, **summarize_metadata(records, args.urban_max, args.parent_resolution)}
    if args.command == "diff":
        before = load_records_by_cell(args.before)
        after = load_records_by_cell(args.after)
        return diff_records(before, after, CHANGEABLE_FIELDS_BY_KIND[args.kind], args.rings)
    if args.command == "manifest-diff":
        before = json.loads(args.before.read_text(encoding="utf-8"))
        after = json.loads(args.after.read_text(encoding="utf-8"))
        return diff_manifests(before, after)
    if args.command == "probe":
        # Imported here because antimeridian_probe imports this module.
        from .antimeridian_probe import run_probe

        return run_probe(args.baseline_dir, args.sample_every)
    raise ValueError(f"Unknown command: {args.command}")


def main(argv: list[str] | None = None) -> int:
    """
    Why this exists:
        Command-line entry point: ``python -m scripts.terrain_pipeline.antimeridian_qa <command>``.
    When to use:
        After any regeneration of files that include cells crossing 180 degrees.
    What to expect:
        Prints the result as sorted, indented JSON. Returns 0 when the check passes, 2 when it fails,
        and 1 when an exception stops the command (logged at error).
    """

    args = _build_parser().parse_args(argv)
    configure_logging(verbose=args.verbose)
    LOGGER.debug("antimeridian_qa command=%s.", args.command)
    try:
        result = _run_command(args)
    except Exception as exc:  # noqa: BLE001
        LOGGER.error("antimeridian_qa %s failed: %s", args.command, exc, exc_info=True)
        return EXIT_ERROR
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["passed"] else EXIT_CHECK_FAILED


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
