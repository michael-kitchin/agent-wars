import type { BuildUnitType } from './productionTypes';
import type { TacticalBattleSnapshot } from './tacticalTypes';
import type { GameSize } from '../gameSize';

/**
 * Documents the `GameStateSnapshot` interface as a named contract surface (export interface GameStateSnapshot).

 * Purpose: Supports maintainability by documenting why `GameStateSnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface GameStateSnapshot {
    /**
   * Specifies the contract for the `hexes` member (hexes: { h3Index: string; terrain: string; terrainKind: string }[];).

   * Contract: Describes stable behavior for callers of `hexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hexes: { h3Index: string; terrain: string; terrainKind: string }[];
    /**
   * Specifies the contract for the `units` member (units: tactical-capable unit rows including optional embarkedOnSubUnitId).

   * Contract: Describes stable behavior for callers of `units` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
units: {
    id: string;
    player: string;
    unitType: string;
    h3Index: string;
    displayOrder?: number;
    /**
     * Strategic sealift: naval carrier id when cargo is still assigned (`unit_transport_assignments`).
     *
     * Contract: Present on strategic snapshots from `listUnitsForSnapshot`; tactical battles may use `embarkedOnSubUnitId` instead.
     * When to use: Block map/sidebar selection and show embark state without extra IPC.
     * Expected outcome: When set, the land unit cannot receive independent movement until debarked.
     * Exceptions: None.
     */
    embarkedOnNavalUnitId?: string | null;
    /**
     * Tactical-only: land unit embarked on a naval sub-unit id for in-memory sealift parity.
     *
     * Contract: Present only on snapshots built from an active tactical battle for AI validation.
     * When to use: Reject independent march orders for cargo while keeping carrier hex alignment.
     * Expected outcome: When set, validators treat the unit as occupying its carrier's cell.
     * Exceptions: None.
     */
    embarkedOnSubUnitId?: string | null;
  }[];
    /**
   * Specifies the contract for the `visibleHexes` member (visibleHexes?: string[];).

   * Contract: Describes stable behavior for callers of `visibleHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
visibleHexes?: string[];
    /**
   * Specifies the contract for the `exploredHexes` member (exploredHexes?: string[];).

   * Contract: Describes stable behavior for callers of `exploredHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
exploredHexes?: string[];
    /**
   * Specifies the contract for the `staleHexes` member (staleHexes?: string[];).

   * Contract: Describes stable behavior for callers of `staleHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
staleHexes?: string[];
    /**
   * Specifies the contract for the `enemyIntel` member (enemyIntel?: { unitId: string; lastKnownH3Index: string; lastKnownLatLng: [number, number]; intelState: 'current' | 'stale'; lastSeenTu).

   * Contract: Describes stable behavior for callers of `enemyIntel` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
enemyIntel?: {
    unitId: string;
    lastKnownH3Index: string;
    lastKnownLatLng: [number, number];
    intelState: 'current' | 'stale';
    lastSeenTurn: number;
    staleUntilTurn: number;
  }[];
    /**
   * Specifies the contract for the `playerPerspective` member (playerPerspective?: string;).

   * Contract: Describes stable behavior for callers of `playerPerspective` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
playerPerspective?: string;
    /**
   * Specifies the contract for the `fogOfWarEnabled` member (fogOfWarEnabled?: boolean;).

   * Contract: Describes stable behavior for callers of `fogOfWarEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
fogOfWarEnabled?: boolean;
    /**
   * Specifies the contract for the `gameSize` member (gameSize?: GameSize;).

   * Contract: Match size that scales per-type unit caps. Readers must `parseGameSize` so omitted/invalid values behave as Small.
   * When to use: Production overlay, briefings, and any UI that needs the live deployment ceiling.
   * Expected outcome: `'small' | 'medium' | 'large'` when the snapshot was built from a persisted match; may be omitted on test fixtures.
   * Exceptions: None; missing means Small.
   */
