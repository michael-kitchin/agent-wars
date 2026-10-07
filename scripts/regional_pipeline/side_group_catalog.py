"""Side groups and origin levels for the 23 regional maps.

Membership follows the origin column and side-group names in the region summary.
Coordinate splits use province centroids. Named splits use Natural Earth region,
region_sub, or iso_3166_2. The catalog does not adjust membership to match the
summary's estimated hex counts.
"""

from __future__ import annotations

import logging
import unicodedata
from dataclasses import dataclass
from typing import Final

LOGGER = logging.getLogger(__name__)

# Origin grain for one country on one map.
OriginLevel = str


@dataclass(frozen=True)
class AdminArea:
    """
    Why this exists:
        Carry the shapefile fields a side-group rule can see, without a geometry.
    When to use:
        While matching a province to a group, and in tests that do not open a shapefile.
    What to expect:
        ``latitude`` and ``longitude`` are the province centroid. ``region`` may be empty.
    """

    # Natural Earth admin-0 code.
    adm0_a3: str
    # ISO 3166-2 code when the shapefile has one.
    iso_3166_2: str | None
    # Province name.
    name: str
    # Natural Earth ``region`` value.
    region: str | None
    # Natural Earth ``region_sub`` value.
    region_sub: str | None
    # Centroid latitude.
    latitude: float
    # Centroid longitude.
    longitude: float
    # ISO 3166-1 alpha-2 for the parent country.
    country_code: str


@dataclass(frozen=True)
class SideGroupRule:
    """
    Why this exists:
        Describe one way a province can belong to a side group.
    When to use:
        In catalog order. The first rule whose constraints all hold wins.
    What to expect:
        Empty constraints are ignored. A rule with no constraints never matches.
    """

    # Stable id stored on land hexes.
    group_id: str
    # Text shown in the new-game dialog.
    display_name: str
    # Admin-0 codes that satisfy the country constraint.
    countries: frozenset[str] = frozenset()
    # Folded ``(adm0_a3, region)`` pairs.
    regions: frozenset[tuple[str, str]] = frozenset()
    # Folded ``(adm0_a3, region_sub)`` pairs.
    region_subs: frozenset[tuple[str, str]] = frozenset()
    # ISO 3166-2 codes.
    iso_codes: frozenset[str] = frozenset()
    # Inclusive centroid bounds. None means that edge is open.
    lat_min: float | None = None
    lat_max: float | None = None
    lon_min: float | None = None
    lon_max: float | None = None
    # When true, the province's region field must be empty.
    missing_region: bool = False


@dataclass(frozen=True)
class OriginGrain:
    """
    Why this exists:
        Record which countries on a map use admin-1 or region origins.
    When to use:
        While building an origin id. Countries not listed use the country itself.
    What to expect:
        Codes are Natural Earth admin-0 codes.
    """

    # Countries whose origin unit is the admin-1 province.
    admin1: frozenset[str] = frozenset()
    # Countries whose origin unit is the Natural Earth region field.
    region: frozenset[str] = frozenset()


def fold_name(value: str | None) -> str:
    """
    Why this exists:
        Compare region names without depending on accent bytes.
    When to use:
        Before matching a shapefile region to a catalog rule.
    What to expect:
        Lowercase ASCII. Empty input returns an empty string.
    """

    if not value:
        return ""
    decomposed = unicodedata.normalize("NFKD", value)
    letters = "".join(character for character in decomposed if not unicodedata.combining(character))
    return "".join(character for character in letters.casefold() if character.isalnum())


def _regions(adm0: str, *names: str) -> frozenset[tuple[str, str]]:
    """
    Why this exists:
        Build folded region pairs for one country.
    When to use:
        While declaring a rule.
    What to expect:
        One pair per name.
    """

    return frozenset((adm0, fold_name(name)) for name in names)


def _subs(adm0: str, *names: str) -> frozenset[tuple[str, str]]:
    """
    Why this exists:
        Build folded region_sub pairs for one country.
    When to use:
        While declaring a rule.
    What to expect:
        One pair per name.
    """

    return frozenset((adm0, fold_name(name)) for name in names)


def _rule(group_id: str, display_name: str, **kwargs: object) -> SideGroupRule:
    """
    Why this exists:
        Construct a rule with keyword fields.
    When to use:
        From the catalog table only.
    What to expect:
        A frozen rule.
    """

    return SideGroupRule(group_id=group_id, display_name=display_name, **kwargs)  # type: ignore[arg-type]


