"""Contracts for mask tests on H3 cells that cross the 180-degree meridian."""

from __future__ import annotations

import unittest

import h3
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

from scripts.terrain_pipeline.antimeridian import WEB_MERCATOR_HALF_WIDTH_M, crosses_antimeridian
from scripts.terrain_pipeline.ocean_mask import (
    build_ocean_predicate_context,
    mask_metrics_for_cell_polygon,
    ocean_relation_for_cell_polygons,
    project_cell_for_masks,
)
from scripts.terrain_pipeline.sampling import cell_polygon


def _crossing_cells(resolution: int) -> set[str]:
    """
    Why this exists:
        Find every cell that crosses 180 degrees without enumerating the whole grid.
    When to use:
        To pick sample cells and to check that every crossing cell projects.
    What to expect:
        The non-pole crossing cells at ``resolution``, found by stepping 0.02 degrees of latitude
        along the meridian and checking each cell and its neighbors.
    """

    cells: set[str] = set()
    step = 0
    while -89.9 + step * 0.02 <= 89.9:
        lat = -89.9 + step * 0.02
        cells.update(cell for cell in h3.grid_disk(h3.latlng_to_cell(lat, 180.0, resolution), 1) if crosses_antimeridian(cell))
        step += 1
    return cells


# The crossing res-4 cell nearest latitude 58, near Chukotka.
SAMPLE_CELL = min(_crossing_cells(4), key=lambda cell: abs(h3.cell_to_latlng(cell)[0] - 58.0))

# Latitude of the sample cell's center.
SAMPLE_LAT = h3.cell_to_latlng(SAMPLE_CELL)[0]


class AntimeridianMaskTests(unittest.TestCase):
    def test_far_polygon_at_same_latitude_does_not_touch_cell(self) -> None:
        context = build_ocean_predicate_context(box(17.5, SAMPLE_LAT - 0.3, 18.5, SAMPLE_LAT + 0.3))
        metrics = mask_metrics_for_cell_polygon(cell_polygon(SAMPLE_CELL), context, cell=SAMPLE_CELL)
        self.assertFalse(metrics.intersects)
        self.assertEqual(0, metrics.mask_edges)

    def test_water_on_both_sides_covers_cell(self) -> None:
        water = unary_union(
            [
                box(170.0, SAMPLE_LAT - 2.0, 180.0, SAMPLE_LAT + 2.0),
                box(-179.99999999999991, SAMPLE_LAT - 2.0, -170.0, SAMPLE_LAT + 2.0),
            ]
        )
        context = build_ocean_predicate_context(water)
        metrics = mask_metrics_for_cell_polygon(cell_polygon(SAMPLE_CELL), context, cell=SAMPLE_CELL)
        self.assertTrue(metrics.all_in_mask)
        self.assertEqual(metrics.total_edges, metrics.mask_edges)
        self.assertEqual("in_water", ocean_relation_for_cell_polygons(cell_polygon(SAMPLE_CELL), context, cell=SAMPLE_CELL))

    def test_water_on_east_side_only_is_coastal(self) -> None:
        context = build_ocean_predicate_context(box(170.0, SAMPLE_LAT - 2.0, 180.0, SAMPLE_LAT + 2.0))
        metrics = mask_metrics_for_cell_polygon(cell_polygon(SAMPLE_CELL), context, cell=SAMPLE_CELL)
        self.assertTrue(metrics.intersects)
        self.assertFalse(metrics.all_in_mask)
        self.assertTrue(0 < metrics.mask_edges < metrics.total_edges)
        self.assertEqual(
            "coastal_band", ocean_relation_for_cell_polygons(cell_polygon(SAMPLE_CELL), context, cell=SAMPLE_CELL)
        )

    def test_ordinary_and_pole_cells_are_unchanged(self) -> None:
        cases = (
            (h3.latlng_to_cell(48.0, 8.0, 4), box(7.0, 47.0, 8.0, 49.0)),
            (h3.latlng_to_cell(90.0, 0.0, 1), box(-180.0, 80.0, 180.0, 85.0)),
        )
        for cell, mask in cases:
            with self.subTest(cell=cell):
                context = build_ocean_predicate_context(mask)
                polygon = cell_polygon(cell)
                self.assertEqual(
                    mask_metrics_for_cell_polygon(polygon, context),
                    mask_metrics_for_cell_polygon(polygon, context, cell=cell),
                )

    def test_every_crossing_cell_projects_inside_the_map(self) -> None:
        for resolution in range(1, 7):
            cells = _crossing_cells(resolution)
            if resolution == 4:
                self.assertEqual(595, len(cells))
            for cell in cells:
                projected = project_cell_for_masks(cell_polygon(cell), cell=cell)
                minx, _, maxx, _ = projected.area.bounds
                self.assertGreaterEqual(minx, -WEB_MERCATOR_HALF_WIDTH_M, cell)
                self.assertLessEqual(maxx, WEB_MERCATOR_HALF_WIDTH_M, cell)
                parts = [projected.area] if isinstance(projected.area, Polygon) else list(projected.area.geoms)
                for part in parts:
                    part_minx, _, part_maxx, _ = part.bounds
                    self.assertLess(part_maxx - part_minx, WEB_MERCATOR_HALF_WIDTH_M, cell)
                self.assertGreaterEqual(len(projected.edges), 5, cell)
                self.assertTrue(all(segments for segments in projected.edges), cell)


if __name__ == "__main__":
    unittest.main()
