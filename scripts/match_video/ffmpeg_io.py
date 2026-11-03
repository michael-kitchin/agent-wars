"""Run ffmpeg and ffprobe for match-video condensation.

The cut plan lives in ``keep_plan``. This module finds the tools, reads stream
timing, and runs ffmpeg while showing progress on a long recording.
"""

from __future__ import annotations

import json
import logging
import math
import os
import shutil
import subprocess
import tempfile
import threading
import time
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import NamedTuple

from scripts.match_video.keep_plan import CondenseError, format_timestamp

LOGGER = logging.getLogger(__name__)

# How often a long scan or encode reports progress.
_PROGRESS_INTERVAL_SECONDS = 5.0

# How long to wait for ffmpeg's pipes to close after the process exits.
_PIPE_JOIN_SECONDS = 30.0


class FfmpegTools(NamedTuple):
    """
    Why this exists:
        Keep the ffmpeg and ffprobe executables together for one run.
    When to use:
        Pass the result of ``resolve_tools`` into the condenser.
    What to expect:
        Both paths point at existing files.
    """

    # Encodes, decodes, and reports frozen stretches.
    ffmpeg: Path
    # Reads duration, frame rate, and whether an audio track is present.
    ffprobe: Path


@dataclass(frozen=True)
class VideoStreamInfo:
    """
    Why this exists:
        Carry the source timing the cut plan and the output frame rate are based on.
    When to use:
        As the result of ``probe_video``.
    What to expect:
        Duration and frame rate are positive. Width and height are the stored frame size.
    """

    # Length of the container, in seconds.
    duration_seconds: float
    # Playback rate used when kept frames are written back to back.
    frames_per_second: Fraction
    # Stored frame width in pixels.
    width: int
    # Stored frame height in pixels.
    height: int
    # True when the file has an audio stream. Condensing removes it either way.
    has_audio: bool


def resolve_tools(ffmpeg: Path | None, ffprobe: Path | None) -> FfmpegTools:
    """
    Why this exists:
        Find ffmpeg and ffprobe before a long scan starts.
    When to use:
        From the command line, or when a caller has an explicit binary path.
    What to expect:
        Absolute paths. When ffprobe is omitted, the sibling of ffmpeg is preferred, then PATH.
    Exceptions:
        ``CondenseError`` when either executable cannot be found.
    """

    LOGGER.debug("Resolving ffmpeg tools. ffmpeg=%s ffprobe=%s", ffmpeg, ffprobe)
    ffmpeg_path = _existing_tool(ffmpeg, "ffmpeg")
    if ffprobe is None:
        sibling_name = "ffprobe.exe" if os.name == "nt" else "ffprobe"
        sibling = ffmpeg_path.parent / sibling_name
        ffprobe_path = sibling.resolve() if sibling.is_file() else _existing_tool(None, "ffprobe")
    else:
        ffprobe_path = _existing_tool(ffprobe, "ffprobe")
    LOGGER.debug("Using ffmpeg %s and ffprobe %s.", ffmpeg_path, ffprobe_path)
    return FfmpegTools(ffmpeg_path, ffprobe_path)


def probe_video(source: Path, tools: FfmpegTools) -> VideoStreamInfo:
    """
    Why this exists:
        Read the timeline and frame rate the cut plan has to agree with.
    When to use:
        On the source, and again on a written file when its duration is needed.
    What to expect:
        The first video stream. A variable frame rate is played back at the average rate.
    Exceptions:
        ``CondenseError`` when ffprobe fails or the file has no video stream.
    """

    LOGGER.debug("Probing %s.", source)
    command = [
        str(tools.ffprobe),
        "-hide_banner",
        "-loglevel",
        "error",
        "-show_entries",
        "stream=codec_type,width,height,r_frame_rate,avg_frame_rate,duration",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        str(source),
    ]
    completed = subprocess.run(command, check=False, capture_output=True, stdin=subprocess.DEVNULL)
    if completed.returncode != 0:
        detail = completed.stderr.decode("utf-8", errors="replace").strip()
        LOGGER.error("ffprobe failed for %s: %s", source, detail)
        raise CondenseError(f"ffprobe could not read {source}. {detail}".rstrip())
    try:
        payload = json.loads(completed.stdout.decode("utf-8"))
    except json.JSONDecodeError as exc:
        LOGGER.error("ffprobe returned unreadable JSON for %s: %s", source, exc)
        raise CondenseError(f"ffprobe returned unreadable stream data for {source}.") from exc
    info = _video_info_from_probe(payload)
    LOGGER.debug(
        "Probed %s: %.3fs, %s fps, %dx%d, audio=%s.",
        source,
        info.duration_seconds,
        info.frames_per_second,
        info.width,
        info.height,
        info.has_audio,
    )
    return info


