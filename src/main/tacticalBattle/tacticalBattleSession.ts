import type {
  StartTacticalBattleIpcResult,
  TacticalBattleSnapshot,
} from '../../shared/tacticalBattleTypes';
import type { AirStrikeAnimationMove, AirStrikeOrder, EmbarkOrder, FerryOrder } from '../../shared/ipcTypes';
import type { CombatDiceRoll } from '../../shared/ipc/combatDiceTypes';
import type { KillEdge } from '../../shared/ipc/combatResultTypes';
import type { TacticalOpponentPlanPayload } from '../../shared/ipc/consultationPushTypes';
import type { InfrastructureDestroyedEvent, RemovedUnitSnapshot } from '../../shared/ipc/readyTypes';
import type { RangedResolutionShotLine } from '../../shared/rangedResolutionShotLines';
import { tacticalBoundaryConcurrentSessionAllowed } from '../../shared/tacticalStateAssertions';
import { createCombatRng } from '../combatResolution';
import { getGameSeed, clearTacticalTurnNotes } from '../gameDb';
import { getActiveTacticalBattleSnapshotRef, setActiveTacticalBattleSnapshotRef } from './activeTacticalBattleRef';
import {
  clearTacticalBattleSnapshotFromGameConfig,
  loadPersistedTacticalBattleSnapshotIfConsistent,
  writeTacticalBattleSnapshotToGameConfig,
} from './tacticalBattlePersistence';
import { computeTacticalBattleSnapshot, tacticalSubUnitCountForStrategicUnitType } from './computeTacticalBattleSnapshot';
import {
  projectTacticalSnapshotAfterValidatedHumanSupportOrders,
  projectTacticalSnapshotAfterValidatedOpponentOrders,
} from './tacticalCompositeOrdersApply';
import { applyTacticalMeleeAfterSupportOrders, tacticalSubUnitLayoutSeed32 } from './tacticalMeleeApply';
import {
  projectTacticalSnapshotAfterHumanMovementOrders,
  projectTacticalSnapshotAfterOpponentMovementOrders,
} from './tacticalMovementApply';
import {
  applyTacticalAirStrikeThenRangedPhaseOnBattle,
  applyTacticalEmbarkPhaseOnBattle,
  applyTacticalFerryPhaseOnBattle,
  tacticalBattleWithSyncedEmbarkCargo,
} from './tacticalStrategicOrderPhases';
import type { TacticalMovementBlockReason } from './tacticalSnapshotGuards';
import { tacticalComputeHumanMovementOrderOutcome, tacticalComputeMovementOrderOutcome } from './tacticalSnapshotGuards';
import { applyTacticalEmbarkCommittedOrdersToStrategicDb, deleteStrategicParentUnitAndApplyTransportOutcome } from '../gameActions/sealift';
import { tacticalLogError, tacticalLogMutate, tacticalLogQuery } from './tacticalLogging';
import { validateTacticalHumanEmbarkOrder } from './tacticalOpponentOrderValidation';
import {
  captureTacticalTransportBaselineForParentUnitIds,
  restoreTacticalTransportBaselineForParentUnitIds,
  tacticalTransportBaselineConfigExists,
} from './tacticalTransportBaseline';
import { TacticalEmbarkValidationRejected } from './tacticalValidationResult';
import {
  stashOpponentCallbackSubscriptionsForTacticalBattle,
  restoreOpponentCallbackSubscriptionsAfterTacticalBattle,
  hydrateOpponentCallbackStashFromGameConfig,
} from '../openRouter/tacticalCallbackSubscriptionLifecycle';

/**
 * Returns a user-facing validation error when any opponent tactical march order is illegal on the current snapshot, or null when all pass.
 *
 * Purpose: Mirrors `humanTacticalMarchValidationFailure` for opponent sub-units so Ready commits reject stale or tampered buffered AI marches before combat phases run.
 * When to use: `applyHumanTacticalDraftBeatInStrategicOrder` when `opponentTacticalDraft` includes movement rows.
 * Expected outcome: First failure reason wins; empty `orders` yields null.
 * Exceptions: None.
 */
function opponentTacticalMarchValidationFailure(
  cur: TacticalBattleSnapshot,
  orders: readonly { unitId: string; toH3Index: string }[]
): string | null {
  if (orders.length === 0) return null;
  const tacticalSet = new Set(cur.tacticalChildH3Indexes);
  const sub = [...cur.subUnits];
  const byId = new Map(sub.map((u, i) => [u.id, i] as const));
  for (const o of orders) {
    const outcome = tacticalComputeMovementOrderOutcome({ byId, sub, order: o, tacticalSet, battle: cur });
    if (!outcome.ok) {
      tacticalLogQuery('opponentTacticalMarchValidationFailure', {
        reason: outcome.reason,
        ...outcome.context,
        unitId: o.unitId,
        toH3Index: o.toH3Index,
      });
      return humanTacticalMarchBlockMessage(outcome.reason);
    }
  }
  return null;
}

