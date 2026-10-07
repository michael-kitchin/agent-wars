from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from scripts.naming_pipeline.generate_hex_naming import (
    _init_tables,
    _normalize_water_name,
    _resolve_field_names,
    _validate_inputs,
)
from scripts.naming_pipeline.naming_json_writers import write_strategic_naming_json, write_tactical_naming_json


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

                    UPDATE states_res1 SET country_code = 'XA' WHERE name = 'Beta';
                    UPDATE countries_res1 SET country_code = 'AL' WHERE name = 'Aland';
                    UPDATE cities_res4 SET country_code = 'YL' WHERE name = 'Metro';
                    """
                )
                conn.commit()

                write_strategic_naming_json(conn, ["81003ffffffffff"], out_res1, resolution=1)
                write_tactical_naming_json(conn, ["8400001ffffffff"], out_res4, resolution=4)

                res1 = json.loads(out_res1.read_text(encoding="utf-8"))
                self.assertEqual(1, res1["resolution"])
                self.assertEqual(1, res1["record_count"])
                self.assertEqual(["Beta", "Alpha"], [s["name"] for s in res1["records"][0]["states"]])
                self.assertEqual(["Aland", "Zedland"], [c["name"] for c in res1["records"][0]["countries"]])
                self.assertEqual(["XA", None], [s["country_code"] for s in res1["records"][0]["states"]])
                self.assertEqual(["AL", None], [c["country_code"] for c in res1["records"][0]["countries"]])

                res4 = json.loads(out_res4.read_text(encoding="utf-8"))
                self.assertEqual(4, res4["resolution"])
                self.assertEqual(1, res4["record_count"])
                self.assertEqual(["Acity", "Metro"], [c["name"] for c in res4["records"][0]["cities"]])
                self.assertEqual([None, "YL"], [c["country_code"] for c in res4["records"][0]["cities"]])
                self.assertIn("country_code", res4["records"][0]["states"][0])
                self.assertEqual(["Delta", "Gamma"], [s["name"] for s in res4["records"][0]["states"]])
                self.assertEqual(["Yland"], [c["name"] for c in res4["records"][0]["countries"]])
            finally:
                conn.close()

    def test_water_output_shape_sort_and_dedupe(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            out_res1 = Path(td) / "terrain_res1_naming.json"
            out_res4 = Path(td) / "terrain_res4_naming.json"
            conn = sqlite3.connect(":memory:")
            try:
                _init_tables(conn)
                conn.executescript(
                    """
                    INSERT OR IGNORE INTO water_res1(cell, name, type, scalerank) VALUES
                    ('81003ffffffffff', 'North Pacific Ocean', 'ocean', 0),
                    ('81003ffffffffff', 'Superior', 'lake', 0),
                    ('81003ffffffffff', 'Superior', 'lake', 0),
                    ('81003ffffffffff', 'Small Pond', 'lake', 5);

                    INSERT OR IGNORE INTO water_res4(cell, name, type, scalerank) VALUES
                    ('8400001ffffffff', 'Lake Erie', 'lake', 0),
                    ('8400001ffffffff', 'Lake Erie', 'lake', 0),
                    ('8400001ffffffff', 'Tiny Lake', 'lake', 8);
                    """
                )
                conn.commit()

                write_strategic_naming_json(conn, ["81003ffffffffff"], out_res1, resolution=1)
                write_tactical_naming_json(conn, ["8400001ffffffff"], out_res4, resolution=4)

                res1 = json.loads(out_res1.read_text(encoding="utf-8"))
                water_res1 = res1["records"][0]["water"]
                self.assertEqual(
                    ["North Pacific Ocean", "Superior", "Small Pond"],
                    [w["name"] for w in water_res1],
                )
                self.assertEqual("ocean", water_res1[0]["type"])
                self.assertEqual("lake", water_res1[1]["type"])

                res4 = json.loads(out_res4.read_text(encoding="utf-8"))
                water_res4 = res4["records"][0]["water"]
                self.assertEqual(["Lake Erie", "Tiny Lake"], [w["name"] for w in water_res4])
                self.assertEqual([], res4["records"][0]["cities"])
            finally:
                conn.close()

    def test_normalize_water_name_title_cases_all_caps_only(self) -> None:
        self.assertEqual("Indian Ocean", _normalize_water_name("INDIAN OCEAN"))
        self.assertEqual("Bay of Bengal", _normalize_water_name("BAY OF BENGAL"))
        self.assertEqual("Gulf of St. Lawrence", _normalize_water_name("Gulf of St. Lawrence"))

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

    def test_tactical_writer_records_requested_resolution(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            out_path = Path(td) / "tactical.json"
            conn = sqlite3.connect(":memory:")
            try:
                _init_tables(conn)
                write_tactical_naming_json(conn, ["8600001ffffffff"], out_path, resolution=6)
            finally:
                conn.close()
            payload = json.loads(out_path.read_text(encoding="utf-8"))
            self.assertEqual(6, payload["resolution"])

    def test_unsorted_cells_keep_every_country(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            out_path = Path(td) / "terrain_res_s_naming.json"
            conn = sqlite3.connect(":memory:")
            try:
                _init_tables(conn)
                conn.executescript(
                    """
                    INSERT INTO countries_res1(cell, name, continent, region, population) VALUES
                    ('81003ffffffffff', 'Later', 'A', 'B', 2),
                    ('81001ffffffffff', 'Earlier', 'A', 'B', 1);
                    """
                )
                conn.commit()
                write_strategic_naming_json(
                    conn,
                    ["81003ffffffffff", "81001ffffffffff"],
                    out_path,
                    resolution=1,
                )
            finally:
                conn.close()
            records = json.loads(out_path.read_text(encoding="utf-8"))["records"]
            self.assertEqual(
                [("81001ffffffffff", "Earlier"), ("81003ffffffffff", "Later")],
                [(row["h3_index"], row["countries"][0]["name"]) for row in records],
            )


if __name__ == "__main__":
    unittest.main()
