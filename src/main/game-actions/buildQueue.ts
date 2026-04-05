import { dbGetOne, dbRun, getHexController, listBuildQueueRowsForHex, replaceBuildQueueForHex, getRes1InfrastructureForHex } from '../gameDb';
import { logDebug, logError, logTrace } from '../logger';
import {
  BUILD_ENTRY_MAX_COUNT,
  BUILD_ENTRY_MIN_COUNT,
  NO_PRODUCTION_INFRASTRUCTURE_REASON,
  getAvailableBuildUnitTypes,
  isValidBuildCount,
  type BuildUnitType,
} from '../productionRules';
import type { Res1ProductionContextSnapshot } from '../../shared/ipcTypes';

export interface HexBuildQueueEntryView {
  id: number;
  queueIndex: number;
  unitType: BuildUnitType;
  count: number;
}

export interface HexBuildQueueView {
  h3Index: string;
  controllerPlayerId: string | null;
  controlledByRequester: boolean;
  urbanHexCount: number;
  seaportCount: number;
  airportCount: number;
  availableUnitTypes: BuildUnitType[];
  buildSectionVisible: boolean;
  noBuildReason: string | null;
  entries: HexBuildQueueEntryView[];
}

interface ProductionEligibilityView extends Res1ProductionContextSnapshot {
  availableUnitTypes: BuildUnitType[];
  buildSectionVisible: boolean;
  noBuildReason: string | null;
}

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

function buildQueueViewForRequester(h3Index: string, requestingPlayerId: string): HexBuildQueueView {
  const controllerPlayerId = getHexController(h3Index);
  const controlledByRequester = controllerPlayerId === requestingPlayerId;
  const productionView = buildProductionEligibilityView(getRes1InfrastructureForHex(h3Index));
  return {
    h3Index,
    controllerPlayerId,
    controlledByRequester,
    urbanHexCount: productionView.urbanHexCount,
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

function validateBuildQueueMutationContext(args: {
  h3Index: string;
  requestingPlayerId: string;
  requireBuildSectionVisible: boolean;
}): { valid: true; queueView: HexBuildQueueView } | { valid: false; reason: string } {
  const phase = dbGetOne<{ phase: string }>('SELECT phase FROM turn_state WHERE id = 1')?.phase ?? 'planning';
  if (phase !== 'planning') {
    return { valid: false, reason: 'Build queue can only be edited during planning phase.' };
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

export function getHexBuildQueueImpl(h3Index: string, requestingPlayerId = 'human'): HexBuildQueueView {
  logTrace('gameActions getHexBuildQueue', { h3Index, requestingPlayerId });
  return buildQueueViewForRequester(h3Index, requestingPlayerId);
}

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
