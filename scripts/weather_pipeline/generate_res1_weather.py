"""Build the res1 weather pack from WorldClim 2.1 monthly normals.

Samples each land hex at its centroid. A water hex copies the nearest land hex
within two H3 steps. A water hex with no land that close is mild all year.
"""

from __future__ import annotations

import json
import sys
import urllib.request
import zipfile
from pathlib import Path

import h3
import rasterio

REPO_ROOT = Path(__file__).resolve().parents[2]
METADATA_PATH = REPO_ROOT / "data" / "generated" / "terrain_res1_metadata.json"
OUTPUT_JSON = REPO_ROOT / "data" / "generated" / "terrain_res1_weather.json"
WORLDCLIM_DIR = Path(r"F:\Data\worldclim")
TAVG_URL = "https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_10m_tavg.zip"
PREC_URL = "https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_10m_prec.zip"
SNOW_MEAN_C = 0.0
RAIN_MM = 120.0
HEAT_MEAN_C = 23.0
WATER_LAND_STEPS = 2


def download_and_extract(url: str, destination: Path) -> None:
    """Download one WorldClim zip into F:\\Data\\worldclim when its tifs are absent."""
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
    """Match the shared TypeScript month rule."""
    if mean_c <= SNOW_MEAN_C:
        return {"display": "snow", "countsAsHeat": False}
    hot = mean_c >= HEAT_MEAN_C
    if precip_mm >= RAIN_MM:
        return {"display": "rain", "countsAsHeat": hot}
    if hot:
        return {"display": "heat", "countsAsHeat": True}
    return {"display": "mild", "countsAsHeat": False}


def mild_year() -> list[dict[str, object]]:
    """Twelve mild months for open ocean with no nearby land."""
    return [{"display": "mild", "countsAsHeat": False} for _ in range(12)]


def sample_year(lat: float, lng: float, tavg: list[rasterio.DatasetReader], prec: list[rasterio.DatasetReader]) -> list[dict[str, object]] | None:
    """Read twelve monthly means at one lon/lat. None when any band is nodata."""
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
) -> list[dict[str, object]]:
    """Copy the closest land year within two hexes, else a mild year."""
    best: tuple[int, str] | None = None
    for distance in range(1, WATER_LAND_STEPS + 1):
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


def main() -> None:
    """Write terrain_res1_weather.json from metadata plus WorldClim."""
    download_and_extract(TAVG_URL, WORLDCLIM_DIR)
    download_and_extract(PREC_URL, WORLDCLIM_DIR)
    metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    records = metadata["records"] if isinstance(metadata, dict) else metadata
    tavg_paths = sorted(WORLDCLIM_DIR.glob("wc2.1_10m_tavg_*.tif"))
    prec_paths = sorted(WORLDCLIM_DIR.glob("wc2.1_10m_prec_*.tif"))
    if len(tavg_paths) != 12 or len(prec_paths) != 12:
        raise SystemExit(f"expected 12 tavg and 12 prec tifs, found {len(tavg_paths)} and {len(prec_paths)}")
    tavg = [rasterio.open(path) for path in tavg_paths]
    prec = [rasterio.open(path) for path in prec_paths]
    try:
        land_months: dict[str, list[dict[str, object]]] = {}
        water_indexes: list[str] = []
        for row in records:
            h3_index = row["h3_index"]
            if row.get("all_water") is True:
                water_indexes.append(h3_index)
                continue
            lat, lng = h3.cell_to_latlng(h3_index)
            sampled = sample_year(lat, lng, tavg, prec)
            land_months[h3_index] = sampled if sampled is not None else mild_year()
        output_records = []
        for h3_index, months in land_months.items():
            output_records.append({"h3Index": h3_index, "months": months})
        for h3_index in water_indexes:
            output_records.append({"h3Index": h3_index, "months": nearest_land_months(h3_index, land_months)})
        output_records.sort(key=lambda record: record["h3Index"])
        payload = {"version": 1, "records": output_records}
        OUTPUT_JSON.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        print(f"wrote {len(output_records)} hexes to {OUTPUT_JSON}")
    finally:
        for dataset in tavg + prec:
            dataset.close()


if __name__ == "__main__":
    main()
