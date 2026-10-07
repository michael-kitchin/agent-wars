"""Shared cell loop for strategic and tactical terrain metadata."""

from __future__ import annotations

import logging
from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import rasterio
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union

from .config import PipelineConfig
from .logging_utils import TRACE_LEVEL
from .geometry_bounds import clip_polygonal_to_bounds
from .metadata_io import (
    build_metadata_envelope,
    record_res1_to_json_dict,
    record_res4_to_json_dict,
    write_json_document,
)
from .metadata_models import HexMetadataRecordRes1, HexMetadataRecordRes4, UrbanRankMaskEntry
from .ocean_mask import (
    OceanPredicateContext,
    _cell_polygon_wgs84_to_3857,
    _mask_metrics_for_projected_cell,
    build_ocean_predicate_context,
    load_ocean_union_wgs84,
)
from .point_features import PointCountIndex, build_pair_indexes
from .resolution_profile import ResolutionProfile
from .sampling import (
    SampleWindow,
    _ensure_proj_data_env,
    cell_polygon,
    deterministic_points_within_polygon,
    read_sample_windows,
    sample_many_rasters,
    sample_many_windows,
)
from .urban_scalerank import load_urban_geometries_by_scalerank

LOGGER = logging.getLogger(__name__)


def compose_forest_mean(sampled: dict[str, float | None]) -> float | None:
    """
    Why this exists:
        Match classifier interior logic: forest signal is the sum of class 1–4 prevalence means.
    When to use:
        After ``sample_many_rasters`` for land-cover layers.
    What to expect:
        Returns ``None`` only when all four class means are missing; partial coverage sums available classes.
    """

    LOGGER.log(TRACE_LEVEL, "compose_forest_mean sampled_keys=%s.", tuple(sampled))
    vals = [sampled.get(f"class_{i}") for i in range(1, 5)]
    if all(v is None for v in vals):
        return None
    return float(sum(v for v in vals if v is not None))


@dataclass(frozen=True)
class MetadataMaskSources:
    """
    Why this exists:
        Hold the unclipped water and urban polygons loaded once per export process.
    When to use:
        Pass to ``build_mask_contexts`` for each resolution pass.
    What to expect:
        ``ocean_and_lakes_wgs84`` is the union of the ocean and lake polygons.
    """

    # Ocean polygons in WGS84, without lakes.
    ocean_wgs84: BaseGeometry
    # Ocean plus lakes, used by tactical water masks.
    ocean_and_lakes_wgs84: BaseGeometry
    # All urban polygons dissolved together.
    urban_aggregate_wgs84: BaseGeometry
    # Urban polygons dissolved per scalerank, sorted by rank.
    urban_by_rank_wgs84: tuple[tuple[int, BaseGeometry], ...]


@dataclass(frozen=True)
class MetadataMaskContexts:
    """
    Why this exists:
        Hold prepared water and urban indexes for one resolution pass.
    When to use:
        Pass to ``build_metadata_rows`` after clipping to the cell set.
    What to expect:
        ``urban_aggregate`` is ``None`` when the profile turns urban metrics off.
    """

    # Prepared water mask, ocean only or ocean plus lakes.
    water: OceanPredicateContext
    # Prepared aggregate urban mask, or None when urban metrics are off.
    urban_aggregate: OceanPredicateContext | None
    # Prepared urban masks by scalerank. Empty when urban metrics are off.
    urban_by_rank: tuple[tuple[int, OceanPredicateContext], ...]


@dataclass(frozen=True)
class PointIndexes:
    """
    Why this exists:
        Keep airport and seaport counts addressable by H3 cell.
    When to use:
        Built once for the resolutions in a pack, then queried per cell.
    What to expect:
        Cells with no facilities return a zero total and an empty rank list.
    """

    # Airport counts keyed by H3 cell at each indexed resolution.
    airports: PointCountIndex
    # Seaport counts keyed by H3 cell at each indexed resolution.
    seaports: PointCountIndex


