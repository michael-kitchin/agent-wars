import { logDebug } from '../logger';

/**
 * Default completion budget for OpenRouter order requests when no env override is set.
 *
 * Purpose: Keeps `max_tokens` within typical prepaid credit headroom so 402 credit errors are rare.
 * When to use: `resolveOpenRouterCompletionMaxTokens` when env is unset.
 * Expected outcome: A positive integer suitable for tactical and strategic JSON order passes.
 * Exceptions: None.
 */
export const OPENROUTER_DEFAULT_COMPLETION_MAX_TOKENS = 2048;

/**
 * Env var name for overriding OpenRouter completion `max_tokens` in order requests.
 *
 * Purpose: Lets operators tune token budgets without code changes during support or load testing.
 * When to use: Documented for ops; read by `resolveOpenRouterCompletionMaxTokens`.
 * Expected outcome: When set to a positive integer string, that value replaces the default.
 * Exceptions: Invalid or non-positive values are ignored.
 */
export const OPENROUTER_MAX_COMPLETION_TOKENS_ENV = 'AGENT_WARS_OPENROUTER_MAX_COMPLETION_TOKENS';

/**
 * Lowest completion budget used when OpenRouter reports the account can afford less than the configured default.
 *
 * Purpose: Avoids requesting zero or unusably small budgets while still fitting depleted credit balances.
 * When to use: `resolveEffectiveOpenRouterCompletionMaxTokens` when session cap is below the configured default.
 * Expected outcome: A small but non-zero integer that still allows tool-call and JSON-order responses.
 * Exceptions: None.
 */
export const OPENROUTER_MIN_COMPLETION_MAX_TOKENS = 512;

/**
 * User-facing message when OpenRouter reports a zero or depleted account balance.
 *
 * Purpose: Single source of truth for insufficient-credit failures across transport, preflight, and order flow.
 * When to use: Returned to UI/logs whenever credits are known to be exhausted.
 * Expected outcome: Actionable text pointing to OpenRouter credit settings.
 * Exceptions: None.
 */
export const OPENROUTER_INSUFFICIENT_CREDITS_USER_MESSAGE =
  'OpenRouter account has insufficient credits. Add credits at https://openrouter.ai/settings/credits and try again.';

/**
 * How long a zero-balance 402 keeps order requests failing fast.
 *
 * Purpose: Skips the expensive prompt build while credits are known to be gone, yet lets the player add credits and retry without restarting the app.
 * When to use: `isOpenRouterSessionCreditsExhausted`.
 * Expected outcome: 60 000 ms. After that, the next order request makes one real attempt.
 * Exceptions: None.
 */
export const OPENROUTER_CREDITS_EXHAUSTED_FAST_FAIL_MS = 60_000;

/**
 * When the last zero-balance 402 was seen, or null when none is pending.
 *
 * Purpose: Avoids rebuilding large prompts on every AI turn when credits are known to be exhausted.
 * When to use: Read by `isOpenRouterSessionCreditsExhausted`; set by chat transport on an insufficient-credit 402.
 * Expected outcome: Null until the first insufficient-credit failure, then the time of that failure until it expires or a key is saved.
 * Exceptions: None. The latch covers every seat, because the 402 response does not say which key it was for.
 */
let creditsExhaustedAtMs: number | null = null;

/**
 * Clears the insufficient-credits latch.
 *
 * Purpose: A new or re-entered API key, or a test, must be able to reach OpenRouter again at once.
 * When to use: After any API key is stored (`saveKey`, `writeSeatApiKey`, `writeSeatApiKeys`) and in test teardown.
 * Expected outcome: The next order request performs a real API attempt.
 * Exceptions: None.
 */
export function clearOpenRouterSessionCreditsExhausted(): void {
  creditsExhaustedAtMs = null;
}

