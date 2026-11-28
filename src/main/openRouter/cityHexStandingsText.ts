/**
 * The city-hex standings a commander is shown.
 *
 * Purpose: The one place the standings wording and layout are written, so both prompts say the same thing.
 * When to use: The strategic orders prompt and the strategic diplomacy prompt.
 * Expected outcome: Pure text built from a knockout status. No database or file is read.
 * Exceptions: None.
 */

import { playerIdCodeFor } from '../../shared/unitIds';
import { rankSeatsByCityHexes, type VictorySettings } from '../../shared/victoryRules';
import type { KnockoutStatusForSeat } from '../gameActions/knockoutStatus';
import { logTrace } from '../logger';

/**
 * The heading text of the standings, in both prompts.
 *
 * Purpose: Each caller adds its own heading characters around one title.
 * When to use: Wherever the standings body is placed under a heading.
 * Expected outcome: `Standings`.
 * Exceptions: None.
 */
export const STANDINGS_SECTION_TITLE = 'Standings';

/**
 * What the standings are built from.
 *
 * Purpose: Carries the values for one commander at one strategic turn.
 * When to use: `buildCityHexStandingsBody`.
 * Expected outcome: Enough to rank the sides still in the match and to say how the match ends.
 * Exceptions: None.
 */
export interface CityHexStandingsArgs {
  /**
   * The commander's knockout status.
   *
   * Contract: Its rows are the commander and the other sides still in the match, with true city-hex counts.
   * When to use: Counting and ranking the sides.
   * Expected outcome: `own` is the commander's row.
   * Exceptions: None.
   */
  readonly status: KnockoutStatusForSeat;
  /**
   * The match's win rule.
   *
   * Contract: A missing value means the match has no turn limit.
   * When to use: Choosing the closing paragraph.
   * Expected outcome: The stored rule and limit.
   * Exceptions: None.
   */
  readonly victory: VictorySettings | null | undefined;
  /**
   * The strategic turn the prompt is written for.
   *
   * Contract: The turn that has not resolved yet.
   * When to use: A match with a turn limit.
   * Expected outcome: Printed beside the limit.
   * Exceptions: None.
   */
  readonly turnNumber: number;
}

/**
 * One side in the ranked list.
 *
 * Purpose: A status row reduced to what the table and the paragraphs print.
 * When to use: Inside this module.
 * Expected outcome: A place of 1 or more.
 * Exceptions: None.
 */
interface RankedSide {
  /**
   * The side's place.
   *
   * Contract: From `rankSeatsByCityHexes`, so sides with the same count share it.
   * When to use: The table and both paragraphs.
   * Expected outcome: 1 for the leader or leaders.
   * Exceptions: None.
   */
  readonly place: number;
  /**
   * The side's name.
   *
   * Contract: The home-region name from the status row.
   * When to use: The Side column and the leader's name.
   * Expected outcome: The name as stored.
   * Exceptions: None.
   */
  readonly name: string;
  /**
   * The side's code.
   *
   * Contract: From `playerIdCodeFor`.
   * When to use: The Code column and the leader's name.
   * Expected outcome: A short side code.
   * Exceptions: None.
   */
  readonly code: string;
  /**
   * City hexes the side holds.
   *
   * Contract: The length of the status row's city-hex list.
   * When to use: The City hexes column and the order of the list.
   * Expected outcome: Zero or more.
   * Exceptions: None.
   */
  readonly count: number;
  /**
   * Whether this is the commander's own side.
   *
   * Contract: True for exactly one side.
   * When to use: Marking the row and writing the sentences addressed to the commander.
   * Expected outcome: True for the status's `own` row.
   * Exceptions: None.
   */
  readonly own: boolean;
}

/**
 * Ranks the sides still in the match, most city hexes first.
 *
 * Purpose: The table and both paragraphs read one ordered list with the places the turn limit would give.
 * When to use: `buildCityHexStandingsBody`.
 * Expected outcome: Places from `rankSeatsByCityHexes`. The list is sorted by count, and a stable sort keeps sides with the same count in the order commander first, then the others as the status lists them.
 * Exceptions: Propagates the error `playerIdCodeFor` raises for a seat with no code.
 */
