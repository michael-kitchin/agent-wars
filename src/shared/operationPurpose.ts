/**
 * Reads the purpose of a stored operation.
 *
 * Purpose: A stored operation may carry no purpose, so every reader needs the same default.
 * When to use: Anywhere that must tell a raid from a campaign lift.
 * Expected outcome: Two pure helpers. This file imports only types, so the renderer may bundle it.
 * Exceptions: None.
 */

import type { Operation, OperationPurpose } from './operationTypes';

/**
 * The purpose of a stored operation.
 *
 * Purpose: An operation stored without a purpose is a raid.
 * When to use: When a rule depends on why the operation sails.
 * Expected outcome: `campaign` or `raid`.
 * Exceptions: None.
 */
export function operationPurposeOf(operation: Pick<Operation, 'purpose'>): OperationPurpose {
  return operation.purpose ?? 'raid';
}

/**
 * Whether a stored operation is a campaign lift.
 *
 * Purpose: Slots, landings, the briefing, and the muster timeout treat a campaign lift differently from a raid.
 * When to use: Wherever those rules branch.
 * Expected outcome: True only for purpose `campaign`.
 * Exceptions: None.
 */
export function isCampaignLift(operation: Pick<Operation, 'purpose'>): boolean {
  return operationPurposeOf(operation) === 'campaign';
}
