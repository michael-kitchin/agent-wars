from __future__ import annotations

import unittest

from shapely.geometry import Polygon

from scripts.terrain_pipeline.sampling import deterministic_points_within_polygon


class SamplingTests(unittest.TestCase):
    def test_deterministic_point_count(self) -> None:
        poly = Polygon([(0.0, 0.0), (2.0, 0.0), (2.0, 1.0), (0.0, 1.0)])
        points_a = deterministic_points_within_polygon(poly, 20)
        points_b = deterministic_points_within_polygon(poly, 20)
        self.assertEqual(20, len(points_a))
        self.assertEqual(points_a, points_b)


if __name__ == "__main__":
    unittest.main()

