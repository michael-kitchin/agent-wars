"""
CLI entrypoint for terrain pipeline.
"""

from __future__ import annotations

import argparse
import logging
import sys

from .config import build_default_config
from .logging_utils import configure_logging
from .pipeline import TerrainPipeline

LOGGER = logging.getLogger(__name__)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="EarthEnv -> H3 terrain generation pipeline")
    sub = parser.add_subparsers(dest="command", required=True)

    run_p = sub.add_parser("run", help="Run phases 1-6 in order")
    run_p.add_argument(
        "--max-child-cells",
        type=int,
        default=None,
        help="Optional cap for res-4 cells (debug/dry-run only).",
    )
    run_p.add_argument("--verbose", action="store_true", help="Enable debug logs.")

    validate_p = sub.add_parser("validate", help="Run phase-1 validation only")
    validate_p.add_argument("--verbose", action="store_true", help="Enable debug logs.")

    return parser


def main(argv: list[str] | None = None) -> int:
    """
    Why this exists:
        Provide one stable process entrypoint for pipeline automation and manual runs.
    When to use:
        Called by `python -m` or direct script invocation from developers/CI.
    What to expect:
        Returns zero on success, non-zero on error with explicit logs.
    """

    parser = build_parser()
    args = parser.parse_args(argv)
    configure_logging(verbose=getattr(args, "verbose", False))
    cfg = build_default_config()
    pipeline = TerrainPipeline(cfg)
    try:
        if args.command == "validate":
            pipeline.validate_phase_1_environment()
            LOGGER.info("Validation succeeded.")
            return 0
        if args.command == "run":
            pipeline.run_all(max_child_cells=args.max_child_cells)
            LOGGER.info("Pipeline completed successfully.")
            return 0
        parser.error(f"Unknown command: {args.command}")
        return 2
    except Exception as exc:  # noqa: BLE001
        LOGGER.error("Pipeline failed: %s", exc, exc_info=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

