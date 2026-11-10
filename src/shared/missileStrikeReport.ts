/**
 * The sentence and the playback rows for resolved missile launches.
 *
 * Purpose: The turn report and the strike animation share one description of the launches a viewer may see.
 * When to use: After Ready, for launches the viewer is allowed to see.
 * Expected outcome: One strike sentence per controlling side, and a one-way flight per launch. A spent missile does not return.
 * Exceptions: None. This module has no logger.
 */

import type { AirStrikeAnimationMove } from './ipc/ordersTypes';
import type { MissileLaunchRecord } from './ipc/missileTypes';
import { joinWithSerialComma, type MissileStrikeToastLine } from './consolidatedTurnUpdateToast';
import { isSeatId } from './seatIds';
import { formatTurnReportHexList } from './turnReportHexCodes';

/**
 * One visible launch and the code of its target hex.
 *
 * Purpose: The sentence builder does not look up hex codes.
 * When to use: After `orderTargetHexCode` and the visibility filter.
 * Expected outcome: `hexCode` is null when the hex has no code.
 * Exceptions: None.
 */
export interface MissileStrikeEntry {
  /**
   * The launch whose destroyed counts this sentence totals.
   *
   * Contract: A launch the viewer may see.
   * When to use: Always.
   * Expected outcome: Its destroyed counts add into that controller's sentence.
   * Exceptions: None.
   */
  readonly record: MissileLaunchRecord;
  /**
   * The target hex's code, or null when it has none.
   *
   * Contract: The code `orderTargetHexCode` returned. Not a place name.
   * When to use: Always.
   * Expected outcome: Null becomes `an unidentified hex` in the sentence.
   * Exceptions: None.
   */
  readonly hexCode: string | null;
}

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
 * One count clause, or nothing when the count is zero.
 *
 * Purpose: The sentence names only kinds that were destroyed.
 * When to use: Inside `formatMissileStrikeSummaryLine`.
 * Expected outcome: Null when `count` is 0 or less. Otherwise the count and the singular noun when the count is 1.
 * Exceptions: None.
 */
function countPhrase(count: number, singular: string, plural: string): string | null {
  if (count <= 0) return null;
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * The strike sentence for one side's visible launches.
 *
 * Purpose: The turn report totals what those missiles cleared.
 * When to use: Once per controller group.
 * Expected outcome: Null when `entries` is empty. Otherwise one sentence. Kinds with a destroyed total of 0 are omitted.
 *   When every destroyed total is 0, the sentence ends `destroyed nothing`.
 * Exceptions: None.
 */
export function formatMissileStrikeSummaryLine(entries: readonly MissileStrikeEntry[]): string | null {
  if (entries.length === 0) return null;
  let urban = 0;
  let airports = 0;
  let seaports = 0;
  let fortifications = 0;
  let squadrons = 0;
  const codes: (string | null)[] = [];
  for (const entry of entries) {
    urban += entry.record.urbanDestroyed;
    airports += entry.record.airportsDestroyed;
    seaports += entry.record.seaportsDestroyed;
    fortifications += entry.record.fortificationsDestroyed;
    squadrons += entry.record.destroyedAirUnitIds.length;
    codes.push(entry.hexCode);
  }
  const phrases = [
    countPhrase(urban, 'city cell', 'city cells'),
    countPhrase(airports, 'airport', 'airports'),
    countPhrase(seaports, 'seaport', 'seaports'),
    countPhrase(fortifications, 'fortification', 'fortifications'),
  ].filter((part): part is string => part !== null);
  const destroyed = phrases.length === 0 ? 'destroyed nothing' : `destroyed ${joinWithSerialComma(phrases)}`;
  const squadronClause = squadrons === 0 ? '' : `; ${squadrons} ${squadrons === 1 ? 'squadron' : 'squadrons'} lost`;
  const strike = entries.length === 1 ? 'strike' : 'strikes';
  return `Missile ${strike} in ${formatTurnReportHexList(codes)} ${destroyed}${squadronClause}.`;
}

/**
 * One toast line per controller, in the order each controller first appears.
 *
 * Purpose: The toast assembler files each line and does not combine launches.
 * When to use: After the viewer filter, with a code on every entry.
 * Expected outcome: A seat id stays that seat. Neutral and a null controller share one line whose `controllerId` is null.
 * Exceptions: None. An empty list returns no lines.
 */
export function buildMissileStrikeToastLines(entries: readonly MissileStrikeEntry[]): MissileStrikeToastLine[] {
  const groups = new Map<string | null, MissileStrikeEntry[]>();
  for (const entry of entries) {
    const controller = entry.record.targetControllerId;
    const key = controller !== null && isSeatId(controller) ? controller : null;
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  const lines: MissileStrikeToastLine[] = [];
  for (const [controllerId, group] of groups) {
    const line = formatMissileStrikeSummaryLine(group);
    if (line !== null) lines.push({ controllerId, line });
  }
  return lines;
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
