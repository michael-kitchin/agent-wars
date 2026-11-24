/**
 * The chat panel's markup, placement, and wiring stay in the files the screen loads.
 *
 * Purpose: A message must not be inserted as HTML, the zoom buttons stay gone, and the history refreshes from the named call sites.
 * When to use: `npm run build:main`, then `node dist/main/rendererChatPanelContracts.test.js`.
 * Expected outcome: The markup, the styles, and the renderer sources match the panel's contract.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { test } from 'node:test';
import { SIDE_MESSAGE_MAX_CHARS } from '../shared/sideMessages';
import { getFunctionSource, readRendererSource } from './testSupport/rendererSourceAssertions';

const CHAT_IDS = [
  'chat-panel',
  'chat-panel-history',
  'chat-panel-staged',
  'chat-panel-bar',
  'chat-panel-expand',
  'chat-panel-title',
  'chat-panel-recipient',
  'chat-panel-input',
  'chat-panel-send',
  'chat-panel-grip',
] as const;

/**
 * Reads a file from the repo root.
 *
 * Purpose: The contract checks static files the renderer bundle does not contain.
 * When to use: Each test that reads HTML or CSS.
 * Expected outcome: The file's UTF-8 text.
 * Exceptions: Throws when the file cannot be read.
 */
function readRepoFile(...segments: string[]): string {
  return fs.readFileSync(path.resolve(process.cwd(), ...segments), 'utf8');
}

test('the chat panel markup is in the map container once', () => {
  const html = readRepoFile('static', 'index.html');
  assert.equal(html.includes('chatChrome.css'), true);
  for (const id of CHAT_IDS) {
    const marker = `id="${id}"`;
    assert.equal(html.split(marker).length - 1, 1, marker);
  }
  assert.equal(html.includes(`maxlength="${SIDE_MESSAGE_MAX_CHARS}"`), true);
  const container = html.indexOf('id="canvas-container"');
  const map = html.indexOf('id="main-map"');
  const selection = html.indexOf('id="selection-panel"');
  const chat = html.indexOf('id="chat-panel"');
  const sidebar = html.indexOf('id="sidebar"');
  assert.ok(container >= 0 && map > container && selection > map && chat > selection && chat < sidebar);
});

test('the zoom buttons are gone and the panel hides with the overlay', () => {
  const map = readRendererSource('map', 'worldLeafletMap.ts');
  const shell = readRepoFile('static', 'shellChrome.css');
  const chatCss = readRepoFile('static', 'chatChrome.css');
  assert.equal(map.includes('control.zoom('), false);
  assert.equal(shell.includes('leaflet-control-zoom'), false);
  assert.equal(chatCss.includes('body:has(#game-over-overlay:not(.hidden):not(.replay-aside)) #chat-panel'), true);
});

test('the panel stages on Enter, paints text as text, and slides', () => {
  const panel = readRendererSource('chat', 'chatPanel.ts');
  const client = readRendererSource('chat', 'chatPanelClient.ts');
  assert.equal(panel.includes('startPanelHeightSlide'), true);
  assert.equal(panel.includes('layoutMapChrome'), true);
  assert.equal(panel.includes('isComposing'), true);
  assert.equal(panel.includes('textContent'), true);
  assert.equal(panel.includes('groupSideMessagesByTurn'), true);
  assert.equal(panel.includes('createMessagePartyFlag'), true);
  assert.equal(panel.includes('sideMessagePartyLabel'), false);
  assert.equal(panel.includes('innerHTML'), false);
  assert.equal(panel.includes('chatNamedSeatKey'), true);
  assert.equal(panel.includes('stagedMessagesInSeatOrder'), true);
  assert.equal(panel.includes('chatStagedEditTooltipText'), true);
  assert.equal(panel.includes("ids.join('\\n')"), false);
  assert.equal(panel.includes('stopPropagation'), false);
  assert.equal(client.includes('currentRendererMatchEpoch'), true);
  assert.equal(client.includes('commanderPoolClient'), false);
});

