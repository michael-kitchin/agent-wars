/**
 * Decides the next phase, the orders, and the end of one air operation.
 *
 * Purpose: One pure step so the turn hook can apply orders without re-deciding them. An operation names up to `AIRLIFT_INFANTRY_CAPACITY` infantry units, and every rule treats the listed units together.
 * When to use: Once per stored air operation each planning turn, and once on the tick an air operation is launched.
 * Expected outcome: The next stored operation, or null when it ended, plus the actions to apply in order. An end defends the air unit when it still exists.
 * Exceptions: None. The caller supplies the facts. This file does not read the database or the map.
 */

import type { Operation, OperationPhase } from '../../shared/operationTypes';
import { logDebug } from '../logger';
import {
  OPERATION_AIR_TRANSIT_TIMEOUT_TURNS,
  OPERATION_ASSAULT_TIMEOUT_TURNS,
  OPERATION_MUSTER_TIMEOUT_TURNS,
} from './operationRules';
import type { OperationAction, OperationFacts, OperationOutcome, OperationStep } from './seaOperationAdvance';

/**
 * What a phase rule reads about one air operation.
 *
 * Purpose: One parameter object for the phase rules so each stays within the argument limit.
 * When to use: `advanceAirOperation`, after the carrier is known to exist.
 * Expected outcome: The stored operation, this tick's facts, the carrier and its hex, the infantry still on the map, and the phase clock.
 * Exceptions: None.
 */
interface AirPhaseInput {
  /**
   * The stored operation.
   *
   * Contract: Not changed by any rule.
   * When to use: Reading the muster hex, the objective, and the launch turn.
   * Expected outcome: The operation passed to `advanceAirOperation`.
   * Exceptions: None.
   */
  readonly operation: Operation;
  /**
   * The facts for this tick.
   *
   * Contract: Positions, stored orders, and cargo links as of the planning turn.
   * When to use: Locating the infantry and the carrier.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly facts: OperationFacts;
  /**
   * The air unit that carries the infantry.
   *
   * Contract: An id present in `facts.unitHexById`.
   * When to use: Every rule that writes an order for the carrier.
   * Expected outcome: The first id in `operation.carrierIds`.
   * Exceptions: None.
   */
  readonly carrierId: string;
  /**
   * The hex the air unit occupies.
   *
   * Contract: The hex `facts.unitHexById` gives for `carrierId`.
   * When to use: Unloading and the muster check.
   * Expected outcome: A hex id.
   * Exceptions: None.
   */
  readonly carrierHex: string;
  /**
   * Infantry still on the map, in stored order.
   *
   * Contract: Ids of `operation.unitIds` that appear in `facts.unitHexById`.
   * When to use: Every phase rule.
   * Expected outcome: Possibly empty; an empty list ends the operation.
   * Exceptions: None.
   */
  readonly live: readonly string[];
  /**
   * Turns the current phase has lasted.
   *
   * Contract: `turnNumber - phaseTurn`.
   * When to use: Timeouts.
   * Expected outcome: Zero on the opening tick.
   * Exceptions: None.
   */
  readonly elapsed: number;
}

/**
 * Ends the operation and defends the air unit on its current hex when that unit still exists.
 *
 * Purpose: Every end returns the air unit to `defend`, including a cancel and a timeout.
 * When to use: Any rule whose `next` is null and whose carrier may still be on the map.
 * Expected outcome: `next` is null. A `defend` for the carrier is last when its hex is known.
 * Exceptions: None.
 */
function endAirOperation(args: {
  readonly outcome: OperationOutcome;
  readonly reason: string;
  readonly actions: readonly OperationAction[];
  readonly releasedIds?: readonly string[];
  readonly carrierId: string | undefined;
  readonly facts: OperationFacts;
}): OperationStep {
  const hex = args.carrierId === undefined ? undefined : args.facts.unitHexById.get(args.carrierId);
  const actions = hex === undefined || args.carrierId === undefined
    ? args.actions
    : [...args.actions, { kind: 'defend' as const, unitId: args.carrierId, atH3: hex }];
  return { next: null, actions, releasedIds: args.releasedIds ?? [], outcome: args.outcome, reason: args.reason };
}

/**
 * Keeps the operation, changing phase or the infantry list when the caller names a new one.
 *
 * Purpose: A phase change records the turn it began. Staying in the phase keeps `phaseTurn`. A shorter infantry list is stored when units left.
 * When to use: Muster, transit, and assault rules that do not end the operation.
 * Expected outcome: `outcome` is `running`. `next` is the stored operation itself when the phase and the infantry list are unchanged. `phaseTurn` is the current turn only when `phase` differs.
 * Exceptions: None.
 */
