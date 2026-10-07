import {
  dbGetOne,
  dbRun,
  getBuildProgressPointsForHex,
  getKeepBuildingForHex,
  getHexController,
  listBuildQueueRowsForHex,
  replaceBuildQueueForHex,
  getStrategicInfrastructureForHex,
  setKeepBuildingForHex,
} from '../gameDb';
import { logDebug, logError, logTrace } from '../logger';
import {
  BUILD_ENTRY_MAX_COUNT,
  BUILD_ENTRY_MIN_COUNT,
  NO_PRODUCTION_INFRASTRUCTURE_REASON,
  getAvailableBuildUnitTypes,
  isValidBuildCount,
  type BuildUnitType,
} from '../productionRules';
import type {
  ApplyBuildQueueTemplateResult,
  BuildQueueTemplateEntry,
  StrategicProductionContextSnapshot,
  SetHexesKeepBuildingResult,
} from '../../shared/ipcTypes';
import { isTacticalBattleActive } from '../tacticalBattle/tacticalBattleSession';

/**
 * Documents the `HexBuildQueueEntryView` interface as a named contract surface (export interface HexBuildQueueEntryView).

 * Purpose: Supports maintainability by documenting why `HexBuildQueueEntryView` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HexBuildQueueEntryView {
    /**
   * Specifies the contract for the `id` member (id: number;).

   * Contract: Describes stable behavior for callers of `id` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
id: number;
    /**
   * Specifies the contract for the `queueIndex` member (queueIndex: number;).

   * Contract: Describes stable behavior for callers of `queueIndex` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
queueIndex: number;
    /**
   * Specifies the contract for the `unitType` member (unitType: BuildUnitType;).

   * Contract: Describes stable behavior for callers of `unitType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitType: BuildUnitType;
    /**
   * Specifies the contract for the `count` member (count: number;).

   * Contract: Describes stable behavior for callers of `count` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
count: number;
}

/**
 * Documents the `HexBuildQueueView` interface as a named contract surface (export interface HexBuildQueueView).

 * Purpose: Supports maintainability by documenting why `HexBuildQueueView` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HexBuildQueueView {
    /**
   * Specifies the contract for the `h3Index` member (h3Index: string;).

   * Contract: Describes stable behavior for callers of `h3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3Index: string;
    /**
   * Specifies the contract for the `controllerPlayerId` member (controllerPlayerId: string | null;).

   * Contract: Describes stable behavior for callers of `controllerPlayerId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
controllerPlayerId: string | null;
    /**
   * Specifies the contract for the `controlledByRequester` member (controlledByRequester: boolean;).

   * Contract: Describes stable behavior for callers of `controlledByRequester` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
controlledByRequester: boolean;
    /**
   * Specifies the contract for the `urbanHexCount` member (urbanHexCount: number;).

   * Contract: Describes stable behavior for callers of `urbanHexCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
urbanHexCount: number;
    /**
   * Specifies the contract for the `storedPoints` member (storedPoints: number;).

   * Contract: Banked production points for this hex after the last resolution pulse, before the next turn adds urban capacity.
   * When to use: Expose alongside queue rows so the renderer can estimate full-queue completion time.
   * Expected outcome: Same value as `getBuildProgressPointsForHex` for `h3Index`.
   * Exceptions: None.
   */
storedPoints: number;
    /**
   * Specifies the contract for the `seaportCount` member (seaportCount: number;).

   * Contract: Describes stable behavior for callers of `seaportCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
seaportCount: number;
    /**
   * Specifies the contract for the `airportCount` member (airportCount: number;).

   * Contract: Describes stable behavior for callers of `airportCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airportCount: number;
    /**
   * Specifies the contract for the `availableUnitTypes` member (availableUnitTypes: BuildUnitType[];).

   * Contract: Describes stable behavior for callers of `availableUnitTypes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
availableUnitTypes: BuildUnitType[];
    /**
   * Specifies the contract for the `buildSectionVisible` member (buildSectionVisible: boolean;).

   * Contract: Describes stable behavior for callers of `buildSectionVisible` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
buildSectionVisible: boolean;
    /**
   * Specifies the contract for the `noBuildReason` member (noBuildReason: string | null;).

   * Contract: Describes stable behavior for callers of `noBuildReason` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
noBuildReason: string | null;
    /**
   * Specifies the contract for the `entries` member (entries: HexBuildQueueEntryView[];).

   * Contract: Describes stable behavior for callers of `entries` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
entries: HexBuildQueueEntryView[];
  /**
   * Whether Keep building is armed for this hex.
   *
   * Contract: True when the hex should auto-refill after the queue empties.
   * When to use: Snapshots for the build popup and production refill decisions.
   * Expected outcome: Matches durable Keep-building state for the hex.
   * Exceptions: None.
   */
  keepBuilding: boolean;
  /**
   * Unit type used for Keep-building refill when armed.
   *
   * Contract: Standing unit type, or null when Keep building is off.
   * When to use: Popup state and engine refill.
   * Expected outcome: Last synced valid type while armed; otherwise null.
   * Exceptions: None.
   */
  keepBuildingUnitType: BuildUnitType | null;
}