/**
 * Writes the active tactical snapshot to memory and SQLite, or clears both when ending a session.
 *
 * Purpose: Keeps durable persistence aligned with every tactical session mutation in one place.
 * When to use: After successful start/apply/advance and when tearing the session down.
 * Expected outcome: `getActiveTacticalBattleSnapshot` matches disk until the next commit.
 * Exceptions: Persistence helpers log internally; this function does not throw.
 */
function commitActiveTacticalBattle(snapshot: TacticalBattleSnapshot | null): void {
  tacticalLogMutate('commitActiveTacticalBattle', { hasBattle: !!snapshot });
  setActiveTacticalBattleSnapshotRef(snapshot);
  if (snapshot) writeTacticalBattleSnapshotToGameConfig(snapshot);
  else clearTacticalBattleSnapshotFromGameConfig();
}

/**
 * Resolves one parent's tactical baseline count for human voluntary bailout threshold checks.
 *
 * Purpose: Keeps bailout elimination deterministic across new snapshots (captured placed counts) and legacy snapshots (theoretical fallback).
 * When to use: `applyHumanVoluntaryBailoutStrategicParentElimination` per surviving parent id.
 * Expected outcome: Positive baseline for known unit types; zero only when unit type is unknown.
 * Exceptions: None.
 */
function tacticalBaselineCountForParentOnHumanVoluntaryBailout(
  snapshot: TacticalBattleSnapshot,
  parentUnitId: string,
  tacticalUnitType: string
): number {
  const mappedBaseline = snapshot.initialPlacedSubUnitCountByParentId?.[parentUnitId];
  if (typeof mappedBaseline === 'number' && mappedBaseline > 0) {
    tacticalLogQuery('tacticalBaselineCountForParentOnHumanVoluntaryBailout mapped', {
      battleId: snapshot.battleId,
      parentUnitId,
      mappedBaseline,
    });
    return mappedBaseline;
  }
  const fallback = tacticalSubUnitCountForStrategicUnitType(tacticalUnitType);
  tacticalLogMutate('tacticalBaselineCountForParentOnHumanVoluntaryBailout fallback theoretical', {
    battleId: snapshot.battleId,
    parentUnitId,
    tacticalUnitType,
    fallback,
  });
  return fallback;
}

/**
 * Applies strategic-parent elimination for human voluntary tactical bailout using strict-less-than-half survival threshold.
 *
 * Purpose: Ensures tactical bailout outcomes remove weakened strategic parents before automatic strategic continuation.
 * When to use: Human voluntary exit path only, after transport baseline restoration and before active tactical snapshot clear.
 * Expected outcome: Deletes strategic parents where `survivors * 2 < baseline`.
 * Exceptions: None; caller handles and logs unexpected failures.
 */
function applyHumanVoluntaryBailoutStrategicParentElimination(snapshot: TacticalBattleSnapshot): void {
  const hasHuman = snapshot.subUnits.some((u) => u.player === 'human');
  const hasOpponent = snapshot.subUnits.some((u) => u.player === 'opponent');
  if (!hasHuman || !hasOpponent) {
    tacticalLogMutate('applyHumanVoluntaryBailoutStrategicParentElimination skipped annihilation-state roster', {
      battleId: snapshot.battleId,
      hasHuman,
      hasOpponent,
      subUnitCount: snapshot.subUnits.length,
    });
    return;
  }
  const survivorsByParent = new Map<string, { survivors: number; unitType: string }>();
  for (const sub of snapshot.subUnits) {
    const prior = survivorsByParent.get(sub.parentUnitId);
    if (!prior) {
      survivorsByParent.set(sub.parentUnitId, { survivors: 1, unitType: sub.unitType });
      continue;
    }
    survivorsByParent.set(sub.parentUnitId, { ...prior, survivors: prior.survivors + 1 });
  }
  const eliminatedParentIds: string[] = [];
  for (const [parentUnitId, parentState] of survivorsByParent) {
    const baseline = tacticalBaselineCountForParentOnHumanVoluntaryBailout(snapshot, parentUnitId, parentState.unitType);
    if (baseline <= 0) {
      tacticalLogMutate('applyHumanVoluntaryBailoutStrategicParentElimination skipped unknown baseline', {
        battleId: snapshot.battleId,
        parentUnitId,
        unitType: parentState.unitType,
      });
      continue;
    }
    if (parentState.survivors * 2 >= baseline) continue;
    deleteStrategicParentUnitAndApplyTransportOutcome(parentUnitId);
    eliminatedParentIds.push(parentUnitId);
  }
  tacticalLogMutate('applyHumanVoluntaryBailoutStrategicParentElimination complete', {
    battleId: snapshot.battleId,
    parentCount: survivorsByParent.size,
    eliminatedParentCount: eliminatedParentIds.length,
    eliminatedParentIds,
  });
}

