import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  collapseOpenConsoleTab,
  collapsedConsoleState,
  consoleTabIdForLiveMatchLaunch,
  consoleTabWhenOrdersDisabled,
  expandedConsoleTabState,
  nextConsoleTabState,
} from './consoleTabState';

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

test('consoleTabIdForLiveMatchLaunch opens Commanders only for a live match', () => {
  assert.equal(consoleTabIdForLiveMatchLaunch({ hexCount: 1, gameOver: false }), 'console-tab-commanders');
  assert.equal(consoleTabIdForLiveMatchLaunch(null), null);
  assert.equal(consoleTabIdForLiveMatchLaunch({ hexCount: 0, gameOver: false }), null);
  assert.equal(consoleTabIdForLiveMatchLaunch({ hexCount: 1, gameOver: true }), null);
});

test('collapseOpenConsoleTab hides the named tab and leaves every other state', () => {
  assert.deepEqual(collapseOpenConsoleTab({ activeTabId: 'console-tab-commanders', collapsed: false }, 'console-tab-commanders'), {
    activeTabId: 'console-tab-commanders',
    collapsed: true,
  });
  const orders = { activeTabId: 'console-tab-orders', collapsed: false };
  assert.equal(collapseOpenConsoleTab(orders, 'console-tab-commanders'), orders);
  const already = { activeTabId: 'console-tab-commanders', collapsed: true };
  assert.equal(collapseOpenConsoleTab(already, 'console-tab-commanders'), already);
});

test('collapsedConsoleState hides whichever tab is open', () => {
  assert.deepEqual(collapsedConsoleState({ activeTabId: 'console-tab-orders', collapsed: false }), {
    activeTabId: 'console-tab-orders',
    collapsed: true,
  });
  assert.deepEqual(collapsedConsoleState({ activeTabId: 'console-tab-commanders', collapsed: false }), {
    activeTabId: 'console-tab-commanders',
    collapsed: true,
  });
  const already = { activeTabId: 'console-tab-reports', collapsed: true };
  assert.equal(collapsedConsoleState(already), already);
});

test('consoleTabWhenOrdersDisabled keeps a collapsed console collapsed', () => {
  assert.deepEqual(consoleTabWhenOrdersDisabled({ activeTabId: 'console-tab-orders', collapsed: false }, true), {
    activeTabId: 'console-tab-commanders',
    collapsed: false,
  });
  assert.deepEqual(consoleTabWhenOrdersDisabled({ activeTabId: 'console-tab-orders', collapsed: true }, true), {
    activeTabId: 'console-tab-commanders',
    collapsed: true,
  });
  const reports = { activeTabId: 'console-tab-reports', collapsed: false };
  assert.equal(consoleTabWhenOrdersDisabled(reports, true), reports);
  const orders = { activeTabId: 'console-tab-orders', collapsed: false };
  assert.equal(consoleTabWhenOrdersDisabled(orders, false), orders);
  const commanders = { activeTabId: 'console-tab-commanders', collapsed: true };
  assert.equal(consoleTabWhenOrdersDisabled(commanders, true), commanders);
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
