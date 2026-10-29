/**
 * Fortified cells lose the fortification instead of becoming rubble.
 *
 * Purpose: Air strikes and tactical ranged fire must strip a fortification before they can destroy the cell.
 * When to use: After changing infrastructure destruction or tactical ranged rubble.
 * Expected outcome: The cases below. A fully fortified city is not rubbled.
 * Exceptions: None. Each case removes its temporary match.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strategicUrbanCellsDestroyedPerHit } from '../../shared/gameRules';
import { applyInfrastructureDestructionEffects } from './airStrikeResolution';
import { applyTacticalRangedRubbleToCell } from './tacticalRangedInfrastructureRubble';
import {
  dbGetOne,
  getStrategicInfrastructureForHex,
  listFortifiableCellsForHex,
  listTacticalFeatureOverridesForGame,
  setTacticalCellFortified,
} from '../gameDb';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import type { FortificationLossTally } from '../fortificationCombat';

test('an urban strike on a fully fortified hex strips fortifications and rubbles nothing', () => {
  withSeatedTempGameDb('aw-fort-urban-', { fogOfWarEnabled: false }, () => {
    const perHit = strategicUrbanCellsDestroyedPerHit();
    const hex = dbGetOne<{ h3Index: string }>(
      `SELECT h3_index AS h3Index FROM res_s_infrastructure
       WHERE fortifiable_count > ?
       ORDER BY fortifiable_count DESC, h3_index ASC
       LIMIT 1`,
      [perHit]
    )?.h3Index;
    assert.ok(hex, 'expected a hex with more intact city cells than one urban strike');
    const cells = listFortifiableCellsForHex(hex);
    for (const cell of cells) setTacticalCellFortified(cell, true);
    const tally: FortificationLossTally = new Map();
    const result = applyInfrastructureDestructionEffects(hex, 'urban', () => 0.5, { fortificationTally: tally });
    assert.equal(result.changedRubbleCount, 0);
    const stripped = Math.min(perHit, cells.length);
    assert.equal(result.fortificationsStrippedCount, stripped);
    assert.equal(tally.get(hex), stripped);
    assert.equal(getStrategicInfrastructureForHex(hex).fortifiedCount, cells.length - stripped);
  });
});

test('a targeted tactical urban strike strips a fortification and leaves the city', () => {
  withSeatedTempGameDb('aw-fort-tactical-urban-', { fogOfWarEnabled: false }, () => {
    const row = listTacticalFeatureOverridesForGame().find((cell) => cell.isUrban && !cell.isRubble);
    assert.ok(row);
    setTacticalCellFortified(row.h3Index, true);
    const result = applyInfrastructureDestructionEffects(row.parentH3Index, 'urban', () => 0, {
      tacticalUrbanStrikeTargetH3: row.h3Index,
    });
    const after = listTacticalFeatureOverridesForGame().find((cell) => cell.h3Index === row.h3Index);
    assert.equal(result.changedRubbleCount, 0);
    assert.equal(result.fortificationsStrippedCount, 1);
    assert.equal(after?.isUrban, true);
    assert.equal(after?.isFortified, false);
  });
});

test('tactical ranged fire strips a fortification and reports no terrain change', () => {
  withSeatedTempGameDb('aw-fort-ranged-rubble-', { fogOfWarEnabled: false }, () => {
    const row = listTacticalFeatureOverridesForGame().find((cell) => cell.isUrban && !cell.isRubble);
    assert.ok(row);
    setTacticalCellFortified(row.h3Index, true);
    const result = applyTacticalRangedRubbleToCell(row.h3Index, row.parentH3Index);
    const after = listTacticalFeatureOverridesForGame().find((cell) => cell.h3Index === row.h3Index);
    assert.equal(result.changed, false);
    assert.equal(after?.isUrban, true);
    assert.equal(after?.isFortified, false);
  });
});
