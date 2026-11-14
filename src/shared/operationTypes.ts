/**
 * One stored shape for an AI side's sea operation, shared by the turn advance, the briefing, and the stored game row.
 *
 * Purpose: The advance, the briefing, and the game row share one shape so they cannot drift.
 * When to use: Anywhere an operation, its phase, or its assigned units is stored or passed across modules.
 * Expected outcome: Types only. This file imports nothing, so gameDb, operations, and openRouter can use it without a cycle.
 * Exceptions: None.
 */

/**
 * How the ground units reach the objective.
 *
 * Purpose: Callers branch on the method without stringly typed checks.
 * When to use: Stored operations and candidate rows.
 * Expected outcome: `sea` for a landing by ship, or `air` for one infantry unit dropped from an air unit.
 * Exceptions: None.
 */
export type OperationMethod = 'sea' | 'air';

/**
 * How a menu row or a launch command reaches the objective.
 *
 * Purpose: A land row sets the campaign target. It is not a stored operation.
 * When to use: Operation Options and a launch command. Stored rows stay on `OperationMethod`.
 * Expected outcome: `land`, `sea`, or `air`.
 * Exceptions: None.
 */
export type OperationChoiceMethod = OperationMethod | 'land';

/**
 * Where an operation is in its sequence.
 *
 * Purpose: The advance and the briefing name the same four stages.
 * When to use: Stored operations.
 * Expected outcome: `muster`, then `transit`, then `assault`, or `return` when the ships turn back.
 * Exceptions: None.
 */
export type OperationPhase = 'muster' | 'transit' | 'assault' | 'return';

/**
 * Who started the operation.
 *
 * Purpose: A later choice can tell an engine launch from a commander launch.
 * When to use: Stored operations.
 * Expected outcome: `engine` when the turn advance started it, `commander` when a later command does.
 * Exceptions: None.
 */
export type OperationSource = 'engine' | 'commander';

/**
 * The methods a stored row may contain.
 *
 * Purpose: Parsing rejects anything outside this list.
 * When to use: When reading a stored operation.
 * Expected outcome: `sea` and `air`.
 * Exceptions: None.
 */
export const OPERATION_METHODS: readonly OperationMethod[] = ['sea', 'air'];

/**
 * The methods a menu row or a launch command may name.
 *
 * Purpose: Parsing accepts a land launch without letting that word into a stored operation.
 * When to use: The operations parser. The stored-row parser keeps `OPERATION_METHODS`.
 * Expected outcome: `land`, `sea`, and `air`.
 * Exceptions: None.
 */
export const OPERATION_CHOICE_METHODS: readonly OperationChoiceMethod[] = ['land', 'sea', 'air'];

/**
 * The id the briefing uses for the land campaign.
 *
 * Purpose: The commander sees the campaign in Active Operations and cannot cancel that id.
 * When to use: The campaign bullet and a cancel that names it.
 * Expected outcome: The string `campaign`.
 * Exceptions: None.
 */
export const CAMPAIGN_OPERATION_ID = 'campaign';

/**
 * The phases a stored row may contain.
 *
 * Purpose: Parsing rejects anything outside this list.
 * When to use: When reading a stored operation.
 * Expected outcome: `muster`, `transit`, `assault`, and `return`.
 * Exceptions: None.
 */
export const OPERATION_PHASES: readonly OperationPhase[] = ['muster', 'transit', 'assault', 'return'];

/**
 * The sources a stored row may contain.
 *
 * Purpose: Parsing rejects anything outside this list.
 * When to use: When reading a stored operation.
 * Expected outcome: `engine` and `commander`.
 * Exceptions: None.
 */
export const OPERATION_SOURCES: readonly OperationSource[] = ['engine', 'commander'];

/**
 * The objective, the force, and the phase kept between turns.
 *
 * Purpose: One seat may have several operations. Each one survives save and load until it ends or the seat is removed.
 * When to use: The game_config value and the turn advance.
 * Expected outcome: Ground units in `unitIds` and ships in `carrierIds`, with a landing hex only after they load.
 * Exceptions: None.
 */
