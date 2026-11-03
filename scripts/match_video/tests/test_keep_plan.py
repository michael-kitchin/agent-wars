"""Contracts for keeping a short head of each frozen stretch."""

from __future__ import annotations

import unittest
from fractions import Fraction

from scripts.match_video.keep_plan import (
    FreezeEvent,
    TimeSpan,
    build_keep_intervals,
    build_keep_filter,
    covers_full_timeline,
    finish_freezes,
    parse_freezedetect_log,
    span_seconds,
)


def _spans(actual: list[TimeSpan]) -> list[tuple[float, float]]:
    return [(span.start_seconds, span.end_seconds) for span in actual]


class KeepPlanTests(unittest.TestCase):
    def test_parse_reads_a_closed_freeze_and_an_open_one(self) -> None:
        log = "\n".join([
            "[freezedetect] lavfi.freezedetect.freeze_start: 0",
            "[freezedetect] lavfi.freezedetect.freeze_duration: 5",
            "[freezedetect] lavfi.freezedetect.freeze_end: 5",
            "[freezedetect] lavfi.freezedetect.freeze_start: 8.5",
        ])
        events = parse_freezedetect_log(log)
        self.assertEqual(events, [FreezeEvent(0.0, 5.0), FreezeEvent(8.5, None)])

    def test_open_freeze_closes_at_the_end_of_the_file(self) -> None:
        spans = finish_freezes([FreezeEvent(1.0, None)], 4.0)
        self.assertEqual(spans, [TimeSpan(1.0, 4.0)])

    def test_middle_freeze_keeps_one_second_then_the_following_motion(self) -> None:
        spans = build_keep_intervals(6.0, [TimeSpan(0.0, 5.0)], 1.0, 0.1)
        self.assertEqual(_spans(spans), [(0.0, 1.0), (5.0, 6.0)])
        self.assertAlmostEqual(span_seconds(spans), 2.0)
        self.assertFalse(covers_full_timeline(spans, 6.0, 0.1))

    def test_two_freezes_keep_motion_between_them(self) -> None:
        freezes = [TimeSpan(2.0, 10.0), TimeSpan(12.0, 18.0)]
        spans = build_keep_intervals(20.0, freezes, 1.0, 0.1)
        self.assertEqual(_spans(spans), [(0.0, 3.0), (10.0, 13.0), (18.0, 20.0)])

    def test_zero_buffer_drops_the_frozen_stretch(self) -> None:
        spans = build_keep_intervals(10.0, [TimeSpan(2.0, 8.0)], 0.0, 0.1)
        self.assertEqual(_spans(spans), [(0.0, 2.0), (8.0, 10.0)])

    def test_fully_frozen_video_keeps_the_buffer_or_one_frame(self) -> None:
        frozen = [TimeSpan(0.0, 4.0)]
        self.assertEqual(_spans(build_keep_intervals(4.0, frozen, 1.0, 0.1)), [(0.0, 1.0)])
        self.assertEqual(_spans(build_keep_intervals(4.0, frozen, 0.0, 0.1)), [(0.0, 0.1)])

    def test_short_freeze_stays_in_a_full_timeline_copy(self) -> None:
        spans = build_keep_intervals(10.0, [TimeSpan(2.0, 2.4)], 1.0, 0.1)
        self.assertTrue(covers_full_timeline(spans, 10.0, 0.1))

    def test_no_freezes_keep_the_whole_timeline(self) -> None:
        spans = build_keep_intervals(10.0, [], 1.0, 0.1)
        self.assertEqual(_spans(spans), [(0.0, 10.0)])

    def test_keep_filter_trims_each_span_and_pads_the_final_frame(self) -> None:
        graph = build_keep_filter(
            [TimeSpan(0.0, 1.0), TimeSpan(5.0, 6.0)],
            Fraction(10, 1),
            6.0,
        )
        self.assertIn("trim=start=0.000000:end=1.000000", graph)
        self.assertIn("trim=start=5.000000:end=6.100000", graph)
        self.assertIn("concat=n=2:v=1:a=0", graph)
        self.assertIn("setpts=N/(10.0000000000*TB)[out]", graph)

    def test_long_plan_stays_a_concat_graph(self) -> None:
        spans = [TimeSpan(float(index), float(index) + 0.4) for index in range(200)]
        graph = build_keep_filter(spans, Fraction(10, 1), 200.0)
        self.assertIn("concat=n=200:v=1:a=0", graph)
        self.assertNotIn("select=", graph)

    def test_bad_duration_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            build_keep_intervals(0.0, [], 1.0, 0.1)


if __name__ == "__main__":
    unittest.main()
