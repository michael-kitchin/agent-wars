import { logDebug } from '../logger';

/**
 * Minimal chat message shape used when trimming OpenRouter tool-loop context.
 *
 * Purpose: Keeps trimming logic independent of the full `requestOrdersFlow` message union.
 * When to use: Passing the live tool-loop `messages` array into `trimOldestToolLoopExchange`.
 * Expected outcome: Only `role` is required for trimming decisions.
 * Exceptions: None.
 */
export interface OpenRouterToolLoopMessage {
  /**
   * Chat role used to locate the oldest assistant/tool exchange eligible for trimming.
   *
   * Contract: Must match OpenRouter chat message roles (`assistant`, `tool`, etc.) used in the live tool loop.
   * When to use: Read by `trimOldestToolLoopExchange` when scanning messages after the seed system+user pair.
   * Expected outcome: Drives which contiguous assistant/tool block is removed on prompt-limit recovery.
   * Exceptions: None.
   */
  role: string;
}

/**
 * Removes the oldest assistant/tool exchange after the initial system+user prompts.
 *
 * Purpose: Recovers from OpenRouter "Prompt tokens limit exceeded" errors without aborting the AI turn.
 * When to use: When a chat completion fails with prompt-limit 402 and more than the seed messages remain.
 * Expected outcome: True when one exchange was removed; false when nothing safe remains to trim.
 * Exceptions: None.
 */
export function trimOldestToolLoopExchange(messages: OpenRouterToolLoopMessage[]): boolean {
  if (messages.length <= 2) return false;
  const startIndex = 2;
  if (messages[startIndex]?.role !== 'assistant') return false;
  let removeCount = 1;
  while (startIndex + removeCount < messages.length && messages[startIndex + removeCount]?.role === 'tool') {
    removeCount++;
  }
  messages.splice(startIndex, removeCount);
  logDebug('openRouter trimOldestToolLoopExchange: removed oldest assistant/tool exchange', {
    removedCount: removeCount,
    remainingMessages: messages.length,
  });
  return true;
}
