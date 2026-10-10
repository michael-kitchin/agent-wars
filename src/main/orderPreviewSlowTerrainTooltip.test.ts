import assert from 'node:assert/strict';
import test from 'node:test';
import type { HumanOrderGroupPreviewUnitResult } from '../shared/ipc/humanOrderPreviewTypes';
import { mergeOrderPreviewTerrainImpactsFromPreviews } from '../shared/humanMarchPreviewGroupAssembly';
import { TOOLTIP_SECTION_GAP_HTML } from '../shared/tooltipSectionGap';
import {
  collectTacticalMarchTerrainImpact,
  collectTacticalRangedSlowTerrainLabels,
  formatOrderPreviewImpactHtml,
  formatSlowerHoverTooltipMessage,
  resolveOrderSlowerTooltipHtml,
  pickTacticalMarchSlowTerrainDisplayTitle,
} from '../shared/orderPreviewSlowTerrainTooltip';
import { tacticalGridDiskNeighborsOrdered } from '../shared/tacticalTransportLink';
import {
  firstRingCellDistinctFrom,
  pairedTransportSidesForAdjacentHexes,
  tacticalCell,
} from './tacticalBattle/testSupport/tacticalHexFixtures';
import type { TacticalBattleSnapshot } from '../shared/tacticalBattleTypes';
import type { UnitOrigin } from '../shared/unitOriginTypes';

const roadMark = '<img class="feature-icon" src="transport/road.svg" alt="" aria-hidden="true" />Road';
const railMark = '<img class="feature-icon" src="transport/rail.svg" alt="" aria-hidden="true" />Rail';
const usingBoth = `<strong>Using:</strong> ${roadMark}, ${railMark}`;
const urbanMark = '<span class="terrain-swatch" data-terrain-kind="urban" aria-hidden="true"></span>Urban';

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
  assert.ok(html?.includes(usingBoth));
});

test('formatOrderPreviewImpactHtml slower line and escapes values', () => {
  const html = formatOrderPreviewImpactHtml({ slower: ['Urban', 'a<b'] });
  assert.equal(html, `<strong>Slower:</strong> ${urbanMark}, a&lt;b`);
});

test('formatOrderPreviewImpactHtml Using-only when roadRail and no terrain line', () => {
  assert.equal(formatOrderPreviewImpactHtml({ roadRail: true }), usingBoth);
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
  assert.ok(html?.includes(usingBoth));
});

