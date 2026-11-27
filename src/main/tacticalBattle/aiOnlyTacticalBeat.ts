/**
 * One beat of a battle between two AI seats.
 *
 * Purpose: Both drafts resolve in the same phase order as a human beat, then the snapshot records what the beat did and whether the battle ended by a wipe, a quiet streak, both commanders leaving, or the match's beat limit.
 * When to use: `commitHumanTacticalDraftOrders` when the active snapshot has `leadPartyId`. The caller has already taken each draft once.
 * Expected outcome: The session stays active. `aiOnlyEndReason` is set only when this beat ends the battle.
 * Exceptions: Returns a failure reason when no AI-only battle is active. Illegal rows are dropped and do not fail the beat.
 */

import type { EmbarkOrder } from '../../shared/ipcTypes';
import type { TacticalOpponentPlanPayload } from '../../shared/ipc/consultationPushTypes';
import { getTwoPartyAnnihilationOutcome } from '../../shared/tacticalAnnihilation';
import { anySubUnitMovedCloser, countAttackShots, isQuietBeat, QUIET_BEATS_TO_END } from '../../shared/tacticalQuietBeat';
import type { OwnerId } from '../../shared/seatIds';
import type { TacticalBattleSnapshot, TacticalBeatActivity } from '../../shared/tacticalBattleTypes';
import { createCombatRng } from '../combatResolution';
import { dbGetOne, dbRun, getGameSeed } from '../gameDb';
import { readAiOnlyBeatLimit } from '../gameDb/gameConfigKv';
import { aiOnlyBeatLimitReached } from '../../shared/aiOnlyBeatLimit';
import { logDebug } from '../logger';
import { getActiveTacticalBattleSnapshotRef } from './activeTacticalBattleRef';
import { commitAiOnlyTacticalBeatSnapshot } from './tacticalBattleSession';
import { applyTacticalMeleeAfterSupportOrders, tacticalCombatSeed } from './tacticalMeleeApply';
import { projectTacticalSnapshotAfterPlayerMovementOrders } from './tacticalMovementApply';
import { withoutTacticalHeadOnHolderMoves } from './tacticalHeadOnContact';
import { withoutFerryForDroppedUnits } from './tacticalAirDrop';
import { validateTacticalOpponentEmbarkOrder } from './tacticalOpponentOrderValidation';
import {
  applyTacticalAirStrikeThenRangedPhaseOnBattle,
  applyTacticalEmbarkPhaseOnBattle,
  applyTacticalFerryPhaseOnBattle,
  tacticalBattleWithSyncedEmbarkCargo,
} from './tacticalStrategicOrderPhases';
import { tacticalComputeMovementOrderOutcomeForPlayer } from './tacticalSnapshotGuards';
import type { TacticalBeatOutcome } from './tacticalBeatOutcome';
import { withFortificationOwnersFromGameDb } from './tacticalFortificationOwners';

/**
 * The two drafts for one AI-only beat.
 *
 * Purpose: The lead occupies the human slice's place. The other seat occupies the opponent slice's place.
 * When to use: `applyAiOnlyTacticalBeat`.
 * Expected outcome: A missing draft is the same as no orders.
 * Exceptions: None.
 */
export interface AiOnlyTacticalBeatDrafts {
  /**
   * Orders from the lower seat-order commander.
   *
   * Contract: Embark in this draft runs after movement.
   * When to use: The seat named by `leadPartyId`.
   * Expected outcome: Illegal rows are dropped.
   * Exceptions: None.
   */
  readonly leadDraft?: TacticalOpponentPlanPayload | null;
  /**
   * Orders from the other commander.
   *
   * Contract: Embark in this draft runs before air.
   * When to use: The seat named by `opposingPartyId`.
   * Expected outcome: Illegal rows are dropped.
   * Exceptions: None.
   */
  readonly opposingDraft?: TacticalOpponentPlanPayload | null;
}

/**
 * Movement rows the named seat can legally apply.
 *
 * Purpose: An illegal march is dropped, and it must not fail the beat.
 * When to use: Once per seat before the phases run.
 * Expected outcome: The movement orders whose outcome is ok.
 * Exceptions: None.
 */
function keptOrdersForSeat(
  battle: TacticalBattleSnapshot,
  draft: TacticalOpponentPlanPayload | null | undefined,
  player: OwnerId,
): { readonly movement: { unitId: string; toH3Index: string }[] } {
  if (draft == null) return { movement: [] };
  const tacticalSet = new Set(battle.tacticalChildH3Indexes);
  const sub = battle.subUnits.map((unit) => ({ ...unit }));
  const byId = new Map(sub.map((unit, index) => [unit.id, index] as const));
  const movement: { unitId: string; toH3Index: string }[] = [];
  for (const order of draft.movementOrders) {
    const outcome = tacticalComputeMovementOrderOutcomeForPlayer(player, { byId, sub, order, tacticalSet, battle });
    if (!outcome.ok) {
      logDebug('aiOnlyTacticalBeat dropped march', { player, unitId: order.unitId, reason: outcome.reason });
      continue;
    }
    movement.push(order);
  }
  return { movement };
}

