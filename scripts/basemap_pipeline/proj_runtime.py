"""Choose a PROJ database this process can actually query."""

from __future__ import annotations

import logging
import os
import sqlite3
from importlib.util import find_spec
from pathlib import Path
from typing import Final

LOGGER = logging.getLogger(__name__)

# GDAL rejects a PROJ database whose layout minor version is older than this.
_MIN_LAYOUT_MINOR: Final = 6


def use_current_proj_data() -> None:
    """
    Why this exists:
        A process can inherit ``PROJ_LIB`` from an older PostGIS install.
        GDAL then refuses EPSG lookups, including EPSG:4326.
    When to use:
        Before the first import of rasterio or pyproj in this process.
    What to expect:
        When the inherited database is missing or too old, ``PROJ_LIB`` and
        ``PROJ_DATA`` point at the database shipped with pyproj. A current
        database is left alone.
    Exceptions:
        None. A missing pyproj database leaves the environment unchanged.
    """

    configured = os.environ.get("PROJ_DATA") or os.environ.get("PROJ_LIB")
    if configured and _layout_minor(Path(configured) / "proj.db") >= _MIN_LAYOUT_MINOR:
        LOGGER.debug("use_current_proj_data kept %s.", configured)
        return
    chosen = _first_current_database()
    if chosen is None:
        LOGGER.debug("use_current_proj_data found no current PROJ database.")
        return
    os.environ["PROJ_LIB"] = str(chosen)
    os.environ["PROJ_DATA"] = str(chosen)
    LOGGER.debug("use_current_proj_data using %s instead of %s.", chosen, configured)


def _first_current_database() -> Path | None:
    """
    Why this exists:
        GDAL and pyproj can each ship a PROJ database, and only a current one answers EPSG lookups.
    When to use:
        When the inherited database is missing or too old.
    What to expect:
        The directory of the first database whose layout minor version is current, or ``None``.
    """

    candidates = (
        _package_data_dir("rasterio", "proj_data"),
        _package_data_dir("pyproj", "proj_dir", "share", "proj"),
    )
    for directory in candidates:
        if directory is not None and _layout_minor(directory / "proj.db") >= _MIN_LAYOUT_MINOR:
            return directory
    return None


def _package_data_dir(package: str, *parts: str) -> Path | None:
    """
    Why this exists:
        Find a package's PROJ files without importing it.
    When to use:
        Before rasterio initializes GDAL.
    What to expect:
        The directory that contains ``proj.db``, or ``None`` when it is absent.
    """

    spec = find_spec(package)
    if spec is None or spec.origin is None:
        return None
    directory = Path(spec.origin).resolve().parent.joinpath(*parts)
    if not (directory / "proj.db").is_file():
        return None
    return directory


def _layout_minor(database: Path) -> int:
    """
    Why this exists:
        Tell a current PROJ database from one GDAL will reject.
    When to use:
        On the database named by ``PROJ_LIB`` or ``PROJ_DATA``.
    What to expect:
        The layout minor version, or 0 when the file cannot be read.
    """

    if not database.is_file():
        return 0
    connection = sqlite3.connect(f"{database.as_uri()}?mode=ro", uri=True)
    try:
        row = connection.execute(
            "SELECT value FROM metadata WHERE key = 'DATABASE.LAYOUT.VERSION.MINOR'"
        ).fetchone()
    except sqlite3.Error:
        return 0
    finally:
        connection.close()
    if row is None:
        return 0
    try:
        return int(row[0])
    except (TypeError, ValueError):
        return 0
