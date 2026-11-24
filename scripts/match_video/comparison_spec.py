"""Read a side-by-side comparison of match replays from a JSON file.

A comparison names the replays, the labels shown beside each one, and which
replays fill each layout. Capture geometry lives in ``comparison_geometry``;
this module only reads and checks the file.
"""

from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType

from scripts.match_video.comparison_geometry import (
    CAPTURE_HEIGHT,
    CAPTURE_WIDTH,
    DEFAULT_CAPTURE,
    LEGEND_HEIGHT,
    LEGEND_Y,
    TURN_CROP,
    CaptureGeometry,
    CaptureRect,
)

LOGGER = logging.getLogger(__name__)

# Number of replays each layout shows. The quad layout adds a legend card in the fourth cell.
LAYOUT_SIZES = MappingProxyType({"quad": 3, "duo": 2})


class ComparisonError(Exception):
    """
    Why this exists:
        Report a comparison that cannot be composed, without a traceback.
    When to use:
        Raise for a bad comparison file, a missing replay, or an option out of range.
    What to expect:
        The message is written for the person running the command.
    """


@dataclass(frozen=True)
class LegendMask:
    """
    Why this exists:
        Hide text that follows the faction legend until the legend grows past it.
    When to use:
        In ``ReplaySpec.legend_masks``. The game's "View as" label sits just after the
        legend, and a knockout marker such as "(T216)" pushes it to the right.
    What to expect:
        The strip is painted over from ``x`` to its right edge while the replay time is
        before ``until_seconds``.
    """

    # Left edge of the painted area, in pixels from the left of the legend strip.
    x: int
    # Replay time, in seconds, when the mask stops being drawn.
    until_seconds: float


@dataclass(frozen=True)
class ReplaySpec:
    """
    Why this exists:
        Hold one replay's file and the labels the comparison shows for it.
    When to use:
        Read from the comparison file by ``load_comparison_spec``.
    What to expect:
        ``file`` is relative to the source directory given on the command line.
        ``legend_masks`` are sorted by time. ``toolbar_hold_seconds`` None means the legend
        and turn readout follow the replay to its end.
    """

    # Short identifier that the layouts use to pick this replay.
    key: str
    # Video file name, relative to the source directory.
    file: str
    # Version label, such as "v3.0.0".
    version: str
    # Name shown after the version, such as a quoted video title.
    nickname: str
    # Completed turns at the last frame of the comparison, shown beside the version.
    turns_shown: int
    # Optional line shown beside the replay's legend. Empty when there is none.
    note: str
    # Width of the faction legend crop, in source pixels.
    legend_width: int
    # Masks over the end of the legend strip, in time order.
    legend_masks: tuple[LegendMask, ...]
    # Replay time after which the legend and turn readout keep their last picture, or None.
    # A finished match swaps its toolbar for the start menu, which this keeps off screen.
    toolbar_hold_seconds: float | None


@dataclass(frozen=True)
class ComparisonSpec:
    """
    Why this exists:
        Hold everything one comparison file says, after it has been checked.
    When to use:
        As the result of ``load_comparison_spec``; pass it to ``layout_replays``.
    What to expect:
        Every key in ``layouts`` names a replay, and each layout has the size in ``LAYOUT_SIZES``.
        ``capture`` is ``DEFAULT_CAPTURE`` unless the file has a ``capture`` object.
    """

    # Heading on the legend card and the duo header band.
    title: str
    # Line under the heading.
    subtitle: str
    # Small line at the bottom of the legend card and the duo footer band.
    footer: str
    # Every replay the file describes, in file order.
    replays: tuple[ReplaySpec, ...]
    # Replay keys for each layout the file supports, in on-screen order.
    layouts: MappingProxyType[str, tuple[str, ...]]
    # Where the map and the toolbar sit in every replay's frame.
    capture: CaptureGeometry


def load_comparison_spec(path: Path) -> ComparisonSpec:
    """
    Why this exists:
        Turn a comparison file into checked values before any video is decoded.
    When to use:
        At the start of a comparison run, and in tests on the shipped comparisons.
    What to expect:
        A frozen spec. Optional replay fields default to no note, no legend masks, and no
        toolbar hold. A missing ``capture`` object means a plain capture.
    Exceptions:
        ``ComparisonError`` when the file is missing, is not JSON, or breaks a rule above.
    """

    LOGGER.debug("Loading comparison file %s.", path)
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        LOGGER.error("Could not read comparison file %s: %s", path, exc)
        raise ComparisonError(f"Could not read the comparison file {path}.") from exc
    except json.JSONDecodeError as exc:
        LOGGER.error("Comparison file %s is not valid JSON: %s", path, exc)
        raise ComparisonError(f"The comparison file {path} is not valid JSON: {exc}") from exc
    root = _require_object(payload, "the comparison file")
    replays = tuple(_replay_from(item, index) for index, item in enumerate(_require_list(root, "replays")))
    keys = [replay.key for replay in replays]
    if len(set(keys)) != len(keys):
        raise ComparisonError("Each replay key must be unique.")
    layouts = _layouts_from(_require_object(root.get("layouts"), "layouts"), set(keys))
    spec = ComparisonSpec(
        title=_text(root, "title"),
        subtitle=_text(root, "subtitle"),
        footer=_text(root, "footer", ""),
        replays=replays,
        layouts=layouts,
        capture=_capture_from(root.get("capture")),
    )
    LOGGER.debug("Loaded %d replays and layouts %s from %s.", len(replays), sorted(layouts), path)
    return spec


