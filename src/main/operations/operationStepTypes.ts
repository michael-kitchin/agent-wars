/**
 * The contract between an operation's pure advance and the turn hook that applies its actions.
 *
 * Purpose: Air and sea advances share these types, and the turn hook applies them without depending on a sea-only module.
 * When to use: When reading or returning an operation step.
 * Expected outcome: The action, fact, and step types. This file has no runtime code.
 * Exceptions: None.
 */

import type { Operation } from '../../shared/operationTypes';

/**
 * One order the advance wants applied.
 *
 * Purpose: The turn hook performs these in order and does not invent its own.
 * When to use: The `actions` list of an `OperationStep`.
 * Expected outcome: A march, defend, hold-fire, embark, unload, or cancel for one unit.
 * Exceptions: None.
 */
export type OperationAction =
  | { readonly kind: 'march'; readonly unitId: string; readonly toH3: string }
  | { readonly kind: 'defend'; readonly unitId: string; readonly atH3: string }
  | { readonly kind: 'embark'; readonly unitId: string; readonly carrierId: string }
  | { readonly kind: 'unload'; readonly unitId: string }
  | { readonly kind: 'cancelOrder'; readonly unitId: string }
  | { readonly kind: 'holdFire'; readonly unitId: string };

/**
 * The standing order a unit already has, reduced to the two fields a release compares.
 *
 * Purpose: A stored order that the current phase would not have assigned releases the unit.
 * When to use: One entry per unit that has a standing order this turn.
 * Expected outcome: The order type, and the hex it names, or null when that order has no hex.
 * Exceptions: None.
 */
export interface StoredOrderFact {
  /**
   * Standing-order type stored for the unit.
   *
   * Contract: Compared with the type the current phase would assign.
   * When to use: The release check.
   * Expected outcome: The stored type string, such as `march` or `defend`.
   * Exceptions: None.
   */
  readonly type: string;
  /**
   * Hex the stored order names.
   *
   * Contract: A march or defend on the wrong hex is not an order the phase assigned.
   * When to use: The release check.
   * Expected outcome: An H3 index, or null when the order type has no hex.
   * Exceptions: None.
   */
  readonly h3Index: string | null;
}

/**
 * Everything the advance needs from the match, gathered by the caller.
 *
 * Purpose: The decision stays free of the database and the terrain cache.
 * When to use: Built once for the operation being advanced. The objective flags belong to that operation.
 * Expected outcome: Maps for the seat's own units, plus two choosers for a landing and a home port.
 * Exceptions: None.
 */
