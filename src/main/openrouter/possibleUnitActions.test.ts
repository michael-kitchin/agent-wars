/**
 * Tests for homeland / nearest / other partitioning and possible-actions markdown tables.
 */

import * as assert from 'assert';
import { cellToLatLng, cellToParent, gridDisk, gridDistance } from 'h3-js';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { getOrderedHexList, LATLNG_DECIMAL_PLACES } from '../mapData';
import { buildTacticalAiPlanState } from '../tacticalBattle/buildTacticalAiPlanState';
import { tacticalRes1Cell, tacticalRes4UnderRes1Corner } from '../tacticalBattle/testSupport/tacticalRes4HexFixtures';
import { formatLatLng } from './promptText';
import { buildPossibleUnitActionsMarkdown, collectAggregatedPossibleActionRows, partitionHomelandNearestOther } from './possibleUnitActions';
import type { GameStateSnapshot } from '../gameDb';
import { getRes1LandMassByH3, ensureTerrainClassificationCacheLoaded } from '../terrainClassificationCache';
import { canLandUnitTraverseEdge, landUnitCanOccupyHex } from '../../shared/landTraversalRes1';

/**
 * Defines the `minDistToHomeland` function shape (function minDistToHomeland(h: string, homeland: Set<string>): number).

 * Purpose: Supports maintainability by documenting why `minDistToHomeland` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function minDistToHomeland(h: string, homeland: Set<string>): number {
  let m = Infinity;
  for (const t of homeland) {
    try {
      const d = gridDistance(h, t);
      if (d < m) m = d;
    } catch {
      continue;
    }
  }
  return m;
}

/**
 * Defines the `testPartitionPrefersHomelandOverNearest` function shape (function testPartitionPrefersHomelandOverNearest(): void).

 * Purpose: Supports maintainability by documenting why `testPartitionPrefersHomelandOverNearest` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testPartitionPrefersHomelandOverNearest(): void {
  const hexList = getOrderedHexList().slice(0, 5);
  const homeland = new Set([hexList[0]!, hexList[1]!]);
  const legal = [hexList[0]!, hexList[4]!];
  const p = partitionHomelandNearestOther(legal, homeland);
  assert.deepStrictEqual(p.homeland, [hexList[0]!]);
  assert.deepStrictEqual(p.nearest, []);
  assert.deepStrictEqual(p.other, [hexList[4]!]);
}

/**
 * Defines the `testPartitionNearestWhenNoneInHomeland` function shape (function testPartitionNearestWhenNoneInHomeland(): void).

 * Purpose: Supports maintainability by documenting why `testPartitionNearestWhenNoneInHomeland` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testPartitionNearestWhenNoneInHomeland(): void {
  const hexList = getOrderedHexList().slice(0, 8);
  const homeland = new Set([hexList[0]!]);
  const legal = [hexList[3]!, hexList[4]!, hexList[5]!];
  const p = partitionHomelandNearestOther(legal, homeland);
  assert.deepStrictEqual(p.homeland, []);
  assert.ok(p.nearest.length >= 1);
  const nearestSet = new Set(p.nearest);
  for (const h of p.other) {
    assert.ok(!nearestSet.has(h));
  }
}

/**
 * Defines the `testPartitionEmptyHomelandAllOther` function shape (function testPartitionEmptyHomelandAllOther(): void).

 * Purpose: Supports maintainability by documenting why `testPartitionEmptyHomelandAllOther` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testPartitionEmptyHomelandAllOther(): void {
  const hexList = getOrderedHexList().slice(0, 3);
  const p = partitionHomelandNearestOther([hexList[1]!, hexList[2]!], new Set());
  assert.deepStrictEqual(p.homeland, []);
  assert.deepStrictEqual(p.nearest, []);
  assert.deepStrictEqual(p.other, [hexList[1]!, hexList[2]!].sort((a, b) => a.localeCompare(b)));
}

/**
 * Defines the `testPartitionIncludesAllTiesAtMinDistance` function shape (function testPartitionIncludesAllTiesAtMinDistance(): void).

 * Purpose: Supports maintainability by documenting why `testPartitionIncludesAllTiesAtMinDistance` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testPartitionIncludesAllTiesAtMinDistance(): void {
  const hexList = getOrderedHexList().slice(0, 20);
  const homeland = new Set([hexList[0]!]);
  const legal = hexList.slice(5, 15);
  const p = partitionHomelandNearestOther(legal, homeland);
  if (p.nearest.length >= 2) {
    const ref = minDistToHomeland(p.nearest[0]!, homeland);
    for (const h of p.nearest) {
      assert.strictEqual(minDistToHomeland(h, homeland), ref, 'all nearest bucket hexes share minimum distance to homeland');
    }
  }
}

/**
 * Picks two adjacent on-map hexes that land units can actually traverse.
 *
 * Purpose: Possible-actions tables are empty when the first world hex is ocean; this keeps the markdown contract on a real land edge.
 * When to use: `testBuildPossibleUnitActionsUsesTables` fixture setup.
 * Expected outcome: Origin and dest share a land-mass edge.
 * Exceptions: Throws if the world map has no such pair.
 */