_EAST_CHINA = "east_china_taiwan"
_NORTH_CHINA = "north_northwest_china_mongolia"
_KOREA = "korea_manchuria"
_SOUTH_CHINA = "south_southwest_china"
_SOUTH_GERMANY = "southern_eastern_germany_austria_switzerland"
_NORTH_GERMANY = "netherlands_northern_germany"
_SOUTH_FRANCE = "southern_france"
_NORTH_FRANCE = "northern_france_belgium"

# Rules in first-match order for every map.
SIDE_GROUP_RULES: Final[dict[str, tuple[SideGroupRule, ...]]] = {
    "eastern_asia": (
        _rule("japan", "Japan", countries=frozenset({"JPN"})),
        _rule(_KOREA, "Korea & Manchuria", countries=frozenset({"PRK", "KOR"})),
        _rule(_KOREA, "Korea & Manchuria", regions=_regions("CHN", "Northeast China")),
        _rule(_NORTH_CHINA, "North & northwest China, Mongolia", countries=frozenset({"MNG"})),
        _rule(_NORTH_CHINA, "North & northwest China, Mongolia", regions=_regions("CHN", "North China", "Northwest China")),
        _rule(_EAST_CHINA, "East China & Taiwan", countries=frozenset({"TWN", "HKG", "MAC"})),
        _rule(_EAST_CHINA, "East China & Taiwan", regions=_regions("CHN", "East China")),
        _rule(_EAST_CHINA, "East China & Taiwan", countries=frozenset({"CHN"}), missing_region=True, lat_min=23.500001),
        _rule(_SOUTH_CHINA, "South & southwest China", regions=_regions("CHN", "South Central China", "Southwest China")),
        _rule(_SOUTH_CHINA, "South & southwest China", countries=frozenset({"CHN"}), missing_region=True),
    ),
    "western_europe": (
        _rule(_SOUTH_GERMANY, "Southern & eastern Germany, Austria, Switzerland", iso_codes=frozenset({
            "DE-BY", "DE-BW", "DE-SN", "DE-TH", "DE-ST", "DE-BB", "DE-BE", "DE-HE", "DE-RP", "DE-SL",
        })),
        _rule(_SOUTH_GERMANY, "Southern & eastern Germany, Austria, Switzerland", countries=frozenset({"AUT", "CHE", "LIE"})),
        _rule(_NORTH_GERMANY, "Netherlands & northern Germany", iso_codes=frozenset({
            "DE-SH", "DE-NI", "DE-NW", "DE-MV", "DE-HB", "DE-HH",
        })),
        _rule(_NORTH_GERMANY, "Netherlands & northern Germany", countries=frozenset({"NLD"})),
        _rule(_SOUTH_FRANCE, "Southern France", regions=_regions(
            "FRA", "Nouvelle-Aquitaine", "Occitanie", "Corse", "Provence-Alpes-Cote d'Azur", "Auvergne-Rhone-Alpes",
        )),
        _rule(_SOUTH_FRANCE, "Southern France", countries=frozenset({"MCO"})),
        _rule(_NORTH_FRANCE, "Northern France & Belgium", regions=_regions(
            "FRA", "Bretagne", "Centre-Val de Loire", "Grand Est", "Hauts-de-France", "Normandie",
            "Pays de la Loire", "Ile-de-France", "Bourgogne-Franche-Comte",
        )),
        _rule(_NORTH_FRANCE, "Northern France & Belgium", countries=frozenset({"BEL", "LUX"})),
    ),
    "southern_europe": (
        _rule("iberia", "Iberia", countries=frozenset({"ESP", "PRT", "AND", "GIB"})),
        _rule("northern_italy", "Northern Italy", regions=_regions(
            "ITA", "Piemonte", "Valle d'Aosta", "Lombardia", "Liguria", "Trentino-Alto Adige",
            "Veneto", "Friuli-Venezia Giulia", "Emilia-Romagna",
        )),
        _rule("central_southern_italy", "Central & southern Italy", countries=frozenset({"ITA", "SMR", "VAT", "MLT"})),
        _rule("balkans_greece", "Balkans & Greece", countries=frozenset({
            "ALB", "BIH", "HRV", "GRC", "KOS", "MKD", "MNE", "SRB", "SVN",
        })),
    ),
    "western_asia_north": (
        _rule("western_turkey", "Western Turkey", countries=frozenset({"TUR"}), lon_max=34.999999),
        _rule("eastern_turkey_caucasus", "Eastern Turkey & Caucasus", countries=frozenset({"TUR", "ARM", "AZE", "GEO"})),
        _rule("iraq_kuwait", "Iraq & Kuwait", countries=frozenset({"IRQ", "KWT"})),
        _rule("levant_cyprus", "Levant & Cyprus", countries=frozenset({"ISR", "JOR", "LBN", "PSX", "SYR", "CYP"})),
    ),
    "southern_asia_west": (
        _rule("northern_western_iran", "Northern & western Iran", countries=frozenset({"IRN"}), lat_min=33.0, lon_max=54.5),
        _rule("southern_eastern_iran", "Southern & eastern Iran", countries=frozenset({"IRN"})),
        _rule("pakistan_afghanistan", "Pakistan & Afghanistan", countries=frozenset({"PAK", "AFG"})),
    ),
    "northern_america": (
        _rule("south_atlantic", "South Atlantic", region_subs=_subs("USA", "South Atlantic")),
        _rule("south_central", "South Central", region_subs=_subs("USA", "West South Central", "East South Central")),
        _rule("great_lakes_ontario", "Great Lakes & Ontario", region_subs=_subs("USA", "East North Central") | _subs("CAN", "Ontario")),
        _rule("northeast_quebec_maritimes", "Northeast, Quebec & Maritimes", region_subs=_subs(
            "USA", "New England", "Middle Atlantic",
        ) | _subs("CAN", "Quebec", "Atlantic Canada")),
        _rule("mountain_plains_prairies", "Mountain, Plains & Prairies", region_subs=_subs(
            "USA", "Mountain", "West North Central",
        ) | _subs("CAN", "Prairies")),
        _rule("pacific_british_columbia", "Pacific & British Columbia", region_subs=_subs("USA", "Pacific") | _subs("CAN", "British Columbia")),
    ),
    "southern_asia_east": (
        _rule("west_india", "West India", regions=_regions("IND", "West")),
        _rule("central_india", "Central India", regions=_regions("IND", "Central")),
        _rule("south_india_sri_lanka", "South India & Sri Lanka", regions=_regions("IND", "South")),
        _rule("south_india_sri_lanka", "South India & Sri Lanka", countries=frozenset({"LKA"})),
        _rule("north_east_india", "North & East India, Bangladesh, Nepal, Bhutan", regions=_regions(
            "IND", "North", "Northeast", "East",
        )),
        _rule("north_east_india", "North & East India, Bangladesh, Nepal, Bhutan", countries=frozenset({"BGD", "NPL", "BTN", "IND", "KAS"})),
    ),
    "central_asia": (
        _rule("eastern_uzbekistan", "Eastern Uzbekistan", countries=frozenset({"UZB"}), lon_min=67.500001),
        _rule("western_uzbekistan_turkmenistan", "Western Uzbekistan & Turkmenistan", countries=frozenset({"UZB", "TKM"})),
        _rule("kazakhstan", "Kazakhstan", countries=frozenset({"KAZ"})),
        _rule("kyrgyzstan_tajikistan", "Kyrgyzstan & Tajikistan", countries=frozenset({"KGZ", "TJK", "KAB"})),
    ),
    "central_america": (
        _rule("nw_mexico", "NW Mexico", iso_codes=frozenset({
            "MX-SON", "MX-BCN", "MX-BCS", "MX-CHH", "MX-SIN", "MX-COA", "MX-DUR", "MX-ZAC", "MX-NAY",
        })),
        _rule("ne_mexico", "NE Mexico", iso_codes=frozenset({"MX-TAM", "MX-NLE", "MX-SLP"})),
        _rule("central_mexico_bajio", "Central Mexico & Bajio", iso_codes=frozenset({
            "MX-AGU", "MX-GUA", "MX-QUE", "MX-HID", "MX-MEX", "MX-DIF", "MX-MOR", "MX-PUE", "MX-TLA", "MX-JAL", "MX-MIC", "MX-COL",
        })),
        _rule("southern_mexico_isthmus", "Southern Mexico & the isthmus", countries=frozenset({
            "MEX", "BLZ", "CRI", "GTM", "HND", "NIC", "PAN", "SLV",
        })),
    ),
    "northern_europe": (
        _rule("southern_britain", "Southern Britain", regions=_regions(
            "GBR", "East", "East Midlands", "Greater London", "South East", "South West", "West Midlands",
            "East Wales", "West Wales and the Valleys",
        )),
        _rule("northern_britain_ireland", "Northern Britain & Ireland", countries=frozenset({"GBR", "IRL"})),
        _rule("nordic_baltic", "Nordic & Baltic", countries=frozenset({
            "DNK", "FIN", "NOR", "SWE", "EST", "LVA", "LTU", "ISL", "FRO", "GGY", "IMN", "JEY", "ALD",
        })),
    ),
    "southern_africa": (
        _rule("gauteng", "Gauteng", iso_codes=frozenset({"ZA-GT"})),
        _rule("highveld", "Highveld", iso_codes=frozenset({"ZA-FS", "ZA-NW", "ZA-MP", "ZA-LP"})),
        _rule("east", "East", iso_codes=frozenset({"ZA-NL", "ZA-EC"})),
        _rule("cape_neighbours", "Cape & neighbours", countries=frozenset({"ZAF", "NAM", "BWA", "LSO", "SWZ"})),
    ),
    "libya_egypt_sudan": (
        _rule("libya", "Libya", countries=frozenset({"LBY"})),
        _rule("lower_egypt", "Lower Egypt", iso_codes=frozenset({
            "EG-DK", "EG-SHR", "EG-IS", "EG-DT", "EG-KFS", "EG-BH", "EG-ALX", "EG-C", "EG-MNF", "EG-KB",
            "EG-GH", "EG-PTS", "EG-GZ", "EG-FYM", "EG-SUZ", "EG-SIN", "EG-JS",
        })),
        _rule("upper_egypt_sudan", "Upper Egypt & Sudan", countries=frozenset({"EGY", "SDN", "BRT"})),
    ),
    "maghreb": (
        _rule("morocco", "Morocco", countries=frozenset({"MAR", "SAH"})),
        _rule("algeria", "Algeria", countries=frozenset({"DZA"})),
        _rule("tunisia", "Tunisia", countries=frozenset({"TUN"})),
    ),
    "west_africa_coast": (
        _rule("southwest_nigeria", "Southwest Nigeria", iso_codes=frozenset({
            "NG-LA", "NG-OG", "NG-OY", "NG-OS", "NG-ON", "NG-EK",
        })),
        _rule("rest_of_nigeria", "Rest of Nigeria", countries=frozenset({"NGA"})),
        _rule("ghana_togo_benin", "Ghana, Togo & Benin", countries=frozenset({"GHA", "TGO", "BEN"})),
        _rule("cote_divoire_to_senegal", "Cote d'Ivoire to Senegal", countries=frozenset({
            "CIV", "SEN", "SLE", "BFA", "GIN", "GNB", "GMB", "LBR",
        })),
    ),
    "eastern_europe": (
        _rule("volga_russia", "Volga Russia", regions=_regions("RUS", "Volga")),
        _rule("urals_siberia_far_east", "Urals, Siberia & Far East", regions=_regions("RUS", "Urals", "Siberian", "Far Eastern")),
        _rule("central_northwestern_russia", "Central & northwestern Russia", regions=_regions("RUS", "Central", "Northwestern")),
        _rule("ukraine_belarus_moldova", "Ukraine, Belarus & Moldova", countries=frozenset({"UKR", "BLR", "MDA"})),
        _rule("central_europe_danube", "Central Europe & the Danube", countries=frozenset({
            "POL", "CZE", "SVK", "HUN", "ROU", "BGR",
        })),
    ),
    "south_america": (
        _rule("southeast_brazil", "Southeast Brazil", iso_codes=frozenset({
            "BR-SP", "BR-RJ", "BR-MG", "BR-ES", "BR-PR", "BR-SC", "BR-RS",
        })),
        _rule("rest_of_brazil", "Rest of Brazil", countries=frozenset({"BRA"})),
        _rule("river_plate", "River Plate", countries=frozenset({"ARG", "URY", "PRY", "SPI"})),
        _rule("andes", "Andes", countries=frozenset({"CHL", "BOL", "PER", "ECU"})),
        _rule("venezuela_colombia_guianas", "Venezuela, Colombia & Guianas", countries=frozenset({
            "VEN", "COL", "GUY", "SUR", "FRA", "BRI",
        })),
    ),
    "south_eastern_asia": (
        _rule("thailand_myanmar", "Thailand & Myanmar", countries=frozenset({"THA", "MMR"})),
        _rule("indonesia_timor", "Indonesia & Timor-Leste", countries=frozenset({"IDN", "TLS"})),
        _rule("malaysia_singapore_brunei", "Malaysia, Singapore & Brunei", countries=frozenset({"MYS", "SGP", "BRN"})),
        _rule("philippines", "Philippines", countries=frozenset({"PHL"})),
        _rule("indochina", "Indochina", countries=frozenset({"KHM", "LAO", "VNM"})),
    ),
    "caribbean": (
        _rule("puerto_rico_virgin_islands", "Puerto Rico & Virgin Is.", countries=frozenset({"PRI", "VIR", "VGB"})),
        _rule("hispaniola", "Hispaniola", countries=frozenset({"DOM", "HTI"})),
        _rule("jamaica_bahamas", "Jamaica & Bahamas", countries=frozenset({"JAM", "BHS"})),
        _rule("cuba", "Cuba", countries=frozenset({"CUB"})),
        _rule("lesser_antilles_trinidad", "Lesser Antilles & Trinidad", countries=frozenset({
            "AIA", "ATG", "BRB", "CYM", "DMA", "GRD", "KNA", "LCA", "MSR", "TTO", "TCA", "VCT",
            "ABW", "CUW", "SXM", "MAF", "BLM", "FRA", "NLD", "USG", "SER", "BJN",
        })),
    ),
    "australia_new_zealand": (
        _rule("tasman", "Tasman (Victoria, Tasmania, NZ)", iso_codes=frozenset({"AU-VIC", "AU-TAS"})),
        _rule("tasman", "Tasman (Victoria, Tasmania, NZ)", countries=frozenset({"NZL"})),
        _rule("west_south", "West & South (WA, SA, NT)", iso_codes=frozenset({"AU-WA", "AU-SA", "AU-NT"})),
        _rule("new_south_wales_act", "New South Wales & ACT", iso_codes=frozenset({"AU-NSW", "AU-ACT", "AU-X02~"})),
        _rule("queensland", "Queensland", iso_codes=frozenset({"AU-QLD"})),
    ),
    "middle_africa_north": (
        _rule("northern_cameroon_chad", "Northern Cameroon & Chad", iso_codes=frozenset({"CM-EN", "CM-NO", "CM-AD"})),
        _rule("northern_cameroon_chad", "Northern Cameroon & Chad", countries=frozenset({"TCD"})),
        _rule("southern_cameroon", "Southern Cameroon", countries=frozenset({"CMR"})),
        _rule("gabon_equatorial_guinea", "Gabon & Equatorial Guinea", countries=frozenset({"GAB", "GNQ"})),
        _rule("central_african_republic", "Central African Republic", countries=frozenset({"CAF"})),
    ),
    "middle_africa_south": (
        _rule("katanga_kasai", "Katanga & Kasai", iso_codes=frozenset({"CD-KA", "CD-KW", "CD-KE"})),
        _rule("angola", "Angola", countries=frozenset({"AGO"})),
        _rule("northern_western_dr_congo", "Northern & western DR Congo, Congo", countries=frozenset({"COD", "COG"})),
    ),
    "southern_east_africa": (
        _rule("zambia", "Zambia", countries=frozenset({"ZMB"})),
        _rule("tanzania", "Tanzania", countries=frozenset({"TZA"})),
        _rule("mozambique_malawi", "Mozambique & Malawi", countries=frozenset({"MOZ", "MWI"})),
        _rule("zimbabwe", "Zimbabwe", countries=frozenset({"ZWE"})),
    ),
    "horn_and_great_lakes": (
        _rule("ethiopia", "Ethiopia", countries=frozenset({"ETH"})),
        _rule("kenya", "Kenya", countries=frozenset({"KEN"})),
        _rule("great_lakes_south_sudan", "Great Lakes & South Sudan", countries=frozenset({"UGA", "BDI", "RWA", "SDS"})),
        _rule("red_sea_somali_coast", "Red Sea & Somali coast", countries=frozenset({"ERI", "DJI", "SOM", "SOL"})),
    ),
}

