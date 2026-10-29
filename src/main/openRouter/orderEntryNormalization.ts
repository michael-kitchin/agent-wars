/**
 * Shared expansion of grouped envelope rows.
 *
 * Purpose: Air, ferry, orders, and missile launches all accept `unitId` or `unitIds`. One helper keeps that rule in one place so missile parsing does not import the orders parser.
 * When to use: Before a per-unit normalizer.
 * Expected outcome: One object per actor, with a scalar `unitId`.
 * Exceptions: None.
 */

import { logDebug } from '../logger';

/**
 * Collects actor ids from a single envelope entry.
 *
 * Purpose: Best Options rows list several units; the compact JSON form uses `unitIds` so a large roster fits the completion budget.
 * When to use: `expandGroupedActorEntries` before per-unit order application.
 * Expected outcome: A non-empty `unitIds` array is the actor set; otherwise a trimmed `unitId`. Duplicates are dropped, order preserved.
 * Exceptions: None.
 */
export function actorIdsFromOrderRaw(raw: Record<string, unknown>): string[] {
  const fromList: string[] = [];
  if (Array.isArray(raw.unitIds)) {
    for (const id of raw.unitIds) {
      if (typeof id === 'string' && id.trim().length > 0) fromList.push(id.trim());
    }
  }
  const uniqueFromList: string[] = [];
  for (const id of fromList) {
    if (!uniqueFromList.includes(id)) uniqueFromList.push(id);
  }
  if (uniqueFromList.length > 0) return uniqueFromList;
  const single = typeof raw.unitId === 'string' ? raw.unitId.trim() : '';
  return single ? [single] : [];
}

/**
 * Expands grouped `unitIds` entries into one object per actor with a scalar `unitId`.
 *
 * Purpose: Downstream order applicators still consume one actor per object.
 * When to use: Immediately before `processV3OrdersArray`, air-strike, ferry, and missile normalizers.
 * Expected outcome: Each grouped entry becomes N copies sharing destination/target fields; ungrouped entries are unchanged.
 * Exceptions: Non-array input becomes an empty list.
 */
export function expandGroupedActorEntries(entries: unknown): unknown[] {
  if (!Array.isArray(entries)) return [];
  const out: unknown[] = [];
  let groupedCount = 0;
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') {
      out.push(raw);
      continue;
    }
    const rec = raw as Record<string, unknown>;
    const ids = actorIdsFromOrderRaw(rec);
    if (ids.length === 0) {
      out.push(raw);
      continue;
    }
    if (ids.length > 1) groupedCount += 1;
    for (const unitId of ids) {
      const expanded: Record<string, unknown> = { ...rec, unitId };
      delete expanded.unitIds;
      out.push(expanded);
    }
  }
  if (groupedCount > 0) {
    logDebug('openRouter expandGroupedActorEntries', { groupedCount, expandedCount: out.length, sourceCount: entries.length });
  }
  return out;
}

/**
 * Keeps entries that normalize and records a drop reason for the rest.
 *
 * Purpose: Air, ferry, and missile rows share the object-or-drop loop.
 * When to use: After grouped ids have been expanded to one actor per object.
 * Expected outcome: `items` are the rows `normalizeOne` accepted. Each other row adds one drop reason.
 * Exceptions: None. A non-array is an empty result, not a drop reason.
 */
export function normalizeOrderEntries<T>(
  entries: unknown,
  options: {
    expectedObjectDropReason: string;
    missingFieldsDropReason: string;
    normalizeOne: (raw: Record<string, unknown>) => T | null;
  }
): { items: T[]; dropReasons: string[] } {
  const items: T[] = [];
  const dropReasons: string[] = [];
  if (!Array.isArray(entries)) return { items, dropReasons };
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') {
      dropReasons.push(options.expectedObjectDropReason);
      continue;
    }
    const normalized = options.normalizeOne(raw as Record<string, unknown>);
    if (!normalized) {
      dropReasons.push(options.missingFieldsDropReason);
      continue;
    }
    items.push(normalized);
  }
  return { items, dropReasons };
}
