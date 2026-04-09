/**
 * Builds the "Possible unit actions" markdown block for AI Commander's Briefings.
 * Derives legal one-step moves/melee reach, air ferry destinations, ranged attacks, and air strikes from order validation rules.
 */

import { gridDistance, gridDisk } from 'h3-js';
import { type GameStateSnapshot } from '../gameDb';
import { getRange } from '../combatConstants';
import { getValidDestinations } from '../oneStepMoveDestinations';
import { AIR_FERRY_RANGE_HEXES, AIR_STRIKE_RANGE_HEXES } from '../../shared/tacticalRanges';
import { isWithinGridRangeSafe } from '../game-actions/gridRange';
import { logDebug, logTrace } from '../logger';
import { logHexControllerParityMismatch } from '../snapshotDbParity';
import { buildPromptTableLines } from '../promptTableUtils';

const ENEMY_PLAYER = 'human';
const FRIENDLY_PLAYER = 'opponent';

const ACTION_MOVES_MELEE = 'move/melee';
const ACTION_RANGED = 'ranged attack';
const ACTION_AIR_STRIKES = 'air strike';
const BUCKET_TITLES: Array<{ bucket: PossibleActionTableRow['bucket']; title: string }> = [
  { bucket: 'homeland', title: 'Enemy homeland hexes' },
  { bucket: 'nearest', title: 'Hexes nearest to enemy homeland' },
  { bucket: 'other', title: 'Other hexes' },
];
const BUCKET_PRIORITY: Record<PossibleActionTableRow['bucket'], number> = {
  homeland: 0,
  nearest: 1,
  other: 2,
};

/** Row shape for markdown tables under homeland / nearest / other subsections. */
export interface PossibleActionTableRow {
  bucket: 'homeland' | 'nearest' | 'other';
  unitId: string;
  unitType: string;
  actionTypes: string;
  targetH3: string;
  distance: number;
  enemySummary: string;
  featuresSummary: string;
  enemyUnitCount: number;
  urbanHexCount: number;
}

/** Removes the unit's current hex from briefing lists (not a meaningful destination/target line). */
function excludeUnitCurrentHex(unitH3: string, hexes: string[]): string[] {
  return hexes.filter((h3) => h3 !== unitH3);
}

interface InfraCounts {
  urban: number;
  seaport: number;
  airport: number;
}

interface IndexedState {
  infraByHex: Map<string, InfraCounts>;
  controlByHex: Map<string, string | null>;
  enemyUnitsByHex: Map<string, Array<{ unitType: string }>>;
  hexSet: Set<string>;
}

function buildIndexedState(state: GameStateSnapshot): IndexedState {
  const infraByHex = new Map<string, InfraCounts>();
  for (const row of state.res1Infrastructure ?? []) {
    infraByHex.set(row.h3Index, {
      urban: Number(row.urbanHexCount ?? 0),
      seaport: Number(row.seaportCount ?? 0),
      airport: Number(row.airportCount ?? 0),
    });
  }
  const controlByHex = new Map<string, string | null>();
  for (const row of state.res1Control ?? []) {
    controlByHex.set(row.h3Index, row.controllerPlayerId ?? null);
  }
  const enemyUnitsByHex = new Map<string, Array<{ unitType: string }>>();
  for (const unit of state.units) {
    if (unit.player !== ENEMY_PLAYER) continue;
    const list = enemyUnitsByHex.get(unit.h3Index) ?? [];
    list.push({ unitType: unit.unitType });
    enemyUnitsByHex.set(unit.h3Index, list);
  }
  return {
    infraByHex,
    controlByHex,
    enemyUnitsByHex,
    hexSet: new Set(state.hexes.map((h) => h.h3Index)),
  };
}

function enemyHomelandHexSet(state: GameStateSnapshot): Set<string> {
  return new Set(state.humanHomeRegionHexes ?? []);
}

function minDistanceToHomeland(h3: string, homeland: Set<string>): number | null {
  if (homeland.size === 0) return null;
  let min = Infinity;
  for (const t of homeland) {
    try {
      const d = gridDistance(h3, t);
      if (d < min) min = d;
    } catch {
      continue;
    }
  }
  return min === Infinity ? null : min;
}

