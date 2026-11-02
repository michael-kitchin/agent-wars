import {
  AI_MODEL_REQUEST_RETRY_COUNT,
  AI_MODEL_REQUEST_TIMEOUT_MS,
} from '../../shared/aiConsultationLimits';
import { logDebug, logError } from '../logger';
import {
  providerFromChatBody,
  type ConsultAttemptOutcome,
  type ConsultAttemptRecord,
  type ConsultTelemetry,
} from './consultTelemetry';
import { formatModelCallFailureLine } from './modelCallAttemptMessages';
import { readModelHangSimulationMs, shouldSimulateModelHang } from './modelHangSimulation';
import { postChatViaHttps } from './openRouterHttpsChatPost';
import {
  formatOpenRouterChatApiError,
  noteOpenRouterAffordableMaxTokens,
  OPENROUTER_MIN_COMPLETION_MAX_TOKENS,
  parseAffordableMaxTokensFromOpenRouterError,
  resolveEffectiveOpenRouterCompletionMaxTokens,
} from './openRouterCreditLimits';

/**
 * HTTPS chat completion transport, timeouts, retries, and test overrides for OpenRouter.
 */

/**
 * Aborts an OpenRouter chat POST when the full response has not arrived.
 *
 * Purpose: Local name for `AI_MODEL_REQUEST_TIMEOUT_MS` so this transport does not grow a second deadline.
 * When to use: The abort timer and the socket timeout in `defaultPostOpenRouterChatWithTimeoutAndRetry` / `postChatViaHttps`.
 * Expected outcome: A single model call is destroyed after 180s and is not sent again.
 * Exceptions: None.
 */
const OPENROUTER_REQUEST_TIMEOUT_MS = AI_MODEL_REQUEST_TIMEOUT_MS;
/**
 * Documents the module-scope binding `OPENROUTER_RESPONSE_IDLE_TIMEOUT_MS` (OPENROUTER_RESPONSE_IDLE_TIMEOUT_MS).

 * Purpose: Supports maintainability by documenting why `OPENROUTER_RESPONSE_IDLE_TIMEOUT_MS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const OPENROUTER_RESPONSE_IDLE_TIMEOUT_MS = 15_000;
/**
 * Documents the module-scope binding `OPENROUTER_RESPONSE_HARD_TIMEOUT_MS` (OPENROUTER_RESPONSE_HARD_TIMEOUT_MS).

 * Purpose: Caps how long a response body may take after headers arrive, using the same 180s budget as the request abort.
 * When to use: The response hard timer in `postChatViaHttps`.
 * Expected outcome: A body that has started cannot outlive `AI_MODEL_REQUEST_TIMEOUT_MS`.
 * Exceptions: None.
 */
const OPENROUTER_RESPONSE_HARD_TIMEOUT_MS = AI_MODEL_REQUEST_TIMEOUT_MS;
/**
 * Documents the module-scope binding `OPENROUTER_REQUEST_RETRY_COUNT` (OPENROUTER_REQUEST_RETRY_COUNT).

 * Purpose: Local name for `AI_MODEL_REQUEST_RETRY_COUNT` so the retry loop and the consultation wait budget stay in step.
 * When to use: The network-attempt loop in `defaultPostOpenRouterChatWithTimeoutAndRetry`.
 * Expected outcome: One retry after a network error or a retryable HTTP status. A timeout is not sent again.
 * Exceptions: None.
 */
const OPENROUTER_REQUEST_RETRY_COUNT = AI_MODEL_REQUEST_RETRY_COUNT;

/**
 * HTTP statuses worth one more send.
 *
 * Purpose: A gateway timeout, a rate limit, and a short upstream failure are often another host a moment later. A 500 from the router is not.
 * When to use: `isRetryableStatus`.
 * Expected outcome: 408, 429, 502, 503, and 504.
 * Exceptions: None.
 */
const RETRYABLE_HTTP_STATUSES: ReadonlySet<number> = new Set([408, 429, 502, 503, 504]);

