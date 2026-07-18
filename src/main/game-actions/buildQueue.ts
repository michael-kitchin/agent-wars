import {
  dbGetOne,
  dbRun,
  getBuildProgressPointsForHex,
  getHexController,
  listBuildQueueRowsForHex,
  replaceBuildQueueForHex,
  getRes1InfrastructureForHex,
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
  Res1ProductionContextSnapshot,
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
}

/**
 * Documents the `ProductionEligibilityView` interface as a named contract surface (interface ProductionEligibilityView extends Res1ProductionContextSnapshot).

 * Purpose: Supports maintainability by documenting why `ProductionEligibilityView` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface ProductionEligibilityView extends Res1ProductionContextSnapshot {
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
  productionContext: Res1ProductionContextSnapshot
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
 * Defines the `buildQueueViewForRequester` function shape (function buildQueueViewForRequester(h3Index: string, requestingPlayerId: string): HexBuildQueueView).

 * Purpose: Supports maintainability by documenting why `buildQueueViewForRequester` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildQueueViewForRequester(h3Index: string, requestingPlayerId: string): HexBuildQueueView {
  const controllerPlayerId = getHexController(h3Index);
  const controlledByRequester = controllerPlayerId === requestingPlayerId;
  const productionView = buildProductionEligibilityView(getRes1InfrastructureForHex(h3Index));
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
  };
}

/**
 * Defines the `validateBuildQueueMutationContext` function shape (function validateBuildQueueMutationContext(args: { h3Index: string; requestingPlayerId: string; requireBuildSectionVisible: boolean; }): { valid: true).

 * Purpose: Supports maintainability by documenting why `validateBuildQueueMutationContext` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
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
  if (isTacticalBattleActive()) {
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
 * Defines the `getHexBuildQueueImpl` function shape (export function getHexBuildQueueImpl(h3Index: string, requestingPlayerId = 'human'): HexBuildQueueView).

 * Purpose: Supports maintainability by documenting why `getHexBuildQueueImpl` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getHexBuildQueueImpl(h3Index: string, requestingPlayerId = 'human'): HexBuildQueueView {
  logTrace('gameActions getHexBuildQueue', { h3Index, requestingPlayerId });
  return buildQueueViewForRequester(h3Index, requestingPlayerId);
}

/**
 * Defines the `addHexBuildQueueEntryImpl` function shape (export function addHexBuildQueueEntryImpl(h3Index: string, requestingPlayerId = 'human'): { success: boolean; reason?: string; queue?: HexBuildQueueVie).

 * Purpose: Supports maintainability by documenting why `addHexBuildQueueEntryImpl` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function addHexBuildQueueEntryImpl(h3Index: string, requestingPlayerId = 'human'): {
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
      `INSERT INTO res1_build_queue (h3_index, queue_index, unit_type, remaining_count)
       VALUES (?, ?, ?, ?)`,
      [h3Index, currentRows.length, defaultUnitType, BUILD_ENTRY_MIN_COUNT]
    );
    return { success: true, queue: buildQueueViewForRequester(h3Index, requestingPlayerId) };
  } catch (err) {
    logError('addHexBuildQueueEntry: exception', err);
    return { success: false, reason: String(err) };
  }
}

/**
 * Defines the `updateHexBuildQueueEntryImpl` function shape (export function updateHexBuildQueueEntryImpl( h3Index: string, entryId: number, unitType: BuildUnitType, count: number, requestingPlayerId = 'hum).

 * Purpose: Supports maintainability by documenting why `updateHexBuildQueueEntryImpl` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function updateHexBuildQueueEntryImpl(
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
    const row = dbGetOne<{ id: number }>('SELECT id FROM res1_build_queue WHERE id = ? AND h3_index = ?', [entryId, h3Index]);
    if (!row) return { success: false, reason: 'Build queue entry not found.' };
    dbRun('UPDATE res1_build_queue SET unit_type = ?, remaining_count = ? WHERE id = ?', [unitType, count, entryId]);
    return { success: true, queue: buildQueueViewForRequester(h3Index, requestingPlayerId) };
  } catch (err) {
    logError('updateHexBuildQueueEntry: exception', err);
    return { success: false, reason: String(err) };
  }
}

/**
 * Defines the `removeHexBuildQueueEntryImpl` function shape (export function removeHexBuildQueueEntryImpl( h3Index: string, entryId: number, requestingPlayerId = 'human' ): { success: boolean; reason?: string; q).

 * Purpose: Supports maintainability by documenting why `removeHexBuildQueueEntryImpl` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function removeHexBuildQueueEntryImpl(
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
export function applyBuildQueueTemplateToHexesImpl(
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
      result.applied.push(h3Index);
    } catch (err) {
      logError('applyBuildQueueTemplateToHexes: exception', { h3Index, err });
      result.failed.push({ h3Index, reason: String(err) });
    }
  }
  result.success = result.failed.length === 0;
  return result;
}
