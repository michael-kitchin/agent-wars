/**
 * The selection panel's two states: compact, the summary bar alone, and expanded, the bar over the details. The expand
 * control at the bar's left edge switches them, and the panel slides between them from its bottom edge, so the bar
 * moves up as the details open under it.
 *
 * Purpose: Keeps the map clear by default, while the full panel stays one click away.
 * When to use: `wireSelectionPanelExpand` once at startup; `settleSelectionPanelSlide` when the panel hides.
 * Expected outcome: `data-state` on `#selection-panel` is `compact`, `expanding`, `expanded`, or `collapsing`. The
 *   styles hide the details only while compact, turn the chevron down while expanded or collapsing, and show the grip
 *   only while expanded. The state the player picks lasts for the app session; the app opens compact.
 * Exceptions: None; missing elements are skipped.
 */
import { selectionPanelCollapseTooltipText, selectionPanelExpandTooltipText } from '../chrome/frameTooltipText';
import { applyDraggedPanelHeight, clearPanelHeight } from './selectionPanelResize';

/**
 * How long the panel takes to slide between its states, in milliseconds.
 *
 * Purpose: Long enough to show where the details come from, short enough not to slow the player down.
 * When to use: The slide's duration.
 * Expected outcome: 150.
 * Exceptions: None.
 */
const SELECTION_PANEL_SLIDE_MS = 150;

/**
 * Whether the player last chose the expanded state.
 *
 * Purpose: The choice lasts across selection changes, while the panel is hidden, and in and out of battles.
 * When to use: Read and written only in this module.
 * Expected outcome: False when the app opens. Not saved.
 * Exceptions: None.
 */
let expanded = false;

/**
 * The slide in progress, if any.
 *
 * Purpose: A click during a slide starts the next slide from where this one is.
 * When to use: Set when a slide starts; cleared when it ends or is cancelled.
 * Expected outcome: Null while the panel is settled.
 * Exceptions: None.
 */
let slide: Animation | null = null;

/**
 * Sets the expand control's state, name, and tip from the player's choice.
 *
 * Purpose: Assistive technology and the tip must say what the next click does as soon as it is clicked.
 * When to use: After the choice changes, and once at startup.
 * Expected outcome: `aria-expanded`, `aria-label`, and the tip match `expanded`.
 * Exceptions: None.
 */
function syncExpandControl(button: HTMLElement): void {
  button.setAttribute('aria-expanded', String(expanded));
  button.setAttribute('aria-label', expanded ? 'Hide selection details' : 'Show selection details');
  const tip = expanded ? selectionPanelCollapseTooltipText : selectionPanelExpandTooltipText;
  button.setAttribute('data-control-tooltip', tip);
}

/**
 * Reports whether the system asks for reduced motion.
 *
 * Purpose: The slide is skipped for players who turn motion off.
 * When to use: Before each slide.
 * Expected outcome: True when `prefers-reduced-motion: reduce` matches.
 * Exceptions: None; false when the media query cannot be read.
 */
function reducedMotionRequested(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * Ends the panel in the state the player chose, with no slide running.
 *
 * Purpose: One place that leaves the panel settled, after a slide or without one.
 * When to use: When a slide finishes, when no slide is needed, and when the panel hides.
 * Expected outcome: `data-state` is `expanded` or `compact`. A compact panel has no inline height.
 * Exceptions: None.
 */
function settle(panel: HTMLElement): void {
  slide?.cancel();
  slide = null;
  panel.dataset.state = expanded ? 'expanded' : 'compact';
  if (!expanded) clearPanelHeight(panel);
}

/**
 * Slides the panel's height from `from` to `to`, then settles it.
 *
 * Purpose: The panel's bottom edge stays put, so a changing height moves the bar up or down.
 * When to use: From `toggleSelectionPanel`, after `data-state` shows the details and the target height is in place.
 * Expected outcome: The panel settles at once when motion is reduced, the heights match, or the page cannot animate.
 * Exceptions: None.
 */
function slidePanel(panel: HTMLElement, from: number, to: number): void {
  if (reducedMotionRequested() || Math.abs(from - to) < 1 || typeof panel.animate !== 'function') {
    settle(panel);
    return;
  }
  const running = panel.animate([{ height: `${from}px` }, { height: `${to}px` }], {
    duration: SELECTION_PANEL_SLIDE_MS,
    easing: 'ease-out',
  });
  slide = running;
  running.onfinish = () => {
    if (slide === running) settle(panel);
  };
}

/**
 * Switches the panel between compact and expanded.
 *
 * Purpose: The expand control's single action.
 * When to use: On a click on `#selection-panel-expand`, which also covers Enter and Space.
 * Expected outcome: The choice flips at once. Expanding shows the details and grows the panel to its fit-to-rows or
 *   dragged height; collapsing shrinks it to the bar. A click during a slide starts from the panel's current height.
 * Exceptions: None.
 */
function toggleSelectionPanel(panel: HTMLElement, bar: HTMLElement, button: HTMLElement): void {
  const from = panel.getBoundingClientRect().height;
  slide?.cancel();
  slide = null;
  expanded = !expanded;
  syncExpandControl(button);
  if (expanded) {
    panel.dataset.state = 'expanding';
    applyDraggedPanelHeight(panel);
    slidePanel(panel, from, panel.getBoundingClientRect().height);
    return;
  }
  panel.dataset.state = 'collapsing';
  clearPanelHeight(panel);
  const borders = panel.offsetHeight - panel.clientHeight;
  slidePanel(panel, from, bar.offsetHeight + borders);
}

/**
 * Settles a slide that is still running, so the panel is ready when it shows again.
 *
 * Purpose: A panel that hides during a slide keeps the state the last click chose.
 * When to use: When the selection panel hides.
 * Expected outcome: No slide is running, and `data-state` is `expanded` or `compact`.
 * Exceptions: None.
 */
export function settleSelectionPanelSlide(): void {
  const panel = document.getElementById('selection-panel');
  if (panel && slide) settle(panel);
}

/**
 * Wires the expand control and puts the panel in its opening state.
 *
 * Purpose: The expand feature's single setup point.
 * When to use: Once during renderer startup, after the page markup exists.
 * Expected outcome: The panel starts compact, and each click on the expand control switches its state.
 * Exceptions: None; does nothing when the markup is missing.
 */
export function wireSelectionPanelExpand(): void {
  const panel = document.getElementById('selection-panel');
  const bar = document.getElementById('selection-panel-bar');
  const button = document.getElementById('selection-panel-expand');
  if (!panel || !bar || !button) return;
  settle(panel);
  syncExpandControl(button);
  button.addEventListener('click', () => toggleSelectionPanel(panel, bar, button));
}
