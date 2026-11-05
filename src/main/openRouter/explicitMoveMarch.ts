/**
 * Turns one over-budget strategic explicit move into a standing march.
 *
 * Purpose: A destination past this turn's budget was dropped, so the unit never started. A reachable
 * destination should keep moving on later turns.
 * When to use: From the strategic movement-validation failure branch, after the standing-order distance cancel.
 * Expected outcome: A stored march and this turn's first step, or no write and `converted: false`.
 * Exceptions: None. A route or assign failure is a false result.
 */

import type { GameStateSnapshot } from '../gameDb';
import { logDebug } from '../logger';
import type { AiSeatId } from '../../shared/seatIds';
import { isMissileUnitType } from '../../shared/missileRules';
import { createPathfindingSession, executePlanRouteWithSession } from '../tools/pathfinding';
import { executeStandingOrders } from '../tools/standingOrders';
import type { RequestOrdersFlowDeps } from './requestOrdersFlowDepsTypes';

/**
 * True when a movement rejection is "past this turn's budget".
 *
 * Purpose: Armor end-on-enter, a blocked land route, and an unknown distance are not marches.
 * When to use: Before planning a replacement march.
 * Expected outcome: True only for the validator's `can move at most N hex(es)` reason.
 * Exceptions: None.
 */
export function explicitMoveReasonIsOverBudget(reason: string): boolean {
  const overBudget = /can move at most \d+ hex\(es\)/.test(reason);
  logDebug('explicitMoveMarch explicitMoveReasonIsOverBudget', { overBudget });
  return overBudget;
}

/**
 * Inputs for replacing one explicit move with a march.
 *
 * Purpose: The apply loop already holds the validator, the map, and the pathfinding session.
 * When to use: One failed strategic explicit move.
 * Expected outcome: Enough to plan the route and store the march without a second session.
 * Exceptions: None.
 */
export interface ConvertOverBudgetExplicitMoveArgs {
  /**
   * Whether standing-order tools are enabled for this consultation.
   *
   * Contract: False never writes a march.
   * When to use: The consultation's orders flag.
   * Expected outcome: A disabled group leaves the original drop in place.
   * Exceptions: None.
   */
  readonly ordersEnabled: boolean;
  /**
   * Whether the row came from the model rather than standing-order generation.
   *
   * Contract: False never writes a march. Generated rows keep the existing cancel path.
   * When to use: Membership in the parsed explicit-move unit ids.
   * Expected outcome: A standing-order row is not converted.
   * Exceptions: None.
   */
  readonly fromModel: boolean;
  /**
   * Commander whose unit would march.
   *
   * Contract: The unit's owner must be this seat.
   * When to use: The consultation seat.
   * Expected outcome: Another seat's unit is not converted.
   * Exceptions: None.
   */
  readonly seatId: AiSeatId;
  /**
   * Unit the model ordered.
   *
   * Contract: Must exist on `state` and belong to `seatId`.
   * When to use: The failed explicit-move row.
   * Expected outcome: A missing or foreign unit is not converted.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * Strategic cell the model named.
   *
   * Contract: Must have a finite center in `latLngByH3`.
   * When to use: The rejected destination.
   * Expected outcome: A missing center is not converted.
   * Exceptions: None.
   */
  readonly toH3Index: string;
  /**
   * Validator reason for the original destination.
   *
   * Contract: Only the over-budget wording converts.
   * When to use: The reason from `validateAiOrder`.
   * Expected outcome: Other reasons leave the drop in place.
   * Exceptions: None.
   */
  readonly reason: string;
  /**
   * World snapshot used to find the unit and to plan.
   *
   * Contract: Read only.
   * When to use: The consultation snapshot.
   * Expected outcome: The unit row supplies type and owner.
   * Exceptions: None.
   */
  readonly state: GameStateSnapshot;
  /**
   * Hex centers.
   *
   * Contract: The destination must be present and finite.
   * When to use: The consultation coordinate map.
   * Expected outcome: A missing center skips conversion.
   * Exceptions: None.
   */
  readonly latLngByH3: Map<string, [number, number]>;
  /**
   * Lat/lng to H3 resolver used by standing-order assignment.
   *
   * Contract: Same resolver the apply loop uses.
   * When to use: Storing the march destination.
   * Expected outcome: The stored order resolves back to `toH3Index`.
   * Exceptions: None.
   */
  readonly resolveToH3: (lat: number, lng: number) => string | undefined;
  /**
   * Session already created for this consultation's standing orders.
   *
   * Contract: Reused. This function does not open another session.
   * When to use: The apply loop's planning session.
   * Expected outcome: The route uses that session's avoid-enemy graph.
   * Exceptions: None.
   */
  readonly pathfindingSession: ReturnType<typeof createPathfindingSession>;
  /**
   * Same strategic movement validator the apply loop uses.
   *
   * Contract: The first step must pass before a march is stored.
   * When to use: The consultation's `validateAiOrder`.
   * Expected outcome: An illegal first step writes nothing.
   * Exceptions: None.
   */
  readonly validateAiOrder: RequestOrdersFlowDeps['validateAiOrder'];
}

