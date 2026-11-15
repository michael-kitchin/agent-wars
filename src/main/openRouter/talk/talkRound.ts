/**
 * One wave's talk stage: who has finished, and when the messages may be stored.
 *
 * Purpose: No orders call starts until every commander in the wave has talked, abstained, failed, or timed out.
 * When to use: The commander pool opens one round per wave and passes it on each consult request.
 * Expected outcome: The round closes once. A runner that throws does not reject `speak`.
 * Exceptions: None from `speak`. `persist` throwing is logged and treated as nothing stored.
 */

import { logDebug, logError, logTrace } from '../../logger';
import type { AiSeatId, SeatId } from '../../../shared/seatIds';
import type { StepKey } from '../../../shared/matchRecording';
import type { TacticalBattleSnapshot } from '../../../shared/tacticalBattleTypes';
import type { TalkSeatResult } from './requestTalk';

/**
 * The function that asks one commander to talk.
 *
 * Contract: Resolves with a `TalkSeatResult`. A throw is treated as a failed call.
 * When to use: `speak`.
 * Expected outcome: One result for that seat.
 * Exceptions: A throw is caught by the round.
 */
export type TalkRunner = (request: {
  readonly seatId: AiSeatId;
  readonly theater: 'strategic' | 'tactical';
  readonly battle: TacticalBattleSnapshot | null;
  readonly turnNumber: number;
  readonly signal: AbortSignal;
}) => Promise<TalkSeatResult>;

/**
 * One message a closed round stored.
 *
 * Contract: The row id and the text that was inserted.
 * When to use: `sentBy`, after `whenClosed`.
 * Expected outcome: One stored message.
 * Exceptions: None.
 */
export interface StoredTalkMessage {
  /**
   * The inserted `message_id`.
   *
   * Contract: The id `insertSentSideMessage` returned.
   * When to use: Recording and the dialog lookup.
   * Expected outcome: A positive id.
   * Exceptions: None.
   */
  readonly messageId: number;
  /**
   * The recipient.
   *
   * Contract: A seat that was still in the match when the round closed.
   * When to use: Finding the message addressed to the human player.
   * Expected outcome: The stored recipient.
   * Exceptions: None.
   */
  readonly toSeatId: SeatId;
  /**
   * The stored text.
   *
   * Contract: The cleaned body. Do not log it.
   * When to use: The dialog, when the recipient is the human player.
   * Expected outcome: The message text.
   * Exceptions: None.
   */
  readonly text: string;
}

/**
 * One wave's talk stage.
 *
 * Contract: `speak` and `abstain` settle a member at most once. `whenClosed` resolves when the round closes.
 * When to use: A consult path, before it asks for orders.
 * Expected outcome: Messages are stored once, when the round closes.
 * Exceptions: `speak` does not reject.
 */
export interface TalkRound {
  /**
   * The step this wave belongs to.
   *
   * Contract: The step passed to `openTalkRound`.
   * When to use: Persistence.
   * Expected outcome: The step stored on each message.
   * Exceptions: None.
   */
  readonly step: StepKey;
  /**
   * Asks one member to talk.
   *
   * Contract: A second call for a member that has already started resolves at once and does not call the runner. A seat that is not a member resolves at once.
   * When to use: A consult that the policy is about to ask for orders.
   * Expected outcome: The member is settled with the runner's result, or as failed when the runner throws or is missing. Resolves. Never rejects.
   * Exceptions: None.
   */
  speak(seatId: AiSeatId, signal: AbortSignal): Promise<void>;
  /**
   * Settles a member that is not talking.
   *
   * Contract: Does nothing when the member has already started or is not in the round.
   * When to use: A consult the policy is skipping, and the pool's safety net.
   * Expected outcome: The member is `silent` / `abstained`.
   * Exceptions: None.
   */
  abstain(seatId: AiSeatId): void;
  /**
   * Resolves when the round has closed.
   *
   * Contract: After the close, resolves at once.
   * When to use: After `speak` or `abstain`, before orders.
   * Expected outcome: Persistence has finished.
   * Exceptions: None.
   */
  whenClosed(): Promise<void>;
  /**
   * The usage cost recorded for one seat.
   *
   * Contract: Includes a result that arrived after the round closed.
   * When to use: Adding talk cost to the seat's consult cost.
   * Expected outcome: A dollar amount, or 0.
   * Exceptions: None.
   */
  costFor(seatId: AiSeatId): number;
  /**
   * The messages this seat stored when the round closed.
   *
   * Contract: Empty until the round closes, and empty when persistence stored nothing for the seat.
   * When to use: The dialog, after `whenClosed`.
   * Expected outcome: The stored messages.
   * Exceptions: None.
   */
  sentBy(seatId: AiSeatId): readonly StoredTalkMessage[];
}

/**
 * One member before the round closes.
 *
 * Contract: `started` is set by the first `speak` or `abstain`. `pending` stays true until that call settles.
 * When to use: Inside `openTalkRound`.
 * Expected outcome: One row of the member map.
 * Exceptions: None.
 */
interface TalkMember {
  started: boolean;
  pending: boolean;
  result: TalkSeatResult | null;
  lateCost: number;
}

/**
 * Opens one talk round for the seats launched together.
 *
 * Purpose: Their messages stay invisible until every member has settled or the timeout fires.
 * When to use: Once per wave, before any of those seats talks.
 * Expected outcome: A round. An empty seat list is already closed. Otherwise the timeout is scheduled.
 * Exceptions: None.
 */
