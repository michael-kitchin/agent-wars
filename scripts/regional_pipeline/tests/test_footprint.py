"""Footprint roles for synthetic cells around one resolution-3 disk."""

from __future__ import annotations

import unittest

import h3

from scripts.regional_pipeline.footprint import CandidateCell, classify_footprint
from scripts.regional_pipeline.region_models import CentroidBox, FootprintTargets, HexRole, MemberUnit, RegionDefinition


def _definition(**overrides: object) -> RegionDefinition:
    values: dict[str, object] = {
        "region_id": "sample",
        "display_name": "Sample",
        "strategic_resolution": 3,
        "tactical_resolution": 6,
        "members": (MemberUnit(adm0_a3="DEU"),),
        "centroid_box": CentroidBox(lat_min=40, lat_max=55, lon_min=0, lon_max=15),
        "sea_reach_km": 0.0,
        "neutral_reach_km": 0.0,
        "desert_trim_reach_km": None,
        "targets": FootprintTargets(land=1, sea=0, neutral_border=0),
    }
    values.update(overrides)
    return RegionDefinition(**values)  # type: ignore[arg-type]


def _cell(
    cell: str,
    *,
    land: float,
    member: float,
    settled: bool,
    in_box: bool = True,
    major_land_km2: float = 1_000_000.0,
) -> CandidateCell:
    lat, lng = h3.cell_to_latlng(cell)
    area = h3.cell_area(cell, unit="km^2")
    return CandidateCell(
        h3_index=cell,
        lat=lat,
        lng=lng,
        in_box=in_box,
        land_km2=land,
        member_km2=member,
        cell_area_km2=area,
        settled=settled,
        major_land_km2=major_land_km2,
    )


class FootprintTests(unittest.TestCase):
    def setUp(self) -> None:
        origin = h3.latlng_to_cell(48.0, 8.0, 3)
        self.cells = h3.grid_disk(origin, 4)
        self.origin = origin
        self.ring1 = next(cell for cell in h3.grid_ring(origin, 1))
        self.ring2 = next(cell for cell in h3.grid_ring(origin, 2))
        self.ring3 = next(cell for cell in h3.grid_ring(origin, 3))
        self.ring4 = next(cell for cell in h3.grid_ring(origin, 4))

    def test_member_share_keeps_or_drops_land(self) -> None:
        area = h3.cell_area(self.origin, unit="km^2")
        kept = _cell(self.origin, land=area, member=0.6 * area, settled=True)
        dropped = _cell(self.ring4, land=area, member=0.4 * area, settled=True)
        roles = classify_footprint(_definition(), [kept, dropped]).roles
        self.assertEqual(HexRole.LAND, roles[self.origin])
        self.assertNotIn(self.ring4, roles)

    def test_sea_reach_includes_nearby_water(self) -> None:
        area = h3.cell_area(self.origin, unit="km^2")
        land = _cell(self.origin, land=area, member=area, settled=True)
        water = _cell(self.ring1, land=0.0, member=0.0, settled=False)
        near = classify_footprint(_definition(sea_reach_km=200.0), [land, water]).roles
        self.assertEqual(HexRole.SEA, near[self.ring1])

    def test_two_sea_rings_include_water_when_the_kilometre_reach_is_zero(self) -> None:
        area = h3.cell_area(self.origin, unit="km^2")
        land = _cell(self.origin, land=area, member=area, settled=True)
        ring1 = _cell(self.ring1, land=0.0, member=0.0, settled=False)
        ring2 = _cell(self.ring2, land=0.0, member=0.0, settled=False)
        ring3 = _cell(self.ring3, land=0.0, member=0.0, settled=False)
        roles = classify_footprint(_definition(sea_reach_km=0.0), [land, ring1, ring2, ring3]).roles
        self.assertEqual(HexRole.SEA, roles[self.ring1])
        self.assertEqual(HexRole.SEA, roles[self.ring2])
        self.assertNotIn(self.ring3, roles)

    def test_long_sea_reach_includes_water_beyond_two_rings(self) -> None:
        area = h3.cell_area(self.origin, unit="km^2")
        land = _cell(self.origin, land=area, member=area, settled=True)
        far_water = _cell(self.ring4, land=0.0, member=0.0, settled=False)
        roles = classify_footprint(_definition(sea_reach_km=800.0), [land, far_water]).roles
        self.assertEqual(HexRole.SEA, roles[self.ring4])

    def test_sea_ring_covers_a_minor_island_and_not_major_land(self) -> None:
        area = h3.cell_area(self.origin, unit="km^2")
        land = _cell(self.origin, land=area, member=area, settled=True)
        major = _cell(self.ring1, land=area, member=0.0, settled=True)
        minor = _cell(self.ring2, land=area, member=0.0, settled=True, major_land_km2=0.0)
        roles = classify_footprint(_definition(sea_reach_km=0.0), [land, major, minor]).roles
        self.assertNotIn(self.ring1, roles)
        self.assertEqual(HexRole.SEA, roles[self.ring2])

    def test_sea_ring_keeps_an_existing_neutral_border(self) -> None:
        area = h3.cell_area(self.origin, unit="km^2")
        land = _cell(self.origin, land=area, member=area, settled=True)
        other = _cell(self.ring1, land=area, member=0.0, settled=True, major_land_km2=0.0)
        roles = classify_footprint(_definition(neutral_reach_km=200.0), [land, other]).roles
        self.assertEqual(HexRole.NEUTRAL_BORDER, roles[self.ring1])

    def test_sea_ring_includes_water_outside_the_centroid_box(self) -> None:
        area = h3.cell_area(self.origin, unit="km^2")
        land = _cell(self.origin, land=area, member=area, settled=True)
        outside = _cell(self.ring1, land=0.0, member=0.0, settled=False, in_box=False)
        roles = classify_footprint(_definition(sea_reach_km=0.0), [land, outside]).roles
        self.assertEqual(HexRole.SEA, roles[self.ring1])

    def test_neutral_reach_includes_nearby_other_land(self) -> None:
        area = h3.cell_area(self.origin, unit="km^2")
        land = _cell(self.origin, land=area, member=area, settled=True)
        other = _cell(self.ring1, land=area, member=0.0, settled=True)
        near = classify_footprint(_definition(neutral_reach_km=200.0), [land, other]).roles
        far = classify_footprint(_definition(neutral_reach_km=0.0), [land, other]).roles
        self.assertEqual(HexRole.NEUTRAL_BORDER, near[self.ring1])
        self.assertNotIn(self.ring1, far)

    def test_cell_outside_the_box_has_no_role(self) -> None:
        area = h3.cell_area(self.origin, unit="km^2")
        inside = _cell(self.origin, land=area, member=area, settled=True)
        outside = _cell(self.ring1, land=area, member=area, settled=True, in_box=False)
        roles = classify_footprint(_definition(), [inside, outside]).roles
        self.assertNotIn(self.ring1, roles)

    def test_desert_trim_drops_distant_unsettled_land(self) -> None:
        area = h3.cell_area(self.origin, unit="km^2")
        settled = _cell(self.origin, land=area, member=area, settled=True)
        remote = _cell(self.ring4, land=area, member=area, settled=False)
        roles = classify_footprint(_definition(desert_trim_reach_km=150.0), [settled, remote]).roles
        self.assertEqual(HexRole.LAND, roles[self.origin])
        self.assertNotIn(self.ring4, roles)

    def test_no_member_land_raises(self) -> None:
        water = _cell(self.origin, land=0.0, member=0.0, settled=False)
        with self.assertRaises(ValueError):
            classify_footprint(_definition(), [water])
