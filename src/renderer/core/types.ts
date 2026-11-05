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
   * When set, ordered vertices from `fromH3Index` through `toH3Index` for path-following animation.
   *
   * Contract: Strategic Ready sets this for a ferry and for cargo riding that ferry. Tactical commits set it for a march.
   *   When present, length is at least 2 and the ends match `fromH3Index` and `toH3Index`.
   * When to use: Copied onto `S.resolutionMoveAnimation.moves` from a Ready result or a tactical commit.
   * Expected outcome: The renderer interpolates along this polyline instead of a single chord.
   * Exceptions: None.
   */
pathH3Indexes?: readonly string[];
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
pathH3Indexes?: readonly string[];
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

   * Contract: When set, hover drawing uses pending ranged, air-strike, or missile styling instead of march path caps.
   * When to use: Only while ranged, air-strike, or missile targeting is active and a hover preview envelope has been built.
   * Expected outcome: `drawHoverRoutePreview` applies the same colors, width, and dash patterns as the planned lines.
   * Exceptions: None.
   */
renderAsSupportTargeting?: 'ranged' | 'air' | 'missile';
  /**
   * Kill, Hurt, and Loss for this ranged target.
   *
   * Purpose: The effects tooltip prints one odds line from these percents.
   * When to use: Set on a legal ranged hover after the odds call returns all three chances or none.
   * Expected outcome: All three numbers, or all three null when the estimate could not supply them. Omitted for every other preview and when the odds call returned nothing.
   * Exceptions: None.
   */
  rangedTargetOdds?: HoverRangedTargetOdds;
  /**
   * Defender ids that entered the ranged estimate.
   *
   * Purpose: The roster names opponent seats among these ids and no others.
   * When to use: Together with `rangedTargetOdds` on a legal ranged hover.
   * Expected outcome: The ids the estimate counted. Omitted when the odds call returned nothing.
   * Exceptions: None.
   */
  countedDefenderIds?: readonly string[];
}

/**
 * Kill, Hurt, and Loss percents stored on a ranged hover preview.
 *
 * Purpose: The tooltip prints these three numbers, or none when any is missing.
 * When to use: `HoverRoutePreviewState.rangedTargetOdds`.
 * Expected outcome: Whole percents. Null means the odds line is omitted.
 * Exceptions: None.
 */
export interface HoverRangedTargetOdds {
  /**
   * Chance the shot wipes the counted defenders.
   *
   * Purpose: The Kill number.
   * When to use: Read while composing the ranged tooltip.
   * Expected outcome: A whole percent, or null.
   * Exceptions: None.
   */
  readonly killPercent: number | null;
  /**
   * Chance the attackers lose at least one unit.
   *
   * Purpose: The Loss number.
   * When to use: Read while composing the ranged tooltip.
   * Expected outcome: A whole percent, or null.
   * Exceptions: None.
   */
  readonly lossPercent: number | null;
  /**
   * Chance the attackers score at least one hit.
   *
   * Purpose: The Hurt number.
   * When to use: Read while composing the ranged tooltip.
   * Expected outcome: A whole percent, or null.
   * Exceptions: None.
   */
  readonly hurtPercent: number | null;
}

/**
 * Documents the `PanDirection` type alias (export type PanDirection).

 * Purpose: Supports maintainability by documenting why `PanDirection` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type PanDirection = 'north' | 'south' | 'west' | 'east';
