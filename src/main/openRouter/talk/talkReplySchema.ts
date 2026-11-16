/**
 * The structured-output schema for a talk reply.
 *
 * Purpose: Models that accept a response format are held to the talk object.
 * When to use: When the orders flow would attach a response format for this model.
 * Expected outcome: A `json_schema` response format named `talk_reply`.
 * Exceptions: None.
 */

import { logTrace } from '../../logger';
import { RELATIONSHIP_SCALE_MAX, SIDE_STANCES } from '../../../shared/sideMessages';

/**
 * Builds the response format for one talk call.
 *
 * Purpose: The side-code enums are the sides this reply may name, so a side that has left, or in a battle a side outside it, is not offered.
 * When to use: Once per talk call, with the codes `readTalkPromptInput` returns.
 * Expected outcome: `type` `json_schema`, name `talk_reply`, `strict` true, and both lists required. Each `to` and `toward` enum is `sideCodes`. Each `stance` enum is `SIDE_STANCES`. Each stance item also requires `trust` and `threat`, each an integer with the enum 0 through `RELATIONSHIP_SCALE_MAX`. An enum is used because strict structured output does not accept minimum and maximum on every provider.
 * Exceptions: None.
 */
export function buildTalkReplyResponseFormat(sideCodes: readonly string[]): Record<string, unknown> {
  logTrace('talkReplySchema buildTalkReplyResponseFormat', { sideCodeCount: sideCodes.length });
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
        },
        required: ['messages', 'stances'],
      },
    },
  };
}
