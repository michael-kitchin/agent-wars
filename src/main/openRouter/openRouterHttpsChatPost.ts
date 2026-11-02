/**
 * One OpenRouter chat completion over HTTPS.
 *
 * Purpose: The transport's retry loop posts through this function, and tests can replace it.
 * When to use: The default attempt poster. A retry calls it again.
 * Expected outcome: Status, response headers, and the decoded body text.
 * Exceptions: Rejects on socket errors, abort, and body-decode failure.
 */

import { URL } from 'node:url';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';
import { logError } from '../logger';
import { openRouterChatRequestHeaders } from './openRouterAttributionHeaders';
import { requestOpenRouterHttps } from './openRouterHttpsRequest';

/**
 * The chat-completions URL.
 *
 * Purpose: One place names the endpoint the attempt poster calls.
 * When to use: `postChatViaHttps` only.
 * Expected outcome: `https://openrouter.ai/api/v1/chat/completions`.
 * Exceptions: None.
 */
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Posts one chat completion over HTTPS and decodes the body.
 *
 * Purpose: One attempt of the OpenRouter chat call, including the socket timeout and gzip decoding.
 * When to use: The default attempt poster. Retries call it again.
 * Expected outcome: Request headers come from `openRouterChatRequestHeaders`. The promise resolves with status, response headers, and decoded body text.
 * Exceptions: Rejects on socket errors, abort, and body-decode failure.
 */
export async function postChatViaHttps(args: {
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
    const req = requestOpenRouterHttps(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: openRouterChatRequestHeaders(args.key),
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
