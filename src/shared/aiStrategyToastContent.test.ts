/**
 * Contract tests for upper-right AI toast section assembly.
 * Run with: node dist/shared/aiStrategyToastContent.test.js
 */

import assert from 'node:assert/strict';
import { SIDE_MESSAGES_TITLE } from './sideMessageView';
import {
  AI_STRATEGY_TOAST_STRATEGY_TITLE,
  buildAiStrategyToastSections,
  hasAiStrategyToastContent,
} from './aiStrategyToastContent';

/**
 * Verifies both fields produce Message then Strategy.
 *
 * Purpose: Locks display order for the two-section toast.
 * When to use: After changing `buildAiStrategyToastSections`.
 * Expected outcome: Two sections, Messages with two bullets, then Strategy.
 * Exceptions: None.
 */
function testBothFieldsMessageThenStrategy(): void {
  const sections = buildAiStrategyToastSections({
    messages: [
      { toSeatId: 'human', text: 'Hello' },
      { toSeatId: 'opponent2', text: 'Watch' },
    ],
    strategy: 'Close with observed enemies.',
  });
  assert.equal(sections.length, 2);
  assert.equal(sections[0]?.title, SIDE_MESSAGES_TITLE);
  assert.equal(sections[0]?.body, '');
  assert.equal(sections[0]?.bullets?.length, 2);
  assert.equal(sections[1]?.title, AI_STRATEGY_TOAST_STRATEGY_TITLE);
  assert.equal(hasAiStrategyToastContent({ messages: [{ toSeatId: 'human', text: 'a' }], strategy: 'b' }), true);
}

/**
 * Verifies a missing or whitespace field omits that section.
 *
 * Purpose: Empty sections stay hidden like the lower-right toast.
 * When to use: After changing empty-field handling.
 * Expected outcome: Message-only, strategy-only, and whitespace-only behave as specified.
 * Exceptions: None.
 */
function testOmitsEmptyAndWhitespaceSections(): void {
  assert.deepEqual(buildAiStrategyToastSections({ strategy: '' }), []);
  assert.deepEqual(buildAiStrategyToastSections({ messages: [], strategy: 'Hold.' }), [
    { title: AI_STRATEGY_TOAST_STRATEGY_TITLE, body: 'Hold.' },
  ]);
  assert.deepEqual(buildAiStrategyToastSections({ strategy: '\n' }), []);
  assert.equal(hasAiStrategyToastContent({ strategy: undefined }), false);
}

/**
 * Verifies both-empty input yields no sections.
 *
 * Purpose: Toast hide path when the model omitted both fields.
 * When to use: After changing `hasAiStrategyToastContent`.
 * Expected outcome: Empty array and false.
 * Exceptions: None.
 */
function testBothEmptyHidesToast(): void {
  assert.deepEqual(buildAiStrategyToastSections({}), []);
  assert.equal(hasAiStrategyToastContent({ strategy: null }), false);
}

const tests = [
  { name: 'buildAiStrategyToastSections lists Messages before Strategy', fn: testBothFieldsMessageThenStrategy },
  { name: 'buildAiStrategyToastSections omits empty and whitespace sections', fn: testOmitsEmptyAndWhitespaceSections },
  { name: 'hasAiStrategyToastContent false when both empty', fn: testBothEmptyHidesToast },
];

function run(): void {
  for (const t of tests) {
    try {
      t.fn();
      console.log(`OK ${t.name}`);
    } catch (err) {
      console.error(`FAIL ${t.name}`, err);
      process.exit(1);
    }
  }
}

run();
