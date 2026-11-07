"""Map an XYZ tile to the zip that stores it."""

from __future__ import annotations

import logging
from typing import Final

from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)

# Zooms 0 through 5 share the single world partition.
GLOBAL_LOW_PARTITION_ZOOM: Final = 0
# Zooms 6 and 7 are split on the zoom-3 grid.
GLOBAL_HIGH_PARTITION_ZOOM: Final = 3
# Regional zooms 8 and 9 are split on the zoom-5 grid.
REGIONAL_PARTITION_ZOOM: Final = 5


def partition_zoom_for(zoom: int) -> int:
    """
    Why this exists:
        Keep the partition rule in one place.
    When to use:
        Before computing an ancestor key.
    What to expect:
        0 for zooms 0-5, 3 for zooms 6-7, and 5 for zooms 8-9.
    Exceptions:
        ``ValueError`` when the zoom is outside 0-9.
    """

    LOGGER.log(TRACE_LEVEL, "partition_zoom_for zoom=%s.", zoom)
    if 0 <= zoom <= 5:
        return GLOBAL_LOW_PARTITION_ZOOM
    if zoom <= 7:
        return GLOBAL_HIGH_PARTITION_ZOOM
    if zoom <= 9:
        return REGIONAL_PARTITION_ZOOM
    raise ValueError(f"zoom {zoom} is outside the packed range")


def ancestor_key(zoom: int, x: int, y: int) -> str:
    """
    Why this exists:
        Name the partition zip that holds one tile.
    When to use:
        While packing tiles and while serving them.
    What to expect:
        ``z{partitionZoom}_x{x >> shift}_y{y >> shift}``. Zooms 0-5 use partition zoom 0.
        A zoom-0 tile at x=1 is ``z0_x1_y0``, not ``z0_x0_y0``.
    Exceptions:
        ``ValueError`` when the zoom is outside 0-9 or an index is negative.
    """

    if x < 0 or y < 0:
        raise ValueError(f"tile indexes must be non-negative, got {x}, {y}")
    partition_zoom = partition_zoom_for(zoom)
    shift = zoom - partition_zoom
    key = f"z{partition_zoom}_x{x >> shift}_y{y >> shift}"
    LOGGER.log(TRACE_LEVEL, "ancestor_key zoom=%s x=%s y=%s key=%s.", zoom, x, y, key)
    return key
