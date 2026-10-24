import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consoleTabIdForLiveMatchLaunch, expandedConsoleTabState, nextConsoleTabState } from './consoleTabState';

test('nextConsoleTabState switches tabs while expanded', () => {
  assert.deepEqual(nextConsoleTabState({ activeTabId: 'orders', collapsed: false }, 'opponent'), {
    activeTabId: 'opponent',
    collapsed: false,
  });
});

test('nextConsoleTabState collapses when the active tab is clicked', () => {
  assert.deepEqual(nextConsoleTabState({ activeTabId: 'orders', collapsed: false }, 'orders'), {
    activeTabId: 'orders',
    collapsed: true,
  });
});

test('expandedConsoleTabState shows the named tab expanded', () => {
  assert.deepEqual(expandedConsoleTabState('console-tab-commanders'), {
    activeTabId: 'console-tab-commanders',
    collapsed: false,
  });
  assert.deepEqual(expandedConsoleTabState('console-tab-orders'), {
    activeTabId: 'console-tab-orders',
    collapsed: false,
  });
});

test('consoleTabIdForLiveMatchLaunch opens Opponent only for a live match', () => {
  assert.equal(consoleTabIdForLiveMatchLaunch({ hexCount: 1, gameOver: false }), 'console-tab-commanders');
  assert.equal(consoleTabIdForLiveMatchLaunch(null), null);
  assert.equal(consoleTabIdForLiveMatchLaunch({ hexCount: 0, gameOver: false }), null);
  assert.equal(consoleTabIdForLiveMatchLaunch({ hexCount: 1, gameOver: true }), null);
});

test('nextConsoleTabState expands on the clicked tab while collapsed', () => {
  assert.deepEqual(nextConsoleTabState({ activeTabId: 'orders', collapsed: true }, 'opponent'), {
    activeTabId: 'opponent',
    collapsed: false,
  });
  assert.deepEqual(nextConsoleTabState({ activeTabId: 'orders', collapsed: true }, 'orders'), {
    activeTabId: 'orders',
    collapsed: false,
  });
});
