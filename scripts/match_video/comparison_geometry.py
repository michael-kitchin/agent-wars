"""Pixel geometry shared by the comparison panels and the filter graph.

The crops assume a 1920x1080 capture of the maximized Agent Wars window: the
toolbar along the top, the command rail on the right, and the Windows taskbar
along the bottom. Canvas positions are in pixels of the 1920x1080 output.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import NamedTuple


class CaptureRect(NamedTuple):
    """
    Why this exists:
        Name one rectangle of the source capture, so a crop reads as x, y, width, height.
    When to use:
        For the map and turn-readout crops below.
    What to expect:
        Pixel values in the 1920x1080 source frame. The origin is the top-left.
    """

    # Left edge, in source pixels.
    x: int
    # Top edge, in source pixels.
    y: int
    # Width, in source pixels.
    width: int
    # Height, in source pixels.
    height: int


class CanvasPoint(NamedTuple):
    """
    Why this exists:
        Name a position on the output canvas or inside a panel.
    When to use:
        For pane origins and for where panels say the legend and turn readout go.
    What to expect:
        Pixel offsets from the top-left of the canvas, or of the panel that returned it.
    """

    # Pixels from the left edge.
    x: int
    # Pixels from the top edge.
    y: int


# Size of the source capture every crop is measured in.
CAPTURE_WIDTH = 1920
CAPTURE_HEIGHT = 1080

# Output frame size. Each layout fills it exactly.
CANVAS_WIDTH = 1920
CANVAS_HEIGHT = 1080

# One replay pane: half the canvas in each direction, at 16:9.
PANE_WIDTH = 960
PANE_HEIGHT = 540

# 16:9 window on the hex map. It leaves out the toolbar, the right rail, and the taskbar,
# and keeps the whole hex grid from Alaska to Japan. The minimap stays in its top-left
# corner and is hidden by the tag panel.
MAP_CROP = CaptureRect(120, 67, 1728, 972)

# Top-left corner and height of the "Observing" faction list, after the word "Observing".
# Its width depends on the replay, because knockout markers lengthen it, so each replay
# sets ``legend_width`` in the comparison file.
LEGEND_X = 138
LEGEND_Y = 32
LEGEND_HEIGHT = 26

# Date, turn number, and phase readout at the right end of the toolbar.
TURN_CROP = CaptureRect(1676, 25, 146, 40)

# Toolbar divider color that can fall inside ``TURN_CROP``. It is keyed out so the
# readout sits cleanly on its panel.
TURN_DIVIDER_COLOR = "0x293240"

# Toolbar background. Panels and empty canvas use it so the cropped UI blends in.
BACKGROUND_RGB = (17, 25, 37)



@dataclass(frozen=True)
class CaptureGeometry:
    """
    Why this exists:
        Hold the crops that change when a replay was re-exported from a video editor,
        which can move the game window inside the frame and trim its edges.
    When to use:
        Read from the optional ``capture`` object of a comparison file or of one replay in it.
        ``DEFAULT_CAPTURE`` is a plain capture of the maximized game window.
    What to expect:
        The file's geometry applies to every replay that does not set its own.
    """

    # Window on the hex map, in source pixels. It is scaled to one replay pane.
    map_crop: CaptureRect
    # Pixels the toolbar sits below its place in a plain capture. The legend and
    # turn readout crops move down by this much.
    toolbar_shift_y: int


# Geometry of a plain 1920x1080 capture of the maximized game window.
DEFAULT_CAPTURE = CaptureGeometry(MAP_CROP, 0)

# Quad layout: replay panes in on-screen order, then the legend card.
QUAD_REPLAY_ORIGINS = (CanvasPoint(0, 0), CanvasPoint(960, 0), CanvasPoint(960, 540))
QUAD_CARD_ORIGIN = CanvasPoint(0, 540)
# Words the legend card uses to point at each replay pane, in the same order.
QUAD_REPLAY_PLACES = ("top left", "top right", "bottom right")

# Duo layout: two panes side by side between a header band and a footer band.
DUO_BAND_HEIGHT = 270
DUO_PANE_Y = DUO_BAND_HEIGHT
DUO_FOOTER_Y = DUO_PANE_Y + PANE_HEIGHT
