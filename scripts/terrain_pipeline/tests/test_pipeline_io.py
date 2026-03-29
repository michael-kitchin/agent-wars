from __future__ import annotations

import csv
import tempfile
import unittest
from pathlib import Path

from scripts.terrain_pipeline.config import build_default_config
from scripts.terrain_pipeline.pipeline import TerrainPipeline, TerrainRecord


class PipelineIoTests(unittest.TestCase):
    def test_exception_csv_schema_and_values(self) -> None:
        cfg = build_default_config()
        with tempfile.TemporaryDirectory() as td:
            cfg = type(cfg)(
                **{
                    **cfg.__dict__,
                    "output_dir": Path(td),
                    "qa_dir": Path(td) / "qa",
                }
            )
            pipeline = TerrainPipeline(cfg)
            rows = [
                TerrainRecord(
                    h3_index="8410001ffffffff",
                    parent_h3="81103ffffffffff",
                    terrain="forest",
                    parent_terrain="plains",
                )
            ]
            pipeline._write_exceptions_csv(rows)
            out = cfg.output_dir / cfg.exceptions_csv_filename
            self.assertTrue(out.exists())
            with out.open("r", encoding="utf-8", newline="") as f:
                reader = csv.DictReader(f)
                got = list(reader)
            self.assertEqual(["h3_index", "parent_h3", "terrain", "parent_terrain"], reader.fieldnames)
            self.assertEqual("forest", got[0]["terrain"])
            self.assertEqual("plains", got[0]["parent_terrain"])


if __name__ == "__main__":
    unittest.main()

