"""Styles, limits, and output paths for the basemap prototype."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Final, Mapping

from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)

# Web Mercator metres used by tile math. WGS84 sphere radius.
DEFAULT_GMTED_DIR: Final = Path("F:/Data/gmted2010")
# Substring that identifies a GMTED2010 7.5-arc-second breakline-emphasis tile.
GMTED_FILE_MARKER: Final = "bln075"
# Prototype renders are written under this folder, which is gitignored.
DEFAULT_OUTPUT_ROOT: Final = Path(".test/basemap")
# Vendored Leaflet used by the local preview page.
LEAFLET_DIR: Final = Path("static/vendor/leaflet")
# Color drawn under transparent water in the preview and the composites.
# Keep this equal to WATER_COLOR in src/renderer/map/basemapLayer.ts.
PREVIEW_WATER_RGB: Final = (113, 148, 177)
# Strategic-cell outline colors, keyed by manifest role.
ROLE_OUTLINE_RGBA: Final[Mapping[str, tuple[int, int, int, int]]] = MappingProxyType(
    {
        "land": (60, 60, 60, 170),
        "neutral_border": (130, 130, 130, 150),
        "sea": (40, 90, 160, 150),
    }
)
# Battle-cell outline colors, keyed by classifier terrain kind.
TERRAIN_OUTLINE_RGBA: Final[Mapping[str, tuple[int, int, int, int]]] = MappingProxyType(
    {
        "mountain": (200, 40, 40, 230),
        "forest": (30, 130, 60, 210),
        "plains": (90, 90, 90, 130),
        "desert": (200, 140, 40, 210),
        "arctic": (120, 160, 200, 210),
    }
)
# Outline used for any other terrain kind, and for a cell with no metadata row.
OTHER_TERRAIN_OUTLINE_RGBA: Final = (40, 90, 160, 190)


@dataclass(frozen=True)
class BasemapStyle:
    """
    Why this exists:
        Hold one hillshade recipe so plain and stylized renders share a contract.
    When to use:
        Pass the style into shading, tile rendering, and the report.
    What to expect:
        Frozen numbers. ``flat_tone``, ``shadow_tone``, and ``highlight_tone`` are 0 to 1.
    """

    # Stable command name, ``plain`` or ``stylized``.
    name: str
    # Compass direction the light comes from, in degrees.
    light_azimuth_deg: float
    # Sun height above the horizon, in degrees.
    light_altitude_deg: float
    # Vertical exaggeration is this value raised to ``(max native zoom - zoom)``.
    zoom_exaggeration_step: float
    # Multiplier on that zoom factor. 1 leaves native-zoom slopes unchanged.
    relief_exaggeration: float
    # When true, gentle slopes are flattened with the flat-weight raster.
    flatten_gentle_terrain: bool
    # Slope at or below this, in degrees, gets no shading when flattening is on.
    flat_slope_deg: float
    # Slope at or above this, in degrees, gets full shading when flattening is on.
    full_relief_slope_deg: float
    # Gaussian blur, in zoom-9 pixels, applied to slope before the flat-weight ramp.
    slope_smoothing_sigma_px: float
    # Multiplier on relief deviation from flat.
    contrast_gain: float
    # Gaussian blur, in that zoom's pixels, applied to relief deviation.
    shade_blur_sigma_px: float
    # Along-contour elevation smoothing, in that zoom's pixels. Zero leaves crests unchanged.
    ridge_smooth_sigma_px: float
    # Gray level of flat land, as a fraction of 255.
    flat_tone: float
    # Darkest land gray, as a fraction of 255.
    shadow_tone: float
    # Lightest land gray, as a fraction of 255.
    highlight_tone: float


# Standard hillshade. Flattening is off and contrast is unchanged.
PLAIN_STYLE: Final = BasemapStyle(
    name="plain",
    light_azimuth_deg=315.0,
    light_altitude_deg=45.0,
    zoom_exaggeration_step=1.2,
    relief_exaggeration=2.0,
    flatten_gentle_terrain=False,
    flat_slope_deg=2.0,
    full_relief_slope_deg=5.0,
    slope_smoothing_sigma_px=0.0,
    contrast_gain=1.0,
    shade_blur_sigma_px=0.0,
    ridge_smooth_sigma_px=6.0,
    flat_tone=210 / 255,
    shadow_tone=0.25,
    highlight_tone=1.0,
)
# Gentle terrain flattened and steep terrain at twice the contrast, with a light blur.
STYLIZED_STYLE: Final = BasemapStyle(
    name="stylized",
    light_azimuth_deg=315.0,
    light_altitude_deg=45.0,
    zoom_exaggeration_step=1.2,
    relief_exaggeration=2.0,
    flatten_gentle_terrain=True,
    flat_slope_deg=2.0,
    full_relief_slope_deg=5.0,
    slope_smoothing_sigma_px=1.0,
    contrast_gain=2.0,
    shade_blur_sigma_px=0.375,
    ridge_smooth_sigma_px=6.0,
    flat_tone=210 / 255,
    shadow_tone=0.25,
    highlight_tone=1.0,
)
# Styles a command may name.
STYLES_BY_NAME: Final = MappingProxyType({"plain": PLAIN_STYLE, "stylized": STYLIZED_STYLE})


@dataclass(frozen=True)
class PipelineSettings:
    """
    Why this exists:
        Keep zoom limits, encoding, and memory guards in one place.
    When to use:
        Pass ``DEFAULT_SETTINGS`` into commands unless a test supplies a smaller limit.
    What to expect:
        Frozen limits. Commands do not read these from the shell.
    """

    # Lowest native tile zoom.
    min_zoom: int = 5
    # Highest zoom that is rendered rather than stretched.
    max_native_zoom: int = 9
    # Zoom of the whole-region composite.
    strategic_composite_zoom: int = 6
    # Zoom of a battle composite.
    tactical_composite_zoom: int = 9
    # Highest zoom the preview page will stretch to.
    preview_max_zoom: int = 12
    # Tiles along one side of a render block.
    block_tiles: int = 8
    # Extra pixels read around a block so along-crest smoothing, blur, and gradients have neighbors.
    halo_px: int = 24
    # Supersample factor for anti-aliased water coverage.
    water_supersample: int = 4
    # Lossy WebP quality.
    webp_quality: int = 80
    # Lossy WebP method.
    webp_method: int = 4
    # Degrees added around the low-zoom tile range before reading elevation.
    dem_margin_deg: float = 1.0
    # Mosaic pixel count above this is rejected.
    dem_max_pixels: int = 600_000_000
    # Extra pixels around a battle composite.
    battle_pad_px: int = 20


# Limits used by every command.
DEFAULT_SETTINGS: Final = PipelineSettings()


@dataclass(frozen=True)
class OutputPaths:
    """
    Why this exists:
        Name every file the prototype writes for one region.
    When to use:
        Build one value from the output root and the region id, then pass it through.
    What to expect:
        Paths only. Nothing is created until a command writes.
    """

    # Folder that contains one subdirectory per region.
    output_root: Path
    # Catalog id, also the directory name.
    region_id: str

    @property
    def region_dir(self) -> Path:
        """
        Why this exists:
            Group one region's prototype outputs.
        When to use:
            Before deriving work, tile, or preview paths.
        What to expect:
            ``output_root / region_id``. The directory may not exist yet.
        """

        LOGGER.log(TRACE_LEVEL, "region_dir root=%s region=%s.", self.output_root, self.region_id)
        return self.output_root / self.region_id

    @property
    def work_dir(self) -> Path:
        """
        Why this exists:
            Keep rasters and caches out of the tile folders.
        When to use:
            When writing the DEM, weights, or water cache.
        What to expect:
            ``region_dir / work``. The directory may not exist yet.
        """

        LOGGER.log(TRACE_LEVEL, "work_dir region=%s.", self.region_id)
        return self.region_dir / "work"

    @property
    def logs_dir(self) -> Path:
        """
        Why this exists:
            Give long commands a place to store transcripts.
        When to use:
            When a command tells the operator where a log should go.
        What to expect:
            ``region_dir / logs``. The directory may not exist yet.
        """

        LOGGER.log(TRACE_LEVEL, "logs_dir region=%s.", self.region_id)
        return self.region_dir / "logs"

    @property
    def manifest_copy_path(self) -> Path:
        """
        Why this exists:
            Give ``read_manifest`` a real file without writing under ``data/generated``.
        When to use:
            When loading region inputs.
        What to expect:
            ``work/region_manifest.json``. The file may not exist yet.
        """

        LOGGER.log(TRACE_LEVEL, "manifest_copy_path region=%s.", self.region_id)
        return self.work_dir / "region_manifest.json"

    @property
    def dem_path(self) -> Path:
        """
        Why this exists:
            Name the elevation mosaic later zooms reproject.
        When to use:
            After the DEM command, and when tiles check that it exists.
        What to expect:
            ``work/dem_4326.tif``. The file may not exist yet.
        """

        LOGGER.log(TRACE_LEVEL, "dem_path region=%s.", self.region_id)
        return self.work_dir / "dem_4326.tif"

    @property
    def weight_path(self) -> Path:
        """
        Why this exists:
            Name the zoom-9 flat-weight raster.
        When to use:
            When stylized tiles need a slope weight.
        What to expect:
            ``work/flat_weight_z9.tif``. The file may not exist yet.
        """

        LOGGER.log(TRACE_LEVEL, "weight_path region=%s.", self.region_id)
        return self.work_dir / "flat_weight_z9.tif"

    @property
    def weight_preview_path(self) -> Path:
        """
        Why this exists:
            Name a small grayscale look at the flat-weight raster.
        When to use:
            After the weights command.
        What to expect:
            ``work/flat_weight_preview.png``. The file may not exist yet.
        """

        LOGGER.log(TRACE_LEVEL, "weight_preview_path region=%s.", self.region_id)
        return self.work_dir / "flat_weight_preview.png"

    @property
    def water_cache_path(self) -> Path:
        """
        Why this exists:
            Name the cached water geometry so later commands skip the dissolve.
        When to use:
            When loading water coverage.
        What to expect:
            ``work/water_3857.wkb``. The file may not exist yet.
        """

        LOGGER.log(TRACE_LEVEL, "water_cache_path region=%s.", self.region_id)
        return self.work_dir / "water_3857.wkb"

    @property
    def water_cache_info_path(self) -> Path:
        """
        Why this exists:
            Record which clip and which shapefile versions the cache was built from.
        When to use:
            Beside ``water_cache_path``.
        What to expect:
            ``work/water_3857.json``. The file may not exist yet.
        """

        LOGGER.log(TRACE_LEVEL, "water_cache_info_path region=%s.", self.region_id)
        return self.work_dir / "water_3857.json"

    @property
    def composites_dir(self) -> Path:
        """
        Why this exists:
            Group the stitched PNG composites.
        When to use:
            When writing strategic or battle pictures.
        What to expect:
            ``composites``. The directory may not exist yet.
        """

        LOGGER.log(TRACE_LEVEL, "composites_dir region=%s.", self.region_id)
        return self.region_dir / "composites"

    @property
    def preview_dir(self) -> Path:
        """
        Why this exists:
            Group the local Leaflet page and its overlay script.
        When to use:
            When writing the preview.
        What to expect:
            ``preview``. The directory may not exist yet.
        """

        LOGGER.log(TRACE_LEVEL, "preview_dir region=%s.", self.region_id)
        return self.region_dir / "preview"

    @property
    def report_json_path(self) -> Path:
        """
        Why this exists:
            Name the machine-readable size report.
        When to use:
            After both styles have tile statistics.
        What to expect:
            ``report.json``. The file may not exist yet.
        """

        LOGGER.log(TRACE_LEVEL, "report_json_path region=%s.", self.region_id)
        return self.region_dir / "report.json"

    @property
    def report_md_path(self) -> Path:
        """
        Why this exists:
            Name the size report a person can read.
        When to use:
            Together with ``report_json_path``.
        What to expect:
            ``report.md``. The file may not exist yet.
        """

        LOGGER.log(TRACE_LEVEL, "report_md_path region=%s.", self.region_id)
        return self.region_dir / "report.md"

    def tiles_dir(self, style_name: str) -> Path:
        """
        Why this exists:
            Name the XYZ folder for one style.
        When to use:
            When writing or checking ``{z}/{x}/{y}.webp``.
        What to expect:
            ``tiles/<style>``. The directory may not exist yet.
        """

        LOGGER.log(TRACE_LEVEL, "tiles_dir region=%s style=%s.", self.region_id, style_name)
        return self.region_dir / "tiles" / style_name

    def mbtiles_path(self, style_name: str) -> Path:
        """
        Why this exists:
            Name the deduplicated tile archive for one style.
        When to use:
            When writing tiles or stitching composites.
        What to expect:
            ``<region>_<style>.mbtiles``. The file may not exist yet.
        """

        LOGGER.log(TRACE_LEVEL, "mbtiles_path region=%s style=%s.", self.region_id, style_name)
        return self.region_dir / f"{self.region_id}_{style_name}.mbtiles"

    def stats_path(self, style_name: str) -> Path:
        """
        Why this exists:
            Name the per-zoom tile statistics for one style.
        When to use:
            After a tiles run, and when writing the size report.
        What to expect:
            ``work/tile_stats_<style>.json``. The file may not exist yet.
        """

        LOGGER.log(TRACE_LEVEL, "stats_path region=%s style=%s.", self.region_id, style_name)
        return self.work_dir / f"tile_stats_{style_name}.json"
