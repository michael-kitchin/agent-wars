"""
Database helpers for validation and optional staging tables.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Iterable

import psycopg

from .config import DbConfig

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class DbRuntimeConfig:
    """
    Why this exists:
        Resolve runtime DB credentials from environment variables safely.
    When to use:
        Build psycopg connections in any pipeline phase that needs PostgreSQL.
    What to expect:
        Password comes from environment and raises a clear error when missing.
    """

    host: str
    seaport: int
    dbname: str
    user: str
    password: str


def resolve_db_runtime_config(cfg: DbConfig) -> DbRuntimeConfig:
    """
    Why this exists:
        Enforce non-hardcoded credential usage while keeping local defaults simple.
    When to use:
        Before opening DB connections.
    What to expect:
        Raises ValueError with actionable guidance when password env var is unset.
    """

    password = os.getenv(cfg.password_env_var)
    if not password:
        raise ValueError(
            f"Missing required environment variable {cfg.password_env_var}. "
            f"Set it before running the terrain pipeline."
        )
    return DbRuntimeConfig(
        host=cfg.host,
        seaport=cfg.seaport,
        dbname=cfg.dbname,
        user=cfg.user,
        password=password,
    )


def open_connection(runtime: DbRuntimeConfig) -> psycopg.Connection:
    """
    Why this exists:
        Centralize psycopg connection creation with one stable contract.
    When to use:
        Any phase that reads/writes validation or staging metadata in PostgreSQL.
    What to expect:
        A live connection with autocommit off, to be committed or rolled back by callers.
    """

    LOGGER.debug("Opening PostgreSQL connection for terrain pipeline.")
    return psycopg.connect(
        host=runtime.host,
        seaport=runtime.seaport,
        dbname=runtime.dbname,
        user=runtime.user,
        password=runtime.password,
    )


def validate_required_extensions(conn: psycopg.Connection, required: Iterable[str]) -> None:
    """
    Why this exists:
        Ensure prerequisite PostgreSQL extensions are available before ETL proceeds.
    When to use:
        Phase-1 environment validation.
    What to expect:
        Raises RuntimeError naming missing extensions if environment is not ready.
    """

    required_set = set(required)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT extname FROM pg_extension WHERE extname = ANY(%s)",
            (list(required_set),),
        )
        present = {row[0] for row in cur.fetchall()}
    missing = sorted(required_set - present)
    if missing:
        raise RuntimeError(f"Missing required DB extensions: {', '.join(missing)}")
    LOGGER.debug("Validated required DB extensions: %s", ", ".join(sorted(required_set)))


def ensure_schema(conn: psycopg.Connection, schema_name: str) -> None:
    """
    Why this exists:
        Guarantee a dedicated schema for terrain staging and QA state.
    When to use:
        Phase-2 schema prep prior to writing intermediate or output tables.
    What to expect:
        Idempotent schema creation with no mutation outside the named schema.
    """

    with conn.cursor() as cur:
        cur.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema_name}"')
    conn.commit()
    LOGGER.debug("Ensured schema exists: %s", schema_name)

