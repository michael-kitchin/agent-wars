/**
 * Completes strategic turn resolution after melee outcomes are known, shared by uninterrupted ready and melee-intercept resume.
 */

import {
  dbRun,
  saveDatabase,
  refreshFogOfWarIntelFromCurrentState,
  addAiLossEventsSinceConsultation,
  getSeatRoster,
  listUnitsForSnapshot,
} from '../gameDb';
import { captureTurnLossNoteFromResolution } from './captureTurnLossNote';
import { processProductionAfterControlResolution, resolveStrategicControlAfterCombatAndMovement } from './controlAndProduction';
import { applyTransportOutcomeForRemovedStrategicUnits } from './sealift';
import type { CombatResolutionResult } from '../combatResolution';
import { combatDicePlaybackFields } from '../combatDiceRecording';
import type { CombatUnit } from '../combatUnitTypes';
import type { AirStrikePhaseResult } from './airStrikeResolution';
import type { FerryAnimationMove, RangedAttackOrder, ReadyResult } from '../../shared/ipcTypes';
import { evaluateEndOfTurnOutcome, recordEndOfTurnOutcome } from './endOfTurnOutcome';
import type { EndOfTurnOutcome } from './endOfTurnOutcomeRules';
import { applyKnockout, type KnockoutCoordinates } from './knockoutConsequences';
import { destroyAirUnitsWithInvalidBase } from './invalidAirBase';
import { logDebug } from '../logger';
import type { BuildUnitType } from '../../shared/ipc/productionTypes';
import { HUMAN_SEAT_ID, isAiSeatId, isSeatId, type OwnerId, type SeatId } from '../../shared/seatIds';
import { activeAiSeats } from '../../shared/seatRoster';
import { buildKillLabelUnitRoster } from '../../shared/unitDisplayNames';
import { withLossFlagFacts, type LossFlagFacts } from '../../shared/lossFlagFacts';

/**
 * AI seats that reached a deployment cap this turn.
 *
 * Purpose: Post-resolution consultation reads one list per seat instead of the first AI seat only.
 * When to use: The ready result after production is applied.
 * Expected outcome: Seats with an empty cap list are omitted.
 * Exceptions: None.
 */
function deploymentCapsBySeat(caps: ReadonlyMap<SeatId, BuildUnitType[]>): Record<string, readonly BuildUnitType[]> {
  const out: Record<string, readonly BuildUnitType[]> = {};
  for (const [seatId, types] of caps) {
    if (!isAiSeatId(seatId) || types.length === 0) continue;
    out[seatId] = types;
  }
  logDebug('meleeInterceptReadyFinalize deploymentCapsBySeat', { seatCount: Object.keys(out).length });
  return out;
}

