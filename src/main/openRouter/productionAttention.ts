/**
 * Idle controlled hexes for the Production attention flag.
 *
 * Purpose: The briefing already knows which hexes can build and are not building. Attention Flags and the opening message point at that list.
 * When to use: After `query_production` returns controlled-hex queues, and when appending the attention bullet.
 * Expected outcome: At most one bullet, listing up to `PRODUCTION_ATTENTION_LISTED_HEXES` hexes grouped by queue state and buildable types, or null when nothing is idle.
 * Exceptions: None.
 */

import { logTrace } from '../logger';
import { isBuildQueueItemType, isBuildUnitType } from '../productionRules';
import type { ControlledHexQueueSnapshot, ProductionQueueEntrySnapshot } from './productionQueueSnapshotTypes';

/**
 * How many idle hexes the Production attention bullet names before it counts the rest.
 *
 * Purpose: Every hex the bullet asks the model to queue needs a printed code to copy, so the bullet lists every idle hex up to this limit. The limit bounds the line on a very large empire. `query_production` still lists every controlled hex.
 * When to use: `formatProductionAttentionBullet`.
 * Expected outcome: Sixty.
 * Exceptions: None.
 */
export const PRODUCTION_ATTENTION_LISTED_HEXES = 60;

/**
 * One controlled hex that can still build and is not doing so.
 *
 * Purpose: The attention bullet needs the hex label, why it is idle, and the types that can still be queued.
 * When to use: The result of `findIdleProductionHexes`.
 * Expected outcome: `reason` is `empty` when the queue has no entry, and `blocked` when the next entry is at the deployment cap.
 * Exceptions: None.
 */
export interface IdleProductionHex {
  /**
   * Briefing code of the idle hex, or `[unknown]` when the snapshot has no center.
   *
   * Contract: The same label the production table would print for this hex.
   * When to use: The item inside the production attention bullet.
   * Expected outcome: A short hex label.
   * Exceptions: None.
   */
  readonly hexText: string;
  /**
   * Why the hex is idle.
   *
   * Contract: `empty` when the queue has no entry. `blocked` when the next entry's type is at the deployment cap.
   * When to use: Choosing the group and its state label in the attention bullet.
   * Expected outcome: One of those two words.
   * Exceptions: None.
   */
  readonly reason: 'empty' | 'blocked';
  /**
   * Available build types that are not at the deployment cap.
   *
   * Contract: Uncapped unit types, plus `fortification` and `credits` when the hex lists them. Never empty on an idle hex.
   * When to use: The `can build` list of the hex's group in the attention bullet.
   * Expected outcome: Type names in snapshot order.
   * Exceptions: None.
   */
  readonly buildableTypes: readonly string[];
}

/**
 * Idle hexes that share a queue state and a buildable-type set.
 *
 * Purpose: The attention bullet prints each state and type set once, followed by every hex code it covers.
 * When to use: The result of `groupIdleProductionHexes`.
 * Expected outcome: `hexTexts` is never empty and keeps idle-list order.
 * Exceptions: None.
 */
interface IdleProductionHexGroup {
  /**
   * Why every hex in the group is idle.
   *
   * Contract: `empty` when those queues have no entry. `blocked` when each next entry's type is at the deployment cap.
   * When to use: Choosing the group's state label in the attention bullet.
   * Expected outcome: One of those two words.
   * Exceptions: None.
   */
  readonly reason: IdleProductionHex['reason'];
  /**
   * Available build types printed once for the group.
   *
   * Contract: The first hex's `buildableTypes`, in that hex's order. Never empty.
   * When to use: The `can build` list in the attention bullet.
   * Expected outcome: Type names in the first hex's order.
   * Exceptions: None.
   */
  readonly buildableTypes: readonly string[];
  /**
   * Briefing codes of the hexes in the group.
   *
   * Contract: Labels in idle-list order. Never empty.
   * When to use: The hex list after the group's colon.
   * Expected outcome: One label per hex in the group.
   * Exceptions: None.
   */
  readonly hexTexts: readonly string[];
}

/**
 * Picks the queue entry that will build next.
 *
 * Purpose: The table's Current Queue cell and the idle check must name the same entry.
 * When to use: A controlled hex's `entries` list.
 * Expected outcome: The entry with the lowest `queueIndex`, then the lowest `entryId`. Undefined when the list is empty.
 * Exceptions: None.
 */
export function selectNextQueueEntry(
  entries: readonly ProductionQueueEntrySnapshot[]
): ProductionQueueEntrySnapshot | undefined {
  logTrace('productionAttention selectNextQueueEntry', { entryCount: entries.length });
  return [...entries].sort((a, b) => {
    const queueIndexA = Number(a.queueIndex);
    const queueIndexB = Number(b.queueIndex);
    if (Number.isFinite(queueIndexA) && Number.isFinite(queueIndexB) && queueIndexA !== queueIndexB) {
      return queueIndexA - queueIndexB;
    }
    const entryIdA = Number(a.entryId);
    const entryIdB = Number(b.entryId);
    if (Number.isFinite(entryIdA) && Number.isFinite(entryIdB) && entryIdA !== entryIdB) {
      return entryIdA - entryIdB;
    }
    return 0;
  })[0];
}

/**
 * Lists controlled hexes that can build and are not building.
 *
 * Purpose: Attention Flags names these hexes. A hex whose unit types are all capped, and which lists neither fortification nor credits, is not idle.
 * When to use: Every controlled-hex queue from `query_production`, not only the rows shown in the table.
 * Expected outcome: Row order is kept. Buildable types are uncapped unit types plus fortification and credits when listed. A hex is `empty` when it has no queue entry and at least one buildable type, and `blocked` when its next entry is a capped unit type while something is still buildable. A hex whose unit types are all capped and which lists neither extra is not idle.
 * Exceptions: None.
 */
