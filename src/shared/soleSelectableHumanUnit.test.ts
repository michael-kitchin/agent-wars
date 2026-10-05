import assert from 'node:assert/strict';
import { test } from 'node:test';
import { soleSelectableHumanUnitId } from './soleSelectableHumanUnit';

/**
 * Checks which hex contents yield one selectable human unit.
 *
 * Purpose: Shift-click toggles only that case. Every other count leaves the stack callout in charge.
 * When to use: From this file's runner.
 * Expected outcome: One human unit is returned, including beside enemies or embarked cargo. Two selectable humans, enemies only, embarked only, and an empty list return null.
 * Exceptions: AssertionError when the count drifts.
 */
test('a hex has one selectable human unit only when every other occupant is unselectable', () => {
  const embarked = new Set(['cargo']);
  const isEmbarked = (unitId: string) => embarked.has(unitId);
  assert.equal(soleSelectableHumanUnitId([{ id: 'alpha', player: 'human' }], isEmbarked), 'alpha');
  assert.equal(
    soleSelectableHumanUnitId(
      [
        { id: 'alpha', player: 'human' },
        { id: 'foe', player: 'opponent' },
      ],
      isEmbarked
    ),
    'alpha'
  );
  assert.equal(
    soleSelectableHumanUnitId(
      [
        { id: 'alpha', player: 'human' },
        { id: 'cargo', player: 'human' },
      ],
      isEmbarked
    ),
    'alpha'
  );
  assert.equal(
    soleSelectableHumanUnitId(
      [
        { id: 'alpha', player: 'human' },
        { id: 'bravo', player: 'human' },
      ],
      isEmbarked
    ),
    null
  );
  assert.equal(soleSelectableHumanUnitId([{ id: 'foe', player: 'opponent' }], isEmbarked), null);
  assert.equal(soleSelectableHumanUnitId([{ id: 'cargo', player: 'human' }], isEmbarked), null);
  assert.equal(soleSelectableHumanUnitId([], isEmbarked), null);
});
