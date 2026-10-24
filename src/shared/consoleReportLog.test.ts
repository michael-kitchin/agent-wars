import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSOLE_REPORT_KIND_LABELS, consoleReportVisible, formatConsoleReportTag } from './consoleReportLog';

test('formatConsoleReportTag names the beat in a battle and the turn otherwise', () => {
  assert.equal(formatConsoleReportTag(7, null), 'T7');
  assert.equal(formatConsoleReportTag(7, 2), 'B2');
  assert.equal(formatConsoleReportTag(null, null), '');
});

test('CONSOLE_REPORT_KIND_LABELS names each kind', () => {
  assert.deepEqual(CONSOLE_REPORT_KIND_LABELS, { turn: 'Turn report', message: 'Message', notice: 'Notice' });
});

test('consoleReportVisible filters messages and keeps turn reports and notices', () => {
  assert.equal(consoleReportVisible('message', 'opponent', ''), true);
  assert.equal(consoleReportVisible('message', 'opponent', 'opponent'), true);
  assert.equal(consoleReportVisible('message', 'opponent2', 'opponent'), false);
  assert.equal(consoleReportVisible('turn', 'opponent2', 'opponent'), true);
  assert.equal(consoleReportVisible('notice', null, 'opponent'), true);
});
