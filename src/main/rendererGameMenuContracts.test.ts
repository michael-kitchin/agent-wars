/**
 * The game menu's markup and item wiring stay in the files the screen loads.
 *
 * Purpose: How to play must be enabled and open the guide through main, without a URL from the renderer.
 * When to use: `npm run build:main`, then `node dist/main/rendererGameMenuContracts.test.js`.
 * Expected outcome: The markup and the menu module match the menu's contract.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { test } from 'node:test';
import { readRendererSource } from './testSupport/rendererSourceAssertions';

/**
 * Reads a file from the repo root.
 *
 * Purpose: The contract checks the page markup, which the renderer bundle does not contain.
 * When to use: Each test that reads HTML.
 * Expected outcome: The file's UTF-8 text.
 * Exceptions: Throws when the file cannot be read.
 */
function readRepoFile(...segments: string[]): string {
  return fs.readFileSync(path.resolve(process.cwd(), ...segments), 'utf8');
}

/**
 * Returns the opening tag that carries one id.
 *
 * Purpose: Attribute checks look at one element's tag, not the whole page.
 * When to use: Before asserting an attribute of a menu item.
 * Expected outcome: The text from the tag's `<` to its `>`.
 * Exceptions: Throws an assertion error when the id is missing.
 */
function openingTagWithId(html: string, id: string): string {
  const marker = html.indexOf(`id="${id}"`);
  assert.notEqual(marker, -1, id);
  const start = html.lastIndexOf('<', marker);
  return html.slice(start, html.indexOf('>', marker) + 1);
}

test('How to play is enabled and opens the guide through main', () => {
  const tag = openingTagWithId(readRepoFile('static', 'index.html'), 'game-menu-how-to-play-btn');
  assert.equal(/\sdisabled[\s>=]/.test(tag), false, tag);
  assert.equal(readRendererSource('chrome', 'gameMenu.ts').includes('openHowToPlay()'), true);
});

test('Playback and Metrics sit in their own section after Load game, each with its key', () => {
  const html = readRepoFile('static', 'index.html');
  const load = html.indexOf('id="game-menu-load-btn"');
  const tacticalBattles = html.indexOf('id="openrouter-tactical-battles"');
  for (const [id, key] of [
    ['game-menu-playback-btn', 'P'],
    ['game-menu-metrics-btn', 'C'],
  ] as const) {
    const at = html.indexOf(`id="${id}"`);
    assert.equal(load < at && at < tacticalBattles, true, id);
    assert.equal(openingTagWithId(html, id).includes(`aria-keyshortcuts="${key}"`), true, id);
  }
  const section = html.slice(load, tacticalBattles);
  assert.equal(section.split('class="game-menu-separator"').length - 1, 2);
});

test('the menu gets replay and the charts by injection, so it adds no import cycle', () => {
  const menu = readRendererSource('chrome', 'gameMenu.ts');
  assert.equal(menu.includes("from '../replay/replayMode'"), false);
  assert.equal(menu.includes("from '../charts/chartsDialog'"), false);
  assert.equal(menu.includes('actions.openReplay()'), true);
  assert.equal(menu.includes('actions.openCharts()'), true);
  const renderer = readRendererSource('renderer.ts');
  const call = renderer.slice(renderer.indexOf('wireGameMenu('));
  const args = call.slice(0, call.indexOf('\n'));
  assert.equal(args.includes('openReplay'), true, args);
  assert.equal(args.includes('openChartsDialog'), true, args);
});