/**
 * Returns whether a recent insufficient-credits OpenRouter failure should fail order requests fast.
 *
 * Purpose: Supports fast-fail before expensive prompt assembly in `requestOrdersFlow`.
 * When to use: After the roster check in order requests.
 * Expected outcome: True from `markOpenRouterSessionCreditsExhausted` until `OPENROUTER_CREDITS_EXHAUSTED_FAST_FAIL_MS` have passed or the latch is cleared.
 * Exceptions: None.
 *
 * @param nowMs The current time in milliseconds; tests pass a fixed value.
 */
export function isOpenRouterSessionCreditsExhausted(nowMs: number = Date.now()): boolean {
  return creditsExhaustedAtMs !== null && nowMs - creditsExhaustedAtMs < OPENROUTER_CREDITS_EXHAUSTED_FAST_FAIL_MS;
}

/**
 * Starts the fast-fail window after an insufficient-credits 402.
 *
 * Purpose: Prevents repeated full prompt builds after a confirmed zero-balance 402.
 * When to use: Chat transport, through `formatOpenRouterChatApiError`, on an insufficient-credit 402.
 * Expected outcome: Order requests fail fast with `OPENROUTER_INSUFFICIENT_CREDITS_USER_MESSAGE` for the next `OPENROUTER_CREDITS_EXHAUSTED_FAST_FAIL_MS`.
 * Exceptions: None.
 *
 * @param nowMs The current time in milliseconds; tests pass a fixed value.
 */
export function markOpenRouterSessionCreditsExhausted(nowMs: number = Date.now()): void {
  creditsExhaustedAtMs = nowMs;
  logDebug('openRouter markOpenRouterSessionCreditsExhausted: failing AI order requests fast for a short window');
}

/**
 * Session-scoped cap learned from OpenRouter 402 "can only afford N" responses during this process lifetime.
 *
 * Purpose: Prevents every tool-loop round from re-requesting a `max_tokens` budget the account cannot afford.
 * When to use: Updated by chat transport after a credit-limit retry; read by order-flow requests.
 * Expected outcome: Null until the first affordable cap is observed, then the minimum affordable value seen.
 * Exceptions: None.
 */
let sessionAffordableMaxTokens: number | null = null;

/**
 * Resets the session-scoped affordable completion cap (primarily for tests).
 *
 * Purpose: Keeps unit tests isolated when they assert default token budgets.
 * When to use: Test teardown or explicit session reset hooks.
 * Expected outcome: Subsequent requests use only env/default budgets until another 402 cap is learned.
 * Exceptions: None.
 */
export function resetOpenRouterSessionAffordableMaxTokensForTests(): void {
  sessionAffordableMaxTokens = null;
}

/**
 * Records an affordable completion token budget reported by OpenRouter for this process session.
 *
 * Purpose: Reuses the lowest affordable cap across tool-loop rounds and later AI turns in the same app session.
 * When to use: After parsing a 402 body that includes "can only afford N".
 * Expected outcome: Session cap becomes the minimum of prior cap and the new affordable value.
 * Exceptions: Ignores non-positive values.
 */
export function noteOpenRouterAffordableMaxTokens(affordable: number): void {
  if (!Number.isFinite(affordable) || affordable <= 0) return;
  const previous = sessionAffordableMaxTokens;
  sessionAffordableMaxTokens =
    sessionAffordableMaxTokens == null ? affordable : Math.min(sessionAffordableMaxTokens, affordable);
  logDebug('openRouter noteOpenRouterAffordableMaxTokens: session cap updated', {
    previous,
    affordable,
    sessionAffordableMaxTokens,
  });
}

/**
 * Resolves the configured completion `max_tokens` budget from env/default settings only.
 *
 * Purpose: Centralizes default and env-based token limits for AI order planning.
 * When to use: As the upper bound before applying any session affordable cap.
 * Expected outcome: A positive integer; falls back to `OPENROUTER_DEFAULT_COMPLETION_MAX_TOKENS`.
 * Exceptions: None.
 */