gameSize?: GameSize;
    /**
   * Specifies the contract for the `scenarioId` member (scenarioId?: 'region_vs_region';).

   * Contract: Describes stable behavior for callers of `scenarioId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
scenarioId?: 'region_vs_region';
    /**
   * Specifies the contract for the `humanHomeRegion` member (humanHomeRegion?: string;).

   * Contract: Describes stable behavior for callers of `humanHomeRegion` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
humanHomeRegion?: string;
    /**
   * Specifies the contract for the `aiHomeRegion` member (aiHomeRegion?: string;).

   * Contract: Describes stable behavior for callers of `aiHomeRegion` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
aiHomeRegion?: string;
    /**
   * Specifies the contract for the `humanHomeRegionHexes` member (humanHomeRegionHexes?: string[];).

   * Contract: Describes stable behavior for callers of `humanHomeRegionHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
humanHomeRegionHexes?: string[];
    /**
   * Specifies the contract for the `aiHomeRegionHexes` member (aiHomeRegionHexes?: string[];).

   * Contract: Describes stable behavior for callers of `aiHomeRegionHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
aiHomeRegionHexes?: string[];
    /**
   * Specifies the contract for the `intersectingHomeRegionHexes` member (intersectingHomeRegionHexes?: string[];).

   * Contract: Describes stable behavior for callers of `intersectingHomeRegionHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
intersectingHomeRegionHexes?: string[];
    /**
   * Specifies the contract for the `contestedHomeRegionHexes` member (contestedHomeRegionHexes?: string[];).

   * Contract: Describes stable behavior for callers of `contestedHomeRegionHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
contestedHomeRegionHexes?: string[];
    /**
   * Specifies the contract for the `phase` member (phase: string;).

   * Contract: Describes stable behavior for callers of `phase` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
phase: string;
    /**
   * Specifies the contract for the `turnNumber` member (turnNumber: number;).

   * Contract: Describes stable behavior for callers of `turnNumber` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
turnNumber: number;
    /**
   * Specifies the contract for the `pendingOrders` member (pendingOrders: { unitId: string; toH3Index: string }[];).

   * Contract: Describes stable behavior for callers of `pendingOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
pendingOrders: { unitId: string; toH3Index: string }[];
    /**
   * Specifies the contract for the `res1Control` member (res1Control?: { h3Index: string; controllerPlayerId: string | null }[];).

   * Contract: Describes stable behavior for callers of `res1Control` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
res1Control?: { h3Index: string; controllerPlayerId: string | null }[];
    /**
   * Specifies the contract for the `res1BuildQueueTotals` member (res1BuildQueueTotals?: { h3Index: string; queuedUnits: number; nextUnitType: BuildUnitType | null; nextRemainingCount: number | null; s).

   * Contract: Describes stable behavior for callers of `res1BuildQueueTotals` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
res1BuildQueueTotals?: {
    h3Index: string;
    queuedUnits: number;
    nextUnitType: BuildUnitType | null;
    nextRemainingCount: number | null;
    storedPoints: number;
  }[];
    /**
   * Specifies the contract for the `res1Infrastructure` member (res1Infrastructure?: { h3Index: string; urbanHexCount: number; airportCount: number; seaportCount: number; }[];).

   * Contract: Describes stable behavior for callers of `res1Infrastructure` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
res1Infrastructure?: {
    h3Index: string;
    urbanHexCount: number;
    airportCount: number;
    seaportCount: number;
  }[];
    /**
   * Specifies the contract for the `gameOver` member (gameOver?: boolean;).

   * Contract: Describes stable behavior for callers of `gameOver` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
gameOver?: boolean;
    /**
   * Specifies the contract for the `winner` member (winner?: string;).

   * Contract: Describes stable behavior for callers of `winner` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
winner?: string;
    /**
   * Specifies the contract for the `tacticalBattleSession` member (tacticalBattleSession?: TacticalBattleSnapshot;).

   * Contract: Present when the main process holds an active tactical battle (including sessions restored from SQLite after restart).
   * When to use: Renderer `applyGameStateSnapshot` re-enters tactical res4 mode when this field is populated.
   * Expected outcome: Matches in-memory tactical state in the main process; omitted when no tactical session exists.
   * Exceptions: None.
   */
tacticalBattleSession?: TacticalBattleSnapshot;
}
