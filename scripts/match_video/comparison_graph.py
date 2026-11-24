"""Build the ffmpeg inputs and filter graph that compose replays into one frame.

Each replay is decoded once and split three ways: the hex map, the faction
legend, and the turn readout. Those pieces and the static panels from
``comparison_panels`` are overlaid on a 1920x1080 canvas. Running ffmpeg is left
to the caller.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import NamedTuple

from scripts.match_video.comparison_geometry import (
    BACKGROUND_RGB,
    CANVAS_HEIGHT,
    CANVAS_WIDTH,
    DUO_FOOTER_Y,
    DUO_PANE_Y,
    LEGEND_HEIGHT,
    LEGEND_X,
    LEGEND_Y,
    PANE_HEIGHT,
    PANE_WIDTH,
    QUAD_CARD_ORIGIN,
    QUAD_REPLAY_ORIGINS,
    TURN_CROP,
    TURN_DIVIDER_COLOR,
    CanvasPoint,
    CaptureGeometry,
)
from scripts.match_video.comparison_panels import render_duo_bands, render_quad_card, render_tag_panel
from scripts.match_video.comparison_spec import ComparisonSpec, ReplaySpec, layout_replays

LOGGER = logging.getLogger(__name__)

# Frame rate of the composed video. Every replay is resampled to it.
OUTPUT_FPS = 30

# Length of the fade to black at the end of a composed video, in seconds.
FADE_OUT_SECONDS = 0.75

# Dark line between panes, so the cells read as separate pictures.
_GUTTER_COLOR = "0x0a0f17"
# Width of that line, in pixels. It is centered on the pane edge.
_GUTTER_WIDTH = 4

# How much of each replay a single preview frame reads, in seconds.
_STILL_READ_SECONDS = 1.0


@dataclass(frozen=True)
class RenderWindow:
    """
    Why this exists:
        Say which part of the replays to compose, and whether to write a video or one frame.
    When to use:
        Inside ``LayoutRequest``.
    What to expect:
        Times are seconds into every replay. When ``still_seconds`` is set, the start,
        duration, and fade are ignored and one frame from that time is composed.
    """

    # Seconds into every replay where the output starts.
    start_seconds: float
    # Seconds of output to compose.
    duration_seconds: float
    # Replay time of a single preview frame, or None for a video.
    still_seconds: float | None
    # True to fade the last ``FADE_OUT_SECONDS`` to black.
    fade_out: bool


@dataclass(frozen=True)
class LayoutRequest:
    """
    Why this exists:
        Hold what ``build_comparison_plan`` needs, so its call stays small.
    When to use:
        Build one per composed output.
    What to expect:
        ``panel_dir`` must exist. The panel PNGs are written there and must stay until
        ffmpeg finishes.
    """

    # The checked comparison file.
    spec: ComparisonSpec
    # Layout name: "quad" or "duo".
    layout: str
    # Directory that the replay file names are relative to.
    source_dir: Path
    # Scratch directory for the panel PNGs.
    panel_dir: Path
    # Which part of the replays to compose.
    window: RenderWindow


class FfmpegPlan(NamedTuple):
    """
    Why this exists:
        Return the input arguments and the filter graph together, ready for one ffmpeg run.
    When to use:
        As the result of ``build_comparison_plan``.
    What to expect:
        The graph ends in the ``[out]`` label, in ``yuv420p``.
    """

    # Arguments for every input, replays first, in the order the graph numbers them.
    input_args: tuple[str, ...]
    # The complete ``-filter_complex`` graph.
    filter_graph: str


def build_comparison_plan(request: LayoutRequest) -> FfmpegPlan:
    """
    Why this exists:
        Turn a comparison and a layout into one ffmpeg graph, drawing the panels it needs.
    When to use:
        Once per composed video or preview frame, after the window is known.
    What to expect:
        Panel PNGs in ``panel_dir`` and a plan whose graph overlays, in order: the panels
        that sit behind the replays, then each replay's map, tag, turn readout, and legend.
    Exceptions:
        ``ComparisonError`` when the comparison file has no such layout.
    """

    LOGGER.debug(
        "Planning the %s layout. start=%s duration=%s still=%s fade=%s",
        request.layout,
        request.window.start_seconds,
        request.window.duration_seconds,
        request.window.still_seconds,
        request.window.fade_out,
    )
    replays = layout_replays(request.spec, request.layout)
    graph = _GraphBuilder(request.window, request.spec.capture)
    for replay in replays:
        graph.add_replay(replay, request.source_dir / replay.file)
    if request.layout == "quad":
        _place_quad(graph, request, replays)
        post = [_gutter(PANE_WIDTH - _GUTTER_WIDTH // 2, 0, _GUTTER_WIDTH, CANVAS_HEIGHT),
                _gutter(0, PANE_HEIGHT - _GUTTER_WIDTH // 2, CANVAS_WIDTH, _GUTTER_WIDTH)]
    else:
        _place_duo(graph, request, replays)
        post = [_gutter(PANE_WIDTH - _GUTTER_WIDTH // 2, DUO_PANE_Y, _GUTTER_WIDTH, PANE_HEIGHT)]
    window = request.window
    if window.still_seconds is None and window.fade_out:
        post.append(f"fade=t=out:st={_seconds(window.duration_seconds - FADE_OUT_SECONDS)}:d={FADE_OUT_SECONDS}")
    plan = graph.finish(post)
    LOGGER.debug("Planned %d inputs and a graph of %d characters.", plan.input_args.count("-i"), len(plan.filter_graph))
    return plan


class _GraphBuilder:
    """
    Why this exists:
        Number the inputs and chain the overlays, so the layout code only says what goes where.
    When to use:
        Inside ``build_comparison_plan``: add the replays, then images and placements, then finish.
    What to expect:
        Each replay exposes three labeled streams: its scaled map, legend strip, and turn readout.
    """

    def __init__(self, window: RenderWindow, capture: CaptureGeometry) -> None:
        """
        Why this exists:
            Start an empty graph for one render window and one capture geometry.
        When to use:
            Once per plan.
        What to expect:
            No inputs, filters, or placements yet.
        """

        # Which part of the replays every input reads.
        self._window = window
        # Where the map and the toolbar sit in every replay's frame.
        self._capture = capture
        # Arguments for each input, in input order.
        self._inputs: list[list[str]] = []
        # Filter chains that prepare the replay streams.
        self._filters: list[str] = []
        # Stream labels and where to overlay them, bottom layer first.
        self._placements: list[tuple[str, CanvasPoint]] = []
        # Stream label prefix for each replay key.
        self._replay_labels: dict[str, str] = {}

    def add_replay(self, replay: ReplaySpec, path: Path) -> None:
        """
        Why this exists:
            Decode a replay once and cut out the map, legend, and turn readout.
        When to use:
            For each replay in the layout, before any placement that uses it.
        What to expect:
            Three labeled streams for ``map``, ``legend``, and ``turn``. The legend is masked
            per ``replay.legend_masks``; the turn readout has the toolbar divider keyed out.
            Both end at ``replay.toolbar_hold_seconds`` when it is set, and the overlay then
            repeats their last frame.
        """

        index = len(self._inputs)
        label = f"r{index}"
        self._replay_labels[replay.key] = label
        window = self._window
        if window.still_seconds is not None:
            timing = ["-ss", _seconds(window.still_seconds), "-t", _seconds(_STILL_READ_SECONDS)]
        else:
            timing = (["-ss", _seconds(window.start_seconds)] if window.start_seconds > 0 else [])
            timing += ["-t", _seconds(window.duration_seconds)]
        self._inputs.append([*timing, "-i", str(path)])
        map_crop = self._capture.map_crop
        shift = self._capture.toolbar_shift_y
        hold = _toolbar_hold(replay, window)
        self._filters += [
            f"[{index}:v]setpts=PTS-STARTPTS,fps={OUTPUT_FPS},split=3[{label}a][{label}b][{label}c]",
            f"[{label}a]crop={map_crop.width}:{map_crop.height}:{map_crop.x}:{map_crop.y},"
            f"scale={PANE_WIDTH}:{PANE_HEIGHT}:flags=lanczos[{label}map]",
            f"[{label}b]crop={replay.legend_width}:{LEGEND_HEIGHT}:{LEGEND_X}:{LEGEND_Y + shift},format=rgb24"
            f"{_legend_masks(replay, window)}{hold}[{label}legend]",
            f"[{label}c]crop={TURN_CROP.width}:{TURN_CROP.height}:{TURN_CROP.x}:{TURN_CROP.y + shift},"
            f"colorkey={TURN_DIVIDER_COLOR}:0.04:0{hold}[{label}turn]",
        ]

    def add_image(self, path: Path) -> str:
        """
        Why this exists:
            Add a static panel PNG as an input.
        When to use:
            For each panel, before placing it.
        What to expect:
            The stream label to pass to ``place``. A single image is held for the whole output.
        """

        index = len(self._inputs)
        self._inputs.append(["-i", str(path)])
        return f"{index}:v"

    def replay_stream(self, replay: ReplaySpec, part: str) -> str:
        """
        Why this exists:
            Name one of a replay's cut-out streams without exposing the label scheme.
        When to use:
            When placing a replay's ``map``, ``legend``, or ``turn``.
        What to expect:
            The label of that stream.
        """

        return f"{self._replay_labels[replay.key]}{part}"

    def place(self, stream: str, point: CanvasPoint) -> None:
        """
        Why this exists:
            Put a stream on the canvas above everything placed before it.
        When to use:
            In drawing order, bottom layer first.
        What to expect:
            The stream's top-left corner lands at ``point``.
        """

        self._placements.append((stream, point))

    def finish(self, post_filters: Sequence[str]) -> FfmpegPlan:
        """
        Why this exists:
            Chain the overlays onto a background canvas and close the graph.
        When to use:
            After every placement.
        What to expect:
            A plan whose graph applies ``post_filters`` after the last overlay, then converts to
            ``yuv420p`` and labels the result ``[out]``.
        """

        window = self._window
        canvas_seconds = _STILL_READ_SECONDS if window.still_seconds is not None else window.duration_seconds
        red, green, blue = BACKGROUND_RGB
        chains = [
            f"color=c=0x{red:02x}{green:02x}{blue:02x}:s={CANVAS_WIDTH}x{CANVAS_HEIGHT}:"
            f"r={OUTPUT_FPS}:d={_seconds(canvas_seconds)}[base]",
            *self._filters,
        ]
        current = "base"
        for number, (stream, point) in enumerate(self._placements):
            chains.append(f"[{current}][{stream}]overlay={point.x}:{point.y}:eof_action=repeat[layer{number}]")
            current = f"layer{number}"
        chains.append(f"[{current}]" + ",".join([*post_filters, "format=yuv420p"]) + "[out]")
        input_args = tuple(argument for arguments in self._inputs for argument in arguments)
        return FfmpegPlan(input_args, ";".join(chains))


def _place_quad(graph: _GraphBuilder, request: LayoutRequest, replays: Sequence[ReplaySpec]) -> None:
    """
    Why this exists:
        Lay out three replay panes and the legend card on a two-by-two grid.
    When to use:
        From ``build_comparison_plan`` for the quad layout.
    What to expect:
        The card fills the bottom-left cell, and each replay's live legend sits in its card row.
    """

    card_path = request.panel_dir / "card.png"
    legend_points = render_quad_card(request.spec, replays, card_path)
    graph.place(graph.add_image(card_path), QUAD_CARD_ORIGIN)
    for replay, origin in zip(replays, QUAD_REPLAY_ORIGINS):
        _place_pane(graph, request.panel_dir, replay, origin)
        legend = legend_points[replay.key]
        graph.place(graph.replay_stream(replay, "legend"), CanvasPoint(QUAD_CARD_ORIGIN.x + legend.x,
                                                                      QUAD_CARD_ORIGIN.y + legend.y))


def _place_duo(graph: _GraphBuilder, request: LayoutRequest, replays: Sequence[ReplaySpec]) -> None:
    """
    Why this exists:
        Lay out two replay panes side by side between the header and footer bands.
    When to use:
        From ``build_comparison_plan`` for the duo layout.
    What to expect:
        Each pane's live legend sits in the header band above it.
    """

    header_path = request.panel_dir / "header.png"
    footer_path = request.panel_dir / "footer.png"
    legend_points = render_duo_bands(request.spec, replays, header_path, footer_path)
    graph.place(graph.add_image(header_path), CanvasPoint(0, 0))
    graph.place(graph.add_image(footer_path), CanvasPoint(0, DUO_FOOTER_Y))
    for column, replay in enumerate(replays):
        _place_pane(graph, request.panel_dir, replay, CanvasPoint(column * PANE_WIDTH, DUO_PANE_Y))
        graph.place(graph.replay_stream(replay, "legend"), legend_points[replay.key])


def _place_pane(graph: _GraphBuilder, panel_dir: Path, replay: ReplaySpec, origin: CanvasPoint) -> None:
    """
    Why this exists:
        Place one replay's map with its tag panel and live turn readout on top.
    When to use:
        For every replay pane in either layout.
    What to expect:
        The map fills the pane. The tag covers the minimap in the pane's top-left corner,
        and the turn readout sits in the tag's lower-right corner.
    """

    tag_path = panel_dir / f"tag-{graph.replay_stream(replay, '')}.png"
    turn_offset = render_tag_panel(replay, tag_path)
    graph.place(graph.replay_stream(replay, "map"), origin)
    graph.place(graph.add_image(tag_path), origin)
    graph.place(graph.replay_stream(replay, "turn"), CanvasPoint(origin.x + turn_offset.x, origin.y + turn_offset.y))


def _legend_masks(replay: ReplaySpec, window: RenderWindow) -> str:
    """
    Why this exists:
        Paint over the text after the legend until a knockout marker pushes it out of the strip.
    When to use:
        While building a replay's legend chain.
    What to expect:
        Filter text starting with a comma, or an empty string. For a video, each mask is
        timed against the output clock, which starts at ``start_seconds``; masks that end
        before the window are left out. For a still, a mask is drawn when the frame is
        before its end time.
    """

    red, green, blue = BACKGROUND_RGB
    color = f"0x{red:02x}{green:02x}{blue:02x}"
    parts = []
    for mask in replay.legend_masks:
        box = f"drawbox=x={mask.x}:y=0:w={replay.legend_width - mask.x}:h={LEGEND_HEIGHT}:color={color}:t=fill"
        if window.still_seconds is not None:
            if window.still_seconds < mask.until_seconds:
                parts.append(box)
        elif mask.until_seconds > window.start_seconds:
            parts.append(f"{box}:enable='lt(t,{_seconds(mask.until_seconds - window.start_seconds)})'")
    return "".join(f",{part}" for part in parts)


def _toolbar_hold(replay: ReplaySpec, window: RenderWindow) -> str:
    """
    Why this exists:
        Stop a replay's legend and turn readout before a finished match swaps its toolbar
        for the start menu.
    When to use:
        While building a replay's legend and turn chains.
    What to expect:
        Filter text starting with a comma, or an empty string. The stream ends at
        ``toolbar_hold_seconds`` on the replay clock, and the overlay repeats its last frame.
        A still, a replay without a hold, and a window that starts at or after the hold
        get an empty string.
    """

    hold = replay.toolbar_hold_seconds
    if hold is None or window.still_seconds is not None or hold <= window.start_seconds:
        return ""
    return f",trim=end={_seconds(hold - window.start_seconds)}"


def _gutter(x: int, y: int, width: int, height: int) -> str:
    """
    Why this exists:
        Draw one dark line between panes.
    When to use:
        In the post filters of each layout.
    What to expect:
        A filled ``drawbox`` filter.
    """

    return f"drawbox=x={x}:y={y}:w={width}:h={height}:color={_GUTTER_COLOR}:t=fill"


def _seconds(value: float) -> str:
    """
    Why this exists:
        Write times for ffmpeg without long floating-point tails.
    When to use:
        For every time in an argument or a filter.
    What to expect:
        Text with three decimals, such as ``45.734``.
    """

    return f"{value:.3f}"
