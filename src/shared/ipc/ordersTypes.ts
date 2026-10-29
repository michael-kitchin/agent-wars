import type { BonusLevel } from '../bonusLevel';
import type { MissileLaunchOrder } from './missileTypes';
import type { GameSize } from '../gameSize';
import type { DoctrineChoice, SeatKind } from '../seatRoster';
import type { VictoryRule } from '../victoryRules';

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
   * Missile launches for this submit.
   *
   * Contract: Each row is one missile and one target hex. Absent means none.
   * When to use: The human order plan. AI launches travel on `OwnerTurnOrders` instead.
   * Expected outcome: Copied through normalization and stored in `pending_missile_launches`.
   * Exceptions: None.
   */
  missileLaunches?: MissileLaunchOrder[];
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
 * The model and doctrine for one AI side on a new match.
 *
 * Purpose: The human side has no commander. Each AI side may name one.
 * When to use: A seat entry on `game:newGame`.
 * Expected outcome: A missing commander means standing orders and Balanced.
 * Exceptions: None.
 */
export interface NewGameCommanderInput {
  /**
   * Model id, or null for standing orders only.
   *
   * Contract: Null skips the model. A string is stored on the seat.
   * When to use: When the screen has chosen a model.
   * Expected outcome: Stored as `model_id`.
   * Exceptions: None.
   */
  readonly modelId: string | null;
  /**
   * Reasoning effort, or null for the model default.
   *
   * Contract: Null means the model default.
   * When to use: When the screen has chosen an effort.
   * Expected outcome: Stored as `reasoning_effort`.
   * Exceptions: None.
   */
  readonly reasoningEffort: string | null;
  /**
   * Doctrine the human picked, including Random.
   *
   * Contract: One of `DOCTRINE_CHOICES`. Random is a choice, not a prompt block.
   * When to use: The doctrine control for this side.
   * Expected outcome: Stored as `doctrine_choice`. Random plays Balanced until a draw replaces it.
   * Exceptions: None.
   */
  readonly doctrineChoice: DoctrineChoice;
  /**
   * OpenRouter key for this opponent.
   *
   * Contract: Optional. Missing and blank mean this opponent has no key. A string is trimmed before it is stored.
   * When to use: The commander popover and the new-game start payload.
   * Expected outcome: Stored with that AI seat. It is not written into logs.
   * Exceptions: None.
   */
  readonly apiKey?: string;
}

/**
 * One side of a new match, in the order the screen listed it.
 *
 * Purpose: A match starts from this list when the screen sends one. The older home fields are ignored then.
 * When to use: `seats` on `game:newGame`.
 * Expected outcome: Two to four entries. At most one has kind `HUMAN_SEAT_ID`.
 * Exceptions: None.
 */
export interface NewGameSeatInput {
  /**
   * Whether this side is the human or an AI.
   *
   * Contract: `HUMAN_SEAT_ID` or `'ai'`. At most one human.
   * When to use: Every seat entry.
   * Expected outcome: The human entry becomes the human seat. AI entries become AI seats in row order.
   * Exceptions: None.
   */
  readonly kind: SeatKind;
  /**
   * Home on the global map, a UN subregion name.
   *
   * Contract: Ignored on a regional map. A missing or unknown name takes the first listed region that an earlier row did not take.
   * When to use: Global matches.
   * Expected outcome: Stored as that seat's `homeRegion` when the name is listed.
   * Exceptions: None.
   */
  readonly homeRegion?: string;
  /**
   * Home on a regional map, a side group id.
   *
   * Contract: Ignored on the global map. A missing id takes the first installed group that an earlier row did not take.
   * When to use: Regional matches.
   * Expected outcome: The group's display name becomes `homeRegion`.
   * Exceptions: None.
   */
  readonly sideGroupId?: string;
  /**
   * This AI side's model and doctrine.
   *
   * Contract: Optional. Ignored on a human seat.
   * When to use: When this side should not stay on the Balanced standing-orders commander.
   * Expected outcome: Stored on that AI seat.
   * Exceptions: None.
   */
  readonly commander?: NewGameCommanderInput;
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
   * Specifies the contract for the `gameSize` member (gameSize?: GameSize;).

