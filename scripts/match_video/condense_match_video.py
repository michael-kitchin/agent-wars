"""Condense a recorded match by dropping audio and long frozen stretches.

A frozen stretch is a run of near-duplicate frames, such as a map that sits
still while a player thinks. The script keeps the start of each stretch for
``--still-keep-seconds`` (default 1) and cuts the rest. Motion on either side
stays at the original speed. The audio track is always removed, because it
would no longer line up with the shortened picture.

Requires ffmpeg and ffprobe on PATH. A current ffmpeg is required when a cut
plan is too long for the command line; ffmpeg 9 is known to work. Shorter plans
also work on older builds.

Examples:
    python scripts/condense_match_video.py match.mp4
    python scripts/condense_match_video.py match.mp4 --still-keep-seconds 0.5
    python scripts/condense_match_video.py match.mp4 --detect-region 80,40,1840,1000
    python scripts/condense_match_video.py match.mp4 --freeze-noise -40 --dry-run
"""

from __future__ import annotations

import logging
import math
import os
import sys
from collections.abc import Sequence
from dataclasses import dataclass, replace
from pathlib import Path

from scripts.match_video.command_line import build_parser
from scripts.match_video.detect_region import (
    DetectRegion,
    align_region_to_even_pixels,
    build_detection_filters,
    require_ordered_region,
    require_region_inside_frame,
)
from scripts.match_video.ffmpeg_io import (
    FfmpegTools,
    VideoStreamInfo,
    discard_changed_output,
    output_stamp,
    probe_video,
    resolve_tools,
    run_ffmpeg,
    write_filter_file,
)
from scripts.match_video.keep_plan import (
    CondenseError,
    TimeSpan,
    build_keep_intervals,
    build_select_filter,
    covers_full_timeline,
    finish_freezes,
    format_timestamp,
    parse_freezedetect_log,
    span_seconds,
)

LOGGER = logging.getLogger(__name__)

# x264 presets this script will pass through. Anything else is a typo.
_X264_PRESETS = frozenset({
    "ultrafast",
    "superfast",
    "veryfast",
    "faster",
    "fast",
    "medium",
    "slow",
    "slower",
    "veryslow",
    "placebo",
})

# Above this length an inline -vf no longer fits comfortably on the Windows command line.
_INLINE_FILTER_LIMIT = 5000


@dataclass(frozen=True)
class CondenseConfig:
    """
    Why this exists:
        Hold the knobs for one condensation run so the call stays small.
    When to use:
        Build it from the command line, then pass it to ``condense_match_video``.
    What to expect:
        Frozen values. ``freeze_noise`` is a ratio from 0 to 1, never a decibel figure.
        ``detect_region`` None inspects the whole frame.
    """

    # Seconds of each frozen stretch to keep. Zero drops the whole stretch.
    still_keep_seconds: float
    # Mean absolute frame difference at or below which a frame is a duplicate.
    freeze_noise: float
    # Width of the detection image after the detect region is applied. Zero keeps that region's width.
    compare_width: int
    # x264 quality when frames are dropped and the video must be re-encoded. Lower keeps more detail.
    crf: int
    # x264 speed and size tradeoff used when re-encoding.
    preset: str
    # When true, report the cut plan and do not write a file.
    dry_run: bool
    # When true, replace an output file that is already there.
    force: bool
    # Pixels used to judge duplicate frames. None uses the whole frame. The output is not cropped.
    detect_region: DetectRegion | None = None


@dataclass(frozen=True)
class CondenseReport:
    """
    Why this exists:
        Return the cut result without parsing log text.
    When to use:
        As the result of ``condense_match_video``.
    What to expect:
        ``output_duration_seconds`` is None on a dry run. ``reencoded`` is true when the
        picture is, or would be, encoded again.
    """

    # Length of the source, in seconds.
    source_duration_seconds: float
    # Length of the kept stretches, in seconds, before encoding.
    planned_duration_seconds: float
    # Length of the written file, in seconds. None when nothing was written.
    output_duration_seconds: float | None
    # Frozen stretches that were long enough to consider cutting.
    freeze_count: int
    # True when the source had an audio stream.
    source_had_audio: bool
    # True when the picture is re-encoded. On a dry run, true when it would be.
    reencoded: bool
    # Destination path. Not created on a dry run.
    output_path: Path


