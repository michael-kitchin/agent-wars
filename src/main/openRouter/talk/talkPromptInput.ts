/**
 * Reads the match into the inputs a talk prompt is built from.
 *
 * Purpose: The talk call and the orders prompt share one reading of threads, stances, and side labels.
 * When to use: Before `buildTalkSituationText`, and when the orders prompt needs the same threads.
 * Expected outcome: Plain inputs. Message text is not logged.
 * Exceptions: Propagates a SQLite error from the roster or the message tables.
 */

import { logTrace } from '../../logger';
import { gameDbOps } from '../../gameDb/dbConnection';
import { isFogOfWarEnabled } from '../../gameDb/fogState';
import { listSideMessageThread, listSideStances } from '../../gameDb/sideMessageStore';
import { readSeatRoster } from '../../gameDb/seatRosterStore';
import { getRecentTurnNotes } from '../../gameDb/turnNotesHistory';
import { buildRecentTurnNotesSection } from '../../briefing/recentTurnNotesSection';
import { readSideCombatRecords, type SideCombatRecordView } from '../../briefing/sideCombatRecordRead';
import { formatStanceConflict } from '../../briefing/sideCombatRecordText';
import { readTurnNumberOrFirst } from '../../gameDb/turnStateReads';
import { SECTION_TITLE_RECENT_TURN_NOTES } from '../promptSpec/sectionHeadings';
import { isSeatId, type AiSeatId, type SeatId } from '../../../shared/seatIds';
import { isSeatActive, sortSeatsByOrder, type SeatRecord } from '../../../shared/seatRoster';
import { SIDE_MESSAGE_THREAD_PROMPT_LINES } from '../../../shared/aiConsultationLimits';
import { sideMessageVisibleTo } from '../../../shared/sideMessages';
import { playerIdCodeFor } from '../../../shared/unitIds';
import type { TacticalBattleSnapshot } from '../../../shared/tacticalBattleTypes';
import type { TalkPromptInput, TalkPromptSide, TalkPromptThread } from './talkPrompt';

/**
 * The other owner in a battle, when that owner is a seat.
 *
 * Purpose: The situation text names who this commander is fighting.
 * When to use: A talk call inside a battle.
 * Expected outcome: The other seat, or null when the other owner is Neutral or missing.
 * Exceptions: None.
 */
function battleOpponentSeatId(seatId: AiSeatId, battle: TacticalBattleSnapshot): SeatId | null {
  const parties = [battle.leadPartyId, battle.opposingPartyId].filter((id): id is SeatId => typeof id === 'string' && isSeatId(id));
  return parties.find((id) => id !== seatId) ?? null;
}

/**
 * One roster row as a side in the talk table.
 *
 * Purpose: The label is the home region the orders prompt prints in its Side column.
 * When to use: Every roster seat.
 * Expected outcome: A `TalkPromptSide`. The commander's own stance and record cells stay empty. Another side's record is the one `records` holds for it, or null, followed by a conflict sentence when a cordial or friendly stance meets a recent attack by that side.
 * Exceptions: `playerIdCodeFor` throws when the id is not a seat. Callers pass roster ids.
 */
function sideFromRoster(
  seat: SeatRecord,
  ownSeatId: AiSeatId,
  stanceByTarget: ReadonlyMap<
    string,
    { stance: TalkPromptSide['stance']; reason: string; trust: number | null; threat: number | null }
  >,
  records: ReadonlyMap<string, SideCombatRecordView>,
  currentTurnNumber: number
): TalkPromptSide {
  const stance = stanceByTarget.get(seat.seatId);
  const own = seat.seatId === ownSeatId;
  const code = playerIdCodeFor(seat.seatId);
  const view = own ? undefined : records.get(seat.seatId);
  const conflict = view
    ? formatStanceConflict({ sideCode: code, stance: stance?.stance ?? null, latestTurnAttackedYou: view.latestTurnAttackedYou, currentTurnNumber })
    : null;
  return {
    code,
    label: seat.homeRegion,
    isOwn: own,
    outTurn: seat.outTurn,
    stance: own ? null : stance?.stance ?? null,
    stanceReason: own ? null : stance?.reason ?? null,
    trust: own ? null : stance?.trust ?? null,
    threat: own ? null : stance?.threat ?? null,
    record: view ? (conflict ? `${view.text} ${conflict}` : view.text) : null,
  };
}

