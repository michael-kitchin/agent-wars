/**
 * Request and result shapes of the `plan_route` and `check_distance` tools.
 *
 * Purpose: Callers share these results without taking the pathfinding session.
 * When to use: When reading a route or distance result.
 * Expected outcome: The five tool interfaces. This file has no runtime code.
 * Exceptions: None.
 */

import type { LatLng } from './h3LatLng';

/**
 * Documents the `PlanRouteOptions` interface as a named contract surface (export interface PlanRouteOptions).

 * Purpose: Supports maintainability by documenting why `PlanRouteOptions` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface PlanRouteOptions {
    /**
   * Specifies the contract for the `avoidEnemies` member (avoidEnemies?: boolean;).

   * Contract: Describes stable behavior for callers of `avoidEnemies` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
avoidEnemies?: boolean;
    /**
   * Specifies the contract for the `maxTurns` member (maxTurns?: number;).

   * Contract: Describes stable behavior for callers of `maxTurns` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
maxTurns?: number;
}

/**
 * Documents the `PlanRouteOk` interface as a named contract surface (export interface PlanRouteOk).

 * Purpose: Supports maintainability by documenting why `PlanRouteOk` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface PlanRouteOk {
    /**
   * Specifies the contract for the `status` member (status: 'ok';).

   * Contract: Describes stable behavior for callers of `status` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
status: 'ok';
    /**
   * Specifies the contract for the `unitId` member (unitId: string;).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitId: string;
    /**
   * Specifies the contract for the `unitType` member (unitType: string;).

   * Contract: Describes stable behavior for callers of `unitType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitType: string;
    /**
   * Specifies the contract for the `origin` member (origin: LatLng;).

   * Contract: Describes stable behavior for callers of `origin` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
origin: LatLng;
    /**
   * Specifies the contract for the `destination` member (destination: LatLng;).

   * Contract: Describes stable behavior for callers of `destination` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
destination: LatLng;
    /**
   * Specifies the contract for the `orderToXY` member (orderToXY: LatLng;).

   * Contract: Describes stable behavior for callers of `orderToXY` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
orderToXY: LatLng;
    /**
   * Specifies the contract for the `orderToH3` member (orderToH3: string;).

   * Contract: Describes stable behavior for callers of `orderToH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
orderToH3: string;
    /**
   * Specifies the contract for the `suggestedDestinations` member (suggestedDestinations?: LatLng[];).

   * Contract: Describes stable behavior for callers of `suggestedDestinations` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
suggestedDestinations?: LatLng[];
    /**
   * Specifies the contract for the `hexDistance` member (hexDistance: number;).

   * Contract: Describes stable behavior for callers of `hexDistance` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hexDistance: number;
    /**
   * Specifies the contract for the `turnsRequired` member (turnsRequired: number;).

   * Contract: Describes stable behavior for callers of `turnsRequired` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
turnsRequired: number;
    /**
   * Specifies the contract for the `path` member (path: { turn: number; hexes: LatLng[]; movementSpent: number; movementBudget: number; endHex: LatLng; }[];).

   * Contract: Describes stable behavior for callers of `path` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
path: {
    turn: number;
    hexes: LatLng[];
    movementSpent: number;
    movementBudget: number;
    endHex: LatLng;
  }[];
  /**
   * Hex indexes of the route the player sees, origin first.
   *
   * Contract: Same order as `path`, with a shared endpoint listed once. Empty when the unit is already there.
   * When to use: Armor stop labels. Redaction removes this before a model sees the result.
   * Expected outcome: The entered hexes are `pathH3Indexes` after the origin.
   * Exceptions: None.
   */
  pathH3Indexes: readonly string[];
    /**
   * Specifies the contract for the `warnings` member (warnings: string[];).

   * Contract: Describes stable behavior for callers of `warnings` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
warnings: string[];
    /**
   * Specifies the contract for the `error` member (error?: null;).

   * Contract: Describes stable behavior for callers of `error` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
error?: null;
    /**
   * Specifies the contract for the `reachable` member (reachable?: boolean;).

   * Contract: Describes stable behavior for callers of `reachable` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
reachable?: boolean;
}

/**
 * Documents the `PlanRouteError` interface as a named contract surface (export interface PlanRouteError).

 * Purpose: Supports maintainability by documenting why `PlanRouteError` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface PlanRouteError {
    /**
   * Specifies the contract for the `status` member (status: 'error';).

   * Contract: Describes stable behavior for callers of `status` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
status: 'error';
    /**
   * Specifies the contract for the `error` member (error: string;).

   * Contract: Describes stable behavior for callers of `error` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
error: string;
}

/**
 * Documents the `CheckDistanceOk` interface as a named contract surface (export interface CheckDistanceOk).

 * Purpose: Supports maintainability by documenting why `CheckDistanceOk` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface CheckDistanceOk {
    /**
   * Specifies the contract for the `status` member (status: 'ok';).

   * Contract: Describes stable behavior for callers of `status` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
status: 'ok';
    /**
   * Specifies the contract for the `from` member (from: LatLng;).

   * Contract: Describes stable behavior for callers of `from` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
from: LatLng;
    /**
   * Specifies the contract for the `to` member (to: LatLng;).

   * Contract: Describes stable behavior for callers of `to` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
to: LatLng;
    /**
   * Specifies the contract for the `hexDistance` member (hexDistance: number;).

   * Contract: Describes stable behavior for callers of `hexDistance` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hexDistance: number;
    /**
   * Specifies the contract for the `estimatedTurns` member (estimatedTurns: number;).

   * Contract: Describes stable behavior for callers of `estimatedTurns` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
estimatedTurns: number;
    /**
   * Specifies the contract for the `reachable` member (reachable: boolean;).

   * Contract: Describes stable behavior for callers of `reachable` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
reachable: boolean;
}

/**
 * Documents the `CheckDistanceError` interface as a named contract surface (export interface CheckDistanceError).

 * Purpose: Supports maintainability by documenting why `CheckDistanceError` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface CheckDistanceError {
    /**
   * Specifies the contract for the `status` member (status: 'error';).

   * Contract: Describes stable behavior for callers of `status` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
status: 'error';
    /**
   * Specifies the contract for the `error` member (error: string;).

   * Contract: Describes stable behavior for callers of `error` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
error: string;
}

