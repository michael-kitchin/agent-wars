"""Contracts for JSON document comparison."""

from __future__ import annotations

import unittest

from scripts.terrain_pipeline.json_compare_cli import compare_json_documents


class JsonCompareTests(unittest.TestCase):
    def test_nested_timestamp_is_ignored(self) -> None:
        left = {"records": [{"h3_index": "a", "generated_at_utc": "2020-01-01T00:00:00+00:00"}]}
        right = {"records": [{"h3_index": "a", "generated_at_utc": "2024-06-01T00:00:00+00:00"}]}
        self.assertEqual(
            [],
            compare_json_documents(left, right, frozenset({"generated_at_utc"})),
        )

    def test_changed_nested_value_reports_path(self) -> None:
        left = {"records": [{"water_edges": 1}, {"water_edges": 2}]}
        right = {"records": [{"water_edges": 1}, {"water_edges": 3}]}
        differences = compare_json_documents(left, right, frozenset())
        self.assertIn("records[1].water_edges", differences)


if __name__ == "__main__":
    unittest.main()
