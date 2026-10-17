/**
 * Locks the embark checks that return before any database read.
 *
 * Purpose: Human and opponent embark validation share one body, and the two reason strings must stay distinct.
 * When to use: After edits to `validateTacticalHumanEmbarkOrder` or `validateTacticalOpponentEmbarkOrder`.
 * Expected outcome: Missing units, the wrong owner, separated cells, and cargo already aboard match the historical reasons.
 * Exceptions: Assertion failures name the drifted case. These cases do not open the database.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EmbarkOrder } from '../../shared/ipcTypes';
import type { TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import {
  validateTacticalHumanEmbarkOrder,
  validateTacticalOpponentEmbarkOrder,
} from './tacticalOpponentOrderValidation';

/**
 * Builds one tactical sub-unit with the fields embark validation reads before the port query.
 *
 * Purpose: Keeps the four pre-database cases free of a battle snapshot.
 * When to use: Fixtures in this file.
 * Expected outcome: A row with the given owner, type, and cell.
 * Exceptions: None.
 */
function subUnit(
  id: string,
  player: TacticalSubUnitSnapshot['player'],
  unitType: string,
  h3Index: string,
  embarkedOnSubUnitId?: string
): TacticalSubUnitSnapshot {
  return {
    id,
    parentUnitId: `p-${id}`,
    player,
    unitType,
    h3Index,
    displayName: id,
    embarkedOnSubUnitId,
  };
}

const enclosing = 'unused-hex';

/**
 * Asserts the four pre-database outcomes for one embark export.
 *
 * Purpose: Both exports must keep their owner sentence and the shared co-location and missing-unit sentences.
 * When to use: Once per export.
 * Expected outcome: The named reason, or `valid: true` when cargo is already on that carrier.
 * Exceptions: Assertion failure on contract drift.
 */
function assertPreDatabaseOutcomes(
  validate: (
    order: EmbarkOrder,
    subUnits: readonly TacticalSubUnitSnapshot[],
    enclosingStrategicH3Index: string
  ) => { valid: true } | { valid: false; reason: string },
  player: TacticalSubUnitSnapshot['player'],
  wrongPlayerReason: string
): void {
  const other: TacticalSubUnitSnapshot['player'] = player === 'human' ? 'opponent' : 'human';
  const missing = validate({ unitId: 'missing', navalUnitId: 'ship' }, [], enclosing);
  assert.equal(missing.valid, false);
  if (!missing.valid) assert.match(missing.reason, /Embark units not found/);

  const wrongOwner = validate(
    { unitId: 'land', navalUnitId: 'ship' },
    [subUnit('land', other, 'infantry', 'cell'), subUnit('ship', other, 'naval', 'cell')],
    enclosing
  );
  assert.equal(wrongOwner.valid, false);
  if (!wrongOwner.valid) assert.equal(wrongOwner.reason, wrongPlayerReason);

  const separated = validate(
    { unitId: 'land', navalUnitId: 'ship' },
    [subUnit('land', player, 'infantry', 'cell-a'), subUnit('ship', player, 'naval', 'cell-b')],
    enclosing
  );
  assert.equal(separated.valid, false);
  if (!separated.valid) assert.equal(separated.reason, 'Embark requires co-located land and naval units');

  const alreadyAboard = validate(
    { unitId: 'land', navalUnitId: 'ship' },
    [subUnit('land', player, 'infantry', 'cell', 'ship'), subUnit('ship', player, 'naval', 'cell')],
    enclosing
  );
  assert.deepEqual(alreadyAboard, { valid: true });
}

test('human embark validation keeps the pre-database reasons', () => {
  assertPreDatabaseOutcomes(
    validateTacticalHumanEmbarkOrder,
    'human',
    'Embark orders must target your own units'
  );
});

test('opponent embark validation keeps the pre-database reasons', () => {
  assertPreDatabaseOutcomes(
    validateTacticalOpponentEmbarkOrder,
    'opponent',
    'Embark orders must target opponent units'
  );
});