def freeze_noise_ratio(value: float) -> float:
    """
    Why this exists:
        Accept either ffmpeg's 0-to-1 noise ratio or the older negative decibel form.
    When to use:
        On the ``--freeze-noise`` value, before building ``CondenseConfig``.
    What to expect:
        A ratio in the range (0, 1]. Negative input is converted from dB. ``-60`` becomes about ``0.001``.
    Exceptions:
        ``CondenseError`` when the value is zero, not finite, or outside the range.
    """

    LOGGER.debug("Converting freeze noise value %s.", value)
    if not math.isfinite(value) or value == 0:
        raise CondenseError(
            "Freeze noise must be a ratio from just above 0 up to 1, or a negative dB value such as -60."
        )
    ratio = 10 ** (value / 20.0) if value < 0 else value
    if not math.isfinite(ratio) or ratio <= 0 or ratio > 1:
        raise CondenseError(
            "Freeze noise must be a ratio from just above 0 up to 1, or a negative dB value such as -60."
        )
    LOGGER.debug("Freeze noise ratio is %.8f.", ratio)
    return ratio


def condense_match_video(
    source: Path,
    output: Path,
    config: CondenseConfig,
    tools: FfmpegTools,
) -> CondenseReport:
    """
    Why this exists:
        Strip the audio and cut every long frozen stretch down to the still buffer.
    When to use:
        On a finished match recording. The source is only read.
    What to expect:
        A report of the planned and written durations. The output has no audio. When no frozen
        stretch exceeds the buffer, the video track is copied. Otherwise the picture is re-encoded
        and the gaps are closed.
    Exceptions:
        ``CondenseError`` for a missing file, a bad option, or an ffmpeg failure.
    """

    LOGGER.debug(
        "Condensing %s -> %s. still_keep=%s noise=%s compare_width=%s region=%s crf=%s preset=%s dry_run=%s force=%s",
        source,
        output,
        config.still_keep_seconds,
        config.freeze_noise,
        config.compare_width,
        config.detect_region,
        config.crf,
        config.preset,
        config.dry_run,
        config.force,
    )
    _require_config(config)
    source = source.expanduser().resolve()
    output = output.expanduser().resolve()
    _require_paths(source, output, config)
    info = probe_video(source, tools)
    config = _config_for_frame(config, info.width, info.height)
    frame_seconds = 1.0 / float(info.frames_per_second)
    if info.has_audio:
        LOGGER.info("Removing the audio track.")
    else:
        LOGGER.info("The recording has no audio track.")
    LOGGER.info("Scanning %s for frozen stretches.", source.name)
    freezes = _detect_freezes(source, info, config, tools)
    spans = build_keep_intervals(info.duration_seconds, freezes, config.still_keep_seconds, frame_seconds)
    planned = span_seconds(spans)
    full = covers_full_timeline(spans, info.duration_seconds, frame_seconds)
    LOGGER.info(
        "Keeping %s of %s (%.0f%%). Frozen stretches: %d.",
        format_timestamp(planned),
        format_timestamp(info.duration_seconds),
        100.0 * planned / info.duration_seconds,
        len(freezes),
    )
    if config.dry_run:
        LOGGER.info("Dry run: no file written. %s.", "Would re-encode." if not full else "Would copy the video.")
        return _report(info, planned, None, len(freezes), not full, output)
    reencoded = _write_output(source, output, info, spans, config, tools)
    try:
        actual = probe_video(output, tools).duration_seconds
    except CondenseError as exc:
        LOGGER.error("The output was written but could not be measured: %s", exc)
        actual = planned
    LOGGER.info("Wrote %s (%s).", output, format_timestamp(actual))
    return _report(info, planned, actual, len(freezes), reencoded, output)


