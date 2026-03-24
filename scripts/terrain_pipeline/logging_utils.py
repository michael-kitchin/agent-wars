"""
Logging setup for terrain pipeline.
"""

from __future__ import annotations

import logging


def configure_logging(verbose: bool) -> None:
    """
    Why this exists:
        Standardize debug/trace-like output across phases.
    When to use:
        Call once from CLI before running any phase.
    What to expect:
        Concise logs by default, with additional detail when verbose mode is enabled.
    """

    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s - %(message)s",
    )
    # Keep third-party raster internals from flooding debug logs.
    logging.getLogger("rasterio").setLevel(logging.INFO)

