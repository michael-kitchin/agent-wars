/**
 * Completes strategic turn resolution after melee outcomes are known, shared by uninterrupted ready and melee-intercept resume.
 */

import {
  dbGetAll,
  dbRun,
  saveDatabase,
  refreshFogOfWarIntelFromCurrentState,
  addAiLossEventsSinceConsultation,
  listUnitsForSnapshot,
  setGameOver,
} from '../gameDb';
import { processProductionAfterControlResolution, resolveRes1ControlAfterCombatAndMovement } from './controlAndProduction';
import { applyTransportLossForRemovedNavalUnits, deleteTransportAssignmentsForRemovedUnits } from './sealift';
import type { CombatResolutionResult } from '../combatResolution';
import type { CombatUnit } from '../combatUnitTypes';
import type { AirStrikePhaseResult } from './airStrikeResolution';
import type { FerryAnimationMove, RangedAttackOrder, ReadyResult } from '../../shared/ipcTypes';
import { evaluateRegionControlWinnerAtEndOfTurn } from './regionControlWinner';
import { destroyAirUnitsWithInvalidBase } from './invalidAirBase';
import { logDebug } from '../logger';

/**
 * Applies transport-side effects for a combat removal list (naval sinks, embarked cleanup).
 *
 * Purpose: Mirrors the ready-phase helper so finalize stays aligned with transport rules.
 * When to use: After deleting units removed in melee during finalize.
 * Expected outcome: Returns any extra transport-derived removals to fold into reporting.
 * Exceptions: None beyond underlying DB helpers.
 */
function applyTransportOutcomeForPhase(removedUnitIds: string[], removedUnits: CombatUnit[]): CombatUnit[] {
  const transportLosses = applyTransportLossForRemovedNavalUnits(removedUnits);
  deleteTransportAssignmentsForRemovedUnits(removedUnitIds);
  if (transportLosses.length > 0) {
    deleteTransportAssignmentsForRemovedUnits(transportLosses.map((unit) => unit.id));
  }
  return transportLosses;
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
   * Specifies the contract for the `traversedHexesByPlayer` member (traversedHexesByPlayer: Record<'human' | 'opponent', Set<string>>).

   * Contract: Fog refresh input after the turn ends.
   * When to use: `refreshFogOfWarIntelFromCurrentState` and control resolution.
   * Expected outcome: Same structure as `collectTraversedHexesByPlayer` output.
   * Exceptions: None.
   */
traversedHexesByPlayer: Record<'human' | 'opponent', Set<string>>;
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
}

/**
 * Runs post-melee strategic bookkeeping: DB deletes for melee, production, fog refresh, turn increment, and ready result assembly.
 *
 * Purpose: Single implementation for the tail of `ready` so melee intercept resume cannot drift from the happy path.
 * When to use: After `runMeleePhase` returns, whether ready ran melee immediately or after an intercept decision.
 * Expected outcome: `ReadyResult` matches the stock ready contract for a completed turn.
 * Exceptions: Propagates DB errors to the caller try/catch.
 */
