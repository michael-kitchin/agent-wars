"""Contracts for water place-name anchors. Geometry is synthetic."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import fiona
from shapely.geometry import box, mapping

from scripts.basemap_pipeline.water_label_anchors import load_water_features

_SCHEMA = {
    "geometry": "Polygon",
    "properties": {
        "featurecla": "str:40",
        "name": "str:40",
        "name_en": "str:40",
        "scalerank": "int",
        "min_label": "float",
        "ne_id": "int",
    },
}
# Wider than one 4° country cell, so a non-narrow record receives a fragment anchor.
_WIDE = box(0.0, 0.0, 10.0, 6.0)


def _write(path: Path, rows: list[dict[str, object]]) -> None:
    with fiona.open(path, "w", driver="ESRI Shapefile", crs="EPSG:4326", schema=_SCHEMA) as destination:
        for row in rows:
            destination.write({
                "geometry": mapping(_WIDE),
                "properties": row,
            })


def _root(directory: str, marine: list[dict[str, object]], lakes: list[dict[str, object]]) -> Path:
    root = Path(directory)
    _write(root / "ne_10m_geography_marine_polys.shp", marine)
    _write(root / "ne_10m_lakes.shp", lakes)
    return root


def _marine(feature_class: str, name: str, name_en: str, scalerank: int, ne_id: int) -> dict[str, object]:
    return {
        "featurecla": feature_class,
        "name": name,
        "name_en": name_en,
        "scalerank": scalerank,
        "min_label": 3.0,
        "ne_id": ne_id,
    }


class WaterLabelAnchorTests(unittest.TestCase):
    def test_marine_classes_kinds_and_the_narrow_anchor(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = _root(tmp, [
                _marine("ocean", "ARCTIC OCEAN", "Arctic Ocean", 0, 1),
                _marine("sea", "MEDITERRANEAN SEA", "Mediterranean Sea", 1, 2),
                _marine("gulf", "GULF OF LION", "Gulf of Lion", 4, 3),
                _marine("strait", "STRAIT OF GIBRALTAR", "Strait of Gibraltar", 2, 4),
                _marine("fjord", "SOGNEFJORD", "Sognefjord", 4, 5),
            ], [])
            features = load_water_features(root)
        kinds = [feature["kind"] for feature in features]
        self.assertEqual(["ocean", "major_water", "minor_water", "major_water"], kinds)
        sea = features[1]
        strait = features[3]
        self.assertGreater(len(sea["anchors"]), 1)
        self.assertEqual(1, len(strait["anchors"]))
        self.assertNotIn("narrow", sea)
        self.assertEqual(True, strait["narrow"])
        self.assertTrue(all(str(feature["id"]).startswith("marine:") for feature in features))

    def test_english_marine_name_wins(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = _root(tmp, [_marine("ocean", "SOUTHERN OCEAN", "Southern Ocean", 0, 9)], [])
            features = load_water_features(root)
        self.assertEqual("Southern Ocean", features[0]["name"])

    def test_lake_names_and_scalerank(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = _root(tmp, [], [
                {
                    "featurecla": "Lake",
                    "name": "Lake Superior",
                    "name_en": "Superior",
                    "scalerank": 0,
                    "min_label": 4.0,
                    "ne_id": 11,
                },
                {
                    "featurecla": "Reservoir",
                    "name": "Lake Nasser",
                    "name_en": "Nasser",
                    "scalerank": 3,
                    "min_label": 5.0,
                    "ne_id": 12,
                },
                {
                    "featurecla": "Lake",
                    "name": "Lake Balaton",
                    "name_en": "Balaton",
                    "scalerank": 8,
                    "min_label": 7.0,
                    "ne_id": 13,
                },
            ])
            features = load_water_features(root)
        self.assertEqual(["Lake Superior", "Lake Nasser"], [feature["name"] for feature in features])
        self.assertEqual(["major_water", "minor_water"], [feature["kind"] for feature in features])
        self.assertTrue(all(not str(feature["id"]).startswith("marine:") for feature in features))
        self.assertTrue(all(str(feature["id"]).startswith("lake:") for feature in features))

    def test_ids_are_unique_across_marine_and_lakes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = _root(
                tmp,
                [_marine("sea", "NORTH SEA", "North Sea", 1, 7)],
                [{
                    "featurecla": "Lake",
                    "name": "Lake Victoria",
                    "name_en": "Nyanza",
                    "scalerank": 1,
                    "min_label": 4.0,
                    "ne_id": 7,
                }],
            )
            features = load_water_features(root)
        ids = [feature["id"] for feature in features]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(["marine:7", "lake:7"], ids)
