/**
 * Pure content model for the upper-right AI strategy toast (Messages then Strategy).
 */

import type { CommanderDispatchMessage } from './commanderStatus';
import { SIDE_MESSAGES_TITLE } from './sideMessageView';

/**
 * The message this commander sent to the human player in this wave, when there is one, and the plan summary, shown in `#ai-strategy-toast`.
 *
 * Purpose: One object for IPC, prefetch cache, and toast rendering so call sites cannot swap two strings.
 * When to use: The opponent message dialog and IPC mapping helpers.
 * Expected outcome: Empty/whitespace fields are omitted from rendered sections.
 * Exceptions: None.
 */
export interface AiStrategyToastFields {
  /**
   * One-line strategy summary from the same consultation.
   *
   * Contract: Optional; whitespace-only is treated as absent.
   * When to use: From parsed JSON `"strategy"` / IPC `aiStrategy`.
   * Expected outcome: Becomes the Strategy section body when non-empty.
   * Exceptions: None.
   */
  strategy?: string | null;
  /**
   * Messages this consult stored that the viewer could see.
   *
   * Contract: Optional. A later fog change does not rewrite a list already stored here.
   * When to use: The Messages section.
   * Expected outcome: One bullet per entry when the list is not empty.
   * Exceptions: None.
   */
  messages?: readonly CommanderDispatchMessage[];
}

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
  /**
   * One bullet per visible message.
   *
   * Contract: Present on the Messages section. Absent on Strategy.
   * When to use: The dialog's bullet list.
   * Expected outcome: Recipient and text. The body is empty when this is set.
   * Exceptions: None.
   */
  bullets?: readonly CommanderDispatchMessage[];
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
 * Purpose: Messages appear above Strategy when both exist; either may appear alone.
 * When to use: Before rendering `#ai-strategy-toast`.
 * Expected outcome: Zero, one, or two sections. Messages first when this consult stored a visible message. The legacy `message` field is ignored.
 * Exceptions: None.
 */
export function buildAiStrategyToastSections(fields: AiStrategyToastFields): AiStrategyToastSection[] {
  const sections: AiStrategyToastSection[] = [];
  const bullets = (fields.messages ?? []).filter((row) => row.text.trim().length > 0);
  const strategy = trimToastField(fields.strategy);
  if (bullets.length > 0) sections.push({ title: SIDE_MESSAGES_TITLE, body: '', bullets });
  if (strategy) sections.push({ title: AI_STRATEGY_TOAST_STRATEGY_TITLE, body: strategy });
  return sections;
}

/**
 * Returns whether the toast has any section to display.
 *
 * Purpose: Callers show when true and hide when false (clears a stale previous toast).
 * When to use: Before showing the opponent message dialog.
 * Expected outcome: True if either trimmed field is non-empty.
 * Exceptions: None.
 */
export function hasAiStrategyToastContent(fields: AiStrategyToastFields): boolean {
  return buildAiStrategyToastSections(fields).length > 0;
}