/**
 * Reports whether one failed response should be sent again.
 *
 * Purpose: The retry loop and the activity line share one allow-list.
 * When to use: After a response that is not a success and not a credit-cap retry.
 * Expected outcome: True only for `RETRYABLE_HTTP_STATUSES`.
 * Exceptions: None.
 */
function isRetryableStatus(status: number): boolean {
  return RETRYABLE_HTTP_STATUSES.has(status);
}

/**
 * Defines the `getRetryDelayMs` function shape (function getRetryDelayMs(): number).

 * Purpose: Supports maintainability by documenting why `getRetryDelayMs` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getRetryDelayMs(): number {
  return 300 + Math.floor(Math.random() * 700);
}

/**
 * Waits `ms`, or returns early when `signal` aborts.
 *
 * Purpose: A player cancel during the gap between attempts must not sit through the retry delay.
 * When to use: After a retryable failure, before the next attempt.
 * Expected outcome: Resolves when the delay ends or the signal aborts. The caller checks the signal and returns `Cancelled`.
 * Exceptions: None.
 */
function delayMs(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Rejects when `signal` aborts.
 *
 * Purpose: A simulated hang has no HTTPS request. The attempt's abort timer, or the player's cancel, ends the wait.
 * When to use: Instead of `postChatViaHttps` when the hang simulator is on for this attempt.
 * Expected outcome: Rejects with `AbortError` once the signal aborts. Already-aborted signals reject immediately.
 * Exceptions: None.
 */
function waitForAbort(signal: AbortSignal): Promise<never> {
  if (signal.aborted) return Promise.reject(new Error('AbortError'));
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('AbortError')), { once: true });
  });
}

/**
 * Clamps `body.max_tokens` to the session affordable cap when OpenRouter previously reported a lower budget.
 *
 * Purpose: Prevents repeating unaffordable 8192-style reservations after a "can only afford N" 402 in this process.
 * When to use: Before each HTTPS chat POST in `defaultPostOpenRouterChatWithTimeoutAndRetry`.
 * Expected outcome: Same body when no numeric `max_tokens` or no session cap; otherwise a shallow copy with clamped budget.
 * Exceptions: None.
 */
function applySessionAffordableMaxTokensToBody(body: Record<string, unknown>): Record<string, unknown> {
  const requested = body.max_tokens;
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) return body;
  const effective = resolveEffectiveOpenRouterCompletionMaxTokens(requested);
  if (effective === requested) return body;
  logDebug('openRouterChatTransport: clamping max_tokens to session affordable cap', {
    requested,
    effective,
  });
  return { ...body, max_tokens: effective };
}

/**
 * Records one send on the consult recorder and in the debug log.
 *
 * Purpose: Every attempt that entered the try is visible, including one that was not retried.
 * When to use: The attempt's `finally`, after the outcome was stored.
 * Expected outcome: One `openRouter chat attempt` debug line. A missing recorder does nothing else.
 * Exceptions: None.
 */
function noteChatAttempt(payload: OpenRouterChatTransportPayload, record: ConsultAttemptRecord): void {
  payload.telemetry?.recordAttempt(record);
  logDebug('openRouter chat attempt', record);
}

/**
 * Copies an attempt with `retried` set.
 *
 * Purpose: The retry flag is known only after the delay, and a cancel during that delay must stay false.
 * When to use: Immediately before the loop continues into the next send.
 * Expected outcome: The same attempt, with `retried` true.
 * Exceptions: None.
 */
function markAttemptRetried(record: ConsultAttemptRecord): ConsultAttemptRecord {
  return {
    requestLabel: record.requestLabel,
    attempt: record.attempt,
    outcome: record.outcome,
    httpStatus: record.httpStatus,
    durationMs: record.durationMs,
    provider: record.provider,
    retried: true,
  };
}

