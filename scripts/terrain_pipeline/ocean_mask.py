"""
Load ocean (water) polygons from a shapefile and classify H3 cells vs that mask.

Predicates run in EPSG:3857 so H3 lon/lat rings and typical global ocean shapefiles interact
reliably (avoids many antimeridian issues in raw geographic coordinates).

Uses a :class:`PreparedGeometry` for repeated ``covers`` / ``intersects`` against the full ocean
union — essential for performance with dense datasets (e.g. Natural Earth 10m).
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from pathlib import Path

import fiona
from pyproj import CRS, Transformer
from shapely import make_valid
from shapely.geometry import LineString, MultiPolygon, Polygon, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import transform as shapely_xy_transform, unary_union
from shapely.prepared import prep

from .classifier import OceanRelationKind

LOGGER = logging.getLogger(__name__)

_transformer_wgs84_to_3857 = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)


@dataclass(frozen=True)
class OceanPredicateContext:
    """
    Why this exists:
        Hold projected ocean geometry plus a prepared index for fast batch cell tests.
    When to use:
        Build once per pipeline run (or calibration) with ``build_ocean_predicate_context``, then pass to
        ``ocean_relation_for_cell_polygons`` for every H3 cell.
    What to expect:
        Immutable; safe to reuse across thousands of cells.
    """

    ocean_3857: BaseGeometry
    _prepared: object  # PreparedGeometry; typed loosely to avoid version-specific imports in stubs

    def covers(self, cell_3857: BaseGeometry) -> bool:
        """
        Why this exists:
            Delegate to the prepared ocean index for O(1)-style coverage tests vs the full union.
        """

        return bool(self._prepared.covers(cell_3857))

    def intersects(self, cell_3857: BaseGeometry) -> bool:
        """
        Why this exists:
            Coastal detection needs overlap without full coverage; prepared ``intersects`` avoids brute-force union checks.
        """

        return bool(self._prepared.intersects(cell_3857))


def _geom_wgs84_to_3857(geom: BaseGeometry) -> BaseGeometry:
    """
    Why this exists:
        Project WGS84 geometries to Web Mercator for robust global predicates.
    When to use:
        After loading ocean polygons and when projecting each H3 cell polygon.
    What to expect:
        Returns a geometry in EPSG:3857; may be empty if input is empty.
    """

    def _tf(x: float, y: float, z: float | None = None) -> tuple[float, float]:
        return _transformer_wgs84_to_3857.transform(x, y)

    return shapely_xy_transform(_tf, geom)


def load_ocean_union_wgs84(shapefile_path: Path) -> BaseGeometry:
    """
    Why this exists:
        Build one dissolved ocean/water geometry from the owner-supplied shapefile for terrain rules.
    When to use:
        Once per pipeline run (and calibration) before classifying cells.
    What to expect:
        Geometry in EPSG:4326 (lon/lat, x=lon y=lat). Reprojects from the file CRS when needed.
        Raises if the file is missing, has no features, or union is empty.
    """

    if not shapefile_path.is_file():
        raise FileNotFoundError(f"Ocean shapefile not found: {shapefile_path}")

    geoms: list[BaseGeometry] = []
    file_crs: CRS | None = None
    with fiona.open(shapefile_path) as src:
        if src.crs is not None:
            file_crs = CRS.from_user_input(src.crs)
        for feat in src:
            g = feat.get("geometry")
            if g is None:
                continue
            geoms.append(shape(g))

    if not geoms:
        raise ValueError(f"No geometries in ocean shapefile: {shapefile_path}")

    LOGGER.debug("Dissolving %d ocean feature(s) from %s …", len(geoms), shapefile_path)
    union_wgs = unary_union(geoms)
    union_wgs = make_valid(union_wgs)

    if file_crs is not None and not file_crs.equals(CRS.from_epsg(4326)):
        t = Transformer.from_crs(file_crs, CRS.from_epsg(4326), always_xy=True)

        def _reproj(x: float, y: float, z: float | None = None) -> tuple[float, float]:
            return t.transform(x, y)

        union_wgs = shapely_xy_transform(_reproj, union_wgs)
        union_wgs = make_valid(union_wgs)

    if union_wgs.is_empty:
        raise ValueError(f"Ocean union is empty after load: {shapefile_path}")

    LOGGER.debug(
        "Loaded ocean union from %s (wgs84 bounds=%s).",
        shapefile_path,
        union_wgs.bounds,
    )
    return union_wgs


def build_ocean_predicate_context(ocean_union_wgs84: BaseGeometry) -> OceanPredicateContext:
    """
    Why this exists:
        Project ocean to EPSG:3857 once and build a prepared geometry for fast per-cell predicates.
    When to use:
        Immediately after ``load_ocean_union_wgs84``; reuse the returned context for all cells.
    What to expect:
        For global high-resolution products (e.g. Natural Earth 10m ocean), **reprojecting the dissolved union**
        to EPSG:3857 can take **many minutes** and dominate wall time; per-cell tests are then much cheaper than
        raw ``Geometry.covers`` on the full multipolygon each time.
    """

    LOGGER.info(
        "Ocean mask: preparing Web Mercator geometry and predicate index (10m-scale global union: "
        "often many minutes CPU-bound; timing logs follow each step)."
    )
    t0 = time.perf_counter()
    g = make_valid(ocean_union_wgs84)
    LOGGER.info("Ocean mask: make_valid (WGS84 union) finished in %.1fs.", time.perf_counter() - t0)

    LOGGER.debug("Projecting ocean union to EPSG:3857 for predicates …")
    t1 = time.perf_counter()
    proj = make_valid(_geom_wgs84_to_3857(g))
    LOGGER.info("Ocean mask: projection to EPSG:3857 finished in %.1fs.", time.perf_counter() - t1)

    LOGGER.debug("Preparing ocean geometry for spatial predicates …")
    t2 = time.perf_counter()
    prepared = prep(proj)
    LOGGER.info("Ocean mask: prepared predicate index finished in %.1fs.", time.perf_counter() - t2)

    return OceanPredicateContext(ocean_3857=proj, _prepared=prepared)


def _exterior_edges_3857(poly: Polygon) -> list[LineString]:
    """
    Why this exists:
        Ocean/coastal rules refer to cell boundary sides as line segments in EPSG:3857.
    When to use:
        After projecting the H3 cell polygon; not for multipolygons (caller should merge first).
    What to expect:
        One :class:`~shapely.geometry.LineString` per boundary segment; skips zero-length segments.
    """

    co = list(poly.exterior.coords)
    if len(co) < 2:
        return []
    if co[0] == co[-1]:
        co = co[:-1]
    n = len(co)
    edges: list[LineString] = []
    for i in range(n):
        p, q = co[i], co[(i + 1) % n]
        if p == q:
            continue
        edges.append(LineString([p, q]))
    return edges


def _count_edges_fully_covered_by_ocean(
    cell_3857: Polygon,
    ocean_ctx: OceanPredicateContext,
) -> tuple[int, int]:
    """
    Why this exists:
        Support the isolated-island rule: count boundary segments entirely contained in the ocean union.
    When to use:
        When the cell intersects ocean but is not fully covered.
    What to expect:
        ``(covered_count, total_edges)`` using prepared ``covers`` on each exterior edge.
    """

    edges = _exterior_edges_3857(cell_3857)
    covered = sum(1 for e in edges if ocean_ctx.covers(e))
    return covered, len(edges)


def ocean_relation_for_cell_polygons(
    cell_poly_wgs84: Polygon | MultiPolygon,
    ocean_ctx: OceanPredicateContext,
) -> OceanRelationKind:
    """
    Why this exists:
        Apply ocean vs land/coastal rules from the water polygon union (EPSG:3857 predicates).
    When to use:
        For each H3 cell after building ``cell_polygon(cell)``.
    What to expect:
        ``in_ocean`` if the cell is entirely within ocean, or if it intersects ocean and **every** exterior edge
        lies fully within the ocean union (isolated land inside the hex, e.g. a small island, while the hex
        boundary is still all water). ``coastal_band`` if it intersects ocean but does not qualify as
        ``in_ocean``. ``land`` if it does not intersect ocean; interior biomes then come only from land-cover/topo
        (never coastal without an ocean intersection).
    """

    cell_wgs = make_valid(cell_poly_wgs84)
    if isinstance(cell_wgs, MultiPolygon):
        cell_wgs = make_valid(unary_union(cell_wgs))
    if not isinstance(cell_wgs, Polygon):
        cell_wgs = make_valid(cell_wgs.convex_hull)

    cell_3857 = make_valid(_geom_wgs84_to_3857(cell_wgs))
    if isinstance(cell_3857, MultiPolygon):
        cell_3857 = make_valid(unary_union(cell_3857))
    if not isinstance(cell_3857, Polygon):
        cell_3857 = make_valid(cell_3857.convex_hull)

    if ocean_ctx.covers(cell_3857):
        return "in_ocean"
    if not ocean_ctx.intersects(cell_3857):
        return "land"

    covered, n = _count_edges_fully_covered_by_ocean(cell_3857, ocean_ctx)
    if n > 0 and covered == n:
        return "in_ocean"
    return "coastal_band"
