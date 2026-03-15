/**
 * MCP Tool 4: Strategic Memory (memory_write, memory_read, memory_delete).
 * All memory logic lives here: expire, recurring trigger, CRUD with tier limits, and injection text.
 * Uses gameDb (dbRun, dbGetOne, dbGetAll, saveDatabase) for persistence.
 */

import { dbRun, dbGetOne, dbGetAll, saveDatabase } from '../gameDb';
import { logDebug, logError, logTrace } from '../logger';

const PERSISTENT_LIMIT = 5;
const STORED_LIMIT = 15;
const CONTENT_MAX_LENGTH = 500;
const KEY_PATTERN = /^[a-zA-Z0-9_-]+$/;
const KEY_MAX_LENGTH = 64;
const AI_PLAYER_ID = 'opponent';

interface MemoryRow {
  [key: string]: unknown;
  player_id: string;
  key: string;
  content: string;
  tier: string;
  created_turn: number;
  expires_turn: number | null;
  recurring_interval: number | null;
  next_trigger_turn: number | null;
  last_triggered_turn: number | null;
  tags: string;
}

interface WriteOptions {
  expiresOnTurn?: number;
  recurring?: { intervalTurns: number; nextTurn?: number };
  tags?: string[];
}

/**
 * Expires memories whose expires_turn <= currentTurn and advances recurring reminders.
 * Call at the start of each AI turn when building the injection block. Mutates DB; saveDatabase is called after updates.
 * Idempotent for a given (playerId, currentTurn) when called once per turn.
 */
function expireAndProcessRecurring(playerId: string, currentTurn: number): void {
  logDebug('tool4Memory expireAndProcessRecurring', { playerId, currentTurn });
  dbRun(
    'DELETE FROM ai_memory WHERE player_id = ? AND expires_turn IS NOT NULL AND expires_turn <= ?',
    [playerId, currentTurn]
  );
  const toTrigger = dbGetAll<MemoryRow>(
    'SELECT * FROM ai_memory WHERE player_id = ? AND recurring_interval IS NOT NULL AND next_trigger_turn <= ?',
    [playerId, currentTurn]
  );
  for (const row of toTrigger) {
    dbRun(
      'UPDATE ai_memory SET last_triggered_turn = ?, next_trigger_turn = ? WHERE player_id = ? AND key = ?',
      [currentTurn, currentTurn + (row.recurring_interval ?? 0), playerId, row.key]
    );
  }
  saveDatabase();
}

/**
 * Builds the strategic memory injection block for the system prompt (persistent list, reminders triggered this turn, footer with slot counts).
 * Call only when Memory tool group is enabled; openRouter must not call when Memory is disabled. Runs expireAndProcessRecurring first so expired and recurring state are up to date.
 */