export function finalizeReadyTurnAfterMelee(args: FinalizeReadyAfterMeleeArgs): ReadyResult {
  logDebug('finalizeReadyTurnAfterMelee', { turnNumber: args.turnNumber, meleeRemoved: args.meleeResult.removedUnitIds.length });
  const {
    meleeResult,
    rangedResult,
    airStrikeResult,
    airStrikeTransportLosses,
    rangedTransportLosses,
    combatUnitsAfter,
    combatUnitsBefore,
    humanMoves,
    embarkedFollowMoves,
    resolvedFerryMoves,
    traversedHexesByPlayer,
    turnNumber,
    allRanged,
    aiRangedOrders,
  } = args;

  for (const id of meleeResult.removedUnitIds) {
    dbRun('DELETE FROM units WHERE id = ?', [id]);
  }
  const meleeTransportLosses = applyTransportOutcomeForPhase(meleeResult.removedUnitIds, meleeResult.removedUnits);

  const controlTransitions = resolveRes1ControlAfterCombatAndMovement(traversedHexesByPlayer);
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
  const deployedUnitsByType = productionSummary.deployedByPlayer.human;
  const finalUnits = listUnitsForSnapshot();
  const humanHexesLost = controlTransitions.filter(
    (t) => t.fromControllerPlayerId === 'human' && t.toControllerPlayerId === 'opponent'
  );
  const controlLossLightningHexes = humanHexesLost
    .filter((t) => !finalUnits.some((u) => u.player === 'human' && u.h3Index === t.h3Index))
    .map((t) => t.h3Index);

  const humanCount = dbGetAll<{ c: number }>('SELECT COUNT(*) AS c FROM units WHERE player = ?', ['human'])[0]?.c ?? 0;
  const opponentCount = dbGetAll<{ c: number }>('SELECT COUNT(*) AS c FROM units WHERE player = ?', ['opponent'])[0]?.c ?? 0;
  const regionWinner = evaluateRegionControlWinnerAtEndOfTurn();
  if (regionWinner) setGameOver(regionWinner);
  else if (humanCount === 0 && opponentCount > 0) setGameOver('opponent');
  else if (opponentCount === 0 && humanCount > 0) setGameOver('human');

  dbRun('DELETE FROM pending_orders');
  dbRun('DELETE FROM pending_ranged_orders');
  dbRun('DELETE FROM pending_air_orders');
  dbRun('DELETE FROM pending_ferry_orders');
  dbRun('UPDATE turn_state SET phase = ?, turn_number = ? WHERE id = 1', ['planning', turnNumber + 1]);
  refreshFogOfWarIntelFromCurrentState({
    traversedHexesByPlayer: {
      human: [...traversedHexesByPlayer.human],
      opponent: [...traversedHexesByPlayer.opponent],
    },
  });

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

  const opponentRangedAttackers = aiRangedOrders.map((o) => o.unitId);
  const defenderHexes = new Set(allRanged.map((o) => o.targetH3Index));
  const opponentRangedDefenders = combatUnitsBefore
    .filter((u) => u.player === 'opponent' && defenderHexes.has(u.h3Index))
    .map((u) => u.id);
  const meleeHexSet = new Set(meleeResult.combatHexes);
  const opponentMeleeParticipants = combatUnitsAfter
    .filter((u) => u.player === 'opponent' && meleeHexSet.has(u.h3Index))
    .map((u) => u.id);
  const opponentCombatParticipantUnitIds = [
    ...new Set([...opponentRangedAttackers, ...opponentRangedDefenders, ...opponentMeleeParticipants]),
  ];
  const removedOpponentUnitIds = allRemovedUnits.filter((u) => u.player === 'opponent').map((u) => u.id);
  addAiLossEventsSinceConsultation(
    'opponent',
    turnNumber,
    allRemovedUnits.map((u) => ({ id: u.id, player: u.player })),
    allKills,
    rangedResult.killsByDirectFire,
    rangedResult.killsByReturnFire
  );

  return {
    success: true,
    combatHexes: allCombatHexes.length > 0 ? allCombatHexes : undefined,
    removedUnitIds: allRemovedIds.length > 0 ? allRemovedIds : undefined,
    casualtyHexes: allCasualtyHexes.length > 0 ? allCasualtyHexes : undefined,
    removedUnits: allRemovedUnits.length > 0 ? allRemovedUnits : undefined,
    kills: allKills.length > 0 ? allKills : undefined,
    killsByDirectFire: rangedResult.killsByDirectFire?.length ? rangedResult.killsByDirectFire : undefined,
    killsByReturnFire: rangedResult.killsByReturnFire?.length ? rangedResult.killsByReturnFire : undefined,
    rangedCombatHexes: rangedResult.combatHexes.length > 0 ? rangedResult.combatHexes : undefined,
    rangedCasualtyHexes: rangedResult.casualtyHexes.length > 0 ? rangedResult.casualtyHexes : undefined,
    rangedRemovedUnits: rangedResult.removedUnits.length > 0 ? rangedResult.removedUnits : undefined,
    airStrikeHexes: airStrikeResult.strikeHexes.length > 0 ? airStrikeResult.strikeHexes : undefined,
    airStrikeCasualtyHexes: airStrikeResult.casualtyHexes.length > 0 ? airStrikeResult.casualtyHexes : undefined,
    airStrikeRemovedUnits: airStrikeResult.removedUnits.length > 0 ? airStrikeResult.removedUnits : undefined,
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
    meleeRemovedUnits: meleeResult.removedUnits.length > 0 ? meleeResult.removedUnits : undefined,
    humanMoves: humanMoves.length + embarkedFollowMoves.length > 0 ? [...humanMoves, ...embarkedFollowMoves] : undefined,
    deployedUnitsByType: Object.keys(deployedUnitsByType).length > 0 ? deployedUnitsByType : undefined,
    humanHexesLostCount: humanHexesLost.length > 0 ? humanHexesLost.length : undefined,
    controlLossLightningHexes: controlLossLightningHexes.length > 0 ? controlLossLightningHexes : undefined,
    humanDeploymentCapReachedUnitTypes:
      productionSummary.capReachedByPlayer.human.length > 0 ? productionSummary.capReachedByPlayer.human : undefined,
    opponentDeploymentCapReachedUnitTypes:
      productionSummary.capReachedByPlayer.opponent.length > 0 ? productionSummary.capReachedByPlayer.opponent : undefined,
    opponentCombatParticipantUnitIds,
    removedOpponentUnitIds,
  };
}
