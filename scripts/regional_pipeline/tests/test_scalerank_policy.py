"""Scalerank ceilings for tactical resolutions 4, 5, and 6."""

from __future__ import annotations

import unittest

from scripts.regional_pipeline.scalerank_policy import policy_for_tactical_resolution


class ScalerankPolicyTests(unittest.TestCase):
    def test_known_resolutions_match_the_table(self) -> None:
        res4 = policy_for_tactical_resolution(4)
        self.assertEqual((4, 4, 5, 5, 5, 6), (
            res4.road_max, res4.rail_max, res4.urban_overlay_max,
            res4.major_airport_max, res4.major_seaport_max, res4.city_label_max,
        ))
        res5 = policy_for_tactical_resolution(5)
        self.assertEqual((6, 6, 6, 6, 6, 7), (
            res5.road_max, res5.rail_max, res5.urban_overlay_max,
            res5.major_airport_max, res5.major_seaport_max, res5.city_label_max,
        ))
        res6 = policy_for_tactical_resolution(6)
        self.assertEqual((8, 8, 7, 8, 8, 8), (
            res6.road_max, res6.rail_max, res6.urban_overlay_max,
            res6.major_airport_max, res6.major_seaport_max, res6.city_label_max,
        ))

    def test_unknown_resolution_raises(self) -> None:
        with self.assertRaises(ValueError):
            policy_for_tactical_resolution(7)
