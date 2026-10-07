import { strategicParentOf } from '../../shared/h3Resolutions';

/**
 * Documents the `TacticalOverlayInfrastructureRow` interface as a named contract surface (export interface TacticalOverlayInfrastructureRow).

 * Purpose: Supports maintainability by documenting why `TacticalOverlayInfrastructureRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface TacticalOverlayInfrastructureRow {
    /**
   * Specifies the contract for the `h3Index` member (h3Index: string;).

   * Contract: Describes stable behavior for callers of `h3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3Index: string;
    /**
   * Specifies the contract for the `terrainKind` member (terrainKind: string;).

   * Contract: Describes stable behavior for callers of `terrainKind` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainKind: string;
    /**
   * Specifies the contract for the `isUrban` member (isUrban: boolean;).

   * Contract: Describes stable behavior for callers of `isUrban` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
isUrban: boolean;
    /**
   * Specifies the contract for the `isAirport` member (isAirport?: boolean;).

   * Contract: Describes stable behavior for callers of `isAirport` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
isAirport?: boolean;
    /**
   * Specifies the contract for the `isSeaport` member (isSeaport?: boolean;).

   * Contract: Describes stable behavior for callers of `isSeaport` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
isSeaport?: boolean;
    /**
   * Specifies the contract for the `isRubble` member (isRubble?: boolean;).

   * Contract: Describes stable behavior for callers of `isRubble` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
isRubble?: boolean;
}

/**
 * Documents the `TacticalOverlayEntry` interface as a named contract surface (export interface TacticalOverlayEntry).

 * Purpose: Supports maintainability by documenting why `TacticalOverlayEntry` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface TacticalOverlayEntry {
    /**
   * Specifies the contract for the `terrainKind` member (terrainKind: string;).

   * Contract: Describes stable behavior for callers of `terrainKind` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainKind: string;
    /**
   * Specifies the contract for the `isUrban` member (isUrban: boolean;).

   * Contract: Describes stable behavior for callers of `isUrban` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
isUrban: boolean;
    /**
   * Specifies the contract for the `isAirport` member (isAirport: boolean;).

   * Contract: Describes stable behavior for callers of `isAirport` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
isAirport: boolean;
    /**
   * Specifies the contract for the `isSeaport` member (isSeaport: boolean;).

   * Contract: Describes stable behavior for callers of `isSeaport` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
isSeaport: boolean;
    /**
   * Specifies the contract for the `isRubble` member (isRubble: boolean;).

   * Contract: Describes stable behavior for callers of `isRubble` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
isRubble: boolean;
}

/**
 * Documents the `InfrastructureOverlayStateSnapshot` interface as a named contract surface (export interface InfrastructureOverlayStateSnapshot).

 * Purpose: Supports maintainability by documenting why `InfrastructureOverlayStateSnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface InfrastructureOverlayStateSnapshot {
    /**
   * Specifies the contract for the `tacticalTerrainOverridesByH3` member (tacticalTerrainOverridesByH3: Map<string, TacticalOverlayEntry>;).

   * Contract: Describes stable behavior for callers of `tacticalTerrainOverridesByH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
tacticalTerrainOverridesByH3: Map<string, TacticalOverlayEntry>;
    /**
   * Specifies the contract for the `terrainInfraStrategicAirport` member (terrainInfraStrategicAirport: Set<string>;).

   * Contract: Describes stable behavior for callers of `terrainInfraStrategicAirport` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainInfraStrategicAirport: Set<string>;
    /**
   * Specifies the contract for the `terrainInfraStrategicSeaport` member (terrainInfraStrategicSeaport: Set<string>;).

   * Contract: Describes stable behavior for callers of `terrainInfraStrategicSeaport` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainInfraStrategicSeaport: Set<string>;
    /**
   * Specifies the contract for the `terrainInfraTacticalAirport` member (terrainInfraTacticalAirport: Set<string>;).

   * Contract: Describes stable behavior for callers of `terrainInfraTacticalAirport` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainInfraTacticalAirport: Set<string>;
    /**
   * Specifies the contract for the `terrainInfraTacticalSeaport` member (terrainInfraTacticalSeaport: Set<string>;).

   * Contract: Describes stable behavior for callers of `terrainInfraTacticalSeaport` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainInfraTacticalSeaport: Set<string>;
}

/**
 * Defines the `deriveInfrastructureOverlayState` function shape (export function deriveInfrastructureOverlayState().

 * Purpose: Supports maintainability by documenting why `deriveInfrastructureOverlayState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function deriveInfrastructureOverlayState(
  rows: TacticalOverlayInfrastructureRow[]
): InfrastructureOverlayStateSnapshot {
  const tacticalTerrainOverridesByH3 = new Map(
    rows.map((r) => [
      r.h3Index,
      {
        terrainKind: r.terrainKind,
        isUrban: !!r.isUrban,
        isAirport: !!r.isAirport,
        isSeaport: !!r.isSeaport,
        isRubble: !!r.isRubble,
      },
    ])
  );
  const terrainInfraTacticalAirport = new Set(rows.filter((row) => !!row.isAirport).map((row) => row.h3Index));
  const terrainInfraTacticalSeaport = new Set(rows.filter((row) => !!row.isSeaport).map((row) => row.h3Index));
  const terrainInfraStrategicAirport = new Set<string>();
  const terrainInfraStrategicSeaport = new Set<string>();
  for (const row of rows) {
    if (!row.isAirport && !row.isSeaport) continue;
    const parentH3 = strategicParentOf(row.h3Index);
    if (row.isAirport) terrainInfraStrategicAirport.add(parentH3);
    if (row.isSeaport) terrainInfraStrategicSeaport.add(parentH3);
  }
  return {
    tacticalTerrainOverridesByH3,
    terrainInfraStrategicAirport,
    terrainInfraStrategicSeaport,
    terrainInfraTacticalAirport,
    terrainInfraTacticalSeaport,
  };
}
