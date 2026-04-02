from __future__ import annotations

import unittest
from dataclasses import asdict
from scripts.terrain_pipeline.metadata_io import (
    record_res1_to_json_dict,
    record_res4_to_json_dict,
)
from scripts.terrain_pipeline.metadata_models import HexMetadataRecordRes1, HexMetadataRecordRes4


class MetadataIoTests(unittest.TestCase):
    def test_res1_dict_excludes_urban_keys(self) -> None:
        r = HexMetadataRecordRes1(
            h3_index="8a1fb46622dffff",
            total_edges=6,
            all_water=False,
            intersects_water=True,
            water_edges=2,
            arctic_mean=None,
            forest_mean=1.0,
            desert_mean=None,
            tri_mean=None,
            slope_mean=None,
            elevation_max=None,
        )
        d = record_res1_to_json_dict(r)
        for k in ("all_urban", "intersects_urban", "urban_edges", "urban_by_scalerank"):
            self.assertNotIn(k, d)
        self.assertEqual(0, d["airport_count_total"])
        self.assertEqual(0, d["seaport_count_total"])
        self.assertEqual([], d["airport_count_by_scalerank"])
        self.assertEqual([], d["seaport_count_by_scalerank"])

    def test_res4_dict_includes_urban_keys(self) -> None:
        base = HexMetadataRecordRes1(
            h3_index="8a1fb46622dffff",
            total_edges=6,
            all_water=False,
            intersects_water=True,
            water_edges=2,
            arctic_mean=None,
            forest_mean=None,
            desert_mean=None,
            tri_mean=None,
            slope_mean=None,
            elevation_max=None,
        )
        r4 = HexMetadataRecordRes4(
            **asdict(base),
            all_urban=False,
            intersects_urban=True,
            urban_edges=1,
        )
        d = record_res4_to_json_dict(r4)
        self.assertIn("all_urban", d)
        self.assertIn("intersects_urban", d)
        self.assertIn("urban_edges", d)
        self.assertIn("urban_by_scalerank", d)
        self.assertEqual([], d["urban_by_scalerank"])

if __name__ == "__main__":
    unittest.main()
