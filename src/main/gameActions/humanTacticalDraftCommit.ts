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
import { tacticalMovementUnitTypeForPathfinding } from '../../shared/tacticalTerrainMovement';
import { isDbReady, reconcileRes1InfrastructureCountsFromRes4Overrides } from '../gameDb';
import { logDebug, logError } from '../logger';
import { holdFireUnitIdsForPlayer } from '../tools/standingOrders';
import {
  applyHumanTacticalDraftBeatInStrategicOrder,
  getActiveTacticalBattleSnapshot,
  isTacticalBattleActive,
  validateHumanTacticalMarchOrders,
} from '../tacticalBattle/tacticalBattleSession';
import { projectTacticalSnapshotAfterOpponentMovementOrders } from '../tacticalBattle/tacticalMovementApply';
import { validateTacticalOpponentEmbarkOrder } from '../tacticalBattle/tacticalOpponentOrderValidation';
import { tacticalMarchFirstStopAlongPath } from '../tacticalBattle/tacticalRulesAdapter';
import { tacticalComputeMovementOrderOutcome } from '../tacticalBattle/tacticalSnapshotGuards';
import {
  resolveTacticalRangedTargetForSubUnit,
  withTacticalTempoAttacks,
} from '../tacticalBattle/tacticalRangedTargetResolve';
import { captureTurnLossNoteFromResolution } from './captureTurnLossNote';
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
 * When to use: `commitHumanTacticalDraftOrders` after resolving `preBattle` and before `applyHumanTacticalDraftBeatInStrategicOrder`.
 * Expected outcome: Returns a subset plan or `undefined` when nothing remains; each dropped row is logged at debug with reason; a single info summary when any row was dropped.
 * Exceptions: None; never throws.
 */
