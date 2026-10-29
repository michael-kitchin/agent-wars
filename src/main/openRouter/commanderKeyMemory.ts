/**
 * Remembered commanders and the OpenRouter key stored for each AI seat.
 *
 * Purpose: A new match can fill the first opponent from the last match, and each consultation can use its own key.
 * When to use: From the OpenRouter IPC, match start, and an in-match commander save.
 * Expected outcome: Secrets stay in encrypted `game_config` rows. Flags stay in a plain JSON row. Nothing here logs a key.
 * Exceptions: None.
 */

import type { CommanderKeyMemoryView, RememberedCommander } from '../../shared/commanderSetupCopy';
import type { NewGameSeatInput } from '../../shared/ipc/ordersTypes';
import { AI_SEAT_IDS, aiSeatIdForIndex } from '../../shared/seatIds';
import { AI_SEAT_KIND, DOCTRINE_CHOICES, type DoctrineChoice } from '../../shared/seatRoster';
import { logDebug, logError, logTrace } from '../logger';
import { readSeatApiKeyFlagMap, SEAT_API_KEY_FLAGS_CONFIG_KEY, writeSeatApiKeyFlags } from '../gameDb/seatApiKeyFlags';
import { COMMANDER_MEMORY_CONFIG_KEY, SEAT_API_KEYS_CONFIG_KEY } from '../gameDb/machineLocalConfigKeys';
import { readSecretString, readStoredSecret, writeSecretString } from './secretConfig';

/**
 * A remembered commander with no model and no key.
 *
 * Purpose: A shorter snapshot grows with empty slots up to the commander being saved.
 * When to use: `updateRememberedCommander` when the stored array does not reach that AI number yet.
 * Expected outcome: Balanced doctrine and an empty key.
 * Exceptions: None.
 */
function emptyRememberedCommander(): RememberedCommander {
  return { modelId: null, reasoningEffort: null, doctrineChoice: 'balanced', apiKey: '' };
}

/**
 * Keeps a stored doctrine choice, or Balanced when the value is not one this game stores.
 *
 * Purpose: A bad snapshot row still has a legal choice.
 * When to use: While reading or writing a remembered commander.
 * Expected outcome: The same choice when it is listed. Otherwise `'balanced'`.
 * Exceptions: None.
 */
function doctrineChoiceOf(value: unknown): DoctrineChoice {
  return (DOCTRINE_CHOICES as readonly string[]).includes(String(value)) ? (value as DoctrineChoice) : 'balanced';
}

/**
 * Copies one stored object into a remembered commander.
 *
 * Purpose: A snapshot row is trusted only after its fields have a legal shape.
 * When to use: While reading the remembered array.
 * Expected outcome: Strings are trimmed. A missing key becomes `''`. The key is not logged.
 * Exceptions: None.
 */
function rememberedFromUnknown(value: unknown): RememberedCommander {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    modelId: typeof record.modelId === 'string' ? record.modelId : null,
    reasoningEffort: typeof record.reasoningEffort === 'string' ? record.reasoningEffort : null,
    doctrineChoice: doctrineChoiceOf(record.doctrineChoice),
    apiKey: typeof record.apiKey === 'string' ? record.apiKey.trim() : '',
  };
}

/**
 * Reads the remembered array.
 *
 * Purpose: Callers can tell a missing snapshot from a stored array.
 * When to use: The public read and the in-match update.
 * Expected outcome: Null when the row is missing or unreadable. An array, including an empty one, when the row exists.
 * Exceptions: None. A bad row is logged.
 */
function readStoredCommanders(): RememberedCommander[] | null {
  const raw = readSecretString(COMMANDER_MEMORY_CONFIG_KEY);
  if (raw.length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      logError('commanderKeyMemory readStoredCommanders: stored commanders are not an array');
      return null;
    }
    return parsed.map(rememberedFromUnknown);
  } catch (err) {
    logError('commanderKeyMemory readStoredCommanders: failed to parse stored commanders', err);
    return null;
  }
}

/**
 * A seat-key row, separated from a row that was never written.
 *
 * Purpose: A missing map may use the legacy key. An unreadable map must not.
 * When to use: `readSeatApiKey` and `writeSeatApiKey`.
 * Expected outcome: `missing` is true only when the row is absent. `keys` is null when the row cannot be read.
 * Exceptions: None.
 */
interface StoredSeatKeys {
  /**
   * Whether the encrypted seat-key row is absent.
   *
   * Contract: True only when the stored secret is empty.
   * When to use: Deciding whether to return the legacy key.
   * Expected outcome: False when a map was written, even if that map is unreadable.
   * Exceptions: None.
   */
  readonly missing: boolean;
  /**
   * Seat id to stored key.
   *
   * Contract: Null when the row is missing or unreadable. Otherwise the stored strings.
   * When to use: The seat-key read and the single-seat merge.
   * Expected outcome: A missing seat is absent from the object.
   * Exceptions: None.
   */
  readonly keys: Readonly<Record<string, string>> | null;
}