def run_ffmpeg(command: list[str], progress_label: str, total_seconds: float) -> str:
    """
    Why this exists:
        Run ffmpeg, show progress, and keep stderr for freeze parsing.
    When to use:
        For detection, copy, and encode. The command must send ``-progress`` to stdout.
    What to expect:
        The stderr text on success. Progress is logged about every five seconds.
    Exceptions:
        ``CondenseError`` when ffmpeg exits with a nonzero status. The message includes the stderr tail.
    """

    LOGGER.debug("Running ffmpeg: %s", " ".join(command))
    process = subprocess.Popen(
        command,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    stderr_parts: list[str] = []
    stdout_thread = threading.Thread(
        target=_read_progress,
        args=(process.stdout, progress_label, total_seconds),
        name="ffmpeg-progress",
        daemon=True,
    )
    stderr_thread = threading.Thread(
        target=_read_text_pipe,
        args=(process.stderr, stderr_parts),
        name="ffmpeg-stderr",
        daemon=True,
    )
    stdout_thread.start()
    stderr_thread.start()
    return_code = -1
    try:
        return_code = process.wait()
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)
        stdout_thread.join(_PIPE_JOIN_SECONDS)
        stderr_thread.join(_PIPE_JOIN_SECONDS)
        _close_pipe(process.stdout)
        _close_pipe(process.stderr)
    stderr_text = "".join(stderr_parts)
    if return_code != 0:
        tail = stderr_text.strip()[-4000:]
        raise CondenseError(f"ffmpeg exited with status {return_code}.\n{tail}".rstrip())
    return stderr_text


def write_filter_file(graph: str) -> Path:
    """
    Why this exists:
        Keep a long select expression off the Windows command-line limit.
    When to use:
        Before a re-encode. The caller deletes the file.
    What to expect:
        A temporary file containing the graph as ASCII, with no extra newline.
        A file that was created and then could not be written is removed.
    Exceptions:
        ``CondenseError`` when the file cannot be created.
    """

    LOGGER.debug("Writing a filter graph of %d characters.", len(graph))
    path: Path | None = None
    try:
        descriptor, name = tempfile.mkstemp(prefix="condense-match-video-", suffix=".fffilter")
        path = Path(name)
        os.close(descriptor)
        path.write_bytes(graph.encode("ascii"))
    except OSError as exc:
        LOGGER.error("Could not write the temporary filter file: %s", exc)
        if path is not None:
            try:
                path.unlink(missing_ok=True)
            except OSError as unlink_error:
                LOGGER.error("Could not delete the temporary filter file %s: %s", path, unlink_error)
        raise CondenseError("Could not write a temporary filter file.") from exc
    LOGGER.debug("Filter graph file: %s", path)
    return path


def output_stamp(path: Path) -> tuple[int, int] | None:
    """
    Why this exists:
        Tell a later cleanup whether this attempt changed the output file.
    When to use:
        Immediately before a copy or encode.
    What to expect:
        None when the path is absent. Otherwise the size and modification time in nanoseconds.
    """

    LOGGER.debug("Stamping output %s.", path)
    if not path.exists():
        return None
    stat = path.stat()
    return (stat.st_size, stat.st_mtime_ns)


