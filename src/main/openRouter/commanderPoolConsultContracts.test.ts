/**
 * The production consult still waits for talk, and still refuses orders after Stop, New, or Load.
 *
 * Purpose: The production runner needs an API key and a model to run end to end, and a test must not make a paid call.
 * When to use: `npm run build:main`, then `node dist/main/openRouter/commanderPoolConsultContracts.test.js`.
 * Expected outcome: The source order matches the runner the match screen installs.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { test } from 'node:test';

/**
 * Reads one main-process source file.
 *
 * Purpose: The contract checks TypeScript, not the compiled bundle.
 * When to use: Each assertion in this file.
 * Expected outcome: The file's UTF-8 text.
 * Exceptions: Throws when the file cannot be read.
 */
function readMain(relativePath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', '..', 'src', 'main', relativePath), 'utf8');
}

/**
 * Requires every orders call in one function to follow a talk wait.
 *
 * Purpose: A post-resolution path must not skip the talk round.
 * When to use: The two resolution functions.
 * Expected outcome: Nothing when the order holds. An assertion error otherwise.
 * Exceptions: None.
 */
function assertTalkBeforeOrders(part: string): void {
  const talkAt = ['speakAndAwaitTalkRound(', 'abstainAndAwaitTalkRound(']
    .map((name) => part.indexOf(name))
    .filter((index) => index >= 0);
  assert.ok(talkAt.length > 0);
  const firstTalk = Math.min(...talkAt);
  let searchFrom = 0;
  let ordersCount = 0;
  while (searchFrom < part.length) {
    const ordersAt = part.indexOf('requestOrders(', searchFrom);
    if (ordersAt < 0) break;
    assert.ok(firstTalk < ordersAt);
    ordersCount += 1;
    searchFrom = ordersAt + 1;
  }
  assert.ok(ordersCount > 0);
}

test('the production consult captures the generation before talk and stops before orders', () => {
  const source = readMain('openRouter/commanderPoolConsult.ts');
  const generationAt = source.indexOf('const generationAtStart = getMatchGeneration();');
  const talkAt = source.indexOf('await speakAndAwaitTalkRound(');
  const stoppedAt = source.indexOf('if (consultStoppedWhileTalking(');
  const ordersAt = source.indexOf('executeAbortableConsult(');
  assert.ok(generationAt >= 0 && generationAt < talkAt);
  assert.ok(talkAt < stoppedAt);
  assert.ok(stoppedAt < ordersAt);
});

test('post-resolution orders still receive the talk round', () => {
  const mapping = readMain('ipc/readyIpcResolutionMapping.ts');
  const passes = mapping.split('talkRound: request.talkRound').length - 1;
  assert.ok(passes >= 2);
  const resolution = readMain('openRouter/afterResolution.ts');
  const tacticalAt = resolution.indexOf('export async function afterTacticalBeatResolution');
  const strategicAt = resolution.indexOf('export async function afterResolution');
  assert.ok(strategicAt >= 0 && strategicAt < tacticalAt);
  assertTalkBeforeOrders(resolution.slice(strategicAt, tacticalAt));
  assertTalkBeforeOrders(resolution.slice(tacticalAt));
});