export interface Operation {
  /**
   * Stable id for this operation.
   *
   * Contract: Unique among the seat's stored operations. Built from the seat id and the launch turn.
   * When to use: Briefing bullets, logs, and a later cancel.
   * Expected outcome: A non-empty string.
   * Exceptions: None.
   */
  readonly id: string;
  /**
   * How the force travels.
   *
   * Contract: A member of `OPERATION_METHODS`.
   * When to use: Choosing the advance function.
   * Expected outcome: `sea` or `air`.
   * Exceptions: None.
   */
  readonly method: OperationMethod;
  /**
   * Enemy city the force is landing against.
   *
   * Contract: An H3 index that was a known enemy city when the operation was launched.
   * When to use: The briefing and the landing choice.
   * Expected outcome: A non-empty H3 index.
   * Exceptions: None.
   */
  readonly objectiveH3: string;
  /**
   * Port the force gathers at, or the port a return is sailing toward.
   *
   * Contract: A seaport hex while mustering. A return may replace it with the chosen home port.
   * When to use: March orders in `muster` and `return`.
   * Expected outcome: A non-empty H3 index.
   * Exceptions: None.
   */
  readonly musterH3: string;
  /**
   * Hex where the ships unload.
   *
   * Contract: Null until the ships are loaded. After that, a landing hex beside the objective.
   * When to use: March orders in `transit`.
   * Expected outcome: Null during `muster`, otherwise a non-empty H3 index.
   * Exceptions: None.
   */
  readonly landingH3: string | null;
  /**
   * Ground units assigned to the operation.
   *
   * Contract: Infantry and armor ids that still belong to the seat. Order is not significant.
   * When to use: March, embark, and unload actions, and the campaign exclusion.
   * Expected outcome: A list of unit ids. Empty when the force is gone.
   * Exceptions: None.
   */
  readonly unitIds: readonly string[];
  /**
   * Ships assigned to the operation.
   *
   * Contract: Naval unit ids that still belong to the seat.
   * When to use: Ship marches and the unload loop.
   * Expected outcome: A list of ship ids. Empty after every ship has unloaded or left.
   * Exceptions: None.
   */
  readonly carrierIds: readonly string[];
  /**
   * Current stage of the operation.
   *
   * Contract: A member of `OPERATION_PHASES`.
   * When to use: The advance rules and the briefing bullet.
   * Expected outcome: The stage the last tick left it in.
   * Exceptions: None.
   */
  readonly phase: OperationPhase;
  /**
   * Who started the operation.
   *
   * Contract: A member of `OPERATION_SOURCES`.
   * When to use: Logs and a later menu.
   * Expected outcome: `engine` for a launch from the turn advance.
   * Exceptions: None.
   */
  readonly source: OperationSource;
  /**
   * Planning turn on which the operation was stored.
   *
   * Contract: An integer. The launch tick is the turn already stored in `turn_state`.
   * When to use: The operation id and logs.
   * Expected outcome: The turn number at launch.
   * Exceptions: None.
   */
  readonly launchedTurn: number;
  /**
   * Planning turn on which the current phase began.
   *
   * Contract: An integer. Elapsed turns are the current turn minus this value. The tick that sets it counts as zero.
   * When to use: Muster, transit, and assault timeouts.
   * Expected outcome: The turn number when `phase` last changed.
   * Exceptions: None.
   */
  readonly phaseTurn: number;
}

/**
 * One row the menu or the engine could offer.
 *
 * Purpose: The briefing prints it. A sea or air launch stores an operation from it. A land row only names a campaign target, and the engine never launches one.
 * When to use: The result of the sea, air, or land candidate search.
 * Expected outcome: One city, the force that would go there, and the counts a briefing can print.
 * Exceptions: None.
 */
