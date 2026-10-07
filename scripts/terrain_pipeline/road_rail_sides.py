"""
Res4 road and rail side-mask extraction from Natural Earth line shapefiles.

Builds per-hex boolean arrays aligned to a deterministic clockwise side ordering
anchored at the north-most side midpoint, for tactical glyph rendering and routing.
"""

from __future__ import annotations

import hashlib
import logging
import math
from collections.abc import Mapping
from pathlib import Path
from typing import Any, Iterable, Sequence

import fiona
import h3
from pyproj import CRS, Transformer
from shapely.geometry import LineString, MultiLineString, MultiPoint, MultiPolygon, Point, Polygon, shape
from shapely.geometry.base import BaseGeometry
from shapely.geometry.polygon import orient
from shapely.ops import linemerge, nearest_points

from .sampling import cell_polygon

LOGGER = logging.getLogger(__name__)

# Standard logging level numeric value for trace-style getter logs (below DEBUG).
_LOG_TRACE = 5

ROAD_RAIL_SIDES_SCHEMA_VERSION = "1.1.0"
RESOLUTION = 4

# Natural Earth ``scalerank`` (coarser = more important). Export only major routes to match city overlay detail (0–4).
ROAD_RAIL_EXPORT_SCALERANK_MIN = 0
ROAD_RAIL_EXPORT_SCALERANK_MAX = 4

# Quality/speed contract default: derive candidate touched cells using fast H3 grid paths over
# each vertex-to-vertex segment. This is intentionally approximate but much faster than ultra-dense
# interpolation, and still conservative enough for tactical rendering/pathfinding masks.
DEFAULT_FAST_MODE = True

# Along-line sampling step in WGS84 degree space (~5e-7 lat ≈ 55 m) for fallback arclength densification.
LINE_TO_CELL_STEP_DEGREES = 5e-7

# Upper bound on interior samples along one ``LineString`` for the fallback densification path.
_MAX_LINE_GLOBAL_INTERIOR_SAMPLES = 10000

# Default QA buffer half-width (WGS84 degrees): kept modest relative to ``LINE_TO_CELL_STEP_DEGREES`` so the
# buffered polygon overlap baseline does not claim a much wider corridor than sampling covers (avoids false
# ``cells_only_in_buffered``). Override with ``--buffer-deg`` on ``qa-line-coverage``.
LINE_COVERAGE_QA_BUFFER_DEGREES_DEFAULT = 2e-6

# Above this absolute latitude, expand each sampled res4 cell with ``h3.grid_disk(..., 1)`` so candidates
# include immediate neighbors (mitigates high-latitude H3 distortion where midpoint + arclength sampling can
# skip a cell the buffered corridor still meets).
_LINE_CELL_DISK1_EXPAND_MIN_ABS_LAT = 55.0

SIDE_ORDERING_CONTRACT = (
    "Mask index i corresponds to side midpoints ordered clockwise around the cell centroid, "
    "starting at index 0 for the north-most side midpoint (maximum latitude; tie-break by "
    "minimum longitude). Arrays have length equal to the cell boundary edge count (5 or 6)."
)

# Geometric tolerances in degrees (planar lon/lat space; adequate for edge/corner classification).
_CORNER_TOL = 1e-9
_EDGE_INTERIOR_TOL = 1e-9
_LINE_LENGTH_TOL = 1e-12


def feature_has_scalerank_in_range(
    props: Mapping[str, Any] | None,
    scalerank_min: int,
    scalerank_max: int,
) -> bool:
    """
    Why this exists:
        Keep route features whose Natural Earth scalerank falls in a caller-chosen inclusive range.
    When to use:
        Immediately after reading each road or rail feature, before geometry work.
    What to expect:
        Returns False when ``scalerank`` is missing, non-numeric, or outside the range.
    """

    if props is None:
        return False
    raw = props.get("scalerank")
    if raw is None:
        return False
    try:
        value = int(float(raw))
    except (TypeError, ValueError):
        LOGGER.debug("road_rail_sides: skipping feature with non-numeric scalerank=%r.", raw)
        return False
    ok = scalerank_min <= value <= scalerank_max
    if not ok:
        LOGGER.log(_LOG_TRACE, "road_rail_sides: scalerank=%d outside export range %d..%d; skipping.", value, scalerank_min, scalerank_max)
    return ok


