"""Contracts for the three-ring battle footprint."""

from __future__ import annotations

import unittest

import h3

from scripts.basemap_pipeline.battle_footprint import battle_footprint

ENCLOSING = "831f80fffffffff"


class BattleFootprintTests(unittest.TestCase):
    def test_neighbors_keep_the_full_footprint_and_a_lone_hex_keeps_its_children(self) -> None:
        with_neighbors = battle_footprint(ENCLOSING, set(h3.grid_disk(ENCLOSING, 1)), 6)
        self.assertEqual(607, len(with_neighbors.cells))
        self.assertEqual(343, len(with_neighbors.core_cells))
        alone = battle_footprint(ENCLOSING, {ENCLOSING}, 6)
        self.assertEqual(343, len(alone.cells))

    def test_unknown_cell_is_rejected_before_h3_parses_it(self) -> None:
        with self.assertRaises(ValueError):
            battle_footprint("not-a-cell", set(), 6)
        with self.assertRaises(ValueError):
            battle_footprint(ENCLOSING, {ENCLOSING}, h3.get_resolution(ENCLOSING))


if __name__ == "__main__":
    unittest.main()
