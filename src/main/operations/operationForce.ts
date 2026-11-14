/**
 * Which units the seat's operations hold, and which operation is carrying a unit.
 *
 * Purpose: The order parser and the briefing ask these two questions from the stored operations.
 * When to use: Before refusing an order on embarked cargo, and when leaving operation units out of the orderless briefing.
 * Expected outcome: Id sets and cargo lookups. No phase rules.
 * Exceptions: A database error in the cargo lookup is logged and treated as no cargo, so the order runs as it does today.
 */

import { getEmbarkedNavalForLandUnit } from '../gameActions/sealift';
import { dbGetOne } from '../gameDb';
import { readOperations } from '../gameDb/operationMemory';
import { logDebug, logError, logTrace } from '../logger';
import type { Operation, OperationMethod } from '../../shared/operationTypes';

/**
 * The operation that currently has a unit aboard one of its carriers.
 *
 * Purpose: A refusal names the operation and the ship or air unit.
 * When to use: The return of `operationCarryingUnit` and of the cargo lookup.
 * Expected outcome: One operation, its method, and the carrier the unit is aboard.
 * Exceptions: None.
 */
export interface OperationCargo {
  /**
   * The operation that lists this unit.
   *
   * Contract: An id from the seat's stored operations.
   * When to use: The refusal sentence and the next briefing.
   * Expected outcome: A non-empty operation id.
   * Exceptions: None.
   */
  readonly operationId: string;
  /**
   * How that operation travels.
   *
   * Contract: `sea` or `air`.
   * When to use: Choosing the sentence that tells the commander how to take the unit out.
   * Expected outcome: The operation's method.
   * Exceptions: None.
   */
  readonly method: OperationMethod;
  /**
   * The ship or air unit the cargo is aboard.
   *
   * Contract: One of that operation's `carrierIds`.
   * When to use: The refusal sentence.
   * Expected outcome: The carrier id passed to the lookup.
   * Exceptions: None.
   */
  readonly carrierId: string;
}

/**
 * Every ground unit and carrier in the given operations.
 *
 * Purpose: Callers that already hold the operation list should not read it again.
 * When to use: Before the briefing asks for orders on idle units.
 * Expected outcome: An empty set when `operations` is empty. Otherwise every id in `unitIds` and `carrierIds`.
 * Exceptions: None.
 */
export function operationForceIds(operations: readonly Operation[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const operation of operations) {
    for (const unitId of operation.unitIds) ids.add(unitId);
    for (const carrierId of operation.carrierIds) ids.add(carrierId);
  }
  logTrace('operations operationForceIds', { operationCount: operations.length, idCount: ids.size });
  return ids;
}

/**
 * The first operation that lists both the unit and the carrier it is aboard.
 *
 * Purpose: An order on that unit belongs to the operation, not the commander.
 * When to use: After the carrier assignment has been read.
 * Expected outcome: Null when `carrierId` is null or no operation lists both ids. Otherwise the first match in list order.
 * Exceptions: None.
 */
export function operationCarryingUnit(
  operations: readonly Operation[],
  unitId: string,
  carrierId: string | null
): OperationCargo | null {
  const match = carrierId === null
    ? undefined
    : operations.find((operation) => operation.unitIds.includes(unitId) && operation.carrierIds.includes(carrierId));
  logTrace('operations operationCarryingUnit', { unitId, carrierId, found: match !== undefined });
  if (match === undefined || carrierId === null) return null;
  return { operationId: match.id, method: match.method, carrierId };
}

/**
 * A lookup from a unit id to the operation that has it aboard.
 *
 * Purpose: One reply asks this for many rows and should read the operations once.
 * When to use: Strategic order parsing, before a row is applied.
 * Expected outcome: A function that returns the cargo, or null when the unit is not aboard an operation carrier.
 * Exceptions: None. A thrown read is logged by the returned function and becomes null. That fallback is deliberate: the order then runs as it does today.
 */
export function createOperationCargoLookup(seatId: string): (unitId: string) => OperationCargo | null {
  logDebug('operations createOperationCargoLookup', { seatId });
  let operations: readonly Operation[] | undefined;
  return (unitId: string): OperationCargo | null => {
    if (operations === undefined) {
      try {
        operations = readOperations({ getOne: dbGetOne }).get(seatId) ?? [];
      } catch (err) {
        logError('operations createOperationCargoLookup: could not read operations', { seatId, unitId }, err);
        return null;
      }
    }
    try {
      const carrierId = getEmbarkedNavalForLandUnit(unitId);
      const cargo = operationCarryingUnit(operations, unitId, carrierId);
      logTrace('operations operationCargoLookup', { seatId, unitId, found: cargo !== null });
      return cargo;
    } catch (err) {
      logError('operations createOperationCargoLookup: could not read cargo', { seatId, unitId }, err);
      return null;
    }
  };
}
