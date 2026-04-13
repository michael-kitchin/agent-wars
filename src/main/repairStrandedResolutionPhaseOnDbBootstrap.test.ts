/**
 * Tests bootstrap repair of `turn_state.phase` when a prior run left `resolution` on disk without an in-process resume path.
 * Run with: node dist/main/repairStrandedResolutionPhaseOnDbBootstrap.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dbGetOne,
  dbRun,
  repairStrandedStrategicResolutionPhaseOnDbBootstrap,
} from './gameDb';
import { withTempGameDb } from './testSupport/withTempGameDb';

test('repairStrandedStrategicResolutionPhaseOnDbBootstrap resets resolution to planning', () => {
  withTempGameDb('aw-repair-resolution-', () => {
    dbRun(`UPDATE turn_state SET phase = 'resolution' WHERE id = 1`);
    assert.equal(
      dbGetOne<{ phase: string }>('SELECT phase FROM turn_state WHERE id = 1')?.phase,
      'resolution'
    );
    repairStrandedStrategicResolutionPhaseOnDbBootstrap();
    assert.equal(
      dbGetOne<{ phase: string }>('SELECT phase FROM turn_state WHERE id = 1')?.phase,
      'planning'
    );
  });
});

test('repairStrandedStrategicResolutionPhaseOnDbBootstrap leaves planning unchanged', () => {
  withTempGameDb('aw-repair-planning-', () => {
    repairStrandedStrategicResolutionPhaseOnDbBootstrap();
    assert.equal(
      dbGetOne<{ phase: string }>('SELECT phase FROM turn_state WHERE id = 1')?.phase,
      'planning'
    );
  });
});
