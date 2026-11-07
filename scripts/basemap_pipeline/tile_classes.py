"""Classify a raw hillshade tile before it is encoded."""

from __future__ import annotations

import logging
from typing import Final

import numpy as np

from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)

# Gray level of flat land.
FLAT_GRAY: Final = 210
# How far a pixel may sit from flat gray and still count as flat.
FLAT_TOLERANCE: Final = 4
# Class names stored by the pack index. Water is the absence of a key.
CLASS_WATER: Final = "water"
CLASS_FLAT: Final = "flat"
CLASS_SHADED: Final = "shaded"


def classify_tile(rgba: np.ndarray) -> str:
    """
    Why this exists:
        Decide whether a tile must be stored or can share the blank land or water image.
    When to use:
        On the raw uint8 image, before WebP encoding.
    What to expect:
        ``water`` when every alpha is 0, ``flat`` when every pixel is opaque and within 4 of gray 210,
        and ``shaded`` otherwise.
    Exceptions:
        ``ValueError`` when the array is empty or is not RGBA.
    """

    LOGGER.log(TRACE_LEVEL, "classify_tile shape=%s.", getattr(rgba, "shape", None))
    if rgba.ndim != 3 or rgba.shape[2] != 4 or rgba.size == 0:
        raise ValueError("a tile must be a non-empty RGBA image")
    alpha = rgba[..., 3]
    if bool((alpha == 0).all()):
        return CLASS_WATER
    gray = rgba[..., 0]
    opaque = bool((alpha == 255).all())
    near_flat = bool((np.abs(gray.astype(np.int16) - FLAT_GRAY) <= FLAT_TOLERANCE).all())
    channels_match = bool((rgba[..., 0] == rgba[..., 1]).all() and (rgba[..., 1] == rgba[..., 2]).all())
    if opaque and near_flat and channels_match:
        return CLASS_FLAT
    return CLASS_SHADED
