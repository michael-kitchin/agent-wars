import assert from 'node:assert/strict';
import test from 'node:test';
import type { HumanOrderGroupPreviewUnitResult } from '../shared/ipc/humanOrderPreviewTypes';
import { mergeOrderPreviewTerrainImpactsFromPreviews } from '../shared/humanMarchPreviewGroupAssembly';
import { TOOLTIP_SECTION_GAP_HTML } from '../shared/tooltipSectionGap';
import {
  collectStrategicMarchSlowTerrainLabels,
  collectTacticalMarchTerrainImpact,
  collectTacticalRangedSlowTerrainLabels,
  formatOrderPreviewImpactHtml,
  formatSlowerHoverTooltipMessage,
  resolveOrderSlowerTooltipHtml,
  pickStrategicMarchSlowTerrainDisplayTitle,
  pickTacticalMarchSlowTerrainDisplayTitle,
} from '../shared/orderPreviewSlowTerrainTooltip';
import {
  firstRingCellDistinctFrom,
  pairedTransportSidesForAdjacentHexes,
  tacticalRes4Cell,
} from './tacticalBattle/testSupport/tacticalRes4HexFixtures';
import type { TacticalBattleSnapshot } from '../shared/tacticalBattleTypes';

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

test('formatOrderPreviewImpactHtml blocked wins over slower and appends Using with section gap', () => {
  const html = formatOrderPreviewImpactHtml({
    blocked: ['Range'],
    slower: ['Forest'],
    roadRail: true,
  });
  assert.ok(html?.includes('<strong>Blocked:</strong>'));
  assert.ok(!html?.includes('Forest'));
  assert.ok(html?.includes(TOOLTIP_SECTION_GAP_HTML));
  assert.ok(html?.includes('<strong>Using:</strong> Road/Rail'));
});

test('formatOrderPreviewImpactHtml slower line and escapes values', () => {
  const html = formatOrderPreviewImpactHtml({ slower: ['Urban', 'a<b'] });
  assert.equal(html, '<strong>Slower:</strong> Urban, a&lt;b');
});

test('formatOrderPreviewImpactHtml Using-only when roadRail and no terrain line', () => {
  assert.equal(formatOrderPreviewImpactHtml({ roadRail: true }), '<strong>Using:</strong> Road/Rail');
});

test('formatOrderPreviewImpactHtml returns null when empty', () => {
  assert.equal(formatOrderPreviewImpactHtml({}), null);
});

test('resolveOrderSlowerTooltipHtml omits ranged and air even with march impact', () => {
  const marchImpact = { slower: ['Forest'], roadRail: false };
  const base = {
    hasBlockedMessage: false,
    validForAll: true,
    tacticalBattleActive: true,
    marchImpact,
  };
  assert.equal(resolveOrderSlowerTooltipHtml({ ...base, supportTargeting: 'ranged' }), null);
  assert.equal(resolveOrderSlowerTooltipHtml({ ...base, supportTargeting: 'air' }), null);
});

test('resolveOrderSlowerTooltipHtml omits strategic and blocked and empty impact', () => {
  const marchImpact = { slower: ['Forest'], roadRail: true };
  assert.equal(
    resolveOrderSlowerTooltipHtml({
      hasBlockedMessage: false,
      validForAll: true,
      tacticalBattleActive: false,
      marchImpact,
    }),
    null
  );
  assert.equal(
    resolveOrderSlowerTooltipHtml({
      hasBlockedMessage: true,
      validForAll: true,
      tacticalBattleActive: true,
      marchImpact,
    }),
    null
  );
  assert.equal(
    resolveOrderSlowerTooltipHtml({
      hasBlockedMessage: false,
      validForAll: true,
      tacticalBattleActive: true,
      marchImpact: { slower: [], roadRail: false },
    }),
    null
  );
  assert.equal(
    resolveOrderSlowerTooltipHtml({
      hasBlockedMessage: false,
      validForAll: false,
      tacticalBattleActive: true,
      marchImpact,
    }),
    null
  );
  assert.equal(
    resolveOrderSlowerTooltipHtml({
      hasBlockedMessage: false,
      validForAll: true,
      tacticalBattleActive: true,
      marchImpact: null,
    }),
    null
  );
});

