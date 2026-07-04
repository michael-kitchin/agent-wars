"""Unit tests for metadata row terrain classification."""

from __future__ import annotations

import unittest

from scripts.terrain_pipeline.config import build_default_config
from scripts.terrain_pipeline.metadata_classifier import (
    classify_res4_metadata_row,
    water_relation_from_mask_metrics,
)


class MetadataClassifierTest(unittest.TestCase):
    def test_all_water_is_in_water(self) -> None:
        self.assertEqual(
            water_relation_from_mask_metrics({"all_water": True, "intersects_water": True, "water_edges": 6}),
            "in_water",
        )

    def test_low_water_edges_is_wetlands(self) -> None:
        self.assertEqual(
            water_relation_from_mask_metrics({"all_water": False, "intersects_water": True, "water_edges": 1}),
            "wetlands_band",
        )

    def test_classify_water_row(self) -> None:
        cfg = build_default_config()
        row = {
            "all_water": True,
            "intersects_water": True,
            "water_edges": 6,
            "arctic_mean": 0.0,
            "forest_mean": 0.0,
            "desert_mean": 0.0,
            "tri_mean": 0.0,
            "slope_mean": 0.0,
            "elevation_max": 0.0,
            "urban_by_scalerank": [],
        }
        self.assertEqual(classify_res4_metadata_row(row, cfg.thresholds), "water")


if __name__ == "__main__":
    unittest.main()
