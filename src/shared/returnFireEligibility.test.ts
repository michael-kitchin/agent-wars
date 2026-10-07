/**
 * Unit tests for return-fire planning-parity eligibility. Run with:
 * `node dist/shared/returnFireEligibility.test.js` (or the project's usual shared test runner).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gridDisk, gridDistance, gridPathCells, latLngToCell } from 'h3-js';
import {
  canDefenderReturnFireAtAttackerHex,
  type ReturnFireEligibilityContext,
} from './returnFireEligibility';
import { AIR_STRIKE_RANGE_HEXES } from './tacticalRanges';

/**
 * Tactical cell from lat/lng for tactical fixtures.
 *
 * Purpose: Avoid hard-coded H3 literals in eligibility cases.
 * When to use: Inside this test file only.
 * Expected outcome: Valid tactical index.
 * Exceptions: None for Earth-range test coordinates.
 */
function tacticalIndex(lat: number, lng: number): string {
  return latLngToCell(lat, lng, 4);
}

/**
 * First ring-1 neighbor of a tactical cell.
 *
 * Purpose: Stable distance-1 pair for LOS / range cases.
 * When to use: Mountain and adjacent tactical fixtures.
 * Expected outcome: Distinct neighbor string.
 * Exceptions: Throws when disk has no other cell.
 */
function neighborOf(center: string): string {
  const n = [...gridDisk(center, 1)].find((h) => h !== center);
  if (!n) throw new Error('expected ring-1 neighbor');
  return n;
}

/**
 * Strategic strategic cell used for distance fixtures.
 *
 * Purpose: Strategic range cases need valid H3 pairs.
 * When to use: Strategic theater tests.
 * Expected outcome: Valid strategic index.
 * Exceptions: None.
 */
function strategic(lat: number, lng: number): string {
  return latLngToCell(lat, lng, 1);
}

