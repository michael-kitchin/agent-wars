"""
CLI entrypoint for res4 road/rail side-mask JSON export.

Separate from ``cli.py`` and ``metadata_cli.py`` so route extraction stays isolated.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from .logging_utils import configure_logging
from .road_rail_sides import LINE_COVERAGE_QA_BUFFER_DEGREES_DEFAULT
from .road_rail_sides_export import RoadRailSidesExporter

LOGGER = logging.getLogger(__name__)


def build_parser() -> argparse.ArgumentParser:
    """
    Why this exists:
        Define validate/run commands for the road/rail side-mask pipeline.
    When to use:
        At CLI startup before parsing arguments.
    What to expect:
        Supports optional ``--max-features`` for bounded dry runs.
    """

    parser = argparse.ArgumentParser(
        description="Export res4 road/rail side-mask JSON from Natural Earth line shapefiles.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    validate_p = sub.add_parser("validate", help="Validate required road/rail shapefiles exist and open.")
    validate_p.add_argument("--verbose", action="store_true", help="Enable debug logs.")
    validate_p.add_argument("--data-root", type=str, default="F:/Data", help="Directory containing NE shapefiles.")

    run_p = sub.add_parser("run", help="Validate inputs then write terrain_res4_road_rail_sides.json")
    run_p.add_argument("--verbose", action="store_true", help="Enable debug logs.")
    run_p.add_argument("--data-root", type=str, default="F:/Data", help="Directory containing NE shapefiles.")
    run_p.add_argument(
        "--output-dir",
        type=str,
        default="data/generated",
        help="Directory for JSON output (default: data/generated).",
    )
    run_p.add_argument(
        "--max-features",
        type=int,
        default=None,
        help="Optional cap on features read per layer (debug/dry-run only).",
    )
    run_p.add_argument(
        "--mode",
        choices=("fast", "high-fidelity"),
        default="fast",
        help="Candidate-cell strategy: fast (default) or high-fidelity.",
    )

    qa_p = sub.add_parser(
        "qa-line-coverage",
        help=(
            "Compare densified line→res4 cell discovery vs thin-buffer polygon overlap (regression QA)."
        ),
    )
    qa_p.add_argument("--verbose", action="store_true", help="Enable debug logs.")
    qa_p.add_argument("--data-root", type=str, default="F:/Data", help="Directory containing NE shapefiles.")
    qa_p.add_argument(
        "--max-features",
        type=int,
        default=None,
        help="Optional cap on features read per layer (default: scan full layers).",
    )
    qa_p.add_argument(
        "--mode",
        choices=("fast", "high-fidelity"),
        default="fast",
        help="Coverage strategy under test: fast (default) or high-fidelity.",
    )
    qa_p.add_argument(
        "--buffer-deg",
        type=float,
        default=None,
        help=(
            "Half-width in WGS84 degrees for line.buffer (default: pipeline constant, ~tens of m mid-lat)."
        ),
    )
    qa_p.add_argument(
        "--max-example-lines",
        type=int,
        default=12,
        help="Maximum mismatch examples to collect in the returned summary.",
    )
    qa_p.add_argument(
        "--fail-on-buffer-miss",
        action="store_true",
        help="Exit with code 2 if any line has cells in the buffered set but not in the densified set.",
    )

    return parser


def main(argv: list[str] | None = None) -> int:
    """
    Why this exists:
        Provide ``python -m scripts.terrain_pipeline.road_rail_sides_cli`` entrypoint.
    When to use:
        Local generation of tactical road/rail side connectivity data.
    What to expect:
        Returns zero on success; non-zero with error logs on failure.
    """

    parser = build_parser()
    args = parser.parse_args(argv)
    configure_logging(verbose=getattr(args, "verbose", False))

    data_root = Path(args.data_root)
    output_dir = Path(getattr(args, "output_dir", "data/generated"))
    exporter = RoadRailSidesExporter(data_root=data_root, output_dir=output_dir)

    try:
        if args.command == "validate":
            LOGGER.debug("road_rail_sides_cli validate invoked.")
            exporter.validate_inputs()
            LOGGER.info("Road/rail side-mask validation succeeded.")
            return 0
        if args.command == "run":
            LOGGER.debug(
                "road_rail_sides_cli run invoked (max_features=%s, mode=%s).",
                getattr(args, "max_features", None),
                getattr(args, "mode", "fast"),
            )
            exporter.run_all(
                max_features=args.max_features,
                use_fast_segment_grid_path=(args.mode == "fast"),
            )
            LOGGER.info("Road/rail side-mask export succeeded.")
            return 0
        if args.command == "qa-line-coverage":
            LOGGER.debug(
                "road_rail_sides_cli qa-line-coverage invoked (max_features=%s buffer_deg=%s).",
                getattr(args, "max_features", None),
                getattr(args, "buffer_deg", None),
            )
            buffer_deg = (
                float(args.buffer_deg)
                if args.buffer_deg is not None
                else LINE_COVERAGE_QA_BUFFER_DEGREES_DEFAULT
            )
            summary = exporter.run_qa_line_cell_coverage(
                max_features=args.max_features,
                buffer_deg=buffer_deg,
                max_example_lines=int(args.max_example_lines),
                use_fast_segment_grid_path=(args.mode == "fast"),
            )
            LOGGER.info("QA summary keys: %s", sorted(summary.keys()))
            if getattr(args, "fail_on_buffer_miss", False) and summary.get(
                "lines_with_cells_only_in_buffered",
                0,
            ):
                LOGGER.error(
                    "QA fail-on-buffer-miss: %d line parts had cells only in buffered overlap.",
                    summary["lines_with_cells_only_in_buffered"],
                )
                return 2
            LOGGER.info("Road/rail line cell coverage QA finished.")
            return 0
        parser.error(f"Unknown command: {args.command}")
        return 2
    except Exception as exc:  # noqa: BLE001
        LOGGER.error("Road/rail side-mask CLI failed: %s", exc, exc_info=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
