/**
 * The Mercenaries section of a commander's briefing.
 *
 * Purpose: The seat sees its treasury, its mercenaries, and what it can still hire.
 * When to use: Strategic prompts. A battle, a snapshot with no economy, or a seat that cannot produce and has no mercenaries gets nothing.
 * Expected outcome: A heading and the sections that apply. Tables stop at the row limit.
 * Exceptions: None.
 */

import { computeGridDistanceWithPathFallbackPure } from '../../shared/h3GridRangePure';
import type { GameStateSnapshot } from '../../shared/ipc/gameStateTypes';
import { unitCostFor } from '../../shared/gameRules';
import { isHireableUnitType, mercenaryUpkeepFor } from '../../shared/mercenaryRules';
import { NEUTRAL_OWNER_ID } from '../../shared/seatIds';
import { briefingOwnSeatId } from '../briefing/briefingPerspective';
import { listHireOrdersForSeat } from '../gameDb/mercenaryStateAccess';
import { logDebug } from '../logger';
import { buildHireContext, evaluateHexHire, listHireEntryHexes } from '../mercenaryHireRules';
import { buildPromptTableLines } from '../promptTableHelpers';
import {
  MERCENARY_BRIEFING_MAX_ROWS,
  MERCENARY_FUNDS_WARNING,
  NO_RAISE_OPTIONS_LINE,
  NO_REHIRE_CANDIDATES_LINE,
  MERCENARY_ENVELOPE_ROWS_SENTENCE,
  buildMercenaryRule,
  buildMercenaryUpkeepRule,
  formatMercenaryFundsLine,
} from './promptSpec/gameRuleMercenaryText';
import { SECTION_TITLE_MERCENARIES, topLevelHeading } from './promptSpec/sectionHeadings';

/**
 * Builds the Mercenaries section.
 *
 * Purpose: Production-off seats still see upkeep. They are not shown hire tables.
 * When to use: While assembling the system prompt, with the seat's own snapshot.
 * Expected outcome: The section text, or `''` when this view should not include it.
 * Exceptions: None.
 */
export function buildMercenariesBriefingBlock(
  state: GameStateSnapshot,
  format: (h3Index: string) => string,
  mode: 'strategic' | 'tactical',
  options: { readonly productionEnabled: boolean }
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
  const lines = [topLevelHeading(SECTION_TITLE_MERCENARIES), '', options.productionEnabled ? buildMercenaryRule() : buildMercenaryUpkeepRule()];
  if (options.productionEnabled) lines.push('', MERCENARY_ENVELOPE_ROWS_SENTENCE);
  lines.push('', formatMercenaryFundsLine(economy));
  if (economy.credits < economy.upkeepPerTurn + economy.pendingHireFees) lines.push(MERCENARY_FUNDS_WARNING);
  if (mercenaries.length > 0) {
    lines.push('', 'Your mercenaries', '', mercenaryTable(mercenaries, format));
  }
  if (!options.productionEnabled) return lines.join('\n');
  const orders = listHireOrdersForSeat(ownSeat);
  const orderedRehires = new Set(orders.filter((order) => order.kind === 'rehire').map((order) => order.neutralUnitId));
  const context = buildHireContext(state, ownSeat);
  const ownHexes = state.units.filter((unit) => unit.player === ownSeat).map((unit) => unit.h3Index);
  lines.push('', 'Rehire candidates', '', rehireTable(state, context, orderedRehires, ownHexes, format));
  lines.push('', 'Raise options', '', raiseTable(context, orders, ownHexes, format));
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
 * Hexes that can still raise, nearest first.
 *
 * Purpose: Capacity left subtracts this seat's raise orders. The function does not rebuild the snapshot.
 * When to use: When production tools are on.
 * Expected outcome: A table, or the none-line.
 * Exceptions: None.
 */
function raiseTable(
  context: ReturnType<typeof buildHireContext>,
  orders: ReturnType<typeof listHireOrdersForSeat>,
  ownHexes: readonly string[],
  format: (h3Index: string) => string
): string {
  const rows = listHireEntryHexes(context).flatMap((h3Index) => {
    const evaluation = evaluateHexHire(context, h3Index);
    const used = orders
      .filter((order) => order.kind === 'raise' && order.h3Index === h3Index)
      .reduce((sum, order) => sum + unitCostFor(order.unitType) * order.unitCount, 0);
    const capacityLeft = Math.max(0, evaluation.raiseCapacityPerTurn - used);
    const options = evaluation.raiseOptions.filter((option) => option.unitCost <= capacityLeft);
    if (options.length === 0) return [];
    const text = options.map((option) => `${option.unitType} (fee ${option.fee}, upkeep ${option.upkeep})`).join('; ');
    return [{ h3Index, capacityLeft, text }];
  });
  if (rows.length === 0) return NO_RAISE_OPTIONS_LINE;
  const shown = rows
    .sort((left, right) => compareDistance(left.h3Index, right.h3Index, ownHexes) || left.h3Index.localeCompare(right.h3Index))
    .slice(0, MERCENARY_BRIEFING_MAX_ROWS);
  return buildPromptTableLines(
    ['Hex', 'Capacity', 'Options'],
    shown.map((row) => [format(row.h3Index), String(row.capacityLeft), row.text])
  ).join('\n');
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
