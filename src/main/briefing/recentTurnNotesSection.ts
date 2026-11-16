/**
 * Builds recent turn notes markdown for AI system prompts from persisted history.
 */

import { isValidCell } from 'h3-js';
import { playerHasAnyLoss, type LostUnit } from '../../shared/lossSummary';
import { parsePlayerLossSummaryJson } from '../../shared/lossSummaryJson';
import { AI_SEAT_IDS, type AiSeatId } from '../../shared/seatIds';
import { sortSeatsByOrder } from '../../shared/seatRoster';
import { getRecentTurnNotes, getSeatRoster, RECENT_TURN_NOTES_LIMIT, type TurnNoteRow, type TurnNotesScope } from '../gameDb';
import { logError, logTrace } from '../logger';
import { subHeading } from '../openRouter/promptSpec/sectionHeadings';
import type { CoordinateContext } from './map/coordinateContext';
import {
  ensureStrategicCoordinateRegistryInitialized,
  getHexCodeForContext,
  hasTacticalCoordinateRegistry,
  initTacticalCoordinateRegistry,
} from './map/hexCoordinates';
import {
  BATTLE_LOSS_LEGEND_SENTENCE,
  buildRecentTurnLossLines,
  RECENT_TURN_LOSS_GROUP_LINES_MAX,
  RECENT_TURN_LOSS_LEGEND,
} from './recentTurnLossLines';
import { readStrategicBattleLossesByTurn } from './strategicLossWindow';

/**
 * Arguments for assembling a recent turn notes prompt section.
 */
export interface BuildRecentTurnNotesSectionArgs {
  /**
   * Strategic or tactical scope for the query window.
   *
   * Contract: Must match rows written by consultation and resolution capture.
   * When to use: Strategic briefing and tactical operational map prompts.
   * Expected outcome: Only rows for this scope and battle id are read.
   * Exceptions: None.
   */
  scope: TurnNotesScope;
  /**
   * Tactical battle id; empty string for strategic prompts.
   *
   * Contract: Matches `turn_notes_history.battle_id`.
   * When to use: Tactical turn notes; omit battle id only for strategic scope.
   * Expected outcome: Isolates tactical history per battle.
   * Exceptions: None.
   */
  battleId: string;
  /**
   * Current planning turn or beat number (notes strictly before this value are included).
   *
   * Contract: Strategic `state.turnNumber` or `tacticalBattle.tacticalTurnNumber`.
   * When to use: At prompt assembly time before the turn being planned resolves.
   * Expected outcome: First turn yields empty section (no prior rows).
   * Exceptions: None.
   */
  currentTurnNumber: number;
  /**
   * Markdown heading for the section (e.g. `Recent Turn Notes`).
   *
   * Contract: H2 title without leading `##`; added by this builder.
   * When to use: Strategic and tactical prompt variants (both use `Recent Turn Notes`).
   * Expected outcome: Rendered as `## {heading}` when section is non-empty.
   * Exceptions: None.
   */
  heading: string;
  /**
   * Commander whose notes are read.
   *
   * Contract: An AI seat id. Omitted callers still read the first AI seat.
   * When to use: Briefings for a seat other than the first AI seat.
   * Expected outcome: Only that seat's rows are included.
   * Exceptions: None.
   */
  seatId?: AiSeatId;
  /**
   * Strategic hex that encloses the battle, for tactical callers.
   *
   * Contract: `TacticalBattleSnapshot.enclosingStrategicH3Index`. Strategic callers omit it.
   * When to use: Tactical callers that may run before an orders consultation has built the battle's hex codes, such as the talk stage.
   * Expected outcome: The battle's hex codes are built once, so loss lines can print them. Without it, a tactical loss line prints no hex when no registry exists.
   * Exceptions: None.
   */
  tacticalEnclosingH3Index?: string;
}

/**
 * Formats note text for prompt bullets, using `(none)` when empty.
 *
 * Purpose: Keeps recent-turn notes readable when the AI omitted strategy or message.
 * When to use: Inside per-turn block formatting.
 * Expected outcome: Trimmed text or the literal `(none)`.
 * Exceptions: None.
 */
function noteDisplayText(raw: string | null | undefined): string {
  const trimmed = raw?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : '(none)';
}

/**
 * Returns whether a persisted row should appear in the recent-turn prompt section.
 *
 * Purpose: Suppresses turns with no strategy and no losses on either side.
 * When to use: After loading rows from `getRecentTurnNotes`.
 * Expected outcome: False when the strategy and both loss summaries are empty; true when any of those has content.
 * Exceptions: None.
 */
