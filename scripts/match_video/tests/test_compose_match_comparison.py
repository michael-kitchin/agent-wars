"""Contracts for composing match replays side by side."""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from scripts.match_video.comparison_graph import LayoutRequest, RenderWindow, build_comparison_plan
from scripts.match_video.comparison_spec import load_comparison_spec
from scripts.match_video.compose_match_comparison import main
from scripts.match_video.ffmpeg_io import probe_video, resolve_tools

_HAS_FFMPEG = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None
_SHIPPED = Path(__file__).resolve().parents[1] / "comparisons" / "world_war_n.json"
_SHIPPED_SHIFTED = Path(__file__).resolve().parents[1] / "comparisons" / "one_hundred_months.json"


class ComparisonPlanTests(unittest.TestCase):
    def setUp(self) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.panel_dir = Path(directory.name)
        self.spec = load_comparison_spec(_SHIPPED)

    def _plan(self, layout: str, window: RenderWindow):
        return build_comparison_plan(LayoutRequest(self.spec, layout, Path("replays"), self.panel_dir, window))

    def test_quad_reads_three_replays_for_the_window_and_draws_four_panels(self) -> None:
        plan = self._plan("quad", RenderWindow(0.0, 45.0, None, False))
        replay_inputs = [arg for arg in plan.input_args if arg.endswith(".mp4")]
        self.assertEqual(len(replay_inputs), 3)
        self.assertEqual(plan.input_args[:4], ("-t", "45.000", "-i", str(Path("replays") / "2026-11-09_19-59-16.condensed.mp4")))
        self.assertEqual(len(list(self.panel_dir.glob("*.png"))), 4)
        self.assertNotIn("fade=", plan.filter_graph)
        self.assertTrue(plan.filter_graph.endswith("format=yuv420p[out]"))

    def test_legend_masks_follow_the_replay_clock(self) -> None:
        from_start = self._plan("duo", RenderWindow(0.0, 90.0, None, True)).filter_graph
        self.assertIn("enable='lt(t,43.100)'", from_start)
        self.assertIn("enable='lt(t,44.600)'", from_start)
        offset = self._plan("duo", RenderWindow(44.0, 10.0, None, True)).filter_graph
        self.assertNotIn("drawbox=x=410", offset)
        self.assertIn("enable='lt(t,0.600)'", offset)
        early_still = self._plan("duo", RenderWindow(0.0, 0.0, 20.0, False)).filter_graph
        self.assertIn("drawbox=x=410", early_still)
        self.assertNotIn("enable=", early_still)
        late_still = self._plan("duo", RenderWindow(0.0, 0.0, 60.0, False)).filter_graph
        self.assertNotIn("drawbox=x=410", late_still)

    def test_editor_export_capture_shifts_the_crops_and_holds_the_finished_toolbar(self) -> None:
        self.spec = load_comparison_spec(_SHIPPED_SHIFTED)
        video = self._plan("quad", RenderWindow(0.0, 93.0, None, True)).filter_graph
        self.assertIn("crop=1716:966:126:84,scale=960:540", video)
        self.assertIn("crop=437:26:138:48,", video)
        self.assertIn("crop=146:40:1676:41,", video)
        self.assertEqual(video.count(",trim=end=89.200["), 2)
        still = self._plan("quad", RenderWindow(0.0, 0.0, 60.0, False)).filter_graph
        self.assertNotIn("trim=", still)

    def test_video_fades_out_over_its_last_moments(self) -> None:
        plan = self._plan("duo", RenderWindow(0.0, 90.0, None, True))
        self.assertIn("fade=t=out:st=89.250:d=0.75", plan.filter_graph)


@unittest.skipUnless(_HAS_FFMPEG, "ffmpeg and ffprobe are required")
class ComposeCommandTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls._directory = tempfile.TemporaryDirectory()
        cls.root = Path(cls._directory.name)
        for name, seconds in (("a", 3), ("b", 4), ("c", 5)):
            subprocess.run(
                ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                 f"testsrc2=size=1920x1080:rate=30:duration={seconds}", "-c:v", "libx264",
                 "-preset", "ultrafast", "-pix_fmt", "yuv420p", str(cls.root / f"{name}.mp4")],
                check=True,
            )
        replays = [
            {"key": key, "file": f"{key}.mp4", "version": f"v{key}", "nickname": key, "turns_shown": 1, "legend_width": 404}
            for key in ("a", "b", "c")
        ]
        cls.comparison = cls.root / "sample.json"
        cls.comparison.write_text(
            json.dumps({"title": "T", "subtitle": "S", "replays": replays,
                        "layouts": {"quad": ["a", "b", "c"], "duo": ["a", "b"]}}),
            encoding="utf-8",
        )

    @classmethod
    def tearDownClass(cls) -> None:
        cls._directory.cleanup()

    def _run(self, *extra: str) -> int:
        return main([str(self.comparison), "--source-dir", str(self.root), *extra])

    def test_still_is_one_full_frame(self) -> None:
        output = self.root / "still.png"
        self.assertEqual(self._run("--still", "1", "-o", str(output)), 0)
        with Image.open(output) as image:
            self.assertEqual(image.size, (1920, 1080))

    def test_video_stops_one_second_before_the_shortest_replay(self) -> None:
        output = self.root / "duo.mp4"
        self.assertEqual(self._run("--layout", "duo", "--preset", "ultrafast", "-o", str(output)), 0)
        duration = probe_video(output, resolve_tools(None, None)).duration_seconds
        self.assertAlmostEqual(duration, 2.0, delta=0.1)

    def test_existing_output_is_kept_without_force(self) -> None:
        output = self.root / "kept.mp4"
        output.write_bytes(b"previous")
        self.assertEqual(self._run("--duration", "1", "-o", str(output)), 1)
        self.assertEqual(output.read_bytes(), b"previous")


if __name__ == "__main__":
    unittest.main()
