import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatCommanderButtonLabel, formatCommanderSummary } from './commanderSummary';

test('a commander summary names the model, the effort, and the doctrine', () => {
  assert.equal(
    formatCommanderSummary({ modelLabel: null, reasoningEffort: 'low', doctrineChoice: 'balanced' }),
    'No model · standing orders only'
  );
  assert.equal(
    formatCommanderSummary({
      modelLabel: 'Google: Gemini 3.5 Flash [$0.10/M]',
      reasoningEffort: 'minimal',
      doctrineChoice: 'aggressive',
    }),
    'Gemini 3.5 Flash · Minimal · Aggressive'
  );
  assert.equal(
    formatCommanderSummary({ modelLabel: 'Nova Lite 1.0', reasoningEffort: null, doctrineChoice: 'cautious' }),
    'Nova Lite 1.0 · Cautious'
  );
  assert.equal(
    formatCommanderSummary({ modelLabel: 'Claude Haiku 5.5', reasoningEffort: 'low', doctrineChoice: 'random' }),
    'Claude Haiku 5.5 · Low · Random'
  );
  assert.equal(
    formatCommanderSummary({
      modelLabel: 'Claude Haiku 5.5',
      reasoningEffort: 'low',
      doctrineChoice: 'random',
      revealedDoctrine: 'cautious',
    }),
    'Claude Haiku 5.5 · Low · Random, drew Cautious'
  );
});

test('the commander button invites a model choice when none is set', () => {
  assert.equal(
    formatCommanderButtonLabel({ modelLabel: null, reasoningEffort: 'low', doctrineChoice: 'balanced' }),
    'Select Model.'
  );
  assert.equal(
    formatCommanderButtonLabel({ modelLabel: 'Nova Lite 1.0', reasoningEffort: null, doctrineChoice: 'cautious' }),
    'Nova Lite 1.0 · Cautious'
  );
});
