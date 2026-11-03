"""Decide which stretches of a recording to keep.

A frozen stretch is a run of near-duplicate frames. The plan keeps the start of
each stretch for a caller-chosen buffer and drops the rest. Motion on either
side stays in the timeline at its original length.
"""

from __future__ import annotations

import logging
import math
from collections.abc import Sequence
from fractions import Fraction
from typing import NamedTuple

LOGGER = logging.getLogger(__name__)


class CondenseError(Exception):
    """
    Why this exists:
        Distinguish a recording that cannot be condensed from a programming fault.
    When to use:
        Raise it for a missing tool, a bad option, or an ffmpeg failure.
    What to expect:
        The command line logs the message and returns exit code 1.
    """


class TimeSpan(NamedTuple):
    """
    Why this exists:
        Name a half-open stretch of source time without carrying frame indexes.
    When to use:
        For a frozen stretch, or for a stretch that stays in the output.
    What to expect:
        ``end_seconds`` is not included. Adjacent spans can meet without overlapping.
    """

    # First second included in the stretch.
    start_seconds: float
    # First second after the stretch.
    end_seconds: float


class FreezeEvent(NamedTuple):
    """
    Why this exists:
        Remember a freeze whose end ffmpeg has not printed yet.
    When to use:
        As one result from ``parse_freezedetect_log``, before the video duration is known.
    What to expect:
        ``end_seconds`` is None when the recording ends during the freeze.
    """

    # First frozen second reported by ffmpeg.
    start_seconds: float
    # First second after the freeze, or None when ffmpeg omitted the end.
    end_seconds: float | None


def parse_freezedetect_log(log_text: str) -> list[FreezeEvent]:
    """
    Why this exists:
        Turn ffmpeg's freezedetect lines into freeze starts and ends.
    When to use:
        On the stderr of a detection pass. Field separators may be ``:`` or ``=``.
    What to expect:
        One event per freeze, in log order. An event with only a start has ``end_seconds`` None.
        A duration is used only when an end line never arrives.
    """

    LOGGER.debug("Parsing freezedetect log of %d characters.", len(log_text))
    events: list[FreezeEvent] = []
    pending_start: float | None = None
    pending_duration: float | None = None

    def commit(end_seconds: float | None) -> None:
        """
        Why this exists:
            Store one freeze and clear the fields that belong to the next one.
        When to use:
            When an end line arrives, or when a new start means the previous freeze is finished.
        What to expect:
            Appends one event. Does nothing when no start is pending.
        """

        nonlocal pending_start, pending_duration
        if pending_start is None:
            return
        events.append(FreezeEvent(pending_start, end_seconds))
        pending_start = None
        pending_duration = None

    for line in log_text.splitlines():
        kind, number = _freeze_field(line)
        if kind is None or number is None:
            continue
        if kind == "start":
            if pending_start is not None:
                inferred = None if pending_duration is None else pending_start + pending_duration
                commit(inferred)
            pending_start = number
            pending_duration = None
        elif kind == "duration" and pending_start is not None:
            pending_duration = number
        elif kind == "end" and pending_start is not None:
            commit(number)
    if pending_start is not None:
        inferred = None if pending_duration is None else pending_start + pending_duration
        commit(inferred)
    LOGGER.debug("Parsed %d freeze event(s).", len(events))
    return events


