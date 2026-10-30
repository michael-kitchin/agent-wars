import { escapeHtmlText } from '../../shared/htmlTextFormatting';
import { BUILD_PAUSED_NOTE } from '../../shared/productionBuildability';

/**
 * Normalizes a build count input to the one-to-99 digits-only contract.
 *
 * Purpose: Shared sanitizer for single-hex and multi-hex build popups so count clamps cannot drift.
 * When to use: Before persisting or displaying a changed build-count field value.
 * Expected outcome: Decimal string from 1 through 99; empty/non-digits become `'1'`; values above 99 become `'99'`.
 * Exceptions: None.
 */
export function sanitizeBuildCountInputText(raw: string): string {
  const digitsOnly = raw.replaceAll(/\D/g, '').slice(0, 2);
  if (digitsOnly.length === 0) return '1';
  const parsed = parseInt(digitsOnly, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return '1';
  if (parsed > 99) return '99';
  return String(parsed);
}

/**
 * Escapes text before inserting it into build-popup HTML fragments.
 *
 * Purpose: Centralizes markup safety for single- and multi-hex popup descriptions.
 * When to use: Any derived name or identifier rendered through `innerHTML`.
 * Expected outcome: HTML metacharacters are encoded without changing ordinary text.
 * Exceptions: None.
 */
export function escapeBuildPopupHtml(text: string): string {
  return escapeHtmlText(text);
}

/**
 * The paused-building note for the single-hex popup.
 *
 * Purpose: The player sees why a queue outside home is not spending.
 * When to use: When the snapshot says the hex is paused and the viewer controls it.
 * Expected outcome: A `div.build-no-urban` holding `BUILD_PAUSED_NOTE`.
 * Exceptions: None.
 */
export function createBuildPausedNote(): HTMLDivElement {
  const note = document.createElement('div');
  note.className = 'build-no-urban';
  note.textContent = BUILD_PAUSED_NOTE;
  return note;
}
