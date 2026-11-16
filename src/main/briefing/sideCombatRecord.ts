/**
 * Counts what each side destroyed of a commander's units and what the commander destroyed of theirs.
 */

import { LOSS_CAUSE_KEYS, type LostUnit, type PlayerLossSummary } from '../../shared/lossSummary';
import { logDebug } from '../logger';

/**
 * Who started the fight that destroyed a unit.
 *
 * Purpose: A plain total would count a commander's own failed attacks as another side's aggression.
 * When to use: The values of `COMBAT_RECORD_CATEGORY_BY_CAUSE` and the keys of `CombatLossCounts`.
 * Expected outcome: One of four words.
 * Exceptions: None.
 */
export type CombatRecordCategory = 'responsibleAttacked' | 'victimAttacked' | 'closeCombat' | 'other';

/**
 * The category of each loss cause.
 *
 * Purpose: Ranged, air, and missile strikes were started by the side responsible; return fire was started by the victim's side. A melee loss can be either side's attacker or defender, so it is close combat, not an attack.
 * When to use: Sorting a unit into a category by the bucket it is stored in.
 * Expected outcome: Every key of `PlayerLossSummary` has one category.
 * Exceptions: None.
 */
export const COMBAT_RECORD_CATEGORY_BY_CAUSE: Readonly<Record<keyof PlayerLossSummary, CombatRecordCategory>> = {
  ranged: 'responsibleAttacked',
  melee: 'closeCombat',
  returnFire: 'victimAttacked',
  airStrike: 'responsibleAttacked',
  missileStrike: 'responsibleAttacked',
  other: 'other',
};

/**
 * Units destroyed, split by who started the fight.
 *
 * Purpose: One side of a record holds one of these.
 * When to use: `SideCombatRecord.destroyedOfYours` and `destroyedOfTheirs`.
 * Expected outcome: `total` is the sum of the four categories.
 * Exceptions: None.
 */
