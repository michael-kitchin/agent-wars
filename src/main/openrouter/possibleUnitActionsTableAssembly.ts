/**
 * Table model, markdown assembly, and shared labels for "Possible unit actions" briefing output.
 *
 * Purpose: Keeps prompt table shaping and row aggregation separate from hex discovery / indexing in `possibleUnitActions.ts`.
 * When to use: From `buildPossibleUnitActionsMarkdown` and `renderThisTurnOptionsTableMarkdown` after raw legal hex rows are collected.
 * Expected outcome: Stable markdown tables and row ordering; no game-state mutation.
 * Exceptions: None for these pure helpers.
 */

import { buildPromptTableLines } from '../promptTableUtils';
import { compareHexIds } from './possibleUnitActionsPartition';

/**
 * Bucket label used when partitioning enemy-reachable hexes for the briefing table.
 *
 * Purpose: Typed bucket key for `PossibleActionTableRow` and `BUCKET_PRIORITY` ordering.
 * When to use: Row construction and `groupRowsByBucket` output keys.
 * Expected outcome: One of three stable bucket names.
 * Exceptions: None.
 */
export type PossibleActionBucket = 'homeland' | 'nearest' | 'other';

/**
 * One aggregated row in the possible-actions markdown table (post `aggregateRows`).
 *
 * Purpose: Stable contract for briefing markdown generation and tests that snapshot table shape.
 * When to use: After raw per-action rows are merged per `(unitId, unitType, targetH3)`.
 * Expected outcome: `actionTypes` is a comma-separated sorted list of action labels for that cell.
 * Exceptions: None.
 */
export interface PossibleActionTableRow {
  /**
   * Specifies the contract for the `bucket` member (bucket: PossibleActionBucket;).

   * Contract: Homeland vs nearest-homeland vs other partition for markdown section placement.
   * When to use: After `partitionHomelandNearestOther` and aggregation choose the strongest bucket per hex key.
   * Expected outcome: One of `homeland`, `nearest`, or `other`.
   * Exceptions: None.
   */
  bucket: PossibleActionBucket;
  /**
   * Specifies the contract for the `unitId` member (unitId: string;).

   * Contract: Stable unit identifier from the game snapshot.
   * When to use: Row identity and per-unit row cap selection.
   * Expected outcome: Non-empty string matching a unit in the briefing state.
   * Exceptions: None.
   */
  unitId: string;
  /**
   * Specifies the contract for the `unitType` member (unitType: string;).

   * Contract: Tactical unit type label for the table's unit-type column.
   * When to use: Display and tie-breaking when multiple rows share a unit.
   * Expected outcome: Same type string as in game state for that unit.
   * Exceptions: None.
   */
  unitType: string;
  /**
   * Specifies the contract for the `actionTypes` member (actionTypes: string;).

   * Contract: Comma-separated, deterministically ordered action labels for this unit and target hex.
   * When to use: Final markdown cell after `aggregateRows` merges raw rows.
   * Expected outcome: Subset of move/melee, ranged attack, and air strike labels used by this module.
   * Exceptions: None.
   */
  actionTypes: string;
  /**
   * Specifies the contract for the `targetH3` member (targetH3: string;).

   * Contract: Destination or strike hex index in H3 string form.
   * When to use: Distance, lat/lng sort, and map correlation for the briefing.
   * Expected outcome: Valid res cell for the current game map.
   * Exceptions: None.
   */
  targetH3: string;
  /**
   * Specifies the contract for the `distance` member (distance: number;).

   * Contract: Grid distance from the unit origin to `targetH3` for the listed action context.
   * When to use: Sorting within a unit's top rows and display.
   * Expected outcome: Non-negative integer grid steps when distance computation succeeded upstream.
   * Exceptions: None.
   */
  distance: number;
  /**
   * Specifies the contract for the `enemySummary` member (enemySummary: string;).

   * Contract: Human-readable summary of enemy presence at the hex, or em dash when none.
   * When to use: Enemy column in the markdown table.
   * Expected outcome: Short stable text suitable for prompt context.
   * Exceptions: None.
   */
  enemySummary: string;
  /**
   * Specifies the contract for the `featuresSummary` member (featuresSummary: string;).

   * Contract: Human-readable infrastructure or strike-relevant feature summary for the hex.
   * When to use: Features column; may differ for air strikes vs other actions upstream.
   * Expected outcome: Short stable text suitable for prompt context.
   * Exceptions: None.
   */
  featuresSummary: string;
  /**
   * Specifies the contract for the `enemyUnitCount` member (enemyUnitCount: number;).

   * Contract: Count of enemy units at `targetH3` used for row priority sorting.
   * When to use: Prefer rows with more contested hexes when trimming per unit.
   * Expected outcome: Non-negative integer.
   * Exceptions: None.
   */
  enemyUnitCount: number;
  /**
   * Specifies the contract for the `urbanHexCount` member (urbanHexCount: number;).

   * Contract: Urban infrastructure count signal for the hex used in row priority sorting.
   * When to use: Secondary sort key after enemy counts.
   * Expected outcome: Non-negative integer.
   * Exceptions: None.
   */
  urbanHexCount: number;
}

