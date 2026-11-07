"""MBTiles archive, XYZ files, and tile statistics."""

from __future__ import annotations

import hashlib
import io
import logging
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Mapping

import numpy as np
from PIL import Image

from scripts.basemap_pipeline.web_mercator import LonLatBox, tms_row
from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)


def is_uniform(rgba: np.ndarray) -> bool:
    """
    Why this exists:
        Recognize a tile that encodes as one color.
    When to use:
        When counting flat land and open water.
    What to expect:
        True when every pixel equals the first pixel.
    """

    LOGGER.log(TRACE_LEVEL, "is_uniform shape=%s.", rgba.shape)
    return bool((rgba == rgba[0, 0]).all())


def decode_tile(data: bytes) -> np.ndarray:
    """
    Why this exists:
        Read a stored WebP tile back into pixels.
    When to use:
        When stitching composites or checking a tile.
    What to expect:
        An RGBA ``uint8`` array. An RGB WebP gains opaque alpha.
    """

    LOGGER.log(TRACE_LEVEL, "decode_tile bytes=%s.", len(data))
    with Image.open(io.BytesIO(data)) as image:
        return np.asarray(image.convert("RGBA"))


@dataclass(frozen=True)
class MbtilesMetadata:
    """
    Why this exists:
        Carry the MBTiles metadata rows written when an archive closes.
    When to use:
        When opening ``MbtilesWriter``.
    What to expect:
        Bounds are geographic. Zooms are the native range stored in the file.
    """

    # Archive name.
    name: str
    # Short description stored in the metadata table.
    description: str
    # Credit line stored in the metadata table.
    attribution: str
    # Geographic bounds of the layer.
    bounds: LonLatBox
    # Lowest zoom stored in the archive.
    min_zoom: int
    # Highest zoom stored in the archive.
    max_zoom: int


@dataclass(frozen=True)
class TileStats:
    """
    Why this exists:
        Summarize one style's tiles for the size report.
    When to use:
        After a tiles run, and when reading a saved statistics file.
    What to expect:
        Per-zoom mappings use the zoom as a string. Byte counts include every tile occurrence
        except ``unique_bytes``, which counts each distinct image once.
    """

    # Tiles written at each zoom.
    tiles: Mapping[str, int]
    # Opaque gray flat-land tiles at each zoom.
    uniform_flat_land: Mapping[str, int]
    # Fully transparent tiles at each zoom.
    uniform_water: Mapping[str, int]
    # Other uniform tiles at each zoom.
    uniform_other: Mapping[str, int]
    # Encoded bytes of every tile occurrence at each zoom.
    encoded_bytes: Mapping[str, int]
    # Distinct images stored in the archive.
    unique_images: int
    # Encoded bytes of the distinct images.
    unique_bytes: int

    def __post_init__(self) -> None:
        """
        Why this exists:
            Freeze the per-zoom mappings.
        When to use:
            Called by the dataclass constructor.
        What to expect:
            Each mapping becomes a proxy over a string-keyed copy.
        """

        for name in ("tiles", "uniform_flat_land", "uniform_water", "uniform_other", "encoded_bytes"):
            raw = getattr(self, name)
            object.__setattr__(self, name, MappingProxyType({str(key): int(value) for key, value in raw.items()}))

    def to_json(self) -> dict:
        """
        Why this exists:
            Write statistics with a stable set of keys.
        When to use:
            When saving ``tile_stats_<style>.json``.
        What to expect:
            A dict whose keys are exactly the field names. Zoom keys are strings.
        """

        LOGGER.log(TRACE_LEVEL, "TileStats.to_json unique_images=%s.", self.unique_images)
        return {
            "tiles": dict(self.tiles),
            "uniform_flat_land": dict(self.uniform_flat_land),
            "uniform_water": dict(self.uniform_water),
            "uniform_other": dict(self.uniform_other),
            "encoded_bytes": dict(self.encoded_bytes),
            "unique_images": self.unique_images,
            "unique_bytes": self.unique_bytes,
        }

    @staticmethod
    def from_json(document: dict) -> TileStats:
        """
        Why this exists:
            Load a statistics file back into a frozen record.
        When to use:
            When writing the size report.
        What to expect:
            The same counts that were written.
        """

        LOGGER.log(TRACE_LEVEL, "TileStats.from_json keys=%s.", sorted(document))
        return TileStats(
            tiles=document["tiles"],
            uniform_flat_land=document["uniform_flat_land"],
            uniform_water=document["uniform_water"],
            uniform_other=document["uniform_other"],
            encoded_bytes=document["encoded_bytes"],
            unique_images=int(document["unique_images"]),
            unique_bytes=int(document["unique_bytes"]),
        )


