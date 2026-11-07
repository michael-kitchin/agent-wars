"""Contracts for partition keys and antimeridian camera boxes."""

from __future__ import annotations

import unittest

from scripts.basemap_pipeline.region_extent import boxes_within_world, longitude_interval_from_centers
from scripts.basemap_pipeline.tile_partitions import ancestor_key
from scripts.basemap_pipeline.web_mercator import LonLatBox


class PartitionKeyTests(unittest.TestCase):
    def test_ancestor_keys_match_the_pack_grid(self) -> None:
        self.assertEqual(ancestor_key(9, 243, 157), "z5_x15_y9")
        self.assertEqual(ancestor_key(6, 30, 19), "z3_x3_y2")
        self.assertEqual(ancestor_key(4, 8, 5), "z0_x0_y0")
        self.assertEqual(ancestor_key(0, 1, 0), "z0_x1_y0")
        self.assertEqual(ancestor_key(8, 0, 10), "z5_x0_y1")


class RegionExtentTests(unittest.TestCase):
    def test_short_spans_cross_only_when_the_gap_says_so(self) -> None:
        crossing = longitude_interval_from_centers([170.0, -170.0])
        assert crossing is not None
        self.assertAlmostEqual(crossing.east - crossing.west, 20.0)
        self.assertTrue(crossing.crosses_antimeridian)
        plain = longitude_interval_from_centers([10.0, 30.0])
        assert plain is not None
        self.assertAlmostEqual(plain.east - plain.west, 20.0)
        self.assertFalse(plain.crosses_antimeridian)

    def test_three_centers_run_east_past_180(self) -> None:
        interval = longitude_interval_from_centers([-175.0, 30.0, 170.0])
        assert interval is not None
        self.assertAlmostEqual(interval.west, 30.0)
        self.assertGreater(interval.east, 180.0)

    def test_crossing_box_splits_into_two_world_pieces(self) -> None:
        parts = boxes_within_world(LonLatBox(160.0, -10.0, 190.0, 10.0))
        self.assertEqual([(part.west, part.east) for part in parts], [(160.0, 180.0), (-180.0, -170.0)])