def finish_freezes(events: Sequence[FreezeEvent], duration_seconds: float) -> list[TimeSpan]:
    """
    Why this exists:
        Close a freeze that runs to the end of the file, and clamp the rest to the timeline.
    When to use:
        After ``parse_freezedetect_log``, once the container duration is known.
    What to expect:
        Non-overlapping spans sorted by start. A missing end becomes ``duration_seconds``.
        Spans outside the video are dropped.
    Exceptions:
        ``ValueError`` when ``duration_seconds`` is not a positive finite number.
    """

    LOGGER.debug("Closing %d freeze event(s) against %.3f seconds.", len(events), duration_seconds)
    _require_positive(duration_seconds, "duration")
    closed: list[TimeSpan] = []
    for event in events:
        end_seconds = duration_seconds if event.end_seconds is None else event.end_seconds
        start_seconds = max(0.0, event.start_seconds)
        end_seconds = min(duration_seconds, end_seconds)
        if end_seconds <= start_seconds:
            continue
        closed.append(TimeSpan(start_seconds, end_seconds))
    closed.sort()
    merged: list[TimeSpan] = []
    for span in closed:
        if not merged or span.start_seconds > merged[-1].end_seconds:
            merged.append(span)
            continue
        previous = merged[-1]
        merged[-1] = TimeSpan(previous.start_seconds, max(previous.end_seconds, span.end_seconds))
    LOGGER.debug("Usable frozen stretches: %d.", len(merged))
    return merged


def build_keep_intervals(
    duration_seconds: float,
    freezes: Sequence[TimeSpan],
    still_keep_seconds: float,
    frame_seconds: float,
) -> list[TimeSpan]:
    """
    Why this exists:
        Decide which source times survive. Each freeze keeps a short head and loses the tail.
    When to use:
        After freezes have been closed against the container duration.
    What to expect:
        Half-open spans. Motion is kept. The first ``still_keep_seconds`` of each freeze is kept.
        A freeze shorter than the buffer is kept whole. If nothing would remain, the first frame
        is kept so the output is not empty.
    Exceptions:
        ``ValueError`` when the duration, buffer, or frame length is not usable.
    """

    LOGGER.debug(
        "Building keep intervals. duration=%.3f freezes=%d still_keep=%.3f frame=%.6f",
        duration_seconds,
        len(freezes),
        still_keep_seconds,
        frame_seconds,
    )
    _require_positive(duration_seconds, "duration")
    _require_positive(frame_seconds, "frame length")
    if not math.isfinite(still_keep_seconds) or still_keep_seconds < 0:
        raise ValueError("still_keep_seconds must be zero or a positive finite number.")
    cursor = 0.0
    spans: list[TimeSpan] = []
    slop = frame_seconds * 0.25
    for freeze in sorted(freezes):
        start_seconds = min(max(freeze.start_seconds, 0.0), duration_seconds)
        end_seconds = min(max(freeze.end_seconds, 0.0), duration_seconds)
        if end_seconds <= start_seconds:
            continue
        keep_end = min(end_seconds, start_seconds + still_keep_seconds)
        segment_end = max(cursor, keep_end)
        if segment_end > cursor + slop:
            spans.append(TimeSpan(cursor, segment_end))
        cursor = max(cursor, end_seconds)
    if duration_seconds > cursor + slop:
        spans.append(TimeSpan(cursor, duration_seconds))
    if not spans:
        spans.append(TimeSpan(0.0, min(duration_seconds, frame_seconds)))
    merged = _merge_spans(spans, frame_seconds * 0.5)
    LOGGER.debug("Keep intervals: %d, planned %.3f seconds.", len(merged), span_seconds(merged))
    return merged


def covers_full_timeline(spans: Sequence[TimeSpan], duration_seconds: float, frame_seconds: float) -> bool:
    """
    Why this exists:
        A plan that keeps the whole timeline only needs its audio removed, not a new picture encode.
    When to use:
        After ``build_keep_intervals``.
    What to expect:
        True when one span runs from the start of the file to within a frame of the end.
    """

    LOGGER.debug("Checking whether %d span(s) cover %.3f seconds.", len(spans), duration_seconds)
    if len(spans) != 1:
        return False
    span = spans[0]
    return span.start_seconds <= frame_seconds and span.end_seconds >= duration_seconds - frame_seconds


