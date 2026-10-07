"""Write the global resolution-1 weather pack."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from scripts.terrain_pipeline.logging_utils import configure_logging

from .weather_pack import GLOBAL_WATER_LAND_STEPS, write_weather_pack

LOGGER = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[2]
# Default strategic metadata for the global weather pack.
METADATA_PATH = REPO_ROOT / "data" / "generated" / "terrain_res1_metadata.json"
# Default output path for the global weather pack.
OUTPUT_JSON = REPO_ROOT / "data" / "generated" / "terrain_res1_weather.json"


def main(argv: list[str] | None = None) -> int:
    """
    Why this exists:
        Provide the command-line entry for the global weather file.
    When to use:
        ``python -m scripts.weather_pipeline.generate_res1_weather``.
    What to expect:
        Writes compact JSON. Defaults match the historical metadata and output paths and use 2 water-to-land steps.
        Returns 0. Raises when metadata or WorldClim inputs are missing.
    """

    parser = argparse.ArgumentParser(description="Write the global resolution-1 weather pack.")
    parser.add_argument("--metadata", type=Path, default=METADATA_PATH)
    parser.add_argument("--output", type=Path, default=OUTPUT_JSON)
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)
    configure_logging(args.verbose)
    LOGGER.debug("Weather CLI metadata=%s output=%s.", args.metadata, args.output)
    write_weather_pack(args.metadata, args.output, GLOBAL_WATER_LAND_STEPS)
    return 0


if __name__ == "__main__":
    sys.exit(main())
