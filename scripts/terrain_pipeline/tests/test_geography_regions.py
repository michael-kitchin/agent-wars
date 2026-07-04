"""Unit tests for geography region polygon loading."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import fiona
from shapely.geometry import mapping, box

from scripts.terrain_pipeline.geography_regions import load_geography_region_features


class GeographyRegionsTest(unittest.TestCase):
    def test_load_filters_by_featurecla_and_island_area(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "regions.shp"
            schema = {
                "geometry": "Polygon",
                "properties": {
                    "FEATURECLA": "str:32",
                    "NE_ID": "int:10",
                    "NAME": "str:32",
                },
            }
            big = box(0, 0, 2, 2)
            small = box(10, 10, 10.01, 10.01)
            with fiona.open(path, "w", driver="ESRI Shapefile", crs="EPSG:4326", schema=schema) as dst:
                dst.write(
                    {
                        "geometry": mapping(big),
                        "properties": {"FEATURECLA": "Continent", "NE_ID": 100, "NAME": "TEST_CONT"},
                    }
                )
                dst.write(
                    {
                        "geometry": mapping(big),
                        "properties": {"FEATURECLA": "Isthmus", "NE_ID": 101, "NAME": "TEST_IST"},
                    }
                )
                dst.write(
                    {
                        "geometry": mapping(big),
                        "properties": {"FEATURECLA": "Island", "NE_ID": 200, "NAME": "BIG_ISL"},
                    }
                )
                dst.write(
                    {
                        "geometry": mapping(small),
                        "properties": {"FEATURECLA": "Island", "NE_ID": 201, "NAME": "SMALL_ISL"},
                    }
                )
                dst.write(
                    {
                        "geometry": mapping(big),
                        "properties": {"FEATURECLA": "Coast", "NE_ID": 999, "NAME": "IGNORED"},
                    }
                )
            continents, islands = load_geography_region_features(path, island_min_area_km2=2000.0)
            self.assertEqual(len(continents), 2)
            self.assertEqual({c.region_id for c in continents}, {100, 101})
            self.assertEqual(len(islands), 1)
            self.assertEqual(islands[0].region_id, 200)


if __name__ == "__main__":
    unittest.main()
