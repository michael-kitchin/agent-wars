import { escapeHtmlText } from '../../shared/htmlTextFormatting';
import { buildPopupCloseTooltipText } from '../../shared/popupControlTooltipText';
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
 * Builds the close row shared by the build and hire popups.
 *
 * Purpose: Every popup uses the same close button, tip, and row class.
 * When to use: As the first child of a build, multi-hex, or hire panel.
 * Expected outcome: A row whose button calls `onClose` and shows the close tip.
 * Exceptions: None.
 */
export function createBuildPopupCloseRow(onClose: () => void): HTMLDivElement {
  const closeRow = document.createElement('div');
  closeRow.className = 'build-popup-close-row';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'unit-select build-close-btn';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('data-control-tooltip', buildPopupCloseTooltipText);
  closeBtn.addEventListener('click', () => onClose());
  closeRow.appendChild(closeBtn);
  return closeRow;
}

/**
 * Builds a two-digit count field with the shared key filter.
 *
 * Purpose: Build and hire counts reject the same non-digit keys.
 * When to use: On a queue row or the raise-unit row. Callers add their own input and click listeners.
 * Expected outcome: A text input showing `initialValue`, limited to two characters, that allows editing keys and digits.
 * Exceptions: None.
 */
export function createBuildCountInput(tooltipText: string, initialValue: string): HTMLInputElement {
  const countInput = document.createElement('input');
  countInput.setAttribute('data-control-tooltip', tooltipText);
  countInput.type = 'text';
  countInput.className = 'build-count-input';
  countInput.maxLength = 2;
  countInput.inputMode = 'numeric';
  countInput.value = initialValue;
  countInput.addEventListener('keydown', (event) => {
    const allowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Tab'];
    if (allowed.includes(event.key)) return;
    if (/^\d$/.test(event.key)) return;
    event.preventDefault();
  });
  return countInput;
}

/**
 * Reads a count field after writing the sanitized text back into it.
 *
 * Purpose: Queue edits persist the clamped one-to-99 value the player sees.
 * When to use: When a build-queue type or count change is submitted.
 * Expected outcome: The input shows the sanitized text, and the return value is that text parsed as a base-10 integer.
 * Exceptions: None.
 */
export function readSanitizedBuildCount(input: HTMLInputElement): number {
  const raw = sanitizeBuildCountInputText(input.value);
  if (input.value !== raw) input.value = raw;
  return parseInt(raw, 10);
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