export function sanitizeOpponentTacticalDraftForReadyCommit(
  preBattle: TacticalBattleSnapshot,
  draft: TacticalOpponentPlanPayload | undefined
): TacticalOpponentPlanPayload | undefined {
  logDebug('gameActions sanitizeOpponentTacticalDraftForReadyCommit', {
    movementCount: draft?.movementOrders.length ?? 0,
    rangedCount: draft?.rangedAttacks.length ?? 0,
    airCount: draft?.airStrikes.length ?? 0,
    ferryCount: draft?.ferryOrders.length ?? 0,
    embarkCount: draft?.embarkOrders.length ?? 0,
  });
  if (!draft) return undefined;
  const res4Set = new Set(preBattle.res4ChildH3Indexes);
  const sub = [...preBattle.subUnits];
  const byId = new Map(sub.map((u, i) => [u.id, i] as const));
  let dropped = 0;
  const sanitizeCtx = ORDER_PLAN_SANITIZE_CONTEXT.opponentTacticalDraft;

  const movementOrders: TacticalOpponentPlanPayload['movementOrders'] = [];
  for (const o of draft.movementOrders) {
    const outcome = tacticalComputeMovementOrderOutcome({
      byId,
      sub,
      order: o,
      res4Set,
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
    let checked = validateGroupRangedTarget([r.unitId], targetH3Index, { tacticalAttackerPlayer: 'opponent' });
    if (!checked.success) {
      const retarget = resolveTacticalRangedTargetForSubUnit(preBattle, r.unitId, r.targetH3Index);
      if (retarget) {
        targetH3Index = retarget;
        checked = validateGroupRangedTarget([r.unitId], targetH3Index, { tacticalAttackerPlayer: 'opponent' });
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
      tacticalAttackerPlayer: 'opponent',
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
    const checked = validateGroupFerryTarget([f.unitId], f.destinationH3Index, { tacticalAttackerPlayer: 'opponent' });
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

  const projected =
    movementOrders.length > 0
      ? projectTacticalSnapshotAfterOpponentMovementOrders(preBattle, movementOrders)
      : preBattle;
  const embarkOrders: TacticalOpponentPlanPayload['embarkOrders'] = [];
  for (const e of draft.embarkOrders) {
    const er = validateTacticalOpponentEmbarkOrder(e, projected.subUnits);
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
  if (kept === 0) return undefined;
  return {
    movementOrders,
    rangedAttacks,
    airStrikes,
    ferryOrders,
    embarkOrders,
  };
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
    const opponentTacticalDraft = sanitizeOpponentTacticalDraftForReadyCommit(
      preBattle,
      withTacticalTempoAttacks(preBattle, args.opponentTacticalDraft, holdFireUnitIdsForPlayer('opponent'))
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
    const res4Set = new Set(preBattle.res4ChildH3Indexes);
    const terrainBattle = {
      battleId: preBattle.battleId,
      tacticalTurnNumber: preBattle.tacticalTurnNumber,
      subUnits: preBattle.subUnits,
      res4TerrainKindByH3: preBattle.res4TerrainKindByH3,
      strategicHexTerrain: preBattle.strategicHexTerrain,
      strategicHexTerrainKind: preBattle.strategicHexTerrainKind,
      ...(preBattle.res4IsSeaportByH3 ? { res4IsSeaportByH3: preBattle.res4IsSeaportByH3 } : {}),
      ...(preBattle.res4IsUrbanByH3 ? { res4IsUrbanByH3: preBattle.res4IsUrbanByH3 } : {}),
      ...(preBattle.res4IsRubbleByH3 ? { res4IsRubbleByH3: preBattle.res4IsRubbleByH3 } : {}),
      ...(preBattle.res4RoadSidesByH3 ? { res4RoadSidesByH3: preBattle.res4RoadSidesByH3 } : {}),
      ...(preBattle.res4RailSidesByH3 ? { res4RailSidesByH3: preBattle.res4RailSidesByH3 } : {}),
      ...(preBattle.weatherBonusEnabled ? { weatherBonusEnabled: true as const, weatherBonusLevel: preBattle.weatherBonusLevel, weather: preBattle.weather } : {}),
    };
    const appliedMovementOrders: { unitId: string; toH3Index: string }[] = [];
    const tacticalMarchContinuations: { subUnitId: string; destinationH3Index: string }[] = [];
    const humanMarchPlanByUnitId = new Map<
      string,
      { stopH3: string; consumedFullPath: boolean; pathH3Prefix?: string[] }
    >();
    for (const o of effectiveHumanMarches) {
      const sub = preBattle.subUnits.find((u) => u.id === o.unitId);
      if (!sub || sub.player !== 'human') continue;
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
        res4Set,
        terrainBattle,
        moveType,
        sub.weatherTags
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
      ferryOrders: args.ferryOrders,
      embarkOrders: args.embarkOrders,
      opponentTacticalDraft,
    });
    if (!beat.success) {
      logDebug('gameActions commitHumanTacticalDraftOrders rejected beat', { reason: beat.reason });
      return { success: false, reason: beat.reason };
    }
    const support = beat;
    const postMovementBattle = beat.battleAfterMovementBeforeFerry;
    if ((support.infrastructureDestroyedEvents?.length ?? 0) > 0) {
      const { changedHexCount } = reconcileRes1InfrastructureCountsFromRes4Overrides();
      logDebug('gameActions commitHumanTacticalDraftOrders reconciled res1 infrastructure after tactical strikes', {
        changedHexCount,
        eventCount: support.infrastructureDestroyedEvents.length,
      });
    }
    const meleePack = beat.meleePack;
    const finalBattle = beat.battle;
    const humanMoves: TacticalCommitResolutionPlayback['humanMoves'] = [];
    for (const o of effectiveHumanMarches) {
      const sub = preBattle.subUnits.find((u) => u.id === o.unitId);
      if (!sub || sub.player !== 'human') continue;
      const from = sub.h3Index;
      if (from === o.toH3Index) continue;
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
      if (!u || u.unitType !== 'air' || u.player !== 'human') continue;
      if (u.h3Index === f.destinationH3Index) continue;
      humanMoves.push({ unitId: f.unitId, fromH3Index: u.h3Index, toH3Index: f.destinationH3Index });
    }
    const od = opponentTacticalDraft;
    const opponentMoves: NonNullable<TacticalCommitResolutionPlayback['opponentMoves']> = [];
    if (od) {
      for (const o of od.movementOrders) {
        const su = preBattle.subUnits.find((u) => u.id === o.unitId);
        if (!su || su.player !== 'opponent') continue;
        const from = su.h3Index;
        if (from === o.toH3Index) continue;
        const after = postMovementBattle.subUnits.find((u) => u.id === o.unitId);
        const to = after?.h3Index ?? o.toH3Index;
        if (from === to) continue;
        const oppMoveType = tacticalMovementUnitTypeForPathfinding(su, o.toH3Index);
        const oppMaxEdges = effectiveTacticalMovementPointBudgetForMarchLeg(
          terrainBattle,
          su,
          preBattle.subUnits,
          oppMoveType
        );
        let pathH3Indexes: string[] | undefined;
        if (oppMaxEdges > 0) {
          const oppMarch = tacticalMarchFirstStopAlongPath(
            from,
            o.toH3Index,
            oppMaxEdges,
            res4Set,
            terrainBattle,
            oppMoveType,
            su.weatherTags
          );
          pathH3Indexes = clipTacticalMarchPathToDestination(to, oppMarch.pathH3Prefix);
        }
        opponentMoves.push({
          unitId: o.unitId,
          fromH3Index: from,
          toH3Index: to,
          ...(pathH3Indexes ? { pathH3Indexes } : {}),
        });
      }
      for (const f of od.ferryOrders) {
        const u = postMovementBattle.subUnits.find((x) => x.id === f.unitId);
        if (!u || u.unitType !== 'air' || u.player !== 'opponent') continue;
        if (u.h3Index === f.destinationH3Index) continue;
        opponentMoves.push({ unitId: f.unitId, fromH3Index: u.h3Index, toH3Index: f.destinationH3Index });
      }
    }
    const rangedRemovedUnits = support.removedUnits;
    const rangedCombatHexSet = new Set<string>();
    for (const r of explicitRanged) {
      rangedCombatHexSet.add(r.targetH3Index);
    }
    for (const r of od?.rangedAttacks ?? []) {
      rangedCombatHexSet.add(r.targetH3Index);
    }
    const rangedCombatHexes = [...rangedCombatHexSet];
    const casualtyHexSet = new Set(rangedRemovedUnits.map((v) => v.h3Index));
    const rangedCasualtyHexes = rangedCombatHexes.filter((h) => casualtyHexSet.has(h));
    const humanBeatHadSubmittedRangedOrAirOrders =
      explicitRanged.length > 0 || explicitAir.length > 0;
    const opponentBeatHadSubmittedRangedOrAirOrders =
      !!od && ((od.rangedAttacks?.length ?? 0) > 0 || (od.airStrikes?.length ?? 0) > 0);
    const tacticalResolutionPlayback: TacticalCommitResolutionPlayback = {
      humanMoves,
      ...(humanBeatHadSubmittedRangedOrAirOrders ? { humanBeatHadSubmittedRangedOrAirOrders: true } : {}),
      ...(opponentBeatHadSubmittedRangedOrAirOrders ? { opponentBeatHadSubmittedRangedOrAirOrders: true } : {}),
      opponentMoves: opponentMoves.length > 0 ? opponentMoves : undefined,
      rangedCombatHexes: rangedCombatHexes.length > 0 ? rangedCombatHexes : undefined,
      rangedCasualtyHexes: rangedCasualtyHexes.length > 0 ? rangedCasualtyHexes : undefined,
      rangedRemovedUnits: rangedRemovedUnits.length > 0 ? rangedRemovedUnits : undefined,
      rangedResolutionShotLines:
        support.rangedResolutionShotLines.length > 0 ? support.rangedResolutionShotLines : undefined,
      killsByDirectFire: support.killsByDirectFire.length > 0 ? support.killsByDirectFire : undefined,
      killsByReturnFire: support.killsByReturnFire.length > 0 ? support.killsByReturnFire : undefined,
      killsByAirStrike: support.killsByAirStrike.length > 0 ? support.killsByAirStrike : undefined,
      infrastructureDestroyedEvents:
        support.infrastructureDestroyedEvents.length > 0 ? support.infrastructureDestroyedEvents : undefined,
      airStrikeAttemptCount: support.airStrikeAttemptCount > 0 ? support.airStrikeAttemptCount : undefined,
      ...(support.airStrikePlaybackMoves.length > 0 ? { airStrikeMoves: support.airStrikePlaybackMoves } : {}),
      ...(support.airStrikePlaybackStrikeHexes.length > 0 ? { airStrikeHexes: support.airStrikePlaybackStrikeHexes } : {}),
      ...(support.airStrikePlaybackCasualtyHexes.length > 0
        ? { airStrikeCasualtyHexes: support.airStrikePlaybackCasualtyHexes }
        : {}),
      killsByMelee: meleePack.killsByMelee.length > 0 ? meleePack.killsByMelee : undefined,
      meleeCombatHexes: meleePack.meleeCombatHexes.length > 0 ? meleePack.meleeCombatHexes : undefined,
      meleeCasualtyHexes: meleePack.meleeCasualtyHexes.length > 0 ? meleePack.meleeCasualtyHexes : undefined,
      meleeRemovedUnits: meleePack.meleeRemovedUnits.length > 0 ? meleePack.meleeRemovedUnits : undefined,
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
      rangedCombatHexCount: rangedCombatHexes.length,
      airStrikePlaybackMoveCount: support.airStrikePlaybackMoves.length,
      airStrikePlaybackStrikeHexCount: support.airStrikePlaybackStrikeHexes.length,
      airStrikePlaybackCasualtyHexCount: support.airStrikePlaybackCasualtyHexes.length,
      rangedRemovedCount: rangedRemovedUnits.length,
      rangedKillEdgeCount: support.killsByDirectFire.length,
      returnFireKillEdgeCount: support.killsByReturnFire.length,
      airStrikeKillEdgeCount: support.killsByAirStrike.length,
      meleeKillEdgeCount: meleePack.killsByMelee.length,
      meleeRemovedCount: meleePack.meleeRemovedUnits.length,
      marchContinuationCount: livingMarchContinuations.length,
      shotLineCount: support.rangedResolutionShotLines.length,
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
    const tacticalRemovedById = new Map<string, (typeof rangedRemovedUnits)[number]>();
    for (const u of rangedRemovedUnits) tacticalRemovedById.set(u.id, u);
    for (const u of meleePack.meleeRemovedUnits ?? []) tacticalRemovedById.set(u.id, u);
    const tacticalRemovedAll = [...tacticalRemovedById.values()];
    const airStrikeVictimIds = new Set((support.killsByAirStrike ?? []).map((k) => k.victimId));
    const rangedVictimIds = new Set(support.killsByDirectFire.map((k) => k.victimId));
    const airStrikeRemovedUnits = tacticalRemovedAll.filter((u) => {
      if (airStrikeVictimIds.has(u.id)) return true;
      if (u.player === 'human' && u.unitType === 'air' && !rangedVictimIds.has(u.id)) return true;
      return false;
    });
    const beatNumberResolved = Math.max(1, finalBattle.tacticalTurnNumber - 1);
    captureTurnLossNoteFromResolution({
      scope: 'tactical',
      battleId: finalBattle.battleId,
      turnNumber: beatNumberResolved,
      killsByDirectFire: support.killsByDirectFire,
      killsByReturnFire: support.killsByReturnFire,
      killsByMelee: meleePack.killsByMelee,
      killsByAirStrike: support.killsByAirStrike,
      removedUnits: tacticalRemovedAll,
      airStrikeRemovedUnits,
      airStrikeMoves: support.airStrikePlaybackMoves,
    });
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
