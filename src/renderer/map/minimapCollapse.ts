/**
 * The control on the minimap's upper-left corner that hides and shows the whole panel.
 *
 * Purpose: Lets the player see more of the map. Collapsed, the panel is only this control, so the overview, the
 *   map-mode toggle, the tabs, and the terrain legend are out of reach until it expands again.
 * When to use: `wireMinimapCollapse` once at startup. Layout code reads `data-state` on `#minimap-panel`.
 * Expected outcome: The panel slides between expanded and compact over the shared panel slide time, or changes at once
 *   when the system asks for reduced motion. The choice lasts until the app closes and is not saved; the markup starts
 *   expanded.
 * Exceptions: None; missing elements are skipped.
 */
import { minimapCollapseTooltipText, minimapExpandTooltipText } from '../chrome/frameTooltipText';
import { startPanelSizeSlide, type PanelSize } from '../chrome/panelSlideHelpers';
import { layoutMapChrome } from './mapChromeLayout';

/**
 * The panel's slide states, kept in `data-state` on `#minimap-panel`.
 *
 * Purpose: CSS reads it to size the panel, turn the chevron, and hide what a collapsed panel covers.
 * When to use: `setPanelState`.
 * Expected outcome: `compact` is the settled collapsed state. `expanding` and `collapsing` show the content while it
 *   slides. Only `expanded` shows the terrain legend.
 * Exceptions: None.
 */
type MinimapPanelState = 'compact' | 'expanding' | 'expanded' | 'collapsing';

/**
 * The compact panel's border-box size: the 32 px control inside the panel's 1 px border.
 *
 * Purpose: The slide's target when collapsing. It matches the compact rule in `static/shellChrome.css`.
 * When to use: `toggleMinimapCollapsed`.
 * Expected outcome: 34 by 34.
 * Exceptions: None.
 */
const COMPACT_SIZE: PanelSize = Object.freeze({ width: 34, height: 34 });

/**
 * The player's choice, true while the minimap is meant to show.
 *
 * Purpose: The control's name, tip, and the settled state follow it at once, even during a slide.
 * When to use: Read and flipped by `toggleMinimapCollapsed`.
 * Expected outcome: True when the app opens.
 * Exceptions: None.
 */
let expanded = true;

/**
 * The slide in progress, or null.
 *
 * Purpose: A click during a slide cancels it and starts from the panel's current size.
 * When to use: Set by `slideTo`, cleared by `settle`.
 * Expected outcome: Null whenever the panel is settled.
 * Exceptions: None.
 */
let slide: Animation | null = null;

/**
 * Reads the panel's size as laid out now, including a running slide.
 *
 * Purpose: The two ends of the next slide.
 * When to use: `toggleMinimapCollapsed`.
 * Expected outcome: `offsetWidth` and `offsetHeight`, which include the border, as the CSS `width` and `height` do
 *   under the page's `border-box` sizing.
 * Exceptions: None.
 */
function panelSize(panel: HTMLElement): PanelSize {
  return { width: panel.offsetWidth, height: panel.offsetHeight };
}

/**
 * Sets the control's state, name, and tip from the player's choice.
 *
 * Purpose: Assistive technology and the tip say what the next click does.
 * When to use: After the choice changes.
 * Expected outcome: `aria-expanded`, `aria-label`, and the tip match `expanded`.
 * Exceptions: None.
 */
function syncControl(button: HTMLElement): void {
  button.setAttribute('aria-expanded', String(expanded));
  button.setAttribute('aria-label', expanded ? 'Hide the minimap' : 'Show the minimap');
  button.setAttribute('data-control-tooltip', expanded ? minimapCollapseTooltipText : minimapExpandTooltipText);
}

/**
 * Records the panel's state and blocks the covered controls while the panel is collapsing or collapsed.
 *
 * Purpose: The only writer of `data-state`. `inert` keeps the map-mode toggle, the tabs, and the terrain legend out of
 *   focus and pointer input from the click that collapses the panel until the click that expands it.
 * When to use: From `settle` and from `toggleMinimapCollapsed`. Callers that measure the panel do it after this returns.
 * Expected outcome: `data-state` is `state`. `#map-mode-tabs-toggle`, `#map-mode-tabs`, and `#terrain-legend` are
 *   inert unless the state is `expanding` or `expanded`.
 * Exceptions: None. Missing controls are skipped.
 */
function setPanelState(panel: HTMLElement, state: MinimapPanelState): void {
  panel.dataset.state = state;
  const blocked = state === 'compact' || state === 'collapsing';
  for (const id of ['map-mode-tabs-toggle', 'map-mode-tabs', 'terrain-legend']) {
    const element = document.getElementById(id);
    if (element) element.inert = blocked;
  }
}

/**
 * Ends the panel in the state the player chose, with no slide running.
 *
 * Purpose: One place that leaves the panel settled, after a slide or without one.
 * When to use: When a slide finishes, and when no slide is needed.
 * Expected outcome: `data-state` is `expanded` or `compact`, and the terrain legend and the toast band are placed for
 *   the settled panel.
 * Exceptions: None.
 */
function settle(panel: HTMLElement): void {
  slide?.cancel();
  slide = null;
  setPanelState(panel, expanded ? 'expanded' : 'compact');
  layoutMapChrome();
}

/**
 * Slides the panel from `from` to `to`, then settles it.
 *
 * Purpose: The top-left corner stays put, so the panel grows from and shrinks into the control.
 * When to use: From `toggleMinimapCollapsed`, after `data-state` shows the content and the target size is known.
 * Expected outcome: The panel settles at once when `startPanelSizeSlide` declines to slide. A slide that a later click
 *   replaced does not settle the panel.
 * Exceptions: None.
 */
function slideTo(panel: HTMLElement, from: PanelSize, to: PanelSize): void {
  slide = startPanelSizeSlide(panel, from, to, (finished) => {
    if (slide === finished) settle(panel);
  });
  if (!slide) settle(panel);
}

/**
 * Switches the minimap between expanded and compact.
 *
 * Purpose: The control's single action.
 * When to use: On a click on `#minimap-collapse-toggle`, which also covers Enter and Space.
 * Expected outcome: The choice flips at once. Collapsing shrinks the panel to the control. Expanding grows it back to
 *   the overview, and the tab row and the terrain legend if they were open, and places the legend and the toast band
 *   for that size before the slide starts. A click during a slide starts from the panel's current size.
 * Exceptions: None. Missing elements leave the panel unchanged.
 */
function toggleMinimapCollapsed(): void {
  const panel = document.getElementById('minimap-panel');
  const button = document.getElementById('minimap-collapse-toggle');
  if (!panel || !button) return;
  const from = panelSize(panel);
  slide?.cancel();
  slide = null;
  expanded = !expanded;
  syncControl(button);
  if (!expanded) {
    setPanelState(panel, 'collapsing');
    slideTo(panel, from, COMPACT_SIZE);
    return;
  }
  setPanelState(panel, 'expanding');
  layoutMapChrome();
  slideTo(panel, from, panelSize(panel));
}

/**
 * Wires the control on the minimap's upper-left corner.
 *
 * Purpose: The collapse control's single setup point.
 * When to use: Once at startup, with `wireMapModeTabs`.
 * Expected outcome: Clicks collapse or expand the minimap. The panel starts expanded, from the markup.
 * Exceptions: None.
 */
export function wireMinimapCollapse(): void {
  document.getElementById('minimap-collapse-toggle')?.addEventListener('click', toggleMinimapCollapsed);
}