/**
 * Documents the `ProductionEligibilityView` interface as a named contract surface (interface ProductionEligibilityView extends StrategicProductionContextSnapshot).

 * Purpose: Supports maintainability by documenting why `ProductionEligibilityView` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface ProductionEligibilityView extends StrategicProductionContextSnapshot {
    /**
   * Specifies the contract for the `availableUnitTypes` member (availableUnitTypes: BuildUnitType[];).

   * Contract: Describes stable behavior for callers of `availableUnitTypes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
availableUnitTypes: BuildUnitType[];
    /**
   * Specifies the contract for the `buildSectionVisible` member (buildSectionVisible: boolean;).

   * Contract: Describes stable behavior for callers of `buildSectionVisible` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
buildSectionVisible: boolean;
    /**
   * Specifies the contract for the `noBuildReason` member (noBuildReason: string | null;).

   * Contract: Describes stable behavior for callers of `noBuildReason` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
noBuildReason: string | null;
}

/**
 * Defines the `buildProductionEligibilityView` function shape (function buildProductionEligibilityView().

 * Purpose: Supports maintainability by documenting why `buildProductionEligibilityView` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildProductionEligibilityView(
  productionContext: StrategicProductionContextSnapshot
): ProductionEligibilityView {
  const availableUnitTypes = getAvailableBuildUnitTypes(
    productionContext.urbanHexCount,
    productionContext.seaportCount,
    productionContext.airportCount
  );
  const buildSectionVisible = availableUnitTypes.length > 0;
  return {
    ...productionContext,
    availableUnitTypes,
    buildSectionVisible,
    noBuildReason: buildSectionVisible ? null : NO_PRODUCTION_INFRASTRUCTURE_REASON,
  };
}

/**
 * Clears or retargets Keep building after a queue mutation.
 *
 * Purpose: Keeps the standing order aligned with player-driven queue changes.
 * When to use: After add/update/remove/template writes that may empty the queue or change the last row.
 * Expected outcome: Empty queues clear the standing order; armed non-empty queues sync type to the last row.
 * Exceptions: None.
 */
function syncStandingOrderAfterQueueMutation(h3Index: string): void {
  const rows = listBuildQueueRowsForHex(h3Index);
  const standing = getKeepBuildingForHex(h3Index);
  if (rows.length === 0) {
    if (standing.keepBuilding) {
      setKeepBuildingForHex(h3Index, false, null);
    }
    return;
  }
  if (standing.keepBuilding) {
    const last = rows[rows.length - 1]!;
    setKeepBuildingForHex(h3Index, true, last.unitType);
  }
}

/**
 * Builds the requester-facing build-queue view for one hex.
 *
 * Purpose: Single place that maps DB queue, progress, infrastructure, and Keep-building standing order into IPC shape.
 * When to use: Reads after mutations and for getHexBuildQueue.
 * Expected outcome: Snapshot fields including keepBuilding / keepBuildingUnitType match durable state.
 * Exceptions: None.
 */
function buildQueueViewForRequester(h3Index: string, requestingPlayerId: string): HexBuildQueueView {
  const controllerPlayerId = getHexController(h3Index);
  const controlledByRequester = controllerPlayerId === requestingPlayerId;
  const productionView = buildProductionEligibilityView(getStrategicInfrastructureForHex(h3Index));
  const standing = getKeepBuildingForHex(h3Index);
  return {
    h3Index,
    controllerPlayerId,
    controlledByRequester,
    urbanHexCount: productionView.urbanHexCount,
    storedPoints: getBuildProgressPointsForHex(h3Index),
    seaportCount: productionView.seaportCount,
    airportCount: productionView.airportCount,
    availableUnitTypes: productionView.availableUnitTypes,
    buildSectionVisible: productionView.buildSectionVisible,
    noBuildReason: productionView.noBuildReason,
    entries: listBuildQueueRowsForHex(h3Index).map((row) => ({
      id: row.id,
      queueIndex: row.queueIndex,
      unitType: row.unitType,
      count: row.remainingCount,
    })),
    keepBuilding: standing.keepBuilding,
    keepBuildingUnitType: standing.keepBuildingUnitType,
  };
}