def discard_changed_output(path: Path, stamp: tuple[int, int] | None) -> None:
    """
    Why this exists:
        Remove a partial encode, and leave an output that ffmpeg never opened.
    When to use:
        After a failed write, with the stamp taken before that attempt. A retry that
        must replace a partial file uses it the same way.
    What to expect:
        The file is removed when it appeared during the attempt or its size or time changed.
        An unchanged file stays, so ``--force`` does not delete a previous output when
        ffmpeg fails before opening it.
    """

    LOGGER.debug("Checking whether to discard %s. previous=%s", path, stamp)
    if not path.exists():
        return
    if stamp is not None:
        stat = path.stat()
        if (stat.st_size, stat.st_mtime_ns) == stamp:
            LOGGER.debug("Leaving unchanged output %s in place.", path)
            return
    LOGGER.info("Removing incomplete output %s.", path)
    try:
        path.unlink()
    except OSError as exc:
        LOGGER.error("Could not remove the incomplete output %s: %s", path, exc)


def _close_pipe(pipe: object) -> None:
    """
    Why this exists:
        ffmpeg's stdout and stderr stay open after the readers finish, which leaks a handle per run.
    When to use:
        After the progress and stderr threads have joined.
    What to expect:
        The pipe is closed. A pipe that is already closed, or not a pipe, is ignored.
    """

    close = getattr(pipe, "close", None)
    if not callable(close):
        return
    try:
        close()
    except OSError as exc:
        LOGGER.error("Could not close an ffmpeg pipe: %s", exc)


def _existing_tool(explicit: Path | None, name: str) -> Path:
    """
    Why this exists:
        Resolve one executable from an explicit path or from PATH.
    When to use:
        While resolving ffmpeg or ffprobe.
    What to expect:
        An absolute path to an existing file.
    Exceptions:
        ``CondenseError`` when the executable cannot be found.
    """

    LOGGER.debug("Looking for %s at %s.", name, explicit)
    if explicit is not None:
        candidate = explicit.expanduser()
        if candidate.is_file():
            return candidate.resolve()
        found = shutil.which(str(candidate))
        if found:
            return Path(found).resolve()
        raise CondenseError(f"Could not find {name} at {explicit}.")
    found = shutil.which(name)
    if not found:
        raise CondenseError(f"Could not find {name} on PATH. Install ffmpeg and try again.")
    return Path(found).resolve()


def _video_info_from_probe(payload: object) -> VideoStreamInfo:
    """
    Why this exists:
        Pick the first video stream out of an ffprobe JSON document.
    When to use:
        After a successful ffprobe call.
    What to expect:
        Positive duration and frame rate. The average rate wins when it differs from the base rate.
    Exceptions:
        ``CondenseError`` when the document has no usable video stream.
    """

    LOGGER.debug("Reading ffprobe JSON.")
    if not isinstance(payload, dict):
        raise CondenseError("ffprobe returned an unexpected document.")
    streams = payload.get("streams")
    if not isinstance(streams, list):
        raise CondenseError("ffprobe did not list any streams.")
    video: dict[str, object] | None = None
    has_audio = False
    for stream in streams:
        if not isinstance(stream, dict):
            continue
        if stream.get("codec_type") == "audio":
            has_audio = True
        elif stream.get("codec_type") == "video" and video is None:
            video = stream
    if video is None:
        raise CondenseError("The recording has no video stream.")
    format_info = payload.get("format")
    format_duration = format_info.get("duration") if isinstance(format_info, dict) else None
    duration = _optional_float(format_duration)
    if duration is None:
        duration = _optional_float(video.get("duration"))
    if duration is None:
        raise CondenseError("ffprobe did not report a video duration.")
    base_rate = _parse_rate(video.get("r_frame_rate"))
    average_rate = _parse_rate(video.get("avg_frame_rate"))
    if (
        base_rate is not None
        and average_rate is not None
        and abs(float(average_rate - base_rate)) / float(base_rate) > 0.05
    ):
        LOGGER.warning(
            "This recording's frame rate varies (base %s, average %s). Kept frames play at the average rate.",
            base_rate,
            average_rate,
        )
        frames_per_second = average_rate
    else:
        frames_per_second = base_rate or average_rate
    if frames_per_second is None:
        raise CondenseError("ffprobe did not report a frame rate.")
    width = video.get("width")
    height = video.get("height")
    if not isinstance(width, int) or not isinstance(height, int) or width <= 0 or height <= 0:
        raise CondenseError("ffprobe did not report a frame size.")
    return VideoStreamInfo(duration, frames_per_second, width, height, has_audio)


