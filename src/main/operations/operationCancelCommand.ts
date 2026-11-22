/**
 * Decides one commander cancel of a stored operation.
 *
 * Purpose: Keeps the cancel rules apart from the launch rules in `operationCommands`, which collects every command of a reply before writing.
 * When to use: From `applyOperationCommands` through its command resolution.
 * Expected outcome: A step that ends the operation, or a drop reason. Nothing here writes.
 * Exceptions: Propagates from `buildOperationFacts` or `cancelOperation`.
 */

import type { GameStateSnapshot } from '../gameDb';
import type { KnockoutCoordinates } from '../gameActions/knockoutConsequences';
import type { OperationCommand } from '../openRouter/operationCommandParsing';
import { isCampaignLift } from '../../shared/operationPurpose';
import { CAMPAIGN_OPERATION_ID, type Operation } from '../../shared/operationTypes';
import { cancelOperation } from './operationAdvance';
import { buildOperationFacts } from './operationTurnFlow';
import type { OperationStep } from './seaOperationAdvance';

/**
 * Decides one cancel against the operation stored at the start of the reply.
 *
 * Purpose: A cancel names an id from Active Operations. A return is already doing the only thing a cancel would do.
 * When to use: Each cancel, before the launch.
 * Expected outcome: A step to keep, or one drop reason. An applied cancel of a campaign lift also returns the lift's target as `campaignLiftTargetH3`.
 * Exceptions: Propagates from `buildOperationFacts` or `cancelOperation`.
 */
export function resolveCancelCommand(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly command: Extract<OperationCommand, { action: 'cancel' }>;
  readonly coordinates: KnockoutCoordinates;
  readonly stored: readonly Operation[];
  readonly replacements: ReadonlyMap<string, Operation | null>;
}): {
  /**
   * Whether the cancel was accepted.
   *
   * Contract: True only when a step was built for the stored operation.
   * When to use: Counting applied commands.
   * Expected outcome: True or false.
   * Exceptions: None.
   */
  readonly applied: boolean;
  /**
   * The phase the cancelled operation was in.
   *
   * Contract: Present when the cancel was applied.
   * When to use: Logging the cancel.
   * Expected outcome: A phase name, or absent.
   * Exceptions: None.
   */
  readonly phase?: string;
  /**
   * The step that ends the operation.
   *
   * Contract: Present when the cancel was applied.
   * When to use: Its actions and next operation are stored by the caller.
   * Expected outcome: An operation step, or absent.
   * Exceptions: None.
   */
  readonly step?: OperationStep;
  /**
   * The objective of the campaign lift this cancel removed.
   *
   * Contract: Present only when the cancel was applied and the cancelled operation is a campaign lift.
   * When to use: `resolveCommands` collects it so the caller can stamp `liftCancelledTurn` on the objective for that target.
   * Expected outcome: An H3 index, or absent.
   * Exceptions: None.
   */
  readonly campaignLiftTargetH3?: string;
  /**
   * Why the cancel was dropped.
   *
   * Contract: One sentence per reason. Empty when the cancel was applied.
   * When to use: Appended to the reply's drop list.
   * Expected outcome: Zero or more sentences.
   * Exceptions: None.
   */
  readonly dropReasons: readonly string[];
} {
  if (args.command.id === CAMPAIGN_OPERATION_ID) {
    return {
      applied: false,
      dropReasons: ['operations cancel dropped: the land campaign cannot be cancelled; launch a land option to give it a new target.'],
    };
  }
  const operation = args.stored.find((row) => row.id === args.command.id);
  if (operation === undefined || args.replacements.has(operation.id)) {
    return { applied: false, dropReasons: [`operations cancel dropped: ${args.command.id} is not one of your operations.`] };
  }
  if (operation.phase === 'return') {
    return { applied: false, dropReasons: [`operations cancel dropped: ${args.command.id} is already returning.`] };
  }
  const facts = buildOperationFacts({
    state: args.state,
    seatId: args.seatId,
    operation,
    coordinates: args.coordinates,
  });
  if (facts === null) {
    return { applied: false, dropReasons: [`operations cancel dropped: ${args.command.id} could not be read.`] };
  }
  return {
    applied: true,
    phase: operation.phase,
    step: cancelOperation(operation, facts),
    ...(isCampaignLift(operation) ? { campaignLiftTargetH3: operation.objectiveH3 } : {}),
    dropReasons: [],
  };
}
