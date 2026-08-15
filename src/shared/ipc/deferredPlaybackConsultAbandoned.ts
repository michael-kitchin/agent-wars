/**
 * Player-visible recovery copy when deferred playback consultation is abandoned.
 */

/**
 * Lower-right OpenRouter log line when main drops a deferred consult because playback notify metadata did not match.
 *
 * Purpose: One string for main `openRouter:log` and tests so the recovery message cannot drift.
 * When to use: Mismatch or invalid `notifyResolutionPlaybackComplete` while a consult is pending.
 * Expected outcome: Shown as an error-styled row in `#openrouter-log`.
 * Exceptions: None.
 */
export const DEFERRED_PLAYBACK_CONSULT_ABANDONED_LOG =
  'AI consultation skipped: resolution playback notify did not match; resuming planning.';
