"""Size report comparing the plain and stylized archives."""

from __future__ import annotations

import json
import logging

from scripts.basemap_pipeline.basemap_settings import OutputPaths
from scripts.basemap_pipeline.tile_store import TileStats

LOGGER = logging.getLogger(__name__)


def write_report(paths: OutputPaths) -> dict:
    """
    Why this exists:
        Compare how large the two styles are.
    When to use:
        After both statistics files and both MBTiles archives exist.
    What to expect:
        ``report.json`` and ``report.md``. The percentage is null when the plain archive has no bytes.
    Exceptions:
        ``FileNotFoundError`` naming every missing input.
    """

    LOGGER.debug("write_report region_dir=%s.", paths.region_dir)
    missing = [
        str(path)
        for style in ("plain", "stylized")
        for path in (paths.stats_path(style), paths.mbtiles_path(style))
        if not path.is_file()
    ]
    if missing:
        raise FileNotFoundError("missing " + ", ".join(missing))
    styles = {}
    for style in ("plain", "stylized"):
        stats = TileStats.from_json(json.loads(paths.stats_path(style).read_text(encoding="utf-8")))
        styles[style] = {
            **stats.to_json(),
            "totals": {
                "tiles": sum(stats.tiles.values()),
                "uniform_flat_land": sum(stats.uniform_flat_land.values()),
                "uniform_water": sum(stats.uniform_water.values()),
                "uniform_other": sum(stats.uniform_other.values()),
                "encoded_bytes": sum(stats.encoded_bytes.values()),
            },
            "mbtiles_bytes": paths.mbtiles_path(style).stat().st_size,
        }
    plain_bytes = styles["plain"]["unique_bytes"]
    if plain_bytes == 0:
        percentage = None
    else:
        percentage = round(100.0 * (styles["stylized"]["unique_bytes"] / plain_bytes - 1.0), 1)
    document = {**styles, "stylized_vs_plain_unique_bytes_pct": percentage}
    paths.report_json_path.write_text(json.dumps(document, indent=2), encoding="utf-8")
    paths.report_md_path.write_text(_markdown(document), encoding="utf-8")
    return document


def _markdown(document: dict) -> str:
    """
    Why this exists:
        Present the size comparison as a table.
    When to use:
        From ``write_report``.
    What to expect:
        One row per zoom per style, then totals and the percentage.
    """

    lines = [
        "# Basemap size report",
        "",
        "| Style | Zoom | Tiles | Uniform flat land | Uniform water | Encoded KB | Average KB |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for style in ("plain", "stylized"):
        stats = document[style]
        for zoom in sorted(stats["tiles"], key=int):
            tiles = stats["tiles"][zoom]
            encoded = stats["encoded_bytes"][zoom]
            average = 0.0 if tiles == 0 else encoded / tiles / 1000.0
            lines.append(
                f"| {style} | {zoom} | {tiles} | {stats['uniform_flat_land'].get(zoom, 0)} "
                f"| {stats['uniform_water'].get(zoom, 0)} | {encoded / 1000:.1f} | {average:.1f} |"
            )
        totals = stats["totals"]
        lines.append(
            f"| {style} | total | {totals['tiles']} | {totals['uniform_flat_land']} "
            f"| {totals['uniform_water']} | {totals['encoded_bytes'] / 1000:.1f} |  |"
        )
    percentage = document["stylized_vs_plain_unique_bytes_pct"]
    shown = "n/a" if percentage is None else f"{percentage}%"
    lines.extend(
        [
            "",
            f"Stylized versus plain unique bytes: {shown}.",
            "",
            "A negative percentage means the stylized archive is smaller.",
        ]
    )
    return "\n".join(lines) + "\n"