export function getInjectionText(playerId: string, currentTurn: number): string {
  logTrace('tool4Memory getInjectionText', { playerId, currentTurn });
  expireAndProcessRecurring(playerId, currentTurn);

  const persistent = dbGetAll<MemoryRow>(
    'SELECT * FROM ai_memory WHERE player_id = ? AND tier = ? ORDER BY key',
    [playerId, 'persistent']
  );
  const triggered = dbGetAll<MemoryRow>(
    'SELECT * FROM ai_memory WHERE player_id = ? AND last_triggered_turn = ? ORDER BY key',
    [playerId, currentTurn]
  );
  const storedCount = dbGetOne<{ c: number }>(
    'SELECT COUNT(*) AS c FROM ai_memory WHERE player_id = ? AND tier = ?',
    [playerId, 'stored']
  )?.c ?? 0;
  const persistentCount = persistent.length;

  const storedNotTriggered = dbGetAll<MemoryRow>(
    'SELECT * FROM ai_memory WHERE player_id = ? AND tier = ? AND (last_triggered_turn IS NULL OR last_triggered_turn != ?)',
    [playerId, 'stored', currentTurn]
  );
  const tagsFromStoredNotTriggered = new Set<string>();
  for (const row of storedNotTriggered) {
    try {
      const arr = JSON.parse(row.tags || '[]') as string[];
      arr.forEach((t) => tagsFromStoredNotTriggered.add(t));
    } catch {
      /* ignore malformed tags */
    }
  }
  const storedNotTriggeredSummary =
    storedNotTriggered.length === 0
      ? ''
      : `Stored memories not shown this turn: ${storedNotTriggered.length} (tags: ${[...tagsFromStoredNotTriggered].sort().join(', ') || 'none'}). These are withheld until their reminder triggers; use memory_read to retrieve by key or tag.`;

  const lines: string[] = [];
  lines.push(`=== YOUR STRATEGIC MEMORY (Turn ${currentTurn}) ===`);
  lines.push('');
  lines.push('[PERSISTENT - your active strategic context]');
  if (persistent.length === 0) {
    lines.push('(none)');
  } else {
    for (const row of persistent) {
      lines.push(`- ${row.key} (set turn ${row.created_turn}): "${row.content}"`);
    }
  }
  lines.push('');
  lines.push('[REMINDERS TRIGGERED THIS TURN]');
  if (triggered.length === 0) {
    lines.push('(none)');
  } else {
    for (const row of triggered) {
      const tierLabel = row.tier === 'persistent' ? 'also persistent' : 'stored';
      const recurLabel =
        row.recurring_interval != null
          ? `, recurring every ${row.recurring_interval} turns`
          : '';
      lines.push(`- ${row.key} (${tierLabel}${recurLabel}): "${row.content}"`);
    }
  }
  lines.push('');
  lines.push(
    `Persistent: ${persistentCount} of ${PERSISTENT_LIMIT} slots used. Stored: ${storedCount} of ${STORED_LIMIT} slots used.`
  );
  if (storedNotTriggeredSummary) {
    lines.push(storedNotTriggeredSummary);
  }
  lines.push('Use memory_write to store or update. Use memory_read to retrieve stored memories by key or tag. Use memory_delete to free slots.');
  return lines.join('\n');
}

function countByTier(playerId: string): { persistent: number; stored: number } {
  const p = dbGetOne<{ c: number }>('SELECT COUNT(*) AS c FROM ai_memory WHERE player_id = ? AND tier = ?', [
    playerId,
    'persistent',
  ])?.c ?? 0;
  const s = dbGetOne<{ c: number }>('SELECT COUNT(*) AS c FROM ai_memory WHERE player_id = ? AND tier = ?', [
    playerId,
    'stored',
  ])?.c ?? 0;
  return { persistent: p, stored: s };
}

/**
 * Writes or updates a memory. Validates key (pattern and length), content (non-empty, max 500 chars), and tier limits.
 * When options.recurring is present and nextTurn is omitted, sets next_trigger_turn to currentTurn + intervalTurns.
 * Returns spec-shaped success with slot counts or error (tier full, content empty, key invalid, etc.).
 */
