/**
 * Decides the next phase, the orders, and the end of one air operation.
 *
 * Purpose: One pure step so the turn hook can apply orders without re-deciding them.
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
 * Keeps the operation, changing phase when the caller names a new one.
 *
 * Purpose: A phase change records the turn it began. Staying in the phase keeps `phaseTurn`.
 * When to use: Muster, transit, and assault rules that do not end the operation.
 * Expected outcome: `outcome` is `running`. `phaseTurn` is the current turn only when `phase` differs.
 * Exceptions: None.
 */
function keepAirOperation(args: {
  readonly operation: Operation;
  readonly facts: OperationFacts;
  readonly actions: readonly OperationAction[];
  readonly reason: string;
  readonly phase?: OperationPhase;
}): OperationStep {
  const phase = args.phase ?? args.operation.phase;
  const next = phase === args.operation.phase
    ? args.operation
    : { ...args.operation, phase, phaseTurn: args.facts.turnNumber };
  return { next, actions: args.actions, releasedIds: [], outcome: 'running', reason: args.reason };
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
 * When to use: When the infantry still exists.
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
 * Advances one air operation by one planning turn.
 *
 * Purpose: Muster walks the infantry to the airport, transit ferries and drops by turn order, and assault waits for control.
 * When to use: Once per air operation per tick. Ferry and drop orders are added later, not here.
 * Expected outcome: The step for this phase. An ended operation defends the air unit when it still exists.
 * Exceptions: None.
 */
export function advanceAirOperation(operation: Operation, facts: OperationFacts): OperationStep {
  const infantryId = operation.unitIds[0];
  const carrierId = operation.carrierIds[0];
  const carrierHex = carrierId === undefined ? undefined : facts.unitHexById.get(carrierId);
  const infantryHex = infantryId === undefined ? undefined : facts.unitHexById.get(infantryId);
  const elapsed = facts.turnNumber - operation.phaseTurn;
  logDebug('airOperationAdvance advanceAirOperation', {
    id: operation.id,
    phase: operation.phase,
    elapsed,
    carrierHex: carrierHex ?? null,
    infantryHex: infantryHex ?? null,
  });
  if (carrierHex === undefined) {
    const actions = operation.phase === 'muster' && infantryHex !== undefined && infantryId !== undefined
      ? [{ kind: 'cancelOrder' as const, unitId: infantryId }]
      : [];
    return endAirOperation({ outcome: 'lost', reason: 'carrier-missing', actions, carrierId: undefined, facts });
  }
  if (operation.phase === 'muster') return advanceMuster({ operation, facts, infantryId, carrierId, carrierHex, infantryHex, elapsed });
  if (operation.phase === 'transit') return advanceTransit({ operation, facts, infantryId, carrierId, carrierHex, infantryHex, elapsed });
  if (operation.phase === 'assault') return advanceAssault({ operation, facts, infantryId, carrierId, infantryHex, elapsed });
  return { next: operation, actions: [], releasedIds: [], outcome: 'running', reason: 'already-returning' };
}

/**
 * Walks the infantry to the airport and loads it once both are there.
 *
 * Purpose: The air unit holds fire while the infantry marches. A foreign order or a missing unit ends the operation.
 * When to use: The `muster` phase only.
 * Expected outcome: A march, or an embark into `transit`, or an end that defends the air unit.
 * Exceptions: None.
 */
function advanceMuster(args: {
  readonly operation: Operation;
  readonly facts: OperationFacts;
  readonly infantryId: string | undefined;
  readonly carrierId: string;
  readonly carrierHex: string;
  readonly infantryHex: string | undefined;
  readonly elapsed: number;
}): OperationStep {
  const { operation, facts, infantryId, carrierId, carrierHex, infantryHex, elapsed } = args;
  if (infantryHex === undefined || infantryId === undefined) {
    return endAirOperation({ outcome: 'abandoned', reason: 'infantry-missing', actions: [], carrierId, facts });
  }
  if (carrierHex !== operation.musterH3) {
    return endAirOperation({
      outcome: 'abandoned',
      reason: 'carrier-left',
      actions: detachInfantry(facts, infantryId, carrierId),
      carrierId,
      facts,
    });
  }
  const stored = facts.storedOrderById.get(infantryId);
  const onMuster = stored !== undefined
    && (stored.type === 'march' || stored.type === 'defend')
    && stored.h3Index === operation.musterH3;
  if (stored !== undefined && !onMuster) {
    return endAirOperation({
      outcome: 'abandoned',
      reason: 'infantry-order',
      actions: [],
      releasedIds: [infantryId],
      carrierId,
      facts,
    });
  }
  if (elapsed >= OPERATION_MUSTER_TIMEOUT_TURNS) {
    return endAirOperation({
      outcome: 'abandoned',
      reason: 'muster-timeout',
      actions: detachInfantry(facts, infantryId, carrierId),
      carrierId,
      facts,
    });
  }
  if (infantryHex === operation.musterH3) {
    return keepAirOperation({
      operation,
      facts,
      reason: 'loaded',
      phase: 'transit',
      actions: [
        ...holdUnless(facts, carrierId),
        { kind: 'cancelOrder', unitId: infantryId },
        { kind: 'embark', unitId: infantryId, carrierId },
      ],
    });
  }
  const marching = stored?.type === 'march' && stored.h3Index === operation.musterH3;
  return keepAirOperation({
    operation,
    facts,
    reason: 'mustering',
    actions: [
      ...holdUnless(facts, carrierId),
      ...(marching ? [] : [{ kind: 'march' as const, unitId: infantryId, toH3: operation.musterH3 }]),
    ],
  });
}

/**
 * Waits while the infantry is aboard, then starts the assault or ends once it is on the ground.
 *
 * Purpose: The ferry and the drop are turn orders. This step only notices that the infantry has landed or that the drop is no longer legal.
 * When to use: The `transit` phase only.
 * Expected outcome: No action while the drop is still legal. An assault, a completion, or an unload when it is not.
 * Exceptions: None.
 */
function advanceTransit(args: {
  readonly operation: Operation;
  readonly facts: OperationFacts;
  readonly infantryId: string | undefined;
  readonly carrierId: string;
  readonly carrierHex: string;
  readonly infantryHex: string | undefined;
  readonly elapsed: number;
}): OperationStep {
  const { operation, facts, infantryId, carrierId, carrierHex, infantryHex, elapsed } = args;
  if (infantryHex === undefined || infantryId === undefined) {
    return endAirOperation({ outcome: 'lost', reason: 'infantry-missing', actions: [], carrierId, facts });
  }
  if (!aboard(facts, infantryId, carrierId)) {
    if (infantryHex === operation.objectiveH3 && facts.objectiveIsOwn) {
      return endAirOperation({ outcome: 'completed', reason: 'objective-held', actions: [], carrierId, facts });
    }
    if (infantryHex === operation.objectiveH3) {
      return keepAirOperation({
        operation,
        facts,
        reason: 'assault',
        phase: 'assault',
        actions: [{ kind: 'defend', unitId: infantryId, atH3: infantryHex }],
      });
    }
    return endAirOperation({
      outcome: 'abandoned',
      reason: 'landed-elsewhere',
      actions: [{ kind: 'defend', unitId: infantryId, atH3: infantryHex }],
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
        { kind: 'unload', unitId: infantryId },
        { kind: 'defend', unitId: infantryId, atH3: carrierHex },
      ],
      carrierId,
      facts,
    });
  }
  return keepAirOperation({ operation, facts, reason: 'in-transit', actions: [] });
}