def load_metadata_mask_sources(config: PipelineConfig) -> MetadataMaskSources:
    """
    Why this exists:
        Read ocean, lake, and urban shapefiles once for every resolution pass.
    When to use:
        At the start of a metadata export, before opening rasters.
    What to expect:
        Raises ``FileNotFoundError`` or ``ValueError`` when a required shapefile is missing or empty.
    """

    rasters = config.input_rasters
    LOGGER.debug("Loading metadata mask sources from %s.", rasters.root)
    ocean = load_ocean_union_wgs84(rasters.root / rasters.ocean_shapefile_name)
    lakes = load_ocean_union_wgs84(rasters.root / rasters.lake_shapefile_name)
    urban_aggregate, urban_by_rank = load_urban_geometries_by_scalerank(rasters.root / rasters.urban_shapefile_name)
    return MetadataMaskSources(
        ocean_wgs84=ocean,
        ocean_and_lakes_wgs84=unary_union((ocean, lakes)),
        urban_aggregate_wgs84=urban_aggregate,
        urban_by_rank_wgs84=tuple(urban_by_rank),
    )


def build_mask_contexts(
    sources: MetadataMaskSources,
    profile: ResolutionProfile,
    clip_bounds: tuple[float, float, float, float] | None,
) -> MetadataMaskContexts:
    """
    Why this exists:
        Choose ocean or ocean-plus-lakes, optionally clip, and prepare predicate indexes.
    When to use:
        Once per resolution pass. Pass ``clip_bounds=None`` for a global export.
    What to expect:
        Urban ranks whose clipped geometry is empty are omitted. An empty water clip still
        returns a context that reports no water intersection.
    """

    LOGGER.debug(
        "Building mask contexts for resolution %d (lakes=%s, urban=%s, clip=%s).",
        profile.resolution,
        profile.include_lakes,
        profile.include_urban,
        clip_bounds is not None,
    )
    water_geom = sources.ocean_and_lakes_wgs84 if profile.include_lakes else sources.ocean_wgs84
    water = build_ocean_predicate_context(clip_polygonal_to_bounds(water_geom, clip_bounds))
    if not profile.include_urban:
        return MetadataMaskContexts(water=water, urban_aggregate=None, urban_by_rank=())
    urban_aggregate = build_ocean_predicate_context(
        clip_polygonal_to_bounds(sources.urban_aggregate_wgs84, clip_bounds)
    )
    urban_by_rank: list[tuple[int, OceanPredicateContext]] = []
    for rank, geom in sources.urban_by_rank_wgs84:
        clipped = clip_polygonal_to_bounds(geom, clip_bounds)
        if clipped.is_empty:
            continue
        urban_by_rank.append((rank, build_ocean_predicate_context(clipped)))
    return MetadataMaskContexts(
        water=water,
        urban_aggregate=urban_aggregate,
        urban_by_rank=tuple(urban_by_rank),
    )


def open_metadata_rasters(config: PipelineConfig) -> dict[str, rasterio.DatasetReader]:
    """
    Why this exists:
        Open every land-cover and topography raster a metadata pass can sample.
    When to use:
        Once per export process, then share the readers across resolution passes.
    What to expect:
        Raises after closing any readers already opened when a later file is missing.
        Keys are ``class_{n}`` and the topography filename without ``.tif``.
    """

    _ensure_proj_data_env()
    datasets: dict[str, rasterio.DatasetReader] = {}
    rasters = config.input_rasters
    LOGGER.debug("Opening metadata rasters from %s.", rasters.root)
    try:
        for land_class, filename in sorted(rasters.landcover_by_class.items()):
            datasets[f"class_{land_class}"] = rasterio.open(rasters.root / filename)
        for filename in rasters.topo_files:
            datasets[filename.replace(".tif", "")] = rasterio.open(rasters.root / filename)
        return datasets
    except Exception:
        LOGGER.error("Failed to open required rasters from %s while building metadata inputs.", rasters.root, exc_info=True)
        for dataset in datasets.values():
            dataset.close()
        raise


def close_rasters(rasters: Mapping[str, rasterio.DatasetReader]) -> None:
    """
    Why this exists:
        Release raster file handles after both resolution passes finish.
    When to use:
        In a ``finally`` block that owns the readers from ``open_metadata_rasters``.
    What to expect:
        Closes every reader. A reader that is already closed may raise from rasterio.
    """

    LOGGER.debug("Closing %d metadata rasters.", len(rasters))
    for dataset in rasters.values():
        dataset.close()


