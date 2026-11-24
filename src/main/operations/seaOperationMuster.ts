/**
 * The muster phase of a sea operation: gather, load, or give up.
 *
 * Purpose: Holds the muster rules apart from the later phases.
 * When to use: `advanceSeaOperation` for an operation in its muster phase.
 * Expected outcome: A step that gathers, loads and sails, or ends the operation.
 * Exceptions: None.
 */

import { compareCodeUnits } from '../../shared/codeUnitOrder';
import type { Operation } from '../../shared/operationTypes';
import { isCampaignLift } from '../../shared/operationPurpose';
import { fillShip } from './liftRules';
import { seaMusterReady } from './seaMusterRules';
import { OPERATION_MIN_GROUND_UNITS, OPERATION_MUSTER_TIMEOUT_TURNS } from './operationRules';
import { cancelAll, continueOperation, elapsedTurns, ended } from './seaOperationStepHelpers';
import type { OperationAction, OperationFacts, OperationStep } from './operationStepTypes';

/**
 * Lost only when the side that emptied lost a member to the map.
 *
 * Purpose: A sunk ship or a destroyed force is a loss, while a muster the commander emptied is abandoned.
 * When to use: When a muster has no ground unit or no ship left.
 * Expected outcome: `lost` when the ground units are all gone and one of them, not released, is absent from `unitHexById`, or the same for the ships. Otherwise `abandoned`.
 * Exceptions: None.
 */
function emptyMusterOutcome(args: {
  readonly operation: Operation;
  readonly facts: OperationFacts;
  readonly unitIds: readonly string[];
  readonly carrierIds: readonly string[];
  readonly releasedIds: readonly string[];
}): 'abandoned' | 'lost' {
  const released = new Set(args.releasedIds);
  const lostFrom = (ids: readonly string[]): boolean => ids.some((id) => !released.has(id) && !args.facts.unitHexById.has(id));
  const groundLost = args.unitIds.length === 0 && lostFrom(args.operation.unitIds);
  const shipsLost = args.carrierIds.length === 0 && lostFrom(args.operation.carrierIds);
  return groundLost || shipsLost ? 'lost' : 'abandoned';
}

/**
 * The march or defend that brings a unit to the muster, or null when it already has it.
 *
 * Purpose: A unit standing on the port defends there. Any other unit marches there.
 * When to use: Muster, when the force is not yet ready to load.
 * Expected outcome: One action, or null when the stored order is already the one this would write.
 * Exceptions: None.
 */
function gatherAction(unitId: string, musterH3: string, facts: OperationFacts): OperationAction | null {
  const order = facts.storedOrderById.get(unitId);
  if (facts.unitHexById.get(unitId) === musterH3) {
    if (order?.type === 'defend' && order.h3Index === musterH3) return null;
    return { kind: 'defend', unitId, atH3: musterH3 };
  }
  if (order?.type === 'march' && order.h3Index === musterH3) return null;
  return { kind: 'march', unitId, toH3: musterH3 };
}

/**
 * Loads the units waiting at the port and sails the ships that took them.
 *
 * Purpose: Ready muster returns only these actions, not the gather marches.
 * When to use: When the muster is ready (the ships its troops need are at the port, or the timeout has come) and a landing exists.
 * Expected outcome: Cancel and embark for each loaded unit, a march for each loaded ship, and cancels for everyone else.
 * Exceptions: None.
 */
function loadAndSail(args: {
  readonly operation: Operation;
  readonly facts: OperationFacts;
  readonly unitIds: readonly string[];
  readonly carrierIds: readonly string[];
  readonly presentIds: readonly string[];
  readonly shipsPresent: readonly string[];
  readonly landing: string;
}): OperationStep {
  const { operation, facts, unitIds, carrierIds, presentIds, shipsPresent, landing } = args;
  let waiting = [...presentIds];
  const embarked = new Set<string>();
  const loadedShips = new Set<string>();
  const actions: OperationAction[] = [];
  for (const shipId of [...shipsPresent].sort(compareCodeUnits)) {
    if (waiting.length === 0) break;
    const chosen = fillShip(waiting.map((id) => ({ id, unitType: facts.unitTypeById.get(id) ?? '' })));
    if (chosen.length === 0) break;
    for (const unitId of chosen) {
      actions.push({ kind: 'cancelOrder', unitId });
      actions.push({ kind: 'embark', unitId, carrierId: shipId });
      embarked.add(unitId);
    }
    loadedShips.add(shipId);
    const chosenIds = new Set(chosen);
    waiting = waiting.filter((id) => !chosenIds.has(id));
  }
  for (const shipId of [...loadedShips].sort(compareCodeUnits)) {
    actions.push({ kind: 'march', unitId: shipId, toH3: landing });
  }
  for (const shipId of carrierIds) {
    if (!loadedShips.has(shipId)) actions.push({ kind: 'cancelOrder', unitId: shipId });
  }
  for (const unitId of unitIds) {
    if (!embarked.has(unitId)) actions.push({ kind: 'cancelOrder', unitId });
  }
  const next = continueOperation(operation, {
    unitIds: unitIds.filter((unitId) => embarked.has(unitId)),
    carrierIds: carrierIds.filter((shipId) => loadedShips.has(shipId)),
    phase: 'transit',
    phaseTurn: facts.turnNumber,
    landingH3: landing,
  });
  return { next, actions, releasedIds: [], outcome: 'running', reason: 'muster-loaded' };
}

