"""
Generate per-hex naming JSON for res-1 and res-4.

This pipeline builds naming metadata from Natural Earth shapefiles:
- Countries: ne_10m_admin_0_countries.shp
- States: ne_10m_admin_1_states_provinces.shp
- Cities: ne_10m_populated_places.shp (res-4 only)
- Lakes: ne_10m_lakes.shp
- Marine polys (oceans/seas): ne_10m_geography_marine_polys.shp

Country, state, and city rows carry `country_code` (ISO 3166-1 alpha-2, uppercase,
or null when Natural Earth has no code); see `country_codes.py`.
"""

from __future__ import annotations

import argparse
import json
import logging
import shutil
import sqlite3
import tempfile
from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, TextIO

import fiona
import h3
from pyproj import CRS, Transformer
from shapely.geometry import Point, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import transform

from scripts.terrain_pipeline.geometry_bounds import bounds_intersect, clip_polygonal_to_bounds

from .country_codes import build_country_code_by_adm0_a3, resolve_country_code
from .naming_json_writers import write_strategic_naming_json, write_tactical_naming_json
from .naming_tables import init_naming_tables as _init_tables
from .water_names import normalize_water_name as _normalize_water_name

LOGGER = logging.getLogger(__name__)

DEFAULT_DATA_ROOT = Path("F:/Data")
DEFAULT_OUTPUT_RES1 = Path("data/generated/terrain_res1_naming.json")
DEFAULT_OUTPUT_RES4 = Path("data/generated/terrain_res4_naming.json")

COUNTRIES_SHP = "ne_10m_admin_0_countries.shp"
STATES_SHP = "ne_10m_admin_1_states_provinces.shp"
CITIES_SHP = "ne_10m_populated_places.shp"
LAKES_SHP = "ne_10m_lakes.shp"
MARINE_POLYS_SHP = "ne_10m_geography_marine_polys.shp"

WGS84 = CRS.from_epsg(4326)


@dataclass(frozen=True)
class NamingScope:
    """
    Why this exists:
        Carry the resolutions, cell lists, and optional clip for one naming export.
    When to use:
        Pass one scope into ``run_naming_export``. The global pack uses ``global_naming_scope``.
    What to expect:
        ``filter_cells`` limits inserts to the cell tuples. ``clip_bounds`` of ``None`` leaves polygons unclipped.
    """

    # H3 resolution for countries, states, and water at the strategic level.
    strategic_resolution: int
    # H3 resolution for the tactical file, including city points.
    tactical_resolution: int
    # Strategic cells to write, sorted.
    strategic_cells: tuple[str, ...]
    # Tactical cells to write, sorted.
    tactical_cells: tuple[str, ...]
    # When True, rows outside the cell sets above are skipped on insert.
    filter_cells: bool
    # WGS84 bounds for clipping polygons before H3 overlap. None means no clip.
    clip_bounds: tuple[float, float, float, float] | None


# Canonical shapefile fields each layer must provide. Lookup is case-insensitive.
REQUIRED_FIELDS_BY_LAYER: dict[str, tuple[str, ...]] = {
    "countries": ("name", "continent", "subregion", "pop_est", "scalerank", "adm0_a3", "iso_a2", "iso_a2_eh"),
    "states": ("name", "admin", "scalerank", "adm0_a3"),
    "cities": ("name", "adm1name", "adm0name", "pop_max", "scalerank", "adm0_a3", "iso_a2"),
    "water": ("name", "scalerank"),
}


def configure_logging(verbose: bool) -> None:
    """
    Why this exists:
        Provide consistent logging behavior for this pipeline entrypoint.
    When to use:
        At CLI startup before any processing.
    What to expect:
        INFO logs by default and DEBUG logs with `--verbose`.
    """

    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(level=level, format="%(asctime)s %(levelname)s %(name)s - %(message)s")
    # Keep third-party internals from drowning pipeline debug logs.
    logging.getLogger("fiona").setLevel(logging.INFO)


def _generate_cells_for_resolution(resolution: int) -> list[str]:
    cells: list[str] = []
    for res0 in h3.get_res0_cells():
        cells.extend(h3.cell_to_children(res0, resolution))
    return sorted(set(cells))


def _to_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value: object) -> int | None:
    if value is None:
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _feature_transformer(src: fiona.Collection) -> Callable[[float, float], tuple[float, float]] | None:
    if src.crs is None:
        return None
    source_crs = CRS.from_user_input(src.crs)
    if source_crs.equals(WGS84):
        return None
    transformer = Transformer.from_crs(source_crs, WGS84, always_xy=True)
    return transformer.transform


