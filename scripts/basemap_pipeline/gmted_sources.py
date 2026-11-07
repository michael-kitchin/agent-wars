"""Find, extract, and mosaic the GMTED tiles the basemap packs read."""

from __future__ import annotations

import logging
import shutil
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Final
from xml.sax.saxutils import escape

from scripts.basemap_pipeline.dem_source import (
    GMTED_NODATA,
    GMTED_PIXEL_DEG,
    GmtedFileInfo,
    describe_gmted_file,
    require_shared_pixel_grid,
)
from scripts.basemap_pipeline.web_mercator import LonLatBox
from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)

# Southwest-corner latitude labels of the 7.5-arc-second tiles, north to south.
LATITUDE_BANDS_075: Final = ("N70", "N50", "N30", "N10", "S10", "S30", "S50", "S70")
# Southwest-corner longitude labels, west to east.
LONGITUDE_BANDS: Final = (
    "W180",
    "W150",
    "W120",
    "W090",
    "W060",
    "W030",
    "E000",
    "E030",
    "E060",
    "E090",
    "E120",
    "E150",
)
# Download leftovers that mean a zip is still being written.
PARTIAL_SUFFIXES: Final = (".crswap", ".crdownload", ".part")
# Half an arc-second. GMTED pixel edges sit this far southwest of the labeled corner.
REGISTRATION_SHIFT_DEG: Final = 1.0 / 7200.0
# 30-arc-second spacing used by the Antarctica tiles and the world elevation.
COARSE_PIXEL_DEG: Final = 1.0 / 120.0


@dataclass(frozen=True)
class SelectedMember:
    """
    Why this exists:
        Name the one raster to extract from a GMTED zip.
    When to use:
        After a zip has been checked and before extraction.
    What to expect:
        ``kind`` is ``bln075``, ``dsc075``, or ``dsc300``.
    """

    # Zip path the member came from.
    archive: Path
    # Member name inside the zip.
    member_name: str
    # Uncompressed size, in bytes.
    uncompressed_size: int
    # Which product the member is.
    kind: str


@dataclass(frozen=True)
class SourceInventory:
    """
    Why this exists:
        Separate usable archives from ones the owner still has to download.
    When to use:
        The result of ``inventory_sources``.
    What to expect:
        ``missing`` is empty when every expected filename is a usable zip.
    """

    # Archives that can be extracted.
    present: tuple[Path, ...]
    # Expected filenames that are absent, empty, or partial.
    missing: tuple[str, ...]


def expected_archive_names() -> tuple[str, ...]:
    """
    Why this exists:
        Name every GMTED zip the packs require.
    When to use:
        Before looking at the owner's download folder.
    What to expect:
        96 breakline-resolution names followed by 12 Antarctica names.
    """

    fine = tuple(f"GMTED2010{lat}{lon}_075.zip" for lat in LATITUDE_BANDS_075 for lon in LONGITUDE_BANDS)
    coarse = tuple(f"GMTED2010S90{lon}_300.zip" for lon in LONGITUDE_BANDS)
    names = fine + coarse
    LOGGER.log(TRACE_LEVEL, "expected_archive_names count=%s.", len(names))
    return names


def inventory_sources(gmted_dir: Path) -> SourceInventory:
    """
    Why this exists:
        Tell the owner which downloads are still unusable.
    When to use:
        At the start of ``sources``, before extraction.
    What to expect:
        Present paths are sorted. A 0-byte zip or a zip with a partial sibling is missing.
    """

    LOGGER.debug("inventory_sources dir=%s.", gmted_dir)
    present: list[Path] = []
    missing: list[str] = []
    for name in expected_archive_names():
        path = gmted_dir / name
        if _usable_zip(path):
            present.append(path)
        else:
            missing.append(name)
    return SourceInventory(tuple(present), tuple(missing))


