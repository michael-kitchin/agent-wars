import type {
  StartTacticalBattleIpcResult,
  TacticalBattleSnapshot,
} from '../../shared/tacticalBattleTypes';
import type { AirStrikeOrder, EmbarkOrder, FerryOrder } from '../../shared/ipcTypes';
import type { InfrastructureDestroyedEvent, RemovedUnitSnapshot } from '../../shared/ipc/readyTypes';
import { tacticalBoundaryConcurrentSessionAllowed } from '../../shared/tacticalStateAssertions';
import { createCombatRng } from '../combatResolution';
import { getGameSeed } from '../gameDb';
import { getActiveTacticalBattleSnapshotRef, setActiveTacticalBattleSnapshotRef } from './activeTacticalBattleRef';
import {
  clearTacticalBattleSnapshotFromGameConfig,
  loadPersistedTacticalBattleSnapshotIfConsistent,
  writeTacticalBattleSnapshotToGameConfig,
} from './tacticalBattlePersistence';
import { computeTacticalBattleSnapshot } from './computeTacticalBattleSnapshot';
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
import { applyTacticalEmbarkCommittedOrdersToStrategicDb } from '../game-actions/sealift';
import { tacticalLogError, tacticalLogMutate, tacticalLogQuery } from './tacticalLogging';
import { validateTacticalHumanEmbarkOrder } from './tacticalOpponentOrderValidation';
import {
  captureTacticalTransportBaselineForParentUnitIds,
  restoreTacticalTransportBaselineForParentUnitIds,
  tacticalTransportBaselineConfigExists,
} from './tacticalTransportBaseline';
import { TacticalEmbarkValidationRejected } from './tacticalValidationResult';
import type { TacticalOpponentPlanPayload } from '../../shared/ipc/readyTypes';

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
  const res4Set = new Set(cur.res4ChildH3Indexes);
  const sub = [...cur.subUnits];
  const byId = new Map(sub.map((u, i) => [u.id, i] as const));
  for (const o of orders) {
    const outcome = tacticalComputeMovementOrderOutcome({ byId, sub, order: o, res4Set, battle: cur });
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
 * Returns whether a tactical battle session is currently active in the main process.
 *
 * Contract: True iff `startTacticalBattleForEnclosingRes1Hex` succeeded and `endTacticalBattleSession` has not cleared state.
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
 * Starts a tactical battle for the given contested res1 hex; fails if another battle is already active.
 *
 * Contract: On success, installs `activeTacticalBattle` from `computeTacticalBattleSnapshot`; on failure, leaves prior session unchanged (usually none).
 * When to use: Renderer `startTacticalBattle` IPC after entry button click with validated res1 id.
 * Expected outcome: `success: true` with `battle` and optional `skippedParentDisplayNames`; or `success: false` with human-readable `reason`.
 * Exceptions: Unexpected errors are caught, logged at error, and returned as `success: false` (no throw).
 */
export function startTacticalBattleForEnclosingRes1Hex(enclosingRes1H3Index: string): StartTacticalBattleIpcResult {
  tacticalLogMutate('startTacticalBattleForEnclosingRes1Hex', { enclosingRes1H3Index });
  try {
    const concurrent = tacticalBoundaryConcurrentSessionAllowed(getActiveTacticalBattleSnapshotRef() !== null);
    if (!concurrent.ok) {
      return { success: false, reason: 'A tactical battle is already in progress.' };
    }
    const battleId = `tb-${enclosingRes1H3Index}-${Date.now()}`;
    const { snapshot, skippedParentDisplayNames, failureReason } = computeTacticalBattleSnapshot(
      enclosingRes1H3Index,
      battleId
    );
    if (!snapshot) {
      return { success: false, reason: failureReason ?? 'Could not start tactical battle.' };
    }
    commitActiveTacticalBattle(snapshot);
    captureTacticalTransportBaselineForParentUnitIds([...new Set(snapshot.subUnits.map((u) => u.parentUnitId))]);
    if (skippedParentDisplayNames.length > 0) {
      tacticalLogMutate('startTacticalBattleForEnclosingRes1Hex skipped parents', { skippedParentDisplayNames });
    }
    return {
      success: true,
      battle: snapshot,
      skippedParentDisplayNames: skippedParentDisplayNames.length > 0 ? skippedParentDisplayNames : undefined,
    };
  } catch (err) {
    tacticalLogError('startTacticalBattleForEnclosingRes1Hex failed', { enclosingRes1H3Index, err });
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
  const snap = getActiveTacticalBattleSnapshotRef();
  const parentIds = snap ? [...new Set(snap.subUnits.map((u) => u.parentUnitId))] : null;
  restoreTacticalTransportBaselineForParentUnitIds(parentIds);
  commitActiveTacticalBattle(null);
}

/**
 * Maps a tactical human march validation failure to a short user-facing reason string.
 *
 * Purpose: Keeps IPC failure wording consistent for tactical march validation without exposing internal codes.
 * When to use: `applyHumanTacticalMarchOrders` when pre-projection validation fails for any row.
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
      return 'That destination is out of movement range for one or more selected units.';
    case 'air_no_march':
      return 'Air units cannot receive tactical march orders.';
    default:
      return `Movement order rejected (${reason}).`;
  }
}

/**
 * Returns a user-facing validation error string when any human tactical march order is illegal, or null when all pass.
 *
 * Purpose: Centralizes the all-or-nothing guard shared by draft validation IPC and snapshot application.
 * When to use: `validateHumanTacticalMarchOrders` and `applyHumanTacticalMarchOrders` before mutating the snapshot.
 * Expected outcome: First failure reason wins; empty `orders` yields null (vacuously valid).
 * Exceptions: None; invalid H3 indexes may propagate from distance helpers as before.
 */
function humanTacticalMarchValidationFailure(
  cur: TacticalBattleSnapshot,
  orders: readonly { unitId: string; toH3Index: string }[]
): string | null {
  if (orders.length === 0) return null;
  const res4Set = new Set(cur.res4ChildH3Indexes);
  const sub = [...cur.subUnits];
  const byId = new Map(sub.map((u, i) => [u.id, i] as const));
  for (const o of orders) {
    const outcome = tacticalComputeHumanMovementOrderOutcome({ byId, sub, order: o, res4Set, battle: cur });
    if (!outcome.ok) {
      tacticalLogQuery('humanTacticalMarchValidationFailure', {
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
export function applyHumanTacticalMarchOrders(
  orders: readonly { unitId: string; toH3Index: string }[]
): { success: true; battle: TacticalBattleSnapshot } | { success: false; reason: string } {
  tacticalLogMutate('applyHumanTacticalMarchOrders', { orderCount: orders.length });
  try {
    const cur = getActiveTacticalBattleSnapshotRef();
    if (!cur) {
      tacticalLogQuery('applyHumanTacticalMarchOrders rejected', { reason: 'no_active_session' });
      return { success: false, reason: 'No tactical battle is active.' };
    }
    if (orders.length === 0) {
      return { success: true, battle: cur };
    }
    const fail = humanTacticalMarchValidationFailure(cur, orders);
    if (fail) {
      return { success: false, reason: fail };
    }
    const next = projectTacticalSnapshotAfterHumanMovementOrders(cur, orders);
    commitActiveTacticalBattle(next);
    tacticalLogMutate('applyHumanTacticalMarchOrders applied', {
      battleId: next.battleId,
      subUnitCount: next.subUnits.length,
    });
    return { success: true, battle: next };
  } catch (err) {
    tacticalLogError('applyHumanTacticalMarchOrders failed', { err });
    return { success: false, reason: 'Could not apply tactical movement orders.' };
  }
}

/**
 * Applies one human tactical Ready beat in strategic resolution order (air+ranged, march, optional human embark, ferry, cargo sync, melee) with a single persisted snapshot.
 *
 * Purpose: Matches `executeReadyStrategicTurn` combat ordering without production: no human embark before air (strategic has none there); optional `embarkOrders` apply after movement like sealift committed after positions settle; fixes prior drift where melee updated IPC but not the active snapshot.
 * When to use: `commitHumanTacticalDraftOrders` after target validations and after computing applied march legs.
 * Expected outcome: One `commitActiveTacticalBattle` with post-melee rows; air/ranged/melee share one `createCombatRng` stream rooted like melee-only `applyTacticalMeleeAfterSupportOrders`.
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
      killsByDirectFire: { victimId: string; killerIds: string[] }[];
      killsByAirStrike: { victimId: string; killerIds: string[] }[];
      killsByReturnFire: { victimId: string; killerIds: string[] }[];
      removedUnits: RemovedUnitSnapshot[];
      infrastructureDestroyedEvents: InfrastructureDestroyedEvent[];
      airStrikeAttemptCount: number;
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
    const bAfterOppFerry = applyTacticalFerryPhaseOnBattle(bAfterHumanFerry, opp?.ferryOrders, 'opponent');
    const bSynced = tacticalBattleWithSyncedEmbarkCargo(bAfterOppFerry);
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
      removedUnits: acc.removedUnits,
      infrastructureDestroyedEvents: acc.infrastructureDestroyedEvents,
      airStrikeAttemptCount: acc.airStrikeAttemptCount,
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
      killsByDirectFire: { victimId: string; killerIds: string[] }[];
      killsByAirStrike: { victimId: string; killerIds: string[] }[];
      killsByReturnFire: { victimId: string; killerIds: string[] }[];
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
  tacticalLogMutate('restorePersistedTacticalBattleSession installed', {
    battleId: snap.battleId,
    subUnitCount: snap.subUnits.length,
  });
}
