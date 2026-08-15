/**
 * Contract tests for upper-right AI toast section assembly.
 * Run with: node dist/shared/aiStrategyToastContent.test.js
 */

import assert from 'node:assert/strict';
import {
  AI_STRATEGY_TOAST_MESSAGE_TITLE,
  AI_STRATEGY_TOAST_STRATEGY_TITLE,
  buildAiStrategyToastSections,
  hasAiStrategyToastContent,
} from './aiStrategyToastContent';

/**
 * Verifies both fields produce Message then Strategy.
 *
 * Purpose: Locks display order for the two-section toast.
 * When to use: After changing `buildAiStrategyToastSections`.
 * Expected outcome: Two sections with titles Message then Strategy.
 * Exceptions: None.
 */
function testBothFieldsMessageThenStrategy(): void {
  const sections = buildAiStrategyToastSections({
    message: 'You will not find safety in delay.',
    strategy: 'Close with observed enemies.',
  });
  assert.deepEqual(sections, [
    { title: AI_STRATEGY_TOAST_MESSAGE_TITLE, body: 'You will not find safety in delay.' },
    { title: AI_STRATEGY_TOAST_STRATEGY_TITLE, body: 'Close with observed enemies.' },
  ]);
  assert.equal(hasAiStrategyToastContent({ message: 'a', strategy: 'b' }), true);
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
  assert.deepEqual(buildAiStrategyToastSections({ message: 'Taunt only.', strategy: '' }), [
    { title: AI_STRATEGY_TOAST_MESSAGE_TITLE, body: 'Taunt only.' },
  ]);
  assert.deepEqual(buildAiStrategyToastSections({ message: null, strategy: 'Hold.' }), [
    { title: AI_STRATEGY_TOAST_STRATEGY_TITLE, body: 'Hold.' },
  ]);
  assert.deepEqual(buildAiStrategyToastSections({ message: '  ', strategy: '\n' }), []);
  assert.equal(hasAiStrategyToastContent({ message: '  ', strategy: undefined }), false);
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
  assert.equal(hasAiStrategyToastContent({ message: null, strategy: null }), false);
}

const tests = [
  { name: 'buildAiStrategyToastSections both fields Message then Strategy', fn: testBothFieldsMessageThenStrategy },
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
