/**
 * The contact lines for hexes a commander shares with a pact partner.
 *
 * Purpose: A shared hex means fighting at the end of the turn, so the lines must name the right sides and hexes.
 * When to use: `npm run build:main`, then `node dist/main/sideAgreements/pactContactLines.test.js`.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import { formatPactContactLines, sharedHexesWithPactPartners } from './pactContactLines';

const OWN = AI_SEAT_IDS[0];
const PARTNER = AI_SEAT_IDS[1];
const STRANGER = AI_SEAT_IDS[2];

/**
 * The shared hexes of the own seat with one partner.
 *
 * Purpose: Every case uses the same own seat and partner set.
 * When to use: The sharing cases.
 * Expected outcome: The map from `sharedHexesWithPactPartners`.
 * Exceptions: None.
 */
function shared(
  units: readonly { readonly player: string; readonly h3Index: string; readonly embarkedOnCarrierUnitId?: string }[]
): ReadonlyMap<string, readonly string[]> {
  return sharedHexesWithPactPartners({ ownSeatId: OWN, partnerSeatIds: new Set([PARTNER]), units });
}

/**
 * The contact text for the partner's hexes, with each hex as its own code except those starting `x`.
 *
 * Purpose: The format cases choose which hexes have a code.
 * When to use: The format cases.
 * Expected outcome: The text, or null.
 * Exceptions: None.
 */
function format(sharedByPartner: ReadonlyMap<string, readonly string[]>): string | null {
  return formatPactContactLines({
    sharedByPartner,
    sideName: () => 'Iberia (a2)',
    hexCode: (h3Index) => (h3Index.startsWith('x') ? null : h3Index.toUpperCase()),
  });
}

test('a hex with an own unit and a partner unit is reported for that partner, in string order', () => {
  const result = shared([
    { player: OWN, h3Index: 'h2' },
    { player: PARTNER, h3Index: 'h2' },
    { player: OWN, h3Index: 'h1' },
    { player: PARTNER, h3Index: 'h1' },
    { player: PARTNER, h3Index: 'h3' },
  ]);
  assert.deepEqual([...result], [[PARTNER, ['h1', 'h2']]]);
});

test('a hex shared with a side that is not a partner is not reported', () => {
  assert.equal(shared([{ player: OWN, h3Index: 'h1' }, { player: STRANGER, h3Index: 'h1' }]).size, 0);
});

test('an embarked unit does not make a hex shared', () => {
  const result = shared([
    { player: OWN, h3Index: 'h1' },
    { player: PARTNER, h3Index: 'h1', embarkedOnCarrierUnitId: 'carrier' },
  ]);
  assert.equal(result.size, 0);
});

test('nothing shared gives no text', () => {
  assert.equal(format(new Map()), null);
  assert.equal(format(new Map([[PARTNER, ['x1']]])), null);
});

test('one partner prints the heading and one line, leaving out a hex with no code', () => {
  assert.equal(
    format(new Map([[PARTNER, ['h1', 'x1', 'h2']]])),
    [
      'Contact with sides you have an active agreement with:',
      '- Iberia (a2): your units and theirs are both in H1, H2. Units in the same hex fight at the end of every turn until one side leaves.',
    ].join('\n')
  );
});

test('a long list stops at six codes and counts the rest', () => {
  const hexes = Array.from({ length: 8 }, (_, index) => `h${index + 1}`);
  assert.ok(format(new Map([[PARTNER, hexes]]))?.includes('both in H1, H2, H3, H4, H5, H6 and 2 more.'));
});