function write(
  playerId: string,
  key: string,
  content: string,
  tier: 'persistent' | 'stored',
  options: WriteOptions | undefined,
  currentTurn: number
): { status: string; error?: string; key?: string; tier?: string; action?: string; persistentCount?: number; persistentLimit?: number; storedCount?: number; storedLimit?: number } {
  logDebug('tool4Memory write', { playerId, key, tier, currentTurn });

  if (content.length === 0) {
    return { status: 'error', error: 'Content cannot be empty' };
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    return { status: 'error', error: `Content exceeds 500 character limit (${content.length} characters provided)` };
  }
  if (!KEY_PATTERN.test(key) || key.length > KEY_MAX_LENGTH) {
    return { status: 'error', error: 'Key must be alphanumeric with underscores and hyphens only' };
  }

  const existing = dbGetOne<MemoryRow>('SELECT * FROM ai_memory WHERE player_id = ? AND key = ?', [playerId, key]);
  const counts = countByTier(playerId);

  let targetTier = tier;
  let oldTier: 'persistent' | 'stored' | null = existing ? (existing.tier as 'persistent' | 'stored') : null;

  if (existing) {
    if (existing.tier !== tier) {
      const destCount = tier === 'persistent' ? counts.persistent : counts.stored;
      const limit = tier === 'persistent' ? PERSISTENT_LIMIT : STORED_LIMIT;
      if (destCount >= limit) {
        return {
          status: 'error',
          error:
            tier === 'persistent'
              ? 'Persistent memory full (5/5). Delete a persistent memory or use tier \'stored\' instead.'
              : 'Stored memory full (15/15). Delete a stored memory or promote an important one to \'persistent\' tier.',
        };
      }
    }
  } else {
    const limit = tier === 'persistent' ? PERSISTENT_LIMIT : STORED_LIMIT;
    const count = tier === 'persistent' ? counts.persistent : counts.stored;
    if (count >= limit) {
      return {
        status: 'error',
        error:
          tier === 'persistent'
            ? 'Persistent memory full (5/5). Delete a persistent memory or use tier \'stored\' instead.'
            : 'Stored memory full (15/15). Delete a stored memory or promote an important one to \'persistent\' tier.',
      };
    }
  }

  const expiresTurn = options?.expiresOnTurn ?? null;
  let recurringInterval: number | null = null;
  let nextTriggerTurn: number | null = null;
  if (options?.recurring != null) {
    recurringInterval = options.recurring.intervalTurns;
    nextTriggerTurn = options.recurring.nextTurn ?? currentTurn + options.recurring.intervalTurns;
  }
  const tagsJson = JSON.stringify(options?.tags ?? []);

  if (existing) {
    dbRun(
      `UPDATE ai_memory SET content = ?, tier = ?, expires_turn = ?, recurring_interval = ?, next_trigger_turn = ?, tags = ? WHERE player_id = ? AND key = ?`,
      [content, tier, expiresTurn, recurringInterval, nextTriggerTurn, tagsJson, playerId, key]
    );
    saveDatabase();
    const after = countByTier(playerId);
    return {
      status: 'ok',
      key,
      tier,
      action: 'updated',
      persistentCount: after.persistent,
      persistentLimit: PERSISTENT_LIMIT,
      storedCount: after.stored,
      storedLimit: STORED_LIMIT,
    };
  }

  dbRun(
    `INSERT INTO ai_memory (player_id, key, content, tier, created_turn, expires_turn, recurring_interval, next_trigger_turn, last_triggered_turn, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [playerId, key, content, tier, currentTurn, expiresTurn, recurringInterval, nextTriggerTurn, null, tagsJson]
  );
  saveDatabase();
  const after = countByTier(playerId);
  return {
    status: 'ok',
    key,
    tier,
    action: 'created',
    persistentCount: after.persistent,
    persistentLimit: PERSISTENT_LIMIT,
    storedCount: after.stored,
    storedLimit: STORED_LIMIT,
  };
}

function rowToMemory(row: MemoryRow): {
  key: string;
  content: string;
  tier: string;
  createdOnTurn: number;
  lastTriggered: number | null;
  tags: string[];
  recurring?: { intervalTurns: number; nextTurn: number };
} {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags || '[]') as string[];
  } catch {
    tags = [];
  }
  const out: {
    key: string;
    content: string;
    tier: string;
    createdOnTurn: number;
    lastTriggered: number | null;
    tags: string[];
    recurring?: { intervalTurns: number; nextTurn: number };
  } = {
    key: row.key,
    content: row.content,
    tier: row.tier,
    createdOnTurn: row.created_turn,
    lastTriggered: row.last_triggered_turn,
    tags,
  };
  if (row.recurring_interval != null && row.next_trigger_turn != null) {
    out.recurring = { intervalTurns: row.recurring_interval, nextTurn: row.next_trigger_turn };
  }
  return out;
}

/**
 * Reads one memory by key or multiple by tags/tier/all. When key is provided, returns that memory or error "Memory not found: {key}".
 * When key is omitted, at least one of tags, tier, or all must be provided; otherwise returns error. Tags match any; tier filters; all returns all for player.
 */
function read(
  playerId: string,
  key?: string,
  tags?: string[],
  tier?: 'persistent' | 'stored',
  all?: boolean
): { status: string; error?: string; memories?: ReturnType<typeof rowToMemory>[] } {
  logTrace('tool4Memory read', { playerId, key, tier, all });

  if (key != null && key !== '') {
    const row = dbGetOne<MemoryRow>('SELECT * FROM ai_memory WHERE player_id = ? AND key = ?', [playerId, key]);
    if (!row) {
      return { status: 'error', error: `Memory not found: ${key}` };
    }
    return { status: 'ok', memories: [rowToMemory(row)] };
  }

  if (tags == null && tier == null && all !== true) {
    return { status: 'error', error: 'memory_read requires at least one of: key, tags, tier, or all' };
  }

  let rows: MemoryRow[] = [];
  if (all === true) {
    rows = dbGetAll<MemoryRow>('SELECT * FROM ai_memory WHERE player_id = ? ORDER BY key', [playerId]);
  } else if (tier != null && (tags == null || tags.length === 0)) {
    rows = dbGetAll<MemoryRow>('SELECT * FROM ai_memory WHERE player_id = ? AND tier = ? ORDER BY key', [
      playerId,
      tier,
    ]);
  } else if (tags != null && tags.length > 0) {
    rows = dbGetAll<MemoryRow>(
      tier != null
        ? 'SELECT * FROM ai_memory WHERE player_id = ? AND tier = ? ORDER BY key'
        : 'SELECT * FROM ai_memory WHERE player_id = ? ORDER BY key',
      tier != null ? [playerId, tier] : [playerId]
    );
    const tagSet = new Set(tags);
    rows = rows.filter((row) => {
      let arr: string[] = [];
      try {
        arr = JSON.parse(row.tags || '[]') as string[];
      } catch {
        return false;
      }
      return arr.some((t) => tagSet.has(t));
    });
  } else {
    rows = dbGetAll<MemoryRow>('SELECT * FROM ai_memory WHERE player_id = ? ORDER BY key', [playerId]);
  }

  const memories = rows.map(rowToMemory);
  return { status: 'ok', memories };
}

/**
 * Deletes a memory by key. Returns spec-shaped success or error "Memory not found: {key}" when no row exists.
 */
function deleteByKey(
  playerId: string,
  key: string
): { status: string; error?: string; key?: string; deleted?: boolean } {
  logDebug('tool4Memory deleteByKey', { playerId, key });
  const existing = dbGetOne<MemoryRow>('SELECT 1 FROM ai_memory WHERE player_id = ? AND key = ?', [playerId, key]);
  if (!existing) {
    return { status: 'error', error: `Memory not found: ${key}` };
  }
  dbRun('DELETE FROM ai_memory WHERE player_id = ? AND key = ?', [playerId, key]);
  saveDatabase();
  return { status: 'ok', key, deleted: true };
}

/** Tool names for Tool 4. Exported so OpenRouter can route memory_write, memory_read, memory_delete to this module. */
export const TOOL4_NAMES = ['memory_write', 'memory_read', 'memory_delete'] as const;

/**
 * Dispatcher for Tool 4 (Strategic Memory). Same signature as Tools 1–3 for consistency (latLngByH3 and resolveToH3 are unused).
 * Parses args per spec and calls write/read/delete; returns spec-shaped response or error. Use from the OpenRouter tool-calling loop.
 */
export function executeTool4(
  toolName: string,
  args: unknown,
  state: { turnNumber: number },
  _latLngByH3: Map<string, [number, number]>,
  _resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  logDebug('tool4Memory executeTool4', { toolName, stateTurn: state.turnNumber });
  const playerId = AI_PLAYER_ID;
  const currentTurn = state.turnNumber;

  try {
    if (toolName === 'memory_write') {
      const a = args as { key?: string; content?: string; tier?: string; options?: WriteOptions };
      if (typeof a?.key !== 'string') {
        return { status: 'error', error: 'memory_write requires key (string)' };
      }
      if (typeof a?.content !== 'string') {
        return { status: 'error', error: 'memory_write requires content (string)' };
      }
      const tier = (a.tier === 'persistent' ? 'persistent' : 'stored') as 'persistent' | 'stored';
      const result = write(playerId, a.key, a.content, tier, a.options, currentTurn);
      return result as Record<string, unknown>;
    }

    if (toolName === 'memory_read') {
      const a = args as { key?: string; tags?: string[]; tier?: string; all?: boolean };
      const tier =
        a?.tier === 'persistent' ? 'persistent' : a?.tier === 'stored' ? 'stored' : undefined;
      const result = read(
        playerId,
        typeof a?.key === 'string' ? a.key : undefined,
        Array.isArray(a?.tags) ? a.tags : undefined,
        tier,
        a?.all === true
      );
      return result as Record<string, unknown>;
    }

    if (toolName === 'memory_delete') {
      const a = args as { key?: string };
      if (typeof a?.key !== 'string') {
        return { status: 'error', error: 'memory_delete requires key (string)' };
      }
      const result = deleteByKey(playerId, a.key);
      return result as Record<string, unknown>;
    }

    return { status: 'error', error: `Unknown tool: ${toolName}` };
  } catch (err) {
    logError('tool4Memory executeTool4: exception', toolName, err);
    return { status: 'error', error: String(err) };
  }
}