function keepAirOperation(args: {
  readonly operation: Operation;
  readonly facts: OperationFacts;
  readonly actions: readonly OperationAction[];
  readonly reason: string;
  readonly phase?: OperationPhase;
  readonly unitIds?: readonly string[];
  readonly releasedIds?: readonly string[];
}): OperationStep {
  const phase = args.phase ?? args.operation.phase;
  const unitIds = args.unitIds ?? args.operation.unitIds;
  const sameList = unitIds.length === args.operation.unitIds.length
    && unitIds.every((id, index) => id === args.operation.unitIds[index]);
  const next = phase === args.operation.phase && sameList
    ? args.operation
    : {
      ...args.operation,
      unitIds,
      phase,
      phaseTurn: phase === args.operation.phase ? args.operation.phaseTurn : args.facts.turnNumber,
    };
  return { next, actions: args.actions, releasedIds: args.releasedIds ?? [], outcome: 'running', reason: args.reason };
}

/**
 * A hold-fire order when the air unit does not already have one.
 *
 * Purpose: The first tick replaces a base `defend`. Later ticks do not write the same order again.
 * When to use: Muster, while the operation is still gathering.
 * Expected outcome: One `holdFire` action, or none when the stored order is already `hold_fire`.
 * Exceptions: None.
 */
function holdUnless(facts: OperationFacts, carrierId: string): readonly OperationAction[] {
  if (facts.storedOrderById.get(carrierId)?.type === 'hold_fire') return [];
  return [{ kind: 'holdFire', unitId: carrierId }];
}

/**
 * True when the infantry is aboard this operation's air unit.
 *
 * Purpose: A drop and an unload apply only to cargo of this carrier.
 * When to use: Transit and cancel.
 * Expected outcome: True when `carrierByCargoId` names `carrierId`.
 * Exceptions: None.
 */
function aboard(facts: OperationFacts, infantryId: string, carrierId: string): boolean {
  return facts.carrierByCargoId.get(infantryId) === carrierId;
}

/**
 * Takes the infantry off the operation without leaving it aboard.
 *
 * Purpose: A cancel and a failed muster must not finish with the infantry still assigned to the air unit.
 * When to use: When the infantry still exists. Called once per infantry unit.
 * Expected outcome: An unload and a defend on the carrier hex when aboard. Otherwise a cancel of the infantry's order.
 * Exceptions: None.
 */
function detachInfantry(facts: OperationFacts, infantryId: string, carrierId: string | undefined): OperationAction[] {
  if (!facts.unitHexById.has(infantryId)) return [];
  if (carrierId !== undefined && aboard(facts, infantryId, carrierId)) {
    const hex = facts.unitHexById.get(carrierId);
    const actions: OperationAction[] = [{ kind: 'unload', unitId: infantryId }];
    if (hex !== undefined) actions.push({ kind: 'defend', unitId: infantryId, atH3: hex });
    return actions;
  }
  return [{ kind: 'cancelOrder', unitId: infantryId }];
}

/**
 * The infantry of an operation that is still on the map.
 *
 * Purpose: A unit missing from the map has been lost or removed, and no rule orders it.
 * When to use: The start of every phase rule and of cancel.
 * Expected outcome: Ids of `operation.unitIds` found in `facts.unitHexById`, in stored order.
 * Exceptions: None.
 */
function liveInfantry(operation: Operation, facts: OperationFacts): string[] {
  return operation.unitIds.filter((id) => facts.unitHexById.has(id));
}

/**
 * Advances one air operation by one planning turn.
 *
 * Purpose: Muster walks the infantry to the airport, transit ferries and drops by turn order, and assault waits for control.
 * When to use: Once per air operation per tick. Ferry and drop orders are added later, not here.
 * Expected outcome: The step for this phase. An ended operation defends the air unit when it still exists.
 * Exceptions: None.
 */
export function advanceAirOperation(operation: Operation, facts: OperationFacts): OperationStep {
  const carrierId = operation.carrierIds[0];
  const carrierHex = carrierId === undefined ? undefined : facts.unitHexById.get(carrierId);
  const live = liveInfantry(operation, facts);
  const elapsed = facts.turnNumber - operation.phaseTurn;
  logDebug('airOperationAdvance advanceAirOperation', {
    id: operation.id,
    phase: operation.phase,
    elapsed,
    carrierHex: carrierHex ?? null,
    liveInfantryCount: live.length,
  });
  if (carrierId === undefined || carrierHex === undefined) {
    const actions = operation.phase === 'muster'
      ? live.map((unitId) => ({ kind: 'cancelOrder' as const, unitId }))
      : [];
    return endAirOperation({ outcome: 'lost', reason: 'carrier-missing', actions, carrierId: undefined, facts });
  }
  const input: AirPhaseInput = { operation, facts, carrierId, carrierHex, live, elapsed };
  if (operation.phase === 'muster') return advanceMuster(input);
  if (operation.phase === 'transit') return advanceTransit(input);
  if (operation.phase === 'assault') return advanceAssault(input);
  return { next: operation, actions: [], releasedIds: [], outcome: 'running', reason: 'already-returning' };
}