/**
 * Ends tactical session state and optionally applies human-voluntary bailout elimination before snapshot clear.
 *
 * Purpose: Centralizes teardown ordering so transport restoration and optional bailout elimination remain consistent.
 * When to use: Called by both `endTacticalBattleSession` and `endTacticalBattleSessionForHumanVoluntaryExitBailout`.
 * Expected outcome: Tactical session snapshot clears in both modes; voluntary mode may additionally delete strategic parent units.
 * Exceptions: Bailout elimination errors are logged and suppressed so teardown always completes.
 */
function endTacticalBattleSessionCore(applyHumanVoluntaryBailoutResolution: boolean): void {
  tacticalLogMutate('endTacticalBattleSessionCore', {
    hadBattle: !!getActiveTacticalBattleSnapshotRef(),
    applyHumanVoluntaryBailoutResolution,
  });
  const snap = getActiveTacticalBattleSnapshotRef();
  const parentIds = snap ? [...new Set(snap.subUnits.map((u) => u.parentUnitId))] : null;
  restoreTacticalTransportBaselineForParentUnitIds(parentIds);
  if (snap && applyHumanVoluntaryBailoutResolution) {
    try {
      applyHumanVoluntaryBailoutStrategicParentElimination(snap);
    } catch (err) {
      tacticalLogError('endTacticalBattleSessionCore bailout elimination failed', {
        battleId: snap.battleId,
        err,
      });
    }
  }
  restoreOpponentCallbackSubscriptionsAfterTacticalBattle();
  commitActiveTacticalBattle(null);
}

/**
 * Returns whether a tactical battle session is currently active in the main process.
 *
 * Contract: True iff `startTacticalBattleForEnclosingStrategicHex` succeeded and `endTacticalBattleSession` has not cleared state.
 * When to use: IPC guards, strategic `ready()` gating, and any code that must not mutate strategic turn flow while tactical is open.
 * Expected outcome: Inexpensive boolean; does not allocate.
 * Exceptions: None.
 */
export function isTacticalBattleActive(): boolean {
  tacticalLogQuery('isTacticalBattleActive', { active: !!getActiveTacticalBattleSnapshotRef() });
  return getActiveTacticalBattleSnapshotRef() !== null;
}

/**
 * Returns the active tactical battle snapshot for IPC/debug, or null when none.
 *
 * Contract: Returns the same object reference held by the session until a successful mutating session call replaces it.
 * When to use: `handleRequestAiOrders` tactical branch and diagnostics; not for renderer truth (renderer uses IPC snapshots).
 * Expected outcome: Deep snapshot suitable for JSON IPC when non-null.
 * Exceptions: None.
 */
export function getActiveTacticalBattleSnapshot(): TacticalBattleSnapshot | null {
  const s = getActiveTacticalBattleSnapshotRef();
  tacticalLogQuery('getActiveTacticalBattleSnapshot', { hasBattle: !!s });
  return s;
}

/**
 * Starts a tactical battle for the given contested strategic hex; fails if another battle is already active.
 *
 * Contract: On success, installs `activeTacticalBattle` from `computeTacticalBattleSnapshot`; on failure, leaves prior session unchanged (usually none).
 * When to use: Renderer `startTacticalBattle` IPC after entry button click with validated strategic id.
 * Expected outcome: `success: true` with `battle` and optional `skippedParentDisplayNames`; or `success: false` with human-readable `reason`.
 * Exceptions: Unexpected errors are caught, logged at error, and returned as `success: false` (no throw).
 */
