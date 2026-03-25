from __future__ import annotations

import unittest

from scripts.terrain_pipeline.classifier import (
    CellFeatures,
    classify_cell,
    classify_interior_biome,
    effective_land_fraction_pct,
)
from scripts.terrain_pipeline.config import ClassifierThresholds


class ClassifierTests(unittest.TestCase):
    def test_in_ocean(self) -> None:
        t = ClassifierThresholds()
        features = CellFeatures(
            landcover={12: 90.0},
            tri_mean=0.0,
            slope_mean=0.0,
            elevation_max=0.0,
        )
        self.assertEqual(
            "ocean",
            classify_cell(features, t, nodata_fallback="ocean", ocean_relation="in_ocean"),
        )

    def test_coastal_band(self) -> None:
        t = ClassifierThresholds()
        features = CellFeatures(
            landcover={1: 50.0, 12: 30.0},
            tri_mean=0.0,
            slope_mean=0.0,
            elevation_max=0.0,
        )
        self.assertEqual(
            "coastal",
            classify_cell(features, t, nodata_fallback="ocean", ocean_relation="coastal_band"),
        )

    def test_land_interior_forest(self) -> None:
        t = ClassifierThresholds()
        features = CellFeatures(
            landcover={1: 50.0, 2: 40.0},
            tri_mean=0.0,
            slope_mean=0.0,
            elevation_max=0.0,
        )
        self.assertEqual(
            "forest",
            classify_cell(features, t, nodata_fallback="ocean", ocean_relation="land"),
        )

    def test_raw_sum_over_100_clamps(self) -> None:
        features = CellFeatures(
            landcover={i: 10.0 for i in range(1, 12)},
            tri_mean=None,
            slope_mean=None,
            elevation_max=None,
        )
        self.assertAlmostEqual(100.0, effective_land_fraction_pct(features))

    def test_mountain_precedes_desert_interior(self) -> None:
        t = ClassifierThresholds()
        features = CellFeatures(
            landcover={11: t.desert_barren_min + 20.0, 5: 90.0},
            tri_mean=t.mountain_tri_mean_min + 1.0,
            slope_mean=t.mountain_slope_mean_min + 1.0,
            elevation_max=t.mountain_elevation_max_min + 1.0,
        )
        self.assertEqual(
            "mountain",
            classify_cell(features, t, nodata_fallback="ocean", ocean_relation="land"),
        )

    def test_nodata_fallback(self) -> None:
        t = ClassifierThresholds()
        features = CellFeatures(landcover={}, tri_mean=None, slope_mean=None, elevation_max=None)
        self.assertEqual(
            "ocean",
            classify_cell(features, t, nodata_fallback="ocean", ocean_relation="in_ocean"),
        )

    def test_classify_interior_biome_direct(self) -> None:
        t = ClassifierThresholds()
        features = CellFeatures(
            landcover={5: 80.0},
            tri_mean=0.0,
            slope_mean=0.0,
            elevation_max=0.0,
        )
        self.assertEqual("land", classify_interior_biome(features, t))


if __name__ == "__main__":
    unittest.main()
