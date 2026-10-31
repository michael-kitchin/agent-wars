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
import { executeMemory, getInjectionText } from '../tools/memory';
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

/**
 * One AI seat the memory table accepts.
 *
 * Purpose: Capacity cases need a second seat without a second copy of the id string.
 * When to use: The other-seat write and its read.
 * Expected outcome: `AI_SEAT_IDS[1]`.
 * Exceptions: None.
 */
const otherSeatId = AI_SEAT_IDS[1];

/**
 * Opens a temporary database around one case.
 *
 * Purpose: Each capacity case needs an empty memory table, and the cases must not share rows.
 * When to use: Every test added for persistent capacity.
 * Expected outcome: `run` sees a fresh database. The handle is closed afterward.
 * Exceptions: Re-throws whatever `run` throws, after closing the database.
 */
function withMemoryDb(run: () => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-memory-'));
  const dbPath = path.join(dir, 't.sqlite');
  try {
    createFreshGameDatabaseAt(dbPath);
    run();
  } finally {
    closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Applies one strategic memory list on a chosen turn and seat.
 *
 * Purpose: Capacity cases need distinct `created_turn` values, which `applyStrategic` pins to turn 1.
 * When to use: Writes in the capacity tests.
 * Expected outcome: The apply result for that turn and seat.
 * Exceptions: None.
 */
function applyOnTurn(
  turnNumber: number,
  updates: readonly MemoryUpdateItem[],
  seat: (typeof AI_SEAT_IDS)[number] = seatId
): { appliedCount: number; dropReasons: string[] } {
  return applyParsedMemoryUpdates({
    seatId: seat,
    turnNumber,
    updates,
    tactical: false,
    memoryEnabled: true,
  });
}

/**
 * Reads one key back for a seat.
 *
 * Purpose: The capacity cases assert which keys remain after a write.
 * When to use: After `applyOnTurn`.
 * Expected outcome: The tool result. `status` is `ok` when the key is stored.
 * Exceptions: None. `executeMemory` returns an error status instead of throwing.
 */
function readKey(seat: (typeof AI_SEAT_IDS)[number], key: string): Record<string, unknown> {
  return executeMemory(seat, 'memory_read', { key }, { turnNumber: 1 }, emptyMap, noopResolve);
}

/**
 * True when a memory read returned a stored row.
 *
 * Purpose: Missing keys come back as an error status, and the cases need a single presence check.
 * When to use: After a capacity write.
 * Expected outcome: True when `status` is `ok`.
 * Exceptions: None.
 */
function keyIsStored(seat: (typeof AI_SEAT_IDS)[number], key: string): boolean {
  return readKey(seat, key).status === 'ok';
}

/**
 * Content and tier of one stored key.
 *
 * Purpose: Update and promotion cases check the row that remains, not only that the key exists.
 * When to use: When `keyIsStored` is true.
 * Expected outcome: The first memory row's content and tier.
 * Exceptions: Throws when the key is absent. Callers assert presence first.
 */
function storedRow(seat: (typeof AI_SEAT_IDS)[number], key: string): { content: string; tier: string } {
  const memories = readKey(seat, key).memories as { content: string; tier: string }[];
  const row = memories[0];
  if (!row) throw new Error(`missing memory row for ${key}`);
  return row;
}

/**
 * Writes one persistent note and asserts the engine accepted it.
 *
 * Purpose: The capacity cases fill the tier one turn at a time.
 * When to use: Before the write under test.
 * Expected outcome: The key is stored. A rejected setup write fails the test.
 * Exceptions: AssertionError when the write is dropped.
 */
function storePersistent(key: string, turnNumber: number, content = key, seat: (typeof AI_SEAT_IDS)[number] = seatId): void {
  const result = applyOnTurn(turnNumber, [{ action: 'write', key, tier: 'persistent', content }], seat);
  assert.equal(result.appliedCount, 1, result.dropReasons.join('; '));
  assert.deepEqual(result.dropReasons, []);
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

/**
 * Fills the five persistent slots on turns 1 through 5.
 *
 * Purpose: Several cases start from a full persistent tier with a known oldest key.
 * When to use: At the start of those cases, inside `withMemoryDb`.
 * Expected outcome: `turn_one` through `turn_five` are stored. `turn_one` is the oldest.
 * Exceptions: AssertionError when a setup write is dropped.
 */
function fillPersistentSlots(): void {
  const keys = ['turn_one', 'turn_two', 'turn_three', 'turn_four', 'turn_five'] as const;
  keys.forEach((key, index) => storePersistent(key, index + 1));
}

test('a new persistent key replaces the oldest persistent note when the tier is full', () => {
  withMemoryDb(() => {
    fillPersistentSlots();
    const result = applyOnTurn(6, [{ action: 'write', key: 'turn_six', tier: 'persistent', content: 'turn six' }]);
    assert.equal(result.appliedCount, 1);
    assert.deepEqual(result.dropReasons, []);
    assert.equal(keyIsStored(seatId, 'turn_one'), false);
    assert.equal(storedRow(seatId, 'turn_six').content, 'turn six');
    for (const key of ['turn_two', 'turn_three', 'turn_four', 'turn_five']) {
      assert.equal(keyIsStored(seatId, key), true);
    }
  });
});

test('two persistent notes from the same turn evict the ascending key first', () => {
  withMemoryDb(() => {
    storePersistent('aaaa', 1);
    storePersistent('zzzz', 1);
    storePersistent('key_b', 2);
    storePersistent('key_c', 3);
    storePersistent('key_d', 4);
    const result = applyOnTurn(5, [{ action: 'write', key: 'key_e', tier: 'persistent', content: 'key_e' }]);
    assert.equal(result.appliedCount, 1);
    assert.deepEqual(result.dropReasons, []);
    assert.equal(keyIsStored(seatId, 'aaaa'), false);
    assert.equal(keyIsStored(seatId, 'zzzz'), true);
  });
});

test('rewriting a persistent key does not delete a different note when the tier is full', () => {
  withMemoryDb(() => {
    fillPersistentSlots();
    const result = applyOnTurn(6, [{ action: 'write', key: 'turn_five', tier: 'persistent', content: 'rewritten' }]);
    assert.equal(result.appliedCount, 1);
    assert.deepEqual(result.dropReasons, []);
    assert.equal(storedRow(seatId, 'turn_five').content, 'rewritten');
    for (const key of ['turn_one', 'turn_two', 'turn_three', 'turn_four', 'turn_five']) {
      assert.equal(keyIsStored(seatId, key), true);
    }
  });
});

test('an empty persistent write does not delete the oldest note when the tier is full', () => {
  withMemoryDb(() => {
    fillPersistentSlots();
    const result = applyOnTurn(6, [{ action: 'write', key: 'turn_new', tier: 'persistent', content: '' }]);
    assert.equal(result.appliedCount, 0);
    assert.equal(result.dropReasons.length, 1);
    assert.ok(result.dropReasons[0]?.includes('Content cannot be empty'));
    for (const key of ['turn_one', 'turn_two', 'turn_three', 'turn_four', 'turn_five']) {
      assert.equal(keyIsStored(seatId, key), true);
    }
  });
});

test('a stored write at the stored cap is rejected and does not delete a stored note', () => {
  withMemoryDb(() => {
    for (let index = 1; index <= 15; index += 1) {
      const key = `stored_${String(index).padStart(2, '0')}`;
      const result = applyOnTurn(index, [{ action: 'write', key, tier: 'stored', content: key }]);
      assert.equal(result.appliedCount, 1, result.dropReasons.join('; '));
    }
    const overflow = applyOnTurn(16, [{ action: 'write', key: 'stored_16', tier: 'stored', content: 'stored_16' }]);
    assert.equal(overflow.appliedCount, 0);
    assert.equal(overflow.dropReasons.length, 1);
    assert.equal(keyIsStored(seatId, 'stored_16'), false);
    assert.equal(keyIsStored(seatId, 'stored_01'), true);
    assert.equal(keyIsStored(seatId, 'stored_15'), true);
  });
});

test('promoting a stored key into a full persistent tier replaces the oldest persistent note', () => {
  withMemoryDb(() => {
    fillPersistentSlots();
    const stored = applyOnTurn(6, [{ action: 'write', key: 'kept_note', tier: 'stored', content: 'stored' }]);
    assert.equal(stored.appliedCount, 1);
    const promoted = applyOnTurn(7, [{ action: 'write', key: 'kept_note', tier: 'persistent', content: 'promoted' }]);
    assert.equal(promoted.appliedCount, 1);
    assert.deepEqual(promoted.dropReasons, []);
    assert.equal(keyIsStored(seatId, 'turn_one'), false);
    assert.equal(storedRow(seatId, 'kept_note').tier, 'persistent');
    assert.equal(storedRow(seatId, 'kept_note').content, 'promoted');
    for (const key of ['turn_two', 'turn_three', 'turn_four', 'turn_five']) {
      assert.equal(keyIsStored(seatId, key), true);
    }
  });
});

test('the memory briefing says a new persistent key replaces the oldest note', () => {
  withMemoryDb(() => {
    const text = getInjectionText(seatId, 1);
    assert.match(text, /replaces the oldest persistent note/);
  });
});

test('a full persistent tier evicts only the seat that is being written', () => {
  withMemoryDb(() => {
    fillPersistentSlots();
    storePersistent('seat_note', 1, 'seat note', otherSeatId);
    const result = applyOnTurn(6, [{ action: 'write', key: 'turn_six', tier: 'persistent', content: 'turn six' }]);
    assert.equal(result.appliedCount, 1);
    assert.equal(keyIsStored(seatId, 'turn_one'), false);
    assert.equal(storedRow(otherSeatId, 'seat_note').content, 'seat note');
  });
});
