/**
 * Reads the end-of-turn facts and writes the decision.
 *
 * Purpose: The pure rules stay free of SQL. This module gathers homes, control, and city counts, then stores the outcome.
 * When to use: At the end of strategic resolution, and when the human ends the match from the knockout dialog.
 * Expected outcome: Roster places and, when the match is over, `game_over`, `winner`, and `game_end_reason`.
 * Exceptions: Propagates SQLite errors and a baseline lookup that throws.
 */

import { activeGameMap } from '../../shared/activeGameMap';
import { activeSeats, enemySeatIdsOf, findSeat } from '../../shared/seatRoster';
import type { SeatId } from '../../shared/seatIds';
import { countCityHexesBySeat, rankSeatsByCityHexes } from '../../shared/victoryRules';
import {
  dbGetOne,
  dbRun,
  getHexControlMap,
  getScenarioHomeRegionHexes,
  getSeatRoster,
  listStrategicInfrastructureRows,
  sumUrbanHexCountForHexes,
} from '../gameDb';
import { readVictorySettings, setGameOutcomeWithOps } from '../gameDb/gameConfigKv';
import { loadScenarioState, REGION_VS_REGION_SCENARIO_ID } from '../gameDb/scenarioState';
import { writeSeatKnockout, writeSeatPlace } from '../gameDb/seatRosterStore';
import { logDebug, logError, logTrace } from '../logger';
import { getStrategicProductionContext, isTerrainClassificationCacheLoaded } from '../terrainClassificationCache';
import { computeHomeControlProgress, type HomeControlProgress } from './homeControlProgress';
import { decideEndOfTurnOutcome, type EndOfTurnOutcome } from './endOfTurnOutcomeRules';

/**
 * The share the control rule will actually apply, or null for every hex.
 *
 * Purpose: A regional map whose classification cache is not loaded must not throw while counting baseline urban cells.
 * When to use: The end-of-turn check and the prompt helper, so they cannot disagree.
 * Expected outcome: The profile share when it is a number and the cache is loaded. Otherwise null.
 * Exceptions: None.
 */
export function effectiveControlWinMinUrbanShare(): number | null {
  const share = activeGameMap().controlWinMinUrbanShare;
  if (typeof share === 'number' && !isTerrainClassificationCacheLoaded()) {
    logError(
      'effectiveControlWinMinUrbanShare: classification cache is not loaded; control win uses every hex',
      new Error('terrain classification cache is not loaded')
    );
    return null;
  }
  logTrace('effectiveControlWinMinUrbanShare', { share });
  return share;
}

/**
 * Generated urban cells in one strategic hex, for the control rule.
 *
 * Purpose: The share uses the generated baseline. A missing cache counts every hex instead.
 * When to use: `computeHomeControlProgress` while the effective share is known.
 * Expected outcome: The baseline count, or 0 when the every-hex rule is in force because the cache is not loaded.
 * Exceptions: `getStrategicProductionContext` can throw when the cache is loaded but the hex is missing.
 */
export function baselineUrbanCellsForControlWin(h3Index: string, effectiveShare: number | null): number {
  if (effectiveShare === null && !isTerrainClassificationCacheLoaded()) return 0;
  return getStrategicProductionContext({ h3Index }).urbanHexCount;
}

/**
 * Urban-cell progress between one seat and each enemy, in both directions.
 *
 * Purpose: The strategic prompt prints one progress line per enemy from the same counts the control rule uses.
 * When to use: The return value of `homeControlProgressForSeat`.
 * Expected outcome: `ownAgainstEnemy` is this seat's hold on that enemy's home. `enemyAgainstOwn` is the reverse.
 * Exceptions: None.
 */