export interface FinalizeReadyAfterMeleeArgs {
    /**
   * Specifies the contract for the `meleeResult` member (meleeResult: CombatResolutionResult;).

   * Contract: Outcome of melee for this turn, possibly with some hexes skipped for tactical intercept.
   * When to use: Passed from `runMeleePhase` after RNG stream was restored.
   * Expected outcome: Drives DB deletes and casualty aggregation for the melee slice only.
   * Exceptions: None.
   */
meleeResult: CombatResolutionResult;
    /**
   * Specifies the contract for the `rangedResult` member (rangedResult: CombatResolutionResult;).

   * Contract: Frozen ranged outcome from the paused ready segment.
   * When to use: Merging kills and combat hex lists for renderer playback.
   * Expected outcome: Must match the ranged phase that already applied DB deletes before pause.
   * Exceptions: None.
   */
rangedResult: CombatResolutionResult;
    /**
   * Specifies the contract for the `airStrikeResult` member (airStrikeResult: AirStrikePhaseResult;).

   * Contract: Frozen air strike outcome from the paused ready segment.
   * When to use: Infrastructure summaries and aggregate removed-unit lists.
   * Expected outcome: Must match the air phase that already applied DB deletes before pause.
   * Exceptions: None.
   */
airStrikeResult: AirStrikePhaseResult;
    /**
   * Specifies the contract for the `airStrikeTransportLosses` member (airStrikeTransportLosses: CombatUnit[];).

   * Contract: Extra removals caused by air-strike naval losses earlier in the same ready.
   * When to use: Aggregate casualty reporting.
   * Expected outcome: May be empty.
   * Exceptions: None.
   */
airStrikeTransportLosses: CombatUnit[];
    /**
   * Specifies the contract for the `rangedTransportLosses` member (rangedTransportLosses: CombatUnit[];).

   * Contract: Transport follow-on losses from ranged phase.
   * When to use: Aggregate casualty reporting.
   * Expected outcome: May be empty.
   * Exceptions: None.
   */
rangedTransportLosses: CombatUnit[];
    /**
   * Specifies the contract for the `combatUnitsAfter` member (combatUnitsAfter: CombatUnit[];).

   * Contract: Unit combat snapshots immediately before melee, after movement and ranged removals.
   * When to use: Opponent melee participant attribution.
   * Expected outcome: Aligns with DB unit positions at pause time.
   * Exceptions: None.
   */
combatUnitsAfter: CombatUnit[];
    /**
   * Specifies the contract for the `combatUnitsBefore` member (combatUnitsBefore: CombatUnit[];).

   * Contract: Combat snapshots from turn start (pre-move) for opponent ranged defender attribution.
   * When to use: `opponentCombatParticipantUnitIds` assembly.
   * Expected outcome: Matches the pre-move unit layout used in stock ready.
   * Exceptions: None.
   */
combatUnitsBefore: CombatUnit[];
    /**
   * Specifies the contract for the `humanMoves` member (humanMoves: { unitId: string; fromH3Index: string; toH3Index: string }[];).

   * Contract: Human movement animations for the turn.
   * When to use: Ready result payload.
   * Expected outcome: Excludes embarked follow rows (passed separately).
   * Exceptions: None.
   */
humanMoves: { unitId: string; fromH3Index: string; toH3Index: string }[];
    /**
   * Movement of every owner other than the human seat.
   *
   * Contract: Each move names the unit that marched.
   * When to use: The ready result's non-human move list.
   * Expected outcome: May be empty.
   * Exceptions: None.
   */
aiMoves: { unitId: string; fromH3Index: string; toH3Index: string }[];
    /**
   * Specifies the contract for the `embarkedFollowMoves` member (embarkedFollowMoves: { unitId: string; fromH3Index: string; toH3Index: string }[];).

   * Contract: Embarked land units that moved with their naval transports.
   * When to use: Ready result payload merged with humanMoves.
   * Expected outcome: May be empty.
   * Exceptions: None.
   */
embarkedFollowMoves: { unitId: string; fromH3Index: string; toH3Index: string }[];
    /**
   * Specifies the contract for the `resolvedFerryMoves` member (resolvedFerryMoves: FerryAnimationMove[];).

   * Contract: Successful ferry animations for the turn.
   * When to use: Ready result payload.
   * Expected outcome: May be empty.
   * Exceptions: None.
   */
resolvedFerryMoves: FerryAnimationMove[];
    /**
   * Specifies the contract for the `traversedHexesByPlayer` member (traversedHexesByPlayer: Record<SeatId, Set<string>>).

   * Contract: Fog refresh input after the turn ends.
   * When to use: `refreshFogOfWarIntelFromCurrentState` and control resolution.
   * Expected outcome: Same structure as `collectTraversedHexesByPlayer` output.
   * Exceptions: None.
   */
traversedHexesByPlayer: Map<OwnerId, Set<string>>;
    /**
   * Whether opponent units had resolving march activity this turn (including air), for post-resolution LLM idle detection.
   *
   * Contract: Must match the value computed in `executeReadyStrategicTurn` / melee pause snapshot.
   * When to use: Written to `ReadyResult.opponentHadStrategicMarchResolution` for `afterResolution` gating.
   * Expected outcome: True when any opponent march order changed `h3_index`; ferry success remains in `resolvedFerryMoves`.
   * Exceptions: None.
   */
hadStrategicMarchResolutionBySeat: Readonly<Record<string, boolean>>;
    /**
   * Specifies the contract for the `turnNumber` member (turnNumber: number;).

   * Contract: Strategic turn index before increment at end of finalize.
   * When to use: AI loss bookkeeping and DB turn_state update.
   * Expected outcome: Matches pause snapshot turn.
   * Exceptions: None.
   */
turnNumber: number;
    /**
   * Specifies the contract for the `allRanged` member (allRanged: RangedAttackOrder[];).

   * Contract: Combined human+AI ranged orders for defender hex coverage.
   * When to use: Opponent ranged defender attribution.
   * Expected outcome: Same list used during the paused ready invocation.
   * Exceptions: None.
   */
allRanged: RangedAttackOrder[];
    /**
   * Specifies the contract for the `aiRangedOrders` member (aiRangedOrders: RangedAttackOrder[];).

   * Contract: Opponent ranged orders only for attacker attribution.
   * When to use: `opponentCombatParticipantUnitIds`.
   * Expected outcome: Same array passed into the paired ready call.
   * Exceptions: None.
   */
aiRangedOrders: RangedAttackOrder[];
    /**
   * Hex centers and the lookup that turns a center back into a hex.
   *
   * Contract: The same pair built for standing orders on this turn.
   * When to use: Defend orders for units that just became Neutral.
   * Expected outcome: Each remaining unit's hex has a center.
   * Exceptions: None.
   */
knockoutCoordinates: KnockoutCoordinates;
  /**
   * Birth records captured before this turn deleted any units.
   *
   * Contract: One entry per unit that had an origin at turn start. Empty when none did.
   * When to use: Stamp every removed-unit list on the ready result.
   * Expected outcome: A casualty can be named after its row is gone, including a unit the player never saw.
   * Exceptions: None.
   */
  lossFlagFactsByUnitId: ReadonlyMap<string, LossFlagFacts>;
}

