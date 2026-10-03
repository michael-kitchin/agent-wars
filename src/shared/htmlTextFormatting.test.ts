import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeHtmlText } from './htmlTextFormatting';

test('escapeHtmlText encodes all five metacharacters', () => {
  assert.equal(escapeHtmlText(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
  assert.equal(escapeHtmlText("it's"), 'it&#39;s');
  assert.equal(escapeHtmlText('plain'), 'plain');
});
