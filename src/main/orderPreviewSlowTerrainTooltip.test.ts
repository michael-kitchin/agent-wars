import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatSlowerHoverTooltipMessage,
  pickStrategicMarchSlowTerrainDisplayTitle,
} from '../shared/orderPreviewSlowTerrainTooltip';

test('formatSlowerHoverTooltipMessage prefixes title-case terrain', () => {
  assert.equal(formatSlowerHoverTooltipMessage('Forest'), 'Slower: Forest');
  assert.equal(formatSlowerHoverTooltipMessage('Urban'), 'Slower: Urban');
});

test('pickStrategicMarchSlowTerrainDisplayTitle returns null for trivial path', () => {
  assert.equal(
    pickStrategicMarchSlowTerrainDisplayTitle('armor', ['only'], new Map([['only', 'plains']]), new Map([['only', 'land']])),
    null
  );
});

test('pickStrategicMarchSlowTerrainDisplayTitle detects forest along path for armor', () => {
  const path = ['a', 'b'];
  const kind = new Map<string, string>([
    ['a', 'plains'],
    ['b', 'forest'],
  ]);
  const terrain = new Map<string, string>([
    ['a', 'land'],
    ['b', 'land'],
  ]);
  assert.equal(pickStrategicMarchSlowTerrainDisplayTitle('armor', path, kind, terrain), 'Forest');
});

test('pickStrategicMarchSlowTerrainDisplayTitle returns Urban when kind names urban', () => {
  const path = ['x', 'y'];
  const kind = new Map<string, string>([
    ['x', 'plains'],
    ['y', 'urban'],
  ]);
  const terrain = new Map<string, string>([
    ['x', 'land'],
    ['y', 'land'],
  ]);
  assert.equal(pickStrategicMarchSlowTerrainDisplayTitle('infantry', path, kind, terrain), 'Urban');
});
