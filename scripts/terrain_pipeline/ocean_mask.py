"""
Load ocean (water) polygons from a shapefile and classify H3 cells vs that mask.

Predicates run in EPSG:3857 so H3 lon/lat rings and typical global ocean shapefiles interact
reliably. H3 cells that cross 180 degrees are split at the map seam before these tests
(see ``project_cell_for_masks``).

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
from shapely import get_parts, make_valid
from shapely.affinity import translate
from shapely.geometry import LineString, MultiPolygon, Polygon, box, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import transform as shapely_xy_transform, unary_union
from shapely.prepared import prep

from .antimeridian import (
    ANTIMERIDIAN_SEAM_INSET_M,
    WEB_MERCATOR_HALF_WIDTH_M,
    WEB_MERCATOR_WORLD_WIDTH_M,
    crosses_antimeridian,
)
from .classifier import OceanRelationKind
from .logging_utils import TRACE_LEVEL

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
        raw ``Geometry.covers`` on the full multipolygon each time. An empty input returns a context that
        intersects nothing, which is what a regional clip produces when the map contains no water polygons.
    """

    if ocean_union_wgs84.is_empty:
        LOGGER.debug("Ocean mask input is empty; preparing an empty polygon.")
        empty = Polygon()
        return OceanPredicateContext(ocean_3857=empty, _prepared=prep(empty))

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


@dataclass(frozen=True)
class MaskPolygonMetrics:
    """
    Why this exists:
        Expose reusable boundary and coverage facts for any prepared polygon mask (ocean, lakes, urban).
    When to use:
        Terrain metadata export and parity checks; also drives ``ocean_relation_for_cell_polygons``.
    What to expect:
        ``mask_edges`` counts exterior segments fully covered by the mask union; ``all_in_mask`` matches
        the classifier's ``in_water`` rule for that mask geometry.
    """

    total_edges: int
    mask_edges: int
    mask_covers_cell: bool
    intersects: bool

    @property
    def all_in_mask(self) -> bool:
        if self.mask_covers_cell:
            return True
        if not self.intersects:
            return False
        return self.total_edges > 0 and self.mask_edges == self.total_edges


@dataclass(frozen=True)
class ProjectedCell:
    """
    Why this exists:
        Carry a cell's EPSG:3857 area and boundary edges together, so a cell split at 180 degrees
        is tested the same way as any other cell.
    When to use:
        Build with ``project_cell_for_masks``, then pass to ``_mask_metrics_for_projected_cell``.
    What to expect:
        Ordinary cells have a Polygon area and one segment per edge. A cell crossing 180 degrees has
        one area piece near each edge of the map, and an edge that crosses the seam has two segments.
    """

    # Area for covers and intersects tests. A MultiPolygon only for a cell split at 180 degrees.
    area: Polygon | MultiPolygon
    # One entry per boundary edge in ring order. Each entry holds the edge's segments on each side of the seam.
    edges: tuple[tuple[LineString, ...], ...]


def project_cell_for_masks(cell_poly_wgs84: Polygon | MultiPolygon, *, cell: str | None = None) -> ProjectedCell:
    """
    Why this exists:
        Project a cell polygon to EPSG:3857 for the water and urban mask tests without letting a cell
        on the 180-degree meridian wrap across the whole map.
    When to use:
        Before ``_mask_metrics_for_projected_cell``. Pass the H3 index as ``cell`` whenever the polygon
        came from ``cell_polygon``. Without it, a crossing cell is projected the old way and spans the
        whole map.
    What to expect:
        Cells that do not cross 180 degrees, pole cells, and calls without ``cell`` use the unchanged
        single-polygon projection. Crossing cells are split at the map seam.
    Exceptions:
        ``ValueError`` when a crossing cell's polygon is not a Polygon or the split leaves no area or
        an edge without segments.
    """

    if cell is not None and crosses_antimeridian(cell):
        LOGGER.log(TRACE_LEVEL, "project_cell_for_masks cell=%s split=True.", cell)
        return _project_antimeridian_cell(cell, cell_poly_wgs84)
    LOGGER.log(TRACE_LEVEL, "project_cell_for_masks cell=%s split=False.", cell)
    projected = _cell_polygon_wgs84_to_3857(cell_poly_wgs84)
    return ProjectedCell(area=projected, edges=tuple((edge,) for edge in _exterior_edges_3857(projected)))


