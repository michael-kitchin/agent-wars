from __future__ import annotations

import unittest

from scripts.terrain_pipeline.classifier import CellFeatures, classify_cell
from scripts.terrain_pipeline.config import ClassifierThresholds


class ClassifierTests(unittest.TestCase):
    def test_water_presence_override_prefers_ocean(self) -> None:
        t = ClassifierThresholds()
        features = CellFeatures(
            landcover={12: t.water_presence_override_min + 0.1, 11: 90.0},
            tri_mean=0.0,
            slope_mean=0.0,
            elevation_max=0.0,
        )
        self.assertEqual("ocean", classify_cell(features, t, nodata_fallback="ocean"))

    def test_mountain_precedes_desert_with_liberal_thresholds(self) -> None:
        t = ClassifierThresholds()
        features = CellFeatures(
            landcover={11: t.desert_barren_min + 20.0, 12: 0.0},
            tri_mean=t.mountain_tri_mean_min + 1.0,
            slope_mean=t.mountain_slope_mean_min + 1.0,
            elevation_max=t.mountain_elevation_max_min + 1.0,
        )
        self.assertEqual("mountain", classify_cell(features, t, nodata_fallback="ocean"))

    def test_nodata_fallback(self) -> None:
        t = ClassifierThresholds()
        features = CellFeatures(landcover={}, tri_mean=None, slope_mean=None, elevation_max=None)
        self.assertEqual("ocean", classify_cell(features, t, nodata_fallback="ocean"))


if __name__ == "__main__":
    unittest.main()