/**
 * One raw legal-hex contribution before aggregation merges action types for the same target hex.
 *
 * Purpose: Intermediate row shape produced while scanning legal moves, ranged, strikes, and ferries.
 * When to use: Only while building `rawRows` inside `buildPossibleUnitActionsMarkdown`.
 * Expected outcome: One action type per row; duplicates merged by `aggregateRows`.
 * Exceptions: None.
 */
export interface RawPossibleActionRow {
  /**
   * Specifies the contract for the `bucket` member (bucket: PossibleActionBucket;).

   * Contract: Homeland vs nearest vs other for this raw legal hex before aggregation.
   * When to use: Each `appendRowsForLegalHexes` bucket pass sets this consistently with partition output.
   * Expected outcome: One of `homeland`, `nearest`, or `other`.
   * Exceptions: None.
   */
  bucket: PossibleActionBucket;
  /**
   * Specifies the contract for the `unitId` member (unitId: string;).

   * Contract: Owning unit id for this candidate row.
   * When to use: Aggregation groups rows by unit and target hex.
   * Expected outcome: Non-empty string.
   * Exceptions: None.
   */
  unitId: string;
  /**
   * Specifies the contract for the `unitType` member (unitType: string;).

   * Contract: Unit type for display and merge keys with `unitId` and `targetH3`.
   * When to use: Raw row construction for each legal destination.
   * Expected outcome: Same type string as in game state for that unit.
   * Exceptions: None.
   */
  unitType: string;
  /**
   * Specifies the contract for the `actionType` member (actionType: string;).

   * Contract: Single action label for this row before merge (move/melee, ranged attack, or air strike).
   * When to use: One raw row per (unit, target, action) before `aggregateRows`.
   * Expected outcome: A known label from this module's action constants.
   * Exceptions: None.
   */
  actionType: string;
  /**
   * Specifies the contract for the `targetH3` member (targetH3: string;).

   * Contract: Candidate H3 index for this action row.
   * When to use: Linking to lat/lng maps and distance from unit origin.
   * Expected outcome: Valid res cell on the map.
   * Exceptions: None.
   */
  targetH3: string;
  /**
   * Specifies the contract for the `distance` member (distance: number;).

   * Contract: Grid distance from the unit to `targetH3` for sorting and display.
   * When to use: Populated when grid distance succeeds for the pair.
   * Expected outcome: Non-negative integer.
   * Exceptions: None.
   */
  distance: number;
  /**
   * Specifies the contract for the `enemySummary` member (enemySummary: string;).

   * Contract: Enemy presence summary at `targetH3` for this raw row.
   * When to use: Merged via `preferredSummary` when multiple action rows share a key.
   * Expected outcome: Short text or em dash placeholder.
   * Exceptions: None.
   */
  enemySummary: string;
  /**
   * Specifies the contract for the `featuresSummary` member (featuresSummary: string;).

   * Contract: Infrastructure or strike-context summary for `targetH3`.
   * When to use: Merged when aggregating rows for the same unit and hex.
   * Expected outcome: Short text or em dash placeholder.
   * Exceptions: None.
   */
  featuresSummary: string;
  /**
   * Specifies the contract for the `enemyUnitCount` member (enemyUnitCount: number;).

   * Contract: Enemy unit count at the hex for priority computation.
   * When to use: `aggregateRows` keeps the maximum across merged raw rows.
   * Expected outcome: Non-negative integer.
   * Exceptions: None.
   */
  enemyUnitCount: number;
  /**
   * Specifies the contract for the `urbanHexCount` member (urbanHexCount: number;).

   * Contract: Urban count signal at the hex for priority computation.
   * When to use: `aggregateRows` keeps the maximum across merged raw rows.
   * Expected outcome: Non-negative integer.
   * Exceptions: None.
   */
  urbanHexCount: number;
}

