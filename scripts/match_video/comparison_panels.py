"""Draw the static PNG panels that frame a replay comparison.

Each panel is drawn once with Pillow and overlaid for the whole video. The live
pieces, the faction legend and the turn readout, are cropped from the replays by
``comparison_graph`` and placed at the positions these functions return.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from functools import lru_cache
from pathlib import Path
from types import MappingProxyType
from typing import NamedTuple

from PIL import Image, ImageDraw, ImageFont

from scripts.match_video.comparison_geometry import (
    BACKGROUND_RGB,
    CANVAS_WIDTH,
    DUO_BAND_HEIGHT,
    PANE_HEIGHT,
    PANE_WIDTH,
    QUAD_REPLAY_PLACES,
    TURN_CROP,
    CanvasPoint,
)
from scripts.match_video.comparison_spec import ComparisonSpec, ReplaySpec

LOGGER = logging.getLogger(__name__)

# Opaque panel fill. It matches the toolbar, so the cropped turn readout blends in.
_PANEL_RGBA = (*BACKGROUND_RGB, 255)
# Primary text.
_TEXT_RGB = (236, 240, 245)
# Secondary text: nicknames, turn counts, notes, and footers.
_MUTED_RGB = (150, 162, 178)
# Rule under the legend card heading.
_RULE_RGB = (44, 58, 76)

# Font files tried in order. Segoe UI matches the game on Windows; the others cover Linux and macOS.
_FONT_FILES = MappingProxyType({
    "bold": (
        "C:/Windows/Fonts/segoeuib.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "arialbd.ttf",
        "DejaVuSans-Bold.ttf",
    ),
    "regular": (
        "C:/Windows/Fonts/segoeui.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "arial.ttf",
        "DejaVuSans.ttf",
    ),
})

# Tag panel height. It covers the minimap in the map crop's top-left corner.
_TAG_HEIGHT = 126
# Narrowest tag panel, so the minimap stays hidden behind short labels.
_TAG_MIN_WIDTH = 180
# Corner radius of the tag panel's lower-right corner.
_TAG_RADIUS = 10
# Left and right margin inside the legend card and the duo bands.
_MARGIN = 44
# Vertical distance between replay rows on the legend card.
_CARD_ROW_HEIGHT = 106
# Top of the first replay row on the legend card.
_CARD_FIRST_ROW_Y = 154
# How far a legend strip is shifted left of the text margin, so its color dots line up with the text.
_LEGEND_INSET = 6
# Space between a card row's nickname and its turn count. The count follows the nickname, so the
# right side of the card stays clear for a presenter's camera.
_CARD_DETAIL_GAP = 10


class _VersionLineStyle(NamedTuple):
    """
    Why this exists:
        Keep the type sizes and spacing of a "version + nickname" line together.
    When to use:
        Pass ``_CARD_VERSION_STYLE`` or ``_DUO_VERSION_STYLE`` to ``_draw_version_line``.
    What to expect:
        Sizes are font pixel sizes. Offsets are in pixels.
    """

    # Font size of the bold version.
    version_size: int
    # Font size of the nickname.
    nickname_size: int
    # Space between the version and the nickname.
    gap: int
    # How far the nickname sits below the version's top, so the two share a baseline.
    nickname_drop: int


# Replay rows on the quad legend card.
_CARD_VERSION_STYLE = _VersionLineStyle(26, 19, 14, 6)
# Pane headings in the duo header band.
_DUO_VERSION_STYLE = _VersionLineStyle(32, 22, 16, 8)


def render_tag_panel(replay: ReplaySpec, path: Path) -> CanvasPoint:
    """
    Why this exists:
        Label a replay pane with its version and nickname, and hide the minimap under it.
    When to use:
        Once per replay pane. Overlay the PNG at the pane's top-left corner.
    What to expect:
        Writes an RGBA PNG and returns where the turn readout goes, relative to the panel.
        The panel is wide enough for the labels and the readout, and at least ``_TAG_MIN_WIDTH``.
    """

    LOGGER.debug("Drawing the tag panel for %s at %s.", replay.key, path)
    bold, regular = _font("bold", 26), _font("regular", 16)
    probe = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    label_width = max(probe.textlength(replay.version, font=bold), probe.textlength(replay.nickname, font=regular))
    width = max(int(max(label_width, TURN_CROP.width)) + 28, _TAG_MIN_WIDTH)
    image = Image.new("RGBA", (width, _TAG_HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((-12, -12, width - 1, _TAG_HEIGHT - 1), radius=_TAG_RADIUS, fill=_PANEL_RGBA)
    draw.text((14, 10), replay.version, font=bold, fill=_TEXT_RGB, anchor="la")
    draw.text((14, 46), replay.nickname, font=regular, fill=_MUTED_RGB, anchor="la")
    image.save(path)
    return CanvasPoint(width - TURN_CROP.width - 8, _TAG_HEIGHT - TURN_CROP.height - 6)


def render_quad_card(spec: ComparisonSpec, replays: Sequence[ReplaySpec], path: Path) -> dict[str, CanvasPoint]:
    """
    Why this exists:
        Fill the quad layout's fourth cell with the title and one row per replay.
    When to use:
        For the quad layout. Overlay the PNG at ``QUAD_CARD_ORIGIN``.
    What to expect:
        Writes a pane-sized RGB PNG. Each row shows the version, nickname, turns shown,
        which pane the replay is in, and its note. Returns where each replay's live legend
        goes, keyed by replay key and relative to the card.
    """

    LOGGER.debug("Drawing the quad legend card for %d replays at %s.", len(replays), path)
    image = Image.new("RGB", (PANE_WIDTH, PANE_HEIGHT), BACKGROUND_RGB)
    draw = ImageDraw.Draw(image)
    draw.text((_MARGIN, 34), spec.title, font=_font("bold", 40), fill=_TEXT_RGB, anchor="la")
    draw.text((_MARGIN, 88), spec.subtitle, font=_font("regular", 20), fill=_MUTED_RGB, anchor="la")
    draw.line((_MARGIN, 130, PANE_WIDTH - _MARGIN, 130), fill=_RULE_RGB, width=2)
    note_x = _MARGIN - _LEGEND_INSET + max(replay.legend_width for replay in replays) + 24
    small = _font("regular", 16)
    legend_points: dict[str, CanvasPoint] = {}
    for row, (replay, place) in enumerate(zip(replays, QUAD_REPLAY_PLACES)):
        y = _CARD_FIRST_ROW_Y + row * _CARD_ROW_HEIGHT
        nickname_end = _draw_version_line(draw, replay, CanvasPoint(_MARGIN, y), _CARD_VERSION_STYLE)
        draw.text(
            (nickname_end + _CARD_DETAIL_GAP, y + 8),
            f"\u00b7 {replay.turns_shown} turns \u00b7 {place}",
            font=small,
            fill=_MUTED_RGB,
            anchor="la",
        )
        legend_points[replay.key] = CanvasPoint(_MARGIN - _LEGEND_INSET, y + 44)
        if replay.note:
            note = _fit(draw, replay.note, small, PANE_WIDTH - _MARGIN - note_x)
            draw.text((note_x, y + 49), note, font=small, fill=_MUTED_RGB, anchor="la")
    draw.text((_MARGIN, PANE_HEIGHT - 40), spec.footer, font=_font("regular", 15), fill=_MUTED_RGB, anchor="la")
    image.save(path)
    return legend_points


def render_duo_bands(
    spec: ComparisonSpec,
    replays: Sequence[ReplaySpec],
    top_path: Path,
    bottom_path: Path,
) -> dict[str, CanvasPoint]:
    """
    Why this exists:
        Frame the duo layout's two panes with a header band and a footer band.
    When to use:
        For the duo layout. Overlay the header at the top of the canvas and the footer
        at ``DUO_FOOTER_Y``.
    What to expect:
        Writes two RGB PNGs as wide as the canvas. The header holds the title and, above
        each pane, its version, nickname, and turns shown. The footer holds each note and
        the footer line. Returns where each live legend goes, in canvas pixels.
    """

    LOGGER.debug("Drawing the duo bands at %s and %s.", top_path, bottom_path)
    header = Image.new("RGB", (CANVAS_WIDTH, DUO_BAND_HEIGHT), BACKGROUND_RGB)
    draw = ImageDraw.Draw(header)
    center = CANVAS_WIDTH // 2
    draw.text((center, 30), spec.title, font=_font("bold", 40), fill=_TEXT_RGB, anchor="ma")
    draw.text((center, 84), spec.subtitle, font=_font("regular", 20), fill=_MUTED_RGB, anchor="ma")
    legend_points: dict[str, CanvasPoint] = {}
    for column, replay in enumerate(replays):
        left = column * PANE_WIDTH
        _draw_version_line(draw, replay, CanvasPoint(left + _MARGIN, 146), _DUO_VERSION_STYLE)
        draw.text(
            (left + PANE_WIDTH - _MARGIN, 156),
            f"{replay.turns_shown} turns",
            font=_font("regular", 18),
            fill=_MUTED_RGB,
            anchor="ra",
        )
        legend_points[replay.key] = CanvasPoint(left + _MARGIN - _LEGEND_INSET, 204)
    header.save(top_path)

    footer = Image.new("RGB", (CANVAS_WIDTH, DUO_BAND_HEIGHT), BACKGROUND_RGB)
    draw = ImageDraw.Draw(footer)
    note_font = _font("regular", 24)
    for column, replay in enumerate(replays):
        if replay.note:
            left = column * PANE_WIDTH + _MARGIN
            note = _fit(draw, replay.note, note_font, PANE_WIDTH - 2 * _MARGIN)
            draw.text((left, 36), note, font=note_font, fill=_TEXT_RGB, anchor="la")
    draw.text((center, DUO_BAND_HEIGHT - 44), spec.footer, font=_font("regular", 16), fill=_MUTED_RGB, anchor="ma")
    footer.save(bottom_path)
    return legend_points


def _draw_version_line(
    draw: ImageDraw.ImageDraw,
    replay: ReplaySpec,
    origin: CanvasPoint,
    style: _VersionLineStyle,
) -> float:
    """
    Why this exists:
        Draw the bold version and the nickname after it the same way on the card and the header.
    When to use:
        For each replay row on the legend card and each pane heading in the duo header.
    What to expect:
        The version in bold with its top-left at ``origin``, then the nickname in regular
        text on the same line, sized and spaced by ``style``. Returns the x of the nickname's
        right edge, so more text can follow it.
    """

    bold = _font("bold", style.version_size)
    regular = _font("regular", style.nickname_size)
    draw.text(origin, replay.version, font=bold, fill=_TEXT_RGB, anchor="la")
    nickname_x = origin.x + draw.textlength(replay.version, font=bold) + style.gap
    draw.text((nickname_x, origin.y + style.nickname_drop), replay.nickname, font=regular, fill=_TEXT_RGB, anchor="la")
    return nickname_x + draw.textlength(replay.nickname, font=regular)


@lru_cache(maxsize=None)
def _font(kind: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """
    Why this exists:
        Load the first available font file for a weight and size, once per run.
    When to use:
        For every piece of panel text. ``kind`` is "bold" or "regular".
    What to expect:
        A TrueType font when one of ``_FONT_FILES`` loads, otherwise Pillow's built-in font.
    """

    for candidate in _FONT_FILES[kind]:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    LOGGER.warning("No %s font file was found; using Pillow's built-in font.", kind)
    return ImageFont.load_default(size)


def _fit(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, max_width: float) -> str:
    """
    Why this exists:
        Keep a note inside its space instead of letting it run into the next pane.
    When to use:
        For notes, whose length the comparison file does not limit.
    What to expect:
        The text unchanged when it fits, otherwise shortened and ended with an ellipsis.
    """

    if draw.textlength(text, font=font) <= max_width:
        return text
    while text and draw.textlength(text + "\u2026", font=font) > max_width:
        text = text[:-1]
    return text + "\u2026"
