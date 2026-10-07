"""List regional maps and check that their source files exist."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from scripts.terrain_pipeline.config import InputRasterSet
from scripts.terrain_pipeline.logging_utils import configure_logging

from .density_report import build_density_report, write_density_report
from .pack_checks import check_region_pack
from .regional_steps import STEP_ORDER, RunOptions, run_region_steps
from .footprint import classify_footprint, sweep_footprint_counts
from .footprint_inputs import build_footprint_candidates, load_footprint_inputs
from .member_geometry import load_admin_layers, validate_member_codes
from .region_catalog import REGION_DEFINITIONS, all_region_ids, region_by_id
from .origin_assignment import assign_region_origins
from .region_manifest import build_manifest_document, write_manifest
from .region_paths import REGIONAL_QA_DIR, REGIONS_ROOT, RegionPaths
from .scalerank_policy import policy_for_tactical_resolution

LOGGER = logging.getLogger(__name__)

# Shapefiles the regional commands read, in addition to the raster set.
_REQUIRED_SHAPEFILES = (
    "ne_10m_admin_0_countries.shp",
    "ne_10m_admin_1_states_provinces.shp",
    "ne_10m_populated_places.shp",
    "ne_10m_urban_areas.shp",
    "ne_10m_ocean.shp",
    "ne_10m_lakes.shp",
    "ne_10m_airports.shp",
    "ne_10m_ports.shp",
    "ne_10m_roads.shp",
    "ne_10m_railroads.shp",
    "ne_10m_geography_marine_polys.shp",
    "ne_10m_geography_regions_polys.shp",
)


def build_parser() -> argparse.ArgumentParser:
    """
    Why this exists:
        Define the regional list and validate commands.
    When to use:
        At CLI startup.
    What to expect:
        A parser with a shared ``--verbose`` flag and one required subcommand.
    """

    parser = argparse.ArgumentParser(description="Regional map catalog commands.")
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--verbose", action="store_true", help="Enable debug logs.")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list", parents=[common], help="Print every region id, resolution pair, and targets.")
    validate = sub.add_parser("validate", parents=[common], help="Check catalog rules and source files.")
    validate.add_argument("--data-root", type=str, default="F:/Data", help="Directory containing Natural Earth and rasters.")
    footprint = sub.add_parser("footprint", parents=[common], help="Measure land, sea, and neutral counts.")
    footprint.add_argument("--data-root", type=str, default="F:/Data")
    choice = footprint.add_mutually_exclusive_group(required=True)
    choice.add_argument("--region", type=str)
    choice.add_argument("--all", action="store_true")
    footprint.add_argument("--sweep", choices=("trim", "sea", "neutral"))
    footprint.add_argument("--write", action="store_true")
    run = sub.add_parser("run", parents=[common], help="Export selected steps for one region or every region.")
    run.add_argument("--data-root", type=str, default="F:/Data")
    run_choice = run.add_mutually_exclusive_group(required=True)
    run_choice.add_argument("--region", type=str)
    run_choice.add_argument("--all", action="store_true")
    run.add_argument("--steps", type=str, default=",".join(STEP_ORDER))
    run.add_argument("--skip-existing", action="store_true")
    run.add_argument("--max-tactical-cells", type=int, default=None)
    origins = sub.add_parser("origins", parents=[common], help="Write side groups and tactical origin units.")
    origins.add_argument("--data-root", type=str, default="F:/Data")
    origins_choice = origins.add_mutually_exclusive_group(required=True)
    origins_choice.add_argument("--region", type=str)
    origins_choice.add_argument("--all", action="store_true")
    origins.add_argument("--force", action="store_true", help="Rewrite a region that already has side groups.")
    check = sub.add_parser("check", parents=[common], help="Check regional packs against their manifests.")
    check_choice = check.add_mutually_exclusive_group(required=True)
    check_choice.add_argument("--region", type=str)
    check_choice.add_argument("--all", action="store_true")
    sub.add_parser("report", parents=[common], help="Write overlay density ratios.")
    return parser


def _catalog_problems() -> list[str]:
    """
    Why this exists:
        Check catalog invariants that do not need source files.
    When to use:
        From ``validate``.
    What to expect:
        A list of problem strings. Empty means the catalog is consistent.
    """

    LOGGER.debug("Checking catalog invariants for %d regions.", len(REGION_DEFINITIONS))
    problems: list[str] = []
    ids = [region.region_id for region in REGION_DEFINITIONS]
    if len(ids) != len(set(ids)):
        problems.append("Region ids are not unique.")
    for region in REGION_DEFINITIONS:
        if region.tactical_resolution != region.strategic_resolution + 3:
            problems.append(f"{region.region_id}: tactical resolution is not strategic plus 3.")
        if region.strategic_resolution not in {2, 3}:
            problems.append(f"{region.region_id}: strategic resolution must be 2 or 3.")
        try:
            policy_for_tactical_resolution(region.tactical_resolution)
        except ValueError as exc:
            problems.append(str(exc))
        for member in region.members:
            if member.include_admin1 and member.exclude_admin1:
                problems.append(f"{region.region_id}: {member.adm0_a3} sets both include and exclude admin-1 lists.")
    return problems


def _source_problems(data_root: Path) -> list[str]:
    """
    Why this exists:
        Fail before a long export when a shapefile or raster is missing.
    When to use:
        From ``validate``.
    What to expect:
        One problem per missing file. Does not open the files.
    """

    LOGGER.debug("Checking source files under %s.", data_root)
    rasters = InputRasterSet()
    names = list(_REQUIRED_SHAPEFILES)
    names.extend(rasters.landcover_by_class.values())
    names.extend(rasters.topo_files)
    problems: list[str] = []
    for name in names:
        path = data_root / name
        if not path.is_file():
            problems.append(f"Missing source file: {path}")
    return problems


def validate_sources(data_root: Path) -> list[str]:
    """
    Why this exists:
        Collect catalog and source-file problems for the validate command.
    When to use:
        From the CLI, and from tests that want the problem list.
    What to expect:
        An empty list when the catalog and the data root are usable.
    """

    LOGGER.debug("validate_sources data_root=%s.", data_root)
    problems = _catalog_problems() + _source_problems(data_root)
    if problems:
        return problems
    layers = load_admin_layers(data_root)
    for region in REGION_DEFINITIONS:
        try:
            validate_member_codes(region, layers)
        except ValueError as exc:
            LOGGER.error("Member codes failed for %s.", region.region_id, exc_info=True)
            problems.append(str(exc))
    return problems


def _ratio(value: float | None) -> str:
    """
    Why this exists:
        Format one density ratio for the report table.
    When to use:
        While printing the report command.
    What to expect:
        A short decimal, or ``n/a`` when the global metric was zero.
    """

    if value is None:
        return "n/a"
    return f"{value:.2f}"


def _deviation_pct(actual: int, target: int) -> str:
    """
    Why this exists:
        Show how far a footprint count is from its target.
    When to use:
        While printing a footprint table.
    What to expect:
        A signed percent. A zero target prints ``n/a`` when the actual count is not zero.
    """

    if target == 0:
        return "0.0%" if actual == 0 else "n/a"
    return f"{(actual - target) / target * 100:+.1f}%"


def run_footprint(region_id: str | None, data_root: Path, sweep: str | None, write: bool) -> int:
    """
    Why this exists:
        Measure footprints and optionally write manifests.
    When to use:
        The footprint subcommand.
    What to expect:
        Prints actual/target counts, or a reach sweep. Writes a manifest when ``write`` is true.
        Returns 0. A region with no member land is logged and skipped.
    """

    LOGGER.debug("run_footprint region=%s sweep=%s write=%s.", region_id, sweep, write)
    inputs = load_footprint_inputs(data_root)
    regions = [region_by_id(region_id)] if region_id else list(REGION_DEFINITIONS)
    reaches = [float(step) for step in range(0, 801, 25)]
    for definition in regions:
        trim = definition.desert_trim_reach_km or 0.0
        max_reach = max(800.0, definition.sea_reach_km, definition.neutral_reach_km, trim)
        try:
            candidates = build_footprint_candidates(definition, inputs, max_reach)
            if sweep:
                for reach, counts in sweep_footprint_counts(definition, candidates, sweep, reaches):
                    print(
                        f"{definition.region_id} {sweep}={reach:.0f} "
                        f"land={counts.land} sea={counts.sea} neutral={counts.neutral_border}"
                    )
                continue
            footprint = classify_footprint(definition, candidates)
        except ValueError as exc:
            LOGGER.error("Footprint failed for %s.", definition.region_id, exc_info=True)
            print(f"{definition.region_id} ERROR {exc}")
            continue
        counts = footprint.counts()
        targets = definition.targets
        print(
            f"{definition.region_id} "
            f"land={counts.land}/{targets.land} {_deviation_pct(counts.land, targets.land)} "
            f"sea={counts.sea}/{targets.sea} {_deviation_pct(counts.sea, targets.sea)} "
            f"neutral={counts.neutral_border}/{targets.neutral_border} "
            f"{_deviation_pct(counts.neutral_border, targets.neutral_border)}"
        )
        if write:
            document = build_manifest_document(
                definition,
                footprint,
                policy_for_tactical_resolution(definition.tactical_resolution),
            )
            write_manifest(RegionPaths.for_region(definition.region_id), document)
    return 0


def main(argv: list[str] | None = None) -> int:
    """
    Why this exists:
        Provide ``python -m scripts.regional_pipeline.regional_cli``.
    When to use:
        To list regions or check that source data is present.
    What to expect:
        Returns 0 on success and 1 when validation finds problems.
    """

    parser = build_parser()
    args = parser.parse_args(argv)
    configure_logging(verbose=args.verbose)
    try:
        if args.command == "list":
            for region in REGION_DEFINITIONS:
                targets = region.targets
                print(
                    f"{region.region_id} {region.strategic_resolution}/{region.tactical_resolution} "
                    f"land={targets.land} sea={targets.sea} neutral={targets.neutral_border}"
                )
            LOGGER.info("Listed %d regions.", len(all_region_ids()))
            return 0
        if args.command == "report":
            report = build_density_report(REGIONS_ROOT, Path("data/generated"))
            write_density_report(report, REGIONAL_QA_DIR / "density_report.json")
            header = f"{'region':<24} {'urban':>8} {'roads':>8} {'rail':>8} {'airports':>8} {'cities':>8}"
            print(header)
            global_metrics = report["global"]
            print(
                f"{'global':<24} {global_metrics['urban_share']:8.3f} {global_metrics['road_share']:8.3f} "
                f"{global_metrics['rail_share']:8.3f} {global_metrics['airports_per_100_land_hexes']:8.2f} "
                f"{global_metrics['city_labels_per_land_hex']:8.3f}"
            )
            for region_id, metrics in report["regions"].items():
                ratios = metrics["ratio_to_global"]
                print(
                    f"{region_id:<24} {_ratio(ratios.get('urban_share')):>8} {_ratio(ratios.get('road_share')):>8} "
                    f"{_ratio(ratios.get('rail_share')):>8} {_ratio(ratios.get('airports_per_100_land_hexes')):>8} "
                    f"{_ratio(ratios.get('city_labels_per_land_hex')):>8}"
                )
            return 0
        if args.command == "run":
            region_ids = [args.region] if args.region else all_region_ids()
            run_region_steps(
                region_ids,
                RunOptions(
                    steps=tuple(part.strip() for part in args.steps.split(",") if part.strip()),
                    data_root=Path(args.data_root),
                    skip_existing=args.skip_existing,
                    max_tactical_cells=args.max_tactical_cells,
                ),
            )
            return 0
        if args.command == "origins":
            region_ids = [args.region] if args.region else all_region_ids()
            failed = False
            for region_id in region_ids:
                try:
                    counts = assign_region_origins(region_id, Path(args.data_root), force=args.force)
                    print(f"{region_id} " + " ".join(f"{group}={count}" for group, count in counts.items()))
                except ValueError as exc:
                    failed = True
                    LOGGER.error("Origins failed for %s.", region_id, exc_info=True)
                    print(f"{region_id} ERROR")
                    print(exc)
            return 1 if failed else 0
        if args.command == "check":
            region_ids = [args.region] if args.region else all_region_ids()
            failed = False
            for region_id in region_ids:
                for result in check_region_pack(region_id):
                    print(f"{region_id} {result.status} {result.file} {result.detail}")
                    failed = failed or result.status == "FAIL"
            return 1 if failed else 0
        if args.command == "footprint":
            return run_footprint(
                region_id=args.region,
                data_root=Path(args.data_root),
                sweep=args.sweep,
                write=args.write,
            )
        if args.command == "validate":
            problems = validate_sources(Path(args.data_root))
            if problems:
                for problem in problems:
                    print(problem)
                LOGGER.error("Regional validation failed with %d problems.", len(problems))
                return 1
            LOGGER.info("Regional validation passed.")
            return 0
        parser.error(f"Unknown command: {args.command}")
        return 2
    except Exception as exc:
        LOGGER.error("Regional command failed: %s", exc, exc_info=True)
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