function findAdjacentLandMassHexPair(): { originH3: string; destH3: string } {
  ensureTerrainClassificationCacheLoaded();
  const data = getRes1LandMassByH3();
  const allHexes = getOrderedHexList();
  const onMap = new Set(allHexes);
  for (const originH3 of allHexes) {
    if (!landUnitCanOccupyHex(originH3, data)) continue;
    for (const destH3 of gridDisk(originH3, 1)) {
      if (destH3 === originH3 || !onMap.has(destH3)) continue;
      if (canLandUnitTraverseEdge(originH3, destH3, data)) return { originH3, destH3 };
    }
  }
  throw new Error('expected an adjacent land-mass hex pair for possible-actions tables');
}

/**
 * Defines the `testBuildPossibleUnitActionsUsesTables` function shape (function testBuildPossibleUnitActionsUsesTables(): void).

 * Purpose: Supports maintainability by documenting why `testBuildPossibleUnitActionsUsesTables` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testBuildPossibleUnitActionsUsesTables(): void {
  const pair = findAdjacentLandMassHexPair();
  const hexList = [pair.originH3, pair.destH3];
  const latLngByH3 = new Map<string, [number, number]>();
  for (const h of hexList) {
    latLngByH3.set(h, cellToLatLng(h) as [number, number]);
  }
  const state: GameStateSnapshot = {
    hexes: hexList.map((h3Index) => ({ h3Index, terrain: 'land', terrainKind: 'plains' })),
    units: [
      { id: 'opponent-infantry-1', player: 'opponent', unitType: 'infantry', h3Index: pair.originH3 },
      { id: 'human-inf-1', player: 'human', unitType: 'infantry', h3Index: pair.destH3 },
    ],
    humanHomeRegionHexes: [pair.destH3],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
    res1Infrastructure: [],
    res1Control: [
      { h3Index: pair.originH3, controllerPlayerId: 'opponent' },
      { h3Index: pair.destH3, controllerPlayerId: 'human' },
    ],
  };
  const md = buildPossibleUnitActionsMarkdown({
    state,
    latLngByH3,
    formatLatLng: (ll) => formatLatLng(ll, LATLNG_DECIMAL_PLACES),
  });
  assert.ok(md.includes('| Unit ID | Unit Type | Action Types | Hex | Distance | Enemy Units | Hex Features |'));
  assert.ok(
    md.includes('## Enemy Homeland Hexes') ||
      md.includes('## Hexes Nearest to Enemy Homeland') ||
      md.includes('## Other Hexes')
  );
}

/**
 * Defines the `testUnitHexAppearsInSingleBucketWithPriority` function shape (function testUnitHexAppearsInSingleBucketWithPriority(): void).

 * Purpose: Supports maintainability by documenting why `testUnitHexAppearsInSingleBucketWithPriority` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testUnitHexAppearsInSingleBucketWithPriority(): void {
  const allHexes = getOrderedHexList();
  const base = allHexes[0]!;
  const ring = gridDisk(base, 2).filter((h) => h !== base && allHexes.includes(h));
  const ferryHex = ring[0]!;
  const homelandHex = ring[1]!;
  const latLngByH3 = new Map<string, [number, number]>();
  for (const h of [base, ferryHex, homelandHex]) latLngByH3.set(h, cellToLatLng(h) as [number, number]);
  const ferryPos = formatLatLng(latLngByH3.get(ferryHex)!, LATLNG_DECIMAL_PLACES);
  const state: GameStateSnapshot = {
    hexes: [
      { h3Index: base, terrain: 'land', terrainKind: 'plains' },
      { h3Index: ferryHex, terrain: 'land', terrainKind: 'plains' },
      { h3Index: homelandHex, terrain: 'land', terrainKind: 'plains' },
    ],
    units: [{ id: 'opponent-air-1', player: 'opponent', unitType: 'air', h3Index: base }],
    humanHomeRegionHexes: [homelandHex],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
    res1Infrastructure: [
      { h3Index: base, urbanHexCount: 0, airportCount: 1, seaportCount: 0 },
      { h3Index: ferryHex, urbanHexCount: 0, airportCount: 1, seaportCount: 0 },
      { h3Index: homelandHex, urbanHexCount: 1, airportCount: 0, seaportCount: 0 },
    ],
    res1Control: [
      { h3Index: base, controllerPlayerId: 'opponent' },
      { h3Index: ferryHex, controllerPlayerId: 'opponent' },
      { h3Index: homelandHex, controllerPlayerId: 'human' },
    ],
  };
  const md = buildPossibleUnitActionsMarkdown({
    state,
    latLngByH3,
    formatLatLng: (ll) => formatLatLng(ll, LATLNG_DECIMAL_PLACES),
  });
  const rowLines = md
    .split('\n')
    .filter((line) => line.startsWith(`| opponent-air-1 | air |`) && line.includes(`| ${ferryPos} |`));
  assert.strictEqual(rowLines.length, 1, 'expected one row for same unit+hex across all buckets');
  assert.ok(rowLines[0]!.includes('move/melee'), 'expected merged row to include move/melee action');
  assert.ok(rowLines[0]!.includes('air strike'), 'expected merged row to include air strike action');
  assert.ok(md.includes('## Hexes Nearest to Enemy Homeland'), 'expected higher-priority nearest bucket to be used');
}

/**
 * Defines the `countOpponentArmorRangedTableRows` function shape (function countOpponentArmorRangedTableRows(md: string): number).

 * Purpose: Counts markdown table rows for opponent armor `ranged attack` actions so tactical vs strategic briefing output can be compared without parsing full tables.
 * When to use: `testTacticalPossibleActionsMarkdownUsesTacticalRangedLegality` assertions only.
 * Expected outcome: Returns the number of pipe-delimited lines mentioning both `opp-arm-ranged-cap` and the ranged action label.
 * Exceptions: None.
 */
