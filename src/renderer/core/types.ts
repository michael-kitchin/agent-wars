import type { HumanOrderGroupPreviewResult } from '../../shared/ipcTypes';

/**
 * Documents the `ResolutionMove` interface as a named contract surface (export interface ResolutionMove).

 * Purpose: Supports maintainability by documenting why `ResolutionMove` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface ResolutionMove {
    /**
   * Specifies the contract for the `unitId` member (unitId: string;).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitId: string;
    /**
   * Specifies the contract for the `fromH3Index` member (fromH3Index: string;).

   * Contract: Describes stable behavior for callers of `fromH3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
fromH3Index: string;
    /**
   * Specifies the contract for the `toH3Index` member (toH3Index: string;).

   * Contract: Describes stable behavior for callers of `toH3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
toH3Index: string;
    /**
   * When set (tactical playback), ordered res4 vertices from `fromH3Index` through `toH3Index` for path-following animation.
   *
   * Contract: Omitted for strategic Ready; when present, length is at least 2 and endpoints match `fromH3Index` / `toH3Index`.
   * When to use: Tactical `commitHumanTacticalDraftOrders` resolution payload copied into `S.resolutionMoveAnimation.moves`.
   * Expected outcome: Renderer interpolates along this polyline instead of a single geodesic chord.
   * Exceptions: None.
   */
pathH3Indexes?: string[];
}

/**
 * Documents the `ResolutionPlaybackMove` interface as a named contract surface (export interface ResolutionPlaybackMove).

 * Purpose: Supports maintainability by documenting why `ResolutionPlaybackMove` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface ResolutionPlaybackMove {
    /**
   * Specifies the contract for the `unitId` member (unitId: string;).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitId: string;
    /**
   * Specifies the contract for the `player` member (player: string;).

   * Contract: Describes stable behavior for callers of `player` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
player: string;
    /**
   * Specifies the contract for the `unitType` member (unitType: string;).

   * Contract: Describes stable behavior for callers of `unitType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitType: string;
    /**
   * Specifies the contract for the `fromH3Index` member (fromH3Index: string;).

   * Contract: Describes stable behavior for callers of `fromH3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
fromH3Index: string;
    /**
   * Specifies the contract for the `toH3Index` member (toH3Index: string;).

   * Contract: Describes stable behavior for callers of `toH3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
toH3Index: string;
    /**
   * Optional tactical march centerline; same contract as `ResolutionMove.pathH3Indexes`.
   *
   * Contract: Omitted when absent from IPC playback; when set, length at least 2.
   * When to use: After `buildResolutionPlaybackMoves` copies optional path from `ResolutionMove`.
   * Expected outcome: `drawMovingUnits` uses polyline interpolation when present.
   * Exceptions: None.
   */
pathH3Indexes?: string[];
}

/**
 * Documents the `HoverRoutePreviewState` interface as a named contract surface (export interface HoverRoutePreviewState).

 * Purpose: Supports maintainability by documenting why `HoverRoutePreviewState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HoverRoutePreviewState {
    /**
   * Specifies the contract for the `hoveredH3Index` member (hoveredH3Index: string;).

   * Contract: Describes stable behavior for callers of `hoveredH3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hoveredH3Index: string;
    /**
   * Specifies the contract for the `data` member (data: HumanOrderGroupPreviewResult;).

   * Contract: Describes stable behavior for callers of `data` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
data: HumanOrderGroupPreviewResult;
    /**
   * Specifies the contract for the `renderAsSupportTargeting` member (renderAsSupportTargeting?: 'ranged' | 'air';).

   * Contract: When set, hover drawing uses pending ranged or air-stroke styling instead of march path caps and movement-range dashes.
   * When to use: Only while ranged or air-strike targeting mode is active and a hover preview envelope has been built.
   * Expected outcome: `drawHoverRoutePreview` applies the same colors and dash patterns as pending order lines at reduced opacity.
   * Exceptions: None.
   */
renderAsSupportTargeting?: 'ranged' | 'air';
}

/**
 * Documents the `PanDirection` type alias (export type PanDirection).

 * Purpose: Supports maintainability by documenting why `PanDirection` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type PanDirection = 'north' | 'south' | 'west' | 'east';
