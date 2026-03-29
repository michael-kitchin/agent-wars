from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import fiona
from shapely.geometry import box, mapping

from scripts.terrain_pipeline.ocean_mask import mask_metrics_for_cell_polygon
from scripts.terrain_pipeline.urban_scalerank import load_urban_contexts_by_scalerank


class UrbanScalerankTests(unittest.TestCase):
    def test_contexts_sorted_and_consistent_with_aggregate(self) -> None:
        schema = {
            "geometry": "Polygon",
            "properties": {"scalerank": "str"},
        }
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "urban.shp"
            with fiona.open(path, "w", driver="ESRI Shapefile", crs="EPSG:4326", schema=schema) as dst:
                dst.write(
                    {
                        "geometry": mapping(box(0.0, 0.0, 2.0, 2.0)),
                        "properties": {"scalerank": "1"},
                    }
                )
                dst.write(
                    {
                        "geometry": mapping(box(3.0, 3.0, 5.0, 5.0)),
                        "properties": {"scalerank": "3"},
                    }
                )
                dst.write(
                    {
                        "geometry": mapping(box(6.0, 6.0, 8.0, 8.0)),
                        "properties": {"scalerank": "bad"},
                    }
                )

            aggregate_ctx, by_rank = load_urban_contexts_by_scalerank(path)
            ranks = [r for r, _ in by_rank]
            self.assertEqual([-1, 1, 3], ranks)

            by_rank_map = {r: ctx for r, ctx in by_rank}
            in_rank1 = box(0.2, 0.2, 1.8, 1.8)
            outside_all = box(-5.0, -5.0, -4.0, -4.0)

            agg_rank1 = mask_metrics_for_cell_polygon(in_rank1, aggregate_ctx)
            r1_rank1 = mask_metrics_for_cell_polygon(in_rank1, by_rank_map[1])
            self.assertTrue(agg_rank1.intersects)
            self.assertTrue(r1_rank1.intersects)
            self.assertEqual(agg_rank1.all_in_mask, r1_rank1.all_in_mask)

            agg_out = mask_metrics_for_cell_polygon(outside_all, aggregate_ctx)
            self.assertFalse(agg_out.intersects)
            for _, rank_ctx in by_rank:
                m = mask_metrics_for_cell_polygon(outside_all, rank_ctx)
                self.assertFalse(m.intersects)


if __name__ == "__main__":
    unittest.main()