def _feature_has_export_scalerank(props: Mapping[str, Any] | None) -> bool:
    """
    Why this exists:
        Limit the global route export to scalerank 0–4.
    When to use:
        The global road and rail exporters.
    What to expect:
        Same result as ``feature_has_scalerank_in_range`` with the global min and max.
    """

    return feature_has_scalerank_in_range(props, ROAD_RAIL_EXPORT_SCALERANK_MIN, ROAD_RAIL_EXPORT_SCALERANK_MAX)


def _sha256_file(path: Path) -> str:
    """
    Why this exists:
        Record input provenance for reproducibility of generated side-mask JSON.
    When to use:
        When assembling the export envelope after successful validation.
    What to expect:
        Returns a lowercase hex SHA-256 digest of the file bytes.
    """

    LOGGER.debug("Computing SHA-256 for %s.", path)
    digest = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def _feature_transformer(src: fiona.Collection) -> Any | None:
    """
    Why this exists:
        Build a lon/lat transformer when a shapefile CRS is not WGS84.
    When to use:
        While opening each route shapefile collection.
    What to expect:
        Returns None when the source is already EPSG:4326; otherwise returns a two-argument transform callable.
    """

    if src.crs is None:
        return None
    source_crs = CRS.from_user_input(src.crs)
    if source_crs.equals(CRS.from_epsg(4326)):
        return None
    return Transformer.from_crs(source_crs, CRS.from_epsg(4326), always_xy=True).transform


def _geometry_wgs84(
    feature_geometry: object,
    xy_transform: Any | None,
) -> BaseGeometry | None:
    """
    Why this exists:
        Normalize Fiona geometry dicts into valid Shapely lon/lat geometries.
    When to use:
        After reading each route feature from disk.
    What to expect:
        Returns None for empty geometry; may apply ``buffer(0)`` to repair invalid polygons/lines.
    """

    if feature_geometry is None:
        return None
    geom = shape(feature_geometry)
    if geom.is_empty:
        return None
    if xy_transform is not None:
        from shapely.ops import transform as shp_transform

        geom = shp_transform(xy_transform, geom)
    if not geom.is_valid:
        geom = geom.buffer(0)
    if geom.is_empty:
        return None
    return geom


# Imported after the sampling constants so the cell helpers can read them.
from .road_rail_cells import (
    compare_linestring_cell_coverage_res4,
    h3_cells_for_linestring,
    h3_cells_for_linestring_res4,
    h3_cells_for_linestring_res4_buffered,
    h3_overlap_cells_res4,
)


def _midpoint_lat_lon(a: tuple[float, float], b: tuple[float, float]) -> tuple[float, float]:
    ax, ay = a
    bx, by = b
    return (0.5 * (ay + by), 0.5 * (ax + bx))


def _cw_angle_from_north(mid_lon: float, mid_lat: float, cen_lon: float, cen_lat: float) -> float:
    """
    Why this exists:
        Order side midpoints clockwise around the centroid starting from the global north anchor rule.
    When to use:
        While sorting boundary edges into canonical mask index order.
    What to expect:
        Returns radians in ``[0, 2π)`` increasing clockwise from geographic north in a local lon/lat plane.
    """

    vx = mid_lon - cen_lon
    vy = mid_lat - cen_lat
    return math.atan2(vx, vy) % (2.0 * math.pi)


def iter_route_linestrings(geom: BaseGeometry) -> Iterable[LineString]:
    """
    Why this exists:
        Flatten route geometries into individual linestrings for per-cell clipping.
    When to use:
        After normalizing a Fiona feature geometry to WGS84.
    What to expect:
        Yields only non-empty ``LineString`` parts; ignores points and polygons.
    """

    if geom.is_empty:
        return
    if geom.geom_type == "LineString":
        if not geom.is_empty:
            yield geom
        return
    if geom.geom_type == "MultiLineString":
        yield from (ls for ls in geom.geoms if not ls.is_empty)
        return
    if geom.geom_type == "GeometryCollection":
        for part in geom.geoms:
            yield from iter_route_linestrings(part)
        return


