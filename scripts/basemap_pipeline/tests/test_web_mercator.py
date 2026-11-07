"""Contracts for Web Mercator tile ranges."""

from __future__ import annotations

import unittest

from scripts.basemap_pipeline.web_mercator import (
    ORIGIN_SHIFT_M,
    LonLatBox,
    blocks_for_range,
    box_of_tile_range,
    lonlat_to_tile,
    pixel_size_m,
    range_at_zoom,
    tile_bounds_3857,
    tile_range_for_box,
    tms_row,
)

# Western Europe strategic extent, rounded to the published six decimals.
REGION_BOX = LonLatBox(-8.576452, 39.009320, 18.306518, 56.943588)
EXPECTED = {
    5: (15, 17, 9, 12, 12),
    6: (30, 35, 19, 24, 36),
    7: (60, 70, 39, 48, 110),
    8: (121, 141, 78, 97, 420),
    9: (243, 282, 157, 195, 1560),
}


class WebMercatorTests(unittest.TestCase):
    def test_pixel_size_and_origin_tile(self) -> None:
        self.assertAlmostEqual(305.748113140705, pixel_size_m(9), delta=1e-6)
        self.assertEqual((1, 1), lonlat_to_tile(0.0, 0.0, 1))
        self.assertEqual((0, 0), lonlat_to_tile(-180.0, 85.0, 0))
        self.assertEqual((2, 0), lonlat_to_tile(0.0, 90.0, 2))
        self.assertEqual((2, 3), lonlat_to_tile(0.0, -90.0, 2))
        self.assertEqual((3, 2), lonlat_to_tile(180.0, 0.0, 2))
        self.assertEqual((0, 2), lonlat_to_tile(-180.0000001, 0.0, 2))
        self.assertEqual(
            (-ORIGIN_SHIFT_M, -ORIGIN_SHIFT_M, ORIGIN_SHIFT_M, ORIGIN_SHIFT_M),
            tile_bounds_3857(0, 0, 0),
        )
        self.assertEqual(1, tms_row(0, 1))

    def test_region_tile_ranges_sum_to_published_total(self) -> None:
        total = 0
        for zoom, expected in EXPECTED.items():
            tile_range = tile_range_for_box(REGION_BOX, zoom)
            self.assertEqual(expected[:4], (tile_range.x_min, tile_range.x_max, tile_range.y_min, tile_range.y_max))
            self.assertEqual(expected[4], tile_range.tile_count())
            total += tile_range.tile_count()
        self.assertEqual(2138, total)

    def test_zoom_five_range_expands_to_the_weight_raster(self) -> None:
        coarse = tile_range_for_box(REGION_BOX, 5)
        fine = range_at_zoom(coarse, 9)
        self.assertEqual((240, 287, 144, 207), (fine.x_min, fine.x_max, fine.y_min, fine.y_max))
        with self.assertRaises(ValueError):
            range_at_zoom(coarse, 4)
        covered = box_of_tile_range(coarse)
        self.assertAlmostEqual(-11.25, covered.west, places=4)
        self.assertAlmostEqual(22.5, covered.east, places=4)

    def test_blocks_cover_every_zoom_nine_tile_once(self) -> None:
        tile_range = tile_range_for_box(REGION_BOX, 9)
        seen: list[tuple[int, int]] = []
        for block in blocks_for_range(tile_range, 8):
            for y in range(block.y_min, block.y_max + 1):
                for x in range(block.x_min, block.x_max + 1):
                    seen.append((x, y))
        expected = [
            (x, y)
            for y in range(tile_range.y_min, tile_range.y_max + 1)
            for x in range(tile_range.x_min, tile_range.x_max + 1)
        ]
        self.assertEqual(len(seen), len(set(seen)))
        self.assertEqual(set(expected), set(seen))
        with self.assertRaises(ValueError):
            blocks_for_range(tile_range, 0)
        with self.assertRaises(ValueError):
            tile_range_for_box(LonLatBox(10.0, 20.0, 5.0, 15.0), 3)


if __name__ == "__main__":
    unittest.main()
