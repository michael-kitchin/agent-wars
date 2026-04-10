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
 * Defines the `parseGroupedTargetPayload` function shape (export function parseGroupedTargetPayload(payload: { unitIds?: unknown; targetH3Index?: unknown; }): { unitIds: string[]; targetH3Index: string } | null).

 * Purpose: Supports maintainability by documenting why `parseGroupedTargetPayload` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function parseGroupedTargetPayload(payload: {
  unitIds?: unknown;
  targetH3Index?: unknown;
}): { unitIds: string[]; targetH3Index: string } | null {
  const unitIds = parseUnitIdList(payload?.unitIds);
  if (unitIds === null || typeof payload?.targetH3Index !== 'string') return null;
  return { unitIds, targetH3Index: payload.targetH3Index };
}

/**
 * Defines the `parseGroupedDestinationPayload` function shape (export function parseGroupedDestinationPayload(payload: { unitIds?: unknown; destinationH3Index?: unknown; }): { unitIds: string[]; destinationH3Index: s).

 * Purpose: Supports maintainability by documenting why `parseGroupedDestinationPayload` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function parseGroupedDestinationPayload(payload: {
  unitIds?: unknown;
  destinationH3Index?: unknown;
}): { unitIds: string[]; destinationH3Index: string } | null {
  const unitIds = parseUnitIdList(payload?.unitIds);
  if (unitIds === null || typeof payload?.destinationH3Index !== 'string') return null;
  return { unitIds, destinationH3Index: payload.destinationH3Index };
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
