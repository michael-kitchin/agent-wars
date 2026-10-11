import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';
import {
  AI_MODEL_REQUEST_RETRY_COUNT,
  AI_MODEL_REQUEST_TIMEOUT_MS,
} from '../../shared/aiConsultationLimits';
import { logDebug, logError } from '../logger';
import { formatModelCallFailureLine } from './modelCallAttemptMessages';
import { readModelHangSimulationMs, shouldSimulateModelHang } from './modelHangSimulation';
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

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
/**
 * Aborts an OpenRouter chat POST when the full response has not arrived.
 *
 * Purpose: Local name for `AI_MODEL_REQUEST_TIMEOUT_MS` so this transport does not grow a second deadline.
 * When to use: The abort timer and the socket timeout in `defaultPostOpenRouterChatWithTimeoutAndRetry` / `postChatViaHttps`.
 * Expected outcome: A single model call is destroyed after 90s and retried once.
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

 * Purpose: Caps how long a response body may take after headers arrive, using the same 90s budget as the request abort.
 * When to use: The response hard timer in `postChatViaHttps`.
 * Expected outcome: A body that has started cannot outlive `AI_MODEL_REQUEST_TIMEOUT_MS`.
 * Exceptions: None.
 */
const OPENROUTER_RESPONSE_HARD_TIMEOUT_MS = AI_MODEL_REQUEST_TIMEOUT_MS;
/**
 * Documents the module-scope binding `OPENROUTER_REQUEST_RETRY_COUNT` (OPENROUTER_REQUEST_RETRY_COUNT).

 * Purpose: Local name for `AI_MODEL_REQUEST_RETRY_COUNT` so the retry loop and the consultation wait budget stay in step.
 * When to use: The network-attempt loop in `defaultPostOpenRouterChatWithTimeoutAndRetry`.
 * Expected outcome: One retry after a timeout or retryable failure.
 * Exceptions: None.
 */
const OPENROUTER_REQUEST_RETRY_COUNT = AI_MODEL_REQUEST_RETRY_COUNT;

