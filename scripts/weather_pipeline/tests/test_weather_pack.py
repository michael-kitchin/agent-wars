"""Contracts for month classification and the water-to-land search."""

from __future__ import annotations

import unittest

import h3

from scripts.weather_pipeline.weather_pack import classify_month, mild_year, nearest_land_months


class WeatherPackTests(unittest.TestCase):
    def test_classify_month_boundaries(self) -> None:
        self.assertEqual({"display": "snow", "countsAsHeat": False}, classify_month(0.0, 10.0))
        self.assertEqual({"display": "rain", "countsAsHeat": True}, classify_month(25.0, 130.0))
        self.assertEqual({"display": "heat", "countsAsHeat": True}, classify_month(23.0, 10.0))
        self.assertEqual({"display": "mild", "countsAsHeat": False}, classify_month(15.0, 10.0))

    def test_nearest_land_months_respects_step_limit(self) -> None:
        origin = h3.latlng_to_cell(0.0, 0.0, 1)
        land_cell = next(iter(h3.grid_ring(origin, 3)))
        land_year = [{"display": "heat", "countsAsHeat": True} for _ in range(12)]
        found = nearest_land_months(origin, {land_cell: land_year}, 3)
        missed = nearest_land_months(origin, {land_cell: land_year}, 2)
        self.assertEqual(land_year, found)
        self.assertEqual(mild_year(), missed)


if __name__ == "__main__":
    unittest.main()
