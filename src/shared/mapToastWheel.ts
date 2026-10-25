/**
 * Whether a wheel over the update toast should zoom the map.
 *
 * Purpose: The toast covers the + and − buttons. A wheel there still zooms, unless the toast itself can scroll in that
 *   direction. This does not log: it runs on every wheel notch.
 * When to use: From the toast's wheel listener, with the toast's scroll metrics and the wheel's `deltaY`.
 * Expected outcome: True when the toast does not overflow, the wheel has no vertical delta, or the toast is already at
 *   the end of the wheel's direction. False when the toast still has room to scroll that way.
 * Exceptions: None.
 */
export function mapToastWheelReachesMap(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  deltaY: number,
): boolean {
  if (!(scrollHeight > clientHeight)) return true;
  if (deltaY < 0) return scrollTop <= 0;
  if (deltaY > 0) return scrollTop + clientHeight >= scrollHeight - 1;
  return true;
}
