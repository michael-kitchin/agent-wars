import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';
import {
  AI_MODEL_REQUEST_RETRY_COUNT,
  AI_MODEL_REQUEST_TIMEOUT_MS,
} from '../../shared/aiConsultationLimits';
import { logDebug, logError } from '../logger';
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
 * Defines the `delayMs` function shape (function delayMs(ms: number): Promise<void>).

 * Purpose: Supports maintainability by documenting why `delayMs` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
async function defaultPostOpenRouterChatWithTimeoutAndRetry(payload: {
  key: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
  onLog?: (line: string, isError?: boolean) => void;
  requestLabel: string;
}): Promise<{ ok: true; status: number; headers: Record<string, string>; bodyText: string } | { ok: false; error: string }> {
  let lastError = `${payload.requestLabel} failed.`;
  let requestBody = applySessionAffordableMaxTokensToBody(payload.body);
  let creditClampRetried = false;
  let networkAttempt = 0;
  let sendOrdinal = 0;
  while (networkAttempt <= OPENROUTER_REQUEST_RETRY_COUNT) {
    const controller = new AbortController();
    const parentSignal = payload.signal;
    const onParentAbort = () => controller.abort();
    if (parentSignal) {
      if (parentSignal.aborted) controller.abort();
      else parentSignal.addEventListener('abort', onParentAbort, { once: true });
    }
    const timeoutId = setTimeout(() => controller.abort(), OPENROUTER_REQUEST_TIMEOUT_MS);
    sendOrdinal += 1;
    try {
      requestBody = applySessionAffordableMaxTokensToBody(requestBody);
      logDebug(`openRouter ${payload.requestLabel}: request attempt start`, {
        attempt: sendOrdinal,
        networkAttempt: networkAttempt + 1,
        timeoutMs: OPENROUTER_REQUEST_TIMEOUT_MS,
        maxTokens: typeof requestBody.max_tokens === 'number' ? requestBody.max_tokens : null,
      });
      const chatResponse = await postChatViaHttps({
        key: payload.key,
        requestBody,
        signal: controller.signal,
        timeoutMs: OPENROUTER_REQUEST_TIMEOUT_MS,
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
      if (chatResponse.status === 401) return { ok: false, error: lastError };
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
      if (networkAttempt < OPENROUTER_REQUEST_RETRY_COUNT && isRetryableStatus(chatResponse.status)) {
        const waitMs = getRetryDelayMs();
        logDebug(`openRouter ${payload.requestLabel}: retrying after API error`, {
          attempt: sendOrdinal,
          status: chatResponse.status,
          retryInMs: waitMs,
        });
        networkAttempt += 1;
        await delayMs(waitMs);
        continue;
      }
      return { ok: false, error: lastError };
    } catch (err) {
      if (parentSignal?.aborted) return { ok: false, error: 'Cancelled' };
      const timeoutLike = controller.signal.aborted;
      const isResponseStreamStall =
        String(err).includes('HTTPS_RESPONSE_IDLE_TIMEOUT_') ||
        String(err).includes('HTTPS_RESPONSE_SOCKET_TIMEOUT_') ||
        String(err).includes('HTTPS_RESPONSE_HARD_TIMEOUT_');
      if (timeoutLike) {
        lastError = 'AI request timed out. Please try again.';
        if (payload.onLog) payload.onLog(lastError, true);
        logError(`openRouter ${payload.requestLabel}: timeout`, {
          timeoutMs: OPENROUTER_REQUEST_TIMEOUT_MS,
          attempt: sendOrdinal,
        });
      } else if (isResponseStreamStall) {
        lastError = 'AI response stream stalled. Please try again.';
        if (payload.onLog) payload.onLog(lastError, true);
        logError(`openRouter ${payload.requestLabel}: response stream timeout`, {
          attempt: sendOrdinal,
          error: String(err),
        });
        return { ok: false, error: lastError };
      } else {
        lastError = `Network error while requesting AI orders: ${String(err)}`;
        logError(`openRouter ${payload.requestLabel}: fetch exception`, err);
      }
      if (networkAttempt < OPENROUTER_REQUEST_RETRY_COUNT) {
        const waitMs = getRetryDelayMs();
        logDebug(`openRouter ${payload.requestLabel}: retrying after exception`, {
          attempt: sendOrdinal,
          retryInMs: waitMs,
        });
        networkAttempt += 1;
        await delayMs(waitMs);
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
 * Documents the `OpenRouterChatTransport` type alias (type OpenRouterChatTransport).

 * Purpose: Supports maintainability by documenting why `OpenRouterChatTransport` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type OpenRouterChatTransport = (payload: {
  key: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
  onLog?: (line: string, isError?: boolean) => void;
  requestLabel: string;
}) => Promise<{ ok: true; status: number; headers: Record<string, string>; bodyText: string } | { ok: false; error: string }>;

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