/**
 * Reads the seat-key object.
 *
 * Purpose: A missing map falls back to the legacy key. A stored map does not.
 * When to use: `readSeatApiKey` and `writeSeatApiKey`.
 * Expected outcome: `missing` when the row is absent. An object when the row exists. `keys` null when the row is unreadable.
 * Exceptions: None. A bad row is logged.
 */
function readStoredSeatKeys(): StoredSeatKeys {
  const stored = readStoredSecret(SEAT_API_KEYS_CONFIG_KEY);
  if (stored.status === 'missing') return { missing: true, keys: null };
  if (stored.status === 'unreadable') {
    logError('commanderKeyMemory readStoredSeatKeys: stored seat keys are unreadable');
    return { missing: false, keys: null };
  }
  try {
    const parsed = JSON.parse(stored.value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      logError('commanderKeyMemory readStoredSeatKeys: stored seat keys are not an object');
      return { missing: false, keys: null };
    }
    const keys: Record<string, string> = {};
    for (const [seatId, value] of Object.entries(parsed)) keys[seatId] = typeof value === 'string' ? value : '';
    return { missing: false, keys };
  } catch (err) {
    logError('commanderKeyMemory readStoredSeatKeys: failed to parse stored seat keys', err);
    return { missing: false, keys: null };
  }
}

/**
 * Reads the remembered match and the key that fills the first AI row.
 *
 * Purpose: The screen does not decrypt config itself.
 * When to use: The commander-memory IPC. Pass the legacy key from the caller.
 * Expected outcome: No snapshot yields `hasPreviousMatch` false and `prefillApiKey` equal to `legacyKey`.
 *   A snapshot yields true, the stored array, and the first entry's key. `legacyKey` is ignored then.
 * Exceptions: None.
 */
export function readCommanderKeyMemory(legacyKey: string): CommanderKeyMemoryView {
  const stored = readStoredCommanders();
  const view: CommanderKeyMemoryView = stored === null
    ? { hasPreviousMatch: false, prefillApiKey: legacyKey, previousMatch: [] }
    : { hasPreviousMatch: true, prefillApiKey: stored[0]?.apiKey ?? '', previousMatch: stored };
  logTrace('commanderKeyMemory readCommanderKeyMemory', {
    hasPreviousMatch: view.hasPreviousMatch,
    hasPrefill: view.prefillApiKey.length > 0,
    count: view.previousMatch.length,
  });
  return view;
}

/**
 * Replaces the remembered commander array.
 *
 * Purpose: Match start stores every AI opponent that was on the new-game screen.
 * When to use: `storeNewMatchCommanderKeys` only.
 * Expected outcome: Each key is trimmed. The previous array is discarded.
 * Exceptions: None.
 */
export function writeCommanderKeyMemory(commanders: readonly RememberedCommander[]): void {
  const trimmed = commanders.map((commander) => ({ ...commander, apiKey: commander.apiKey.trim() }));
  logDebug('commanderKeyMemory writeCommanderKeyMemory', {
    count: trimmed.length,
    keyedCount: trimmed.filter((commander) => commander.apiKey.length > 0).length,
  });
  writeSecretString(COMMANDER_MEMORY_CONFIG_KEY, JSON.stringify(trimmed));
}

/**
 * Replaces one AI number in the remembered array.
 *
 * Purpose: A commander saved during a match becomes what the next game copies.
 * When to use: The in-match commander save. `aiNumber` is 1-based.
 * Expected outcome: That slot is replaced. A missing snapshot is created. Shorter arrays gain empty commanders up to that slot.
 *   `hasPreviousMatch` becomes true.
 * Exceptions: None. An AI number outside 1 through 4 is logged and ignored.
 */
export function updateRememberedCommander(aiNumber: number, commander: RememberedCommander): void {
  logDebug('commanderKeyMemory updateRememberedCommander', {
    aiNumber,
    hasModel: typeof commander.modelId === 'string' && commander.modelId.length > 0,
    hasApiKey: commander.apiKey.trim().length > 0,
  });
  if (!Number.isInteger(aiNumber) || aiNumber < 1 || aiNumber > AI_SEAT_IDS.length) {
    logError('commanderKeyMemory updateRememberedCommander: AI number out of range', { aiNumber });
    return;
  }
  const next = [...(readStoredCommanders() ?? [])];
  while (next.length < aiNumber - 1) next.push(emptyRememberedCommander());
  next[aiNumber - 1] = { ...commander, apiKey: commander.apiKey.trim(), doctrineChoice: doctrineChoiceOf(commander.doctrineChoice) };
  writeSecretString(COMMANDER_MEMORY_CONFIG_KEY, JSON.stringify(next));
}

/**
 * Reads the key stored for one seat.
 *
 * Purpose: A consultation sends that seat's key, not a shared one.
 * When to use: `requestOrders` and the in-match password field. Pass the legacy key from the caller.
 * Expected outcome: The stored string, including `''`, when the map exists. A seat missing from an existing map returns `''`.
 *   A missing map returns `legacyKey`.
 * Exceptions: None. An unreadable map returns `''`.
 */
