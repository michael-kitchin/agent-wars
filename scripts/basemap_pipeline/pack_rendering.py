"""Render stylized hillshade tiles into a global or regional pack."""

from __future__ import annotations

import json
import logging
import zipfile
from dataclasses import dataclass, replace
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling

from scripts.basemap_pipeline.basemap_settings import DEFAULT_SETTINGS, STYLIZED_STYLE, OutputPaths, PipelineSettings
from scripts.basemap_pipeline.dem_source import read_dem_3857
from scripts.basemap_pipeline.pack_writer import (
    PartitionDraft,
    encode_rgba_webp,
    settings_hash,
    shared_land_webp,
    shared_water_webp,
    sources_hash,
    write_stored_zip,
)
from scripts.basemap_pipeline.terrain_shading import (
    crop_margin,
    flat_weight,
    row_ground_spacing_m,
    slope_degrees,
    smooth,
    surface_gradients,
)
from scripts.basemap_pipeline.tile_classes import CLASS_FLAT, CLASS_SHADED, classify_tile
from scripts.basemap_pipeline.tile_partitions import ancestor_key
from scripts.basemap_pipeline.tile_rendering import RenderContext, render_block, split_block
from scripts.basemap_pipeline.water_coverage import load_water_geometry_3857, water_coverage
from scripts.basemap_pipeline.web_mercator import LonLatBox, TileBlock, TileRange, blocks_for_range, box_of_tile_range, pixel_size_m
from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class PackRenderRequest:
    """
    Why this exists:
        Keep the pack renderer's inputs inside the parameter limit.
    When to use:
        From the regional and global pack commands.
    What to expect:
        ``ranges`` are the tiles to draw. ``native_weight_zoom`` is the zoom whose slope decides flattening.
    """

    # ``global`` or ``regional``.
    kind: str
    # ``global`` or a region id.
    map_id: str
    # Lowest zoom stored in this pack.
    zoom_min: int
    # Highest zoom stored in this pack.
    zoom_max: int
    # Zoom at which flatten weights are computed before averaging.
    native_weight_zoom: int
    # Elevation dataset, a VRT or the world GeoTIFF.
    dem_path: Path
    # Directory that receives the shipped zips.
    output_dir: Path
    # Directory for the water cache and the resume file.
    work_dir: Path
    # Natural Earth root.
    data_root: Path
    # Tile ranges to render. More than one when the region crosses 180 degrees.
    ranges: tuple[TileRange, ...]
    # Elevation files whose names and sizes form the sources hash.
    source_paths: tuple[Path, ...]
    # Keep a partition whose stored hashes still match.
    skip_existing: bool


def render_pack(request: PackRenderRequest) -> dict[str, int]:
    """
    Why this exists:
        Shade the tiles for one pack and write only the ones that are not blank.
    When to use:
        After the elevation mosaic for that pack exists.
    What to expect:
        Counts of shaded, flat, and water tiles, plus the zip count. A finished partition is skipped
        when ``skip_existing`` is set and the hashes still match.
    Exceptions:
        ``ValueError`` when a tile range zoom is outside the pack.
    """

    LOGGER.debug("render_pack map=%s zooms=%s-%s.", request.map_id, request.zoom_min, request.zoom_max)
    style_hash = settings_hash()
    source_hash = sources_hash(list(request.source_paths))
    progress = _load_progress(request.work_dir / "pack_progress.json", style_hash, source_hash, request.skip_existing)
    water_box = _union_box(request.ranges)
    paths = OutputPaths(request.work_dir, "water")
    water = load_water_geometry_3857(request.data_root, water_box, paths)
    settings = replace(DEFAULT_SETTINGS, max_native_zoom=request.native_weight_zoom)
    totals = {"shaded": 0, "flat": 0, "water": 0, "zips": 0}
    dem_dataset = rasterio.open(request.dem_path)
    try:
        context = RenderContext(dem_dataset, None, water, settings)
        for tile_range in sorted(request.ranges, key=lambda item: item.zoom, reverse=True):
            drafts = _render_range(context, request, tile_range, settings, progress, totals)
            _store_range(request.output_dir, drafts, progress, tile_range, request.work_dir / "pack_progress.json")
            print(
                f"zoom {tile_range.zoom}: shaded {totals['shaded']} flat {totals['flat']} water {totals['water']}",
                flush=True,
            )
    finally:
        dem_dataset.close()
    _finalize(request, progress, style_hash, source_hash)
    totals["zips"] = sum(1 for entry in progress["partitions"].values() if entry["zip"])
    _save_progress(request.work_dir / "pack_progress.json", progress)
    return totals


