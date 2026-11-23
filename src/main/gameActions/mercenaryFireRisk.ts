/**
 * Whether firing a mercenary would by itself knock its side out of the match.
 *
 * Purpose: A fired mercenary is a Neutral unit. Left alone in an unfortified hex it takes the hex for Neutral at the end of the turn, and Neutral-held home hexes and lost cities count toward a knockout.
 * When to use: The dismiss action's refusal check, and the Firing Risk table in the strategic briefing.
 * Expected outcome: A pure projection over inputs the caller read, and a thin database reader that feeds it. Nothing is written.
 * Exceptions: The database reader propagates roster, control, and baseline read errors.
 */

import { NEUTRAL_OWNER_ID, type SeatId } from '../../shared/seatIds';
import { isSeatActive } from '../../shared/seatRoster';
import { dbGetAll, dbGetOne, getHexControlMap, getScenarioHomeRegionHexes, getSeatRoster, listStrategicInfrastructureRows } from '../gameDb';
import { loadScenarioState, REGION_VS_REGION_SCENARIO_ID } from '../gameDb/scenarioState';
import { logDebug, logTrace } from '../logger';
import { baselineUrbanCellsForControlWin, effectiveControlWinMinUrbanShare } from './endOfTurnOutcome';
import { computeHomeLossProgress, type HomeLossProgress } from './homeControlProgress';

/**
 * Everything the fire-risk projection reads for one side.
 *
 * Purpose: One value feeds the knockout guard and the Firing Risk table, so both decide the same way.
 * When to use: The return value of `readFireRiskInputs`, and tests that build it by hand.
 * Expected outcome: Plain maps and sets. The projection functions never change them.
 * Exceptions: None.
 */
export interface FireRiskInputs {
  /**
   * The side whose knockout is projected.
   *
   * Contract: An active seat.
   * When to use: Choosing which hexes count as the side's own.
   * Expected outcome: A `SeatId`.
   * Exceptions: None.
   */
  readonly ownerSeatId: SeatId;
  /**
   * The side's home hexes.
   *
   * Contract: The scenario's home region hexes for the seat.
   * When to use: The home-loss rule.
   * Expected outcome: Possibly empty.
   * Exceptions: None.
   */
  readonly homeHexes: readonly string[];
  /**
   * True control of every hex.
   *
   * Contract: Hex id to controller seat id, or null or absent when nobody controls it.
   * When to use: Finding the side's hexes and what Neutral would take.
   * Expected outcome: The stored control map.
   * Exceptions: None.
   */
  readonly controlByHex: ReadonlyMap<string, string | null | undefined>;
  /**
   * Fortifications in each hex.
   *
   * Contract: A hex with a count above 0 keeps its controller when a Neutral unit stands in it.
   * When to use: The takeover step.
   * Expected outcome: Absent hexes count as unfortified.
   * Exceptions: None.
   */
  readonly fortifiedByHex: ReadonlyMap<string, number>;
  /**
   * Current urban cells of each hex.
   *
   * Contract: The stored `urbanHexCount`, the count the no-city-hex rule uses.
   * When to use: Counting the side's city hexes.
   * Expected outcome: Absent hexes count as 0.
   * Exceptions: None.
   */
  readonly urbanByHex: ReadonlyMap<string, number>;
  /**
   * Hexes where a Neutral unit stands now.
   *
   * Contract: Every hex that holds at least one unit owned by Neutral.
   * When to use: The takeover step.
   * Expected outcome: Possibly empty.
   * Exceptions: None.
   */
  readonly neutralHexes: ReadonlySet<string>;
  /**
   * Original urban cells of a home hex.
   *
   * Contract: The baseline the knockout rule uses for the effective share.
   * When to use: The home-loss rule and the table's cell column.
   * Expected outcome: A non-negative integer.
   * Exceptions: May throw for a hex the baseline does not know.
   */
  readonly baselineUrbanCellsForHex: (h3Index: string) => number;
  /**
   * The share of home urban cells whose loss knocks the side out.
   *
   * Contract: A fraction, or null when the every-hex rule applies.
   * When to use: The home-loss rule.
   * Expected outcome: The effective control-win share.
   * Exceptions: None.
   */
  readonly minUrbanShare: number | null;
}

/**
 * A copy of the control map where Neutral takes the side's unfortified hexes that a Neutral unit stands in.
 *
 * Purpose: Models the end-of-turn rule that gives a hex to its only occupant. It counts a hex even when the side's own units are also there, which is conservative.
 * When to use: Before projecting home loss or city hexes.
 * Expected outcome: A new map. A hex the side controls, without a fortification, that is in `neutralHexes` or `extra` is Neutral. Everything else is as in `controlByHex`.
 * Exceptions: None.
 */
export function controlAfterNeutralTakeover(
  inputs: FireRiskInputs,
  extra: ReadonlySet<string>
): Map<string, string | null | undefined> {
  const next = new Map(inputs.controlByHex);
  for (const [h3Index, controller] of inputs.controlByHex) {
    if (controller !== inputs.ownerSeatId) continue;
    if ((inputs.fortifiedByHex.get(h3Index) ?? 0) > 0) continue;
    if (inputs.neutralHexes.has(h3Index) || extra.has(h3Index)) next.set(h3Index, NEUTRAL_OWNER_ID);
  }
  logTrace('mercenaryFireRisk controlAfterNeutralTakeover', { ownerSeatId: inputs.ownerSeatId, extraCount: extra.size });
  return next;
}

