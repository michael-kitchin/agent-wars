/**
 * Decides whether a map gesture may change orders or the unit selection.
 *
 * Purpose: Click, double-click, and build-queue edits share one playback check and one battle-footprint check.
 * When to use: Before writing the selection, the selected hex, a target, or a build queue from a map gesture.
 * Expected outcome: Callers branch on the booleans below. These functions do not toast and do not throw.
 * Exceptions: None.
 */

/**
 * Returns whether resolution playback should ignore gestures that change orders or the selection.
 *
 * Purpose: Pan, zoom, tooltips, right-click, and tactical entry stay outside this check.
 * When to use: Pass the current resolution-move animation. A missing animation is null.
 * Expected outcome: True when an animation is present. False for null and undefined.
 * Exceptions: None.
 */
export function resolutionPlaybackBlocksMapOrders(animation: unknown): boolean {
  return animation != null;
}

/**
 * Returns whether a hit-tested hex may receive an order or a selection change.
 *
 * Purpose: A miss during a battle is outside the battle, while a miss with no battle is still a normal empty click.
 * When to use: After the hit test. Compute `footprintSaysInside` only for a string hit.
 * Expected outcome: True when no battle is active. During a battle, false for a null hit, otherwise `footprintSaysInside`.
 * Exceptions: None.
 */
export function tacticalHitIsInsideBattle(
  hasBattle: boolean,
  hit: string | null,
  footprintSaysInside: boolean
): boolean {
  if (!hasBattle) return true;
  if (hit == null) return false;
  return footprintSaysInside;
}