# Countries that are not whole-country origins. Every other member country is a country origin.
ORIGIN_GRAIN: Final[dict[str, OriginGrain]] = {
    "eastern_asia": OriginGrain(admin1=frozenset({"CHN", "MNG"})),
    "western_europe": OriginGrain(admin1=frozenset({"AUT", "DEU"}), region=frozenset({"BEL", "FRA"})),
    "southern_europe": OriginGrain(
        admin1=frozenset({"GRC"}),
        region=frozenset({"BIH", "ITA", "PRT", "ESP"}),
    ),
    "western_asia_north": OriginGrain(admin1=frozenset({"GEO", "IRQ", "SYR", "TUR"}), region=frozenset({"AZE"})),
    "southern_asia_west": OriginGrain(admin1=frozenset({"AFG", "IRN", "PAK"})),
    "northern_america": OriginGrain(admin1=frozenset({"CAN", "USA"})),
    "southern_asia_east": OriginGrain(admin1=frozenset({"BGD", "IND", "NPL"}), region=frozenset({"BTN", "LKA"})),
    "central_asia": OriginGrain(admin1=frozenset({"KAZ", "KGZ", "TJK", "TKM", "UZB"})),
    "central_america": OriginGrain(admin1=frozenset({"CRI", "MEX"})),
    "northern_europe": OriginGrain(
        admin1=frozenset({"DNK", "FIN", "LTU", "NOR", "SWE"}),
        region=frozenset({"IRL", "LVA", "GBR"}),
    ),
    "southern_africa": OriginGrain(admin1=frozenset({"NAM", "ZAF"})),
    "libya_egypt_sudan": OriginGrain(admin1=frozenset({"LBY", "SDN"})),
    "maghreb": OriginGrain(admin1=frozenset({"MAR"})),
    "west_africa_coast": OriginGrain(
        admin1=frozenset({"CIV", "GHA", "NGA", "SEN", "SLE", "TGO"}),
        region=frozenset({"BFA", "GIN", "GNB"}),
    ),
    "eastern_europe": OriginGrain(admin1=frozenset({"RUS"})),
    "south_america": OriginGrain(admin1=frozenset({"ARG", "BOL", "BRA"})),
    "south_eastern_asia": OriginGrain(region=frozenset({"THA"})),
    "caribbean": OriginGrain(admin1=frozenset({"CUB"})),
    "australia_new_zealand": OriginGrain(admin1=frozenset({"AUS"}), region=frozenset({"NZL"})),
    "middle_africa_north": OriginGrain(admin1=frozenset({"CMR", "CAF", "TCD", "GAB"})),
    "middle_africa_south": OriginGrain(admin1=frozenset({"AGO", "COG", "COD"})),
    "southern_east_africa": OriginGrain(admin1=frozenset({"MOZ", "TZA", "ZMB", "ZWE"}), region=frozenset({"MWI"})),
    "horn_and_great_lakes": OriginGrain(
        admin1=frozenset({"ERI", "ETH", "KEN", "SDS", "SOM"}),
        region=frozenset({"UGA"}),
    ),
}