def ordered_cell_boundary_edges(poly: Polygon) -> list[LineString]:
    """
    Why this exists:
        Produce cell boundary edges in the canonical clockwise order required by the export contract.
    When to use:
        Before classifying which sides a clipped route segment touches.
    What to expect:
        Returns one ``LineString`` per exterior edge, length 5 or 6, ordered clockwise starting at the
        north-most side midpoint anchor (latitude tie-break to smaller longitude).
    """

    LOGGER.debug("ordered_cell_boundary_edges: building canonical edge order.")
    if poly.is_empty or not poly.is_valid:
        raise ValueError("polygon must be non-empty and valid")

    oriented = orient(poly, sign=1.0)
    ring = oriented.exterior
    coords = list(ring.coords)
    if len(coords) < 4:
        raise ValueError("polygon exterior must include at least three unique vertices")

    # Drop duplicated closing coordinate if present.
    if coords[0] == coords[-1]:
        coords = coords[:-1]

    n = len(coords)
    if n not in (5, 6):
        raise ValueError(f"expected pentagon or hexagon exterior, got n={n}")

    # Forward edges along stored ring order: (v_i -> v_{i+1}).
    forward_edges: list[LineString] = []
    for i in range(n):
        p0 = (coords[i][0], coords[i][1])
        p1 = (coords[(i + 1) % n][0], coords[(i + 1) % n][1])
        forward_edges.append(LineString([p0, p1]))

    return _order_edges_clockwise_from_north(oriented, forward_edges)


def ordered_cell_boundary_edges_for_cell(cell: str) -> list[LineString]:
    """
    Why this exists:
        Build the same clockwise side list when an H3 boundary has extra points.
    When to use:
        Road and rail export, instead of calling ``ordered_cell_boundary_edges`` on ``cell_polygon``.
    What to expect:
        Returns 5 or 6 sides. A cell whose boundary only has those corners matches
        ``ordered_cell_boundary_edges``. A face-crossing cell keeps each extra point on the
        side between the two real corners, so the mask length stays 5 or 6.
        Raises ``ValueError`` when the boundary cannot be paired with the cell vertices.
    """

    LOGGER.debug("ordered_cell_boundary_edges_for_cell: cell=%s.", cell)
    poly = cell_polygon(cell)
    coords = list(poly.exterior.coords)
    if coords and coords[0] == coords[-1]:
        coords = coords[:-1]
    if len(coords) in (5, 6):
        return ordered_cell_boundary_edges(poly)
    edges = _edges_between_cell_vertices(cell)
    return _order_edges_clockwise_from_north(poly, edges)


