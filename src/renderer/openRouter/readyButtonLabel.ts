/**
 * Ready's two labels: the check mark with "Ready", and "AI:" with the elapsed wait.
 *
 * Purpose: The wait label replaces the button's content, so the Ready label has to be rebuilt afterwards.
 * When to use: `updateReadyButtonState` in `openRouterUiHelpers`.
 * Expected outcome: The button shows one of the two labels. Repeated refreshes do not rebuild a label that is already showing.
 * Exceptions: None.
 */

/**
 * Formats an elapsed wait as MM:SS.
 *
 * Purpose: The Ready button and its collapsed layout share one time format.
 * When to use: `setReadyButtonLabelAiWait`.
 * Expected outcome: Minutes and seconds, each two digits, separated by a colon.
 * Exceptions: None.
 */
export function formatElapsedMmSs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Path of the check mark drawn left of "Ready", in a 16 x 16 view box.
 *
 * Purpose: The markup in `static/index.html` and the label rebuilt here draw the same mark.
 * When to use: `buildReadyCheckIcon`.
 * Expected outcome: A stroked tick in the chrome icon style.
 * Exceptions: None.
 */
const READY_CHECK_ICON_PATH = 'M3 8.5l3.2 3.2L13 4.8';

/**
 * Builds the check mark icon for the Ready label.
 *
 * Purpose: The AI wait label replaces the button's content, so the Ready label has to be rebuilt with its icon.
 * When to use: From `setReadyButtonLabelReady`.
 * Expected outcome: A new `svg.chrome-icon.ready-btn-check`, hidden from assistive technology.
 * Exceptions: None.
 */
function buildReadyCheckIcon(): SVGSVGElement {
  const svgNs = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(svgNs, 'svg');
  icon.setAttribute('class', 'chrome-icon ready-btn-check');
  icon.setAttribute('viewBox', '0 0 16 16');
  icon.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svgNs, 'path');
  path.setAttribute('d', READY_CHECK_ICON_PATH);
  icon.appendChild(path);
  return icon;
}

/**
 * Shows the Ready label: the check mark, then the word.
 *
 * Purpose: Ready's label whenever opponent planning is not holding the button, enabled or disabled.
 * When to use: From `updateReadyButtonState` whenever the AI wait label does not apply.
 * Expected outcome: The button holds `svg.ready-btn-check` and then `span.ready-btn-label` reading "Ready". A button
 *   that already shows the mark is left alone, so repeated refreshes do not rebuild it. The collapsed console's styles
 *   hide the word and keep the mark.
 * Exceptions: None.
 */
export function setReadyButtonLabelReady(readyBtn: HTMLButtonElement): void {
  if (readyBtn.querySelector('.ready-btn-check')) return;
  const label = document.createElement('span');
  label.className = 'ready-btn-label';
  label.textContent = 'Ready';
  readyBtn.replaceChildren(buildReadyCheckIcon(), label);
}

/**
 * Shows the AI wait label: "AI:" and the elapsed wait, in the button's own type.
 *
 * Purpose: Tells the player that Ready is waiting on opponent planning, and for how long.
 * When to use: From `updateReadyButtonState` while opponent planning holds the button.
 * Expected outcome: One `span.ready-btn-ai-label`, "AI: " plus MM:SS, then " · {k} planning". No check mark.
 *   An existing span only updates the text.
 * Exceptions: None.
 */
export function setReadyButtonLabelAiWait(readyBtn: HTMLButtonElement, elapsedMs: number, planningCount = 1): void {
  const text = `AI: ${formatElapsedMmSs(elapsedMs)} · ${planningCount} planning`;
  let label = readyBtn.querySelector<HTMLElement>('.ready-btn-ai-label');
  if (!label) {
    label = document.createElement('span');
    label.className = 'ready-btn-ai-label';
    readyBtn.replaceChildren(label);
  }
  if (label.textContent !== text) label.textContent = text;
}
