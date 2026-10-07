"""Resolution-dependent inputs for metadata export."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Final

import h3

from .config import PipelineConfig

LOGGER = logging.getLogger(__name__)

# Topography rasters for cells whose average edge is at least COARSE_TOPO_MIN_EDGE_KM.
COARSE_TOPO_KEYS: Final[tuple[str, str, str]] = (
    "tri_50KMmn_GMTEDmd",
    "slope_50KMmn_GMTEDmd",
    "elevation_50KMma_GMTEDma",
)
# Topography rasters for finer cells, where a 50 km grid would undersample the hex.
FINE_TOPO_KEYS: Final[tuple[str, str, str]] = (
    "tri_5KMmn_GMTEDmd",
    "slope_5KMmn_GMTEDmd",
    "elevation_5KMma_GMTEDma",
)
# Average H3 edge length, in kilometers, at or above which the coarse grids are used.
COARSE_TOPO_MIN_EDGE_KM: Final = 100.0


@dataclass(frozen=True)
class ResolutionProfile:
    """
    Why this exists:
        Keep sample count, topography grids, and mask rules together for one H3 resolution.
    When to use:
        Pass one profile into each metadata export pass.
    What to expect:
        ``include_lakes`` and ``include_urban`` are false for strategic resolutions.
    """

    # H3 resolution this profile describes.
    resolution: int
    # Deterministic raster sample points per cell.
    sample_count: int
    # (tri, slope, elevation_max) raster keys, as named by open_metadata_rasters.
    topo_keys: tuple[str, str, str]
    # Merge lakes into the water mask. True for tactical cells only.
    include_lakes: bool
    # Compute urban mask metrics. True for tactical cells only.
    include_urban: bool


def topo_keys_for_resolution(resolution: int) -> tuple[str, str, str]:
    """
    Why this exists:
        Pick topography grids from hex size so a cell still sees more than a handful of pixels.
    When to use:
        While building a ``ResolutionProfile``.
    What to expect:
        Coarse 50 km keys when the average edge is at least 100 km, otherwise the 5 km keys.
    """

    edge_km = h3.average_hexagon_edge_length(resolution, unit="km")
    keys = COARSE_TOPO_KEYS if edge_km >= COARSE_TOPO_MIN_EDGE_KM else FINE_TOPO_KEYS
    LOGGER.debug("Topography keys for resolution %d (edge_km=%.1f): %s.", resolution, edge_km, keys[0])
    return keys


def strategic_profile(resolution: int, config: PipelineConfig) -> ResolutionProfile:
    """
    Why this exists:
        Strategic cells use the coarser sample count and omit lakes and urban masks.
    When to use:
        For the parent resolution of a global or regional pack.
    What to expect:
        Sample count comes from ``config.area_weighted_samples_per_cell_res1`` for every strategic resolution.
    """

    LOGGER.debug("Building strategic profile for resolution %d.", resolution)
    return ResolutionProfile(
        resolution,
        config.area_weighted_samples_per_cell_res1,
        topo_keys_for_resolution(resolution),
        include_lakes=False,
        include_urban=False,
    )


def tactical_profile(resolution: int, config: PipelineConfig) -> ResolutionProfile:
    """
    Why this exists:
        Tactical cells use the finer sample count and include lakes and urban masks.
    When to use:
        For the child resolution of a global or regional pack.
    What to expect:
        Sample count comes from ``config.area_weighted_samples_per_cell_res4`` for every tactical resolution.
    """

    LOGGER.debug("Building tactical profile for resolution %d.", resolution)
    return ResolutionProfile(
        resolution,
        config.area_weighted_samples_per_cell_res4,
        topo_keys_for_resolution(resolution),
        include_lakes=True,
        include_urban=True,
    )
