import type {
  AirStrikeOrder,
  BuildQueueTemplateEntry,
  EmbarkOrder,
  FerryOrder,
} from '../shared/ipcTypes';
import type { TacticalOpponentPlanPayload } from '../shared/ipc/readyTypes';

/**
 * Documents the `GroupTargetType` type alias (type GroupTargetType).

 * Purpose: Supports maintainability by documenting why `GroupTargetType` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type GroupTargetType = 'units' | 'urban' | 'airport' | 'seaport';
/**
 * Documents the `BuildQueueUnitType` type alias (type BuildQueueUnitType).

 * Purpose: Supports maintainability by documenting why `BuildQueueUnitType` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type BuildQueueUnitType = 'infantry' | 'armor' | 'naval' | 'air';

/**
 * Defines the `parseUnitIdList` function shape (export function parseUnitIdList(unitIds: unknown): string[] | null).

 * Purpose: Supports maintainability by documenting why `parseUnitIdList` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function parseUnitIdList(unitIds: unknown): string[] | null {
  if (!Array.isArray(unitIds)) return null;
  return unitIds.filter((unitId): unitId is string => typeof unitId === 'string' && unitId.length > 0);
}

/**
 * Parses a unit-id list plus one H3 string for grouped IPC payloads.
 *
 * Purpose: Shares the unit-id and H3 string checks used by target and destination grouped parsers.
 * When to use: From `parseGroupedTargetPayload` and `parseGroupedDestinationPayload` only.
 * Expected outcome: `{ unitIds, h3Index }` when both fields are valid; otherwise null. Unit ids are checked first.
 * Exceptions: None.
 */
function parseUnitIdsWithH3(
  unitIdsRaw: unknown,
  h3IndexRaw: unknown
): { unitIds: string[]; h3Index: string } | null {
  const unitIds = parseUnitIdList(unitIdsRaw);
  if (unitIds === null) return null;
  if (typeof h3IndexRaw !== 'string') return null;
  return { unitIds, h3Index: h3IndexRaw };
}

/**
 * Defines the `parseGroupedStrikePayload` function shape (export function parseGroupedStrikePayload(payload: { unitIds?: unknown; targetH3Index?: unknown; targetType?: unknown; }): { unitIds: string[]; target).

 * Purpose: Supports maintainability by documenting why `parseGroupedStrikePayload` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function parseGroupedStrikePayload(payload: {
  unitIds?: unknown;
  targetH3Index?: unknown;
  targetType?: unknown;
}): { unitIds: string[]; targetH3Index: string; targetType: GroupTargetType } | null {
  const unitIds = parseUnitIdList(payload?.unitIds);
  if (unitIds === null) return null;
  if (typeof payload?.targetH3Index !== 'string') return null;
  if (
    payload?.targetType !== 'units' &&
    payload?.targetType !== 'urban' &&
    payload?.targetType !== 'airport' &&
    payload?.targetType !== 'seaport'
  ) {
    return null;
  }
  return { unitIds, targetH3Index: payload.targetH3Index, targetType: payload.targetType };
}

/**
 * Parses grouped target IPC payloads (`unitIds` plus `targetH3Index`).
 *
 * Purpose: Keeps the public `targetH3Index` field name while sharing unit-id and H3 string checks.
 * When to use: Grouped target-hex IPC handlers in `main.ts`.
 * Expected outcome: `{ unitIds, targetH3Index }` when both fields are valid; otherwise null. Unit ids are checked first.
 * Exceptions: None.
 */
export function parseGroupedTargetPayload(payload: {
  unitIds?: unknown;
  targetH3Index?: unknown;
}): { unitIds: string[]; targetH3Index: string } | null {
  const parsed = parseUnitIdsWithH3(payload?.unitIds, payload?.targetH3Index);
  if (!parsed) return null;
  return { unitIds: parsed.unitIds, targetH3Index: parsed.h3Index };
}

/**
 * Parses grouped destination IPC payloads (`unitIds` plus `destinationH3Index`).
 *
 * Purpose: Keeps the public `destinationH3Index` field name while sharing unit-id and H3 string checks.
 * When to use: Grouped move/destination IPC handlers in `main.ts`.
 * Expected outcome: `{ unitIds, destinationH3Index }` when both fields are valid; otherwise null. Unit ids are checked first.
 * Exceptions: None.
 */
export function parseGroupedDestinationPayload(payload: {
  unitIds?: unknown;
  destinationH3Index?: unknown;
}): { unitIds: string[]; destinationH3Index: string } | null {
  const parsed = parseUnitIdsWithH3(payload?.unitIds, payload?.destinationH3Index);
  if (!parsed) return null;
  return { unitIds: parsed.unitIds, destinationH3Index: parsed.h3Index };
}