def _read_progress(pipe: object, progress_label: str, total_seconds: float) -> None:
    """
    Why this exists:
        Show that a long scan or encode is still moving.
    When to use:
        On ffmpeg stdout when ``-progress pipe:1`` is set.
    What to expect:
        Info logs of the ``out_time`` clock, at most about every five seconds. The pipe is drained.
    """

    if not hasattr(pipe, "__iter__"):
        return
    last_report = 0.0
    reported = False
    current = 0.0
    for raw in pipe:
        line = raw.decode("utf-8", errors="replace").strip()
        if line.startswith("out_time="):
            parsed = _clock_to_seconds(line.split("=", 1)[1])
            if parsed is not None:
                current = parsed
        if line not in {"progress=continue", "progress=end"}:
            continue
        now = time.monotonic()
        if reported and now - last_report < _PROGRESS_INTERVAL_SECONDS:
            continue
        reported = True
        last_report = now
        if total_seconds > 0:
            LOGGER.info("%s %s of %s.", progress_label, format_timestamp(current), format_timestamp(total_seconds))
        else:
            LOGGER.info("%s %s.", progress_label, format_timestamp(current))


def _read_text_pipe(pipe: object, sink: list[str]) -> None:
    """
    Why this exists:
        Drain ffmpeg stderr so the process cannot block, and keep it for parsing.
    When to use:
        On the stderr pipe of an ffmpeg process, from a background thread.
    What to expect:
        Decoded text appended to ``sink`` in order. Invalid bytes are replaced.
    """

    if not hasattr(pipe, "__iter__"):
        return
    for raw in pipe:
        sink.append(raw.decode("utf-8", errors="replace"))


def _parse_rate(value: object) -> Fraction | None:
    """
    Why this exists:
        Read an ffprobe frame rate, usually a fraction such as ``30/1``.
    When to use:
        On ``r_frame_rate`` or ``avg_frame_rate``.
    What to expect:
        A positive fraction, or None when the field is missing or zero.
    """

    if not isinstance(value, str) or value in {"", "0/0", "N/A"}:
        return None
    try:
        if "/" in value:
            numerator, denominator = value.split("/", 1)
            rate = Fraction(int(numerator), int(denominator))
        else:
            rate = Fraction(value)
    except (ValueError, ZeroDivisionError):
        return None
    if rate <= 0:
        return None
    return rate


def _optional_float(value: object) -> float | None:
    """
    Why this exists:
        Accept the duration strings ffprobe puts in JSON.
    When to use:
        On a format or stream duration field.
    What to expect:
        A positive finite float, or None when the field is missing or not a duration.
    """

    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    try:
        number = float(value)
    except ValueError:
        return None
    if not math.isfinite(number) or number <= 0:
        return None
    return number


def _clock_to_seconds(clock: str) -> float | None:
    """
    Why this exists:
        Read ffmpeg's ``out_time`` progress field.
    When to use:
        On one progress line. The field looks like ``hh:mm:ss.microseconds``.
    What to expect:
        Seconds, or None when the field is ``N/A`` or not a clock.
    """

    parts = clock.split(":")
    if len(parts) != 3:
        return None
    try:
        hours = int(parts[0])
        minutes = int(parts[1])
        seconds = float(parts[2])
    except ValueError:
        return None
    if hours < 0 or minutes < 0 or seconds < 0 or not math.isfinite(seconds):
        return None
    return hours * 3600 + minutes * 60 + seconds
