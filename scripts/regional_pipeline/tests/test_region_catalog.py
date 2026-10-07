"""Catalog size, resolution pairs, and member filters."""

from __future__ import annotations

import re
import unittest

from scripts.regional_pipeline.region_catalog import REGION_DEFINITIONS, region_by_id

_ID_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")


class RegionCatalogTests(unittest.TestCase):
    def test_catalog_has_twenty_three_unique_ids(self) -> None:
        ids = [region.region_id for region in REGION_DEFINITIONS]
        self.assertEqual(23, len(ids))
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(all(_ID_PATTERN.fullmatch(region_id) for region_id in ids))

    def test_resolution_pairs_are_strategic_and_tactical(self) -> None:
        for region in REGION_DEFINITIONS:
            self.assertIn((region.strategic_resolution, region.tactical_resolution), {(2, 5), (3, 6)})

    def test_spot_targets_match_the_catalog(self) -> None:
        western = region_by_id("western_europe").targets
        self.assertEqual((136, 38, 91), (western.land, western.sea, western.neutral_border))
        caribbean = region_by_id("caribbean").targets
        self.assertEqual((120, 165, 0), (caribbean.land, caribbean.sea, caribbean.neutral_border))
        eastern = region_by_id("eastern_europe").targets
        self.assertEqual((308, 42, 0), (eastern.land, eastern.sea, eastern.neutral_border))

    def test_no_member_sets_both_include_and_exclude(self) -> None:
        for region in REGION_DEFINITIONS:
            for member in region.members:
                self.assertFalse(member.include_admin1 and member.exclude_admin1)