test('resolveOrderSlowerTooltipHtml formats valid tactical march impact', () => {
  const html = resolveOrderSlowerTooltipHtml({
    hasBlockedMessage: false,
    validForAll: true,
    tacticalBattleActive: true,
    marchImpact: { slower: ['Forest'], roadRail: true },
  });
  assert.ok(html?.includes('<strong>Slower:</strong> <span class="terrain-swatch" data-terrain-kind="forest" aria-hidden="true"></span>Forest'));
  assert.ok(html?.includes('<strong>Using:</strong> Road/Rail'));
});

test('resolveOrderSlowerTooltipHtml formats road/rail-only tactical march impact', () => {
  assert.equal(
    resolveOrderSlowerTooltipHtml({
      hasBlockedMessage: false,
      validForAll: true,
      tacticalBattleActive: true,
      marchImpact: { slower: [], roadRail: true },
    }),
    '<strong>Using:</strong> Road/Rail'
  );
});

test('mergeOrderPreviewTerrainImpactsFromPreviews unions slower labels and ORs roadRail', () => {
  const rows: HumanOrderGroupPreviewUnitResult[] = [
    {
      unitId: 'u1',
      preview: {
        valid: true,
        showInvalidMarker: false,
        segments: [],
        orderPreviewTerrainImpact: { slower: ['Forest'], roadRail: true },
      },
    },
    {
      unitId: 'u2',
      preview: {
        valid: true,
        showInvalidMarker: false,
        segments: [],
        orderPreviewTerrainImpact: { slower: ['Urban'], roadRail: false },
      },
    },
  ];
  const merged = mergeOrderPreviewTerrainImpactsFromPreviews(rows);
  assert.deepEqual(merged?.slower, ['Urban', 'Forest']);
  assert.equal(merged?.roadRail, true);
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

test('collectStrategicMarchSlowTerrainLabels unions multiple slowing hex kinds along path', () => {
  const path = ['a', 'b', 'c'];
  const kind = new Map<string, string>([
    ['a', 'plains'],
    ['b', 'urban'],
    ['c', 'forest'],
  ]);
  const terrain = new Map<string, string>([
    ['a', 'land'],
    ['b', 'land'],
    ['c', 'land'],
  ]);
  const labels = collectStrategicMarchSlowTerrainLabels('armor', path, kind, terrain);
  assert.deepEqual(labels, ['Urban', 'Forest']);
});

test('collectStrategicMarchSlowTerrainLabels includes coastal when armor pays 2 MP to enter', () => {
  const path = ['a', 'b'];
  const kind = new Map<string, string>([
    ['a', 'plains'],
    ['b', 'coastal'],
  ]);
  const terrain = new Map<string, string>([
    ['a', 'land'],
    ['b', 'land'],
  ]);
  const labels = collectStrategicMarchSlowTerrainLabels('armor', path, kind, terrain);
  assert.deepEqual(labels, ['Coastal']);
  assert.deepEqual(collectStrategicMarchSlowTerrainLabels('infantry', path, kind, terrain), []);
});

test('collectTacticalMarchTerrainImpact lists coastal for armor when path enters a coastal res4', () => {
  const a = tacticalRes4Cell(59, 69);
  const b = firstRingCellDistinctFrom(a);
  const impact = collectTacticalMarchTerrainImpact({
    battle: {
      battleId: 'tb-coastal-armor',
      enclosingRes1H3Index: '8f283082dcb519f',
      res4ChildH3Indexes: [a, b],
      strategicTurnNumber: 1,
      tacticalTurnNumber: 1,
      strategicHexTerrain: 'land',
      strategicHexTerrainKind: 'plains',
      res4TerrainKindByH3: { [a]: 'plains', [b]: 'coastal' },
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
  assert.deepEqual(impact.slower, ['Coastal']);
  assert.equal(impact.roadRail, false);
});

test('pickStrategicMarchSlowTerrainDisplayTitle returns first path-order label when multiple apply', () => {
  const path = ['a', 'b', 'c'];
  const kind = new Map<string, string>([
    ['a', 'plains'],
    ['b', 'urban'],
    ['c', 'forest'],
  ]);
  const terrain = new Map<string, string>([
    ['a', 'land'],
    ['b', 'land'],
    ['c', 'land'],
  ]);
  assert.equal(pickStrategicMarchSlowTerrainDisplayTitle('armor', path, kind, terrain), 'Urban');
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
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'road');
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
      res4RoadSidesByH3: paired.res4RoadSidesByH3,
      res4RailSidesByH3: paired.res4RailSidesByH3,
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

test('collectTacticalMarchTerrainImpact keeps roadRail when anchor MP throttle already added slower (forest armor)', () => {
  const a = tacticalRes4Cell(58, 68);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'road');
  const impact = collectTacticalMarchTerrainImpact({
    battle: {
      battleId: 'tb-anchor-road',
      enclosingRes1H3Index: '8f283082dcb519f',
      res4ChildH3Indexes: [a, b],
      strategicTurnNumber: 1,
      tacticalTurnNumber: 1,
      strategicHexTerrain: 'land',
      strategicHexTerrainKind: 'plains',
      res4TerrainKindByH3: { [a]: 'forest', [b]: 'mountain' },
      res4RoadSidesByH3: paired.res4RoadSidesByH3,
      res4RailSidesByH3: paired.res4RailSidesByH3,
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
  assert.equal(impact.roadRail, true);
  assert.ok(impact.slower.includes('Forest'));
  const html = formatOrderPreviewImpactHtml({ slower: impact.slower, roadRail: impact.roadRail });
  assert.ok(html?.includes('<strong>Slower:</strong>'));
  assert.ok(html?.includes('<strong>Using:</strong> Road/Rail'));
});

test('collectTacticalMarchTerrainImpact sets roadRail without duplicating Road/Rail in slower list', () => {
  const a = tacticalRes4Cell(57, 67);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'road');
  const impact = collectTacticalMarchTerrainImpact({
    battle: {
      battleId: 'tb-slow2',
      enclosingRes1H3Index: '8f283082dcb519f',
      res4ChildH3Indexes: [a, b],
      strategicTurnNumber: 1,
      tacticalTurnNumber: 1,
      strategicHexTerrain: 'land',
      strategicHexTerrainKind: 'plains',
      res4TerrainKindByH3: { [a]: 'plains', [b]: 'mountain' },
      res4RoadSidesByH3: paired.res4RoadSidesByH3,
      res4RailSidesByH3: paired.res4RailSidesByH3,
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
  assert.equal(impact.roadRail, true);
  assert.deepEqual(impact.slower, []);
});

test('collectTacticalMarchTerrainImpact marks a mountain road when only the mountain has the road', () => {
  const a = tacticalRes4Cell(90, 100);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'road');
  delete paired.res4RoadSidesByH3[a];
  delete paired.res4RailSidesByH3[a];
  const impact = collectTacticalMarchTerrainImpact({
    battle: {
      battleId: 'tb-dest-road',
      enclosingRes1H3Index: '8f283082dcb519f',
      res4ChildH3Indexes: [a, b],
      strategicTurnNumber: 1,
      tacticalTurnNumber: 1,
      strategicHexTerrain: 'land',
      strategicHexTerrainKind: 'plains',
      res4TerrainKindByH3: { [a]: 'plains', [b]: 'mountain' },
      res4RoadSidesByH3: paired.res4RoadSidesByH3,
      res4RailSidesByH3: paired.res4RailSidesByH3,
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
  assert.equal(impact.roadRail, true);
  assert.deepEqual(impact.slower, []);
});

test('collectTacticalRangedSlowTerrainLabels preserves first-seen order across units', () => {
  const anchorA = tacticalRes4Cell(40, 50);
  const anchorB = tacticalRes4Cell(41, 51);
  const cells = [anchorA, anchorB];
  const battle = {
    battleId: 'r1',
    enclosingRes1H3Index: '8f283082dcb519f',
    res4ChildH3Indexes: cells,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [anchorA]: 'plains', [anchorB]: 'plains' },
    res4IsUrbanByH3: { [anchorA]: true, [anchorB]: false },
    res4IsRubbleByH3: { [anchorA]: false, [anchorB]: true },
    subUnits: [
      {
        id: 'u1',
        parentUnitId: 'p1',
        player: 'human',
        unitType: 'infantry',
        h3Index: anchorA,
        displayName: 'I1',
      },
      {
        id: 'u2',
        parentUnitId: 'p2',
        player: 'human',
        unitType: 'infantry',
        h3Index: anchorB,
        displayName: 'I2',
      },
    ],
  };
  const labels = collectTacticalRangedSlowTerrainLabels(battle as TacticalBattleSnapshot, ['u1', 'u2']);
  assert.deepEqual(labels, ['Urban', 'Rubble']);
});
