"""Contracts for the regional economy and side-group balance formulas."""

from __future__ import annotations

import unittest

from scripts.regional_pipeline.regional_economy import (
    balance_to_json,
    compute_regional_economy,
    compute_side_group_balance,
    economy_to_json,
    infantry_cost_from_raw,
    round_half_up,
    share_matched_threshold,
)


class RegionalEconomyTests(unittest.TestCase):
    def test_golden_rows(self) -> None:
        rows = (
            ([1, 1, 2, 3, 5, 8, 13, 21, 34, 55], 0.9668, (19, 38, 95, 57), (2, 4, 9, 22), 9),
            (list(range(2, 41, 2)), 1.7288, (35, 70, 175, 105), (5, 17, 23, 31), 16),
            ([1, 1, 1, 1, 1], 0.0740, (1, 2, 5, 3), (1, 1, 1, 1), 1),
            ([8] * 10, 0.5917, (12, 24, 60, 36), (1, 1, 1, 1), 5),
        )
        for values, scale, prices, minimums, strike in rows:
            economy = compute_regional_economy(values)
            self.assertAlmostEqual(scale, economy.scale, places=4)
            self.assertEqual(prices, (economy.infantry_cost, economy.armor_cost, economy.naval_cost, economy.air_cost))
            self.assertEqual(
                minimums,
                (
                    economy.armor_min_urban_cells,
                    economy.air_min_urban_cells,
                    economy.naval_min_urban_cells,
                    economy.advanced_min_urban_cells,
                ),
            )
            self.assertEqual(strike, economy.strategic_strike_urban_cells)

    def test_threshold_ties_keep_the_smaller_gate(self) -> None:
        self.assertEqual(3, share_matched_threshold([1, 2, 3, 4], 0.5))
        self.assertEqual(1, share_matched_threshold([1, 1, 2, 2], 0.75))
        self.assertEqual(4, share_matched_threshold([1, 2, 3, 4], 0.25))

    def test_half_up_rounding(self) -> None:
        self.assertEqual(3, round_half_up(2.5))
        self.assertEqual(4, round_half_up(3.5))
        self.assertEqual(25, infantry_cost_from_raw(22.5))

    def test_fewer_than_five_producing_hexes_raises(self) -> None:
        with self.assertRaises(ValueError):
            compute_regional_economy([1, 2, 3, 4])

    def test_balance_bands(self) -> None:
        passing = compute_side_group_balance({"a": 30, "b": 30, "c": 40}, ["a", "b", "c"])
        self.assertTrue(passing.within_tolerance)
        self.assertEqual((0.9, 0.9, 1.2), tuple(round(group.ratio_to_fair_share, 10) for group in passing.groups))

        failing = compute_side_group_balance({"a": 20, "b": 40, "c": 40}, ["a", "b", "c"])
        self.assertFalse(failing.within_tolerance)
        self.assertEqual((False, True, True), tuple(group.within_tolerance for group in failing.groups))

        edges = compute_side_group_balance({"a": 25, "b": 15}, ["a", "b"])
        self.assertTrue(edges.within_tolerance)
        self.assertEqual((1.25, 0.75), tuple(group.ratio_to_fair_share for group in edges.groups))

    def test_economy_json_uses_the_manifest_keys(self) -> None:
        economy = compute_regional_economy([1, 1, 2, 3, 5, 8, 13, 21, 34, 55])
        document = economy_to_json(economy, 7)
        self.assertEqual(
            {
                "method_version",
                "urban_overlay_max",
                "producing_hex_count",
                "urban_cell_count",
                "median_urban_cells_per_producing_hex",
                "scale",
                "infantry_cost",
                "armor_cost",
                "naval_cost",
                "air_cost",
                "armor_min_urban_cells",
                "air_min_urban_cells",
                "naval_min_urban_cells",
                "advanced_min_urban_cells",
                "strategic_strike_urban_cells",
            },
            set(document),
        )
        self.assertEqual(1, document["method_version"])
        balance = balance_to_json(compute_side_group_balance({"a": 25, "b": 15}, ["a", "b"]), 0.25)
        self.assertEqual({"tolerance", "within_tolerance", "groups"}, set(balance))


if __name__ == "__main__":
    unittest.main()