export function startTacticalBattleForEnclosingHex(enclosingStrategicH3Index: string): StartTacticalBattleIpcResult {
  tacticalLogMutate('startTacticalBattleForEnclosingHex', { enclosingStrategicH3Index });
  try {
    const concurrent = tacticalBoundaryConcurrentSessionAllowed(getActiveTacticalBattleSnapshotRef() !== null);
    if (!concurrent.ok) {
      return { success: false, reason: 'A tactical battle is already in progress.' };
    }
    const battleId = `tb-${enclosingStrategicH3Index}-${Date.now()}`;
    const { snapshot, skippedParentDisplayNames, failureReason } = computeTacticalBattleSnapshot(
      enclosingStrategicH3Index,
      battleId
    );
    if (!snapshot) {
      return { success: false, reason: failureReason ?? 'Could not start tactical battle.' };
    }
    commitActiveTacticalBattle(snapshot);
    clearTacticalTurnNotes();
    captureTacticalTransportBaselineForParentUnitIds([...new Set(snapshot.subUnits.map((u) => u.parentUnitId))]);
    stashOpponentCallbackSubscriptionsForTacticalBattle();
    if (skippedParentDisplayNames.length > 0) {
      tacticalLogMutate('startTacticalBattleForEnclosingRes1Hex skipped parents', { skippedParentDisplayNames });
    }
    return {
      success: true,
      battle: snapshot,
      skippedParentDisplayNames: skippedParentDisplayNames.length > 0 ? skippedParentDisplayNames : undefined,
    };
  } catch (err) {
    tacticalLogError('startTacticalBattleForEnclosingRes1Hex failed', { enclosingStrategicH3Index, err });
    return { success: false, reason: 'Could not start tactical battle.' };
  }
}

/**
 * Clears the active tactical battle session without applying tactical combat outcomes to strategic units.
 *
 * Contract: Idempotent; restores `unit_transport_assignments` for parents in the battle from the captured tactical baseline, then sets `activeTacticalBattle` to null and clears tactical `game_config` keys.
 * When to use: Tactical exit IPC, annihilation cleanup, test teardown, and error recovery paths.
 * Expected outcome: `isTacticalBattleActive()` becomes false; strategic transport rows match the pre-battle baseline for involved parents; subsequent apply calls fail until a new start.
 * Exceptions: None.
 */
export function endTacticalBattleSession(): void {
  tacticalLogMutate('endTacticalBattleSession', { hadBattle: !!getActiveTacticalBattleSnapshotRef() });
  endTacticalBattleSessionCore(false);
}

/**
 * Clears tactical session state for the human voluntary tactical exit bailout flow and applies threshold parent elimination.
 *
 * Contract: Idempotent; restores transport baseline like `endTacticalBattleSession` and then removes strategic parents that fail `survivors * 2 < baseline` when both players still have tactical sub-units.
 * When to use: Main-process `game:endTacticalBattle` handler for human Return-to-Strategic bailout.
 * Expected outcome: Tactical session closes, strategic-ready gating reopens, and below-half parent strategic units are removed before automatic strategic continuation.
 * Exceptions: Elimination failures are logged and suppressed so tactical teardown still completes.
 */
export function endTacticalBattleSessionForHumanVoluntaryExitBailout(): void {
  tacticalLogMutate('endTacticalBattleSessionForHumanVoluntaryExitBailout', {
    hadBattle: !!getActiveTacticalBattleSnapshotRef(),
  });
  endTacticalBattleSessionCore(true);
}

/**
 * Maps a tactical human march validation failure to a short user-facing reason string.
 *
 * Purpose: Keeps IPC failure wording consistent for tactical march validation without exposing internal codes.
 * When to use: `humanTacticalMarchValidationFailure` when pre-projection validation fails for any row.
 * Expected outcome: English clause suitable for map toasts without leaking internal ids unnecessarily.
 * Exceptions: None.
 */
function humanTacticalMarchBlockMessage(reason: TacticalMovementBlockReason): string {
  switch (reason) {
    case 'unknown_unit':
      return 'One or more selected units are not part of this tactical battle.';
    case 'non_human':
      return 'Only your tactical sub-units can receive march orders here.';
    case 'outside_footprint':
      return 'That destination lies outside the tactical battle footprint.';
    case 'out_of_range':
      return 'No valid march path to that destination for one or more selected units (terrain, transport links, or blocked cells).';
    case 'air_no_march':
      return 'Air units cannot receive tactical march orders.';
    case 'embarked_cargo':
      return 'Embarked land units cannot receive independent movement orders. Debark first.';
    default:
      return `Movement order rejected (${reason}).`;
  }
}

/**
 * Returns a user-facing validation error string when any human tactical march order is illegal, or null when all pass.
 *
 * Purpose: Centralizes the all-or-nothing guard shared by draft validation IPC and snapshot application.
 * When to use: `validateHumanTacticalMarchOrders` before accepting a draft, and `applyHumanTacticalDraftBeatInStrategicOrder` before mutating the snapshot.
 * Expected outcome: First failure reason wins; empty `orders` yields null (vacuously valid).
 * Exceptions: None; invalid H3 indexes may propagate from distance helpers as before.
 */
