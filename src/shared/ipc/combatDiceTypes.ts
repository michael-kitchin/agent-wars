/**
 * Recorded combat die rolls carried from resolution to playback.
 */

import type { AirStrikeTargetType } from './ordersTypes';

/**
 * Names the kind of roll a combat die decided.
 *
 * Purpose: Lets playback label each roll (attack, return fire, anti-air, and so on) without re-deriving combat rules.
 * When to use: On every `CombatDiceRoll`; set by the roll site that drew the die.
 * Expected outcome: `airStrike`, `ranged`, and `meleeAttack` are attacker rolls; `returnFire`, `meleeDefense`,
 *   `antiAir`, and `infrastructureCounterFire` are rolls by the side being attacked.
 * Exceptions: None.
 */
export type CombatDiceRollKind =
  | 'airStrike'
  | 'antiAir'
  | 'infrastructureCounterFire'
  | 'ranged'
  | 'returnFire'
  | 'meleeAttack'
  | 'meleeDefense';

/**
 * Infrastructure target types that fire back at air strikes.
 *
 * Purpose: Labels counter-fire rolls that no unit made.
 * When to use: `CombatDiceRoll.infrastructureType` on `infrastructureCounterFire` rolls.
 * Expected outcome: Matches the air strike target types other than `units`.
 * Exceptions: None.
 */
export type CombatDiceInfrastructureType = Exclude<AirStrikeTargetType, 'units'>;

/**
 * One combat die roll: what rolled, where its chip hangs, the face, and the hit number it was compared with.
 *
 * Purpose: Plain, serializable record of a die roll for resolution playback.
 * When to use: Produced in main at each roll site and sent to the renderer in resolution payloads.
 * Expected outcome: The roll hit when `face <= threshold`.
 * Exceptions: None.
 */
export interface CombatDiceRoll {
  /**
   * What decided this roll.
   *
   * Contract: Set by the roll site; never changes after recording.
   * When to use: Grouping and labeling rows in dice chips.
   * Expected outcome: One of the `CombatDiceRollKind` values.
   * Exceptions: None.
   */
  readonly kind: CombatDiceRollKind;
  /**
   * Player that owns the rolling unit.
   *
   * Contract: A player id such as `human` or `opponent`; `null` only for `infrastructureCounterFire`.
   * When to use: Coloring the rolling unit's mini token.
   * Expected outcome: Matches the rolling unit's `player`.
   * Exceptions: None.
   */
  readonly player: string | null;
  /**
   * Unit type of the rolling unit.
   *
   * Contract: A unit type such as `armor`; `null` only for `infrastructureCounterFire`.
   * When to use: Choosing the glyph in the rolling unit's mini token.
   * Expected outcome: Matches the rolling unit's type.
   * Exceptions: None.
   */
  readonly unitType: string | null;
  /**
   * Infrastructure that fired back.
   *
   * Contract: Present only on `infrastructureCounterFire` rolls.
   * When to use: Labeling counter-fire rows that have no unit.
   * Expected outcome: The struck target type.
   * Exceptions: None.
   */
  readonly infrastructureType?: CombatDiceInfrastructureType;
  /**
   * Hex or tactical cell whose token the dice chip hangs from.
   *
   * Contract: The rolling stack's position when it rolled; for air strikes, the strike target, where the striker is drawn.
   * When to use: Grouping rolls into chips and filtering by fog.
   * Expected outcome: An H3 index at the resolution of the map being played back.
   * Exceptions: None.
   */
  readonly anchorH3Index: string;
  /**
   * Face the die showed.
   *
   * Contract: An integer from 1 to `COMBAT_DIE_SIDES`.
   * When to use: Showing the roll and deciding hit or miss.
   * Expected outcome: Exactly the value the combat code compared.
   * Exceptions: None.
   */
  readonly face: number;
  /**
   * Hit number the face was compared with.
   *
   * Contract: The roll hit when `face <= threshold`; includes every modifier the combat code applied.
   * When to use: Showing the hit number next to the faces.
   * Expected outcome: An integer from 2 to 17, the combat code's attack floor and hit-number cap.
   * Exceptions: None.
   */
  readonly threshold: number;
}

/**
 * Per-phase dice rolls attached to a resolution playback payload.
 *
 * Purpose: One shape shared by strategic Ready results, tactical commit playback, and renderer animation state.
 * When to use: Extend or intersect payload types that drive resolution playback.
 * Expected outcome: Each array is in roll order and is omitted when its phase rolled nothing.
 * Exceptions: None.
 */
export interface CombatDicePlaybackFields {
  /**
   * Air strike phase rolls: strike attacks, anti-air, and infrastructure counter-fire.
   *
   * Contract: Omitted when no air strike rolled; anchored on strike targets.
   * When to use: Dice chips during the air strike lightning and casualty beats.
   * Expected outcome: Roll order within the phase.
   * Exceptions: None.
   */
  readonly airStrikeDiceRolls?: readonly CombatDiceRoll[];
  /**
   * Ranged phase rolls: direct fire and return fire.
   *
   * Contract: Omitted when no ranged roll happened; anchored on the rolling unit's pre-move position.
   * When to use: Dice chips during the ranged lightning and casualty beats.
   * Expected outcome: Roll order within the phase.
   * Exceptions: None.
   */
  readonly rangedDiceRolls?: readonly CombatDiceRoll[];
  /**
   * Melee phase rolls for both sides.
   *
   * Contract: Omitted when no melee roll happened; anchored on the melee hex or cell.
   * When to use: Dice chips during the melee lightning and casualty beats.
   * Expected outcome: Roll order within the phase.
   * Exceptions: None.
   */
  readonly meleeDiceRolls?: readonly CombatDiceRoll[];
}
