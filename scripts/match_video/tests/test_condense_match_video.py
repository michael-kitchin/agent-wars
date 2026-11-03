"""Contracts for condensing a match recording with ffmpeg."""

from __future__ import annotations

import logging
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts.match_video.condense_match_video import CondenseConfig, condense_match_video, freeze_noise_ratio, main
from scripts.match_video.detect_region import (
    DetectRegion,
    align_region_to_even_pixels,
    build_detection_filters,
    parse_detect_region,
    require_region_inside_frame,
)
from scripts.match_video.ffmpeg_io import (
    FfmpegTools,
    discard_changed_output,
    output_stamp,
    probe_video,
    resolve_tools,
)
from scripts.match_video.keep_plan import CondenseError

_HAS_FFMPEG = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def _config(
    still_keep_seconds: float = 1.0,
    freeze_noise: float = 0.001,
    compare_width: int = 0,
    detect_region: DetectRegion | None = None,
) -> CondenseConfig:
    return CondenseConfig(
        still_keep_seconds=still_keep_seconds,
        freeze_noise=freeze_noise,
        compare_width=compare_width,
        crf=20,
        preset="medium",
        dry_run=False,
        force=False,
        detect_region=detect_region,
    )


class CondenseOptionTests(unittest.TestCase):
    def test_decibel_noise_matches_the_ratio_default(self) -> None:
        self.assertAlmostEqual(freeze_noise_ratio(-60), 0.001, places=6)
        self.assertEqual(freeze_noise_ratio(0.01), 0.01)

    def test_zero_noise_is_rejected(self) -> None:
        with self.assertRaises(CondenseError):
            freeze_noise_ratio(0)

    def test_missing_recording_is_reported_by_the_command(self) -> None:
        code = main([str(Path(tempfile.gettempdir()) / "no-such-match-recording.mp4")])
        self.assertEqual(code, 1)

    def test_existing_output_is_left_alone(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "match.mp4"
            source.write_bytes(b"not a video")
            output = root / "out.mp4"
            output.write_bytes(b"already")
            tools = FfmpegTools(Path("missing-ffmpeg"), Path("missing-ffprobe"))
            with self.assertRaises(CondenseError) as caught:
                condense_match_video(source, output, _config(), tools)
            self.assertIn("already exists", str(caught.exception))
            self.assertEqual(output.read_bytes(), b"already")

    def test_missing_ffmpeg_is_an_error(self) -> None:
        with self.assertRaises(CondenseError):
            resolve_tools(Path("no-such-ffmpeg-binary"), None)

    def test_detect_region_parses_a_box_and_rejects_a_bad_one(self) -> None:
        self.assertEqual(parse_detect_region(" 10, 20, 110, 80 "), DetectRegion(10, 20, 110, 80))
        with self.assertRaises(CondenseError):
            parse_detect_region("1,2,3")
        with self.assertRaises(CondenseError):
            parse_detect_region("10,20,10,40")

    def test_detect_region_must_lie_inside_the_frame(self) -> None:
        require_region_inside_frame(DetectRegion(0, 0, 160, 120), 160, 120)
        with self.assertRaises(CondenseError):
            require_region_inside_frame(DetectRegion(0, 0, 161, 120), 160, 120)

    def test_odd_detect_region_moves_onto_even_pixels(self) -> None:
        aligned = align_region_to_even_pixels(DetectRegion(11, 21, 111, 81), 160, 120)
        self.assertEqual(aligned, DetectRegion(10, 20, 112, 82))
        self.assertEqual(
            align_region_to_even_pixels(DetectRegion(0, 0, 80, 120), 160, 120),
            DetectRegion(0, 0, 80, 120),
        )
        with self.assertRaises(CondenseError):
            align_region_to_even_pixels(DetectRegion(0, 0, 1, 1), 1, 1)

    def test_detection_filters_crop_before_comparing_and_only_when_asked(self) -> None:
        whole_frame = build_detection_filters(0.001, 1.0, 0, None)
        self.assertEqual(whole_frame, ["freezedetect=noise=0.00100000:duration=1.000000"])
        cropped = build_detection_filters(0.001, 1.0, 320, DetectRegion(0, 0, 80, 120))
        self.assertEqual(cropped[0], "crop=80:120:0:0")
        self.assertEqual(cropped[1], "scale=320:-2")
        self.assertTrue(cropped[2].startswith("freezedetect="))

    def test_unchanged_output_survives_a_failed_write(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "out.mp4"
            path.write_bytes(b"keep-me")
            stamp = output_stamp(path)
            discard_changed_output(path, stamp)
            self.assertEqual(path.read_bytes(), b"keep-me")
            path.write_bytes(b"partial-file")
            discard_changed_output(path, stamp)
            self.assertFalse(path.exists())
            fresh = output_stamp(path)
            path.write_bytes(b"new-partial")
            discard_changed_output(path, fresh)
            self.assertFalse(path.exists())

    def test_bad_detect_region_text_is_rejected_before_opening_the_file(self) -> None:
        with self.assertRaises(SystemExit) as caught:
            main(["missing.mp4", "--detect-region", "1,2,3"])
        self.assertEqual(caught.exception.code, 2)


@unittest.skipUnless(_HAS_FFMPEG, "ffmpeg is not on PATH")
class CondenseFfmpegTests(unittest.TestCase):
    def setUp(self) -> None:
        logging.getLogger().setLevel(logging.WARNING)

    def test_frozen_stretch_is_cut_to_the_buffer_and_audio_is_removed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "match.mp4"
            output = root / "match.condensed.mp4"
            _make_freeze_sample(source)
            code = main([
                str(source),
                "-o",
                str(output),
                "--still-keep-seconds",
                "1",
                "--freeze-noise",
                "0.001",
            ])
            self.assertEqual(code, 0)
            self.assertTrue(output.is_file())
            tools = resolve_tools(None, None)
            info = probe_video(output, tools)
            self.assertFalse(info.has_audio)
            self.assertAlmostEqual(info.duration_seconds, 2.0, delta=0.25)

    def test_motion_without_a_freeze_is_copied_without_audio(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "motion.mp4"
            output = root / "motion.condensed.mp4"
            _make_motion_sample(source)
            tools = resolve_tools(None, None)
            report = condense_match_video(source, output, _config(), tools)
            self.assertFalse(report.reencoded)
            self.assertTrue(report.source_had_audio)
            info = probe_video(output, tools)
            self.assertFalse(info.has_audio)
            self.assertAlmostEqual(info.duration_seconds, report.source_duration_seconds, delta=0.15)

    def test_detect_region_ignores_motion_outside_the_rectangle(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "split.mp4"
            _make_split_sample(source)
            tools = resolve_tools(None, None)
            region_report = condense_match_video(
                source,
                root / "region.mp4",
                _config(detect_region=DetectRegion(0, 0, 80, 120)),
                tools,
            )
            full_report = condense_match_video(source, root / "full.mp4", _config(), tools)
            self.assertIsNotNone(region_report.output_duration_seconds)
            self.assertIsNotNone(full_report.output_duration_seconds)
            self.assertAlmostEqual(region_report.output_duration_seconds or 0.0, 2.0, delta=0.35)
            self.assertAlmostEqual(full_report.output_duration_seconds or 0.0, 6.0, delta=0.35)
            written = probe_video(root / "region.mp4", tools)
            self.assertEqual((written.width, written.height), (160, 120))
            with self.assertRaises(CondenseError) as caught:
                condense_match_video(
                    source,
                    root / "outside.mp4",
                    _config(detect_region=DetectRegion(0, 0, 400, 120)),
                    tools,
                )
            self.assertIn("does not fit", str(caught.exception))
            self.assertFalse((root / "outside.mp4").exists())


def _run_ffmpeg(command: list[str]) -> None:
    completed = subprocess.run(command, check=False, capture_output=True, text=True)
    if completed.returncode != 0:
        raise AssertionError(completed.stderr[-2000:])


def _make_freeze_sample(path: Path) -> None:
    """Five seconds of red, one second of blue, and a tone on the audio track."""

    _run_ffmpeg([
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=160x120:r=10:d=5,format=yuv420p",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=160x120:r=10:d=1,format=yuv420p",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=6",
        "-filter_complex",
        "[0:v][1:v]concat=n=2:v=1:a=0[v]",
        "-map",
        "[v]",
        "-map",
        "2:a",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        str(path),
    ])


def _make_split_sample(path: Path) -> None:
    """Left half is red for 5s then blue for 1s. The right half keeps moving."""

    _run_ffmpeg([
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=80x120:r=10:d=5,format=yuv420p",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=80x120:r=10:d=1,format=yuv420p",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=80x120:rate=10:duration=6,format=yuv420p",
        "-filter_complex",
        "[0:v][1:v]concat=n=2:v=1:a=0[left];[left][2:v]hstack=inputs=2[v]",
        "-map",
        "[v]",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        str(path),
    ])


def _make_motion_sample(path: Path) -> None:
    """Two seconds of a moving test pattern with a tone."""

    _run_ffmpeg([
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=160x120:rate=10:duration=2",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=2",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        str(path),
    ])


if __name__ == "__main__":
    unittest.main()