export interface CombatLossCounts {
  /**
   * All units counted.
   *
   * Contract: The sum of the other four fields.
   * When to use: Choosing between the none and some wording.
   * Expected outcome: Zero when nothing was destroyed.
   * Exceptions: None.
   */
  readonly total: number;
  /**
   * Units destroyed when the responsible side attacked.
   *
   * Contract: Ranged, air strike, and missile strike losses.
   * When to use: The first part of the destroyed-of-yours wording.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly responsibleAttacked: number;
  /**
   * Units destroyed when the victim's side attacked.
   *
   * Contract: Return fire losses.
   * When to use: The second part of the destroyed-of-yours wording.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly victimAttacked: number;
  /**
   * Units destroyed in close combat or in a tactical battle.
   *
   * Contract: Melee and battle losses, which have no starter.
   * When to use: The third part of the wording.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly closeCombat: number;
  /**
   * Units destroyed some other way.
   *
   * Contract: Losses filed under other, such as cargo and air bases.
   * When to use: The last part of the wording.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly other: number;
}

/**
 * One turn of stored losses for a record.
 *
 * Purpose: The window of Recent Turn Notes, parsed.
 * When to use: The `turns` of `buildSideCombatRecords`.
 * Expected outcome: One entry per row of the window.
 * Exceptions: None.
 */
export interface CombatRecordTurn {
  /**
   * The strategic turn.
   *
   * Contract: A positive integer.
   * When to use: The latest-turn fields and the window bounds.
   * Expected outcome: Unique within one call.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * The commander's own losses that turn.
   *
   * Contract: Parsed from the own-loss column.
   * When to use: Counting what each side destroyed of the commander's units.
   * Expected outcome: Empty buckets when nothing was lost.
   * Exceptions: None.
   */
  readonly ownLosses: PlayerLossSummary;
  /**
   * Every other owner's losses that turn.
   *
   * Contract: Parsed from the other-loss column.
   * When to use: Counting what the commander destroyed of each side's units.
   * Expected outcome: Each unit names its owner in its attribution when the row is new.
   * Exceptions: None.
   */
  readonly otherLosses: PlayerLossSummary;
  /**
   * Units a tactical battle destroyed that turn, of any owner.
   *
   * Contract: Each unit names its owner in its attribution.
   * When to use: Counted as close combat for both parties.
   * Expected outcome: Empty when no battle destroyed a unit.
   * Exceptions: None.
   */
  readonly battleLosses: readonly LostUnit[];
}

/**
 * The record between the commander and one other side.
 *
 * Purpose: Puts the evidence next to the stance decision.
 * When to use: One entry of `SideCombatRecordSet.records`.
 * Expected outcome: Zero counts and no latest turns for a side that did nothing in the window.
 * Exceptions: None.
 */
export interface SideCombatRecord {
  /**
   * The other side.
   *
   * Contract: A seat id from the `sideIds` argument.
   * When to use: Matching the record to a row of the Sides table.
   * Expected outcome: Never the commander's own seat.
   * Exceptions: None.
   */
  readonly sideId: string;
  /**
   * Units of the commander this side was credited with destroying.
   *
   * Contract: Counts each unit once for each credited side.
   * When to use: The `{code} destroyed N of your units` wording.
   * Expected outcome: Never counts a unit with no side, an unknown side, or another side.
   * Exceptions: None.
   */
  readonly destroyedOfYours: CombatLossCounts;
  /**
   * Units of this side the commander was credited with destroying.
   *
   * Contract: Counts only units this side owned.
   * When to use: The `You destroyed M of theirs` wording.
   * Expected outcome: Never counts a unit credited to another side.
   * Exceptions: None.
   */
  readonly destroyedOfTheirs: CombatLossCounts;
  /**
   * The latest turn this side destroyed one of the commander's units.
   *
   * Contract: Null when it destroyed none in the window.
   * When to use: The `(latest turn T)` wording.
   * Expected outcome: A turn inside the window.
   * Exceptions: None.
   */
  readonly latestTurnDestroyedYours: number | null;
  /**
   * The latest turn this side destroyed one of the commander's units by its own attack, in close combat, or in a battle.
   *
   * Contract: Counts ranged, air, missile, and close combat losses, not return fire or other losses. Null when none.
   * When to use: The conflict check against a friendly stance.
   * Expected outcome: Never later than `latestTurnDestroyedYours`.
   * Exceptions: None.
   */
  readonly latestTurnAttackedYou: number | null;
}

/**
 * The records of one commander for one window.
 *
 * Purpose: The wording names the window, so the bounds travel with the records.
 * When to use: The result of `buildSideCombatRecords`.
 * Expected outcome: One record per requested side, in the order requested.
 * Exceptions: None.
 */
export interface SideCombatRecordSet {
  /**
   * The oldest turn in the window.
   *
   * Contract: The smallest `turnNumber` given.
   * When to use: The `Record, turns X to Y` wording.
   * Expected outcome: Not greater than `lastTurn`.
   * Exceptions: None.
   */
  readonly firstTurn: number;
  /**
   * The newest turn in the window.
   *
   * Contract: The largest `turnNumber` given.
   * When to use: The `Record, turns X to Y` wording.
   * Expected outcome: Not less than `firstTurn`.
   * Exceptions: None.
   */
  readonly lastTurn: number;
  /**
   * One record per requested side.
   *
   * Contract: Same order as the `sideIds` argument.
   * When to use: Reading each side's record.
   * Expected outcome: Never contains the commander's own seat.
   * Exceptions: None.
   */
  readonly records: readonly SideCombatRecord[];
}

/**
 * A count under construction.
 *
 * Purpose: The counts are built by adding one unit at a time, then handed out read-only.
 * When to use: Inside this module.
 * Expected outcome: Starts at zero.
 * Exceptions: None.
 */
type MutableCounts = { -readonly [K in keyof CombatLossCounts]: CombatLossCounts[K] };

/**
 * Starts a count at zero.
 *
 * Purpose: Each side starts two counts.
 * When to use: `recordFor`.
 * Expected outcome: All five fields are zero.
 * Exceptions: None.
 */
function zeroCounts(): MutableCounts {
  return { total: 0, responsibleAttacked: 0, victimAttacked: 0, closeCombat: 0, other: 0 };
}

/**
 * Whether a unit was credited to a side.
 *
 * Purpose: Only a named side is credited; unknown and no-side losses count for no one.
 * When to use: Counting each unit.
 * Expected outcome: True only when the attribution lists the side.
 * Exceptions: None.
 */
function isCreditedTo(unit: LostUnit, sideId: string): boolean {
  return unit.attribution?.responsibleOwnerIds?.includes(sideId) === true;
}

/**
 * Builds the record between the commander and one side.
 *
 * Purpose: Walks the window once for this side.
 * When to use: `buildSideCombatRecords`, once per requested side.
 * Expected outcome: The counts and the two latest turns.
 * Exceptions: None.
 */
function recordFor(ownSeatId: string, sideId: string, turns: readonly CombatRecordTurn[]): SideCombatRecord {
  const yours = zeroCounts();
  const theirs = zeroCounts();
  let latestDestroyed: number | null = null;
  let latestAttacked: number | null = null;
  const later = (current: number | null, turnNumber: number): number => (current === null || turnNumber > current ? turnNumber : current);
  for (const turn of turns) {
    const countYours = (category: CombatRecordCategory): void => {
      yours[category] += 1;
      yours.total += 1;
      latestDestroyed = later(latestDestroyed, turn.turnNumber);
      if (category === 'responsibleAttacked' || category === 'closeCombat') latestAttacked = later(latestAttacked, turn.turnNumber);
    };
    const countTheirs = (category: CombatRecordCategory): void => {
      theirs[category] += 1;
      theirs.total += 1;
    };
    for (const key of LOSS_CAUSE_KEYS) {
      const category = COMBAT_RECORD_CATEGORY_BY_CAUSE[key];
      for (const unit of turn.ownLosses[key]) if (isCreditedTo(unit, sideId)) countYours(category);
      for (const unit of turn.otherLosses[key]) {
        if (unit.attribution?.ownerId === sideId && isCreditedTo(unit, ownSeatId)) countTheirs(category);
      }
    }
    for (const unit of turn.battleLosses) {
      if (unit.attribution?.ownerId === ownSeatId && isCreditedTo(unit, sideId)) countYours('closeCombat');
      if (unit.attribution?.ownerId === sideId && isCreditedTo(unit, ownSeatId)) countTheirs('closeCombat');
    }
  }
  return { sideId, destroyedOfYours: yours, destroyedOfTheirs: theirs, latestTurnDestroyedYours: latestDestroyed, latestTurnAttackedYou: latestAttacked };
}

/**
 * Builds the combat record of one commander against each other side.
 *
 * Purpose: Weak models do not add up ten blocks of loss lines, so the game adds them and shows the result next to the stance.
 * When to use: `readSideCombatRecords`, with the parsed window of Recent Turn Notes.
 * Expected outcome: One record per requested side, with the window bounds. Null when the window has no turns.
 * Exceptions: None.
 */
export function buildSideCombatRecords(args: {
  readonly ownSeatId: string;
  readonly sideIds: readonly string[];
  readonly turns: readonly CombatRecordTurn[];
}): SideCombatRecordSet | null {
  logDebug('sideCombatRecord buildSideCombatRecords', {
    ownSeatId: args.ownSeatId,
    sideCount: args.sideIds.length,
    turnCount: args.turns.length,
  });
  if (args.turns.length === 0) return null;
  const turnNumbers = args.turns.map((turn) => turn.turnNumber);
  return {
    firstTurn: Math.min(...turnNumbers),
    lastTurn: Math.max(...turnNumbers),
    records: args.sideIds.map((sideId) => recordFor(args.ownSeatId, sideId, args.turns)),
  };
}
