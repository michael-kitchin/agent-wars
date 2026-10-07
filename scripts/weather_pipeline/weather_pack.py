"""Build a weather JSON pack from strategic metadata and WorldClim monthly normals."""

from __future__ import annotations

import json
import logging
import urllib.request
import zipfile
from pathlib import Path
from typing import Any, Final

import h3
import rasterio

from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)

# Mean temperature at or below this value is snow.
SNOW_MEAN_C: Final = 0.0
# Monthly precipitation at or above this value is rain.
RAIN_MM: Final = 120.0
# Mean temperature at or above this value counts as heat.
HEAT_MEAN_C: Final = 23.0
# Directory that caches the WorldClim GeoTIFFs.
WORLDCLIM_DIR: Final = Path(r"F:\Data\worldclim")
# WorldClim 2.1 average-temperature zip.
TAVG_URL: Final = "https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_10m_tavg.zip"
# WorldClim 2.1 precipitation zip.
PREC_URL: Final = "https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_10m_prec.zip"
# Search radius, in H3 grid steps, used by the global resolution-1 pack.
GLOBAL_WATER_LAND_STEPS: Final = 2


def download_and_extract(url: str, destination: Path) -> None:
    """
    Why this exists:
        Cache WorldClim monthly rasters locally so weather export does not download them twice.
    When to use:
        Before opening temperature or precipitation bands.
    What to expect:
        Does nothing when the matching tifs are already present. Raises ``OSError`` or
        ``zipfile.BadZipFile`` when a download or extract fails.
    """

    LOGGER.debug("Ensuring WorldClim archive %s is extracted in %s.", url, destination)
    destination.mkdir(parents=True, exist_ok=True)
    name = url.rsplit("/", 1)[-1]
    marker = "tavg" if "tavg" in name else "prec"
    if any(destination.glob(f"wc2.1_10m_{marker}_*.tif")):
        print(f"worldclim {marker} already present")
        return
    zip_path = destination / name
    if not zip_path.exists():
        print(f"downloading {url}")
        urllib.request.urlretrieve(url, zip_path)
    print(f"extracting {zip_path.name}")
    with zipfile.ZipFile(zip_path) as archive:
        archive.extractall(destination)


def classify_month(mean_c: float, precip_mm: float) -> dict[str, object]:
    """
    Why this exists:
        Match the shared TypeScript month rule for one temperature and precipitation pair.
    When to use:
        Once per month while sampling a land hex.
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
        Give open ocean with no nearby land a full year of mild weather.
    When to use:
        When a water hex has no land hex inside the search radius, or a land sample is nodata.
    What to expect:
        Twelve mild months, none of which count as heat.
    """

    LOGGER.log(TRACE_LEVEL, "mild_year months=12.")
    return [{"display": "mild", "countsAsHeat": False} for _ in range(12)]


def sample_year(
    lat: float,
    lng: float,
    tavg: list[rasterio.DatasetReader],
    prec: list[rasterio.DatasetReader],
) -> list[dict[str, object]] | None:
    """
    Why this exists:
        Read twelve monthly means at one lon/lat.
    When to use:
        For each land hex centroid.
    What to expect:
        Twelve classified months, or ``None`` when any band is nodata or NaN.
    """

    LOGGER.log(TRACE_LEVEL, "Sampling WorldClim year at lat=%s lng=%s.", lat, lng)
    point = [(lng, lat)]
    months: list[dict[str, object]] = []
    for temp_band, rain_band in zip(tavg, prec, strict=True):
        temp_value = next(temp_band.sample(point))[0]
        rain_value = next(rain_band.sample(point))[0]
        if temp_band.nodata is not None and temp_value == temp_band.nodata:
            return None
        if rain_band.nodata is not None and rain_value == rain_band.nodata:
            return None
        if temp_value != temp_value or rain_value != rain_value:
            return None
        months.append(classify_month(float(temp_value), float(rain_value)))
    return months


