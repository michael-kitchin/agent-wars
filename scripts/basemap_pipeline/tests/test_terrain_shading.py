"""Contracts for slope, light, and gray tone."""

from __future__ import annotations

import math
import unittest
from dataclasses import replace

import numpy as np

from scripts.basemap_pipeline.basemap_settings import PLAIN_STYLE, STYLIZED_STYLE
from scripts.basemap_pipeline.terrain_shading import (
    flat_illumination,
    flat_weight,
    illumination,
    land_tone,
    slope_degrees,
    smooth_along_ridge,
    surface_gradients,
    tone_to_gray,
)


class TerrainShadingTests(unittest.TestCase):
    def test_flat_land_is_gray_210_and_stylized_weight_is_zero(self) -> None:
        zeros = np.zeros((2, 2))
        lit = illumination(zeros, zeros, PLAIN_STYLE)
        self.assertTrue(np.allclose(lit, flat_illumination(PLAIN_STYLE)))
        for style in (PLAIN_STYLE, STYLIZED_STYLE):
            deviation = lit - flat_illumination(style)
            gray = tone_to_gray(land_tone(deviation, np.ones((2, 2)), style))
            self.assertTrue(np.all(gray == 210))
        self.assertTrue(np.all(flat_weight(zeros, STYLIZED_STYLE) == 0.0))

    def test_northwest_light_brightens_west_and_north_faces(self) -> None:
        rise = math.tan(math.radians(10.0))
        flat = flat_illumination(PLAIN_STYLE)
        west = float(illumination(np.full((1, 1), rise), np.zeros((1, 1)), PLAIN_STYLE)[0, 0])
        north = float(illumination(np.zeros((1, 1)), np.full((1, 1), -rise), PLAIN_STYLE)[0, 0])
        east = float(illumination(np.full((1, 1), -rise), np.zeros((1, 1)), PLAIN_STYLE)[0, 0])
        south = float(illumination(np.zeros((1, 1)), np.full((1, 1), rise), PLAIN_STYLE)[0, 0])
        self.assertGreater(west, flat)
        self.assertGreater(north, flat)
        self.assertLess(east, flat)
        self.assertLess(south, flat)

    def test_northeast_slope_is_near_flat_brightness_but_fully_weighted(self) -> None:
        rise = math.tan(math.radians(20.0)) / math.sqrt(2.0)
        rise_east = np.full((1, 1), -rise)
        rise_north = np.full((1, 1), -rise)
        lit = float(illumination(rise_east, rise_north, STYLIZED_STYLE)[0, 0])
        self.assertLess(abs(lit - flat_illumination(STYLIZED_STYLE)), 0.05)
        weight = flat_weight(slope_degrees(rise_east, rise_north), STYLIZED_STYLE)
        self.assertEqual(1.0, float(weight[0, 0]))
        gray = tone_to_gray(land_tone(np.array([[lit - flat_illumination(STYLIZED_STYLE)]]), weight, STYLIZED_STYLE))
        self.assertNotEqual(210, int(gray[0, 0]))

    def test_flat_weight_ramp_and_plain_style(self) -> None:
        stylized = flat_weight(np.array([[1.0, 3.5, 10.0]]), STYLIZED_STYLE)
        self.assertEqual(0.0, float(stylized[0, 0]))
        self.assertGreater(float(stylized[0, 1]), 0.0)
        self.assertLess(float(stylized[0, 1]), 1.0)
        self.assertEqual(1.0, float(stylized[0, 2]))
        self.assertEqual(1.0, float(flat_weight(np.array([[0.0]]), PLAIN_STYLE)[0, 0]))
        with self.assertRaises(ValueError):
            flat_weight(np.array([[0.0]]), replace(STYLIZED_STYLE, full_relief_slope_deg=2.0))

    def test_surface_gradient_of_an_eastward_ramp(self) -> None:
        dem = np.tile(np.arange(5) * 100.0, (5, 1))
        rise_east, rise_north = surface_gradients(dem, np.full(5, 1000.0))
        self.assertTrue(np.allclose(rise_east[1:-1, 1:-1], 0.1))
        self.assertTrue(np.allclose(rise_north[1:-1, 1:-1], 0.0))

    def test_stylized_contrast_moves_farther_from_flat_than_plain(self) -> None:
        deviation = np.array([[-0.05]])
        weight = np.array([[1.0]])
        plain = abs(float(land_tone(deviation, weight, PLAIN_STYLE)[0, 0]) - PLAIN_STYLE.flat_tone)
        stylized = abs(float(land_tone(deviation, weight, STYLIZED_STYLE)[0, 0]) - STYLIZED_STYLE.flat_tone)
        self.assertGreater(stylized, plain)

    def test_along_ridge_smooth_fills_a_crest_notch_and_leaves_the_slope(self) -> None:
        dem = np.zeros((31, 31))
        dem[15, :] = 100.0
        dem[15, 15] = 0.0
        rise_east, rise_north = surface_gradients(dem, np.full(31, 100.0))
        smoothed = smooth_along_ridge(dem, rise_east, rise_north, 2.0, PLAIN_STYLE.flat_slope_deg)
        self.assertGreater(float(smoothed[15, 15]), 40.0)
        self.assertLess(float(abs(smoothed[8, 15])), 10.0)
        unchanged = smooth_along_ridge(dem, rise_east, rise_north, 0.0, PLAIN_STYLE.flat_slope_deg)
        self.assertTrue(np.array_equal(unchanged, dem))


if __name__ == "__main__":
    unittest.main()