def select_member(archive: Path) -> SelectedMember:
    """
    Why this exists:
        Pick breakline emphasis, or the subsample when USGS omitted it.
    When to use:
        On one usable zip.
    What to expect:
        A 7.5-arc-second zip yields ``bln075`` or ``dsc075``. A 30-arc-second zip yields ``dsc300``.
    Exceptions:
        ``ValueError`` when the expected member is absent.
    """

    LOGGER.debug("select_member archive=%s.", archive.name)
    with zipfile.ZipFile(archive) as archive_file:
        names = archive_file.namelist()
        if archive.name.endswith("_300.zip"):
            kind = "dsc300"
        else:
            kind = "bln075" if any("bln075" in name.lower() for name in names) else "dsc075"
        matches = [name for name in names if kind in name.lower()]
        if len(matches) != 1:
            raise ValueError(f"{archive.name} has {len(matches)} {kind} members")
        info = archive_file.getinfo(matches[0])
    return SelectedMember(archive, matches[0], info.file_size, kind)


def extract_member(archive: Path, destination_dir: Path) -> Path:
    """
    Why this exists:
        Put one GeoTIFF beside its zip without unpacking the other statistics.
    When to use:
        When the tif is missing or its size does not match the zip member.
    What to expect:
        The extracted path. An existing file of the member's uncompressed size is kept.
    Exceptions:
        ``ValueError`` from ``select_member`` when the zip has no usable raster.
    """

    selected = select_member(archive)
    destination_dir.mkdir(parents=True, exist_ok=True)
    destination = destination_dir / Path(selected.member_name).name
    if destination.is_file() and destination.stat().st_size == selected.uncompressed_size:
        LOGGER.debug("extract_member keep=%s.", destination.name)
        return destination
    LOGGER.debug("extract_member write=%s kind=%s.", destination.name, selected.kind)
    temporary = destination.with_suffix(destination.suffix + ".partial")
    with zipfile.ZipFile(archive) as archive_file, archive_file.open(selected.member_name) as source, temporary.open("wb") as target:
        shutil.copyfileobj(source, target)
    temporary.replace(destination)
    return destination


def write_elevation_vrt(tile_paths: list[Path], destination: Path) -> Path:
    """
    Why this exists:
        Read many GMTED tiles as one dataset without loading them into memory.
    When to use:
        After the 7.5-arc-second tiles, or the Antarctica tiles, have been extracted.
    What to expect:
        A ``.vrt`` file. Tiles must already share one pixel grid.
    Exceptions:
        ``ValueError`` when the tiles do not share a pixel size or phase.
    """

    LOGGER.debug("write_elevation_vrt tiles=%s dest=%s.", len(tile_paths), destination)
    if not tile_paths:
        raise ValueError("no tiles to mosaic")
    pixels = {_pixel_of(path) for path in tile_paths}
    if len(pixels) != 1:
        raise ValueError("tiles do not share a pixel size")
    infos = [_describe_for_pixel(path) for path in tile_paths]
    require_shared_pixel_grid(infos)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(_vrt_xml(infos), encoding="utf-8")
    return destination


def _usable_zip(path: Path) -> bool:
    """
    Why this exists:
        Reject an unfinished Chrome download.
    When to use:
        From ``inventory_sources``.
    What to expect:
        True only for a non-empty zip with no partial sibling.
    """

    if not path.is_file() or path.stat().st_size < 1000:
        return False
    if any(Path(str(path) + suffix).exists() for suffix in PARTIAL_SUFFIXES):
        return False
    return zipfile.is_zipfile(path)


def _describe_for_pixel(path: Path) -> GmtedFileInfo:
    """
    Why this exists:
        Describe a tile with the checker that matches its spacing.
    When to use:
        While building a VRT.
    What to expect:
        A fine tile goes through ``describe_gmted_file``. A 30-arc-second tile uses the coarse checker.
    Exceptions:
        ``ValueError`` when the spacing is neither.
    """

    pixel = _pixel_of(path)
    if abs(pixel - GMTED_PIXEL_DEG) <= 1e-9:
        return describe_gmted_file(path)
    if abs(pixel - COARSE_PIXEL_DEG) <= 1e-9:
        return _describe_coarse(path)
    raise ValueError(f"{path} pixel size {pixel} is not a GMTED spacing")


def _describe_coarse(path: Path) -> GmtedFileInfo:
    """
    Why this exists:
        Check a 30-arc-second tile without loosening the 7.5-arc-second checker.
    When to use:
        On an extracted ``dsc300`` GeoTIFF.
    What to expect:
        The same description shape as ``describe_gmted_file``.
    Exceptions:
        ``ValueError`` when the grid is not the 30-arc-second GMTED grid.
    """

    LOGGER.log(TRACE_LEVEL, "describe_coarse path=%s.", path)
    info = _describe_with_pixel(path, COARSE_PIXEL_DEG)
    return info


