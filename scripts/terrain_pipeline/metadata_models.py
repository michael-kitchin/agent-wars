"""
Dataclasses for per-hex terrain feature metadata JSON exports.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Bump when record shape or semantics change in a breaking way for consumers.
TERRAIN_HEX_METADATA_SCHEMA_VERSION = "2.0.0"
AIRPORT_COUNT_TOTAL_KEY = "airport_count_total"
AIRPORT_COUNT_BY_SCALERANK_KEY = "airport_count_by_scalerank"
SEAPORT_COUNT_TOTAL_KEY = "seaport_count_total"
SEAPORT_COUNT_BY_SCALERANK_KEY = "seaport_count_by_scalerank"


@dataclass(frozen=True)
class UrbanRankMaskEntry:
    """
    Why this exists:
        Hold mask-edge metrics for one urban ``scalerank`` tier on a res-4 hex.
    When to use:
        Sparse ``urban_by_scalerank`` rows when that tier intersects the cell.
    What to expect:
        Same boolean/edge semantics as aggregate urban fields on the record.
    """

    scalerank: int
    all_urban: bool
    intersects_urban: bool
    urban_edges: int


@dataclass(frozen=True)
class HexMetadataRecordRes1:
    """
    Why this exists:
        Hold one res-1 hex row for ``terrain_res1_metadata.json`` (no urban mask fields).
    When to use:
        Built by the metadata export pipeline before JSON serialization.
    What to expect:
        Numeric means may be ``None`` when raster sampling yields no valid values.
        Airport/seaport counts use H3 ``latlng_to_cell`` assignment (one owner hex per point per resolution).
    """

    h3_index: str
    total_edges: int
    all_water: bool
    intersects_water: bool
    water_edges: int
    arctic_mean: float | None
    forest_mean: float | None
    desert_mean: float | None
    tri_mean: float | None
    slope_mean: float | None
    elevation_max: float | None
    airport_count_total: int = 0
    airport_count_by_scalerank: tuple[tuple[int, int], ...] = field(default_factory=tuple)
    seaport_count_total: int = 0
    seaport_count_by_scalerank: tuple[tuple[int, int], ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class HexMetadataRecordRes4(HexMetadataRecordRes1):
    """
    Why this exists:
        Extend res-1 records with urban mask metrics for ``terrain_res4_metadata.json``.
    When to use:
        Built for each res-4 cell during metadata export.
    What to expect:
        Urban metrics use the same edge/coverage rules as water masks; ``urban_by_scalerank`` omits
        inactive tiers (no intersection with that rank's union).
    """

    all_urban: bool = False
    intersects_urban: bool = False
    urban_edges: int = 0
    urban_by_scalerank: tuple[UrbanRankMaskEntry, ...] = field(default_factory=tuple)
