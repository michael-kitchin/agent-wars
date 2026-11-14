/**
 * Sends one operation to the sea or air decision.
 *
 * Purpose: The turn advance and a commander launch share one call and do not branch on the method themselves.
 * When to use: Once per stored operation, and once for a cancel.
 * Expected outcome: The step from `advanceSeaOperation` or `advanceAirOperation`, matching `operation.method`.
 * Exceptions: None. The called decision does not throw.
 */

import type { Operation } from '../../shared/operationTypes';
import { logTrace } from '../logger';
import { advanceAirOperation, cancelAirOperation } from './airOperationAdvance';
import { advanceSeaOperation, cancelSeaOperation, type OperationFacts, type OperationStep } from './seaOperationAdvance';

/**
 * Advances one operation by one planning turn.
 *
 * Purpose: Sea and air operations stay in their own files and still share the turn hook.
 * When to use: The stored-operation loop and the first step of a launch.
 * Expected outcome: The sea step or the air step for this operation.
 * Exceptions: None.
 */
export function advanceOperation(operation: Operation, facts: OperationFacts): OperationStep {
  logTrace('operationAdvance advanceOperation', { id: operation.id, method: operation.method, phase: operation.phase });
  return operation.method === 'air' ? advanceAirOperation(operation, facts) : advanceSeaOperation(operation, facts);
}

/**
 * Cancels one operation, or reports that it is already returning.
 *
 * Purpose: A cancel command does not need to know which file owns the method.
 * When to use: After the operation id has been found in the seat's stored list.
 * Expected outcome: The sea cancel or the air cancel for this operation.
 * Exceptions: None.
 */
export function cancelOperation(operation: Operation, facts: OperationFacts): OperationStep {
  logTrace('operationAdvance cancelOperation', { id: operation.id, method: operation.method, phase: operation.phase });
  return operation.method === 'air' ? cancelAirOperation(operation, facts) : cancelSeaOperation(operation, facts);
}
