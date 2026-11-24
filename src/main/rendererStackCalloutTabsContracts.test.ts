/**
 * Source contracts for the stack callout's Select and Transport tabs.
 *
 * Purpose: The tabs exist only while the Transport section does, keep the build popup's tab look and widths, and survive a rebuild of the unit rows.
 * When to use: After changes to `stackCalloutTabs.ts`, `stackCalloutSealift.ts`, `showStackCallout`, or `stackCalloutChrome.css`.
 * Expected outcome: Process exit 0.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { getFunctionSource } from './testSupport/rendererSourceAssertions';

/**
 * Reads a repository file as text.
 *
 * Purpose: The contracts check source and markup, not a running page.
 * When to use: Each test below.
 * Expected outcome: The file's text.
 * Exceptions: Throws when the file is missing.
 */
function readRepoFile(...parts: string[]): string {
  return fs.readFileSync(path.resolve(process.cwd(), ...parts), 'utf8');
}

test('every sealift render path adds or removes the tabs with the Transport section', () => {
  const source = readRepoFile('src', 'renderer', 'map', 'stackCalloutSealift.ts');
  const render = getFunctionSource(source, 'renderSealiftSection');
  const removals = render.split('removeSealiftSection(calloutEl);');
  assert.equal(removals.length - 1, 4, 'four paths remove the section');
  for (const after of removals.slice(1)) {
    assert.match(after, /^\s*(syncStackCalloutTabs\(calloutEl, false\);|calloutEl\.appendChild\(section\);\s*syncStackCalloutTabs\(calloutEl, true\);)/);
  }
});

test('a rebuilt unit list keeps the shown tab before the callout is placed', () => {
  const source = readRepoFile('src', 'renderer', 'map', 'stackCallout.ts');
  const show = getFunctionSource(source, 'showStackCallout');
  const keep = show.indexOf('keepStackCalloutTab(calloutEl);');
  assert.ok(keep > show.indexOf('listEl.appendChild(li);'), 'after the rows are built');
  assert.ok(keep < show.indexOf('placeOpenStackCallout();'), 'before the callout is placed');
});

test('the callout uses the build popup widths and tab styling', () => {
  const html = readRepoFile('static', 'index.html');
  assert.ok(html.indexOf('stackCalloutChrome.css') > html.indexOf('overlayChrome.css'), 'linked after overlayChrome.css');
  const css = readRepoFile('static', 'stackCalloutChrome.css');
  assert.match(css, /\.stack-callout \{[^}]*min-width: 200px;[^}]*max-width: 200px;/);
  assert.match(css, /\.stack-callout\.stack-callout-wide \{ max-width: 280px; \}/);
  assert.match(css, /\.stack-callout \[hidden\] \{ display: none !important; \}/);
  const overlay = readRepoFile('static', 'overlayChrome.css');
  assert.match(overlay, /\.build-popup\.build-popup-wide \{ max-width: 280px; \}/);
  assert.match(overlay, /\.build-popup-tab-bar,\s*\.stack-callout-tab-bar \{/);
  assert.match(overlay, /\.build-popup-tab-bar button\[aria-selected="true"\],\s*\.stack-callout-tab-bar button\[aria-selected="true"\] \{/);
});