def _shifted_lonlat_to_3857(lng: float, lat: float) -> tuple[float, float]:
    """
    Why this exists:
        PROJ wraps longitudes past 180 back to the west edge of the map. Shifting those x values by
        one world width keeps a crossing cell's ring continuous past the east edge.
    When to use:
        For each vertex of a crossing cell from ``cell_polygon``, which uses longitudes up to about 180 plus
        the cell width.
    What to expect:
        EPSG:3857 coordinates, with x greater than ``WEB_MERCATOR_HALF_WIDTH_M`` for longitudes past 180.
    """

    if lng > 180.0:
        x, y = _transformer_wgs84_to_3857.transform(lng - 360.0, lat)
        return x + WEB_MERCATOR_WORLD_WIDTH_M, y
    return _transformer_wgs84_to_3857.transform(lng, lat)


def _split_at_seam(geom: BaseGeometry) -> list[BaseGeometry]:
    """
    Why this exists:
        Cut a continuous EPSG:3857 geometry that runs past the east map edge into the piece inside the
        map and the piece past the edge, moved back to the west side.
    When to use:
        On rings and edges built with ``_shifted_lonlat_to_3857``.
    What to expect:
        Non-empty pieces, east first. Each side stops ``ANTIMERIDIAN_SEAM_INSET_M`` short of the seam, so
        pieces stay inside the map and inside water polygons that end a hair short of longitude -180.
    """

    minx, miny, maxx, maxy = geom.bounds
    east = geom.intersection(box(minx - 1.0, miny - 1.0, WEB_MERCATOR_HALF_WIDTH_M - ANTIMERIDIAN_SEAM_INSET_M, maxy + 1.0))
    west_window = box(WEB_MERCATOR_HALF_WIDTH_M + ANTIMERIDIAN_SEAM_INSET_M, miny - 1.0, maxx + 1.0, maxy + 1.0)
    west = translate(geom.intersection(west_window), xoff=-WEB_MERCATOR_WORLD_WIDTH_M)
    return [piece for piece in (east, west) if not piece.is_empty]


def _parts_with_extent(geom: BaseGeometry, kind: type) -> list[BaseGeometry]:
    """
    Why this exists:
        A clip can return a multi-geometry, a point, or a collection. Only real polygons and segments
        take part in the mask tests.
    When to use:
        On each piece from ``_split_at_seam``, with ``Polygon`` for areas and ``LineString`` for edges.
    What to expect:
        The parts that are instances of ``kind`` with non-zero area (polygons) or length (lines).
    """

    return [
        part
        for part in get_parts(geom)
        if isinstance(part, kind) and (part.area > 0.0 if kind is Polygon else part.length > 0.0)
    ]


def _project_antimeridian_cell(cell: str, cell_poly_wgs84: Polygon | MultiPolygon) -> ProjectedCell:
    """
    Why this exists:
        Build the split projection for a cell that crosses 180 degrees, so each piece is tested
        against masks on its own side of the map.
    When to use:
        From ``project_cell_for_masks`` only, for cells where ``crosses_antimeridian`` holds.
    What to expect:
        A ``ProjectedCell`` whose area has one or two pieces and whose edges keep the ring order of the
        cell boundary.
    Exceptions:
        ``ValueError`` naming the cell when the polygon is not a Polygon, no area remains after the split,
        or an edge has no segment.
    """

    if not isinstance(cell_poly_wgs84, Polygon):
        message = f"Cell {cell} crosses 180 degrees but its polygon is a {cell_poly_wgs84.geom_type}, not a Polygon."
        LOGGER.error(message)
        raise ValueError(message)
    continuous = Polygon([_shifted_lonlat_to_3857(lng, lat) for lng, lat in list(cell_poly_wgs84.exterior.coords)[:-1]])
    pieces = [part for piece in _split_at_seam(continuous) for part in _parts_with_extent(piece, Polygon)]
    if not pieces:
        message = f"Cell {cell} has no area left after splitting at 180 degrees."
        LOGGER.error(message)
        raise ValueError(message)
    edges: list[tuple[LineString, ...]] = []
    for index, edge in enumerate(_exterior_edges_3857(continuous)):
        segments = tuple(part for piece in _split_at_seam(edge) for part in _parts_with_extent(piece, LineString))
        if not segments:
            message = f"Cell {cell} edge {index} has no segment after splitting at 180 degrees."
            LOGGER.error(message)
            raise ValueError(message)
        edges.append(segments)
    area = pieces[0] if len(pieces) == 1 else MultiPolygon(pieces)
    LOGGER.debug("Split cell %s at 180 degrees: area_pieces=%d edges=%d.", cell, len(pieces), len(edges))
    return ProjectedCell(area=area, edges=tuple(edges))


