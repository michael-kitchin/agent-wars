"""Write deterministic basemap zips, indexes, and the shared land and water tiles."""

from __future__ import annotations

import hashlib
import io
import json
import logging
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Final

import numpy as np
from PIL import Image

from scripts.basemap_pipeline.basemap_settings import STYLIZED_STYLE
from scripts.basemap_pipeline.tile_classes import FLAT_GRAY
from scripts.basemap_pipeline.web_mercator import TILE_SIZE_PX
from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)

# Fixed timestamp so a second run writes the same zip bytes.
ZIP_TIMESTAMP: Final = (2020, 1, 1, 0, 0, 0)
# WebP settings that match the prototype tiles.
WEBP_QUALITY: Final = 80
WEBP_METHOD: Final = 4


@dataclass(frozen=True)
class PartitionDraft:
    """
    Why this exists:
        Hold one partition's tiles until they are written.
    When to use:
        While rendering a pack.
    What to expect:
        ``shaded`` maps ``z/x/y`` to WebP bytes. ``flat`` lists the same kind of key.
    """

    # Tile keys whose pixels are flat land.
    flat: tuple[str, ...]
    # Tile keys that contain relief, with their encoded bytes.
    shaded: tuple[tuple[str, bytes], ...]


def settings_hash() -> str:
    """
    Why this exists:
        Rebuild a pack when the hillshade recipe changes.
    When to use:
        When writing a manifest and when deciding that a finished partition is current.
    What to expect:
        64 lowercase hex characters. The hash covers the stylized style and the pack rules.
    """

    payload = {
        "style": asdict(STYLIZED_STYLE),
        "tileSize": TILE_SIZE_PX,
        "webpQuality": WEBP_QUALITY,
        "webpMethod": WEBP_METHOD,
        "blankTolerance": 4,
        "globalZooms": [0, 7],
        "regionalZooms": [8, 9],
        "partitionZooms": {"low": 0, "high": 3, "regional": 5},
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(encoded.encode("utf-8")).hexdigest()
    LOGGER.log(TRACE_LEVEL, "settings_hash digest=%s.", digest)
    return digest


def sources_hash(paths: list[Path]) -> str:
    """
    Why this exists:
        Rebuild a pack when an elevation GeoTIFF changes.
    When to use:
        With the tiles that pack actually reads.
    What to expect:
        A sha256 of sorted ``name size`` lines. File times are not included.
    """

    lines = [f"{path.name} {path.stat().st_size}" for path in sorted(paths, key=lambda item: item.name)]
    digest = hashlib.sha256("\n".join(lines).encode("utf-8")).hexdigest()
    LOGGER.log(TRACE_LEVEL, "sources_hash files=%s.", len(paths))
    return digest


def shared_land_webp() -> bytes:
    """
    Why this exists:
        Serve every flat-land tile from one image.
    When to use:
        When writing a pack, and when a test needs the shared tile.
    What to expect:
        A 256 by 256 opaque gray-210 WebP.
    """

    gray = np.full((TILE_SIZE_PX, TILE_SIZE_PX), FLAT_GRAY, dtype=np.uint8)
    image = Image.fromarray(gray)
    return _encode(image)


def shared_water_webp() -> bytes:
    """
    Why this exists:
        Serve every water tile from one transparent image.
    When to use:
        When writing a pack, and when a test needs the shared tile.
    What to expect:
        A 256 by 256 WebP whose alpha is 0 everywhere.
    """

    image = Image.fromarray(np.zeros((TILE_SIZE_PX, TILE_SIZE_PX, 4), dtype=np.uint8))
    return _encode(image)


def encode_rgba_webp(rgba: np.ndarray) -> bytes:
    """
    Why this exists:
        Encode one shaded tile the same way the prototype does.
    When to use:
        After a tile has been classified as shaded.
    What to expect:
        Lossy WebP. A fully opaque tile drops the alpha plane.
    """

    LOGGER.log(TRACE_LEVEL, "encode_rgba_webp shape=%s.", rgba.shape)
    if bool((rgba[..., 3] == 255).all()):
        image = Image.fromarray(rgba[..., :3])
    else:
        image = Image.fromarray(rgba)
    return _encode(image)


def write_stored_zip(destination: Path, members: dict[str, bytes]) -> str:
    """
    Why this exists:
        Write a zip whose bytes depend only on its members.
    When to use:
        For a partition, the index archive, and the manifest archive.
    What to expect:
        Members are stored, not deflated, in sorted name order, with a fixed timestamp.
        Returns the sha256 of the zip file.
    """

    destination.parent.mkdir(parents=True, exist_ok=True)
    LOGGER.debug("write_stored_zip dest=%s members=%s.", destination.name, len(members))
    with zipfile.ZipFile(destination, "w") as archive:
        for name in sorted(members):
            info = zipfile.ZipInfo(filename=name, date_time=ZIP_TIMESTAMP)
            info.compress_type = zipfile.ZIP_STORED
            info.external_attr = 0o644 << 16
            archive.writestr(info, members[name])
    return hashlib.sha256(destination.read_bytes()).hexdigest()


def write_pack(
    output_dir: Path,
    kind: str,
    map_id: str,
    zoom_min: int,
    zoom_max: int,
    drafts: dict[str, PartitionDraft],
    style_hash: str,
    source_hash: str,
) -> Path:
    """
    Why this exists:
        Turn rendered tiles into the directory the app ships.
    When to use:
        At the end of a regional or global pack render.
    What to expect:
        Manifest, indexes, shared tiles, and one zip per partition that has shaded tiles.
        A partition with only flat tiles has ``zip`` null. An empty draft is omitted.
    """

    LOGGER.debug("write_pack dir=%s kind=%s map=%s partitions=%s.", output_dir, kind, map_id, len(drafts))
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "land.webp").write_bytes(shared_land_webp())
    (output_dir / "water.webp").write_bytes(shared_water_webp())
    index_members: dict[str, bytes] = {}
    partitions: dict[str, dict[str, str | None]] = {}
    for key in sorted(drafts):
        draft = drafts[key]
        if not draft.flat and not draft.shaded:
            continue
        document = {
            "flat": sorted(draft.flat),
            "shaded": sorted(name for name, _ in draft.shaded),
        }
        index_members[f"{key}.json"] = json.dumps(document, sort_keys=True, separators=(",", ":")).encode("utf-8")
        if draft.shaded:
            zip_name = f"{key}.zip"
            shaded_members = {f"{name}.webp": payload for name, payload in sorted(draft.shaded)}
            digest = write_stored_zip(output_dir / zip_name, shaded_members)
            partitions[key] = {"zip": zip_name, "sha256": digest}
        else:
            partitions[key] = {"zip": None, "sha256": None}
    indexes_digest = write_stored_zip(output_dir / "indexes.json.zip", index_members)
    manifest = {
        "schema": 1,
        "kind": kind,
        "mapId": map_id,
        "zoomMin": zoom_min,
        "zoomMax": zoom_max,
        "settingsHash": style_hash,
        "sourcesHash": source_hash,
        "landTile": "land.webp",
        "waterTile": "water.webp",
        "indexesZip": "indexes.json.zip",
        "indexesSha256": indexes_digest,
        "partitions": partitions,
    }
    encoded = json.dumps(manifest, sort_keys=True, indent=2).encode("utf-8")
    write_stored_zip(output_dir / "basemap_pack.json.zip", {"basemap_pack.json": encoded})
    return output_dir / "basemap_pack.json.zip"


def _encode(image: Image.Image) -> bytes:
    """
    Why this exists:
        Use one WebP quality for shared tiles and shaded tiles.
    When to use:
        From the public encode functions.
    What to expect:
        Lossy WebP bytes at quality 80 and method 4.
    """

    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=WEBP_QUALITY, method=WEBP_METHOD)
    return buffer.getvalue()
