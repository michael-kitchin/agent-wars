/**
 * Idle controlled hexes for the Production attention flag.
 *
 * Purpose: The briefing already knows which hexes can build and are not building. Attention Flags and the opening message point at that list.
 * When to use: After `query_production` returns controlled-hex queues, and when appending the attention bullet.
 * Expected outcome: At most one bullet, listing at most six hexes, or null when nothing is idle.
 * Exceptions: None.
 */

import { logTrace } from '../logger';
import { isBuildQueueItemType, isBuildUnitType } from '../productionRules';
import type { ControlledHexQueueSnapshot, ProductionQueueEntrySnapshot } from './productionQueueSnapshotTypes';

/**
 * How many idle hexes the Production attention bullet names before it counts the rest.
 *
 * Purpose: A long list of hex codes would crowd the flags. `query_production` still lists every controlled hex. The production table lists the busiest hexes and the hexes that already have a queue.
 * When to use: `formatProductionAttentionBullet`.
 * Expected outcome: Six.
 * Exceptions: None.
 */
export const PRODUCTION_ATTENTION_LISTED_HEXES = 6;

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
   * When to use: Choosing the parenthetical in the attention bullet.
   * Expected outcome: One of those two words.
   * Exceptions: None.
   */
  readonly reason: 'empty' | 'blocked';
  /**
   * Available build types that are not at the deployment cap.
   *
   * Contract: Uncapped unit types, plus `fortification` and `credits` when the hex lists them. Never empty on an idle hex.
   * When to use: The `can build` list in the attention bullet.
   * Expected outcome: Type names in snapshot order.
   * Exceptions: None.
   */
  readonly buildableTypes: readonly string[];
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
 * Renders the Production attention bullet, without a leading list marker.
 *
 * Purpose: The formatter adds the marker so this sentence can replace `None.` or follow the unit bullets.
 * When to use: When `findIdleProductionHexes` returned at least one hex.
 * Expected outcome: The exact production sentence, listing at most `PRODUCTION_ATTENTION_LISTED_HEXES` hexes. Null when the list is empty.
 * Exceptions: None.
 */
export function formatProductionAttentionBullet(idle: readonly IdleProductionHex[]): string | null {
  logTrace('productionAttention formatProductionAttentionBullet', { idleCount: idle.length });
  if (idle.length === 0) return null;
  const noun = idle.length === 1 ? 'hex' : 'hexes';
  const verb = idle.length === 1 ? 'is' : 'are';
  const listed = idle.slice(0, PRODUCTION_ATTENTION_LISTED_HEXES);
  const items = listed
    .map((hex) => {
      const why = hex.reason === 'empty' ? 'empty queue' : 'blocked at cap';
      return `${hex.hexText} (${why}; can build ${hex.buildableTypes.join(', ')})`;
    })
    .join(', ');
  const extra = idle.length - listed.length;
  const more = extra > 0 ? ` and ${extra} more (query_production lists every hex)` : '';
  return (
    `Production: ${idle.length} controlled ${noun} can build but ${verb} not building — ${items}${more}. ` +
    'Add a set_build_queue row to productionOrders for each.'
  );
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
