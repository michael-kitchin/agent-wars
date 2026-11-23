/**
 * The Firing Risk subsection of the Mercenaries briefing.
 *
 * Purpose: A fired mercenary left in an unfortified home hex hands it to Neutral. The commander sees which of its home hexes that touches and which fires the engine would refuse.
 * When to use: Under Your Mercenaries, when production is on, for a seat in a region versus region match.
 * Expected outcome: A heading, one opening paragraph, and a table of at risk home hexes. An empty string when nothing is at risk.
 * Exceptions: None. A read error is logged and gives an empty string, so the briefing never fails.
 */

import type { GameStateSnapshot } from '../../shared/ipc/gameStateTypes';
import type { SeatId } from '../../shared/seatIds';
import { fireWouldKnockOut, projectedHomeLoss, readFireRiskInputs, type FireRiskInputs } from '../gameActions/mercenaryFireRisk';
import { logDebug, logError } from '../logger';
import { buildPromptTableLines } from '../promptTableHelpers';
import { MERCENARY_BRIEFING_MAX_ROWS } from './promptSpec/gameRuleMercenaryText';
import { subHeading } from './promptSpec/sectionHeadings';

/** Title of the Firing Risk subsection, without ATX hashes. */
export const SECTION_TITLE_FIRING_RISK = 'Firing Risk' as const;

/** How many mercenary ids one table cell names before it counts the rest. */
const MAX_IDS_PER_CELL = 4;

/**
 * One at risk home hex.
 *
 * Purpose: Rows are sorted and printed from one value.
 * When to use: Inside this module.
 * Expected outcome: The hex, its baseline cells, the seat's mercenary ids there, and the effect.
 * Exceptions: None.
 */
