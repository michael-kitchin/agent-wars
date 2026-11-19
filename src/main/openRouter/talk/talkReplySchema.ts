/**
 * The structured-output schema for a talk reply.
 *
 * Purpose: Models that accept a response format are held to the talk object.
 * When to use: When the orders flow would attach a response format for this model.
 * Expected outcome: A `json_schema` response format named `talk_reply`.
 * Exceptions: None.
 */

import { logTrace } from '../../logger';
import {
  SIDE_AGREEMENT_INTENTS,
  SIDE_AGREEMENT_KINDS,
  SIDE_AGREEMENT_NO_THIRD_SIDE,
  SIDE_AGREEMENT_STATUSES,
} from '../../../shared/sideAgreements';
import { RELATIONSHIP_SCALE_MAX, SIDE_STANCES } from '../../../shared/sideMessages';

/**
 * Builds the response format for one talk call.
 *
 * Purpose: The side-code enums are the sides this reply may name, so a side that has left, or in a battle a side outside it, is not offered.
 * When to use: Once per talk call, with the codes `readTalkPromptInput` returns.
 * Expected outcome: `type` `json_schema`, name `talk_reply`, `strict` true, and the lists required. With `options.includeAgreements`, a third required list `agreements` follows the other two. Each of its items requires `id`, `with`, `kind`, `terms`, `zone`, `against`, `endTurn`, `status`, `intent`, and `reason`. `with` is limited to `sideCodes`. `against` is limited to `sideCodes` and `none`. Without the option the format is exactly the two-list format. Each `to` and `toward` enum is `sideCodes`. Each `stance` enum is `SIDE_STANCES`. Each stance item also requires `trust` and `threat`, each an integer with the enum 0 through `RELATIONSHIP_SCALE_MAX`. An enum is used because strict structured output does not accept minimum and maximum on every provider.
 * Exceptions: None.
 */
export function buildTalkReplyResponseFormat(
  sideCodes: readonly string[],
  options: { readonly includeAgreements: boolean }
): Record<string, unknown> {
  logTrace('talkReplySchema buildTalkReplyResponseFormat', { sideCodeCount: sideCodes.length, includeAgreements: options.includeAgreements });
  const sideEnum = [...sideCodes];
  const scoreEnum = Array.from({ length: RELATIONSHIP_SCALE_MAX + 1 }, (_unused, score) => score);
  const messageItem = {
    type: 'object',
    additionalProperties: false,
    properties: {
      to: { type: 'string', enum: sideEnum },
      text: { type: 'string' },
    },
    required: ['to', 'text'],
  };
  const stanceItem = {
    type: 'object',
    additionalProperties: false,
    properties: {
      toward: { type: 'string', enum: sideEnum },
      stance: { type: 'string', enum: [...SIDE_STANCES] },
      trust: { type: 'integer', enum: scoreEnum },
      threat: { type: 'integer', enum: scoreEnum },
      reason: { type: 'string' },
    },
    required: ['toward', 'stance', 'trust', 'threat', 'reason'],
  };
  const agreementItem = {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'integer' },
      with: { type: 'string', enum: sideEnum },
      kind: { type: 'string', enum: [...SIDE_AGREEMENT_KINDS] },
      terms: { type: 'string' },
      zone: { type: 'array', items: { type: 'string' } },
      against: { type: 'string', enum: [...sideCodes, SIDE_AGREEMENT_NO_THIRD_SIDE] },
      endTurn: { type: 'integer' },
      status: { type: 'string', enum: [...SIDE_AGREEMENT_STATUSES] },
      intent: { type: 'string', enum: [...SIDE_AGREEMENT_INTENTS] },
      reason: { type: 'string' },
    },
    required: ['id', 'with', 'kind', 'terms', 'zone', 'against', 'endTurn', 'status', 'intent', 'reason'],
  };
  return {
    type: 'json_schema',
    json_schema: {
      name: 'talk_reply',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          messages: { type: 'array', items: messageItem },
          stances: { type: 'array', items: stanceItem },
          ...(options.includeAgreements ? { agreements: { type: 'array', items: agreementItem } } : {}),
        },
        required: options.includeAgreements ? ['messages', 'stances', 'agreements'] : ['messages', 'stances'],
      },
    },
  };
}
