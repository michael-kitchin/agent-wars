import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatSlowerHoverTooltipMessage,
  pickStrategicMarchSlowTerrainDisplayTitle,
  pickTacticalMarchSlowTerrainDisplayTitle,
} from '../shared/orderPreviewSlowTerrainTooltip';
import { firstRingCellDistinctFrom, tacticalRes4Cell } from './tacticalBattle/testSupport/tacticalRes4HexFixtures';
import { res4GridDiskNeighborsOrdered } from '../shared/tacticalRes4TransportLink';

test('formatSlowerHoverTooltipMessage prefixes title-case terrain', () => {
  assert.equal(formatSlowerHoverTooltipMessage('Forest'), 'Slower: Forest');
  assert.equal(formatSlowerHoverTooltipMessage('Urban'), 'Slower: Urban');
});

test('formatSlowerHoverTooltipMessage uses Using for Road/Rail (enables otherwise impassable steps)', () => {
  assert.equal(formatSlowerHoverTooltipMessage('Road/Rail'), 'Using: Road/Rail');
  assert.equal(formatSlowerHoverTooltipMessage('  Road/Rail  '), 'Using: Road/Rail');
  assert.equal(formatSlowerHoverTooltipMessage('road / rail'), 'Using: Road/Rail');
  assert.equal(formatSlowerHoverTooltipMessage('Slower: Road/Rail'), 'Using: Road/Rail');
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

test('pickTacticalMarchSlowTerrainDisplayTitle returns Road/Rail when a step uses transport over blocked terrain', () => {
  const a = tacticalRes4Cell(57, 67);
  const b = firstRingCellDistinctFrom(a);
  const ring = res4GridDiskNeighborsOrdered(a);
  const i = ring.indexOf(b);
  assert.ok(i >= 0);
  const n = ring.length;
  const roadSides = Array.from({ length: n }, (_, j) => j === i);
  const railSides = Array.from({ length: n }, () => false);
  const title = pickTacticalMarchSlowTerrainDisplayTitle({
    battle: {
      battleId: 'tb-slow',
      enclosingRes1H3Index: '8f283082dcb519f',
      res4ChildH3Indexes: [a, b],
      strategicTurnNumber: 1,
      tacticalTurnNumber: 1,
      strategicHexTerrain: 'land',
      strategicHexTerrainKind: 'plains',
      res4TerrainKindByH3: { [a]: 'plains', [b]: 'mountain' },
      res4RoadSidesByH3: { [a]: roadSides },
      res4RailSidesByH3: { [a]: railSides },
      subUnits: [
        {
          id: 'u1',
          parentUnitId: 'p1',
          player: 'human',
          unitType: 'armor',
          h3Index: a,
          displayName: 'A',
        },
      ],
    },
    subUnit: {
      id: 'u1',
      parentUnitId: 'p1',
      player: 'human',
      unitType: 'armor',
      h3Index: a,
      displayName: 'A',
    },
    moveType: 'armor',
    pathH3: [a, b],
  });
  assert.equal(title, 'Road/Rail');
});