function rowHasPromptContent(row: TurnNoteRow): boolean {
  const strategy = row.strategyText?.trim() ?? '';
  const human = parsePlayerLossSummaryJson(row.humanLossJson);
  const ai = parsePlayerLossSummaryJson(row.aiLossJson);
  return strategy.length > 0 || playerHasAnyLoss(human) || playerHasAnyLoss(ai);
}

/**
 * Everything one turn block needs besides its stored row.
 *
 * Purpose: Keeps `formatTurnBlock` under the argument limit.
 * When to use: Built once per section by `buildRecentTurnNotesSection`.
 * Expected outcome: The same seat, seat order, and hex resolver for every block, and a cap that differs by turn.
 * Exceptions: None.
 */
interface TurnBlockContext {
  /**
   * Seat reading the notes.
   *
   * Contract: An AI seat id.
   * When to use: Naming that seat `you` in loss lines.
   * Expected outcome: The seat whose rows were read.
   * Exceptions: None.
   */
  readonly ownSeatId: AiSeatId;
  /**
   * Every roster seat id in seat order.
   *
   * Contract: May be empty when no roster is stored.
   * When to use: Ranking sides in loss lines.
   * Expected outcome: Roster order.
   * Exceptions: None.
   */
  readonly seatOrder: readonly string[];
  /**
   * Turns an H3 index into the hex code the map section prints.
   *
   * Contract: Returns undefined when no code exists. Never throws.
   * When to use: Loss lines.
   * Expected outcome: A code, or undefined so the line prints without a hex.
   * Exceptions: None.
   */
  readonly hexCodeFor: (h3Index: string) => string | undefined;
  /**
   * Most loss groups this block lists, or null for all.
   *
   * Contract: Null for the newest block.
   * When to use: Passed to `buildRecentTurnLossLines`.
   * Expected outcome: Older blocks are capped.
   * Exceptions: None.
   */
  readonly maxGroupLines: number | null;
}

/**
 * One formatted turn block.
 *
 * Purpose: The section prints its legend only when some block has a loss line.
 * When to use: Returned by `formatTurnBlock`.
 * Expected outcome: The block text and whether it holds loss lines.
 * Exceptions: None.
 */
interface FormattedTurnBlock {
  /**
   * Block text starting with `Turn N:`.
   *
   * Contract: Non-empty.
   * When to use: Joined into the section.
   * Expected outcome: A strategy bullet, then loss lines.
   * Exceptions: None.
   */
  readonly text: string;
  /**
   * Whether the block has at least one loss line.
   *
   * Contract: True when `buildRecentTurnLossLines` returned lines.
   * When to use: Deciding whether to print the legend.
   * Expected outcome: False for a block with only a strategy.
   * Exceptions: None.
   */
  readonly hasLossLines: boolean;
  /**
   * Whether the block prints at least one Battle line.
   *
   * Contract: True when the turn had battle losses.
   * When to use: Adding the Battle sentence to the legend.
   * Expected outcome: False for a tactical scope.
   * Exceptions: None.
   */
  readonly hasBattleLines: boolean;
}

/**
 * Builds a function that turns an H3 index into a hex code, building the code tables on first use.
 *
 * Purpose: A turn with no stored hex must not build a registry, and a registry failure must not fail the prompt.
 * When to use: `buildRecentTurnNotesSection`, once per section.
 * Expected outcome: A function that returns the hex code for the scope's map, or undefined when none exists, setup failed, or the index is not an H3 cell.
 * Exceptions: None. A setup or lookup failure is logged and that call returns undefined.
 */
function lossHexCodeResolver(args: BuildRecentTurnNotesSectionArgs): (h3Index: string) => string | undefined {
  let ready: boolean | null = null;
  const context: CoordinateContext = args.scope === 'tactical'
    ? { mode: 'tactical', battleId: args.battleId }
    : { mode: 'strategic' };
  const prepare = (): boolean => {
    try {
      if (args.scope === 'strategic') {
        ensureStrategicCoordinateRegistryInitialized();
      } else if (args.tacticalEnclosingH3Index && !hasTacticalCoordinateRegistry(args.battleId)) {
        initTacticalCoordinateRegistry(args.battleId, args.tacticalEnclosingH3Index);
      }
      return true;
    } catch (err) {
      logError('recentTurnNotesSection hex code registry failed', { scope: args.scope, battleId: args.battleId, err });
      return false;
    }
  };
  return (h3Index) => {
    if (ready === null) ready = prepare();
    if (!ready) return undefined;
    if (!isValidCell(h3Index)) {
      logError('recentTurnNotesSection loss hex is not a cell', { scope: args.scope, battleId: args.battleId, h3Index });
      return undefined;
    }
    try {
      return getHexCodeForContext(h3Index, context);
    } catch (err) {
      logError('recentTurnNotesSection hex code lookup failed', { scope: args.scope, battleId: args.battleId, h3Index, err });
      return undefined;
    }
  };
}

