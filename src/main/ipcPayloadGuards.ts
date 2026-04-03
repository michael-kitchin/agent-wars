/**
 * Shared IPC payload guards for main-process handlers.
 * Keeps request validation consistent across grouped movement/combat/build endpoints.
 */

type GroupTargetType = 'units' | 'urban' | 'airport' | 'seaport';
type BuildQueueUnitType = 'infantry' | 'armor' | 'naval' | 'air';

/**
 * Why this exists:
 *     Normalizes unknown unit-id arrays into compact string lists for grouped IPC handlers.
 * When to use:
 *     Any handler receiving a free-form `unitIds` array from renderer payloads.
 * What to expect:
 *     Returns null for invalid payload shape; otherwise returns only non-empty string IDs.
 */
export function parseUnitIdList(unitIds: unknown): string[] | null {
  if (!Array.isArray(unitIds)) return null;
  return unitIds.filter((unitId): unitId is string => typeof unitId === 'string' && unitId.length > 0);
}

/**
 * Why this exists:
 *     Validates grouped target-type payloads for strike endpoints.
 * When to use:
 *     Main-process grouped strike validation handler before delegating to game actions.
 * What to expect:
 *     Returns null for invalid payload shape; otherwise returns normalized unit IDs and target arguments.
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

export function parseGroupedTargetPayload(payload: {
  unitIds?: unknown;
  targetH3Index?: unknown;
}): { unitIds: string[]; targetH3Index: string } | null {
  const unitIds = parseUnitIdList(payload?.unitIds);
  if (unitIds === null || typeof payload?.targetH3Index !== 'string') return null;
  return { unitIds, targetH3Index: payload.targetH3Index };
}

export function parseGroupedDestinationPayload(payload: {
  unitIds?: unknown;
  destinationH3Index?: unknown;
}): { unitIds: string[]; destinationH3Index: string } | null {
  const unitIds = parseUnitIdList(payload?.unitIds);
  if (unitIds === null || typeof payload?.destinationH3Index !== 'string') return null;
  return { unitIds, destinationH3Index: payload.destinationH3Index };
}

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