/**
 * Rejects a build-queue edit outside planning, and a human edit while a battle is open.
 *
 * Purpose: The human build UI stays closed during a battle. The opponent's strategic consultation still sets queues for that turn after the human has entered the battle.
 * When to use: Every build-queue insert, update, and delete.
 * Expected outcome: A queue view when the edit may proceed, or a reason when phase, the human battle lock, control, or infrastructure blocks it.
 * Exceptions: None.
 */
function validateBuildQueueMutationContext(args: {
  h3Index: string;
  requestingPlayerId: string;
  requireBuildSectionVisible: boolean;
}): { valid: true; queueView: HexBuildQueueView } | { valid: false; reason: string } {
  const phase = dbGetOne<{ phase: string }>('SELECT phase FROM turn_state WHERE id = 1')?.phase ?? 'planning';
  if (phase !== 'planning') {
    return { valid: false, reason: 'Build queue can only be edited during planning phase.' };
  }
  if (isTacticalBattleActive() && args.requestingPlayerId === 'human') {
    return { valid: false, reason: 'Build queue is unavailable during a tactical battle.' };
  }
  const queueView = buildQueueViewForRequester(args.h3Index, args.requestingPlayerId);
  if (!queueView.controlledByRequester) {
    return { valid: false, reason: 'Only the controlling player can edit this build queue.' };
  }
  if (args.requireBuildSectionVisible && !queueView.buildSectionVisible) {
    return { valid: false, reason: queueView.noBuildReason ?? NO_PRODUCTION_INFRASTRUCTURE_REASON };
  }
  return { valid: true, queueView };
}