function countOpponentArmorRangedTableRows(md: string): number {
  return md.split('\n').filter((line) => line.includes('opp-arm-ranged-cap') && line.includes('ranged attack')).length;
}

/**
 * Defines the `testTacticalPossibleActionsMarkdownUsesTacticalRangedLegality` function shape (function testTacticalPossibleActionsMarkdownUsesTacticalRangedLegality(): void).

 * Purpose: Ensures `tacticalBattle` briefings use **tactical** res4 ranged rules (`RANGED_RANGE_BY_UNIT_TYPE` + terrain), not strategic `getRange` alone: opponent armor on plains can reach two res4 steps on the tactical grid while the same projected `GameStateSnapshot` only allows one-step strategic ranged rows.
 * When to use: Regression guard when changing `collectTacticalLegalRangedTargetRes4Hexes` or strategic `collectRangedTargetHexes` wiring.
 * Expected outcome: Non-tactical markdown has one armor ranged row (strategic range 1); tactical markdown has two (near and far humans at res4 distances 1 and 2).
 * Exceptions: None.
 */
function testTacticalPossibleActionsMarkdownUsesTacticalRangedLegality(): void {
  const res1 = tacticalRes1Cell(12, 34);
  const res4Armor = tacticalRes4UnderRes1Corner(12, 34);
  const sameParent = [...gridDisk(res4Armor, 6)].filter((h) => cellToParent(h, 1) === res1);
  const res4NearHuman = sameParent.find((h) => h !== res4Armor && gridDistance(res4Armor, h) === 1);
  const res4FarHuman = sameParent.find((h) => h !== res4Armor && gridDistance(res4Armor, h) === 2);
  if (!res4NearHuman || !res4FarHuman) {
    throw new Error('expected res4 ring neighbors at distances 1 and 2 under the same res1 parent');
  }
  const tactical: TacticalBattleSnapshot = {
    battleId: 't-ranged-cap-md',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: [res4Armor, res4NearHuman, res4FarHuman],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: {
      [res4Armor]: 'plains',
      [res4NearHuman]: 'plains',
      [res4FarHuman]: 'plains',
    },
    subUnits: [
      {
        id: 'opp-arm-ranged-cap',
        parentUnitId: 'parent-arm',
        player: 'opponent',
        unitType: 'armor',
        h3Index: res4Armor,
        displayName: 'Armor',
      },
      {
        id: 'hum-near',
        parentUnitId: 'parent-inf-n',
        player: 'human',
        unitType: 'infantry',
        h3Index: res4NearHuman,
        displayName: 'Infantry near',
      },
      {
        id: 'hum-far',
        parentUnitId: 'parent-inf-f',
        player: 'human',
        unitType: 'infantry',
        h3Index: res4FarHuman,
        displayName: 'Infantry far',
      },
    ],
  };
  const strategic: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [{ h3Index: res1, terrain: 'land', terrainKind: 'plains' }],
    units: [],
    pendingOrders: [],
    humanHomeRegionHexes: [res4FarHuman],
    res1Control: [{ h3Index: res1, controllerPlayerId: 'opponent' }],
  };
  const plan = buildTacticalAiPlanState(strategic, tactical);
  const latLngByH3 = new Map<string, [number, number]>();
  for (const h of plan.hexes.map((x) => x.h3Index)) {
    latLngByH3.set(h, cellToLatLng(h) as [number, number]);
  }
  const fmt = (ll: [number, number]) => formatLatLng(ll, LATLNG_DECIMAL_PLACES);
  const mdStrategic = buildPossibleUnitActionsMarkdown({ state: plan, latLngByH3, formatLatLng: fmt });
  const mdTactical = buildPossibleUnitActionsMarkdown({
    state: plan,
    latLngByH3,
    formatLatLng: fmt,
    tacticalBattle: tactical,
  });
  assert.strictEqual(countOpponentArmorRangedTableRows(mdStrategic), 1);
  assert.strictEqual(countOpponentArmorRangedTableRows(mdTactical), 2);
}

