import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeHtmlText, formatGroupedSemicolonNamingLineHtml } from './htmlTextFormatting';

test('escapeHtmlText encodes all five metacharacters', () => {
  assert.equal(escapeHtmlText(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
  assert.equal(escapeHtmlText("it's"), 'it&#39;s');
  assert.equal(escapeHtmlText('plain'), 'plain');
});

test('formatGroupedSemicolonNamingLineHtml wraps headings in strong', () => {
  assert.equal(
    formatGroupedSemicolonNamingLineHtml('City: Paris; River: Seine'),
    '<strong>City:</strong> Paris; <strong>River:</strong> Seine'
  );
  assert.equal(formatGroupedSemicolonNamingLineHtml('no-colon'), 'no-colon');
  assert.equal(formatGroupedSemicolonNamingLineHtml('Heading:'), '<strong>Heading:</strong>');
});