/**
 * Runs post-melee strategic bookkeeping: DB deletes for melee, production, fog refresh, turn increment, and ready result assembly.
 *
 * Purpose: Single implementation for the tail of `ready` so melee intercept resume cannot drift from the happy path.
 * When to use: After `runMeleePhase` returns, whether ready ran melee immediately or after an intercept decision.
 * Expected outcome: `ReadyResult` matches the stock ready contract for a completed turn, including each phase's
 *   recorded dice rolls (omitted when that phase rolled nothing).
 * Exceptions: Propagates DB errors to the caller try/catch.
 */
export function finalizeReadyTurnAfterMelee(args: FinalizeReadyAfterMeleeArgs): ReadyResult & { endOfTurnOutcome: EndOfTurnOutcome } {
  const diceFields = combatDicePlaybackFields(
    args.airStrikeResult.diceRolls,
    args.rangedResult.diceRolls ?? [],
    args.meleeResult.diceRolls ?? []
  );
  logDebug('finalizeReadyTurnAfterMelee', {
    turnNumber: args.turnNumber,
    meleeRemoved: args.meleeResult.removedUnitIds.length,
    unitsWithOrigin: args.lossFlagFactsByUnitId.size,
    airStrikeDiceRollCount: diceFields.airStrikeDiceRolls?.length ?? 0,
    rangedDiceRollCount: diceFields.rangedDiceRolls?.length ?? 0,
    meleeDiceRollCount: diceFields.meleeDiceRolls?.length ?? 0,
  });
  const {
    meleeResult,
    rangedResult,
    airStrikeResult,
    airStrikeTransportLosses,
    rangedTransportLosses,
    combatUnitsAfter,
    combatUnitsBefore,
    humanMoves,
    aiMoves,
    embarkedFollowMoves,
    resolvedFerryMoves,
    traversedHexesByPlayer,
    hadStrategicMarchResolutionBySeat,
    turnNumber,
    allRanged,
  } = args;

  for (const id of meleeResult.removedUnitIds) {
    dbRun('DELETE FROM units WHERE id = ?', [id]);
  }
  const meleeTransportLosses = applyTransportOutcomeForRemovedStrategicUnits(
    meleeResult.removedUnitIds,
    meleeResult.removedUnits
  );

  const controlTransitions = resolveStrategicControlAfterCombatAndMovement(traversedHexesByPlayer);
  const baseLossRemovedAir = destroyAirUnitsWithInvalidBase();
  const airStrikeDestroyedFeatures = { urban: 0, airport: 0, seaport: 0 };
  let airStrikeDestroyedBasedAirUnits = 0;
  for (const event of airStrikeResult.infrastructureDestroyedEvents) {
    airStrikeDestroyedFeatures[event.targetType] += 1;
    airStrikeDestroyedBasedAirUnits += event.destroyedAirUnitsCount ?? 0;
  }
  const airStrikeDestroyedUnitsByType = { infantry: 0, armor: 0, naval: 0, air: 0 };
  const airStrikeLostAirUnitIds: string[] = [];
  for (const removed of airStrikeResult.removedUnits) {
    if (removed.unitType === 'infantry') airStrikeDestroyedUnitsByType.infantry += 1;
    else if (removed.unitType === 'armor') airStrikeDestroyedUnitsByType.armor += 1;
    else if (removed.unitType === 'naval') airStrikeDestroyedUnitsByType.naval += 1;
    else if (removed.unitType === 'air') {
      airStrikeDestroyedUnitsByType.air += 1;
      airStrikeLostAirUnitIds.push(removed.id);
    }
  }
  if (airStrikeResult.attemptCount > 0 || baseLossRemovedAir.length > 0) {
    logDebug('ready: airStrikeSummary', {
      attemptCount: airStrikeResult.attemptCount,
      successfulCount: airStrikeResult.successfulCount,
      failedCount: airStrikeResult.failedCount,
      attackerLossCount: airStrikeResult.attackerLossCount,
      destroyedFeatures: airStrikeDestroyedFeatures,
      destroyedBasedAirUnits: airStrikeDestroyedBasedAirUnits,
      destroyedUnitsByType: airStrikeDestroyedUnitsByType,
      airLossUnitIds: [...new Set(airStrikeLostAirUnitIds)],
      strandedAirLossCount: baseLossRemovedAir.length,
      strandedAirLossUnitIds: baseLossRemovedAir.map((unit) => unit.id),
    });
  }
  const productionSummary = processProductionAfterControlResolution();
  const deployedUnitsByType = productionSummary.deployedByPlayer.get(HUMAN_SEAT_ID) ?? {};
  const finalUnits = listUnitsForSnapshot();
  const humanHexesLost = controlTransitions.filter(
    (transition) => transition.fromControllerPlayerId === HUMAN_SEAT_ID
      && transition.toControllerPlayerId !== null
      && transition.toControllerPlayerId !== HUMAN_SEAT_ID
  );
  const controlLossLightningHexes = humanHexesLost
    .filter((t) => !finalUnits.some((u) => u.player === HUMAN_SEAT_ID && u.h3Index === t.h3Index))
    .map((t) => t.h3Index);

  const endOfTurnOutcome = evaluateEndOfTurnOutcome(turnNumber);
  recordEndOfTurnOutcome(endOfTurnOutcome, turnNumber);
  for (const knockout of endOfTurnOutcome.knockouts) {
    applyKnockout(knockout.seatId, args.knockoutCoordinates);
  }

  dbRun('DELETE FROM pending_orders');
  dbRun('DELETE FROM pending_ranged_orders');
  dbRun('DELETE FROM pending_air_orders');
  dbRun('DELETE FROM pending_ferry_orders');
  dbRun('UPDATE turn_state SET phase = ?, turn_number = ? WHERE id = 1', ['planning', turnNumber + 1]);
  const traversedForFog: Partial<Record<SeatId, readonly string[]>> = {};
  for (const [owner, hexes] of traversedHexesByPlayer) {
    if (!isSeatId(owner)) continue;
    traversedForFog[owner] = [...hexes];
  }
  refreshFogOfWarIntelFromCurrentState({ traversedHexesByPlayer: traversedForFog });

  saveDatabase();
  const allRemovedIds = [
    ...airStrikeResult.removedUnitIds,
    ...airStrikeTransportLosses.map((unit) => unit.id),
    ...rangedResult.removedUnitIds,
    ...rangedTransportLosses.map((unit) => unit.id),
    ...meleeResult.removedUnitIds,
    ...meleeTransportLosses.map((unit) => unit.id),
    ...baseLossRemovedAir.map((u) => u.id),
  ];
  const allRemovedUnits = [
    ...airStrikeResult.removedUnits,
    ...airStrikeTransportLosses,
    ...rangedResult.removedUnits,
    ...rangedTransportLosses,
    ...meleeResult.removedUnits,
    ...meleeTransportLosses,
    ...baseLossRemovedAir,
  ];
  const allKills = [...rangedResult.kills, ...meleeResult.kills];
  const allCombatHexes = [...rangedResult.combatHexes, ...meleeResult.combatHexes];
  const allCasualtyHexes = [
    ...airStrikeResult.casualtyHexes,
    ...rangedResult.casualtyHexes,
    ...meleeResult.casualtyHexes,
    ...baseLossRemovedAir.map((u) => u.h3Index),
  ];

  const defenderHexes = new Set(allRanged.map((order) => order.targetH3Index));
  const meleeHexSet = new Set(meleeResult.combatHexes);
  const participantsFor = (seatId: string): string[] => {
    const attackers = allRanged
      .filter((order) => combatUnitsBefore.some((unit) => unit.id === order.unitId && unit.player === seatId))
      .map((order) => order.unitId);
    const defenders = combatUnitsBefore
      .filter((unit) => unit.player === seatId && defenderHexes.has(unit.h3Index))
      .map((unit) => unit.id);
    const meleeParticipants = combatUnitsAfter
      .filter((unit) => unit.player === seatId && meleeHexSet.has(unit.h3Index))
      .map((unit) => unit.id);
    return [...new Set([...attackers, ...defenders, ...meleeParticipants])];
  };
  const removedFor = (seatId: string): string[] => allRemovedUnits.filter((unit) => unit.player === seatId).map((unit) => unit.id);
  const combatParticipantUnitIdsBySeat: Record<string, readonly string[]> = {};
  const removedUnitIdsBySeat: Record<string, readonly string[]> = {};
  for (const seat of activeAiSeats(getSeatRoster())) {
    if (!isAiSeatId(seat.seatId)) continue;
    combatParticipantUnitIdsBySeat[seat.seatId] = participantsFor(seat.seatId);
    removedUnitIdsBySeat[seat.seatId] = removedFor(seat.seatId);
  }
  for (const seat of activeAiSeats(getSeatRoster())) {
    if (!isAiSeatId(seat.seatId)) continue;
    addAiLossEventsSinceConsultation(
      seat.seatId,
      turnNumber,
      allRemovedUnits.filter((unit) => unit.player === seat.seatId).map((unit) => ({ id: unit.id, player: unit.player })),
      allKills,
      rangedResult.killsByDirectFire,
      rangedResult.killsByReturnFire
    );
  }

  const killLabelKillEdges = [
    ...allKills,
    ...(rangedResult.killsByDirectFire ?? []),
    ...(rangedResult.killsByReturnFire ?? []),
  ];
  const killLabelUnits = buildKillLabelUnitRoster(
    killLabelKillEdges,
    listUnitsForSnapshot(),
    allRemovedUnits.map((u) => ({
      id: u.id,
      unitType: u.unitType,
      displayOrder: u.displayOrder,
    }))
  );

  captureTurnLossNoteFromResolution({
    scope: 'strategic',
    battleId: '',
    turnNumber,
    kills: allKills,
    killsByDirectFire: rangedResult.killsByDirectFire,
    killsByReturnFire: rangedResult.killsByReturnFire,
    removedUnits: allRemovedUnits,
    airStrikeRemovedUnits: airStrikeResult.removedUnits,
    labelUnits: killLabelUnits,
    airStrikeMoves: airStrikeResult.strikeMoves,
  });

  /**
   * Attaches each casualty's birth record so the turn-update dialog can draw its flag.
   *
   * Purpose: Combat rows keep the hex where the unit was lost. The flag comes from the record captured before the delete.
   * When to use: The removed-unit lists on the ready result.
   * Expected outcome: A unit that had an origin keeps it. A unit that had none is unchanged.
   * Exceptions: None.
   */
  const stampLossFlags = <T extends { id: string }>(units: readonly T[]): Array<T & Partial<LossFlagFacts>> =>
    units.map((unit) => withLossFlagFacts(unit, args.lossFlagFactsByUnitId.get(unit.id)));

  return {
    success: true,
    knockouts: endOfTurnOutcome.knockouts.length > 0
      ? endOfTurnOutcome.knockouts.map((knockout) => ({
          seatId: knockout.seatId,
          outBy: knockout.outBy,
          reasons: knockout.reasons,
          place: knockout.place,
        }))
      : undefined,
    endOfTurnOutcome,
    combatHexes: allCombatHexes.length > 0 ? allCombatHexes : undefined,
    removedUnitIds: allRemovedIds.length > 0 ? allRemovedIds : undefined,
    casualtyHexes: allCasualtyHexes.length > 0 ? allCasualtyHexes : undefined,
    removedUnits: allRemovedUnits.length > 0 ? stampLossFlags(allRemovedUnits) : undefined,
    killLabelUnits: killLabelUnits.length > 0 ? killLabelUnits : undefined,
    kills: allKills.length > 0 ? allKills : undefined,
    killsByDirectFire: rangedResult.killsByDirectFire?.length ? rangedResult.killsByDirectFire : undefined,
    killsByReturnFire: rangedResult.killsByReturnFire?.length ? rangedResult.killsByReturnFire : undefined,
    rangedCombatHexes: rangedResult.combatHexes.length > 0 ? rangedResult.combatHexes : undefined,
    rangedCasualtyHexes: rangedResult.casualtyHexes.length > 0 ? rangedResult.casualtyHexes : undefined,
    rangedRemovedUnits: rangedResult.removedUnits.length > 0 ? stampLossFlags(rangedResult.removedUnits) : undefined,
    rangedResolutionShotLines:
      rangedResult.rangedResolutionShotLines && rangedResult.rangedResolutionShotLines.length > 0
        ? rangedResult.rangedResolutionShotLines
        : undefined,
    airStrikeHexes: airStrikeResult.strikeHexes.length > 0 ? airStrikeResult.strikeHexes : undefined,
    airStrikeCasualtyHexes: airStrikeResult.casualtyHexes.length > 0 ? airStrikeResult.casualtyHexes : undefined,
    airStrikeRemovedUnits: airStrikeResult.removedUnits.length > 0 ? stampLossFlags(airStrikeResult.removedUnits) : undefined,
    airStrikeMoves: airStrikeResult.strikeMoves.length > 0 ? airStrikeResult.strikeMoves : undefined,
    airStrikeAttemptCount: airStrikeResult.attemptCount > 0 ? airStrikeResult.attemptCount : undefined,
    airStrikeSuccessfulCount: airStrikeResult.successfulCount > 0 ? airStrikeResult.successfulCount : undefined,
    airStrikeFailedCount: airStrikeResult.failedCount > 0 ? airStrikeResult.failedCount : undefined,
    airStrikeAttackerLossCount: airStrikeResult.attackerLossCount > 0 ? airStrikeResult.attackerLossCount : undefined,
    baseInvalidAirLossCount: baseLossRemovedAir.length > 0 ? baseLossRemovedAir.length : undefined,
    infrastructureDestroyedEvents:
      airStrikeResult.infrastructureDestroyedEvents.length > 0 ? airStrikeResult.infrastructureDestroyedEvents : undefined,
    resolvedFerryMoves: resolvedFerryMoves.length > 0 ? resolvedFerryMoves : undefined,
    meleeCombatHexes: meleeResult.combatHexes.length > 0 ? meleeResult.combatHexes : undefined,
    meleeCasualtyHexes: meleeResult.casualtyHexes.length > 0 ? meleeResult.casualtyHexes : undefined,
    meleeRemovedUnits: meleeResult.removedUnits.length > 0 ? stampLossFlags(meleeResult.removedUnits) : undefined,
    humanMoves: humanMoves.length + embarkedFollowMoves.length > 0 ? [...humanMoves, ...embarkedFollowMoves] : undefined,
    aiMoves: aiMoves.length > 0 ? aiMoves : undefined,
    deployedUnitsByType: Object.keys(deployedUnitsByType).length > 0 ? deployedUnitsByType : undefined,
    humanHexesLostCount: humanHexesLost.length > 0 ? humanHexesLost.length : undefined,
    controlTransitions: controlTransitions.length > 0
      ? controlTransitions.map((transition) => ({
          h3Index: transition.h3Index,
          from: transition.fromControllerPlayerId,
          to: transition.toControllerPlayerId,
        }))
      : undefined,
    controlLossLightningHexes: controlLossLightningHexes.length > 0 ? controlLossLightningHexes : undefined,
    humanDeploymentCapReachedUnitTypes: (productionSummary.capReachedByPlayer.get(HUMAN_SEAT_ID)?.length ?? 0) > 0
      ? productionSummary.capReachedByPlayer.get(HUMAN_SEAT_ID)
      : undefined,
    deploymentCapReachedUnitTypesBySeat: deploymentCapsBySeat(productionSummary.capReachedByPlayer),
    combatParticipantUnitIdsBySeat,
    removedUnitIdsBySeat,
    hadStrategicMarchResolutionBySeat,
    ...diceFields,
  };
}
