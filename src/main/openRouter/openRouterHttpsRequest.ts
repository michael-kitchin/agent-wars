import type { ClientRequest, IncomingMessage } from 'node:http';
import { request as nodeHttpsRequest, type RequestOptions } from 'node:https';
import { logDebug } from '../logger';

/**
 * Socket opener used for one OpenRouter chat POST.
 *
 * Purpose: Names the `https.request` shape the chat transport and its tests share.
 * When to use: The parameter of `setOpenRouterHttpsRequestForTests`, and the implementation behind `requestOpenRouterHttps`.
 * Expected outcome: An options object plus a response callback, returning the `ClientRequest`.
 * Exceptions: None.
 */
export type OpenRouterHttpsRequest = (
  options: RequestOptions,
  callback: (res: IncomingMessage) => void
) => ClientRequest;

/**
 * Production socket opener. Tests replace it.
 *
 * Purpose: Keeps `postChatViaHttps` on `https.request` while a test can record the options.
 * When to use: Only through `requestOpenRouterHttps` and `setOpenRouterHttpsRequestForTests`.
 * Expected outcome: `https.request` until a test passes an override. `null` restores `https.request`.
 * Exceptions: None.
 */
let openRouterHttpsRequest: OpenRouterHttpsRequest = nodeHttpsRequest as OpenRouterHttpsRequest;

/**
 * Opens the chat-completion socket, or the test override.
 *
 * Purpose: `postChatViaHttps` has one call site for the POST so a test can see the headers without a network.
 * When to use: The `https.request` call inside `postChatViaHttps`.
 * Expected outcome: Returns the `ClientRequest` from the current opener. Logs hostname, path, and method. Does not log headers or the API key.
 * Exceptions: The opener's own socket errors. This function does not catch them.
 */
export function requestOpenRouterHttps(
  options: RequestOptions,
  callback: (res: IncomingMessage) => void
): ClientRequest {
  logDebug('openRouter requestOpenRouterHttps', {
    hostname: options.hostname ?? null,
    path: options.path ?? null,
    method: options.method ?? null,
  });
  return openRouterHttpsRequest(options, callback);
}

/**
 * Replaces the socket opener used by `requestOpenRouterHttps`.
 *
 * Purpose: The attribution test records the chat POST options and returns a fake response.
 * When to use: That test, then `null` from `afterEach`.
 * Expected outcome: The next `requestOpenRouterHttps` uses `override`, or `https.request` when `override` is null.
 * Exceptions: None.
 */
export function setOpenRouterHttpsRequestForTests(override: OpenRouterHttpsRequest | null): void {
  logDebug('openRouter setOpenRouterHttpsRequestForTests', { enabled: override !== null });
  openRouterHttpsRequest = override ?? (nodeHttpsRequest as OpenRouterHttpsRequest);
}
