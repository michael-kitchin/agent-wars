import { logDebug, logTrace } from '../logger';

/**
 * Reports whether this model takes an explicit cache mark on the system message.
 *
 * Purpose: Anthropic and Google cache a marked prefix. Other providers ignore or reject the mark.
 * When to use: Before copying a chat body for HTTP.
 * Expected outcome: True when the model id starts with `anthropic/` or `google/`.
 * Exceptions: None.
 */
export function modelUsesExplicitPromptCache(modelId: string): boolean {
  logTrace('promptCacheBreakpoint modelUsesExplicitPromptCache', { modelId });
  return modelId.startsWith('anthropic/') || modelId.startsWith('google/');
}

/**
 * Copies a chat body and marks the system message for a short-lived cache.
 *
 * Purpose: The in-memory transcript stays plain strings. Only the HTTP body carries the mark.
 * When to use: `postOrdersChatRequest`, for a model that uses an explicit cache and has not rejected the mark.
 * Expected outcome: The first system message's string becomes one text block with `cache_control: { type: 'ephemeral' }`.
 * Later messages are unchanged. A system message that is already an array is left as the same body.
 * Exceptions: None.
 */
export function applySystemCacheBreakpoint(body: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const messages = body.messages;
  const messageCount = Array.isArray(messages) ? messages.length : 0;
  logDebug('promptCacheBreakpoint applySystemCacheBreakpoint', { messageCount });
  if (!Array.isArray(messages) || messages.length === 0) return body;
  const first = messages[0];
  if (first === null || typeof first !== 'object') return body;
  const message = first as { role?: unknown; content?: unknown };
  if (message.role !== 'system' || typeof message.content !== 'string') return body;
  const marked = {
    ...message,
    content: [{ type: 'text', text: message.content, cache_control: { type: 'ephemeral' } }],
  };
  return { ...body, messages: [marked, ...messages.slice(1)] };
}

/**
 * Reports whether a failed response rejected the cache mark.
 *
 * Purpose: A 400 that does not mention the mark must not disable caching.
 * When to use: After a chat request that sent the mark.
 * Expected outcome: True only when the error string mentions `cache_control`.
 * Exceptions: None.
 */
export function isCacheBreakpointRejection(result: { readonly error?: string }): boolean {
  const error = result.error ?? '';
  logTrace('promptCacheBreakpoint isCacheBreakpointRejection', { mentionsMark: error.includes('cache_control') });
  return error.includes('cache_control');
}

/**
 * Reports whether a failed response rejected two user messages in a row.
 *
 * Purpose: Some providers require roles to alternate, so the fixed lead-in cannot stand alone.
 * When to use: After a chat request that sent the lead-in and the situation as two user messages.
 * Expected outcome: True when the error says the roles must alternate or rejects two user messages.
 * Exceptions: None.
 */
export function isConsecutiveUserMessageRejection(result: { readonly error?: string }): boolean {
  const error = (result.error ?? '').toLowerCase();
  const rejected = error.includes('roles must alternate')
    || error.includes('consecutive user')
    || error.includes('two user messages')
    || error.includes('user messages in a row');
  logTrace('promptCacheBreakpoint isConsecutiveUserMessageRejection', { rejected });
  return rejected;
}

/**
 * Copies a chat body with the lead-in as the first line of the situation message.
 *
 * Purpose: A provider that rejects two user messages still receives the fixed sentence and the live situation.
 * When to use: The retry after `isConsecutiveUserMessageRejection`, and later requests for a marked model.
 * Expected outcome: Messages 1 and 2, when both are user strings, become one user message. Other bodies are unchanged.
 * Exceptions: None.
 */
export function joinOpeningUserMessages(body: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const messages = body.messages;
  const messageCount = Array.isArray(messages) ? messages.length : 0;
  logDebug('promptCacheBreakpoint joinOpeningUserMessages', { messageCount });
  if (!Array.isArray(messages) || messages.length < 3) return body;
  const lead = messages[1] as { role?: unknown; content?: unknown } | null;
  const situation = messages[2] as { role?: unknown; content?: unknown } | null;
  if (lead === null || situation === null) return body;
  if (lead.role !== 'user' || situation.role !== 'user') return body;
  if (typeof lead.content !== 'string' || typeof situation.content !== 'string') return body;
  const joined = { role: 'user', content: `${lead.content}\n${situation.content}` };
  return { ...body, messages: [messages[0], joined, ...messages.slice(3)] };
}
