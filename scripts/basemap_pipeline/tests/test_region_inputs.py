"""Contracts for reading a region without extracting it."""

from __future__ import annotations

import json
import unittest
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory

import h3

from scripts.basemap_pipeline.region_inputs import cells_box, read_region_json


class RegionInputTests(unittest.TestCase):
    def test_read_region_json_accepts_a_file_or_a_zip_member(self) -> None:
        document = {"region_id": "example"}
        with TemporaryDirectory() as folder:
            root = Path(folder)
            region = root / "example"
            region.mkdir()
            plain = region / "region_manifest.json"
            plain.write_text(json.dumps(document), encoding="utf-8")
            self.assertEqual(document, read_region_json("example", "region_manifest.json", root))
            plain.unlink()
            with zipfile.ZipFile(region / "region_manifest.json.zip", "w") as archive:
                archive.writestr("region_manifest.json", json.dumps(document))
            self.assertEqual(document, read_region_json("example", "region_manifest.json", root))
            (region / "region_manifest.json.zip").unlink()
            with self.assertRaises(FileNotFoundError):
                read_region_json("example", "region_manifest.json", root)

    def test_cells_box_rejects_an_empty_set_and_the_antimeridian(self) -> None:
        with self.assertRaises(ValueError):
            cells_box([])
        with self.assertRaises(ValueError):
            cells_box([h3.latlng_to_cell(0.0, 180.0, 3)])

    def test_cells_box_contains_an_ordinary_cell_centre(self) -> None:
        cell = h3.latlng_to_cell(48.0, 2.0, 3)
        box = cells_box([cell])
        lat, lng = h3.cell_to_latlng(cell)
        self.assertLess(box.west, lng)
        self.assertLess(lng, box.east)
        self.assertLess(box.south, lat)
        self.assertLess(lat, box.north)


if __name__ == "__main__":
    unittest.main()
