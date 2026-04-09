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

const ENEMY_PLAYER = 'human';
const FRIENDLY_PLAYER = 'opponent';
const MOVES_MELEE_SECTION = '  - Moves/Melee attacks:';

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

/**
 * One briefing line for a candidate hex: coordinates, then optional parenthesis with only non-empty
 * enemy/infra facts (no "none" or zero placeholders).
 */
function formatPossibleActionHexDetail(
  indexed: IndexedState,
  h3: string,
  latLngByH3: Map<string, [number, number]>,
  formatLatLng: (ll: [number, number]) => string
): string {
  const ll = latLngByH3.get(h3);
  const pos = ll ? formatLatLng(ll) : h3;
  const inf = getInfra(indexed, h3);
  const segments: string[] = [];
  const enemyDesc = describeEnemyUnitsAtHex(indexed, h3);
  if (enemyDesc !== null) segments.push(`enemy units: ${enemyDesc}`);
  const infraDesc = describeInfrastructure(inf);
  if (infraDesc !== null) segments.push(`features: ${infraDesc}`)
  if (segments.length === 0) return pos;
  return `${pos} (${segments.join('; ')})`;
}

function formatAirStrikeHexDetail(
  indexed: IndexedState,
  h3: string,
  latLngByH3: Map<string, [number, number]>,
  formatLatLng: (ll: [number, number]) => string,
  strikeKinds: string[]
): string {
  const base = formatPossibleActionHexDetail(indexed, h3, latLngByH3, formatLatLng);
  const kinds = strikeKinds.join(', ');
  return `${base}; strikes: ${kinds}`;
}

function buildBucketLines(
  homeland: string[],
  nearest: string[],
  other: string[],
  latLngByH3: Map<string, [number, number]>,
  lineDetail: (h3: string) => string
): string[] {
  const out: string[] = [];
  if (homeland.length > 0) {
    out.push('    - Enemy homeland hexes:');
    for (const h3 of sortHexesByLatLng(homeland, latLngByH3)) out.push(`        - ${lineDetail(h3)}`);
  }
  if (nearest.length > 0) {
    out.push('    - Hexes nearest to enemy homeland:');
    for (const h3 of sortHexesByLatLng(nearest, latLngByH3)) out.push(`        - ${lineDetail(h3)}`);
  }
  if (other.length > 0) {
    out.push('    - Other hexes:');
    for (const h3 of sortHexesByLatLng(other, latLngByH3)) out.push(`        - ${lineDetail(h3)}`);
  }
  return out;
}

function buildActionSectionLines(args: {
  label: string;
  legalHexes: string[];
  homeland: Set<string>;
  latLngByH3: Map<string, [number, number]>;
  detailForHex: (h3: string) => string;
}): string[] {
  if (args.legalHexes.length === 0) return [];
  const parts = partitionHomelandNearestOther(args.legalHexes, args.homeland);
  const bucketLines = buildBucketLines(parts.homeland, parts.nearest, parts.other, args.latLngByH3, args.detailForHex);
  if (bucketLines.length === 0) return [];
  return [args.label, ...bucketLines];
}

function collectRangedTargetHexes(
  unitH3: string,
  unitType: string,
  indexed: IndexedState
): string[] {
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

function strikeKindsForHex(indexed: IndexedState, targetH3: string): string[] {
  const kinds: string[] = [];
  if ((indexed.enemyUnitsByHex.get(targetH3)?.length ?? 0) > 0) kinds.push('enemy units');
  const inf = getInfra(indexed, targetH3);
  if (inf.urban > 0) kinds.push('urban');
  if (inf.airport > 0) kinds.push('airport');
  if (inf.seaport > 0) kinds.push('seaport');
  return kinds;
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

/**
 * Why this exists:
 *     Produces the structured "Possible unit actions" briefing section so the model sees legal moves and attacks without extra tool calls.
 * When to use:
 *     During `formatBriefing` when precomputation is enabled (opponent perspective snapshot).
 * What to expect:
 *     Multi-line markdown, empty string when there are no opponent units or no actionable content. Air ferry destinations
 *     use snapshot `res1Control` only; error-level logs record any disagreement with live `getHexController` for those hexes.
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
  const unitBlocks: string[] = [];

  for (const unit of opponentUnits) {
    const sub: string[] = [];

    const moveHexes = excludeUnitCurrentHex(
      unit.h3Index,
      unit.unitType === 'air'
        ? collectLegalFerryDestinationHexes(unit, indexed)
        : getValidDestinations(unit, state)
    );
    sub.push(
      ...buildActionSectionLines({
        label: MOVES_MELEE_SECTION,
        legalHexes: moveHexes,
        homeland,
        latLngByH3,
        detailForHex: (h3) => formatPossibleActionHexDetail(indexed, h3, latLngByH3, formatLatLng),
      })
    );

    if (unit.unitType === 'air' && airBaseHasIntactAirport(indexed, unit.h3Index)) {
      const strikeTargets = excludeUnitCurrentHex(
        unit.h3Index,
        collectStrikeHexesForAirUnit(unit.h3Index, indexed)
          .filter((h3) => isWithinGridRangeSafe(unit.h3Index, h3, AIR_STRIKE_RANGE_HEXES, 'possibleUnitActions air strike'))
          .filter((h3) => strikeKindsForHex(indexed, h3).length > 0)
      );
      sub.push(
        ...buildActionSectionLines({
          label: '  - Air strikes:',
          legalHexes: strikeTargets,
          homeland,
          latLngByH3,
          detailForHex: (h3) =>
            formatAirStrikeHexDetail(indexed, h3, latLngByH3, formatLatLng, strikeKindsForHex(indexed, h3)),
        })
      );
    }

    if (unit.unitType !== 'air' && getRange(unit.unitType) >= 1) {
      sub.push(
        ...buildActionSectionLines({
          label: '  - Ranged attacks:',
          legalHexes: excludeUnitCurrentHex(
            unit.h3Index,
            collectRangedTargetHexes(unit.h3Index, unit.unitType, indexed)
          ),
          homeland,
          latLngByH3,
          detailForHex: (h3) => formatPossibleActionHexDetail(indexed, h3, latLngByH3, formatLatLng),
        })
      );
    }

    if (sub.length > 0) {
      unitBlocks.push(`- ${unit.id} (${unit.unitType}):`);
      unitBlocks.push(...sub);
    }
  }

  if (unitBlocks.length === 0) return '';
  return ['**Possible unit actions**', '', ...unitBlocks].join('\n');
}