export interface OperationFacts {
  /**
   * Planning turn already stored for this tick.
   *
   * Contract: Elapsed turns are this value minus `phaseTurn`. The tick that set `phaseTurn` has elapsed 0.
   * When to use: Timeouts, and the `phaseTurn` written when the phase changes.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * Hex of each unit that still exists and still belongs to the seat.
   *
   * Contract: A unit missing from this map is gone and is dropped with no action.
   * When to use: Presence at a port or a landing, and the existence filter.
   * Expected outcome: Unit id to H3 index.
   * Exceptions: None.
   */
  readonly unitHexById: ReadonlyMap<string, string>;
  /**
   * Type of each unit that still belongs to the seat.
   *
   * Contract: `fillShip` loads infantry and armor and ignores other types.
   * When to use: When a muster is ready to load.
   * Expected outcome: Unit id to a unit type string.
   * Exceptions: None.
   */
  readonly unitTypeById: ReadonlyMap<string, string>;
  /**
   * Ship each embarked ground unit is on.
   *
   * Contract: Releasing a ship releases the units this map names for it, and unload names the same units.
   * When to use: Release, unload, and the landed-wave check.
   * Expected outcome: Ground unit id to ship id. A unit absent here is not aboard.
   * Exceptions: None.
   */
  readonly carrierByCargoId: ReadonlyMap<string, string>;
  /**
   * Standing order each unit already has.
   *
   * Contract: A unit with no entry is never released. A unit whose order matches the phase is not released.
   * When to use: The release check, and to avoid repeating an order the unit already has.
   * Expected outcome: Unit id to the reduced order.
   * Exceptions: None.
   */
  readonly storedOrderById: ReadonlyMap<string, StoredOrderFact>;
  /**
   * Whether the objective is still a known enemy city.
   *
   * Contract: A transit whose objective is neither an enemy city nor ours turns back.
   * When to use: The transit turn-back check.
   * Expected outcome: True when the city is still an enemy objective.
   * Exceptions: None.
   */
  readonly objectiveIsEnemyCity: boolean;
  /**
   * Whether the seat now controls the objective.
   *
   * Contract: An assault that holds the city is complete. A transit that holds it does not turn back.
   * When to use: The assault completion check and the transit turn-back check.
   * Expected outcome: True when strategic control of the objective belongs to the seat.
   * Exceptions: None.
   */
  readonly objectiveIsOwn: boolean;
  /**
   * Whether an enemy unit is standing on the objective.
   *
   * Contract: An air transit unloads instead of dropping when this is true. Fog-hidden units still count.
   * When to use: The air transit check. A sea advance does not read it.
   * Expected outcome: True when `enemyUnitsWithin` at radius 0 is greater than zero.
   * Exceptions: None.
   */
  readonly objectiveHasEnemyUnit: boolean;
  /**
   * Picks the landing a loaded force sails to from a port.
   *
   * Contract: The muster does not embark when this returns null.
   * When to use: Once, when a muster is ready, with the muster hex.
   * Expected outcome: A landing hex, or null when no route exists.
   * Exceptions: None from this file. A throw from the chooser propagates.
   */
  readonly chooseLanding: (fromH3: string) => string | null;
  /**
   * Picks the home port a ship turns back to.
   *
   * Contract: A return sails to this hex. A null keeps the operation's current muster hex.
   * When to use: When a transit turns back, with the hex of the first remaining ship.
   * Expected outcome: A port hex, or null when no route exists.
   * Exceptions: None from this file. A throw from the chooser propagates.
   */
  readonly chooseReturnPort: (fromH3: string) => string | null;
}

/**
 * How an advance ended, or that it is still going.
 *
 * Purpose: Logs and the briefing can tell a finished landing from a force that gave up.
 * When to use: The `outcome` of an `OperationStep`.
 * Expected outcome: `running` while the operation is stored again. The other three end it.
 * Exceptions: None.
 */
export type OperationOutcome = 'running' | 'completed' | 'lost' | 'abandoned';

/**
 * The stored operation and the orders that follow from one tick.
 *
 * Purpose: The turn hook applies `actions`, keeps `next` when it is not null, and logs the rest.
 * When to use: The return value of `advanceSeaOperation` and `turnSeaOperationBack`.
 * Expected outcome: Actions in the order they must be applied. Released units appear in `releasedIds` and in no action.
 * Exceptions: None.
 */
export interface OperationStep {
  /**
   * Operation to store for the next turn.
   *
   * Contract: Null ends the operation. Otherwise this replaces the previous row.
   * When to use: After the actions have been applied.
   * Expected outcome: The same id and objective, with the phase and the remaining units.
   * Exceptions: None.
   */
  readonly next: Operation | null;
  /**
   * Orders to apply, first to last.
   *
   * Contract: Embark happens before the ship is told to sail, and unload happens before the cargo is told to march.
   * When to use: Once, in this order.
   * Expected outcome: Zero or more actions. A released unit has none.
   * Exceptions: None.
   */
  readonly actions: readonly OperationAction[];
  /**
   * Units and ships removed because their standing order was not the phase's order.
   *
   * Contract: A later tick must not treat them as part of the operation, and a release is not a loss.
   * When to use: Logging, and the transit rule that abandons only when every departure was a release.
   * Expected outcome: Ids that were dropped for a release, including cargo of a released ship. They stay embarked.
   * Exceptions: None.
   */
  readonly releasedIds: readonly string[];
  /**
   * Whether the operation continues.
   *
   * Contract: Distinguishes a landing that took the city from one that was given up or destroyed.
   * When to use: Logs.
   * Expected outcome: `running` when `next` is not null.
   * Exceptions: None.
   */
  readonly outcome: OperationOutcome;
  /**
   * Short name of the rule that produced this step.
   *
   * Contract: A log can show why the phase changed without storing a second copy of the actions.
   * When to use: Logs.
   * Expected outcome: A stable lowercase token.
   * Exceptions: None.
   */
  readonly reason: string;
}

