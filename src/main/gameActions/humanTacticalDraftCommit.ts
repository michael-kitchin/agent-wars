import { HUMAN_SEAT_ID, isAiSeatId, isNeutralOwnerId, type AiSeatId, type OwnerId } from '../../shared/seatIds';
import { takeTacticalDraft } from '../openRouter/commanderPool';
import { clipTacticalMarchPathToDestination } from '../../shared/tacticalMarchPlaybackPath.js';
import { filterTacticalMarchContinuationsToPresentSubUnits } from '../../shared/tacticalMarchContinuations';
import { committedOpponentTacticalDraftFieldAfterConsume } from '../../shared/ipc/tacticalOpponentPlanMerge';
import type {
  AirStrikeOrder,
  EmbarkOrder,
  FerryOrder,
  TacticalCommitResolutionPlayback,
  TacticalOpponentPlanPayload,
} from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { effectiveTacticalMovementPointBudgetForMarchLeg } from '../../shared/tacticalTerrainCombatModifiers';
import { tacticalMarchSetForMover } from '../../shared/tacticalFortificationMovement';
import { tacticalMovementUnitTypeForPathfinding } from '../../shared/tacticalTerrainMovement';
import { isDbReady } from '../gameDb';
import { logDebug, logError } from '../logger';
import { holdFireUnitIdsForPlayer } from '../tools/standingOrders';
import {
  applyHumanTacticalDraftBeatInStrategicOrder,
  getActiveTacticalBattleSnapshot,
  isTacticalBattleActive,
  validateHumanTacticalMarchOrders,
} from '../tacticalBattle/tacticalBattleSession';
import { projectTacticalSnapshotAfterOpponentMovementOrders, projectTacticalSnapshotAfterPlayerMovementOrders } from '../tacticalBattle/tacticalMovementApply';
import { validateTacticalOpponentEmbarkOrder } from '../tacticalBattle/tacticalOpponentOrderValidation';
import { tacticalMarchFirstStopAlongPath } from '../tacticalBattle/tacticalRulesAdapter';
import { commitAiOnlyTacticalBeat } from './aiOnlyTacticalCommit';
import { opposingPartyIdOf } from '../tacticalBattle/opposingParty';
import { tacticalComputeMovementOrderOutcome, tacticalComputeMovementOrderOutcomeForPlayer } from '../tacticalBattle/tacticalSnapshotGuards';
import {
  resolveTacticalRangedTargetForSubUnit,
  withTacticalTempoAttacks,
} from '../tacticalBattle/tacticalRangedTargetResolve';
import {
  buildSeatPlaybackMoves,
  buildTacticalCombatPlaybackFields,
  captureTacticalBeatLossNote,
  reconcileInfrastructureAfterTacticalBeat,
  tacticalTerrainBattleView,
} from './tacticalBeatPlayback';
import type { SubmitOrdersResult } from './gameActionsTypes';
import {
  ORDER_PLAN_SANITIZE_CONTEXT,
  logOrderPlanSanitizeDrop,
  logOrderPlanSanitizeSummary,
} from './orderPlanSanitize';
import { applyTacticalEmbarkCommittedOrdersToStrategicDb } from './sealift';
import {
  validateGroupAirStrikeTarget,
  validateGroupFerryTarget,
  validateGroupRangedTarget,
} from './strategicOrderValidation';

/**
 * Drops opponent tactical draft rows that no longer pass footprint / strike / embark rules so Ready can complete with the remaining valid rows.
 *
 * Purpose: Buffered AI plans can go stale (e.g. ranged target hex cleared of enemies) before the human clicks Ready; failing the whole beat was too strict. No-op marches (destination equals current hex) are dropped as a belt-and-suspenders guard; the primary anti-stagger fix is clearing `committedOpponentTacticalDraft` after Ready consume so applied rows are not recycled.
 * When to use: `commitHumanTacticalDraftOrders` after resolving `preBattle` and before `applyHumanTacticalDraftBeatInStrategicOrder`. An AI-only beat passes each seat id so the lead is not checked as the opposing party.
 * Expected outcome: Returns a subset plan or `undefined` when nothing remains; each dropped row is logged at debug with reason; a single info summary when any row was dropped. A reply that only sets `exitBattle` is kept.
 * Exceptions: None; never throws.
 */