/**
 * Waits until the seat controls the city or the assault has lasted too long.
 *
 * Purpose: The infantry already holds the city. The air unit stays on hold-fire until the operation ends.
 * When to use: The `assault` phase only.
 * Expected outcome: No action while the city is still enemy and the timeout has not been reached. An end defends the air unit.
 * Exceptions: None.
 */
function advanceAssault(args: {
  readonly operation: Operation;
  readonly facts: OperationFacts;
  readonly infantryId: string | undefined;
  readonly carrierId: string;
  readonly infantryHex: string | undefined;
  readonly elapsed: number;
}): OperationStep {
  const { operation, facts, infantryId, carrierId, infantryHex, elapsed } = args;
  if (infantryHex === undefined || infantryId === undefined) {
    return endAirOperation({ outcome: 'lost', reason: 'infantry-missing', actions: [], carrierId, facts });
  }
  if (facts.objectiveIsOwn) {
    return endAirOperation({ outcome: 'completed', reason: 'objective-held', actions: [], carrierId, facts });
  }
  if (elapsed >= OPERATION_ASSAULT_TIMEOUT_TURNS) {
    return endAirOperation({ outcome: 'abandoned', reason: 'assault-timeout', actions: [], carrierId, facts });
  }
  return keepAirOperation({ operation, facts, reason: 'holding', actions: [] });
}

/**
 * Cancels one air operation without leaving the infantry aboard.
 *
 * Purpose: The commander takes the air unit back with cancel. The infantry is unloaded or its march is cancelled.
 * When to use: A cancel command whose operation method is `air`. A `return` phase is left stored.
 * Expected outcome: An ended operation that defends the air unit, or the same operation when the phase is `return`.
 * Exceptions: None.
 */
export function cancelAirOperation(operation: Operation, facts: OperationFacts): OperationStep {
  const infantryId = operation.unitIds[0];
  const carrierId = operation.carrierIds[0];
  const carrierHex = carrierId === undefined ? undefined : facts.unitHexById.get(carrierId);
  logDebug('airOperationAdvance cancelAirOperation', { id: operation.id, phase: operation.phase });
  if (operation.phase === 'return') {
    return { next: operation, actions: [], releasedIds: [], outcome: 'running', reason: 'already-returning' };
  }
  if (carrierHex === undefined) {
    const actions = operation.phase === 'muster' && infantryId !== undefined && facts.unitHexById.has(infantryId)
      ? [{ kind: 'cancelOrder' as const, unitId: infantryId }]
      : [];
    return endAirOperation({ outcome: 'lost', reason: 'carrier-missing', actions, carrierId: undefined, facts });
  }
  const actions = infantryId === undefined ? [] : detachInfantry(facts, infantryId, carrierId);
  return endAirOperation({
    outcome: 'abandoned',
    reason: operation.phase === 'assault' ? 'cancel-assault' : 'cancel',
    actions: operation.phase === 'assault' ? [] : actions,
    carrierId,
    facts,
  });
}
