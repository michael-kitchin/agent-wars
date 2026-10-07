from __future__ import annotations

import unittest

import numpy as np
from rasterio.io import MemoryFile
from rasterio.transform import from_origin
from shapely.geometry import Polygon

from scripts.terrain_pipeline.sampling import (
    _ensure_proj_data_env,
    deterministic_points_within_polygon,
    read_sample_window,
    read_sample_windows,
    sample_many_rasters,
    sample_many_windows,
)


class SamplingTests(unittest.TestCase):
    def test_deterministic_point_count(self) -> None:
        poly = Polygon([(0.0, 0.0), (2.0, 0.0), (2.0, 1.0), (0.0, 1.0)])
        points_a = deterministic_points_within_polygon(poly, 20)
        points_b = deterministic_points_within_polygon(poly, 20)
        self.assertEqual(20, len(points_a))
        self.assertEqual(points_a, points_b)

    def test_sample_window_matches_dataset_sample(self) -> None:
        _ensure_proj_data_env()
        grid = np.arange(100, dtype=np.uint8).reshape(10, 10)
        grid[0, 0] = 255
        profile = {
            "driver": "GTiff",
            "width": 10,
            "height": 10,
            "count": 1,
            "dtype": "uint8",
            "crs": "EPSG:4326",
            "transform": from_origin(-10.0, 50.0, 1.0, 1.0),
            "nodata": 255,
        }
        interior = [(-9.5, 49.5), (-8.5, 48.5), (-5.5, 45.5)]
        edges = [(-9.999, 49.999), (-0.001, 40.001)]
        with MemoryFile() as mem:
            with mem.open(**profile) as dataset:
                dataset.write(grid, 1)
            with mem.open() as dataset:
                window = read_sample_window(dataset, (-10.0, 40.0, 0.0, 50.0))
                from_dataset = sample_many_rasters([("grid", dataset)], interior)
                from_window = sample_many_windows([("grid", window)], interior)
                edge_dataset = sample_many_rasters([("grid", dataset)], edges)
                edge_window = sample_many_windows([("grid", window)], edges)
        self.assertEqual(from_dataset, from_window)
        self.assertEqual(27.5, from_window["grid"])
        self.assertEqual(edge_dataset, edge_window)

    def test_projected_raster_skips_windows(self) -> None:
        _ensure_proj_data_env()
        profile = {
            "driver": "GTiff",
            "width": 2,
            "height": 2,
            "count": 1,
            "dtype": "uint8",
            "crs": "EPSG:3857",
            "transform": from_origin(0.0, 2.0, 1.0, 1.0),
        }
        with MemoryFile() as mem:
            with mem.open(**profile) as dataset:
                dataset.write(np.zeros((2, 2), dtype=np.uint8), 1)
            with mem.open() as dataset:
                windows = read_sample_windows([("grid", dataset)], (0.0, 0.0, 1.0, 1.0))
                with self.assertRaises(ValueError):
                    read_sample_window(dataset, (0.0, 0.0, 1.0, 1.0))
        self.assertIsNone(windows)


if __name__ == "__main__":
    unittest.main()

