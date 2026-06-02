import { logDebug, logError } from '../logger';
import {
  markOpenRouterSessionCreditsExhausted,
  OPENROUTER_INSUFFICIENT_CREDITS_USER_MESSAGE,
} from './openRouterCreditLimits';

const OPENROUTER_KEY_INFO_URL = 'https://openrouter.ai/api/v1/key';

/**
 * Result of probing OpenRouter key credit headroom before building AI order prompts.
 *
 * Purpose: Lets order flow fail fast when the key reports zero remaining credits.
 * When to use: Return value of `probeOpenRouterKeyAffordability`.
 * Expected outcome: Either affordable with optional limit metadata, or a blocked reason string.
 * Exceptions: None.
 */
export type OpenRouterKeyAffordabilityProbe =
  | { affordable: true; limitRemaining: number | null }
  | { affordable: false; reason: 'zero_limit_remaining'; userMessage: string };

/**
 * Probes OpenRouter key metadata for zero remaining credits before an expensive order request.
 *
 * Purpose: Avoids building large system prompts when the key already reports no spendable balance.
 * When to use: At the start of `requestOrdersFlow`, after the API key is loaded.
 * Expected outcome: `{ affordable: true }` when probe succeeds or is inconclusive; blocked when limit_remaining is 0.
 * Exceptions: Network failures are logged and treated as affordable so a missing probe does not block valid keys.
 */
export async function probeOpenRouterKeyAffordability(key: string): Promise<OpenRouterKeyAffordabilityProbe> {
  try {
    logDebug('openRouter probeOpenRouterKeyAffordability: start');
    const res = await fetch(OPENROUTER_KEY_INFO_URL, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      logDebug('openRouter probeOpenRouterKeyAffordability: non-OK response', { status: res.status });
      return { affordable: true, limitRemaining: null };
    }
    const json = (await res.json()) as { data?: { limit_remaining?: unknown } };
    const limitRemainingRaw = json.data?.limit_remaining;
    const limitRemaining =
      typeof limitRemainingRaw === 'number' && Number.isFinite(limitRemainingRaw) ? limitRemainingRaw : null;
    logDebug('openRouter probeOpenRouterKeyAffordability: completed', { limitRemaining });
    if (limitRemaining !== null && limitRemaining <= 0) {
      markOpenRouterSessionCreditsExhausted();
      return {
        affordable: false,
        reason: 'zero_limit_remaining',
        userMessage: OPENROUTER_INSUFFICIENT_CREDITS_USER_MESSAGE,
      };
    }
    return { affordable: true, limitRemaining };
  } catch (err) {
    logError('openRouter probeOpenRouterKeyAffordability: exception', err);
    return { affordable: true, limitRemaining: null };
  }
}

/**
 * Returns the user-facing insufficient-credits message for preflight and transport failures.
 *
 * Purpose: Avoids duplicating the same string across order flow and OpenRouter modules.
 * When to use: When blocking AI requests due to known zero balance.
 * Expected outcome: Stable message suitable for UI logs and IPC error payloads.
 * Exceptions: None.
 */
export function getOpenRouterInsufficientCreditsUserMessage(): string {
  return OPENROUTER_INSUFFICIENT_CREDITS_USER_MESSAGE;
}
