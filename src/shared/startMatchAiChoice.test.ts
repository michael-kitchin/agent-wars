import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseStartMatchAi } from './startMatchAiChoice';

test('chooseStartMatchAi turns planning on only when the box is checked and Run is enabled', () => {
  assert.deepEqual(chooseStartMatchAi({ autoStartChecked: true, runEnabled: true }), {
    runOn: true,
    openCommandersTab: false,
  });
});

test('chooseStartMatchAi opens the Commanders tab when the box is checked and Run is disabled', () => {
  assert.deepEqual(chooseStartMatchAi({ autoStartChecked: true, runEnabled: false }), {
    runOn: false,
    openCommandersTab: true,
  });
});

test('chooseStartMatchAi opens the Commanders tab when the box is unchecked and Run is enabled', () => {
  assert.deepEqual(chooseStartMatchAi({ autoStartChecked: false, runEnabled: true }), {
    runOn: false,
    openCommandersTab: true,
  });
});

test('chooseStartMatchAi opens the Commanders tab when the box is unchecked and Run is disabled', () => {
  assert.deepEqual(chooseStartMatchAi({ autoStartChecked: false, runEnabled: false }), {
    runOn: false,
    openCommandersTab: true,
  });
});
