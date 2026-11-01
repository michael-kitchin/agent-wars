import type { SightCueBeam } from '../../shared/ipc/sightCueTypes';
import { activeAiSeatIds, findHumanSeat, isSeatActive } from '../../shared/seatRoster';
import { dbGetOne, dbRun, getSeatRoster } from '../gameDb';
import { isFogOfWarEnabled } from '../gameDb/fogState';
import { readSightCuesEnabled } from '../gameDb/gameConfigKv';
import { logDebug, logError } from '../logger';
import { computeSightCueBeams, type SightCueUnit } from './sightCueBeams';
import { readSightCueSeenUnits, writeSightCueSeenUnits } from './sightCueMemory';

/**
 * The planning snapshot the sight-cue stage reads.
 *
 * Purpose: Keeps the ready call to one argument.
 * When to use: At the start of strategic Ready, before Neutral transports unload.
 * Expected outcome: The units and hexes the commanders were briefed on.
 * Exceptions: None.
 */
export interface SightCuesForReadyInput {
  /**
   * Live units at planning time.
   *
   * Contract: Positions are before resolution moves them.
   * When to use: The snapshot taken before `prepareNeutralTransportsForTurn`.
   * Expected outcome: One row per unit.
   * Exceptions: None.
   */
  readonly units: readonly SightCueUnit[];
  /**
   * Strategic hexes on the current map, in map order.
   *
   * Contract: Vision outside this list is dropped.
   * When to use: The same list resolution uses.
   * Expected outcome: Every hex index on the map.
   * Exceptions: None.
   */
  readonly hexList: readonly string[];
}

/**
 * Beams for this turn's opening playback stage, or nothing when the stage does not run.
 *
 * Purpose: Observed matches with the setting and fog on show what each active AI seat could see.
 * When to use: Once per strategic Ready, before combat resolution.
 * Expected outcome: A non-empty list only while observing, with the setting on, fog on, and at least one beam. The memory row is rewritten whenever the setting and fog are on, even while a human is playing. An error returns `undefined` and does not fail Ready.
 * Exceptions: None. Failures are logged and swallowed.
 */
export function buildSightCuesForReady(input: SightCuesForReadyInput): SightCueBeam[] | undefined {
  logDebug('buildSightCuesForReady', { unitCount: input.units.length, hexCount: input.hexList.length });
  try {
    const ops = { getOne: dbGetOne, run: dbRun };
    if (!readSightCuesEnabled(ops)) {
      logDebug('buildSightCuesForReady skipped', { skipped: 'setting_off' });
      return undefined;
    }
    if (!isFogOfWarEnabled(ops)) {
      logDebug('buildSightCuesForReady skipped', { skipped: 'fog_off' });
      return undefined;
    }
    const roster = getSeatRoster();
    const spotterSeatIds = activeAiSeatIds(roster);
    if (spotterSeatIds.length === 0) {
      logDebug('buildSightCuesForReady skipped', { skipped: 'no_active_ai' });
      return undefined;
    }
    const human = findHumanSeat(roster);
    const observing = human == null || !isSeatActive(human);
    const result = computeSightCueBeams({
      units: input.units,
      spotterSeatIds,
      mapHexSet: new Set(input.hexList),
      previousSeenUnitIdsBySeat: readSightCueSeenUnits(ops),
    });
    writeSightCueSeenUnits(ops, result.seenUnitIdsBySeat);
    if (!observing || result.beams.length === 0) return undefined;
    return [...result.beams];
  } catch (err) {
    logError('buildSightCuesForReady failed; this turn has no sight cues', { unitCount: input.units.length }, err);
    return undefined;
  }
}
