"""Side-group matching for the splits named in the region summary."""

from __future__ import annotations

import unittest

from scripts.regional_pipeline.region_catalog import REGION_DEFINITIONS
from scripts.regional_pipeline.side_group_catalog import SIDE_GROUP_RULES, AdminArea, origin_identity, side_group_for


def _area(**kwargs: object) -> AdminArea:
    values = {
        "adm0_a3": "CHN",
        "iso_3166_2": None,
        "name": "Test",
        "region": None,
        "region_sub": None,
        "latitude": 0.0,
        "longitude": 0.0,
        "country_code": "CN",
    }
    values.update(kwargs)
    return AdminArea(**values)  # type: ignore[arg-type]


class SideGroupCatalogTests(unittest.TestCase):
    def test_every_region_has_rules(self) -> None:
        self.assertEqual({region.region_id for region in REGION_DEFINITIONS}, set(SIDE_GROUP_RULES))

    def test_china_provinces_without_a_region_join_south_east_china(self) -> None:
        fujian = _area(name="Fujian", latitude=26.4, longitude=118.0, iso_3166_2="CN-FJ")
        paracel = _area(name="Paracel Islands", latitude=15.8, longitude=111.2, iso_3166_2="CN-X01~")
        self.assertEqual("south_east_china_taiwan", side_group_for("eastern_asia", fujian).group_id)
        self.assertEqual("south_east_china_taiwan", side_group_for("eastern_asia", paracel).group_id)

    def test_turkey_and_uzbekistan_use_the_named_meridians(self) -> None:
        west = _area(adm0_a3="TUR", country_code="TR", longitude=30.0, name="Izmir")
        east = _area(adm0_a3="TUR", country_code="TR", longitude=40.0, name="Van")
        self.assertEqual("western_turkey", side_group_for("western_asia_north", west).group_id)
        self.assertEqual("eastern_turkey_caucasus", side_group_for("western_asia_north", east).group_id)
        eastern_uzb = _area(adm0_a3="UZB", country_code="UZ", longitude=70.0, name="Andijan")
        western_uzb = _area(adm0_a3="UZB", country_code="UZ", longitude=60.0, name="Bukhara")
        self.assertEqual("tashkent_ferghana_tajikistan", side_group_for("central_asia", eastern_uzb).group_id)
        self.assertEqual("western_uzbekistan_turkmenistan", side_group_for("central_asia", western_uzb).group_id)

    def test_rules_with_one_group_id_share_a_display_name(self) -> None:
        for region_id, rules in SIDE_GROUP_RULES.items():
            names: dict[str, str] = {}
            for rule in rules:
                previous = names.get(rule.group_id)
                if previous is None:
                    names[rule.group_id] = rule.display_name
                    continue
                self.assertEqual(previous, rule.display_name, region_id)

    def test_kyrgyzstan_splits_on_the_named_provinces(self) -> None:
        chui = _area(adm0_a3="KGZ", country_code="KG", iso_3166_2="KG-C", name="Chuy")
        osh = _area(adm0_a3="KGZ", country_code="KG", iso_3166_2="KG-O", name="Osh")
        self.assertEqual("kazakhstan_northern_kyrgyzstan", side_group_for("central_asia", chui).group_id)
        self.assertEqual("tashkent_ferghana_tajikistan", side_group_for("central_asia", osh).group_id)

    def test_region_origin_id_uses_the_country_code_and_region_name(self) -> None:
        catalonia = _area(adm0_a3="ESP", country_code="ES", region="Cataluña", name="Barcelona", iso_3166_2="ES-B")
        origin_id, display_name, iso_code = origin_identity("southern_europe", catalonia)
        self.assertEqual("ES:Cataluña", origin_id)
        self.assertEqual("Cataluña", display_name)
        self.assertIsNone(iso_code)
