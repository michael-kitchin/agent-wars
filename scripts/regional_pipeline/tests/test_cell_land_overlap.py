"""Cell overlap against the cell polygon itself and against a distant square."""

from __future__ import annotations

import unittest

import h3
from shapely.geometry import box

from scripts.regional_pipeline.cell_land_overlap import overlap_km2


class CellLandOverlapTests(unittest.TestCase):
    def test_cell_polygon_overlap_matches_cell_area(self) -> None:
        cell = h3.latlng_to_cell(48.0, 8.0, 3)
        from scripts.terrain_pipeline.sampling import cell_polygon

        overlap = overlap_km2(cell, cell_polygon(cell))
        self.assertAlmostEqual(h3.cell_area(cell, unit="km^2"), overlap, delta=h3.cell_area(cell, unit="km^2") * 0.01)

    def test_distant_polygon_overlap_is_zero(self) -> None:
        cell = h3.latlng_to_cell(48.0, 8.0, 3)
        self.assertEqual(0.0, overlap_km2(cell, box(20, 20, 21, 21)))