def layout_replays(spec: ComparisonSpec, layout: str) -> tuple[ReplaySpec, ...]:
    """
    Why this exists:
        Pick the replays one layout shows, in the order they appear on screen.
    When to use:
        Before probing durations and before building the filter graph.
    What to expect:
        Quad order is top left, top right, bottom right. Duo order is left, right.
    Exceptions:
        ``ComparisonError`` when the comparison file does not define that layout.
    """

    LOGGER.debug("Selecting replays for the %s layout.", layout)
    keys = spec.layouts.get(layout)
    if keys is None:
        defined = ", ".join(sorted(spec.layouts)) or "none"
        raise ComparisonError(f"The comparison file has no {layout} layout. Defined: {defined}.")
    by_key = {replay.key: replay for replay in spec.replays}
    return tuple(by_key[key] for key in keys)


def _replay_from(item: object, index: int) -> ReplaySpec:
    """
    Why this exists:
        Check one entry of the ``replays`` list.
    When to use:
        From ``load_comparison_spec``, once per entry.
    What to expect:
        A replay whose legend masks lie inside its legend strip, sorted by time.
    Exceptions:
        ``ComparisonError`` naming the entry when a field is missing or out of range.
    """

    where = f"replays[{index}]"
    entry = _require_object(item, where)
    legend_width = _positive_int(entry, "legend_width", where)
    raw_masks = entry.get("legend_masks", [])
    if not isinstance(raw_masks, list):
        raise ComparisonError(f"{where}.legend_masks must be a list.")
    masks = tuple(
        sorted(
            (_mask_from(raw, f"{where}.legend_masks[{position}]", legend_width)
             for position, raw in enumerate(raw_masks)),
            key=lambda mask: mask.until_seconds,
        )
    )
    return ReplaySpec(
        key=_text(entry, "key", where=where),
        file=_text(entry, "file", where=where),
        version=_text(entry, "version", where=where),
        nickname=_text(entry, "nickname", where=where),
        turns_shown=_positive_int(entry, "turns_shown", where),
        note=_text(entry, "note", "", where=where),
        legend_width=legend_width,
        legend_masks=masks,
        toolbar_hold_seconds=_optional_seconds(entry, "toolbar_hold_seconds", where),
    )


def _capture_from(item: object) -> CaptureGeometry:
    """
    Why this exists:
        Check the optional ``capture`` object against the 1920x1080 source frame.
    When to use:
        From ``load_comparison_spec``, with the field's value or None when it is absent.
    What to expect:
        ``DEFAULT_CAPTURE`` for None. Otherwise a geometry whose missing fields keep their
        default, with every crop inside the frame.
    Exceptions:
        ``ComparisonError`` when a value is not a whole number or a crop leaves the frame.
    """

    if item is None:
        return DEFAULT_CAPTURE
    entry = _require_object(item, "capture")
    shift = entry.get("toolbar_shift_y", DEFAULT_CAPTURE.toolbar_shift_y)
    lowest = -min(LEGEND_Y, TURN_CROP.y)
    highest = CAPTURE_HEIGHT - max(LEGEND_Y + LEGEND_HEIGHT, TURN_CROP.y + TURN_CROP.height)
    if not isinstance(shift, int) or isinstance(shift, bool) or not lowest <= shift <= highest:
        raise ComparisonError(f"capture.toolbar_shift_y must be a whole number from {lowest} to {highest}.")
    raw_crop = entry.get("map_crop")
    if raw_crop is None:
        return CaptureGeometry(DEFAULT_CAPTURE.map_crop, shift)
    crop_entry = _require_object(raw_crop, "capture.map_crop")
    values = [crop_entry.get(field) for field in CaptureRect._fields]
    if not all(isinstance(value, int) and not isinstance(value, bool) for value in values):
        raise ComparisonError("capture.map_crop needs whole numbers for x, y, width, and height.")
    crop = CaptureRect(*values)
    inside = (
        crop.x >= 0
        and crop.y >= 0
        and crop.width > 0
        and crop.height > 0
        and crop.x + crop.width <= CAPTURE_WIDTH
        and crop.y + crop.height <= CAPTURE_HEIGHT
    )
    if not inside:
        raise ComparisonError(f"capture.map_crop must lie inside the {CAPTURE_WIDTH}x{CAPTURE_HEIGHT} frame.")
    return CaptureGeometry(crop, shift)