class MbtilesWriter:
    """
    Why this exists:
        Store each distinct WebP once and map every XYZ tile onto it.
    When to use:
        As a context manager around one style's render.
    What to expect:
        The file is replaced on entry. Metadata is committed only on a clean exit.
        ``stats`` remains available after the context closes.
    """

    def __init__(
        self,
        path: Path,
        metadata: MbtilesMetadata,
        webp_quality: int,
        webp_method: int,
        flat_land_gray: int,
    ) -> None:
        """
        Why this exists:
            Remember encoding settings and the metadata written at the end.
        When to use:
            Immediately before entering the context.
        What to expect:
            Nothing is written until ``__enter__``.
        """

        # Archive path. An existing file is deleted on entry.
        self.path = path
        # Metadata rows committed on a clean exit.
        self.metadata = metadata
        # Lossy WebP quality.
        self.webp_quality = webp_quality
        # Lossy WebP method.
        self.webp_method = webp_method
        # Gray byte that counts as flat land.
        self.flat_land_gray = flat_land_gray
        self._connection: sqlite3.Connection | None = None
        self._encoded: dict[str, bytes] = {}
        self._tiles: dict[int, int] = {}
        self._flat: dict[int, int] = {}
        self._water: dict[int, int] = {}
        self._other: dict[int, int] = {}
        self._encoded_bytes: dict[int, int] = {}
        self._unique_images = 0
        self._unique_bytes = 0

    def __enter__(self) -> MbtilesWriter:
        """
        Why this exists:
            Create an empty MBTiles database for this run.
        When to use:
            In a ``with`` statement.
        What to expect:
            The parent folder exists and any previous file at ``path`` is gone.
        """

        LOGGER.debug("MbtilesWriter enter path=%s.", self.path)
        if self.path.exists():
            self.path.unlink()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path)
        connection.executescript(
            """
            CREATE TABLE metadata (name TEXT, value TEXT);
            CREATE TABLE map (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_id TEXT);
            CREATE TABLE images (tile_id TEXT, tile_data BLOB);
            CREATE UNIQUE INDEX map_index ON map (zoom_level, tile_column, tile_row);
            CREATE UNIQUE INDEX images_id ON images (tile_id);
            CREATE VIEW tiles AS
              SELECT map.zoom_level AS zoom_level,
                     map.tile_column AS tile_column,
                     map.tile_row AS tile_row,
                     images.tile_data AS tile_data
              FROM map JOIN images ON images.tile_id = map.tile_id;
            """
        )
        self._connection = connection
        return self

    def __exit__(self, exc_type: type[BaseException] | None, exc: BaseException | None, traceback: object) -> bool:
        """
        Why this exists:
            Commit a finished archive, or leave no partial metadata behind.
        When to use:
            When leaving the ``with`` statement.
        What to expect:
            Metadata is written only when there was no exception. The exception still propagates.
        """

        LOGGER.debug("MbtilesWriter exit path=%s error=%s.", self.path, exc_type)
        connection = self._connection
        self._connection = None
        if connection is None:
            return False
        try:
            if exc_type is None:
                self._write_metadata(connection)
                connection.commit()
            else:
                connection.rollback()
        finally:
            connection.close()
        return False

    def add_tile(self, zoom: int, x: int, y: int, rgba: np.ndarray) -> bytes:
        """
        Why this exists:
            Insert one tile, reusing the WebP bytes when the pixels were seen before.
        When to use:
            For every tile in a block.
        What to expect:
            The encoded bytes, including for a duplicate. Fully opaque tiles are stored as RGB.
        Exceptions:
            ``RuntimeError`` when called outside the context.
        """

        LOGGER.debug("add_tile zoom=%s x=%s y=%s.", zoom, x, y)
        rgba = np.ascontiguousarray(rgba)
        connection = self._require_connection()
        tile_id = hashlib.sha256(rgba.tobytes(order="C")).hexdigest()
        encoded = self._encoded.get(tile_id)
        if encoded is None:
            encoded = _encode_webp(rgba, self.webp_quality, self.webp_method)
            connection.execute("INSERT INTO images (tile_id, tile_data) VALUES (?, ?)", (tile_id, encoded))
            self._encoded[tile_id] = encoded
            self._unique_images += 1
            self._unique_bytes += len(encoded)
        connection.execute(
            "INSERT INTO map (zoom_level, tile_column, tile_row, tile_id) VALUES (?, ?, ?, ?)",
            (zoom, x, tms_row(y, zoom), tile_id),
        )
        self._tiles[zoom] = self._tiles.get(zoom, 0) + 1
        self._encoded_bytes[zoom] = self._encoded_bytes.get(zoom, 0) + len(encoded)
        if is_uniform(rgba):
            self._count_uniform(zoom, rgba[0, 0])
        return encoded

    def stats(self) -> TileStats:
        """
        Why this exists:
            Snapshot the counters for the statistics file.
        When to use:
            After the tiles have been added, including after a clean close.
        What to expect:
            A frozen record. Zoom keys are strings.
        """

        LOGGER.log(TRACE_LEVEL, "MbtilesWriter.stats images=%s.", self._unique_images)
        return TileStats(
            tiles=self._tiles,
            uniform_flat_land=self._flat,
            uniform_water=self._water,
            uniform_other=self._other,
            encoded_bytes=self._encoded_bytes,
            unique_images=self._unique_images,
            unique_bytes=self._unique_bytes,
        )

    def _count_uniform(self, zoom: int, pixel: np.ndarray) -> None:
        """
        Why this exists:
            Classify a uniform tile as water, flat land, or something else.
        When to use:
            From ``add_tile`` when every pixel matches.
        What to expect:
            One of the three uniform counters increases.
        """

        alpha = int(pixel[3])
        gray = int(pixel[0])
        if alpha == 0:
            bucket = self._water
        elif alpha == 255 and gray == int(pixel[1]) == int(pixel[2]) == self.flat_land_gray:
            bucket = self._flat
        else:
            bucket = self._other
        bucket[zoom] = bucket.get(zoom, 0) + 1

    def _write_metadata(self, connection: sqlite3.Connection) -> None:
        """
        Why this exists:
            Finish the archive with the MBTiles metadata table.
        When to use:
            On a clean exit.
        What to expect:
            Format, bounds, and zoom rows are stored as text.
        """

        bounds = self.metadata.bounds
        rows = {
            "name": self.metadata.name,
            "format": "webp",
            "bounds": f"{bounds.west},{bounds.south},{bounds.east},{bounds.north}",
            "minzoom": str(self.metadata.min_zoom),
            "maxzoom": str(self.metadata.max_zoom),
            "type": "baselayer",
            "version": "1",
            "description": self.metadata.description,
            "attribution": self.metadata.attribution,
        }
        connection.executemany("INSERT INTO metadata (name, value) VALUES (?, ?)", rows.items())

    def _require_connection(self) -> sqlite3.Connection:
        """
        Why this exists:
            Refuse inserts after the archive has closed.
        When to use:
            At the start of ``add_tile``.
        What to expect:
            The open connection.
        Exceptions:
            ``RuntimeError`` when the writer is not active.
        """

        if self._connection is None:
            raise RuntimeError("MBTiles writer is not open")
        return self._connection