/**
 * Posts an OpenRouter chat completion with timeouts, network retries, and one credit-cap `max_tokens` retry.
 *
 * Purpose: Central transport for order-flow completions; learns affordable caps from 402 bodies so depleted prepaid
 * headroom does not hard-fail when a slightly lower `max_tokens` would succeed.
 * When to use: Via `resolveOpenRouterChatTransport` / `postOpenRouterChatWithTimeoutAndRetry` deps.
 * Expected outcome: Success payload on 2xx; actionable credit/auth errors on terminal failures.
 * Exceptions: Propagates abort/timeout as user-facing cancel/timeout strings.
 */
async function defaultPostOpenRouterChatWithTimeoutAndRetry(
  payload: OpenRouterChatTransportPayload
): Promise<OpenRouterChatTransportResult> {
  let lastError = `${payload.requestLabel} failed.`;
  let requestBody = applySessionAffordableMaxTokensToBody(payload.body);
  let creditClampRetried = false;
  let networkAttempt = 0;
  let sendOrdinal = 0;
  const maxAttempts = 1 + OPENROUTER_REQUEST_RETRY_COUNT;
  while (networkAttempt <= OPENROUTER_REQUEST_RETRY_COUNT) {
    if (payload.signal?.aborted) return { ok: false, error: 'Cancelled' };
    const controller = new AbortController();
    const parentSignal = payload.signal;
    const onParentAbort = () => controller.abort();
    if (parentSignal) {
      if (parentSignal.aborted) controller.abort();
      else parentSignal.addEventListener('abort', onParentAbort, { once: true });
    }
    const simulateHang = shouldSimulateModelHang(networkAttempt);
    const attemptTimeoutMs = simulateHang ? readModelHangSimulationMs() : OPENROUTER_REQUEST_TIMEOUT_MS;
    const timeoutId = setTimeout(() => controller.abort(), attemptTimeoutMs);
    sendOrdinal += 1;
    const attempt = networkAttempt + 1;
    const willRetry = networkAttempt < OPENROUTER_REQUEST_RETRY_COUNT;
    const startedAt = Date.now();
    let pending: ConsultAttemptRecord | null = null;
    /**
     * Stores this send's outcome for the finally block.
     *
     * Purpose: A return and a continue each record once, after the outcome is known and before any retry wait.
     * When to use: Every path that finishes the send.
     * Expected outcome: `pending` is this send. A timeout, stall, or cancel after the send started stores a null provider. A cancel before the send starts records nothing.
     * Exceptions: None.
     */
    const remember = (
      outcome: ConsultAttemptOutcome,
      httpStatus: number | null,
      bodyText: string | null,
      retried: boolean
    ): void => {
      pending = {
        requestLabel: payload.requestLabel,
        attempt: sendOrdinal,
        outcome,
        httpStatus,
        durationMs: Date.now() - startedAt,
        provider: bodyText === null ? null : providerFromChatBody(bodyText, outcome === 'ok'),
        retried,
      };
    };
    try {
      requestBody = applySessionAffordableMaxTokensToBody(requestBody);
      logDebug(`openRouter ${payload.requestLabel}: request attempt start`, {
        attempt: sendOrdinal,
        networkAttempt: attempt,
        timeoutMs: attemptTimeoutMs,
        maxTokens: typeof requestBody.max_tokens === 'number' ? requestBody.max_tokens : null,
        simulateHang,
      });
      const chatResponse = simulateHang
        ? await (async () => {
            if (payload.onLog) payload.onLog('Simulating a hung model call (AGENT_WARS_SIMULATE_MODEL_HANG).');
            logDebug(`openRouter ${payload.requestLabel}: simulating a hung model call`, { attempt });
            await waitForAbort(controller.signal);
            throw new Error('AbortError');
          })()
        : await postChatForAttempt({
            key: payload.key,
            requestBody,
            signal: controller.signal,
            timeoutMs: attemptTimeoutMs,
            responseIdleTimeoutMs: OPENROUTER_RESPONSE_IDLE_TIMEOUT_MS,
            responseHardTimeoutMs: OPENROUTER_RESPONSE_HARD_TIMEOUT_MS,
            attempt: sendOrdinal,
            requestLabel: payload.requestLabel,
          });
      logDebug(`openRouter ${payload.requestLabel}: request attempt completed`, {
        attempt: sendOrdinal,
        ok: chatResponse.status >= 200 && chatResponse.status < 300,
        status: chatResponse.status,
      });
      if (chatResponse.status >= 200 && chatResponse.status < 300) {
        remember('ok', chatResponse.status, chatResponse.bodyText, false);
        return { ok: true, status: chatResponse.status, headers: chatResponse.headers, bodyText: chatResponse.bodyText };
      }
      lastError = formatOpenRouterChatApiError(chatResponse.status, chatResponse.bodyText);
      logError(`openRouter ${payload.requestLabel}: API error`, chatResponse.status, chatResponse.bodyText.slice(0, 200));
      if (chatResponse.status === 402 && !creditClampRetried) {
        const affordable = parseAffordableMaxTokensFromOpenRouterError(chatResponse.bodyText);
        const currentMax = typeof requestBody.max_tokens === 'number' ? requestBody.max_tokens : null;
        if (
          affordable != null &&
          affordable >= OPENROUTER_MIN_COMPLETION_MAX_TOKENS &&
          currentMax != null &&
          affordable < currentMax
        ) {
          noteOpenRouterAffordableMaxTokens(affordable);
          requestBody = { ...requestBody, max_tokens: affordable };
          creditClampRetried = true;
          logDebug(`openRouter ${payload.requestLabel}: retrying after affordable max_tokens 402`, {
            attempt: sendOrdinal,
            previousMaxTokens: currentMax,
            affordableMaxTokens: affordable,
          });
          remember('http', chatResponse.status, chatResponse.bodyText, false);
          if (parentSignal?.aborted) return { ok: false, error: 'Cancelled' };
          if (payload.onLog) {
            payload.onLog(`OpenRouter credit headroom: retrying with max_tokens=${affordable}.`);
          }
          payload.telemetry?.recordFallback('creditClamp');
          const creditAttempt = pending;
          if (creditAttempt !== null) pending = markAttemptRetried(creditAttempt);
          continue;
        }
      }
      const retryStatus = willRetry && isRetryableStatus(chatResponse.status);
      if (payload.onLog) {
        payload.onLog(
          formatModelCallFailureLine({
            cause: 'httpStatus',
            attempt,
            maxAttempts,
            willRetry: retryStatus,
            httpStatus: chatResponse.status,
          }),
          true
        );
      }
      if (retryStatus) {
        const waitMs = getRetryDelayMs();
        logDebug(`openRouter ${payload.requestLabel}: retrying after API error`, {
          attempt: sendOrdinal,
          status: chatResponse.status,
          retryInMs: waitMs,
        });
        remember('http', chatResponse.status, chatResponse.bodyText, false);
        await delayMs(waitMs, parentSignal);
        if (parentSignal?.aborted) return { ok: false, error: 'Cancelled' };
        payload.telemetry?.recordFallback('httpStatusRetry');
        const httpAttempt = pending;
        if (httpAttempt !== null) pending = markAttemptRetried(httpAttempt);
        networkAttempt += 1;
        continue;
      }
      remember('http', chatResponse.status, chatResponse.bodyText, false);
      return { ok: false, error: lastError, status: chatResponse.status };
    } catch (err) {
      if (parentSignal?.aborted) {
        remember('cancelled', null, null, false);
        return { ok: false, error: 'Cancelled' };
      }
      const reported = String(err);
      // The abort timer and `HTTPS_TIMEOUT_` are the same cap. Either one is a timeout and is not sent again.
      const timeoutLike = controller.signal.aborted || reported.includes('HTTPS_TIMEOUT_');
      const isResponseStreamStall =
        reported.includes('HTTPS_RESPONSE_IDLE_TIMEOUT_') ||
        reported.includes('HTTPS_RESPONSE_SOCKET_TIMEOUT_') ||
        reported.includes('HTTPS_RESPONSE_HARD_TIMEOUT_');
      if (timeoutLike) {
        const timeoutSeconds = Math.round(attemptTimeoutMs / 1000);
        if (payload.onLog) {
          payload.onLog(
            formatModelCallFailureLine({
              cause: 'timeout',
              attempt: sendOrdinal,
              maxAttempts,
              willRetry: false,
              timeoutMs: attemptTimeoutMs,
            }),
            true
          );
        }
        lastError = `Model call timed out after ${timeoutSeconds}s.`;
        logError(`openRouter ${payload.requestLabel}: timeout`, {
          timeoutMs: attemptTimeoutMs,
          attempt: sendOrdinal,
        });
        remember('timeout', null, null, false);
        return { ok: false, error: lastError };
      } else if (isResponseStreamStall) {
        const line = formatModelCallFailureLine({
          cause: 'streamStall',
          attempt,
          maxAttempts,
          willRetry: false,
        });
        if (payload.onLog) payload.onLog(line, true);
        logError(`openRouter ${payload.requestLabel}: response stream timeout`, {
          attempt,
          error: String(err),
        });
        remember('streamStall', null, null, false);
        return { ok: false, error: line };
      } else {
        if (payload.onLog) {
          payload.onLog(
            formatModelCallFailureLine({ cause: 'network', attempt, maxAttempts, willRetry }),
            true
          );
        }
        if (!willRetry) lastError = `Model call network error after ${maxAttempts} attempts.`;
        logError(`openRouter ${payload.requestLabel}: fetch exception`, err);
      }
      if (willRetry) {
        const waitMs = getRetryDelayMs();
        logDebug(`openRouter ${payload.requestLabel}: retrying after exception`, {
          attempt: sendOrdinal,
          retryInMs: waitMs,
        });
        remember('network', null, null, false);
        await delayMs(waitMs, parentSignal);
        if (parentSignal?.aborted) return { ok: false, error: 'Cancelled' };
        payload.telemetry?.recordFallback('networkRetry');
        const networkAttemptRecord = pending;
        if (networkAttemptRecord !== null) pending = markAttemptRetried(networkAttemptRecord);
        networkAttempt += 1;
        continue;
      }
      remember('network', null, null, false);
      return { ok: false, error: lastError };
    } finally {
      if (pending) noteChatAttempt(payload, pending);
      clearTimeout(timeoutId);
      if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort);
    }
  }
  return { ok: false, error: lastError };
}

