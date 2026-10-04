import { cellToParent } from 'h3-js';
import { STRATEGIC_H3_RESOLUTION } from '../../shared/h3Resolutions';

/**
 * Documents the `Res4OverlayInfrastructureRow` interface as a named contract surface (export interface Res4OverlayInfrastructureRow).

 * Purpose: Supports maintainability by documenting why `Res4OverlayInfrastructureRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface Res4OverlayInfrastructureRow {
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
 * Documents the `Res4OverlayEntry` interface as a named contract surface (export interface Res4OverlayEntry).

 * Purpose: Supports maintainability by documenting why `Res4OverlayEntry` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface Res4OverlayEntry {
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
   * Specifies the contract for the `res4TerrainOverridesByH3` member (res4TerrainOverridesByH3: Map<string, Res4OverlayEntry>;).

   * Contract: Describes stable behavior for callers of `res4TerrainOverridesByH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
res4TerrainOverridesByH3: Map<string, Res4OverlayEntry>;
    /**
   * Specifies the contract for the `terrainInfraRes1Airport` member (terrainInfraRes1Airport: Set<string>;).

   * Contract: Describes stable behavior for callers of `terrainInfraRes1Airport` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainInfraRes1Airport: Set<string>;
    /**
   * Specifies the contract for the `terrainInfraRes1Seaport` member (terrainInfraRes1Seaport: Set<string>;).

   * Contract: Describes stable behavior for callers of `terrainInfraRes1Seaport` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainInfraRes1Seaport: Set<string>;
    /**
   * Specifies the contract for the `terrainInfraRes4Airport` member (terrainInfraRes4Airport: Set<string>;).

   * Contract: Describes stable behavior for callers of `terrainInfraRes4Airport` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainInfraRes4Airport: Set<string>;
    /**
   * Specifies the contract for the `terrainInfraRes4Seaport` member (terrainInfraRes4Seaport: Set<string>;).

   * Contract: Describes stable behavior for callers of `terrainInfraRes4Seaport` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainInfraRes4Seaport: Set<string>;
}

/**
 * Defines the `deriveInfrastructureOverlayState` function shape (export function deriveInfrastructureOverlayState().

 * Purpose: Supports maintainability by documenting why `deriveInfrastructureOverlayState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function deriveInfrastructureOverlayState(
  rows: Res4OverlayInfrastructureRow[]
): InfrastructureOverlayStateSnapshot {
  const res4TerrainOverridesByH3 = new Map(
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
  const terrainInfraRes4Airport = new Set(rows.filter((row) => !!row.isAirport).map((row) => row.h3Index));
  const terrainInfraRes4Seaport = new Set(rows.filter((row) => !!row.isSeaport).map((row) => row.h3Index));
  const terrainInfraRes1Airport = new Set<string>();
  const terrainInfraRes1Seaport = new Set<string>();
  for (const row of rows) {
    if (!row.isAirport && !row.isSeaport) continue;
    const parentH3 = cellToParent(row.h3Index, STRATEGIC_H3_RESOLUTION);
    if (row.isAirport) terrainInfraRes1Airport.add(parentH3);
    if (row.isSeaport) terrainInfraRes1Seaport.add(parentH3);
  }
  return {
    res4TerrainOverridesByH3,
    terrainInfraRes1Airport,
    terrainInfraRes1Seaport,
    terrainInfraRes4Airport,
    terrainInfraRes4Seaport,
  };
}
