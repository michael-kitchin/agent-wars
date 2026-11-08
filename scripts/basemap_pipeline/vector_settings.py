"""Shared constants for the basemap vector documents."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

# Document schema written into every vector zip.
VECTOR_SCHEMA_VERSION = "1.0.0"
# Degrees per stored integer. 0.00001° is about one metre.
QUANTUM_DEG = 1e-5
# Latitude where Web Mercator stops, in degrees.
MERCATOR_MAX_LAT = 85.0511287798066
# Half the width of the Web Mercator world, in metres.
WORLD_HALF_EXTENT_M = 20037508.342789244
# Metres per pixel at zoom 0, on a 256-pixel tile.
METERS_PER_PIXEL_Z0 = 156543.03392804097
# Simplify tolerance, in screen pixels, applied in Web Mercator.
SIMPLIFY_TOLERANCE_PX = 0.25
# Parts smaller than this on screen are dropped, except on the last level.
MIN_PART_EXTENT_PX = 1.0
# Edge-mask cell size, in degrees. Cells meet on the shared edge and do not overlap.
MASK_CELL_DEG = 2.0
# Coarse block used before clipping a geometry into cells.
COARSE_SPLIT_DEG = 10.0
# Where the vector zips are written.
VECTOR_OUTPUT_DIR = Path("data/generated/basemap/vectors")
# Scratch directory for a vector build.
VECTOR_WORK_DIR = Path(".test/basemap/vectors/work")


@dataclass(frozen=True)
class CoastLod:
    """
    Why this exists:
        One zoom band of a line document: which zooms use it, how large its cells are,
        and which zoom supplies the simplify tolerance.
    When to use:
        The coastline bands and the border bands.
    What to expect:
        ``max_zoom`` and ``simplify_zoom`` are ``None`` on the last, most detailed band.
    """

    # Lowest zoom that draws this band.
    min_zoom: float
    # First zoom that draws the next band. ``None`` means this band stays on.
    max_zoom: float | None
    # Cell size, in degrees.
    cell_deg: float
    # Zoom whose metres-per-pixel sets the simplify tolerance. ``None`` means do not simplify.
    simplify_zoom: int | None


# Coastline bands. The last band is the hairline used past native zoom.
COAST_LODS = (
    CoastLod(0, 3, 360, 3),
    CoastLod(3, 5, 30, 5),
    CoastLod(5, 7, 10, 7),
    CoastLod(7, None, 2, None),
)
# National borders. They appear with country names, from zoom 4.
COUNTRY_BORDER_LODS = (
    CoastLod(4, 7, 10, 6),
    CoastLod(7, None, 2, None),
)
# State borders. A tactical view can sit below zoom 9, so the first band starts at 0.
STATE_BORDER_LODS = (
    CoastLod(0, 9, 5, 8),
    CoastLod(9, None, 1, None),
)
# Cell size for extra country label anchors, in degrees.
COUNTRY_ANCHOR_CELL_DEG = 4.0
# Cell size for extra state label anchors, in degrees.
STATE_ANCHOR_CELL_DEG = 1.0
# A country piece whose inscribed circle is smaller than this is not labeled, in metres.
COUNTRY_MIN_FRAGMENT_RADIUS_M = 20000
# A state piece whose inscribed circle is smaller than this is not labeled, in metres.
STATE_MIN_FRAGMENT_RADIUS_M = 5000
# Polylabel tolerance, in metres. A coarser value is enough for a label anchor.
POLYLABEL_TOLERANCE_M = 1000
# State features at or above this Natural Earth minimum zoom are not labeled.
STATE_NEVER_LABEL_MIN_ZOOM = 18
# Fixed continent anchors, (latitude, longitude). An inscribed point of a whole continent lands in the wrong place.
CONTINENT_LABEL_ANCHORS = {
    "North America": (48.0, -102.0),
    "South America": (-14.0, -60.0),
    "Europe": (52.0, 18.0),
    "Africa": (6.0, 20.0),
    "Asia": (48.0, 92.0),
    "Australia": (-25.0, 134.0),
    "Antarctica": (-80.0, 30.0),
}
