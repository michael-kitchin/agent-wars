"""Contracts for reading CHELSA monthly climatologies."""

from __future__ import annotations

import unittest
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import Affine

from scripts.basemap_pipeline.proj_runtime import use_current_proj_data
from scripts.weather_pipeline.chelsa_source import (
    celsius_from_raw,
    chelsa_month_path,
    open_chelsa_bands,
    window_mean_raw,
)


def write_band(path: Path, values: np.ndarray, variable: str, scale: float = 0.1) -> None:
    """Write one uint16 climatology band and require the scale and variable tag to round-trip."""

    use_current_proj_data()
    path.parent.mkdir(parents=True, exist_ok=True)
    height, width = values.shape
    profile = {
        "driver": "GTiff",
        "dtype": "uint16",
        "nodata": 65535,
        "width": width,
        "height": height,
        "count": 1,
        "crs": "EPSG:4326",
        "transform": Affine(1, 0, 0, 0, -1, 30),
    }
    with rasterio.open(path, "w", **profile) as dataset:
        dataset.write(values.astype(np.uint16), 1)
        dataset.scales = (scale,)
        dataset.offsets = (0.0,)
        dataset.update_tags(variable=variable)
    with rasterio.open(path) as dataset:
        if abs(float(dataset.scales[0]) - scale) > 1e-6 or dataset.tags().get("variable") != variable:
            raise AssertionError(f"scale or variable tag did not round-trip for {path}")


def write_year(root: Path, fill: int = 2771, **replacements: tuple[np.ndarray, str, float]) -> None:
    """Write twelve temperature and twelve precipitation files, with named replacements."""

    for variable in ("tas", "pr"):
        for month in range(1, 13):
            path = chelsa_month_path(root, variable, month)
            key = f"{variable}_{month:02d}"
            if key in replacements:
                values, tag, scale = replacements[key]
                write_band(path, values, tag, scale)
            else:
                write_band(path, np.full((30, 30), fill, dtype=np.uint16), variable)


class ChelsaSourceTests(unittest.TestCase):
    def test_window_mean_ignores_nodata(self) -> None:
        values = np.full((30, 30), 2771, dtype=np.uint16)
        values[10:20, 10:20] = 65535
        with self._one_band(values, "tas") as dataset:
            lng, lat = dataset.xy(15, 15)
            mean = window_mean_raw(dataset, lat, lng)
        self.assertIsNotNone(mean)
        self.assertAlmostEqual(2771.0, float(mean), delta=1e-6)
        self.assertAlmostEqual(3.95, celsius_from_raw(float(mean)), delta=1e-6)

    def test_window_wraps_longitude(self) -> None:
        values = np.full((30, 30), 2000, dtype=np.uint16)
        values[:, 20:30] = 3000
        values[:, 0:10] = 1000
        with self._one_band(values, "tas") as dataset:
            lng, lat = dataset.xy(15, 0)
            self.assertEqual((15, 0), dataset.index(lng, lat))
            mean = window_mean_raw(dataset, lat, lng)
        self.assertAlmostEqual(2000.0, float(mean), delta=1e-6)

    def test_outside_latitude_returns_none(self) -> None:
        values = np.full((30, 30), 2771, dtype=np.uint16)
        with self._one_band(values, "tas") as dataset:
            self.assertIsNone(window_mean_raw(dataset, 89.0, 0.0))

    def test_missing_files_are_listed_before_open(self) -> None:
        with self.assertRaises(RuntimeError) as caught:
            open_chelsa_bands(Path(self._temp()))
        message = str(caught.exception)
        self.assertIn("CHELSA_tas_01_1981-2010_V.2.1.tif", message)
        self.assertIn("CHELSA_pr_12_1981-2010_V.2.1.tif", message)

    def test_wrong_scale_is_rejected(self) -> None:
        root = Path(self._temp())
        bad = np.full((30, 30), 2771, dtype=np.uint16)
        write_year(root, tas_01=(bad, "tas", 1.0))
        with self.assertRaises(RuntimeError) as caught:
            open_chelsa_bands(root)
        self.assertIn("CHELSA_tas_01_1981-2010_V.2.1.tif", str(caught.exception))

    def test_width_mismatch_is_rejected(self) -> None:
        root = Path(self._temp())
        wide = np.full((30, 31), 2771, dtype=np.uint16)
        write_year(root, pr_01=(wide, "pr", 0.1))
        with self.assertRaises(RuntimeError) as caught:
            open_chelsa_bands(root)
        self.assertIn("CHELSA_pr_01_1981-2010_V.2.1.tif", str(caught.exception))

    def test_failed_open_releases_handles(self) -> None:
        root = Path(self._temp())
        write_year(root)
        empty = chelsa_month_path(root, "pr", 12)
        empty.write_bytes(b"")
        with self.assertRaises(RuntimeError) as caught:
            open_chelsa_bands(root)
        self.assertIn("CHELSA_pr_12_1981-2010_V.2.1.tif", str(caught.exception))
        write_band(empty, np.full((30, 30), 2771, dtype=np.uint16), "pr")
        bands = open_chelsa_bands(root)
        try:
            self.assertEqual(12, len(bands.temperature))
            self.assertEqual(12, len(bands.precipitation))
        finally:
            bands.close()
        empty.write_bytes(b"")

    def _temp(self) -> str:
        import tempfile

        directory = tempfile.mkdtemp()
        self.addCleanup(lambda: __import__("shutil").rmtree(directory, ignore_errors=True))
        return directory

    def _one_band(self, values: np.ndarray, variable: str):
        root = Path(self._temp())
        path = root / "band.tif"
        write_band(path, values, variable)
        return rasterio.open(path)


if __name__ == "__main__":
    unittest.main()
