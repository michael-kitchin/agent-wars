"""Overlay counts at a scalerank ceiling and nearest-rank percentiles."""

from __future__ import annotations

import unittest

from scripts.regional_pipeline.density_report import count_matching_cities, nearest_rank_percentile
from scripts.terrain_pipeline.metadata_classifier import is_res4_urban_overlay_row


def _urban_row(rank: int) -> dict:
    return {"urban_by_scalerank": [{"scalerank": rank, "intersects_urban": True, "all_urban": False}]}


class DensityReportTests(unittest.TestCase):
    def test_urban_share_keeps_rank_six_only_at_maximum_six(self) -> None:
        row = _urban_row(6)
        self.assertTrue(is_res4_urban_overlay_row(row, max_scalerank=6))
        self.assertFalse(is_res4_urban_overlay_row(row, max_scalerank=5))

    def test_city_label_count_skips_rank_seven_at_maximum_six(self) -> None:
        cities = [{"name": "Example", "scalerank": 7}]
        self.assertEqual(0, count_matching_cities(cities, 6))
        self.assertEqual(1, count_matching_cities([{"name": "Example", "scalerank": 6}], 6))

    def test_nearest_rank_percentiles(self) -> None:
        values = [1, 2, 3, 4, 10]
        self.assertEqual(3, nearest_rank_percentile(values, 0.5))
        self.assertEqual(10, nearest_rank_percentile(values, 0.9))