/**
 * Ensures tactical infantry still receive ranged-attack briefing rows after strategic infantry range became 0.
 *
 * Purpose: `buildPossibleUnitActionsMarkdown` must gate ranged rows with theater-aware planning, not strategic `getRange`.
 * When to use: After changing the ranged-row eligibility check or infantry strategic/tactical range split.
 * Expected outcome: Strategic markdown has no infantry ranged rows; tactical markdown lists ranged attack at res4 distances 1 and 2.
 * Exceptions: Throws if the fixture cannot find res4 neighbors at distances 1 and 2 under the same parent.
 */
function testTacticalInfantryPossibleActionsIncludeRangedRows(): void {
  const res1 = tacticalRes1Cell(12, 34);
  const res4Inf = tacticalRes4UnderRes1Corner(12, 34);
  const sameParent = [...gridDisk(res4Inf, 6)].filter((h) => cellToParent(h, 1) === res1);
  const res4NearHuman = sameParent.find((h) => h !== res4Inf && gridDistance(res4Inf, h) === 1);
  const res4FarHuman = sameParent.find((h) => h !== res4Inf && gridDistance(res4Inf, h) === 2);
  if (!res4NearHuman || !res4FarHuman) {
    throw new Error('expected res4 ring neighbors at distances 1 and 2 under the same res1 parent');
  }
  const tactical: TacticalBattleSnapshot = {
    battleId: 't-inf-ranged-cap-md',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: [res4Inf, res4NearHuman, res4FarHuman],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: {
      [res4Inf]: 'plains',
      [res4NearHuman]: 'plains',
      [res4FarHuman]: 'plains',
    },
    subUnits: [
      {
        id: 'opp-inf-ranged-cap',
        parentUnitId: 'parent-inf',
        player: 'opponent',
        unitType: 'infantry',
        h3Index: res4Inf,
        displayName: 'Infantry',
      },
      {
        id: 'hum-near',
        parentUnitId: 'parent-inf-n',
        player: 'human',
        unitType: 'infantry',
        h3Index: res4NearHuman,
        displayName: 'Infantry near',
      },
      {
        id: 'hum-far',
        parentUnitId: 'parent-inf-f',
        player: 'human',
        unitType: 'infantry',
        h3Index: res4FarHuman,
        displayName: 'Infantry far',
      },
    ],
  };
  const strategic: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [{ h3Index: res1, terrain: 'land', terrainKind: 'plains' }],
    units: [],
    pendingOrders: [],
    humanHomeRegionHexes: [res4FarHuman],
    res1Control: [{ h3Index: res1, controllerPlayerId: 'opponent' }],
  };
  const plan = buildTacticalAiPlanState(strategic, tactical);
  const latLngByH3 = new Map<string, [number, number]>();
  for (const h of plan.hexes.map((x) => x.h3Index)) {
    latLngByH3.set(h, cellToLatLng(h) as [number, number]);
  }
  const fmt = (ll: [number, number]) => formatLatLng(ll, LATLNG_DECIMAL_PLACES);
  const mdStrategic = buildPossibleUnitActionsMarkdown({ state: plan, latLngByH3, formatLatLng: fmt });
  const mdTactical = buildPossibleUnitActionsMarkdown({
    state: plan,
    latLngByH3,
    formatLatLng: fmt,
    tacticalBattle: tactical,
  });
  const strategicRows = mdStrategic.split('\n').filter((line) => line.includes('opp-inf-ranged-cap') && line.includes('ranged attack'));
  const tacticalRows = mdTactical.split('\n').filter((line) => line.includes('opp-inf-ranged-cap') && line.includes('ranged attack'));
  assert.strictEqual(strategicRows.length, 0, 'strategic infantry must not list ranged attack');
  assert.strictEqual(tacticalRows.length, 2, 'tactical infantry plains baseline reaches res4 distances 1 and 2');
}

