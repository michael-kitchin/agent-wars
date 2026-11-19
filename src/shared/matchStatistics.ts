/**
 * The per-turn statistics every strategic turn records, and the helpers that read them.
 *
 * Purpose: The recorder, the charts channel, and a later charts screen share one definition of what a turn's numbers are.
 * When to use: Building, recording, reading, or drawing match statistics.
 * Expected outcome: Types, constants, and pure helpers. This module does not read the database or log.
 * Exceptions: None.
 */

import type { SideStance } from './sideMessages';
import type { SeatRecord } from './seatRoster';
import type { AgreementHistory } from './agreementHistoryTypes';

export { RELATIONSHIP_SCALE_MAX } from './sideMessages';

/**
 * The unit types counted for built units, in chart order.
 *
 * Purpose: A side's built units are grouped by these five types.
 * When to use: Building `SideStatistics.builtUnits` and labelling its keys.
 * Expected outcome: `infantry`, `armor`, `naval`, `air`, `missile`.
 * Exceptions: None.
 */
export const STATISTIC_UNIT_TYPES = ['infantry', 'armor', 'naval', 'air', 'missile'] as const;

/**
 * The unit types a side can raise as mercenaries, in chart order.
 *
 * Purpose: Missiles cannot be mercenaries, so the mercenary count has four types.
 * When to use: Building `SideStatistics.mercenaryUnits` and labelling its keys.
 * Expected outcome: `infantry`, `armor`, `naval`, `air`.
 * Exceptions: None.
 */
export const STATISTIC_MERCENARY_TYPES = ['infantry', 'armor', 'naval', 'air'] as const;

/**
 * How many strategic turns of captures the hexes-taken relationship metric covers.
 *
 * Purpose: A commander's hexes-taken figure is a count over a short recent window, not the whole match.
 * When to use: Summing recorded hexes taken for one pair of sides.
 * Expected outcome: 5.
 * Exceptions: None.
 */
export const HEXES_TAKEN_WINDOW_TURNS = 5;

/**
 * The seat fields the statistics need.
 *
 * Contract: A subset of `SeatRecord`, so a caller can pass roster rows directly.
 * When to use: Reading and recording a turn's statistics.
 * Expected outcome: The seat id, its side order, the turn it left the match, and its model cost so far.
 * Exceptions: None.
 */
export type SeatForStatistics = Pick<SeatRecord, 'seatId' | 'seatOrder' | 'outTurn' | 'costUsd'>;

/**
 * One side's numbers at one strategic turn.
 *
 * Contract: Every count is for the strategic game. Tactical sub-units are not counted.
 * When to use: A recorded `side_statistics` event and the charts.
 * Expected outcome: One entry per seat, in side order.
 * Exceptions: None.
 */
export interface SideStatistics {
  /**
   * The seat these numbers belong to.
   *
   * Contract: A seat id.
   * When to use: Matching an entry to a side.
   * Expected outcome: The seat id.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * Whether the seat has left the match.
   *
   * Contract: True when the seat has an out turn.
   * When to use: Ending a chart line.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  readonly out: boolean;
  /**
   * Units the side owns, keyed by `STATISTIC_UNIT_TYPES`, mercenaries excluded.
   *
   * Contract: Every key is present, with 0 when none.
   * When to use: The built units chart.
   * Expected outcome: A count per unit type.
   * Exceptions: None.
   */
  readonly builtUnits: Readonly<Record<string, number>>;
  /**
   * Mercenaries the side owns, keyed by `STATISTIC_MERCENARY_TYPES`.
   *
   * Contract: Every key is present, with 0 when none.
   * When to use: The mercenary units chart.
   * Expected outcome: A count per unit type.
   * Exceptions: None.
   */
  readonly mercenaryUnits: Readonly<Record<string, number>>;
  /**
   * Strategic hexes the side controls.
   *
   * Contract: A count of `res_s_control` rows held by the seat.
   * When to use: The hexes chart.
   * Expected outcome: A whole number.
   * Exceptions: None.
   */
  readonly hexes: number;
  /**
   * City cells in the controlled hexes, neutral-border hexes excluded.
   *
   * Contract: Production capacity, the figure the top bar shows as Production per turn.
   * When to use: The production chart.
   * Expected outcome: A whole number.
   * Exceptions: None.
   */
  readonly productionPerTurn: number;
  /**
   * Unspent production points in the controlled hexes.
   *
   * Contract: The sum of `stored_points` over hexes the seat controls.
   * When to use: The stored production points chart.
   * Expected outcome: A whole number.
   * Exceptions: None.
   */
  readonly storedPoints: number;
  /**
   * The seat's credits.
   *
   * Contract: The treasury balance.
   * When to use: The credits chart.
   * Expected outcome: A whole number.
   * Exceptions: None.
   */
  readonly treasury: number;
  /**
   * Credits owed for mercenaries each turn.
   *
   * Contract: The upkeep `readMercenaryFunds` reports.
   * When to use: The upkeep chart.
   * Expected outcome: A whole number.
   * Exceptions: None.
   */
  readonly upkeepPerTurn: number;
  /**
   * Units the side had last turn and no longer has.
   *
   * Contract: An ownership difference, so a deserting mercenary counts. Null when the previous turn is not known.
   * When to use: The units lost chart.
   * Expected outcome: A whole number, or null.
   * Exceptions: None.
   */
  readonly unitsLost: number | null;
  /**
   * Model cost so far, in US dollars.
   *
   * Contract: 0 for the human seat.
   * When to use: The model cost chart.
   * Expected outcome: A non-negative number.
   * Exceptions: None.
   */
  readonly costUsd: number;
}