export function openTalkRound(args: {
  readonly seatIds: readonly AiSeatId[];
  readonly theater: 'strategic' | 'tactical';
  readonly battle: TacticalBattleSnapshot | null;
  readonly turnNumber: number;
  readonly step: StepKey;
  readonly runner: TalkRunner | null;
  readonly timeoutMs: number;
  readonly schedule: (fn: () => void, delayMs: number) => { cancel: () => void };
  readonly persist: (step: StepKey, results: ReadonlyMap<AiSeatId, TalkSeatResult>) => ReadonlyMap<AiSeatId, readonly StoredTalkMessage[]>;
}): TalkRound {
  logDebug('talkRound openTalkRound', { seatCount: args.seatIds.length, turnNumber: args.turnNumber, timeoutMs: args.timeoutMs });
  const members = new Map<AiSeatId, TalkMember>();
  for (const seatId of args.seatIds) members.set(seatId, { started: false, pending: true, result: null, lateCost: 0 });
  let closed = false;
  let stored = new Map<AiSeatId, readonly StoredTalkMessage[]>();
  let resolveClosed: () => void = () => undefined;
  const closedPromise = new Promise<void>((resolve) => { resolveClosed = resolve; });
  let timer: { cancel: () => void } | null = null;

  /**
   * Closes the round once and stores what was said.
   *
   * Purpose: The timeout and the last settlement share one close.
   * When to use: When no member is pending, and when the timer fires.
   * Expected outcome: Pending members become timed out. `persist` runs once. `whenClosed` resolves.
   * Exceptions: A throw from `persist` is logged. The round still closes.
   */
  const closeRound = (): void => {
    if (closed) return;
    closed = true;
    timer?.cancel();
    for (const member of members.values()) {
      if (!member.pending) continue;
      member.pending = false;
      member.started = true;
      member.result = { kind: 'silent', reason: 'timed_out', costUsd: 0 };
    }
    const results = new Map<AiSeatId, TalkSeatResult>();
    for (const [seatId, member] of members) {
      if (member.result) results.set(seatId, member.result);
    }
    try {
      stored = new Map(args.persist(args.step, results));
    } catch (err) {
      logError('talkRound openTalkRound: persist failed', { seatCount: results.size, err });
      stored = new Map();
    }
    resolveClosed();
  };

  /**
   * Closes when every member has a result.
   *
   * Purpose: The timer is the other way the round closes.
   * When to use: After a member is settled.
   * Expected outcome: One close, or nothing while someone is still pending.
   * Exceptions: None.
   */
  const closeIfSettled = (): void => {
    if (closed) return;
    if ([...members.values()].every((member) => !member.pending)) closeRound();
  };

  /**
   * Records a result for a member that is still pending.
   *
   * Purpose: `speak` and `abstain` share the one-settlement rule.
   * When to use: When a runner returns, throws, or a seat abstains.
   * Expected outcome: The member is no longer pending. The round closes when it was the last one.
   * Exceptions: None.
   */
  const settle = (member: TalkMember, result: TalkSeatResult): void => {
    if (!member.pending || closed) return;
    member.pending = false;
    member.result = result;
    closeIfSettled();
  };

  if (args.seatIds.length === 0) {
    closeRound();
  } else {
    timer = args.schedule(() => closeRound(), args.timeoutMs);
  }

  return {
    step: args.step,
    async speak(seatId, signal) {
      const member = members.get(seatId);
      if (!member || member.started) return;
      member.started = true;
      if (!args.runner) {
        settle(member, { kind: 'silent', reason: 'failed', costUsd: 0 });
        return;
      }
      try {
        const result = await args.runner({
          seatId,
          theater: args.theater,
          battle: args.battle,
          turnNumber: args.turnNumber,
          signal,
        });
        if (closed || !member.pending) {
          member.lateCost += result.costUsd;
          return;
        }
        settle(member, result);
      } catch (err) {
        logError('talkRound speak: runner threw', { seatId, err });
        if (!closed) settle(member, { kind: 'silent', reason: 'failed', costUsd: 0 });
      }
    },
    abstain(seatId) {
      const member = members.get(seatId);
      if (!member || member.started) return;
      member.started = true;
      settle(member, { kind: 'silent', reason: 'abstained', costUsd: 0 });
    },
    whenClosed() {
      return closed ? Promise.resolve() : closedPromise;
    },
    costFor(seatId) {
      const member = members.get(seatId);
      if (!member) return 0;
      return (member.result?.costUsd ?? 0) + member.lateCost;
    },
    sentBy(seatId) {
      return stored.get(seatId) ?? [];
    },
  };
}

/**
 * Talks, then waits until the wave's round has closed.
 *
 * Purpose: Orders for this seat start only after every member has settled.
 * When to use: A consult the policy is about to ask for orders.
 * Expected outcome: Returns at once when there is no round. Otherwise resolves after the close. Does not reject.
 * Exceptions: None.
 */
export async function speakAndAwaitTalkRound(round: TalkRound | null | undefined, seatId: AiSeatId, signal: AbortSignal): Promise<void> {
  logTrace('talkRound speakAndAwaitTalkRound', { seatId, hasRound: round != null });
  if (!round) return;
  await round.speak(seatId, signal);
  await round.whenClosed();
}

/**
 * Abstains, then waits until the wave's round has closed.
 *
 * Purpose: A seat that is not talking still has to wait for the seats that are.
 * When to use: A consult the policy is skipping, including one that will still run because a message is unread.
 * Expected outcome: Returns at once when there is no round. Otherwise resolves after the close.
 * Exceptions: None.
 */
export async function abstainAndAwaitTalkRound(round: TalkRound | null | undefined, seatId: AiSeatId): Promise<void> {
  logTrace('talkRound abstainAndAwaitTalkRound', { seatId, hasRound: round != null });
  if (!round) return;
  round.abstain(seatId);
  await round.whenClosed();
}