export function sanitizeOpponentTacticalDraftForReadyCommit(
  preBattle: TacticalBattleSnapshot,
  draft: TacticalOpponentPlanPayload | undefined,
  player?: OwnerId,
): TacticalOpponentPlanPayload | undefined {
  logDebug('gameActions sanitizeOpponentTacticalDraftForReadyCommit', {
    player: player ?? null,
    movementCount: draft?.movementOrders.length ?? 0,
    rangedCount: draft?.rangedAttacks.length ?? 0,
    airCount: draft?.airStrikes.length ?? 0,
    ferryCount: draft?.ferryOrders.length ?? 0,
    embarkCount: draft?.embarkOrders.length ?? 0,
    exitBattle: draft?.exitBattle === true,
  });
  if (!draft) return undefined;
  const party = player ?? opposingPartyIdOf(preBattle);
  const tacticalSet = new Set(preBattle.tacticalChildH3Indexes);
  const sub = [...preBattle.subUnits];
  const byId = new Map(sub.map((u, i) => [u.id, i] as const));
  let dropped = 0;
  const sanitizeCtx = ORDER_PLAN_SANITIZE_CONTEXT.opponentTacticalDraft;

  const movementOrders: TacticalOpponentPlanPayload['movementOrders'] = [];
  for (const o of draft.movementOrders) {
    const outcome = player != null
      ? tacticalComputeMovementOrderOutcomeForPlayer(player, {
        byId,
        sub,
        order: o,
        tacticalSet,
        battle: preBattle,
      })
      : tacticalComputeMovementOrderOutcome({
        byId,
        sub,
        order: o,
        tacticalSet,
        battle: preBattle,
      });
    if (!outcome.ok) {
      dropped += 1;
      logOrderPlanSanitizeDrop(sanitizeCtx, 'march', {
        unitId: o.unitId,
        toH3Index: o.toH3Index,
        reason: outcome.reason,
      });
      continue;
    }
    if (outcome.appliedToH3Index === sub[outcome.idx]!.h3Index) {
      dropped += 1;
      logOrderPlanSanitizeDrop(sanitizeCtx, 'march', {
        unitId: o.unitId,
        toH3Index: o.toH3Index,
        reason: 'already_at_destination',
      });
      continue;
    }
    movementOrders.push(o);
  }

  const rangedAttacks: TacticalOpponentPlanPayload['rangedAttacks'] = [];
  for (const r of draft.rangedAttacks) {
    let targetH3Index = r.targetH3Index;
    let checked = validateGroupRangedTarget([r.unitId], targetH3Index, { tacticalAttackerPlayer: party });
    if (!checked.success) {
      const retarget = resolveTacticalRangedTargetForSubUnit(preBattle, r.unitId, r.targetH3Index);
      if (retarget) {
        targetH3Index = retarget;
        checked = validateGroupRangedTarget([r.unitId], targetH3Index, { tacticalAttackerPlayer: party });
        if (checked.success) {
          logDebug('gameActions sanitizeOpponentTacticalDraftForReadyCommit: retargeted ranged', {
            unitId: r.unitId,
            fromTargetH3Index: r.targetH3Index,
            toTargetH3Index: targetH3Index,
          });
        }
      }
    }
    if (!checked.success) {
      dropped += 1;
      logOrderPlanSanitizeDrop(sanitizeCtx, 'ranged', {
        unitId: r.unitId,
        targetH3Index: r.targetH3Index,
        reason: checked.reason,
      });
      continue;
    }
    rangedAttacks.push({ unitId: r.unitId, targetH3Index });
  }

  const airStrikes: TacticalOpponentPlanPayload['airStrikes'] = [];
  for (const a of draft.airStrikes) {
    const checked = validateGroupAirStrikeTarget([a.unitId], a.targetH3Index, a.targetType, {
      tacticalAttackerPlayer: party,
    });
    if (!checked.success) {
      dropped += 1;
      logOrderPlanSanitizeDrop(sanitizeCtx, 'airStrike', {
        unitId: a.unitId,
        targetH3Index: a.targetH3Index,
        targetType: a.targetType,
        reason: checked.reason,
      });
      continue;
    }
    airStrikes.push(a);
  }

  const strikeUnitIds = new Set(airStrikes.map((a) => a.unitId));
  const ferryOrders: TacticalOpponentPlanPayload['ferryOrders'] = [];
  for (const f of draft.ferryOrders) {
    if (strikeUnitIds.has(f.unitId)) {
      dropped += 1;
      logOrderPlanSanitizeDrop(sanitizeCtx, 'ferry', {
        unitId: f.unitId,
        reason: 'strike_same_unit',
      });
      continue;
    }
    const checked = validateGroupFerryTarget([f.unitId], f.destinationH3Index, { tacticalAttackerPlayer: party });
    if (!checked.success) {
      dropped += 1;
      logOrderPlanSanitizeDrop(sanitizeCtx, 'ferry', {
        unitId: f.unitId,
        destinationH3Index: f.destinationH3Index,
        reason: checked.reason,
      });
      continue;
    }
    ferryOrders.push(f);
  }

  const projected = movementOrders.length === 0
    ? preBattle
    : player != null
      ? projectTacticalSnapshotAfterPlayerMovementOrders(preBattle, movementOrders, player)
      : projectTacticalSnapshotAfterOpponentMovementOrders(preBattle, movementOrders);
  const embarkOrders: TacticalOpponentPlanPayload['embarkOrders'] = [];
  for (const e of draft.embarkOrders) {
    const er = validateTacticalOpponentEmbarkOrder(e, projected.subUnits, preBattle.enclosingStrategicH3Index);
    if (!er.valid) {
      dropped += 1;
      logOrderPlanSanitizeDrop(sanitizeCtx, 'embark', {
        unitId: e.unitId,
        reason: er.reason,
      });
      continue;
    }
    embarkOrders.push(e);
  }

  const kept =
    movementOrders.length +
    rangedAttacks.length +
    airStrikes.length +
    ferryOrders.length +
    embarkOrders.length;
  if (dropped > 0) {
    logOrderPlanSanitizeSummary(sanitizeCtx, dropped, {
      keptTotal: kept,
      movements: movementOrders.length,
      ranged: rangedAttacks.length,
      airStrikes: airStrikes.length,
      ferry: ferryOrders.length,
      embark: embarkOrders.length,
    });
  }
  const exitBattle = draft.exitBattle === true;
  if (kept === 0 && !exitBattle) return undefined;
  return {
    movementOrders,
    rangedAttacks,
    airStrikes,
    ferryOrders,
    embarkOrders,
    ...(exitBattle ? { exitBattle: true } : {}),
  };
}

