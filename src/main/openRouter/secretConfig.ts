/**
 * Encrypted `game_config` values shared by the legacy key and the commander stores.
 *
 * Purpose: One envelope format so a secret is encrypted when the platform allows it and stored as plaintext otherwise.
 * When to use: From the legacy key functions and from the commander memory store.
 * Expected outcome: A missing row reads as `''`. An empty write deletes the row.
 * Exceptions: None.
 */

import { safeStorage } from 'electron';
import { logDebug, logError, logTrace } from '../logger';
import { getOne, run } from '../gameDb/dbConnection';

/**
 * One stored secret envelope.
 *
 * Purpose: Matches the JSON already written for the legacy OpenRouter key.
 * When to use: Inside this file only.
 * Expected outcome: `encrypted` when encryption is available, otherwise `key`.
 * Exceptions: None.
 */
interface SecretEnvelope {
  /**
   * Plaintext secret used when encryption is unavailable.
   *
   * Contract: Present only in the fallback envelope.
   * When to use: Reading a row written without encryption.
   * Expected outcome: The stored secret.
   * Exceptions: None.
   */
  readonly key?: string;
  /**
   * Base64 ciphertext used when encryption is available.
   *
   * Contract: Present only in the encrypted envelope.
   * When to use: Reading a row written with encryption.
   * Expected outcome: Decrypted with `safeStorage` when encryption is still available.
   * Exceptions: None.
   */
  readonly encrypted?: string;
}

/**
 * Reads one config row.
 *
 * Purpose: Keeps the SQL for a secret row in one place.
 * When to use: `readSecretString` only.
 * Expected outcome: The stored text, or null when the row is missing.
 * Exceptions: None. A closed database reads as null.
 */
function readConfigRow(configKey: string): string | null {
  const row = getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [configKey]);
  return typeof row?.value === 'string' ? row.value : null;
}

/**
 * Builds the JSON envelope for a non-empty secret.
 *
 * Purpose: Encryption and the plaintext fallback stay in one function.
 * When to use: `writeSecretString` for a non-empty value.
 * Expected outcome: JSON with `encrypted` or `key`. The secret itself is not logged.
 * Exceptions: None.
 */
function envelopeJson(value: string): string {
  const data: SecretEnvelope = safeStorage.isEncryptionAvailable()
    ? { encrypted: Buffer.from(safeStorage.encryptString(value)).toString('base64') }
    : { key: value };
  return JSON.stringify(data);
}

/**
 * A stored secret, separated from a row that was never written.
 *
 * Purpose: A missing row and a row that cannot be decrypted are different.
 * When to use: The result of `readStoredSecret`.
 * Expected outcome: `missing` only when the row is absent. `unreadable` keeps a later write from replacing the row.
 * Exceptions: None.
 */
export type StoredSecret =
  | { readonly status: 'missing' }
  | { readonly status: 'ready'; readonly value: string }
  | { readonly status: 'unreadable'; readonly raw: string | null };

/**
 * Reads a secret and says whether the row was absent or unreadable.
 *
 * Purpose: Seat keys must not treat a failed decrypt as a missing map.
 * When to use: The seat-key reader. `readSecretString` uses it for the legacy key.
 * Expected outcome: `missing` when the row is absent. `ready` with the plaintext when the envelope opens.
 *   `unreadable` when the row exists and cannot be opened. `raw` is the stored text only when parsing or decrypting throws.
 * Exceptions: None. A failed open is logged.
 */
export function readStoredSecret(configKey: string): StoredSecret {
  const stored = readConfigRow(configKey);
  if (stored === null || stored.length === 0) {
    logTrace('secretConfig readStoredSecret', { configKey, status: 'missing' });
    return { status: 'missing' };
  }
  try {
    const parsed = JSON.parse(stored) as SecretEnvelope;
    if (typeof parsed.encrypted === 'string') {
      if (!safeStorage.isEncryptionAvailable()) {
        logError('secretConfig readStoredSecret: encryption is unavailable', { configKey });
        return { status: 'unreadable', raw: null };
      }
      const value = safeStorage.decryptString(Buffer.from(parsed.encrypted, 'base64'));
      logTrace('secretConfig readStoredSecret', { configKey, status: 'ready', hasValue: value.length > 0 });
      return { status: 'ready', value };
    }
    if (typeof parsed.key === 'string') {
      logTrace('secretConfig readStoredSecret', { configKey, status: 'ready', hasValue: parsed.key.length > 0 });
      return { status: 'ready', value: parsed.key };
    }
    logError('secretConfig readStoredSecret: envelope has no secret', { configKey });
    return { status: 'unreadable', raw: null };
  } catch (err) {
    logError('secretConfig readStoredSecret: failed to read stored secret', err);
    return { status: 'unreadable', raw: stored };
  }
}

/**
 * Reads a secret stored in `game_config`.
 *
 * Purpose: Callers get the plaintext without repeating the envelope rules.
 * When to use: The legacy key load, and the commander memory read.
 * Expected outcome: The decrypted or plaintext secret. A missing row, or an envelope that cannot be opened, returns `''`.
 *   A row that cannot be parsed returns the raw stored text.
 * Exceptions: None. Failures are logged by `readStoredSecret`.
 */
export function readSecretString(configKey: string): string {
  const stored = readStoredSecret(configKey);
  if (stored.status === 'ready') return stored.value;
  if (stored.status === 'unreadable' && stored.raw !== null) return stored.raw;
  return '';
}

/**
 * Writes or deletes a secret in `game_config`.
 *
 * Purpose: Empty values remove the row, matching the legacy key clear.
 * When to use: The legacy key save, and the commander memory and seat-key writes.
 * Expected outcome: A trimmed-empty value deletes the row. Any other value is stored as an envelope. The secret is not logged.
 * Exceptions: None. Database failures are logged and not rethrown.
 */
export function writeSecretString(configKey: string, value: string): void {
  logDebug('secretConfig writeSecretString', { configKey, length: value.trim().length });
  try {
    if (!value.trim()) {
      run('DELETE FROM game_config WHERE key = ?', [configKey]);
      return;
    }
    run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [configKey, envelopeJson(value)]);
  } catch (err) {
    logError('secretConfig writeSecretString: failed to write secret', err);
  }
}
