"""
CLI entrypoint for res-1 land-mass JSON export.
"""

from __future__ import annotations

import argparse
import logging
import sys

from .config import build_default_config
from .geography_regions import validate_geography_regions_shapefile
from .landmass import LandMassExporter, _geography_regions_path
from .logging_utils import configure_logging
from .res1_water_pct import load_res4_metadata_by_h3, res4_metadata_path

LOGGER = logging.getLogger(__name__)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Export res-1 land-mass membership and water fraction JSON",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    validate_p = sub.add_parser("validate", help="Validate landmass export prerequisites")
    validate_p.add_argument("--verbose", action="store_true", help="Enable debug logs.")
    run_p = sub.add_parser("run", help="Write terrain_res1_landmass.json")
    run_p.add_argument("--verbose", action="store_true", help="Enable debug logs.")
    return parser


def validate_landmass_environment() -> None:
    """
    Why this exists:
        Fail fast before expensive landmass export when inputs or res4 metadata are missing.
    When to use:
        ``landmass_cli validate`` and optionally at start of ``run``.
    What to expect:
        Raises on missing shapefile, res4 metadata, or contract count mismatch.
    """
    cfg = build_default_config()
    geo_path = _geography_regions_path(cfg)
    validate_geography_regions_shapefile(geo_path, cfg.island_min_area_km2)
    load_res4_metadata_by_h3(res4_metadata_path(cfg))


def main(argv: list[str] | None = None) -> int:
    """
    Why this exists:
        Provide a dedicated process entrypoint for landmass JSON generation.
    When to use:
        Invoked via ``python -m scripts.terrain_pipeline.landmass_cli run``.
    What to expect:
        Returns zero on success; non-zero with error logs on failure.
    """
    parser = build_parser()
    args = parser.parse_args(argv)
    configure_logging(verbose=getattr(args, "verbose", False))
    cfg = build_default_config()
    exporter = LandMassExporter(cfg)
    try:
        if args.command == "validate":
            LOGGER.debug("landmass_cli validate invoked.")
            validate_landmass_environment()
            LOGGER.info("Landmass validation succeeded.")
            return 0
        if args.command == "run":
            LOGGER.debug("landmass_cli run invoked.")
            validate_landmass_environment()
            out_path = exporter.run()
            LOGGER.info("Land-mass export succeeded: %s", out_path)
            return 0
        parser.error(f"Unknown command: {args.command}")
        return 2
    except Exception as exc:  # noqa: BLE001
        LOGGER.error("Land-mass CLI failed: %s", exc, exc_info=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