interface FiringRiskRow {
  /**
   * The home hex.
   *
   * Contract: A hex id the seat controls.
   * When to use: The first table column.
   * Expected outcome: Printed through the caller's format.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Original urban cells of the hex.
   *
   * Contract: The knockout baseline for that hex.
   * When to use: Sorting and the second column.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly cells: number;
  /**
   * Mercenary ids in the hex.
   *
   * Contract: Non-embarked mercenaries of the seat, sorted.
   * When to use: The third column.
   * Expected outcome: At least one id.
   * Exceptions: None.
   */
  readonly mercenaryIds: readonly string[];
  /**
   * What a fire does there.
   *
   * Contract: One of the three effect sentences.
   * When to use: The last column.
   * Expected outcome: Non-empty text.
   * Exceptions: None.
   */
  readonly effect: string;
  /**
   * Whether the fire would be refused.
   *
   * Contract: True when `fireWouldKnockOut` holds for the hex.
   * When to use: Sorting refused rows first.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  readonly refused: boolean;
}

/**
 * Builds the Firing Risk subsection for one seat.
 *
 * Purpose: Tells a commander where firing is dangerous before it sends a dismiss row.
 * When to use: Once per Mercenaries section build, after Your Mercenaries.
 * Expected outcome: The subsection, or `''` when the match is not region versus region, the seat is out, or no mercenary stands in an unfortified home hex the seat controls.
 * Exceptions: None. Errors are logged and give `''`.
 */
export function buildMercenaryFiringRiskBlock(args: {
  readonly state: GameStateSnapshot;
  readonly ownSeat: SeatId;
  readonly format: (h3Index: string) => string;
}): string {
  logDebug('briefingSectionsMercenaryFiring buildMercenaryFiringRiskBlock', { ownSeat: args.ownSeat });
  try {
    const inputs = readFireRiskInputs(args.ownSeat);
    if (!inputs) return '';
    const rows = riskRows(args.state, args.ownSeat, inputs);
    if (rows.length === 0) return '';
    const shown = rows.slice(0, MERCENARY_BRIEFING_MAX_ROWS);
    const table = buildPromptTableLines(
      ['Home Hex', 'Original Urban Cells', 'Your Mercenaries', 'If Fired'],
      shown.map((row) => [args.format(row.h3Index), String(row.cells), idsCell(row.mercenaryIds), row.effect])
    ).join('\n');
    const hidden = rows.length - shown.length;
    const body = hidden > 0 ? `${table}\n…and ${hidden} more.` : table;
    return `${subHeading(SECTION_TITLE_FIRING_RISK)}\n\n${openingParagraph(inputs)}\n\n${body}`;
  } catch (err) {
    logError('briefingSectionsMercenaryFiring could not build the Firing Risk block', { ownSeat: args.ownSeat }, err);
    return '';
  }
}

/**
 * The opening paragraph.
 *
 * Purpose: States how close the seat already is to a knockout, under the rule the match uses.
 * When to use: Once per block.
 * Expected outcome: The share-rule or every-hex-rule text with the current counts.
 * Exceptions: Propagates the baseline callback's errors.
 */
function openingParagraph(inputs: FireRiskInputs): string {
  const loss = projectedHomeLoss(inputs, new Set());
  const lead = 'A fired mercenary left alone in one of these home hexes hands it to Neutral at the end of the turn.';
  if (loss.everyHexRule) {
    return `${lead} Other sides and Neutral hold ${loss.lostHexes} of your ${loss.totalHexes} home hexes, counting home hexes Neutral units already stand in. You are knocked out if they hold all of them.`;
  }
  return `${lead} Other sides and Neutral hold ${loss.lostUrbanCells} of your home's ${loss.totalUrbanCells} original urban cells, counting home hexes Neutral units already stand in. You are knocked out if they reach ${loss.neededUrbanCells}.`;
}

/**
 * The at risk rows, sorted.
 *
 * Purpose: Refused rows come first, then the largest hexes.
 * When to use: Once per block.
 * Expected outcome: One row per controlled, unfortified home hex that holds a non-embarked mercenary of the seat. The fight text applies when a regular unit of the seat, or a second mercenary, would stay behind after one fire.
 * Exceptions: Propagates the baseline callback's errors.
 */
function riskRows(state: GameStateSnapshot, ownSeat: SeatId, inputs: FireRiskInputs): FiringRiskRow[] {
  const mercenariesByHex = new Map<string, string[]>();
  const regularHexes = new Set<string>();
  for (const unit of state.units) {
    if (unit.player !== ownSeat || unit.embarkedOnCarrierUnitId != null) continue;
    if (unit.isMercenary === true) mercenariesByHex.set(unit.h3Index, [...(mercenariesByHex.get(unit.h3Index) ?? []), unit.id]);
    else regularHexes.add(unit.h3Index);
  }
  const rows: FiringRiskRow[] = [];
  for (const h3Index of inputs.homeHexes) {
    const ids = mercenariesByHex.get(h3Index);
    if (!ids || inputs.controlByHex.get(h3Index) !== ownSeat || (inputs.fortifiedByHex.get(h3Index) ?? 0) > 0) continue;
    const refused = fireWouldKnockOut(inputs, h3Index);
    const othersStay = regularHexes.has(h3Index) || ids.length > 1;
    const effect = refused
      ? 'refused: knocks you out'
      : othersStay
        ? 'fights your units there; Neutral takes it if it wins'
        : 'Neutral takes it at the end of the turn';
    rows.push({ h3Index, cells: inputs.baselineUrbanCellsForHex(h3Index), mercenaryIds: [...ids].sort(), effect, refused });
  }
  return rows.sort(
    (left, right) =>
      Number(right.refused) - Number(left.refused) || right.cells - left.cells || left.h3Index.localeCompare(right.h3Index)
  );
}

/**
 * The mercenary ids cell.
 *
 * Purpose: A crowded hex does not widen the table.
 * When to use: Each row.
 * Expected outcome: Up to four ids, then `, +n more`.
 * Exceptions: None.
 */
function idsCell(ids: readonly string[]): string {
  const shown = ids.slice(0, MAX_IDS_PER_CELL).join(', ');
  return ids.length > MAX_IDS_PER_CELL ? `${shown}, +${ids.length - MAX_IDS_PER_CELL} more` : shown;
}