/**
 * Defines the `parseBuildQueueUpdatePayload` function shape (export function parseBuildQueueUpdatePayload(payload: { h3Index?: unknown; entryId?: unknown; unitType?: unknown; count?: unknown; }): { h3Index: s).

 * Purpose: Supports maintainability by documenting why `parseBuildQueueUpdatePayload` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function parseBuildQueueUpdatePayload(payload: {
  h3Index?: unknown;
  entryId?: unknown;
  unitType?: unknown;
  count?: unknown;
}): { h3Index: string; entryId: number; unitType: BuildQueueUnitType; count: number } | null {
  if (typeof payload?.h3Index !== 'string' || typeof payload?.entryId !== 'number' || typeof payload?.count !== 'number') {
    return null;
  }
  if (
    payload?.unitType !== 'infantry' &&
    payload?.unitType !== 'armor' &&
    payload?.unitType !== 'naval' &&
    payload?.unitType !== 'air'
  ) {
    return null;
  }
  return { h3Index: payload.h3Index, entryId: payload.entryId, unitType: payload.unitType, count: payload.count };
}

/**
 * Validates the renderer payload for applying a shared build queue template.
 *
 * Purpose: Keeps unknown IPC values out of the authoritative batch mutation.
 * When to use: Main-process handler for `game:applyBuildQueueTemplateToHexes`.
 * Expected outcome: Non-empty string hex ids and typed numeric template rows, or `null`.
 * Exceptions: None; malformed input returns `null`.
 */
export function parseBuildQueueTemplatePayload(payload: unknown): {
  h3Indexes: string[];
  entries: BuildQueueTemplateEntry[];
} | null {
  if (payload === null || typeof payload !== 'object') return null;
  const value = payload as { h3Indexes?: unknown; entries?: unknown };
  if (!Array.isArray(value.h3Indexes) || !Array.isArray(value.entries)) return null;
  if (!value.h3Indexes.every((h3Index) => typeof h3Index === 'string' && h3Index.length > 0)) return null;
  const entries: BuildQueueTemplateEntry[] = [];
  for (const entry of value.entries) {
    if (entry === null || typeof entry !== 'object') return null;
    const row = entry as { unitType?: unknown; count?: unknown };
    if (
      row.unitType !== 'infantry' &&
      row.unitType !== 'armor' &&
      row.unitType !== 'naval' &&
      row.unitType !== 'air'
    ) {
      return null;
    }
    if (typeof row.count !== 'number' || !Number.isFinite(row.count)) return null;
    entries.push({ unitType: row.unitType, count: row.count });
  }
  return { h3Indexes: value.h3Indexes, entries };
}

/**
 * Validates the renderer payload for Keep-building arm/disarm.
 *
 * Purpose: Keeps unknown IPC values out of the authoritative Keep-building mutation.
 * When to use: Main-process handler for `game:setHexesKeepBuilding`.
 * Expected outcome: Non-empty string hex ids and a boolean flag, or `null`.
 * Exceptions: None; malformed input returns `null`.
 */
export function parseSetHexesKeepBuildingPayload(payload: unknown): {
  h3Indexes: string[];
  keepBuilding: boolean;
} | null {
  if (payload === null || typeof payload !== 'object') return null;
  const value = payload as { h3Indexes?: unknown; keepBuilding?: unknown };
  if (!Array.isArray(value.h3Indexes) || typeof value.keepBuilding !== 'boolean') return null;
  if (!value.h3Indexes.every((h3Index) => typeof h3Index === 'string' && h3Index.length > 0)) return null;
  return { h3Indexes: value.h3Indexes, keepBuilding: value.keepBuilding };
}

/**
 * Normalized tactical Ready commit rows after IPC `unknown` validation.
 *
 * Purpose: Gives `commitHumanTacticalDraftOrders` typed inputs without duplicating guard loops in `main.ts`.
 * When to use: Only from the `game:commitHumanTacticalDraftOrders` handler after parsing the renderer payload.
 * Expected outcome: All arrays are concrete (possibly empty); movement rows are fully validated.
 * Exceptions: Returns `ok: false` with a stable reason string instead of throwing.
 */
export type ParsedHumanTacticalCommitOrders = {
  movementOrders: { unitId: string; toH3Index: string }[];
  rangedAttacks: { unitId: string; targetH3Index: string }[];
  airStrikes: AirStrikeOrder[];
  ferryOrders: FerryOrder[];
  embarkOrders: EmbarkOrder[];
  opponentTacticalDraft?: TacticalOpponentPlanPayload;
  /**
   * When true, main may run post-beat event-driven AI consultation after a successful tactical commit.
   */
  useEventDrivenConsultation?: boolean;
  /**
   * When true with `useEventDrivenConsultation`, Run-mode AI hooks are allowed to invoke the model after the beat.
   */
  aiPlanningRunEnabled?: boolean;
};

