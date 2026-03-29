from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import fiona
import math
from shapely.geometry import LineString, Polygon, box, mapping
from shapely.ops import unary_union

from scripts.terrain_pipeline.ocean_mask import (
    build_ocean_predicate_context,
    load_ocean_union_wgs84,
    mask_metrics_for_cell_polygon,
    ocean_relation_for_cell_polygons,
)


class OceanMaskTests(unittest.TestCase):
    def test_load_and_predicates_square_ocean(self) -> None:
        schema = {"geometry": "Polygon", "properties": {"id": "int"}}
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "ocean.shp"
            with fiona.open(
                path,
                "w",
                driver="ESRI Shapefile",
                crs="EPSG:4326",
                schema=schema,
            ) as dst:
                dst.write({"geometry": mapping(box(-5.0, -5.0, 5.0, 5.0)), "properties": {"id": 1}})

            wgs = load_ocean_union_wgs84(path)
            ocean_ctx = build_ocean_predicate_context(wgs)

            inside = box(-1.0, -1.0, 1.0, 1.0)
            self.assertEqual("in_water", ocean_relation_for_cell_polygons(inside, ocean_ctx))

            crosses = box(4.0, 0.0, 6.0, 1.0)
            self.assertEqual("coastal_band", ocean_relation_for_cell_polygons(crosses, ocean_ctx))

            outside = box(10.0, 10.0, 12.0, 12.0)
            self.assertEqual("no_water", ocean_relation_for_cell_polygons(outside, ocean_ctx))

    def test_mask_metrics_align_with_ocean_relation(self) -> None:
        schema = {"geometry": "Polygon", "properties": {"id": "int"}}
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "ocean.shp"
            with fiona.open(
                path,
                "w",
                driver="ESRI Shapefile",
                crs="EPSG:4326",
                schema=schema,
            ) as dst:
                dst.write({"geometry": mapping(box(-5.0, -5.0, 5.0, 5.0)), "properties": {"id": 1}})

            wgs = load_ocean_union_wgs84(path)
            ocean_ctx = build_ocean_predicate_context(wgs)

            for geom, expected in (
                (box(-1.0, -1.0, 1.0, 1.0), "in_water"),
                (box(4.0, 0.0, 6.0, 1.0), "coastal_band"),
                (box(10.0, 10.0, 12.0, 12.0), "no_water"),
            ):
                relation = ocean_relation_for_cell_polygons(geom, ocean_ctx)
                self.assertEqual(expected, relation)
                m = mask_metrics_for_cell_polygon(geom, ocean_ctx)
                self.assertLessEqual(m.mask_edges, m.total_edges)
                if expected == "in_water":
                    self.assertTrue(m.all_in_mask)
                    self.assertTrue(m.intersects)
                elif expected == "no_water":
                    self.assertFalse(m.all_in_mask)
                    self.assertFalse(m.intersects)
                else:
                    self.assertFalse(m.all_in_mask)
                    self.assertTrue(m.intersects)

    def test_isolated_island_all_boundary_edges_in_ocean_is_ocean(self) -> None:
        """
        Ocean union covers every hex side via thin buffers but can still leave the cell interior non-ocean
        (rule 2: all sides within ocean → ocean).
        """

        def regular_hex_flat_top(cx: float, cy: float, r: float) -> Polygon:
            pts = []
            for i in range(6):
                angle = 2 * math.pi * i / 6 - math.pi / 6
                pts.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
            return Polygon(pts)

        cell = regular_hex_flat_top(10.0, 10.0, 0.02)
        co = list(cell.exterior.coords)
        if co[0] == co[-1]:
            co = co[:-1]
        n = len(co)
        edge_lines = [LineString([co[i], co[(i + 1) % n]]) for i in range(n)]
        ocean_wgs = unary_union([edge_lines[i].buffer(0.003) for i in range(n)])

        ocean_ctx = build_ocean_predicate_context(ocean_wgs)
        self.assertEqual("in_water", ocean_relation_for_cell_polygons(cell, ocean_ctx))


if __name__ == "__main__":
    unittest.main()
