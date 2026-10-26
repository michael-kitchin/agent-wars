import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type SeatId } from './seatIds';
import {
  type SeatRecord,
  activeAiSeatIds,
  enemySeatIdsOf,
  shortSideName,
  toSeatSnapshot,
} from './seatRoster';

/**
 * Builds a seat row for roster helper tests.
 *
 * Purpose: The cases only vary id, order, kind, and knockout. The rest stays empty.
 * When to use: Inside this file.
 * Expected outcome: An active seat unless `outTurn` is passed.
 * Exceptions: None.
 */
function seat(partial: Pick<SeatRecord, 'seatId' | 'seatOrder' | 'kind'> & Partial<SeatRecord>): SeatRecord {
  return {
    homeRegion: partial.seatId,
    commander: partial.kind === 'ai'
      ? { modelId: null, reasoningEffort: null, doctrineChoice: 'balanced', hasApiKey: false, doctrine: 'balanced' }
      : null,
    outTurn: null,
    outBy: null,
    outReasons: [],
    place: null,
    consultationCount: 0,
    costUsd: 0,
    ...partial,
  };
}

describe('activeAiSeatIds', () => {
  it('returns active AI seats in seat order', () => {
    const seats = [
      seat({ seatId: 'human', seatOrder: 1, kind: 'human' }),
      seat({ seatId: 'opponent2', seatOrder: 3, kind: 'ai' }),
      seat({ seatId: 'opponent', seatOrder: 2, kind: 'ai' }),
      seat({ seatId: 'opponent3', seatOrder: 4, kind: 'ai', outTurn: 5 }),
    ];
    assert.deepEqual(activeAiSeatIds(seats), ['opponent', 'opponent2']);
  });
});

describe('shortSideName', () => {
  it('cuts at the first separator and shortens a leading compass word', () => {
    assert.equal(shortSideName('Western Turkey'), 'W. Turkey');
    assert.equal(shortSideName('Eastern Turkey & Caucasus'), 'E. Turkey');
    assert.equal(shortSideName('Levant & Cyprus'), 'Levant');
    assert.equal(shortSideName('Southern Asia'), 'S. Asia');
    assert.equal(shortSideName('Iraq & Kuwait'), 'Iraq');
    assert.equal(shortSideName('South America'), 'S. America');
    assert.equal(shortSideName('Western Europe'), 'W. Europe');
    assert.equal(shortSideName('Central America'), 'C. America');
    assert.equal(shortSideName('Iraq'), 'Iraq');
  });

  it('uses a letter form when the cut name is only single letters', () => {
    const letterForms: readonly (readonly [string, string])[] = [
      ['South & east China, Taiwan', 'SECT'],
      ['Southern & eastern Germany, Austria, Switzerland', 'SEGAS'],
      ['Northern & western Iran', 'NWI'],
      ['Southern & eastern Iran', 'SEI'],
      ['North & East India, Bangladesh, Nepal, Bhutan', 'NEIBNB'],
      ['Central & western Mexico', 'CWM'],
      ['Central & northwestern Russia', 'CNWR'],
      ['Central & northern Brazil, Paraguay', 'CNBP'],
      ['Central & western Cameroon', 'CWC'],
      ['Northern & eastern Nigeria', 'NEN'],
      ['Northern & western DR Congo, Congo', 'NWDRCC'],
      ['Western & central Algeria', 'WCA'],
    ];
    for (const [name, short] of letterForms) {
      assert.equal(shortSideName(name), short);
      assert.equal(shortSideName(`${name} (${short})`), short);
    }
    assert.equal(shortSideName('East'), 'East');
    assert.equal(shortSideName('Northwestern Italy'), 'Northwestern Italy');
    assert.equal(shortSideName('NE Mexico & the Bajio'), 'NE Mexico');
    assert.equal(shortSideName('Southern France'), 'S. France');
    assert.equal(shortSideName('Tasman (Victoria, Tasmania, NZ)'), 'TVTNZ');
    assert.equal(shortSideName('Tasman (Victoria, Tasmania, NZ) (TVTNZ)'), 'TVTNZ');
    assert.equal(shortSideName('Q (alpha, beta)'), 'Q (alpha, beta)');
    assert.equal(shortSideName(''), '');
  });
});

describe('enemySeatIdsOf', () => {
  it('skips the given seat and every seat that is already out', () => {
    const seats = [
      seat({ seatId: 'human', seatOrder: 1, kind: 'human' }),
      seat({ seatId: 'opponent', seatOrder: 2, kind: 'ai', outTurn: 3 }),
      seat({ seatId: 'opponent2', seatOrder: 3, kind: 'ai' }),
      seat({ seatId: 'opponent3', seatOrder: 4, kind: 'ai' }),
    ];
    assert.deepEqual(enemySeatIdsOf(seats, 'human'), ['opponent2', 'opponent3'] satisfies SeatId[]);
  });
});

describe('toSeatSnapshot', () => {
  it('hides a random doctrine until reveal, and never hides a chosen one', () => {
    const randomSeat = seat({
      seatId: 'opponent',
      seatOrder: 2,
      kind: 'ai',
      commander: { modelId: 'model', reasoningEffort: null, doctrineChoice: 'random', hasApiKey: false, doctrine: 'cautious' },
    });
    assert.equal(toSeatSnapshot(randomSeat, false, false).commander?.doctrine, null);
    assert.equal(toSeatSnapshot(randomSeat, true, false).commander?.doctrine, 'cautious');

    const chosenSeat = seat({
      seatId: 'opponent2',
      seatOrder: 3,
      kind: 'ai',
      commander: { modelId: null, reasoningEffort: null, doctrineChoice: 'aggressive', hasApiKey: true, doctrine: 'aggressive' },
    });
    assert.equal(toSeatSnapshot(chosenSeat, false, true).commander?.doctrine, 'aggressive');
    assert.equal(toSeatSnapshot(chosenSeat, false, true).commander?.hasApiKey, true);
  });
});