/**
 * Why this exists:
 *     Encodes the briefing rule that "Enemy homeland hexes" and "Hexes nearest to enemy homeland" are mutually exclusive,
 *     and that all targets at the minimum distance to homeland are included when using the nearest bucket.
 * When to use:
 *     When formatting possible moves, ranged targets, or air-strike targets for the Commander's Briefing (and in tests).
 * What to expect:
 *     Returns three disjoint lists: targets inside scenario enemy homeland (if any legal targets hit it), else all targets
 *     at minimum grid distance to that homeland (ties kept), plus remaining targets under "other". Empty homeland set
 *     puts every legal hex in "other" and leaves homeland and nearest empty.
 */
export function partitionHomelandNearestOther(legalHexes: string[], homelandSet: Set<string>): {
  homeland: string[];
  nearest: string[];
  other: string[];
} {
  logTrace('possibleUnitActions partitionHomelandNearestOther', {
    legalHexCount: legalHexes.length,
    homelandHexCount: homelandSet.size,
  });
  const unique = [...new Set(legalHexes)];
  if (homelandSet.size === 0) return { homeland: [], nearest: [], other: unique.sort(compareHexIds) };
  const inHomeland = unique.filter((h) => homelandSet.has(h));
  if (inHomeland.length > 0) {
    const other = unique.filter((h) => !homelandSet.has(h)).sort(compareHexIds);
    return { homeland: inHomeland.sort(compareHexIds), nearest: [], other };
  }
  const withDist = unique
    .map((h) => ({ h, d: minDistanceToHomeland(h, homelandSet) }))
    .filter((x): x is { h: string; d: number } => x.d !== null);
  if (withDist.length === 0) return { homeland: [], nearest: [], other: unique.sort(compareHexIds) };
  const minD = Math.min(...withDist.map((x) => x.d));
  const nearest = withDist.filter((x) => x.d === minD).map((x) => x.h).sort(compareHexIds);
  const other = withDist.filter((x) => x.d > minD).map((x) => x.h).sort(compareHexIds);
  return { homeland: [], nearest, other };
}

function compareHexIds(a: string, b: string): number {
  return a.localeCompare(b);
}

function sortHexesByLatLng(hexes: string[], latLngByH3: Map<string, [number, number]>): string[] {
  return [...hexes].sort((a, b) => {
    const la = latLngByH3.get(a);
    const lb = latLngByH3.get(b);
    if (la && lb) {
      if (la[0] !== lb[0]) return la[0] - lb[0];
      if (la[1] !== lb[1]) return la[1] - lb[1];
    }
    return compareHexIds(a, b);
  });
}

function getInfra(indexed: IndexedState, h3: string): InfraCounts {
  return indexed.infraByHex.get(h3) ?? { urban: 0, seaport: 0, airport: 0 };
}

/** Comma-separated enemy unit counts at hex, or null when no enemies (omit from briefing). */
function describeEnemyUnitsAtHex(indexed: IndexedState, h3: string): string | null {
  const atHex = indexed.enemyUnitsByHex.get(h3) ?? [];
  if (atHex.length === 0) return null;
  const byType = new Map<string, number>();
  for (const u of atHex) {
    byType.set(u.unitType, (byType.get(u.unitType) ?? 0) + 1);
  }
  return [...byType.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([t, n]) => `${n} ${t}`)
    .join(', ');
}

function describeInfrastructure(inf: InfraCounts): string | null {
  const parts: string[] = [];
  if (inf.urban > 0) parts.push(`${inf.urban} urban hex${inf.urban === 1 ? '' : 'es'}`);
  if (inf.seaport > 0) parts.push(`${inf.seaport} seaport${inf.seaport === 1 ? '' : 's'}`);
  if (inf.airport > 0) parts.push(`${inf.airport} airport${inf.airport === 1 ? '' : 's'}`);
  if (parts.length === 0) return null;
  return parts.join(', ');
}

