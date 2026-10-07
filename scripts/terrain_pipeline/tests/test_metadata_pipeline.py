from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scripts.terrain_pipeline.config import ClassifierThresholds, InputRasterSet, PipelineConfig
from scripts.terrain_pipeline.metadata_export_core import load_metadata_mask_sources, open_metadata_rasters
from scripts.terrain_pipeline.metadata_pipeline import TerrainMetadataExporter, compose_forest_mean


class MetadataForestMeanTests(unittest.TestCase):
    def test_compose_forest_mean_all_none(self) -> None:
        sampled = {f"class_{i}": None for i in range(1, 13)}
        self.assertIsNone(compose_forest_mean(sampled))

    def test_compose_forest_mean_sums_partial(self) -> None:
        sampled = {
            "class_1": 10.0,
            "class_2": None,
            "class_3": 5.0,
            "class_4": None,
        }
        self.assertEqual(15.0, compose_forest_mean(sampled))


class MetadataPipelineFailureTests(unittest.TestCase):
    def test_missing_water_shapefile_fails(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            cfg = PipelineConfig(input_rasters=InputRasterSet(root=Path(td)))
            with self.assertRaises(FileNotFoundError):
                load_metadata_mask_sources(cfg)

    def test_missing_raster_fails(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            cfg = PipelineConfig(input_rasters=InputRasterSet(root=Path(td)))
            with self.assertLogs("scripts.terrain_pipeline.metadata_export_core", level="ERROR"):
                with self.assertRaises(Exception):
                    open_metadata_rasters(cfg)

    def test_invalid_thresholds_fail_fast(self) -> None:
        cfg = PipelineConfig(
            thresholds=ClassifierThresholds(arctic_dominant_min=float("nan")),
        )
        exporter = TerrainMetadataExporter(cfg)
        with self.assertRaises(ValueError):
            exporter.validate_threshold_contract()


if __name__ == "__main__":
    unittest.main()