def _feature_geometry_wgs84(
    feature_geometry: object,
    xy_transform: Callable[[float, float], tuple[float, float]] | None,
) -> BaseGeometry | None:
    if feature_geometry is None:
        return None
    geom = shape(feature_geometry)
    if geom.is_empty:
        return None
    if xy_transform is not None:
        geom = transform(xy_transform, geom)
    if not geom.is_valid:
        geom = geom.buffer(0)
    if geom.is_empty:
        return None
    return geom


def _h3_overlap_cells(geom_wgs84: BaseGeometry, resolution: int) -> list[str]:
    h3shape = h3.geo_to_h3shape(geom_wgs84.__geo_interface__)
    return list(h3.h3shape_to_cells_experimental(h3shape, resolution, contain="overlap"))


def _h3_cell_for_city_point(geom_wgs84: BaseGeometry, resolution: int) -> str | None:
    city_point: Point
    if isinstance(geom_wgs84, Point):
        city_point = geom_wgs84
    else:
        city_point = geom_wgs84.representative_point()
    return h3.latlng_to_cell(city_point.y, city_point.x, resolution)


def _open_temp_db() -> tuple[sqlite3.Connection, Path]:
    temp_dir = Path(tempfile.mkdtemp(prefix="hex_naming_"))
    db_path = temp_dir / "naming.sqlite"
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA temp_store = MEMORY")
    return conn, temp_dir


def _resolve_field_names(
    schema_props: dict[str, Any],
    required_fields: tuple[str, ...],
) -> dict[str, str]:
    """
    Why this exists:
        Resolve canonical field names to actual DBF keys regardless of case differences.
    When to use:
        During input validation and while extracting feature properties.
    What to expect:
        Returns a map of canonical field name -> concrete schema key.
    """

    casefold_key_map = {k.casefold(): k for k in schema_props.keys()}
    missing_fields: list[str] = []
    resolved: dict[str, str] = {}
    for required in required_fields:
        actual = casefold_key_map.get(required.casefold())
        if actual is None:
            missing_fields.append(required)
        else:
            resolved[required] = actual
    if missing_fields:
        raise ValueError(
            f"Shapefile is missing required fields: {', '.join(missing_fields)}"
        )
    return resolved


def _validate_layer_fields(shapefile_path: Path, required_fields: tuple[str, ...]) -> None:
    """
    Why this exists:
        Fail fast when Natural Earth schema changes or wrong files are supplied.
    When to use:
        During CLI validation, before expensive H3 mapping and JSON writing begins.
    What to expect:
        Raises ValueError naming missing fields if the shapefile contract is broken.
    """

    with fiona.open(shapefile_path) as src:
        schema_props = (src.schema or {}).get("properties") or {}
    try:
        _resolve_field_names(schema_props, required_fields)
    except ValueError as exc:
        raise ValueError(f"Shapefile {shapefile_path} {exc}") from exc


def _load_country_code_by_adm0_a3(countries_path: Path) -> dict[str, str | None]:
    """
    Why this exists:
        States and cities only carry `ADM0_A3`; their codes come from the countries layer.
    When to use:
        Once in `run_pipeline`, before inserting countries, states, and cities.
    What to expect:
        Returns `ADM0_A3` -> uppercase alpha-2 code (or `None`); raises if fields are missing.
    """

    with fiona.open(countries_path) as src:
        schema_props = (src.schema or {}).get("properties") or {}
        fields = _resolve_field_names(schema_props, ("adm0_a3", "iso_a2_eh", "iso_a2"))
        return build_country_code_by_adm0_a3(
            (
                (props.get(fields["adm0_a3"]), props.get(fields["iso_a2_eh"]), props.get(fields["iso_a2"]))
                for props in ((feature.get("properties") or {}) for feature in src)
            )
        )


def _scope_id_sets(scope: NamingScope) -> tuple[frozenset[str] | None, frozenset[str] | None]:
    """
    Why this exists:
        Build the strategic and tactical membership sets once per insert, not once per feature.
    When to use:
        At the start of each insert function.
    What to expect:
        ``(None, None)`` when filtering is off, which keeps every overlap cell.
    """

    if not scope.filter_cells:
        return None, None
    return frozenset(scope.strategic_cells), frozenset(scope.tactical_cells)