/** Player id treated as the briefing subject (enemy to the AI opponent). */
export const ENEMY_PLAYER = 'human';

/** Player id for friendly units in this briefing (the AI side). */
export const FRIENDLY_PLAYER = 'opponent';

/** Action label for one-step move/melee destinations in the possible-actions table. */
export const ACTION_MOVES_MELEE = 'move/melee';

/**
 * Action label for tactical Best Options approach rows (close toward nearest enemy when no enemy/infra hex is in reach this beat).
 *
 * Purpose: Distinguishes interest-filtered move/melee targets from distance-reducing approach hexes in the Commander table.
 * When to use: Approach fallback branch in `collectAggregatedPossibleActionRows` only.
 * Expected outcome: Rendered Action column shows `approach`.
 * Exceptions: None.
 */
export const ACTION_APPROACH = 'approach';

/** Action label for ranged attack rows. */
export const ACTION_RANGED = 'ranged attack';

/** Action label for air strike rows. */
export const ACTION_AIR_STRIKES = 'air strike';

/**
 * Markdown subsection titles keyed by bucket for stable briefing section ordering.
 *
 * Purpose: Drives `##` headings in `buildPossibleUnitActionsMarkdown` output.
 * When to use: Final markdown assembly loop over grouped rows.
 * Expected outcome: Three titled blocks when each bucket has rows.
 * Exceptions: None.
 */
export const BUCKET_TITLES: ReadonlyArray<{ bucket: PossibleActionBucket; title: string }> = [
  { bucket: 'homeland', title: 'Enemy Homeland Hexes' },
  { bucket: 'nearest', title: 'Hexes Nearest to Enemy Homeland' },
  { bucket: 'other', title: 'Other Hexes' },
];

/**
 * Sort priority when two raw rows merge and disagree on bucket (lower number wins as closer threat).
 *
 * Purpose: Ensures homeland bucket wins over nearest/other when the same hex appears from multiple passes.
 * When to use: Inside `aggregateRows` when reconciling `bucket` on merged keys.
 * Expected outcome: homeland < nearest < other.
 * Exceptions: None.
 */
export const BUCKET_PRIORITY: Record<PossibleActionBucket, number> = {
  homeland: 0,
  nearest: 1,
  other: 2,
};

const TABLE_HEADERS = ['Unit ID', 'Unit Type', 'Action Types', 'Hex', 'Distance', 'Enemy Units', 'Hex Features'];

const ACTION_TYPE_ORDER: Record<string, number> = {
  [ACTION_APPROACH]: 0,
  [ACTION_MOVES_MELEE]: 1,
  [ACTION_RANGED]: 2,
  [ACTION_AIR_STRIKES]: 3,
};