def _cell_polygon_wgs84_to_3857(cell_poly_wgs84: Polygon | MultiPolygon) -> Polygon:
    """
    Why this exists:
        Normalize H3 cell polygons to a single EPSG:3857 polygon for mask predicates. This is the path
        for cells that do not cross 180 degrees.
    When to use:
        Through ``project_cell_for_masks``.
    What to expect:
        Returns a valid :class:`~shapely.geometry.Polygon`; may use convex hull for exotic multipolygon cases.
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
    return cell_3857


def mask_metrics_for_cell_polygon(
    cell_poly_wgs84: Polygon | MultiPolygon,
    mask_ctx: OceanPredicateContext,
    *,
    cell: str | None = None,
) -> MaskPolygonMetrics:
    """
    Why this exists:
        Compute edge counts and intersection flags for a cell against any prepared mask union.
    When to use:
        Metadata JSON export (water/urban) and debugging mask parity. Pass ``cell`` for polygons from
        ``cell_polygon`` so a cell crossing 180 degrees is split at the map seam.
    What to expect:
        ``total_edges`` is 5 or 6 for typical H3 cells; ``mask_edges`` never exceeds ``total_edges``.
    """

    return _mask_metrics_for_projected_cell(project_cell_for_masks(cell_poly_wgs84, cell=cell), mask_ctx)


def _mask_metrics_for_projected_cell(
    projected: ProjectedCell,
    mask_ctx: OceanPredicateContext,
) -> MaskPolygonMetrics:
    """
    Why this exists:
        Score one already-projected cell against several masks without projecting it again.
    When to use:
        From ``mask_metrics_for_cell_polygon`` and from the metadata cell loop.
    What to expect:
        Same flags as ``mask_metrics_for_cell_polygon``. Coverage and intersection are both
        measured, and every boundary edge is counted, including when the cell misses the mask.
        An edge counts as covered only when all of its segments are covered.
    """

    covers = mask_ctx.covers(projected.area)
    intersects = mask_ctx.intersects(projected.area)
    covered = sum(1 for segments in projected.edges if all(mask_ctx.covers(segment) for segment in segments))
    return MaskPolygonMetrics(
        total_edges=len(projected.edges),
        mask_edges=covered,
        mask_covers_cell=covers,
        intersects=intersects,
    )


def ocean_relation_for_cell_polygons(
    cell_poly_wgs84: Polygon | MultiPolygon,
    ocean_ctx: OceanPredicateContext,
    *,
    cell: str | None = None,
) -> OceanRelationKind:
    """
    Why this exists:
        Apply ocean vs land/coastal rules from the water polygon union (EPSG:3857 predicates).
    When to use:
        For each H3 cell after building ``cell_polygon(cell)``. Pass ``cell`` so a cell crossing
        180 degrees is split at the map seam.
    What to expect:
        ``in_water`` if the cell is entirely within the water union, or if it intersects water and **every**
        exterior edge lies fully within the water union (isolated dry inside the hex while the hex boundary is
        still all water). ``coastal_band`` if it intersects water but does not qualify as ``in_water``.
        ``no_water`` if it does not intersect water; interior biomes then come only from land-cover/topo
        (never coastal without a water intersection).
    """

    m = mask_metrics_for_cell_polygon(cell_poly_wgs84, ocean_ctx, cell=cell)
    if m.all_in_mask:
        return "in_water"
    if not m.intersects:
        return "no_water"
    return "coastal_band"
