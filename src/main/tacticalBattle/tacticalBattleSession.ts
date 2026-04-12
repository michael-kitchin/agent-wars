import type {
  AdvanceTacticalTurnIpcResult,
  StartTacticalBattleIpcResult,
  TacticalBattleSnapshot,
} from '../../shared/tacticalBattleTypes';
import type { AirStrikeOrder, EmbarkOrder, FerryOrder } from '../../shared/ipcTypes';
import { tacticalBoundaryConcurrentSessionAllowed } from '../../shared/tacticalStateAssertions';
import { getActiveTacticalBattleSnapshotRef, setActiveTacticalBattleSnapshotRef } from './activeTacticalBattleRef';
import {
  clearTacticalBattleSnapshotFromGameConfig,
  loadPersistedTacticalBattleSnapshotIfConsistent,
  writeTacticalBattleSnapshotToGameConfig,
} from './tacticalBattlePersistence';
import { computeTacticalBattleSnapshot } from './computeTacticalBattleSnapshot';
import { projectTacticalSnapshotAfterValidatedOpponentOrders } from './tacticalCompositeOrdersApply';
import { tacticalLogError, tacticalLogMutate, tacticalLogQuery } from './tacticalLogging';

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
 * Clears the active tactical battle session without applying strategic outcomes (milestone 2.1).
 *
 * Contract: Idempotent; sets `activeTacticalBattle` to null; does not write SQLite strategic state.
 * When to use: Tactical exit IPC, annihilation cleanup, test teardown, and error recovery paths.
 * Expected outcome: `isTacticalBattleActive()` becomes false; subsequent `advanceActiveTacticalTurn` / apply calls fail until a new start.
 * Exceptions: None.
 */
export function endTacticalBattleSession(): void {
  tacticalLogMutate('endTacticalBattleSession', { hadBattle: !!getActiveTacticalBattleSnapshotRef() });
  commitActiveTacticalBattle(null);
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
 * Increments the tactical turn counter on the active in-memory tactical battle snapshot.
 *
 * Contract: On success returns a new snapshot object with `tacticalTurnNumber` increased by one; on failure returns `success: false` with `reason`.
 * When to use: `game:advanceTacticalTurn` IPC while milestone 2.1+ keeps multiple tactical planning beats before strategic Ready.
 * Expected outcome: Main and renderer stay aligned when the renderer replaces `S.tacticalBattleSnapshot` with `battle` from the result.
 * Exceptions: Surfaces `logError` and a generic reason if an unexpected error occurs while cloning the snapshot.
 */
export function advanceActiveTacticalTurn(): AdvanceTacticalTurnIpcResult {
  tacticalLogMutate('advanceActiveTacticalTurn invoked', {});
  try {
    const cur = getActiveTacticalBattleSnapshotRef();
    if (!cur) {
      tacticalLogQuery('advanceActiveTacticalTurn rejected', { reason: 'no_active_session' });
      return { success: false, reason: 'No tactical battle is active.' };
    }
    const prev = cur.tacticalTurnNumber;
    const next: TacticalBattleSnapshot = {
      ...cur,
      tacticalTurnNumber: prev + 1,
    };
    commitActiveTacticalBattle(next);
    tacticalLogMutate('advanceActiveTacticalTurn applied', { battleId: next.battleId, tacticalTurnNumber: next.tacticalTurnNumber });
    return { success: true, battle: next };
  } catch (err) {
    tacticalLogError('advanceActiveTacticalTurn failed', { err });
    return { success: false, reason: 'Could not advance tactical turn.' };
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
  tacticalLogMutate('restorePersistedTacticalBattleSession installed', {
    battleId: snap.battleId,
    subUnitCount: snap.subUnits.length,
  });
}
