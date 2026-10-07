from __future__ import annotations

import unittest
from pathlib import Path

import h3
from shapely.geometry import GeometryCollection, LineString, MultiLineString, Point

from scripts.terrain_pipeline import road_rail_sides as rr
from scripts.terrain_pipeline.road_rail_sides_export import RoadRailSidesExporter
from scripts.terrain_pipeline.sampling import cell_polygon


class RoadRailSidesTests(unittest.TestCase):
    def test_iter_route_linestrings_flattens_multilinestring(self) -> None:
        g = MultiLineString([LineString([(0, 0), (1, 1)]), LineString([(2, 2), (3, 3)])])
        parts = list(rr.iter_route_linestrings(g))
        self.assertEqual(2, len(parts))

    def test_iter_route_linestrings_skips_empty(self) -> None:
        g = GeometryCollection([LineString(), LineString([(0, 0), (1, 0)])])
        parts = list(rr.iter_route_linestrings(g))
        self.assertEqual(1, len(parts))

    def test_point_on_segment_interior(self) -> None:
        self.assertTrue(rr._point_on_closed_segment_interior(0.5, 0.0, 0.0, 0.0, 1.0, 0.0))
        self.assertFalse(rr._point_on_closed_segment_interior(0.0, 0.0, 0.0, 0.0, 1.0, 0.0))
        self.assertFalse(rr._point_on_closed_segment_interior(1.0, 0.0, 0.0, 0.0, 1.0, 0.0))

    def test_edge_touch_line_overlap(self) -> None:
        edge = LineString([(0.0, 0.0), (1.0, 0.0)])
        clipped = LineString([(0.2, 0.0), (0.8, 0.0)])
        self.assertTrue(rr._edge_touched_by_clipped_route(edge, clipped))

    def test_edge_touch_corner_point_only(self) -> None:
        edge = LineString([(0.0, 0.0), (1.0, 0.0)])
        clipped = Point(0.0, 0.0)
        self.assertFalse(rr._edge_touched_by_clipped_route(edge, clipped))

    def test_edge_touch_near_boundary_epsilon_still_counts(self) -> None:
        edge = LineString([(0.0, 0.0), (1.0, 0.0)])
        clipped = LineString([(0.25, 5e-10), (0.25, 0.5)])
        self.assertTrue(rr._edge_touched_by_clipped_route(edge, clipped))

    def test_edge_touch_near_corner_epsilon_is_rejected(self) -> None:
        edge = LineString([(0.0, 0.0), (1.0, 0.0)])
        clipped = LineString([(5e-10, 5e-10), (0.0, 0.5)])
        self.assertFalse(rr._edge_touched_by_clipped_route(edge, clipped))

    def test_ordered_edges_anchor_is_north_most_midpoint(self) -> None:
        import h3

        cell = h3.latlng_to_cell(40.7128, -74.0060, 4)
        poly = cell_polygon(cell)
        edges = rr.ordered_cell_boundary_edges(poly)
        via_cell = rr.ordered_cell_boundary_edges_for_cell(cell)
        self.assertEqual(
            [list(edge.coords) for edge in edges],
            [list(edge.coords) for edge in via_cell],
        )
        self.assertEqual(6, len(edges))
        mids = []
        for e in edges:
            lat, lon = rr._midpoint_lat_lon(
                (e.coords[0][0], e.coords[0][1]),
                (e.coords[1][0], e.coords[1][1]),
            )
            mids.append((lat, lon))
        max_lat = max(m[0] for m in mids)
        self.assertAlmostEqual(max_lat, mids[0][0], places=6)

    def test_face_crossing_cell_keeps_six_sides(self) -> None:
        cell = "850194dbfffffff"
        self.assertEqual(7, len(h3.cell_to_boundary(cell)))
        edges = rr.ordered_cell_boundary_edges_for_cell(cell)
        self.assertEqual(6, len(edges))
        self.assertTrue(any(len(list(edge.coords)) > 2 for edge in edges))

    def test_merge_bool_masks(self) -> None:
        self.assertEqual(
            [True, False, True],
            rr._merge_bool_masks([True, False, False], [False, False, True]),
        )

    def test_h3_cells_for_linestring_res4_non_empty(self) -> None:
        line = LineString([(-74.02, 40.71), (-74.00, 40.71)])
        cells = rr.h3_cells_for_linestring_res4(line)
        self.assertGreater(len(cells), 0)
        self.assertEqual(sorted(set(cells)), cells)

    def test_compare_linestring_cell_coverage_res4_shape(self) -> None:
        line = LineString([(-74.02, 40.71), (-74.00, 40.71)])
        out = rr.compare_linestring_cell_coverage_res4(line)
        self.assertIn("n_densified", out)
        self.assertIn("n_buffered", out)
        self.assertIn("cells_only_in_buffered", out)
        self.assertIn("cells_only_in_densified", out)
        self.assertIn("has_mismatch", out)
        self.assertIsInstance(out["has_mismatch"], bool)

    def test_buffered_cells_non_empty_for_segment(self) -> None:
        line = LineString([(-74.02, 40.71), (-74.00, 40.71)])
        buff = rr.h3_cells_for_linestring_res4_buffered(line, buffer_deg=rr.LINE_COVERAGE_QA_BUFFER_DEGREES_DEFAULT)
        self.assertGreater(len(buff), 0)

    def test_validate_inputs_missing_file_raises(self) -> None:
        exporter = RoadRailSidesExporter(
            data_root=Path("F:/NonexistentDataRootForTests"),
            output_dir=Path("data/generated"),
        )
        with self.assertRaises(FileNotFoundError):
            exporter.validate_inputs()

    def test_feature_has_export_scalerank_accepts_zero_through_four(self) -> None:
        self.assertTrue(rr._feature_has_export_scalerank({"scalerank": 0}))
        self.assertTrue(rr._feature_has_export_scalerank({"scalerank": 4}))
        self.assertTrue(rr._feature_has_export_scalerank({"scalerank": "2"}))

    def test_feature_has_export_scalerank_rejects_out_of_range_and_missing(self) -> None:
        self.assertFalse(rr._feature_has_export_scalerank({"scalerank": 5}))
        self.assertFalse(rr._feature_has_export_scalerank({"scalerank": -1}))
        self.assertFalse(rr._feature_has_export_scalerank({"scalerank": None}))
        self.assertFalse(rr._feature_has_export_scalerank(None))
        self.assertFalse(rr._feature_has_export_scalerank({}))

    def test_scalerank_range_keeps_rank_six_and_drops_rank_seven(self) -> None:
        self.assertTrue(rr.feature_has_scalerank_in_range({"scalerank": 6}, 0, 6))
        self.assertFalse(rr.feature_has_scalerank_in_range({"scalerank": 7}, 0, 6))

    def test_linestring_cells_follow_requested_resolution(self) -> None:
        line = LineString([(-74.02, 40.71), (-74.00, 40.71)])
        cells = rr.h3_cells_for_linestring(line, resolution=6, use_fast_segment_grid_path=True)
        self.assertGreater(len(cells), 0)
        self.assertTrue(all(h3.get_resolution(cell) == 6 for cell in cells))


if __name__ == "__main__":
    unittest.main()
