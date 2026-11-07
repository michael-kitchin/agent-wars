"""Contracts for anti-aliased water coverage and DEM guards."""

from __future__ import annotations

import unittest
from pathlib import Path

from shapely.geometry import Polygon, box

from scripts.basemap_pipeline.basemap_settings import PipelineSettings
from scripts.basemap_pipeline.dem_source import (
    GmtedFileInfo,
    dem_bounds_for,
    require_dem_size,
    require_gmted_coverage,
    require_shared_pixel_grid,
)
from scripts.basemap_pipeline.water_coverage import water_coverage
from scripts.basemap_pipeline.web_mercator import LonLatBox

BOUNDS = (0.0, 0.0, 1000.0, 1000.0)
SHAPE = (10, 10)


class WaterCoverageTests(unittest.TestCase):
    def test_half_pixel_edge_and_empty_water(self) -> None:
        left = water_coverage(box(0, 0, 500, 1000), BOUNDS, SHAPE, 4)
        self.assertTrue((left[:, :5] == 1.0).all())
        self.assertTrue((left[:, 5:] == 0.0).all())
        split = water_coverage(box(0, 0, 550, 1000), BOUNDS, SHAPE, 4)
        self.assertEqual(0.5, float(split[0, 5]))
        empty = water_coverage(Polygon(), BOUNDS, SHAPE, 4)
        self.assertTrue((empty == 0.0).all())


class DemGuardTests(unittest.TestCase):
    def test_size_and_coverage_guards_reject_bad_inputs(self) -> None:
        with self.assertRaises(ValueError):
            require_dem_size(LonLatBox(0.0, 0.0, 1.0, 1.0), PipelineSettings(dem_max_pixels=10))
        covered = GmtedFileInfo(Path("covered.tif"), LonLatBox(0.0, 0.0, 1.0, 1.0), 0.0, 1.0)
        with self.assertRaises(ValueError):
            require_gmted_coverage([covered], LonLatBox(0.0, 0.0, 2.0, 1.0))
        shifted = GmtedFileInfo(Path("shifted.tif"), LonLatBox(1.0, 0.0, 2.0, 1.0), 0.001, 1.0)
        with self.assertRaises(ValueError):
            require_shared_pixel_grid([covered, shifted])

    def test_dem_margin_stays_on_the_earth_and_keeps_western_europe(self) -> None:
        western_europe = dem_bounds_for(
            LonLatBox(-8.576452, 39.009320, 18.306518, 56.943588),
            PipelineSettings(),
        )
        self.assertAlmostEqual(-12.25, western_europe.west, places=6)
        self.assertAlmostEqual(30.952162, western_europe.south, places=6)
        self.assertAlmostEqual(23.5, western_europe.east, places=6)
        self.assertAlmostEqual(62.606396, western_europe.north, places=6)
        world = dem_bounds_for(LonLatBox(-100.0, -50.0, 100.0, 50.0), PipelineSettings(min_zoom=0, dem_margin_deg=5.0))
        self.assertGreaterEqual(world.west, -180.0)
        self.assertLessEqual(world.east, 180.0)
        self.assertGreaterEqual(world.south, -90.0)
        self.assertLessEqual(world.north, 90.0)


if __name__ == "__main__":
    unittest.main()
