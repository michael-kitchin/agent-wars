"""Command line for the basemap prototype."""

from __future__ import annotations

import argparse
import logging
import sys
import time
from collections import Counter
from pathlib import Path

from PIL import features

from scripts.basemap_pipeline.basemap_report import write_report
from scripts.basemap_pipeline.basemap_settings import (
    DEFAULT_GMTED_DIR,
    DEFAULT_OUTPUT_ROOT,
    DEFAULT_SETTINGS,
    LEAFLET_DIR,
    STYLES_BY_NAME,
    OutputPaths,
)
from scripts.basemap_pipeline.battle_footprint import battle_footprint
from scripts.basemap_pipeline.composites import crop_rect, write_battle_composites, write_strategic_composites
from scripts.basemap_pipeline.dem_source import (
    build_dem_mosaic,
    dem_bounds_for,
    dem_pixel_count,
    describe_gmted_file,
    files_overlapping,
    find_gmted_files,
    require_dem_size,
    require_gmted_coverage,
    require_shared_pixel_grid,
)
from scripts.basemap_pipeline.flat_weight_raster import write_flat_weight_preview, write_flat_weight_raster
from scripts.basemap_pipeline.pack_cli import run_global_pack, run_regional_pack, run_sources
from scripts.basemap_pipeline.region_inputs import cells_box, load_region_inputs, load_tactical_rows
from scripts.basemap_pipeline.tile_rendering import TileRenderRequest, render_style_tiles
from scripts.basemap_pipeline.web_mercator import tile_range_for_box
from scripts.regional_pipeline.region_paths import REGIONS_ROOT
from scripts.terrain_pipeline.config import ClassifierThresholds, InputRasterSet
from scripts.terrain_pipeline.logging_utils import configure_logging
from scripts.terrain_pipeline.metadata_classifier import classify_metadata_row_without_urban

LOGGER = logging.getLogger(__name__)


def main(argv: list[str] | None = None) -> int:
    """
    Why this exists:
        Run one basemap command from the repository root.
    When to use:
        As ``python -m scripts.basemap_pipeline.basemap_cli``.
    What to expect:
        0 on success, 2 for a missing file or a rejected input, and 1 for any other failure.
    """

    args = _parser().parse_args(argv)
    configure_logging(bool(getattr(args, "verbose", False)))
    LOGGER.debug("basemap command=%s.", args.command)
    if args.command == "all":
        return _run_all(args)
    return _call(lambda: _dispatch(args))


def _dispatch(args: argparse.Namespace) -> None:
    """
    Why this exists:
        Send one parsed command to its handler.
    When to use:
        From ``main`` for every command except ``all``.
    What to expect:
        The handler prints its own progress. Failures are raised.
    """

    handlers = {
        "validate": run_validate,
        "dem": run_dem,
        "weights": run_weights,
        "tiles": run_tiles,
        "composites": run_composites,
        "preview": run_preview,
        "report": run_report,
        "sources": _run_sources,
        "regional-pack": _run_regional_pack,
        "global-pack": _run_global_pack,
    }
    handlers[args.command](args)


def run_validate(args: argparse.Namespace) -> None:
    """
    Why this exists:
        Check inputs and print the extents the later commands will use.
    When to use:
        Before a long render, and as the first step of ``all``.
    What to expect:
        One ``key: value`` line per fact. Raises when an input is missing or a battle is off the map.
    Exceptions:
        ``FileNotFoundError`` or ``ValueError`` naming the failed check.
    """

    LOGGER.debug("run_validate region=%s.", args.region)
    if not (LEAFLET_DIR / "leaflet.js").is_file():
        raise FileNotFoundError("leaflet.js is missing; run from the repository root")
    if not features.check("webp"):
        raise ValueError("Pillow reports no WebP support")
    ocean = args.data_root / InputRasterSet().ocean_shapefile_name
    lakes = args.data_root / InputRasterSet().lake_shapefile_name
    if not ocean.is_file() or not lakes.is_file():
        raise FileNotFoundError(f"shapefile missing: {ocean} {lakes}")
    paths = _paths(args)
    region = load_region_inputs(args.region, args.regions_root, paths)
    infos = [describe_gmted_file(path) for path in find_gmted_files(args.gmted_dir)]
    require_shared_pixel_grid(infos)
    bounds = dem_bounds_for(region.box, DEFAULT_SETTINGS)
    require_dem_size(bounds, DEFAULT_SETTINGS)
    require_gmted_coverage(infos, bounds)
    _print_region(region, bounds)
    tactical = load_tactical_rows(args.region, args.regions_root) if args.battle else {}
    for battle in args.battle:
        _print_battle(region, battle, tactical)


