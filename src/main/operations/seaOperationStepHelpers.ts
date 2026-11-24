/**
 * Steps every sea-operation phase shares.
 *
 * Purpose: Small pure helpers for the phase clock, cancels, end steps, and phase changes.
 * When to use: `seaOperationAdvance` and `seaOperationMuster`.
 * Expected outcome: Each helper returns a new value and changes nothing.
 * Exceptions: None.
 */

import type { Operation, OperationPhase } from '../../shared/operationTypes';
import type { OperationAction, OperationFacts, OperationOutcome, OperationStep } from './operationStepTypes';

/**
 * How many turns the current phase has already lasted.
 *
 * Purpose: A timeout fires when this reaches the phase constant. The opening tick is zero.
 * When to use: Muster, transit, and assault.
 * Expected outcome: `turnNumber - phaseTurn`.
 * Exceptions: None.
 */
export function elapsedTurns(operation: Operation, facts: OperationFacts): number {
  return facts.turnNumber - operation.phaseTurn;
}

/**
 * A cancel for each id, in the order given.
 *
 * Purpose: Giving up a muster clears the orders the operation had assigned.
 * When to use: When a muster abandons, and for units that do not board.
 * Expected outcome: One `cancelOrder` per id.
 * Exceptions: None.
 */
export function cancelAll(ids: readonly string[]): OperationAction[] {
  return ids.map((unitId) => ({ kind: 'cancelOrder' as const, unitId }));
}

/**
 * An ended step with no stored operation.
 *
 * Purpose: The four end outcomes share one shape.
 * When to use: Abandon, loss, and completion.
 * Expected outcome: `next` is null.
 * Exceptions: None.
 */
export function ended(outcome: OperationOutcome, reason: string, actions: readonly OperationAction[], releasedIds: readonly string[]): OperationStep {
  return { next: null, actions, releasedIds, outcome, reason };
}

/**
 * Copies an operation with a new force and, when the phase changes, a new phase clock.
 *
 * Purpose: Callers spread one object instead of repeating every stored field.
 * When to use: When a phase continues or changes but the operation is not finished.
 * Expected outcome: A new operation. The input is not changed.
 * Exceptions: None.
 */
export function continueOperation(operation: Operation, patch: {
  readonly unitIds: readonly string[];
  readonly carrierIds: readonly string[];
  readonly phase: OperationPhase;
  readonly phaseTurn: number;
  readonly landingH3?: string | null;
  readonly musterH3?: string;
}): Operation {
  return {
    ...operation,
    unitIds: patch.unitIds,
    carrierIds: patch.carrierIds,
    phase: patch.phase,
    phaseTurn: patch.phaseTurn,
    landingH3: patch.landingH3 !== undefined ? patch.landingH3 : operation.landingH3,
    musterH3: patch.musterH3 ?? operation.musterH3,
  };
}
