/**
 * Shared heuristic for user- or transport-initiated aborts (renderer background AI, main `requestOrders`, etc.).
 */

/**
 * True when `err` is probably an abort/cancel rather than a hard planning or transport failure.
 *
 * Purpose: Avoids treating an intentional stop as a planning failure, and keeps renderer and main abort checks aligned.
 * When to use: `catch` blocks around a commander consult, OpenRouter chat transport, or any `AbortController`-backed promise where `Error.name === 'AbortError'` may be wrapped or stringified.
 * Expected outcome: `true` for `AbortError`, messages containing `AbortError`, or case-insensitive `abort` substrings (Electron/Node variance).
 * Exceptions: None; conservative false negatives only when runtimes hide abort signals entirely.
 */
export function isLikelyAbortError(err: unknown): boolean {
  if (err instanceof Error && err.name === 'AbortError') return true;
  const msg = String(err);
  return msg.includes('AbortError') || msg.toLowerCase().includes('abort');
}
