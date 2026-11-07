"""Stitch tiles into strategic and battle pictures."""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from pathlib import Path

import h3
from PIL import Image, ImageDraw

from scripts.basemap_pipeline.basemap_settings import (
    OTHER_TERRAIN_OUTLINE_RGBA,
    PREVIEW_WATER_RGB,
    ROLE_OUTLINE_RGBA,
    TERRAIN_OUTLINE_RGBA,
    OutputPaths,
    PipelineSettings,
)
from scripts.basemap_pipeline.battle_footprint import BattleFootprint
from scripts.basemap_pipeline.region_inputs import RegionInputs, cells_box
from scripts.basemap_pipeline.tile_store import decode_tile, read_tile
from scripts.basemap_pipeline.web_mercator import TILE_SIZE_PX, LonLatBox, TileRange, global_pixel, tile_range_for_box
from scripts.terrain_pipeline.config import ClassifierThresholds
from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL
from scripts.terrain_pipeline.metadata_classifier import classify_metadata_row_without_urban

LOGGER = logging.getLogger(__name__)


def crop_rect(box: LonLatBox, zoom: int, pad_px: int) -> tuple[int, int, int, int]:
    """
    Why this exists:
        Turn a geographic box into a pixel rectangle on the world grid.
    When to use:
        When sizing or stitching a composite.
    What to expect:
        ``(left, top, right, bottom)`` in global pixels. Right and bottom are exclusive.
    """

    LOGGER.log(TRACE_LEVEL, "crop_rect zoom=%s pad=%s.", zoom, pad_px)
    x0, y0 = global_pixel(box.west, box.north, zoom)
    x1, y1 = global_pixel(box.east, box.south, zoom)
    return math.floor(x0) - pad_px, math.floor(y0) - pad_px, math.ceil(x1) + pad_px, math.ceil(y1) + pad_px


@dataclass(frozen=True)
class CompositeFrame:
    """
    Why this exists:
        Carry a stitched image and the global pixel it starts at.
    When to use:
        When drawing cell outlines on a composite.
    What to expect:
        ``image`` is RGB. ``clamped`` is true when the crop was pulled back onto rendered tiles.
    """

    # Stitched picture.
    image: Image.Image
    # Global pixel column of the image's left edge.
    left_px: int
    # Global pixel row of the image's top edge.
    top_px: int
    # Tile zoom the pixels came from.
    zoom: int
    # True when the requested rectangle extended past the rendered tiles.
    clamped: bool


@dataclass(frozen=True)
class CompositeRequest:
    """
    Why this exists:
        Pass the stitch inputs as one object.
    When to use:
        When building one composite frame.
    What to expect:
        ``rendered_range`` is the tile range that was actually written at ``zoom``.
    """

    # MBTiles archive to read.
    mbtiles_path: Path
    # Zoom to stitch.
    zoom: int
    # Geographic area to crop.
    box: LonLatBox
    # Extra pixels around the box.
    pad_px: int
    # Tiles that exist at this zoom.
    rendered_range: TileRange


def stitch_box(request: CompositeRequest) -> CompositeFrame:
    """
    Why this exists:
        Show the same pixels a map would show, with water drawn underneath.
    When to use:
        For each strategic or battle composite.
    What to expect:
        An RGB image cropped to the clamped rectangle.
    Exceptions:
        ``ValueError`` naming ``z/x/y`` when a required tile is missing, or when clamping removes the rectangle.
    """

    LOGGER.debug("stitch_box path=%s zoom=%s.", request.mbtiles_path, request.zoom)
    left, top, right, bottom = crop_rect(request.box, request.zoom, request.pad_px)
    extent = _pixel_extent(request.rendered_range)
    clamped = left < extent[0] or top < extent[1] or right > extent[2] or bottom > extent[3]
    left = max(left, extent[0])
    top = max(top, extent[1])
    right = min(right, extent[2])
    bottom = min(bottom, extent[3])
    if right <= left or bottom <= top:
        raise ValueError("composite rectangle is empty after clamping")
    tile_x0, tile_y0 = left // TILE_SIZE_PX, top // TILE_SIZE_PX
    tile_x1, tile_y1 = (right - 1) // TILE_SIZE_PX, (bottom - 1) // TILE_SIZE_PX
    origin_x, origin_y = tile_x0 * TILE_SIZE_PX, tile_y0 * TILE_SIZE_PX
    canvas = Image.new(
        "RGBA",
        ((tile_x1 - tile_x0 + 1) * TILE_SIZE_PX, (tile_y1 - tile_y0 + 1) * TILE_SIZE_PX),
        (*PREVIEW_WATER_RGB, 255),
    )
    for tile_y in range(tile_y0, tile_y1 + 1):
        for tile_x in range(tile_x0, tile_x1 + 1):
            data = read_tile(request.mbtiles_path, request.zoom, tile_x, tile_y)
            if data is None:
                raise ValueError(f"missing tile {request.zoom}/{tile_x}/{tile_y}")
            canvas.alpha_composite(
                Image.fromarray(decode_tile(data)),
                dest=(tile_x * TILE_SIZE_PX - origin_x, tile_y * TILE_SIZE_PX - origin_y),
            )
    cropped = canvas.crop((left - origin_x, top - origin_y, right - origin_x, bottom - origin_y))
    return CompositeFrame(cropped.convert("RGB"), left, top, request.zoom, clamped)