/**
 * One chat completion request handed to the transport.
 *
 * Purpose: Shared payload shape for the default HTTPS transport, test overrides, and request helpers.
 * When to use: Building every order-flow chat POST.
 * Expected outcome: `body` is sent as JSON; `requestLabel` prefixes transport logs.
 * Exceptions: None.
 */
export interface OpenRouterChatTransportPayload {
  /**
   * OpenRouter API key for the `Authorization` header.
   *
   * Contract: Raw key material; never logged.
   * When to use: Every request.
   * Expected outcome: Sent as a bearer token.
   * Exceptions: None.
   */
  readonly key: string;
  /**
   * Chat completion request body.
   *
   * Contract: JSON-serializable OpenRouter chat body; `max_tokens` may be clamped to the session credit cap.
   * When to use: Every request.
   * Expected outcome: Posted as the request JSON.
   * Exceptions: None.
   */
  readonly body: Record<string, unknown>;
  /**
   * Cancels the request when the consultation is cancelled.
   *
   * Contract: Optional; an aborted signal yields `{ ok: false, error: 'Cancelled' }`.
   * When to use: Pass the consultation's abort signal.
   * Expected outcome: In-flight HTTPS requests are destroyed on abort.
   * Exceptions: None.
   */
  readonly signal?: AbortSignal;
  /**
   * Player-facing activity log sink.
   *
   * Contract: Optional; receives short status lines such as timeouts and credit retries.
   * When to use: Pass the consultation's activity log callback.
   * Expected outcome: Lines appear in the AI activity log.
   * Exceptions: None.
   */
  readonly onLog?: (line: string, isError?: boolean) => void;
  /**
   * Short label naming this request in logs.
   *
   * Contract: Stable phrase such as `requestOrders` or `requestOrders repair`.
   * When to use: Every request.
   * Expected outcome: Prefixes transport debug and error logs.
   * Exceptions: None.
   */
  readonly requestLabel: string;
  /**
   * Consult recorder, or omitted when the caller is not a consultation.
   *
   * Contract: Optional. Absent means attempts are only debug-logged.
   * When to use: Order-flow chat posts.
   * Expected outcome: Each send appends one attempt.
   * Exceptions: None.
   */
  readonly telemetry?: ConsultTelemetry;
}