/**
 * Walks the infantry to the airport and loads it once every remaining unit is there.
 *
 * Purpose: The air unit holds fire while the infantry marches. A unit given its own order is released, and the others go on. A missing unit is dropped from the list. The launch tick replaces each unit's earlier order.
 * When to use: The `muster` phase only.
 * Expected outcome: A march for each unit not yet at the airport, or an embark of every remaining unit into `transit`, or an end that defends the air unit.
 * Exceptions: None.
 */
function advanceMuster(input: AirPhaseInput): OperationStep {
  const { operation, facts, carrierId, carrierHex, live, elapsed } = input;
  if (live.length === 0) {
    return endAirOperation({ outcome: 'abandoned', reason: 'infantry-missing', actions: [], carrierId, facts });
  }
  if (carrierHex !== operation.musterH3) {
    return endAirOperation({
      outcome: 'abandoned',
      reason: 'carrier-left',
      actions: live.flatMap((unitId) => detachInfantry(facts, unitId, carrierId)),
      carrierId,
      facts,
    });
  }
  const launchTick = operation.launchedTurn === facts.turnNumber;
  const givenOwnOrder = (unitId: string): boolean => {
    const stored = facts.storedOrderById.get(unitId);
    const onMuster = stored !== undefined
      && (stored.type === 'march' || stored.type === 'defend')
      && stored.h3Index === operation.musterH3;
    return !launchTick && stored !== undefined && !onMuster;
  };
  const released = live.filter(givenOwnOrder);
  const kept = live.filter((unitId) => !givenOwnOrder(unitId));
  if (kept.length === 0) {
    return endAirOperation({ outcome: 'abandoned', reason: 'infantry-order', actions: [], releasedIds: released, carrierId, facts });
  }
  if (elapsed >= OPERATION_MUSTER_TIMEOUT_TURNS) {
    return endAirOperation({
      outcome: 'abandoned',
      reason: 'muster-timeout',
      actions: kept.flatMap((unitId) => detachInfantry(facts, unitId, carrierId)),
      releasedIds: released,
      carrierId,
      facts,
    });
  }
  if (kept.every((unitId) => facts.unitHexById.get(unitId) === operation.musterH3)) {
    return keepAirOperation({
      operation,
      facts,
      reason: 'loaded',
      phase: 'transit',
      unitIds: kept,
      releasedIds: released,
      actions: [
        ...holdUnless(facts, carrierId),
        ...kept.flatMap((unitId) => [
          { kind: 'cancelOrder' as const, unitId },
          { kind: 'embark' as const, unitId, carrierId },
        ]),
      ],
    });
  }
  const marches = kept
    .filter((unitId) => facts.unitHexById.get(unitId) !== operation.musterH3)
    .filter((unitId) => {
      const stored = facts.storedOrderById.get(unitId);
      return !(stored?.type === 'march' && stored.h3Index === operation.musterH3);
    })
    .map((unitId) => ({ kind: 'march' as const, unitId, toH3: operation.musterH3 }));
  return keepAirOperation({
    operation,
    facts,
    reason: 'mustering',
    unitIds: kept,
    releasedIds: released,
    actions: [...holdUnless(facts, carrierId), ...marches],
  });
}

/**
 * Waits while the infantry is aboard, then starts the assault or ends once it is on the ground.
 *
 * Purpose: The ferry and the drop are turn orders. This step only notices that the infantry has landed or that the drop is no longer legal. Units that landed already defend where they stand and leave the list.
 * When to use: The `transit` phase only.
 * Expected outcome: No action beyond those defends while the drop is still legal. An assault, a completion, or an unload when it is not.
 * Exceptions: None.
 */
