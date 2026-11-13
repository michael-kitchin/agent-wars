/**
 * The Mercenaries section of a commander's briefing.
 *
 * Purpose: The seat sees its treasury, its mercenaries, and what it can still hire.
 * When to use: Strategic prompts. A battle, a snapshot with no economy, or a seat that cannot produce and has no mercenaries gets nothing.
 * Expected outcome: A heading and the sections that apply. Tables stop at the row limit.
 * Exceptions: None.
 */

import { computeGridDistanceWithPathFallbackPure, isWithinGridRangePure } from '../../shared/h3GridRangePure';
import type { HireRaiseOption } from '../../shared/ipc/mercenaryTypes';
import type { HopDistance } from './campaignRules';
import type { GameStateSnapshot } from '../../shared/ipc/gameStateTypes';
import { unitCostFor } from '../../shared/gameRules';
import { isHireableUnitType, mercenaryUpkeepFor } from '../../shared/mercenaryRules';
import { listOccupationPausedHexes } from '../../shared/productionBuildability';
import { NEUTRAL_OWNER_ID, type SeatId } from '../../shared/seatIds';
import { briefingOwnSeatId } from '../briefing/briefingPerspective';
import { listHireOrdersForSeat } from '../gameDb/mercenaryStateAccess';
import { logDebug, logTrace } from '../logger';
import { CHOKEPOINT_MAX_PASSABLE_NEIGHBORS, countNeighborTerrain } from '../tools/hexNeighborTerrain';
import { buildHireContext, evaluateHexHire, listHireEntryHexes } from '../mercenaryHireRules';
import { buildPromptTableLines } from '../promptTableHelpers';
import {
  MERCENARY_BRIEFING_MAX_ROWS,
  MERCENARY_FUNDS_WARNING,
  NO_RAISE_OPTIONS_LINE,
  NO_REHIRE_CANDIDATES_LINE,
  buildMercenaryRule,
  buildMercenaryUpkeepRule,
  formatMercenaryFundsLine,
} from './promptSpec/gameRuleMercenaryText';
import {
  SECTION_TITLE_MERCENARIES,
  SECTION_TITLE_RAISE_OPTIONS,
  SECTION_TITLE_REHIRE_CANDIDATES,
  SECTION_TITLE_YOUR_MERCENARIES,
  subHeading,
  topLevelHeading,
} from './promptSpec/sectionHeadings';

/**
 * Builds the Mercenaries section.
 *
 * Purpose: Production-off seats still see upkeep. They are not shown hire tables.
 * When to use: While assembling the system prompt, with the seat's own snapshot.
 * Expected outcome: The section text, or `''` when this view should not include it. A production seat with 0 credits, no mercenary, no rehire candidate, and no raise option gets the heading and `Treasury: 0 credits. No one to rehire.`
 * Exceptions: None.
 */
export function buildMercenariesBriefingBlock(
  state: GameStateSnapshot,
  format: (h3Index: string) => string,
  mode: 'strategic' | 'tactical',
  options: {
    readonly productionEnabled: boolean;
    /**
     * Campaign city the raise table sorts toward.
     *
     * Contract: Null or omitted leaves the distance-to-units sort in place after the resume key.
     * When to use: When the consult has a campaign plan.
     * Expected outcome: Cells nearer this hex sort ahead of farther cells after rows that resume building.
     * Exceptions: None.
     */
    readonly campaignTargetH3?: string | null;
  }
): string {
  const economy = state.mercenaryEconomy;
  const ownSeat = briefingOwnSeatId(state);
  logDebug('briefingSectionsMercenaries buildMercenariesBriefingBlock', {
    mode,
    ownSeat,
    productionEnabled: options.productionEnabled,
    hasEconomy: economy != null,
  });
  if (mode === 'tactical' || !economy) return '';
  const mercenaries = state.units.filter((unit) => unit.player === ownSeat && unit.isMercenary === true);
  if (!options.productionEnabled && mercenaries.length === 0) return '';
  if (options.productionEnabled && economy.credits === 0 && mercenaries.length === 0) {
    const orders = listHireOrdersForSeat(ownSeat);
    const orderedRehires = new Set(orders.filter((order) => order.kind === 'rehire').map((order) => order.neutralUnitId));
    const context = buildHireContext(state, ownSeat);
    const hasRaise = raiseOptionRowsForSeat(state, ownSeat, options.campaignTargetH3 ?? null).length > 0;
    if (!hasRehireCandidate(state, context, orderedRehires) && !hasRaise) {
      logDebug('briefingSectionsMercenaries buildMercenariesBriefingBlock empty treasury', { ownSeat });
      return `${topLevelHeading(SECTION_TITLE_MERCENARIES)}\n\nTreasury: 0 credits. No one to rehire.`;
    }
  }
  const lines = [topLevelHeading(SECTION_TITLE_MERCENARIES), '', options.productionEnabled ? buildMercenaryRule() : buildMercenaryUpkeepRule()];
  lines.push('', formatMercenaryFundsLine(economy));
  if (economy.credits < economy.upkeepPerTurn) lines.push(MERCENARY_FUNDS_WARNING);
  if (mercenaries.length > 0) {
    lines.push('', subHeading(SECTION_TITLE_YOUR_MERCENARIES), '', mercenaryTable(mercenaries, format));
  }
  if (!options.productionEnabled) return lines.join('\n');
  const orders = listHireOrdersForSeat(ownSeat);
  const orderedRehires = new Set(orders.filter((order) => order.kind === 'rehire').map((order) => order.neutralUnitId));
  const context = buildHireContext(state, ownSeat);
  const ownHexes = state.units.filter((unit) => unit.player === ownSeat).map((unit) => unit.h3Index);
  lines.push('', subHeading(SECTION_TITLE_REHIRE_CANDIDATES), '', rehireTable(state, context, orderedRehires, ownHexes, format));
  lines.push(
    '',
    subHeading(SECTION_TITLE_RAISE_OPTIONS),
    '',
    raiseTable({
      state,
      ownSeat,
      context,
      orders,
      ownHexes,
      format,
      resumable: listOccupationPausedHexes(state, ownSeat),
      campaignTargetH3: options.campaignTargetH3 ?? null,
    })
  );
  return lines.join('\n');
}

