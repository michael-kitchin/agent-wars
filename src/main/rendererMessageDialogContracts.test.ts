/**
 * The message dialog paints bullets without inserting message text as HTML.
 *
 * Purpose: A commander's text must not be able to change the page.
 * When to use: `npm run build:main`, then `node dist/main/rendererMessageDialogContracts.test.js`.
 * Expected outcome: The dialog orders bullets and builds flags, and the file has no innerHTML.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readRendererSource } from './testSupport/rendererSourceAssertions';

test('the message dialog orders bullets and does not use innerHTML', () => {
  const source = readRendererSource('openRouter', 'commanderMessageTabsUi.ts');
  const reports = readRendererSource('chrome', 'consoleReports.ts');
  assert.equal(source.includes('dispatchMessagesInSideOrder'), true);
  assert.equal(source.includes('createSideNumberFlag'), true);
  for (const file of [source, reports]) {
    assert.equal(file.includes('innerHTML'), false);
    assert.equal(file.includes('insertAdjacentHTML'), false);
    assert.equal(file.includes('outerHTML'), false);
  }
  assert.equal(reports.includes('messageText'), false);
});