def build_select_filter(
    spans: Sequence[TimeSpan],
    frames_per_second: Fraction,
    duration_seconds: float,
) -> str:
    """
    Why this exists:
        Ask ffmpeg to keep the planned stretches in one decode and close the gaps.
    When to use:
        When the plan does not cover the full timeline, so the picture must be re-encoded.
    What to expect:
        A ``select`` plus ``setpts`` graph. Commas inside ``select`` are escaped.
        The span that reaches the end of the file is padded by one frame so rounding does not
        drop the last source frame.
    Exceptions:
        ``ValueError`` when nothing remains or the frame rate is not positive.
    """

    LOGGER.debug("Building a select filter for %d span(s).", len(spans))
    if not spans:
        raise ValueError("No video remains after removing frozen stretches.")
    if frames_per_second <= 0:
        raise ValueError("frames_per_second must be positive.")
    frame_seconds = 1.0 / float(frames_per_second)
    terms: list[str] = []
    for span in spans:
        end_seconds = span.end_seconds
        if duration_seconds - end_seconds <= frame_seconds:
            end_seconds += frame_seconds
        terms.append(f"gte(t\\,{span.start_seconds:.6f})*lt(t\\,{end_seconds:.6f})")
    rate = format(float(frames_per_second), ".10f")
    graph = f"select={'+'.join(terms)},setpts=N/({rate}*TB)"
    if len(graph) <= 500:
        LOGGER.debug("Select filter: %s", graph)
    else:
        LOGGER.debug("Select filter length: %d characters.", len(graph))
    return graph


def span_seconds(spans: Sequence[TimeSpan]) -> float:
    """
    Why this exists:
        Sum the kept stretches for the log and the encode progress total.
    When to use:
        After a keep plan exists.
    What to expect:
        The total length in seconds. An empty plan returns 0.
    """

    LOGGER.debug("Summing %d keep span(s).", len(spans))
    return sum(span.end_seconds - span.start_seconds for span in spans)


def format_timestamp(seconds: float) -> str:
    """
    Why this exists:
        Show a duration in the log as clock time.
    When to use:
        On a duration that will be printed to the user.
    What to expect:
        ``m:ss`` under an hour, and ``h:mm:ss`` at an hour or more. Negative input is shown as zero.
    """

    total = max(0, int(round(seconds)))
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def _freeze_field(line: str) -> tuple[str | None, float | None]:
    """
    Why this exists:
        Read one freezedetect field without depending on the log prefix.
    When to use:
        On each stderr line from a detection pass.
    What to expect:
        ``start``, ``duration``, or ``end``, plus the number. ``(None, None)`` when the line is unrelated.
    """

    marker = "freezedetect.freeze_"
    index = line.find(marker)
    if index < 0:
        return None, None
    rest = line[index + len(marker):]
    kind, separator, raw_value = rest.partition("=")
    if separator == "":
        kind, separator, raw_value = rest.partition(":")
    if separator == "" or kind.strip() not in {"start", "duration", "end"}:
        return None, None
    token = raw_value.strip().split()[0] if raw_value.strip() else ""
    try:
        number = float(token)
    except ValueError:
        return None, None
    if not math.isfinite(number):
        return None, None
    return kind.strip(), number


def _merge_spans(spans: Sequence[TimeSpan], gap_seconds: float) -> list[TimeSpan]:
    """
    Why this exists:
        Join keep stretches that meet, so a tiny gap does not force a re-encode.
    When to use:
        At the end of ``build_keep_intervals``.
    What to expect:
        Spans in order. A gap of at most ``gap_seconds`` is absorbed.
    """

    if not spans:
        return []
    merged = [spans[0]]
    for span in spans[1:]:
        previous = merged[-1]
        if span.start_seconds <= previous.end_seconds + gap_seconds:
            merged[-1] = TimeSpan(previous.start_seconds, max(previous.end_seconds, span.end_seconds))
        else:
            merged.append(span)
    return merged


def _require_positive(value: float, label: str) -> None:
    """
    Why this exists:
        Keep a bad duration or frame length from building a backwards cut plan.
    When to use:
        At the start of timeline helpers.
    What to expect:
        Returns when ``value`` is finite and greater than zero.
    Exceptions:
        ``ValueError`` otherwise.
    """

    if not math.isfinite(value) or value <= 0:
        raise ValueError(f"{label} must be a positive finite number.")