/**
 * The seat's mercenaries, cheapest to scan by id.
 *
 * Purpose: The model can see what it already pays for.
 * When to use: When the seat has at least one mercenary.
 * Expected outcome: A table of at most twice the row limit, then a more-line when the rest is omitted.
 * Exceptions: None.
 */
function mercenaryTable(
  mercenaries: GameStateSnapshot['units'],
  format: (h3Index: string) => string
): string {
  const rows = mercenaries.flatMap((unit) => {
    if (!isHireableUnitType(unit.unitType)) return [];
    return [{ id: unit.id, unitType: unit.unitType, h3Index: unit.h3Index, upkeep: mercenaryUpkeepFor(unit.unitType, unit.techLevel) }];
  }).sort((left, right) => left.id.localeCompare(right.id));
  const shown = rows.slice(0, MERCENARY_BRIEFING_MAX_ROWS * 2);
  const table = buildPromptTableLines(
    ['Unit ID', 'Type', 'Hex', 'Upkeep'],
    shown.map((unit) => [unit.id, unit.unitType, format(unit.h3Index), String(unit.upkeep)])
  ).join('\n');
  const hidden = rows.length - shown.length;
  return hidden > 0 ? `${table}\n…and ${hidden} more.` : table;
}

/**
 * Neutral units the seat can rehire and has not already ordered.
 *
 * Purpose: The nearest candidates come first.
 * When to use: When production tools are on.
 * Expected outcome: A table, or the none-line.
 * Exceptions: None.
 */
/**
 * True when a Neutral unit can still be rehired.
 *
 * Purpose: An empty treasury with nothing to rehire does not need the hire tables.
 * When to use: Before the full Mercenaries section, when credits are 0 and the seat owns no mercenary.
 * Expected outcome: False when every visible Neutral hex has no unordered rehire candidate.
 * Exceptions: None.
 */
function hasRehireCandidate(
  state: GameStateSnapshot,
  context: ReturnType<typeof buildHireContext>,
  orderedRehires: ReadonlySet<string | null>
): boolean {
  const hexes = state.units.filter((unit) => unit.player === NEUTRAL_OWNER_ID).map((unit) => unit.h3Index);
  return hexes.some((h3Index) =>
    evaluateHexHire(context, h3Index).rehireCandidates.some((candidate) => !orderedRehires.has(candidate.unitId))
  );
}

function rehireTable(
  state: GameStateSnapshot,
  context: ReturnType<typeof buildHireContext>,
  orderedRehires: ReadonlySet<string | null>,
  ownHexes: readonly string[],
  format: (h3Index: string) => string
): string {
  const hexes = new Set(state.units.filter((unit) => unit.player === NEUTRAL_OWNER_ID).map((unit) => unit.h3Index));
  const candidates = [...hexes].flatMap((h3Index) => evaluateHexHire(context, h3Index).rehireCandidates)
    .filter((candidate) => !orderedRehires.has(candidate.unitId));
  if (candidates.length === 0) return NO_REHIRE_CANDIDATES_LINE;
  const shown = candidates
    .sort((left, right) => compareDistance(left.h3Index, right.h3Index, ownHexes) || left.unitId.localeCompare(right.unitId))
    .slice(0, MERCENARY_BRIEFING_MAX_ROWS);
  return buildPromptTableLines(
    ['Unit ID', 'Type', 'Hex', 'Fee', 'Upkeep'],
    shown.map((candidate) => [candidate.unitId, candidate.unitType, format(candidate.h3Index), String(candidate.fee), String(candidate.upkeep)])
  ).join('\n');
}

