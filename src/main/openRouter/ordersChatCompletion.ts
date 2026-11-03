import { logDebug, logError } from '../logger';
import { cacheTokensFromChatUsage } from './consultTelemetry';
import type { RequestOrdersUsageTotals } from './requestOrdersToolLoop';

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
 * Adds one chat response's usage into a consultation's running totals.
 *
 * Purpose: The tool loop and the final orders call must count cost and tokens the same way.
 * When to use: After a chat body has been parsed and its `usage` object is available.
 * Expected outcome: Cost, prompt tokens, completion tokens, cached tokens, and cache-write tokens increase by the
 * reported amounts. Missing fields add nothing.
 * Exceptions: None.
 */
export function addOrdersChatUsageToTotals(
  totals: RequestOrdersUsageTotals,
  usage: OrdersChatCompletion['usage']
): void {
  logDebug('ordersChatCompletion addOrdersChatUsageToTotals', {
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
  });
  totals.requestCost += usage?.cost ?? 0;
  totals.totalInputTokens += usage?.prompt_tokens ?? 0;
  totals.totalOutputTokens += usage?.completion_tokens ?? 0;
  const cacheTokens = cacheTokensFromChatUsage(usage);
  totals.totalCachedTokens = (totals.totalCachedTokens ?? 0) + cacheTokens.cachedTokens;
  totals.totalCacheWriteTokens = (totals.totalCacheWriteTokens ?? 0) + cacheTokens.cacheWriteTokens;
}

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
