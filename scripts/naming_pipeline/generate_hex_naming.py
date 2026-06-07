"""
Generate per-hex naming JSON for res-1 and res-4.

This pipeline builds naming metadata from Natural Earth shapefiles:
- Countries: ne_10m_admin_0_countries.shp
- States: ne_10m_admin_1_states_provinces.shp
- Cities: ne_10m_populated_places.shp (res-4 only)
- Lakes: ne_10m_lakes.shp
- Marine polys (oceans/seas): ne_10m_geography_marine_polys.shp
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

LOGGER = logging.getLogger(__name__)

SCHEMA_VERSION = "1.1.0"
DEFAULT_DATA_ROOT = Path("F:/Data")
DEFAULT_OUTPUT_RES1 = Path("data/generated/terrain_res1_naming.json")
DEFAULT_OUTPUT_RES4 = Path("data/generated/terrain_res4_naming.json")

COUNTRIES_SHP = "ne_10m_admin_0_countries.shp"
STATES_SHP = "ne_10m_admin_1_states_provinces.shp"
CITIES_SHP = "ne_10m_populated_places.shp"
LAKES_SHP = "ne_10m_lakes.shp"
MARINE_POLYS_SHP = "ne_10m_geography_marine_polys.shp"

WGS84 = CRS.from_epsg(4326)
REQUIRED_FIELDS_BY_LAYER: dict[str, tuple[str, ...]] = {
    "countries": ("name", "continent", "subregion", "pop_est", "scalerank"),
    "states": ("name", "admin", "scalerank"),
    "cities": ("name", "adm1name", "adm0name", "pop_max", "scalerank"),
    "water": ("name", "scalerank"),
}


@dataclass
class RowGroupCursor:
    """
    Why this exists:
        Stream grouped SQLite rows by H3 cell without loading all rows into memory.
    When to use:
        While writing very large JSON outputs for all global hexes.
    What to expect:
        `take_for_cell` returns the grouped rows for the requested cell or an empty list.
    """

    iterator: Iterator[tuple[str, Any]]
    current: tuple[str, Any] | None = None

    def take_for_cell(self, cell: str) -> list[Any]:
        """
        Why this exists:
            Return rows for one cell while preserving sorted-stream order.
        When to use:
            Per-cell JSON assembly in output writing loops.
        What to expect:
            Returns sorted rows for `cell` and advances the internal iterator.
        """

        rows: list[Any] = []
        while self.current is not None and self.current[0] < cell:
            self.current = next(self.iterator, None)
        while self.current is not None and self.current[0] == cell:
            rows.append(self.current[1])
            self.current = next(self.iterator, None)
        return rows


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


def _init_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE states_res1 (
            cell TEXT NOT NULL,
            name TEXT NOT NULL,
            country TEXT NOT NULL,
            scalerank INTEGER,
            UNIQUE(cell, name, country, scalerank)
        );
        CREATE TABLE states_res4 (
            cell TEXT NOT NULL,
            name TEXT NOT NULL,
            country TEXT NOT NULL,
            scalerank INTEGER,
            UNIQUE(cell, name, country, scalerank)
        );
        CREATE TABLE countries_res1 (
            cell TEXT NOT NULL,
            name TEXT NOT NULL,
            continent TEXT,
            region TEXT,
            population REAL,
            scalerank INTEGER,
            UNIQUE(cell, name, continent, region, population, scalerank)
        );
        CREATE TABLE countries_res4 (
            cell TEXT NOT NULL,
            name TEXT NOT NULL,
            continent TEXT,
            region TEXT,
            population REAL,
            scalerank INTEGER,
            UNIQUE(cell, name, continent, region, population, scalerank)
        );
        CREATE TABLE cities_res4 (
            cell TEXT NOT NULL,
            name TEXT NOT NULL,
            state TEXT,
            country TEXT,
            population REAL,
            scalerank INTEGER,
            UNIQUE(cell, name, state, country, population, scalerank)
        );
        CREATE TABLE water_res1 (
            cell TEXT NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            scalerank INTEGER,
            UNIQUE(cell, name, type)
        );
        CREATE TABLE water_res4 (
            cell TEXT NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            scalerank INTEGER,
            UNIQUE(cell, name, type)
        );
        """
    )
    conn.commit()


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


