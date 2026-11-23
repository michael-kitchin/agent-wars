/**
 * The slides that floating panels use between their compact and expanded states.
 *
 * Purpose: The selection panel, the new-game setup panel, and the minimap slide the same way and for the same time, and
 *   all skip the slide when the player asks for reduced motion.
 * When to use: `startPanelHeightSlide`, or `startPanelSizeSlide` for a panel that also changes width, from a panel's
 *   expand or collapse handler.
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
 * Purpose: Panel slides are skipped, and the sight-cue stage draws its lines only during the hold, for players who turn motion off.
 * When to use: Before each slide, and each frame of the sight-cue stage.
 * Expected outcome: True when `prefers-reduced-motion: reduce` matches.
 * Exceptions: None; false when the media query cannot be read.
 */
export function reducedMotionRequested(): boolean {
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

/**
 * A panel's size, in pixels, as its CSS `width` and `height` measure it.
 *
 * Purpose: The two ends of a slide that changes width and height together.
 * When to use: Arguments of `startPanelSizeSlide`.
 * Expected outcome: Plain numbers, matched to the panel's CSS `width` and `height`.
 * Exceptions: None.
 */
export interface PanelSize {
  /**
   * The width.
   *
   * Contract: Pixels, matched to the panel's `box-sizing`.
   * When to use: Read by `startPanelSizeSlide`.
   * Expected outcome: Zero or more.
   * Exceptions: None.
   */
  readonly width: number;
  /**
   * The height.
   *
   * Contract: Pixels, matched to the panel's `box-sizing`.
   * When to use: Read by `startPanelSizeSlide`.
   * Expected outcome: Zero or more.
   * Exceptions: None.
   */
  readonly height: number;
}

/**
 * Slides a panel's width and height from `from` to `to`, from its top-left corner.
 *
 * Purpose: A panel that collapses to one corner control shrinks in both directions.
 * When to use: From a panel's expand or collapse handler, after its target size is known.
 * Expected outcome: The running slide, which calls `onFinish` with itself when it ends; a canceled slide does not call
 *   it. Returns null, without calling `onFinish`, when motion is reduced, both sizes are within a pixel, or the page
 *   cannot animate; the caller then settles the panel itself.
 * Exceptions: None.
 */
export function startPanelSizeSlide(
  panel: HTMLElement,
  from: PanelSize,
  to: PanelSize,
  onFinish: (slide: Animation) => void
): Animation | null {
  const unchanged = Math.abs(from.width - to.width) < 1 && Math.abs(from.height - to.height) < 1;
  if (reducedMotionRequested() || unchanged || typeof panel.animate !== 'function') return null;
  const running = panel.animate(
    [
      { width: `${from.width}px`, height: `${from.height}px` },
      { width: `${to.width}px`, height: `${to.height}px` },
    ],
    { duration: PANEL_SLIDE_MS, easing: 'ease-out' }
  );
  running.onfinish = () => onFinish(running);
  return running;
}
