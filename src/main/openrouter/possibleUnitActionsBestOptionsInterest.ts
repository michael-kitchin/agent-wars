/**
 * Best Options This Turn interest and approach filters for Commander briefing tables.
 *
 * Purpose: Keeps occupancy/control interest (enemy ∪ uncontrolled unoccupied infra), empty-interest approach,
 * and this-turn air-strike filters out of `possibleUnitActions.ts` so both files stay under the source-size limit.
 * When to use: From `collectAggregatedPossibleActionRows` after legal this-turn dests / strike hexes are collected.
 * Expected outcome: Interest hexes as move/melee, or approach hexes that strictly close on the nearest observed enemy;
 * this-turn air strikes limited to enemy-occupied or human-controlled infra (strategic) / human-occupied (tactical).
 * Exceptions: Does not change legal-target collectors or order validation.
 */

import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { gridHopDistanceBetween, pickApproachHexesTowardNearestEnemy } from '../tools/assessUnitProximity';
import { logDebug } from '../logger';
import { ACTION_APPROACH, ACTION_MOVES_MELEE } from './possibleUnitActionsTableAssembly';

/**
 * Indexed snapshot fields the interest/approach filters read.
 *
 * Purpose: Avoid importing `IndexedState` from `possibleUnitActions.ts` (circular).
 * When to use: `filterGroundMoveHexesForThisTurnOptionsTable` and `applyInterestOrApproach`.
 * Expected outcome: Structurally matches the maps `buildPossibleActionsIndexedState` fills.
 * Exceptions: None.
 */
export type BestOptionsInterestIndex = {
  /**
   * Human units by hex; presence means the hex is enemy-occupied interest.
   *
   * Contract: Keys are occupied hexes; empty arrays are treated as unoccupied.
   * When to use: Enemy-occupied signal and nearest-enemy Target Units summaries.
   * Expected outcome: Every human unit in the snapshot appears under its `h3Index`.
   * Exceptions: None.
   */
  enemyUnitsByHex: ReadonlyMap<string, ReadonlyArray<{ id: string; unitType: string }>>;
  /**
   * AI units by hex; presence blocks interesting-infrastructure unless the hex is also enemy-occupied.
   *
   * Contract: Contested hexes may appear here and in `enemyUnitsByHex`.
   * When to use: Strategic interesting-infrastructure occupancy.
   * Expected outcome: Every opponent unit in the snapshot appears under its `h3Index`.
   * Exceptions: None.
   */
  friendlyUnitsByHex: ReadonlyMap<string, ReadonlyArray<{ id: string; unitType: string }>>;
  /**
   * Res1 controller by hex; `null` / missing means uncontrolled.
   *
   * Contract: Missing keys are treated as `null`.
   * When to use: Strategic interesting-infrastructure control check.
   * Expected outcome: Same mapping as snapshot `res1Control`.
   * Exceptions: None.
   */
  controlByHex: ReadonlyMap<string, string | null>;
  /**
   * Urban / seaport / airport counts by hex.
   *
   * Contract: Missing keys are treated as zeros.
   * When to use: Strategic interesting-infrastructure presence.
   * Expected outcome: Same mapping as snapshot `res1Infrastructure`.
   * Exceptions: None.
   */
  infraByHex: ReadonlyMap<string, { urban: number; seaport: number; airport: number }>;
};

/**
 * Feature-override row used when scoring tactical Best Options infrastructure interest.
 *
 * Purpose: Lets ground-move and ranged this-turn filters share one `rowByH3` map without repeating the override shape.
 * When to use: `TacticalBestOptionsInterestContext` and `keepsTacticalBestOptionsThisTurnHex` only.
 * Expected outcome: Matches `listRes4FeatureOverridesForGame` fields consumed by the interest predicate.
 * Exceptions: None.
 */
