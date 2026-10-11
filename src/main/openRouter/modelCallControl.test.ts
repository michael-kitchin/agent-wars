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
    const epochAtStart = getModelCallCancelEpoch();
    const strategic = beginModelCall('strategic consult', 'strategic');
    const tactical = beginModelCall('tactical consult', 'tactical');
    const aborted = cancelModelCalls('battle_exit', 'tactical');
    assert.equal(aborted, 1);
    assert.equal(tactical.signal.aborted, true);
    assert.equal(strategic.signal.aborted, false);
    assert.equal(getLastModelCallCancelReason(), 'battle_exit');
    assert.equal(hasModelCallCancelSince(epochAtStart), true);
    strategic.end();
    tactical.end();
    const again = cancelModelCalls('battle_exit', 'tactical');
    assert.equal(again, 0);
  });

  it('a local abort does not move the cancel epoch', () => {
    const epochAtStart = getModelCallCancelEpoch();
    const scope = beginModelCall('waiter', 'strategic');
    scope.abort();
    assert.equal(scope.signal.aborted, true);
    assert.equal(hasModelCallCancelSince(epochAtStart), false);
    scope.end();
    scope.end();
  });
});
