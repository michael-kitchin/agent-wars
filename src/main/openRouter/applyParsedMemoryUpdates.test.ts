/**
 * Contract tests for applying envelope memory rows.
 *
 * Purpose: A strategic consult must store a complete write and report the tool's own error for a rejected row.
 * When to use: After editing `applyParsedMemoryUpdates`.
 * Expected outcome: The cases below pass against a temporary database, never the match file.
 * Exceptions: AssertionError on contract drift. The temporary directory is removed in `finally`.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import { closeGameDatabaseForTests, createFreshGameDatabaseAt } from '../gameDb';
import { executeMemory } from '../tools/memory';
import { applyParsedMemoryUpdates } from './applyParsedMemoryUpdates';
import type { MemoryUpdateItem } from './orderResponseParsing';

/**
 * Seat used for every case.
 *
 * Purpose: Matches the first AI seat without hard-coding a second copy of the id.
 * When to use: Arguments to `applyParsedMemoryUpdates` and `memory_read`.
 * Expected outcome: `AI_SEAT_IDS[0]`.
 * Exceptions: None.
 */
const seatId = AI_SEAT_IDS[0];

/**
 * Key shared by the cases. Each case leaves it absent or replaces it before the next assertion.
 *
 * Purpose: One key keeps the temporary database free of leftover notes between cases.
 * When to use: Every write, delete, and read in this file.
 * Expected outcome: The string `envelope_memory_probe`.
 * Exceptions: None.
 */
const probeKey = 'envelope_memory_probe';

/**
 * Unused map argument required by `executeMemory`.
 *
 * Purpose: The memory tools do not read coordinates. The signature still requires the map.
 * When to use: Every `memory_read` in this file.
 * Expected outcome: An empty map.
 * Exceptions: None.
 */
const emptyMap = new Map<string, [number, number]>();

/**
 * Unused resolver required by `executeMemory`.
 *
 * Purpose: The memory tools do not resolve coordinates.
 * When to use: Every `memory_read` in this file.
 * Expected outcome: `undefined` for any lat/lng.
 * Exceptions: None.
 */
const noopResolve = (): undefined => undefined;

/**
 * Reads the probe key back through the memory tool.
 *
 * Purpose: Proves a write reached SQLite. A closed handle would report success without a row.
 * When to use: After each apply call.
 * Expected outcome: `status: 'ok'` and one memory when the key is stored. `status: 'error'` when it is not.
 * Exceptions: None. `executeMemory` returns an error status instead of throwing.
 */
function readProbe(): Record<string, unknown> {
  return executeMemory(seatId, 'memory_read', { key: probeKey }, { turnNumber: 1 }, emptyMap, noopResolve);
}

/**
 * Applies one list of memory rows for a strategic consult.
 *
 * Purpose: Keeps the cases on the same seat, turn, and non-battle flag.
 * When to use: Every case except the battle case.
 * Expected outcome: The apply result for those rows.
 * Exceptions: None.
 */
function applyStrategic(updates: readonly MemoryUpdateItem[]): { appliedCount: number; dropReasons: string[] } {
  return applyParsedMemoryUpdates({ seatId, turnNumber: 1, updates, tactical: false, memoryEnabled: true });
}

test('applyParsedMemoryUpdates stores a strategic write and reports rejected rows', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-memory-'));
  const dbPath = path.join(dir, 't.sqlite');
  try {
    createFreshGameDatabaseAt(dbPath);

    const battle = applyParsedMemoryUpdates({
      seatId,
      turnNumber: 1,
      tactical: true,
      memoryEnabled: true,
      updates: [{ action: 'write', key: probeKey, tier: 'persistent', content: 'Hold the coast.' }],
    });
    assert.deepEqual(battle.dropReasons, ['memoryUpdates dropped: not accepted in battle']);
    assert.equal(battle.appliedCount, 0);
    assert.equal(readProbe().status, 'error');

    const disabled = applyParsedMemoryUpdates({
      seatId,
      turnNumber: 1,
      tactical: false,
      memoryEnabled: false,
      updates: [{ action: 'write', key: probeKey, tier: 'persistent', content: 'Hold the coast.' }],
    });
    assert.deepEqual(disabled.dropReasons, ['memoryUpdates dropped: memory tool group is disabled.']);
    assert.equal(disabled.appliedCount, 0);
    assert.equal(readProbe().status, 'error');

    const missingTier = applyStrategic([{ action: 'write', key: probeKey, content: 'Hold the coast.' }]);
    assert.equal(missingTier.appliedCount, 0);
    assert.equal(missingTier.dropReasons.length, 1);
    assert.ok(missingTier.dropReasons[0]?.includes('write requires tier'));
    assert.equal(readProbe().status, 'error');

    const emptyContent = applyStrategic([{ action: 'write', key: probeKey, tier: 'persistent' }]);
    assert.equal(emptyContent.appliedCount, 0);
    assert.equal(emptyContent.dropReasons.length, 1);
    assert.ok(emptyContent.dropReasons[0]?.includes('Content cannot be empty'));
    assert.equal(readProbe().status, 'error');

    const stored = applyStrategic([
      { action: 'write', key: probeKey, tier: 'persistent', content: 'Hold the coast.' },
    ]);
    assert.equal(stored.appliedCount, 1);
    assert.deepEqual(stored.dropReasons, []);
    const storedRead = readProbe();
    assert.equal(storedRead.status, 'ok');
    const storedMemories = storedRead.memories as { content: string; tier: string }[];
    assert.equal(storedMemories[0]?.content, 'Hold the coast.');
    assert.equal(storedMemories[0]?.tier, 'persistent');

    const replaced = applyStrategic([
      { action: 'write', key: probeKey, tier: 'persistent', content: 'Hold the coast.' },
      { action: 'write', key: probeKey, tier: 'persistent', content: 'Hold the port.' },
    ]);
    assert.equal(replaced.appliedCount, 2);
    assert.deepEqual(replaced.dropReasons, []);
    const replacedRead = readProbe();
    const replacedMemories = replacedRead.memories as { content: string }[];
    assert.equal(replacedMemories[0]?.content, 'Hold the port.');

    const cleared = applyStrategic([
      { action: 'write', key: probeKey, tier: 'persistent', content: 'Hold the coast.' },
      { action: 'delete', key: probeKey },
    ]);
    assert.equal(cleared.appliedCount, 2);
    assert.deepEqual(cleared.dropReasons, []);
    assert.equal(readProbe().status, 'error');

    const missing = applyStrategic([{ action: 'delete', key: probeKey }]);
    assert.equal(missing.appliedCount, 0);
    assert.equal(missing.dropReasons.length, 1);
    assert.ok(missing.dropReasons[0]?.includes('Memory not found'));
  } finally {
    closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