/**
 * Drops the unit's current hex from a candidate list (no-op move is never listed as a "possible action" destination).
 *
 * Purpose: Shared filter for move, ferry, strike, and ranged candidate hex lists.
 * When to use: Before `appendRowsForLegalHexes` partitions buckets.
 * Expected outcome: Same hexes minus `unitH3` when present.
 * Exceptions: None.
 */
export function excludeUnitCurrentHex(unitH3: string, hexes: string[]): string[] {
  return hexes.filter((h3) => h3 !== unitH3);
}

/**
 * Derives the Action column label for the Commander **Best Options This Turn** table (matches briefing markdown semantics).
 *
 * Purpose: Single source for rendered action text in the **Best Options This Turn** markdown table.
 * When to use: `renderThisTurnOptionsTableMarkdown` (via import).
 * Expected outcome: One of `air strike`, `ranged`, `approach`, `move/melee`, or the raw `actionTypes` string as fallback.
 * Exceptions: None.
 */
export function deriveThisTurnOptionsActionColumn(r: PossibleActionTableRow): string {
  if (r.actionTypes.includes('air strike') || r.actionTypes.includes('air_strike')) return 'air strike';
  if (r.actionTypes.includes('ranged')) return 'ranged';
  if (r.actionTypes.includes('approach')) return 'approach';
  if (r.actionTypes.includes('move') || r.actionTypes.includes('melee')) return 'move/melee';
  return r.actionTypes;
}

/**
 * Picks the richer human-readable summary cell when merging duplicate table keys.
 *
 * Purpose: Prefer longer / non-em-dash summaries when two raw rows target the same hex.
 * When to use: `aggregateRows` merge path for `enemySummary` and `featuresSummary`.
 * Expected outcome: Non-placeholder text when either side has detail.
 * Exceptions: None.
 */
function preferredSummary(a: string, b: string): string {
  if (a === '—') return b;
  if (b === '—') return a;
  return b.length > a.length ? b : a;
}

/**
 * Merges raw per-action rows into deduplicated table rows with combined `actionTypes` strings.
 *
 * Purpose: Collapses multiple action types targeting the same hex into one markdown row per unit/target.
 * When to use: After all `appendRowsForLegalHexes` calls populated `rawRows`.
 * Expected outcome: Sorted `actionTypes` label ordering via `ACTION_TYPE_ORDER`.
 * Exceptions: None.
 */