export type SeatHomeControlPair = {
  /**
   * The other active seat.
   *
   * Contract: An active seat other than the seat that was asked about, in seat order.
   * When to use: Matching a progress line to a roster row.
   * Expected outcome: A `SeatId`.
   * Exceptions: None.
   */
  readonly enemySeatId: SeatId;
  /**
   * That enemy's home display name.
   *
   * Contract: `homeRegion` of `enemySeatId`, not the short name.
   * When to use: The progress line's label.
   * Expected outcome: The stored home name.
   * Exceptions: None.
   */
  readonly enemyName: string;
  /**
   * This seat's hold on the enemy home.
   *
   * Contract: `computeHomeControlProgress` with the enemy home and this seat as controller.
   * When to use: "{name} home urban cells in hexes you control".
   * Expected outcome: The same counts the control rule would use for that pair.
   * Exceptions: None.
   */
  readonly ownAgainstEnemy: HomeControlProgress;
  /**
   * The enemy's hold on this seat's home.
   *
   * Contract: `computeHomeControlProgress` with this seat's home and the enemy as controller.
   * When to use: "Your home urban cells in hexes {name} controls", and only when `heldUrbanCells` is greater than zero.
   * Expected outcome: The same counts the control rule would use for that pair.
   * Exceptions: None.
   */
  readonly enemyAgainstOwn: HomeControlProgress;
};

/**
 * Progress the strategic prompt can print for one commander against each enemy.
 *
 * Purpose: Replaces the two-seat human-and-opponent pair so each enemy home has its own line.
 * When to use: While building the strategic system prompt, outside a battle.
 * Expected outcome: Null when the match is not region-versus-region or the seat is not on the roster. Otherwise the effective share, which may be null, and one pair per active enemy in seat order.
 * Exceptions: Propagates a roster read error and a baseline lookup that throws. The prompt catches those and omits the lines.
 */
export function homeControlProgressForSeat(seatId: SeatId): {
  readonly controlWinMinUrbanShare: number | null;
  readonly pairs: readonly SeatHomeControlPair[];
} | null {
  const scenario = loadScenarioState({ getOne: dbGetOne });
  if (scenario.scenarioId !== REGION_VS_REGION_SCENARIO_ID) {
    logTrace('endOfTurnOutcome homeControlProgressForSeat', { seatId, scenarioId: scenario.scenarioId });
    return null;
  }
  const seats = getSeatRoster();
  const own = findSeat(seats, seatId);
  if (!own) {
    logTrace('endOfTurnOutcome homeControlProgressForSeat', { seatId, found: false });
    return null;
  }
  const effectiveShare = effectiveControlWinMinUrbanShare();
  const controlByHex = getHexControlMap();
  const ownHome = getScenarioHomeRegionHexes(own.homeRegion);
  const baselineUrbanCellsForHex = (h3Index: string): number => baselineUrbanCellsForControlWin(h3Index, effectiveShare);
  const pairs = enemySeatIdsOf(seats, seatId).flatMap((enemySeatId) => {
    const enemy = findSeat(seats, enemySeatId);
    if (!enemy) return [];
    return [{
      enemySeatId,
      enemyName: enemy.homeRegion,
      ownAgainstEnemy: computeHomeControlProgress({
        homeHexes: getScenarioHomeRegionHexes(enemy.homeRegion),
        controller: seatId,
        controlByHex,
        baselineUrbanCellsForHex,
        minUrbanShare: effectiveShare,
      }),
      enemyAgainstOwn: computeHomeControlProgress({
        homeHexes: ownHome,
        controller: enemySeatId,
        controlByHex,
        baselineUrbanCellsForHex,
        minUrbanShare: effectiveShare,
      }),
    }];
  });
  logDebug('endOfTurnOutcome homeControlProgressForSeat', { seatId, pairCount: pairs.length, effectiveShare });
  return { controlWinMinUrbanShare: effectiveShare, pairs };
}

/**
 * Decides the outcome of the turn that just resolved.
 *
 * Purpose: One database read of the roster, homes, control, and city counts, then the pure rules.
 * When to use: After production and control, before the turn number advances.
 * Expected outcome: The decision for `turnNumber`. Nothing is written.
 * Exceptions: Propagates SQLite errors and a baseline lookup that throws.
 */
