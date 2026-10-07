"""Centroid windows that cross the antimeridian."""

from __future__ import annotations

import unittest

from scripts.regional_pipeline.region_models import CentroidBox


class RegionModelTests(unittest.TestCase):
    def test_wrapping_box_keeps_both_sides_of_the_antimeridian(self) -> None:
        box = CentroidBox(lat_min=40, lat_max=82, lon_min=12, lon_max=-168)
        self.assertTrue(box.contains(50, 100))
        self.assertTrue(box.contains(50, -170))
        self.assertFalse(box.contains(50, 0))