function strikeKindsForHex(indexed: IndexedState, targetH3: string): string[] {
  const kinds: string[] = [];
  if ((indexed.enemyUnitsByHex.get(targetH3)?.length ?? 0) > 0) kinds.push('enemy units');
  const inf = getInfra(indexed, targetH3);
  if (inf.urban > 0) kinds.push('urban');
  if (inf.airport > 0) kinds.push('airport');
  if (inf.seaport > 0) kinds.push('seaport');
  return kinds;
}

function featuresCellForStrike(indexed: IndexedState, h3: string): string {
  const inf = describeInfrastructure(getInfra(indexed, h3));
  const kinds = strikeKindsForHex(indexed, h3);
  const strikePart = kinds.length > 0 ? `strike: ${kinds.join(', ')}` : '';
  if (inf && strikePart) return `${inf}; ${strikePart}`;
  if (strikePart) return strikePart;
  if (inf) return inf;
  return '—';
}

function featuresCellForHex(indexed: IndexedState, h3: string): string {
  return describeInfrastructure(getInfra(indexed, h3)) ?? '—';
}

function enemyCell(indexed: IndexedState, h3: string): string {
  return describeEnemyUnitsAtHex(indexed, h3) ?? '—';
}

function safeGridDistance(from: string, to: string): number | null {
  try {
    return gridDistance(from, to);
  } catch {
    return null;
  }
}

interface RawPossibleActionRow {
  bucket: 'homeland' | 'nearest' | 'other';
  unitId: string;
  unitType: string;
  actionType: string;
  targetH3: string;
  distance: number;
  enemySummary: string;
  featuresSummary: string;
  enemyUnitCount: number;
  urbanHexCount: number;
}

function appendRowsForLegalHexes(args: {
  rows: RawPossibleActionRow[];
  unitId: string;
  unitType: string;
  unitH3: string;
  actionType: string;
  legalHexes: string[];
  homeland: Set<string>;
  indexed: IndexedState;
  latLngByH3: Map<string, [number, number]>;
  isAirStrike: boolean;
}): void {
  const parts = partitionHomelandNearestOther(args.legalHexes, args.homeland);
  const addForBucket = (bucket: PossibleActionTableRow['bucket'], hexList: string[]): void => {
    for (const h3 of sortHexesByLatLng(hexList, args.latLngByH3)) {
      const d = safeGridDistance(args.unitH3, h3);
      if (d === null) continue;
      args.rows.push({
        bucket,
        unitId: args.unitId,
        unitType: args.unitType,
        actionType: args.actionType,
        targetH3: h3,
        distance: d,
        enemySummary: enemyCell(args.indexed, h3),
        featuresSummary: args.isAirStrike ? featuresCellForStrike(args.indexed, h3) : featuresCellForHex(args.indexed, h3),
        enemyUnitCount: (args.indexed.enemyUnitsByHex.get(h3) ?? []).length,
        urbanHexCount: getInfra(args.indexed, h3).urban,
      });
    }
  };
  addForBucket('homeland', parts.homeland);
  addForBucket('nearest', parts.nearest);
  addForBucket('other', parts.other);
}

function airBaseHasIntactAirport(indexed: IndexedState, airH3: string): boolean {
  return getInfra(indexed, airH3).airport > 0;
}

/**
 * Why this exists:
 *     Lists air ferry destinations for the Commander's Briefing using the same geometric and infrastructure rules as
 *     `validateFerryOrder`, while using snapshot control rows (not live DB reads) for inclusion.
 * When to use:
 *     Only from `buildPossibleUnitActionsMarkdown` for opponent `air` units with an intact base airport.
 * What to expect:
 *     H3 indices within ferry range with destination airports and `res1Control` matching the unit owner; parity logging
 *     may record mismatch against `getHexController` without altering the returned list.
 */
