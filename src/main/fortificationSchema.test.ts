/**
 * Schema contracts for fortification flags and strategic counts.
 *
 * Purpose: A fresh match can fortify an intact city cell, and the check rejects a rubble or missing cell.
 * When to use: After changing `is_fortified` or the strategic fortification counts.
 * Expected outcome: Counts follow the cell flag, and illegal writes throw.
 * Exceptions: None. The temporary directory is removed afterward.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import {
  closeGameDatabaseForTests,
  dbGetAll,
  dbRun,
  getStrategicInfrastructureForHex,
  openGameDatabaseAtPathForTests,
  resetGameForNewMatch,
  setTacticalCellFortified,
  updateTacticalFeatureOverrideRow,
} from './gameDb';

test('fortification flags roll up and the check rejects illegal cells', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-fortification-schema-'));
  const databasePath = path.join(dir, 'game.sqlite');
  try {
    openGameDatabaseAtPathForTests(databasePath);
    resetGameForNewMatch();
    const rows = dbGetAll<{ parent: string; cell: string }>(
      `SELECT parent_h3_index AS parent, h3_index AS cell
       FROM res_t_feature_overrides
       WHERE is_urban = 1 AND is_rubble = 0
       ORDER BY parent_h3_index ASC, h3_index ASC`
    );
    const byParent = new Map<string, string[]>();
    for (const row of rows) {
      const cells = byParent.get(row.parent) ?? [];
      cells.push(row.cell);
      byParent.set(row.parent, cells);
    }
    const parent = [...byParent.entries()].find((entry) => entry[1].length >= 2);
    assert.ok(parent, 'expected a hex with at least two intact city cells');
    const [h3Index, cells] = parent;
    const cell = cells[0]!;
    const cell2 = cells[1]!;
    const before = getStrategicInfrastructureForHex(h3Index);

    setTacticalCellFortified(cell, true);
    const fortified = getStrategicInfrastructureForHex(h3Index);
    assert.equal(fortified.fortifiedCount, before.fortifiedCount + 1);
    assert.equal(fortified.fortifiableCount, before.fortifiableCount - 1);

    setTacticalCellFortified(cell, false);
    const restored = getStrategicInfrastructureForHex(h3Index);
    assert.equal(restored.fortifiedCount, before.fortifiedCount);
    assert.equal(restored.fortifiableCount, before.fortifiableCount);

    updateTacticalFeatureOverrideRow(cell2, { isRubble: true, isUrban: false });
    assert.throws(() => setTacticalCellFortified(cell2, true));

    setTacticalCellFortified(cell, true);
    assert.throws(() => updateTacticalFeatureOverrideRow(cell, { isRubble: true, isUrban: false }));
    assert.throws(() => setTacticalCellFortified('not-a-cell', true));

    dbRun(
      `INSERT INTO res_s_build_queue (h3_index, queue_index, unit_type, remaining_count)
       VALUES (?, 0, 'fortification', 1)`,
      [h3Index]
    );
  } finally {
    closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
