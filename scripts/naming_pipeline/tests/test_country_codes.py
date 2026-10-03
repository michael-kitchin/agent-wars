from __future__ import annotations

import unittest

from scripts.naming_pipeline.country_codes import (
    build_country_code_by_adm0_a3,
    normalize_iso_a2,
    resolve_country_code,
)


class CountryCodesTests(unittest.TestCase):
    def test_normalize_iso_a2(self) -> None:
        self.assertEqual("FR", normalize_iso_a2(" fr "))
        self.assertIsNone(normalize_iso_a2("-99"))
        self.assertIsNone(normalize_iso_a2("ABC"))
        self.assertIsNone(normalize_iso_a2(None))

    def test_build_prefers_iso_a2_eh_and_keeps_missing_codes(self) -> None:
        code_by_adm0_a3 = build_country_code_by_adm0_a3(
            [
                ("FRA", "FR", "-99"),
                ("SOL", "-99", "-99"),
                ("DEU", "-99", "DE"),
            ]
        )
        self.assertEqual({"FRA": "FR", "SOL": None, "DEU": "DE"}, code_by_adm0_a3)

    def test_resolve_country_code(self) -> None:
        code_by_adm0_a3 = {"FRA": "FR", "SOL": None}
        self.assertEqual("FR", resolve_country_code("FRA", "XX", code_by_adm0_a3))
        self.assertIsNone(resolve_country_code("SOL", "SO", code_by_adm0_a3))
        self.assertEqual("SJ", resolve_country_code("SJM", "sj", code_by_adm0_a3))


if __name__ == "__main__":
    unittest.main()
