/* eslint-disable @typescript-eslint/no-require-imports -- commander memory loads Electron, so this file requires it after the mock. */
/**
 * Remembered commanders and the key stored for each AI seat.
 *
 * The key strings in this file are for testing.
 * Run: `node dist/main/openRouter/commanderKeyMemory.test.js`
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import Module = require('module');
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { closeGameDatabaseForTests, openGameDatabaseAtPathForTests } from '../gameDb';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import type { CommanderKeyMemoryView, RememberedCommander } from '../../shared/commanderSetupCopy';

/**
 * The memory module's public functions, loaded after the Electron mock.
 *
 * Purpose: The test calls the store without importing it at module scope.
 * When to use: The case in this file.
 * Expected outcome: The same functions the main process exports.
 * Exceptions: None.
 */
interface CommanderKeyMemoryApi {
  /**
   * Reads the remembered match.
   *
   * Contract: `legacyKey` is the prefill only when no snapshot is stored.
   * When to use: The cases in this file.
   * Expected outcome: A `CommanderKeyMemoryView`.
   * Exceptions: None.
   */
  readCommanderKeyMemory: (legacyKey: string) => CommanderKeyMemoryView;
  /**
   * Replaces the remembered array.
   *
   * Contract: Trims each key.
   * When to use: The round-trip case.
   * Expected outcome: The next read returns those commanders.
   * Exceptions: None.
   */
  writeCommanderKeyMemory: (commanders: readonly RememberedCommander[]) => void;
  /**
   * Replaces one AI number in the remembered array.
   *
   * Contract: `aiNumber` is 1-based.
   * When to use: The update case.
   * Expected outcome: That slot changes. Earlier slots stay.
   * Exceptions: None.
   */
  updateRememberedCommander: (aiNumber: number, commander: RememberedCommander) => void;
  /**
   * Reads one seat's key.
   *
   * Contract: A missing map returns `legacyKey`. A stored empty string stays empty.
   * When to use: The seat-key cases.
   * Expected outcome: The stored string or the legacy key.
   * Exceptions: None.
   */
  readSeatApiKey: (seatId: string, legacyKey: string) => string;
  /**
   * Merges one seat's key.
   *
   * Contract: Other seats stay. A missing map copies `legacyKey` onto every AI seat first. An unreadable map is left unchanged.
   * When to use: The merge case and the first save before a map exists.
   * Expected outcome: That seat changes. The other seat's key stays.
   * Exceptions: None.
   */
  writeSeatApiKey: (seatId: string, apiKey: string, legacyKey?: string) => void;
  /**
   * Replaces the seat-key map.
   *
   * Contract: Seats omitted from `entries` are absent afterwards.
   * When to use: The empty-key and omitted-seat cases.
   * Expected outcome: The next read sees only those entries.
   * Exceptions: None.
   */
  writeSeatApiKeys: (entries: readonly { seatId: string; apiKey: string }[]) => void;
  /**
   * Stores a new match, or does nothing when `seats` is missing.
   *
   * Contract: `undefined` does not create a map.
   * When to use: The skip case and the human-first case.
   * Expected outcome: AI rows are stored in payload order.
   * Exceptions: None.
   */
  storeNewMatchCommanderKeys: (
    seats: readonly {
      kind: 'human' | 'ai';
      commander?: {
        modelId: string | null;
        reasoningEffort: string | null;
        doctrineChoice: RememberedCommander['doctrineChoice'];
        apiKey?: string;
      };
    }[] | undefined,
    legacyKey: string
  ) => void;
}

/**
 * Installs a stand-in Electron so secret storage can load under Node.
 *
 * Purpose: The store encrypts through Electron safe storage.
 * When to use: Before the first import of the memory module in this file.
 * Expected outcome: Encryption is reported unavailable, so the envelope keeps the plaintext field. The returned function restores module loading.
 * Exceptions: None.
 */