def run_dem(args: argparse.Namespace) -> None:
    """
    Why this exists:
        Write the regional elevation mosaic.
    When to use:
        After validation, before weights and tiles.
    What to expect:
        ``work/dem_4326.tif`` and a printed elapsed time.
    """

    LOGGER.debug("run_dem region=%s.", args.region)
    started = time.perf_counter()
    paths = _paths(args)
    region = load_region_inputs(args.region, args.regions_root, paths)
    infos = [describe_gmted_file(path) for path in find_gmted_files(args.gmted_dir)]
    require_shared_pixel_grid(infos)
    bounds = dem_bounds_for(region.box, DEFAULT_SETTINGS)
    require_dem_size(bounds, DEFAULT_SETTINGS)
    require_gmted_coverage(infos, bounds)
    build_dem_mosaic(files_overlapping(infos, bounds), bounds, paths.dem_path)
    print(f"elapsed_s: {time.perf_counter() - started:.1f}")


def run_weights(args: argparse.Namespace) -> None:
    """
    Why this exists:
        Write the zoom-9 flat-weight raster and its preview.
    When to use:
        After the DEM command.
    What to expect:
        The weight GeoTIFF, a PNG, and a printed elapsed time.
    Exceptions:
        ``FileNotFoundError`` telling the operator to run dem first.
    """

    LOGGER.debug("run_weights region=%s.", args.region)
    paths = _paths(args)
    if not paths.dem_path.is_file():
        raise FileNotFoundError("run dem first")
    started = time.perf_counter()
    region = load_region_inputs(args.region, args.regions_root, paths)
    write_flat_weight_raster(paths.dem_path, region.box, paths.weight_path, DEFAULT_SETTINGS)
    write_flat_weight_preview(paths.weight_path, paths.weight_preview_path)
    print(f"elapsed_s: {time.perf_counter() - started:.1f}")


def run_tiles(args: argparse.Namespace, style_name: str | None = None) -> None:
    """
    Why this exists:
        Render one style.
    When to use:
        After the DEM exists. A flattening style also needs weights.
    What to expect:
        An MBTiles archive, an XYZ folder, and a statistics file.
    """

    name = style_name or args.style
    LOGGER.debug("run_tiles region=%s style=%s.", args.region, name)
    paths = _paths(args)
    region = load_region_inputs(args.region, args.regions_root, paths)
    render_style_tiles(
        TileRenderRequest(region, STYLES_BY_NAME[name], paths, DEFAULT_SETTINGS, args.data_root, args.gmted_dir)
    )


def run_composites(args: argparse.Namespace) -> None:
    """
    Why this exists:
        Stitch the archives into strategic and battle pictures.
    When to use:
        After both styles have been rendered.
    What to expect:
        Eight PNG files for one battle. Prints a clamp note only when a crop was reduced.
    Exceptions:
        ``FileNotFoundError`` when an archive is missing.
        ``ValueError`` when no battle was given or a battle is off the map.
    """

    LOGGER.debug("run_composites region=%s.", args.region)
    if not args.battle:
        raise ValueError("at least one battle is required")
    paths = _paths(args)
    _require_archives(paths)
    region = load_region_inputs(args.region, args.regions_root, paths)
    tactical = load_tactical_rows(args.region, args.regions_root)
    write_strategic_composites(paths, region, DEFAULT_SETTINGS)
    on_map = set(region.roles)
    for battle in args.battle:
        footprint = battle_footprint(battle, on_map, region.tactical_resolution)
        write_battle_composites(paths, region, footprint, tactical, DEFAULT_SETTINGS)


def run_preview(args: argparse.Namespace) -> None:
    """
    Why this exists:
        Write the local comparison page.
    When to use:
        After both tile folders exist.
    What to expect:
        ``preview/index.html`` and ``preview/overlays.js``.
    Exceptions:
        ``FileNotFoundError`` when a tile folder is missing.
    """

    LOGGER.debug("run_preview region=%s.", args.region)
    paths = _paths(args)
    for style_name in STYLES_BY_NAME:
        if not paths.tiles_dir(style_name).is_dir():
            raise FileNotFoundError("run tiles first")
    region = load_region_inputs(args.region, args.regions_root, paths)
    tactical = load_tactical_rows(args.region, args.regions_root)
    on_map = set(region.roles)
    footprints = [battle_footprint(battle, on_map, region.tactical_resolution) for battle in args.battle]
    write_preview(paths, region, footprints, tactical, DEFAULT_SETTINGS)


def run_report(args: argparse.Namespace) -> None:
    """
    Why this exists:
        Write the size comparison.
    When to use:
        After both styles have statistics.
    What to expect:
        ``report.json`` and ``report.md``.
    """

    LOGGER.debug("run_report region=%s.", args.region)
    write_report(_paths(args))


