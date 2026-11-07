"""Contracts for composite crop sizes."""

from __future__ import annotations

import unittest

from scripts.basemap_pipeline.composites import crop_rect
from scripts.basemap_pipeline.web_mercator import LonLatBox

REGION_BOX = LonLatBox(-8.576452, 39.009320, 18.306518, 56.943588)
BATTLE_BOX = LonLatBox(5.743982, 47.240754, 8.098804, 48.721065)


class CompositeCropTests(unittest.TestCase):
    def test_published_region_and_battle_crops(self) -> None:
        left, top, right, bottom = crop_rect(REGION_BOX, 6, 0)
        self.assertEqual((1225, 1238), (right - left, bottom - top))
        bare = crop_rect(BATTLE_BOX, 9, 0)
        padded = crop_rect(BATTLE_BOX, 9, 20)
        self.assertEqual((858, 806), (bare[2] - bare[0], bare[3] - bare[1]))
        self.assertEqual((898, 846), (padded[2] - padded[0], padded[3] - padded[1]))


if __name__ == "__main__":
    unittest.main()