test('the history refreshes from the pool, Ready, and a tactical commit', () => {
  assert.equal(readRendererSource('openRouter', 'commanderPoolClient.ts').includes('refreshChatThread'), true);
  assert.equal(readRendererSource('gameplay', 'readyHandler.ts').includes('refreshChatThread'), true);
  assert.equal(readRendererSource('gameplay', 'readyTacticalCommit.ts').includes('refreshChatThread'), true);
});

test('a snapshot repaints and syncs the chat panel after the state is stored', () => {
  const source = readRendererSource('core', 'stateSnapshot.ts');
  const assigned = source.indexOf('S.gameState = nextState;');
  const repainted = source.indexOf('repaintChatThread()');
  const synced = source.indexOf('syncChatPanelVisibility()');
  assert.ok(assigned >= 0 && repainted > assigned && synced > assigned);
});

test('the map toast show and hide both sync the chat panel', () => {
  const source = readRendererSource('chrome', 'mapToasts.ts');
  for (const name of ['showMapToast', 'hideMapToast']) {
    const body = getFunctionSource(source, name);
    assert.equal(body.includes('syncChatPanelVisibility'), true, name);
  }
});

test('the grip sits in the panel, shows in both states, and a dragged width survives the layout', () => {
  const html = readRepoFile('static', 'index.html');
  const css = readRepoFile('static', 'chatChrome.css');
  const resize = readRendererSource('chat', 'chatPanelResize.ts');
  const panel = readRendererSource('chat', 'chatPanel.ts');
  const layout = readRendererSource('map', 'mapChromeLayout.ts');
  assert.equal(html.split('id="chat-panel-grip"').length - 1, 1);
  assert.ok(html.indexOf('id="chat-panel-grip"') > html.indexOf('id="chat-panel"') && html.indexOf('id="chat-panel-grip"') < html.indexOf('id="chat-panel-bar"'));
  assert.equal(css.includes('.chat-panel:not([data-state="expanded"]) .chat-panel-grip'), false, 'the grip is never hidden');
  assert.match(readRepoFile('static', 'shellChrome.css'), /\.minimap-panel \{[^}]*z-index: 6050;/, 'the minimap stays under the chat panel');
  assert.equal(css.includes('cursor: nwse-resize'), true);
  assert.equal(css.includes('.chat-panel[data-dragged-height="true"] .chat-panel-history'), true);
  assert.equal(resize.includes("state !== 'expanded' && state !== 'compact'"), true);
  assert.equal(resize.includes('dragStart.compact ? null : size.height'), true);
  assert.equal(resize.includes('dragStart.width - (event.clientX - dragStart.x)'), true);
  assert.equal(resize.includes('dragStart.height - (event.clientY - dragStart.y)'), true);
  assert.equal(resize.includes('clampChatPanelSize'), true);
  assert.equal(panel.includes('wireChatPanelResize()'), true);
  assert.match(panel, /applyDraggedChatHeight\(panel\);\s+renderChatPanel\(\);/, 'the dragged height is on before the history scrolls to its end');
  assert.equal(resize.includes("'lostpointercapture', endDrag"), true);
  assert.equal(css.includes('.chat-panel[data-dragged-height="true"] .chat-panel-staged'), true);
  assert.equal(getFunctionSource(panel, 'settleChat').includes('if (!expanded) clearChatPanelHeight(panel);'), true);
  assert.equal(getFunctionSource(panel, 'toggleChatPanel').includes('applyDraggedChatHeight(panel);'), true);
  assert.equal(getFunctionSource(layout, 'placeChatPanel').includes('chatPanelDraggedWidth() ?? place.width'), true);
});

test('the side list may take the field room down to 48 px, so a full nickname shows when closed', () => {
  const css = readRepoFile('static', 'chatChrome.css');
  assert.equal(css.includes('max-width: calc(100% - 120px);'), true);
  assert.equal(css.includes('min-width: 48px;'), true);
  assert.equal(css.includes('calc(100% - 152px)'), false);
  assert.match(css, /flex: 0 0 auto;\s+width: max-content;/, 'the list does not shrink');
});