/**
 * Stores a march when the destination is past this turn's budget and still reachable.
 *
 * Purpose: The model named a cell. The engine takes the first legal step this turn and continues later.
 * When to use: Once per failed strategic explicit move that might be over budget.
 * Expected outcome: `{ converted: true, firstStep }` after the march is stored. `{ converted: false }` writes nothing.
 * Exceptions: None.
 */
export function convertOverBudgetExplicitMoveToMarch(
  args: ConvertOverBudgetExplicitMoveArgs
): { converted: false } | { converted: true; firstStep: string } {
  logDebug('explicitMoveMarch convertOverBudgetExplicitMoveToMarch', {
    unitId: args.unitId,
    toH3Index: args.toH3Index,
    ordersEnabled: args.ordersEnabled,
  });
  if (!args.ordersEnabled || !args.fromModel || !explicitMoveReasonIsOverBudget(args.reason)) {
    return { converted: false };
  }
  const unit = args.state.units.find((candidate) => candidate.id === args.unitId);
  if (!unit || unit.player !== args.seatId || unit.unitType === 'air' || isMissileUnitType(unit.unitType)) {
    return { converted: false };
  }
  const destination = args.latLngByH3.get(args.toH3Index);
  if (!destination || !Number.isFinite(destination[0]) || !Number.isFinite(destination[1])) {
    return { converted: false };
  }
  const route = executePlanRouteWithSession(
    args.unitId,
    [destination[0], destination[1]],
    { avoidEnemies: true },
    args.pathfindingSession
  );
  if (route.status !== 'ok' || route.path.length === 0 || route.turnsRequired < 2 || route.orderToH3.length === 0) {
    return { converted: false };
  }
  const firstStep = validateAiOrderStep(args, route.orderToH3);
  if (!firstStep) return { converted: false };
  const assigned = executeStandingOrders(
    args.seatId,
    'assign_order',
    { unitId: args.unitId, order: { type: 'march', destination: [destination[0], destination[1]] } },
    args.state,
    args.latLngByH3,
    args.resolveToH3
  );
  if (assigned.status === 'error') {
    logDebug('explicitMoveMarch assign_order rejected', {
      unitId: args.unitId,
      error: typeof assigned.error === 'string' ? assigned.error : 'unknown',
    });
    return { converted: false };
  }
  logDebug('explicitMoveMarch converted', {
    unitId: args.unitId,
    toH3Index: args.toH3Index,
    firstStep,
  });
  return { converted: true, firstStep };
}

/**
 * Accepts the route's first step only when the strategic validator does.
 *
 * Purpose: A multi-turn route can still name a first cell this turn's rules reject.
 * When to use: After `executePlanRouteWithSession` returns a step.
 * Expected outcome: The step, or null when validation fails. Nothing is written.
 * Exceptions: None.
 */
function validateAiOrderStep(args: ConvertOverBudgetExplicitMoveArgs, firstStep: string): string | null {
  const result = args.validateAiOrder(
    { unitId: args.unitId, toH3Index: firstStep },
    args.state,
    { seatId: args.seatId }
  );
  logDebug('explicitMoveMarch validateAiOrderStep', { unitId: args.unitId, firstStep, valid: result.valid });
  return result.valid ? firstStep : null;
}