def _clip_for_scope(geom: BaseGeometry, scope: NamingScope) -> BaseGeometry | None:
    """
    Why this exists:
        Limit polygon overlap work to a regional box without changing the global path.
    When to use:
        Before ``_h3_overlap_cells`` for country, state, and water polygons.
    What to expect:
        The original geometry when ``clip_bounds`` is ``None``. ``None`` when the feature misses the box
        or the clip is empty.
    """

    if scope.clip_bounds is None:
        return geom
    if not bounds_intersect(geom.bounds, scope.clip_bounds):
        return None
    clipped = clip_polygonal_to_bounds(geom, scope.clip_bounds)
    if clipped.is_empty:
        return None
    return clipped


def _scoped_overlap_cells(
    geom: BaseGeometry,
    scope: NamingScope,
    strategic_ids: frozenset[str] | None,
    tactical_ids: frozenset[str] | None,
) -> tuple[list[str], list[str]]:
    """
    Why this exists:
        Map one polygon to strategic and tactical cells under the scope's filters.
    When to use:
        Inside country, state, and water inserts.
    What to expect:
        Two lists. A strategic cell is kept only against ``strategic_ids``, and a tactical cell only
        against ``tactical_ids``. The lists are empty when the clip drops the polygon.
    """

    prepared = _clip_for_scope(geom, scope)
    if prepared is None:
        return [], []
    strategic_cells = _h3_overlap_cells(prepared, scope.strategic_resolution)
    tactical_cells = _h3_overlap_cells(prepared, scope.tactical_resolution)
    if strategic_ids is not None:
        strategic_cells = [cell for cell in strategic_cells if cell in strategic_ids]
    if tactical_ids is not None:
        tactical_cells = [cell for cell in tactical_cells if cell in tactical_ids]
    return strategic_cells, tactical_cells


def _insert_countries(
    conn: sqlite3.Connection,
    countries_path: Path,
    *,
    code_by_adm0_a3: dict[str, str | None],
    scope: NamingScope,
) -> None:
    if not countries_path.is_file():
        raise FileNotFoundError(f"Country shapefile not found: {countries_path}")
    LOGGER.debug("Loading countries from %s", countries_path)
    strategic_ids, tactical_ids = _scope_id_sets(scope)
    with fiona.open(countries_path) as src:
        xy_transform = _feature_transformer(src)
        schema_props = (src.schema or {}).get("properties") or {}
        fields = _resolve_field_names(schema_props, REQUIRED_FIELDS_BY_LAYER["countries"])
        with conn:
            for idx, feature in enumerate(src, start=1):
                props = feature.get("properties") or {}
                name = props.get(fields["name"])
                if not name:
                    continue
                continent = props.get(fields["continent"])
                region = props.get(fields["subregion"])
                population = _to_float(props.get(fields["pop_est"]))
                scalerank = _to_int(props.get(fields["scalerank"]))
                code = resolve_country_code(props.get(fields["adm0_a3"]), props.get(fields["iso_a2"]), code_by_adm0_a3)

                geom_wgs84 = _feature_geometry_wgs84(feature.get("geometry"), xy_transform)
                if geom_wgs84 is None:
                    continue

                cells_res1, cells_res4 = _scoped_overlap_cells(geom_wgs84, scope, strategic_ids, tactical_ids)
                conn.executemany(
                    """
                    INSERT OR IGNORE INTO countries_res1(cell, name, continent, region, population, scalerank, country_code)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    [(cell, str(name), continent, region, population, scalerank, code) for cell in cells_res1],
                )
                conn.executemany(
                    """
                    INSERT OR IGNORE INTO countries_res4(cell, name, continent, region, population, scalerank, country_code)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    [(cell, str(name), continent, region, population, scalerank, code) for cell in cells_res4],
                )
                if idx % 25 == 0:
                    LOGGER.debug("Processed %d country features.", idx)