function humanTacticalMarchValidationFailure(
  cur: TacticalBattleSnapshot,
  orders: readonly { unitId: string; toH3Index: string }[]
): string | null {
  if (orders.length === 0) return null;
  const tacticalSet = new Set(cur.tacticalChildH3Indexes);
  const sub = [...cur.subUnits];
  const byId = new Map(sub.map((u, i) => [u.id, i] as const));
  for (const o of orders) {
    const outcome = tacticalComputeHumanMovementOrderOutcome({ byId, sub, order: o, tacticalSet, battle: cur });
    if (!outcome.ok) {
      tacticalLogMutate('humanTacticalMarchValidationFailure', {
        reason: outcome.reason,
        ...outcome.context,
        unitId: o.unitId,
        toH3Index: o.toH3Index,
      });
      return humanTacticalMarchBlockMessage(outcome.reason);
    }
  }
  return null;
}

/**
 * Validates human tactical march orders against the active snapshot without mutating it.
 *
 * Purpose: Supports draft-only march UX where the renderer stores orders until tactical Ready commits them.
 * When to use: `assignHumanMarchOrders` / `assignHumanMarchOrder` while a tactical session is active (pre-commit IPC).
 * Expected outcome: `success: true` when every order is legal on the current committed snapshot.
 * Exceptions: None; returns `success: false` with reason when no session exists or validation fails.
 */
export function validateHumanTacticalMarchOrders(
  orders: readonly { unitId: string; toH3Index: string }[]
): { success: true } | { success: false; reason: string } {
  tacticalLogQuery('validateHumanTacticalMarchOrders', { orderCount: orders.length });
  const cur = getActiveTacticalBattleSnapshotRef();
  if (!cur) {
    tacticalLogQuery('validateHumanTacticalMarchOrders rejected', { reason: 'no_active_session' });
    return { success: false, reason: 'No tactical battle is active.' };
  }
  const fail = humanTacticalMarchValidationFailure(cur, orders);
  if (fail) return { success: false, reason: fail };
  tacticalLogMutate('validateHumanTacticalMarchOrders accepted', {
    battleId: cur.battleId,
    tacticalTurnNumber: cur.tacticalTurnNumber,
    orderCount: orders.length,
    orders: orders.map((o) => ({ unitId: o.unitId, toH3Index: o.toH3Index })),
  });
  return { success: true };
}

/**
 * Applies validated human tactical march orders to the active snapshot (milestone 2.1+ human parity).
 *
 * Purpose: Mutates the in-memory tactical footprint for human player marches with the same guards as AI projection.
 * When to use: `commitHumanTacticalDraftOrders` IPC after tactical Ready aggregates draft rows from the renderer only.
 * Expected outcome: Updated snapshot with human `h3Index` changes and synced embark-on-naval positions.
 * Exceptions: Logs at error and returns failure when projection throws unexpectedly.
 */
/**
 * Applies one human tactical Ready beat in strategic resolution order (air+ranged, march, optional human embark, ferry, cargo sync, melee) with a single persisted snapshot.
 *
 * Purpose: Matches `executeReadyStrategicTurn` combat ordering without production: no human embark before air (strategic has none there); optional `embarkOrders` apply after movement like sealift committed after positions settle; fixes prior drift where melee updated IPC but not the active snapshot.
 * When to use: `commitHumanTacticalDraftOrders` after target validations and after computing applied march legs.
 * Expected outcome: One `commitActiveTacticalBattle` with post-melee rows; air/ranged/melee share one `createCombatRng` stream rooted like melee-only `applyTacticalMeleeAfterSupportOrders`.
 *   Success carries each phase's recorded dice (`airStrikeDiceRolls`, `rangedDiceRolls`, `meleePack.meleeDiceRolls`) for playback.
 * Exceptions: Returns `success: false` when no session, march validation fails, or projection throws.
 */