def main(argv: Sequence[str] | None = None) -> int:
    """
    Why this exists:
        Parse the command line and condense one recording.
    When to use:
        From ``scripts/condense_match_video.py``. Tests pass ``argv``.
    What to expect:
        Exit code 0 when the output is written, or when a dry run finishes.
        Exit code 1 when the recording cannot be condensed. argparse uses exit code 2.
    """

    args = build_parser().parse_args(None if argv is None else list(argv))
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(message)s",
    )
    LOGGER.debug("condense_match_video starting.")
    source = args.source.expanduser()
    output = args.output if args.output is not None else source.with_name(f"{source.stem}.condensed.mp4")
    try:
        config = CondenseConfig(
            still_keep_seconds=args.still_keep_seconds,
            freeze_noise=freeze_noise_ratio(args.freeze_noise),
            compare_width=args.compare_width,
            crf=args.crf,
            preset=args.preset,
            dry_run=args.dry_run,
            force=args.force,
            detect_region=args.detect_region,
        )
        if not source.is_file():
            raise CondenseError(f"Recording not found: {source}")
        tools = resolve_tools(args.ffmpeg, args.ffprobe)
        condense_match_video(source, output, config, tools)
    except CondenseError as exc:
        LOGGER.error("%s", exc)
        return 1
    except Exception:
        LOGGER.error("Condensing the recording failed.", exc_info=True)
        return 1
    return 0


def _require_config(config: CondenseConfig) -> None:
    """
    Why this exists:
        Reject a cut plan that ffmpeg cannot run, before the recording is scanned.
    When to use:
        At the start of ``condense_match_video``.
    What to expect:
        Returns when every knob is in range. The preset comparison ignores case.
    Exceptions:
        ``CondenseError`` when a knob is out of range.
    """

    LOGGER.debug("Checking condensation options.")
    if not math.isfinite(config.still_keep_seconds) or not 0 <= config.still_keep_seconds <= 24 * 60 * 60:
        raise CondenseError("--still-keep-seconds must be from 0 to 86400.")
    if not math.isfinite(config.freeze_noise) or not 0 < config.freeze_noise <= 1:
        raise CondenseError("--freeze-noise must be a ratio from just above 0 up to 1.")
    if config.compare_width != 0 and (
        config.compare_width < 64 or config.compare_width > 7680 or config.compare_width % 2 != 0
    ):
        raise CondenseError("--compare-width must be 0, or an even number from 64 to 7680.")
    if not 0 <= config.crf <= 51:
        raise CondenseError("--crf must be from 0 to 51.")
    if config.preset.lower() not in _X264_PRESETS:
        joined = ", ".join(sorted(_X264_PRESETS))
        raise CondenseError(f"--preset must be one of: {joined}.")
    if config.detect_region is not None:
        require_ordered_region(config.detect_region)


def _config_for_frame(config: CondenseConfig, width: int, height: int) -> CondenseConfig:
    """
    Why this exists:
        Confirm the detect rectangle fits this recording and move it onto even pixels.
    When to use:
        After the frame size is known, before the scan.
    What to expect:
        The same config when detection uses the whole frame. Otherwise a config whose
        region lies inside the frame. A yuv420 crop has to start and end on even pixels,
        so an odd edge is shifted and the shift is logged.
    Exceptions:
        ``CondenseError`` when the rectangle does not fit in the frame.
    """

    LOGGER.debug("Fitting the detect region to a %dx%d frame.", width, height)
    if config.detect_region is None:
        return config
    require_region_inside_frame(config.detect_region, width, height)
    aligned = align_region_to_even_pixels(config.detect_region, width, height)
    LOGGER.info(
        "Looking for duplicate frames inside %d,%d,%d,%d of the %dx%d frame.",
        aligned.x1,
        aligned.y1,
        aligned.x2,
        aligned.y2,
        width,
        height,
    )
    if aligned == config.detect_region:
        return config
    return replace(config, detect_region=aligned)


