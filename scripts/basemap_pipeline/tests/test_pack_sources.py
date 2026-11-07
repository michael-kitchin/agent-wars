"""Contracts for deterministic pack zips and GMTED member selection."""

from __future__ import annotations

import io
import unittest
import zipfile
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import Affine

from scripts.basemap_pipeline.gmted_sources import extract_member, inventory_sources, select_member, write_elevation_vrt
from scripts.basemap_pipeline.pack_writer import PartitionDraft, write_pack, write_stored_zip


class PackWriterTests(unittest.TestCase):
    def test_same_members_write_the_same_bytes(self) -> None:
        with self._temp() as folder:
            root = Path(folder)
            first = root / "a.zip"
            second = root / "b.zip"
            members = {"b.bin": b"second", "a.bin": b"first"}
            write_stored_zip(first, members)
            write_stored_zip(second, members)
            self.assertEqual(first.read_bytes(), second.read_bytes())

    def test_flat_tiles_stay_out_of_the_partition_zip(self) -> None:
        with self._temp() as folder:
            root = Path(folder)
            drafts = {
                "z5_x1_y2": PartitionDraft(flat=("8/1/2",), shaded=(("8/1/3", b"webp-bytes"),)),
                "z5_x1_y3": PartitionDraft(flat=("8/2/2",), shaded=()),
            }
            write_pack(root, "regional", "western_europe", 8, 9, drafts, "a" * 64, "b" * 64)
            with zipfile.ZipFile(root / "z5_x1_y2.zip") as shaded:
                self.assertEqual(shaded.namelist(), ["8/1/3.webp"])
            self.assertFalse((root / "z5_x1_y3.zip").exists())
            with zipfile.ZipFile(root / "basemap_pack.json.zip") as manifest_zip:
                manifest = manifest_zip.read("basemap_pack.json")
            self.assertIn(b'"zip": null', manifest)
            self.assertTrue((root / "land.webp").is_file())
            self.assertTrue((root / "water.webp").is_file())

    def _temp(self):
        return __import__("tempfile").TemporaryDirectory()


class GmtedSourceTests(unittest.TestCase):
    def test_adjacent_tiles_join_in_the_vrt(self) -> None:
        with self._temp() as folder:
            root = Path(folder)
            left = self._tif(root / "left.tif", origin_x=0.0, values=np.array([[1, 2], [3, 4]], dtype=np.int16))
            right = self._tif(root / "right.tif", origin_x=2.0 / 480.0, values=np.array([[5, 6], [7, 8]], dtype=np.int16))
            vrt = write_elevation_vrt([left, right], root / "joined.vrt")
            with rasterio.open(vrt) as dataset:
                self.assertEqual(dataset.width, 4)
                self.assertEqual(int(dataset.read(1)[0, 2]), 5)

    def test_different_pixel_size_raises(self) -> None:
        with self._temp() as folder:
            root = Path(folder)
            fine = self._tif(root / "fine075.tif", origin_x=0.0, values=np.ones((2, 2), dtype=np.int16))
            coarse = self._tif(root / "coarse.tif", origin_x=0.0, values=np.ones((2, 2), dtype=np.int16), pixel=1.0 / 120.0)
            with self.assertRaises(ValueError):
                write_elevation_vrt([fine, coarse], root / "bad.vrt")

    def test_zip_extracts_only_the_breakline_or_the_subsample(self) -> None:
        with self._temp() as folder:
            root = Path(folder)
            fine = root / "GMTED2010N10E000_075.zip"
            self._zip(fine, {"10n000e_20101117_gmted_bln075.tif": b"break", "10n000e_20101117_gmted_med075.tif": b"median"})
            extracted = extract_member(fine, root)
            self.assertEqual(extracted.name, "10n000e_20101117_gmted_bln075.tif")
            self.assertEqual(extracted.read_bytes(), b"break")
            coarse = root / "GMTED2010S90E000_300.zip"
            self._zip(coarse, {"90s000e_20101117_gmted_dsc300.tif": b"sample", "90s000e_20101117_gmted_mea300.tif": b"mean"})
            extracted_coarse = extract_member(coarse, root)
            self.assertEqual(extracted_coarse.read_bytes(), b"sample")

    def test_empty_zip_and_a_partial_sibling_are_missing(self) -> None:
        with self._temp() as folder:
            root = Path(folder)
            empty = root / "GMTED2010N10E000_075.zip"
            empty.write_bytes(b"")
            partial = root / "GMTED2010N10E030_075.zip"
            partial.write_bytes(b"PK" + b"\x00" * 2000)
            (root / "GMTED2010N10E030_075.zip.crswap").write_bytes(b"still-downloading")
            inventory = inventory_sources(root)
            self.assertIn("GMTED2010N10E000_075.zip", inventory.missing)
            self.assertIn("GMTED2010N10E030_075.zip", inventory.missing)

    def _tif(self, path: Path, origin_x: float, values: np.ndarray, pixel: float = 1.0 / 480.0) -> Path:
        height, width = values.shape
        transform = Affine(pixel, 0.0, origin_x, 0.0, -pixel, 1.0)
        with rasterio.open(
            path,
            "w",
            driver="GTiff",
            width=width,
            height=height,
            count=1,
            dtype="int16",
            crs="EPSG:4326",
            transform=transform,
            nodata=-32768,
        ) as dataset:
            dataset.write(values, 1)
        return path

    def _zip(self, path: Path, members: dict[str, bytes]) -> None:
        with zipfile.ZipFile(path, "w") as archive:
            for name, payload in members.items():
                archive.writestr(name, payload)

    def _temp(self):
        return __import__("tempfile").TemporaryDirectory()

    def test_select_member_names_the_kind(self) -> None:
        with self._temp() as folder:
            path = Path(folder) / "GMTED2010N30E120_075.zip"
            self._zip(path, {"30n120e_20101117_gmted_dsc075.tif": b"sample"})
            selected = select_member(path)
            self.assertEqual(selected.kind, "dsc075")
            buffer = io.BytesIO(path.read_bytes())
            self.assertTrue(zipfile.is_zipfile(buffer))