/**
 * The message threads this commander may see.
 *
 * Purpose: The talk prompt and the orders prompt show the same history.
 * When to use: Before either prompt is built for this seat.
 * Expected outcome: Active other sides first, in seat order, then sides that have left and still have a visible line. Each line has passed `sideMessageVisibleTo`. A line is new when it is addressed to this seat and not yet seen.
 * Exceptions: Propagates a SQLite error.
 */
export function readSideMessageThreads(seatId: AiSeatId): TalkPromptThread[] {
  const roster = sortSeatsByOrder(readSeatRoster(gameDbOps)).filter((seat) => isSeatId(seat.seatId) && seat.seatId !== seatId);
  const fogOfWarEnabled = isFogOfWarEnabled(gameDbOps);
  const threads = roster.map((seat) => {
    const rows = listSideMessageThread(gameDbOps, seatId, seat.seatId, SIDE_MESSAGE_THREAD_PROMPT_LINES).filter((row) =>
      sideMessageVisibleTo({
        viewer: { kind: 'commander', seatId },
        fogOfWarEnabled,
        fromSeatId: row.fromSeatId,
        toSeatId: row.toSeatId,
      })
    );
    return {
      active: isSeatActive(seat),
      thread: {
        sideCode: playerIdCodeFor(seat.seatId),
        lines: rows.map((row) => ({
          turnNumber: row.step.turnNumber,
          fromOwnSide: row.fromSeatId === seatId,
          text: row.body,
          isNew: row.toSeatId === seatId && !row.seenByRecipient,
          messageId: row.messageId,
        })),
      } satisfies TalkPromptThread,
    };
  });
  const visible = [...threads.filter((row) => row.active), ...threads.filter((row) => !row.active && row.thread.lines.length > 0)];
  logTrace('talkPromptInput readSideMessageThreads', { seatId, threadCount: visible.length });
  return visible.map((row) => row.thread);
}

/**
 * Counts unread messages this commander's next prompt would show.
 *
 * Purpose: An older unread message stays unread, and it does not by itself request another orders consult, because the line limit keeps it out of the prompt.
 * When to use: The post-resolution decision, after the talk round has closed.
 * Expected outcome: The number of lines `readSideMessageThreads` marks new. Zero when every visible line has been seen.
 * Exceptions: Propagates a SQLite error from the message tables.
 */
export function countUnreadPromptMessages(seatId: AiSeatId): number {
  const count = readSideMessageThreads(seatId).reduce((sum, thread) => sum + thread.lines.filter((line) => line.isNew).length, 0);
  logTrace('talkPromptInput countUnreadPromptMessages', { seatId, count });
  return count;
}

/**
 * The sides table for this commander, including its own side.
 *
 * Purpose: The talk prompt and the orders prompt name sides the same way.
 * When to use: Before either prompt prints a side label or a stance.
 * Expected outcome: One row per roster seat. The label is the home region. A stance, with its trust and threat, is this commander's own stored report toward that side. A record is this commander's combat record with that side over the strategic window before the stored turn, which a battle shares with the world map.
 * Exceptions: Propagates a SQLite error. `playerIdCodeFor` throws when a roster id is not a seat.
 */
