"""
Phase-oriented EarthEnv -> H3 terrain generation pipeline.
"""

from __future__ import annotations

import csv
import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Dict, Iterable, List, Sequence

import h3
import rasterio
from shapely.ops import unary_union

from .classifier import CellFeatures, classify_cell
from .config import InputRasterSet, PipelineConfig, TERRAIN_ENUM
from .db import ensure_schema, open_connection, resolve_db_runtime_config, validate_required_extensions
from .ocean_mask import (
    OceanPredicateContext,
    build_ocean_predicate_context,
    load_ocean_union_wgs84,
    ocean_relation_for_cell_polygons,
)
from .point_features import validate_point_shapefile_contract
from .sampling import (
    _ensure_proj_data_env,
    cell_polygon,
    deterministic_points_within_polygon,
    sample_many_rasters,
)

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class TerrainRecord:
    """
    Why this exists:
        Keep terrain rows structured before CSV/database writes.
    When to use:
        During phase-4 and phase-5 terrain export.
    What to expect:
        Holds canonical string fields used in output schemas.
    """

    h3_index: str
    terrain: str
    parent_h3: str | None = None
    parent_terrain: str | None = None


class TerrainPipeline:
    """
    Why this exists:
        Execute all in-scope milestone phases in a deterministic sequence.
    When to use:
        CLI runs for full generation or phase-specific troubleshooting.
    What to expect:
        Deterministic outputs, validation gates, and failure on invalid contracts.
    """

    def __init__(self, config: PipelineConfig) -> None:
        self.config = config
        self.config.output_dir.mkdir(parents=True, exist_ok=True)
        self.config.qa_dir.mkdir(parents=True, exist_ok=True)
        self._ocean_only_ctx: OceanPredicateContext | None = None
        self._ocean_and_lakes_ctx: OceanPredicateContext | None = None
        self._res4_urban_ctx: OceanPredicateContext | None = None

    def validate_phase_1_environment(self) -> None:
        """
        Why this exists:
            Ensure environment prerequisites are healthy before any expensive processing starts.
        When to use:
            First phase in every run.
        What to expect:
            Raises explicit errors for missing DB extensions/files/invalid raster metadata.
        """

        LOGGER.debug("Starting phase 1 validation.")
        # Prefer Rasterio's bundled PROJ database over a system/PostGIS proj.db (version mismatch warnings).
        _ensure_proj_data_env()

        runtime = resolve_db_runtime_config(self.config.db)
        conn = open_connection(runtime)
        try:
            validate_required_extensions(conn, required=("postgis", "h3"))
        finally:
            conn.close()

        missing: List[str] = []
        for path in self._raster_input_paths():
            if not path.exists():
                missing.append(str(path))
                continue
            if not path.is_file():
                missing.append(str(path))
                continue
            with rasterio.open(path) as ds:
                _ = ds.count
                _ = ds.width
                _ = ds.height
                _ = ds.crs
                _ = ds.nodata
        if missing:
            raise RuntimeError("Missing required raster files:\n" + "\n".join(missing))

        ocean_path = self._ocean_input_path()
        lake_path = self._lake_input_path()
        urban_path = self._urban_input_path()
        airport_path = self._airport_input_path()
        seaport_path = self._seaport_input_path()
        if not ocean_path.is_file():
            raise RuntimeError(f"Missing ocean shapefile (expected at {ocean_path}).")
        if not lake_path.is_file():
            raise RuntimeError(f"Missing lake shapefile (expected at {lake_path}).")
        if not urban_path.is_file():
            raise RuntimeError(f"Missing urban shapefile (expected at {urban_path}).")
        if not airport_path.is_file():
            raise RuntimeError(f"Missing airport shapefile (expected at {airport_path}).")
        if not seaport_path.is_file():
            raise RuntimeError(f"Missing seaport shapefile (expected at {seaport_path}).")
        try:
            _ = self._ocean_predicate_context()
            _ = self._res4_water_predicate_context()
            _ = self._res4_urban_predicate_context()
            airport_count = validate_point_shapefile_contract(
                airport_path,
                featurecla_value="Airport",
            )
            port_count = validate_point_shapefile_contract(
                seaport_path,
                featurecla_value="Seaport",
            )
        except Exception as exc:
            LOGGER.error(
                "Phase 1 shapefile validation failed.",
                exc_info=True,
            )
            raise RuntimeError(
                "Terrain shapefiles failed to load "
                f"(ocean: {ocean_path}; lakes: {lake_path}; urban: {urban_path}; "
                f"airports: {airport_path}; seaports: {seaport_path})."
            ) from exc

        LOGGER.info(
            "Phase 1 passed: DB, rasters, and shapefiles validated "
            "(airport_features=%d, seaport_features=%d).",
            airport_count,
            port_count,
        )

    def run_phase_2_schema_and_cells(self, max_child_cells: int | None = None) -> dict[str, List[str]]:
        """
        Why this exists:
            Build canonical H3 cell sets and stage them in a dedicated DB schema.
        When to use:
            After environment validation and before feature extraction.
        What to expect:
            Returns sorted res-1 and res-4 cell lists (res-4 optionally limited for dry runs).
        """

        LOGGER.debug("Starting phase 2 schema and H3 cell staging.")
        runtime = resolve_db_runtime_config(self.config.db)
        conn = open_connection(runtime)
        try:
            ensure_schema(conn, self.config.schema_name)
            res1_cells = self._generate_cells_for_resolution(self.config.res_parent)
            res4_cells = self._generate_cells_for_resolution(self.config.res_child)
            if max_child_cells is not None:
                res4_cells = res4_cells[:max_child_cells]

            with conn.cursor() as cur:
                cur.execute(f'DROP TABLE IF EXISTS "{self.config.schema_name}".h3_res1_cells')
                cur.execute(f'DROP TABLE IF EXISTS "{self.config.schema_name}".h3_res4_cells')
                cur.execute(
                    f'CREATE TABLE "{self.config.schema_name}".h3_res1_cells (h3_index text PRIMARY KEY)'
                )
                cur.execute(
                    f'CREATE TABLE "{self.config.schema_name}".h3_res4_cells ('
                    "h3_index text PRIMARY KEY, parent_h3 text NOT NULL)"
                )
                cur.executemany(
                    f'INSERT INTO "{self.config.schema_name}".h3_res1_cells (h3_index) VALUES (%s)',
                    [(c,) for c in res1_cells],
                )
                cur.executemany(
                    f'INSERT INTO "{self.config.schema_name}".h3_res4_cells (h3_index, parent_h3) VALUES (%s, %s)',
                    [(c, h3.cell_to_parent(c, self.config.res_parent)) for c in res4_cells],
                )
            conn.commit()
        finally:
            conn.close()

        LOGGER.info(
            "Phase 2 complete: staged %d res-%d cells and %d res-%d cells.",
            len(res1_cells),
            self.config.res_parent,
            len(res4_cells),
            self.config.res_child,
        )
        return {"res1_cells": res1_cells, "res4_cells": res4_cells}

    def run_phase_3_contract_checks(self) -> None:
        """
        Why this exists:
            Verify classifier contracts before running expensive full-world classification.
        When to use:
            Immediately before phase-4 base generation.
        What to expect:
            Raises if config contracts are invalid or terrain enum is inconsistent.
        """

        LOGGER.debug("Starting phase 3 classifier contract checks.")
        expected = frozenset(
            {"water", "coastal", "plains", "urban", "forest", "mountain", "desert", "arctic"},
        )
        if frozenset(TERRAIN_ENUM) != expected:
            raise RuntimeError("Unexpected TERRAIN_ENUM contents.")
        if self.config.nodata_fallback_terrain not in TERRAIN_ENUM:
            raise RuntimeError("Invalid nodata fallback terrain.")
        LOGGER.info("Phase 3 complete: classifier contracts validated.")

    def run_phase_4_generate_res1(self, res1_cells: Sequence[str]) -> Dict[str, str]:
        """
        Why this exists:
            Produce canonical base terrain for all res-1 cells.
        When to use:
            After phase-3 checks and before res-4 exception extraction.
        What to expect:
            Writes deterministic base CSV and returns a parent-terrain lookup map.
        """

        LOGGER.debug("Starting phase 4 res-1 generation.")
        records = self._classify_cells_for_resolution(res1_cells, resolution=self.config.res_parent)
        records = sorted(records, key=lambda r: r.h3_index)
        self._write_base_csv(records)
        self._write_terrain_counts_csv(records, self.config.qa_dir / "terrain_counts_res1.csv")
        self._stage_base_table(records)
        parent_map = {r.h3_index: r.terrain for r in records}
        LOGGER.info("Phase 4 complete: generated %d res-1 terrain rows.", len(records))
        return parent_map

    def run_phase_5_generate_res4_exceptions(
        self,
        res4_cells: Sequence[str],
        parent_map: Dict[str, str],
    ) -> None:
        """
        Why this exists:
            Generate child terrain and export only parent-mismatch exceptions.
        When to use:
            After res-1 base generation has produced parent terrain lookup.
        What to expect:
            Writes deterministic exceptions CSV and QA summaries for match/mismatch rates.
        """

        LOGGER.debug("Starting phase 5 res-4 exception extraction.")
        child_records = self._classify_cells_for_resolution(res4_cells, resolution=self.config.res_child)
        child_records = sorted(child_records, key=lambda r: r.h3_index)
        full_counts_out = self.config.qa_dir / "terrain_counts_res4.csv"
        self._write_terrain_counts_csv(child_records, full_counts_out)

        exceptions: List[TerrainRecord] = []
        same_count = 0
        for child in child_records:
            parent_h3 = h3.cell_to_parent(child.h3_index, self.config.res_parent)
            parent_terrain = parent_map.get(parent_h3, self.config.nodata_fallback_terrain)
            if child.terrain != parent_terrain:
                exceptions.append(
                    TerrainRecord(
                        h3_index=child.h3_index,
                        parent_h3=parent_h3,
                        terrain=child.terrain,
                        parent_terrain=parent_terrain,
                    )
                )
            else:
                same_count += 1

        self._write_exceptions_csv(exceptions)
        self._write_parent_child_match_rates_csv(len(child_records), same_count, len(exceptions))
        self._stage_exceptions_table(exceptions)
        LOGGER.info(
            "Phase 5 complete: %d children processed, %d exceptions exported.",
            len(child_records),
            len(exceptions),
        )

    def run_phase_6_metadata(self) -> None:
        """
        Why this exists:
            Persist reproducibility metadata and enforce final output sanity guardrails.
        When to use:
            After both CSV outputs exist.
        What to expect:
            Writes metadata JSON with file checksums and run contracts.
        """

        LOGGER.debug("Starting phase 6 metadata and guardrails.")
        base_csv = self.config.output_dir / self.config.base_csv_filename
        exceptions_csv = self.config.output_dir / self.config.exceptions_csv_filename
        if not base_csv.exists() or not exceptions_csv.exists():
            raise RuntimeError("Required CSV outputs missing; cannot produce metadata.")

        for csv_path in (base_csv, exceptions_csv):
            if csv_path.stat().st_size == 0:
                raise RuntimeError(f"Output CSV is empty: {csv_path}")

        metadata = {
            "run_id": datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ"),
            "generated_at_utc": datetime.now(UTC).isoformat(),
            "db": {
                "host": self.config.db.host,
                "seaport": self.config.db.seaport,
                "dbname": self.config.db.dbname,
                "user": self.config.db.user,
                "schema": self.config.schema_name,
            },
            "config": {
                "res_parent": self.config.res_parent,
                "res_child": self.config.res_child,
                "precedence": self.config.precedence,
                "nodata_fallback_terrain": self.config.nodata_fallback_terrain,
                "area_weighted_samples_per_cell_res1": self.config.area_weighted_samples_per_cell_res1,
                "area_weighted_samples_per_cell_res4": self.config.area_weighted_samples_per_cell_res4,
                "ocean_shapefile": str(self._ocean_input_path()),
                "lake_shapefile": str(self._lake_input_path()),
                "urban_shapefile": str(self._urban_input_path()),
                "thresholds": self.config.thresholds.__dict__,
                "aggregation_contract": (
                    "deterministic uniform-point integration over H3 cell area (area-weighted approximation); "
                    "res-1 water/coastal from ocean polygon shapefile vs H3 cell; res-4 water/coastal from "
                    "merged ocean+lakes polygon shapefiles vs H3 cell; res-4 urban override from urban polygons "
                    "intersecting cells that are not fully in water (EPSG:3857 predicates)"
                ),
            },
            "inputs": [
                {"path": str(path), "sha256": self._sha256(path)} for path in self._all_input_paths()
            ],
            "outputs": [
                {"path": str(base_csv), "sha256": self._sha256(base_csv)},
                {"path": str(exceptions_csv), "sha256": self._sha256(exceptions_csv)},
            ],
        }
        metadata_path = self.config.output_dir / self.config.metadata_filename
        with metadata_path.open("w", encoding="utf-8", newline="\n") as f:
            json.dump(metadata, f, indent=2)
        LOGGER.info("Phase 6 complete: metadata written to %s", metadata_path)

    def run_all(self, max_child_cells: int | None = None) -> None:
        """
        Why this exists:
            Provide one reliable end-to-end execution path for all in-scope phases.
        When to use:
            Normal terrain generation runs.
        What to expect:
            Executes phases 1-6 in order and raises on first blocking error.
        """

        self.validate_phase_1_environment()
        cells = self.run_phase_2_schema_and_cells(max_child_cells=max_child_cells)
        self.run_phase_3_contract_checks()
        parent_map = self.run_phase_4_generate_res1(cells["res1_cells"])
        self.run_phase_5_generate_res4_exceptions(cells["res4_cells"], parent_map)
        self.run_phase_6_metadata()

    def _ocean_input_path(self) -> Path:
        r = self.config.input_rasters
        return r.root / r.ocean_shapefile_name

    def _lake_input_path(self) -> Path:
        r = self.config.input_rasters
        return r.root / r.lake_shapefile_name

    def _urban_input_path(self) -> Path:
        r = self.config.input_rasters
        return r.root / r.urban_shapefile_name

    def _airport_input_path(self) -> Path:
        r = self.config.input_rasters
        return r.root / r.airport_shapefile_name

    def _seaport_input_path(self) -> Path:
        r = self.config.input_rasters
        return r.root / r.seaport_shapefile_name

    def _ocean_predicate_context(self) -> OceanPredicateContext:
        """
        Why this exists:
            Avoid loading and preparing the global ocean union multiple times per run (phase 1 + res-1 classification).
        When to use:
            Phase 1 validation and res-1 (parent) cell classification; lakes are not part of this mask.
        What to expect:
            First call reads the ocean shapefile, dissolves, projects to EPSG:3857, and builds a prepared geometry;
            later calls return the same instance.
        """

        if self._ocean_only_ctx is None:
            self._ocean_only_ctx = build_ocean_predicate_context(
                load_ocean_union_wgs84(self._ocean_input_path())
            )
        return self._ocean_only_ctx

    def _res4_water_predicate_context(self) -> OceanPredicateContext:
        """
        Why this exists:
            Reuse one prepared ocean+lakes union for all res-4 child cells (same predicate rules as ocean-only).
        When to use:
            Phase 1 validation and res-4 exception classification only.
        What to expect:
            Merges dissolved ocean and lake polygons in WGS84, then builds the same EPSG:3857 prepared index as
            ``_ocean_predicate_context``.
        """

        if self._ocean_and_lakes_ctx is None:
            ocean_wgs84 = load_ocean_union_wgs84(self._ocean_input_path())
            lake_wgs84 = load_ocean_union_wgs84(self._lake_input_path())
            self._ocean_and_lakes_ctx = build_ocean_predicate_context(
                unary_union((ocean_wgs84, lake_wgs84))
            )
        return self._ocean_and_lakes_ctx

    def _res4_urban_predicate_context(self) -> OceanPredicateContext:
        """
        Why this exists:
            Reuse one prepared union for urban polygons so res-4 classification can cheaply detect urban cells.
        When to use:
            Phase 1 validation and res-4 exception classification only.
        What to expect:
            First call loads urban polygons, dissolves, projects to EPSG:3857, and prepares predicates.
        """

        if self._res4_urban_ctx is None:
            self._res4_urban_ctx = build_ocean_predicate_context(
                load_ocean_union_wgs84(self._urban_input_path())
            )
        return self._res4_urban_ctx

    def _raster_input_paths(self) -> List[Path]:
        """GeoTIFF inputs only; shapefiles are validated with Fiona, not rasterio.open."""
        paths: List[Path] = []
        r: InputRasterSet = self.config.input_rasters
        for _, filename in sorted(r.landcover_by_class.items()):
            paths.append(r.root / filename)
        for filename in r.topo_files:
            paths.append(r.root / filename)
        return paths

    def _all_input_paths(self) -> List[Path]:
        """Rasters plus ocean/lake/urban shapefiles (for metadata checksums only)."""
        return self._raster_input_paths() + [
            self._ocean_input_path(),
            self._lake_input_path(),
            self._urban_input_path(),
            self._airport_input_path(),
            self._seaport_input_path(),
        ]

    def _generate_cells_for_resolution(self, resolution: int) -> List[str]:
        cells: List[str] = []
        for res0 in h3.get_res0_cells():
            cells.extend(h3.cell_to_children(res0, resolution))
        # deterministic sort for stable CSV and staging order
        return sorted(set(cells))

    def _open_required_rasters(self) -> dict[str, rasterio.DatasetReader]:
        _ensure_proj_data_env()
        datasets: dict[str, rasterio.DatasetReader] = {}
        r = self.config.input_rasters
        try:
            for cls, filename in sorted(r.landcover_by_class.items()):
                datasets[f"class_{cls}"] = rasterio.open(r.root / filename)
            for filename in r.topo_files:
                key = filename.replace(".tif", "")
                datasets[key] = rasterio.open(r.root / filename)
            return datasets
        except Exception:
            for ds in datasets.values():
                ds.close()
            raise

    def _classify_cells_for_resolution(self, cells: Sequence[str], resolution: int) -> List[TerrainRecord]:
        sample_count = (
            self.config.area_weighted_samples_per_cell_res1
            if resolution == self.config.res_parent
            else self.config.area_weighted_samples_per_cell_res4
        )

        topo_keys = (
            ("tri_50KMmn_GMTEDmd", "slope_50KMmn_GMTEDmd", "elevation_50KMma_GMTEDma")
            if resolution == self.config.res_parent
            else ("tri_5KMmn_GMTEDmd", "slope_5KMmn_GMTEDmd", "elevation_5KMma_GMTEDma")
        )
        out: List[TerrainRecord] = []

        # Ocean/coastal from shapefile vs cell polygon (ocean only at res-1; ocean+lakes at res-4).
        needed_landcover_classes = tuple(range(1, 13))
        needed_keys = {f"class_{c}" for c in needed_landcover_classes}
        needed_keys.update(topo_keys)

        water_ctx = (
            self._ocean_predicate_context()
            if resolution == self.config.res_parent
            else self._res4_water_predicate_context()
        )
        urban_ctx = self._res4_urban_predicate_context() if resolution == self.config.res_child else None

        datasets = self._open_required_rasters()
        try:
            raster_pairs = [(k, v) for k, v in datasets.items() if k in needed_keys]
            for idx, cell in enumerate(cells, start=1):
                poly = cell_polygon(cell)
                relation = ocean_relation_for_cell_polygons(poly, water_ctx)
                points = deterministic_points_within_polygon(poly, sample_count)
                sampled = sample_many_rasters(raster_pairs, points)
                landcover = {cls: sampled.get(f"class_{cls}") for cls in needed_landcover_classes}
                features = CellFeatures(
                    landcover=landcover,
                    tri_mean=sampled.get(topo_keys[0]),
                    slope_mean=sampled.get(topo_keys[1]),
                    elevation_max=sampled.get(topo_keys[2]),
                )
                terrain = classify_cell(
                    features,
                    self.config.thresholds,
                    nodata_fallback=self.config.nodata_fallback_terrain,
                    water_relation=relation,
                )
                if urban_ctx is not None and relation != "in_water":
                    urban_relation = ocean_relation_for_cell_polygons(poly, urban_ctx)
                    if urban_relation != "no_water":
                        terrain = "urban"
                out.append(TerrainRecord(h3_index=cell, terrain=terrain))
                if idx % 10000 == 0:
                    LOGGER.debug(
                        "Classified %d/%d cells at resolution %d.",
                        idx,
                        len(cells),
                        resolution,
                    )
        finally:
            for ds in datasets.values():
                ds.close()

        # guardrail: no invalid terrain labels
        invalid = [r.h3_index for r in out if r.terrain not in TERRAIN_ENUM]
        if invalid:
            raise RuntimeError(f"Invalid terrain labels generated for {len(invalid)} cells.")
        return out

    def _write_base_csv(self, rows: Sequence[TerrainRecord]) -> None:
        path = self.config.output_dir / self.config.base_csv_filename
        with path.open("w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f, lineterminator="\n")
            writer.writerow(["h3_index", "terrain"])
            for row in rows:
                writer.writerow([row.h3_index, row.terrain])

    def _write_exceptions_csv(self, rows: Sequence[TerrainRecord]) -> None:
        path = self.config.output_dir / self.config.exceptions_csv_filename
        with path.open("w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f, lineterminator="\n")
            writer.writerow(["h3_index", "parent_h3", "terrain", "parent_terrain"])
            for row in rows:
                writer.writerow([row.h3_index, row.parent_h3, row.terrain, row.parent_terrain])

    def _write_terrain_counts_csv(self, rows: Sequence[TerrainRecord], out_path: Path) -> None:
        counts: Dict[str, int] = {k: 0 for k in TERRAIN_ENUM}
        for row in rows:
            counts[row.terrain] += 1
        with out_path.open("w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f, lineterminator="\n")
            writer.writerow(["terrain", "count"])
            for terrain in sorted(counts.keys()):
                writer.writerow([terrain, counts[terrain]])

    def _write_parent_child_match_rates_csv(self, total: int, same_count: int, diff_count: int) -> None:
        path = self.config.qa_dir / "parent_child_match_rates.csv"
        same_pct = (same_count / total * 100.0) if total else 0.0
        diff_pct = (diff_count / total * 100.0) if total else 0.0
        with path.open("w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f, lineterminator="\n")
            writer.writerow(["metric", "value"])
            writer.writerow(["total_children", total])
            writer.writerow(["matching_parent_count", same_count])
            writer.writerow(["matching_parent_percent", f"{same_pct:.6f}"])
            writer.writerow(["exception_count", diff_count])
            writer.writerow(["exception_percent", f"{diff_pct:.6f}"])

    def _stage_base_table(self, rows: Sequence[TerrainRecord]) -> None:
        runtime = resolve_db_runtime_config(self.config.db)
        conn = open_connection(runtime)
        try:
            ensure_schema(conn, self.config.schema_name)
            with conn.cursor() as cur:
                cur.execute(
                    f'DROP TABLE IF EXISTS "{self.config.schema_name}".terrain_res1_base'
                )
                cur.execute(
                    f'CREATE TABLE "{self.config.schema_name}".terrain_res1_base ('
                    "h3_index text PRIMARY KEY, terrain text NOT NULL CHECK (terrain IN ("
                    "'water', 'coastal', 'plains', 'urban', 'forest', 'mountain', 'desert', 'arctic'"
                    ")))"
                )
                cur.executemany(
                    f'INSERT INTO "{self.config.schema_name}".terrain_res1_base (h3_index, terrain) VALUES (%s, %s)',
                    [(r.h3_index, r.terrain) for r in rows],
                )
            conn.commit()
        finally:
            conn.close()

    def _stage_exceptions_table(self, rows: Sequence[TerrainRecord]) -> None:
        runtime = resolve_db_runtime_config(self.config.db)
        conn = open_connection(runtime)
        try:
            ensure_schema(conn, self.config.schema_name)
            with conn.cursor() as cur:
                cur.execute(
                    f'DROP TABLE IF EXISTS "{self.config.schema_name}".terrain_res4_exceptions'
                )
                cur.execute(
                    f'CREATE TABLE "{self.config.schema_name}".terrain_res4_exceptions ('
                    "h3_index text PRIMARY KEY, parent_h3 text NOT NULL, "
                    "terrain text NOT NULL CHECK (terrain IN ("
                    "'water', 'coastal', 'plains', 'urban', 'forest', 'mountain', 'desert', 'arctic'"
                    ")), parent_terrain text NOT NULL CHECK (parent_terrain IN ("
                    "'water', 'coastal', 'plains', 'urban', 'forest', 'mountain', 'desert', 'arctic'"
                    ")))"
                )
                cur.executemany(
                    f'INSERT INTO "{self.config.schema_name}".terrain_res4_exceptions '
                    "(h3_index, parent_h3, terrain, parent_terrain) VALUES (%s, %s, %s, %s)",
                    [(r.h3_index, r.parent_h3, r.terrain, r.parent_terrain) for r in rows],
                )
            conn.commit()
        finally:
            conn.close()

    def _sha256(self, path: Path) -> str:
        h = hashlib.sha256()
        with path.open("rb") as f:
            while True:
                chunk = f.read(1024 * 1024)
                if not chunk:
                    break
                h.update(chunk)
        return h.hexdigest()

