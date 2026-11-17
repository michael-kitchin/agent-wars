"""Compose condensed match replays side by side in one 1920x1080 video.

A comparison file (JSON) names the replays and their labels; see
``scripts/match_video/comparisons/`` and ``doc/match-video.md``. Two layouts are
available. ``quad`` shows three replays and a legend card on a two-by-two grid.
``duo`` shows two replays side by side between a header band and a footer band.

By default the video stops one second before the shortest replay in the layout
ends, and fades to black over its last 0.75 seconds. ``--still`` writes one PNG
frame instead, which is quick for checking labels and crops.

Requires ffmpeg and ffprobe on PATH, and Pillow (``scripts/match_video/requirements.txt``).

Examples (the comparison file path is shortened to COMPARISON):
    python scripts/compose_match_comparison.py COMPARISON --source-dir D:/Videos
    python scripts/compose_match_comparison.py COMPARISON --layout duo --source-dir D:/Videos
    python scripts/compose_match_comparison.py COMPARISON --source-dir D:/Videos --still 60

where COMPARISON is, for example, scripts/match_video/comparisons/world_war_n.json.
"""

from __future__ import annotations

import argparse
import logging
import math
import tempfile
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from scripts.match_video.comparison_graph import FfmpegPlan, LayoutRequest, RenderWindow, build_comparison_plan
from scripts.match_video.comparison_spec import LAYOUT_SIZES, ComparisonError, layout_replays, load_comparison_spec
from scripts.match_video.ffmpeg_io import (
    FfmpegTools,
    discard_changed_output,
    output_stamp,
    probe_video,
    resolve_tools,
    run_ffmpeg,
)
from scripts.match_video.keep_plan import CondenseError, format_timestamp

LOGGER = logging.getLogger(__name__)

# Seconds the output stops before the shortest replay in the layout ends.
_DEFAULT_END_TRIM_SECONDS = 1.0

# x264 quality of the composed video. Lower keeps more detail.
_DEFAULT_CRF = 20

# x264 speed and size tradeoff. Composing decodes several replays at once, so a fast preset keeps runs short.
_DEFAULT_PRESET = "veryfast"


@dataclass(frozen=True)
class ComposeOptions:
    """
    Why this exists:
        Hold the knobs for one comparison run so the call stays small.
    When to use:
        Build it from the command line, then pass it to ``compose_match_comparison``.
    What to expect:
        ``duration_seconds`` None means "until ``end_trim_seconds`` before the shortest replay ends".
        ``output`` None means the default name in ``source_dir``.
    """

    # Comparison file to read.
    spec_path: Path
    # Layout name: "quad" or "duo".
    layout: str
    # Directory that the replay file names are relative to.
    source_dir: Path
    # Destination file, or None for the default name.
    output: Path | None
    # Seconds into every replay where the output starts.
    start_seconds: float
    # Seconds of output, or None to run until the end trim.
    duration_seconds: float | None
    # Replay time of a single preview frame, or None for a video.
    still_seconds: float | None
    # True to fade the last 0.75 seconds to black.
    fade_out: bool
    # Seconds to stop before the shortest replay ends when no duration is given.
    end_trim_seconds: float
    # x264 quality.
    crf: int
    # x264 preset.
    preset: str
    # True to replace an output file that is already there.
    force: bool


def build_parser() -> argparse.ArgumentParser:
    """
    Why this exists:
        Describe the command-line knobs in one place.
    When to use:
        From ``main`` before any file is opened.
    What to expect:
        A parser for one comparison file and the composition options. It does not open files.
    """

    LOGGER.debug("Building the match-comparison parser.")
    parser = argparse.ArgumentParser(
        description="Compose condensed match replays side by side in one 1920x1080 video.",
        epilog="Replay file names in the comparison file are relative to --source-dir.",
    )
    parser.add_argument("comparison", type=Path, help="Comparison file (JSON).")
    parser.add_argument("--layout", choices=sorted(LAYOUT_SIZES), default="quad", help="Layout (default: quad).")
    parser.add_argument("--source-dir", type=Path, default=Path("."), help="Directory holding the replays (default: .).")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output file. Default: <comparison stem>-<layout>.mp4 (or .png with --still) in --source-dir.",
    )
    parser.add_argument("--start", type=float, default=0.0, help="Seconds into every replay to start (default: 0).")
    parser.add_argument(
        "--duration",
        type=float,
        help="Seconds of output. Default: until --end-trim seconds before the shortest replay ends.",
    )
    parser.add_argument(
        "--end-trim",
        type=float,
        default=_DEFAULT_END_TRIM_SECONDS,
        help="Seconds to stop before the shortest replay ends (default: 1).",
    )
    parser.add_argument("--still", type=float, metavar="SECONDS", help="Write one PNG frame from this replay time.")
    parser.add_argument("--no-fade", action="store_true", help="Do not fade to black at the end.")
    parser.add_argument("--crf", type=int, default=_DEFAULT_CRF, help="x264 quality (default: 20). Lower keeps more detail.")
    parser.add_argument("--preset", default=_DEFAULT_PRESET, help="x264 preset (default: veryfast).")
    parser.add_argument("--force", action="store_true", help="Overwrite the output file if it exists.")
    parser.add_argument("--ffmpeg", type=Path, help="ffmpeg executable. Default: ffmpeg on PATH.")
    parser.add_argument("--ffprobe", type=Path, help="ffprobe executable. Default: beside ffmpeg, then on PATH.")
    parser.add_argument("--verbose", action="store_true", help="Log the filter graph and ffmpeg details.")
    return parser


