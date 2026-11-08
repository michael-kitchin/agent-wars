"""Contracts for month classification, neighbor fill, and CHELSA unit conversion."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import h3
import numpy as np

from scripts.weather_pipeline.chelsa_source import chelsa_month_path
from scripts.weather_pipeline.tests.test_chelsa_source import write_band
from scripts.weather_pipeline.weather_pack import (
    build_weather_payload,
    classify_month,
    mild_year,
    nearest_sampled_months,
    write_weather_pack,
)


class WeatherPackTests(unittest.TestCase):
    def test_classify_month_boundaries(self) -> None:
        self.assertEqual({"display": "snow", "countsAsHeat": False}, classify_month(0.0, 10.0))
        self.assertEqual({"display": "rain", "countsAsHeat": True}, classify_month(25.0, 130.0))
        self.assertEqual({"display": "heat", "countsAsHeat": True}, classify_month(23.0, 10.0))
        self.assertEqual({"display": "mild", "countsAsHeat": False}, classify_month(15.0, 10.0))

    def test_nearest_sampled_months_respects_step_limit(self) -> None:
        origin = h3.latlng_to_cell(0.0, 0.0, 1)
        land_cell = next(iter(h3.grid_ring(origin, 3)))
        land_year = [{"display": "heat", "countsAsHeat": True} for _ in range(12)]
        found = nearest_sampled_months(origin, {land_cell: land_year}, 3)
        missed = nearest_sampled_months(origin, {land_cell: land_year}, 2)
        self.assertEqual(land_year, found)
        self.assertEqual(mild_year(), missed)

    def test_water_hex_is_sampled_and_missing_year_copies_neighbor(self) -> None:
        origin = h3.latlng_to_cell(0.0, 0.0, 1)
        neighbor = next(iter(h3.grid_ring(origin, 1)))
        heat_year = [{"display": "heat", "countsAsHeat": True} for _ in range(12)]

        def sample_year_at(lat: float, lng: float) -> list[dict[str, object]] | None:
            if h3.latlng_to_cell(lat, lng, 1) == origin:
                return None
            return heat_year

        payload = build_weather_payload(
            [{"h3_index": origin}, {"h3_index": neighbor, "all_water": True}],
            sample_year_at,
            2,
        )
        by_index = {record["h3Index"]: record["months"] for record in payload["records"]}
        self.assertEqual(heat_year, by_index[origin])
        self.assertEqual(heat_year, by_index[neighbor])

    def test_missing_year_without_neighbor_is_mild(self) -> None:
        origin = h3.latlng_to_cell(0.0, 0.0, 1)
        payload = build_weather_payload([{"h3_index": origin}], lambda _lat, _lng: None, 2)
        self.assertEqual(mild_year(), payload["records"][0]["months"])

    def test_write_weather_pack_uses_month_order_and_units(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for month in range(1, 13):
                temperature = 2631 if month == 1 else 3031 if month == 7 else 2881
                precipitation = 500 if month == 7 else 100
                write_band(
                    chelsa_month_path(root, "tas", month),
                    np.full((30, 30), temperature, dtype=np.uint16),
                    "tas",
                )
                write_band(
                    chelsa_month_path(root, "pr", month),
                    np.full((30, 30), precipitation, dtype=np.uint16),
                    "pr",
                )
            cell = h3.latlng_to_cell(15.0, 15.0, 1)
            metadata_path = root / "metadata.json"
            output_path = root / "weather.json"
            metadata_path.write_text(json.dumps({"records": [{"h3_index": cell}]}), encoding="utf-8")
            write_weather_pack(metadata_path, output_path, 2, root)
            months = json.loads(output_path.read_text(encoding="utf-8"))["records"][0]["months"]
        self.assertEqual({"display": "snow", "countsAsHeat": False}, months[0])
        self.assertEqual({"display": "mild", "countsAsHeat": False}, months[1])
        self.assertEqual({"display": "heat", "countsAsHeat": True}, months[6])


if __name__ == "__main__":
    unittest.main()
