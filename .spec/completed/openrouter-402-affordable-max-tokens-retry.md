# OpenRouter 402 affordable max_tokens retry

## Problem

Tactical AI turns failed with HTTP 402. OpenRouter body:

> You requested up to 8192 tokens, but can only afford 7896.

Credits were not zero; prepaid headroom was slightly below the hardcoded order-flow `max_tokens`.

## Root cause

`requestOrdersFlow` always sent `max_tokens: 8192`. Helpers in `openRouterCreditLimits.ts` (`parseAffordableMaxTokensFromOpenRouterError`, `noteOpenRouterAffordableMaxTokens`, `resolveEffectiveOpenRouterCompletionMaxTokens`) existed but were never wired into chat transport or the order flow. Transport returned opaque `API error: 402` with no clamp/retry.

## Fix

- Prefer `OPENROUTER_ORDER_FLOW_COMPLETION_MAX_TOKENS` (8192) via `resolveEffectiveOpenRouterCompletionMaxTokens`.
- Chat transport clamps to the session affordable cap and retries once when a 402 reports `can only afford N`.
- User-facing errors use `formatOpenRouterChatApiError` (reducible afford vs zero-balance).

## Regression

`openRouterCreditLimits.test.ts` covers parse/clamp/format for the production 402 shape.
