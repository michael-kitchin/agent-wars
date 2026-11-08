"""Read CHELSA V2.1 monthly temperature and precipitation climatologies."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import numpy as np
import rasterio
from rasterio.windows import Window

from scripts.basemap_pipeline.proj_runtime import use_current_proj_data
from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)

# Root that holds the tas and pr climatology directories.
CHELSA_DIR: Final = Path(r"F:\Data\chelsea")
# Period encoded in the climatology file names.
CHELSA_PERIOD: Final = "1981-2010"
# Raw pixel value CHELSA uses for no measurement.
CHELSA_NODATA: Final = 65535
# Multiply a raw pixel by this to undo the integer scaling.
CHELSA_SCALE: Final = 0.1
# Subtract this after scaling a temperature pixel to convert kelvin to Celsius.
KELVIN_TO_CELSIUS: Final = 273.15
# Side of the sampling window, in source pixels. Twenty pixels are 10 arc-minutes.
SAMPLE_WINDOW_PX: Final = 20


@dataclass(frozen=True)
class ChelsaBands:
    """
    Why this exists:
        Keep the twelve temperature datasets and twelve precipitation datasets together.
    When to use:
        After ``open_chelsa_bands`` succeeds, until ``close``.
    What to expect:
        Index 0 of each tuple is January. ``close`` closes every dataset.
    """

    # Monthly mean temperature, January through December.
    temperature: tuple[rasterio.DatasetReader, ...]
    # Monthly precipitation, January through December.
    precipitation: tuple[rasterio.DatasetReader, ...]

    def close(self) -> None:
        """
        Why this exists:
            Release the GeoTIFF handles so a later run can replace the files.
        When to use:
            In a ``finally`` after sampling, including when sampling raises.
        What to expect:
            Every dataset is closed. A second call is safe.
        """

        LOGGER.debug("Closing %d CHELSA datasets.", len(self.temperature) + len(self.precipitation))
        for dataset in self.temperature + self.precipitation:
            dataset.close()


def chelsa_month_path(chelsa_dir: Path, variable: str, month: int) -> Path:
    """
    Why this exists:
        Name one climatology file without searching the directory.
    When to use:
        Before opening temperature or precipitation for months 1 through 12.
    What to expect:
        ``chelsa_dir/<variable>/1981-2010/CHELSA_<variable>_<MM>_1981-2010_V.2.1.tif``.
    """

    LOGGER.log(TRACE_LEVEL, "CHELSA path variable=%s month=%s dir=%s.", variable, month, chelsa_dir)
    return chelsa_dir / variable / CHELSA_PERIOD / f"CHELSA_{variable}_{month:02d}_{CHELSA_PERIOD}_V.2.1.tif"


def celsius_from_raw(raw: float) -> float:
    """
    Why this exists:
        Convert a scaled CHELSA temperature value from kelvin to Celsius.
    When to use:
        After a window mean of a ``tas`` band. The file offset is zero, so kelvin is ``raw * 0.1``.
    What to expect:
        Degrees Celsius. Does not round.
    """

    LOGGER.log(TRACE_LEVEL, "Celsius from raw %s.", raw)
    return raw * CHELSA_SCALE - KELVIN_TO_CELSIUS


def precip_mm_from_raw(raw: float) -> float:
    """
    Why this exists:
        Convert a scaled CHELSA precipitation value to millimetres for the month.
    When to use:
        After a window mean of a ``pr`` band. The unit is already a monthly total.
    What to expect:
        Millimetres. Does not divide by the days in the month and does not round.
    """

    LOGGER.log(TRACE_LEVEL, "Millimetres from raw %s.", raw)
    return raw * CHELSA_SCALE


def window_mean_raw(dataset: rasterio.DatasetReader, lat: float, lng: float) -> float | None:
    """
    Why this exists:
        Average the full-resolution pixels in a 10-arc-minute box around one point.
    When to use:
        Once per band per hex centroid.
    What to expect:
        The mean of the raw values, ignoring nodata. ``None`` when the centroid is outside the
        raster or the clipped window has no valid pixel. Longitude wraps. A raster narrower than
        the window contributes each column once. Scale is not applied. A dataset with no nodata
        treats every pixel as valid.
    """

    if lng == 180:
        lng = -180.0
    row, col = dataset.index(lng, lat)
    if row < 0 or row >= dataset.height:
        LOGGER.log(TRACE_LEVEL, "Window outside raster lat=%s lng=%s row=%s.", lat, lng, row)
        return None
    width = dataset.width
    col %= width
    half = SAMPLE_WINDOW_PX // 2
    row_start = max(0, row - half)
    row_stop = min(dataset.height, row + half)
    if row_stop <= row_start:
        return None
    if width <= SAMPLE_WINDOW_PX:
        spans = [(0, width)]
    else:
        col_start = col - half
        if col_start < 0:
            spans = [(col_start + width, width), (0, col + half)]
        elif col + half > width:
            spans = [(col_start, width), (0, (col + half) % width)]
        else:
            spans = [(col_start, col + half)]
    parts: list[np.ndarray] = []
    for left, right in spans:
        if right <= left:
            continue
        window = Window(left, row_start, right - left, row_stop - row_start)
        parts.append(dataset.read(1, window=window))
    if not parts:
        return None
    values = np.concatenate(parts, axis=1)
    nodata = dataset.nodata
    valid = values.reshape(-1) if nodata is None else values[values != int(nodata)]
    if valid.size == 0:
        LOGGER.log(TRACE_LEVEL, "Window nodata lat=%s lng=%s.", lat, lng)
        return None
    return float(valid.mean())


def open_chelsa_bands(chelsa_dir: Path) -> ChelsaBands:
    """
    Why this exists:
        Open the twelve temperature and twelve precipitation months in calendar order.
    When to use:
        Once per weather export, before sampling hexes.
    What to expect:
        Bands whose index 0 is January. Raises ``RuntimeError`` listing every missing path, or naming
        a file that cannot be opened or fails the CHELSA contract. Datasets already opened are closed
        before the error propagates.
    """

    LOGGER.debug("Opening CHELSA bands in %s.", chelsa_dir)
    use_current_proj_data()
    missing = [
        chelsa_month_path(chelsa_dir, variable, month)
        for variable in ("tas", "pr")
        for month in range(1, 13)
        if not chelsa_month_path(chelsa_dir, variable, month).is_file()
    ]
    if missing:
        raise RuntimeError("missing CHELSA files:\n" + "\n".join(str(path) for path in missing))
    opened: list[rasterio.DatasetReader] = []
    temperature: list[rasterio.DatasetReader | None] = [None] * 12
    precipitation: list[rasterio.DatasetReader | None] = [None] * 12
    reference: dict[str, float | int] | None = None
    try:
        for variable, slots in (("tas", temperature), ("pr", precipitation)):
            for month in range(1, 13):
                path = chelsa_month_path(chelsa_dir, variable, month)
                try:
                    dataset = rasterio.open(path)
                except Exception as error:
                    LOGGER.error("Failed to open CHELSA file %s.", path, exc_info=True)
                    raise RuntimeError(f"failed to open {path}: {error}") from error
                opened.append(dataset)
                try:
                    reference = _require_chelsa_contract(dataset, variable, path, reference)
                except Exception:
                    LOGGER.error("CHELSA file %s failed validation.", path, exc_info=True)
                    raise
                slots[month - 1] = dataset
        return ChelsaBands(
            temperature=tuple(dataset for dataset in temperature if dataset is not None),
            precipitation=tuple(dataset for dataset in precipitation if dataset is not None),
        )
    except Exception:
        for dataset in opened:
            dataset.close()
        raise


def _require_chelsa_contract(
    dataset: rasterio.DatasetReader,
    variable: str,
    path: Path,
    reference: dict[str, float | int] | None,
) -> dict[str, float | int]:
    """
    Why this exists:
        Reject a file that is not the CHELSA climatology this pipeline samples.
    When to use:
        Immediately after opening one month.
    What to expect:
        The shared grid description from the first file. Later files must match it.
        Raises ``RuntimeError`` naming ``path`` and the failed checks.
    """

    LOGGER.log(TRACE_LEVEL, "Checking CHELSA contract for %s.", path)
    problems: list[str] = []
    if dataset.count != 1:
        problems.append(f"count {dataset.count}")
    if dataset.dtypes[0] != "uint16":
        problems.append(f"dtype {dataset.dtypes[0]}")
    if dataset.nodata is None or int(dataset.nodata) != CHELSA_NODATA:
        problems.append(f"nodata {dataset.nodata}")
    scale = float(dataset.scales[0]) if dataset.scales else None
    offset = float(dataset.offsets[0]) if dataset.offsets else None
    if scale is None or abs(scale - CHELSA_SCALE) > 1e-6:
        problems.append(f"scale {scale}")
    if offset is None or abs(offset) > 1e-6:
        problems.append(f"offset {offset}")
    if dataset.tags().get("variable") != variable:
        problems.append(f"variable {dataset.tags().get('variable')}")
    pixel_w = abs(float(dataset.transform.a))
    pixel_h = abs(float(dataset.transform.e))
    origin_x = float(dataset.transform.c)
    origin_y = float(dataset.transform.f)
    if reference is None:
        if problems:
            raise RuntimeError(f"{path}: " + ", ".join(problems))
        return {
            "width": dataset.width,
            "height": dataset.height,
            "pixel_w": pixel_w,
            "pixel_h": pixel_h,
            "origin_x": origin_x,
            "origin_y": origin_y,
        }
    if dataset.width != reference["width"] or dataset.height != reference["height"]:
        problems.append(f"width {dataset.width}, height {dataset.height}")
    if abs(pixel_w - float(reference["pixel_w"])) > 1e-8 or abs(pixel_h - float(reference["pixel_h"])) > 1e-8:
        problems.append("pixel size")
    if abs(origin_x - float(reference["origin_x"])) > 1e-4 or abs(origin_y - float(reference["origin_y"])) > 1e-4:
        problems.append("origin")
    if problems:
        raise RuntimeError(f"{path}: " + ", ".join(problems))
    return reference
