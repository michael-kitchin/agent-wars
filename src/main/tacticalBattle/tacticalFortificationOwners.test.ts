/**
 * Owner record for fortified cells in a battle footprint.
 *
 * Purpose: Placement and drawing use the controller of each fortified cell's parent hex.
 * When to use: After changing `buildTacticalFortificationOwnerRecord`.
 * Expected outcome: Core and margin cells map to their parents. Unfortified rows and unknown controllers are left out.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TacticalFeatureOverrideRow } from '../gameDb/controlInfrastructure';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { buildTacticalFortificationOwnerRecord } from './tacticalFortificationOwners';

/**
 * Builds one feature row for an owner-record case.
 *
 * Purpose: The record only reads the cell, its parent, and whether it is fortified.
 * When to use: Inside this file's cases.
 * Expected outcome: An urban row with the given fortification flag.
 * Exceptions: None.
 */
function featureRow(h3Index: string, parentH3Index: string, isFortified: boolean): TacticalFeatureOverrideRow {
  return {
    h3Index,
    parentH3Index,
    terrainKind: 'urban',
    isUrban: true,
    isAirport: false,
    isSeaport: false,
    isRubble: false,
    isFortified,
  };
}

test('core and margin fortified cells map to their parent controllers', () => {
  const record = buildTacticalFortificationOwnerRecord({
    rows: [
      featureRow('core', 'home', true),
      featureRow('margin', 'neighbor', true),
      featureRow('plain', 'home', false),
      featureRow('outside', 'home', true),
      featureRow('orphan', 'unowned', true),
    ],
    footprint: ['core', 'margin', 'plain', 'orphan'],
    controllerOf: (strategicH3) => {
      if (strategicH3 === 'home') return HUMAN_SEAT_ID;
      if (strategicH3 === 'neighbor') return AI_SEAT_IDS[0];
      return 'not-a-seat';
    },
  });
  assert.deepEqual(record, { core: HUMAN_SEAT_ID, margin: AI_SEAT_IDS[0] });
});
