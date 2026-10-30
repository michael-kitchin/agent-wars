/**
 * Payroll draws walkers before loaded ships and keeps a cheap group when it still fits.
 *
 * Purpose: Desertion order is part of the contract the end of the turn relies on.
 * When to use: After changing `settleMercenaryPayroll` or `shuffleWithSeed`.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { settleMercenaryPayroll, shuffleWithSeed, type PayrollMercenary } from './mercenaryPayroll';

test('enough credits deserts nobody', () => {
  const result = settleMercenaryPayroll({
    mercenaries: [walker('a', 3), walker('b', 3)],
    credits: 6,
    seed: 1,
  });
  assert.deepEqual(result.deserterIds, []);
  assert.equal(result.creditsAfter, 0);
});

test('a short treasury deserts pool A first and stops when the rest fits', () => {
  const result = settleMercenaryPayroll({
    mercenaries: [walker('a', 8), ship('s', 8, ['cargo'])],
    credits: 10,
    seed: 4,
  });
  assert.deepEqual(result.deserterIds, ['a']);
});

test('credits 10 desert only the walker that costs 25', () => {
  for (let seed = 1; seed <= 12; seed += 1) {
    const result = settleMercenaryPayroll({
      mercenaries: [walker('w25', 25), walker('w3a', 3), walker('w3b', 3)],
      credits: 10,
      seed,
    });
    assert.deepEqual(result.deserterIds, ['w25']);
  }
});

test('credits 10 keep the cheaper loaded ship and desert the walker and the expensive ship', () => {
  for (let seed = 1; seed <= 12; seed += 1) {
    const result = settleMercenaryPayroll({
      mercenaries: [walker('walk', 6), ship('ship6', 6, ['c6']), ship('ship20', 20, ['c20'])],
      credits: 10,
      seed,
    });
    assert.deepEqual([...result.deserterIds].sort(), ['c20', 'ship20', 'walk']);
  }
});

test('a walker stays and unpaid riders are forgiven down to zero', () => {
  const result = settleMercenaryPayroll({
    mercenaries: [walker('walk', 3), rider('ride', 13, 'regular-ship')],
    credits: 10,
    seed: 2,
  });
  assert.deepEqual(result.deserterIds, []);
  assert.equal(result.creditsAfter, 0);
});

test('a loaded ship deserts only with its cargo, and a rider never deserts', () => {
  const deserted = settleMercenaryPayroll({
    mercenaries: [ship('ship', 5, ['merc', 'regular']), walker('merc', 3)],
    credits: 0,
    seed: 1,
  });
  assert.ok(deserted.deserterIds.includes('ship'));
  assert.ok(deserted.deserterIds.includes('regular'));
  const forgiven = settleMercenaryPayroll({
    mercenaries: [rider('ride', 9, 'regular-ship')],
    credits: 0,
    seed: 1,
  });
  assert.deepEqual(forgiven.deserterIds, []);
  assert.equal(forgiven.creditsAfter, 0);
});

test('a mercenary aboard a mercenary ship deserts only with that ship', () => {
  const kept = settleMercenaryPayroll({
    mercenaries: [ship('ship', 3, ['rider']), aboard('rider', 3, 'ship'), walker('walk', 13)],
    credits: 10,
    seed: 3,
  });
  assert.deepEqual(kept.deserterIds, ['walk']);
  const lost = settleMercenaryPayroll({
    mercenaries: [ship('ship', 3, ['rider']), aboard('rider', 3, 'ship')],
    credits: 0,
    seed: 3,
  });
  assert.deepEqual(lost.deserterIds, ['ship', 'rider']);
});

test('the same seed deserts the same units', () => {
  const mercenaries = [walker('a', 5), walker('b', 9), walker('c', 4), ship('s', 7, ['cargo'])];
  const first = settleMercenaryPayroll({ mercenaries, credits: 8, seed: 11 });
  const second = settleMercenaryPayroll({ mercenaries, credits: 8, seed: 11 });
  assert.deepEqual(first, second);
  const shuffled = shuffleWithSeed(['a', 'b', 'c'], 11);
  assert.deepEqual(shuffled, shuffleWithSeed(['a', 'b', 'c'], 11));
});

/**
 * A mercenary with no ship and no cargo.
 *
 * Purpose: Pool A rows in the cases above.
 * When to use: A payroll fixture.
 * Expected outcome: A walker.
 * Exceptions: None.
 */
function walker(id: string, upkeep: number): PayrollMercenary {
  return { id, upkeep, carriedByShipId: null, cargoIds: [] };
}

/**
 * A mercenary ship and the units it carries.
 *
 * Purpose: Pool B rows. Cargo need not themselves be mercenaries.
 * When to use: A payroll fixture.
 * Expected outcome: A loaded ship.
 * Exceptions: None.
 */
function ship(id: string, upkeep: number, cargoIds: readonly string[]): PayrollMercenary {
  return { id, upkeep, carriedByShipId: null, cargoIds };
}

/**
 * A mercenary aboard a ship that is not in the mercenary list.
 *
 * Purpose: Riders never desert.
 * When to use: A payroll fixture.
 * Expected outcome: A rider.
 * Exceptions: None.
 */
function rider(id: string, upkeep: number, shipId: string): PayrollMercenary {
  return { id, upkeep, carriedByShipId: shipId, cargoIds: [] };
}

/**
 * A mercenary aboard a mercenary ship.
 *
 * Purpose: This unit is part of the ship's group.
 * When to use: A payroll fixture. The ship's `cargoIds` must include this id.
 * Expected outcome: A row that is neither a walker nor a rider.
 * Exceptions: None.
 */
function aboard(id: string, upkeep: number, shipId: string): PayrollMercenary {
  return { id, upkeep, carriedByShipId: shipId, cargoIds: [] };
}
