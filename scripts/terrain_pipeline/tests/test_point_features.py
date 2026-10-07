from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import fiona
import h3
from shapely.geometry import Point, mapping

from scripts.terrain_pipeline.point_features import (
    SCALERANK_SENTINEL,
    LabeledPoint,
    PointCountIndex,
    build_pair_indexes,
    load_filtered_points_wgs84,
    normalize_scalerank,
    validate_point_shapefile_contract,
)


class PointFeatureTests(unittest.TestCase):
    def test_normalize_scalerank_invalid_maps_to_sentinel(self) -> None:
        self.assertEqual(SCALERANK_SENTINEL, normalize_scalerank(None))
        self.assertEqual(SCALERANK_SENTINEL, normalize_scalerank("bad"))

    def test_load_filtered_points_requires_featurecla_field(self) -> None:
        schema = {"geometry": "Point", "properties": {"scalerank": "str"}}
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "seaports.shp"
            with fiona.open(path, "w", driver="ESRI Shapefile", crs="EPSG:4326", schema=schema) as dst:
                dst.write(
                    {
                        "geometry": mapping(Point(0.0, 0.0)),
                        "properties": {"scalerank": "1"},
                    }
                )
            with self.assertRaises(ValueError):
                load_filtered_points_wgs84(path, featurecla_value="Seaport")

    def test_load_filtered_points_invalid_scalerank_bucketed_to_sentinel(self) -> None:
        schema = {
            "geometry": "Point",
            "properties": {"featurecla": "str", "scalerank": "str"},
        }
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "airports.shp"
            with fiona.open(path, "w", driver="ESRI Shapefile", crs="EPSG:4326", schema=schema) as dst:
                dst.write(
                    {
                        "geometry": mapping(Point(1.0, 1.0)),
                        "properties": {"featurecla": "Airport", "scalerank": "bad"},
                    }
                )
            points = load_filtered_points_wgs84(path, featurecla_value="Airport")
            self.assertEqual(1, len(points))
            self.assertEqual(SCALERANK_SENTINEL, points[0].scalerank)

    def test_validate_point_shapefile_contract_requires_matching_features(self) -> None:
        schema = {
            "geometry": "Point",
            "properties": {"featurecla": "str", "scalerank": "str"},
        }
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "seaports.shp"
            with fiona.open(path, "w", driver="ESRI Shapefile", crs="EPSG:4326", schema=schema) as dst:
                dst.write(
                    {
                        "geometry": mapping(Point(1.0, 1.0)),
                        "properties": {"featurecla": "Airport", "scalerank": "1"},
                    }
                )
            with self.assertRaises(ValueError):
                validate_point_shapefile_contract(path, featurecla_value="Seaport")

    def test_build_pair_indexes_rejects_ports_file_with_no_port_features(self) -> None:
        schema = {
            "geometry": "Point",
            "properties": {"featurecla": "str", "scalerank": "str"},
        }
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            for name, label in (("airports.shp", "Airport"), ("ports.shp", "Seaport")):
                with fiona.open(root / name, "w", driver="ESRI Shapefile", crs="EPSG:4326", schema=schema) as dst:
                    dst.write(
                        {
                            "geometry": mapping(Point(1.0, 1.0)),
                            "properties": {"featurecla": label, "scalerank": "1"},
                        }
                    )
            with self.assertRaises(ValueError):
                build_pair_indexes(root, "airports.shp", "ports.shp", (4,))

    def test_point_count_index_totals_match_sparse_rows(self) -> None:
        points = [
            LabeledPoint(lat=0.0, lng=0.0, scalerank=1),
            LabeledPoint(lat=0.0, lng=0.0, scalerank=1),
            LabeledPoint(lat=0.0, lng=0.0, scalerank=SCALERANK_SENTINEL),
        ]
        idx = PointCountIndex((1,))
        idx.ingest_points(points)
        cell = h3.latlng_to_cell(0.0, 0.0, 1)
        total, sparse = idx.totals_for_cell(cell, 1)
        self.assertEqual(3, total)
        self.assertEqual([(-1, 1), (1, 2)], sparse)
        self.assertEqual(total, sum(count for _, count in sparse))


if __name__ == "__main__":
    unittest.main()