def _bounds_hold(rule: SideGroupRule, area: AdminArea) -> bool:
    """
    Why this exists:
        Apply an optional centroid box.
    When to use:
        From rule matching.
    What to expect:
        True when every set edge contains the centroid. An unset edge does not constrain.
    """

    if rule.lat_min is not None and area.latitude < rule.lat_min:
        return False
    if rule.lat_max is not None and area.latitude > rule.lat_max:
        return False
    if rule.lon_min is not None and area.longitude < rule.lon_min:
        return False
    if rule.lon_max is not None and area.longitude > rule.lon_max:
        return False
    return True


def _rule_matches(rule: SideGroupRule, area: AdminArea) -> bool:
    """
    Why this exists:
        Decide whether one province satisfies every constraint on a rule.
    When to use:
        While scanning rules in order.
    What to expect:
        False when any set constraint misses. A rule with no constraints does not match.
    """

    constrained = False
    if rule.countries:
        constrained = True
        if area.adm0_a3 not in rule.countries:
            return False
    if rule.regions:
        constrained = True
        if (area.adm0_a3, fold_name(area.region)) not in rule.regions:
            return False
    if rule.region_subs:
        constrained = True
        if (area.adm0_a3, fold_name(area.region_sub)) not in rule.region_subs:
            return False
    if rule.iso_codes:
        constrained = True
        if area.iso_3166_2 not in rule.iso_codes:
            return False
    if rule.missing_region:
        constrained = True
        if area.region:
            return False
    if rule.lat_min is not None or rule.lat_max is not None or rule.lon_min is not None or rule.lon_max is not None:
        constrained = True
        if not _bounds_hold(rule, area):
            return False
    return constrained


