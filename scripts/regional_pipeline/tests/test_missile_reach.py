"""Contracts for choosing a regional missile range from land coverage."""

from __future__ import annotations

import unittest

import h3

from scripts.regional_pipeline.missile_reach import compute_missile_range_hexes


class MissileReachTests(unittest.TestCase):
    def test_synthetic_disk_picks_the_closer_smaller_range(self) -> None:
        center = h3.latlng_to_cell(48.8, 2.3, 3)
        land = h3.grid_disk(center, 6)
        urban_by_hex = {hex_index: 1 for hex_index in land}
        urban_by_hex[center] = 21
        self.assertEqual(4, compute_missile_range_hexes(land, urban_by_hex, 21))

    def test_no_advanced_hex_returns_one(self) -> None:
        center = h3.latlng_to_cell(48.8, 2.3, 3)
        land = h3.grid_disk(center, 2)
        urban_by_hex = {hex_index: 1 for hex_index in land}
        self.assertEqual(1, compute_missile_range_hexes(land, urban_by_hex, 21))


if __name__ == "__main__":
    unittest.main()
