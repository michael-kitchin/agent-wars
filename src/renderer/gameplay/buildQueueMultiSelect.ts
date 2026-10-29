import { getStrategicHexCode } from '../../shared/hexLlmCodeAssignment';
import {
  ALL_BUILD_QUEUE_ITEM_TYPES,
  type BuildQueueItemType,
  type BuildQueueTemplateEntry,
  type HexBuildQueueSnapshot,
} from '../../shared/ipcTypes';
import { FORTIFICATION_QUEUE_ITEM, FORTIFICATION_QUEUE_ITEM_LABEL } from '../../shared/fortificationRules';
import { escapeBuildPopupHtml } from './buildQueuePopupFormatting';

/**
 * One shared template row with a renderer-only stable identity for async edit handlers.
 *
 * Purpose: Lets multi-popup controls locate rows after re-render without trusting closed-over indices.
 * When to use: Storing and mutating `buildQueueTemplate` in renderer state.
 * Expected outcome: Row edits survive remove/re-render races without writing to the wrong slot.
 * Exceptions: `rowKey` is stripped before IPC persistence.
 */
export interface BuildQueueTemplateRow extends BuildQueueTemplateEntry {
  /**
   * Monotonic renderer-only row identity that survives array reorder and re-render.
   *
   * Contract: Stable for the row's lifetime in renderer state; never included in IPC payloads.
   * When to use: Multi-popup row add, change, input, and remove handlers.
   * Expected outcome: Stale handlers no-op when their row was removed.
   * Exceptions: None.
   */
  rowKey: number;
}

/**
 * Monotonic counter for renderer-only template row keys.
 *
 * Purpose: Supplies unique `rowKey` values for async-safe multi-popup row identity.
 * When to use: Incremented only by {@link createBuildQueueTemplateRow}.
 * Expected outcome: Each new template row receives a distinct stable key for its lifetime.
 * Exceptions: Resets only on full page reload.
 */
let nextBuildQueueTemplateRowKey = 1;

/**
 * Creates one shared template row with a fresh stable renderer identity.
 *
 * Purpose: Seeds new multi-popup rows and snapshot imports with async-safe row keys.
 * When to use: Adding a template row or converting persisted queue entries to shared state.
 * Expected outcome: Row includes unit type, count, and a unique `rowKey`.
 * Exceptions: None.
 */
export function createBuildQueueTemplateRow(
  unitType: BuildQueueItemType,
  count: number
): BuildQueueTemplateRow {
  return { rowKey: nextBuildQueueTemplateRowKey++, unitType, count };
}

/**
 * Strips renderer-only row keys before sending the shared template to the backend.
 *
 * Purpose: Keeps IPC payloads aligned with `BuildQueueTemplateEntry` while preserving local row identity.
 * When to use: Applying the current template to one or more selected hexes.
 * Expected outcome: Ordered unit types and counts without `rowKey` fields.
 * Exceptions: None.
 */
export function toBuildQueueTemplateEntries(
  template: BuildQueueTemplateRow[]
): BuildQueueTemplateEntry[] {
  return template.map(({ unitType, count }) => ({ unitType, count }));
}

/**
 * Formats selected strategic hex codes as safe HTML for the multi-hex description line.
 *
 * Purpose: Gives the multi-hex build popup a predictable replacement for one hex's naming line.
 * When to use: Two or more selected build hexes, in selection order.
 * Expected outcome: Bold `(AA)` codes joined by plain separators, ending with a plain ` (N hexes)`
 * count, e.g. `<strong>(AA)</strong> and <strong>(BB)</strong> (2 hexes)`.
 * Exceptions: Falls back to the H3 index when a strategic code is unavailable.
 */