/**
 * Takes one AI seat's tactical draft and keeps only the rows that seat can still apply.
 *
 * Purpose: An AI-only beat has two drafts. Each one is checked as that seat, including a reply that only asks to leave.
 * When to use: Immediately before `applyAiOnlyTacticalBeat`.
 * Expected outcome: The sanitized plan, or undefined when the seat had nothing legal and did not set `exitBattle`.
 * Exceptions: None.
 */
function sanitizedAiSeatDraft(
  preBattle: TacticalBattleSnapshot,
  seatId: AiSeatId,
): TacticalOpponentPlanPayload | undefined {
  logDebug('gameActions sanitizedAiSeatDraft', { seatId, battleId: preBattle.battleId });
  const taken = takeTacticalDraft(seatId, preBattle.battleId) ?? undefined;
  return sanitizeOpponentTacticalDraftForReadyCommit(
    preBattle,
    withTacticalTempoAttacks(preBattle, taken, holdFireUnitIdsForPlayer(seatId), seatId),
    seatId,
  );
}

/**
 * Commits queued human tactical draft orders from the renderer into the active tactical snapshot.
 *
 * Purpose: Tactical parity with strategic Ready by applying all tactical draft types in one commit boundary.
 * When to use: `game:commitHumanTacticalDraftOrders` IPC with renderer draft lists at tactical Ready time.
 * Expected outcome: `success: true` with `tacticalBattle` snapshot for immediate redraw, or failure with reason. Human marches apply at most one range-limited leg per commit; any remaining distance returns as `tacticalMarchContinuations` for living sub-units only (combat removals in the same beat are omitted). Successful commits with `embarkOrders` also persist parent-level sealift rows in SQLite (same boundary as strategic Ready embark).
 * Exceptions: Caught and logged at error; returns `success: false` with stringified message.
 */
