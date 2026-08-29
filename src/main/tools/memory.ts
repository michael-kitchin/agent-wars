/**
 * Strategic memory. The LLM sees only memory_read; writes and deletes are applied from final JSON
 * memoryUpdates (host calls executeMemory with memory_write / memory_delete internally).
 * All memory logic lives here: expire, recurring trigger, CRUD with tier limits, and injection text.
 * Uses gameDb (dbRun, dbGetOne, dbGetAll, saveDatabase) for persistence.
 */

import { dbRun, dbGetOne, dbGetAll, saveDatabase } from '../gameDb';
import { logDebug, logError, logTrace } from '../logger';
import { buildPromptTableLines } from '../promptTableHelpers';
import { SECTION_TITLE_STRATEGIC_MEMORY, topLevelHeading } from '../openRouter/promptSpec/sectionHeadings';

/**
 * Documents the module-scope binding `PERSISTENT_LIMIT` (PERSISTENT_LIMIT).

 * Purpose: Supports maintainability by documenting why `PERSISTENT_LIMIT` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const PERSISTENT_LIMIT = 5;
/**
 * Documents the module-scope binding `STORED_LIMIT` (STORED_LIMIT).

 * Purpose: Supports maintainability by documenting why `STORED_LIMIT` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const STORED_LIMIT = 15;
/**
 * Documents the module-scope binding `CONTENT_MAX_LENGTH` (CONTENT_MAX_LENGTH).

 * Purpose: Supports maintainability by documenting why `CONTENT_MAX_LENGTH` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const CONTENT_MAX_LENGTH = 500;
/**
 * Documents the module-scope binding `KEY_PATTERN` (KEY_PATTERN).

 * Purpose: Supports maintainability by documenting why `KEY_PATTERN` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const KEY_PATTERN = /^[a-zA-Z0-9_-]+$/;
/**
 * Documents the module-scope binding `KEY_MAX_LENGTH` (KEY_MAX_LENGTH).

 * Purpose: Supports maintainability by documenting why `KEY_MAX_LENGTH` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const KEY_MAX_LENGTH = 64;
/**
 * Documents the module-scope binding `AI_PLAYER_ID` (AI_PLAYER_ID).

 * Purpose: Supports maintainability by documenting why `AI_PLAYER_ID` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const AI_PLAYER_ID = 'opponent';

/**
 * Documents the `MemoryRow` interface as a named contract surface (interface MemoryRow).

 * Purpose: Supports maintainability by documenting why `MemoryRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface MemoryRow {
  [key: string]: unknown;
    /**
   * Specifies the contract for the `player_id` member (player_id: string;).

   * Contract: Describes stable behavior for callers of `player_id` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
player_id: string;
    /**
   * Specifies the contract for the `key` member (key: string;).

   * Contract: Describes stable behavior for callers of `key` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
key: string;
    /**
   * Specifies the contract for the `content` member (content: string;).

   * Contract: Describes stable behavior for callers of `content` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
content: string;
    /**
   * Specifies the contract for the `tier` member (tier: string;).

   * Contract: Describes stable behavior for callers of `tier` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
tier: string;
    /**
   * Specifies the contract for the `created_turn` member (created_turn: number;).

   * Contract: Describes stable behavior for callers of `created_turn` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
created_turn: number;
    /**
   * Specifies the contract for the `expires_turn` member (expires_turn: number | null;).

   * Contract: Describes stable behavior for callers of `expires_turn` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
expires_turn: number | null;
    /**
   * Specifies the contract for the `recurring_interval` member (recurring_interval: number | null;).

   * Contract: Describes stable behavior for callers of `recurring_interval` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
recurring_interval: number | null;
    /**
   * Specifies the contract for the `next_trigger_turn` member (next_trigger_turn: number | null;).

   * Contract: Describes stable behavior for callers of `next_trigger_turn` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
next_trigger_turn: number | null;
    /**
   * Specifies the contract for the `last_triggered_turn` member (last_triggered_turn: number | null;).

   * Contract: Describes stable behavior for callers of `last_triggered_turn` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
last_triggered_turn: number | null;
    /**
   * Specifies the contract for the `tags` member (tags: string;).

   * Contract: Describes stable behavior for callers of `tags` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
tags: string;
}

/**
 * Documents the `WriteOptions` interface as a named contract surface (interface WriteOptions).

 * Purpose: Supports maintainability by documenting why `WriteOptions` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface WriteOptions {
    /**
   * Specifies the contract for the `expiresOnTurn` member (expiresOnTurn?: number;).

   * Contract: Describes stable behavior for callers of `expiresOnTurn` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
expiresOnTurn?: number;
    /**
   * Specifies the contract for the `recurring` member (recurring?: { intervalTurns: number; nextTurn?: number };).

   * Contract: Describes stable behavior for callers of `recurring` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
recurring?: { intervalTurns: number; nextTurn?: number };
    /**
   * Specifies the contract for the `tags` member (tags?: string[];).

   * Contract: Describes stable behavior for callers of `tags` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
tags?: string[];
}

/**
 * Defines the `expireAndProcessRecurring` function shape (function expireAndProcessRecurring(playerId: string, currentTurn: number): void).

 * Purpose: Supports maintainability by documenting why `expireAndProcessRecurring` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function expireAndProcessRecurring(playerId: string, currentTurn: number): void {
  logDebug('memory expireAndProcessRecurring', { playerId, currentTurn });
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
 * Defines the `getInjectionText` function shape (export function getInjectionText(playerId: string, currentTurn: number): string).

 * Purpose: Supports maintainability by documenting why `getInjectionText` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getInjectionText(playerId: string, currentTurn: number): string {
  logTrace('memory getInjectionText', { playerId, currentTurn });
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
  lines.push(topLevelHeading(SECTION_TITLE_STRATEGIC_MEMORY));
  lines.push('');
  lines.push('## Persistent (Active Strategic Context)');
  lines.push('');
  lines.push(
    ...buildPromptTableLines(
      ['Key', 'Updated Turn', 'Content'],
      persistent.map((row) => [row.key, row.created_turn, row.content]),
      ['—', '—', '—']
    )
  );
  lines.push('');
  lines.push('## Reminders Triggered This Turn');
  lines.push('');
  lines.push(
    ...buildPromptTableLines(
      ['Key', 'Tier', 'Recurring', 'Content'],
      triggered.map((row) => [
        row.key,
        row.tier === 'persistent' ? 'also persistent' : 'stored',
        row.recurring_interval != null ? `every ${row.recurring_interval} turns` : '—',
        row.content,
      ]),
      ['—', '—', '—', '—']
    )
  );
  lines.push('');
  lines.push(
    `Persistent: ${persistentCount} of ${PERSISTENT_LIMIT} slots used. Stored: ${storedCount} of ${STORED_LIMIT} slots used.`
  );
  if (storedNotTriggeredSummary) {
    lines.push(storedNotTriggeredSummary);
  }
  lines.push(
    'Use memory_read to retrieve stored memories by key or tag. To add, update, or remove memories, use "memoryUpdates" in your final JSON (write/delete actions); there are no memory_write or memory_delete tools.'
  );
  return lines.join('\n');
}

/**
 * Defines the `countByTier` function shape (function countByTier(playerId: string):).

 * Purpose: Supports maintainability by documenting why `countByTier` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
 * Defines the `write` function shape (function write( playerId: string, key: string, content: string, tier: 'persistent' | 'stored', options: WriteOptions | undefined, currentTurn:).

 * Purpose: Supports maintainability by documenting why `write` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function write(
  playerId: string,
  key: string,
  content: string,
  tier: 'persistent' | 'stored',
  options: WriteOptions | undefined,
  currentTurn: number
): { status: string; error?: string; key?: string; tier?: string; action?: string; persistentCount?: number; persistentLimit?: number; storedCount?: number; storedLimit?: number } {
  logDebug('memory write', { playerId, key, tier, currentTurn });

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
      `UPDATE ai_memory SET content = ?, tier = ?, created_turn = ?, expires_turn = ?, recurring_interval = ?, next_trigger_turn = ?, tags = ? WHERE player_id = ? AND key = ?`,
      [content, tier, currentTurn, expiresTurn, recurringInterval, nextTriggerTurn, tagsJson, playerId, key]
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

/**
 * Defines the `rowToMemory` function shape (function rowToMemory(row: MemoryRow): { key: string; content: string; tier: string; createdOnTurn: number; lastTriggered: number | null; tags:).

 * Purpose: Supports maintainability by documenting why `rowToMemory` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
 * Defines the `read` function shape (function read( playerId: string, key?: string, tags?: string[], tier?: 'persistent' | 'stored', all?: boolean ): { status: string; error?: strin).

 * Purpose: Supports maintainability by documenting why `read` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function read(
  playerId: string,
  key?: string,
  tags?: string[],
  tier?: 'persistent' | 'stored',
  all?: boolean
): { status: string; error?: string; memories?: ReturnType<typeof rowToMemory>[] } {
  logTrace('memory read', { playerId, key, tier, all });

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
 * Defines the `deleteByKey` function shape (function deleteByKey( playerId: string, key: string ): { status: string; error?: string; key?: string; deleted?: boolean } { logDebug('memory del).

 * Purpose: Supports maintainability by documenting why `deleteByKey` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function deleteByKey(
  playerId: string,
  key: string
): { status: string; error?: string; key?: string; deleted?: boolean } {
  logDebug('memory deleteByKey', { playerId, key });
  const existing = dbGetOne<MemoryRow>('SELECT 1 FROM ai_memory WHERE player_id = ? AND key = ?', [playerId, key]);
  if (!existing) {
    return { status: 'error', error: `Memory not found: ${key}` };
  }
  dbRun('DELETE FROM ai_memory WHERE player_id = ? AND key = ?', [playerId, key]);
  saveDatabase();
  return { status: 'ok', key, deleted: true };
}

/**
 * Documents the module-scope binding `MEMORY_TOOL_NAMES` (MEMORY_TOOL_NAMES).

 * Purpose: Supports maintainability by documenting why `MEMORY_TOOL_NAMES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const MEMORY_TOOL_NAMES = ['memory_read'] as const;

/**
 * Defines the `executeMemory` function shape (export function executeMemory( toolName: string, args: unknown, state: { turnNumber: number }, // eslint-disable-next-line @typescript-eslint/no-unus).

 * Purpose: Supports maintainability by documenting why `executeMemory` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function executeMemory(
  toolName: string,
  args: unknown,
  state: { turnNumber: number },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature matches other tool executors for OpenRouter dispatch
  _latLngByH3: Map<string, [number, number]>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  logDebug('memory executeMemory', { toolName, stateTurn: state.turnNumber });
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
    logError('memory executeMemory: exception', toolName, err);
    return { status: 'error', error: String(err) };
  }
}
