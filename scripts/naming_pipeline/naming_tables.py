"""Temporary SQLite tables the hex-naming generator fills before it writes JSON.

The ``res1`` tables hold strategic rows and the ``res4`` tables hold tactical rows, for any resolution pair.
"""

from __future__ import annotations

import sqlite3


def init_naming_tables(conn: sqlite3.Connection) -> None:
    """
    Why this exists:
        One schema for the generator and its tests, including `country_code` (naming schema 1.2.0).
    When to use:
        On a fresh connection, before inserting Natural Earth rows.
    What to expect:
        Creates the res1 and res4 state, country, city, and water tables. `country_code` is an
        uppercase ISO alpha-2 code or null. Water tables have no country code.
    """

    conn.executescript(
        """
        CREATE TABLE states_res1 (
            cell TEXT NOT NULL,
            name TEXT NOT NULL,
            country TEXT NOT NULL,
            scalerank INTEGER,
            country_code TEXT,
            UNIQUE(cell, name, country, scalerank)
        );
        CREATE TABLE states_res4 (
            cell TEXT NOT NULL,
            name TEXT NOT NULL,
            country TEXT NOT NULL,
            scalerank INTEGER,
            country_code TEXT,
            UNIQUE(cell, name, country, scalerank)
        );
        CREATE TABLE countries_res1 (
            cell TEXT NOT NULL,
            name TEXT NOT NULL,
            continent TEXT,
            region TEXT,
            population REAL,
            scalerank INTEGER,
            country_code TEXT,
            UNIQUE(cell, name, continent, region, population, scalerank)
        );
        CREATE TABLE countries_res4 (
            cell TEXT NOT NULL,
            name TEXT NOT NULL,
            continent TEXT,
            region TEXT,
            population REAL,
            scalerank INTEGER,
            country_code TEXT,
            UNIQUE(cell, name, continent, region, population, scalerank)
        );
        CREATE TABLE cities_res4 (
            cell TEXT NOT NULL,
            name TEXT NOT NULL,
            state TEXT,
            country TEXT,
            population REAL,
            scalerank INTEGER,
            country_code TEXT,
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
