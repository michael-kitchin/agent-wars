"""Command-line options for condensing a match recording."""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

from scripts.match_video.detect_region import DetectRegion, parse_detect_region
from scripts.match_video.keep_plan import CondenseError

LOGGER = logging.getLogger(__name__)

# Mean absolute frame difference at or below this value counts as a duplicate.
# 0.001 is ffmpeg's freezedetect default, about -60 dB.
_DEFAULT_FREEZE_NOISE = 0.001

# How long each frozen stretch stays in the output before the rest is cut.
_DEFAULT_STILL_KEEP_SECONDS = 1.0


def build_parser() -> argparse.ArgumentParser:
    """
    Why this exists:
        Describe the command-line knobs in one place.
    When to use:
        From ``main`` before the recording is opened.
    What to expect:
        A parser for one input path and the condensation options. It does not open files.
    """

    LOGGER.debug("Building the match-video condenser parser.")
    parser = argparse.ArgumentParser(
        description=(
            "Drop the audio from a match recording and cut each frozen stretch down to a short "
            "still buffer. Motion stays at the original speed."
        ),
        epilog=(
            "Freeze noise is a ratio from 0 to 1, or a negative decibel value. "
            "The default 0.001 (the same as -60) treats only near-duplicate frames as frozen. "
            "A larger ratio such as 0.01, or -40 dB, also treats small on-screen changes as frozen."
        ),
    )
    parser.add_argument("source", type=Path, help="Recorded video to condense.")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output file. Default: <source stem>.condensed.mp4 beside the source.",
    )
    parser.add_argument(
        "--still-keep-seconds",
        type=float,
        default=_DEFAULT_STILL_KEEP_SECONDS,
        help="Seconds of each frozen stretch to keep (default: 1). Use 0 to drop the stretch entirely.",
    )
    parser.add_argument(
        "--freeze-noise",
        type=float,
        default=_DEFAULT_FREEZE_NOISE,
        help=(
            "Duplicate sensitivity. Positive: ratio 0 to 1 (default 0.001). "
            "Negative: decibels, so -60 matches the default."
        ),
    )
    parser.add_argument(
        "--detect-region",
        type=_parse_region_argument,
        default=None,
        metavar="X1,Y1,X2,Y2",
        help=(
            "Rectangle of pixels used to decide whether a frame is a duplicate, written as x1,y1,x2,y2. "
            "The origin is the top-left. x1,y1 is included and x2,y2 is not. "
            "Odd edges are moved onto even pixels. Default: the whole frame. The written video is not cropped."
        ),
    )
    parser.add_argument(
        "--compare-width",
        type=int,
        default=0,
        help="Scale the detection area to this even width. 0 keeps that area's own width (default). The output is not scaled.",
    )
    parser.add_argument(
        "--crf",
        type=int,
        default=20,
        help="x264 quality when re-encoding (default: 20). Lower keeps more detail.",
    )
    parser.add_argument("--preset", default="medium", help="x264 preset used when re-encoding (default: medium).")
    parser.add_argument("--dry-run", action="store_true", help="Print how much would be kept and do not write a video.")
    parser.add_argument("--force", action="store_true", help="Overwrite the output file if it exists.")
    parser.add_argument("--ffmpeg", type=Path, help="ffmpeg executable. Default: ffmpeg on PATH.")
    parser.add_argument("--ffprobe", type=Path, help="ffprobe executable. Default: beside ffmpeg, then on PATH.")
    parser.add_argument("--verbose", action="store_true", help="Log detection details.")
    return parser


def _parse_region_argument(text: str) -> DetectRegion:
    """
    Why this exists:
        Turn ``--detect-region`` text into a rectangle argparse will accept.
    When to use:
        As the argument type for ``--detect-region``.
    What to expect:
        The parsed region. A bad value becomes an argparse error instead of a later scan failure.
    Exceptions:
        ``argparse.ArgumentTypeError`` when the text is not four ordered pixel coordinates.
    """

    LOGGER.debug("Reading --detect-region %r.", text)
    try:
        return parse_detect_region(text)
    except CondenseError as exc:
        raise argparse.ArgumentTypeError(str(exc)) from exc