export interface OperationCandidate {
  /**
   * How the force travels.
   *
   * Contract: `land` for a campaign target, `sea` for a ship landing, and `air` for an air drop.
   * When to use: Filtering a mixed menu. A stored operation never keeps `land`.
   * Expected outcome: `land`, `sea`, or `air`.
   * Exceptions: None.
   */
  readonly method: OperationChoiceMethod;
  /**
   * Enemy city this row would take.
   *
   * Contract: A known enemy city hex.
   * When to use: The launch and the menu row.
   * Expected outcome: A non-empty H3 index.
   * Exceptions: None.
   */
  readonly objectiveH3: string;
  /**
   * Hex the force would gather at.
   *
   * Contract: A seaport for sea, the air unit's hex for air, and the campaign staging hex for land. When land has no staging hex, this is the city.
   * When to use: The stored operation's muster hex, or the land plan's assemble sentence.
   * Expected outcome: A non-empty H3 index.
   * Exceptions: None.
   */
  readonly musterH3: string;
  /**
   * Sea unload hex, air launch airport, or the land city.
   *
   * Contract: A sea unload hex, the air launch airport, or the land objective city.
   * When to use: The ETA and a later transit. A stored sea operation leaves this null until the ships load.
   * Expected outcome: A non-empty H3 index.
   * Exceptions: None.
   */
  readonly landingH3: string;
  /**
   * Ground units the row describes.
   *
   * Contract: Sea ids are the units a launch would embark, at least two. Air is the one infantry. Land ids are the campaign ground units, and a land launch does not assign them.
   * When to use: A sea or air stored operation's `unitIds`. The land briefing does not print this list.
   * Expected outcome: Infantry and armor ids.
   * Exceptions: None.
   */
  readonly unitIds: readonly string[];
  /**
   * Carriers that would move the ground units.
   *
   * Contract: Sea ship ids, enough for `unitIds`. Air is the one air unit. Land is empty.
   * When to use: A sea operation's `carrierIds`, or the air unit an air row names.
   * Expected outcome: Carrier ids, or an empty list for land.
   * Exceptions: None.
   */
  readonly carrierIds: readonly string[];
  /**
   * Turns the briefing quotes for the march, sail, or flight.
   *
   * Contract: Sea is muster turns, plus the sail, plus one. Air is the infantry's march, plus one, plus one more when a ferry is needed. Land is the land-step count, and it is zero when a unit already stands on the city.
   * When to use: Reinforcer counts and the cost column.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly etaTurns: number;
  /**
   * Urban hexes of the objective.
   *
   * Contract: Copied from the ranked city. Higher counts sort earlier inside the clear group and inside the rest.
   * When to use: The briefing's city-cell count.
   * Expected outcome: A positive count.
   * Exceptions: None.
   */
  readonly urbanHexCount: number;
  /**
   * Whether the city sits in an enemy home region.
   *
   * Contract: Copied from the ranked city. It does not change the order.
   * When to use: A later menu.
   * Expected outcome: True only when the city is in exactly one active enemy home.
   * Exceptions: None.
   */
  readonly inEnemyHome: boolean;
  /**
   * Fortified hexes already known at the city.
   *
   * Contract: Copied from the ranked city. Zero when the city is unexplored.
   * When to use: A later menu.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly knownFortifiedCount: number;
  /**
   * Other sides' units within the clear radius.
   *
   * Contract: `enemyUnitsWithin` at `LIFT_OBJECTIVE_CLEAR_RADIUS`, including neutral garrisons. Sea and air count units the seat has not seen. Land counts only units in the caller's snapshot.
   * When to use: The clear flag and a later menu.
   * Expected outcome: Zero when `clear` is true.
   * Exceptions: None.
   */
  readonly defenders: number;
  /**
   * Enemy ground units that could reach the city before the landing.
   *
   * Contract: Other sides' infantry and armor inside `etaTurns` and outside the clear radius. Sea and air count units the seat has not seen. Land counts only units in the caller's snapshot.
   * When to use: A later menu. The launch does not read it.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly reinforcers: number;
  /**
   * Whether no other side has a unit inside the clear radius.
   *
   * Contract: True only when `defenders` is zero. The engine launches a true sea or air row. A true land row is not launched.
   * When to use: The launch filter.
   * Expected outcome: True or false.
   * Exceptions: None.
   */
  readonly clear: boolean;
}