def _run_all(args: argparse.Namespace) -> int:
    """
    Why this exists:
        Run the commands in order and stop at the first failure.
    When to use:
        When rebuilding a region from its inputs.
    What to expect:
        The failing step's exit code, or 0 when every step finishes.
    """

    steps = (
        ("validate", lambda: run_validate(args)),
        ("dem", lambda: run_dem(args)),
        ("weights", lambda: run_weights(args)),
        ("tiles plain", lambda: run_tiles(args, "plain")),
        ("tiles stylized", lambda: run_tiles(args, "stylized")),
        ("composites", lambda: run_composites(args)),
        ("preview", lambda: run_preview(args)),
        ("report", lambda: run_report(args)),
    )
    for name, step in steps:
        LOGGER.debug("all step=%s.", name)
        code = _call(step)
        if code != 0:
            return code
    return 0


def _print_region(region, bounds) -> None:
    """
    Why this exists:
        Print the region facts in a stable order.
    When to use:
        From ``run_validate``.
    What to expect:
        Role counts, the tile ranges, the composite size, and the DEM size.
    """

    settings = DEFAULT_SETTINGS
    print(f"region id: {region.region_id}")
    print(f"res_s: {region.strategic_resolution}")
    print(f"res_t: {region.tactical_resolution}")
    for role in ("land", "neutral_border", "sea"):
        print(f"{role}: {sum(value == role for value in region.roles.values())}")
    print(
        "region box: "
        f"{region.box.west:.6f},{region.box.south:.6f},{region.box.east:.6f},{region.box.north:.6f}"
    )
    total = 0
    for zoom in range(settings.min_zoom, settings.max_native_zoom + 1):
        tile_range = tile_range_for_box(region.box, zoom)
        count = tile_range.tile_count()
        total += count
        print(
            f"zoom {zoom}: x {tile_range.x_min}-{tile_range.x_max} "
            f"y {tile_range.y_min}-{tile_range.y_max} tiles {count}"
        )
    print(f"total tiles: {total}")
    left, top, right, bottom = crop_rect(region.box, settings.strategic_composite_zoom, 0)
    print(f"strategic composite: {right - left} by {bottom - top}")
    print(f"dem bounds: {bounds.west:.6f},{bounds.south:.6f},{bounds.east:.6f},{bounds.north:.6f}")
    print(f"dem pixels: {dem_pixel_count(bounds)}")
    print("gmted coverage: ok")
    print("shapefiles: ok")


def _print_battle(region, battle: str, tactical: dict[str, dict]) -> None:
    """
    Why this exists:
        Print one battle's footprint and terrain counts.
    When to use:
        From ``run_validate`` for each requested battle.
    What to expect:
        Role, cell counts, box, crop sizes, and classifier counts.
    Exceptions:
        ``ValueError`` when the battle hex is not on the map.
    """

    footprint = battle_footprint(battle, set(region.roles), region.tactical_resolution)
    box = cells_box(footprint.cells)
    bare = crop_rect(box, DEFAULT_SETTINGS.tactical_composite_zoom, 0)
    padded = crop_rect(box, DEFAULT_SETTINGS.tactical_composite_zoom, DEFAULT_SETTINGS.battle_pad_px)
    print(
        f"battle {battle}: role {region.roles[battle]} cells {len(footprint.cells)} "
        f"core {len(footprint.core_cells)} "
        f"box {box.west:.6f},{box.south:.6f},{box.east:.6f},{box.north:.6f} "
        f"crop {bare[2] - bare[0]} by {bare[3] - bare[1]} "
        f"pad {padded[2] - padded[0]} by {padded[3] - padded[1]}"
    )
    counts: Counter[str] = Counter()
    for cell in footprint.cells:
        row = tactical.get(cell)
        kind = "missing" if row is None else classify_metadata_row_without_urban(row, ClassifierThresholds())
        counts[kind] += 1
    print(
        f"terrain {battle}: forest {counts['forest']} plains {counts['plains']} "
        f"desert {counts['desert']} mountain {counts['mountain']}"
    )


def _require_archives(paths: OutputPaths) -> None:
    """
    Why this exists:
        Refuse to stitch pictures before both styles exist.
    When to use:
        At the start of the composites command.
    What to expect:
        Returns when both archives exist.
    Exceptions:
        ``FileNotFoundError`` telling the operator to run tiles first.
    """

    missing = [style for style in STYLES_BY_NAME if not paths.mbtiles_path(style).is_file()]
    if missing:
        raise FileNotFoundError("run tiles first")


def _paths(args: argparse.Namespace) -> OutputPaths:
    """
    Why this exists:
        Build the output paths from the common arguments.
    When to use:
        At the start of a command.
    What to expect:
        A path object. Directories are created by the command that writes them.
    """

    return OutputPaths(args.output_root, args.region)