test('resolveOrderSlowerTooltipHtml formats road/rail-only tactical march impact', () => {
  assert.equal(
    resolveOrderSlowerTooltipHtml({
      hasBlockedMessage: false,
      validForAll: true,
      tacticalBattleActive: true,
      marchImpact: { slower: [], roadRail: true },
    }),
    usingBoth
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

test('collectTacticalMarchTerrainImpact lists coastal for armor when path enters a coastal res4', () => {
  const a = tacticalCell(59, 69);
  const b = firstRingCellDistinctFrom(a);
  const impact = collectTacticalMarchTerrainImpact({
    battle: {
      battleId: 'tb-coastal-armor',
      enclosingStrategicH3Index: '8f283082dcb519f',
      tacticalChildH3Indexes: [a, b],
      strategicTurnNumber: 1,
      tacticalTurnNumber: 1,
      strategicHexTerrain: 'land',
      strategicHexTerrainKind: 'plains',
      tacticalTerrainKindByH3: { [a]: 'plains', [b]: 'coastal' },
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

test('pickTacticalMarchSlowTerrainDisplayTitle returns Road/Rail when a step uses transport over blocked terrain', () => {
  const a = tacticalCell(57, 67);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'road');
  const title = pickTacticalMarchSlowTerrainDisplayTitle({
    battle: {
      battleId: 'tb-slow',
      enclosingStrategicH3Index: '8f283082dcb519f',
      tacticalChildH3Indexes: [a, b],
      strategicTurnNumber: 1,
      tacticalTurnNumber: 1,
      strategicHexTerrain: 'land',
      strategicHexTerrainKind: 'plains',
      tacticalTerrainKindByH3: { [a]: 'plains', [b]: 'mountain' },
      tacticalRoadSidesByH3: paired.tacticalRoadSidesByH3,
      tacticalRailSidesByH3: paired.tacticalRailSidesByH3,
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
  const a = tacticalCell(58, 68);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'road');
  const impact = collectTacticalMarchTerrainImpact({
    battle: {
      battleId: 'tb-anchor-road',
      enclosingStrategicH3Index: '8f283082dcb519f',
      tacticalChildH3Indexes: [a, b],
      strategicTurnNumber: 1,
      tacticalTurnNumber: 1,
      strategicHexTerrain: 'land',
      strategicHexTerrainKind: 'plains',
      tacticalTerrainKindByH3: { [a]: 'forest', [b]: 'mountain' },
      tacticalRoadSidesByH3: paired.tacticalRoadSidesByH3,
      tacticalRailSidesByH3: paired.tacticalRailSidesByH3,
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
  assert.ok(html?.includes(usingBoth));
});

test('collectTacticalMarchTerrainImpact names snow for forest armor only when the weather cap is below the forest budget', () => {
  const a = tacticalCell(58, 68);
  const b = firstRingCellDistinctFrom(a);
  const armor = { id: 'u1', parentUnitId: 'p1', player: 'human', unitType: 'armor', h3Index: a, displayName: 'A' } as const;
  const slowerAt = (weatherBonusLevel: 'low' | 'high'): readonly string[] =>
    collectTacticalMarchTerrainImpact({
      battle: {
        battleId: `tb-forest-snow-${weatherBonusLevel}`,
        enclosingStrategicH3Index: '8f283082dcb519f',
        tacticalChildH3Indexes: [a, b],
        strategicTurnNumber: 1,
        tacticalTurnNumber: 1,
        strategicHexTerrain: 'land',
        strategicHexTerrainKind: 'plains',
        tacticalTerrainKindByH3: { [a]: 'forest', [b]: 'plains' },
        weather: 'snow',
        weatherBonusEnabled: true,
        weatherBonusLevel,
        subUnits: [armor],
      },
      subUnit: armor,
      moveType: 'armor',
      pathH3: [a, b],
    }).slower;
  assert.deepEqual(slowerAt('low'), ['Forest']);
  assert.deepEqual(slowerAt('high'), ['Forest', 'Snow']);
});

test('collectTacticalMarchTerrainImpact sets roadRail without duplicating Road/Rail in slower list', () => {
  const a = tacticalCell(57, 67);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'road');
  const impact = collectTacticalMarchTerrainImpact({
    battle: {
      battleId: 'tb-slow2',
      enclosingStrategicH3Index: '8f283082dcb519f',
      tacticalChildH3Indexes: [a, b],
      strategicTurnNumber: 1,
      tacticalTurnNumber: 1,
      strategicHexTerrain: 'land',
      strategicHexTerrainKind: 'plains',
      tacticalTerrainKindByH3: { [a]: 'plains', [b]: 'mountain' },
      tacticalRoadSidesByH3: paired.tacticalRoadSidesByH3,
      tacticalRailSidesByH3: paired.tacticalRailSidesByH3,
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
  assert.equal(impact.road, true);
  assert.equal(impact.rail, undefined);
  assert.deepEqual(impact.slower, []);
});

test('collectTacticalMarchTerrainImpact names a plains road on the Using line', () => {
  const a = tacticalCell(61, 71);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'road');
  const impact = collectTacticalMarchTerrainImpact({
    battle: {
      battleId: 'tb-plains-road',
      enclosingStrategicH3Index: '8f283082dcb519f',
      tacticalChildH3Indexes: [a, b],
      strategicTurnNumber: 1,
      tacticalTurnNumber: 1,
      strategicHexTerrain: 'land',
      strategicHexTerrainKind: 'plains',
      tacticalTerrainKindByH3: { [a]: 'plains', [b]: 'plains' },
      tacticalRoadSidesByH3: paired.tacticalRoadSidesByH3,
      tacticalRailSidesByH3: paired.tacticalRailSidesByH3,
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
  assert.equal(impact.road, true);
  assert.equal(impact.rail, undefined);
  assert.deepEqual(impact.slower, []);
});

test('collectTacticalMarchTerrainImpact omits Urban when the road prices that cell and keeps it off the road', () => {
  const a = tacticalCell(62, 72);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'road');
  const withRoad = collectTacticalMarchTerrainImpact({
    battle: {
      battleId: 'tb-urban-road',
      enclosingStrategicH3Index: '8f283082dcb519f',
      tacticalChildH3Indexes: [a, b],
      strategicTurnNumber: 1,
      tacticalTurnNumber: 1,
      strategicHexTerrain: 'land',
      strategicHexTerrainKind: 'plains',
      tacticalTerrainKindByH3: { [a]: 'plains', [b]: 'plains' },
      tacticalIsUrbanByH3: { [b]: true },
      tacticalRoadSidesByH3: paired.tacticalRoadSidesByH3,
      tacticalRailSidesByH3: paired.tacticalRailSidesByH3,
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
  assert.deepEqual(withRoad.slower, []);
  assert.equal(withRoad.roadRail, true);
  assert.equal(withRoad.road, true);
  const withoutRoad = collectTacticalMarchTerrainImpact({
    battle: {
      battleId: 'tb-urban-plain',
      enclosingStrategicH3Index: '8f283082dcb519f',
      tacticalChildH3Indexes: [a, b],
      strategicTurnNumber: 1,
      tacticalTurnNumber: 1,
      strategicHexTerrain: 'land',
      strategicHexTerrainKind: 'plains',
      tacticalTerrainKindByH3: { [a]: 'plains', [b]: 'plains' },
      tacticalIsUrbanByH3: { [b]: true },
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
  assert.deepEqual(withoutRoad.slower, ['Urban']);
  assert.equal(withoutRoad.roadRail, false);
  assert.equal(withoutRoad.road, undefined);
});

test('collectTacticalMarchTerrainImpact names Forest only on steps the line does not price', () => {
  const origin = tacticalCell(63, 73);
  const onRoad = firstRingCellDistinctFrom(origin);
  const offRoad = tacticalGridDiskNeighborsOrdered(onRoad).find((cell) => cell !== origin);
  assert.ok(offRoad);
  const paired = pairedTransportSidesForAdjacentHexes(origin, onRoad, 'road');
  const armor = {
    id: 'u1',
    parentUnitId: 'p1',
    player: 'human' as const,
    unitType: 'armor',
    h3Index: origin,
    displayName: 'A',
  };
  /**
   * Collects the tooltip impact for one armor path on this three-cell fixture.
   *
   * Purpose: Shares the road between the origin and the middle cell across the three cases.
   * When to use: Only inside this test.
   * Expected outcome: The same impact the hover tooltip would build for `path`.
   * Exceptions: None.
   */
  const impactFor = (path: string[], kinds: Record<string, string>, urban: Record<string, boolean>) =>
    collectTacticalMarchTerrainImpact({
      battle: {
        battleId: 'tb-forest-line',
        enclosingStrategicH3Index: '8f283082dcb519f',
        tacticalChildH3Indexes: [origin, onRoad, offRoad],
        strategicTurnNumber: 1,
        tacticalTurnNumber: 1,
        strategicHexTerrain: 'land',
        strategicHexTerrainKind: 'plains',
        tacticalTerrainKindByH3: kinds,
        tacticalIsUrbanByH3: urban,
        tacticalRoadSidesByH3: paired.tacticalRoadSidesByH3,
        tacticalRailSidesByH3: paired.tacticalRailSidesByH3,
        subUnits: [armor],
      },
      subUnit: armor,
      moveType: 'armor',
      pathH3: path,
    });
  const pricedForest = impactFor([origin, onRoad], { [origin]: 'plains', [onRoad]: 'forest' }, {});
  assert.deepEqual(pricedForest.slower, []);
  assert.equal(pricedForest.road, true);
  const startedUrban = impactFor([origin, onRoad], { [origin]: 'plains', [onRoad]: 'forest' }, { [origin]: true });
  assert.deepEqual(startedUrban.slower, ['Urban']);
  assert.equal(startedUrban.road, true);
  const partial = impactFor(
    [origin, onRoad, offRoad],
    { [origin]: 'plains', [onRoad]: 'forest', [offRoad]: 'forest' },
    {}
  );
  assert.deepEqual(partial.slower, ['Forest']);
  assert.equal(partial.road, true);
});

test('collectTacticalMarchTerrainImpact marks a mountain road when only the mountain has the road', () => {
  const a = tacticalCell(90, 100);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'road');
  delete paired.tacticalRoadSidesByH3[a];
  delete paired.tacticalRailSidesByH3[a];
  const impact = collectTacticalMarchTerrainImpact({
    battle: {
      battleId: 'tb-dest-road',
      enclosingStrategicH3Index: '8f283082dcb519f',
      tacticalChildH3Indexes: [a, b],
      strategicTurnNumber: 1,
      tacticalTurnNumber: 1,
      strategicHexTerrain: 'land',
      strategicHexTerrainKind: 'plains',
      tacticalTerrainKindByH3: { [a]: 'plains', [b]: 'mountain' },
      tacticalRoadSidesByH3: paired.tacticalRoadSidesByH3,
      tacticalRailSidesByH3: paired.tacticalRailSidesByH3,
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
  assert.equal(impact.road, true);
  assert.equal(impact.rail, undefined);
  assert.deepEqual(impact.slower, []);
});

test('collectTacticalMarchTerrainImpact names the birth terrain of a terrain-bonus stop, but not on a road', () => {
  const a = tacticalCell(91, 101);
  const b = firstRingCellDistinctFrom(a);
  const slowerFor = (args: {
    readonly unitType: 'armor' | 'naval';
    readonly kinds: readonly [string, string];
    readonly birthTerrainKind: string;
    readonly road?: boolean;
  }): readonly string[] => {
    const mover = {
      id: 'u1',
      parentUnitId: 'p1',
      player: 'human',
      unitType: args.unitType,
      h3Index: a,
      displayName: 'A',
      origin: { birthTerrainKind: args.birthTerrainKind } as UnitOrigin,
    } as const;
    return collectTacticalMarchTerrainImpact({
      battle: {
        battleId: `tb-terrain-bonus-${args.unitType}-${args.road === true}`,
        enclosingStrategicH3Index: '8f283082dcb519f',
        tacticalChildH3Indexes: [a, b],
        strategicTurnNumber: 1,
        tacticalTurnNumber: 1,
        strategicHexTerrain: 'land',
        strategicHexTerrainKind: 'plains',
        tacticalTerrainKindByH3: { [a]: args.kinds[0], [b]: args.kinds[1] },
        ...(args.road ? pairedTransportSidesForAdjacentHexes(a, b, 'road') : {}),
        terrainBonusEnabled: true,
        subUnits: [mover],
      },
      subUnit: mover,
      moveType: args.unitType,
      pathH3: [a, b],
    }).slower;
  };
  const armor = { unitType: 'armor', kinds: ['plains', 'mountain'], birthTerrainKind: 'mountain' } as const;
  assert.deepEqual(slowerFor(armor), ['Mountain']);
  assert.deepEqual(slowerFor({ ...armor, road: true }), []);
  assert.deepEqual(slowerFor({ unitType: 'naval', kinds: ['water', 'wetlands'], birthTerrainKind: 'wetlands' }), [
    'Wetlands',
  ]);
});

test('collectTacticalMarchTerrainImpact keeps snow beside a naval wetlands stop', () => {
  const a = tacticalCell(92, 102);
  const b = firstRingCellDistinctFrom(a);
  const mover = {
    id: 'u1',
    parentUnitId: 'p1',
    player: 'human',
    unitType: 'naval',
    h3Index: a,
    displayName: 'A',
    origin: { birthTerrainKind: 'wetlands' } as UnitOrigin,
  } as const;
  assert.deepEqual(
    collectTacticalMarchTerrainImpact({
      battle: {
        battleId: 'tb-terrain-bonus-naval-snow',
        enclosingStrategicH3Index: '8f283082dcb519f',
        tacticalChildH3Indexes: [a, b],
        strategicTurnNumber: 1,
        tacticalTurnNumber: 1,
        strategicHexTerrain: 'land',
        strategicHexTerrainKind: 'plains',
        tacticalTerrainKindByH3: { [a]: 'water', [b]: 'wetlands' },
        weather: 'snow',
        weatherBonusEnabled: true,
        weatherBonusLevel: 'low',
        terrainBonusEnabled: true,
        subUnits: [mover],
      },
      subUnit: mover,
      moveType: 'naval',
      pathH3: [a, b],
    }).slower,
    ['Snow', 'Wetlands']
  );
});

test('collectTacticalRangedSlowTerrainLabels preserves first-seen order across units', () => {
  const anchorA = tacticalCell(40, 50);
  const anchorB = tacticalCell(41, 51);
  const cells = [anchorA, anchorB];
  const battle = {
    battleId: 'r1',
    enclosingStrategicH3Index: '8f283082dcb519f',
    tacticalChildH3Indexes: cells,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [anchorA]: 'plains', [anchorB]: 'plains' },
    tacticalIsUrbanByH3: { [anchorA]: true, [anchorB]: false },
    tacticalIsRubbleByH3: { [anchorA]: false, [anchorB]: true },
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
