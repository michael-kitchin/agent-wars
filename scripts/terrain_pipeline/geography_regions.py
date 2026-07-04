"""
Load Natural Earth geography region polygons for res-1 landmass membership.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

import fiona
from pyproj import CRS, Transformer
from shapely.geometry import shape
from shapely.ops import transform

LOGGER = logging.getLogger(__name__)

CONTINENT_TIER_FEATURECLA = ("Continent", "Isthmus")
ISLAND_FEATURECLA = "Island"
EXPECTED_CONTINENT_TIER_COUNT = 11
MIN_QUALIFYING_ISLAND_COUNT = 130


@dataclass(frozen=True)
class RegionFeature:
    """One continent-tier or island polygon keyed by Natural Earth ``NE_ID``."""

    region_id: int
    geometry_wgs84: Any


def _mollweide_transformer() -> Transformer:
    """Build WGS84 -> Mollweide equal-area transformer for island area filtering."""
    moll = CRS.from_proj4("+proj=moll +datum=WGS84 +units=m +no_defs")
    return Transformer.from_crs(CRS.from_epsg(4326), moll, always_xy=True)


def _area_km2_wgs84(geom_wgs84: Any) -> float:
    """Return polygon area in km² using Mollweide equal-area projection."""
    if geom_wgs84.is_empty:
        return 0.0
    transformer = _mollweide_transformer()
    projected = transform(transformer.transform, geom_wgs84)
    return float(projected.area) / 1_000_000.0


def _prepare_geometry(geom: Any, simplify_tolerance: float) -> Any:
    """Normalize geometry for intersection tests."""
    if geom.is_empty or geom.area <= 0:
        return geom
    if not geom.is_valid:
        geom = geom.buffer(0)
    if geom.is_empty or geom.area <= 0:
        return geom
    return geom.simplify(simplify_tolerance, preserve_topology=True)


def load_geography_region_features(
    path: Path,
    island_min_area_km2: float,
    *,
    simplify_tolerance: float = 0.005,
) -> tuple[list[RegionFeature], list[RegionFeature]]:
    """
    Why this exists:
        Load continent-tier and qualifying island polygons from ``ne_10m_geography_regions_polys.shp``.
    When to use:
        Once per landmass export before iterating res-1 cells.
    What to expect:
        Continent-tier list includes ``Continent`` and ``Isthmus`` rows; islands filtered by area.
    """
    LOGGER.debug("Loading geography region features from %s", path)
    continents: list[RegionFeature] = []
    islands: list[RegionFeature] = []
    with fiona.open(path) as src:
        for feat in src:
            props = feat.get("properties") or {}
            featurecla = props.get("FEATURECLA")
            ne_id_raw = props.get("NE_ID")
            if ne_id_raw is None:
                continue
            try:
                region_id = int(ne_id_raw)
            except (TypeError, ValueError):
                LOGGER.debug("Skipping feature with invalid NE_ID: %s", ne_id_raw)
                continue
            geom = shape(feat["geometry"])
            geom = _prepare_geometry(geom, simplify_tolerance)
            if geom.is_empty or geom.area <= 0:
                continue
            if featurecla in CONTINENT_TIER_FEATURECLA:
                continents.append(RegionFeature(region_id=region_id, geometry_wgs84=geom))
            elif featurecla == ISLAND_FEATURECLA:
                area_km2 = _area_km2_wgs84(geom)
                if area_km2 < island_min_area_km2:
                    continue
                islands.append(RegionFeature(region_id=region_id, geometry_wgs84=geom))
    LOGGER.debug(
        "Loaded %d continent-tier and %d qualifying island features (min_area_km2=%.1f).",
        len(continents),
        len(islands),
        island_min_area_km2,
    )
    return continents, islands


def validate_geography_regions_shapefile(path: Path, island_min_area_km2: float) -> None:
    """
    Why this exists:
        Fail fast when the NE geography regions contract is broken before expensive export.
    When to use:
        ``landmass_cli validate`` and unit tests with real shapefile path.
    What to expect:
        Raises ``RuntimeError`` or ``ValueError`` on missing file, CRS mismatch, or count drift.
    """
    if not path.is_file():
        raise RuntimeError(f"Missing geography regions shapefile (expected at {path}).")
    with fiona.open(path) as src:
        crs = src.crs
        if crs is None:
            raise RuntimeError("Geography regions shapefile CRS must be EPSG:4326, got None.")
        crs_text = str(crs).upper()
        if "4326" not in crs_text and "WGS 84" not in crs_text and "WGS84" not in crs_text:
            raise RuntimeError(f"Geography regions shapefile CRS must be EPSG:4326, got {crs!r}.")
    continents, islands = load_geography_region_features(path, island_min_area_km2)
    if len(continents) != EXPECTED_CONTINENT_TIER_COUNT:
        raise RuntimeError(
            f"Expected {EXPECTED_CONTINENT_TIER_COUNT} continent-tier features "
            f"(Continent + Isthmus), got {len(continents)}."
        )
    if len(islands) < MIN_QUALIFYING_ISLAND_COUNT:
        raise RuntimeError(
            f"Expected at least {MIN_QUALIFYING_ISLAND_COUNT} qualifying islands at "
            f"{island_min_area_km2} km², got {len(islands)}."
        )
    for feature in (*continents, *islands):
        if feature.region_id <= 0:
            raise RuntimeError(f"Invalid NE_ID {feature.region_id} in geography regions load.")
