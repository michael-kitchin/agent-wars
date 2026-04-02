"""JSON writers for terrain feature metadata payloads."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Mapping, Sequence

from .metadata_models import (
    AIRPORT_COUNT_BY_SCALERANK_KEY,
    AIRPORT_COUNT_TOTAL_KEY,
    HexMetadataRecordRes1,
    HexMetadataRecordRes4,
    SEAPORT_COUNT_BY_SCALERANK_KEY,
    SEAPORT_COUNT_TOTAL_KEY,
    TERRAIN_HEX_METADATA_SCHEMA_VERSION,
)
from .point_features import sparse_rank_counts_to_json


def record_res1_to_json_dict(record: HexMetadataRecordRes1) -> dict[str, Any]:
    """
    Why this exists:
        Serialize res-1 metadata rows with a stable key order for readable diffs.
    When to use:
        Before writing ``terrain_res1_metadata.json``.
    What to expect:
        Omits urban fields entirely (contract for res-1 consumers).
    """

    return {
        "h3_index": record.h3_index,
        "total_edges": record.total_edges,
        "all_water": record.all_water,
        "intersects_water": record.intersects_water,
        "water_edges": record.water_edges,
        "arctic_mean": record.arctic_mean,
        "forest_mean": record.forest_mean,
        "desert_mean": record.desert_mean,
        "tri_mean": record.tri_mean,
        "slope_mean": record.slope_mean,
        "elevation_max": record.elevation_max,
        AIRPORT_COUNT_TOTAL_KEY: record.airport_count_total,
        AIRPORT_COUNT_BY_SCALERANK_KEY: sparse_rank_counts_to_json(list(record.airport_count_by_scalerank)),
        SEAPORT_COUNT_TOTAL_KEY: record.seaport_count_total,
        SEAPORT_COUNT_BY_SCALERANK_KEY: sparse_rank_counts_to_json(list(record.seaport_count_by_scalerank)),
    }


def record_res4_to_json_dict(record: HexMetadataRecordRes4) -> dict[str, Any]:
    """
    Why this exists:
        Serialize res-4 metadata rows including urban mask metrics.
    When to use:
        Before writing ``terrain_res4_metadata.json``.
    What to expect:
        Superset of res-1 keys with aggregate urban fields plus ``urban_by_scalerank``.
    """

    base = record_res1_to_json_dict(record)
    base.update(
        {
            "all_urban": record.all_urban,
            "intersects_urban": record.intersects_urban,
            "urban_edges": record.urban_edges,
            "urban_by_scalerank": [
                {
                    "scalerank": e.scalerank,
                    "all_urban": e.all_urban,
                    "intersects_urban": e.intersects_urban,
                    "urban_edges": e.urban_edges,
                }
                for e in record.urban_by_scalerank
            ],
        }
    )
    return base


def write_json_document(path: Path, payload: Mapping[str, Any]) -> None:
    """
    Why this exists:
        Persist pretty-printed UTF-8 JSON with stable trailing newline.
    When to use:
        All metadata and semantics exports from this pipeline.
    What to expect:
        Creates parent directories as needed.
    """

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(dict(payload), f, indent=2, ensure_ascii=False)
        f.write("\n")


def build_metadata_envelope(
    *,
    resolution: int,
    records: Sequence[dict[str, Any]],
) -> dict[str, Any]:
    """
    Why this exists:
        Assemble the top-level object envelope for res-1 or res-4 metadata files.
    When to use:
        Immediately before ``write_json_document`` for per-resolution exports.
    What to expect:
        ``record_count`` matches ``len(records)``; caller must sort ``records`` by ``h3_index``.
    """

    return {
        "schema_version": TERRAIN_HEX_METADATA_SCHEMA_VERSION,
        "resolution": resolution,
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "record_count": len(records),
        "records": list(records),
    }