export type TacticalBestOptionsFeatureRow = {
  /** Res4 index this override describes. */
  h3Index: string;
  /** True when the override marks an intact urban tile. */
  isUrban: boolean;
  /** True when the override marks an intact airport tile. */
  isAirport: boolean;
  /** True when the override marks an intact seaport tile. */
  isSeaport: boolean;
  /** True when the tile is rubble and must not count as interesting infra. */
  isRubble: boolean;
};

/**
 * Shared inputs for tactical Best Options this-turn interest (enemy ∪ uncontrolled, unoccupied infra).
 *
 * Purpose: Keeps ground-move and ranged filters on one occupancy/control rule without growing argument lists.
 * When to use: `filterTacticalGroundMoveHexesForThisTurnOptionsTable` and `filterTacticalRangedHexesForThisTurnOptionsTable`.
 * Expected outcome: Callers pass sets and the enclosing res1 controller once per `collectAggregatedPossibleActionRows` invocation.
 * Exceptions: None.
 */
export type TacticalBestOptionsInterestContext = {
  /**
   * Tactical battle snapshot used for occupancy and snapshot-map infra flags.
   *
   * Contract: `subUnits` and optional `res4IsUrbanByH3` / `res4IsSeaportByH3` must match the briefing battle.
   * When to use: Building interest context once per `collectAggregatedPossibleActionRows` call.
   * Expected outcome: Same battle object the legal-move collectors already received.
   * Exceptions: None.
   */
  battle: TacticalBattleSnapshot;
  /**
   * Res4 cells occupied by human sub-units.
   *
   * Contract: Presence is the tactical enemy-occupied signal.
   * When to use: Tactical interest and approach nearest-enemy set.
   * Expected outcome: Every human sub-unit hex is present.
   * Exceptions: None.
   */
  humanOccupiedH3: ReadonlySet<string>;
  /**
   * Res4 cells occupied by AI sub-units.
   *
   * Contract: Presence blocks interesting infra unless the cell is also human-occupied.
   * When to use: Tactical interesting-infrastructure occupancy.
   * Expected outcome: Every opponent sub-unit hex is present.
   * Exceptions: None.
   */
  friendlyOccupiedH3: ReadonlySet<string>;
  /**
   * Controller of the enclosing res1 cell (`null` when uncontrolled).
   *
   * Contract: Matches strategic `controller === null` for infrastructure interest.
   * When to use: Tactical interesting-infrastructure control check.
   * Expected outcome: `indexed.controlByHex.get(enclosingRes1H3Index) ?? null`.
   * Exceptions: None.
   */
  enclosingController: string | null;
  /**
   * Feature-override rows keyed by res4 hex.
   *
   * Contract: Missing keys mean no override; rubble rows are not interesting infra.
   * When to use: Tactical urban/airport/seaport detection alongside snapshot maps.
   * Expected outcome: Footprint overrides for the enclosing res1 only.
   * Exceptions: None.
   */
  rowByH3: ReadonlyMap<string, TacticalBestOptionsFeatureRow>;
};

/**
 * Shared Best Options This Turn interest predicate (enemy contact or interesting infrastructure).
 *
 * Purpose: Keeps strategic and tactical Best Options ground/ranged interest filters on the same rule shape.
 * When to use: After mode-specific adapters compute `enemyOccupied` / `interestingInfrastructure` for a hex.
 * Expected outcome: True when either signal is set.
 * Exceptions: None.
 */
function keepsBestOptionsThisTurnInterestHex(signals: {
  enemyOccupied: boolean;
  interestingInfrastructure: boolean;
}): boolean {
  return signals.enemyOccupied || signals.interestingInfrastructure;
}

/**
 * Reads urban/airport/seaport counts for a hex, defaulting missing rows to zeros.
 *
 * Purpose: Strategic interest must treat absent infrastructure rows as empty, not as a lookup error.
 * When to use: `filterGroundMoveHexesForThisTurnOptionsTable` only.
 * Expected outcome: A counts object; never throws.
 * Exceptions: None.
 */