def _insert_countries(
    conn: sqlite3.Connection,
    countries_path: Path,
    *,
    res4_cell_filter: set[str] | None = None,
) -> None:
    if not countries_path.is_file():
        raise FileNotFoundError(f"Country shapefile not found: {countries_path}")
    LOGGER.debug("Loading countries from %s", countries_path)
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

                geom_wgs84 = _feature_geometry_wgs84(feature.get("geometry"), xy_transform)
                if geom_wgs84 is None:
                    continue

                cells_res1 = _h3_overlap_cells(geom_wgs84, 1)
                cells_res4 = _h3_overlap_cells(geom_wgs84, 4)
                if res4_cell_filter is not None:
                    cells_res4 = [cell for cell in cells_res4 if cell in res4_cell_filter]
                conn.executemany(
                    """
                    INSERT OR IGNORE INTO countries_res1(cell, name, continent, region, population, scalerank)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    [(cell, str(name), continent, region, population, scalerank) for cell in cells_res1],
                )
                conn.executemany(
                    """
                    INSERT OR IGNORE INTO countries_res4(cell, name, continent, region, population, scalerank)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    [(cell, str(name), continent, region, population, scalerank) for cell in cells_res4],
                )
                if idx % 25 == 0:
                    LOGGER.debug("Processed %d country features.", idx)


def _insert_states(
    conn: sqlite3.Connection,
    states_path: Path,
    *,
    res4_cell_filter: set[str] | None = None,
) -> None:
    if not states_path.is_file():
        raise FileNotFoundError(f"State shapefile not found: {states_path}")
    LOGGER.debug("Loading states from %s", states_path)
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

                geom_wgs84 = _feature_geometry_wgs84(feature.get("geometry"), xy_transform)
                if geom_wgs84 is None:
                    continue

                cells_res1 = _h3_overlap_cells(geom_wgs84, 1)
                cells_res4 = _h3_overlap_cells(geom_wgs84, 4)
                if res4_cell_filter is not None:
                    cells_res4 = [cell for cell in cells_res4 if cell in res4_cell_filter]
                conn.executemany(
                    """
                    INSERT OR IGNORE INTO states_res1(cell, name, country, scalerank)
                    VALUES (?, ?, ?, ?)
                    """,
                    [(cell, str(name), str(country), scalerank) for cell in cells_res1],
                )
                conn.executemany(
                    """
                    INSERT OR IGNORE INTO states_res4(cell, name, country, scalerank)
                    VALUES (?, ?, ?, ?)
                    """,
                    [(cell, str(name), str(country), scalerank) for cell in cells_res4],
                )
                if idx % 100 == 0:
                    LOGGER.debug("Processed %d state features.", idx)