/**
 * Ensures tactical Best Options ground moves use res4 march reachability (not strategic land-mass), keeping enemy-occupied cells.
 *
 * Purpose: Regression for `collectTacticalLegalMoveDestinationRes4Hexes` wiring in Best Options.
 * When to use: After edits to tactical possible-actions move collection or this-turn filters.
 * Expected outcome: Tactical table offers a ground-move row onto the adjacent human-occupied res4 hex.
 * Exceptions: Throws if the fixture cannot find an adjacent res4 neighbor under the parent.
 */
function testTacticalBestOptionsGroundMovesIncludeAdjacentEnemyHex(): void {
  const res1 = tacticalRes1Cell(12, 34);
  const res4Opp = tacticalRes4UnderRes1Corner(12, 34);
  const sameParent = [...gridDisk(res4Opp, 4)].filter((h) => cellToParent(h, 1) === res1);
  const res4Human = sameParent.find((h) => h !== res4Opp && gridDistance(res4Opp, h) === 1);
  if (!res4Human) {
    throw new Error('expected adjacent res4 neighbor under the same res1 parent');
  }
  const tactical: TacticalBattleSnapshot = {
    battleId: 't-best-options-move',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: [res4Opp, res4Human],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: {
      [res4Opp]: 'plains',
      [res4Human]: 'plains',
    },
    subUnits: [
      {
        id: 'opp-arm-move',
        parentUnitId: 'parent-arm',
        player: 'opponent',
        unitType: 'armor',
        h3Index: res4Opp,
        displayName: 'Armor',
      },
      {
        id: 'hum-adj',
        parentUnitId: 'parent-inf',
        player: 'human',
        unitType: 'infantry',
        h3Index: res4Human,
        displayName: 'Infantry',
      },
    ],
  };
  const strategic: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [{ h3Index: res1, terrain: 'land', terrainKind: 'plains' }],
    units: [],
    pendingOrders: [],
    humanHomeRegionHexes: [res4Human],
    res1Control: [{ h3Index: res1, controllerPlayerId: 'opponent' }],
  };
  const plan = buildTacticalAiPlanState(strategic, tactical);
  const latLngByH3 = new Map<string, [number, number]>();
  for (const h of plan.hexes.map((x) => x.h3Index)) {
    latLngByH3.set(h, cellToLatLng(h) as [number, number]);
  }
  const fmt = (ll: [number, number]) => formatLatLng(ll, LATLNG_DECIMAL_PLACES);
  const rowsStrategicFilter = collectAggregatedPossibleActionRows({
    state: plan,
    latLngByH3,
    formatLatLng: fmt,
    forThisTurnOptionsTable: true,
  });
  const rowsTactical = collectAggregatedPossibleActionRows({
    state: plan,
    latLngByH3,
    formatLatLng: fmt,
    tacticalBattle: tactical,
    forThisTurnOptionsTable: true,
  });
  const strategicMove = rowsStrategicFilter.filter(
    (r) => r.unitId === 'opp-arm-move' && (r.actionTypes.includes('move') || r.actionTypes.includes('melee'))
  );
  const tacticalMove = rowsTactical.filter(
    (r) => r.unitId === 'opp-arm-move' && (r.actionTypes.includes('move') || r.actionTypes.includes('melee'))
  );
  assert.strictEqual(strategicMove.length, 0, 'strategic land-mass destinations should not apply on res4 planState');
  assert.ok(tacticalMove.length >= 1, 'tactical Best Options should offer a move onto the adjacent human hex');
  assert.ok(tacticalMove.some((r) => r.targetH3 === res4Human));
}

