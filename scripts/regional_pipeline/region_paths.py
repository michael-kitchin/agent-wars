"""Output paths for one regional pack."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)

# Root folder for every regional pack.
REGIONS_ROOT: Final = Path("data/generated/regions")
# Manifest filename inside a region folder.
MANIFEST_FILENAME: Final = "region_manifest.json"
# Strategic terrain metadata filename.
METADATA_S_FILENAME: Final = "terrain_res_s_metadata.json"
# Tactical terrain metadata filename.
METADATA_T_FILENAME: Final = "terrain_res_t_metadata.json"
# Strategic naming filename.
NAMING_S_FILENAME: Final = "terrain_res_s_naming.json"
# Tactical naming filename.
NAMING_T_FILENAME: Final = "terrain_res_t_naming.json"
# Strategic landmass filename.
LANDMASS_S_FILENAME: Final = "terrain_res_s_landmass.json"
# Strategic weather filename.
WEATHER_S_FILENAME: Final = "terrain_res_s_weather.json"
# Tactical road and rail side-mask filename.
ROAD_RAIL_SIDES_T_FILENAME: Final = "terrain_res_t_road_rail_sides.json"
# Tactical road and rail vector filename.
ROAD_RAIL_VECTORS_T_FILENAME: Final = "terrain_res_t_road_rail_vectors.json"
# Tactical origin-unit filename. One record per non-water tactical cell.
ORIGIN_UNITS_T_FILENAME: Final = "terrain_res_t_origin_units.json"
# Landmass QA filename inside the region qa folder.
LANDMASS_QA_FILENAME: Final = "landmass_qa.json"
# Cross-region QA folder.
REGIONAL_QA_DIR: Final = REGIONS_ROOT / "qa"


@dataclass(frozen=True)
class RegionPaths:
    """
    Why this exists:
        Keep every file for one region under one folder.
    When to use:
        When writing or checking a regional pack.
    What to expect:
        Properties return paths. They do not create directories.
    """

    # Region folder, normally ``data/generated/regions/<region_id>``.
    folder: Path

    @staticmethod
    def for_region(region_id: str, root: Path = REGIONS_ROOT) -> RegionPaths:
        """
        Why this exists:
            Build the path set for a catalog id.
        When to use:
            Before writing a manifest or any regional export.
        What to expect:
            A path object whose folder is ``root / region_id``.
        """

        LOGGER.debug("RegionPaths.for_region region_id=%s root=%s.", region_id, root)
        return RegionPaths(folder=root / region_id)

    def _child(self, filename: str) -> Path:
        """
        Why this exists:
            Resolve one file inside the region folder and log the lookup.
        When to use:
            From the file properties.
        What to expect:
            ``folder / filename``. Does not check that the file exists.
        """

        LOGGER.log(TRACE_LEVEL, "Region path %s.", filename)
        return self.folder / filename

    @property
    def manifest(self) -> Path:
        """
        Why this exists:
            Locate the region manifest.
        When to use:
            Before reading or writing footprint roles.
        What to expect:
            The manifest path inside the region folder.
        """

        return self._child(MANIFEST_FILENAME)

    @property
    def metadata_s(self) -> Path:
        """
        Why this exists:
            Locate strategic terrain metadata.
        When to use:
            Strategic metadata export and pack checks.
        What to expect:
            The strategic metadata path.
        """

        return self._child(METADATA_S_FILENAME)

    @property
    def metadata_t(self) -> Path:
        """
        Why this exists:
            Locate tactical terrain metadata.
        When to use:
            Tactical metadata export and pack checks.
        What to expect:
            The tactical metadata path.
        """

        return self._child(METADATA_T_FILENAME)

    @property
    def naming_s(self) -> Path:
        """
        Why this exists:
            Locate strategic naming.
        When to use:
            Strategic naming export and pack checks.
        What to expect:
            The strategic naming path.
        """

        return self._child(NAMING_S_FILENAME)

    @property
    def naming_t(self) -> Path:
        """
        Why this exists:
            Locate tactical naming.
        When to use:
            Tactical naming export and pack checks.
        What to expect:
            The tactical naming path.
        """

        return self._child(NAMING_T_FILENAME)

    @property
    def landmass_s(self) -> Path:
        """
        Why this exists:
            Locate strategic landmass records.
        When to use:
            Landmass export and pack checks.
        What to expect:
            The landmass path.
        """

        return self._child(LANDMASS_S_FILENAME)

    @property
    def weather_s(self) -> Path:
        """
        Why this exists:
            Locate strategic weather records.
        When to use:
            Weather export and pack checks.
        What to expect:
            The weather path.
        """

        return self._child(WEATHER_S_FILENAME)

    @property
    def road_rail_sides_t(self) -> Path:
        """
        Why this exists:
            Locate tactical road and rail side masks.
        When to use:
            Side-mask export and pack checks.
        What to expect:
            The side-mask path.
        """

        return self._child(ROAD_RAIL_SIDES_T_FILENAME)

    @property
    def road_rail_vectors_t(self) -> Path:
        """
        Why this exists:
            Locate tactical road and rail display vectors.
        When to use:
            Vector export and pack checks.
        What to expect:
            The vector path.
        """

        return self._child(ROAD_RAIL_VECTORS_T_FILENAME)

    @property
    def origin_units_t(self) -> Path:
        """
        Why this exists:
            Locate the tactical origin-unit records.
        When to use:
            After assigning side groups, and when a pack check looks for the file.
        What to expect:
            The origin-unit JSON path inside the region folder.
        """

        return self._child(ORIGIN_UNITS_T_FILENAME)

    @property
    def qa_dir(self) -> Path:
        """
        Why this exists:
            Locate the QA folder for this region.
        When to use:
            Before writing landmass QA.
        What to expect:
            ``folder / qa``.
        """

        LOGGER.log(TRACE_LEVEL, "Region qa dir for %s.", self.folder)
        return self.folder / "qa"

    @property
    def landmass_qa(self) -> Path:
        """
        Why this exists:
            Locate the landmass QA summary.
        When to use:
            Landmass export and pack checks.
        What to expect:
            The QA JSON path inside ``qa_dir``.
        """

        LOGGER.log(TRACE_LEVEL, "Landmass QA path for %s.", self.folder)
        return self.qa_dir / LANDMASS_QA_FILENAME