/**
 * Defines the `isRetryableStatus` function shape (function isRetryableStatus(status: number): boolean).

 * Purpose: Supports maintainability by documenting why `isRetryableStatus` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
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
    try {
      if (parentSignal?.aborted) return { ok: false, error: 'Cancelled' };
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
          if (payload.onLog) {
            payload.onLog(`OpenRouter credit headroom: retrying with max_tokens=${affordable}.`);
          }
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
        networkAttempt += 1;
        await delayMs(waitMs, parentSignal);
        if (parentSignal?.aborted) return { ok: false, error: 'Cancelled' };
        continue;
      }
      return { ok: false, error: lastError, status: chatResponse.status };
    } catch (err) {
      if (parentSignal?.aborted) return { ok: false, error: 'Cancelled' };
      const timeoutLike = controller.signal.aborted;
      const isResponseStreamStall =
        String(err).includes('HTTPS_RESPONSE_IDLE_TIMEOUT_') ||
        String(err).includes('HTTPS_RESPONSE_SOCKET_TIMEOUT_') ||
        String(err).includes('HTTPS_RESPONSE_HARD_TIMEOUT_');
      if (timeoutLike) {
        if (payload.onLog) {
          payload.onLog(
            formatModelCallFailureLine({
              cause: 'timeout',
              attempt,
              maxAttempts,
              willRetry,
              timeoutMs: attemptTimeoutMs,
            }),
            true
          );
        }
        if (!willRetry) lastError = `Model call timed out after ${maxAttempts} attempts.`;
        logError(`openRouter ${payload.requestLabel}: timeout`, {
          timeoutMs: attemptTimeoutMs,
          attempt,
        });
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
        networkAttempt += 1;
        await delayMs(waitMs, parentSignal);
        if (parentSignal?.aborted) return { ok: false, error: 'Cancelled' };
        continue;
      }
      return { ok: false, error: lastError };
    } finally {
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
 * Defines the `postChatViaHttps` function shape (async function postChatViaHttps(args: { key: string; requestBody: Record<string, unknown>; signal: AbortSignal; timeoutMs: number; responseIdleTi).

 * Purpose: Supports maintainability by documenting why `postChatViaHttps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
async function postChatViaHttps(args: {
  key: string;
  requestBody: Record<string, unknown>;
  signal: AbortSignal;
  timeoutMs: number;
  responseIdleTimeoutMs: number;
  responseHardTimeoutMs: number;
  attempt: number;
  requestLabel: string;
}): Promise<{ status: number; headers: Record<string, string>; bodyText: string }> {
  const url = new URL(OPENROUTER_CHAT_URL);
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${args.key}`,
          'Accept-Encoding': 'gzip, deflate, br, identity',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let responseIdleTimer: ReturnType<typeof setTimeout> | null = null;
        let responseHardTimer: ReturnType<typeof setTimeout> | null = null;
        const resetResponseIdleTimer = () => {
          if (responseIdleTimer) clearTimeout(responseIdleTimer);
          responseIdleTimer = setTimeout(() => {
            req.destroy(new Error(`HTTPS_RESPONSE_IDLE_TIMEOUT_${args.responseIdleTimeoutMs}`));
          }, args.responseIdleTimeoutMs);
        };
        responseHardTimer = setTimeout(() => {
          req.destroy(new Error(`HTTPS_RESPONSE_HARD_TIMEOUT_${args.responseHardTimeoutMs}`));
        }, args.responseHardTimeoutMs);
        resetResponseIdleTimer();
        res.setTimeout(args.responseIdleTimeoutMs, () => {
          res.destroy(new Error(`HTTPS_RESPONSE_SOCKET_TIMEOUT_${args.responseIdleTimeoutMs}`));
        });
        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          resetResponseIdleTimer();
        });
        res.on('end', () => {
          try {
            if (responseIdleTimer) clearTimeout(responseIdleTimer);
            if (responseHardTimer) clearTimeout(responseHardTimer);
            const raw = Buffer.concat(chunks);
            const contentEncodingHeader = Array.isArray(res.headers['content-encoding'])
              ? res.headers['content-encoding'][0] ?? ''
              : (res.headers['content-encoding'] ?? '');
            const contentEncoding = String(contentEncodingHeader).toLowerCase();
            let decoded = raw;
            if (contentEncoding.includes('gzip')) decoded = gunzipSync(raw);
            else if (contentEncoding.includes('deflate')) decoded = inflateSync(raw);
            else if (contentEncoding.includes('br')) decoded = brotliDecompressSync(raw);
            const responseHeaders: Record<string, string> = {};
            for (const [name, value] of Object.entries(res.headers)) {
              if (typeof value === 'string') responseHeaders[name] = value;
              else if (Array.isArray(value) && value.length > 0) responseHeaders[name] = value.join(', ');
            }
            resolve({
              status: res.statusCode ?? 0,
              headers: responseHeaders,
              bodyText: decoded.toString('utf-8'),
            });
          } catch (decodeErr) {
            logError('openRouterChatTransport: response body decode failed', decodeErr);
            reject(decodeErr);
          }
        });
        res.on('error', (err) => {
          if (responseIdleTimer) clearTimeout(responseIdleTimer);
          if (responseHardTimer) clearTimeout(responseHardTimer);
          reject(err);
        });
      }
    );
    const onAbort = () => req.destroy(new Error('AbortError'));
    if (args.signal.aborted) {
      onAbort();
      return;
    }
    args.signal.addEventListener('abort', onAbort, { once: true });
    req.setTimeout(args.timeoutMs, () => {
      req.destroy(new Error(`HTTPS_TIMEOUT_${args.timeoutMs}`));
    });
    req.on('error', (err) => {
      args.signal.removeEventListener('abort', onAbort);
      reject(err);
    });
    req.on('close', () => {
      args.signal.removeEventListener('abort', onAbort);
    });
    req.write(JSON.stringify(args.requestBody));
    req.end();
  });
}
/**
 * Returns the chat transport to use for the current request (test override or default HTTPS implementation).
 */
export function resolveOpenRouterChatTransport(): OpenRouterChatTransport {
  return chatTransportOverride ?? defaultPostOpenRouterChatWithTimeoutAndRetry;
}