/**
 * Ensures Best Options falls back to approach hexes when no enemy/infra hex is reachable this beat.
 *
 * Purpose: Distant contact should still show legal closing moves (top-5 cap applied later by selectTopRowsPerUnit).
 * When to use: After edits to tactical this-turn ground-move filters.
 * Expected outcome: At least one move row whose target reduces H3 distance to the distant human.
 * Exceptions: Throws when the fixture cannot place a human three steps away under the same parent.
 */
function testTacticalBestOptionsApproachFallbackWhenEnemyOutOfReach(): void {
  const res1 = tacticalRes1Cell(12, 34);
  const res4Opp = tacticalRes4UnderRes1Corner(12, 34);
  const sameParent = [...gridDisk(res4Opp, 8)].filter((h) => cellToParent(h, 1) === res1);
  const res4Human = sameParent.find((h) => h !== res4Opp && gridDistance(res4Opp, h) === 5);
  if (!res4Human) {
    throw new Error('expected a res4 cell five steps from the opponent under the same res1 parent');
  }
  const footprint = sameParent.filter((h) => {
    try {
      return gridDistance(res4Opp, h) <= 5 || gridDistance(res4Human, h) <= 5;
    } catch {
      return false;
    }
  });
  const terrain: Record<string, string> = {};
  for (const h of footprint) terrain[h] = 'plains';
  const tactical: TacticalBattleSnapshot = {
    battleId: 't-best-options-approach',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: footprint,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: terrain,
    subUnits: [
      {
        id: 'opp-arm-far',
        parentUnitId: 'parent-arm',
        player: 'opponent',
        unitType: 'armor',
        h3Index: res4Opp,
        displayName: 'Armor',
      },
      {
        id: 'hum-far',
        parentUnitId: 'parent-inf',
        player: 'human',
        unitType: 'infantry',
        h3Index: res4Human,
        displayName: 'Infantry',
      },
    ],
  };
  const strategic: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [{ h3Index: res1, terrain: 'land', terrainKind: 'plains' }],
    units: [],
    pendingOrders: [],
  };
  const plan = buildTacticalAiPlanState(strategic, tactical);
  const latLngByH3 = new Map<string, [number, number]>();
  for (const h of plan.hexes.map((x) => x.h3Index)) {
    latLngByH3.set(h, cellToLatLng(h) as [number, number]);
  }
  const fmt = (ll: [number, number]) => formatLatLng(ll, LATLNG_DECIMAL_PLACES);
  const rows = collectAggregatedPossibleActionRows({
    state: plan,
    latLngByH3,
    formatLatLng: fmt,
    tacticalBattle: tactical,
    forThisTurnOptionsTable: true,
  });
  const moves = rows.filter((r) => r.unitId === 'opp-arm-far' && r.actionTypes.includes('approach'));
  assert.ok(moves.length >= 1, 'expected approach move rows when enemy is out of this-beat reach');
  assert.ok(
    moves.every((r) => gridDistance(r.targetH3, res4Human) < 5),
    'approach targets must reduce distance to the nearest human'
  );
  assert.ok(!moves.some((r) => r.targetH3 === res4Human), 'distant human hex itself is not this-beat reachable');
  assert.ok(
    moves.every((r) => typeof r.enemySummary === 'string' && r.enemySummary.includes('hum-far')),
    'approach Target Units lists nearest enemy unit id'
  );
}