export function resolveOpenRouterCompletionMaxTokens(): number {
  const raw = process.env[OPENROUTER_MAX_COMPLETION_TOKENS_ENV];
  if (raw == null || raw.trim() === '') {
    return OPENROUTER_DEFAULT_COMPLETION_MAX_TOKENS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    logDebug('openRouter resolveOpenRouterCompletionMaxTokens: ignoring invalid env override', {
      env: OPENROUTER_MAX_COMPLETION_TOKENS_ENV,
      raw,
    });
    return OPENROUTER_DEFAULT_COMPLETION_MAX_TOKENS;
  }
  return parsed;
}

/**
 * Fallback completion budget for order-planning when a model advertises no output limit.
 *
 * Purpose: Keeps `max_tokens` finite for unknown models and for list rows that omit `max_completion_tokens`.
 * When to use: As `baseCompletionMaxTokens` for `resolveOrdersRequestProfile`.
 * Expected outcome: 8192. A known advertised limit replaces it before the session credit clamp is applied.
 * Exceptions: None.
 */
export const OPENROUTER_ORDER_FLOW_COMPLETION_MAX_TOKENS = 8192;

/**
 * Resolves the effective completion budget for the next OpenRouter chat request in this session.
 *
 * Purpose: Applies the learned affordable cap so tool-loop rounds do not reset to an unaffordable default.
 * When to use: Every chat completion body built by `requestOrdersFlow`, and chat transport before each POST.
 * Expected outcome: The preferred budget, or the env default, when no session cap exists. With a cap, the lower of
 * that budget and the cap, raised to `OPENROUTER_MIN_COMPLETION_MAX_TOKENS` only when the preferred budget is larger.
 * Exceptions: None.
 */
export function resolveEffectiveOpenRouterCompletionMaxTokens(preferredMaxTokens?: number): number {
  const configured =
    preferredMaxTokens != null && Number.isFinite(preferredMaxTokens) && preferredMaxTokens > 0
      ? Math.floor(preferredMaxTokens)
      : resolveOpenRouterCompletionMaxTokens();
  if (sessionAffordableMaxTokens == null) return configured;
  const affordable = Math.min(configured, sessionAffordableMaxTokens);
  return Math.min(configured, Math.max(OPENROUTER_MIN_COMPLETION_MAX_TOKENS, affordable));
}

/**
 * Parses OpenRouter 402 error bodies for the affordable completion token count.
 *
 * Purpose: Enables automatic retry with a lower `max_tokens` when credits cannot cover the request.
 * When to use: `openRouterChatTransport` on HTTP 402 before surfacing a user-facing error.
 * Expected outcome: The affordable token integer when the message matches OpenRouter's pattern; otherwise null.
 * Exceptions: None.
 */
export function parseAffordableMaxTokensFromOpenRouterError(bodyText: string): number | null {
  const message = extractOpenRouterErrorMessage(bodyText);
  if (!message) return null;
  const match = /can only afford\s+(\d+)/i.exec(message);
  if (!match) return null;
  const affordable = Number.parseInt(match[1]!, 10);
  return Number.isFinite(affordable) && affordable > 0 ? affordable : null;
}

/**
 * Returns true when OpenRouter reports the account has no remaining credits at all.
 *
 * Purpose: Distinguishes zero-balance failures from reducible `max_tokens` or prompt-limit failures.
 * When to use: Before attempting automatic credit-limit retries in chat transport.
 * Expected outcome: True for "Insufficient credits" style 402 bodies.
 * Exceptions: None.
 */
export function isOpenRouterInsufficientCreditsError(bodyText: string): boolean {
  const message = extractOpenRouterErrorMessage(bodyText);
  return message != null && /insufficient credits/i.test(message);
}

/**
 * Returns true when OpenRouter rejects a request because the prompt/context exceeds the key's token limit.
 *
 * Purpose: Triggers conversation trimming in the tool loop instead of failing the whole AI turn immediately.
 * When to use: After a failed chat completion in `requestOrdersFlow`.
 * Expected outcome: True for "Prompt tokens limit exceeded" style 402 bodies.
 * Exceptions: None.
 */
