import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildSealiftSlotsByNavalId,
  normalizeSealiftSlots,
  type SealiftSlotPair,
} from './sealiftSlotAssignment';

test('buildSealiftSlotsByNavalId puts armor in slot 1 and clears slot 2', () => {
  const map = buildSealiftSlotsByNavalId(['n1'], [
    { landUnitId: 'inf-z', navalUnitId: 'n1', landUnitType: 'infantry' },
    { landUnitId: 'arm-a', navalUnitId: 'n1', landUnitType: 'armor' },
  ]);
  assert.deepEqual(map.get('n1'), { slot1UnitId: 'arm-a', slot2UnitId: null });
});

test('buildSealiftSlotsByNavalId places two infantry in lexicographic order', () => {
  const map = buildSealiftSlotsByNavalId(['n1'], [
    { landUnitId: 'inf-b', navalUnitId: 'n1', landUnitType: 'infantry' },
    { landUnitId: 'inf-a', navalUnitId: 'n1', landUnitType: 'infantry' },
  ]);
  assert.deepEqual(map.get('n1'), { slot1UnitId: 'inf-a', slot2UnitId: 'inf-b' });
});

test('buildSealiftSlotsByNavalId leaves unused naval ids empty', () => {
  const map = buildSealiftSlotsByNavalId(['n1', 'n2'], [
    { landUnitId: 'inf-a', navalUnitId: 'n1', landUnitType: 'infantry' },
  ]);
  assert.deepEqual(map.get('n2'), { slot1UnitId: null, slot2UnitId: null });
});

test('normalizeSealiftSlots keeps a duplicated land id only on the first carrier', () => {
  const slotsByNavalId = new Map<string, SealiftSlotPair>([
    ['n1', { slot1UnitId: 'inf-a', slot2UnitId: null }],
    ['n2', { slot1UnitId: 'inf-a', slot2UnitId: null }],
  ]);
  const landTypeById = new Map<string, 'infantry' | 'armor'>([['inf-a', 'infantry']]);
  normalizeSealiftSlots(['n1', 'n2'], slotsByNavalId, landTypeById);
  assert.deepEqual(slotsByNavalId.get('n1'), { slot1UnitId: 'inf-a', slot2UnitId: null });
  assert.deepEqual(slotsByNavalId.get('n2'), { slot1UnitId: null, slot2UnitId: null });
});

test('normalizeSealiftSlots clears land ids missing from landTypeById and promotes slot 2', () => {
  const slotsByNavalId = new Map<string, SealiftSlotPair>([
    ['n1', { slot1UnitId: 'gone', slot2UnitId: 'inf-a' }],
  ]);
  const landTypeById = new Map<string, 'infantry' | 'armor'>([['inf-a', 'infantry']]);
  normalizeSealiftSlots(['n1'], slotsByNavalId, landTypeById);
  assert.deepEqual(slotsByNavalId.get('n1'), { slot1UnitId: 'inf-a', slot2UnitId: null });
});

test('normalizeSealiftSlots moves armor from slot 2 to slot 1', () => {
  const slotsByNavalId = new Map<string, SealiftSlotPair>([
    ['n1', { slot1UnitId: 'inf-a', slot2UnitId: 'arm-a' }],
  ]);
  const landTypeById = new Map<string, 'infantry' | 'armor'>([
    ['inf-a', 'infantry'],
    ['arm-a', 'armor'],
  ]);
  normalizeSealiftSlots(['n1'], slotsByNavalId, landTypeById);
  assert.deepEqual(slotsByNavalId.get('n1'), { slot1UnitId: 'arm-a', slot2UnitId: null });
});
