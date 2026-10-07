"""Map route lines to H3 cells at a caller-chosen resolution."""

from __future__ import annotations

import math
from collections.abc import Iterable
from typing import Any

import h3
from shapely.geometry import LineString, MultiPolygon, Polygon
from shapely.geometry.base import BaseGeometry

from .road_rail_sides import (
    DEFAULT_FAST_MODE,
    LINE_COVERAGE_QA_BUFFER_DEGREES_DEFAULT,
    LINE_TO_CELL_STEP_DEGREES,
    LOGGER,
    RESOLUTION,
    _LINE_CELL_DISK1_EXPAND_MIN_ABS_LAT,
    _LINE_LENGTH_TOL,
    _MAX_LINE_GLOBAL_INTERIOR_SAMPLES,
)

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


def h3_cells_for_linestring(
    line: LineString,
    *,
    resolution: int,
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
        c = h3.latlng_to_cell(lat, lon, resolution)
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
                    cells.add(h3.latlng_to_cell(float(pt.y), float(pt.x), resolution))
    else:
        length = float(line.length)
        interior_count = min(
            _MAX_LINE_GLOBAL_INTERIOR_SAMPLES,
            max(1, int(math.ceil(length / LINE_TO_CELL_STEP_DEGREES))),
        )
        for k in range(1, interior_count + 1):
            pt = line.interpolate(length * (k / (interior_count + 1)))
            cells.add(h3.latlng_to_cell(float(pt.y), float(pt.x), resolution))

    max_abs_lat = max(abs(float(xy[1])) for xy in coords)
    if max_abs_lat >= _LINE_CELL_DISK1_EXPAND_MIN_ABS_LAT:
        cells = _expand_h3_cells_disk1(cells)

    return sorted(cells)


def h3_cells_for_linestring_res4(
    line: LineString,
    *,
    use_fast_segment_grid_path: bool = DEFAULT_FAST_MODE,
) -> list[str]:
    """
    Why this exists:
        Keep the global resolution-4 line-to-cell helper on its historical name.
    When to use:
        Global road and rail export and the existing coverage tests.
    What to expect:
        Same cells as ``h3_cells_for_linestring`` with ``resolution=4``.
    """

    LOGGER.debug(
        "h3_cells_for_linestring_res4 length=%s fast=%s.",
        line.length,
        use_fast_segment_grid_path,
    )
    return h3_cells_for_linestring(
        line,
        resolution=RESOLUTION,
        use_fast_segment_grid_path=use_fast_segment_grid_path,
    )


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