export function isOpenRouterPromptTokensLimitError(bodyText: string): boolean {
  const message = extractOpenRouterErrorMessage(bodyText);
  return message != null && /prompt tokens limit exceeded/i.test(message);
}

/**
 * Builds a user-facing error string for failed OpenRouter chat completion HTTP responses.
 *
 * Purpose: Surfaces actionable credit and auth failures instead of opaque status codes.
 * When to use: When `postOpenRouterChatWithTimeoutAndRetry` receives a non-2xx response.
 * Expected outcome: A short sentence suitable for UI logs and returned error payloads.
 * Exceptions: None.
 */
export function formatOpenRouterChatApiError(status: number, bodyText: string): string {
  if (status === 401) return 'Invalid API key';
  const message = extractOpenRouterErrorMessage(bodyText);
  if (status === 402) {
    if (message && isOpenRouterInsufficientCreditsError(bodyText)) {
      markOpenRouterSessionCreditsExhausted();
      return OPENROUTER_INSUFFICIENT_CREDITS_USER_MESSAGE;
    }
    if (message && isOpenRouterPromptTokensLimitError(bodyText)) {
      return `OpenRouter prompt limit exceeded: ${message}`;
    }
    if (message) {
      return `OpenRouter credit limit: ${message}`;
    }
    return 'OpenRouter credit limit reached. Add credits at https://openrouter.ai or reduce max completion tokens.';
  }
  if (message) {
    const providerDetail = extractOpenRouterProviderDetail(bodyText);
    if (providerDetail && providerDetail !== message) {
      const clipped = providerDetail.length > 300 ? `${providerDetail.slice(0, 300)}…` : providerDetail;
      return `API error: ${message}: ${clipped}`;
    }
    return `API error: ${message}`;
  }
  return `API error: ${status}`;
}

/**
 * Reads the provider's own error text out of an OpenRouter error body.
 *
 * Purpose: OpenRouter often reports only "Provider returned error"; the useful text is in `error.metadata.raw`.
 * When to use: `formatOpenRouterChatApiError`, so logs and fallback checks can see why the provider refused.
 * Expected outcome: The inner message when `raw` is JSON with `message` or `error.message`; otherwise the raw string.
 * Exceptions: Returns null when the body is not JSON or has no raw detail.
 */
function extractOpenRouterProviderDetail(bodyText: string): string | null {
  try {
    const parsed = JSON.parse(bodyText) as { error?: { metadata?: { raw?: unknown } } };
    const raw = parsed.error?.metadata?.raw;
    if (typeof raw !== 'string' || raw.trim().length === 0) return null;
    try {
      const inner = JSON.parse(raw) as { message?: unknown; error?: { message?: unknown } };
      const nested = inner.error?.message ?? inner.message;
      if (typeof nested === 'string' && nested.trim().length > 0) return nested.trim();
    } catch {
      return raw.trim();
    }
    return raw.trim();
  } catch {
    return null;
  }
}

/**
 * Pulls the nested `error.message` field from an OpenRouter JSON error body when present.
 *
 * Purpose: Centralizes JSON parsing for credit-limit, auth, and prompt-limit error classification helpers.
 * When to use: Inside `formatOpenRouterChatApiError` and OpenRouter 402 detection helpers in this module.
 * Expected outcome: Trimmed message string when `error.message` is a non-empty string; otherwise null.
 * Exceptions: Returns null when the body is not valid JSON or lacks a usable message field.
 */
function extractOpenRouterErrorMessage(bodyText: string): string | null {
  try {
    const parsed = JSON.parse(bodyText) as { error?: { message?: unknown } };
    const message = parsed.error?.message;
    return typeof message === 'string' && message.trim() ? message.trim() : null;
  } catch {
    return null;
  }
}