export function evaluateEndOfTurnOutcome(turnNumber: number): EndOfTurnOutcome {
  const seats = getSeatRoster();
  const victory = readVictorySettings({ getOne: dbGetOne, run: dbRun });
  logDebug('evaluateEndOfTurnOutcome', { turnNumber, seatCount: seats.length, rule: victory.rule });
  const controlByHex = getHexControlMap();
  const effectiveShare = effectiveControlWinMinUrbanShare();
  const homeHexes = new Map(seats.map((seat) => [seat.seatId, getScenarioHomeRegionHexes(seat.homeRegion)]));
  const progress = (attacker: SeatId, victim: SeatId) => computeHomeControlProgress({
    homeHexes: homeHexes.get(victim) ?? [],
    controller: attacker,
    controlByHex,
    baselineUrbanCellsForHex: (h3Index) => baselineUrbanCellsForControlWin(h3Index, effectiveShare),
    minUrbanShare: effectiveShare,
  });
  const infrastructure = listStrategicInfrastructureRows();
  const cityHexCountBySeat = countCityHexesBySeat(
    [...controlByHex.entries()].map(([h3Index, controllerPlayerId]) => ({ h3Index, controllerPlayerId })),
    infrastructure
  );
  const intactHomeUrbanCellsBySeat = new Map(
    seats.map((seat) => [seat.seatId, sumUrbanHexCountForHexes(homeHexes.get(seat.seatId) ?? [])])
  );
  return decideEndOfTurnOutcome({
    turnNumber,
    seats,
    victory,
    controlWinMet: (attacker, victim) => progress(attacker, victim).controlWinMet,
    cityHexCountBySeat,
    intactHomeUrbanCellsBySeat,
    homeCityCellsControlledBy: (victim, controller) => progress(controller, victim).heldUrbanCells,
  });
}

/**
 * Writes knockouts, final places, and game-over flags.
 *
 * Purpose: A place is written only for a seat knocked out on this turn or ranked because the match ended.
 * When to use: Immediately after `evaluateEndOfTurnOutcome`, and from `endMatchByHuman`.
 * Expected outcome: Roster rows for those seats change. When the match is over, `game_over` is 1.
 * Exceptions: Propagates SQLite errors.
 */
export function recordEndOfTurnOutcome(outcome: EndOfTurnOutcome, turnNumber: number): void {
  logDebug('recordEndOfTurnOutcome', {
    turnNumber,
    knockoutCount: outcome.knockouts.length,
    gameOver: outcome.gameOver,
    endReason: outcome.endReason,
  });
  const ops = { run: dbRun };
  for (const knockout of outcome.knockouts) {
    writeSeatKnockout(ops, {
      seatId: knockout.seatId,
      outTurn: turnNumber,
      outBy: knockout.outBy,
      outReasons: knockout.reasons,
      place: knockout.place,
    });
  }
  for (const [seatId, place] of outcome.finalPlaces) {
    writeSeatPlace(ops, seatId, place);
  }
  if (outcome.gameOver && outcome.endReason) {
    setGameOutcomeWithOps({ run: dbRun, getOne: dbGetOne }, { winnerSeatId: outcome.winnerSeatId, endReason: outcome.endReason });
  }
}

/**
 * Ends the match by ranking the seats that are still active.
 *
 * Purpose: The human can leave a match that is still being played. Nothing calls this until the knockout dialog does.
 * When to use: When the human chooses to end the match.
 * Expected outcome: Active seats receive city-hex places. `game_end_reason` is `ended_by_human`. No new knockout is written.
 * Exceptions: Propagates SQLite errors.
 */
export function endMatchByHuman(turnNumber: number): EndOfTurnOutcome {
  const active = activeSeats(getSeatRoster());
  const cityHexCountBySeat = countCityHexesBySeat(
    [...getHexControlMap().entries()].map(([h3Index, controllerPlayerId]) => ({ h3Index, controllerPlayerId })),
    listStrategicInfrastructureRows()
  );
  const finalPlaces = rankSeatsByCityHexes(active.map((seat) => seat.seatId), cityHexCountBySeat);
  const first = [...finalPlaces.entries()].filter(([, place]) => place === 1);
  const outcome: EndOfTurnOutcome = {
    knockouts: [],
    gameOver: true,
    endReason: 'ended_by_human',
    finalPlaces,
    winnerSeatId: first.length === 1 ? first[0]![0] : null,
  };
  logDebug('endMatchByHuman', { turnNumber, activeCount: active.length });
  recordEndOfTurnOutcome(outcome, turnNumber);
  return outcome;
}
