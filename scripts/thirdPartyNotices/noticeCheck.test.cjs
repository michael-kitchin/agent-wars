const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { findNoticeGaps, missingVendoredLicenses } = require('./noticeCheck.cjs');

test('reports a missing copyright line under its heading', () => {
  const gaps = findNoticeGaps('# Third-party notices\n\n## dotenv\n\nBSD-2-Clause\n', [
    { heading: 'dotenv', snippets: ['Copyright (c) 2015, Scott Motte'] },
  ]);
  assert.deepEqual(gaps, [
    { heading: 'dotenv', snippet: 'Copyright (c) 2015, Scott Motte' },
  ]);
});

test('accepts a notice that contains every required snippet', () => {
  const gaps = findNoticeGaps(
    '## dotenv\n\nCopyright (c) 2015, Scott Motte\n',
    [{ heading: 'dotenv', snippets: ['Copyright (c) 2015, Scott Motte'] }],
  );
  assert.deepEqual(gaps, []);
});

test('reports vendored license files that are not on disk', () => {
  const missing = missingVendoredLicenses(path.join(__dirname, 'does-not-exist'));
  assert.deepEqual(missing, [
    'static/vendor/leaflet/LICENSE',
    'static/flags/subdivisions/LICENSE',
  ]);
});

test('does not treat a different heading as a match', () => {
  const gaps = findNoticeGaps('## h3-js\n\nh3\n', [
    { heading: 'h3', snippets: ['h3'] },
  ]);
  assert.deepEqual(gaps, [{ heading: 'h3', snippet: 'h3' }]);
});