def nearest_land_months(
    origin: str,
    land_months: dict[str, list[dict[str, object]]],
    max_steps: int,
) -> list[dict[str, object]]:
    """
    Why this exists:
        Copy weather from the closest land hex so water hexes are not left unclassified.
    When to use:
        For each strategic hex whose metadata says ``all_water``.
    What to expect:
        The land year at the smallest grid distance within ``max_steps``, breaking ties by cell id.
        A mild year when no land hex is inside the radius.
    """

    LOGGER.log(TRACE_LEVEL, "Searching %d steps from %s for land weather.", max_steps, origin)
    best: tuple[int, str] | None = None
    for distance in range(1, max_steps + 1):
        for cell in h3.grid_disk(origin, distance):
            if cell not in land_months:
                continue
            if best is None or (distance, cell) < best:
                best = (distance, cell)
        if best is not None and best[0] == distance:
            break
    if best is None:
        return mild_year()
    return land_months[best[1]]


def open_worldclim_bands(worldclim_dir: Path) -> tuple[list[rasterio.DatasetReader], list[rasterio.DatasetReader]]:
    """
    Why this exists:
        Open the twelve temperature and twelve precipitation bands in month order.
    When to use:
        After ``download_and_extract`` has cached both archives.
    What to expect:
        Two lists of open readers, sorted by filename. Raises ``RuntimeError`` when either count is not 12.
        The caller closes the readers.
    """

    LOGGER.debug("Opening WorldClim bands in %s.", worldclim_dir)
    download_and_extract(TAVG_URL, worldclim_dir)
    download_and_extract(PREC_URL, worldclim_dir)
    tavg_paths = sorted(worldclim_dir.glob("wc2.1_10m_tavg_*.tif"))
    prec_paths = sorted(worldclim_dir.glob("wc2.1_10m_prec_*.tif"))
    if len(tavg_paths) != 12 or len(prec_paths) != 12:
        raise RuntimeError(f"expected 12 tavg and 12 prec tifs, found {len(tavg_paths)} and {len(prec_paths)}")
    return [rasterio.open(path) for path in tavg_paths], [rasterio.open(path) for path in prec_paths]


def build_weather_payload(
    metadata_records: list[dict[str, Any]],
    tavg: list[rasterio.DatasetReader],
    prec: list[rasterio.DatasetReader],
    max_steps: int,
) -> dict[str, Any]:
    """
    Why this exists:
        Turn strategic metadata rows into the weather record list.
    When to use:
        After WorldClim bands are open.
    What to expect:
        ``{"version": 1, "records": [...]}`` sorted by ``h3Index``. Water hexes copy the nearest land year.
    """

    LOGGER.debug("Building weather payload for %d records (max_steps=%d).", len(metadata_records), max_steps)
    land_months: dict[str, list[dict[str, object]]] = {}
    water_indexes: list[str] = []
    for row in metadata_records:
        h3_index = row["h3_index"]
        if row.get("all_water") is True:
            water_indexes.append(h3_index)
            continue
        lat, lng = h3.cell_to_latlng(h3_index)
        sampled = sample_year(lat, lng, tavg, prec)
        land_months[h3_index] = sampled if sampled is not None else mild_year()
    output_records: list[dict[str, Any]] = []
    for h3_index, months in land_months.items():
        output_records.append({"h3Index": h3_index, "months": months})
    for h3_index in water_indexes:
        output_records.append({"h3Index": h3_index, "months": nearest_land_months(h3_index, land_months, max_steps)})
    output_records.sort(key=lambda record: record["h3Index"])
    return {"version": 1, "records": output_records}


def write_weather_pack(metadata_path: Path, output_path: Path, max_steps: int) -> int:
    """
    Why this exists:
        Write one weather JSON file from a strategic metadata file.
    When to use:
        From the global CLI or a regional export.
    What to expect:
        Compact JSON at ``output_path``. Returns the record count. Closes WorldClim readers before returning.
        Raises ``RuntimeError`` when the WorldClim bands are incomplete, and ``OSError`` when a file cannot be written.
    """

    LOGGER.debug("Writing weather pack from %s to %s (max_steps=%d).", metadata_path, output_path, max_steps)
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    records = metadata["records"] if isinstance(metadata, dict) else metadata
    tavg, prec = open_worldclim_bands(WORLDCLIM_DIR)
    try:
        payload = build_weather_payload(records, tavg, prec, max_steps)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    except Exception:
        LOGGER.error("Failed to write weather pack to %s.", output_path, exc_info=True)
        raise
    finally:
        for dataset in tavg + prec:
            dataset.close()
    LOGGER.info("Wrote %d weather records to %s.", len(payload["records"]), output_path)
    print(f"wrote {len(payload['records'])} hexes to {output_path}")
    return len(payload["records"])
