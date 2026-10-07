"""Contracts for clipped mask metrics and antimeridian bounds."""

from __future__ import annotations

import unittest

import h3
from shapely.geometry import box

from scripts.terrain_pipeline.geometry_bounds import bounds_for_cells, clip_polygonal_to_bounds
from scripts.terrain_pipeline.ocean_mask import build_ocean_predicate_context, mask_metrics_for_cell_polygon
from scripts.terrain_pipeline.sampling import cell_polygon


class MetadataExportCoreTests(unittest.TestCase):
    def test_clipping_does_not_change_cell_metrics(self) -> None:
        cell = h3.latlng_to_cell(48.0, 8.0, 4)
        lat, lng = h3.cell_to_latlng(cell)
        square = box(lng - 1.0, lat - 1.0, lng + 1.0, lat + 1.0)
        full = build_ocean_predicate_context(square)
        clipped_geom = clip_polygonal_to_bounds(square, bounds_for_cells([cell]))
        clipped = build_ocean_predicate_context(clipped_geom)
        polygon = cell_polygon(cell)
        full_metrics = mask_metrics_for_cell_polygon(polygon, full)
        clipped_metrics = mask_metrics_for_cell_polygon(polygon, clipped)
        self.assertEqual(full_metrics.intersects, clipped_metrics.intersects)
        self.assertEqual(full_metrics.all_in_mask, clipped_metrics.all_in_mask)
        self.assertEqual(full_metrics.mask_edges, clipped_metrics.mask_edges)

    def test_empty_clip_reports_no_water(self) -> None:
        cell = h3.latlng_to_cell(48.0, 8.0, 4)
        square = box(0.0, 0.0, 1.0, 1.0)
        clipped = clip_polygonal_to_bounds(square, (20.0, 20.0, 21.0, 21.0))
        context = build_ocean_predicate_context(clipped)
        metrics = mask_metrics_for_cell_polygon(cell_polygon(cell), context)
        self.assertFalse(metrics.intersects)
        self.assertFalse(metrics.all_in_mask)
        self.assertEqual(0, metrics.mask_edges)

    def test_antimeridian_cell_has_no_clip_bounds(self) -> None:
        nearby = h3.grid_disk(h3.latlng_to_cell(66.0, 179.9, 2), 1)
        crossing = next(cell for cell in nearby if cell_polygon(cell).bounds[2] > 180.0)
        self.assertIsNone(bounds_for_cells([crossing]))


if __name__ == "__main__":
    unittest.main()
