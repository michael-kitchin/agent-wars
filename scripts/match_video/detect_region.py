"""Rectangle of pixels used to decide whether a frame is a duplicate.

The origin is the top-left of the frame. ``x1,y1`` is included and ``x2,y2`` is not.
``None`` means the whole frame. The rectangle is only for detection; the written video is not cropped.
"""

from __future__ import annotations

import logging
from typing import NamedTuple

from scripts.match_video.keep_plan import CondenseError

LOGGER = logging.getLogger(__name__)


class DetectRegion(NamedTuple):
    """
    Why this exists:
        Name the pixel box duplicate detection inspects.
    When to use:
        As ``CondenseConfig.detect_region``. ``None`` on that field means the whole frame instead.
    What to expect:
        ``x2`` is to the right of ``x1`` and ``y2`` is below ``y1``. Both ends are excluded.
    """

    # Left edge, included. Grows to the right.
    x1: int
    # Top edge, included. Grows downward.
    y1: int
    # Right edge, excluded.
    x2: int
    # Bottom edge, excluded.
    y2: int


def parse_detect_region(text: str) -> DetectRegion:
    """
    Why this exists:
        Read ``x1,y1,x2,y2`` from the command line.
    When to use:
        On the ``--detect-region`` value, before the recording is opened.
    What to expect:
        A region with integer pixel edges. Surrounding spaces are ignored.
    Exceptions:
        ``CondenseError`` when the text is not four ordered pixel coordinates.
    """

    LOGGER.debug("Parsing detect region %r.", text)
    parts = [part.strip() for part in text.split(",")]
    if len(parts) != 4:
        raise CondenseError("Detect region must be four integers: x1,y1,x2,y2.")
    try:
        x1, y1, x2, y2 = (int(part) for part in parts)
    except ValueError as exc:
        LOGGER.error("Detect region %r is not four integers: %s", text, exc)
        raise CondenseError("Detect region must be four integers: x1,y1,x2,y2.") from exc
    region = DetectRegion(x1, y1, x2, y2)
    require_ordered_region(region)
    LOGGER.debug("Detect region is %s.", _format_region(region))
    return region


def require_ordered_region(region: DetectRegion) -> None:
    """
    Why this exists:
        Reject a box that does not have a positive width and height.
    When to use:
        After parsing a region, and again when a config object is checked.
    What to expect:
        Returns when ``x1,y1`` is the top-left and ``x2,y2`` is strictly below and to the right.
    Exceptions:
        ``CondenseError`` when a coordinate is negative or the box is empty or backwards.
    """

    LOGGER.debug("Checking detect region order %s.", _format_region(region))
    if region.x1 < 0 or region.y1 < 0 or region.x2 <= region.x1 or region.y2 <= region.y1:
        raise CondenseError(
            "Detect region x1,y1,x2,y2 needs x1 < x2 and y1 < y2, with x1 and y1 at least 0. "
            f"Got {_format_region(region)}."
        )


def require_region_inside_frame(region: DetectRegion, width: int, height: int) -> None:
    """
    Why this exists:
        A crop past the edge of the picture cannot be detected.
    When to use:
        After the recording's frame size is known.
    What to expect:
        Returns when the box lies inside the frame.
    Exceptions:
        ``CondenseError`` when the box extends past ``width`` or ``height``.
    """

    LOGGER.debug("Checking detect region %s against %dx%d.", _format_region(region), width, height)
    require_ordered_region(region)
    if region.x2 > width or region.y2 > height:
        raise CondenseError(
            f"Detect region {_format_region(region)} does not fit in a {width}x{height} frame."
        )


def align_region_to_even_pixels(region: DetectRegion, width: int, height: int) -> DetectRegion:
    """
    Why this exists:
        A yuv420 recording can only be cropped on even pixel boundaries.
    When to use:
        After ``require_region_inside_frame``, before building the detection crop.
    What to expect:
        Even edges that still cover the requested box when the frame allows it.
        An edge that would leave the frame is pulled inward instead.
        An already even region is returned unchanged.
    Exceptions:
        ``CondenseError`` when the frame cannot hold an even crop of that box.
    """

    LOGGER.debug("Aligning detect region %s to even pixels.", _format_region(region))
    x1 = region.x1 - (region.x1 % 2)
    y1 = region.y1 - (region.y1 % 2)
    x2 = _even_end(region.x2, width)
    y2 = _even_end(region.y2, height)
    aligned = DetectRegion(x1, y1, x2, y2)
    if aligned.x2 <= aligned.x1 or aligned.y2 <= aligned.y1:
        raise CondenseError(
            f"Detect region {_format_region(region)} cannot be placed on even pixels "
            f"inside a {width}x{height} frame."
        )
    require_region_inside_frame(aligned, width, height)
    if aligned != region:
        LOGGER.info(
            "Shifted the detect region from %s to even pixels %s.",
            _format_region(region),
            _format_region(aligned),
        )
    return aligned


def build_detection_filters(
    freeze_noise: float,
    minimum_seconds: float,
    compare_width: int,
    region: DetectRegion | None,
) -> list[str]:
    """
    Why this exists:
        Build the detection filter chain. Cropping here does not affect the written video.
    When to use:
        For the scan pass only. Pass ``None`` to inspect the whole frame.
    What to expect:
        ``freezedetect`` last. A region adds ``crop`` first. A positive compare width adds ``scale``
        after the crop. ``None`` leaves the frame uncropped.
    Exceptions:
        ``CondenseError`` when a region still has an odd edge. Align it before calling this.
    """

    LOGGER.debug(
        "Building detection filters. noise=%s minimum=%s compare_width=%s region=%s",
        freeze_noise,
        minimum_seconds,
        compare_width,
        None if region is None else _format_region(region),
    )
    filters: list[str] = []
    if region is not None:
        if any(value % 2 for value in region):
            raise CondenseError(
                f"Detect region {_format_region(region)} must use even pixel edges before it is cropped."
            )
        filters.append(f"crop={region.x2 - region.x1}:{region.y2 - region.y1}:{region.x1}:{region.y1}")
    if compare_width > 0:
        filters.append(f"scale={compare_width}:-2")
    filters.append(f"freezedetect=noise={freeze_noise:.8f}:duration={minimum_seconds:.6f}")
    return filters


def _even_end(value: int, limit: int) -> int:
    """
    Why this exists:
        Move an excluded edge onto an even pixel without leaving the frame.
    When to use:
        While aligning one edge of a detect region.
    What to expect:
        ``value`` when it is already even and inside the frame. Otherwise the next even pixel
        at or below ``limit``, preferring the even pixel just past ``value`` when it fits.
    """

    if value % 2 == 0 and value <= limit:
        return value
    expanded = value + (value % 2)
    if expanded <= limit:
        return expanded
    return value - (value % 2)


def _format_region(region: DetectRegion) -> str:
    """
    Why this exists:
        Print a region the same way the command line accepts it.
    When to use:
        In errors and logs.
    What to expect:
        ``x1,y1,x2,y2`` with no spaces.
    """

    return f"{region.x1},{region.y1},{region.x2},{region.y2}"
