"""Slope, illumination, and gray tone for one elevation block."""

from __future__ import annotations

import logging
import math

import numpy as np
import scipy.ndimage

from scripts.basemap_pipeline.basemap_settings import BasemapStyle
from scripts.basemap_pipeline.web_mercator import EARTH_RADIUS_M
from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)


def row_ground_spacing_m(top_y_3857: float, rows: int, pixel_size: float) -> np.ndarray:
    """
    Why this exists:
        Web Mercator pixels cover less ground toward the poles.
    When to use:
        Once per block, before converting pixel gradients into rises.
    What to expect:
        Metres of ground per pixel for each row, from north to south.
    """

    LOGGER.log(TRACE_LEVEL, "row_ground_spacing_m top_y=%s rows=%s pixel_size=%s.", top_y_3857, rows, pixel_size)
    centers = top_y_3857 - (np.arange(rows) + 0.5) * pixel_size
    latitudes = np.arctan(np.sinh(centers / EARTH_RADIUS_M))
    return pixel_size * np.cos(latitudes)


def surface_gradients(dem: np.ndarray, spacing_rows: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """
    Why this exists:
        Turn elevation into eastward and northward rise per metre.
    When to use:
        After reading a DEM block and its row spacing.
    What to expect:
        Two arrays shaped like ``dem``. Rows run south, so northward rise flips the row gradient.
    """

    LOGGER.log(TRACE_LEVEL, "surface_gradients shape=%s.", dem.shape)
    d_row, d_col = np.gradient(dem.astype(np.float64))
    spacing = spacing_rows[:, None]
    rise_east = d_col / spacing
    rise_north = -d_row / spacing  # rows run south
    return rise_east, rise_north


def slope_degrees(rise_east: np.ndarray, rise_north: np.ndarray) -> np.ndarray:
    """
    Why this exists:
        Measure steepness without regard to which way the slope faces.
    When to use:
        When building the flat-weight raster.
    What to expect:
        Slope in degrees, one value per pixel.
    """

    LOGGER.log(TRACE_LEVEL, "slope_degrees shape=%s.", rise_east.shape)
    return np.degrees(np.arctan(np.hypot(rise_east, rise_north)))


def flat_illumination(style: BasemapStyle) -> float:
    """
    Why this exists:
        Name the brightness of level ground under this style's light.
    When to use:
        When turning illumination into a deviation from flat.
    What to expect:
        The sine of the light's altitude.
    """

    LOGGER.log(TRACE_LEVEL, "flat_illumination style=%s.", style.name)
    return math.sin(math.radians(style.light_altitude_deg))


def illumination(rise_east: np.ndarray, rise_north: np.ndarray, style: BasemapStyle) -> np.ndarray:
    """
    Why this exists:
        Shade a surface from the style's light direction.
    When to use:
        After scaling the rises by the zoom exaggeration.
    What to expect:
        Values from 0 to 1. A level surface matches ``flat_illumination``.
    """

    LOGGER.log(TRACE_LEVEL, "illumination style=%s shape=%s.", style.name, rise_east.shape)
    azimuth = math.radians(style.light_azimuth_deg)
    altitude = math.radians(style.light_altitude_deg)
    light_east = math.sin(azimuth) * math.cos(altitude)
    light_north = math.cos(azimuth) * math.cos(altitude)
    light_up = math.sin(altitude)
    length = np.sqrt(rise_east * rise_east + rise_north * rise_north + 1.0)
    return np.clip((-rise_east * light_east - rise_north * light_north + light_up) / length, 0.0, 1.0)


def smooth(values: np.ndarray, sigma_px: float) -> np.ndarray:
    """
    Why this exists:
        Soften slope or relief without changing a request for no blur.
    When to use:
        On zoom-9 slope before the flat-weight ramp, and on relief deviation.
    What to expect:
        A float64 array. A non-positive sigma returns a copy of the input.
    """

    LOGGER.log(TRACE_LEVEL, "smooth sigma=%s shape=%s.", sigma_px, values.shape)
    if sigma_px <= 0.0:
        return values.astype(np.float64, copy=True)
    return scipy.ndimage.gaussian_filter(values.astype(np.float64), sigma=sigma_px, mode="nearest")


def smooth_along_ridge(
    dem: np.ndarray,
    rise_east: np.ndarray,
    rise_north: np.ndarray,
    sigma_px: float,
    flat_slope_deg: float,
) -> np.ndarray:
    """
    Why this exists:
        Straighten a jagged crest without softening the slope across it.
    When to use:
        On a DEM block after measuring its slope, and before shading that block.
    What to expect:
        Elevation blurred along the contour. Ground flatter than ``flat_slope_deg`` stays put.
        A non-positive sigma returns a copy.
    """

    LOGGER.log(TRACE_LEVEL, "smooth_along_ridge sigma=%s shape=%s.", sigma_px, dem.shape)
    values = np.asarray(dem, dtype=np.float64)
    if sigma_px <= 0.0:
        return values.copy()
    length = np.hypot(rise_east, rise_north)
    safe = np.maximum(length, 1e-12)
    tangent_east = np.divide(-rise_north, safe, where=length > 0, out=np.zeros_like(length))
    tangent_north = np.divide(rise_east, safe, where=length > 0, out=np.zeros_like(length))
    local_angle = np.arctan2(tangent_north, tangent_east)
    spread = max(1, math.ceil(sigma_px)) * 2 + 1
    # Opposite slope directions are the same crest. Doubling the angle makes them agree,
    # including at a nick where the crest itself has no slope.
    coherence_east = scipy.ndimage.uniform_filter(np.cos(2.0 * local_angle) * length, size=spread, mode="nearest")
    coherence_north = scipy.ndimage.uniform_filter(np.sin(2.0 * local_angle) * length, size=spread, mode="nearest")
    tangent_angle = 0.5 * np.arctan2(coherence_north, coherence_east)
    tangent_east = np.cos(tangent_angle)
    tangent_north = np.sin(tangent_angle)
    radius = max(1, math.ceil(3.0 * sigma_px))
    offsets = np.arange(-radius, radius + 1, dtype=np.float64)
    weights = np.exp(-0.5 * (offsets / sigma_px) ** 2)
    weights /= weights.sum()
    row_index, column_index = np.indices(values.shape, dtype=np.float64)
    blend = np.zeros(values.shape, dtype=np.float64)
    for offset, weight in zip(offsets, weights):
        sample = scipy.ndimage.map_coordinates(
            values,
            [row_index - offset * tangent_north, column_index + offset * tangent_east],
            order=1,
            mode="nearest",
        )
        blend += weight * sample
    if flat_slope_deg <= 0.0:
        return blend
    gate = np.clip(slope_degrees(rise_east, rise_north) / flat_slope_deg, 0.0, 1.0)
    # A nick in a crest is a local extremum, so its own slope is zero. Spread the gate
    # across the smoothing radius so that nick is included with the crest.
    gate = scipy.ndimage.maximum_filter(gate, size=spread, mode="nearest")
    return values + gate * (blend - values)


def flat_weight(slope_deg: np.ndarray, style: BasemapStyle) -> np.ndarray:
    """
    Why this exists:
        Decide how much relief a pixel keeps, from its slope rather than its brightness.
    When to use:
        When building the flat-weight raster, and in shading tests.
    What to expect:
        0 at or below the flat slope, 1 at or above the full-relief slope, and a smooth step between.
        Styles that do not flatten return ones.
    Exceptions:
        ``ValueError`` when flattening is on and the full-relief slope is not above the flat slope.
    """

    LOGGER.log(TRACE_LEVEL, "flat_weight style=%s shape=%s.", style.name, slope_deg.shape)
    if not style.flatten_gentle_terrain:
        return np.ones(slope_deg.shape, dtype=np.float64)
    span = style.full_relief_slope_deg - style.flat_slope_deg
    if span <= 0.0:
        raise ValueError("full relief slope must be greater than the flat slope")
    t = np.clip((slope_deg - style.flat_slope_deg) / span, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def zoom_exaggeration(zoom: int, max_native_zoom: int, style: BasemapStyle) -> float:
    """
    Why this exists:
        Coarser pixels flatten slopes, and this restores them.
    When to use:
        Once per block, before illumination.
    What to expect:
        ``relief_exaggeration`` at the native zoom, and that value times ``step ** (native - zoom)`` below it.
    """

    factor = style.relief_exaggeration * (style.zoom_exaggeration_step ** (max_native_zoom - zoom))
    LOGGER.log(TRACE_LEVEL, "zoom_exaggeration zoom=%s factor=%s.", zoom, factor)
    return factor


def land_tone(deviation: np.ndarray, weight: np.ndarray, style: BasemapStyle) -> np.ndarray:
    """
    Why this exists:
        Map relief deviation onto the gray ramp around flat land.
    When to use:
        After blurring deviation and reading the flat weight.
    What to expect:
        Tone from ``shadow_tone`` to ``highlight_tone``. A zero weight stays at ``flat_tone``.
    """

    LOGGER.log(TRACE_LEVEL, "land_tone style=%s shape=%s.", style.name, deviation.shape)
    flat = flat_illumination(style)
    scaled = style.contrast_gain * weight * deviation
    dark_scale = (style.flat_tone - style.shadow_tone) / flat
    light_scale = (style.highlight_tone - style.flat_tone) / (1.0 - flat)
    tone = np.where(scaled < 0.0, style.flat_tone + scaled * dark_scale, style.flat_tone + scaled * light_scale)
    return np.clip(tone, style.shadow_tone, style.highlight_tone)


def tone_to_gray(tone: np.ndarray) -> np.ndarray:
    """
    Why this exists:
        Turn a 0-to-1 tone into a byte gray level.
    When to use:
        As the last shading step, and when choosing the flat-land gray byte.
    What to expect:
        ``uint8`` values. Halfway cases use round-half-to-even.
    """

    LOGGER.log(TRACE_LEVEL, "tone_to_gray shape=%s.", getattr(tone, "shape", None))
    return np.rint(tone * 255.0).astype(np.uint8)


def crop_margin(values: np.ndarray, margin: int) -> np.ndarray:
    """
    Why this exists:
        Drop the halo after a neighborhood filter, including when the halo is zero.
    When to use:
        After shading or weighting a block that was read with extra pixels.
    What to expect:
        The interior array. A zero margin returns the input itself.
    """

    LOGGER.log(TRACE_LEVEL, "crop_margin margin=%s shape=%s.", margin, values.shape)
    if margin <= 0:
        return values
    return values[margin : values.shape[0] - margin, margin : values.shape[1] - margin]