/**
 * How much of the side's home Neutral and other sides would hold after the takeover.
 *
 * Purpose: The knockout rule counts every home hex a controller other than the owner holds, Neutral included.
 * When to use: Deciding a knockout, and the Firing Risk table's opening paragraph.
 * Expected outcome: The `computeHomeLossProgress` result on the takeover copy.
 * Exceptions: Propagates the baseline callback's errors.
 */
export function projectedHomeLoss(inputs: FireRiskInputs, extra: ReadonlySet<string>): HomeLossProgress {
  return computeHomeLossProgress({
    homeHexes: inputs.homeHexes,
    ownerSeatId: inputs.ownerSeatId,
    controlByHex: controlAfterNeutralTakeover(inputs, extra),
    baselineUrbanCellsForHex: inputs.baselineUrbanCellsForHex,
    minUrbanShare: inputs.minUrbanShare,
  });
}

/**
 * How many city hexes the side would still control after the takeover.
 *
 * Purpose: A side that holds no hex with urban cells is knocked out, whatever its home looks like.
 * When to use: Deciding a knockout.
 * Expected outcome: A count of owner-held hexes with current urban cells above 0.
 * Exceptions: None.
 */
export function projectedCityHexCount(inputs: FireRiskInputs, extra: ReadonlySet<string>): number {
  let count = 0;
  for (const [h3Index, controller] of controlAfterNeutralTakeover(inputs, extra)) {
    if (controller === inputs.ownerSeatId && (inputs.urbanByHex.get(h3Index) ?? 0) > 0) count += 1;
  }
  return count;
}

/**
 * Whether the side is knocked out under the projection.
 *
 * Purpose: One definition of the knockout test for both sides of the comparison.
 * When to use: `fireWouldKnockOut` only.
 * Expected outcome: True when the home is lost or no city hex is left.
 * Exceptions: Propagates the baseline callback's errors.
 */
function knockedOutAfter(inputs: FireRiskInputs, extra: ReadonlySet<string>): boolean {
  return projectedHomeLoss(inputs, extra).homeLost || projectedCityHexCount(inputs, extra) === 0;
}

/**
 * Whether firing a mercenary in one hex completes the side's knockout by itself.
 *
 * Purpose: The guard refuses a fire that would remove the side from the match.
 * When to use: Before converting a mercenary, and for each row of the Firing Risk table.
 * Expected outcome: True when the knockout test is false without this fire and true with it. A side that is already lost without the fire is not blamed on it.
 * Exceptions: Propagates the baseline callback's errors.
 */
export function fireWouldKnockOut(inputs: FireRiskInputs, h3Index: string): boolean {
  const before = knockedOutAfter(inputs, new Set());
  const after = knockedOutAfter(inputs, new Set([h3Index]));
  logTrace('mercenaryFireRisk fireWouldKnockOut', { ownerSeatId: inputs.ownerSeatId, h3Index, before, after });
  return !before && after;
}

/**
 * Reads the fire-risk inputs for one side.
 *
 * Purpose: The guard and the briefing project from true control, the same data the end-of-turn knockout reads.
 * When to use: Each time a fire is checked or the Firing Risk table is built.
 * Expected outcome: Null unless the match is region versus region and the seat is active on the roster. Otherwise the inputs. Nothing is written.
 * Exceptions: Propagates roster, control, infrastructure, and Neutral-unit read errors.
 */
export function readFireRiskInputs(seatId: SeatId): FireRiskInputs | null {
  logDebug('mercenaryFireRisk readFireRiskInputs', { seatId });
  const scenario = loadScenarioState({ getOne: dbGetOne });
  if (scenario.scenarioId !== REGION_VS_REGION_SCENARIO_ID) return null;
  const seat = getSeatRoster().find((row) => row.seatId === seatId);
  if (!seat || !isSeatActive(seat)) return null;
  const share = effectiveControlWinMinUrbanShare();
  const infrastructure = listStrategicInfrastructureRows();
  const neutralRows = dbGetAll<{ h3Index: string }>('SELECT DISTINCT h3_index AS h3Index FROM units WHERE player = ?', [NEUTRAL_OWNER_ID]);
  return {
    ownerSeatId: seatId,
    homeHexes: getScenarioHomeRegionHexes(seat.homeRegion),
    controlByHex: getHexControlMap(),
    fortifiedByHex: new Map(infrastructure.map((row) => [row.h3Index, row.fortifiedCount])),
    urbanByHex: new Map(infrastructure.map((row) => [row.h3Index, row.urbanHexCount])),
    neutralHexes: new Set(neutralRows.map((row) => row.h3Index)),
    baselineUrbanCellsForHex: (h3Index) => baselineUrbanCellsForControlWin(h3Index, share),
    minUrbanShare: share,
  };
}