def _insert_states(
    conn: sqlite3.Connection,
    states_path: Path,
    *,
    code_by_adm0_a3: dict[str, str | None],
    scope: NamingScope,
) -> None:
    if not states_path.is_file():
        raise FileNotFoundError(f"State shapefile not found: {states_path}")
    LOGGER.debug("Loading states from %s", states_path)
    strategic_ids, tactical_ids = _scope_id_sets(scope)
    with fiona.open(states_path) as src:
        xy_transform = _feature_transformer(src)
        schema_props = (src.schema or {}).get("properties") or {}
        fields = _resolve_field_names(schema_props, REQUIRED_FIELDS_BY_LAYER["states"])
        with conn:
            for idx, feature in enumerate(src, start=1):
                props = feature.get("properties") or {}
                name = props.get(fields["name"])
                country = props.get(fields["admin"])
                if not name or not country:
                    continue
                scalerank = _to_int(props.get(fields["scalerank"]))
                code = resolve_country_code(props.get(fields["adm0_a3"]), None, code_by_adm0_a3)

                geom_wgs84 = _feature_geometry_wgs84(feature.get("geometry"), xy_transform)
                if geom_wgs84 is None:
                    continue

                cells_res1, cells_res4 = _scoped_overlap_cells(geom_wgs84, scope, strategic_ids, tactical_ids)
                conn.executemany(
                    """
                    INSERT OR IGNORE INTO states_res1(cell, name, country, scalerank, country_code)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    [(cell, str(name), str(country), scalerank, code) for cell in cells_res1],
                )
                conn.executemany(
                    """
                    INSERT OR IGNORE INTO states_res4(cell, name, country, scalerank, country_code)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    [(cell, str(name), str(country), scalerank, code) for cell in cells_res4],
                )
                if idx % 100 == 0:
                    LOGGER.debug("Processed %d state features.", idx)