/**
 * Embark rows that pass the opponent validator for units of `player`.
 *
 * Purpose: An illegal embark is dropped. The validator accepts any non-human, non-neutral owner.
 * When to use: Before each embark phase, on the snapshot that phase will read.
 * Expected outcome: Only rows the validator accepts.
 * Exceptions: None.
 */
function legalEmbarkOrders(
  battle: TacticalBattleSnapshot,
  orders: readonly EmbarkOrder[],
  player: OwnerId,
): EmbarkOrder[] {
  return orders.filter((order) => {
    const land = battle.subUnits.find((unit) => unit.id === order.unitId);
    if (land == null || land.player !== player) return false;
    return validateTacticalOpponentEmbarkOrder(order, battle.subUnits, battle.enclosingStrategicH3Index).valid;
  });
}

/**
 * Success carries the full beat outcome. Failure is a reason string.
 *
 * Purpose: Callers that only stored `battle` now also receive combat results for playback and loss notes.
 * When to use: The return of `applyAiOnlyTacticalBeat`.
 * Expected outcome: `success: true` includes `TacticalBeatOutcome`. `success: false` has `reason`.
 * Exceptions: None.
 */
export type AiOnlyTacticalBeatResult =
  | ({ readonly success: true } & TacticalBeatOutcome)
  | { readonly success: false; readonly reason: string };

/**
 * Applies both AI drafts and records the end reason when this beat finishes the battle.
 *
 * Purpose: The battle ends on a wiped side, then on `QUIET_BEATS_TO_END` quiet beats in a row, then on both exit flags on any beat, then on the stored beat limit. The limit uses the beat number before this function stores the next one. The result keeps every phase the playback builder needs.
 * When to use: After each seat's draft has been taken once.
 * Expected outcome: `battle` is the stored snapshot, with `lastBeatActivity` and `quietBeatStreak` for this beat. `battleAfterMovementBeforeFerry` is the snapshot before embark and ferry. Removals include both ferry phases.
 * Exceptions: Failure reason `'No AI-only tactical battle is active.'` when no AI-only battle is active.
 */
