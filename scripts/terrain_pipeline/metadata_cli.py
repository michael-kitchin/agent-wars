"""
CLI entrypoint for terrain feature metadata export (JSON).

Separate from ``cli.py`` so the classification pipeline remains unchanged.
"""

from __future__ import annotations

import argparse
import logging
import sys

from .config import build_default_config
from .logging_utils import configure_logging
from .metadata_pipeline import TerrainMetadataExporter

LOGGER = logging.getLogger(__name__)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Export per-hex terrain feature metadata (JSON) for res-1 and res-4",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    validate_p = sub.add_parser("validate", help="Run environment validation only (phase 1 gates)")
    validate_p.add_argument("--verbose", action="store_true", help="Enable debug logs.")

    run_p = sub.add_parser("run", help="Validate environment then write metadata JSON files")
    run_p.add_argument("--verbose", action="store_true", help="Enable debug logs.")
    run_p.add_argument(
        "--max-child-cells",
        type=int,
        default=None,
        help="Optional cap on res-4 cells (debug/dry-run only).",
    )

    return parser


def main(argv: list[str] | None = None) -> int:
    """
    Why this exists:
        Provide a dedicated process entrypoint for metadata JSON generation.
    When to use:
        Invoked via ``python -m scripts.terrain_pipeline.metadata_cli``.
    What to expect:
        Returns zero on success; non-zero with error logs on failure.
    """

    parser = build_parser()
    args = parser.parse_args(argv)
    configure_logging(verbose=getattr(args, "verbose", False))
    cfg = build_default_config()
    exporter = TerrainMetadataExporter(cfg)
    try:
        if args.command == "validate":
            LOGGER.debug("metadata_cli validate invoked.")
            exporter.validate_environment()
            LOGGER.info("Metadata validation succeeded.")
            return 0
        if args.command == "run":
            LOGGER.debug(
                "metadata_cli run invoked (max_child_cells=%s).",
                getattr(args, "max_child_cells", None),
            )
            exporter.run_all(max_child_cells=args.max_child_cells)
            LOGGER.info("Metadata export succeeded.")
            return 0
        parser.error(f"Unknown command: {args.command}")
        return 2
    except Exception as exc:  # noqa: BLE001
        LOGGER.error("Metadata CLI failed: %s", exc, exc_info=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
