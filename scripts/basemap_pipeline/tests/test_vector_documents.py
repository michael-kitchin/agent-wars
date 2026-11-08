"""Contracts for coastlines, the edge mask, and borders. Geometry is synthetic."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import fiona
from shapely.geometry import LineString, box, mapping

from scripts.basemap_pipeline.admin_borders import (
    BORDER_SOURCES,
    load_border_lines,
    without_dateline_cuts,
)
from scripts.basemap_pipeline.coast_edge_mask import (
    build_coast_edge_mask_document,
    cell_mask_geometry,
)
from scripts.basemap_pipeline.coastline_vectors import (
    build_coastline_document,
    coast_lines_3857,
)
from scripts.basemap_pipeline.vector_encoding import cell_key
from scripts.basemap_pipeline.vector_grid import split_by_grid, to_mercator
from scripts.basemap_pipeline.vector_settings import MERCATOR_MAX_LAT, WORLD_HALF_EXTENT_M


def _ocean_with_island(side_m: float):
    mercator_y = to_mercator(LineString([(0.0, 0.0), (0.0, MERCATOR_MAX_LAT)])).coords[1][1]
    ocean = box(-WORLD_HALF_EXTENT_M, -mercator_y, WORLD_HALF_EXTENT_M, mercator_y)
    island = box(100_000.0, 100_000.0, 100_000.0 + side_m, 100_000.0 + side_m)
    return ocean.difference(island)


def _longitudes(geometry) -> list[float]:
    if geometry.is_empty:
        return []
    if geometry.geom_type == "LineString":
        return [point[0] for point in geometry.coords]
    if hasattr(geometry, "geoms"):
        values: list[float] = []
        for part in geometry.geoms:
            values.extend(_longitudes(part))
        return values
    return []


def _corners(part: list[int]) -> list[tuple[int, int]]:
    lat, lng = part[0], part[1]
    points = [(lat, lng)]
    for index in range(2, len(part), 2):
        lat += part[index]
        lng += part[index + 1]
        points.append((lat, lng))
    if points[0] == points[-1]:
        points = points[:-1]
    return points


def _vertices(lod: dict) -> int:
    return sum(len(part) // 2 for parts in lod["cells"].values() for part in parts)


class VectorDocumentTests(unittest.TestCase):
    def test_frame_edges_are_not_coastline(self) -> None:
        mercator_y = to_mercator(LineString([(0.0, 0.0), (0.0, MERCATOR_MAX_LAT)])).coords[1][1]
        water = box(-WORLD_HALF_EXTENT_M, -mercator_y, WORLD_HALF_EXTENT_M, mercator_y)
        lines = coast_lines_3857(water)
        for longitude in _longitudes(lines):
            self.assertGreater(abs(abs(longitude) - WORLD_HALF_EXTENT_M), 1.0)

    def test_island_ring_becomes_coastline(self) -> None:
        document = build_coastline_document(coast_lines_3857(_ocean_with_island(1_000.0)))
        parts = [part for parts in document["lods"][-1]["cells"].values() for part in parts]
        self.assertEqual(1, len(parts))
        self.assertEqual(4, len(_corners(parts[0])))

    def test_small_part_dropped_at_coarse_lod(self) -> None:
        document = build_coastline_document(coast_lines_3857(_ocean_with_island(100.0)))
        self.assertEqual(0, _vertices(document["lods"][0]))
        self.assertGreater(_vertices(document["lods"][-1]), 0)

    def test_split_by_grid_keys(self) -> None:
        line = LineString([(1.0, 1.0), (5.0, 1.0)])
        keys = set(split_by_grid(line, 2.0))
        self.assertEqual({"45:90", "45:91", "45:92"}, keys)
        for lng, col in ((1.0, 90), (3.0, 91), (5.0, 92)):
            self.assertEqual(f"45:{col}", cell_key(1.0, lng, 2.0))

    def test_mask_cell_partitions_area(self) -> None:
        pieces = cell_mask_geometry(box(0.0, 0.0, 1.0, 2.0), 0.0, 0.0, 2.0, 2.0)
        self.assertIsNotNone(pieces)
        water, land = pieces
        self.assertAlmostEqual(4.0, water.area + land.area, delta=1e-9)
        for piece in (water, land):
            min_lng, min_lat, max_lng, max_lat = piece.bounds
            self.assertGreaterEqual(min_lng, -1e-9)
            self.assertGreaterEqual(min_lat, -1e-9)
            self.assertLessEqual(max_lng, 2.0 + 1e-9)
            self.assertLessEqual(max_lat, 2.0 + 1e-9)

    def test_mask_skips_uniform_cells(self) -> None:
        full = build_coast_edge_mask_document(box(0.0, 0.0, 2.0, 2.0))
        self.assertNotIn(cell_key(1.0, 1.0, 2.0), full["cells"])
        half = build_coast_edge_mask_document(box(4.0, 0.0, 6.0, 2.0))
        self.assertNotIn(cell_key(1.0, 1.0, 2.0), half["cells"])

    def test_dateline_cut_is_not_a_border(self) -> None:
        kept = without_dateline_cuts([
            LineString([(180.0, 0.0), (180.0, 1.0)]),
            LineString([(179.0, 0.0), (179.5, 1.0)]),
        ])
        self.assertEqual([(179.0, 0.0), (179.5, 1.0)], list(kept[0].coords))
        self.assertEqual(1, len(kept))

    def test_borders_come_from_land_boundary_lines(self) -> None:
        self.assertEqual("ne_10m_admin_0_boundary_lines_land.shp", BORDER_SOURCES["country"])
        self.assertEqual("ne_10m_admin_1_states_provinces_lines.shp", BORDER_SOURCES["state"])

    def test_polygon_input_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "borders.shp"
            schema = {"geometry": "Polygon", "properties": {"featurecla": "str:80"}}
            with fiona.open(path, "w", driver="ESRI Shapefile", crs="EPSG:4326", schema=schema) as dst:
                dst.write({
                    "geometry": mapping(box(0.0, 0.0, 1.0, 1.0)),
                    "properties": {"featurecla": "International boundary (verify)"},
                })
            with self.assertRaises(ValueError):
                load_border_lines(path)

    def test_disputed_featurecla_is_split(self) -> None:
        rows = [
            (LineString([(0.0, 0.0), (1.0, 0.0)]), "Disputed (please verify)"),
            (LineString([(0.0, 1.0), (1.0, 1.0)]), "Indefinite boundary"),
            (LineString([(0.0, 2.0), (1.0, 2.0)]), "International boundary (verify)"),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "borders.shp"
            schema = {"geometry": "LineString", "properties": {"featurecla": "str:80"}}
            with fiona.open(path, "w", driver="ESRI Shapefile", crs="EPSG:4326", schema=schema) as dst:
                for line, name in rows:
                    dst.write({"geometry": mapping(line), "properties": {"featurecla": name}})
            normal, disputed = load_border_lines(path)
        self.assertEqual(1, len(normal))
        self.assertEqual(2, len(disputed))
