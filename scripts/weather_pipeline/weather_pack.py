"""Build a weather JSON pack from strategic metadata and CHELSA monthly climatologies."""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from pathlib import Path
from typing import Any, Final

import h3

from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL
from scripts.weather_pipeline.chelsa_source import (
    CHELSA_DIR,
    ChelsaBands,
    celsius_from_raw,
    open_chelsa_bands,
    precip_mm_from_raw,
    window_mean_raw,
)

LOGGER = logging.getLogger(__name__)

# Mean temperature at or below this value is snow.
SNOW_MEAN_C: Final = 0.0
# Monthly precipitation at or above this value is rain.
RAIN_MM: Final = 120.0
# Mean temperature at or above this value counts as heat.
HEAT_MEAN_C: Final = 23.0
# Search radius, in H3 grid steps, used by the global resolution-1 pack.
GLOBAL_WATER_LAND_STEPS: Final = 2
# Info progress interval while classifying metadata rows.
_PROGRESS_ROWS: Final = 500


def classify_month(mean_c: float, precip_mm: float) -> dict[str, object]:
    """
    Why this exists:
        Match the shared TypeScript month rule for one temperature and precipitation pair.
    When to use:
        Once per month while sampling a hex.
    What to expect:
        A display of snow, rain, heat, or mild, plus whether the month counts as heat.
    """

    LOGGER.log(TRACE_LEVEL, "Classifying month mean_c=%s precip_mm=%s.", mean_c, precip_mm)
    if mean_c <= SNOW_MEAN_C:
        return {"display": "snow", "countsAsHeat": False}
    hot = mean_c >= HEAT_MEAN_C
    if precip_mm >= RAIN_MM:
        return {"display": "rain", "countsAsHeat": hot}
    if hot:
        return {"display": "heat", "countsAsHeat": True}
    return {"display": "mild", "countsAsHeat": False}


def mild_year() -> list[dict[str, object]]:
    """
    Why this exists:
        Give a hex with no sampled neighbor a full year of mild weather.
    When to use:
        When no sampled hex is inside the search radius.
    What to expect:
        Twelve mild months, none of which count as heat.
    """

    LOGGER.log(TRACE_LEVEL, "mild_year months=12.")
    return [{"display": "mild", "countsAsHeat": False} for _ in range(12)]


def nearest_sampled_months(
    origin: str,
    sampled_months: dict[str, list[dict[str, object]]],
    max_steps: int,
) -> list[dict[str, object]]:
    """
    Why this exists:
        Fill a hex the raster did not cover from the closest hex that did sample.
    When to use:
        For each strategic hex whose window mean is missing.
    What to expect:
        The sampled year at the smallest grid distance within ``max_steps``, breaking ties by cell id.
        A mild year when no sampled hex is inside the radius.
    """

    LOGGER.log(TRACE_LEVEL, "Searching %d steps from %s for sampled weather.", max_steps, origin)
    best: tuple[int, str] | None = None
    for distance in range(1, max_steps + 1):
        for cell in h3.grid_disk(origin, distance):
            if cell not in sampled_months:
                continue
            if best is None or (distance, cell) < best:
                best = (distance, cell)
        if best is not None and best[0] == distance:
            break
    if best is None:
        return mild_year()
    return sampled_months[best[1]]


def sample_climate_year(lat: float, lng: float, bands: ChelsaBands) -> list[dict[str, object]] | None:
    """
    Why this exists:
        Classify twelve months from the temperature and precipitation window around one centroid.
    When to use:
        Once per strategic hex, land or water.
    What to expect:
        Twelve classified months, or ``None`` when any month's window is outside the raster or all nodata.
    """

    LOGGER.log(TRACE_LEVEL, "Sampling climate year at lat=%s lng=%s.", lat, lng)
    months: list[dict[str, object]] = []
    for temp_band, rain_band in zip(bands.temperature, bands.precipitation, strict=True):
        temp_raw = window_mean_raw(temp_band, lat, lng)
        rain_raw = window_mean_raw(rain_band, lat, lng)
        if temp_raw is None or rain_raw is None:
            return None
        months.append(classify_month(celsius_from_raw(temp_raw), precip_mm_from_raw(rain_raw)))
    return months