def side_group_for(region_id: str, area: AdminArea) -> SideGroupRule:
    """
    Why this exists:
        Resolve the side group for one province on one map.
    When to use:
        For every member province that covers tactical land.
    What to expect:
        The first matching rule.
    Exceptions:
        ``ValueError`` when the map is unknown or the province matches no rule.
    """

    LOGGER.debug(
        "side_group_for region=%s adm0=%s iso=%s name=%s.",
        region_id,
        area.adm0_a3,
        area.iso_3166_2,
        area.name,
    )
    rules = SIDE_GROUP_RULES.get(region_id)
    if rules is None:
        raise ValueError(f"No side-group rules for {region_id}.")
    for rule in rules:
        if _rule_matches(rule, area):
            return rule
    raise ValueError(
        f"{region_id}: no side group for {area.adm0_a3} {area.iso_3166_2} {area.name!r} "
        f"region={area.region!r} sub={area.region_sub!r} lat={area.latitude} lon={area.longitude}."
    )


def origin_level_for(region_id: str, adm0_a3: str) -> OriginLevel:
    """
    Why this exists:
        Choose admin-1, region, or country as the origin grain.
    When to use:
        After a tactical cell has a winning province.
    What to expect:
        ``admin1``, ``region``, or ``country``. An unknown map returns ``country``.
    """

    LOGGER.debug("origin_level_for region=%s adm0=%s.", region_id, adm0_a3)
    grain = ORIGIN_GRAIN.get(region_id, OriginGrain())
    if adm0_a3 in grain.admin1:
        return "admin1"
    if adm0_a3 in grain.region:
        return "region"
    return "country"


