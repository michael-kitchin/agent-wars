"""Build the basemap vector zips.

Run ``python -m scripts.basemap_pipeline.vector_cli {coast|mask|borders|labels|all}``.
``labels`` writes the place-name anchors.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from scripts.basemap_pipeline.admin_borders import build_admin_border_document
from scripts.basemap_pipeline.coast_edge_mask import build_coast_edge_mask_document
from scripts.basemap_pipeline.label_anchors import build_label_document
from scripts.basemap_pipeline.coastline_vectors import (
    build_coastline_document,
    coast_lines_3857,
    load_world_water_lonlat,
)
from scripts.basemap_pipeline.vector_encoding import write_vector_document
from scripts.basemap_pipeline.vector_settings import MERCATOR_MAX_LAT, VECTOR_OUTPUT_DIR, VECTOR_WORK_DIR
from scripts.basemap_pipeline.water_coverage import load_water_geometry_3857
from scripts.basemap_pipeline.basemap_settings import OutputPaths
from scripts.basemap_pipeline.web_mercator import LonLatBox

LOGGER = logging.getLogger(__name__)


def main(argv: list[str] | None = None) -> int:
    """
    Why this exists:
        One command writes the coastline, mask, and border zips the app ships.
    When to use:
        From ``python -m scripts.basemap_pipeline.vector_cli``.
    What to expect:
        Exit 0. Prints part, ring, and vertex counts and the zip size, and writes
        ``report.json`` under the work directory. ``all`` runs coast, mask, borders, and labels.
    Exceptions:
        Returns 1 when a build raises. The message is printed.
    """

    args = _parser().parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s %(message)s")
    LOGGER.debug("vector_cli command=%s root=%s", args.command, args.data_root)
    data_root = Path(args.data_root)
    output = Path(args.output)
    work = Path(args.work)
    work.mkdir(parents=True, exist_ok=True)
    commands = ["coast", "mask", "borders", "labels"] if args.command == "all" else [args.command]
    report: dict[str, object] = {"documents": []}
    try:
        for command in commands:
            document, name = _build(command, data_root, work)
            zip_path = output / f"{name}.json.zip"
            zip_bytes = write_vector_document(zip_path, name, document)
            summary = _summarize(name, document, zip_bytes)
            report["documents"].append(summary)
            _print_summary(summary)
    except Exception as error:
        LOGGER.error("vector_cli failed command=%s error=%s", args.command, error)
        print(f"vector build failed: {error}", file=sys.stderr)
        return 1
    (work / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return 0


def _parser() -> argparse.ArgumentParser:
    """
    Why this exists:
        The four builds share one set of paths.
    When to use:
        From ``main``.
    What to expect:
        A parser for the command name, ``--data-root``, ``--output``, ``--work``, and ``--verbose``.
    Exceptions:
        None.
    """

    parser = argparse.ArgumentParser(description="Build basemap vector documents.")
    parser.add_argument("command", choices=("coast", "mask", "borders", "labels", "all"))
    parser.add_argument("--data-root", required=True)
    parser.add_argument("--output", default=str(VECTOR_OUTPUT_DIR))
    parser.add_argument("--work", default=str(VECTOR_WORK_DIR))
    parser.add_argument("--verbose", action="store_true")
    return parser


def _build(command: str, data_root: Path, work: Path) -> tuple[dict[str, object], str]:
    """
    Why this exists:
        Each command names one document.
    When to use:
        From ``main``, for coast, mask, or borders.
    What to expect:
        The document and its file name without the zip suffix.
    Exceptions:
        From the builder when an input is missing or unusable.
    """

    LOGGER.debug("vector_cli build command=%s", command)
    if command == "labels":
        return build_label_document(data_root), "map_labels"
    if command == "coast":
        water = load_water_geometry_3857(
            data_root,
            LonLatBox(-180.0, -MERCATOR_MAX_LAT, 180.0, MERCATOR_MAX_LAT),
            OutputPaths(work, "water"),
        )
        return build_coastline_document(coast_lines_3857(water)), "coastlines"
    if command == "mask":
        return build_coast_edge_mask_document(load_world_water_lonlat(data_root, work)), "coast_edge_mask"
    return build_admin_border_document(data_root), "admin_borders"


def _summarize(name: str, document: dict[str, object], zip_bytes: int) -> dict[str, object]:
    """
    Why this exists:
        The vertex count is how a build is checked against the shapefiles.
    When to use:
        After a zip is written.
    What to expect:
        Zip size, and part, ring, and vertex counts for each band or for the mask.
    Exceptions:
        None.
    """

    if name == "map_labels":
        features = document.get("features")
        counts: dict[str, int] = {}
        if isinstance(features, list):
            for feature in features:
                if isinstance(feature, dict):
                    kind = str(feature.get("kind"))
                    counts[kind] = counts.get(kind, 0) + 1
        return {
            "name": name,
            "zip_bytes": zip_bytes,
            "features": len(features) if isinstance(features, list) else 0,
            "counts": counts,
        }
    if name == "coast_edge_mask":
        rings = 0
        vertices = 0
        cells = document.get("cells")
        if isinstance(cells, dict):
            for cell in cells.values():
                for field in ("water", "land"):
                    polygons = cell.get(field) if isinstance(cell, dict) else None
                    if not isinstance(polygons, list):
                        continue
                    for polygon in polygons:
                        rings += len(polygon)
                        vertices += sum(len(ring) // 2 for ring in polygon)
        return {"name": name, "zip_bytes": zip_bytes, "cells": len(cells) if isinstance(cells, dict) else 0, "rings": rings, "vertices": vertices}
    levels = []
    groups = document.get("groups")
    lod_lists = []
    if isinstance(groups, list):
        for group in groups:
            if isinstance(group, dict):
                lod_lists.append((str(group.get("id")), group.get("lods")))
    else:
        lod_lists.append((name, document.get("lods")))
    for label, lods in lod_lists:
        if not isinstance(lods, list):
            continue
        for lod in lods:
            if not isinstance(lod, dict):
                continue
            parts = 0
            vertices = 0
            cells = lod.get("cells")
            if isinstance(cells, dict):
                for cell_parts in cells.values():
                    if not isinstance(cell_parts, list):
                        continue
                    parts += len(cell_parts)
                    vertices += sum(len(part) // 2 for part in cell_parts)
            levels.append({
                "group": label,
                "min_zoom": lod.get("min_zoom"),
                "max_zoom": lod.get("max_zoom"),
                "parts": parts,
                "vertices": vertices,
            })
    return {"name": name, "zip_bytes": zip_bytes, "levels": levels}


def _print_summary(summary: dict[str, object]) -> None:
    """
    Why this exists:
        The counts need to be visible without opening the report.
    When to use:
        After each document is written.
    What to expect:
        One block of lines naming the zip size and the counts.
    Exceptions:
        None.
    """

    print(f"{summary['name']}: zip_bytes={summary['zip_bytes']}")
    if "counts" in summary:
        counts = summary["counts"]
        print(f"  features={summary['features']} counts={counts}")
        return
    if "levels" in summary:
        for level in summary["levels"]:
            print(
                f"  {level['group']} zoom={level['min_zoom']}..{level['max_zoom']}"
                f" parts={level['parts']} vertices={level['vertices']}"
            )
        return
    print(f"  cells={summary['cells']} rings={summary['rings']} vertices={summary['vertices']}")


if __name__ == "__main__":
    raise SystemExit(main())
