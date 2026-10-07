"""
Point shapefile loading and per-H3 count indexing for metadata export.

Each point is assigned to exactly one cell per resolution using ``h3.latlng_to_cell``,
which is deterministic and prevents double-counting across adjacent hexes.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Mapping, Sequence, Tuple

import fiona
import h3
from pyproj import CRS, Transformer
from shapely.geometry import Point, shape

LOGGER = logging.getLogger(__name__)

# Missing or non-integer scalerank values bucket here so totals match per-rank sums.
SCALERANK_SENTINEL = -1


def normalize_scalerank(raw: object) -> int:
    """
    Why this exists:
        Coerce Natural Earth scalerank values to int or sentinel ``SCALERANK_SENTINEL``.
    When to use:
        When parsing airport/seaport/urban feature properties.
    What to expect:
        Returns ``SCALERANK_SENTINEL`` for None, non-numeric, or non-finite values.
    """

    if raw is None:
        return SCALERANK_SENTINEL
    try:
        v = int(float(raw))
    except (TypeError, ValueError):
        return SCALERANK_SENTINEL
    return v


@dataclass(frozen=True)
class LabeledPoint:
    """
    Why this exists:
        Hold one filtered point feature in WGS84 with normalized scalerank.
    When to use:
        After loading airport or seaport shapefiles.
    What to expect:
        ``lat``/``lng`` in degrees; ``scalerank`` may be ``SCALERANK_SENTINEL``.
    """

    lat: float
    lng: float
    scalerank: int


def _point_wgs84_from_feature(geom: object, feat_crs: CRS | None) -> tuple[float, float] | None:
    pt = shape(geom)
    if pt.is_empty:
        return None
    if not isinstance(pt, Point):
        pt = pt.representative_point()
    x, y = float(pt.x), float(pt.y)
    if feat_crs is None or feat_crs.equals(CRS.from_epsg(4326)):
        return (y, x)
    t = Transformer.from_crs(feat_crs, CRS.from_epsg(4326), always_xy=True)
    lng, lat = t.transform(x, y)
    return (lat, lng)


def load_filtered_points_wgs84(
    shapefile_path: Path,
    *,
    featurecla_value: str,
) -> List[LabeledPoint]:
    """
    Why this exists:
        Read point features where ``featurecla`` matches (case-sensitive).
    When to use:
        Building airport/seaport indexes for metadata export.
    What to expect:
        Raises if the file is missing or required fields are absent; returns an empty list when no
        matching features are present.
    """

    LOGGER.debug(
        "Loading point shapefile %s for featurecla=%r.",
        shapefile_path,
        featurecla_value,
    )
    if not shapefile_path.is_file():
        raise FileNotFoundError(f"Point shapefile not found: {shapefile_path}")

    out: List[LabeledPoint] = []
    file_crs: CRS | None = None
    with fiona.open(shapefile_path) as src:
        schema_props = (src.schema or {}).get("properties") or {}
        if "featurecla" not in schema_props:
            raise ValueError(
                f"Point shapefile {shapefile_path} is missing required property 'featurecla'."
            )
        if src.crs is not None:
            file_crs = CRS.from_user_input(src.crs)
        for feat in src:
            props = feat.get("properties") or {}
            fcla = props.get("featurecla")
            if fcla != featurecla_value:
                continue
            g = feat.get("geometry")
            if g is None:
                continue
            ll = _point_wgs84_from_feature(g, file_crs)
            if ll is None:
                continue
            lat, lng = ll
            sr = normalize_scalerank(props.get("scalerank"))
            out.append(LabeledPoint(lat=lat, lng=lng, scalerank=sr))

    LOGGER.debug(
        "Loaded %d point(s) with featurecla=%r from %s",
        len(out),
        featurecla_value,
        shapefile_path,
    )
    return out


def validate_point_shapefile_contract(
    shapefile_path: Path,
    *,
    featurecla_value: str,
) -> int:
    """
    Why this exists:
        Perform phase-1 contract validation for airport/seaport point sources.
    When to use:
        Terrain and metadata pipeline startup validation before long-running processing.
    What to expect:
        Raises on unreadable files, missing required fields, or no matching features.
    """

    points = load_filtered_points_wgs84(shapefile_path, featurecla_value=featurecla_value)
    if not points:
        raise ValueError(
            f"Point shapefile {shapefile_path} has no features with featurecla={featurecla_value!r}."
        )
    LOGGER.debug(
        "Validated point shapefile %s for featurecla=%r with %d feature(s).",
        shapefile_path,
        featurecla_value,
        len(points),
    )
    return len(points)


class PointCountIndex:
    """
    Why this exists:
        Map H3 cell → sparse scalerank → count for airports or seaports at fixed resolutions.
    When to use:
        Built once per metadata export run, queried per cell during record assembly.
    What to expect:
        ``cell_to_rank_counts`` keys only cells that received at least one point.
    """

    def __init__(self, resolutions: Sequence[int]) -> None:
        self._resolutions = tuple(resolutions)
        self._data: dict[int, dict[str, dict[int, int]]] = {
            r: defaultdict(lambda: defaultdict(int)) for r in self._resolutions
        }

    def ingest_points(self, points: Iterable[LabeledPoint]) -> None:
        """
        Why this exists:
            Assign each labeled point to one H3 cell per configured resolution and increment counts.
        When to use:
            After loading airport or seaport point lists.
        What to expect:
            Mutates internal counters; idempotent only if called once per logical dataset.
        """

        LOGGER.debug("Ingesting %d resolution(s) for point count index.", len(self._resolutions))
        for p in points:
            for res in self._resolutions:
                cell = h3.latlng_to_cell(p.lat, p.lng, res)
                self._data[res][cell][p.scalerank] += 1

    def totals_for_cell(self, cell: str, resolution: int) -> tuple[int, List[Tuple[int, int]]]:
        """
        Why this exists:
            Produce total count and sparse sorted (scalerank, count) rows for one hex.
        When to use:
            When serializing res-1 or res-4 metadata records.
        What to expect:
            Omits scaleranks with zero count; sorts by scalerank ascending.
        """

        rank_map = self._data.get(resolution, {}).get(cell, {})
        if not rank_map:
            return 0, []
        sparse = sorted(rank_map.items(), key=lambda kv: kv[0])
        total = sum(c for _, c in sparse)
        return total, sparse


def build_pair_indexes(
    config_root: Path,
    airport_filename: str,
    seaport_filename: str,
    resolutions: Sequence[int],
) -> tuple[PointCountIndex, PointCountIndex]:
    """
    Why this exists:
        Construct airport and seaport indexes from configured shapefiles in one call.
    When to use:
        Start of ``TerrainMetadataExporter.run``.
    What to expect:
        Raises on a missing file. Raises ``ValueError`` when the ports file has no ``Port`` features, so a wrong label stops the export before the cell loop.
    """

    LOGGER.debug(
        "build_pair_indexes root=%s airports=%s seaports=%s resolutions=%s.",
        config_root,
        airport_filename,
        seaport_filename,
        tuple(resolutions),
    )
    airport_path = config_root / airport_filename
    seaport_path = config_root / seaport_filename
    airports = load_filtered_points_wgs84(airport_path, featurecla_value="Airport")
    seaports = load_filtered_points_wgs84(seaport_path, featurecla_value="Port")
    if not seaports:
        message = f"Point shapefile {seaport_path} has no features with featurecla='Port'."
        LOGGER.error(message)
        raise ValueError(message)
    air_idx = PointCountIndex(resolutions)
    seaport_idx = PointCountIndex(resolutions)
    air_idx.ingest_points(airports)
    seaport_idx.ingest_points(seaports)
    return air_idx, seaport_idx


def sparse_rank_counts_to_json(rows: List[Tuple[int, int]]) -> List[dict[str, int]]:
    return [{"scalerank": sr, "count": c} for sr, c in rows if c > 0]
