"""
Configuration and contracts for terrain generation.

This module centralizes all fixed pipeline decisions so reruns are deterministic
and classification behavior is auditable across code changes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List


TERRAIN_ENUM = ("water", "coastal", "plains", "urban", "forest", "mountain", "desert", "arctic")


@dataclass(frozen=True)
class DbConfig:
    """
    Why this exists:
        Encapsulate DB connection defaults while keeping credentials out of repo files.
    When to use:
        Build a connection string for validation and optional staging tables.
    What to expect:
        Environment variables override defaults and can target a custom host/port/db.
    """

    host: str = "localhost"
    port: int = 5432
    dbname: str = "agent_wars_1"
    user: str = "postgres"
    password_env_var: str = "AGENT_WARS_DB_PASSWORD"


@dataclass(frozen=True)
class InputRasterSet:
    """
    Why this exists:
        Keep all source file expectations explicit and versionable.
    When to use:
        Phase-1 validation and phase-2 opening/loading of EarthEnv rasters.
    What to expect:
        Missing files should fail fast with clear diagnostics.
    """

    root: Path = Path("F:/Data")
    # Ocean/water polygons (e.g. bathy=0); path = root / ocean_shapefile_name. CRS may be geographic or projected;
    # pipeline reprojects to WGS84 then tests in Web Mercator.
    ocean_shapefile_name: str = "ne_10m_ocean.shp"
    # Lakes polygons; merged with ocean for res-4 water predicates only (res-1 uses ocean shapefile alone).
    lake_shapefile_name: str = "ne_10m_lakes.shp"
    # Urban polygons; used only for res-4 urban overrides after base terrain classification.
    urban_shapefile_name: str = "ne_10m_urban_areas.shp"
    airport_shapefile_name: str = "ne_10m_airports.shp"
    port_shapefile_name: str = "ne_10m_ports.shp"
    landcover_by_class: Dict[int, str] = field(
        default_factory=lambda: {
            1: "consensus_full_class_1.tif",
            2: "consensus_full_class_2.tif",
            3: "consensus_full_class_3.tif",
            4: "consensus_full_class_4.tif",
            5: "consensus_full_class_5.tif",
            6: "consensus_full_class_6.tif",
            7: "consensus_full_class_7.tif",
            8: "consensus_full_class_8.tif",
            9: "consensus_full_class_9.tif",
            10: "consensus_full_class_10.tif",
            11: "consensus_full_class_11.tif",
            12: "consensus_full_class_12.tif",
        }
    )
    topo_files: List[str] = field(
        default_factory=lambda: [
            "tri_5KMmn_GMTEDmd.tif",
            "tri_5KMma_GMTEDmd.tif",
            "tri_50KMmn_GMTEDmd.tif",
            "tri_50KMma_GMTEDmd.tif",
            "slope_5KMmn_GMTEDmd.tif",
            "slope_5KMma_GMTEDmd.tif",
            "slope_50KMmn_GMTEDmd.tif",
            "slope_50KMma_GMTEDmd.tif",
            "elevation_5KMmn_GMTEDmn.tif",
            "elevation_5KMma_GMTEDma.tif",
            "elevation_50KMmn_GMTEDmn.tif",
            "elevation_50KMma_GMTEDma.tif",
        ]
    )


@dataclass(frozen=True)
class ClassifierThresholds:
    """
    Why this exists:
        Store tunable thresholds separately from code for reproducibility and safe iteration.
    When to use:
        Terrain class decisions for both res-1 and res-4 cells.
    What to expect:
        Ocean/coastal come from the water mask vs H3 cell polygon (ocean-only at res-1; ocean+lakes at res-4);
        these fields tune interior biomes only.
    """

    arctic_dominant_min: float = 26.0
    forest_dominant_min: float = 38.0
    desert_barren_min: float = 28.0

    # Liberal mountain profile (favor recall).
    mountain_tri_mean_min: float = 24.0
    mountain_slope_mean_min: float = 5.0
    mountain_elevation_max_min: float = 700.0


@dataclass(frozen=True)
class PipelineConfig:
    """
    Why this exists:
        Provide one immutable contract object for phases, outputs, and mappings.
    When to use:
        CLI startup and every pipeline phase implementation.
    What to expect:
        Deterministic paths, fixed precedence, and explicit EarthEnv class mapping rules.
    """

    db: DbConfig = field(default_factory=DbConfig)
    input_rasters: InputRasterSet = field(default_factory=InputRasterSet)
    output_dir: Path = Path("data/generated")
    qa_dir: Path = Path("data/generated/qa")
    schema_name: str = "terrain_gen"

    res_parent: int = 1
    res_child: int = 4
    csv_sort_key: str = "h3_index"

    # Display / QA ordering (not the classify_cell decision order).
    precedence: List[str] = field(
        default_factory=lambda: ["water", "coastal", "urban", "arctic", "forest", "mountain", "desert", "plains"]
    )

    # Land-cover mapping defaults for classes not explicitly elevated by precedence.
    default_landcover_class_to_terrain: Dict[int, str] = field(
        default_factory=lambda: {
            1: "forest",
            2: "forest",
            3: "forest",
            4: "forest",
            5: "plains",
            6: "plains",
            7: "plains",
            8: "plains",
            9: "plains",
            10: "arctic",
            11: "desert",
            12: "water",
        }
    )
    thresholds: ClassifierThresholds = field(default_factory=ClassifierThresholds)

    # Area-weighted contract (implemented using deterministic uniform-point integration over cell area).
    area_weighted_samples_per_cell_res1: int = 25
    area_weighted_samples_per_cell_res4: int = 4

    # Fallback for no-data cells is fixed by product decision.
    nodata_fallback_terrain: str = "water"

    metadata_filename: str = "terrain_generation_metadata.json"
    base_csv_filename: str = "terrain_res1_base.csv"
    exceptions_csv_filename: str = "terrain_res4_exceptions.csv"

    # Per-hex feature metadata (JSON) for TS / analytics; separate from terrain CSV classification outputs.
    terrain_res1_metadata_filename: str = "terrain_res1_metadata.json"
    terrain_res4_metadata_filename: str = "terrain_res4_metadata.json"


def build_default_config() -> PipelineConfig:
    """
    Why this exists:
        Provide a single default config constructor for all entrypoints/tests.
    When to use:
        CLI bootstrap and phase runners.
    What to expect:
        A fully-populated immutable config with locked product decisions.
    """

    return PipelineConfig()

