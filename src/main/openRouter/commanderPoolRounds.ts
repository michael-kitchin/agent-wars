/**
 * Opens one talk round for a wave of commanders.
 *
 * Purpose: The pool stays under its size limit. This file does not import the pool.
 * When to use: A strategic start, a tactical start, and a post-resolution wave.
 * Expected outcome: One round, or null when talk is off, no runner is installed, or the wave is empty.
 * Exceptions: None.
 */

import { logDebug, logTrace } from '../logger';
import { isEnvFlagEnabled } from '../envFlag';
import { getMatchGeneration } from '../matchGeneration';
import { stepForConsult } from '../recorder/matchRecordingEvents';
import type { AiSeatId } from '../../shared/seatIds';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { openTalkRound, type TalkRound, type TalkRunner } from './talk/talkRound';
import { persistTalkRound } from './talk/talkRoundPersistence';

/**
 * A test talk runner, when one is installed.
 *
 * Purpose: Tests replace the production runner without clearing it.
 * When to use: `activeTalkRunner`.
 * Expected outcome: Null in production.
 * Exceptions: None.
 */
let testTalkRunner: TalkRunner | null = null;

/**
 * The talk runner installed for a real match.
 *
 * Purpose: The consult installer sets this once.
 * When to use: `activeTalkRunner` when no test runner is installed.
 * Expected outcome: `runCommanderTalk` after the consult runner is installed.
 * Exceptions: None.
 */
let productionTalkRunner: TalkRunner | null = null;

/**
 * The talk runner the next round will call.
 *
 * Purpose: A test runner wins over the production runner.
 * When to use: `openCommanderTalkRoundAt`.
 * Expected outcome: The test runner, otherwise the production runner, otherwise null.
 * Exceptions: None.
 */
function activeTalkRunner(): TalkRunner | null {
  return testTalkRunner ?? productionTalkRunner;
}

/**
 * Whether this process runs the talk stage.
 *
 * Purpose: A match can be played without diplomacy, to compare cost.
 * When to use: Before opening a round.
 * Expected outcome: False when `AGENT_WARS_DISABLE_TALK` is `1`, `true`, `yes`, or `on`. True otherwise.
 * Exceptions: None.
 */
export function isTalkStageEnabled(): boolean {
  const enabled = !isEnvFlagEnabled('AGENT_WARS_DISABLE_TALK');
  logTrace('commanderPoolRounds isTalkStageEnabled', { enabled });
  return enabled;
}

/**
 * Installs the talk runner used by tests.
 *
 * Purpose: A test supplies a fake that does not call a model.
 * When to use: A pool test, and clear it with null afterward.
 * Expected outcome: Later rounds use this runner until it is cleared. `resetCommanderPool` does not clear it.
 * Exceptions: None.
 */
export function setCommanderTalkRunnerForTests(runner: TalkRunner | null): void {
  logDebug('commanderPoolRounds setCommanderTalkRunnerForTests', { installed: runner !== null });
  testTalkRunner = runner;
}

/**
 * Installs the talk runner used in a real match.
 *
 * Purpose: The consult installer wires the production talk call.
 * When to use: Next to `setProductionCommanderConsultRunner`.
 * Expected outcome: Rounds use this runner when no test runner is installed.
 * Exceptions: None.
 */
export function setProductionCommanderTalkRunner(runner: TalkRunner | null): void {
  logDebug('commanderPoolRounds setProductionCommanderTalkRunner', { installed: runner !== null });
  productionTalkRunner = runner;
}

/**
 * Opens the round for one wave from values the pool already has.
 *
 * Purpose: The pool reads the turn and the clock. This function does not.
 * When to use: `openCommanderTalkRound`.
 * Expected outcome: Null when talk is off, no runner is set, or `seatIds` is empty. Otherwise a round whose timeout and scheduler are the ones passed in, and whose persist checks the generation captured here.
 * Exceptions: None.
 */
export function openCommanderTalkRoundAt(args: {
  readonly seatIds: readonly AiSeatId[];
  readonly theater: 'strategic' | 'tactical';
  readonly battle: TacticalBattleSnapshot | null;
  readonly turnNumber: number;
  readonly talkRoundTimeoutMs: number;
  readonly schedule: (fn: () => void, delayMs: number) => { cancel: () => void };
}): TalkRound | null {
  const runner = activeTalkRunner();
  logDebug('commanderPoolRounds openCommanderTalkRoundAt', {
    seatCount: args.seatIds.length,
    turnNumber: args.turnNumber,
    enabled: isTalkStageEnabled(),
    hasRunner: runner !== null,
  });
  if (!isTalkStageEnabled() || runner === null || args.seatIds.length === 0) return null;
  const generationAtOpen = getMatchGeneration();
  return openTalkRound({
    seatIds: args.seatIds,
    theater: args.theater,
    battle: args.battle,
    turnNumber: args.turnNumber,
    step: stepForConsult(args.turnNumber, args.battle),
    runner,
    timeoutMs: args.talkRoundTimeoutMs,
    schedule: args.schedule,
    persist: (step, results) => persistTalkRound(step, results, generationAtOpen),
  });
}