def _render_range(context, request, tile_range, settings, progress, totals) -> dict[str, PartitionDraft]:
    """
    Why this exists:
        Shade one zoom into partition drafts.
    When to use:
        From ``render_pack``, highest zoom first.
    What to expect:
        Drafts for partitions that were not already recorded. Counts are added to ``totals``.
    """

    grouped: dict[str, list[tuple[str, str, bytes | None]]] = {}
    for block in blocks_for_range(tile_range, settings.block_tiles):
        if _block_is_done(block, progress):
            continue
        print(
            f"block zoom {block.zoom} x {block.x_min}-{block.x_max} y {block.y_min}-{block.y_max}",
            flush=True,
        )
        coverage = water_coverage(context.water_geometry_3857, block.bounds_3857(), (block.height_px(), block.width_px()), settings.water_supersample)
        if float(coverage.min()) >= 1.0:
            totals["water"] += _tile_count(block)
            continue
        weights = _weights_for_block(context.dem_dataset, block, request.native_weight_zoom, settings)
        rgba = render_block(context, block, STYLIZED_STYLE, weights)
        for x, y, tile in split_block(rgba, block):
            kind = classify_tile(tile)
            key = ancestor_key(tile_range.zoom, x, y)
            tile_key = f"{tile_range.zoom}/{x}/{y}"
            if kind == CLASS_SHADED:
                grouped.setdefault(key, []).append((tile_key, CLASS_SHADED, encode_rgba_webp(tile)))
                totals["shaded"] += 1
            elif kind == CLASS_FLAT:
                grouped.setdefault(key, []).append((tile_key, CLASS_FLAT, None))
                totals["flat"] += 1
            else:
                totals["water"] += 1
    drafts: dict[str, PartitionDraft] = {}
    for key, entries in grouped.items():
        drafts[key] = PartitionDraft(
            flat=tuple(name for name, kind, _ in entries if kind == CLASS_FLAT),
            shaded=tuple((name, payload) for name, kind, payload in entries if kind == CLASS_SHADED and payload is not None),
        )
    return drafts


def _weights_for_block(dataset, block: TileBlock, native_zoom: int, settings: PipelineSettings) -> np.ndarray:
    """
    Why this exists:
        Flatten gentle slopes from the finest zoom of the pack.
    When to use:
        Before rendering a stylized block.
    What to expect:
        Weights shaped like the block. Coarser zooms average the native-zoom weights.
    """

    LOGGER.log(TRACE_LEVEL, "weights_for_block zoom=%s native=%s.", block.zoom, native_zoom)
    factor = 2 ** (native_zoom - block.zoom)
    pixel = pixel_size_m(native_zoom)
    halo = settings.halo_px
    left, bottom, right, top = block.bounds_3857()
    halo_bounds = (left - halo * pixel, bottom - halo * pixel, right + halo * pixel, top + halo * pixel)
    shape = (block.height_px() * factor + 2 * halo, block.width_px() * factor + 2 * halo)
    dem = read_dem_3857(dataset, halo_bounds, shape, Resampling.bilinear if factor == 1 else Resampling.average)
    spacing = row_ground_spacing_m(top + halo * pixel, shape[0], pixel)
    rise_east, rise_north = surface_gradients(dem, spacing)
    slope = smooth(slope_degrees(rise_east, rise_north), STYLIZED_STYLE.slope_smoothing_sigma_px)
    weight = crop_margin(flat_weight(slope, STYLIZED_STYLE), halo)
    if factor == 1:
        return weight
    return weight.reshape(block.height_px(), factor, block.width_px(), factor).mean(axis=(1, 3))


def _store_range(output_dir: Path, drafts: dict[str, PartitionDraft], progress: dict, tile_range: TileRange, progress_path: Path) -> None:
    """
    Why this exists:
        Save a finished zoom's tiles into the partition zips without dropping an earlier zoom.
    When to use:
        After one zoom range has been rendered.
    What to expect:
        Existing shaded bytes stay in the zip. Every partition the range touches records this zoom,
        including partitions that were only water, so a resume does not draw the zoom again.
    """

    for key, draft in drafts.items():
        previous = progress["partitions"].get(key, {"flat": [], "shaded": [], "zooms": [], "zip": None, "sha256": None})
        members: dict[str, bytes] = {}
        zip_path = output_dir / f"{key}.zip"
        if previous.get("zip") and zip_path.is_file():
            with zipfile.ZipFile(zip_path) as archive:
                for info in archive.infolist():
                    members[info.filename] = archive.read(info.filename)
        for name, payload in draft.shaded:
            members[f"{name}.webp"] = payload
        flat = sorted(set(previous["flat"]) | set(draft.flat))
        shaded = sorted(set(previous["shaded"]) | {name for name, _ in draft.shaded})
        zooms = sorted(set(previous.get("zooms", [])) | {tile_range.zoom})
        if members:
            digest = write_stored_zip(zip_path, members)
            stored = {"zip": f"{key}.zip", "sha256": digest}
        else:
            stored = {"zip": None, "sha256": None}
        progress["partitions"][key] = {"flat": flat, "shaded": shaded, "zooms": zooms, **stored}
    _mark_range_done(progress, tile_range)
    _save_progress(progress_path, progress)


