"""The 23 regional map definitions."""

from __future__ import annotations

import logging
from typing import Final

from .region_models import CentroidBox, FootprintTargets, MemberUnit, RegionDefinition

LOGGER = logging.getLogger(__name__)


def _whole(*codes: str) -> tuple[MemberUnit, ...]:
    """
    Why this exists:
        Build whole-country members from admin-0 codes.
    When to use:
        When a region keeps every admin-1 unit of each listed country.
    What to expect:
        One member per code, in the given order, with no admin-1 filter.
    """

    return tuple(MemberUnit(adm0_a3=code) for code in codes)


def _box(lat_min: float, lat_max: float, lon_min: float, lon_max: float) -> CentroidBox:
    """
    Why this exists:
        Build a centroid window with keyword fields.
    When to use:
        While declaring a region.
    What to expect:
        A box. When ``lon_min`` is greater than ``lon_max``, the box wraps.
    """

    return CentroidBox(lat_min=lat_min, lat_max=lat_max, lon_min=lon_min, lon_max=lon_max)


def _targets(land: int, sea: int, neutral_border: int) -> FootprintTargets:
    """
    Why this exists:
        Build footprint targets with keyword fields.
    When to use:
        While declaring a region.
    What to expect:
        The three target counts.
    """

    return FootprintTargets(land=land, sea=sea, neutral_border=neutral_border)


def _region(
    region_id: str,
    display_name: str,
    strategic_resolution: int,
    tactical_resolution: int,
    members: tuple[MemberUnit, ...],
    centroid_box: CentroidBox,
    sea_reach_km: float,
    neutral_reach_km: float,
    desert_trim_reach_km: float | None,
    targets: FootprintTargets,
) -> RegionDefinition:
    """
    Why this exists:
        Construct one catalog entry with keyword fields.
    When to use:
        From the catalog tuple only.
    What to expect:
        A frozen region definition.
    """

    return RegionDefinition(
        region_id=region_id,
        display_name=display_name,
        strategic_resolution=strategic_resolution,
        tactical_resolution=tactical_resolution,
        members=members,
        centroid_box=centroid_box,
        sea_reach_km=sea_reach_km,
        neutral_reach_km=neutral_reach_km,
        desert_trim_reach_km=desert_trim_reach_km,
        targets=targets,
    )