def _require_paths(source: Path, output: Path, config: CondenseConfig) -> None:
    """
    Why this exists:
        Fail before a long scan when the paths cannot produce an output file.
    When to use:
        After the paths are resolved and before ffprobe runs.
    What to expect:
        Returns when the source exists and the output will not be clobbered.
        A dry run does not require the output path to be free.
    Exceptions:
        ``CondenseError`` when a path is unusable.
    """

    LOGGER.debug("Checking paths. source=%s output=%s", source, output)
    if not source.is_file():
        raise CondenseError(f"Recording not found: {source}")
    if source == output:
        raise CondenseError("The output path is the same as the recording.")
    if output.suffix == "":
        raise CondenseError("The output path needs a file extension, such as .mp4.")
    if not output.parent.is_dir():
        raise CondenseError(f"Output directory does not exist: {output.parent}")
    if output.exists() and not config.force and not config.dry_run:
        raise CondenseError(f"Output already exists: {output}. Pass --force to replace it.")


def _detect_freezes(
    source: Path,
    info: VideoStreamInfo,
    config: CondenseConfig,
    tools: FfmpegTools,
) -> list[TimeSpan]:
    """
    Why this exists:
        Find runs of duplicate frames without decoding them in Python.
    When to use:
        Once per recording, after the probe.
    What to expect:
        Frozen stretches at least as long as the still buffer. A zero buffer detects freezes
        of about one frame. The picture is not modified.
    Exceptions:
        ``CondenseError`` when ffmpeg fails.
    """

    LOGGER.debug("Detecting freezes in %s.", source)
    minimum = config.still_keep_seconds
    if minimum <= 0:
        minimum = max(1.0 / float(info.frames_per_second), 0.001)
    filters = build_detection_filters(
        config.freeze_noise,
        minimum,
        config.compare_width,
        config.detect_region,
    )
    command = [
        str(tools.ffmpeg),
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "info",
        "-nostats",
        "-progress",
        "pipe:1",
        "-i",
        str(source),
        "-map",
        "0:v:0",
        "-an",
        "-vf",
        ",".join(filters),
        "-f",
        "null",
        os.devnull,
    ]
    log_text = run_ffmpeg(command, "Scanned", info.duration_seconds)
    return finish_freezes(parse_freezedetect_log(log_text), info.duration_seconds)


def _write_output(
    source: Path,
    output: Path,
    info: VideoStreamInfo,
    spans: Sequence[TimeSpan],
    config: CondenseConfig,
    tools: FfmpegTools,
) -> bool:
    """
    Why this exists:
        Write the condensed picture with the audio omitted.
    When to use:
        After the keep plan is known and this is not a dry run.
    What to expect:
        True when re-encoded, false when copied. A failed write removes only a partial file.
    Exceptions:
        ``CondenseError`` when ffmpeg fails.
    """

    frame_seconds = 1.0 / float(info.frames_per_second)
    full = covers_full_timeline(spans, info.duration_seconds, frame_seconds)
    LOGGER.debug("Writing %s. copy=%s spans=%d", output, full, len(spans))
    stamp = output_stamp(output)
    try:
        if full:
            LOGGER.info("No frozen stretch exceeds the buffer. Copying the video and dropping audio.")
            command = _output_command(tools.ffmpeg, source, output, config.force)
            command.extend(["-map", "0:v:0", "-c:v", "copy", "-an", str(output)])
            run_ffmpeg(command, "Copied", info.duration_seconds)
            return False
        graph_path = write_filter_file(build_select_filter(spans, info.frames_per_second, info.duration_seconds))
        try:
            _encode_selected_frames(source, output, graph_path, span_seconds(spans), config, tools)
        finally:
            try:
                graph_path.unlink(missing_ok=True)
            except OSError as exc:
                LOGGER.error("Could not delete the temporary filter file %s: %s", graph_path, exc)
        return True
    except CondenseError:
        discard_changed_output(output, stamp)
        raise


