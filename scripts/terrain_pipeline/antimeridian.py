"""H3 cells whose boundary crosses the 180-degree meridian, and the Web Mercator constants used to split them."""

from __future__ import annotations

import logging
import math
from typing import Final

import h3

from .logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)

# EPSG:3857 x of longitude 180. PROJ returns exactly this for 180 and its negative for -180.
WEB_MERCATOR_HALF_WIDTH_M: Final = math.pi * 6378137.0

# Distance between the east and west edges of the EPSG:3857 map at any latitude.
WEB_MERCATOR_WORLD_WIDTH_M: Final = 2.0 * WEB_MERCATOR_HALF_WIDTH_M

# Gap left on each side of the 180-degree seam when a cell is split. Natural Earth's west-side ocean
# edge sits at longitude -179.99999999999991, about 1e-8 m short of the map edge, so a piece clipped
# exactly at the seam would not be covered by the ocean.
ANTIMERIDIAN_SEAM_INSET_M: Final = 1.0


def is_pole_cell(cell: str) -> bool:
    """
    Why this exists:
        Pole cells contain a pole, so their boundary spans every longitude and cannot be split at
        180 degrees. Polygon width does not identify them, so they are matched by H3 index.
    When to use:
        Before treating a cell whose longitudes span more than 180 degrees as crossing the meridian.
    What to expect:
        True only for the cells at ``latlng_to_cell(90, 0, res)`` and ``latlng_to_cell(-90, 0, res)``
        for the cell's own resolution. Raises ``h3`` errors for an invalid index.
    """

    resolution = h3.get_resolution(cell)
    result = cell in (h3.latlng_to_cell(90.0, 0.0, resolution), h3.latlng_to_cell(-90.0, 0.0, resolution))
    LOGGER.log(TRACE_LEVEL, "is_pole_cell cell=%s result=%s.", cell, result)
    return result


def crosses_antimeridian(cell: str) -> bool:
    """
    Why this exists:
        Identify the cells that ``cell_polygon`` unwraps past longitude 180, which need splitting
        before any EPSG:3857 mask test.
    When to use:
        For any H3 index, before projecting its polygon for water or urban mask tests.
    What to expect:
        True when the boundary longitudes span more than 180 degrees (the rule ``cell_polygon`` uses)
        and the cell is not a pole cell. Pole cells are excluded because no longitude and latitude
        ring describes a cap around a pole, so they keep the unsplit projection. Raises ``h3`` errors
        for an invalid index.
    """

    longitudes = [lng for _, lng in h3.cell_to_boundary(cell)]
    result = max(longitudes) - min(longitudes) > 180.0 and not is_pole_cell(cell)
    LOGGER.log(TRACE_LEVEL, "crosses_antimeridian cell=%s result=%s.", cell, result)
    return result