def compose_match_comparison(options: ComposeOptions, tools: FfmpegTools) -> Path:
    """
    Why this exists:
        Compose one comparison video, or one preview frame, from a comparison file.
    When to use:
        After the options are parsed and ffmpeg is found. The replays are only read.
    What to expect:
        The path of the written file. A video has no audio and runs at 30 fps. A failed write
        removes a file that appeared or changed during the attempt.
    Exceptions:
        ``ComparisonError`` for a bad comparison file, a missing replay, or an option out of range.
        ``CondenseError`` when ffprobe or ffmpeg fails.
    """

    LOGGER.debug("Composing a comparison: %s", options)
    _require_options(options)
    spec = load_comparison_spec(options.spec_path)
    source_dir = options.source_dir.expanduser().resolve()
    output = _output_path(options, source_dir)
    replay_paths = [source_dir / replay.file for replay in layout_replays(spec, options.layout)]
    missing = [str(path) for path in replay_paths if not path.is_file()]
    if missing:
        raise ComparisonError(f"Replay not found: {', '.join(missing)}")
    window = _render_window(options, replay_paths, tools)
    stamp = output_stamp(output)
    with tempfile.TemporaryDirectory(prefix="match-comparison-") as panel_dir:
        plan = build_comparison_plan(LayoutRequest(spec, options.layout, source_dir, Path(panel_dir), window))
        LOGGER.debug("Filter graph: %s", plan.filter_graph)
        command = _command(tools, plan, options, output)
        total = 0.0 if window.still_seconds is not None else window.duration_seconds
        try:
            run_ffmpeg(command, "Composed", total)
        except CondenseError:
            discard_changed_output(output, stamp)
            raise
    LOGGER.info("Wrote %s.", output)
    return output


def main(argv: Sequence[str] | None = None) -> int:
    """
    Why this exists:
        Parse the command line and compose one comparison.
    When to use:
        From ``scripts/compose_match_comparison.py``. Tests pass ``argv``.
    What to expect:
        Exit code 0 when the output is written. Exit code 1 when it cannot be composed.
        argparse uses exit code 2.
    """

    args = build_parser().parse_args(None if argv is None else list(argv))
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(message)s",
    )
    LOGGER.debug("compose_match_comparison starting.")
    options = ComposeOptions(
        spec_path=args.comparison.expanduser(),
        layout=args.layout,
        source_dir=args.source_dir,
        output=args.output,
        start_seconds=args.start,
        duration_seconds=args.duration,
        still_seconds=args.still,
        fade_out=not args.no_fade,
        end_trim_seconds=args.end_trim,
        crf=args.crf,
        preset=args.preset,
        force=args.force,
    )
    try:
        tools = resolve_tools(args.ffmpeg, args.ffprobe)
        compose_match_comparison(options, tools)
    except (ComparisonError, CondenseError) as exc:
        LOGGER.error("%s", exc)
        return 1
    except Exception:
        LOGGER.error("Composing the comparison failed.", exc_info=True)
        return 1
    return 0