/**
 * Defines the `readHexBuildQueue` function shape (export function readHexBuildQueue(h3Index: string, requestingPlayerId = 'human'): HexBuildQueueView).

 * Purpose: Supports maintainability by documenting why `readHexBuildQueue` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function readHexBuildQueue(h3Index: string, requestingPlayerId = 'human'): HexBuildQueueView {
  logTrace('gameActions getHexBuildQueue', { h3Index, requestingPlayerId });
  return buildQueueViewForRequester(h3Index, requestingPlayerId);
}

/**
 * Defines the `executeAddHexBuildQueueEntry` function shape (export function executeAddHexBuildQueueEntry(h3Index: string, requestingPlayerId = 'human'): { success: boolean; reason?: string; queue?: HexBuildQueueVie).

 * Purpose: Supports maintainability by documenting why `executeAddHexBuildQueueEntry` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function executeAddHexBuildQueueEntry(h3Index: string, requestingPlayerId = 'human'): {
  success: boolean;
  reason?: string;
  queue?: HexBuildQueueView;
} {
  logDebug('gameActions addHexBuildQueueEntry', { h3Index, requestingPlayerId });
  try {
    const context = validateBuildQueueMutationContext({
      h3Index,
      requestingPlayerId,
      requireBuildSectionVisible: true,
    });
    if (!context.valid) return { success: false, reason: context.reason };
    const queueView = context.queueView;
    const defaultUnitType = queueView.availableUnitTypes[0];
    if (!defaultUnitType) return { success: false, reason: 'No unit types are currently available for this hex.' };
    const currentRows = listBuildQueueRowsForHex(h3Index);
    dbRun(
      `INSERT INTO res_s_build_queue (h3_index, queue_index, unit_type, remaining_count)
       VALUES (?, ?, ?, ?)`,
      [h3Index, currentRows.length, defaultUnitType, BUILD_ENTRY_MIN_COUNT]
    );
    syncStandingOrderAfterQueueMutation(h3Index);
    return { success: true, queue: buildQueueViewForRequester(h3Index, requestingPlayerId) };
  } catch (err) {
    logError('addHexBuildQueueEntry: exception', err);
    return { success: false, reason: String(err) };
  }
}

/**
 * Defines the `executeUpdateHexBuildQueueEntry` function shape (export function executeUpdateHexBuildQueueEntry( h3Index: string, entryId: number, unitType: BuildUnitType, count: number, requestingPlayerId = 'hum).

 * Purpose: Supports maintainability by documenting why `executeUpdateHexBuildQueueEntry` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function executeUpdateHexBuildQueueEntry(
  h3Index: string,
  entryId: number,
  unitType: BuildUnitType,
  count: number,
  requestingPlayerId = 'human'
): { success: boolean; reason?: string; queue?: HexBuildQueueView } {
  logDebug('gameActions updateHexBuildQueueEntry', { h3Index, entryId, unitType, count, requestingPlayerId });
  try {
    const context = validateBuildQueueMutationContext({
      h3Index,
      requestingPlayerId,
      requireBuildSectionVisible: true,
    });
    if (!context.valid) return { success: false, reason: context.reason };
    const queueView = context.queueView;
    if (!queueView.availableUnitTypes.includes(unitType)) {
      return { success: false, reason: `Unit type "${unitType}" is not available for this hex.` };
    }
    if (!isValidBuildCount(count)) {
      return {
        success: false,
        reason: `Build count must be an integer from ${BUILD_ENTRY_MIN_COUNT} to ${BUILD_ENTRY_MAX_COUNT}.`,
      };
    }
    const row = dbGetOne<{ id: number }>('SELECT id FROM res_s_build_queue WHERE id = ? AND h3_index = ?', [entryId, h3Index]);
    if (!row) return { success: false, reason: 'Build queue entry not found.' };
    dbRun('UPDATE res_s_build_queue SET unit_type = ?, remaining_count = ? WHERE id = ?', [unitType, count, entryId]);
    syncStandingOrderAfterQueueMutation(h3Index);
    return { success: true, queue: buildQueueViewForRequester(h3Index, requestingPlayerId) };
  } catch (err) {
    logError('updateHexBuildQueueEntry: exception', err);
    return { success: false, reason: String(err) };
  }
}

/**
 * Defines the `executeRemoveHexBuildQueueEntry` function shape (export function executeRemoveHexBuildQueueEntry( h3Index: string, entryId: number, requestingPlayerId = 'human' ): { success: boolean; reason?: string; q).

 * Purpose: Supports maintainability by documenting why `executeRemoveHexBuildQueueEntry` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function executeRemoveHexBuildQueueEntry(
  h3Index: string,
  entryId: number,
  requestingPlayerId = 'human'
): { success: boolean; reason?: string; queue?: HexBuildQueueView } {
  logDebug('gameActions removeHexBuildQueueEntry', { h3Index, entryId, requestingPlayerId });
  try {
    const context = validateBuildQueueMutationContext({
      h3Index,
      requestingPlayerId,
      requireBuildSectionVisible: false,
    });
    if (!context.valid) return { success: false, reason: context.reason };
    const rows = listBuildQueueRowsForHex(h3Index);
    const filtered = rows.filter((row) => row.id !== entryId);
    if (filtered.length === rows.length) return { success: false, reason: 'Build queue entry not found.' };
    replaceBuildQueueForHex(
      h3Index,
      filtered.map((row) => ({ unitType: row.unitType, remainingCount: row.remainingCount }))
    );
    syncStandingOrderAfterQueueMutation(h3Index);
    return { success: true, queue: buildQueueViewForRequester(h3Index, requestingPlayerId) };
  } catch (err) {
    logError('removeHexBuildQueueEntry: exception', err);
    return { success: false, reason: String(err) };
  }
}

/**
 * Applies one ordered queue template independently to every requested production hex.
 *
 * Purpose: Provides the authoritative best-effort write used by the renderer's multi-hex queue editor.
 * When to use: Synchronizing a shared template after a selected hex joins or a template row changes.
 * Expected outcome: Valid hexes are replaced in request order, unavailable unit types are reported as
 * skips, and a failure for one hex does not roll back successful sibling writes.
 * Exceptions: Exceptions are captured as per-hex failures and logged at error level.
 */
