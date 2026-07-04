"""Unit tests for res1 water_pct from res4 metadata."""

from __future__ import annotations

import unittest

from scripts.terrain_pipeline.config import build_default_config
from scripts.terrain_pipeline.res1_water_pct import compute_res1_water_pct_from_res4


def _res4_row(
    h3_index: str,
    *,
    all_water: bool = False,
    intersects_water: bool = False,
    water_edges: int = 0,
) -> dict:
    return {
        "h3_index": h3_index,
        "total_edges": 6,
        "all_water": all_water,
        "intersects_water": intersects_water,
        "water_edges": water_edges,
        "arctic_mean": 0.0,
        "forest_mean": 0.0,
        "desert_mean": 64.0,
        "tri_mean": 1.0,
        "slope_mean": 1.0,
        "elevation_max": 100.0,
        "airport_count_total": 0,
        "airport_count_by_scalerank": [],
        "seaport_count_total": 0,
        "seaport_count_by_scalerank": [],
        "all_urban": False,
        "intersects_urban": False,
        "urban_edges": 0,
        "urban_by_scalerank": [],
    }


class Res1WaterPctTest(unittest.TestCase):
    def test_one_water_child(self) -> None:
        import h3

        parent = "813e7ffffffffff"
        children = h3.cell_to_children(parent, 4)
        by_h3 = {}
        for idx, child in enumerate(children):
            by_h3[child] = _res4_row(child, all_water=(idx == 0))
        cfg = build_default_config()
        pct = compute_res1_water_pct_from_res4(parent, by_h3, cfg.thresholds)
        expected = round(100.0 / len(children), 4)
        self.assertAlmostEqual(pct, expected, places=4)

    def test_missing_child_raises(self) -> None:
        cfg = build_default_config()
        with self.assertRaises(RuntimeError):
            compute_res1_water_pct_from_res4("813e7ffffffffff", {}, cfg.thresholds)


if __name__ == "__main__":
    unittest.main()