   * Contract: New-match size that scales unit caps. Main parses with `parseGameSize`; omitted means Small.
   * When to use: `game:newGame` from the new-game dialog dropdown.
   * Expected outcome: Persist as `game_config.game_size` before unit seeding.
   * Exceptions: None; invalid values become Small.
   */
gameSize?: GameSize;
    /**
   * How strong the new match's origin bonus is.
   *
   * Contract: A missing or unknown field means off; the new-game dialog always sends an explicit level.
   * When to use: `game:newGame` from the new-game dialog's Origin bonus control.
   * Expected outcome: Persisted as `game_config.origin_bonus_enabled` and `game_config.origin_bonus_level`.
   * Exceptions: None.
   */
originBonusLevel?: BonusLevel;
    /**
   * How strong the new match's terrain bonus is.
   *
   * Contract: A missing or unknown field means off; the new-game dialog always sends an explicit level.
   * When to use: `game:newGame` from the new-game dialog's Terrain bonus control.
   * Expected outcome: Persisted as `game_config.terrain_bonus_enabled` and `game_config.terrain_bonus_level`.
   * Exceptions: None.
   */
terrainBonusLevel?: BonusLevel;
    /**
   * How strong the new match's weather bonus is.
   *
   * Contract: A missing or unknown field means off; the new-game dialog always sends an explicit level.
   * When to use: `game:newGame` from the new-game dialog's Weather bonus control.
   * Expected outcome: Persisted as `game_config.weather_bonus_enabled` and `game_config.weather_bonus_level`.
   * Exceptions: None.
   */
weatherBonusLevel?: BonusLevel;
    /**
   * Calendar month of turn 1, 1 for January through 12 for December.
   *
   * Contract: A missing or invalid field means January.
   * When to use: `game:newGame` from the start-month control.
   * Expected outcome: Persisted as `game_config.start_month`.
   * Exceptions: None.
   */
startMonth?: number;
    /**
   * How strong the new match's tech bonus is.
   *
   * Contract: A missing or unknown field means off; the new-game dialog always sends an explicit level.
   * When to use: `game:newGame` from the new-game dialog's Tech control.
   * Expected outcome: Persisted as `game_config.tech_bonus_enabled` and `game_config.tech_bonus_level`.
   * Exceptions: None.
   */
techBonusLevel?: BonusLevel;
    /**
   * Map to start.
   *
   * Contract: Omitted or `global` starts the world map. A regional id starts that pack.
   * When to use: The Regional tab's Start button.
   * Expected outcome: Main persists `game_map_id` and seeds that footprint.
   * Exceptions: None.
   */
gameMapId?: string;
    /**
   * Requested length of a city-hex match.
   *
   * Contract: Used only when `victoryRule` is `most_city_hexes_at_turn_limit`. A value outside 20, 30, 40, and 50 becomes 30.
   * When to use: The new-game dialog's turn-limit control.
   * Expected outcome: Stored as `turn_limit`. Deathmatch ignores it.
   * Exceptions: None.
   */
turnLimit?: number;
    /**
   * Requested win rule.
   *
   * Contract: Omitted means Deathmatch. `most_city_hexes_at_turn_limit` stores a listed turn limit.
   * When to use: The new-game dialog's Rule control.
   * Expected outcome: Stored as `victory_rule`.
   * Exceptions: None.
   */
victoryRule?: VictoryRule;
    /**
   * One entry per side, in row order.
   *
   * Contract: Each entry is a human or AI seat. Blank homes take the first free listed home.
   * When to use: A start that names two to four sides.
   * Expected outcome: Those sides are the roster. Absent builds one human seat and one AI seat.
   * Exceptions: None.
   */
seats?: readonly NewGameSeatInput[];
}

/**
 * Documents the `SubmitOrdersIpcPayload` type alias (export type SubmitOrdersIpcPayload).

 * Purpose: Supports maintainability by documenting why `SubmitOrdersIpcPayload` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type SubmitOrdersIpcPayload = SubmitOrdersPayload | MovementOrder[];