def _describe_with_pixel(path: Path, pixel_deg: float) -> GmtedFileInfo:
    """
    Why this exists:
        Share the coarse-tile field checks.
    When to use:
        From ``_describe_coarse``.
    What to expect:
        A ``GmtedFileInfo`` when the spacing matches ``pixel_deg``.
    Exceptions:
        ``ValueError`` when the raster is not an int16 WGS84 tile with GMTED nodata.
    """

    import rasterio
    from rasterio.crs import CRS
    from rasterio.errors import CRSError

    with rasterio.open(path) as dataset:
        try:
            crs_ok = dataset.crs is not None and dataset.crs.equals(CRS.from_epsg(4326))
        except CRSError:
            crs_ok = False
        spacing_ok = abs(dataset.res[0] - pixel_deg) <= 1e-9 and abs(dataset.res[1] - pixel_deg) <= 1e-9
        nodata_ok = dataset.nodata is not None and float(dataset.nodata) == float(GMTED_NODATA)
        if not crs_ok or not spacing_ok or dataset.dtypes[0] != "int16" or dataset.count != 1 or not nodata_ok:
            raise ValueError(f"{path} is not a {pixel_deg} degree GMTED tile")
        bounds = dataset.bounds
        return GmtedFileInfo(
            path=path,
            box=LonLatBox(bounds.left, bounds.bottom, bounds.right, bounds.top),
            origin_x=float(dataset.transform.c),
            origin_y=float(dataset.transform.f),
        )


def _vrt_xml(infos: list[GmtedFileInfo]) -> str:
    """
    Why this exists:
        Build a GDAL VRT without calling ``gdalbuildvrt``.
    When to use:
        From ``write_elevation_vrt`` after the grid check.
    What to expect:
        XML whose destination rectangles place each tile on the shared grid.
    """

    pixel = _pixel_of(infos[0].path)
    left = min(info.box.west for info in infos)
    top = max(info.box.north for info in infos)
    right = max(info.box.east for info in infos)
    bottom = min(info.box.south for info in infos)
    width = int(round((right - left) / pixel))
    height = int(round((top - bottom) / pixel))
    sources = "\n".join(_source_xml(info, left, top, pixel) for info in infos)
    return (
        f'<VRTDataset rasterXSize="{width}" rasterYSize="{height}">\n'
        "  <SRS>EPSG:4326</SRS>\n"
        f"  <GeoTransform>{left}, {pixel}, 0, {top}, 0, {-pixel}</GeoTransform>\n"
        "  <VRTRasterBand dataType=\"Int16\" band=\"1\">\n"
        f"    <NoDataValue>{GMTED_NODATA}</NoDataValue>\n"
        f"{sources}\n"
        "  </VRTRasterBand>\n"
        "</VRTDataset>\n"
    )


def _pixel_of(path: Path) -> float:
    """
    Why this exists:
        Read the pixel size the VRT must copy.
    When to use:
        While writing VRT XML.
    What to expect:
        Degrees per pixel, positive.
    """

    import rasterio

    with rasterio.open(path) as dataset:
        return float(dataset.res[0])


def _source_xml(info: GmtedFileInfo, left: float, top: float, pixel: float) -> str:
    """
    Why this exists:
        Place one tile inside the VRT.
    When to use:
        From ``_vrt_xml``.
    What to expect:
        A ``SimpleSource`` element. Column and row come from the shared origin.
    """

    import rasterio

    with rasterio.open(info.path) as dataset:
        width = dataset.width
        height = dataset.height
    column = int(round((info.box.west - left) / pixel))
    row = int(round((top - info.box.north) / pixel))
    filename = escape(str(info.path))
    return (
        "    <SimpleSource>\n"
        f"      <SourceFilename relativeToVRT=\"0\">{filename}</SourceFilename>\n"
        "      <SourceBand>1</SourceBand>\n"
        f"      <SrcRect xOff=\"0\" yOff=\"0\" xSize=\"{width}\" ySize=\"{height}\"/>\n"
        f"      <DstRect xOff=\"{column}\" yOff=\"{row}\" xSize=\"{width}\" ySize=\"{height}\"/>\n"
        "    </SimpleSource>"
    )
