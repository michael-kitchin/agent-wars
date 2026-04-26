"""
Res4 road and rail side-mask extraction from Natural Earth line shapefiles.

Builds per-hex boolean arrays aligned to a deterministic clockwise side ordering
anchored at the north-most side midpoint, for tactical glyph rendering and routing.
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
from dataclasses import dataclass
from datetime import UTC, datetime
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


def _feature_has_export_scalerank(props: Mapping[str, Any] | None) -> bool:
    """
    Why this exists:
        Limit route geometry to Natural Earth features tagged as major (``scalerank`` 0–4) so tactical overlays stay readable.
    When to use:
        Immediately after reading each road/rail feature, before geometry work.
    What to expect:
        Returns False when ``scalerank`` is missing or outside ``ROAD_RAIL_EXPORT_SCALERANK_MIN``..``ROAD_RAIL_EXPORT_SCALERANK_MAX``.
    Exceptions:
        Non-numeric ``scalerank`` values are treated as excluded (returns False).
    """

    if props is None:
        return False
    raw = props.get("scalerank")
    if raw is None:
        return False
    try:
        v = int(float(raw))
    except (TypeError, ValueError):
        LOGGER.debug("road_rail_sides: skipping feature with non-numeric scalerank=%r.", raw)
        return False
    ok = ROAD_RAIL_EXPORT_SCALERANK_MIN <= v <= ROAD_RAIL_EXPORT_SCALERANK_MAX
    if not ok:
        LOGGER.log(_LOG_TRACE, "road_rail_sides: scalerank=%d outside export range; skipping.", v)
    return ok


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


def h3_overlap_cells_res4(geom_wgs84: BaseGeometry) -> list[str]:
    """
    Why this exists:
        Map polygon geometry to candidate res4 H3 cells using the same overlap contract as naming export.
    When to use:
        When a buffered route is represented as a polygon or when polygonal sources are added later.
    What to expect:
        Returns a de-duplicated sorted list of cell ids; may be empty for geometries outside coverage.
    """

    LOGGER.debug("h3_overlap_cells_res4: polygon overlap cell query.")
    h3shape = h3.geo_to_h3shape(geom_wgs84.__geo_interface__)
    cells = list(h3.h3shape_to_cells_experimental(h3shape, RESOLUTION, contain="overlap"))
    return sorted(set(cells))


def _expand_h3_cells_disk1(cells: Iterable[str]) -> set[str]:
    """
    Why this exists:
        Widen a res4 cell set by one H3 grid step so near-miss neighbors are included as export candidates.
    When to use:
        After point sampling along lines that reach high absolute latitude (see ``_LINE_CELL_DISK1_EXPAND_MIN_ABS_LAT``).
    What to expect:
        Returns a superset of the input ids; logs nothing; skips invalid indices defensively.
    """

    out: set[str] = set(cells)
    for c in cells:
        try:
            out.update(h3.grid_disk(c, 1))
        except Exception as exc:
            LOGGER.debug("grid_disk(1) skipped for cell=%s: %s", c, exc)
    return out


def h3_cells_for_linestring_res4(
    line: LineString,
    *,
    use_fast_segment_grid_path: bool = DEFAULT_FAST_MODE,
) -> list[str]:
    """
    Why this exists:
        ``h3.geo_to_h3shape`` does not accept GeoJSON ``LineString`` inputs, so route features must be
        mapped to cells via deterministic densified sampling along the polyline in WGS84 degree space.
    When to use:
        Before clipping each route segment to individual cell polygons for side detection.
    What to expect:
        Returns a sorted de-duplicated list of res4 indices. Default mode uses per-segment
        ``h3.grid_path_cells`` for speed; fallback mode uses bounded arclength densification.
        For high-latitude lines (``|lat| >= _LINE_CELL_DISK1_EXPAND_MIN_ABS_LAT``), ring-1
        expansion is applied to reduce misses from distortion.
    """

    LOGGER.debug(
        "h3_cells_for_linestring_res4: deriving candidate cells (length=%s, mode=%s).",
        line.length,
        "fast" if use_fast_segment_grid_path else "high-fidelity",
    )
    if line.is_empty or line.length <= _LINE_LENGTH_TOL:
        return []

    cells: set[str] = set()
    coords = list(line.coords)
    endpoint_cells: list[str] = []
    for lon, lat in coords:
        c = h3.latlng_to_cell(lat, lon, RESOLUTION)
        endpoint_cells.append(c)
        cells.add(c)

    if use_fast_segment_grid_path:
        for i in range(len(endpoint_cells) - 1):
            c0 = endpoint_cells[i]
            c1 = endpoint_cells[i + 1]
            if c0 == c1:
                continue
            try:
                cells.update(h3.grid_path_cells(c0, c1))
            except Exception:
                x0, y0 = coords[i]
                x1, y1 = coords[i + 1]
                seg = LineString([(x0, y0), (x1, y1)])
                slen = float(seg.length)
                if slen > _LINE_LENGTH_TOL:
                    pt = seg.interpolate(0.5 * slen)
                    cells.add(h3.latlng_to_cell(float(pt.y), float(pt.x), RESOLUTION))
    else:
        length = float(line.length)
        interior_count = min(
            _MAX_LINE_GLOBAL_INTERIOR_SAMPLES,
            max(1, int(math.ceil(length / LINE_TO_CELL_STEP_DEGREES))),
        )
        for k in range(1, interior_count + 1):
            pt = line.interpolate(length * (k / (interior_count + 1)))
            cells.add(h3.latlng_to_cell(float(pt.y), float(pt.x), RESOLUTION))

    max_abs_lat = max(abs(float(xy[1])) for xy in coords)
    if max_abs_lat >= _LINE_CELL_DISK1_EXPAND_MIN_ABS_LAT:
        cells = _expand_h3_cells_disk1(cells)

    return sorted(cells)


def h3_cells_for_linestring_res4_buffered(
    line: LineString,
    buffer_deg: float = LINE_COVERAGE_QA_BUFFER_DEGREES_DEFAULT,
) -> set[str]:
    """
    Why this exists:
        QA baseline for route-to-cell coverage: ``h3.geo_to_h3shape`` accepts polygons, so a thin buffer
        around the line yields an overlap cell set to compare against densified point sampling.
    When to use:
        Only from ``compare_linestring_cell_coverage_res4`` or the ``qa-line-coverage`` CLI path.
    What to expect:
        Returns res4 cell ids overlapping the buffered corridor; may include a few cells not hit by
        ``h3_cells_for_linestring_res4`` when the buffer is wider than the sampling grid.
    """

    LOGGER.debug(
        "h3_cells_for_linestring_res4_buffered: buffer_deg=%s line.length=%s.",
        buffer_deg,
        line.length,
    )
    if line.is_empty or line.length <= _LINE_LENGTH_TOL:
        return set()

    buf = line.buffer(buffer_deg)
    if buf.is_empty:
        return set()
    if not buf.is_valid:
        buf = buf.buffer(0)
    if buf.is_empty:
        return set()

    cells: set[str] = set()
    if isinstance(buf, Polygon):
        cells.update(h3_overlap_cells_res4(buf))
    elif isinstance(buf, MultiPolygon):
        for part in buf.geoms:
            if not part.is_empty:
                cells.update(h3_overlap_cells_res4(part))
    return cells


def compare_linestring_cell_coverage_res4(
    line: LineString,
    *,
    buffer_deg: float = LINE_COVERAGE_QA_BUFFER_DEGREES_DEFAULT,
    use_fast_segment_grid_path: bool = DEFAULT_FAST_MODE,
) -> dict[str, Any]:
    """
    Why this exists:
        Quantify differences between production densified cell discovery and buffered-polygon overlap.
    When to use:
        QA runs and unit tests; not used in the main export path.
    What to expect:
        Returns counts and sorted cell id lists for ``cells_only_in_buffered`` (pipeline would miss)
        and ``cells_only_in_densified`` (buffer corridor missed or discretization noise).
    """

    LOGGER.debug("compare_linestring_cell_coverage_res4: comparing coverage methods.")
    dense = set(
        h3_cells_for_linestring_res4(
            line,
            use_fast_segment_grid_path=use_fast_segment_grid_path,
        )
    )
    buff = h3_cells_for_linestring_res4_buffered(line, buffer_deg=buffer_deg)
    only_buff = sorted(buff - dense)
    only_dense = sorted(dense - buff)
    return {
        "n_densified": len(dense),
        "n_buffered": len(buff),
        "cells_only_in_buffered": only_buff,
        "cells_only_in_densified": only_dense,
        "has_mismatch": bool(only_buff or only_dense),
    }


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

    cen = oriented.centroid
    cen_lon, cen_lat = float(cen.x), float(cen.y)

    edge_angles: list[tuple[float, int]] = []
    for i, edge in enumerate(forward_edges):
        lat, lon = _midpoint_lat_lon(
            (edge.coords[0][0], edge.coords[0][1]),
            (edge.coords[1][0], edge.coords[1][1]),
        )
        ang = _cw_angle_from_north(lon, lat, cen_lon, cen_lat)
        edge_angles.append((ang, i))

    edge_angles.sort(key=lambda t: (t[0], t[1]))

    best_i = 0
    best_lat, best_lon = _midpoint_lat_lon(
        (forward_edges[0].coords[0][0], forward_edges[0].coords[0][1]),
        (forward_edges[0].coords[1][0], forward_edges[0].coords[1][1]),
    )
    for i in range(1, n):
        e = forward_edges[i]
        lat, lon = _midpoint_lat_lon((e.coords[0][0], e.coords[0][1]), (e.coords[1][0], e.coords[1][1]))
        if lat > best_lat + _CORNER_TOL:
            best_i = i
            best_lat, best_lon = lat, lon
        elif abs(lat - best_lat) <= _CORNER_TOL and lon < best_lon - _CORNER_TOL:
            best_i = i
            best_lat, best_lon = lat, lon

    start_pos = next(idx for idx, (_, edge_i) in enumerate(edge_angles) if edge_i == best_i)
    ordered = [forward_edges[edge_angles[(start_pos + k) % n][1]] for k in range(n)]
    return ordered


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
        ax, ay = edge.coords[0][0], edge.coords[0][1]
        bx, by = edge.coords[1][0], edge.coords[1][1]
        return _point_on_closed_segment_interior(edge_pt.x, edge_pt.y, ax, ay, bx, by)

    if isinstance(inter, LineString):
        return inter.length > _LINE_LENGTH_TOL

    if isinstance(inter, MultiLineString):
        return any(ls.length > _LINE_LENGTH_TOL for ls in inter.geoms)

    if isinstance(inter, Point):
        ax, ay = edge.coords[0][0], edge.coords[0][1]
        bx, by = edge.coords[1][0], edge.coords[1][1]
        return _point_on_closed_segment_interior(inter.x, inter.y, ax, ay, bx, by)

    if isinstance(inter, MultiPoint):
        ax, ay = edge.coords[0][0], edge.coords[0][1]
        bx, by = edge.coords[1][0], edge.coords[1][1]
        return any(_point_on_closed_segment_interior(pt.x, pt.y, ax, ay, bx, by) for pt in inter.geoms)

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
    poly = cell_polygon(cell)
    edges = ordered_cell_boundary_edges(poly)
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


@dataclass
class RoadRailSidesExporter:
    """
    Why this exists:
        Run validation and export res4 road/rail side masks into a single JSON artifact.
    When to use:
        Invoked from ``road_rail_sides_cli`` after arguments are parsed.
    What to expect:
        Writes ``terrain_res4_road_rail_sides.json`` under the configured output directory.
    """

    data_root: Path
    output_dir: Path
    road_shapefile_name: str = "ne_10m_roads.shp"
    rail_shapefile_name: str = "ne_10m_railroads.shp"
    output_filename: str = "terrain_res4_road_rail_sides.json"

    def road_path(self) -> Path:
        """
        Why this exists:
            Resolve the road shapefile path for validation and hashing.
        When to use:
            Before opening Natural Earth roads.
        What to expect:
            Returns ``data_root / road_shapefile_name``.
        """

        LOGGER.log(_LOG_TRACE, "road_path getter resolved for road_rail_sides exporter.")
        return self.data_root / self.road_shapefile_name

    def rail_path(self) -> Path:
        """
        Why this exists:
            Resolve the railroad shapefile path for validation and hashing.
        When to use:
            Before opening Natural Earth railroads.
        What to expect:
            Returns ``data_root / rail_shapefile_name``.
        """

        LOGGER.log(_LOG_TRACE, "rail_path getter resolved for road_rail_sides exporter.")
        return self.data_root / self.rail_shapefile_name

    def output_path(self) -> Path:
        """
        Why this exists:
            Resolve the JSON output path for writers and tests.
        When to use:
            After validation succeeds and before streaming records.
        What to expect:
            Returns ``output_dir / output_filename``.
        """

        LOGGER.log(_LOG_TRACE, "output_path getter resolved for road_rail_sides exporter.")
        return self.output_dir / self.output_filename

    def validate_inputs(self) -> None:
        """
        Why this exists:
            Fail fast when required Natural Earth inputs are missing or unreadable.
        When to use:
            First step of ``run_all`` or standalone ``validate`` CLI.
        What to expect:
            Raises ``FileNotFoundError`` when paths are missing; may raise driver errors for corrupt data.
        """

        LOGGER.debug("road_rail_sides: validating inputs at data_root=%s.", self.data_root)
        for label, path in (("road", self.road_path()), ("rail", self.rail_path())):
            if not path.is_file():
                raise FileNotFoundError(f"Missing {label} shapefile: {path}")
            with fiona.open(path) as src:
                _ = src.schema
        LOGGER.info("road_rail_sides: input validation passed (road and rail readable).")

    def run_export(
        self,
        *,
        max_features: int | None = None,
        use_fast_segment_grid_path: bool = DEFAULT_FAST_MODE,
    ) -> None:
        """
        Why this exists:
            Scan road and rail shapefiles and write the merged touched-cell JSON export.
        When to use:
            After ``validate_inputs`` succeeds.
        What to expect:
            Creates parent directories as needed and overwrites the output JSON atomically via write+replace.
        """

        LOGGER.debug(
            "road_rail_sides: starting export (max_features=%s, mode=%s).",
            max_features,
            "fast" if use_fast_segment_grid_path else "high-fidelity",
        )
        self.output_dir.mkdir(parents=True, exist_ok=True)

        masks_by_cell: dict[str, tuple[list[bool], list[bool]]] = {}
        cell_polygon_cache: dict[str, Polygon] = {}
        cell_edges_cache: dict[str, list[LineString]] = {}

        def accumulate(layer: str, path: Path) -> None:
            LOGGER.debug("road_rail_sides: scanning %s layer at %s.", layer, path)
            processed = 0
            skipped_scalerank = 0
            with fiona.open(path) as src:
                xy_transform = _feature_transformer(src)
                for feature in src:
                    if max_features is not None and processed >= max_features:
                        LOGGER.debug(
                            "road_rail_sides: max_features=%d reached; stopping %s scan.",
                            max_features,
                            layer,
                        )
                        break
                    processed += 1
                    raw_props = feature.get("properties")
                    props = raw_props if isinstance(raw_props, Mapping) else None
                    if not _feature_has_export_scalerank(props):
                        skipped_scalerank += 1
                        continue
                    geom = _geometry_wgs84(feature.get("geometry"), xy_transform)
                    if geom is None:
                        continue

                    for line in iter_route_linestrings(geom):
                        if line.is_empty or line.length <= _LINE_LENGTH_TOL:
                            continue
                        try:
                            cells = h3_cells_for_linestring_res4(
                                line,
                                use_fast_segment_grid_path=use_fast_segment_grid_path,
                            )
                        except Exception as exc:
                            LOGGER.error(
                                "road_rail_sides: H3 overlap failed for %s feature id=%s: %s",
                                layer,
                                feature.get("id"),
                                exc,
                                exc_info=True,
                            )
                            raise

                        for cell in cells:
                            poly = cell_polygon_cache.get(cell)
                            if poly is None:
                                poly = cell_polygon(cell)
                                cell_polygon_cache[cell] = poly
                            clipped = line.intersection(poly)
                            if clipped.is_empty:
                                continue
                            edges = cell_edges_cache.get(cell)
                            if edges is None:
                                edges = ordered_cell_boundary_edges(poly)
                                cell_edges_cache[cell] = edges
                            mask = side_touch_mask_for_edges(edges, clipped)
                            if not any(mask):
                                continue

                            if cell not in masks_by_cell:
                                masks_by_cell[cell] = (
                                    [False] * len(mask),
                                    [False] * len(mask),
                                )

                            road_mask, rail_mask = masks_by_cell[cell]
                            if layer == "road":
                                road_mask = _merge_bool_masks(road_mask, mask)
                            else:
                                rail_mask = _merge_bool_masks(rail_mask, mask)

                            masks_by_cell[cell] = (road_mask, rail_mask)

                    if processed % 5000 == 0:
                        LOGGER.debug(
                            "road_rail_sides: processed %d features from %s.",
                            processed,
                            layer,
                        )

            LOGGER.info(
                "road_rail_sides: %s layer scalerank filter skipped %d of %d features (kept scalerank %d..%d).",
                layer,
                skipped_scalerank,
                processed,
                ROAD_RAIL_EXPORT_SCALERANK_MIN,
                ROAD_RAIL_EXPORT_SCALERANK_MAX,
            )

        accumulate("road", self.road_path())
        accumulate("rail", self.rail_path())
        LOGGER.info(
            "road_rail_sides: global road+rail scan complete; %d res4 cells indexed before merge/write (scalerank %d..%d).",
            len(masks_by_cell),
            ROAD_RAIL_EXPORT_SCALERANK_MIN,
            ROAD_RAIL_EXPORT_SCALERANK_MAX,
        )

        records: list[dict[str, Any]] = []
        for cell in sorted(masks_by_cell.keys()):
            road_mask, rail_mask = masks_by_cell[cell]
            if not any(road_mask) and not any(rail_mask):
                continue
            if len(road_mask) != len(rail_mask):
                raise RuntimeError(f"Inconsistent mask lengths for cell={cell}")
            records.append(
                {
                    "h3_index": cell,
                    "road_sides": road_mask,
                    "rail_sides": rail_mask,
                }
            )

        envelope: dict[str, Any] = {
            "schema_version": ROAD_RAIL_SIDES_SCHEMA_VERSION,
            "resolution": RESOLUTION,
            "generated_at_utc": datetime.now(UTC).isoformat(),
            "record_count": len(records),
            "route_scalerank_filter": {
                "min": ROAD_RAIL_EXPORT_SCALERANK_MIN,
                "max": ROAD_RAIL_EXPORT_SCALERANK_MAX,
            },
            "side_ordering_contract": SIDE_ORDERING_CONTRACT,
            "inputs": [
                {"role": "road", "path": str(self.road_path()), "sha256": _sha256_file(self.road_path())},
                {"role": "rail", "path": str(self.rail_path()), "sha256": _sha256_file(self.rail_path())},
            ],
            "records": records,
        }

        out_path = self.output_path()
        tmp_path = out_path.with_suffix(out_path.suffix + ".tmp")
        LOGGER.debug("road_rail_sides: writing %d records to %s.", len(records), out_path)
        with tmp_path.open("w", encoding="utf-8", newline="\n") as f:
            json.dump(envelope, f, indent=2, ensure_ascii=False)
            f.write("\n")
        tmp_path.replace(out_path)
        LOGGER.info("road_rail_sides: wrote %s (%d records).", out_path, len(records))
        if len(records) == 0:
            LOGGER.error(
                "road_rail_sides: export produced zero records; check scalerank filter vs shapefile attributes.",
            )

    def run_qa_line_cell_coverage(
        self,
        *,
        max_features: int | None = None,
        buffer_deg: float = LINE_COVERAGE_QA_BUFFER_DEGREES_DEFAULT,
        max_example_lines: int = 12,
        use_fast_segment_grid_path: bool = DEFAULT_FAST_MODE,
    ) -> dict[str, Any]:
        """
        Why this exists:
            Compare densified line-to-res4 cell discovery (used in export) against a thin-buffer polygon
            overlap baseline so missed cells can be detected before relying on export output alone.
        When to use:
            From the ``qa-line-coverage`` CLI subcommand or ad-hoc validation after changing sampling constants.
        What to expect:
            Validates shapefile readability first, then scans each layer and returns summary counts plus a
            short list of example mismatches; logs an INFO summary.
        """

        LOGGER.debug(
            "road_rail_sides: QA line cell coverage (max_features=%s buffer_deg=%s max_example_lines=%d mode=%s).",
            max_features,
            buffer_deg,
            max_example_lines,
            "fast" if use_fast_segment_grid_path else "high-fidelity",
        )
        self.validate_inputs()

        lines_compared = 0
        lines_with_buffered_only = 0
        lines_with_dense_only = 0
        total_buffered_only_cells = 0
        total_dense_only_cells = 0
        examples: list[dict[str, Any]] = []

        def scan(layer: str, path: Path) -> None:
            nonlocal lines_compared, lines_with_buffered_only, lines_with_dense_only
            nonlocal total_buffered_only_cells, total_dense_only_cells

            processed = 0
            with fiona.open(path) as src:
                xy_transform = _feature_transformer(src)
                for feature in src:
                    if max_features is not None and processed >= max_features:
                        LOGGER.debug(
                            "road_rail_sides: QA max_features=%d reached for %s.",
                            max_features,
                            layer,
                        )
                        break
                    processed += 1
                    qa_props = feature.get("properties")
                    qa_props_map = qa_props if isinstance(qa_props, Mapping) else None
                    if not _feature_has_export_scalerank(qa_props_map):
                        continue
                    geom = _geometry_wgs84(feature.get("geometry"), xy_transform)
                    if geom is None:
                        continue

                    for line in iter_route_linestrings(geom):
                        if line.is_empty or line.length <= _LINE_LENGTH_TOL:
                            continue
                        cmp = compare_linestring_cell_coverage_res4(
                            line,
                            buffer_deg=buffer_deg,
                            use_fast_segment_grid_path=use_fast_segment_grid_path,
                        )
                        lines_compared += 1
                        ob = cmp["cells_only_in_buffered"]
                        od = cmp["cells_only_in_densified"]
                        if ob:
                            lines_with_buffered_only += 1
                            total_buffered_only_cells += len(ob)
                        if od:
                            lines_with_dense_only += 1
                            total_dense_only_cells += len(od)
                        if cmp["has_mismatch"] and len(examples) < max_example_lines:
                            examples.append(
                                {
                                    "layer": layer,
                                    "feature_id": feature.get("id"),
                                    "line_wkt_prefix": line.wkt[:240],
                                    "cells_only_in_buffered": ob,
                                    "cells_only_in_densified": od,
                                }
                            )

        scan("road", self.road_path())
        scan("rail", self.rail_path())

        summary: dict[str, Any] = {
            "mode": "fast" if use_fast_segment_grid_path else "high-fidelity",
            "buffer_deg": buffer_deg,
            "lines_compared": lines_compared,
            "lines_with_cells_only_in_buffered": lines_with_buffered_only,
            "lines_with_cells_only_in_densified": lines_with_dense_only,
            "total_cells_only_in_buffered": total_buffered_only_cells,
            "total_cells_only_in_densified": total_dense_only_cells,
            "example_mismatches": examples,
        }
        LOGGER.info(
            "road_rail_sides QA: compared %d line parts; "
            "lines_with_cells_only_in_buffered=%d (export would miss those cells); "
            "lines_with_cells_only_in_densified=%d; "
            "example rows=%d.",
            lines_compared,
            lines_with_buffered_only,
            lines_with_dense_only,
            len(examples),
        )
        if examples:
            LOGGER.info("road_rail_sides QA: first example mismatch detail: %s", examples[0])
        return summary

    def run_all(
        self,
        *,
        max_features: int | None = None,
        use_fast_segment_grid_path: bool = DEFAULT_FAST_MODE,
    ) -> None:
        """
        Why this exists:
            Validate inputs then perform export in one reliable entrypoint.
        When to use:
            Normal CLI ``run`` path.
        What to expect:
            Raises on validation failure before writing partial outputs.
        """

        LOGGER.debug("road_rail_sides: run_all starting.")
        self.validate_inputs()
        self.run_export(
            max_features=max_features,
            use_fast_segment_grid_path=use_fast_segment_grid_path,
        )
        LOGGER.info("road_rail_sides: run_all complete.")