export function formatSelectedBuildHexCodesHtml(h3Indexes: string[]): string {
  const labels = h3Indexes.map(
    (h3Index) => `<strong>${escapeBuildPopupHtml(`(${getStrategicHexCode(h3Index) ?? h3Index})`)}</strong>`
  );
  const suffix = ` (${h3Indexes.length} ${h3Indexes.length === 1 ? 'hex' : 'hexes'})`;
  if (labels.length <= 1) return `${labels[0] ?? ''}${suffix}`;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}${suffix}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}${suffix}`;
}

/**
 * Converts one persisted queue snapshot to id-independent template rows.
 *
 * Purpose: Copies one persisted queue into shared template rows without retaining per-hex row ids.
 * When to use: Seeding from the hex that was already open, or reloading the template from the first selected hex after a partial apply.
 * Expected outcome: Queue order, unit types, and remaining counts are preserved.
 * Exceptions: None.
 */
export function buildQueueTemplateFromSnapshot(snapshot: HexBuildQueueSnapshot): BuildQueueTemplateRow[] {
  return snapshot.entries.map((entry) => createBuildQueueTemplateRow(entry.unitType, entry.count));
}

/**
 * Returns buildable types present anywhere in the selected snapshot set.
 *
 * Purpose: Supports the union-type dropdown while retaining canonical unit-type ordering.
 * When to use: Multi-hex popup rendering and selecting the default type for a new row.
 * Expected outcome: A deterministic subset of infantry, armor, naval, air.
 * Exceptions: Empty input returns an empty array.
 */
export function unionAvailableBuildUnitTypes(snapshots: HexBuildQueueSnapshot[]): BuildQueueItemType[] {
  const available = new Set(snapshots.flatMap((snapshot) => snapshot.availableUnitTypes));
  return ALL_BUILD_QUEUE_ITEM_TYPES.filter((unitType) => available.has(unitType));
}

/**
 * Counts selected hexes eligible to build a given unit type.
 *
 * Purpose: Supplies eligibility counts for multi-hex dropdown option labels.
 * When to use: Multi-hex popup type-select rendering.
 * Expected outcome: Integer between zero and the selected snapshot count.
 * Exceptions: Empty input returns zero.
 */
export function countEligibleBuildHexes(
  snapshots: HexBuildQueueSnapshot[],
  unitType: BuildQueueItemType
): number {
  return snapshots.filter((snapshot) => snapshot.availableUnitTypes.includes(unitType)).length;
}

/**
 * Formats one multi-hex unit-type dropdown option with eligibility scope.
 *
 * Purpose: Keeps partial-eligibility signaling in the select list instead of row-side labels.
 * When to use: Building `<option>` text for the shared template editor.
 * Expected outcome: `Infantry (all hexes)`, `Infantry (2 hexes)`, or `Infantry (1 hex)`.
 * Exceptions: Counts at or below zero use the plural `hexes` form.
 */
export function formatBuildUnitTypeOptionLabel(
  unitType: BuildQueueItemType,
  eligibleCount: number,
  selectedHexCount: number
): string {
  const typeLabel =
    unitType === FORTIFICATION_QUEUE_ITEM
      ? FORTIFICATION_QUEUE_ITEM_LABEL
      : unitType.charAt(0).toUpperCase() + unitType.slice(1);
  if (selectedHexCount > 0 && eligibleCount >= selectedHexCount) {
    return `${typeLabel} (all hexes)`;
  }
  if (eligibleCount === 1) return `${typeLabel} (1 hex)`;
  return `${typeLabel} (${Math.max(0, eligibleCount)} hexes)`;
}

/**
 * Filters shared template rows to those one hex can build.
 *
 * Purpose: Mirrors backend eligibility filtering for accurate per-hex ETA display.
 * When to use: Multi-hex queue summary calculations only; backend remains authoritative for writes.
 * Expected outcome: Relative template order and counts are preserved.
 * Exceptions: Returns an empty queue when no template type is available.
 */
export function filterTemplateForBuildHex(
  template: BuildQueueTemplateRow[],
  snapshot: HexBuildQueueSnapshot
): BuildQueueTemplateEntry[] {
  const available = new Set(snapshot.availableUnitTypes);
  return template.filter((entry) => available.has(entry.unitType));
}

/**
 * Adapts id-independent template rows for turn-estimate helpers that require queue identity fields.
 *
 * Purpose: Lets multi-hex ETA use `estimateTurnsToCompleteQueuedProduction` without inventing DB ids.
 * When to use: Before estimating completion turns for a filtered shared template on one hex.
 * Expected outcome: Stable synthetic `id`/`queueIndex` values that preserve relative template order.
 * Exceptions: None.
 */
export function templateEntriesForTurnEstimate(
  template: BuildQueueTemplateEntry[]
): Array<{ id: number; queueIndex: number; unitType: BuildQueueItemType; count: number }> {
  return template.map((entry, queueIndex) => ({
    id: queueIndex + 1,
    queueIndex,
    unitType: entry.unitType,
    count: entry.count,
  }));
}
