import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseStartMatchAi } from './startMatchAiChoice';

test('chooseStartMatchAi turns planning on only when the box is checked and Run is enabled', () => {
  assert.deepEqual(chooseStartMatchAi({ autoStartChecked: true, runEnabled: true }), {
    runOn: true,
    openOpponentTab: false,
  });
});

test('chooseStartMatchAi opens the Opponent tab when the box is checked and Run is disabled', () => {
  assert.deepEqual(chooseStartMatchAi({ autoStartChecked: true, runEnabled: false }), {
    runOn: false,
    openOpponentTab: true,
  });
});

test('chooseStartMatchAi opens the Opponent tab when the box is unchecked and Run is enabled', () => {
  assert.deepEqual(chooseStartMatchAi({ autoStartChecked: false, runEnabled: true }), {
    runOn: false,
    openOpponentTab: true,
  });
});

test('chooseStartMatchAi opens the Opponent tab when the box is unchecked and Run is disabled', () => {
  assert.deepEqual(chooseStartMatchAi({ autoStartChecked: false, runEnabled: false }), {
    runOn: false,
    openOpponentTab: true,
  });
});