/**
 * Outcome of one chat completion request after the transport's own retries.
 *
 * Purpose: Callers branch on success without catching; failures carry the HTTP status when a response arrived.
 * When to use: Return type of every `OpenRouterChatTransport`.
 * Expected outcome: `ok: true` with the raw body on 2xx. `ok: false` with a user-facing error otherwise; `status`
 * is set only when the failure followed an HTTP response (absent for cancel, timeout, and network errors).
 * Exceptions: None.
 */
export type OpenRouterChatTransportResult =
  | { ok: true; status: number; headers: Record<string, string>; bodyText: string }
  | { ok: false; error: string; status?: number };

/**
 * Function that posts one chat completion request.
 *
 * Purpose: Lets the order flow use the HTTPS transport in production and a scripted fake in tests.
 * When to use: Resolve with `resolveOpenRouterChatTransport`; inject through `RequestOrdersFlowDeps`.
 * Expected outcome: Never throws for HTTP or network failures; they resolve as `{ ok: false }`.
 * Exceptions: None.
 */
export type OpenRouterChatTransport = (payload: OpenRouterChatTransportPayload) => Promise<OpenRouterChatTransportResult>;

/**
 * Documents the module-scope binding `chatTransportOverride` (chatTransportOverride: OpenRouterChatTransport | null).

 * Purpose: Supports maintainability by documenting why `chatTransportOverride` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let chatTransportOverride: OpenRouterChatTransport | null = null;

/**
 * Defines the `setChatTransportOverrideForTests` function shape (export function setChatTransportOverrideForTests(override: OpenRouterChatTransport | null): void).

 * Purpose: Supports maintainability by documenting why `setChatTransportOverrideForTests` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setChatTransportOverrideForTests(override: OpenRouterChatTransport | null): void {
  logDebug('openRouter setChatTransportOverrideForTests', { enabled: override !== null });
  chatTransportOverride = override;
}

/**
 * The HTTPS poster the default transport calls. Tests replace it so a retry can be scripted without a network.
 *
 * Purpose: The hang simulator and the retry loop stay in `defaultPostOpenRouterChatWithTimeoutAndRetry`.
 * When to use: A transport test, then set back to null.
 * Expected outcome: Null restores `postChatViaHttps`.
 * Exceptions: None.
 */
let postChatForAttempt: typeof postChatViaHttps = postChatViaHttps;

/**
 * Replaces the HTTPS poster used by the default chat transport.
 *
 * Purpose: Lets a test return a status or throw without opening a socket, while the retry and hang logic still run.
 * When to use: Transport tests. Pass null when the test finishes.
 * Expected outcome: The next default transport call uses `override`, or `postChatViaHttps` when `override` is null.
 * Exceptions: None.
 */
export function setOpenRouterPostChatForTests(override: typeof postChatViaHttps | null): void {
  logDebug('openRouter setOpenRouterPostChatForTests', { enabled: override !== null });
  postChatForAttempt = override ?? postChatViaHttps;
}

/**
 * Returns the chat transport to use for the current request (test override or default HTTPS implementation).
 */
export function resolveOpenRouterChatTransport(): OpenRouterChatTransport {
  return chatTransportOverride ?? defaultPostOpenRouterChatWithTimeoutAndRetry;
}