def build_weather_payload(
    metadata_records: list[dict[str, Any]],
    sample_year_at: Callable[[float, float], list[dict[str, object]] | None],
    max_steps: int,
) -> dict[str, Any]:
    """
    Why this exists:
        Turn strategic metadata rows into the weather record list.
    When to use:
        After a sampler is ready. The sampler is called for every row, including ``all_water``.
    What to expect:
        ``{"version": 1, "records": [...]}`` sorted by ``h3Index``. A missing year copies the nearest
        sampled year within ``max_steps``, or a mild year when none is that close.
    """

    payload, _sampled, _copied, _mild = _assemble_weather(metadata_records, sample_year_at, max_steps)
    return payload


def write_weather_pack(
    metadata_path: Path,
    output_path: Path,
    max_steps: int,
    chelsa_dir: Path = CHELSA_DIR,
) -> int:
    """
    Why this exists:
        Write one weather JSON file from a strategic metadata file.
    When to use:
        From the global CLI or a regional export.
    What to expect:
        Compact JSON at ``output_path``. Returns the record count. Closes CHELSA readers before returning.
        Raises ``RuntimeError`` when the CHELSA bands are missing or invalid, and ``OSError`` when a file
        cannot be written. The console line and the info log include sampled, copied, and mild counts.
    """

    LOGGER.debug(
        "Writing weather pack from %s to %s (max_steps=%d, chelsa_dir=%s).",
        metadata_path,
        output_path,
        max_steps,
        chelsa_dir,
    )
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    records = metadata["records"] if isinstance(metadata, dict) else metadata
    bands = open_chelsa_bands(chelsa_dir)
    try:
        payload, sampled, copied, mild = _assemble_weather(
            records,
            lambda lat, lng: sample_climate_year(lat, lng, bands),
            max_steps,
        )
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    except Exception:
        LOGGER.error("Failed to write weather pack to %s.", output_path, exc_info=True)
        raise
    finally:
        bands.close()
    count = len(payload["records"])
    LOGGER.info(
        "Wrote %d weather records to %s (sampled %d, copied %d, mild %d).",
        count,
        output_path,
        sampled,
        copied,
        mild,
    )
    print(f"wrote {count} hexes to {output_path} (sampled {sampled}, copied {copied}, mild {mild})")
    return count


def _assemble_weather(
    metadata_records: list[dict[str, Any]],
    sample_year_at: Callable[[float, float], list[dict[str, object]] | None],
    max_steps: int,
) -> tuple[dict[str, Any], int, int, int]:
    """
    Why this exists:
        Sample every row and count how many years were sampled, copied, or left mild.
    When to use:
        From ``build_weather_payload`` and ``write_weather_pack``.
    What to expect:
        The compact payload plus three counts that sum to the record count.
    """

    LOGGER.debug("Building weather payload for %d records (max_steps=%d).", len(metadata_records), max_steps)
    sampled_months: dict[str, list[dict[str, object]]] = {}
    missing: list[str] = []
    total = len(metadata_records)
    for index, row in enumerate(metadata_records, start=1):
        h3_index = row["h3_index"]
        lat, lng = h3.cell_to_latlng(h3_index)
        sampled = sample_year_at(lat, lng)
        if sampled is None:
            missing.append(h3_index)
        else:
            sampled_months[h3_index] = sampled
        if index % _PROGRESS_ROWS == 0:
            LOGGER.info("Weather rows done %d of %d.", index, total)
    copied = 0
    mild = 0
    known = {id(months) for months in sampled_months.values()}
    output_records: list[dict[str, Any]] = [
        {"h3Index": h3_index, "months": months} for h3_index, months in sampled_months.items()
    ]
    for h3_index in missing:
        months = nearest_sampled_months(h3_index, sampled_months, max_steps)
        if id(months) in known:
            copied += 1
        else:
            mild += 1
        output_records.append({"h3Index": h3_index, "months": months})
    output_records.sort(key=lambda record: record["h3Index"])
    return {"version": 1, "records": output_records}, len(sampled_months), copied, mild