def build_point_indexes(config: PipelineConfig, resolutions: tuple[int, ...]) -> PointIndexes:
    """
    Why this exists:
        Index airports and seaports at each resolution the pack will write.
    When to use:
        Once per export, before the cell loops.
    What to expect:
        Raises when a shapefile is missing or when the ports file has no ``Port`` features. Cells with no points contribute nothing.
    """

    rasters = config.input_rasters
    LOGGER.debug("Building airport and seaport indexes for resolutions %s.", resolutions)
    airports, seaports = build_pair_indexes(
        rasters.root,
        rasters.airport_shapefile_name,
        rasters.seaport_shapefile_name,
        resolutions,
    )
    return PointIndexes(airports=airports, seaports=seaports)


def build_metadata_rows(
    cells: Sequence[str],
    profile: ResolutionProfile,
    masks: MetadataMaskContexts,
    points: PointIndexes,
    rasters: Mapping[str, rasterio.DatasetReader],
    *,
    clip_bounds: tuple[float, float, float, float] | None = None,
) -> list[dict[str, Any]]:
    """
    Why this exists:
        Compute one metadata record per cell at the profile's resolution.
    When to use:
        After masks, point indexes, and rasters are ready. Pass ``clip_bounds`` for a regional
        box so raster means are read from memory.
    What to expect:
        Unsorted records. Strategic profiles omit urban keys. Tactical profiles include them.
        With ``clip_bounds``, lon/lat rasters are read once into a window. A projected raster keeps
        per-pixel sampling. Sample points outside a window are treated as nodata.
        Raises ``RuntimeError`` when an edge count exceeds the cell's side count.
    """

    LOGGER.debug(
        "Building metadata rows for %d cells at resolution %d (clip=%s).",
        len(cells),
        profile.resolution,
        clip_bounds is not None,
    )
    needed_keys = {f"class_{land_class}" for land_class in range(1, 13)}
    needed_keys.update(profile.topo_keys)
    raster_pairs = [(key, dataset) for key, dataset in rasters.items() if key in needed_keys]
    windows: list[tuple[str, SampleWindow]] | None = None
    if clip_bounds is not None:
        windows = read_sample_windows(raster_pairs, clip_bounds)
    json_rows: list[dict[str, Any]] = []
    for idx, cell in enumerate(cells, start=1):
        json_rows.append(_row_for_cell(cell, profile, masks, points, raster_pairs, windows))
        if idx % 10000 == 0:
            LOGGER.debug(
                "Metadata export %d/%d cells at resolution %d.",
                idx,
                len(cells),
                profile.resolution,
            )
    return json_rows


def write_metadata_file(out_path: Path, resolution: int, rows: list[dict[str, Any]]) -> None:
    """
    Why this exists:
        Persist metadata records in the same envelope the global files use.
    When to use:
        After ``build_metadata_rows`` for one resolution.
    What to expect:
        Sorts by ``h3_index``, writes pretty JSON, and logs the record count.
    """

    LOGGER.debug("Writing %d metadata rows at resolution %d to %s.", len(rows), resolution, out_path)
    ordered = sorted(rows, key=lambda row: row["h3_index"])
    write_json_document(out_path, build_metadata_envelope(resolution=resolution, records=ordered))
    LOGGER.info("Wrote %d metadata records (resolution %d) to %s", len(ordered), resolution, out_path)


