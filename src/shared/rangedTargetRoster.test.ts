/**
 * Roster lines for the ranged-attack effects tooltip.
 *
 * Purpose: The tooltip names opponent units with the same collapse rule as a turn-update loss line.
 * When to use: After changing `buildRangedTargetRosterLines` or the loss-entry split it uses.
 * Expected outcome: Named tokens under the cap, one group past it, and no line for the human or Neutral.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AI_SEAT_KIND, HUMAN_SEAT_KIND } from './seatRoster';
import { HUMAN_SEAT_ID, NEUTRAL_OWNER_ID } from './seatIds';
import { buildRangedTargetRosterLines, type RangedTargetRosterSeat } from './rangedTargetRoster';

/**
 * One seat row the roster builder can name.
 *
 * Purpose: Keeps each test focused on units rather than nickname fields.
 * When to use: Roster fixtures.
 * Expected outcome: An AI seat uses its nickname. A human seat uses the human kind.
 * Exceptions: None.
 */
function seat(seatId: string, seatOrder: number, kind: RangedTargetRosterSeat['kind'] = AI_SEAT_KIND): RangedTargetRosterSeat {
  return { seatId, seatOrder, nickname: seatId === HUMAN_SEAT_ID ? null : `Nick ${seatId}`, homeRegion: 'Home', kind };
}

describe('buildRangedTargetRosterLines', () => {
  it('names three infantry and collapses four', () => {
    const seats = [seat('opponent', 2)];
    const three = buildRangedTargetRosterLines({
      seats,
      defenders: [1, 2, 3].map((n) => ({
        unitId: `inf-${n}`,
        seatId: 'opponent',
        unitType: 'infantry',
        displayName: `${n} Infantry`,
      })),
    });
    assert.equal(three.length, 1);
    assert.deepEqual(
      three[0]?.tokens.map((token) => token.kind === 'unit' ? token.displayName : token.text),
      ['1 Infantry', '2 Infantry', '3 Infantry']
    );
    const four = buildRangedTargetRosterLines({
      seats,
      defenders: [1, 2, 3, 4].map((n) => ({
        unitId: `inf-${n}`,
        seatId: 'opponent',
        unitType: 'infantry',
        displayName: `${n} Infantry`,
      })),
    });
    assert.deepEqual(four[0]?.tokens, [{ kind: 'group', unitType: 'infantry', count: 4, text: '4x Infantry' }]);
  });

  it('orders opponent seats by seat order and skips the human and Neutral', () => {
    const lines = buildRangedTargetRosterLines({
      seats: [seat('opponent2', 3), seat('opponent', 2), seat(HUMAN_SEAT_ID, 1, HUMAN_SEAT_KIND)],
      defenders: [
        { unitId: 'late', seatId: 'opponent2', unitType: 'armor', displayName: 'II Armored' },
        { unitId: 'early', seatId: 'opponent', unitType: 'naval', displayName: 'I Naval' },
        { unitId: 'mine', seatId: HUMAN_SEAT_ID, unitType: 'infantry', displayName: '1st Infantry' },
        { unitId: 'parked', seatId: NEUTRAL_OWNER_ID, unitType: 'infantry', displayName: '3rd Infantry' },
      ],
    });
    assert.deepEqual(lines.map((line) => line.seatId), ['opponent', 'opponent2']);
    assert.equal(lines[0]?.nickname, 'Nick opponent');
    assert.equal(lines[1]?.tokens[0]?.kind, 'unit');
  });

  it('lists named units in group order and puts a collapsed type after them', () => {
    const lines = buildRangedTargetRosterLines({
      seats: [seat('opponent', 2)],
      defenders: [
        { unitId: 'inf-1', seatId: 'opponent', unitType: 'infantry', displayName: 'IV Infantry' },
        { unitId: 'air-1', seatId: 'opponent', unitType: 'air', displayName: 'II Air' },
        { unitId: 'nav-1', seatId: 'opponent', unitType: 'naval', displayName: 'I Naval' },
        { unitId: 'inf-2', seatId: 'opponent', unitType: 'infantry', displayName: 'I Infantry' },
        { unitId: 'inf-3', seatId: 'opponent', unitType: 'infantry', displayName: 'II Infantry' },
        { unitId: 'inf-4', seatId: 'opponent', unitType: 'infantry', displayName: 'III Infantry' },
      ],
    });
    assert.deepEqual(
      lines[0]?.tokens.map((token) => token.kind === 'unit' ? token.displayName : token.text),
      ['I Naval', 'II Air', '4x Infantry']
    );
  });

  it('returns no lines when no defenders are passed', () => {
    assert.deepEqual(buildRangedTargetRosterLines({ seats: [seat('opponent', 2)], defenders: [] }), []);
  });
});
