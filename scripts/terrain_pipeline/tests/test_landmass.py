"""Unit tests for res1 landmass membership computation."""

from __future__ import annotations

import unittest

from scripts.terrain_pipeline.config import build_default_config
from scripts.terrain_pipeline.geography_regions import RegionFeature
from scripts.terrain_pipeline.landmass import compute_res1_region_membership
from shapely.geometry import box


class LandmassMembershipTest(unittest.TestCase):
    def test_cell_overlapping_one_continent(self) -> None:
        # res1 hex roughly over synthetic continent box
        h3_index = "813e7ffffffffff"
        continent = RegionFeature(region_id=1159104365, geometry_wgs84=box(20, 20, 40, 40))
        continent_ids, island_ids = compute_res1_region_membership(h3_index, [continent], None, [])
        self.assertIn(1159104365, continent_ids)
        self.assertEqual(island_ids, ())

    def test_isthmus_counts_as_continent_tier(self) -> None:
        h3_index = "8167bffffffffff"
        isthmus = RegionFeature(region_id=1159104347, geometry_wgs84=box(-90, 5, -75, 15))
        continent_ids, _ = compute_res1_region_membership(h3_index, [isthmus], None, [])
        self.assertIn(1159104347, continent_ids)


if __name__ == "__main__":
    unittest.main()
