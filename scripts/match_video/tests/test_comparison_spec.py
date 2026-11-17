"""Contracts for reading a replay comparison file."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts.match_video.comparison_spec import ComparisonError, layout_replays, load_comparison_spec

_SHIPPED = Path(__file__).resolve().parents[1] / "comparisons" / "world_war_n.json"


def _replay(key: str, **extra: object) -> dict:
    return {
        "key": key,
        "file": f"{key}.mp4",
        "version": f"v-{key}",
        "nickname": key.upper(),
        "turns_shown": 10,
        "legend_width": 400,
        **extra,
    }


def _payload(**overrides: object) -> dict:
    payload = {
        "title": "T",
        "subtitle": "S",
        "replays": [_replay("a"), _replay("b"), _replay("c")],
        "layouts": {"quad": ["a", "b", "c"], "duo": ["c", "a"]},
    }
    payload.update(overrides)
    return payload


class ComparisonSpecTests(unittest.TestCase):
    def setUp(self) -> None:
        self._directory = tempfile.TemporaryDirectory()
        self.addCleanup(self._directory.cleanup)

    def _load(self, payload: dict):
        path = Path(self._directory.name) / "comparison.json"
        path.write_text(json.dumps(payload), encoding="utf-8")
        return load_comparison_spec(path)

    def test_shipped_comparison_fills_both_layouts_in_screen_order(self) -> None:
        spec = load_comparison_spec(_SHIPPED)
        self.assertEqual([replay.key for replay in layout_replays(spec, "quad")], ["v221", "v222", "v300"])
        duo = layout_replays(spec, "duo")
        self.assertEqual([replay.key for replay in duo], ["v221", "v300"])
        self.assertEqual([(mask.x, mask.until_seconds) for mask in duo[1].legend_masks], [(410, 43.1), (428, 44.6)])

    def test_optional_fields_default_to_empty(self) -> None:
        spec = self._load(_payload())
        first = spec.replays[0]
        self.assertEqual((first.note, first.legend_masks, spec.footer), ("", (), ""))

    def test_layout_naming_an_unknown_replay_is_rejected(self) -> None:
        with self.assertRaisesRegex(ComparisonError, "unknown replays: z"):
            self._load(_payload(layouts={"duo": ["a", "z"]}))

    def test_layout_with_the_wrong_replay_count_is_rejected(self) -> None:
        with self.assertRaisesRegex(ComparisonError, "exactly 3"):
            self._load(_payload(layouts={"quad": ["a", "b"]}))

    def test_legend_mask_outside_the_strip_is_rejected(self) -> None:
        replays = [_replay("a", legend_masks=[{"x": 400, "until_seconds": 5}]), _replay("b"), _replay("c")]
        with self.assertRaisesRegex(ComparisonError, r"legend_masks\[0\]\.x"):
            self._load(_payload(replays=replays))

    def test_asking_for_an_undefined_layout_is_reported(self) -> None:
        spec = self._load(_payload(layouts={"duo": ["a", "b"]}))
        with self.assertRaisesRegex(ComparisonError, "no quad layout"):
            layout_replays(spec, "quad")


if __name__ == "__main__":
    unittest.main()