def _insert_cities(
    conn: sqlite3.Connection,
    cities_path: Path,
    *,
    res4_cell_filter: set[str] | None = None,
) -> None:
    if not cities_path.is_file():
        raise FileNotFoundError(f"City shapefile not found: {cities_path}")
    LOGGER.debug("Loading cities from %s", cities_path)
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
                cell = _h3_cell_for_city_point(geom_wgs84, 4)
                if cell is None:
                    continue
                if res4_cell_filter is not None and cell not in res4_cell_filter:
                    continue

                conn.execute(
                    """
                    INSERT OR IGNORE INTO cities_res4(cell, name, state, country, population, scalerank)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (cell, str(name), state, country, population, scalerank),
                )
                if idx % 1000 == 0:
                    LOGGER.debug("Processed %d city features.", idx)


def _insert_water(
    conn: sqlite3.Connection,
    water_path: Path,
    water_type: str,
    *,
    res4_cell_filter: set[str] | None = None,
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
                scalerank = _to_int(props.get(fields["scalerank"]))

                geom_wgs84 = _feature_geometry_wgs84(feature.get("geometry"), xy_transform)
                if geom_wgs84 is None:
                    continue

                cells_res1 = _h3_overlap_cells(geom_wgs84, 1)
                cells_res4 = _h3_overlap_cells(geom_wgs84, 4)
                if res4_cell_filter is not None:
                    cells_res4 = [cell for cell in cells_res4 if cell in res4_cell_filter]
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


def _group_rows(
    rows: Iterable[tuple[str, Any]],
) -> Iterator[tuple[str, Any]]:
    for row in rows:
        yield row[0], row[1]


def _make_group_cursor(rows: Iterable[tuple[str, Any]]) -> RowGroupCursor:
    iterator = _group_rows(rows)
    first = next(iterator, None)
    return RowGroupCursor(iterator=iterator, current=first)


def _write_pretty_record(f: TextIO, record: dict[str, Any], *, line_prefix: str = "    ") -> None:
    """
    Why this exists:
        Emit one array element as multi-line pretty JSON while streaming large files.
    When to use:
        Inside `_write_res1_json` / `_write_res4_json` for each `records` entry.
    What to expect:
        Writes `json.dumps(..., indent=2)` with every line prefixed for correct nesting.
    """

    for line in json.dumps(record, ensure_ascii=False, indent=2).split("\n"):
        f.write(f"{line_prefix}{line}\n")


def _write_res1_json(conn: sqlite3.Connection, cells: list[str], out_path: Path) -> None:
    states_cursor = _make_group_cursor(
        conn.execute(
            """
            SELECT cell, json_object('name', name, 'country', country, 'scalerank', scalerank)
            FROM states_res1
            ORDER BY cell ASC, scalerank ASC, name ASC
            """
        )
    )
    countries_cursor = _make_group_cursor(
        conn.execute(
            """
            SELECT cell, json_object(
                'name', name,
                'continent', continent,
                'region', region,
                'population', population,
                'scalerank', scalerank
            )
            FROM countries_res1
            ORDER BY cell ASC, scalerank ASC, name ASC
            """
        )
    )
    water_cursor = _make_group_cursor(
        conn.execute(
            """
            SELECT cell, json_object('name', name, 'type', type, 'scalerank', scalerank)
            FROM water_res1
            ORDER BY cell ASC, scalerank ASC, name ASC
            """
        )
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    generated_at = datetime.now(UTC).isoformat()
    with out_path.open("w", encoding="utf-8", newline="\n") as f:
        f.write("{\n")
        f.write(f'  "schema_version": "{SCHEMA_VERSION}",\n')
        f.write('  "resolution": 1,\n')
        f.write(f'  "generated_at_utc": {json.dumps(generated_at)},\n')
        f.write(f'  "record_count": {len(cells)},\n')
        f.write('  "records": [\n')
        first = True
        for idx, cell in enumerate(cells, start=1):
            states = [json.loads(v) for v in states_cursor.take_for_cell(cell)]
            countries = [json.loads(v) for v in countries_cursor.take_for_cell(cell)]
            water = [json.loads(v) for v in water_cursor.take_for_cell(cell)]
            record = {"h3_index": cell, "states": states, "countries": countries, "water": water}
            if not first:
                f.write(",\n")
            _write_pretty_record(f, record)
            first = False
            if idx % 100000 == 0:
                LOGGER.debug("Wrote %d/%d res1 records.", idx, len(cells))
        f.write("\n  ]\n")
        f.write("}\n")


def _write_res4_json(conn: sqlite3.Connection, cells: list[str], out_path: Path) -> None:
    cities_cursor = _make_group_cursor(
        conn.execute(
            """
            SELECT cell, json_object(
                'name', name,
                'state', state,
                'country', country,
                'population', population,
                'scalerank', scalerank
            )
            FROM cities_res4
            ORDER BY cell ASC, scalerank ASC, name ASC
            """
        )
    )
    states_cursor = _make_group_cursor(
        conn.execute(
            """
            SELECT cell, json_object('name', name, 'country', country, 'scalerank', scalerank)
            FROM states_res4
            ORDER BY cell ASC, scalerank ASC, name ASC
            """
        )
    )
    countries_cursor = _make_group_cursor(
        conn.execute(
            """
            SELECT cell, json_object(
                'name', name,
                'continent', continent,
                'region', region,
                'population', population,
                'scalerank', scalerank
            )
            FROM countries_res4
            ORDER BY cell ASC, scalerank ASC, name ASC
            """
        )
    )
    water_cursor = _make_group_cursor(
        conn.execute(
            """
            SELECT cell, json_object('name', name, 'type', type, 'scalerank', scalerank)
            FROM water_res4
            ORDER BY cell ASC, scalerank ASC, name ASC
            """
        )
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    generated_at = datetime.now(UTC).isoformat()
    with out_path.open("w", encoding="utf-8", newline="\n") as f:
        f.write("{\n")
        f.write(f'  "schema_version": "{SCHEMA_VERSION}",\n')
        f.write('  "resolution": 4,\n')
        f.write(f'  "generated_at_utc": {json.dumps(generated_at)},\n')
        f.write(f'  "record_count": {len(cells)},\n')
        f.write('  "records": [\n')
        first = True
        for idx, cell in enumerate(cells, start=1):
            cities = [json.loads(v) for v in cities_cursor.take_for_cell(cell)]
            states = [json.loads(v) for v in states_cursor.take_for_cell(cell)]
            countries = [json.loads(v) for v in countries_cursor.take_for_cell(cell)]
            water = [json.loads(v) for v in water_cursor.take_for_cell(cell)]
            record = {
                "h3_index": cell,
                "cities": cities,
                "states": states,
                "countries": countries,
                "water": water,
            }
            if not first:
                f.write(",\n")
            _write_pretty_record(f, record)
            first = False
            if idx % 100000 == 0:
                LOGGER.debug("Wrote %d/%d res4 records.", idx, len(cells))
        f.write("\n  ]\n")
        f.write("}\n")


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

    countries_path = data_root / COUNTRIES_SHP
    states_path = data_root / STATES_SHP
    cities_path = data_root / CITIES_SHP
    lakes_path = data_root / LAKES_SHP
    marine_polys_path = data_root / MARINE_POLYS_SHP

    LOGGER.debug("Generating global H3 cell lists for resolutions 1 and 4.")
    res1_cells = _generate_cells_for_resolution(1)
    res4_cells = _generate_cells_for_resolution(4)
    if max_child_cells is not None:
        res4_cells = res4_cells[: max(0, max_child_cells)]
    LOGGER.info("Prepared %d res1 cells and %d res4 cells.", len(res1_cells), len(res4_cells))

    conn, temp_dir = _open_temp_db()
    try:
        LOGGER.debug("Using temporary SQLite database at %s.", temp_dir)
        _init_tables(conn)
        res4_cell_filter = set(res4_cells) if max_child_cells is not None else None
        _insert_countries(conn, countries_path, res4_cell_filter=res4_cell_filter)
        _insert_states(conn, states_path, res4_cell_filter=res4_cell_filter)
        _insert_cities(conn, cities_path, res4_cell_filter=res4_cell_filter)
        _insert_water(conn, lakes_path, "lake", res4_cell_filter=res4_cell_filter)
        _insert_water(conn, marine_polys_path, "ocean", res4_cell_filter=res4_cell_filter)

        LOGGER.info("Writing res1 naming JSON to %s", output_res1)
        _write_res1_json(conn, res1_cells, output_res1)
        LOGGER.info("Writing res4 naming JSON to %s", output_res4)
        _write_res4_json(conn, res4_cells, output_res4)
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
