import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { modelCallCancelLogLine, parseModelCallCancelReason } from './modelCallCancelTypes';

describe('modelCallCancelTypes', () => {
  it('parses known reasons and treats anything else as teardown', () => {
    assert.equal(parseModelCallCancelReason('run_off'), 'run_off');
    assert.equal(parseModelCallCancelReason('model_changed'), 'model_changed');
    assert.equal(parseModelCallCancelReason('new_game'), 'new_game');
    assert.equal(parseModelCallCancelReason('load_game'), 'load_game');
    assert.equal(parseModelCallCancelReason('battle_exit'), 'battle_exit');
    assert.equal(parseModelCallCancelReason(undefined), 'teardown');
    assert.equal(parseModelCallCancelReason('nope'), 'teardown');
  });

  it('keeps the stop lines distinct', () => {
    assert.equal(modelCallCancelLogLine('run_off'), 'Opponent planning stopped: Stop was turned off.');
    assert.equal(modelCallCancelLogLine('model_changed'), 'Opponent planning stopped: the model changed.');
    assert.equal(modelCallCancelLogLine('new_game'), 'Opponent planning stopped for a new game.');
    assert.equal(modelCallCancelLogLine('load_game'), 'Opponent planning stopped to load a saved game.');
    assert.equal(modelCallCancelLogLine('battle_exit'), 'Opponent planning stopped: you left the battle.');
    assert.equal(modelCallCancelLogLine('teardown'), 'Opponent planning stopped.');
  });
});