def _encode_selected_frames(
    source: Path,
    output: Path,
    graph_path: Path,
    planned_seconds: float,
    config: CondenseConfig,
    tools: FfmpegTools,
) -> None:
    """
    Why this exists:
        Re-encode the kept frames so the frozen tails disappear from the timeline.
    When to use:
        When at least one frozen tail was cut. ``graph_path`` holds the select graph.
    What to expect:
        An output file with no audio. Kept motion plays at the probed frame rate.
        If this ffmpeg cannot read a filter file, a short graph is retried inline.
    Exceptions:
        ``CondenseError`` when encoding fails, or when the filter file cannot be read back.
    """

    LOGGER.debug("Re-encoding kept frames to %s.", output)
    LOGGER.info("Re-encoding the kept frames and dropping audio.")
    try:
        graph = graph_path.read_text(encoding="ascii")
    except OSError as exc:
        LOGGER.error("Could not read the filter graph %s: %s", graph_path, exc)
        raise CondenseError("Could not read the temporary filter file.") from exc
    file_command = _encode_command(tools.ffmpeg, source, output, config, ["-/vf", str(graph_path)])
    stamp = output_stamp(output)
    try:
        run_ffmpeg(file_command, "Encoded", planned_seconds)
    except CondenseError as exc:
        if "Unrecognized option '/vf'" not in str(exc) and 'Unrecognized option "/vf"' not in str(exc):
            raise
        discard_changed_output(output, stamp)
        if len(graph) > _INLINE_FILTER_LIMIT:
            LOGGER.error("ffmpeg cannot read a filter file and the cut plan is too long to inline: %s", exc)
            raise CondenseError(
                "This ffmpeg cannot read a filter from a file, and the cut plan is too long for the command line. "
                "Install a current ffmpeg build and try again."
            ) from exc
        LOGGER.error("ffmpeg rejected -/vf. Retrying with an inline filter. %s", exc)
        inline = _encode_command(tools.ffmpeg, source, output, config, ["-vf", graph])
        run_ffmpeg(inline, "Encoded", planned_seconds)


def _encode_command(
    ffmpeg: Path,
    source: Path,
    output: Path,
    config: CondenseConfig,
    filter_args: list[str],
) -> list[str]:
    """
    Why this exists:
        Build the re-encode command for either a filter file or an inline filter.
    When to use:
        From ``_encode_selected_frames``.
    What to expect:
        A command that maps only the first video stream, drops audio, and writes H.264.
    """

    LOGGER.debug("Building the encode command for %s.", output)
    command = _output_command(ffmpeg, source, output, config.force)
    command.extend(["-map", "0:v:0"])
    command.extend(filter_args)
    command.extend([
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        config.preset.lower(),
        "-crf",
        str(config.crf),
        "-pix_fmt",
        "yuv420p",
    ])
    if output.suffix.lower() in {".mp4", ".mov"}:
        command.extend(["-movflags", "+faststart"])
    command.append(str(output))
    return command


def _output_command(ffmpeg: Path, source: Path, output: Path, force: bool) -> list[str]:
    """
    Why this exists:
        Share the banner, progress, and input arguments across copy and encode.
    When to use:
        When starting either output command. The caller appends stream options and the output path.
    What to expect:
        A command list that does not yet name the output file. ``-y`` is included only when overwriting.
    """

    LOGGER.debug("Starting an ffmpeg output command for %s.", output)
    command = [
        str(ffmpeg),
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "warning",
        "-nostats",
        "-progress",
        "pipe:1",
    ]
    if force:
        command.append("-y")
    command.extend(["-i", str(source)])
    return command


def _report(
    info: VideoStreamInfo,
    planned: float,
    actual: float | None,
    freeze_count: int,
    reencoded: bool,
    output: Path,
) -> CondenseReport:
    """
    Why this exists:
        Build the result object in one place so the dry run and the write path stay aligned.
    When to use:
        At each return from ``condense_match_video``.
    What to expect:
        A report. ``actual`` is None when no file was written.
    """

    LOGGER.debug("Reporting planned %.3f seconds and actual %s.", planned, actual)
    return CondenseReport(
        source_duration_seconds=info.duration_seconds,
        planned_duration_seconds=planned,
        output_duration_seconds=actual,
        freeze_count=freeze_count,
        source_had_audio=info.has_audio,
        reencoded=reencoded,
        output_path=output,
    )


if __name__ == "__main__":
    sys.exit(main())