/**
 * The state a muster step reads.
 *
 * Purpose: One parameter object for `advanceSeaMuster`.
 * When to use: The sea phase router, once per muster tick.
 * Expected outcome: The operation, its facts, and the ids that remain or were released.
 * Exceptions: None.
 */
export interface SeaMusterInput {
  /**
   * The stored operation in its muster phase.
   *
   * Contract: `phase` is `muster`.
   * When to use: Reading the muster hex, the phase clock, and the minimum troops.
   * Expected outcome: Unchanged by the step.
   * Exceptions: None.
   */
  readonly operation: Operation;
  /**
   * The facts for this tick.
   *
   * Contract: Positions, stored orders, and unit types as of the planning turn.
   * When to use: Locating units and choosing a landing.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly facts: OperationFacts;
  /**
   * Ground units still in the operation.
   *
   * Contract: Ids that exist and were not released.
   * When to use: Counting troops and loading.
   * Expected outcome: Ids from the operation's own list.
   * Exceptions: None.
   */
  readonly unitIds: readonly string[];
  /**
   * Ships still in the operation.
   *
   * Contract: Ids that exist and were not released.
   * When to use: Counting ships and loading.
   * Expected outcome: Ids from the operation's own list.
   * Exceptions: None.
   */
  readonly carrierIds: readonly string[];
  /**
   * Ids released this tick.
   *
   * Contract: Units or ships given their own order, handed back to the commander.
   * When to use: Passed through to the returned step.
   * Expected outcome: Unchanged.
   * Exceptions: None.
   */
  readonly releasedIds: readonly string[];
}

/**
 * Advances a muster: gather, load, or give up.
 *
 * Purpose: The force marches to the port and boards when every troop and the ships those troops need are there. At the timeout a raid sails when the ships at the port can carry at least `SEA_RAID_TIMEOUT_MIN_SHARE` of its remaining troops and at least `OPERATION_MIN_GROUND_UNITS`; a campaign lift sails when they can carry its own `minGroundUnits`.
 * When to use: `operation.phase` is `muster`.
 * Expected outcome: `transit` when the force loads. `abandoned` when it cannot, or `lost` when it emptied because a unit or ship is gone from the map. Otherwise the same phase.
 * Exceptions: None. A null landing abandons without embarking.
 */
export function advanceSeaMuster(input: SeaMusterInput): OperationStep {
  const { operation, facts, unitIds, carrierIds, releasedIds } = input;
  const remaining = [...unitIds, ...carrierIds];
  if (unitIds.length === 0 || carrierIds.length === 0) {
    const outcome = emptyMusterOutcome({ operation, facts, unitIds, carrierIds, releasedIds });
    return ended(outcome, 'muster-empty', cancelAll(remaining), releasedIds);
  }
  const presentIds = unitIds.filter((unitId) => facts.unitHexById.get(unitId) === operation.musterH3);
  const shipsPresent = carrierIds.filter((shipId) => facts.unitHexById.get(shipId) === operation.musterH3);
  const timedOut = elapsedTurns(operation, facts) >= OPERATION_MUSTER_TIMEOUT_TURNS;
  const ready = seaMusterReady({
    presentUnitTypes: presentIds.map((unitId) => facts.unitTypeById.get(unitId) ?? ''),
    remainingUnitCount: unitIds.length,
    shipsPresentCount: shipsPresent.length,
    remainingShipCount: carrierIds.length,
    timedOut,
    minUnitsAtTimeout: operation.minGroundUnits ?? OPERATION_MIN_GROUND_UNITS,
    campaignLift: isCampaignLift(operation),
  });
  if (timedOut && !ready) return ended('abandoned', 'muster-timeout', cancelAll(remaining), releasedIds);
  if (ready) {
    const landing = facts.chooseLanding(operation.musterH3);
    if (landing === null) return ended('abandoned', 'muster-no-landing', cancelAll(remaining), releasedIds);
    const loaded = loadAndSail({ operation, facts, unitIds, carrierIds, presentIds, shipsPresent, landing });
    return { ...loaded, releasedIds };
  }
  const actions = remaining.flatMap((unitId) => {
    const action = gatherAction(unitId, operation.musterH3, facts);
    return action === null ? [] : [action];
  });
  return {
    next: continueOperation(operation, { unitIds, carrierIds, phase: 'muster', phaseTurn: operation.phaseTurn }),
    actions,
    releasedIds,
    outcome: 'running',
    reason: 'muster-gather',
  };
}