/**
 * One commander's private view of one other side, as last reported.
 *
 * Contract: One row per stored stance. The scores are null when the commander never reported them.
 * When to use: The relationship charts.
 * Expected outcome: The stance, trust, and threat with the turn they were reported.
 * Exceptions: None.
 */
export interface RelationshipReport {
  /**
   * The commander reporting.
   *
   * Contract: An AI seat id.
   * When to use: Choosing a stack on the relationship graph.
   * Expected outcome: The seat id.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * The side the report is about.
   *
   * Contract: A seat id other than `seatId`.
   * When to use: Choosing a spoke on the relationship graph.
   * Expected outcome: The seat id.
   * Exceptions: None.
   */
  readonly towardSeatId: string;
  /**
   * The private stance.
   *
   * Contract: A `SideStance`.
   * When to use: The stance timeline.
   * Expected outcome: One of the five words.
   * Exceptions: None.
   */
  readonly stance: SideStance;
  /**
   * How far the commander believes the side, from 0 to `RELATIONSHIP_SCALE_MAX`.
   *
   * Contract: Null when never reported.
   * When to use: The trust graph.
   * Expected outcome: A whole number or null.
   * Exceptions: None.
   */
  readonly trust: number | null;
  /**
   * How dangerous the commander finds the side, from 0 to `RELATIONSHIP_SCALE_MAX`.
   *
   * Contract: Null when never reported.
   * When to use: The threat graph.
   * Expected outcome: A whole number or null.
   * Exceptions: None.
   */
  readonly threat: number | null;
  /**
   * The strategic turn the report was written.
   *
   * Contract: The stored `updated_turn`.
   * When to use: Showing how old a report is.
   * Expected outcome: A turn number.
   * Exceptions: None.
   */
  readonly reportedTurn: number;
}

/**
 * Hexes one side took from another during one turn.
 *
 * Contract: Only pairs with a count above 0 are listed.
 * When to use: The hexes-taken relationship metric.
 * Expected outcome: The capturing seat, the seat that lost the hexes, and the count.
 * Exceptions: None.
 */
export interface HexesTaken {
  /**
   * The seat that captured the hexes.
   *
   * Contract: A seat id.
   * When to use: Grouping by reporter.
   * Expected outcome: The seat id.
   * Exceptions: None.
   */
  readonly bySeatId: string;
  /**
   * The seat that controlled the hexes before.
   *
   * Contract: A seat id other than `bySeatId`.
   * When to use: Grouping by subject.
   * Expected outcome: The seat id.
   * Exceptions: None.
   */
  readonly fromSeatId: string;
  /**
   * How many hexes changed hands this turn.
   *
   * Contract: Above 0.
   * When to use: Summing over `HEXES_TAKEN_WINDOW_TURNS`.
   * Expected outcome: A whole number.
   * Exceptions: None.
   */
  readonly hexes: number;
}

/**
 * Everything recorded for one strategic turn.
 *
 * Contract: The payload of a `side_statistics` event.
 * When to use: Reading the recorded series.
 * Expected outcome: Every side's numbers, every stored relationship report, and the hexes taken.
 * Exceptions: None.
 */
