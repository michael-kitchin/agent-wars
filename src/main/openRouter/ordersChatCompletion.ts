import { logDebug, logError } from '../logger';

/**
 * One order-flow chat completion body.
 *
 * Purpose: The tool loop reads the first choice, the finish reason, and the usage counters.
 * When to use: The result of `parseOrdersChatCompletion`.
 * Expected outcome: Fields are absent when the provider omitted them.
 * Exceptions: None.
 */
export type OrdersChatCompletion = {
  readonly choices?: Array<{
    readonly finish_reason?: string;
    readonly native_finish_reason?: string;
    readonly message?: {
      readonly content?: string | null;
      readonly tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
    };
  }>;
  readonly usage?: {
    readonly cost?: number;
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly prompt_tokens_details?: {
      readonly cached_tokens?: number;
      readonly cache_write_tokens?: number;
    };
  };
};

/**
 * Parses one chat completion body.
 *
 * Purpose: A non-JSON body is a failed round, not a thrown exception for the caller.
 * When to use: After a successful HTTP response in the tool loop.
 * Expected outcome: The parsed body, or null when the text is not JSON.
 * Exceptions: None. A parse failure is logged and returned as null.
 */
export function parseOrdersChatCompletion(bodyText: string): OrdersChatCompletion | null {
  logDebug('ordersChatCompletion parseOrdersChatCompletion', { chars: bodyText.length });
  try {
    return JSON.parse(bodyText) as OrdersChatCompletion;
  } catch (err) {
    logError('ordersChatCompletion parseOrdersChatCompletion: body was not JSON', err);
    return null;
  }
}