/**
 * How far an enemy unit counts as near a raise hex.
 *
 * Purpose: The Raise Options column and its tests share one radius.
 * When to use: `isWithinGridRangePure` from the raise hex to the unit.
 * Expected outcome: Two hexes, inclusive.
 * Exceptions: None.
 */
export const RAISE_OPTIONS_ENEMY_RADIUS = 2;

/**
 * One raise hex after the capacity filter, before display columns are added.
 *
 * Purpose: The table and the attention flag must walk the same rows in the same order.
 * When to use: The return value of `listRaiseOptionRows`.
 * Expected outcome: Options are those that still fit in the remaining capacity.
 * Exceptions: None.
 */
export interface RaiseOptionRow {
  /**
   * Hex where the units would appear.
   *
   * Contract: A hire-entry hex that still has at least one option.
   * When to use: Distance, enemy, and chokepoint columns.
   * Expected outcome: An H3 index on the map.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Raise capacity still unused by this seat's raise orders.
   *
   * Contract: Never negative. Options whose unit cost exceeds it are omitted.
   * When to use: The Capacity column.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly capacityLeft: number;
  /**
   * Whether raising here would let the city build again.
   *
   * Contract: True when the hex is in the occupation-paused set.
   * When to use: The sort and the Resumes building column.
   * Expected outcome: Those rows sort first.
   * Exceptions: None.
   */
  readonly resumes: boolean;
  /**
   * Types the seat can still raise on this hex.
   *
   * Contract: Non-empty. Each option fits in `capacityLeft`.
   * When to use: The Options column and the attention flag's fee check.
   * Expected outcome: Hire options in the order `evaluateHexHire` returned them.
   * Exceptions: None.
   */
  readonly options: readonly HireRaiseOption[];
}

/**
 * Raise rows in the order the table shows, including rows past the display limit.
 *
 * Purpose: Attention and the table must not build or sort the rows differently.
 * When to use: `raiseOptionRowsForSeat` and `raiseTable`.
 * Expected outcome: Every hex that still has an option, resume rows first, then nearer the campaign target.
 * Exceptions: None.
 */
export function listRaiseOptionRows(args: {
  readonly context: ReturnType<typeof buildHireContext>;
  readonly orders: ReturnType<typeof listHireOrdersForSeat>;
  readonly ownHexes: readonly string[];
  readonly resumable: ReadonlySet<string>;
  readonly campaignTargetH3: string | null;
}): RaiseOptionRow[] {
  const rows = listHireEntryHexes(args.context).flatMap((h3Index) => {
    const evaluation = evaluateHexHire(args.context, h3Index);
    const used = args.orders
      .filter((order) => order.kind === 'raise' && order.h3Index === h3Index)
      .reduce((sum, order) => sum + unitCostFor(order.unitType) * order.unitCount, 0);
    const capacityLeft = Math.max(0, evaluation.raiseCapacityPerTurn - used);
    const options = evaluation.raiseOptions.filter((option) => option.unitCost <= capacityLeft);
    if (options.length === 0) return [];
    return [{ h3Index, capacityLeft, resumes: args.resumable.has(h3Index), options }];
  });
  const sorted = rows.sort(
    (left, right) =>
      Number(right.resumes) - Number(left.resumes) ||
      compareByCampaignTarget(left.h3Index, right.h3Index, args.campaignTargetH3, computeGridDistanceWithPathFallbackPure) ||
      compareDistance(left.h3Index, right.h3Index, args.ownHexes) ||
      left.h3Index.localeCompare(right.h3Index)
  );
  logTrace('briefingSectionsMercenaries listRaiseOptionRows', { rowCount: sorted.length });
  return sorted;
}

/**
 * Raise rows for one seat, including the hire-context setup.
 *
 * Purpose: The briefing and the attention flag must not assemble orders, context, and resumable hexes twice.
 * When to use: The zero-credit collapse check and `formatMercenaryRaiseAttention`.
 * Expected outcome: The same rows `raiseTable` formats, with no display limit.
 * Exceptions: None.
 */
export function raiseOptionRowsForSeat(
  state: GameStateSnapshot,
  ownSeat: SeatId,
  campaignTargetH3: string | null
): RaiseOptionRow[] {
  const rows = listRaiseOptionRows({
    context: buildHireContext(state, ownSeat),
    orders: listHireOrdersForSeat(ownSeat),
    ownHexes: state.units.filter((unit) => unit.player === ownSeat).map((unit) => unit.h3Index),
    resumable: listOccupationPausedHexes(state, ownSeat),
    campaignTargetH3,
  });
  logTrace('briefingSectionsMercenaries raiseOptionRowsForSeat', { ownSeat, rowCount: rows.length });
  return rows;
}

