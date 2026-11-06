"""Contracts for the crossing-cell predicate and the baseline diff check."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import h3

from scripts.terrain_pipeline.antimeridian import crosses_antimeridian
from scripts.terrain_pipeline.antimeridian_qa import METADATA_MASK_FIELDS, diff_records, load_records_by_cell

# A res-4 cell on the 180-degree meridian near Chukotka.
CROSSING_CELL = next(cell for cell in h3.grid_disk(h3.latlng_to_cell(58.04, 179.62, 4), 1) if crosses_antimeridian(cell))

# A res-4 cell in southern Germany, far from the meridian.
ORDINARY_CELL = h3.latlng_to_cell(48.0, 8.0, 4)


def _record(cell: str, **overrides: object) -> dict[str, object]:
    """
    Why this exists:
        Keep diff fixtures small while still holding one mask field and one non-mask field.
    When to use:
        To build before and after records for ``diff_records``.
    What to expect:
        A record for ``cell`` with ``intersects_urban`` False and ``forest_mean`` 0.1, then the overrides.
    """

    record: dict[str, object] = {"h3_index": cell, "intersects_urban": False, "forest_mean": 0.1}
    record.update(overrides)
    return record


class AntimeridianQaTests(unittest.TestCase):
    def _diff(self, after_overrides: dict[str, dict[str, object]]) -> dict[str, object]:
        """
        Why this exists:
            Exercise the file loader and the diff together, as the command line does.
        When to use:
            From each test, with the fields to change per cell in the after file.
        What to expect:
            The ``diff_records`` result for the crossing and ordinary cells with zero extra rings.
        """

        with tempfile.TemporaryDirectory() as folder:
            before_path = Path(folder) / "before.json"
            after_path = Path(folder) / "after.json"
            cells = (CROSSING_CELL, ORDINARY_CELL)
            before_path.write_text(json.dumps({"records": [_record(cell) for cell in cells]}), encoding="utf-8")
            after_records = [_record(cell, **after_overrides.get(cell, {})) for cell in cells]
            after_path.write_text(json.dumps({"records": after_records}), encoding="utf-8")
            return diff_records(load_records_by_cell(before_path), load_records_by_cell(after_path), METADATA_MASK_FIELDS, 0)

    def test_crossing_cell_mask_change_passes(self) -> None:
        result = self._diff({CROSSING_CELL: {"intersects_urban": True}})
        self.assertTrue(result["passed"])
        self.assertEqual(1, result["changed_allowed"])

    def test_ordinary_cell_mask_change_fails(self) -> None:
        result = self._diff({ORDINARY_CELL: {"intersects_urban": True}})
        self.assertFalse(result["passed"])
        self.assertEqual([ORDINARY_CELL], [violation["cell"] for violation in result["violations"]])

    def test_crossing_cell_non_mask_change_fails(self) -> None:
        result = self._diff({CROSSING_CELL: {"forest_mean": 0.2}})
        self.assertFalse(result["passed"])

    def test_pole_cell_does_not_cross(self) -> None:
        self.assertFalse(crosses_antimeridian(h3.latlng_to_cell(90.0, 0.0, 1)))
        self.assertTrue(crosses_antimeridian(CROSSING_CELL))


if __name__ == "__main__":
    unittest.main()
