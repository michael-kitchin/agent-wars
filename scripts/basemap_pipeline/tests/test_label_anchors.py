"""Contracts for place-name anchors. Geometry is synthetic."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import fiona
from shapely.geometry import Point, Polygon, box, mapping

from scripts.basemap_pipeline.label_anchors import fragment_anchors, load_continent_features


def _write_continents(path: Path, names: list[str]) -> None:
    schema = {"geometry": "Polygon", "properties": {"featurecla": "str:40", "NAME": "str:40"}}
    with fiona.open(path, "w", driver="ESRI Shapefile", crs="EPSG:4326", schema=schema) as destination:
        for name in names:
            destination.write({
                "geometry": mapping(box(10.0, 0.0, 30.0, 15.0)),
                "properties": {"featurecla": "Continent", "NAME": name},
            })


class LabelAnchorTests(unittest.TestCase):
    def test_l_shape_has_an_anchor_in_each_cell(self) -> None:
        polygon = Polygon([
            (0.2, 0.2),
            (1.6, 0.2),
            (1.6, 0.5),
            (0.5, 0.5),
            (0.5, 0.8),
            (0.2, 0.8),
        ])
        anchors = fragment_anchors(polygon, 1.0, 1.0)
        self.assertEqual(2, len(anchors))
        for latitude, longitude, radius in anchors:
            self.assertTrue(polygon.contains(Point(longitude, latitude)))
            self.assertGreater(radius, 0)

    def test_narrow_piece_is_dropped(self) -> None:
        self.assertEqual([], fragment_anchors(box(10.0, 10.0, 10.01, 10.01), 1.0, 5000))

    def test_unknown_continent_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_continents(root / "ne_10m_geography_regions_polys.shp", ["Atlantis"])
            with self.assertRaises(ValueError):
                load_continent_features(root)

    def test_known_continent_uses_the_fixed_anchor(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_continents(root / "ne_10m_geography_regions_polys.shp", ["Africa"])
            features = load_continent_features(root)
        self.assertEqual("continent:Africa", features[0]["id"])
        anchors = features[0]["anchors"]
        self.assertEqual([6.0, 20.0], anchors[0][:2])
        self.assertEqual(1, len(anchors))
