/**
 * The sentence and the playback rows for one resolved missile launch.
 *
 * Purpose: The turn report and the strike animation share one description of a launch.
 * When to use: After Ready, for launches the viewer is allowed to see.
 * Expected outcome: A strike line and a one-way flight. A spent missile does not return.
 * Exceptions: None. This module has no logger.
 */

import type { AirStrikeAnimationMove } from './ipc/ordersTypes';
import type { MissileLaunchRecord } from './ipc/missileTypes';
import { joinWithSerialComma } from './consolidatedTurnUpdateToast';

/**
 * Place name used when a target hex has no caption.
 *
 * Purpose: The strike line always names a place.
 * When to use: When the hex-naming caption is missing or blank.
 * Expected outcome: The words `an unnamed hex`.
 * Exceptions: None.
 */
export const MISSILE_STRIKE_UNNAMED_PLACE = 'an unnamed hex';

/**
 * Whether this viewer may see a launch.
 *
 * Purpose: Fog hides a strike the viewer did not launch, did not receive, and cannot see.
 * When to use: Before drawing a flight or writing a strike line.
 * Expected outcome: True for an omniscient viewer, the launcher, the target's controller, or a visible target hex.
 * Exceptions: None.
 */
export function missileLaunchVisibleToViewer(
  record: MissileLaunchRecord,
  viewerSeatId: string | null,
  visibleHexes: ReadonlySet<string>
): boolean {
  if (viewerSeatId === null) return true;
  if (record.player === viewerSeatId) return true;
  if (record.targetControllerId === viewerSeatId) return true;
  return visibleHexes.has(record.targetH3Index);
}

/**
 * One clause for a flag kind that was present.
 *
 * Purpose: The strike line names only kinds the hex had.
 * When to use: Inside `formatMissileStrikeLine`.
 * Expected outcome: Null when `before` is 0. Otherwise the destroyed count, singular when that count is 1.
 * Exceptions: None.
 */
function flagPhrase(destroyed: number, before: number, singular: string, plural: string): string | null {
  if (before <= 0) return null;
  return `${destroyed} ${destroyed === 1 ? singular : plural}`;
}

/**
 * The strike sentence for one launch.
 *
 * Purpose: The turn report says what the missile cleared, in a fixed phrase.
 * When to use: Once per launch the viewer can see.
 * Expected outcome: The nothing-there sentence when no flags were present. Otherwise the destroyed counts and any lost squadrons.
 * Exceptions: None.
 */
export function formatMissileStrikeLine(args: { readonly placeName: string; readonly record: MissileLaunchRecord }): string {
  const record = args.record;
  const parts = [
    flagPhrase(record.urbanDestroyed, record.urbanBefore, 'city cell', 'city cells'),
    flagPhrase(record.airportsDestroyed, record.airportsBefore, 'airport', 'airports'),
    flagPhrase(record.seaportsDestroyed, record.seaportsBefore, 'seaport', 'seaports'),
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return `Missile strike on ${args.placeName}: nothing there to destroy.`;
  const air = record.destroyedAirUnitIds.length;
  const squadrons = air === 0 ? '' : `; ${air} ${air === 1 ? 'squadron' : 'squadrons'} lost`;
  return `Missile strike on ${args.placeName}: ${joinWithSerialComma(parts)} destroyed${squadrons}.`;
}

/**
 * One-way flights for the strike animation.
 *
 * Purpose: A missile flies with the air-strike outbound pass and never returns.
 * When to use: When building the playback move list from visible launches.
 * Expected outcome: One move per record, `returnsToBase` false, unit type `missile`.
 * Exceptions: None.
 */
export function buildMissilePlaybackMoves(records: readonly MissileLaunchRecord[]): AirStrikeAnimationMove[] {
  return records.map((record) => ({
    unitId: record.unitId,
    player: record.player,
    unitType: 'missile',
    fromH3Index: record.fromH3Index,
    targetH3Index: record.targetH3Index,
    returnsToBase: false,
  }));
}