export function readSeatApiKey(seatId: string, legacyKey: string): string {
  const stored = readStoredSeatKeys();
  const value = stored.missing ? legacyKey : (stored.keys?.[seatId] ?? '');
  logTrace('commanderKeyMemory readSeatApiKey', { seatId, mapMissing: stored.missing, hasKey: value.length > 0 });
  return value;
}

/**
 * Stores one seat's key and leaves the other seats in place.
 *
 * Purpose: An in-match edit changes one opponent.
 * When to use: The in-match commander save when the payload includes a key.
 * Expected outcome: The trimmed key is merged into the encrypted map. The flag is true when that key is non-empty.
 *   When no map exists yet, every AI seat is seeded from `legacyKey` first, so the other seats keep the legacy key.
 * Exceptions: None. An unreadable existing map is logged and left unchanged.
 */
export function writeSeatApiKey(seatId: string, apiKey: string, legacyKey = ''): void {
  const trimmed = apiKey.trim();
  const legacy = legacyKey.trim();
  logDebug('commanderKeyMemory writeSeatApiKey', {
    seatId,
    hasApiKey: trimmed.length > 0,
    hasLegacy: legacy.length > 0,
    flagsKey: SEAT_API_KEY_FLAGS_CONFIG_KEY,
  });
  const stored = readStoredSeatKeys();
  if (!stored.missing && stored.keys === null) {
    logError('commanderKeyMemory writeSeatApiKey: stored seat keys are unreadable', { seatId });
    return;
  }
  const next: Record<string, string> = stored.missing
    ? Object.fromEntries(AI_SEAT_IDS.map((id) => [id, legacy]))
    : { ...stored.keys };
  next[seatId] = trimmed;
  writeSecretString(SEAT_API_KEYS_CONFIG_KEY, JSON.stringify(next));
  const flags: Record<string, boolean> = { ...readSeatApiKeyFlagMap() };
  if (stored.missing) {
    for (const id of AI_SEAT_IDS) flags[id] = (next[id] ?? '').length > 0;
  }
  flags[seatId] = trimmed.length > 0;
  writeSeatApiKeyFlags(flags);
}

/**
 * Replaces the seat-key map and the flag object together.
 *
 * Purpose: Match start writes every AI seat, including seats whose key is empty.
 * When to use: `storeNewMatchCommanderKeys` only.
 * Expected outcome: The encrypted map and the flag row both match `entries`. A trimmed non-empty key sets that flag.
 * Exceptions: None.
 */
export function writeSeatApiKeys(entries: readonly { seatId: string; apiKey: string }[]): void {
  const keys: Record<string, string> = {};
  const flags: Record<string, boolean> = {};
  for (const entry of entries) {
    const trimmed = entry.apiKey.trim();
    keys[entry.seatId] = trimmed;
    flags[entry.seatId] = trimmed.length > 0;
  }
  logDebug('commanderKeyMemory writeSeatApiKeys', { count: entries.length, flagsKey: SEAT_API_KEY_FLAGS_CONFIG_KEY });
  writeSecretString(SEAT_API_KEYS_CONFIG_KEY, JSON.stringify(keys));
  writeSeatApiKeyFlags(flags);
}

/**
 * Stores seat keys and the remembered array for a new match.
 *
 * Purpose: Starting a match is the snapshot the next game reads.
 * When to use: After the roster has been reset, from the new-game handler.
 * Expected outcome: A missing `seats` array writes nothing. Otherwise each AI row, in payload order, is paired with
 *   `aiSeatIdForIndex`. A missing `apiKey` stores `legacyKey`. A present string is trimmed and stored, including `''`.
 * Exceptions: None. More AI rows than this game allows are logged and skipped.
 */
export function storeNewMatchCommanderKeys(seats: readonly NewGameSeatInput[] | undefined, legacyKey: string): void {
  if (seats === undefined) {
    logDebug('commanderKeyMemory storeNewMatchCommanderKeys', { wrote: false });
    return;
  }
  const entries: { seatId: string; apiKey: string }[] = [];
  const remembered: RememberedCommander[] = [];
  let aiNumber = 0;
  for (const seat of seats) {
    if (seat.kind !== AI_SEAT_KIND) continue;
    aiNumber += 1;
    if (aiNumber > AI_SEAT_IDS.length) {
      logError('commanderKeyMemory storeNewMatchCommanderKeys: too many AI seats', { aiNumber });
      break;
    }
    const provided = seat.commander?.apiKey;
    const apiKey = provided === undefined ? legacyKey.trim() : provided.trim();
    entries.push({ seatId: aiSeatIdForIndex(aiNumber), apiKey });
    remembered.push({
      modelId: seat.commander?.modelId ?? null,
      reasoningEffort: seat.commander?.reasoningEffort ?? null,
      doctrineChoice: doctrineChoiceOf(seat.commander?.doctrineChoice),
      apiKey,
    });
  }
  writeSeatApiKeys(entries);
  writeCommanderKeyMemory(remembered);
  logDebug('commanderKeyMemory storeNewMatchCommanderKeys', { wrote: true, aiCount: remembered.length });
}