def _call(action) -> int:
    """
    Why this exists:
        Turn a handler failure into the command's exit code.
    When to use:
        Around one command, or around one step of ``all``.
    What to expect:
        0, 2, or 1. The message is printed to stderr and logged.
    """

    try:
        action()
    except (FileNotFoundError, ValueError, KeyError) as exc:
        LOGGER.error("%s", exc)
        print(exc, file=sys.stderr)
        return 2
    except Exception:
        LOGGER.error("basemap command failed", exc_info=True)
        return 1
    return 0


def _parser() -> argparse.ArgumentParser:
    """
    Why this exists:
        Define the subcommands and their arguments.
    When to use:
        From ``main``.
    What to expect:
        A parser whose ``command`` value selects a handler.
    """

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--region", required=True)
    common.add_argument("--regions-root", type=Path, default=REGIONS_ROOT)
    common.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    common.add_argument("--verbose", action="store_true")
    parser = argparse.ArgumentParser(prog="basemap_cli")
    commands = parser.add_subparsers(dest="command", required=True)
    validate = commands.add_parser("validate", parents=[common])
    _add_sources(validate)
    validate.add_argument("--battle", action="append", default=[])
    dem = commands.add_parser("dem", parents=[common])
    dem.add_argument("--gmted-dir", type=Path, default=DEFAULT_GMTED_DIR)
    commands.add_parser("weights", parents=[common])
    tiles = commands.add_parser("tiles", parents=[common])
    _add_sources(tiles)
    tiles.add_argument("--style", required=True, choices=tuple(STYLES_BY_NAME))
    composites = commands.add_parser("composites", parents=[common])
    composites.add_argument("--battle", action="append", required=True)
    preview = commands.add_parser("preview", parents=[common])
    preview.add_argument("--battle", action="append", default=[])
    commands.add_parser("report", parents=[common])
    everything = commands.add_parser("all", parents=[common])
    _add_sources(everything)
    everything.add_argument("--battle", action="append", required=True)
    sources = commands.add_parser("sources")
    sources.add_argument("--gmted-dir", type=Path, default=DEFAULT_GMTED_DIR)
    sources.add_argument("--work", type=Path, default=Path(".test/basemap/world/work"))
    sources.add_argument("--verbose", action="store_true")
    regional = commands.add_parser("regional-pack")
    regional.add_argument("--region", required=True)
    regional.add_argument("--gmted-dir", type=Path, default=DEFAULT_GMTED_DIR)
    regional.add_argument("--work", type=Path, default=Path(".test/basemap/world/work"))
    regional.add_argument("--output", type=Path, required=True)
    regional.add_argument("--skip-existing", action="store_true")
    regional.add_argument("--verbose", action="store_true")
    global_pack = commands.add_parser("global-pack")
    global_pack.add_argument("--gmted-dir", type=Path, default=DEFAULT_GMTED_DIR)
    global_pack.add_argument("--work", type=Path, default=Path(".test/basemap/world/work"))
    global_pack.add_argument("--output", type=Path, required=True)
    global_pack.add_argument("--skip-existing", action="store_true")
    global_pack.add_argument("--verbose", action="store_true")
    return parser


def _run_sources(args: argparse.Namespace) -> None:
    """
    Why this exists:
        Adapt the sources command to the shared exit handler.
    When to use:
        From the command dispatch table.
    What to expect:
        Returns when the mosaics and the sample elevations check out.
    Exceptions:
        ``FileNotFoundError`` when a GMTED zip is missing.
        ``ValueError`` when a sample elevation is wrong.
    """

    run_sources(args.gmted_dir, args.work)


def _run_regional_pack(args: argparse.Namespace) -> None:
    """
    Why this exists:
        Adapt the regional pack command to the shared exit handler.
    When to use:
        From the command dispatch table.
    What to expect:
        Returns after the pack is written.
    """

    run_regional_pack(args.region, args.gmted_dir, args.work, args.output, bool(args.skip_existing))


def _run_global_pack(args: argparse.Namespace) -> None:
    """
    Why this exists:
        Adapt the global pack command to the shared exit handler.
    When to use:
        From the command dispatch table.
    What to expect:
        Returns after the world elevation and the global pack are written.
    """

    run_global_pack(args.gmted_dir, args.work, args.output, bool(args.skip_existing))


def _add_sources(parser: argparse.ArgumentParser) -> None:
    """
    Why this exists:
        Share the elevation and shapefile arguments.
    When to use:
        On commands that read GMTED or Natural Earth.
    What to expect:
        ``--gmted-dir`` and ``--data-root`` with the prototype defaults.
    """

    parser.add_argument("--gmted-dir", type=Path, default=DEFAULT_GMTED_DIR)
    parser.add_argument("--data-root", type=Path, default=InputRasterSet().root)


if __name__ == "__main__":
    sys.exit(main())