def _insert_cities(
    conn: sqlite3.Connection,
    cities_path: Path,
    *,
    code_by_adm0_a3: dict[str, str | None],
    scope: NamingScope,
) -> None:
    if not cities_path.is_file():
        raise FileNotFoundError(f"City shapefile not found: {cities_path}")
    LOGGER.debug("Loading cities from %s", cities_path)
    _strategic_ids, tactical_ids = _scope_id_sets(scope)
    with fiona.open(cities_path) as src:
        xy_transform = _feature_transformer(src)
        schema_props = (src.schema or {}).get("properties") or {}
        fields = _resolve_field_names(schema_props, REQUIRED_FIELDS_BY_LAYER["cities"])
        with conn:
            for idx, feature in enumerate(src, start=1):
                props = feature.get("properties") or {}
                name = props.get(fields["name"])
                state = props.get(fields["adm1name"])
                country = props.get(fields["adm0name"])
                if not name:
                    continue
                population = _to_float(props.get(fields["pop_max"]))
                scalerank = _to_int(props.get(fields["scalerank"]))

                geom_wgs84 = _feature_geometry_wgs84(feature.get("geometry"), xy_transform)
                if geom_wgs84 is None:
                    continue
                cell = _h3_cell_for_city_point(geom_wgs84, scope.tactical_resolution)
                if cell is None:
                    continue
                if tactical_ids is not None and cell not in tactical_ids:
                    continue

                code = resolve_country_code(props.get(fields["adm0_a3"]), props.get(fields["iso_a2"]), code_by_adm0_a3)
                conn.execute(
                    """
                    INSERT OR IGNORE INTO cities_res4(cell, name, state, country, population, scalerank, country_code)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (cell, str(name), state, country, population, scalerank, code),
                )
                if idx % 1000 == 0:
                    LOGGER.debug("Processed %d city features.", idx)


def _insert_water(
    conn: sqlite3.Connection,
    water_path: Path,
    water_type: str,
    *,
    scope: NamingScope,
) -> None:
    """
    Why this exists:
        Map lake or marine-polygon features to overlapping H3 cells for water naming metadata.
    When to use:
        Once per water shapefile during `run_pipeline` (lakes and marine polys).
    What to expect:
        Inserts rows into `water_res1` and `water_res4` with dedupe on (cell, name, type).
    """

    if not water_path.is_file():
        raise FileNotFoundError(f"Water shapefile not found: {water_path}")
    LOGGER.debug("Loading water (%s) from %s", water_type, water_path)
    strategic_ids, tactical_ids = _scope_id_sets(scope)
    with fiona.open(water_path) as src:
        xy_transform = _feature_transformer(src)
        schema_props = (src.schema or {}).get("properties") or {}
        fields = _resolve_field_names(schema_props, REQUIRED_FIELDS_BY_LAYER["water"])
        with conn:
            for idx, feature in enumerate(src, start=1):
                props = feature.get("properties") or {}
                name = props.get(fields["name"])
                if not name or not str(name).strip():
                    continue
                name = _normalize_water_name(str(name))
                scalerank = _to_int(props.get(fields["scalerank"]))

                geom_wgs84 = _feature_geometry_wgs84(feature.get("geometry"), xy_transform)
                if geom_wgs84 is None:
                    continue

                cells_res1, cells_res4 = _scoped_overlap_cells(geom_wgs84, scope, strategic_ids, tactical_ids)
                conn.executemany(
                    """
                    INSERT OR IGNORE INTO water_res1(cell, name, type, scalerank)
                    VALUES (?, ?, ?, ?)
                    """,
                    [(cell, str(name), water_type, scalerank) for cell in cells_res1],
                )
                conn.executemany(
                    """
                    INSERT OR IGNORE INTO water_res4(cell, name, type, scalerank)
                    VALUES (?, ?, ?, ?)
                    """,
                    [(cell, str(name), water_type, scalerank) for cell in cells_res4],
                )
                if idx % 100 == 0:
                    LOGGER.debug("Processed %d %s water features.", idx, water_type)


def run_pipeline(
    *,
    data_root: Path,
    output_res1: Path,
    output_res4: Path,
    max_child_cells: int | None = None,
) -> None:
    """
    Why this exists:
        Execute the full naming export in one deterministic flow.
    When to use:
        Called from CLI `run` command.
    What to expect:
        Writes `terrain_res1_naming.json` and `terrain_res4_naming.json` with stable row ordering.
    """

    scope = global_naming_scope(max_child_cells)
    run_naming_export(
        data_root=data_root,
        scope=scope,
        output_strategic=output_res1,
        output_tactical=output_res4,
    )


def global_naming_scope(max_child_cells: int | None) -> NamingScope:
    """
    Why this exists:
        Build the cell lists the global naming files use, including the optional tactical cap.
    When to use:
        From ``run_pipeline`` before ``run_naming_export``.
    What to expect:
        Strategic cells are the full resolution-1 set even when tactical cells are capped.
        ``filter_cells`` is true only when the tactical list is capped. ``clip_bounds`` is ``None``.
    """

    LOGGER.debug("Building global naming scope (max_child_cells=%s).", max_child_cells)
    strategic_cells = tuple(_generate_cells_for_resolution(1))
    tactical_cells = _generate_cells_for_resolution(4)
    if max_child_cells is not None:
        tactical_cells = tactical_cells[: max(0, max_child_cells)]
    LOGGER.info("Prepared %d res1 cells and %d res4 cells.", len(strategic_cells), len(tactical_cells))
    return NamingScope(
        strategic_resolution=1,
        tactical_resolution=4,
        strategic_cells=strategic_cells,
        tactical_cells=tuple(tactical_cells),
        filter_cells=max_child_cells is not None,
        clip_bounds=None,
    )


def run_naming_export(
    *,
    data_root: Path,
    scope: NamingScope,
    output_strategic: Path,
    output_tactical: Path,
) -> None:
    """
    Why this exists:
        Insert Natural Earth rows for one scope and write both naming files.
    When to use:
        After ``NamingScope`` is known, for the global pack or a regional pack.
    What to expect:
        Writes the two JSON files. Raises ``FileNotFoundError`` when a shapefile is missing.
    """

    LOGGER.debug(
        "Running naming export for resolutions %d/%d (%d strategic cells, %d tactical cells).",
        scope.strategic_resolution,
        scope.tactical_resolution,
        len(scope.strategic_cells),
        len(scope.tactical_cells),
    )
    countries_path = data_root / COUNTRIES_SHP
    states_path = data_root / STATES_SHP
    cities_path = data_root / CITIES_SHP
    lakes_path = data_root / LAKES_SHP
    marine_polys_path = data_root / MARINE_POLYS_SHP
    conn, temp_dir = _open_temp_db()
    try:
        LOGGER.debug("Using temporary SQLite database at %s.", temp_dir)
        _init_tables(conn)
        code_by_adm0_a3 = _load_country_code_by_adm0_a3(countries_path)
        _insert_countries(conn, countries_path, code_by_adm0_a3=code_by_adm0_a3, scope=scope)
        _insert_states(conn, states_path, code_by_adm0_a3=code_by_adm0_a3, scope=scope)
        _insert_cities(conn, cities_path, code_by_adm0_a3=code_by_adm0_a3, scope=scope)
        _insert_water(conn, lakes_path, "lake", scope=scope)
        _insert_water(conn, marine_polys_path, "ocean", scope=scope)
        LOGGER.info("Writing res1 naming JSON to %s", output_strategic)
        write_strategic_naming_json(conn, list(scope.strategic_cells), output_strategic, resolution=scope.strategic_resolution)
        LOGGER.info("Writing res4 naming JSON to %s", output_tactical)
        write_tactical_naming_json(conn, list(scope.tactical_cells), output_tactical, resolution=scope.tactical_resolution)
    finally:
        conn.close()
        shutil.rmtree(temp_dir, ignore_errors=True)


def build_parser() -> argparse.ArgumentParser:
    """
    Why this exists:
        Define a clear CLI contract for validation and generation.
    When to use:
        At process startup before parsing command-line arguments.
    What to expect:
        Supports `validate` and `run` commands with optional debug limit for res4.
    """

    parser = argparse.ArgumentParser(
        description="Generate per-hex naming JSON for res1 and res4 from Natural Earth shapefiles.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    validate_p = sub.add_parser("validate", help="Validate required input shapefiles exist.")
    validate_p.add_argument("--verbose", action="store_true", help="Enable debug logs.")
    validate_p.add_argument("--data-root", type=Path, default=DEFAULT_DATA_ROOT)

    run_p = sub.add_parser("run", help="Generate naming JSON outputs.")
    run_p.add_argument("--verbose", action="store_true", help="Enable debug logs.")
    run_p.add_argument("--data-root", type=Path, default=DEFAULT_DATA_ROOT)
    run_p.add_argument("--output-res1", type=Path, default=DEFAULT_OUTPUT_RES1)
    run_p.add_argument("--output-res4", type=Path, default=DEFAULT_OUTPUT_RES4)
    run_p.add_argument(
        "--max-child-cells",
        type=int,
        default=None,
        help="Optional cap on res4 cells (debug/dry-run only).",
    )
    return parser


def _validate_inputs(data_root: Path) -> None:
    needed = (
        data_root / COUNTRIES_SHP,
        data_root / STATES_SHP,
        data_root / CITIES_SHP,
        data_root / LAKES_SHP,
        data_root / MARINE_POLYS_SHP,
    )
    missing = [str(p) for p in needed if not p.is_file()]
    if missing:
        raise FileNotFoundError("Missing required shapefiles:\n" + "\n".join(missing))
    _validate_layer_fields(data_root / COUNTRIES_SHP, REQUIRED_FIELDS_BY_LAYER["countries"])
    _validate_layer_fields(data_root / STATES_SHP, REQUIRED_FIELDS_BY_LAYER["states"])
    _validate_layer_fields(data_root / CITIES_SHP, REQUIRED_FIELDS_BY_LAYER["cities"])
    _validate_layer_fields(data_root / LAKES_SHP, REQUIRED_FIELDS_BY_LAYER["water"])
    _validate_layer_fields(data_root / MARINE_POLYS_SHP, REQUIRED_FIELDS_BY_LAYER["water"])


def main(argv: list[str] | None = None) -> int:
    """
    Why this exists:
        Provide a standalone entrypoint for naming data generation.
    When to use:
        Run via `python -m scripts.naming_pipeline.generate_hex_naming ...`.
    What to expect:
        Returns 0 on success and non-zero on validation or runtime failures.
    """

    parser = build_parser()
    args = parser.parse_args(argv)
    configure_logging(verbose=getattr(args, "verbose", False))
    data_root: Path = args.data_root
    try:
        if args.command == "validate":
            LOGGER.debug("Validating naming pipeline inputs at %s.", data_root)
            _validate_inputs(data_root)
            LOGGER.info("Naming pipeline validation passed.")
            return 0

        if args.command == "run":
            LOGGER.debug(
                "Running naming pipeline with data_root=%s output_res1=%s output_res4=%s max_child_cells=%s",
                data_root,
                args.output_res1,
                args.output_res4,
                args.max_child_cells,
            )
            _validate_inputs(data_root)
            run_pipeline(
                data_root=data_root,
                output_res1=args.output_res1,
                output_res4=args.output_res4,
                max_child_cells=args.max_child_cells,
            )
            LOGGER.info("Naming pipeline export complete.")
            return 0

        parser.error(f"Unknown command: {args.command}")
        return 2
    except Exception as exc:  # noqa: BLE001
        LOGGER.error("Naming pipeline failed: %s", exc, exc_info=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