def draw_cell_outlines(
    frame: CompositeFrame,
    colored_cells: list[tuple[str, tuple[int, int, int, int]]],
) -> Image.Image:
    """
    Why this exists:
        Draw H3 outlines on a copy of a composite.
    When to use:
        After ``stitch_box``, for the hex and cell pictures.
    What to expect:
        A new RGB image. The frame's image is not modified.
    """

    LOGGER.log(TRACE_LEVEL, "draw_cell_outlines cells=%s.", len(colored_cells))
    copy = frame.image.copy()
    draw = ImageDraw.Draw(copy, "RGBA")
    for cell, rgba in colored_cells:
        points = []
        for lat, lng in h3.cell_to_boundary(cell):
            pixel_x, pixel_y = global_pixel(lng, lat, frame.zoom)
            points.append((pixel_x - frame.left_px, pixel_y - frame.top_px))
        draw.polygon(points, outline=rgba)
    return copy


def write_strategic_composites(paths: OutputPaths, region: RegionInputs, settings: PipelineSettings) -> None:
    """
    Why this exists:
        Write the whole-region pictures for both styles.
    When to use:
        After both MBTiles archives exist.
    What to expect:
        A bare PNG and a role-outline PNG per style, at the strategic composite zoom.
    """

    LOGGER.debug("write_strategic_composites region=%s.", region.region_id)
    paths.composites_dir.mkdir(parents=True, exist_ok=True)
    zoom = settings.strategic_composite_zoom
    colored = [(cell, ROLE_OUTLINE_RGBA[role]) for cell, role in region.roles.items()]
    rendered = tile_range_for_box(region.box, zoom)
    for style_name in ("plain", "stylized"):
        frame = stitch_box(CompositeRequest(paths.mbtiles_path(style_name), zoom, region.box, 0, rendered))
        frame.image.save(paths.composites_dir / f"strategic_z{zoom}_{style_name}.png")
        draw_cell_outlines(frame, colored).save(paths.composites_dir / f"strategic_z{zoom}_{style_name}_hexes.png")


def write_battle_composites(
    paths: OutputPaths,
    region: RegionInputs,
    footprint: BattleFootprint,
    tactical_rows: dict[str, dict],
    settings: PipelineSettings,
) -> None:
    """
    Why this exists:
        Write one battle's pictures for both styles.
    When to use:
        Once per requested battle, after the tiles exist.
    What to expect:
        A bare PNG and a terrain-outline PNG per style. Prints a note when a frame was clamped.
    """

    LOGGER.debug("write_battle_composites cell=%s.", footprint.enclosing_cell)
    paths.composites_dir.mkdir(parents=True, exist_ok=True)
    zoom = settings.tactical_composite_zoom
    box = cells_box(footprint.cells)
    colored = [_terrain_outline(cell, tactical_rows.get(cell)) for cell in footprint.cells]
    rendered = tile_range_for_box(region.box, zoom)
    for style_name in ("plain", "stylized"):
        frame = stitch_box(
            CompositeRequest(paths.mbtiles_path(style_name), zoom, box, settings.battle_pad_px, rendered)
        )
        if frame.clamped:
            print(f"clamped: {footprint.enclosing_cell} {style_name}")
        stem = f"battle_{footprint.enclosing_cell}_z{zoom}_{style_name}"
        frame.image.save(paths.composites_dir / f"{stem}.png")
        draw_cell_outlines(frame, colored).save(paths.composites_dir / f"{stem}_cells.png")


def _pixel_extent(tile_range: TileRange) -> tuple[int, int, int, int]:
    """
    Why this exists:
        Name the global pixels covered by a rendered tile range.
    When to use:
        When clamping a composite crop.
    What to expect:
        ``(left, top, right, bottom)`` with right and bottom exclusive.
    """

    return (
        tile_range.x_min * TILE_SIZE_PX,
        tile_range.y_min * TILE_SIZE_PX,
        (tile_range.x_max + 1) * TILE_SIZE_PX,
        (tile_range.y_max + 1) * TILE_SIZE_PX,
    )


def _terrain_outline(cell: str, row: dict | None) -> tuple[str, tuple[int, int, int, int]]:
    """
    Why this exists:
        Choose the outline color for one battle cell.
    When to use:
        While building the outlined battle composite.
    What to expect:
        The cell and an RGBA color. A missing row uses the other-terrain color.
    """

    if row is None:
        return cell, OTHER_TERRAIN_OUTLINE_RGBA
    kind = classify_metadata_row_without_urban(row, ClassifierThresholds())
    return cell, TERRAIN_OUTLINE_RGBA.get(kind, OTHER_TERRAIN_OUTLINE_RGBA)