def _optional_seconds(entry: dict, field: str, where: str) -> float | None:
    """
    Why this exists:
        Read an optional replay time that must be above zero when it is given.
    When to use:
        For ``toolbar_hold_seconds``.
    What to expect:
        The time in seconds, or None when the field is absent.
    Exceptions:
        ``ComparisonError`` when the field is not a positive, finite number.
    """

    value = entry.get(field)
    if value is None:
        return None
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or value <= 0:
        raise ComparisonError(f"{where}.{field} must be a positive number of seconds.")
    return float(value)


def _mask_from(item: object, where: str, legend_width: int) -> LegendMask:
    """
    Why this exists:
        Check one legend mask against the strip it paints over.
    When to use:
        From ``_replay_from`` for each entry of ``legend_masks``.
    What to expect:
        A mask whose left edge is inside the strip and whose end time is positive.
    Exceptions:
        ``ComparisonError`` when the edge or the time is out of range.
    """

    entry = _require_object(item, where)
    x = entry.get("x")
    until = entry.get("until_seconds")
    if not isinstance(x, int) or isinstance(x, bool) or not 0 <= x < legend_width:
        raise ComparisonError(f"{where}.x must be a whole number from 0 to {legend_width - 1}.")
    if not isinstance(until, (int, float)) or isinstance(until, bool) or not math.isfinite(until) or until <= 0:
        raise ComparisonError(f"{where}.until_seconds must be a positive number of seconds.")
    return LegendMask(x, float(until))


def _layouts_from(raw: dict, keys: set[str]) -> MappingProxyType[str, tuple[str, ...]]:
    """
    Why this exists:
        Check that each layout names known replays and the right number of them.
    When to use:
        From ``load_comparison_spec`` after the replays are read.
    What to expect:
        A read-only mapping from layout name to replay keys. At least one layout is defined.
    Exceptions:
        ``ComparisonError`` for an unknown layout, an unknown key, a repeat, or a wrong count.
    """

    layouts: dict[str, tuple[str, ...]] = {}
    for name, value in raw.items():
        size = LAYOUT_SIZES.get(name)
        if size is None:
            raise ComparisonError(f"Unknown layout {name!r}. Use one of: {', '.join(LAYOUT_SIZES)}.")
        if not isinstance(value, list) or not all(isinstance(key, str) for key in value):
            raise ComparisonError(f"layouts.{name} must be a list of replay keys.")
        if len(value) != size:
            raise ComparisonError(f"layouts.{name} must name exactly {size} replays.")
        if len(set(value)) != len(value):
            raise ComparisonError(f"layouts.{name} names a replay more than once.")
        unknown = [key for key in value if key not in keys]
        if unknown:
            raise ComparisonError(f"layouts.{name} names unknown replays: {', '.join(unknown)}.")
        layouts[name] = tuple(value)
    if not layouts:
        raise ComparisonError("The comparison file must define at least one layout.")
    return MappingProxyType(layouts)


def _require_object(value: object, where: str) -> dict:
    """
    Why this exists:
        Give a readable error when a JSON object is expected.
    When to use:
        On the file root, ``layouts``, each replay, and each legend mask.
    What to expect:
        The value itself when it is a JSON object.
    Exceptions:
        ``ComparisonError`` when it is anything else.
    """

    if not isinstance(value, dict):
        raise ComparisonError(f"{where} must be a JSON object.")
    return value


def _require_list(entry: dict, field: str) -> list:
    """
    Why this exists:
        Give a readable error when a non-empty JSON list is expected.
    When to use:
        On the ``replays`` field.
    What to expect:
        The list when it has at least one item.
    Exceptions:
        ``ComparisonError`` when the field is missing, not a list, or empty.
    """

    value = entry.get(field)
    if not isinstance(value, list) or not value:
        raise ComparisonError(f"{field} must be a non-empty list.")
    return value


def _text(entry: dict, field: str, default: str | None = None, where: str = "the comparison file") -> str:
    """
    Why this exists:
        Read a text field, with an optional default for fields that may be left out.
    When to use:
        For titles, labels, file names, and notes.
    What to expect:
        The string, or ``default`` when the field is absent and a default is given.
    Exceptions:
        ``ComparisonError`` when a required field is missing or a field is not text.
    """

    value = entry.get(field, default)
    if value is None:
        raise ComparisonError(f"{where} is missing {field}.")
    if not isinstance(value, str):
        raise ComparisonError(f"{where}.{field} must be text.")
    return value


def _positive_int(entry: dict, field: str, where: str) -> int:
    """
    Why this exists:
        Read a required whole-number field that must be above zero.
    When to use:
        For ``turns_shown`` and ``legend_width``.
    What to expect:
        The number.
    Exceptions:
        ``ComparisonError`` when the field is missing, not a whole number, or not positive.
    """

    value = entry.get(field)
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
        raise ComparisonError(f"{where}.{field} must be a whole number above 0.")
    return value
