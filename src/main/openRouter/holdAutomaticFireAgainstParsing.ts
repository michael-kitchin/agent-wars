/**
 * Reads the `holdAutomaticFireAgainst` value of an orders reply.
 *
 * Purpose: Decides whether a reply replaces, clears, or keeps the stored list, before any code is resolved to a seat.
 * When to use: While parsing an orders reply in either theater.
 * Expected outcome: A choice or none, plus drop reasons. No database is read.
 * Exceptions: None.
 */

import { logTrace } from '../logger';

/**
 * What a reply asked the stored list to become.
 *
 * Contract: `replace` carries at least one trimmed, lower-case code with no duplicate; the codes are not yet resolved.
 * When to use: Passing the parsed value to the apply step.
 * Expected outcome: A reply that keeps the list has no choice at all.
 * Exceptions: None.
 */
export type HoldAutomaticFireAgainstChoice =
  | { readonly kind: 'replace'; readonly sideCodes: readonly string[] }
  | { readonly kind: 'clear' };

/**
 * The one entry that clears the list.
 *
 * Purpose: Clearing needs an explicit word, because an empty array keeps the list.
 * When to use: Comparing a trimmed, lower-cased entry.
 * Expected outcome: The string `none`.
 * Exceptions: None.
 */
export const HOLD_AUTOMATIC_FIRE_AGAINST_CLEAR_TOKEN = 'none';

/**
 * The drop reason for a value that is not a list of non-empty strings.
 *
 * Purpose: Tells the commander why its list did not change.
 * When to use: Refusing a value.
 * Expected outcome: One reason and no choice.
 * Exceptions: None.
 */
const NOT_A_LIST_REASON = 'holdAutomaticFireAgainst dropped: expected a list of side codes.';
/**
 * The drop reason for the clear word sent together with side codes.
 *
 * Purpose: The two requests contradict each other, so neither is applied.
 * When to use: Refusing such a list.
 * Expected outcome: One reason and no choice.
 * Exceptions: None.
 */
const MIXED_CLEAR_REASON = 'holdAutomaticFireAgainst dropped: "none" cannot be combined with side codes.';

/**
 * Parses one reply value.
 *
 * Purpose: A malformed value never changes the stored list.
 * When to use: On `holdAutomaticFireAgainst` of an orders reply.
 * Expected outcome: `replace` or `clear`, or no choice for a missing, empty, or refused value. A refused value has one drop reason.
 * Exceptions: None.
 */
export function parseHoldAutomaticFireAgainstChoice(raw: unknown): {
  /**
   * What the reply asked for.
   *
   * Contract: Undefined when the stored list is to be kept.
   * When to use: Passing the result to the apply step.
   * Expected outcome: A replace or a clear request, or nothing.
   * Exceptions: None.
   */
  readonly choice: HoldAutomaticFireAgainstChoice | undefined;
  /**
   * Why a value was refused.
   *
   * Contract: Empty unless the value was refused.
   * When to use: Adding to the reply's drop reasons.
   * Expected outcome: At most one reason.
   * Exceptions: None.
   */
  readonly dropReasons: string[];
} {
  logTrace('holdAutomaticFireAgainstParsing parseHoldAutomaticFireAgainstChoice', {
    entryCount: Array.isArray(raw) ? raw.length : null,
  });
  if (raw === undefined || raw === null) return { choice: undefined, dropReasons: [] };
  if (!Array.isArray(raw)) return { choice: undefined, dropReasons: [NOT_A_LIST_REASON] };
  // A model that follows a schema often sends an empty array for every optional list, so clearing on `[]` would end a
  // truce no commander chose to end. An empty array keeps the stored list.
  if (raw.length === 0) return { choice: undefined, dropReasons: [] };
  const entries = raw.map((entry: unknown) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''));
  if (entries.includes('')) return { choice: undefined, dropReasons: [NOT_A_LIST_REASON] };
  if (entries.every((entry) => entry === HOLD_AUTOMATIC_FIRE_AGAINST_CLEAR_TOKEN)) {
    return { choice: { kind: 'clear' }, dropReasons: [] };
  }
  if (entries.includes(HOLD_AUTOMATIC_FIRE_AGAINST_CLEAR_TOKEN)) return { choice: undefined, dropReasons: [MIXED_CLEAR_REASON] };
  return { choice: { kind: 'replace', sideCodes: [...new Set(entries)] }, dropReasons: [] };
}