function advanceTransit(input: AirPhaseInput): OperationStep {
  const { operation, facts, carrierId, carrierHex, live, elapsed } = input;
  if (live.length === 0) {
    return endAirOperation({ outcome: 'lost', reason: 'infantry-missing', actions: [], carrierId, facts });
  }
  const onBoard = live.filter((unitId) => aboard(facts, unitId, carrierId));
  const ashore = live.filter((unitId) => !aboard(facts, unitId, carrierId));
  const defendWhereTheyStand = ashore.flatMap((unitId): OperationAction[] => {
    const hex = facts.unitHexById.get(unitId);
    return hex === undefined ? [] : [{ kind: 'defend', unitId, atH3: hex }];
  });
  if (onBoard.length === 0) {
    const onObjective = ashore.filter((unitId) => facts.unitHexById.get(unitId) === operation.objectiveH3);
    if (onObjective.length > 0 && facts.objectiveIsOwn) {
      return endAirOperation({ outcome: 'completed', reason: 'objective-held', actions: [], carrierId, facts });
    }
    if (onObjective.length > 0) {
      return keepAirOperation({
        operation,
        facts,
        reason: 'assault',
        phase: 'assault',
        unitIds: onObjective,
        actions: defendWhereTheyStand,
      });
    }
    return endAirOperation({
      outcome: 'abandoned',
      reason: 'landed-elsewhere',
      actions: defendWhereTheyStand,
      carrierId,
      facts,
    });
  }
  const dropIllegal = (!facts.objectiveIsEnemyCity && !facts.objectiveIsOwn)
    || facts.objectiveHasEnemyUnit
    || elapsed >= OPERATION_AIR_TRANSIT_TIMEOUT_TURNS;
  if (dropIllegal) {
    return endAirOperation({
      outcome: 'abandoned',
      reason: 'transit-unload',
      actions: [
        ...defendWhereTheyStand,
        ...onBoard.flatMap((unitId): OperationAction[] => [
          { kind: 'unload', unitId },
          { kind: 'defend', unitId, atH3: carrierHex },
        ]),
      ],
      carrierId,
      facts,
    });
  }
  return keepAirOperation({ operation, facts, reason: 'in-transit', unitIds: onBoard, actions: defendWhereTheyStand });
}

/**
 * Waits until the seat controls the city or the assault has lasted too long.
 *
 * Purpose: The infantry already holds the city. The air unit stays on hold-fire until the operation ends.
 * When to use: The `assault` phase only.
 * Expected outcome: No action while the city is still enemy and the timeout has not been reached. An end defends the air unit.
 * Exceptions: None.
 */
function advanceAssault(input: AirPhaseInput): OperationStep {
  const { operation, facts, carrierId, live, elapsed } = input;
  if (live.length === 0) {
    return endAirOperation({ outcome: 'lost', reason: 'infantry-missing', actions: [], carrierId, facts });
  }
  if (facts.objectiveIsOwn) {
    return endAirOperation({ outcome: 'completed', reason: 'objective-held', actions: [], carrierId, facts });
  }
  if (elapsed >= OPERATION_ASSAULT_TIMEOUT_TURNS) {
    return endAirOperation({ outcome: 'abandoned', reason: 'assault-timeout', actions: [], carrierId, facts });
  }
  return keepAirOperation({ operation, facts, reason: 'holding', unitIds: live, actions: [] });
}

/**
 * Cancels one air operation without leaving any infantry aboard.
 *
 * Purpose: The commander takes the air unit back with cancel. Each infantry unit is unloaded or has its march cancelled.
 * When to use: A cancel command whose operation method is `air`. A `return` phase is left stored.
 * Expected outcome: An ended operation that defends the air unit, or the same operation when the phase is `return`.
 * Exceptions: None.
 */
export function cancelAirOperation(operation: Operation, facts: OperationFacts): OperationStep {
  const carrierId = operation.carrierIds[0];
  const carrierHex = carrierId === undefined ? undefined : facts.unitHexById.get(carrierId);
  const live = liveInfantry(operation, facts);
  logDebug('airOperationAdvance cancelAirOperation', { id: operation.id, phase: operation.phase });
  if (operation.phase === 'return') {
    return { next: operation, actions: [], releasedIds: [], outcome: 'running', reason: 'already-returning' };
  }
  if (carrierHex === undefined) {
    const actions = operation.phase === 'muster'
      ? live.map((unitId) => ({ kind: 'cancelOrder' as const, unitId }))
      : [];
    return endAirOperation({ outcome: 'lost', reason: 'carrier-missing', actions, carrierId: undefined, facts });
  }
  const actions = live.flatMap((unitId) => detachInfantry(facts, unitId, carrierId));
  return endAirOperation({
    outcome: 'abandoned',
    reason: operation.phase === 'assault' ? 'cancel-assault' : 'cancel',
    actions: operation.phase === 'assault' ? [] : actions,
    carrierId,
    facts,
  });
}
