import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expandedConsoleTabState, nextConsoleTabState } from './consoleTabState';

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
  assert.deepEqual(expandedConsoleTabState('console-tab-opponent'), {
    activeTabId: 'console-tab-opponent',
    collapsed: false,
  });
  assert.deepEqual(expandedConsoleTabState('console-tab-orders'), {
    activeTabId: 'console-tab-orders',
    collapsed: false,
  });
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
