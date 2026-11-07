"""Battle footprints matching the game's three-ring margin."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Final

import h3

from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)

# Extra tactical rings around the enclosing hex's children.
# Source: TACTICAL_BATTLE_MARGIN_RINGS in src/shared/tacticalBattleFootprint.ts.
TACTICAL_BATTLE_MARGIN_RINGS: Final = 3


@dataclass(frozen=True)
class BattleFootprint:
    """
    Why this exists:
        Name the enclosing hex, its children, and the playable margin.
    When to use:
        When cropping a battle picture or drawing cell outlines.
    What to expect:
        ``cells`` is sorted. Every core cell is included in ``cells``.
    """

    # Strategic hex the battle is opened from.
    enclosing_cell: str
    # Tactical children of the enclosing hex, in H3 child order.
    core_cells: tuple[str, ...]
    # Core cells plus the margin cells whose strategic parent is on the map.
    cells: tuple[str, ...]


def battle_footprint(
    enclosing_cell: str,
    on_map_cells: set[str],
    tactical_resolution: int,
) -> BattleFootprint:
    """
    Why this exists:
        Reproduce the playable cells of one battle.
    When to use:
        After the region's strategic cells are known.
    What to expect:
        Every child of the enclosing hex, plus each cell within three rings whose parent is on the map.
    Exceptions:
        ``ValueError`` when ``enclosing_cell`` is not in ``on_map_cells``, before any H3 call.
        ``ValueError`` when ``tactical_resolution`` is not finer than that cell.
    """

    LOGGER.log(TRACE_LEVEL, "battle_footprint cell=%s resolution=%s.", enclosing_cell, tactical_resolution)
    if enclosing_cell not in on_map_cells:
        raise ValueError(f"battle hex {enclosing_cell} is not on the map")
    parent_resolution = h3.get_resolution(enclosing_cell)
    if tactical_resolution <= parent_resolution:
        raise ValueError(f"tactical resolution {tactical_resolution} is not finer than {enclosing_cell}")
    core = tuple(h3.cell_to_children(enclosing_cell, tactical_resolution))
    cells: set[str] = set(core)
    for core_cell in core:
        for near in h3.grid_disk(core_cell, TACTICAL_BATTLE_MARGIN_RINGS):
            parent = h3.cell_to_parent(near, parent_resolution)
            if parent in on_map_cells:
                cells.add(near)
    return BattleFootprint(enclosing_cell, core, tuple(sorted(cells)))
