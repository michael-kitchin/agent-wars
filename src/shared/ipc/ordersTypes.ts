import type { GameSize } from '../gameSize';

export interface MovementOrder {
    /**
   * Specifies the contract for the `unitId` member (unitId: string;).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitId: string;
    /**
   * Specifies the contract for the `toH3Index` member (toH3Index: string;).

   * Contract: Describes stable behavior for callers of `toH3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
toH3Index: string;
}

/**
 * Documents the `RangedAttackOrder` interface as a named contract surface (export interface RangedAttackOrder).

 * Purpose: Supports maintainability by documenting why `RangedAttackOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface RangedAttackOrder {
    /**
   * Specifies the contract for the `unitId` member (unitId: string;).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitId: string;
    /**
   * Specifies the contract for the `targetH3Index` member (targetH3Index: string;).

   * Contract: Describes stable behavior for callers of `targetH3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
targetH3Index: string;
}

/**
 * Documents the `AirStrikeTargetType` type alias (export type AirStrikeTargetType).

 * Purpose: Supports maintainability by documenting why `AirStrikeTargetType` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type AirStrikeTargetType = 'units' | 'urban' | 'airport' | 'seaport';

/**
 * Documents the `AirStrikeOrder` interface as a named contract surface (export interface AirStrikeOrder).

 * Purpose: Supports maintainability by documenting why `AirStrikeOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface AirStrikeOrder {
    /**
   * Specifies the contract for the `unitId` member (unitId: string;).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitId: string;
    /**
   * Specifies the contract for the `targetH3Index` member (targetH3Index: string;).

   * Contract: Describes stable behavior for callers of `targetH3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
targetH3Index: string;
    /**
   * Specifies the contract for the `targetType` member (targetType: AirStrikeTargetType;).

   * Contract: Describes stable behavior for callers of `targetType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
targetType: AirStrikeTargetType;
}

/**
 * Documents the `AirStrikeAnimationMove` interface as a named contract surface (export interface AirStrikeAnimationMove).

 * Purpose: Supports maintainability by documenting why `AirStrikeAnimationMove` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface AirStrikeAnimationMove {
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
   * Specifies the contract for the `targetH3Index` member (targetH3Index: string;).

   * Contract: Describes stable behavior for callers of `targetH3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
targetH3Index: string;
    /**
   * Specifies the contract for the `returnsToBase` member (returnsToBase: boolean;).

   * Contract: Describes stable behavior for callers of `returnsToBase` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
returnsToBase: boolean;
}

/**
 * Documents the `FerryOrder` interface as a named contract surface (export interface FerryOrder).

 * Purpose: Supports maintainability by documenting why `FerryOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface FerryOrder {
    /**
   * Specifies the contract for the `unitId` member (unitId: string;).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitId: string;
    /**
   * Specifies the contract for the `destinationH3Index` member (destinationH3Index: string;).

   * Contract: Describes stable behavior for callers of `destinationH3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
destinationH3Index: string;
}

/**
 * Documents the `EmbarkOrder` interface as a named contract surface (export interface EmbarkOrder).

 * Purpose: Supports maintainability by documenting why `EmbarkOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface EmbarkOrder {
    /**
   * Specifies the contract for the `unitId` member (unitId: string;).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitId: string;
    /**
   * Specifies the contract for the `navalUnitId` member (navalUnitId: string;).

   * Contract: Describes stable behavior for callers of `navalUnitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
navalUnitId: string;
}

/**
 * Documents the `FerryAnimationMove` interface as a named contract surface (export interface FerryAnimationMove).

 * Purpose: Supports maintainability by documenting why `FerryAnimationMove` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface FerryAnimationMove {
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
}

/**
 * Documents the `SubmitOrdersPayload` interface as a named contract surface (export interface SubmitOrdersPayload).

 * Purpose: Supports maintainability by documenting why `SubmitOrdersPayload` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface SubmitOrdersPayload {
    /**
   * Specifies the contract for the `movementOrders` member (movementOrders: MovementOrder[];).

   * Contract: Describes stable behavior for callers of `movementOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
movementOrders: MovementOrder[];
    /**
   * Specifies the contract for the `rangedAttacks` member (rangedAttacks?: RangedAttackOrder[];).

   * Contract: Describes stable behavior for callers of `rangedAttacks` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
rangedAttacks?: RangedAttackOrder[];
    /**
   * Specifies the contract for the `airStrikes` member (airStrikes?: AirStrikeOrder[];).

   * Contract: Describes stable behavior for callers of `airStrikes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikes?: AirStrikeOrder[];
    /**
   * Specifies the contract for the `ferryOrders` member (ferryOrders?: FerryOrder[];).

   * Contract: Describes stable behavior for callers of `ferryOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
ferryOrders?: FerryOrder[];
}

/**
 * Documents the `NewGameIpcPayload` interface as a named contract surface (export interface NewGameIpcPayload).

 * Purpose: Supports maintainability by documenting why `NewGameIpcPayload` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface NewGameIpcPayload {
    /**
   * Specifies the contract for the `fogOfWarEnabled` member (fogOfWarEnabled?: boolean;).

   * Contract: Describes stable behavior for callers of `fogOfWarEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
fogOfWarEnabled?: boolean;
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
   * Specifies the contract for the `gameSize` member (gameSize?: GameSize;).

   * Contract: New-match size that scales unit caps. Main parses with `parseGameSize`; omitted means Small.
   * When to use: `game:newGame` from the new-game dialog dropdown.
   * Expected outcome: Persist as `game_config.game_size` before unit seeding.
   * Exceptions: None; invalid values become Small.
   */
gameSize?: GameSize;
    /**
   * Whether the new match has the country bonus on.
   *
   * Contract: A missing field means off; the new-game dialog always sends an explicit boolean.
   * When to use: `game:newGame` from the new-game dialog's Country bonus checkbox.
   * Expected outcome: Persisted as `game_config.country_bonus_enabled`.
   * Exceptions: None.
   */
countryBonusEnabled?: boolean;
    /**
   * Whether the new match has the terrain bonus on.
   *
   * Contract: A missing field means off; the new-game dialog always sends an explicit boolean.
   * When to use: `game:newGame` from the new-game dialog's Terrain bonus checkbox.
   * Expected outcome: Persisted as `game_config.terrain_bonus_enabled`.
   * Exceptions: None.
   */
terrainBonusEnabled?: boolean;
    /**
   * Whether the new match has the weather bonus on.
   *
   * Contract: A missing field means off. The new-game dialog always sends an explicit boolean.
   * When to use: `game:newGame` from the Weather bonus checkbox.
   * Expected outcome: Persisted as `game_config.weather_bonus_enabled`.
   * Exceptions: None.
   */
weatherBonusEnabled?: boolean;
    /**
   * Calendar month of turn 1, 1 for January through 12 for December.
   *
   * Contract: A missing or invalid field means January.
   * When to use: `game:newGame` from the start-month control.
   * Expected outcome: Persisted as `game_config.start_month`.
   * Exceptions: None.
   */
startMonth?: number;
}

/**
 * Documents the `SubmitOrdersIpcPayload` type alias (export type SubmitOrdersIpcPayload).

 * Purpose: Supports maintainability by documenting why `SubmitOrdersIpcPayload` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type SubmitOrdersIpcPayload = SubmitOrdersPayload | MovementOrder[];