function collectLegalFerryDestinationHexes(
  unit: { id: string; h3Index: string; player: string; unitType: string },
  indexed: IndexedState
): string[] {
  if (unit.unitType !== 'air') return [];
  if (!airBaseHasIntactAirport(indexed, unit.h3Index)) return [];
  let candidates: string[];
  try {
    candidates = gridDisk(unit.h3Index, AIR_FERRY_RANGE_HEXES).filter((h3) => indexed.hexSet.has(h3) && h3 !== unit.h3Index);
  } catch {
    candidates = [];
    for (const h3 of indexed.hexSet) {
      if (h3 === unit.h3Index) continue;
      if (isWithinGridRangeSafe(unit.h3Index, h3, AIR_FERRY_RANGE_HEXES, 'possibleUnitActions ferry disk fallback')) {
        candidates.push(h3);
      }
    }
  }
  const out = new Set<string>();
  for (const h3 of candidates) {
    if (!isWithinGridRangeSafe(unit.h3Index, h3, AIR_FERRY_RANGE_HEXES, 'possibleUnitActions ferry')) continue;
    if (getInfra(indexed, h3).airport <= 0) continue;
    const snapshotController = indexed.controlByHex.get(h3) ?? null;
    if (snapshotController !== unit.player) continue;
    logHexControllerParityMismatch({
      h3Index: h3,
      snapshotController,
      context: 'possibleUnitActions ferry destination',
      unitId: unit.id,
    });
    out.add(h3);
  }
  return [...out];
}

function collectRangedTargetHexes(unitH3: string, unitType: string, indexed: IndexedState): string[] {
  const r = getRange(unitType);
  if (r < 1) return [];
  const out = new Set<string>();
  for (const enemyHex of indexed.enemyUnitsByHex.keys()) {
    try {
      const d = gridDistance(unitH3, enemyHex);
      if (d >= 0 && d <= r) out.add(enemyHex);
    } catch {
      continue;
    }
  }
  return [...out];
}

function collectStrikeHexesForAirUnit(airH3: string, indexed: IndexedState): string[] {
  try {
    const disk = gridDisk(airH3, AIR_STRIKE_RANGE_HEXES);
    return disk.filter((h3) => indexed.hexSet.has(h3));
  } catch {
    const out: string[] = [];
    for (const h3 of indexed.hexSet) {
      if (isWithinGridRangeSafe(airH3, h3, AIR_STRIKE_RANGE_HEXES, 'possibleUnitActions strike scan')) out.push(h3);
    }
    return out;
  }
}

const TABLE_HEADERS = ['Unit ID', 'Unit Type', 'Action Types', 'Hex', 'Distance', 'Enemy Units', 'Hex Features'];

const ACTION_TYPE_ORDER: Record<string, number> = {
  'move/melee': 0,
  'ranged attack': 1,
  'air strike': 2,
};

function preferredSummary(a: string, b: string): string {
  if (a === '—') return b;
  if (b === '—') return a;
  return b.length > a.length ? b : a;
}

function aggregateRows(rows: RawPossibleActionRow[]): PossibleActionTableRow[] {
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
    const sortedTypes = [...actionTypes].sort((a, b) => (ACTION_TYPE_ORDER[a] ?? 999) - (ACTION_TYPE_ORDER[b] ?? 999) || a.localeCompare(b));
    out.push({ ...row, actionTypes: sortedTypes.join(', ') });
  }
  return out;
}

function markdownTableLines(rows: string[][]): string[] {
  return buildPromptTableLines(TABLE_HEADERS, rows);
}

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