def _unwrap_lonlat(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """
    Why this exists:
        Keep boundary vertices in the same longitude branch as ``cell_polygon``.
    When to use:
        Before matching H3 vertices to a boundary that crosses the antimeridian.
    What to expect:
        Returns the same points when the longitude span is at most 180 degrees.
        Otherwise negative longitudes are shifted by 360.
    """

    lngs = [lng for lng, _ in points]
    if not lngs or max(lngs) - min(lngs) <= 180.0:
        return points
    return [(lng + 360.0, lat) if lng < 0 else (lng, lat) for lng, lat in points]


def _edges_between_cell_vertices(cell: str) -> list[LineString]:
    """
    Why this exists:
        Turn one H3 boundary ring into one linestring per pentagon or hexagon side.
    When to use:
        When ``cell_to_boundary`` includes points that are not cell vertices.
    What to expect:
        One ``LineString`` per vertex. Intermediate boundary points stay on the side
        they fall between. Raises ``ValueError`` when the matched vertex count is not 5 or 6.
    """

    vertex_lonlat = _unwrap_lonlat(
        [(lng, lat) for lat, lng in (h3.vertex_to_latlng(vertex) for vertex in h3.cell_to_vertexes(cell))]
    )
    boundary_lonlat = _unwrap_lonlat([(lng, lat) for lat, lng in h3.cell_to_boundary(cell)])

    def is_vertex(lng: float, lat: float) -> bool:
        return any(
            abs(lng - vertex_lng) <= _CORNER_TOL and abs(lat - vertex_lat) <= _CORNER_TOL
            for vertex_lng, vertex_lat in vertex_lonlat
        )

    vertex_indexes = [index for index, (lng, lat) in enumerate(boundary_lonlat) if is_vertex(lng, lat)]
    if len(vertex_indexes) not in (5, 6):
        message = (
            f"Cell {cell} boundary matched {len(vertex_indexes)} vertices; expected 5 or 6."
        )
        LOGGER.error(message)
        raise ValueError(message)

    edges: list[LineString] = []
    count = len(vertex_indexes)
    for index in range(count):
        start = vertex_indexes[index]
        end = vertex_indexes[(index + 1) % count]
        if end > start:
            coords = boundary_lonlat[start : end + 1]
        else:
            coords = boundary_lonlat[start:] + boundary_lonlat[: end + 1]
        edges.append(LineString(coords))
    return edges


def _order_edges_clockwise_from_north(poly: Polygon, forward_edges: list[LineString]) -> list[LineString]:
    """
    Why this exists:
        Apply the north-most midpoint anchor after the ring has been split into sides.
    When to use:
        From ``ordered_cell_boundary_edges`` and from the face-crossing cell path.
    What to expect:
        Returns the same edges, rotated so index 0 is the clockwise side whose endpoint
        midpoint is farthest north. Equal latitudes break toward the smaller longitude.
    """

    n = len(forward_edges)
    cen = poly.centroid
    cen_lon, cen_lat = float(cen.x), float(cen.y)

    edge_angles: list[tuple[float, int]] = []
    for i, edge in enumerate(forward_edges):
        lat, lon = _midpoint_lat_lon(
            (edge.coords[0][0], edge.coords[0][1]),
            (edge.coords[-1][0], edge.coords[-1][1]),
        )
        ang = _cw_angle_from_north(lon, lat, cen_lon, cen_lat)
        edge_angles.append((ang, i))

    edge_angles.sort(key=lambda t: (t[0], t[1]))

    best_i = 0
    best_lat, best_lon = _midpoint_lat_lon(
        (forward_edges[0].coords[0][0], forward_edges[0].coords[0][1]),
        (forward_edges[0].coords[-1][0], forward_edges[0].coords[-1][1]),
    )
    for i in range(1, n):
        edge = forward_edges[i]
        lat, lon = _midpoint_lat_lon(
            (edge.coords[0][0], edge.coords[0][1]),
            (edge.coords[-1][0], edge.coords[-1][1]),
        )
        if lat > best_lat + _CORNER_TOL:
            best_i = i
            best_lat, best_lon = lat, lon
        elif abs(lat - best_lat) <= _CORNER_TOL and lon < best_lon - _CORNER_TOL:
            best_i = i
            best_lat, best_lon = lat, lon

    start_pos = next(idx for idx, (_, edge_i) in enumerate(edge_angles) if edge_i == best_i)
    return [forward_edges[edge_angles[(start_pos + k) % n][1]] for k in range(n)]


def _point_on_closed_segment_interior(
    px: float,
    py: float,
    ax: float,
    ay: float,
    bx: float,
    by: float,
) -> bool:
    """
    Why this exists:
        Distinguish true side crossings from corner-only grazing for a single edge segment.
    When to use:
        After intersecting a clipped route with one cell boundary edge.
    What to expect:
        Returns True when the point lies strictly between the edge endpoints in parameter space.
    """

    dx, dy = bx - ax, by - ay
    seg_len2 = dx * dx + dy * dy
    if seg_len2 <= _LINE_LENGTH_TOL:
        return False
    t = ((px - ax) * dx + (py - ay) * dy) / seg_len2
    return t > _EDGE_INTERIOR_TOL and t < 1.0 - _EDGE_INTERIOR_TOL


def _point_on_edge_interior(px: float, py: float, edge: LineString) -> bool:
    """
    Why this exists:
        Treat a hit as a side touch when it is not on a corner of that side.
    When to use:
        Point intersections and near-miss checks against one ordered boundary edge.
    What to expect:
        A two-point edge uses the closed-segment interior test. A longer edge, used when a
        face crossing adds a boundary point, also counts that intermediate point as interior.
    """

    coords = list(edge.coords)
    if len(coords) < 2:
        return False
    if len(coords) == 2:
        return _point_on_closed_segment_interior(
            px,
            py,
            coords[0][0],
            coords[0][1],
            coords[1][0],
            coords[1][1],
        )
    ax, ay = coords[0][0], coords[0][1]
    bx, by = coords[-1][0], coords[-1][1]
    if abs(px - ax) <= _EDGE_INTERIOR_TOL and abs(py - ay) <= _EDGE_INTERIOR_TOL:
        return False
    if abs(px - bx) <= _EDGE_INTERIOR_TOL and abs(py - by) <= _EDGE_INTERIOR_TOL:
        return False
    for index in range(len(coords) - 1):
        sx, sy = coords[index][0], coords[index][1]
        ex, ey = coords[index + 1][0], coords[index + 1][1]
        if _point_on_closed_segment_interior(px, py, sx, sy, ex, ey):
            return True
        if index > 0 and abs(px - sx) <= _EDGE_INTERIOR_TOL and abs(py - sy) <= _EDGE_INTERIOR_TOL:
            return True
    return False


def _edge_touched_by_clipped_route(edge: LineString, clipped: BaseGeometry) -> bool:
    """
    Why this exists:
        Decide whether a clipped route geometry meaningfully intersects a single cell side segment.
    When to use:
        For each ordered boundary edge while building the boolean side mask.
    What to expect:
        Returns True for interior edge intersections and colinear overlaps; returns False for empty
        intersections and for corner-only contacts (vertex intersections not in the edge interior).
    """

    if clipped.is_empty:
        return False

    inter = edge.intersection(clipped)
    if inter.is_empty:
        # Shapely clipping can leave boundary-contact endpoints microscopically off the edge.
        # Treat those epsilon near-misses as touches only when the nearest edge point is on the
        # edge interior (not at a corner), preserving the corner-graze exclusion contract.
        try:
            edge_pt, clipped_pt = nearest_points(edge, clipped)
        except Exception:
            return False
        if edge_pt.distance(clipped_pt) > _EDGE_INTERIOR_TOL:
            return False
        return _point_on_edge_interior(edge_pt.x, edge_pt.y, edge)

    if isinstance(inter, LineString):
        return inter.length > _LINE_LENGTH_TOL

    if isinstance(inter, MultiLineString):
        return any(ls.length > _LINE_LENGTH_TOL for ls in inter.geoms)

    if isinstance(inter, Point):
        return _point_on_edge_interior(inter.x, inter.y, edge)

    if isinstance(inter, MultiPoint):
        return any(_point_on_edge_interior(pt.x, pt.y, edge) for pt in inter.geoms)

    if inter.geom_type == "GeometryCollection":
        return any(
            _edge_touched_by_clipped_route(edge, g)
            for g in inter.geoms
            if not g.is_empty
        )

    return False


def _normalize_lineal_geometry(geom: BaseGeometry) -> BaseGeometry:
    """
    Why this exists:
        Collapse mixed intersections into a lineal geometry suitable for edge intersection tests.
    When to use:
        Immediately after clipping a route to a cell polygon.
    What to expect:
        Returns ``LINESTRING``/``MULTILINESTRING`` or an empty geometry when no linear parts exist.
    """

    if geom.is_empty:
        return geom
    if geom.geom_type in ("LineString", "MultiLineString"):
        return geom
    if geom.geom_type == "GeometryCollection":
        parts = [g for g in geom.geoms if g.geom_type in ("LineString", "MultiLineString")]
        if not parts:
            return LineString()
        merged = linemerge(parts)
        return merged if not merged.is_empty else LineString()
    if geom.geom_type == "Point":
        return LineString()
    return geom


def side_touch_mask_for_cell(cell: str, clipped_route_wgs84: BaseGeometry) -> list[bool]:
    """
    Why this exists:
        Convert clipped route geometry inside one H3 cell into the side boolean mask for that cell.
    When to use:
        After clipping a route feature to ``cell_polygon(cell)``.
    What to expect:
        Returns a list of length 5 or 6 aligned to ``ordered_cell_boundary_edges`` ordering.
    """

    LOGGER.debug("side_touch_mask_for_cell: computing mask for cell=%s.", cell)
    edges = ordered_cell_boundary_edges_for_cell(cell)
    return side_touch_mask_for_edges(edges, clipped_route_wgs84)


def side_touch_mask_for_edges(edges: Sequence[LineString], clipped_route_wgs84: BaseGeometry) -> list[bool]:
    """
    Why this exists:
        Reuse precomputed side edges when many route fragments are tested against the same H3 cell.
    When to use:
        Hot path inside export loops with per-cell caches.
    What to expect:
        Returns one boolean per provided edge in the same order as ``edges``.
    """

    clipped = _normalize_lineal_geometry(clipped_route_wgs84)
    return [_edge_touched_by_clipped_route(edge, clipped) for edge in edges]


def _merge_bool_masks(a: Sequence[bool], b: Sequence[bool]) -> list[bool]:
    return [x or y for x, y in zip(a, b, strict=True)]