export function findIdleProductionHexes(
  rows: readonly ControlledHexQueueSnapshot[],
  maxedTypes: ReadonlySet<string>,
  formatHexLabel: (ll: [number, number]) => string
): IdleProductionHex[] {
  logTrace('productionAttention findIdleProductionHexes', { rowCount: rows.length, maxedCount: maxedTypes.size });
  const idle: IdleProductionHex[] = [];
  for (const row of rows) {
    const available = Array.isArray(row.availableUnitTypes)
      ? (row.availableUnitTypes as unknown[]).map((value) => String(value))
      : [];
    const unitTypes = available.filter((item) => isBuildUnitType(item));
    const extras = available.filter((item) => isBuildQueueItemType(item) && !isBuildUnitType(item));
    const buildableTypes = [...unitTypes.filter((unitType) => !maxedTypes.has(unitType)), ...extras];
    if (buildableTypes.length === 0) continue;
    const entries = Array.isArray(row.entries) ? (row.entries as ProductionQueueEntrySnapshot[]) : [];
    const nextEntry = selectNextQueueEntry(entries);
    if (nextEntry && !maxedTypes.has(String(nextEntry.unitType ?? ''))) continue;
    const hex = Array.isArray(row.hex) ? (row.hex as [number, number]) : null;
    idle.push({
      hexText: hex ? formatHexLabel(hex) : '[unknown]',
      reason: nextEntry ? 'blocked' : 'empty',
      buildableTypes,
    });
  }
  return idle;
}

/**
 * Groups idle hexes by queue state and buildable-type set.
 *
 * Purpose: Lets the attention bullet print every idle hex code without repeating the same type list per hex.
 * When to use: `formatProductionAttentionBullet`, on the hexes it lists.
 * Expected outcome: Groups in order of their first hex. Type sets match regardless of order, and each group prints its first hex's type order. Hexes keep input order.
 * Exceptions: None.
 */
function groupIdleProductionHexes(idle: readonly IdleProductionHex[]): IdleProductionHexGroup[] {
  logTrace('productionAttention groupIdleProductionHexes', { idleCount: idle.length });
  const groups = new Map<string, { reason: IdleProductionHex['reason']; buildableTypes: readonly string[]; hexTexts: string[] }>();
  for (const hex of idle) {
    const key = `${hex.reason}|${[...hex.buildableTypes].sort().join(',')}`;
    const group = groups.get(key);
    if (group) {
      group.hexTexts.push(hex.hexText);
    } else {
      groups.set(key, { reason: hex.reason, buildableTypes: hex.buildableTypes, hexTexts: [hex.hexText] });
    }
  }
  return [...groups.values()];
}

/**
 * Renders the Production attention bullet, without a leading list marker.
 *
 * Purpose: The formatter adds the marker so this sentence can replace `None.` or follow the unit bullets.
 * When to use: When `findIdleProductionHexes` returned at least one hex.
 * Expected outcome: The exact production sentence. The first `PRODUCTION_ATTENTION_LISTED_HEXES` hexes are printed as `{empty queue|blocked at cap}, can build {types}: {hexes}` groups joined by `; `. Any remainder is counted, and the closing then asks for each listed hex. When every idle hex is listed, the closing asks for each. Null when the list is empty.
 * Exceptions: None.
 */
export function formatProductionAttentionBullet(idle: readonly IdleProductionHex[]): string | null {
  logTrace('productionAttention formatProductionAttentionBullet', { idleCount: idle.length });
  if (idle.length === 0) return null;
  const noun = idle.length === 1 ? 'hex' : 'hexes';
  const verb = idle.length === 1 ? 'is' : 'are';
  const listed = idle.slice(0, PRODUCTION_ATTENTION_LISTED_HEXES);
  const groups = groupIdleProductionHexes(listed)
    .map((group) => {
      const state = group.reason === 'empty' ? 'empty queue' : 'blocked at cap';
      return `${state}, can build ${group.buildableTypes.join(', ')}: ${group.hexTexts.join(', ')}`;
    })
    .join('; ');
  const extra = idle.length - listed.length;
  const more = extra > 0 ? `; ${extra} more not listed (query_production lists every hex)` : '';
  const closing =
    extra > 0
      ? 'Add a set_build_queue row to productionOrders for each listed hex.'
      : 'Add a set_build_queue row to productionOrders for each.';
  return `Production: ${idle.length} controlled ${noun} can build but ${verb} not building — ${groups}${more}. ${closing}`;
}

/**
 * Adds the production bullet after the unit attention bullets.
 *
 * Purpose: The production bullet is outside the five-bullet unit cap, and it is the whole section when no unit needs attention.
 * When to use: `formatBriefing` after `buildAttentionFlags`.
 * Expected outcome: Unchanged when `bullet` is null. `- {bullet}` when the flags are `None.`. Otherwise the flags plus a new bullet line.
 * Exceptions: None.
 */
export function appendProductionAttentionBullet(attentionFlags: string, bullet: string | null): string {
  logTrace('productionAttention appendProductionAttentionBullet', {
    hasBullet: bullet !== null,
    flagsAreNone: attentionFlags === 'None.',
  });
  if (bullet === null) return attentionFlags;
  if (attentionFlags === 'None.') return `- ${bullet}`;
  return `${attentionFlags}\n- ${bullet}`;
}
