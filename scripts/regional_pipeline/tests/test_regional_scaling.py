"""Island floor and weather search depth at strategic resolutions 1, 2, and 3."""

from __future__ import annotations

import unittest

from scripts.regional_pipeline.regional_scaling import island_min_area_km2_for, weather_water_land_steps_for


class RegionalScalingTests(unittest.TestCase):
    def test_island_floor_scales_with_hex_area(self) -> None:
        self.assertEqual(2000.0, island_min_area_km2_for(1))
        self.assertAlmostEqual(284.7, island_min_area_km2_for(2), places=1)
        self.assertAlmostEqual(40.6, island_min_area_km2_for(3), places=1)

    def test_weather_steps_grow_as_hexes_shrink(self) -> None:
        self.assertEqual(2, weather_water_land_steps_for(1))
        self.assertEqual(5, weather_water_land_steps_for(2))
        self.assertEqual(14, weather_water_land_steps_for(3))