def origin_identity(region_id: str, area: AdminArea) -> tuple[str, str, str | None]:
    """
    Why this exists:
        Build the origin id, display name, and optional ISO 3166-2 code for a province.
    When to use:
        When a tactical cell's winning province is known.
    What to expect:
        Admin-1 ids are the ISO 3166-2 code. Region ids are ``ISO2:region name``.
        Country ids are the alpha-2 code. The third value is the ISO 3166-2 code only for admin-1 origins.
    Exceptions:
        ``ValueError`` when the grain needs a code or region name that is missing.
    """

    LOGGER.debug("origin_identity region=%s adm0=%s iso=%s.", region_id, area.adm0_a3, area.iso_3166_2)
    level = origin_level_for(region_id, area.adm0_a3)
    if level == "admin1":
        if not area.iso_3166_2:
            raise ValueError(f"{region_id}: {area.name!r} has no iso_3166_2.")
        return area.iso_3166_2, area.name, area.iso_3166_2
    if level == "region":
        if not area.country_code:
            raise ValueError(f"{region_id}: {area.adm0_a3} has no country code.")
        if not area.region:
            if area.iso_3166_2:
                return area.iso_3166_2, area.name, area.iso_3166_2
            return area.country_code, area.name, None
        return f"{area.country_code}:{area.region}", area.region, None
    if not area.country_code:
        raise ValueError(f"{region_id}: {area.adm0_a3} has no country code.")
    return area.country_code, area.country_code, None


def groups_for_region(region_id: str) -> tuple[SideGroupRule, ...]:
    """
    Why this exists:
        List each side group once, in catalog order.
    When to use:
        When writing the manifest ``side_groups`` array.
    What to expect:
        One rule per distinct group id. Later duplicate ids are omitted.
    Exceptions:
        ``ValueError`` when the map is unknown.
    """

    LOGGER.debug("groups_for_region region=%s.", region_id)
    rules = SIDE_GROUP_RULES.get(region_id)
    if rules is None:
        raise ValueError(f"No side-group rules for {region_id}.")
    seen: set[str] = set()
    unique: list[SideGroupRule] = []
    for rule in rules:
        if rule.group_id in seen:
            continue
        seen.add(rule.group_id)
        unique.append(rule)
    return tuple(unique)
