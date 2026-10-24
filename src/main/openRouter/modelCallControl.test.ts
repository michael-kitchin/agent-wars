import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  beginModelCall,
  cancelModelCalls,
  getLastModelCallCancelReason,
  getModelCallCancelEpoch,
  hasModelCallCancelSince,
} from './modelCallControl';

describe('modelCallControl', { concurrency: 1 }, () => {
  it('aborts only the theater that was asked for', () => {
    const epochAtStart = getModelCallCancelEpoch('opponent');
    const strategic = beginModelCall('strategic consult', 'strategic', 'opponent');
    const tactical = beginModelCall('tactical consult', 'tactical', 'opponent');
    const aborted = cancelModelCalls('battle_exit', 'tactical', 'all');
    assert.equal(aborted, 1);
    assert.equal(tactical.signal.aborted, true);
    assert.equal(strategic.signal.aborted, false);
    assert.equal(getLastModelCallCancelReason(), 'battle_exit');
    assert.equal(hasModelCallCancelSince(epochAtStart, 'opponent'), true);
    strategic.end();
    tactical.end();
    const again = cancelModelCalls('battle_exit', 'tactical', 'all');
    assert.equal(again, 0);
  });

  it('a local abort does not move the cancel epoch', () => {
    const epochAtStart = getModelCallCancelEpoch('opponent');
    const scope = beginModelCall('waiter', 'strategic', 'opponent');
    scope.abort();
    assert.equal(scope.signal.aborted, true);
    assert.equal(hasModelCallCancelSince(epochAtStart, 'opponent'), false);
    scope.end();
    scope.end();
  });

  it('cancelling one seat leaves another seat\'s call running', () => {
    const secondEpoch = getModelCallCancelEpoch('opponent2');
    const first = beginModelCall('first', 'strategic', 'opponent');
    const second = beginModelCall('second', 'strategic', 'opponent2');
    const aborted = cancelModelCalls('run_off', 'all', 'opponent');
    assert.equal(aborted, 1);
    assert.equal(first.signal.aborted, true);
    assert.equal(second.signal.aborted, false);
    assert.equal(hasModelCallCancelSince(secondEpoch, 'opponent2'), false);
    first.end();
    second.end();
  });
});