def _row_for_cell(
    cell: str,
    profile: ResolutionProfile,
    masks: MetadataMaskContexts,
    points: PointIndexes,
    raster_pairs: list[tuple[str, rasterio.DatasetReader]],
    windows: list[tuple[str, SampleWindow]] | None,
) -> dict[str, Any]:
    """
    Why this exists:
        Keep the per-cell metric assembly in one place for both resolutions.
    When to use:
        From ``build_metadata_rows`` only.
    What to expect:
        A JSON-ready dict. Urban fields are present only when the profile includes urban.
        The cell polygon is projected once and reused for every mask.
    """

    poly = cell_polygon(cell)
    projected = _cell_polygon_wgs84_to_3857(poly)
    water_metrics = _mask_metrics_for_projected_cell(projected, masks.water)
    total_edges = water_metrics.total_edges
    water_edges = water_metrics.mask_edges
    if profile.include_urban:
        if masks.urban_aggregate is None:
            raise RuntimeError(f"Urban mask is missing for tactical cell {cell}.")
        urban_metrics = _mask_metrics_for_projected_cell(projected, masks.urban_aggregate)
        _assert_edge_invariants(total_edges, water_edges, urban_metrics.mask_edges)
        rank_entries = _urban_rank_entries(projected, masks.urban_by_rank)
        all_urban = urban_metrics.all_in_mask
        intersects_urban = urban_metrics.intersects
        urban_edges = urban_metrics.mask_edges
    else:
        _assert_edge_invariants(total_edges, water_edges, None)
        rank_entries = []
        all_urban = intersects_urban = False
        urban_edges = 0

    airport_total, airport_sparse = points.airports.totals_for_cell(cell, profile.resolution)
    seaport_total, seaport_sparse = points.seaports.totals_for_cell(cell, profile.resolution)
    sample_points = deterministic_points_within_polygon(poly, profile.sample_count)
    if windows is None:
        sampled = sample_many_rasters(raster_pairs, sample_points)
    else:
        sampled = sample_many_windows(windows, sample_points)
    record = HexMetadataRecordRes1(
        h3_index=cell,
        total_edges=total_edges,
        all_water=water_metrics.all_in_mask,
        intersects_water=water_metrics.intersects,
        water_edges=water_edges,
        arctic_mean=sampled.get("class_10"),
        forest_mean=compose_forest_mean(sampled),
        desert_mean=sampled.get("class_11"),
        tri_mean=sampled.get(profile.topo_keys[0]),
        slope_mean=sampled.get(profile.topo_keys[1]),
        elevation_max=sampled.get(profile.topo_keys[2]),
        airport_count_total=airport_total,
        airport_count_by_scalerank=tuple(airport_sparse),
        seaport_count_total=seaport_total,
        seaport_count_by_scalerank=tuple(seaport_sparse),
    )
    if not profile.include_urban:
        return record_res1_to_json_dict(record)
    tactical = HexMetadataRecordRes4(
        **asdict(record),
        all_urban=all_urban,
        intersects_urban=intersects_urban,
        urban_edges=urban_edges,
        urban_by_scalerank=tuple(rank_entries),
    )
    return record_res4_to_json_dict(tactical)


def _urban_rank_entries(
    projected_cell: BaseGeometry,
    urban_by_rank: tuple[tuple[int, OceanPredicateContext], ...],
) -> list[UrbanRankMaskEntry]:
    """
    Why this exists:
        Keep the sparse per-rank urban list identical to the global tactical file.
    When to use:
        For tactical cells only. ``projected_cell`` is the cell already in EPSG:3857.
    What to expect:
        Omits ranks that neither cover nor intersect the cell.
    """

    entries: list[UrbanRankMaskEntry] = []
    for rank, context in urban_by_rank:
        metrics = _mask_metrics_for_projected_cell(projected_cell, context)
        if not metrics.intersects and not metrics.all_in_mask:
            continue
        entries.append(
            UrbanRankMaskEntry(
                scalerank=rank,
                all_urban=metrics.all_in_mask,
                intersects_urban=metrics.intersects,
                urban_edges=metrics.mask_edges,
            )
        )
    return entries


def _assert_edge_invariants(total: int, water_edges: int, urban_edges: int | None) -> None:
    """
    Why this exists:
        Reject mask edge counts that cannot belong to the cell polygon.
    When to use:
        After water and, when present, urban edge counts are known.
    What to expect:
        Raises ``RuntimeError`` when a mask claims more edges than the cell has.
    """

    if water_edges > total or (urban_edges is not None and urban_edges > total):
        raise RuntimeError(
            f"Invalid edge counts: total_edges={total} water_edges={water_edges} urban_edges={urban_edges}"
        )
