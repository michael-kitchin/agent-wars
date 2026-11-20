/**
 * Keeps a shifted panel's box inside the area it sits in, along one axis.
 *
 * Purpose: A dragged panel, and a panel whose area shrank or whose height grew, must stay in reach.
 * When to use: The replay panel's drag grip, once per axis.
 * Expected outcome: `wanted` limited to the shifts that keep the box inside the area. When the box is larger than the area, the box's near edge stays on the area's near edge.
 * Exceptions: None.
 *
 * @param wanted The shift the player asked for, in pixels.
 * @param homeStart Where the box's near edge is with no shift.
 * @param size The box's length on this axis.
 * @param areaStart The area's near edge.
 * @param areaEnd The area's far edge.
 */
export function clampPanelShift(wanted: number, homeStart: number, size: number, areaStart: number, areaEnd: number): number {
  const lowest = areaStart - homeStart;
  const highest = Math.max(lowest, areaEnd - homeStart - size);
  return Math.min(Math.max(wanted, lowest), highest);
}