function infraCounts(
  indexed: BestOptionsInterestIndex,
  h3: string
): { urban: number; seaport: number; airport: number } {
  return indexed.infraByHex.get(h3) ?? { urban: 0, seaport: 0, airport: 0 };
}

/**
 * H3 hop distance for approach scoring, including the neighbor-BFS fallback.
 *
 * Purpose: Approach and its Target Units summary must still measure the nearest observed enemy when `gridDistance` throws at a pentagon edge, which otherwise left whole stacks recommending empty cities.
 * When to use: `nearestEnemyUnitIdsSummary` and `filterApproachMoveHexesForThisTurnOptionsTable`.
 * Expected outcome: A non-negative integer distance, or null when the pair is unmeasurable even by BFS.
 * Exceptions: None; callers must treat null as skip.
 */
function safeGridDistance(from: string, to: string): number | null {
  return gridHopDistanceBetween(from, to);
}

/**
 * Summarizes nearest human unit ids from `fromH3` for Best Options approach rows (Target Units column).
 *
 * Purpose: Approach hexes are usually empty of enemies; the table still needs to show who the move closes on.
 * When to use: When `applyInterestOrApproach` emits approach rows.
 * Expected outcome: Comma-separated enemy unit ids at the minimum H3 distance; `—` when none are observed.
 * Exceptions: None; invalid distance pairs are skipped.
 */
function nearestEnemyUnitIdsSummary(indexed: BestOptionsInterestIndex, fromH3: string): string {
  let nearestDist = Infinity;
  const ids: string[] = [];
  for (const [h3, units] of indexed.enemyUnitsByHex) {
    const d = safeGridDistance(fromH3, h3);
    if (d === null) continue;
    if (d < nearestDist) {
      nearestDist = d;
      ids.length = 0;
      for (const u of units) ids.push(u.id);
    } else if (d === nearestDist) {
      for (const u of units) ids.push(u.id);
    }
  }
  if (!Number.isFinite(nearestDist) || ids.length === 0) return '—';
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b)).join(', ');
}

/**
 * Restricts **Best Options This Turn** move/melee rows to enemy-occupied hexes or uncontrolled res1 cells that still show urban, airport, or seaport infrastructure and are not friendly-occupied.
 *
 * Purpose: Strategic interest filter for the Commander Best Options table (same shape as tactical: enemy ∪ interesting infra).
 * When to use: Only from `collectAggregatedPossibleActionRows` when `forThisTurnOptionsTable` is true for non-air units in **strategic** mode (air ferry lists skip this filter).
 * Expected outcome: Filtered subset of `hexes` in caller iteration order; own stacks on uncontrolled cities are dropped so approach fallback can run.
 * Exceptions: None.
 */
export function filterGroundMoveHexesForThisTurnOptionsTable(
  indexed: BestOptionsInterestIndex,
  hexes: string[]
): string[] {
  const kept = hexes.filter((h3) => {
    const enemyOccupied = (indexed.enemyUnitsByHex.get(h3)?.length ?? 0) > 0;
    const friendlyOccupied = (indexed.friendlyUnitsByHex.get(h3)?.length ?? 0) > 0;
    const controller = indexed.controlByHex.get(h3) ?? null;
    const inf = infraCounts(indexed, h3);
    const interestingInfrastructure =
      controller === null &&
      !friendlyOccupied &&
      (inf.urban > 0 || inf.airport > 0 || inf.seaport > 0);
    return keepsBestOptionsThisTurnInterestHex({ enemyOccupied, interestingInfrastructure });
  });
  logDebug('possibleUnitActionsBestOptionsInterest filterGroundMoveHexesForThisTurnOptionsTable', {
    inCount: hexes.length,
    outCount: kept.length,
  });
  return kept;
}