/**
 * Documents the module-scope binding `tests` (tests).

 * Purpose: Supports maintainability by documenting why `tests` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const tests = [
  { name: 'partitionHomelandNearestOther prefers homeland', fn: testPartitionPrefersHomelandOverNearest },
  { name: 'partitionHomelandNearestOther uses nearest when no homeland hit', fn: testPartitionNearestWhenNoneInHomeland },
  { name: 'partitionHomelandNearestOther empty homeland -> other only', fn: testPartitionEmptyHomelandAllOther },
  { name: 'partitionHomelandNearestOther tie handling', fn: testPartitionIncludesAllTiesAtMinDistance },
  { name: 'buildPossibleUnitActionsMarkdown emits markdown tables', fn: testBuildPossibleUnitActionsUsesTables },
  { name: 'buildPossibleUnitActionsMarkdown de-duplicates unit+hex across buckets', fn: testUnitHexAppearsInSingleBucketWithPriority },
  {
    name: 'buildPossibleUnitActionsMarkdown tacticalBattle uses res4 ranged rules vs strategic getRange',
    fn: testTacticalPossibleActionsMarkdownUsesTacticalRangedLegality,
  },
  {
    name: 'buildPossibleUnitActionsMarkdown tactical infantry still lists ranged rows',
    fn: testTacticalInfantryPossibleActionsIncludeRangedRows,
  },
  {
    name: 'collectAggregatedPossibleActionRows tactical Best Options ground moves include adjacent enemy',
    fn: testTacticalBestOptionsGroundMovesIncludeAdjacentEnemyHex,
  },
  {
    name: 'collectAggregatedPossibleActionRows tactical Best Options approach fallback when enemy out of reach',
    fn: testTacticalBestOptionsApproachFallbackWhenEnemyOutOfReach,
  },
];

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function run(): void {
  for (const t of tests) {
    try {
      t.fn();
      console.log(`OK ${t.name}`);
    } catch (err) {
      console.error(`FAIL ${t.name}`, err);
      process.exit(1);
    }
  }
}

run();