def _mark_range_done(progress: dict, tile_range: TileRange) -> None:
    """
    Why this exists:
        Remember a finished zoom without treating one water block as the whole partition.
    When to use:
        After every block in the range has been drawn and the shaded tiles are in the zips.
    What to expect:
        Each partition the range touches lists this zoom. A later run skips those blocks.
    """

    for y in range(tile_range.y_min, tile_range.y_max + 1):
        for x in range(tile_range.x_min, tile_range.x_max + 1):
            key = ancestor_key(tile_range.zoom, x, y)
            previous = progress["partitions"].get(key, {"flat": [], "shaded": [], "zooms": [], "zip": None, "sha256": None})
            previous["zooms"] = sorted(set(previous.get("zooms", [])) | {tile_range.zoom})
            progress["partitions"][key] = previous


def _finalize(request: PackRenderRequest, progress: dict, style_hash: str, source_hash: str) -> None:
    """
    Why this exists:
        Write the manifest and the index archive from the partition records.
    When to use:
        After every range has been stored.
    What to expect:
        ``basemap_pack.json.zip`` and ``indexes.json.zip`` beside the partition zips.
        Partitions that are entirely water are left out.
    """

    index_members: dict[str, bytes] = {}
    partitions = {}
    for key in sorted(progress["partitions"]):
        entry = progress["partitions"][key]
        if not entry["flat"] and not entry["shaded"]:
            continue
        document = {"flat": sorted(entry["flat"]), "shaded": sorted(entry["shaded"])}
        index_members[f"{key}.json"] = json.dumps(document, sort_keys=True, separators=(",", ":")).encode("utf-8")
        partitions[key] = {"zip": entry["zip"], "sha256": entry["sha256"]}
    request.output_dir.mkdir(parents=True, exist_ok=True)
    (request.output_dir / "land.webp").write_bytes(shared_land_webp())
    (request.output_dir / "water.webp").write_bytes(shared_water_webp())
    indexes_digest = write_stored_zip(request.output_dir / "indexes.json.zip", index_members)
    manifest = {
        "schema": 1,
        "kind": request.kind,
        "mapId": request.map_id,
        "zoomMin": request.zoom_min,
        "zoomMax": request.zoom_max,
        "settingsHash": style_hash,
        "sourcesHash": source_hash,
        "landTile": "land.webp",
        "waterTile": "water.webp",
        "indexesZip": "indexes.json.zip",
        "indexesSha256": indexes_digest,
        "partitions": partitions,
    }
    encoded = json.dumps(manifest, sort_keys=True, indent=2).encode("utf-8")
    write_stored_zip(request.output_dir / "basemap_pack.json.zip", {"basemap_pack.json": encoded})


def _load_progress(path: Path, style_hash: str, source_hash: str, skip_existing: bool) -> dict:
    """
    Why this exists:
        Resume a pack without rendering finished partitions again.
    When to use:
        At the start of ``render_pack``.
    What to expect:
        An empty partition map when the file is missing or the hashes differ.
    """

    if skip_existing and path.is_file():
        document = json.loads(path.read_text(encoding="utf-8"))
        if document.get("settingsHash") == style_hash and document.get("sourcesHash") == source_hash:
            return document
    return {"settingsHash": style_hash, "sourcesHash": source_hash, "partitions": {}}


def _save_progress(path: Path, progress: dict) -> None:
    """
    Why this exists:
        Remember which partitions are already stored.
    When to use:
        After a zoom finishes and at the end of the pack.
    What to expect:
        JSON beside the water cache.
    """

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(progress, indent=2), encoding="utf-8")


def _block_is_done(block: TileBlock, progress: dict) -> bool:
    """
    Why this exists:
        Skip a block whose partition was stored on a previous run.
    When to use:
        Before shading a block.
    What to expect:
        True when every tile in the block belongs to a recorded partition.
        A block that straddles partitions is not skipped.
    """

    keys = {ancestor_key(block.zoom, x, y) for y in range(block.y_min, block.y_max + 1) for x in range(block.x_min, block.x_max + 1)}
    for key in keys:
        entry = progress["partitions"].get(key)
        if entry is None or block.zoom not in entry.get("zooms", []):
            return False
    return True


def _tile_count(block: TileBlock) -> int:
    """
    Why this exists:
        Count the tiles in a block for the water total.
    When to use:
        After an all-water block.
    What to expect:
        The inclusive tile count.
    """

    return (block.x_max - block.x_min + 1) * (block.y_max - block.y_min + 1)


def _union_box(ranges: tuple[TileRange, ...]):
    """
    Why this exists:
        Clip water to every tile the pack will draw.
    When to use:
        Before loading water geometry.
    What to expect:
        The outer longitude and latitude of the ranges. A range that crosses 180 degrees
        spans the whole world, which loads more water than the region needs.
    """

    boxes = [box_of_tile_range(tile_range) for tile_range in ranges]
    return LonLatBox(
        west=min(box.west for box in boxes),
        south=min(box.south for box in boxes),
        east=max(box.east for box in boxes),
        north=max(box.north for box in boxes),
    )