/**
 * Tactical adapter for `keepsBestOptionsThisTurnInterestHex` (human contact, or uncontrolled infra the AI does not occupy).
 *
 * Purpose: Matches strategic `controller === null` for infrastructure while never listing friendly-occupied cities as Best Options.
 * When to use: Tactical this-turn ground-move and ranged hex filters only.
 * Expected outcome: True for human-occupied cells; true for urban/airport/seaport only when the enclosing res1 is uncontrolled and no friendly sub-unit occupies the cell.
 * Exceptions: None.
 */
function keepsTacticalBestOptionsThisTurnHex(h3: string, ctx: TacticalBestOptionsInterestContext): boolean {
  const enemyOccupied = ctx.humanOccupiedH3.has(h3);
  const row = ctx.rowByH3.get(h3);
  const hasInfra =
    !!ctx.battle.res4IsUrbanByH3?.[h3] ||
    !!ctx.battle.res4IsSeaportByH3?.[h3] ||
    (!!row && !row.isRubble && (row.isUrban || row.isAirport || row.isSeaport));
  const interestingInfrastructure =
    ctx.enclosingController === null && hasInfra && !ctx.friendlyOccupiedH3.has(h3);
  return keepsBestOptionsThisTurnInterestHex({ enemyOccupied, interestingInfrastructure });
}

/**
 * Restricts tactical Best Options move/melee rows to human-occupied res4 cells or uncontrolled urban/airport/seaport infrastructure.
 *
 * Purpose: Same Best Options interest shape as strategic (`keepsBestOptionsThisTurnInterestHex`) using enclosing-res1 control plus occupancy.
 * When to use: Only from `collectAggregatedPossibleActionRows` when `forThisTurnOptionsTable` and `tacticalBattle` are set for non-air units.
 * Expected outcome: Subset of `hexes` in caller iteration order; friendly-occupied cities are dropped so approach fallback can run.
 * Exceptions: None.
 */
export function filterTacticalGroundMoveHexesForThisTurnOptionsTable(
  hexes: string[],
  ctx: TacticalBestOptionsInterestContext
): string[] {
  const kept = hexes.filter((h3) => keepsTacticalBestOptionsThisTurnHex(h3, ctx));
  logDebug('possibleUnitActionsBestOptionsInterest filterTacticalGroundMoveHexesForThisTurnOptionsTable', {
    inCount: hexes.length,
    outCount: kept.length,
    enclosingController: ctx.enclosingController,
  });
  return kept;
}

/**
 * Keeps this-turn-reachable move hexes that strictly reduce H3 distance to the nearest observed enemy-occupied cell.
 *
 * Purpose: Best Options fallback when the interest filter (enemy/infra) yields no rows but units can still close.
 * When to use: Strategic and tactical this-turn tables after the interest filter returns empty for a unit.
 * Expected outcome: Subset of `hexes` that approach at least one enemy cell; empty when no enemy is observed or no hex improves distance.
 * Exceptions: Hexes with no measurable H3 distance (direct APIs and neighbor BFS) are skipped.
 *
 * Delegates to the shared `pickApproachHexesTowardNearestEnemy` so Standing Order Status suggested destinations offer the
 * same hexes these rows do; keep the named wrapper because the surrounding table code reads in Best Options terms.
 */
function filterApproachMoveHexesForThisTurnOptionsTable(
  unitH3: string,
  hexes: string[],
  enemyOccupiedH3: ReadonlySet<string>
): string[] {
  return pickApproachHexesTowardNearestEnemy(unitH3, hexes, enemyOccupiedH3);
}

/**
 * Chooses interest hexes, or approach hexes when interest is empty or infra-only.
 *
 * Purpose: Shared this-turn move resolution for strategic and tactical Best Options tables.
 * When to use: After computing `interest` from the mode-specific occupancy/infra filter.
 * Expected outcome: Enemy-contact interest as `move/melee`; otherwise approach when any closing dest exists; infra-only interest as `move/melee` only when approach cannot run.
 * Exceptions: None.
 */
