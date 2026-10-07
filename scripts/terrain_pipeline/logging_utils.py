"""
Logging setup for terrain pipeline.
"""

from __future__ import annotations

import logging
from typing import Final

LOGGER = logging.getLogger(__name__)

# Below DEBUG so trace logs stay off unless a handler sets its level this low.
TRACE_LEVEL: Final = 5


def configure_logging(verbose: bool) -> None:
    """
    Why this exists:
        Standardize debug and trace output for pipeline commands.
    When to use:
        Call once from a CLI before running a command.
    What to expect:
        Concise logs by default, with debug detail when verbose mode is enabled.
        Registers the TRACE level name. Does not lower the root level to TRACE.
    """

    LOGGER.debug("Configuring logging (verbose=%s).", verbose)
    logging.addLevelName(TRACE_LEVEL, "TRACE")
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s - %(message)s",
    )
    # Keep third-party raster and shapefile internals from flooding debug logs.
    logging.getLogger("rasterio").setLevel(logging.INFO)
    logging.getLogger("fiona").setLevel(logging.INFO)

