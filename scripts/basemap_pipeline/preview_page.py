"""Local Leaflet page for comparing the two styles."""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from string import Template

import h3

from scripts.basemap_pipeline.basemap_settings import (
    LEAFLET_DIR,
    OTHER_TERRAIN_OUTLINE_RGBA,
    PREVIEW_WATER_RGB,
    ROLE_OUTLINE_RGBA,
    TERRAIN_OUTLINE_RGBA,
    OutputPaths,
    PipelineSettings,
)
from scripts.basemap_pipeline.battle_footprint import BattleFootprint
from scripts.basemap_pipeline.region_inputs import RegionInputs
from scripts.terrain_pipeline.config import ClassifierThresholds
from scripts.terrain_pipeline.metadata_classifier import classify_metadata_row_without_urban

LOGGER = logging.getLogger(__name__)

_PAGE = Template(
    """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>$title</title>
<link rel="stylesheet" href="$leaflet_dir/leaflet.css">
<style>html, body, #map { height: 100%; margin: 0; background: $water_css; }</style>
</head>
<body>
<div id="map"></div>
<script src="$leaflet_dir/leaflet.js"></script>
<script src="overlays.js"></script>
<script>
const data = window.BASEMAP_PREVIEW;
const bounds = L.latLngBounds([[data.box.south, data.box.west], [data.box.north, data.box.east]]);
const tileOptions = { minZoom: data.minZoom, maxNativeZoom: data.maxNativeZoom, maxZoom: data.maxZoom, bounds: bounds };
const stylized = L.tileLayer('../tiles/stylized/{z}/{x}/{y}.webp', tileOptions);
const plain = L.tileLayer('../tiles/plain/{z}/{x}/{y}.webp', tileOptions);
const map = L.map('map', { minZoom: data.minZoom, maxZoom: data.maxZoom, layers: [stylized] });
const outline = (feature) => ({ color: feature.properties.color, weight: 1, fill: false });
const overlays = { 'Strategic hexes': L.geoJSON(data.strategicHexes, { style: outline }) };
for (const battle of data.battles) overlays['Battle ' + battle.cell] = L.geoJSON(battle.cells, { style: outline });
L.control.layers({ 'Stylized': stylized, 'Plain': plain }, overlays, { collapsed: false }).addTo(map);
map.fitBounds(bounds);
</script>
</body>
</html>
"""
)


def write_preview(
    paths: OutputPaths,
    region: RegionInputs,
    footprints: list[BattleFootprint],
    tactical_rows: dict[str, dict],
    settings: PipelineSettings,
) -> None:
    """
    Why this exists:
        Open the rendered tiles in a browser without changing the app.
    When to use:
        After both tile folders exist.
    What to expect:
        ``preview/index.html`` and ``preview/overlays.js``. Water shows the preview color behind the tiles.
    """

    LOGGER.debug("write_preview region=%s battles=%s.", region.region_id, len(footprints))
    paths.preview_dir.mkdir(parents=True, exist_ok=True)
    document = {
        "box": {
            "west": region.box.west,
            "south": region.box.south,
            "east": region.box.east,
            "north": region.box.north,
        },
        "minZoom": settings.min_zoom,
        "maxNativeZoom": settings.max_native_zoom,
        "maxZoom": settings.preview_max_zoom,
        "strategicHexes": {
            "type": "FeatureCollection",
            "features": [
                _feature(cell, {"role": role, "color": _css(ROLE_OUTLINE_RGBA[role])})
                for cell, role in region.roles.items()
            ],
        },
        "battles": [_battle_overlay(footprint, tactical_rows) for footprint in footprints],
    }
    overlays = "window.BASEMAP_PREVIEW = " + json.dumps(document) + ";\n"
    (paths.preview_dir / "overlays.js").write_text(overlays, encoding="utf-8")
    page = _PAGE.substitute(
        leaflet_dir=_leaflet_href(paths.preview_dir),
        water_css=_css(PREVIEW_WATER_RGB),
        title=f"{region.display_name.replace('$', '$$')} basemap preview",
    )
    (paths.preview_dir / "index.html").write_text(page, encoding="utf-8")


def _battle_overlay(footprint: BattleFootprint, tactical_rows: dict[str, dict]) -> dict:
    """
    Why this exists:
        Describe one battle's cells for the preview page.
    When to use:
        While writing ``overlays.js``.
    What to expect:
        A cell id and a GeoJSON feature collection with terrain and color.
    """

    features = []
    for cell in footprint.cells:
        row = tactical_rows.get(cell)
        if row is None:
            kind = "unknown"
            color = OTHER_TERRAIN_OUTLINE_RGBA
        else:
            kind = classify_metadata_row_without_urban(row, ClassifierThresholds())
            color = TERRAIN_OUTLINE_RGBA.get(kind, OTHER_TERRAIN_OUTLINE_RGBA)
        features.append(_feature(cell, {"terrain": kind, "color": _css(color)}))
    return {"cell": footprint.enclosing_cell, "cells": {"type": "FeatureCollection", "features": features}}


def _feature(cell: str, properties: dict[str, str]) -> dict:
    """
    Why this exists:
        Turn one H3 cell into a closed GeoJSON polygon.
    When to use:
        For strategic hexes and battle cells.
    What to expect:
        A polygon whose ring is ``[lng, lat]`` and repeats the first point.
    """

    ring = [[lng, lat] for lat, lng in h3.cell_to_boundary(cell)]
    ring.append(ring[0])
    return {"type": "Feature", "properties": properties, "geometry": {"type": "Polygon", "coordinates": [ring]}}


def _css(color: tuple[int, ...]) -> str:
    """
    Why this exists:
        Format an RGB or RGBA tuple as a CSS color without alpha.
    When to use:
        For overlay properties and the page background.
    What to expect:
        A ``#rrggbb`` string.
    """

    red, green, blue = color[:3]
    return f"#{red:02x}{green:02x}{blue:02x}"


def _leaflet_href(preview_dir: Path) -> str:
    """
    Why this exists:
        Point the preview page at the vendored Leaflet files.
    When to use:
        When writing ``index.html``.
    What to expect:
        A relative path on the same drive, or a ``file:`` URI when the drives differ.
    """

    try:
        return Path(os.path.relpath(LEAFLET_DIR.resolve(), preview_dir.resolve())).as_posix()
    except ValueError:
        return LEAFLET_DIR.resolve().as_uri()