/**
 * Validates and normalizes the renderer tactical draft commit payload for IPC.
 *
 * Purpose: Keeps tactical commit validation unit-testable and identical to the prior inline `main.ts` checks.
 * When to use: `ipcMain.handle` for tactical Ready commit before calling `commitHumanTacticalDraftOrders`.
 * Expected outcome: `ok: true` with normalized order arrays, or `ok: false` with reason `Invalid tactical commit payload`.
 * Exceptions: None; invalid shapes return `ok: false`.
 */
export function parseHumanTacticalCommitPayload(
  payload: unknown
): { ok: true; value: ParsedHumanTacticalCommitOrders } | { ok: false; reason: string } {
  const invalid = 'Invalid tactical commit payload';
  if (payload === null || typeof payload !== 'object') {
    return { ok: false, reason: invalid };
  }
  const p = payload as {
    movementOrders?: unknown;
    rangedAttacks?: unknown;
    airStrikes?: unknown;
    ferryOrders?: unknown;
    embarkOrders?: unknown;
    useEventDrivenConsultation?: unknown;
    aiPlanningRunEnabled?: unknown;
  };
  const useEventDrivenConsultation = p.useEventDrivenConsultation === true;
  const aiPlanningRunEnabled = p.aiPlanningRunEnabled === true;
  const movementRaw = p.movementOrders;
  if (!Array.isArray(movementRaw)) return { ok: false, reason: invalid };
  const movementOrders: { unitId: string; toH3Index: string }[] = [];
  for (const row of movementRaw) {
    if (typeof row !== 'object' || row === null) return { ok: false, reason: invalid };
    const r = row as { unitId?: unknown; toH3Index?: unknown };
    if (typeof r.unitId !== 'string' || typeof r.toH3Index !== 'string') {
      return { ok: false, reason: invalid };
    }
    movementOrders.push({ unitId: r.unitId, toH3Index: r.toH3Index });
  }
  const rangedRaw = p.rangedAttacks ?? [];
  if (!Array.isArray(rangedRaw)) return { ok: false, reason: invalid };
  const rangedAttacks: { unitId: string; targetH3Index: string }[] = [];
  for (const row of rangedRaw) {
    if (typeof row !== 'object' || row === null) return { ok: false, reason: invalid };
    const r = row as { unitId?: unknown; targetH3Index?: unknown };
    if (typeof r.unitId !== 'string' || typeof r.targetH3Index !== 'string') {
      return { ok: false, reason: invalid };
    }
    rangedAttacks.push({ unitId: r.unitId, targetH3Index: r.targetH3Index });
  }
  const airRaw = p.airStrikes ?? [];
  if (!Array.isArray(airRaw)) return { ok: false, reason: invalid };
  const airStrikes: AirStrikeOrder[] = [];
  for (const row of airRaw) {
    if (typeof row !== 'object' || row === null) return { ok: false, reason: invalid };
    const r = row as { unitId?: unknown; targetH3Index?: unknown; targetType?: unknown };
    if (
      typeof r.unitId !== 'string' ||
      typeof r.targetH3Index !== 'string' ||
      (r.targetType !== 'units' &&
        r.targetType !== 'urban' &&
        r.targetType !== 'airport' &&
        r.targetType !== 'seaport')
    ) {
      return { ok: false, reason: invalid };
    }
    airStrikes.push({ unitId: r.unitId, targetH3Index: r.targetH3Index, targetType: r.targetType });
  }
  const ferryRaw = p.ferryOrders ?? [];
  if (!Array.isArray(ferryRaw)) return { ok: false, reason: invalid };
  const ferryOrders: FerryOrder[] = [];
  for (const row of ferryRaw) {
    if (typeof row !== 'object' || row === null) return { ok: false, reason: invalid };
    const r = row as { unitId?: unknown; destinationH3Index?: unknown };
    if (typeof r.unitId !== 'string' || typeof r.destinationH3Index !== 'string') {
      return { ok: false, reason: invalid };
    }
    ferryOrders.push({ unitId: r.unitId, destinationH3Index: r.destinationH3Index });
  }
  const embarkRaw = p.embarkOrders ?? [];
  if (!Array.isArray(embarkRaw)) return { ok: false, reason: invalid };
  const embarkOrders: EmbarkOrder[] = [];
  for (const row of embarkRaw) {
    if (typeof row !== 'object' || row === null) return { ok: false, reason: invalid };
    const r = row as { unitId?: unknown; navalUnitId?: unknown };
    if (typeof r.unitId !== 'string' || typeof r.navalUnitId !== 'string') {
      return { ok: false, reason: invalid };
    }
    embarkOrders.push({ unitId: r.unitId, navalUnitId: r.navalUnitId });
  }
  let opponentTacticalDraft: TacticalOpponentPlanPayload | undefined;
  const oppRaw = (p as { opponentTacticalDraft?: unknown }).opponentTacticalDraft;
  if (oppRaw !== undefined) {
    if (oppRaw === null || typeof oppRaw !== 'object') return { ok: false, reason: invalid };
    const o = oppRaw as {
      movementOrders?: unknown;
      rangedAttacks?: unknown;
      airStrikes?: unknown;
      ferryOrders?: unknown;
      embarkOrders?: unknown;
    };
    const omRaw = o.movementOrders ?? [];
    if (!Array.isArray(omRaw)) return { ok: false, reason: invalid };
    const om: { unitId: string; toH3Index: string }[] = [];
    for (const row of omRaw) {
      if (typeof row !== 'object' || row === null) return { ok: false, reason: invalid };
      const r = row as { unitId?: unknown; toH3Index?: unknown };
      if (typeof r.unitId !== 'string' || typeof r.toH3Index !== 'string') return { ok: false, reason: invalid };
      om.push({ unitId: r.unitId, toH3Index: r.toH3Index });
    }
    const orRaw = o.rangedAttacks ?? [];
    if (!Array.isArray(orRaw)) return { ok: false, reason: invalid };
    const ora: { unitId: string; targetH3Index: string }[] = [];
    for (const row of orRaw) {
      if (typeof row !== 'object' || row === null) return { ok: false, reason: invalid };
      const r = row as { unitId?: unknown; targetH3Index?: unknown };
      if (typeof r.unitId !== 'string' || typeof r.targetH3Index !== 'string') return { ok: false, reason: invalid };
      ora.push({ unitId: r.unitId, targetH3Index: r.targetH3Index });
    }
    const oaRaw = o.airStrikes ?? [];
    if (!Array.isArray(oaRaw)) return { ok: false, reason: invalid };
    const oa: AirStrikeOrder[] = [];
    for (const row of oaRaw) {
      if (typeof row !== 'object' || row === null) return { ok: false, reason: invalid };
      const r = row as { unitId?: unknown; targetH3Index?: unknown; targetType?: unknown };
      if (
        typeof r.unitId !== 'string' ||
        typeof r.targetH3Index !== 'string' ||
        (r.targetType !== 'units' &&
          r.targetType !== 'urban' &&
          r.targetType !== 'airport' &&
          r.targetType !== 'seaport')
      ) {
        return { ok: false, reason: invalid };
      }
      oa.push({ unitId: r.unitId, targetH3Index: r.targetH3Index, targetType: r.targetType });
    }
    const ofRaw = o.ferryOrders ?? [];
    if (!Array.isArray(ofRaw)) return { ok: false, reason: invalid };
    const ofe: FerryOrder[] = [];
    for (const row of ofRaw) {
      if (typeof row !== 'object' || row === null) return { ok: false, reason: invalid };
      const r = row as { unitId?: unknown; destinationH3Index?: unknown };
      if (typeof r.unitId !== 'string' || typeof r.destinationH3Index !== 'string') {
        return { ok: false, reason: invalid };
      }
      ofe.push({ unitId: r.unitId, destinationH3Index: r.destinationH3Index });
    }
    const oeRaw = o.embarkOrders ?? [];
    if (!Array.isArray(oeRaw)) return { ok: false, reason: invalid };
    const oe: EmbarkOrder[] = [];
    for (const row of oeRaw) {
      if (typeof row !== 'object' || row === null) return { ok: false, reason: invalid };
      const r = row as { unitId?: unknown; navalUnitId?: unknown };
      if (typeof r.unitId !== 'string' || typeof r.navalUnitId !== 'string') {
        return { ok: false, reason: invalid };
      }
      oe.push({ unitId: r.unitId, navalUnitId: r.navalUnitId });
    }
    opponentTacticalDraft = {
      movementOrders: om,
      rangedAttacks: ora,
      airStrikes: oa,
      ferryOrders: ofe,
      embarkOrders: oe,
    };
  }
  return {
    ok: true,
    value: {
      movementOrders,
      rangedAttacks,
      airStrikes,
      ferryOrders,
      embarkOrders,
      opponentTacticalDraft,
      useEventDrivenConsultation,
      aiPlanningRunEnabled,
    },
  };
}
