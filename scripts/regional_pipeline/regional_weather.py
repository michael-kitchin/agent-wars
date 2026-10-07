"""Export strategic weather for one region."""

from __future__ import annotations

import logging

from scripts.weather_pipeline.weather_pack import write_weather_pack

from .region_manifest import RegionManifest
from .region_paths import RegionPaths
from .regional_scaling import weather_water_land_steps_for

LOGGER = logging.getLogger(__name__)


def export_region_weather(manifest: RegionManifest, paths: RegionPaths) -> None:
    """
    Why this exists:
        Sample WorldClim months for the region's strategic cells.
    When to use:
        After strategic metadata exists.
    What to expect:
        Writes the weather file. A sea hex copies the nearest land hex inside this region.
    """

    steps = weather_water_land_steps_for(manifest.footprint.strategic_resolution)
    LOGGER.debug("export_region_weather region=%s steps=%s.", manifest.region_id, steps)
    write_weather_pack(paths.metadata_s, paths.weather_s, steps)