export function aggregateRows(rows: RawPossibleActionRow[]): PossibleActionTableRow[] {
  const byKey = new Map<string, { row: Omit<PossibleActionTableRow, 'actionTypes'>; actionTypes: Set<string> }>();
  for (const row of rows) {
    const key = `${row.unitId}|${row.unitType}|${row.targetH3}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        row: {
          bucket: row.bucket,
          unitId: row.unitId,
          unitType: row.unitType,
          targetH3: row.targetH3,
          distance: row.distance,
          enemySummary: row.enemySummary,
          featuresSummary: row.featuresSummary,
          enemyUnitCount: row.enemyUnitCount,
          urbanHexCount: row.urbanHexCount,
        },
        actionTypes: new Set([row.actionType]),
      });
      continue;
    }
    existing.actionTypes.add(row.actionType);
    if (BUCKET_PRIORITY[row.bucket] < BUCKET_PRIORITY[existing.row.bucket]) {
      existing.row.bucket = row.bucket;
    }
    existing.row.enemySummary = preferredSummary(existing.row.enemySummary, row.enemySummary);
    existing.row.featuresSummary = preferredSummary(existing.row.featuresSummary, row.featuresSummary);
    existing.row.enemyUnitCount = Math.max(existing.row.enemyUnitCount, row.enemyUnitCount);
    existing.row.urbanHexCount = Math.max(existing.row.urbanHexCount, row.urbanHexCount);
  }
  const out: PossibleActionTableRow[] = [];
  for (const { row, actionTypes } of byKey.values()) {
    const sortedTypes = [...actionTypes].sort(
      (a, b) => (ACTION_TYPE_ORDER[a] ?? 999) - (ACTION_TYPE_ORDER[b] ?? 999) || a.localeCompare(b)
    );
    out.push({ ...row, actionTypes: sortedTypes.join(', ') });
  }
  return out;
}

/**
 * Builds markdown table lines for one possible-actions subsection body.
 *
 * Purpose: Centralizes header contract with `buildPromptTableLines`.
 * When to use: `buildPossibleUnitActionsMarkdown` subsection renderer.
 * Expected outcome: GFM-friendly table lines including header row from `TABLE_HEADERS`.
 * Exceptions: None.
 */
export function markdownTableLines(rows: string[][]): string[] {
  return buildPromptTableLines(TABLE_HEADERS, rows);
}

/**
 * Comparator for picking the top preview rows per unit for briefing size limits.
 *
 * Purpose: Deterministic tie-break when many legal targets exist for one unit.
 * When to use: `selectTopRowsPerUnit` sort step.
 * Expected outcome: Higher enemy pressure and shorter distance sort earlier; stable hex tie-break.
 * Exceptions: None.
 */
function compareTableRowsForUnitPriority(
  a: PossibleActionTableRow,
  b: PossibleActionTableRow,
  latLngByH3: Map<string, [number, number]>
): number {
  if (a.enemyUnitCount !== b.enemyUnitCount) return b.enemyUnitCount - a.enemyUnitCount;
  if (a.urbanHexCount !== b.urbanHexCount) return b.urbanHexCount - a.urbanHexCount;
  if (a.distance !== b.distance) return a.distance - b.distance;
  const byAction = a.actionTypes.localeCompare(b.actionTypes);
  if (byAction !== 0) return byAction;
  const la = latLngByH3.get(a.targetH3);
  const lb = latLngByH3.get(b.targetH3);
  if (la && lb) {
    if (la[0] !== lb[0]) return la[0] - lb[0];
    if (la[1] !== lb[1]) return la[1] - lb[1];
  }
  const ca = compareHexIds(a.targetH3, b.targetH3);
  if (ca !== 0) return ca;
  return a.unitType.localeCompare(b.unitType);
}

/**
 * Keeps at most five highest-priority rows per unit id for briefing brevity.
 *
 * Purpose: Caps table size while preserving the most tactically salient targets per unit.
 * When to use: After `groupRowsByBucket`, inside each markdown subsection.
 * Expected outcome: At most five rows per `unitId`, globally sorted within that unit's list.
 * Exceptions: None.
 */
export function selectTopRowsPerUnit(
  rows: PossibleActionTableRow[],
  latLngByH3: Map<string, [number, number]>
): PossibleActionTableRow[] {
  const byUnit = new Map<string, PossibleActionTableRow[]>();
  for (const row of rows) {
    const list = byUnit.get(row.unitId) ?? [];
    list.push(row);
    byUnit.set(row.unitId, list);
  }
  const unitIds = [...byUnit.keys()].sort((a, b) => a.localeCompare(b));
  const out: PossibleActionTableRow[] = [];
  for (const unitId of unitIds) {
    const unitRows = byUnit.get(unitId) ?? [];
    unitRows.sort((a, b) => compareTableRowsForUnitPriority(a, b, latLngByH3));
    out.push(...unitRows.slice(0, 5));
  }
  return out;
}

/**
 * Splits aggregated rows into homeland / nearest / other buckets for subsection rendering.
 *
 * Purpose: Stable ordering of markdown blocks independent of row collection order.
 * When to use: Immediately before per-bucket subsection titles and tables.
 * Expected outcome: Arrays may be empty for unused buckets.
 * Exceptions: None.
 */
export function groupRowsByBucket(rows: PossibleActionTableRow[]): Record<PossibleActionBucket, PossibleActionTableRow[]> {
  const grouped: Record<PossibleActionBucket, PossibleActionTableRow[]> = {
    homeland: [],
    nearest: [],
    other: [],
  };
  for (const row of rows) grouped[row.bucket].push(row);
  return grouped;
}