/**
 * Formats one turn block with the strategy and the attributed loss lines.
 *
 * Purpose: Emits the per-entry shape inside Recent Turn Notes sections for both strategic and tactical scopes. A stored message from an older save is not printed. Units a tactical battle destroyed that turn print under the cause Battle.
 * When to use: For each qualifying row returned from the DB query, with that turn's battle losses (empty for a tactical scope).
 * Expected outcome: Multiline block starting with `Turn N:`, then the strategy bullet, then the loss lines.
 * Exceptions: None.
 */
function formatTurnBlock(row: TurnNoteRow, context: TurnBlockContext, battleLosses: readonly LostUnit[]): FormattedTurnBlock {
  const lines: string[] = [`Turn ${row.turnNumber}:`, `- Strategy: ${noteDisplayText(row.strategyText)}`];
  const lossLines = buildRecentTurnLossLines({
    ownSeatId: context.ownSeatId,
    // The stored columns are named from the human's point of view: `humanLossJson` holds every other owner's losses.
    ownLosses: parsePlayerLossSummaryJson(row.aiLossJson),
    otherLosses: parsePlayerLossSummaryJson(row.humanLossJson),
    seatOrder: context.seatOrder,
    hexCodeFor: context.hexCodeFor,
    maxGroupLines: context.maxGroupLines,
    battleLosses,
  });
  lines.push(...lossLines);
  return { text: lines.join('\n'), hasLossLines: lossLines.length > 0, hasBattleLines: battleLosses.length > 0 };
}

/**
 * Builds the recent turn notes markdown block for AI prompts.
 *
 * Purpose: Replaces the legacy losses-since-consultation table with rolling ten-entry history, each loss naming who was responsible.
 * When to use: Strategic `formatBriefing`, the tactical briefing, and the talk stage (all use `Turn N:` labels).
 * Expected outcome: Empty string when no qualifying prior turns; otherwise `## heading`, the loss legend when any block has a loss line, and per-turn bullets. The newest block lists every loss group and older blocks are capped. A strategic window also prints the units tactical battles destroyed, under the cause Battle, and adds the Battle sentence to the legend; a turn with only battle losses still prints.
 * Exceptions: None.
 */
export function buildRecentTurnNotesSection(args: BuildRecentTurnNotesSectionArgs): string {
  logTrace('recentTurnNotesSection buildRecentTurnNotesSection', {
    scope: args.scope,
    battleId: args.battleId,
    currentTurnNumber: args.currentTurnNumber,
  });
  const ownSeatId = args.seatId ?? AI_SEAT_IDS[0];
  const windowRows = getRecentTurnNotes(
    ownSeatId,
    args.scope,
    args.battleId,
    args.currentTurnNumber,
    RECENT_TURN_NOTES_LIMIT
  );
  // Units a tactical battle destroyed are stored apart from the turn's own row, and only a strategic window holds them.
  const battleByTurn =
    args.scope === 'strategic' ? readStrategicBattleLossesByTurn(ownSeatId, windowRows) : new Map<number, readonly LostUnit[]>();
  const rows = windowRows.filter((row) => rowHasPromptContent(row) || battleByTurn.has(row.turnNumber));
  if (rows.length === 0) return '';
  const seatOrder = sortSeatsByOrder(getSeatRoster()).map((seat) => seat.seatId);
  const hexCodeFor = lossHexCodeResolver(args);
  const blocks = rows.map((row, index) =>
    formatTurnBlock(
      row,
      {
        ownSeatId,
        seatOrder,
        hexCodeFor,
        maxGroupLines: index === rows.length - 1 ? null : RECENT_TURN_LOSS_GROUP_LINES_MAX,
      },
      battleByTurn.get(row.turnNumber) ?? []
    )
  );
  const legendText = blocks.some((block) => block.hasBattleLines)
    ? `${RECENT_TURN_LOSS_LEGEND} ${BATTLE_LOSS_LEGEND_SENTENCE}`
    : RECENT_TURN_LOSS_LEGEND;
  const legend = blocks.some((block) => block.hasLossLines) ? `${legendText}\n\n` : '';
  return `${subHeading(args.heading)}\n\n${legend}${blocks.map((block) => block.text).join('\n\n')}`;
}