export function applyInterestOrApproach(args: {
  /** Acting unit hex used as the approach distance origin. */
  unitH3: string;
  /** Already-legal this-turn dests (interest filter and approach both subset this list). */
  legalHexes: string[];
  /** Hexes that passed the mode-specific occupancy/infra interest filter. */
  interest: string[];
  /** Observed enemy-occupied hexes used when interest is empty. */
  enemyOccupiedH3: ReadonlySet<string>;
  /** Indexed snapshot used to name nearest enemies on approach rows. */
  indexed: BestOptionsInterestIndex;
}): { hexes: string[]; actionType: string; enemySummaryOverride?: string } {
  const hasEnemyContact = args.interest.some((h3) => args.enemyOccupiedH3.has(h3));
  let result: { hexes: string[]; actionType: string; enemySummaryOverride?: string };
  if (hasEnemyContact) {
    result = { hexes: args.interest, actionType: ACTION_MOVES_MELEE };
  } else {
    const occupied = new Set<string>(args.enemyOccupiedH3);
    for (const [h3, units] of args.indexed.friendlyUnitsByHex) {
      if ((units?.length ?? 0) > 0) occupied.add(h3);
    }
    const unoccupiedLegal = args.legalHexes.filter((h3) => !occupied.has(h3));
    const approach = filterApproachMoveHexesForThisTurnOptionsTable(
      args.unitH3,
      unoccupiedLegal,
      args.enemyOccupiedH3
    );
    if (approach.length > 0) {
      result = {
        hexes: approach,
        actionType: ACTION_APPROACH,
        enemySummaryOverride: nearestEnemyUnitIdsSummary(args.indexed, args.unitH3),
      };
    } else if (args.interest.length > 0) {
      result = { hexes: args.interest, actionType: ACTION_MOVES_MELEE };
    } else {
      result = { hexes: [], actionType: ACTION_MOVES_MELEE };
    }
  }
  logDebug('possibleUnitActionsBestOptionsInterest applyInterestOrApproach', {
    unitH3: args.unitH3,
    legalCount: args.legalHexes.length,
    interestCount: args.interest.length,
    enemyOccupiedCount: args.enemyOccupiedH3.size,
    hasEnemyContact,
    actionType: result.actionType,
    outCount: result.hexes.length,
  });
  return result;
}

/**
 * Describes res4 urban/airport/seaport on a tactical Best Options target hex.
 *
 * Purpose: Target Infrastructure must match the same flags the tactical interest filter uses; strategic res1 infra maps are keyed by the parent hex, not res4 children.
 * When to use: `appendRowsForLegalHexes` for tactical this-turn rows.
 * Expected outcome: Comma-separated `urban` / `seaport` / `airport`, or `—` when none remain.
 * Exceptions: None.
 */
export function describeTacticalBestOptionsInfrastructure(
  h3: string,
  ctx: TacticalBestOptionsInterestContext
): string {
  const row = ctx.rowByH3.get(h3);
  const rubble = !!ctx.battle.res4IsRubbleByH3?.[h3] || !!row?.isRubble;
  if (rubble) return '—';
  const parts: string[] = [];
  if (ctx.battle.res4IsUrbanByH3?.[h3] || row?.isUrban) parts.push('urban');
  if (ctx.battle.res4IsSeaportByH3?.[h3] || row?.isSeaport) parts.push('seaport');
  if (row?.isAirport) parts.push('airport');
  return parts.length > 0 ? parts.join(', ') : '—';
}

/**
 * Urban presence used to rank tactical Best Options rows (0 or 1).
 *
 * Purpose: Per-unit capping still prefers urban capture when approach is not in play; res1 `urbanHexCount` is the wrong key at res4.
 * When to use: `appendRowsForLegalHexes` for tactical this-turn rows.
 * Expected outcome: `1` when `describeTacticalBestOptionsInfrastructure` includes urban; otherwise `0`.
 * Exceptions: None.
 */