describe('canDefenderReturnFireAtAttackerHex', () => {
  it('denies strategic infantry at distance 1', () => {
    const defenderHex = strategic(40, -106);
    const attackerHex = [...gridDisk(defenderHex, 1)].find((h) => h !== defenderHex)!;
    const ctx: ReturnFireEligibilityContext = { theater: 'strategic' };
    assert.equal(
      canDefenderReturnFireAtAttackerHex({ unitType: 'infantry', h3Index: defenderHex }, attackerHex, ctx),
      false
    );
  });

  it('allows strategic armor at distance 1', () => {
    const defenderHex = strategic(40, -105);
    const attackerHex = [...gridDisk(defenderHex, 1)].find((h) => h !== defenderHex)!;
    const ctx: ReturnFireEligibilityContext = { theater: 'strategic' };
    assert.equal(
      canDefenderReturnFireAtAttackerHex({ unitType: 'armor', h3Index: defenderHex }, attackerHex, ctx),
      true
    );
  });

  it('denies strategic naval at distance 3', () => {
    const defenderHex = strategic(41, -104);
    const far = [...gridDisk(defenderHex, 3)].find((h) => {
      try {
        return gridDistance(defenderHex, h) === 3;
      } catch {
        return false;
      }
    });
    assert.ok(far);
    const ctx: ReturnFireEligibilityContext = { theater: 'strategic' };
    assert.equal(
      canDefenderReturnFireAtAttackerHex({ unitType: 'naval', h3Index: defenderHex }, far!, ctx),
      false
    );
  });

  it('allows strategic air within strike range with airport', () => {
    const defenderHex = strategic(42, -103);
    const attackerHex = [...gridDisk(defenderHex, 1)].find((h) => h !== defenderHex)!;
    const ctx: ReturnFireEligibilityContext = {
      theater: 'strategic',
      hasIntactAirportAtAirBase: () => true,
    };
    assert.equal(
      canDefenderReturnFireAtAttackerHex({ unitType: 'air', h3Index: defenderHex }, attackerHex, ctx),
      true
    );
  });

  it('denies strategic air within strike range without airport', () => {
    const defenderHex = strategic(42, -102);
    const attackerHex = [...gridDisk(defenderHex, 1)].find((h) => h !== defenderHex)!;
    const ctx: ReturnFireEligibilityContext = {
      theater: 'strategic',
      hasIntactAirportAtAirBase: () => false,
    };
    assert.equal(
      canDefenderReturnFireAtAttackerHex({ unitType: 'air', h3Index: defenderHex }, attackerHex, ctx),
      false
    );
  });

  it('denies strategic air when airport callback is omitted', () => {
    const defenderHex = strategic(42, -101);
    const attackerHex = [...gridDisk(defenderHex, 1)].find((h) => h !== defenderHex)!;
    assert.equal(
      canDefenderReturnFireAtAttackerHex(
        { unitType: 'air', h3Index: defenderHex },
        attackerHex,
        { theater: 'strategic' }
      ),
      false
    );
  });

  it('denies strategic air beyond strike range even with airport', () => {
    const defenderHex = strategic(43, -100);
    const far = [...gridDisk(defenderHex, AIR_STRIKE_RANGE_HEXES + 1)].find((h) => {
      try {
        return gridDistance(defenderHex, h) > AIR_STRIKE_RANGE_HEXES;
      } catch {
        return false;
      }
    });
    assert.ok(far);
    const ctx: ReturnFireEligibilityContext = {
      theater: 'strategic',
      hasIntactAirportAtAirBase: () => true,
    };
    assert.equal(
      canDefenderReturnFireAtAttackerHex({ unitType: 'air', h3Index: defenderHex }, far!, ctx),
      false
    );
  });

  it('allows tactical armor at distance 2 on clear plains (reach expansion)', () => {
    const a = tacticalIndex(46, 56);
    const disk2 = [...gridDisk(a, 2)].filter((h) => h !== a);
    const at2 = disk2.find((h) => {
      try {
        return gridDistance(a, h) === 2;
      } catch {
        return false;
      }
    });
    assert.ok(at2);
    const footprint = new Set([a, at2!, ...disk2]);
    const battle = {
      strategicHexTerrain: 'land' as const,
      strategicHexTerrainKind: 'plains',
      tacticalTerrainKindByH3: { [a]: 'plains', [at2!]: 'plains' },
    };
    const ctx: ReturnFireEligibilityContext = {
      theater: 'tactical',
      tacticalBattle: battle,
      tacticalFootprint: footprint,
    };
    assert.equal(
      canDefenderReturnFireAtAttackerHex({ unitType: 'armor', h3Index: a }, at2!, ctx),
      true
    );
  });

  it('denies tactical armor at distance 2 when forest caps range to 1', () => {
    const a = tacticalIndex(47, 57);
    const disk2 = [...gridDisk(a, 2)].filter((h) => h !== a);
    const at2 = disk2.find((h) => {
      try {
        return gridDistance(a, h) === 2;
      } catch {
        return false;
      }
    });
    assert.ok(at2);
    const footprint = new Set([a, at2!, ...disk2]);
    const battle = {
      strategicHexTerrain: 'land' as const,
      strategicHexTerrainKind: 'plains',
      tacticalTerrainKindByH3: { [a]: 'forest', [at2!]: 'plains' },
    };
    const ctx: ReturnFireEligibilityContext = {
      theater: 'tactical',
      tacticalBattle: battle,
      tacticalFootprint: footprint,
    };
    assert.equal(
      canDefenderReturnFireAtAttackerHex({ unitType: 'armor', h3Index: a }, at2!, ctx),
      false
    );
  });

  it('denies tactical armor/naval when mountain blocks LOS; allows infantry', () => {
    const a = tacticalIndex(48, 58);
    const b = neighborOf(a);
    const footprint = new Set([a, b]);
    const battle = {
      strategicHexTerrain: 'land' as const,
      strategicHexTerrainKind: 'plains',
      tacticalTerrainKindByH3: { [a]: 'plains', [b]: 'mountain' },
    };
    assert.ok(gridPathCells(a, b).length >= 1);
    const ctx: ReturnFireEligibilityContext = {
      theater: 'tactical',
      tacticalBattle: battle,
      tacticalFootprint: footprint,
    };
    assert.equal(canDefenderReturnFireAtAttackerHex({ unitType: 'armor', h3Index: a }, b, ctx), false);
    assert.equal(canDefenderReturnFireAtAttackerHex({ unitType: 'naval', h3Index: a }, b, ctx), false);
    assert.equal(canDefenderReturnFireAtAttackerHex({ unitType: 'infantry', h3Index: a }, b, ctx), true);
  });

  it('denies tactical ground when battle or footprint is missing', () => {
    const a = tacticalIndex(49, 59);
    const b = neighborOf(a);
    assert.equal(
      canDefenderReturnFireAtAttackerHex({ unitType: 'armor', h3Index: a }, b, { theater: 'tactical' }),
      false
    );
    assert.equal(
      canDefenderReturnFireAtAttackerHex(
        { unitType: 'armor', h3Index: a },
        b,
        {
          theater: 'tactical',
          tacticalBattle: {
            strategicHexTerrain: 'land',
            strategicHexTerrainKind: 'plains',
            tacticalTerrainKindByH3: { [a]: 'plains' },
          },
        }
      ),
      false
    );
  });

  it('allows tactical air with airport even when mountain would block ranged-mode air', () => {
    const a = tacticalIndex(50, 60);
    const b = neighborOf(a);
    const battle = {
      strategicHexTerrain: 'land' as const,
      strategicHexTerrainKind: 'plains',
      tacticalTerrainKindByH3: { [a]: 'plains', [b]: 'mountain' },
    };
    const ctx: ReturnFireEligibilityContext = {
      theater: 'tactical',
      hasIntactAirportAtAirBase: () => true,
      tacticalBattle: battle,
      tacticalFootprint: new Set([a, b]),
    };
    assert.equal(canDefenderReturnFireAtAttackerHex({ unitType: 'air', h3Index: a }, b, ctx), true);
  });

  it('denies tactical air without airport', () => {
    const a = tacticalIndex(51, 61);
    const b = neighborOf(a);
    const ctx: ReturnFireEligibilityContext = {
      theater: 'tactical',
      hasIntactAirportAtAirBase: () => false,
    };
    assert.equal(canDefenderReturnFireAtAttackerHex({ unitType: 'air', h3Index: a }, b, ctx), false);
  });

  it('denies air when airport callback throws', () => {
    const defenderHex = strategic(42, -99);
    const attackerHex = [...gridDisk(defenderHex, 1)].find((h) => h !== defenderHex)!;
    assert.equal(
      canDefenderReturnFireAtAttackerHex(
        { unitType: 'air', h3Index: defenderHex },
        attackerHex,
        {
          theater: 'strategic',
          hasIntactAirportAtAirBase: () => {
            throw new Error('infra unavailable');
          },
        }
      ),
      false
    );
  });
});
