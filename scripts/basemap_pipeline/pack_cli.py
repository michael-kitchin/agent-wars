"""Commands that build the offline basemap packs."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from scripts.basemap_pipeline.gmted_sources import (
    extract_member,
    inventory_sources,
    select_member,
    write_elevation_vrt,
)
from scripts.basemap_pipeline.pack_rendering import PackRenderRequest, render_pack
from scripts.basemap_pipeline.region_extent import boxes_within_world, map_extent_box_for_hexes
from scripts.basemap_pipeline.region_inputs import read_region_json
from scripts.basemap_pipeline.web_mercator import TileRange, tile_range_for_box
from scripts.basemap_pipeline.world_dem import build_world_dem, sample_elevation
from scripts.regional_pipeline.region_manifest import read_manifest
from scripts.regional_pipeline.region_paths import REGIONS_ROOT

LOGGER = logging.getLogger(__name__)


def run_sources(gmted_dir: Path, work_dir: Path) -> int:
    """
    Why this exists:
        Extract the elevation rasters and mosaic them before any pack is rendered.
    When to use:
        As the ``sources`` command.
    What to expect:
        0 when the mont Blanc and Rhine samples match. 2 when a zip is missing.
    Exceptions:
        ``ValueError`` when a sample elevation is wrong. The caller turns that into an exit code.
    """

    LOGGER.debug("run_sources dir=%s work=%s.", gmted_dir, work_dir)
    inventory = inventory_sources(gmted_dir)
    print(f"required {len(inventory.present) + len(inventory.missing)}")
    print(f"present {len(inventory.present)}")
    print(f"missing {len(inventory.missing)}")
    for name in inventory.missing:
        print(f"missing {name}")
    if inventory.missing:
        raise FileNotFoundError("missing GMTED archives: " + ", ".join(inventory.missing))
    fine: list[Path] = []
    coarse: list[Path] = []
    for index, archive in enumerate(inventory.present, start=1):
        extracted = extract_member(archive, gmted_dir)
        if select_member(archive).kind == "dsc300":
            coarse.append(extracted)
        else:
            fine.append(extracted)
        if index % 5 == 0 or index == len(inventory.present):
            print(f"extracted {index}/{len(inventory.present)}", flush=True)
    work_dir.mkdir(parents=True, exist_ok=True)
    fine_vrt = write_elevation_vrt(fine, work_dir / "bln075.vrt")
    write_elevation_vrt(coarse, work_dir / "dsc300.vrt")
    blanc = sample_elevation(fine_vrt, 6.865, 45.833)
    plain = sample_elevation(fine_vrt, 8.3, 48.8)
    foothill = sample_elevation(fine_vrt, 8.5, 48.9)
    print(f"mont blanc {blanc}")
    print(f"rhine plain {plain}")
    print(f"rhine foothill {foothill}")
    if blanc != 4754 or abs(plain - 168) > 50:
        raise ValueError(f"elevation samples mont blanc {blanc}, rhine plain {plain}")
    return 0


def run_regional_pack(region_id: str, gmted_dir: Path, work_dir: Path, output_dir: Path, skip_existing: bool) -> int:
    """
    Why this exists:
        Build zooms 8 and 9 for one region.
    When to use:
        As the ``regional-pack`` command, after ``sources``.
    What to expect:
        A pack directory and a line of tile counts. Returns 0.
    Exceptions:
        ``ValueError`` when the region has no cells or the mosaic is missing.
    """

    LOGGER.debug("run_regional_pack region=%s.", region_id)
    if region_id == "qa":
        raise ValueError("qa is not a region")
    fine_vrt = work_dir / "bln075.vrt"
    if not fine_vrt.is_file():
        raise ValueError("run sources first")
    cells = _region_cells(region_id, work_dir)
    box = map_extent_box_for_hexes(cells)
    if box is None:
        raise ValueError(f"{region_id} has no camera box")
    print(f"camera west {box.west:.6f} south {box.south:.6f} east {box.east:.6f} north {box.north:.6f}")
    ranges = _regional_ranges(box)
    sources = sorted(path for path in gmted_dir.glob("*075.tif"))
    totals = render_pack(
        PackRenderRequest(
            kind="regional",
            map_id=region_id,
            zoom_min=8,
            zoom_max=9,
            native_weight_zoom=9,
            dem_path=fine_vrt,
            output_dir=output_dir,
            work_dir=work_dir / region_id,
            data_root=_natural_earth_root(),
            ranges=tuple(ranges),
            source_paths=tuple(sources),
            skip_existing=skip_existing,
        )
    )
    print(f"shaded {totals['shaded']} flat {totals['flat']} water {totals['water']} zips {totals['zips']}")
    return 0


def run_global_pack(gmted_dir: Path, work_dir: Path, output_dir: Path, skip_existing: bool) -> int:
    """
    Why this exists:
        Build zooms 0 through 7 for the whole world.
    When to use:
        As the ``global-pack`` command, after ``sources``.
    What to expect:
        The 30-arc-second elevation, then the global pack. Returns 0.
    Exceptions:
        ``ValueError`` when the mosaics are missing or the averaged summit is out of range.
    """

    LOGGER.debug("run_global_pack work=%s.", work_dir)
    fine_vrt = work_dir / "bln075.vrt"
    coarse_vrt = work_dir / "dsc300.vrt"
    if not fine_vrt.is_file() or not coarse_vrt.is_file():
        raise ValueError("run sources first")
    dem_path = work_dir / "dem_30s.tif"
    if not (skip_existing and dem_path.is_file()):
        build_world_dem(fine_vrt, coarse_vrt, dem_path)
    blanc = sample_elevation(dem_path, 6.865, 45.833)
    print(f"mont blanc 30s {blanc}")
    if not 1000 <= blanc <= 4754:
        raise ValueError(f"30-arc-second Mont Blanc sample is {blanc}")
    ranges = tuple(TileRange(zoom, 0, 2**zoom - 1, 0, 2**zoom - 1) for zoom in range(7, -1, -1))
    sources = sorted(gmted_dir.glob("*075.tif")) + sorted(gmted_dir.glob("*300.tif"))
    totals = render_pack(
        PackRenderRequest(
            kind="global",
            map_id="global",
            zoom_min=0,
            zoom_max=7,
            native_weight_zoom=7,
            dem_path=dem_path,
            output_dir=output_dir,
            work_dir=work_dir / "global",
            data_root=_natural_earth_root(),
            ranges=ranges,
            source_paths=tuple(sources),
            skip_existing=skip_existing,
        )
    )
    print(f"shaded {totals['shaded']} flat {totals['flat']} water {totals['water']} zips {totals['zips']}")
    return 0


def _region_cells(region_id: str, work_dir: Path) -> list[str]:
    """
    Why this exists:
        Read strategic cells without the prototype box, which rejects the antimeridian.
    When to use:
        At the start of a regional pack.
    What to expect:
        The strategic cell indexes from the region manifest.
    Exceptions:
        ``FileNotFoundError`` when the manifest zip is missing.
    """

    document = read_region_json(region_id, "region_manifest.json", REGIONS_ROOT)
    manifest_path = work_dir / region_id / "region_manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(document), encoding="utf-8")
    manifest = read_manifest(manifest_path)
    return list(manifest.footprint.roles)


def _regional_ranges(box) -> list[TileRange]:
    """
    Why this exists:
        Cover the camera, plus one zoom-9 tile of margin, at zooms 8 and 9.
    When to use:
        After the camera box is known.
    What to expect:
        One or two ranges at each zoom. A crossing box is already split.
    """

    ranges: list[TileRange] = []
    last = 2**9 - 1
    for part in boxes_within_world(box):
        fine = tile_range_for_box(part, 9)
        expanded = TileRange(
            9,
            max(0, fine.x_min - 1),
            min(last, fine.x_max + 1),
            max(0, fine.y_min - 1),
            min(last, fine.y_max + 1),
        )
        ranges.append(expanded)
        ranges.append(TileRange(8, expanded.x_min // 2, expanded.x_max // 2, expanded.y_min // 2, expanded.y_max // 2))
    return ranges


def _natural_earth_root() -> Path:
    """
    Why this exists:
        Reuse the terrain pipeline's Natural Earth location.
    When to use:
        When a pack needs the water mask.
    What to expect:
        The configured data root.
    """

    from scripts.terrain_pipeline.config import InputRasterSet

    return InputRasterSet().root
