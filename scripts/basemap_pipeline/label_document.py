"""The place-name document: land names, then water names."""

from __future__ import annotations

import logging
from pathlib import Path

from scripts.basemap_pipeline.label_anchors import (
    load_continent_features,
    load_country_features,
    load_state_features,
)
from scripts.basemap_pipeline.vector_settings import VECTOR_SCHEMA_VERSION
from scripts.basemap_pipeline.water_label_anchors import load_water_features

LOGGER = logging.getLogger(__name__)


def build_label_document(data_root: Path) -> dict[str, object]:
    """
    Why this exists:
        The app draws place names from one document.
    When to use:
        From the vector command that writes ``map_labels``.
    What to expect:
        Schema ``1.0.0``, kind ``map_labels``, and features for continents, countries, states, then water.
        Each feature's first anchor is its primary point.
    Exceptions:
        ``ValueError`` from a continent that has no fixed anchor. ``fiona.errors.DriverError``
        when a shapefile cannot be opened.
    """

    LOGGER.debug("build_label_document root=%s", data_root)
    features = [
        *load_continent_features(data_root),
        *load_country_features(data_root),
        *load_state_features(data_root),
        *load_water_features(data_root),
    ]
    LOGGER.debug("build_label_document features=%s", len(features))
    return {"schema_version": VECTOR_SCHEMA_VERSION, "kind": "map_labels", "features": features}
