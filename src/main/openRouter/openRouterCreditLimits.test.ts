/**
 * Unit tests for OpenRouter completion credit-cap parsing and session clamping.
 */

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  formatOpenRouterChatApiError,
  noteOpenRouterAffordableMaxTokens,
  OPENROUTER_DEFAULT_COMPLETION_MAX_TOKENS,
  OPENROUTER_MIN_COMPLETION_MAX_TOKENS,
  OPENROUTER_ORDER_FLOW_COMPLETION_MAX_TOKENS,
  parseAffordableMaxTokensFromOpenRouterError,
  resetOpenRouterSessionAffordableMaxTokensForTests,
  resetOpenRouterSessionCreditsExhaustedForTests,
  resolveEffectiveOpenRouterCompletionMaxTokens,
} from './openRouterCreditLimits';

afterEach(() => {
  resetOpenRouterSessionAffordableMaxTokensForTests();
  resetOpenRouterSessionCreditsExhaustedForTests();
});

/**
 * Regression: OpenRouter "can only afford N" messages must yield a positive integer for retry clamping.
 *
 * Purpose: Locks the parser used by chat transport when prepaid headroom is below requested max_tokens.
 * When to use: After changes to OpenRouter 402 body parsing.
 * Expected outcome: 7896 extracted from the production error shape seen in debug.log.
 * Exceptions: None.
 */
test('parseAffordableMaxTokensFromOpenRouterError reads can-only-afford budgets', () => {
  const body = JSON.stringify({
    error: {
      message:
        'This request requires more credits, or fewer max_tokens. You requested up to 8192 tokens, but can only afford 7896. To increase, visit https://openrouter.ai/settings/credits',
    },
  });
  assert.equal(parseAffordableMaxTokensFromOpenRouterError(body), 7896);
});

/**
 * Regression: order-flow preferred 8192 must clamp to a learned affordable session cap.
 *
 * Purpose: Ensures requestOrdersFlow budgets follow noteOpenRouterAffordableMaxTokens after a 402.
 * When to use: After changes to resolveEffectiveOpenRouterCompletionMaxTokens.
 * Expected outcome: Preferred 8192 becomes 7896 once noted; floor remains OPENROUTER_MIN_COMPLETION_MAX_TOKENS.
 * Exceptions: None.
 */
test('resolveEffectiveOpenRouterCompletionMaxTokens clamps preferred order-flow budget to session cap', () => {
  assert.equal(
    resolveEffectiveOpenRouterCompletionMaxTokens(OPENROUTER_ORDER_FLOW_COMPLETION_MAX_TOKENS),
    OPENROUTER_ORDER_FLOW_COMPLETION_MAX_TOKENS
  );
  noteOpenRouterAffordableMaxTokens(7896);
  assert.equal(resolveEffectiveOpenRouterCompletionMaxTokens(OPENROUTER_ORDER_FLOW_COMPLETION_MAX_TOKENS), 7896);
  noteOpenRouterAffordableMaxTokens(100);
  assert.equal(
    resolveEffectiveOpenRouterCompletionMaxTokens(OPENROUTER_ORDER_FLOW_COMPLETION_MAX_TOKENS),
    OPENROUTER_MIN_COMPLETION_MAX_TOKENS
  );
});

/**
 * Contract: default (no preferred) resolution still uses env/default when no session cap exists.
 *
 * Purpose: Keeps non-order-flow callers on the prepaid-friendly default until a cap is learned.
 * When to use: After changing OPENROUTER_DEFAULT_COMPLETION_MAX_TOKENS behavior.
 * Expected outcome: Unparameterized resolve returns the module default.
 * Exceptions: None.
 */
test('resolveEffectiveOpenRouterCompletionMaxTokens defaults without preferred budget', () => {
  assert.equal(resolveEffectiveOpenRouterCompletionMaxTokens(), OPENROUTER_DEFAULT_COMPLETION_MAX_TOKENS);
});

/**
 * Contract: reducible max_tokens 402s are not treated as zero-balance exhaustion.
 *
 * Purpose: Avoids latching sessionCreditsExhausted when a lower max_tokens retry would succeed.
 * When to use: After changes to formatOpenRouterChatApiError classification.
 * Expected outcome: Message mentions credit limit / afford text, not the insufficient-credits latch string alone.
 * Exceptions: None.
 */
test('formatOpenRouterChatApiError keeps reducible afford-402 actionable without exhausting latch', () => {
  const body = JSON.stringify({
    error: {
      message:
        'This request requires more credits, or fewer max_tokens. You requested up to 8192 tokens, but can only afford 7896.',
    },
  });
  const formatted = formatOpenRouterChatApiError(402, body);
  assert.match(formatted, /can only afford 7896/i);
  assert.doesNotMatch(formatted, /insufficient credits\. Add credits/i);
});

/**
 * Verifies a wrapped provider error keeps the provider's own message.
 *
 * Purpose: Fallback checks and the activity log need the text behind "Provider returned error".
 * When to use: After changing `formatOpenRouterChatApiError`.
 * Expected outcome: The formatted string includes the raw `tool_choice` refusal.
 * Exceptions: Assertion failure on contract drift.
 */
test('formatOpenRouterChatApiError includes the provider raw message', () => {
  const body = JSON.stringify({
    error: {
      message: 'Provider returned error',
      code: 400,
      metadata: { raw: JSON.stringify({ message: 'tool_choice: type "any" are not supported for this model.' }) },
    },
  });
  const formatted = formatOpenRouterChatApiError(400, body);
  assert.match(formatted, /tool_choice/);
});
