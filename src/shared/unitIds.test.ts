import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ALL_BUILD_UNIT_TYPES, type BuildUnitType } from './ipc/productionTypes';
import {
  UNIT_TYPE_ID_CODES,
  compareUnitIdsNaturally,
  formatStrategicUnitId,
  formatTacticalSubUnitId,
  parseStrategicUnitId,
  parseTacticalSubUnitId,
  playerIdCodeFor,
  unitIdOwnerFromId,
  unitTypeFromUnitId,
  type StrategicUnitIdParts,
} from './unitIds';
import { type SeatId } from './seatIds';

const OWNERS: readonly SeatId[] = ['human', 'opponent'];

describe('formatStrategicUnitId and parseStrategicUnitId', () => {
  it('round-trips one unit of each type for both players', () => {
    for (const player of OWNERS) {
      for (const unitType of ALL_BUILD_UNIT_TYPES) {
        const parts: StrategicUnitIdParts = { player, unitType, ordinal: 7 };
        assert.deepEqual(parseStrategicUnitId(formatStrategicUnitId(parts)), parts);
      }
    }
  });

  it('rejects legacy shapes, zero-padded numbers, and the empty string', () => {
    assert.equal(parseStrategicUnitId('human-infantry-1'), null);
    assert.equal(parseStrategicUnitId('opponent-armor-prod-7-308'), null);
    assert.equal(parseStrategicUnitId('h01-i1'), null);
    assert.equal(parseStrategicUnitId('h1-i01'), null);
    assert.equal(parseStrategicUnitId(''), null);
  });

  it('accepts AI indexes 1 to 4 and rejects every other player index', () => {
    assert.deepEqual(parseStrategicUnitId('a4-t2'), { player: 'opponent4', unitType: 'armor', ordinal: 2 });
    assert.equal(formatStrategicUnitId({ player: 'opponent3', unitType: 'armor', ordinal: 2 }), 'a3-t2');
    assert.equal(parseStrategicUnitId('a5-t2'), null);
    assert.equal(parseStrategicUnitId('h2-t2'), null);
  });
});

describe('formatTacticalSubUnitId and parseTacticalSubUnitId', () => {
  it('round-trips sub-units including a two-digit slot', () => {
    const parent = formatStrategicUnitId({ player: 'human', unitType: 'armor', ordinal: 3 });
    assert.deepEqual(parseTacticalSubUnitId(formatTacticalSubUnitId(parent, 2)), {
      parentUnitId: parent,
      slot: 2,
    });
    assert.deepEqual(parseTacticalSubUnitId(formatTacticalSubUnitId(parent, 12)), {
      parentUnitId: parent,
      slot: 12,
    });
  });

  it('does not pad the slot', () => {
    assert.equal(formatTacticalSubUnitId('h1-n1', 1), 'h1-n1-s1');
  });

  it('returns null for every strategic identifier so s cannot be a type code', () => {
    for (const unitType of ALL_BUILD_UNIT_TYPES) {
      const id = formatStrategicUnitId({ player: 'human', unitType, ordinal: 4 });
      assert.equal(parseTacticalSubUnitId(id), null, id);
    }
    assert.equal(UNIT_TYPE_ID_CODES.infantry, 'i');
    assert.equal(UNIT_TYPE_ID_CODES.armor, 't');
    assert.equal(UNIT_TYPE_ID_CODES.naval, 'n');
    assert.equal(UNIT_TYPE_ID_CODES.air, 'a');
    assert.ok(!Object.values(UNIT_TYPE_ID_CODES).includes('s'));
  });
});

describe('formatters throw on invalid ordinals and slots', () => {
  const valid: StrategicUnitIdParts = { player: 'human', unitType: 'infantry', ordinal: 1 };

  it('throws on a zero, negative, or fractional ordinal', () => {
    assert.throws(() => formatStrategicUnitId({ ...valid, ordinal: 0 }));
    assert.throws(() => formatStrategicUnitId({ ...valid, ordinal: -1 }));
    assert.throws(() => formatStrategicUnitId({ ...valid, ordinal: 1.5 }));
  });

  it('throws on a zero, negative, or fractional slot', () => {
    assert.throws(() => formatTacticalSubUnitId('h1-n1', 0));
    assert.throws(() => formatTacticalSubUnitId('h1-n1', -2));
    assert.throws(() => formatTacticalSubUnitId('h1-n1', 1.5));
  });
});

describe('playerIdCodeFor', () => {
  it('maps human to h1 and opponent to a1', () => {
    assert.equal(playerIdCodeFor('human'), 'h1');
    assert.equal(playerIdCodeFor('opponent'), 'a1');
  });
});

describe('unitTypeFromUnitId', () => {
  it('resolves compact, legacy, and sub-unit armor identifiers', () => {
    assert.equal(unitTypeFromUnitId('h1-t3'), 'armor');
    assert.equal(unitTypeFromUnitId('human-armor-2'), 'armor');
    assert.equal(unitTypeFromUnitId('h1-t3-s2'), 'armor');
    assert.equal(unitTypeFromUnitId('nonsense'), null);
  });

  it('resolves each compact type code', () => {
    const expected: Readonly<Record<BuildUnitType, string>> = {
      infantry: 'h1-i1',
      armor: 'h1-t1',
      naval: 'h1-n1',
      air: 'h1-a1',
    };
    for (const unitType of ALL_BUILD_UNIT_TYPES) {
      assert.equal(unitTypeFromUnitId(expected[unitType]), unitType);
    }
  });
});

describe('unitIdOwnerFromId', () => {
  it('resolves compact, compact sub-unit, and legacy prefixes', () => {
    assert.equal(unitIdOwnerFromId('h1-t3'), 'human');
    assert.equal(unitIdOwnerFromId('a1-a44'), 'opponent');
    assert.equal(unitIdOwnerFromId('a2-i7'), 'opponent2');
    assert.equal(unitIdOwnerFromId('h1-t3-s2'), 'human');
    assert.equal(unitIdOwnerFromId('human-armor-1'), 'human');
    assert.equal(unitIdOwnerFromId('opponent-air-prod-3-276'), 'opponent');
    assert.equal(unitIdOwnerFromId('human-naval-1:01'), 'human');
    assert.equal(unitIdOwnerFromId('nonsense'), null);
  });
});

describe('compareUnitIdsNaturally', () => {
  it('sorts h1-i2 before h1-i10', () => {
    const sorted = ['h1-i10', 'h1-i2'].sort(compareUnitIdsNaturally);
    assert.deepEqual(sorted, ['h1-i2', 'h1-i10']);
  });

  it('returns a non-zero result for two distinct strings', () => {
    assert.notEqual(compareUnitIdsNaturally('h1-i1', 'H1-I1'), 0);
  });
});
