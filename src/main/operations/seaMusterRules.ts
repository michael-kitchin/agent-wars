/**
 * Sea muster readiness.
 *
 * Purpose: Decides when a sea operation's muster has what it needs to load and sail, so the force sails whole instead of with the first ship.
 * When to use: By the sea operation step that advances a muster.
 * Expected outcome: One pure rule, `seaMusterReady`.
 * Exceptions: None.
 */

import { logTrace } from '../logger';
import { fillShip, shipsNeeded } from './liftRules';
import { SEA_RAID_TIMEOUT_MIN_SHARE } from './operationRules';

/**
 * Inputs to the muster readiness rule.
 *
 * Contract: Counts describe the muster as it stands this turn, after units and ships lost from the map were removed.
 * When to use: As the argument of `seaMusterReady`.
 * Expected outcome: Plain values only.
 * Exceptions: None.
 */
export interface SeaMusterReadyArgs {
  /**
   * Unit types of the ground units that stand at the port now.
   *
   * Contract: One entry per present ground unit. An unknown type is the empty string.
   * When to use: To count the present troops and the ships they need.
   * Expected outcome: Its length is the number of troops at the port.
   * Exceptions: None.
   */
  readonly presentUnitTypes: readonly string[];
  /**
   * Ground units still in the operation, at the port or not.
   *
   * Contract: Never less than the length of `presentUnitTypes`.
   * When to use: To tell whether every troop has arrived.
   * Expected outcome: Equal to the present count when nobody is still marching.
   * Exceptions: None.
   */
  readonly remainingUnitCount: number;
  /**
   * Ships of the operation that stand at the port now.
   *
   * Contract: Zero means nothing can load.
   * When to use: To check that a ship is there, and enough of them.
   * Expected outcome: A count from zero to `remainingShipCount`.
   * Exceptions: None.
   */
  readonly shipsPresentCount: number;
  /**
   * Ships still in the operation, at the port or not.
   *
   * Contract: Never less than `shipsPresentCount`.
   * When to use: To avoid waiting for more ships than the operation owns.
   * Expected outcome: Caps the number of ships a muster waits for.
   * Exceptions: None.
   */
  readonly remainingShipCount: number;
  /**
   * Whether the muster has run out its allowed turns.
   *
   * Contract: True from the timeout turn on.
   * When to use: To let a partial force sail or be abandoned.
   * Expected outcome: Switches the rule to the minimum-troops test.
   * Exceptions: None.
   */
  readonly timedOut: boolean;
  /**
   * Fewest troops the ships at the port must carry once the muster has timed out.
   *
   * Contract: A positive count. For a raid, the floor under `SEA_RAID_TIMEOUT_MIN_SHARE`; for a campaign lift, the whole minimum.
   * When to use: Only when `timedOut` is true.
   * Expected outcome: Fewer troops carried than the minimum means the operation is abandoned.
   * Exceptions: None.
   */
  readonly minUnitsAtTimeout: number;
  /**
   * Whether the muster belongs to a campaign lift.
   *
   * Contract: True only for a campaign lift. Absent or false means a raid.
   * When to use: Only when `timedOut` is true. A campaign lift needs `minUnitsAtTimeout` carried. A raid needs the larger of that and `SEA_RAID_TIMEOUT_MIN_SHARE` of its remaining troops.
   * Expected outcome: Chooses the timeout bar: the campaign lift's own minimum, or the raid's share of its remaining troops.
   * Exceptions: None.
   */
  readonly campaignLift?: boolean;
}

/**
 * Counts the troops a number of ships can take aboard.
 *
 * Purpose: A timed-out muster sails only with the force the ships at the port can take, so it counts what they can carry, not every troop waiting there.
 * When to use: From `seaMusterReady` at the timeout of a raid or a campaign lift.
 * Expected outcome: The troops loaded by filling `shipCount` ships one by one with `fillShip`, the same per-ship rule the lift's loading uses: up to `NAVAL_CARGO_SLOTS` slots, armor first. At most the number of infantry and armor in `unitTypes`.
 * Exceptions: None.
 */
function troopsShipsCanCarry(unitTypes: readonly string[], shipCount: number): number {
  let waiting = unitTypes.map((unitType, index) => ({ id: String(index), unitType }));
  let carried = 0;
  for (let ship = 0; ship < shipCount; ship += 1) {
    const aboard = new Set(fillShip(waiting));
    if (aboard.size === 0) break;
    carried += aboard.size;
    waiting = waiting.filter((unit) => !aboard.has(unit.id));
  }
  return carried;
}

/**
 * Tells whether a muster may load and sail.
 *
 * Purpose: A muster waits until every troop is at the port and the ships those troops need are there too. At the timeout it sails with the troops and ships it has, if the ships can carry enough. A raid needs `SEA_RAID_TIMEOUT_MIN_SHARE` of its remaining troops, and a campaign lift needs its own minimum.
 * When to use: Each turn a sea operation is in its muster phase.
 * Expected outcome: False with no ship at the port. At the timeout, true when the smaller of the present troops and what the present ships can carry reaches the bar: `max(minUnitsAtTimeout, ceil(SEA_RAID_TIMEOUT_MIN_SHARE × remaining troops))` for a raid, `minUnitsAtTimeout` for a campaign lift. Otherwise true when every troop is present and the ships present cover the smaller of the ships left and the ships the troops need.
 * Exceptions: None.
 */
export function seaMusterReady(args: SeaMusterReadyArgs): boolean {
  const { presentUnitTypes, remainingUnitCount, shipsPresentCount, remainingShipCount, timedOut, minUnitsAtTimeout } = args;
  let ready: boolean;
  let needed: number | null = null;
  if (shipsPresentCount === 0) ready = false;
  else if (timedOut) {
    const carried = Math.min(presentUnitTypes.length, troopsShipsCanCarry(presentUnitTypes, shipsPresentCount));
    needed = args.campaignLift === true
      ? minUnitsAtTimeout
      : Math.max(minUnitsAtTimeout, Math.ceil(SEA_RAID_TIMEOUT_MIN_SHARE * remainingUnitCount));
    ready = carried >= needed;
  } else {
    ready = presentUnitTypes.length === remainingUnitCount
      && shipsPresentCount >= Math.min(remainingShipCount, shipsNeeded(presentUnitTypes));
  }
  logTrace('seaMusterRules seaMusterReady', { presentCount: presentUnitTypes.length, remainingUnitCount, shipsPresentCount, remainingShipCount, timedOut, needed, ready });
  return ready;
}