/**
 * Hexes that can still raise, with cells that restart a paused city first.
 *
 * Purpose: Capacity left subtracts this seat's raise orders. The function does not rebuild the snapshot.
 * When to use: When production tools are on.
 * Expected outcome: Cells that would restart a paused city sort first and show `yes` under Resumes building. Then cells nearest the campaign target. A table, or the none-line.
 * Exceptions: None.
 */
function raiseTable(args: {
  readonly state: GameStateSnapshot;
  readonly ownSeat: SeatId;
  readonly context: ReturnType<typeof buildHireContext>;
  readonly orders: ReturnType<typeof listHireOrdersForSeat>;
  readonly ownHexes: readonly string[];
  readonly format: (h3Index: string) => string;
  readonly resumable: ReadonlySet<string>;
  readonly campaignTargetH3: string | null;
}): string {
  const rows = listRaiseOptionRows(args);
  if (rows.length === 0) return NO_RAISE_OPTIONS_LINE;
  const shown = rows.slice(0, MERCENARY_BRIEFING_MAX_ROWS);
  const hexSet = new Set(args.state.hexes.map((hex) => hex.h3Index));
  const terrainByH3 = new Map(args.state.hexes.map((hex) => [hex.h3Index, hex.terrain]));
  return buildPromptTableLines(
    ['Hex', 'To Campaign Target', `Enemy Units Within ${RAISE_OPTIONS_ENEMY_RADIUS}`, 'Chokepoint', 'Capacity', 'Resumes building', 'Options'],
    shown.map((row) => {
      const distance = args.campaignTargetH3 == null
        ? null
        : computeGridDistanceWithPathFallbackPure(row.h3Index, args.campaignTargetH3);
      const enemies = args.state.units.filter(
        (unit) =>
          unit.player !== args.ownSeat &&
          unit.player !== NEUTRAL_OWNER_ID &&
          isWithinGridRangePure(row.h3Index, unit.h3Index, RAISE_OPTIONS_ENEMY_RADIUS)
      ).length;
      const passableNeighbors = countNeighborTerrain({
        hexH3: row.h3Index,
        hexSet,
        terrainByH3,
        passableFor: 'land',
      }).passableNeighbors;
      const options = row.options.map((option) => `${option.unitType} (fee ${option.fee}, upkeep ${option.upkeep})`).join('; ');
      return [
        args.format(row.h3Index),
        distance == null ? '—' : String(distance),
        String(enemies),
        passableNeighbors <= CHOKEPOINT_MAX_PASSABLE_NEIGHBORS ? 'yes' : 'no',
        String(row.capacityLeft),
        row.resumes ? 'yes' : 'no',
        options,
      ];
    })
  ).join('\n');
}

/**
 * Orders two cells by hop distance to the campaign city.
 *
 * Purpose: Raise Options should spend credits nearest the city the campaign is taking.
 * When to use: After the resume-building comparison, before distance to the seat's units.
 * Expected outcome: Zero when the target is null or the distances match. A null distance sorts last. Otherwise the nearer cell is first.
 * Exceptions: None.
 */
export function compareByCampaignTarget(
  leftH3: string,
  rightH3: string,
  targetH3: string | null,
  hopDistance: HopDistance
): number {
  if (targetH3 === null) return 0;
  const left = hopDistance(leftH3, targetH3);
  const right = hopDistance(rightH3, targetH3);
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

/**
 * Compares two hexes by distance to the nearest unit the seat owns.
 *
 * Purpose: A missing path sorts last.
 * When to use: Rehire and raise sorts.
 * Expected outcome: A negative number when `left` is closer.
 * Exceptions: None.
 */
function compareDistance(left: string, right: string, ownHexes: readonly string[]): number {
  return nearest(left, ownHexes) - nearest(right, ownHexes);
}

/**
 * Grid distance to the nearest owned unit.
 *
 * Purpose: Sorting treats an unreachable hex as farthest.
 * When to use: `compareDistance`.
 * Expected outcome: A finite distance, or positive infinity when every lookup fails.
 * Exceptions: None.
 */
function nearest(h3Index: string, ownHexes: readonly string[]): number {
  let best: number | null = null;
  for (const origin of ownHexes) {
    const distance = computeGridDistanceWithPathFallbackPure(origin, h3Index);
    if (distance == null) continue;
    if (best == null || distance < best) best = distance;
  }
  return best ?? Number.POSITIVE_INFINITY;
}