function installElectronMock(): () => void {
  const originalLoad = (Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load;
  (Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load = function patchedLoad(
    request: string,
    parent: unknown,
    isMain: boolean
  ) {
    if (request === 'electron') {
      return {
        app: { getPath: () => os.tmpdir() },
        safeStorage: {
          isEncryptionAvailable: () => false,
          encryptString: (value: string) => Buffer.from(value, 'utf8'),
          decryptString: (value: Buffer) => value.toString('utf8'),
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  return () => {
    (Module as unknown as { _load: typeof originalLoad })._load = originalLoad;
  };
}

/**
 * One remembered commander for this file.
 *
 * Purpose: The cases differ by model and key.
 * When to use: Inside the case below.
 * Expected outcome: A balanced commander with the given model and key.
 * Exceptions: None.
 */
function remembered(modelId: string, apiKey: string, reasoningEffort: string | null = null): RememberedCommander {
  return { modelId, reasoningEffort, doctrineChoice: 'balanced', apiKey };
}

test('commander memory keeps seat keys and the remembered match', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-commander-key-'));
  const restoreElectron = installElectronMock();
  const logger = require('../logger') as {
    logDebug: (...args: unknown[]) => void;
    logError: (...args: unknown[]) => void;
    logTrace: (...args: unknown[]) => void;
  };
  const lines: string[] = [];
  const originalDebug = logger.logDebug;
  const originalError = logger.logError;
  const originalTrace = logger.logTrace;
  logger.logDebug = (...args: unknown[]) => {
    lines.push(JSON.stringify(args));
    originalDebug(...args);
  };
  logger.logError = (...args: unknown[]) => {
    lines.push(JSON.stringify(args));
    originalError(...args);
  };
  logger.logTrace = (...args: unknown[]) => {
    lines.push(JSON.stringify(args));
    originalTrace(...args);
  };
  const memory = require('./commanderKeyMemory') as CommanderKeyMemoryApi;
  openGameDatabaseAtPathForTests(path.join(dir, 't.sqlite'));
  try {
    const firstSeat = AI_SEAT_IDS[0];
    const secondSeat = AI_SEAT_IDS[1];
    assert.equal(memory.readSeatApiKey(firstSeat, 'test-openrouter-key'), 'test-openrouter-key');
    memory.storeNewMatchCommanderKeys(undefined, 'test-openrouter-key');
    assert.equal(memory.readSeatApiKey(firstSeat, 'test-openrouter-key'), 'test-openrouter-key');
    memory.writeSeatApiKey(secondSeat, 'test-openrouter-key-b', 'test-openrouter-key');
    assert.equal(memory.readSeatApiKey(firstSeat, 'unused-legacy'), 'test-openrouter-key');
    assert.equal(memory.readSeatApiKey(secondSeat, 'unused-legacy'), 'test-openrouter-key-b');
    assert.equal(memory.readSeatApiKey(AI_SEAT_IDS[2], 'unused-legacy'), 'test-openrouter-key');
    const flags = require('../gameDb/seatApiKeyFlags') as { readSeatHasApiKey: (seatId: string) => boolean };
    assert.equal(flags.readSeatHasApiKey(firstSeat), true);
    assert.equal(flags.readSeatHasApiKey(secondSeat), true);
    const empty = memory.readCommanderKeyMemory('test-openrouter-key');
    assert.equal(empty.hasPreviousMatch, false);
    assert.equal(empty.prefillApiKey, 'test-openrouter-key');
    assert.deepEqual(empty.previousMatch, []);

    memory.writeCommanderKeyMemory([
      remembered('model-a', ' test-openrouter-key '),
      remembered('model-b', 'test-openrouter-key-b', 'low'),
    ]);
    const stored = memory.readCommanderKeyMemory('unused-legacy');
    assert.equal(stored.hasPreviousMatch, true);
    assert.equal(stored.prefillApiKey, 'test-openrouter-key');
    assert.equal(stored.previousMatch[1]?.modelId, 'model-b');
    assert.equal(stored.previousMatch[1]?.apiKey, 'test-openrouter-key-b');

    memory.writeSeatApiKeys([{ seatId: firstSeat, apiKey: '' }]);
    assert.equal(memory.readSeatApiKey(firstSeat, 'test-openrouter-key'), '');
    memory.writeSeatApiKeys([{ seatId: firstSeat, apiKey: 'test-openrouter-key' }]);
    assert.equal(memory.readSeatApiKey(secondSeat, 'test-openrouter-key'), '');
    memory.writeSeatApiKey(secondSeat, 'test-openrouter-key-b');
    assert.equal(memory.readSeatApiKey(firstSeat, 'test-openrouter-key'), 'test-openrouter-key');
    assert.equal(memory.readSeatApiKey(secondSeat, 'other-legacy'), 'test-openrouter-key-b');

    memory.writeCommanderKeyMemory([remembered('model-a', 'test-openrouter-key')]);
    memory.updateRememberedCommander(2, remembered('model-b', 'test-openrouter-key-b'));
    const updated = memory.readCommanderKeyMemory('unused-legacy');
    assert.equal(updated.previousMatch[0]?.modelId, 'model-a');
    assert.equal(updated.previousMatch[0]?.apiKey, 'test-openrouter-key');
    assert.equal(updated.previousMatch[1]?.modelId, 'model-b');
    assert.equal(updated.hasPreviousMatch, true);

    memory.storeNewMatchCommanderKeys(
      [
        { kind: 'human' },
        { kind: 'ai', commander: remembered('model-a', 'test-openrouter-key') },
        { kind: 'ai', commander: { modelId: 'model-b', reasoningEffort: 'low', doctrineChoice: 'balanced' } },
      ],
      'legacy-should-not-replace'
    );
    assert.equal(memory.readSeatApiKey(firstSeat, 'legacy-should-not-replace'), 'test-openrouter-key');
    assert.equal(memory.readSeatApiKey(secondSeat, 'legacy-should-not-replace'), 'legacy-should-not-replace');
    const db = require('../gameDb/dbConnection') as {
      getOne: <T>(sql: string, params: unknown[]) => T | undefined;
      run: (sql: string, params: unknown[]) => void;
    };
    const corrupt = '{"encrypted":"not-a-key"}';
    db.run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', ['openrouter_seat_api_keys', corrupt]);
    assert.equal(memory.readSeatApiKey(firstSeat, 'test-openrouter-key'), '');
    memory.writeSeatApiKey(firstSeat, 'test-openrouter-key-b', 'test-openrouter-key');
    const row = db.getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', ['openrouter_seat_api_keys']);
    assert.equal(row?.value, corrupt);

    const logged = lines.join('\n');
    assert.equal(logged.includes('test-openrouter-key'), false);
    assert.equal(logged.includes('test-openrouter-key-b'), false);
  } finally {
    logger.logDebug = originalDebug;
    logger.logError = originalError;
    logger.logTrace = originalTrace;
    closeGameDatabaseForTests();
    restoreElectron();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