function rankSides(status: KnockoutStatusForSeat): readonly RankedSide[] {
  const rows = [status.own, ...status.enemies];
  const places = rankSeatsByCityHexes(
    rows.map((row) => row.seatId),
    new Map(rows.map((row) => [row.seatId, row.cityHexes.length]))
  );
  return rows
    .map((row, index) => ({
      place: places.get(row.seatId) ?? rows.length,
      name: row.name,
      code: playerIdCodeFor(row.seatId),
      count: row.cityHexes.length,
      own: index === 0,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * The sentence pair about where the commander stands.
 *
 * Purpose: States the commander's place and any tie, without judging it.
 * When to use: The first paragraph of the standings.
 * Expected outcome: One line.
 * Exceptions: None.
 */
function placeParagraph(sides: readonly RankedSide[], ownPlace: number): string {
  const line = `City hexes are counted by the game. Your place: ${ownPlace} of ${sides.length}.`;
  const tied = sides.filter((side) => !side.own && side.place === ownPlace).length;
  if (tied === 0) return line;
  return `${line} You are tied with ${tied} other ${tied === 1 ? 'side' : 'sides'}.`;
}

/**
 * The sentences about how the match ends.
 *
 * Purpose: A match with a turn limit says when it ends and who would win now; any other match says it has no limit and how it ends.
 * When to use: The second paragraph of the standings.
 * Expected outcome: One line.
 * Exceptions: None.
 */
function endingParagraph(sides: readonly RankedSide[], args: CityHexStandingsArgs): string {
  const limit = args.victory?.rule === 'most_city_hexes_at_turn_limit' ? args.victory.turnLimit : null;
  if (typeof limit !== 'number') {
    return 'This match has no turn limit. It ends when one side is left, or when every side would be knocked out on the same turn.';
  }
  const timing = `This is turn ${args.turnNumber} of ${limit}. The match ends after turn ${limit}, and the side holding the most city hexes then wins.`;
  const leaders = sides.filter((side) => side.place === 1);
  const leader = leaders.length === 1 ? leaders[0] : undefined;
  if (!leader) {
    return `${timing} If the match ended now, no single side would win, because ${leaders.length} sides are tied for first place.`;
  }
  const winner = leader.own ? 'you' : `${leader.name} (${leader.code})`;
  return `${timing} If the match ended now, ${winner} would win.`;
}

/**
 * The standings body: a table of the sides and two short paragraphs.
 *
 * Purpose: Ranks the sides still in the match by city hexes held, with the rule the turn limit uses.
 * When to use: Under a `Standings` heading in the strategic orders prompt and the strategic diplomacy prompt.
 * Expected outcome: A table, a blank line, the commander's place, a blank line, and how the match ends. No heading. Facts only, with no advice.
 * Exceptions: Never throws for a status from `knockoutStatusForSeat`, whose seats all have codes.
 */
export function buildCityHexStandingsBody(args: CityHexStandingsArgs): string {
  logTrace('cityHexStandingsText buildCityHexStandingsBody', {
    seatId: args.status.own.seatId,
    enemyCount: args.status.enemies.length,
    turnNumber: args.turnNumber,
    victoryRule: args.victory?.rule ?? null,
  });
  const sides = rankSides(args.status);
  const table = [
    '| Place | Side | Code | City hexes |',
    '| --- | --- | --- | --- |',
    ...sides.map((side) => `| ${side.place} | ${side.own ? `${side.name} (you)` : side.name} | ${side.code} | ${side.count} |`),
  ].join('\n');
  const ownPlace = sides.find((side) => side.own)?.place ?? sides.length;
  return [table, placeParagraph(sides, ownPlace), endingParagraph(sides, args)].join('\n\n');
}
