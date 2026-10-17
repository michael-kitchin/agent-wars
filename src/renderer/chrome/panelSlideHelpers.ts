/**
 * The height slide that floating panels use between their compact and expanded states.
 *
 * Purpose: The selection panel and the new-game setup panel slide the same way and for the same time, and both skip the
 *   slide when the player asks for reduced motion.
 * When to use: `startPanelHeightSlide` from a panel's expand or collapse handler.
 * Expected outcome: One Web Animations slide per call; the caller keeps the returned handle.
 * Exceptions: None.
 */

/**
 * How long a panel takes to slide between its states, in milliseconds.
 *
 * Purpose: Long enough to show where the content comes from, short enough not to slow the player down.
 * When to use: The slide's duration.
 * Expected outcome: 150.
 * Exceptions: None.
 */
const PANEL_SLIDE_MS = 150;

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
 * Slides a panel's height from `from` to `to`.
 *
 * Purpose: One slide for every floating panel, so they all move alike.
 * When to use: After the panel's `data-state` shows the content the slide reveals, and the target height is measured.
 * Expected outcome: Returns the running animation, and calls `onFinish` with it when it ends on its own; a cancelled
 *   slide does not call it. Returns null, without calling `onFinish`, when motion is reduced, the heights are within a
 *   pixel, or the page cannot animate; the caller then settles the panel itself.
 * Exceptions: None.
 */
export function startPanelHeightSlide(
  panel: HTMLElement,
  from: number,
  to: number,
  onFinish: (slide: Animation) => void
): Animation | null {
  if (reducedMotionRequested() || Math.abs(from - to) < 1 || typeof panel.animate !== 'function') return null;
  const running = panel.animate([{ height: `${from}px` }, { height: `${to}px` }], {
    duration: PANEL_SLIDE_MS,
    easing: 'ease-out',
  });
  running.onfinish = () => onFinish(running);
  return running;
}