export function executeApplyBuildQueueTemplateToHexes(
  h3Indexes: string[],
  entries: BuildQueueTemplateEntry[],
  requestingPlayerId = 'human'
): ApplyBuildQueueTemplateResult {
  logDebug('gameActions applyBuildQueueTemplateToHexes', {
    requestingPlayerId,
    hexCount: h3Indexes.length,
    entryCount: entries.length,
  });
  if (h3Indexes.length === 0) {
    return {
      success: false,
      applied: [],
      skipped: [],
      failed: [],
      reason: 'At least one build hex must be selected.',
    };
  }

  const result: ApplyBuildQueueTemplateResult = {
    success: true,
    applied: [],
    skipped: [],
    failed: [],
  };
  const normalizedEntries = entries.map((entry) => ({
    unitType: entry.unitType,
    count: Number.isFinite(entry.count)
      ? Math.min(BUILD_ENTRY_MAX_COUNT, Math.max(BUILD_ENTRY_MIN_COUNT, Math.trunc(entry.count)))
      : BUILD_ENTRY_MIN_COUNT,
  }));

  for (const h3Index of [...new Set(h3Indexes)]) {
    try {
      const context = validateBuildQueueMutationContext({
        h3Index,
        requestingPlayerId,
        requireBuildSectionVisible: true,
      });
      if (!context.valid) {
        result.failed.push({ h3Index, reason: context.reason });
        continue;
      }
      const availableTypes = new Set(context.queueView.availableUnitTypes);
      const applicableEntries = normalizedEntries.flatMap((entry) => {
        if (availableTypes.has(entry.unitType)) {
          return [{ unitType: entry.unitType, remainingCount: entry.count }];
        }
        result.skipped.push({
          h3Index,
          unitType: entry.unitType,
          reason: `Unit type "${entry.unitType}" is not available for this hex.`,
        });
        return [];
      });
      replaceBuildQueueForHex(h3Index, applicableEntries);
      syncStandingOrderAfterQueueMutation(h3Index);
      result.applied.push(h3Index);
    } catch (err) {
      logError('applyBuildQueueTemplateToHexes: exception', { h3Index, err });
      result.failed.push({ h3Index, reason: String(err) });
    }
  }
  result.success = result.failed.length === 0;
  return result;
}

/**
 * Arms or clears Keep building on one or more production hexes (best-effort).
 *
 * Purpose: Authoritative human IPC path for the Keep building checkbox (single- or multi-hex).
 * When to use: After the player toggles Keep building in the build popup.
 * Expected outcome: Enabling sets each hex's type from its last queue row (or keeps an existing standing
 * order when the queue is empty); disabling clears the standing order. Sibling failures do not roll back applied hexes.
 * Exceptions: Per-hex exceptions are captured as failures and logged at error level.
 */
export function executeSetHexesKeepBuilding(
  h3Indexes: string[],
  keepBuilding: boolean,
  requestingPlayerId = 'human'
): SetHexesKeepBuildingResult {
  logDebug('gameActions setHexesKeepBuilding', {
    requestingPlayerId,
    hexCount: h3Indexes.length,
    keepBuilding,
  });
  if (h3Indexes.length === 0) {
    return {
      success: false,
      applied: [],
      failed: [],
      reason: 'At least one build hex must be selected.',
    };
  }

  const result: SetHexesKeepBuildingResult = {
    success: true,
    applied: [],
    failed: [],
  };

  for (const h3Index of [...new Set(h3Indexes)]) {
    try {
      const context = validateBuildQueueMutationContext({
        h3Index,
        requestingPlayerId,
        requireBuildSectionVisible: false,
      });
      if (!context.valid) {
        result.failed.push({ h3Index, reason: context.reason });
        continue;
      }

      if (!keepBuilding) {
        setKeepBuildingForHex(h3Index, false, null);
        result.applied.push(h3Index);
        continue;
      }

      const rows = listBuildQueueRowsForHex(h3Index);
      const existing = getKeepBuildingForHex(h3Index);
      if (rows.length === 0) {
        if (existing.keepBuilding && existing.keepBuildingUnitType) {
          setKeepBuildingForHex(h3Index, true, existing.keepBuildingUnitType);
          result.applied.push(h3Index);
          continue;
        }
        result.failed.push({
          h3Index,
          reason: 'Keep building requires at least one queued unit.',
        });
        continue;
      }

      const lastType = rows[rows.length - 1]!.unitType;
      setKeepBuildingForHex(h3Index, true, lastType);
      result.applied.push(h3Index);
    } catch (err) {
      logError('setHexesKeepBuilding: exception', { h3Index, err });
      result.failed.push({ h3Index, reason: String(err) });
    }
  }

  result.success = result.failed.length === 0;
  return result;
}