def write_tile_file(root: Path, zoom: int, x: int, y: int, data: bytes) -> Path:
    """
    Why this exists:
        Write one XYZ WebP beside the deduplicated archive.
    When to use:
        With the bytes returned by ``add_tile``.
    What to expect:
        ``root/z/x/y.webp``, with parent folders created. Returns that path.
    """

    path = root / str(zoom) / str(x) / f"{y}.webp"
    LOGGER.debug("write_tile_file path=%s bytes=%s.", path, len(data))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


def read_tile(mbtiles_path: Path, zoom: int, x: int, y: int) -> bytes | None:
    """
    Why this exists:
        Fetch one XYZ tile from an MBTiles archive.
    When to use:
        When stitching composites or checking a location.
    What to expect:
        The WebP bytes, or ``None`` when that tile was not stored.
    """

    LOGGER.log(TRACE_LEVEL, "read_tile path=%s zoom=%s x=%s y=%s.", mbtiles_path, zoom, x, y)
    connection = sqlite3.connect(mbtiles_path)
    try:
        row = connection.execute(
            "SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?",
            (zoom, x, tms_row(y, zoom)),
        ).fetchone()
    finally:
        connection.close()
    if row is None:
        return None
    return bytes(row[0])


def _encode_webp(rgba: np.ndarray, quality: int, method: int) -> bytes:
    """
    Why this exists:
        Encode a tile the way the size and color checks expect.
    When to use:
        The first time a pixel pattern is stored.
    What to expect:
        Lossy WebP. Fully opaque tiles omit the alpha plane. Tiles with any transparency keep it.
    """

    if bool((rgba[..., 3] == 255).all()):
        image = Image.fromarray(rgba[..., :3])
    else:
        image = Image.fromarray(rgba)
    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=quality, method=method)
    return buffer.getvalue()
