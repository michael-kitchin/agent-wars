/**
 * The three messages a consultation starts with.
 *
 * Purpose: The first user message stays fixed so a provider can pin the route, and the situation follows it.
 * When to use: `requestOrdersFlow` before the tool loop.
 * Expected outcome: System, the fixed lead-in, then the situation.
 * Exceptions: None.
 */

import { logDebug } from '../logger';

/**
 * Fixed first user message.
 *
 * Purpose: Providers that hash the first user message keep one route while the situation changes.
 * When to use: `buildConsultMessages`.
 * Expected outcome: This exact sentence.
 * Exceptions: None.
 */
export const CONSULT_SITUATION_LEAD_IN = 'The current situation is in the next message.';

/**
 * Builds the starting messages for one consultation.
 *
 * Purpose: The tool loop appends after these three and does not rewrite them.
 * When to use: After `buildConsultPromptParts`.
 * Expected outcome: A system message, the lead-in, and the situation message.
 * Exceptions: None.
 */
export function buildConsultMessages(
  parts: {
    readonly staticSystemText: string;
    readonly situationText: string;
  },
  /**
   * When true, the lead-in is the first line of the situation instead of its own message.
   *
   * Contract: Omitted means false. Set for a model that already rejected two user messages.
   * When to use: `requestOrdersFlow` after `isSituationMessagesJoinedForModel`.
   * Expected outcome: Two messages instead of three. The situation text is unchanged below the lead-in.
   * Exceptions: None.
   */
  joinSituation = false
): { role: 'system' | 'user'; content: string }[] {
  logDebug('openRouter buildConsultMessages', {
    staticChars: parts.staticSystemText.length,
    situationChars: parts.situationText.length,
    joinSituation,
  });
  if (joinSituation) {
    return [
      { role: 'system', content: parts.staticSystemText },
      { role: 'user', content: `${CONSULT_SITUATION_LEAD_IN}\n${parts.situationText}` },
    ];
  }
  return [
    { role: 'system', content: parts.staticSystemText },
    { role: 'user', content: CONSULT_SITUATION_LEAD_IN },
    { role: 'user', content: parts.situationText },
  ];
}
