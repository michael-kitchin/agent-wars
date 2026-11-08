"""Quantize, grid, and zip the basemap vector documents.

The TypeScript reader in ``src/shared/vectorPackDecode.ts`` uses the same
half-away-from-zero rule. ``Math.round`` and Python ``round`` both send a
negative half the other way, so neither is used here.
"""

from __future__ import annotations

import json
import logging
import math
import zipfile
from collections.abc import Mapping, Sequence
from pathlib import Path

from scripts.basemap_pipeline.pack_writer import ZIP_TIMESTAMP
from scripts.basemap_pipeline.vector_settings import QUANTUM_DEG
from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)


def half_away_from_zero(value: float) -> int:
    """
    Why this exists:
        ``round`` sends a negative half toward zero. The stored integers must not.
    When to use:
        Quantizing a degree value, and folding a longitude by whole turns of 360°.
    What to expect:
        The sign of ``value`` times the floor of its absolute value plus one half.
        Zero stays zero.
    Exceptions:
        None.
    """

    if value == 0.0:
        return 0
    return int(math.copysign(math.floor(abs(value) + 0.5), value))


def quantize_degrees(degrees: float, quantum_deg: float = QUANTUM_DEG) -> int:
    """
    Why this exists:
        Coordinates are stored as integers so the documents stay small and stable.
    When to use:
        On one latitude or longitude before it enters a part.
    What to expect:
        ``degrees / quantum_deg``, rounded half away from zero.
    Exceptions:
        None. A quantum of zero is not a supported input.
    """

    return half_away_from_zero(degrees / quantum_deg)


def fold_longitude(lng: float) -> float:
    """
    Why this exists:
        A longitude of 180 and a longitude of -180 are the same meridian, and it
        belongs to the first column on both sides of the document.
    When to use:
        Before a cell column is chosen.
    What to expect:
        A longitude in the range ``[-180, 180)``.
    Exceptions:
        None.
    """

    folded = lng - 360.0 * half_away_from_zero(lng / 360.0)
    if folded == 180.0:
        return -180.0
    return folded


def cell_key(lat: float, lng: float, cell_deg: float) -> str:
    """
    Why this exists:
        Lines and mask polygons are stored under the cell that contains them.
    When to use:
        When splitting geometry, and when a test names a cell.
    What to expect:
        ``"<row>:<col>"``. A cell of 360° or more is ``"0:0"``. Latitude 90 stays
        in the last real row. Longitude 180 is column 0.
    Exceptions:
        None.
    """

    LOGGER.log(TRACE_LEVEL, "cell_key lat=%s lng=%s cell_deg=%s", lat, lng, cell_deg)
    if cell_deg >= 360.0:
        return "0:0"
    folded = fold_longitude(lng)
    col = math.floor((folded + 180.0) / cell_deg)
    row = math.floor((lat + 90.0) / cell_deg)
    last_row = math.floor(180.0 / cell_deg) - 1
    if row < 0:
        row = 0
    if row > last_row:
        row = last_row
    return f"{int(row)}:{int(col)}"


def cell_bounds(key: str, cell_deg: float) -> tuple[float, float, float, float]:
    """
    Why this exists:
        A clip rectangle has to be the same rectangle the cell key names.
    When to use:
        Before clipping water or a line into one cell.
    What to expect:
        ``(west, south, east, north)`` in degrees. Adjacent cells share an edge
        and do not overlap. A cell of 360° or more is the whole ``[-180, -90, 180, 90]``.
    Exceptions:
        ``ValueError`` when ``key`` is not ``"<row>:<col>"``.
    """

    LOGGER.log(TRACE_LEVEL, "cell_bounds key=%s cell_deg=%s", key, cell_deg)
    if cell_deg >= 360.0:
        return (-180.0, -90.0, 180.0, 90.0)
    row_text, col_text = key.split(":")
    row = int(row_text)
    col = int(col_text)
    west = -180.0 + col * cell_deg
    south = -90.0 + row * cell_deg
    return (west, south, west + cell_deg, south + cell_deg)


def quantize_part(points_lonlat: Sequence[tuple[float, float]]) -> list[int]:
    """
    Why this exists:
        A line is stored as a first point plus deltas so repeated precision is not repeated.
    When to use:
        After a part has been simplified and clipped to one cell.
    What to expect:
        ``[lat0, lng0, d_lat, d_lng, ...]`` in quantum units. A point equal to the
        previous quantized point is dropped. Fewer than two points returns an empty list.
        Rings are not closed.
    Exceptions:
        None.
    """

    LOGGER.debug("quantize_part points=%s", len(points_lonlat))
    encoded: list[int] = []
    prev_lat = 0
    prev_lng = 0
    started = False
    for lng, lat in points_lonlat:
        q_lat = quantize_degrees(lat)
        q_lng = quantize_degrees(lng)
        if not started:
            encoded.extend((q_lat, q_lng))
            prev_lat = q_lat
            prev_lng = q_lng
            started = True
            continue
        d_lat = q_lat - prev_lat
        d_lng = q_lng - prev_lng
        if d_lat == 0 and d_lng == 0:
            continue
        encoded.extend((d_lat, d_lng))
        prev_lat = q_lat
        prev_lng = q_lng
    if len(encoded) < 4:
        return []
    return encoded


def write_vector_document(path: Path | str, name: str, document: Mapping[str, object]) -> int:
    """
    Why this exists:
        The app reads one JSON member out of a zip, and a second run must write the same bytes.
    When to use:
        At the end of a coastline, mask, border, or label build.
    What to expect:
        The zip size, in bytes. The member is ``<name>.json``, compact UTF-8, deflated,
        with a fixed timestamp.
    Exceptions:
        ``OSError`` when the destination cannot be written.
    """

    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    info = zipfile.ZipInfo(filename=f"{name}.json", date_time=ZIP_TIMESTAMP)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    LOGGER.debug("write_vector_document path=%s name=%s bytes=%s", destination, name, len(payload))
    with zipfile.ZipFile(destination, "w") as archive:
        archive.writestr(info, payload)
    return destination.stat().st_size
