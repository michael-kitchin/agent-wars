import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { executeAbortableConsult } from './modelConsultAttempt';
import { cancelModelCalls, getModelCallCancelEpoch } from '../openRouter/modelCallControl';
import { registerLiveModelIdReader } from '../openRouter/liveModelId';

describe('executeAbortableConsult', { concurrency: 1 }, () => {
  it('retries once when the attempt was aborted because the model changed', async () => {
    registerLiveModelIdReader(() => 'live-model');
    let calls = 0;
    const result = await executeAbortableConsult({
      label: 'model change retry',
      theater: 'strategic',
      timeoutMs: 5_000,
      fallbackModelId: 'captured-model',
      errorLogMessage: 'model change retry failed',
      run: async ({ signal, modelId }) => {
        calls += 1;
        assert.equal(modelId, 'live-model');
        if (calls === 1) {
          cancelModelCalls('model_changed', 'all');
          assert.equal(signal.aborted, true);
          return 'first';
        }
        return 'second';
      },
    });
    assert.deepEqual(result, { ok: true, value: 'second' });
    assert.equal(calls, 2);
  });

  it('does not retry when the abort was Run off', async () => {
    let calls = 0;
    const result = await executeAbortableConsult({
      label: 'run off',
      theater: 'strategic',
      timeoutMs: 5_000,
      fallbackModelId: 'captured-model',
      errorLogMessage: 'run off failed',
      run: async () => {
        calls += 1;
        cancelModelCalls('run_off', 'all');
        return 'done';
      },
    });
    assert.deepEqual(result, { ok: true, value: 'done' });
    assert.equal(calls, 1);
  });

  it('does not retry a timeout that aborts the scope itself', async () => {
    cancelModelCalls('model_changed', 'all');
    const epochAtStart = getModelCallCancelEpoch();
    let calls = 0;
    const result = await executeAbortableConsult({
      label: 'timeout',
      theater: 'tactical',
      timeoutMs: 30,
      fallbackModelId: 'captured-model',
      errorLogMessage: 'timeout failed',
      run: () => {
        calls += 1;
        return new Promise<string>(() => undefined);
      },
    });
    assert.equal(getModelCallCancelEpoch(), epochAtStart);
    assert.equal(calls, 1);
    assert.equal(result.ok, false);
  });
});