function selectTopRowsPerUnit(
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

function groupRowsByBucket(rows: PossibleActionTableRow[]): Record<PossibleActionTableRow['bucket'], PossibleActionTableRow[]> {
  const grouped: Record<PossibleActionTableRow['bucket'], PossibleActionTableRow[]> = {
    homeland: [],
    nearest: [],
    other: [],
  };
  for (const row of rows) grouped[row.bucket].push(row);
  return grouped;
}

/**
 * Why this exists:
 *     Produces the structured "Possible unit actions" briefing section so the model sees legal moves and attacks without extra tool calls.
 * When to use:
 *     During `formatBriefing` when precomputation is enabled (opponent perspective snapshot).
 * What to expect:
 *     Markdown with three optional subsections (Enemy homeland hexes / nearest / other), each a table mixing units and action types.
 *     Air ferry destinations use snapshot `res1Control` only; error-level logs may record parity disagreement for those hexes.
 */
export function buildPossibleUnitActionsMarkdown(args: {
  state: GameStateSnapshot;
  latLngByH3: Map<string, [number, number]>;
  formatLatLng: (ll: [number, number]) => string;
}): string {
  logDebug('possibleUnitActions buildPossibleUnitActionsMarkdown', { turnNumber: args.state.turnNumber });
  const { state, latLngByH3, formatLatLng } = args;
  const indexed = buildIndexedState(state);
  const homeland = enemyHomelandHexSet(state);
  const opponentUnits = state.units.filter((u) => u.player === FRIENDLY_PLAYER).sort((a, b) => a.id.localeCompare(b.id));
  const rawRows: RawPossibleActionRow[] = [];

  for (const unit of opponentUnits) {
    const moveHexes = excludeUnitCurrentHex(
      unit.h3Index,
      unit.unitType === 'air'
        ? collectLegalFerryDestinationHexes(unit, indexed)
        : getValidDestinations(unit, state)
    );
    if (moveHexes.length > 0) {
      appendRowsForLegalHexes({
        rows: rawRows,
        unitId: unit.id,
        unitType: unit.unitType,
        unitH3: unit.h3Index,
        actionType: ACTION_MOVES_MELEE,
        legalHexes: moveHexes,
        homeland,
        indexed,
        latLngByH3,
        isAirStrike: false,
      });
    }

    if (unit.unitType === 'air' && airBaseHasIntactAirport(indexed, unit.h3Index)) {
      const strikeTargets = excludeUnitCurrentHex(
        unit.h3Index,
        collectStrikeHexesForAirUnit(unit.h3Index, indexed)
          .filter((h3) => isWithinGridRangeSafe(unit.h3Index, h3, AIR_STRIKE_RANGE_HEXES, 'possibleUnitActions air strike'))
          .filter((h3) => strikeKindsForHex(indexed, h3).length > 0)
      );
      if (strikeTargets.length > 0) {
        appendRowsForLegalHexes({
          rows: rawRows,
          unitId: unit.id,
          unitType: unit.unitType,
          unitH3: unit.h3Index,
          actionType: ACTION_AIR_STRIKES,
          legalHexes: strikeTargets,
          homeland,
          indexed,
          latLngByH3,
          isAirStrike: true,
        });
      }
    }

    if (unit.unitType !== 'air' && getRange(unit.unitType as 'infantry' | 'armor' | 'naval' | 'air') >= 1) {
      const rangedHexes = excludeUnitCurrentHex(unit.h3Index, collectRangedTargetHexes(unit.h3Index, unit.unitType, indexed));
      if (rangedHexes.length > 0) {
        appendRowsForLegalHexes({
          rows: rawRows,
          unitId: unit.id,
          unitType: unit.unitType,
          unitH3: unit.h3Index,
          actionType: ACTION_RANGED,
          legalHexes: rangedHexes,
          homeland,
          indexed,
          latLngByH3,
          isAirStrike: false,
        });
      }
    }
  }

  if (rawRows.length === 0) return '';
  const rows = aggregateRows(rawRows);

  const byBucket = groupRowsByBucket(rows);

  const subsection = (title: string, bucketRows: PossibleActionTableRow[]): string[] => {
    if (bucketRows.length === 0) return [];
    const trimmed = selectTopRowsPerUnit(bucketRows, latLngByH3);
    const tableBody = trimmed.map((r) => {
      const ll = latLngByH3.get(r.targetH3);
      const hexStr = ll ? formatLatLng(ll) : r.targetH3;
      return [r.unitId, r.unitType, r.actionTypes, hexStr, String(r.distance), r.enemySummary, r.featuresSummary];
    });
    return [`### ${title}`, '', ...markdownTableLines(tableBody), ''];
  };

  const parts: string[] = ['**Possible unit actions**', ''];
  for (const item of BUCKET_TITLES) parts.push(...subsection(item.title, byBucket[item.bucket]));
  while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return parts.join('\n');
}
