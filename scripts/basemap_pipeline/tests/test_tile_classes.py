"""Contracts for blank-tile classification."""

from __future__ import annotations

import unittest

import numpy as np

from scripts.basemap_pipeline.tile_classes import CLASS_FLAT, CLASS_SHADED, CLASS_WATER, classify_tile


class TileClassTests(unittest.TestCase):
    def test_gray_near_210_is_flat_and_the_edges_are_shaded(self) -> None:
        self.assertEqual(classify_tile(self._opaque(210)), CLASS_FLAT)
        self.assertEqual(classify_tile(self._opaque(206)), CLASS_FLAT)
        self.assertEqual(classify_tile(self._opaque(214)), CLASS_FLAT)
        self.assertEqual(classify_tile(self._opaque(205)), CLASS_SHADED)
        self.assertEqual(classify_tile(self._opaque(215)), CLASS_SHADED)

    def test_one_transparent_pixel_is_shaded_and_all_transparent_is_water(self) -> None:
        mixed = self._opaque(210)
        mixed[0, 0, 3] = 0
        self.assertEqual(classify_tile(mixed), CLASS_SHADED)
        water = np.zeros((4, 4, 4), dtype=np.uint8)
        self.assertEqual(classify_tile(water), CLASS_WATER)

    def test_empty_array_raises(self) -> None:
        with self.assertRaises(ValueError):
            classify_tile(np.zeros((0, 0, 4), dtype=np.uint8))

    def _opaque(self, gray: int) -> np.ndarray:
        image = np.zeros((4, 4, 4), dtype=np.uint8)
        image[..., 0] = gray
        image[..., 1] = gray
        image[..., 2] = gray
        image[..., 3] = 255
        return image