export function applyHumanTacticalDraftBeatInStrategicOrder(args: {
  movementOrders: readonly { unitId: string; toH3Index: string }[];
  rangedAttacks?: readonly { unitId: string; targetH3Index: string }[];
  airStrikes?: readonly AirStrikeOrder[];
  ferryOrders?: readonly FerryOrder[];
  embarkOrders?: readonly EmbarkOrder[];
  /**
   * Buffered opponent tactical plan (movement, support, embark) applied only on this Ready beat after merged air+ranged, in strategic order relative to human slices.
   */
  opponentTacticalDraft?: TacticalOpponentPlanPayload;
}):
  | {
      success: true;
      battle: TacticalBattleSnapshot;
      battleAfterMovementBeforeFerry: TacticalBattleSnapshot;
      killsByDirectFire: KillEdge[];
      killsByAirStrike: KillEdge[];
      killsByReturnFire: KillEdge[];
      removedUnits: RemovedUnitSnapshot[];
      infrastructureDestroyedEvents: InfrastructureDestroyedEvent[];
      airStrikeAttemptCount: number;
      airStrikePlaybackMoves: AirStrikeAnimationMove[];
      airStrikePlaybackStrikeHexes: string[];
      airStrikePlaybackCasualtyHexes: string[];
      airStrikePlaybackRemovedUnits: RemovedUnitSnapshot[];
      rangedResolutionShotLines: RangedResolutionShotLine[];
      airStrikeDiceRolls: CombatDiceRoll[];
      rangedDiceRolls: CombatDiceRoll[];
      meleePack: ReturnType<typeof applyTacticalMeleeAfterSupportOrders>;
    }
  | { success: false; reason: string } {
  const opp = args.opponentTacticalDraft;
  tacticalLogMutate('applyHumanTacticalDraftBeatInStrategicOrder', {
    movementCount: args.movementOrders.length,
    rangedCount: args.rangedAttacks?.length ?? 0,
    airCount: args.airStrikes?.length ?? 0,
    ferryCount: args.ferryOrders?.length ?? 0,
    embarkCount: args.embarkOrders?.length ?? 0,
    opponentMovementCount: opp?.movementOrders.length ?? 0,
    opponentRangedCount: opp?.rangedAttacks.length ?? 0,
    opponentAirCount: opp?.airStrikes.length ?? 0,
  });
  try {
    const cur = getActiveTacticalBattleSnapshotRef();
    if (!cur) {
      tacticalLogQuery('applyHumanTacticalDraftBeatInStrategicOrder rejected', { reason: 'no_active_session' });
      return { success: false, reason: 'No tactical battle is active.' };
    }
    const marchFail = humanTacticalMarchValidationFailure(cur, args.movementOrders);
    if (marchFail) {
      tacticalLogQuery('applyHumanTacticalDraftBeatInStrategicOrder rejected', { reason: 'march_validation', detail: marchFail });
      return { success: false, reason: marchFail };
    }
    const oppMarchFail = opponentTacticalMarchValidationFailure(cur, opp?.movementOrders ?? []);
    if (oppMarchFail) {
      tacticalLogQuery('applyHumanTacticalDraftBeatInStrategicOrder rejected', {
        reason: 'opponent_march_validation',
        detail: oppMarchFail,
      });
      return { success: false, reason: oppMarchFail };
    }
    const seed =
      (getGameSeed() +
        cur.strategicTurnNumber * 7919 +
        cur.tacticalTurnNumber * 104729 +
        tacticalSubUnitLayoutSeed32(cur.subUnits)) >>>
      0;
    const rawNext = createCombatRng(seed);
    const afterOpponentEmbark = applyTacticalEmbarkPhaseOnBattle(cur, opp?.embarkOrders, 'opponent');
    const mergedAir = [...(args.airStrikes ?? []), ...(opp?.airStrikes ?? [])];
    const mergedRanged = [...(args.rangedAttacks ?? []), ...(opp?.rangedAttacks ?? [])];
    const acc = applyTacticalAirStrikeThenRangedPhaseOnBattle(
      afterOpponentEmbark,
      mergedAir,
      mergedRanged,
      'human',
      rawNext,
      'mergedHumanThenOpponent'
    );
    const bAfterHumanMove =
      args.movementOrders.length > 0
        ? projectTacticalSnapshotAfterHumanMovementOrders(acc.battle, args.movementOrders)
        : acc.battle;
    const oppMarch = opp?.movementOrders ?? [];
    const bAfterBothMoves =
      oppMarch.length > 0
        ? projectTacticalSnapshotAfterOpponentMovementOrders(bAfterHumanMove, oppMarch)
        : bAfterHumanMove;
    for (const e of args.embarkOrders ?? []) {
      const emb = validateTacticalHumanEmbarkOrder(e, bAfterBothMoves.subUnits);
      if (!emb.valid) {
        tacticalLogQuery('applyHumanTacticalDraftBeatInStrategicOrder rejected', { reason: 'embark_validation', detail: emb.reason });
        return { success: false, reason: emb.reason };
      }
    }
    const bAfterHumanEmbark = applyTacticalEmbarkPhaseOnBattle(bAfterBothMoves, args.embarkOrders, 'human');
    const bAfterHumanFerry = applyTacticalFerryPhaseOnBattle(bAfterHumanEmbark, args.ferryOrders, 'human');
    const bAfterOppFerry = applyTacticalFerryPhaseOnBattle(bAfterHumanFerry.battle, opp?.ferryOrders, 'opponent');
    const bSynced = tacticalBattleWithSyncedEmbarkCargo(bAfterOppFerry.battle);
    const meleePack = applyTacticalMeleeAfterSupportOrders(bSynced, rawNext);
    const battleAdvancedTurn: TacticalBattleSnapshot = {
      ...meleePack.battle,
      tacticalTurnNumber: cur.tacticalTurnNumber + 1,
    };
    commitActiveTacticalBattle(battleAdvancedTurn);
    tacticalLogMutate('applyHumanTacticalDraftBeatInStrategicOrder applied', {
      battleId: battleAdvancedTurn.battleId,
      subUnitCount: battleAdvancedTurn.subUnits.length,
      tacticalTurnNumber: battleAdvancedTurn.tacticalTurnNumber,
    });
    return {
      success: true,
      battle: battleAdvancedTurn,
      battleAfterMovementBeforeFerry: bAfterBothMoves,
      killsByDirectFire: acc.killsByDirectFire,
      killsByAirStrike: acc.killsByAirStrike,
      killsByReturnFire: acc.killsByReturnFire,
      removedUnits: [...acc.removedUnits, ...bAfterHumanFerry.removedUnits, ...bAfterOppFerry.removedUnits],
      infrastructureDestroyedEvents: acc.infrastructureDestroyedEvents,
      airStrikeAttemptCount: acc.airStrikeAttemptCount,
      airStrikePlaybackMoves: acc.airStrikePlaybackMoves,
      airStrikePlaybackStrikeHexes: acc.airStrikePlaybackStrikeHexes,
      airStrikePlaybackCasualtyHexes: acc.airStrikePlaybackCasualtyHexes,
      airStrikePlaybackRemovedUnits: acc.airStrikePlaybackRemovedUnits,
      rangedResolutionShotLines: acc.rangedResolutionShotLines,
      airStrikeDiceRolls: acc.airStrikeDiceRolls,
      rangedDiceRolls: acc.rangedDiceRolls,
      meleePack: {
        ...meleePack,
        battle: battleAdvancedTurn,
      },
    };
  } catch (err) {
    tacticalLogError('applyHumanTacticalDraftBeatInStrategicOrder failed', { err });
    return { success: false, reason: 'Could not apply tactical Ready orders.' };
  }
}