def _require_options(options: ComposeOptions) -> None:
    """
    Why this exists:
        Reject options ffmpeg cannot use, before any replay is probed.
    When to use:
        At the start of ``compose_match_comparison``.
    What to expect:
        Returns when every time is finite and in range and the CRF is valid.
    Exceptions:
        ``ComparisonError`` naming the first bad option.
    """

    LOGGER.debug("Checking comparison options.")
    if not math.isfinite(options.start_seconds) or options.start_seconds < 0:
        raise ComparisonError("--start must be 0 or more seconds.")
    if options.duration_seconds is not None and (
        not math.isfinite(options.duration_seconds) or options.duration_seconds <= 0
    ):
        raise ComparisonError("--duration must be more than 0 seconds.")
    if not math.isfinite(options.end_trim_seconds) or options.end_trim_seconds < 0:
        raise ComparisonError("--end-trim must be 0 or more seconds.")
    if options.still_seconds is not None and (
        not math.isfinite(options.still_seconds) or options.still_seconds < 0
    ):
        raise ComparisonError("--still must be 0 or more seconds.")
    if not 0 <= options.crf <= 51:
        raise ComparisonError("--crf must be from 0 to 51.")


def _output_path(options: ComposeOptions, source_dir: Path) -> Path:
    """
    Why this exists:
        Pick the destination and refuse to overwrite it by accident.
    When to use:
        Before probing, so a clash is reported at once.
    What to expect:
        An absolute path. The default name is ``<comparison stem>-<layout>.mp4`` in the source
        directory, or ``-t<seconds>.png`` with ``--still``.
    Exceptions:
        ``ComparisonError`` when the output exists without ``--force``, its directory is
        missing, or it has no file extension.
    """

    LOGGER.debug("Choosing the output path.")
    if options.output is not None:
        output = options.output.expanduser().resolve()
    elif options.still_seconds is not None:
        output = source_dir / f"{options.spec_path.stem}-{options.layout}-t{options.still_seconds:g}.png"
    else:
        output = source_dir / f"{options.spec_path.stem}-{options.layout}.mp4"
    if output.suffix == "":
        raise ComparisonError("The output path needs a file extension, such as .mp4 or .png.")
    if not output.parent.is_dir():
        raise ComparisonError(f"Output directory does not exist: {output.parent}")
    if output.exists() and not options.force:
        raise ComparisonError(f"Output already exists: {output}. Use --force to replace it.")
    return output


def _render_window(options: ComposeOptions, replay_paths: Sequence[Path], tools: FfmpegTools) -> RenderWindow:
    """
    Why this exists:
        Decide how much of the replays to compose.
    When to use:
        After the replays are known to exist.
    What to expect:
        A still window when ``--still`` is set. Otherwise the given duration, or the time
        from ``--start`` until ``--end-trim`` seconds before the shortest replay ends.
    Exceptions:
        ``ComparisonError`` when that leaves nothing to compose.
        ``CondenseError`` when ffprobe cannot read a replay.
    """

    LOGGER.debug("Working out the render window for %d replays.", len(replay_paths))
    if options.still_seconds is not None:
        return RenderWindow(0.0, 0.0, options.still_seconds, False)
    duration = options.duration_seconds
    if duration is None:
        lengths = {path: probe_video(path, tools).duration_seconds for path in replay_paths}
        shortest = min(lengths, key=lengths.get)
        duration = lengths[shortest] - options.end_trim_seconds - options.start_seconds
        LOGGER.info(
            "Shortest replay: %s (%s). Composing %s from %s.",
            shortest.name,
            format_timestamp(lengths[shortest]),
            format_timestamp(max(duration, 0.0)),
            format_timestamp(options.start_seconds),
        )
    if duration <= 0:
        raise ComparisonError("Nothing to compose: the start and end trim leave no time.")
    return RenderWindow(options.start_seconds, duration, None, options.fade_out)


def _command(tools: FfmpegTools, plan: FfmpegPlan, options: ComposeOptions, output: Path) -> list[str]:
    """
    Why this exists:
        Build the ffmpeg command for a video or a single frame.
    When to use:
        From ``compose_match_comparison`` once the plan is built.
    What to expect:
        A command that reports progress on stdout and maps the graph's ``[out]`` label.
        A video is H.264 with no audio; ``.mp4`` and ``.mov`` get ``+faststart``.
    """

    LOGGER.debug("Building the compose command for %s.", output)
    command = [str(tools.ffmpeg), "-hide_banner", "-nostdin", "-loglevel", "warning", "-nostats", "-progress", "pipe:1"]
    if options.force:
        command.append("-y")
    command.extend(plan.input_args)
    command.extend(["-filter_complex", plan.filter_graph, "-map", "[out]"])
    if options.still_seconds is not None:
        command.extend(["-frames:v", "1", "-update", "1"])
    else:
        command.extend(["-an", "-c:v", "libx264", "-preset", options.preset, "-crf", str(options.crf)])
        if output.suffix.lower() in {".mp4", ".mov"}:
            command.extend(["-movflags", "+faststart"])
    command.append(str(output))
    return command