export interface TurnStatistics {
  /**
   * The strategic turn.
   *
   * Contract: The turn the numbers describe.
   * When to use: Ordering the series.
   * Expected outcome: A turn number.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * One entry per seat.
   *
   * Contract: In side order.
   * When to use: Drawing a chart line per side.
   * Expected outcome: The side entries.
   * Exceptions: None.
   */
  readonly sides: readonly SideStatistics[];
  /**
   * Every stored stance row.
   *
   * Contract: All reporters, whatever fog of war is set to.
   * When to use: The relationship charts.
   * Expected outcome: The reports as stored at the turn boundary.
   * Exceptions: None.
   */
  readonly relationships: readonly RelationshipReport[];
  /**
   * The hexes taken this turn, or null when unknown.
   *
   * Contract: Null for the first turn after a load.
   * When to use: The hexes-taken relationship metric.
   * Expected outcome: A list, possibly empty, or null.
   * Exceptions: None.
   */
  readonly hexesTaken: readonly HexesTaken[] | null;
}

/**
 * One side as the charts label it.
 *
 * Contract: Names come from `sideDisplayName` in the main process.
 * When to use: Drawing a legend and choosing a line per side.
 * Expected outcome: The seat id, its side order, whether it is the human, and its name.
 * Exceptions: None.
 */
export interface MatchChartsSeat {
  /**
   * The seat id.
   *
   * Contract: Matches `SideStatistics.seatId`.
   * When to use: Joining a seat to its numbers.
   * Expected outcome: The seat id.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * The side order.
   *
   * Contract: The stored `seat_order`.
   * When to use: Ordering legends.
   * Expected outcome: A whole number.
   * Exceptions: None.
   */
  readonly seatOrder: number;
  /**
   * Whether the seat is the human player or a commander.
   *
   * Contract: `human` or `ai`.
   * When to use: Labelling a model-cost chart and choosing a reporter list.
   * Expected outcome: One of the two words.
   * Exceptions: None.
   */
  readonly kind: 'human' | 'ai';
  /**
   * The name shown on screen.
   *
   * Contract: The result of `sideDisplayName`.
   * When to use: A legend entry.
   * Expected outcome: Non-empty text.
   * Exceptions: None.
   */
  readonly name: string;
  /**
   * The last strategic turn the seat played, or null while it is still in the match.
   *
   * Contract: Optional. A missing value means the side is still in the match, as for a snapshot built before this field existed.
   * When to use: Deciding whether an agreement with this side had lapsed by a given turn.
   * Expected outcome: A turn number, or null or missing for a side still in the match.
   * Exceptions: None.
   */
  readonly outTurn?: number | null;
}

/**
 * Everything the charts channel returns.
 *
 * Contract: Applies no fog of war.
 * When to use: The result of `game:readMatchCharts`.
 * Expected outcome: The seats, the recorded turns, and the current turn.
 * Exceptions: None.
 */
export interface MatchChartsSnapshot {
  /**
   * Every seat in side order.
   *
   * Contract: Empty when no match is open.
   * When to use: Legends and line colors.
   * Expected outcome: The seat entries.
   * Exceptions: None.
   */
  readonly seats: readonly MatchChartsSeat[];
  /**
   * One entry per recorded strategic turn, in turn order.
   *
   * Contract: May be empty. A match that began in an earlier build has none before the turn it was loaded on.
   * When to use: Plotting.
   * Expected outcome: The recorded statistics.
   * Exceptions: None.
   */
  readonly turns: readonly TurnStatistics[];
  /**
   * The strategic turn the match is on now.
   *
   * Contract: 1 when no match is open.
   * When to use: Ending the horizontal axis.
   * Expected outcome: A turn number.
   * Exceptions: None.
   */
  readonly currentTurnNumber: number;
  /**
   * Every side agreement's recorded history and the attacks between sides.
   *
   * Contract: Optional. A missing value means no agreements, as for a match recorded before agreements existed.
   * When to use: Drawing the agreements strip.
   * Expected outcome: The history rebuilt from recorder events when the snapshot was read.
   * Exceptions: None.
   */
  readonly agreementHistory?: AgreementHistory;
}

/**
 * Adds up a count per unit type.
 *
 * Purpose: A side's total units is the sum of its per-type counts.
 * When to use: A chart that shows one number per side.
 * Expected outcome: The sum of every value.
 * Exceptions: None.
 */
export function totalUnits(counts: Readonly<Record<string, number>>): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

/**
 * Builds a zero count for every unit type.
 *
 * Purpose: Every type must be present in a statistics entry, even with no units.
 * When to use: Starting a `builtUnits` or `mercenaryUnits` record.
 * Expected outcome: A new record with each type set to 0.
 * Exceptions: None.
 */
export function emptyUnitCounts(types: readonly string[]): Record<string, number> {
  return Object.fromEntries(types.map((type) => [type, 0]));
}
