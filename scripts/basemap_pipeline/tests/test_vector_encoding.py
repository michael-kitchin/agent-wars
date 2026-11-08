"""Contracts for the shared vector encoding."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts.basemap_pipeline.vector_encoding import (
    cell_key,
    quantize_degrees,
    quantize_part,
    write_vector_document,
)

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "vector_encoding_golden.json"


class VectorEncodingTests(unittest.TestCase):
    def test_fixture_parts_and_keys(self) -> None:
        document = json.loads(FIXTURE.read_text(encoding="utf-8"))
        self.assertEqual(
            document["note"],
            "Test fixture for the vector encoding contract; values are synthetic.",
        )
        for part in document["parts"]:
            points = [tuple(pair) for pair in part["points_lonlat"]]
            self.assertEqual(part["encoded"], quantize_part(points))
        for lat, lng, cell_deg, key in document["cells"]:
            self.assertEqual(key, cell_key(lat, lng, cell_deg))

    def test_negative_half_quantizes_away_from_zero(self) -> None:
        self.assertEqual(-1, quantize_degrees(-0.000005))

    def test_write_is_deterministic(self) -> None:
        document = {"schema_version": "1.0.0", "kind": "coastlines", "lods": []}
        with tempfile.TemporaryDirectory() as tmp:
            first = Path(tmp) / "a.zip"
            second = Path(tmp) / "b.zip"
            self.assertGreater(write_vector_document(first, "coastlines", document), 0)
            write_vector_document(second, "coastlines", document)
            self.assertEqual(first.read_bytes(), second.read_bytes())