/**
 * Applies validated human tactical support drafts (ranged, air, ferry, embark) to the active snapshot.
 *
 * Purpose: Completes tactical Ready parity so non-march drafts commit on main exactly once per Ready click.
 * When to use: Callers that apply support without marching on the same IPC (rare); prefer `applyHumanTacticalDraftBeatInStrategicOrder` for full Ready beats.
 * Expected outcome: Active snapshot mutates and persists with support-order effects; returns updated `battle`.
 * Exceptions: Logs at error and returns `success: false` with reason if no session exists or projection fails.
 */
export function applyValidatedHumanTacticalSupportOrders(args: {
  rangedAttacks?: readonly { unitId: string; targetH3Index: string }[];
  airStrikes?: readonly AirStrikeOrder[];
  ferryOrders?: readonly FerryOrder[];
  embarkOrders?: readonly EmbarkOrder[];
}):
  | {
      success: true;
      battle: TacticalBattleSnapshot;
      killsByDirectFire: KillEdge[];
      killsByAirStrike: KillEdge[];
      killsByReturnFire: KillEdge[];
      removedUnits: RemovedUnitSnapshot[];
      infrastructureDestroyedEvents: InfrastructureDestroyedEvent[];
      airStrikeAttemptCount: number;
    }
  | { success: false; reason: string } {
  tacticalLogMutate('applyValidatedHumanTacticalSupportOrders', {
    rangedCount: args.rangedAttacks?.length ?? 0,
    airCount: args.airStrikes?.length ?? 0,
    ferryCount: args.ferryOrders?.length ?? 0,
    embarkCount: args.embarkOrders?.length ?? 0,
  });
  try {
    const cur = getActiveTacticalBattleSnapshotRef();
    if (!cur) {
      tacticalLogQuery('applyValidatedHumanTacticalSupportOrders rejected', { reason: 'no_active_session' });
      return { success: false, reason: 'No tactical battle is active.' };
    }
    const hasWork =
      (args.rangedAttacks?.length ?? 0) > 0 ||
      (args.airStrikes?.length ?? 0) > 0 ||
      (args.ferryOrders?.length ?? 0) > 0 ||
      (args.embarkOrders?.length ?? 0) > 0;
    if (!hasWork) {
      return {
        success: true,
        battle: cur,
        killsByDirectFire: [],
        killsByAirStrike: [],
        killsByReturnFire: [],
        removedUnits: [],
        infrastructureDestroyedEvents: [],
        airStrikeAttemptCount: 0,
      };
    }
    const projection = projectTacticalSnapshotAfterValidatedHumanSupportOrders(cur, args);
    commitActiveTacticalBattle(projection.battle);
    if ((args.embarkOrders?.length ?? 0) > 0) {
      applyTacticalEmbarkCommittedOrdersToStrategicDb(args.embarkOrders!, (subId) => {
        const row = projection.battle.subUnits.find((u) => u.id === subId);
        return row?.parentUnitId ?? null;
      });
    }
    return {
      success: true,
      battle: projection.battle,
      killsByDirectFire: projection.killsByDirectFire,
      killsByAirStrike: projection.killsByAirStrike,
      killsByReturnFire: projection.killsByReturnFire,
      removedUnits: projection.removedUnits,
      infrastructureDestroyedEvents: projection.infrastructureDestroyedEvents,
      airStrikeAttemptCount: projection.airStrikeAttemptCount,
    };
  } catch (err) {
    if (err instanceof TacticalEmbarkValidationRejected) {
      tacticalLogQuery('applyValidatedHumanTacticalSupportOrders rejected', { reason: 'embark_validation', detail: err.message });
      return { success: false, reason: err.message };
    }
    tacticalLogError('applyValidatedHumanTacticalSupportOrders failed', { err });
    return { success: false, reason: 'Could not apply tactical support orders.' };
  }
}

