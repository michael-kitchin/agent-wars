"""Economy assignment writes the manifest blocks and the pack check reads them back."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import h3

from scripts.regional_pipeline.economy_assignment import assign_region_economy
from scripts.regional_pipeline.pack_checks import _economy_results
from scripts.regional_pipeline.region_paths import RegionPaths
from scripts.terrain_pipeline.metadata_io import write_json_document


def _write_fake_region(root: Path, urban_counts: list[int]) -> RegionPaths:
    """
    Why this exists:
        Build a western_europe-shaped pack whose only urban cells are the ones under test.
    When to use:
        Economy assignment and pack-check tests.
    What to expect:
        Six land hexes, three in each of two groups, and one tactical file.
    """

    paths = RegionPaths.for_region("western_europe", root)
    paths.folder.mkdir(parents=True)
    cells = h3.grid_disk(h3.latlng_to_cell(48.8, 2.3, 3), 1)[:6]
    hexes = [
        {"h3_index": cell, "role": "land", "side_group_id": "north" if index < 3 else "south"}
        for index, cell in enumerate(cells)
    ]
    manifest = {
        "schema_version": "1.1.0",
        "region_id": "western_europe",
        "display_name": "Western Europe",
        "res_s": 3,
        "res_t": 6,
        "marker": "keep",
        "scalerank_policy": {"urban_overlay_max": 7},
        "side_groups": [
            {"id": "north", "display_name": "North", "land_hex_count": 3},
            {"id": "south", "display_name": "South", "land_hex_count": 3},
        ],
        "hexes": hexes,
    }
    records = []
    for cell, count in zip(cells, urban_counts, strict=True):
        for child in list(h3.cell_to_children(cell, 6))[:count]:
            records.append(
                {
                    "h3_index": child,
                    "urban_by_scalerank": [{"scalerank": 1, "intersects_urban": True, "all_urban": False}],
                }
            )
    write_json_document(paths.manifest, manifest)
    write_json_document(paths.metadata_t, {"records": records})
    return paths


class EconomyAssignmentTests(unittest.TestCase):
    def test_assign_writes_blocks_and_repeats_byte_for_byte(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            paths = _write_fake_region(root, [1, 1, 1, 1, 1, 1])
            assign_region_economy("western_europe", root)
            written = json.loads(paths.manifest.read_text(encoding="utf-8"))
            self.assertEqual("1.2.0", written["schema_version"])
            self.assertIn("economy", written)
            self.assertIn("side_group_balance", written)
            self.assertEqual("keep", written["marker"])
            self.assertEqual("Western Europe", written["display_name"])
            first_bytes = paths.manifest.read_bytes()
            assign_region_economy("western_europe", root)
            self.assertEqual(first_bytes, paths.manifest.read_bytes())

    def test_check_passes_when_the_stored_economy_matches(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            paths = _write_fake_region(root, [1, 1, 1, 1, 1, 1])
            assign_region_economy("western_europe", root)
            result = _economy_results(paths, "western_europe", root)[0]
            self.assertEqual("PASS", result.status)
            self.assertEqual("economy and side-group balance current", result.detail)

    def test_check_fails_when_infantry_cost_is_edited(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            paths = _write_fake_region(root, [1, 1, 1, 1, 1, 1])
            assign_region_economy("western_europe", root)
            document = json.loads(paths.manifest.read_text(encoding="utf-8"))
            document["economy"]["infantry_cost"] += 1
            write_json_document(paths.manifest, document)
            result = _economy_results(paths, "western_europe", root)[0]
            self.assertEqual("FAIL", result.status)
            self.assertEqual("economy is stale; run npm run regional:economy", result.detail)

    def test_check_fails_when_one_group_is_below_the_band(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            paths = _write_fake_region(root, [1, 1, 1, 20, 20, 20])
            assign_region_economy("western_europe", root)
            result = _economy_results(paths, "western_europe", root)[0]
            self.assertEqual("FAIL", result.status)
            self.assertIn("side groups out of balance", result.detail)
            self.assertIn("north", result.detail)
