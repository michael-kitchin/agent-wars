from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from scripts.naming_pipeline.generate_hex_naming import (
    _init_tables,
    _resolve_field_names,
    _validate_inputs,
    _write_res1_json,
    _write_res4_json,
)


class GenerateHexNamingTests(unittest.TestCase):
    def test_res1_and_res4_output_shapes_sort_and_dedupe(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            out_res1 = Path(td) / "terrain_res1_naming.json"
            out_res4 = Path(td) / "terrain_res4_naming.json"
            conn = sqlite3.connect(":memory:")
            try:
                _init_tables(conn)
                conn.executescript(
                    """
                    INSERT OR IGNORE INTO states_res1(cell, name, country, scalerank) VALUES
                    ('81003ffffffffff', 'Alpha', 'X', 2),
                    ('81003ffffffffff', 'Alpha', 'X', 2),
                    ('81003ffffffffff', 'Beta', 'X', 1);

                    INSERT OR IGNORE INTO countries_res1(cell, name, continent, region, population) VALUES
                    ('81003ffffffffff', 'Zedland', 'A', 'B', 1000),
                    ('81003ffffffffff', 'Aland', 'A', 'B', 500);

                    INSERT OR IGNORE INTO states_res4(cell, name, country, scalerank) VALUES
                    ('8400001ffffffff', 'Gamma', 'Y', 3),
                    ('8400001ffffffff', 'Delta', 'Y', 1);

                    INSERT OR IGNORE INTO countries_res4(cell, name, continent, region, population) VALUES
                    ('8400001ffffffff', 'Yland', 'C', 'D', 2000);

                    INSERT OR IGNORE INTO cities_res4(cell, name, state, country, population, scalerank) VALUES
                    ('8400001ffffffff', 'Metro', 'Delta', 'Yland', 900000, 2),
                    ('8400001ffffffff', 'Acity', 'Delta', 'Yland', 100000, 1),
                    ('8400001ffffffff', 'Acity', 'Delta', 'Yland', 100000, 1);
                    """
                )
                conn.commit()

                _write_res1_json(conn, ["81003ffffffffff"], out_res1)
                _write_res4_json(conn, ["8400001ffffffff"], out_res4)

                res1 = json.loads(out_res1.read_text(encoding="utf-8"))
                self.assertEqual(1, res1["resolution"])
                self.assertEqual(1, res1["record_count"])
                self.assertEqual(["Beta", "Alpha"], [s["name"] for s in res1["records"][0]["states"]])
                self.assertEqual(["Aland", "Zedland"], [c["name"] for c in res1["records"][0]["countries"]])

                res4 = json.loads(out_res4.read_text(encoding="utf-8"))
                self.assertEqual(4, res4["resolution"])
                self.assertEqual(1, res4["record_count"])
                self.assertEqual(["Acity", "Metro"], [c["name"] for c in res4["records"][0]["cities"]])
                self.assertEqual(["Delta", "Gamma"], [s["name"] for s in res4["records"][0]["states"]])
                self.assertEqual(["Yland"], [c["name"] for c in res4["records"][0]["countries"]])
            finally:
                conn.close()

    def test_validate_inputs_fails_when_shapefiles_missing(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            with self.assertRaises(FileNotFoundError):
                _validate_inputs(Path(td))

    def test_resolve_field_names_matches_case_insensitively(self) -> None:
        schema_props = {"NAME": "str", "POP_EST": "float", "continent": "str", "SUBREGION": "str"}
        resolved = _resolve_field_names(schema_props, ("name", "pop_est", "continent", "subregion"))
        self.assertEqual("NAME", resolved["name"])
        self.assertEqual("POP_EST", resolved["pop_est"])
        self.assertEqual("continent", resolved["continent"])
        self.assertEqual("SUBREGION", resolved["subregion"])


if __name__ == "__main__":
    unittest.main()
