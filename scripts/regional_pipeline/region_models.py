"""Immutable region definitions and the hex roles inside a footprint."""

from __future__ import annotations

import logging
from collections.abc import Mapping
from dataclasses import dataclass
from enum import Enum
from types import MappingProxyType

import h3

from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)


class HexRole(str, Enum):
    """
    Why this exists:
        Name the three footprint roles a strategic hex can play in a regional game.
    When to use:
        When classifying cells and when reading a manifest.
    What to expect:
        The string values are the JSON role names.
    """

    # Member land kept after desert trim.
    LAND = "land"
    # Water within the sea reach of member land.
    SEA = "sea"
    # Non-member land within the neutral reach of member land.
    NEUTRAL_BORDER = "neutral_border"


@dataclass(frozen=True)
class MemberUnit:
    """
    Why this exists:
        Name one country, or a filtered set of its admin-1 units, that can contribute land.
    When to use:
        Inside a region definition. Use an include list or an exclude list, not both.
    What to expect:
        Admin-1 codes are Natural Earth ``iso_3166_2`` values. An empty include and exclude means the whole country.
    """

    # Natural Earth admin-0 code.
    adm0_a3: str
    # Admin-1 codes to keep. Empty means no include filter.
    include_admin1: tuple[str, ...] = ()
    # Admin-1 codes to drop. Empty means no exclude filter.
    exclude_admin1: tuple[str, ...] = ()


@dataclass(frozen=True)
class CentroidBox:
    """
    Why this exists:
        Limit a region's cells to a latitude and longitude window, including windows that cross the antimeridian.
    When to use:
        When deciding whether a cell centroid belongs in a footprint.
    What to expect:
        ``contains`` is true for centroids inside the window. A window wraps when ``lon_min`` is greater than ``lon_max``.
    """

    # Southern edge, degrees.
    lat_min: float
    # Northern edge, degrees.
    lat_max: float
    # Western edge, degrees. Greater than ``lon_max`` when the box crosses the antimeridian.
    lon_min: float
    # Eastern edge, degrees.
    lon_max: float

    def contains(self, lat: float, lng: float) -> bool:
        """
        Why this exists:
            Test one centroid against the window.
        When to use:
            While filling footprint candidates.
        What to expect:
            True when latitude is inside and longitude is inside, wrapping when the box crosses the antimeridian.
        """

        LOGGER.log(TRACE_LEVEL, "CentroidBox.contains lat=%s lng=%s.", lat, lng)
        if lat < self.lat_min or lat > self.lat_max:
            return False
        if self.lon_min <= self.lon_max:
            return self.lon_min <= lng <= self.lon_max
        return lng >= self.lon_min or lng <= self.lon_max


@dataclass(frozen=True)
class FootprintTargets:
    """
    Why this exists:
        Record the land, sea, and neutral counts a region is tuned toward.
    When to use:
        On a region definition, and when printing footprint deviations.
    What to expect:
        Counts are strategic hexes. They are targets, not a guarantee of the classified result.
    """

    # Member land hexes after trim.
    land: int
    # Sea hexes.
    sea: int
    # Neutral-border hexes.
    neutral_border: int


@dataclass(frozen=True)
class FootprintCounts:
    """
    Why this exists:
        Hold the classified land, sea, and neutral counts for one footprint.
    When to use:
        After classification and when comparing a footprint with its targets.
    What to expect:
        Each field is a non-negative hex count.
    """

    # Member land hexes after trim.
    land: int
    # Sea hexes.
    sea: int
    # Neutral-border hexes.
    neutral_border: int


@dataclass(frozen=True)
class RegionDefinition:
    """
    Why this exists:
        Describe one regional map: its resolutions, members, window, reaches, and target counts.
    When to use:
        Catalog lookup and footprint classification.
    What to expect:
        ``tactical_resolution`` is three steps finer than ``strategic_resolution``.
    """

    # Folder name and manifest id.
    region_id: str
    # Human-readable map name.
    display_name: str
    # H3 resolution of the footprint.
    strategic_resolution: int
    # H3 resolution of tactical children.
    tactical_resolution: int
    # Countries and admin-1 filters that contribute member land.
    members: tuple[MemberUnit, ...]
    # Centroid window for the footprint.
    centroid_box: CentroidBox
    # Water within this distance of member land becomes sea. Zero keeps no sea.
    sea_reach_km: float
    # Non-member land within this distance becomes a neutral border. Zero keeps none.
    neutral_reach_km: float
    # Drop unsettled member land farther than this from settled member land. None skips the trim.
    desert_trim_reach_km: float | None
    # Counts the footprint is tuned toward.
    targets: FootprintTargets


@dataclass(frozen=True)
class RegionFootprint:
    """
    Why this exists:
        Store the strategic cells of one region and the role of each cell.
    When to use:
        After classification, and when a later export needs the cell lists.
    What to expect:
        ``roles`` is an immutable mapping. Tactical cells are every child of every strategic cell.
    """

    # Catalog id this footprint belongs to.
    region_id: str
    # H3 resolution of the keys in ``roles``.
    strategic_resolution: int
    # H3 resolution of ``tactical_cells``.
    tactical_resolution: int
    # Strategic cell id to role. Wrapped so callers cannot mutate it.
    roles: Mapping[str, HexRole]

    def __post_init__(self) -> None:
        """
        Why this exists:
            Freeze the role map even when the caller passed a plain dict.
        When to use:
            Called by the dataclass constructor.
        What to expect:
            ``roles`` becomes a mapping proxy. The original dict is copied first.
        """

        object.__setattr__(self, "roles", MappingProxyType(dict(self.roles)))

    def strategic_cells(self) -> list[str]:
        """
        Why this exists:
            List the footprint cells in a stable order.
        When to use:
            When writing a manifest or exporting strategic data.
        What to expect:
            Sorted strategic cell ids. Does not change the footprint.
        """

        LOGGER.log(TRACE_LEVEL, "strategic_cells for %s (%d roles).", self.region_id, len(self.roles))
        return sorted(self.roles)

    def tactical_cells(self) -> list[str]:
        """
        Why this exists:
            Expand every strategic cell to its tactical children.
        When to use:
            When exporting tactical metadata, naming, or routes.
        What to expect:
            A sorted list. Each parent contributes every child at ``tactical_resolution``.
        """

        LOGGER.log(TRACE_LEVEL, "tactical_cells for %s at resolution %s.", self.region_id, self.tactical_resolution)
        children: set[str] = set()
        for cell in self.roles:
            children.update(h3.cell_to_children(cell, self.tactical_resolution))
        return sorted(children)

    def counts(self) -> FootprintCounts:
        """
        Why this exists:
            Summarize how many cells have each role.
        When to use:
            When printing a footprint table or filling a manifest.
        What to expect:
            One count per role. Cells with an unexpected role are not counted.
        """

        LOGGER.log(TRACE_LEVEL, "counts for %s.", self.region_id)
        values = list(self.roles.values())
        return FootprintCounts(
            land=values.count(HexRole.LAND),
            sea=values.count(HexRole.SEA),
            neutral_border=values.count(HexRole.NEUTRAL_BORDER),
        )