export function tacticalBestOptionsUrbanHexCount(h3: string, ctx: TacticalBestOptionsInterestContext): number {
  return describeTacticalBestOptionsInfrastructure(h3, ctx).includes('urban') ? 1 : 0;
}

/**
 * Restricts **Best Options This Turn** air-strike rows to enemy-occupied hexes or human-controlled infrastructure.
 *
 * Purpose: Legal strikes can hit any urban/airport/seaport in range, including own cities; the Commander table must not list those because the tempo rule says strike if listed. Matches Air Operations human-controlled infra counts.
 * When to use: Only from `collectAggregatedPossibleActionRows` after `collectStrikeHexesForAirUnit` when `forThisTurnOptionsTable` is true in **strategic** mode.
 * Expected outcome: Subset of `hexes` that have human occupants or human-controlled urban/airport/seaport; own and uncontrolled cities dropped.
 * Exceptions: None.
 */
export function filterStrategicAirStrikeHexesForThisTurnOptionsTable(
  indexed: BestOptionsInterestIndex,
  hexes: string[]
): string[] {
  const kept = hexes.filter((h3) => {
    if ((indexed.enemyUnitsByHex.get(h3)?.length ?? 0) > 0) return true;
    if ((indexed.controlByHex.get(h3) ?? null) !== 'human') return false;
    const inf = infraCounts(indexed, h3);
    return inf.urban > 0 || inf.airport > 0 || inf.seaport > 0;
  });
  logDebug('possibleUnitActionsBestOptionsInterest filterStrategicAirStrikeHexesForThisTurnOptionsTable', {
    inCount: hexes.length,
    outCount: kept.length,
  });
  return kept;
}

/**
 * Drops non-enemy res4 air-strike targets from the Best Options This Turn table.
 *
 * Purpose: Same tempo-rule filter as tactical ranged: empty urban tiles must not appear as this-beat strikes. Callers pass the battle footprint (not the strategic 3-hex disk).
 * When to use: Only from `collectAggregatedPossibleActionRows` when `forThisTurnOptionsTable` and `tacticalBattle` are set, after listing footprint hexes.
 * Expected outcome: Subset of `hexes` that are human-occupied.
 * Exceptions: None.
 */
export function filterTacticalAirStrikeHexesForThisTurnOptionsTable(
  attackerSubUnitId: string,
  hexes: string[],
  ctx: TacticalBestOptionsInterestContext
): string[] {
  const kept = hexes.filter((h3) => ctx.humanOccupiedH3.has(h3));
  logDebug('possibleUnitActionsBestOptionsInterest filterTacticalAirStrikeHexesForThisTurnOptionsTable', {
    attackerSubUnitId,
    inCount: hexes.length,
    outCount: kept.length,
  });
  return kept;
}

/**
 * Drops non-enemy res4 ranged targets from the Best Options This Turn table.
 *
 * Purpose: Legal infra-only shots stay valid at order validation; the Commander table must not list empty-city / road shots that crowd out approaching observed humans (tempo rule says shoot if listed).
 * When to use: Only from `collectAggregatedPossibleActionRows` after `collectTacticalLegalRangedTargetRes4Hexes` when `forThisTurnOptionsTable` and `tacticalBattle` are set.
 * Expected outcome: Subset of `hexes` that are human-occupied.
 * Exceptions: None.
 */
export function filterTacticalRangedHexesForThisTurnOptionsTable(
  attackerSubUnitId: string,
  hexes: string[],
  ctx: TacticalBestOptionsInterestContext
): string[] {
  const kept = hexes.filter((h3) => ctx.humanOccupiedH3.has(h3));
  logDebug('possibleUnitActionsBestOptionsInterest filterTacticalRangedHexesForThisTurnOptionsTable', {
    attackerSubUnitId,
    inCount: hexes.length,
    outCount: kept.length,
  });
  return kept;
}