export function applyAiOnlyTacticalBeat(drafts: AiOnlyTacticalBeatDrafts): AiOnlyTacticalBeatResult {
  const current = getActiveTacticalBattleSnapshotRef();
  const lead = current?.leadPartyId;
  const opposing = current?.opposingPartyId;
  logDebug('applyAiOnlyTacticalBeat', {
    battleId: current?.battleId ?? null,
    leadPartyId: lead ?? null,
    opposingPartyId: opposing ?? null,
    tacticalTurnNumber: current?.tacticalTurnNumber ?? null,
  });
  if (current == null || lead == null || opposing == null) {
    return { success: false, reason: 'No AI-only tactical battle is active.' };
  }
  const leadKept = keptOrdersForSeat(current, drafts.leadDraft, lead);
  const opposingKept = keptOrdersForSeat(current, drafts.opposingDraft, opposing);
  const opposingEmbark = legalEmbarkOrders(current, drafts.opposingDraft?.embarkOrders ?? [], opposing);
  const afterOpposingEmbark = applyTacticalEmbarkPhaseOnBattle(current, opposingEmbark, opposing);
  const seed = tacticalCombatSeed({
    gameSeed: getGameSeed(),
    strategicTurnNumber: current.strategicTurnNumber,
    tacticalTurnNumber: current.tacticalTurnNumber,
    layoutSubUnits: current.subUnits,
  });
  const next = createCombatRng(seed);
  const mergedAir = [...(drafts.leadDraft?.airStrikes ?? []), ...(drafts.opposingDraft?.airStrikes ?? [])];
  const strikeUnitIds = new Set(mergedAir.map((order) => order.unitId));
  const airAndRanged = applyTacticalAirStrikeThenRangedPhaseOnBattle(
    afterOpposingEmbark,
    mergedAir,
    [...(drafts.leadDraft?.rangedAttacks ?? []), ...(drafts.opposingDraft?.rangedAttacks ?? [])],
    lead,
    next,
    'mergedHumanThenOpponent',
    [...(drafts.leadDraft?.airDropOrders ?? []), ...(drafts.opposingDraft?.airDropOrders ?? [])]
  );
  const headOn = withoutTacticalHeadOnHolderMoves({
    battle: airAndRanged.battle,
    first: { player: lead, orders: leadKept.movement },
    second: { player: opposing, orders: opposingKept.movement },
    gameSeed: getGameSeed(),
  });
  const afterLeadMove = headOn.firstOrders.length > 0
    ? projectTacticalSnapshotAfterPlayerMovementOrders(airAndRanged.battle, headOn.firstOrders, lead)
    : airAndRanged.battle;
  const afterOpposingMove = headOn.secondOrders.length > 0
    ? projectTacticalSnapshotAfterPlayerMovementOrders(afterLeadMove, headOn.secondOrders, opposing)
    : afterLeadMove;
  const leadEmbark = legalEmbarkOrders(afterOpposingMove, drafts.leadDraft?.embarkOrders ?? [], lead);
  const afterLeadEmbark = applyTacticalEmbarkPhaseOnBattle(afterOpposingMove, leadEmbark, lead);
  const afterLeadFerry = applyTacticalFerryPhaseOnBattle(
    afterLeadEmbark,
    withoutFerryForDroppedUnits(drafts.leadDraft?.ferryOrders, drafts.leadDraft?.airDropOrders, strikeUnitIds),
    lead
  );
  const afterOpposingFerry = applyTacticalFerryPhaseOnBattle(
    afterLeadFerry.battle,
    withoutFerryForDroppedUnits(drafts.opposingDraft?.ferryOrders, drafts.opposingDraft?.airDropOrders, strikeUnitIds),
    opposing,
  );
  const synced = tacticalBattleWithSyncedEmbarkCargo(afterOpposingFerry.battle);
  const melee = applyTacticalMeleeAfterSupportOrders(synced, next);
  const attackRolls = [...airAndRanged.airStrikeDiceRolls, ...airAndRanged.rangedDiceRolls];
  const activity: TacticalBeatActivity = {
    beatNumber: current.tacticalTurnNumber,
    leadShots: countAttackShots(attackRolls, lead),
    opposingShots: countAttackShots(attackRolls, opposing),
    meleeFought: melee.meleeDiceRolls.length > 0,
  };
  const quiet = isQuietBeat({
    activity,
    antiAirFired: attackRolls.some((roll) => roll.kind === 'antiAir'),
    movedCloser: anySubUnitMovedCloser({
      before: current.subUnits,
      after: melee.battle.subUnits,
      leadPartyId: lead,
      opposingPartyId: opposing,
    }),
  });
  const streak = quiet ? (current.quietBeatStreak ?? 0) + 1 : 0;
  const nextTurn = current.tacticalTurnNumber + 1;
  const wiped = getTwoPartyAnnihilationOutcome(melee.battle.subUnits, lead, opposing);
  let aiOnlyEndReason: TacticalBattleSnapshot['aiOnlyEndReason'];
  if (wiped === 'mutual') aiOnlyEndReason = 'mutual';
  else if (wiped != null) aiOnlyEndReason = 'elimination';
  else if (streak >= QUIET_BEATS_TO_END) aiOnlyEndReason = 'quiet';
  else if (drafts.leadDraft?.exitBattle === true && drafts.opposingDraft?.exitBattle === true) {
    aiOnlyEndReason = 'exit';
  } else if (aiOnlyBeatLimitReached(current.tacticalTurnNumber, readAiOnlyBeatLimit({ getOne: dbGetOne, run: dbRun }))) {
    // current.tacticalTurnNumber counts this beat. The stored number is nextTurn, one higher.
    aiOnlyEndReason = 'beat_limit';
  }
  const battle = withFortificationOwnersFromGameDb({
    ...melee.battle,
    leadPartyId: lead,
    opposingPartyId: opposing,
    quietBeatStreak: streak,
    lastBeatActivity: activity,
    tacticalTurnNumber: nextTurn,
    ...(aiOnlyEndReason != null ? { aiOnlyEndReason } : {}),
  });
  commitAiOnlyTacticalBeatSnapshot(battle);
  logDebug('applyAiOnlyTacticalBeat stored', {
    battleId: battle.battleId,
    tacticalTurnNumber: battle.tacticalTurnNumber,
    quietBeatStreak: streak,
    quiet,
    activity,
    aiOnlyEndReason: aiOnlyEndReason ?? null,
  });
  return {
    success: true,
    battle,
    battleAfterMovementBeforeFerry: afterOpposingMove,
    killsByDirectFire: airAndRanged.killsByDirectFire,
    killsByAirStrike: airAndRanged.killsByAirStrike,
    killsByReturnFire: airAndRanged.killsByReturnFire,
    removedUnits: [
      ...airAndRanged.removedUnits,
      ...afterLeadFerry.removedUnits,
      ...afterOpposingFerry.removedUnits,
    ],
    infrastructureDestroyedEvents: airAndRanged.infrastructureDestroyedEvents,
    fortificationReports: airAndRanged.fortificationReports,
    airStrikeAttemptCount: airAndRanged.airStrikeAttemptCount,
    airStrikePlaybackMoves: airAndRanged.airStrikePlaybackMoves,
    airDropPlaybackMoves: airAndRanged.airDropPlaybackMoves,
    airStrikePlaybackStrikeHexes: airAndRanged.airStrikePlaybackStrikeHexes,
    airStrikePlaybackCasualtyHexes: airAndRanged.airStrikePlaybackCasualtyHexes,
    airStrikePlaybackRemovedUnits: airAndRanged.airStrikePlaybackRemovedUnits,
    rangedResolutionShotLines: airAndRanged.rangedResolutionShotLines,
    airStrikeDiceRolls: airAndRanged.airStrikeDiceRolls,
    rangedDiceRolls: airAndRanged.rangedDiceRolls,
    meleePack: { ...melee, battle },
  };
}