/**
 * Applies validated opponent tactical orders to the active in-memory snapshot (march, ranged, air, ferry, embark).
 *
 * Contract: Mutates `activeTacticalBattle` only on success; inputs are expected pre-validated for the current tactical turn.
 * When to use: After `requestOrders` returns tactical AI orders from `handleRequestAiOrders`.
 * Expected outcome: Returns the updated snapshot for IPC; strategic `GameStateSnapshot` is unchanged.
 * Exceptions: Logs at error and returns failure when no session exists or projection throws unexpectedly.
 */
export function applyValidatedOpponentTacticalOrders(args: {
  movementOrders: readonly { unitId: string; toH3Index: string }[];
  rangedAttacks?: readonly { unitId: string; targetH3Index: string }[];
  airStrikes?: readonly AirStrikeOrder[];
  ferryOrders?: readonly FerryOrder[];
  embarkOrders?: readonly EmbarkOrder[];
}): { success: true; battle: TacticalBattleSnapshot } | { success: false; reason: string } {
  tacticalLogMutate('applyValidatedOpponentTacticalOrders invoked', {
    movementCount: args.movementOrders.length,
    rangedCount: args.rangedAttacks?.length ?? 0,
    airCount: args.airStrikes?.length ?? 0,
    ferryCount: args.ferryOrders?.length ?? 0,
    embarkCount: args.embarkOrders?.length ?? 0,
  });
  try {
    const cur = getActiveTacticalBattleSnapshotRef();
    if (!cur) {
      tacticalLogQuery('applyValidatedOpponentTacticalOrders rejected', { reason: 'no_active_session' });
      return { success: false, reason: 'No tactical battle is active.' };
    }
    const hasWork =
      args.movementOrders.length > 0 ||
      (args.rangedAttacks?.length ?? 0) > 0 ||
      (args.airStrikes?.length ?? 0) > 0 ||
      (args.ferryOrders?.length ?? 0) > 0 ||
      (args.embarkOrders?.length ?? 0) > 0;
    if (!hasWork) {
      return { success: true, battle: cur };
    }
    const next = projectTacticalSnapshotAfterValidatedOpponentOrders(cur, args);
    commitActiveTacticalBattle(next);
    tacticalLogMutate('applyValidatedOpponentTacticalOrders applied', {
      battleId: next.battleId,
      subUnitCount: next.subUnits.length,
    });
    return { success: true, battle: next };
  } catch (err) {
    tacticalLogError('applyValidatedOpponentTacticalOrders failed', { err });
    return { success: false, reason: 'Could not apply tactical opponent orders.' };
  }
}

/**
 * Restores a persisted tactical battle from SQLite into the active in-memory ref when validation succeeds.
 *
 * Purpose: Centralizes bootstrap restore next to other session transitions (`commitActiveTacticalBattle`, `endTacticalBattleSession`).
 * When to use: Once from `main.ts` immediately after `initDatabase` completes.
 * Expected outcome: Active ref matches durable JSON when turn/parent checks pass; stale JSON is cleared without installing.
 * Exceptions: None; persistence read/validate helpers log internally.
 */
export function restorePersistedTacticalBattleSession(): void {
  tacticalLogMutate('restorePersistedTacticalBattleSession', {});
  const snap = loadPersistedTacticalBattleSnapshotIfConsistent();
  if (!snap) return;
  setActiveTacticalBattleSnapshotRef(snap);
  if (!tacticalTransportBaselineConfigExists()) {
    captureTacticalTransportBaselineForParentUnitIds([...new Set(snap.subUnits.map((u) => u.parentUnitId))]);
  }
  hydrateOpponentCallbackStashFromGameConfig();
  tacticalLogMutate('restorePersistedTacticalBattleSession installed', {
    battleId: snap.battleId,
    subUnitCount: snap.subUnits.length,
  });
}