export function commitHumanTacticalDraftOrders(args: {
  movementOrders: readonly { unitId: string; toH3Index: string }[];
  rangedAttacks?: readonly { unitId: string; targetH3Index: string }[];
  airStrikes?: readonly AirStrikeOrder[];
  airDropOrders?: readonly import('../../shared/ipc/airDropTypes').AirDropOrder[];
  ferryOrders?: readonly FerryOrder[];
  embarkOrders?: readonly EmbarkOrder[];
  opponentTacticalDraft?: TacticalOpponentPlanPayload;
}): SubmitOrdersResult {
  logDebug('gameActions commitHumanTacticalDraftOrders', {
    movementCount: args.movementOrders.length,
    rangedCount: args.rangedAttacks?.length ?? 0,
    airCount: args.airStrikes?.length ?? 0,
    ferryCount: args.ferryOrders?.length ?? 0,
    embarkCount: args.embarkOrders?.length ?? 0,
    opponentMovementCount: args.opponentTacticalDraft?.movementOrders.length ?? 0,
    opponentRangedCount: args.opponentTacticalDraft?.rangedAttacks.length ?? 0,
  });
  try {
    if (!isDbReady()) return { success: false, reason: 'Database not initialized' };
    if (!isTacticalBattleActive()) return { success: false, reason: 'No tactical battle is active.' };
    for (const r of args.rangedAttacks ?? []) {
      const checked = validateGroupRangedTarget([r.unitId], r.targetH3Index);
      if (!checked.success) return checked;
    }
    for (const a of args.airStrikes ?? []) {
      const checked = validateGroupAirStrikeTarget([a.unitId], a.targetH3Index, a.targetType);
      if (!checked.success) return checked;
    }
    for (const f of args.ferryOrders ?? []) {
      const checked = validateGroupFerryTarget([f.unitId], f.destinationH3Index);
      if (!checked.success) return checked;
    }
    const preBattle = getActiveTacticalBattleSnapshot();
    if (!preBattle) {
      return { success: false, reason: 'No tactical battle is active.' };
    }
    if (preBattle.leadPartyId != null && isAiSeatId(preBattle.leadPartyId) && preBattle.opposingPartyId != null && isAiSeatId(preBattle.opposingPartyId)) {
      const leadDraft = sanitizedAiSeatDraft(preBattle, preBattle.leadPartyId);
      const opposingDraft = sanitizedAiSeatDraft(preBattle, preBattle.opposingPartyId);
      return commitAiOnlyTacticalBeat({ preBattle, leadDraft, opposingDraft });
    }
    const party = opposingPartyIdOf(preBattle);
    const pooledDraft = isAiSeatId(party) ? takeTacticalDraft(party, preBattle.battleId) : null;
    const suppliedDraft = isNeutralOwnerId(party) ? undefined : (args.opponentTacticalDraft ?? pooledDraft ?? undefined);
    const opponentTacticalDraft = sanitizeOpponentTacticalDraftForReadyCommit(
      preBattle,
      withTacticalTempoAttacks(preBattle, suppliedDraft, holdFireUnitIdsForPlayer(party), party)
    );
    // The human's own slice stays explicit: strategic standing orders neither move nor fire their pawns in tactical.
    const effectiveHumanMarches = [...args.movementOrders];
    logDebug('gameActions commitHumanTacticalDraftOrders explicit marches only', {
      explicitMarchCount: effectiveHumanMarches.length,
    });
    const mergedMarchCheck = validateHumanTacticalMarchOrders(effectiveHumanMarches);
    if (!mergedMarchCheck.success) {
      logDebug('gameActions commitHumanTacticalDraftOrders rejected marches', { reason: mergedMarchCheck.reason });
      return mergedMarchCheck;
    }
    const explicitRanged = [...(args.rangedAttacks ?? [])];
    const explicitAir = [...(args.airStrikes ?? [])];
    logDebug('gameActions commitHumanTacticalDraftOrders explicit fire orders', {
      explicitRangedCount: explicitRanged.length,
      explicitAirCount: explicitAir.length,
    });
    const terrainBattle = tacticalTerrainBattleView(preBattle);
    const appliedMovementOrders: { unitId: string; toH3Index: string }[] = [];
    const tacticalMarchContinuations: { subUnitId: string; destinationH3Index: string }[] = [];
    const humanMarchPlanByUnitId = new Map<
      string,
      { stopH3: string; consumedFullPath: boolean; pathH3Prefix?: string[] }
    >();
    for (const o of effectiveHumanMarches) {
      const sub = preBattle.subUnits.find((u) => u.id === o.unitId);
      if (!sub || sub.player !== HUMAN_SEAT_ID) continue;
      const from = sub.h3Index;
      if (from === o.toH3Index) continue;
      const moveType = tacticalMovementUnitTypeForPathfinding(sub, o.toH3Index);
      const maxEdges = effectiveTacticalMovementPointBudgetForMarchLeg(terrainBattle, sub, preBattle.subUnits, moveType);
      if (maxEdges <= 0) {
        appliedMovementOrders.push({ unitId: o.unitId, toH3Index: o.toH3Index });
        continue;
      }
      const marchPlan = tacticalMarchFirstStopAlongPath(
        from,
        o.toH3Index,
        maxEdges,
        tacticalMarchSetForMover({ battle: preBattle, moverPlayer: sub.player, originH3: from }),
        terrainBattle,
        moveType,
        sub
      );
      humanMarchPlanByUnitId.set(o.unitId, marchPlan);
      const { stopH3, consumedFullPath } = marchPlan;
      if (stopH3 !== from) {
        appliedMovementOrders.push({ unitId: o.unitId, toH3Index: stopH3 });
      }
      if (!consumedFullPath && o.toH3Index !== stopH3) {
        tacticalMarchContinuations.push({ subUnitId: o.unitId, destinationH3Index: o.toH3Index });
      }
    }
    const beat = applyHumanTacticalDraftBeatInStrategicOrder({
      movementOrders: appliedMovementOrders,
      rangedAttacks: explicitRanged,
      airStrikes: explicitAir,
      airDropOrders: args.airDropOrders,
      ferryOrders: args.ferryOrders,
      embarkOrders: args.embarkOrders,
      opponentTacticalDraft,
    });
    if (!beat.success) {
      logDebug('gameActions commitHumanTacticalDraftOrders rejected beat', { reason: beat.reason });
      return { success: false, reason: beat.reason };
    }
    reconcileInfrastructureAfterTacticalBeat(
      beat,
      'gameActions commitHumanTacticalDraftOrders reconciled res1 infrastructure after tactical strikes'
    );
    const postMovementBattle = beat.battleAfterMovementBeforeFerry;
    const finalBattle = beat.battle;
    const humanMoves: TacticalCommitResolutionPlayback['humanMoves'] = [];
    for (const o of effectiveHumanMarches) {
      const sub = preBattle.subUnits.find((u) => u.id === o.unitId);
      if (!sub || sub.player !== HUMAN_SEAT_ID) continue;
      const from = sub.h3Index;
      if (from === o.toH3Index) continue;
      if (postMovementBattle.subUnits.find((u) => u.id === o.unitId)?.h3Index === from) continue;
      const moveType = tacticalMovementUnitTypeForPathfinding(sub, o.toH3Index);
      const maxEdges = effectiveTacticalMovementPointBudgetForMarchLeg(terrainBattle, sub, preBattle.subUnits, moveType);
      if (maxEdges <= 0) {
        humanMoves.push({ unitId: o.unitId, fromH3Index: from, toH3Index: o.toH3Index });
        continue;
      }
      const marchPlan = humanMarchPlanByUnitId.get(o.unitId);
      if (!marchPlan) continue;
      const { stopH3, pathH3Prefix } = marchPlan;
      if (stopH3 === from) continue;
      const pathForPlayback = clipTacticalMarchPathToDestination(stopH3, pathH3Prefix);
      humanMoves.push({
        unitId: o.unitId,
        fromH3Index: from,
        toH3Index: stopH3,
        ...(pathForPlayback ? { pathH3Indexes: pathForPlayback } : {}),
      });
    }
    for (const f of args.ferryOrders ?? []) {
      const u = postMovementBattle.subUnits.find((x) => x.id === f.unitId);
      if (!u || u.unitType !== 'air' || u.player !== HUMAN_SEAT_ID) continue;
      if (u.h3Index === f.destinationH3Index) continue;
      humanMoves.push({ unitId: f.unitId, fromH3Index: u.h3Index, toH3Index: f.destinationH3Index });
    }
    const od = opponentTacticalDraft;
    const opponentMoves = od
      ? buildSeatPlaybackMoves({
        preBattle,
        postMovementBattle,
        terrainBattle,
        movementOrders: od.movementOrders,
        ferryOrders: od.ferryOrders,
        isMover: (player) => player !== HUMAN_SEAT_ID,
      })
      : [];
    const humanBeatHadSubmittedRangedOrAirOrders = explicitRanged.length > 0 || explicitAir.length > 0;
    const opponentBeatHadSubmittedRangedOrAirOrders =
      !!od && ((od.rangedAttacks?.length ?? 0) > 0 || (od.airStrikes?.length ?? 0) > 0);
    const tacticalResolutionPlayback: TacticalCommitResolutionPlayback = {
      humanMoves,
      ...(humanBeatHadSubmittedRangedOrAirOrders ? { humanBeatHadSubmittedRangedOrAirOrders: true } : {}),
      ...(opponentBeatHadSubmittedRangedOrAirOrders ? { opponentBeatHadSubmittedRangedOrAirOrders: true } : {}),
      opponentMoves: opponentMoves.length > 0 ? opponentMoves : undefined,
      ...buildTacticalCombatPlaybackFields(beat, [
        ...explicitRanged.map((row) => row.targetH3Index),
        ...(od?.rangedAttacks ?? []).map((row) => row.targetH3Index),
      ]),
    };
    const livingSubUnitIds = new Set(finalBattle.subUnits.map((u) => u.id));
    const livingMarchContinuations = filterTacticalMarchContinuationsToPresentSubUnits(
      tacticalMarchContinuations,
      livingSubUnitIds
    );
    if (livingMarchContinuations.length !== tacticalMarchContinuations.length) {
      logDebug('gameActions commitHumanTacticalDraftOrders dropped march continuations for removed sub-units', {
        beforeCount: tacticalMarchContinuations.length,
        afterCount: livingMarchContinuations.length,
        droppedSubUnitIds: tacticalMarchContinuations
          .filter((row) => !livingSubUnitIds.has(row.subUnitId))
          .map((row) => row.subUnitId),
      });
    }
    logDebug('gameActions commitHumanTacticalDraftOrders playback', {
      humanMoveCount: humanMoves.length,
      opponentMoveCount: opponentMoves.length,
      rangedCombatHexCount: tacticalResolutionPlayback.rangedCombatHexes?.length ?? 0,
      airStrikePlaybackMoveCount: beat.airStrikePlaybackMoves.length,
      airStrikePlaybackStrikeHexCount: beat.airStrikePlaybackStrikeHexes.length,
      airStrikePlaybackCasualtyHexCount: beat.airStrikePlaybackCasualtyHexes.length,
      airStrikePlaybackRemovedCount: beat.airStrikePlaybackRemovedUnits.length,
      rangedRemovedCount: beat.removedUnits.length,
      rangedKillEdgeCount: beat.killsByDirectFire.length,
      returnFireKillEdgeCount: beat.killsByReturnFire.length,
      airStrikeKillEdgeCount: beat.killsByAirStrike.length,
      meleeKillEdgeCount: beat.meleePack.killsByMelee.length,
      meleeRemovedCount: beat.meleePack.meleeRemovedUnits.length,
      marchContinuationCount: livingMarchContinuations.length,
      shotLineCount: beat.rangedResolutionShotLines.length,
      airStrikeDiceRollCount: beat.airStrikeDiceRolls.length,
      rangedDiceRollCount: beat.rangedDiceRolls.length,
      meleeDiceRollCount: beat.meleePack.meleeDiceRolls.length,
    });
    /**
     * Persists human tactical embark onto strategic `unit_transport_assignments` after the beat succeeded.
     *
     * Purpose: Keeps Ready-time tactical embark aligned with strategic sealift persistence (cancel movement is handled in the renderer draft layer).
     * When to use: Only here, immediately before returning success, when `embarkOrders` were part of this commit.
     * Expected outcome: Parent ids resolved from `finalBattle.subUnits`; rows inserted or skipped per `applyTacticalEmbarkCommittedOrdersToStrategicDb` rules.
     * Exceptions: None; the helper logs and skips invalid rows without throwing.
     */
    if ((args.embarkOrders?.length ?? 0) > 0) {
      applyTacticalEmbarkCommittedOrdersToStrategicDb(args.embarkOrders!, (subId) => {
        const row = finalBattle.subUnits.find((u) => u.id === subId);
        return row?.parentUnitId ?? null;
      });
    }
    captureTacticalBeatLossNote(beat);
    return {
      success: true,
      tacticalBattle: finalBattle,
      tacticalResolutionPlayback,
      tacticalMarchContinuations:
        livingMarchContinuations.length > 0 ? livingMarchContinuations : undefined,
      ...committedOpponentTacticalDraftFieldAfterConsume(Boolean(args.opponentTacticalDraft)),
    };
  } catch (err) {
    logError('commitHumanTacticalDraftOrders: exception', err);
    return { success: false, reason: String(err) };
  }
}
