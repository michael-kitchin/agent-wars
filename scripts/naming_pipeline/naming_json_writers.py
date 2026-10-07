"""Stream strategic and tactical naming JSON from the temporary SQLite tables."""

from __future__ import annotations

import json
import logging
import sqlite3
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Final, TextIO

LOGGER = logging.getLogger(__name__)

# Naming file schema. The resolution field is supplied by the caller.
SCHEMA_VERSION: Final = "1.2.0"


@dataclass
class RowGroupCursor:
    """
    Why this exists:
        Stream grouped SQLite rows by H3 cell without loading all rows into memory.
    When to use:
        While writing naming JSON for a cell list that is already sorted.
    What to expect:
        ``take_for_cell`` returns the grouped rows for the requested cell or an empty list.
    """

    # Remaining rows, ordered by cell.
    iterator: Iterator[tuple[str, Any]]
    # Next unread row, or None at the end of the stream.
    current: tuple[str, Any] | None = None

    def take_for_cell(self, cell: str) -> list[Any]:
        """
        Why this exists:
            Return rows for one cell while preserving sorted-stream order.
        When to use:
            Per-cell JSON assembly in output writing loops.
        What to expect:
            Returns sorted rows for ``cell`` and advances the internal iterator.
            Cells must be requested in ascending order. ``_write_level_json`` sorts them first.
        """

        LOGGER.debug("take_for_cell cell=%s.", cell)
        rows: list[Any] = []
        while self.current is not None and self.current[0] < cell:
            self.current = next(self.iterator, None)
        while self.current is not None and self.current[0] == cell:
            rows.append(self.current[1])
            self.current = next(self.iterator, None)
        return rows


def write_strategic_naming_json(
    conn: sqlite3.Connection,
    cells: list[str],
    out_path: Path,
    *,
    resolution: int,
) -> None:
    """
    Why this exists:
        Write the strategic naming file from the ``res1`` SQLite tables.
    When to use:
        After countries, states, and water have been inserted for the strategic resolution.
    What to expect:
        Pretty JSON with ``resolution`` set to the supplied H3 resolution. Cities are omitted.
    """

    LOGGER.debug("Writing strategic naming JSON for %d cells at resolution %d to %s.", len(cells), resolution, out_path)
    _write_level_json(conn, cells, out_path, resolution=resolution, include_cities=False)


def write_tactical_naming_json(
    conn: sqlite3.Connection,
    cells: list[str],
    out_path: Path,
    *,
    resolution: int,
) -> None:
    """
    Why this exists:
        Write the tactical naming file, including city points, from the ``res4`` SQLite tables.
    When to use:
        After tactical rows have been inserted.
    What to expect:
        Pretty JSON with ``resolution`` set to the supplied H3 resolution and a ``cities`` array on every row.
    """

    LOGGER.debug("Writing tactical naming JSON for %d cells at resolution %d to %s.", len(cells), resolution, out_path)
    _write_level_json(conn, cells, out_path, resolution=resolution, include_cities=True)


def _group_rows(rows: Iterable[tuple[str, Any]]) -> Iterator[tuple[str, Any]]:
    """
    Why this exists:
        Adapt a SQLite result into the ``(cell, payload)`` pairs a cursor expects.
    When to use:
        Immediately before ``_make_group_cursor``.
    What to expect:
        Yields the first two columns of each row.
    """

    for row in rows:
        yield row[0], row[1]


def _make_group_cursor(rows: Iterable[tuple[str, Any]]) -> RowGroupCursor:
    """
    Why this exists:
        Start a cell-grouped read of an already ordered query.
    When to use:
        Once per table while opening a naming JSON file.
    What to expect:
        A cursor positioned on the first row, or on None when the query is empty.
    """

    iterator = _group_rows(rows)
    first = next(iterator, None)
    return RowGroupCursor(iterator=iterator, current=first)


def _write_pretty_record(handle: TextIO, record: dict[str, Any], *, line_prefix: str = "    ") -> None:
    """
    Why this exists:
        Emit one array element as multi-line pretty JSON while streaming large files.
    When to use:
        For each naming record.
    What to expect:
        Writes ``json.dumps(..., indent=2)`` with every line prefixed for correct nesting.
    """

    for line in json.dumps(record, ensure_ascii=False, indent=2).split("\n"):
        handle.write(f"{line_prefix}{line}\n")


def _write_level_json(
    conn: sqlite3.Connection,
    cells: list[str],
    out_path: Path,
    *,
    resolution: int,
    include_cities: bool,
) -> None:
    """
    Why this exists:
        Share the envelope and streaming loop between the strategic and tactical files.
    When to use:
        From the two public writer functions.
    What to expect:
        The tactical file reads ``cities_res4``. The strategic file does not. Table names stay fixed.
        Records are written in ascending cell order, so an unsorted caller still keeps every row.
    """

    ordered_cells = sorted(cells)
    table_suffix = "res4" if include_cities else "res1"
    cities_cursor = None
    if include_cities:
        cities_cursor = _make_group_cursor(
            conn.execute(
                """
                SELECT cell, json_object(
                    'name', name,
                    'state', state,
                    'country', country,
                    'population', population,
                    'scalerank', scalerank,
                    'country_code', country_code
                )
                FROM cities_res4
                ORDER BY cell ASC, scalerank ASC, name ASC
                """
            )
        )
    states_cursor = _make_group_cursor(
        conn.execute(
            f"""
            SELECT cell, json_object(
                'name', name, 'country', country, 'scalerank', scalerank, 'country_code', country_code
            )
            FROM states_{table_suffix}
            ORDER BY cell ASC, scalerank ASC, name ASC
            """
        )
    )
    countries_cursor = _make_group_cursor(
        conn.execute(
            f"""
            SELECT cell, json_object(
                'name', name,
                'continent', continent,
                'region', region,
                'population', population,
                'scalerank', scalerank,
                'country_code', country_code
            )
            FROM countries_{table_suffix}
            ORDER BY cell ASC, scalerank ASC, name ASC
            """
        )
    )
    water_cursor = _make_group_cursor(
        conn.execute(
            f"""
            SELECT cell, json_object('name', name, 'type', type, 'scalerank', scalerank)
            FROM water_{table_suffix}
            ORDER BY cell ASC, scalerank ASC, name ASC
            """
        )
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    generated_at = datetime.now(UTC).isoformat()
    with out_path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write("{\n")
        handle.write(f'  "schema_version": "{SCHEMA_VERSION}",\n')
        handle.write(f'  "resolution": {resolution},\n')
        handle.write(f'  "generated_at_utc": {json.dumps(generated_at)},\n')
        handle.write(f'  "record_count": {len(ordered_cells)},\n')
        handle.write('  "records": [\n')
        first = True
        for idx, cell in enumerate(ordered_cells, start=1):
            states = [json.loads(value) for value in states_cursor.take_for_cell(cell)]
            countries = [json.loads(value) for value in countries_cursor.take_for_cell(cell)]
            water = [json.loads(value) for value in water_cursor.take_for_cell(cell)]
            record: dict[str, Any] = {"h3_index": cell}
            if include_cities and cities_cursor is not None:
                record["cities"] = [json.loads(value) for value in cities_cursor.take_for_cell(cell)]
            record["states"] = states
            record["countries"] = countries
            record["water"] = water
            if not first:
                handle.write(",\n")
            _write_pretty_record(handle, record)
            first = False
            if idx % 100000 == 0:
                LOGGER.debug("Wrote %d/%d naming records.", idx, len(cells))
        handle.write("\n  ]\n")
        handle.write("}\n")
