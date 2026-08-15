/**
 * Pure content model for the upper-right AI strategy toast (Message then Strategy).
 */

/**
 * Player-facing taunt/threat and plan-summary fields shown in `#ai-strategy-toast`.
 *
 * Purpose: One object for IPC, prefetch cache, and toast rendering so call sites cannot swap two strings.
 * When to use: `showAiStrategyToast` and IPC mapping helpers.
 * Expected outcome: Empty/whitespace fields are omitted from rendered sections.
 * Exceptions: None.
 */
export interface AiStrategyToastFields {
  /**
   * In-character taunt or threat addressed to the human player.
   *
   * Contract: Optional; whitespace-only is treated as absent.
   * When to use: From parsed JSON `"message"` / IPC `aiMessage`.
   * Expected outcome: Becomes the Message section body when non-empty.
   * Exceptions: None.
   */
  message?: string | null;
  /**
   * One-line strategy summary from the same consultation.
   *
   * Contract: Optional; whitespace-only is treated as absent.
   * When to use: From parsed JSON `"strategy"` / IPC `aiStrategy`.
   * Expected outcome: Becomes the Strategy section body when non-empty.
   * Exceptions: None.
   */
  strategy?: string | null;
}

/** Bold section title for the player-facing taunt/threat. */
export const AI_STRATEGY_TOAST_MESSAGE_TITLE = 'Message';

/** Bold section title for the one-line plan summary. */
export const AI_STRATEGY_TOAST_STRATEGY_TITLE = 'Strategy';

/**
 * One labeled body block to render under a toast section title.
 *
 * Purpose: Lets the renderer iterate sections without knowing field names.
 * When to use: Output of `buildAiStrategyToastSections`.
 * Expected outcome: `title` is `Message` or `Strategy`; `body` is already trimmed.
 * Exceptions: None.
 */
export interface AiStrategyToastSection {
  /**
   * Section label shown as a bold block title with a trailing colon.
   *
   * Contract: One of the title constants; renderer appends `:` if missing.
   * When to use: `appendMapToastSectionHeader`.
   * Expected outcome: Matches lower-right toast title styling.
   * Exceptions: None.
   */
  title: string;
  /**
   * Plain-text body under the title (no bullet prefix).
   *
   * Contract: Non-empty trimmed string.
   * When to use: Rendered as a block span under the header.
   * Expected outcome: No leading/trailing whitespace.
   * Exceptions: None.
   */
  body: string;
}

/**
 * Trims a toast field, returning undefined when empty.
 *
 * Purpose: Shared empty-section rule for Message and Strategy.
 * When to use: Building section lists and deciding whether to show the toast.
 * Expected outcome: Trimmed string or undefined.
 * Exceptions: None.
 */
export function trimToastField(raw: string | null | undefined): string | undefined {
  const trimmed = raw?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Builds ordered toast sections, omitting empty/whitespace fields.
 *
 * Purpose: Message appears above Strategy when both exist; either may appear alone.
 * When to use: Before rendering `#ai-strategy-toast`.
 * Expected outcome: Zero, one, or two sections; Message first when present.
 * Exceptions: None.
 */
export function buildAiStrategyToastSections(fields: AiStrategyToastFields): AiStrategyToastSection[] {
  const sections: AiStrategyToastSection[] = [];
  const message = trimToastField(fields.message);
  const strategy = trimToastField(fields.strategy);
  if (message) sections.push({ title: AI_STRATEGY_TOAST_MESSAGE_TITLE, body: message });
  if (strategy) sections.push({ title: AI_STRATEGY_TOAST_STRATEGY_TITLE, body: strategy });
  return sections;
}

/**
 * Returns whether the toast has any section to display.
 *
 * Purpose: Callers show when true and hide when false (clears a stale previous toast).
 * When to use: `showAiStrategyToast` and prefetch/consult listeners.
 * Expected outcome: True if either trimmed field is non-empty.
 * Exceptions: None.
 */
export function hasAiStrategyToastContent(fields: AiStrategyToastFields): boolean {
  return buildAiStrategyToastSections(fields).length > 0;
}
