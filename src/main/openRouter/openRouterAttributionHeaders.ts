import { logTrace } from '../logger';

/**
 * URL OpenRouter uses as this app's identity.
 *
 * Purpose: `HTTP-Referer` is the key that creates the public app page.
 * When to use: Only from `openRouterAttributionHeaders`.
 * Expected outcome: The GitHub repository URL, with no trailing slash.
 * Exceptions: None.
 */
export const OPENROUTER_APP_HTTP_REFERER = 'https://github.com/michael-kitchin/agent-wars';

/**
 * Display name OpenRouter shows for this app.
 *
 * Purpose: Rankings and analytics use this title together with the referer URL.
 * When to use: Only from `openRouterAttributionHeaders`.
 * Expected outcome: The words Agent Wars.
 * Exceptions: None.
 */
export const OPENROUTER_APP_TITLE = 'Agent Wars';

/**
 * Marketplace category OpenRouter accepts for this app.
 *
 * Purpose: `game` is the recognized entertainment category for this game.
 * When to use: Only from `openRouterAttributionHeaders`.
 * Expected outcome: The single lowercase category `game`.
 * Exceptions: None.
 */
export const OPENROUTER_APP_CATEGORIES = 'game';

/**
 * The three attribution headers, and no others.
 *
 * Purpose: Both OpenRouter calls must send the same app identity. Leaving out `X-OpenRouter-App-Visibility` keeps the app public.
 * When to use: From `openRouterModelsRequestHeaders` and `openRouterChatRequestHeaders` only.
 * Expected outcome: A new object each call. Keys are `HTTP-Referer`, `X-OpenRouter-Title`, and `X-OpenRouter-Categories`.
 * Exceptions: None.
 */
export function openRouterAttributionHeaders(): Readonly<Record<string, string>> {
  logTrace('openRouter openRouterAttributionHeaders');
  return {
    'HTTP-Referer': OPENROUTER_APP_HTTP_REFERER,
    'X-OpenRouter-Title': OPENROUTER_APP_TITLE,
    'X-OpenRouter-Categories': OPENROUTER_APP_CATEGORIES,
  };
}

/**
 * Headers for the models-list GET.
 *
 * Purpose: `listModels` must identify the app without dropping the bearer token.
 * When to use: The `headers` option of the models `fetch`.
 * Expected outcome: `Authorization` is `Bearer` plus the given key, then the three attribution headers. The key is not logged. A new object each call.
 * Exceptions: None. Does not trim `apiKey`. Does not set `Content-Type` or `Accept-Encoding`.
 */
export function openRouterModelsRequestHeaders(apiKey: string): Readonly<Record<string, string>> {
  logTrace('openRouter openRouterModelsRequestHeaders', { hasKey: apiKey.length > 0 });
  return {
    Authorization: `Bearer ${apiKey}`,
    ...openRouterAttributionHeaders(),
  };
}

/**
 * Headers for the chat-completion POST.
 *
 * Purpose: `postChatViaHttps` must keep the JSON and compression headers and add the same app identity.
 * When to use: The `headers` option of the chat `https.request`.
 * Expected outcome: `Content-Type`, `Authorization`, and `Accept-Encoding` keep their current values, then the three attribution headers. The key is not logged. A new object each call.
 * Exceptions: None. Does not trim `apiKey`.
 */
export function openRouterChatRequestHeaders(apiKey: string): Readonly<Record<string, string>> {
  logTrace('openRouter openRouterChatRequestHeaders', { hasKey: apiKey.length > 0 });
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'Accept-Encoding': 'gzip, deflate, br, identity',
    ...openRouterAttributionHeaders(),
  };
}