# Every regional map, in catalog order.
REGION_DEFINITIONS: Final[tuple[RegionDefinition, ...]] = (
    _region("western_europe", "Western Europe", 3, 6, _whole("AUT", "BEL", "CHE", "DEU", "FRA", "LIE", "LUX", "MCO", "NLD"), _box(41, 56, -5.5, 17.5), 425, 425, None, _targets(136, 38, 91)),
    _region("southern_europe", "Southern Europe", 3, 6, _whole("ALB", "AND", "BIH", "ESP", "GIB", "GRC", "HRV", "ITA", "KOS", "MKD", "MLT", "MNE", "PRT", "SMR", "SRB", "SVN", "VAT"), _box(34.5, 47.5, -10, 30), 450, 0, None, _targets(189, 99, 0)),
    _region("northern_europe", "Northern Europe", 3, 6, _whole("ALD", "DNK", "EST", "FIN", "FRO", "GBR", "GGY", "IMN", "IRL", "ISL", "JEY", "LTU", "LVA", "NOR", "SWE"), _box(49, 66, -25, 32), 125, 0, None, _targets(243, 68, 0)),
    _region("eastern_europe", "Eastern Europe", 2, 5, _whole("BGR", "BLR", "CZE", "HUN", "MDA", "POL", "ROU", "RUS", "SVK", "UKR"), _box(40, 82, 12, -168), 550, 0, None, _targets(308, 42, 0)),
    _region(
        "northern_america",
        "Northern America",
        2,
        5,
        (
            MemberUnit(adm0_a3="CAN", exclude_admin1=("CA-NT", "CA-NU", "CA-YT")),
            MemberUnit(adm0_a3="USA", exclude_admin1=("US-AK", "US-HI")),
        ),
        _box(24, 62, -130, -52),
        800,
        0,
        None,
        _targets(208, 79, 0),
    ),
    _region("central_america", "Central America", 3, 6, _whole("BLZ", "CRI", "GTM", "HND", "MEX", "NIC", "PAN", "SLV"), _box(7, 33, -118, -77), 0, 0, None, _targets(276, 0, 0)),
    _region(
        "caribbean",
        "Caribbean",
        3,
        6,
        _whole(
            "ABW", "AIA", "ATG", "BHS", "BJN", "BLM", "BRB", "CUB", "CUW", "CYM", "DMA", "DOM", "GRD", "HTI", "JAM",
            "KNA", "LCA", "MAF", "MSR", "PRI", "SER", "SXM", "TCA", "TTO", "USG", "VCT", "VGB", "VIR",
        )
        + (
            MemberUnit(adm0_a3="FRA", include_admin1=("FR-GP", "FR-MQ")),
            MemberUnit(adm0_a3="NLD", include_admin1=("NL-BQ1", "NL-BQ2", "NL-BQ3")),
        ),
        _box(9.5, 27.5, -85.5, -59),
        250,
        0,
        None,
        _targets(120, 165, 0),
    ),
    _region(
        "south_america",
        "South America",
        2,
        5,
        _whole("ARG", "BOL", "BRA", "BRI", "CHL", "COL", "ECU", "GUY", "PER", "PRY", "SPI", "SUR", "URY", "VEN")
        + (MemberUnit(adm0_a3="FRA", include_admin1=("FR-GF",)),),
        _box(-56, 13, -81.5, -34),
        575,
        0,
        None,
        _targets(265, 78, 0),
    ),
    _region("maghreb", "Maghreb", 3, 6, _whole("DZA", "MAR", "TUN"), _box(18, 38, -17.5, 12), 225, 0, None, _targets(296, 30, 0)),
    _region("libya_egypt_sudan", "Libya, Egypt, and Sudan", 3, 6, _whole("BRT", "EGY", "LBY", "SDN"), _box(8, 34, 9, 39), 275, 0, 225, _targets(262, 26, 0)),
    _region("west_africa_coast", "West Africa Coast", 3, 6, _whole("BEN", "BFA", "CIV", "GHA", "GIN", "GMB", "GNB", "LBR", "NGA", "SEN", "SLE", "TGO"), _box(4, 17, -18, 15), 225, 0, None, _targets(307, 43, 0)),
    _region("middle_africa_north", "Middle Africa North", 3, 6, _whole("CAF", "CMR", "GAB", "GNQ", "TCD"), _box(-4.5, 23.5, 8, 27.5), 225, 0, None, _targets(270, 17, 0)),
    _region("middle_africa_south", "Middle Africa South", 3, 6, _whole("AGO", "COD", "COG"), _box(-18.5, 5.5, 11, 31.5), 0, 0, None, _targets(340, 0, 0)),
    _region("horn_and_great_lakes", "Horn and Great Lakes", 3, 6, _whole("BDI", "DJI", "ERI", "ETH", "KEN", "RWA", "SDS", "SOL", "SOM", "UGA"), _box(-5, 18.5, 23, 52), 0, 0, None, _targets(345, 0, 0)),
    _region("southern_east_africa", "Southern East Africa", 3, 6, _whole("MOZ", "MWI", "TZA", "ZMB", "ZWE"), _box(-27, -0.5, 21.5, 41), 275, 0, None, _targets(256, 26, 0)),
    _region("southern_africa", "Southern Africa", 3, 6, _whole("BWA", "LSO", "NAM", "SWZ", "ZAF"), _box(-35, -16.5, 11.5, 33.5), 625, 0, None, _targets(237, 81, 0)),
    _region("western_asia_north", "Western Asia North", 3, 6, _whole("ARM", "AZE", "GEO", "IRQ", "ISR", "JOR", "KWT", "LBN", "PSX", "SYR", "TUR"), _box(28.3, 42.5, 25.5, 51), 475, 200, None, _targets(188, 39, 50)),
    _region("central_asia", "Central Asia", 3, 6, _whole("KAB", "KAZ", "KGZ", "TJK", "TKM", "UZB"), _box(35, 56, 46, 88), 125, 0, None, _targets(335, 9, 0)),
    _region("southern_asia_west", "Southern Asia West", 3, 6, _whole("AFG", "IRN", "PAK"), _box(23.5, 40, 44, 78), 225, 0, None, _targets(297, 20, 0)),
    _region(
        "southern_asia_east",
        "Southern Asia East",
        3,
        6,
        _whole("BGD", "BTN", "KAS", "LKA", "NPL")
        + (MemberUnit(adm0_a3="IND", exclude_admin1=("IN-AN", "IN-LD")),),
        _box(5.5, 37.5, 68, 97.5),
        0,
        0,
        None,
        _targets(352, 0, 0),
    ),
    _region("eastern_asia", "Eastern Asia", 2, 5, _whole("CHN", "HKG", "JPN", "KOR", "MAC", "MNG", "PRK", "TWN"), _box(17.5, 54, 73, 146), 650, 0, None, _targets(216, 57, 0)),
    _region("south_eastern_asia", "South-Eastern Asia", 2, 5, _whole("BRN", "IDN", "KHM", "LAO", "MMR", "MYS", "PHL", "SGP", "THA", "TLS", "VNM"), _box(-11.5, 28.6, 92, 141.5), 650, 575, None, _targets(143, 83, 31)),
    _region("australia_new_zealand", "Australia and New Zealand", 2, 5, _whole("AUS", "NZL"), _box(-48, -9, 112, 179), 800, 0, None, _targets(146, 148, 0)),
)


def all_region_ids() -> list[str]:
    """
    Why this exists:
        List catalog ids in catalog order.
    When to use:
        The list command and any loop over every region.
    What to expect:
        Twenty-three ids. Does not change the catalog.
    """

    LOGGER.debug("all_region_ids count=%d.", len(REGION_DEFINITIONS))
    return [region.region_id for region in REGION_DEFINITIONS]


def region_by_id(region_id: str) -> RegionDefinition:
    """
    Why this exists:
        Look up one region definition.
    When to use:
        When a command names a region.
    What to expect:
        The matching definition.
    Exceptions:
        ``KeyError`` naming the valid ids when ``region_id`` is unknown.
    """

    LOGGER.debug("region_by_id region_id=%s.", region_id)
    for region in REGION_DEFINITIONS:
        if region.region_id == region_id:
            return region
    valid = ", ".join(all_region_ids())
    raise KeyError(f"Unknown region_id {region_id!r}. Valid ids: {valid}")