export function readTalkSides(seatId: AiSeatId): TalkPromptSide[] {
  const roster = sortSeatsByOrder(readSeatRoster(gameDbOps)).filter((seat) => isSeatId(seat.seatId));
  const stanceByTarget = new Map(listSideStances(gameDbOps, seatId).map((row) => [row.towardSeatId, { stance: row.stance, reason: row.reason, trust: row.trust, threat: row.threat }] as const));
  const currentTurnNumber = readTurnNumberOrFirst(gameDbOps.getOne);
  const records = readSideCombatRecords(seatId, currentTurnNumber);
  logTrace('talkPromptInput readTalkSides', { seatId, sideCount: roster.length, recordCount: records.size });
  return roster.map((seat) => sideFromRoster(seat, seatId, stanceByTarget, records, currentTurnNumber));
}

/**
 * Reads one talk prompt's inputs from the open match.
 *
 * Purpose: `requestTalk` does not assemble SQL itself. In a battle, only the two sides fighting talk to each other, so a beat does not flood the sides that are not in it.
 * When to use: Once per talk call, before the model is called.
 * Expected outcome: The prompt input, the seats a reply may name, and their side codes. On the world map those are the other active seats. In a battle they are the opposing seat only, or none when that owner is Neutral or has left the match.
 * Exceptions: Propagates a SQLite error.
 */
export function readTalkPromptInput(args: {
  readonly seatId: AiSeatId;
  readonly turnNumber: number;
  readonly battle: TacticalBattleSnapshot | null;
}): { readonly input: TalkPromptInput; readonly addressableSeatIds: SeatId[]; readonly sideCodes: string[] } {
  const roster = sortSeatsByOrder(readSeatRoster(gameDbOps)).filter((seat) => isSeatId(seat.seatId));
  const own = roster.find((seat) => seat.seatId === args.seatId);
  const sides = readTalkSides(args.seatId);
  const activeSeatIds = roster.filter((seat) => isSeatActive(seat)).map((seat) => seat.seatId);
  const opponentId = args.battle ? battleOpponentSeatId(args.seatId, args.battle) : null;
  const addressableSeatIds = activeSeatIds.filter((seatId) =>
    seatId !== args.seatId && (args.battle === null || seatId === opponentId)
  );
  const sideCodes = addressableSeatIds.map((seatId) => playerIdCodeFor(seatId));
  const scope = args.battle ? 'tactical' as const : 'strategic' as const;
  const battleId = args.battle?.battleId ?? '';
  const noteTurn = args.battle ? args.battle.tacticalTurnNumber : args.turnNumber;
  const notes = getRecentTurnNotes(gameDbOps, args.seatId, scope, battleId, noteTurn);
  const newest = notes.length > 0 ? notes[notes.length - 1] : undefined;
  const lastStrategy = newest?.strategyText?.trim() ? newest.strategyText : null;
  const recentTurnsSection = buildRecentTurnNotesSection({
    scope,
    battleId,
    currentTurnNumber: noteTurn,
    heading: SECTION_TITLE_RECENT_TURN_NOTES,
    seatId: args.seatId,
    tacticalEnclosingH3Index: args.battle?.enclosingStrategicH3Index,
  });
  const opponent = opponentId ? roster.find((seat) => seat.seatId === opponentId) : undefined;
  logTrace('talkPromptInput readTalkPromptInput', {
    seatId: args.seatId,
    turnNumber: args.turnNumber,
    activeSeatCount: activeSeatIds.length,
    addressableSeatCount: addressableSeatIds.length,
    sideCodeCount: sideCodes.length,
    inBattle: args.battle !== null,
  });
  return {
    input: {
      ownSideLabel: own?.homeRegion ?? 'your side',
      turnNumber: args.turnNumber,
      battle: args.battle
        ? {
          beatNumber: args.battle.tacticalTurnNumber,
          opponentLabel: opponent?.homeRegion ?? null,
          opponentCode: opponent && addressableSeatIds.includes(opponent.seatId) ? playerIdCodeFor(opponent.seatId) : null,
        }
        : null,
      sides,
      lastStrategy,
      recentTurnsSection,
      threads: readSideMessageThreads(args.seatId),
    },
    addressableSeatIds,
    sideCodes,
  };
}
