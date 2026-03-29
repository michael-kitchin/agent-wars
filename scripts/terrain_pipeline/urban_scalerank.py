"""
Urban polygon loading split by ``scalerank`` for res-4 metadata breakdown.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from pathlib import Path
from typing import List, Tuple

import fiona
from pyproj import CRS, Transformer
from shapely import make_valid
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import transform as shapely_xy_transform, unary_union

from .ocean_mask import OceanPredicateContext, build_ocean_predicate_context
from .point_features import normalize_scalerank

LOGGER = logging.getLogger(__name__)


def _geom_to_wgs84(geom: BaseGeometry, file_crs: CRS | None) -> BaseGeometry:
    if file_crs is None or file_crs.equals(CRS.from_epsg(4326)):
        return geom
    t = Transformer.from_crs(file_crs, CRS.from_epsg(4326), always_xy=True)

    def _tf(x: float, y: float, z: float | None = None) -> tuple[float, float]:
        return t.transform(x, y)

    return make_valid(shapely_xy_transform(_tf, geom))


def load_urban_union_wgs84(shapefile_path: Path) -> BaseGeometry:
    """
    Why this exists:
        Dissolve all urban polygons to one WGS84 union (aggregate urban mask).
    When to use:
        Existing res-4 urban aggregate metrics and classification urban override.
    What to expect:
        Same contract as ``load_ocean_union_wgs84`` for geometry validity.
    """

    if not shapefile_path.is_file():
        raise FileNotFoundError(f"Urban shapefile not found: {shapefile_path}")

    geoms: list[BaseGeometry] = []
    file_crs: CRS | None = None
    with fiona.open(shapefile_path) as src:
        if src.crs is not None:
            file_crs = CRS.from_user_input(src.crs)
        for feat in src:
            g = feat.get("geometry")
            if g is None:
                continue
            geoms.append(_geom_to_wgs84(shape(g), file_crs))

    if not geoms:
        raise ValueError(f"No geometries in urban shapefile: {shapefile_path}")

    u = make_valid(unary_union(geoms))
    if u.is_empty:
        raise ValueError(f"Urban union is empty: {shapefile_path}")
    LOGGER.debug("Loaded urban union from %s (feature count=%d).", shapefile_path, len(geoms))
    return u


def load_urban_contexts_by_scalerank(
    shapefile_path: Path,
) -> tuple[OceanPredicateContext, List[Tuple[int, OceanPredicateContext]]]:
    """
    Why this exists:
        Build one prepared mask per distinct urban ``scalerank`` plus the aggregate urban mask.
    When to use:
        Res-4 metadata export urban breakdown.
    What to expect:
        Returns ``(aggregate_ctx, sorted list of (scalerank, ctx))``; sparse callers skip ranks with no intersection.
    """

    if not shapefile_path.is_file():
        raise FileNotFoundError(f"Urban shapefile not found: {shapefile_path}")

    by_rank: dict[int, list[BaseGeometry]] = defaultdict(list)
    file_crs: CRS | None = None
    with fiona.open(shapefile_path) as src:
        if src.crs is not None:
            file_crs = CRS.from_user_input(src.crs)
        for feat in src:
            g = feat.get("geometry")
            if g is None:
                continue
            props = feat.get("properties") or {}
            sr = normalize_scalerank(props.get("scalerank"))
            by_rank[sr].append(_geom_to_wgs84(shape(g), file_crs))

    all_parts: list[BaseGeometry] = []
    for geoms in by_rank.values():
        all_parts.extend(geoms)
    if not all_parts:
        raise ValueError(f"No urban geometries in {shapefile_path}")

    aggregate = make_valid(unary_union(all_parts))
    aggregate_ctx = build_ocean_predicate_context(aggregate)

    per_rank_ctxs: List[Tuple[int, OceanPredicateContext]] = []
    for sr in sorted(by_rank.keys()):
        geoms = by_rank[sr]
        union_rank = make_valid(unary_union(geoms))
        if union_rank.is_empty:
            continue
        per_rank_ctxs.append((sr, build_ocean_predicate_context(union_rank)))

    LOGGER.info(
        "Urban scalerank contexts: aggregate + %d rank-specific union(s) from %s.",
        len(per_rank_ctxs),
        shapefile_path,
    )
    return aggregate_ctx, per_rank_ctxs
