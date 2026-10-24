/**
 * Tests for homeland / nearest / other partitioning and possible-actions markdown tables.
 */

import * as assert from 'assert';
import { cellToLatLng, cellToParent, gridDisk, gridDistance } from 'h3-js';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { getRange } from '../combatConstants';
import {
  computeGridDistancePure,
  computeGridDistanceWithPathFallbackPure,
} from '../../shared/h3GridRangePure';
import { getOrderedHexList, LATLNG_DECIMAL_PLACES } from '../mapData';
import { collectRangedTargetHexes } from './possibleUnitActionsStrategicRanged';
import { buildTacticalAiPlanState } from '../tacticalBattle/buildTacticalAiPlanState';
import { tacticalParentCell, tacticalUnderCorner } from '../tacticalBattle/testSupport/tacticalHexFixtures';
import { formatLatLng } from './promptText';
import { buildPossibleUnitActionsMarkdown, collectAggregatedPossibleActionRows, partitionHomelandNearestOther } from './possibleUnitActions';
import type { GameStateSnapshot } from '../gameDb';
import { getStrategicLandMassByH3, ensureTerrainClassificationCacheLoaded } from '../terrainClassificationCache';
import { canLandUnitTraverseEdge, landUnitCanOccupyHex } from '../../shared/landTraversalStrategic';

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
  const data = getStrategicLandMassByH3();
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
    seats: [{ seatId: 'human' as const, seatOrder: 1, kind: 'human' as const, homeRegion: 'Home', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }, { seatId: 'opponent' as const, seatOrder: 2, kind: 'ai' as const, homeRegion: 'Away', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }], homeRegionHexesBySeat: { human: [pair.destH3] },
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
    strategicInfrastructure: [],
    strategicControl: [
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
    seats: [{ seatId: 'human' as const, seatOrder: 1, kind: 'human' as const, homeRegion: 'Home', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }, { seatId: 'opponent' as const, seatOrder: 2, kind: 'ai' as const, homeRegion: 'Away', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }], homeRegionHexesBySeat: { human: [homelandHex] },
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
    strategicInfrastructure: [
      { h3Index: base, urbanHexCount: 0, airportCount: 1, seaportCount: 0 },
      { h3Index: ferryHex, urbanHexCount: 0, airportCount: 1, seaportCount: 0 },
      { h3Index: homelandHex, urbanHexCount: 1, airportCount: 0, seaportCount: 0 },
    ],
    strategicControl: [
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
  assert.ok(rowLines[0]!.includes('ferry'), 'expected merged row to include ferry action');
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

 * Purpose: Ensures `tacticalBattle` briefings use **tactical** tactical ranged rules (`RANGED_RANGE_BY_UNIT_TYPE` + terrain), not strategic `getRange` alone: opponent armor on plains can reach two tactical steps on the tactical grid while the same projected `GameStateSnapshot` only allows one-step strategic ranged rows.
 * When to use: Regression guard when changing `collectTacticalLegalRangedTargetTacticalHexes` or strategic `collectRangedTargetHexes` wiring.
 * Expected outcome: Non-tactical markdown has one armor ranged row (strategic range 1); tactical markdown has two (near and far humans at tactical distances 1 and 2).
 * Exceptions: None.
 */
function testTacticalPossibleActionsMarkdownUsesTacticalRangedLegality(): void {
  const parentCell = tacticalParentCell(12, 34);
  const tacticalArmor = tacticalUnderCorner(12, 34);
  const sameParent = [...gridDisk(tacticalArmor, 6)].filter((h) => cellToParent(h, 1) === parentCell);
  const tacticalNearHuman = sameParent.find((h) => h !== tacticalArmor && gridDistance(tacticalArmor, h) === 1);
  const tacticalFarHuman = sameParent.find((h) => h !== tacticalArmor && gridDistance(tacticalArmor, h) === 2);
  if (!tacticalNearHuman || !tacticalFarHuman) {
    throw new Error('expected res4 ring neighbors at distances 1 and 2 under the same res1 parent');
  }
  const tactical: TacticalBattleSnapshot = {
    battleId: 't-ranged-cap-md',
    enclosingStrategicH3Index: parentCell,
    tacticalChildH3Indexes: [tacticalArmor, tacticalNearHuman, tacticalFarHuman],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: {
      [tacticalArmor]: 'plains',
      [tacticalNearHuman]: 'plains',
      [tacticalFarHuman]: 'plains',
    },
    subUnits: [
      {
        id: 'opp-arm-ranged-cap',
        parentUnitId: 'parent-arm',
        player: 'opponent',
        unitType: 'armor',
        h3Index: tacticalArmor,
        displayName: 'Armor',
      },
      {
        id: 'hum-near',
        parentUnitId: 'parent-inf-n',
        player: 'human',
        unitType: 'infantry',
        h3Index: tacticalNearHuman,
        displayName: 'Infantry near',
      },
      {
        id: 'hum-far',
        parentUnitId: 'parent-inf-f',
        player: 'human',
        unitType: 'infantry',
        h3Index: tacticalFarHuman,
        displayName: 'Infantry far',
      },
    ],
  };
  const strategic: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [{ h3Index: parentCell, terrain: 'land', terrainKind: 'plains' }],
    units: [],
    pendingOrders: [],
    seats: [{ seatId: 'human' as const, seatOrder: 1, kind: 'human' as const, homeRegion: 'Home', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }, { seatId: 'opponent' as const, seatOrder: 2, kind: 'ai' as const, homeRegion: 'Away', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }], homeRegionHexesBySeat: { human: [tacticalFarHuman] },
    strategicControl: [{ h3Index: parentCell, controllerPlayerId: 'opponent' }],
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
 * Expected outcome: Strategic markdown has no infantry ranged rows; tactical markdown lists ranged attack at tactical distances 1 and 2.
 * Exceptions: Throws if the fixture cannot find tactical neighbors at distances 1 and 2 under the same parent.
 */
function testTacticalInfantryPossibleActionsIncludeRangedRows(): void {
  const parentCell = tacticalParentCell(12, 34);
  const tacticalInf = tacticalUnderCorner(12, 34);
  const sameParent = [...gridDisk(tacticalInf, 6)].filter((h) => cellToParent(h, 1) === parentCell);
  const tacticalNearHuman = sameParent.find((h) => h !== tacticalInf && gridDistance(tacticalInf, h) === 1);
  const tacticalFarHuman = sameParent.find((h) => h !== tacticalInf && gridDistance(tacticalInf, h) === 2);
  if (!tacticalNearHuman || !tacticalFarHuman) {
    throw new Error('expected res4 ring neighbors at distances 1 and 2 under the same res1 parent');
  }
  const tactical: TacticalBattleSnapshot = {
    battleId: 't-inf-ranged-cap-md',
    enclosingStrategicH3Index: parentCell,
    tacticalChildH3Indexes: [tacticalInf, tacticalNearHuman, tacticalFarHuman],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: {
      [tacticalInf]: 'plains',
      [tacticalNearHuman]: 'plains',
      [tacticalFarHuman]: 'plains',
    },
    subUnits: [
      {
        id: 'opp-inf-ranged-cap',
        parentUnitId: 'parent-inf',
        player: 'opponent',
        unitType: 'infantry',
        h3Index: tacticalInf,
        displayName: 'Infantry',
      },
      {
        id: 'hum-near',
        parentUnitId: 'parent-inf-n',
        player: 'human',
        unitType: 'infantry',
        h3Index: tacticalNearHuman,
        displayName: 'Infantry near',
      },
      {
        id: 'hum-far',
        parentUnitId: 'parent-inf-f',
        player: 'human',
        unitType: 'infantry',
        h3Index: tacticalFarHuman,
        displayName: 'Infantry far',
      },
    ],
  };
  const strategic: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [{ h3Index: parentCell, terrain: 'land', terrainKind: 'plains' }],
    units: [],
    pendingOrders: [],
    seats: [{ seatId: 'human' as const, seatOrder: 1, kind: 'human' as const, homeRegion: 'Home', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }, { seatId: 'opponent' as const, seatOrder: 2, kind: 'ai' as const, homeRegion: 'Away', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }], homeRegionHexesBySeat: { human: [tacticalFarHuman] },
    strategicControl: [{ h3Index: parentCell, controllerPlayerId: 'opponent' }],
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
 * Ensures tactical Best Options ground moves use tactical march reachability (not strategic land-mass), keeping enemy-occupied cells.
 *
 * Purpose: Regression for `collectTacticalLegalMoveDestinationTacticalHexes` wiring in Best Options.
 * When to use: After edits to tactical possible-actions move collection or this-turn filters.
 * Expected outcome: Tactical table offers a ground-move row onto the adjacent human-occupied tactical hex.
 * Exceptions: Throws if the fixture cannot find an adjacent tactical neighbor under the parent.
 */
function testTacticalBestOptionsGroundMovesIncludeAdjacentEnemyHex(): void {
  const parentCell = tacticalParentCell(12, 34);
  const tacticalOpp = tacticalUnderCorner(12, 34);
  const sameParent = [...gridDisk(tacticalOpp, 4)].filter((h) => cellToParent(h, 1) === parentCell);
  const tacticalHuman = sameParent.find((h) => h !== tacticalOpp && gridDistance(tacticalOpp, h) === 1);
  if (!tacticalHuman) {
    throw new Error('expected adjacent res4 neighbor under the same res1 parent');
  }
  const tactical: TacticalBattleSnapshot = {
    battleId: 't-best-options-move',
    enclosingStrategicH3Index: parentCell,
    tacticalChildH3Indexes: [tacticalOpp, tacticalHuman],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: {
      [tacticalOpp]: 'plains',
      [tacticalHuman]: 'plains',
    },
    subUnits: [
      {
        id: 'opp-arm-move',
        parentUnitId: 'parent-arm',
        player: 'opponent',
        unitType: 'armor',
        h3Index: tacticalOpp,
        displayName: 'Armor',
      },
      {
        id: 'hum-adj',
        parentUnitId: 'parent-inf',
        player: 'human',
        unitType: 'infantry',
        h3Index: tacticalHuman,
        displayName: 'Infantry',
      },
    ],
  };
  const strategic: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [{ h3Index: parentCell, terrain: 'land', terrainKind: 'plains' }],
    units: [],
    pendingOrders: [],
    seats: [{ seatId: 'human' as const, seatOrder: 1, kind: 'human' as const, homeRegion: 'Home', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }, { seatId: 'opponent' as const, seatOrder: 2, kind: 'ai' as const, homeRegion: 'Away', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }], homeRegionHexesBySeat: { human: [tacticalHuman] },
    strategicControl: [{ h3Index: parentCell, controllerPlayerId: 'opponent' }],
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
  assert.ok(tacticalMove.some((r) => r.targetH3 === tacticalHuman));
}

/**
 * Stacked tactical armor on the same cell keep their own Best Options rows and share legal dests.
 *
 * Purpose: Tactical dest cache must not drop a stacked pawn or mix infantry dests into armor rows.
 * When to use: After changing `tacticalLegalMoveDestCacheKey` / collectAggregated tactical dest reuse.
 * Expected outcome: Both armor unit ids list the adjacent human hex; co-located infantry still appears.
 * Exceptions: Throws if the fixture cannot find an adjacent tactical neighbor under the parent.
 */
function testTacticalBestOptionsStackedArmorShareMoveDests(): void {
  const parentCell = tacticalParentCell(12, 34);
  const tacticalOpp = tacticalUnderCorner(12, 34);
  const sameParent = [...gridDisk(tacticalOpp, 4)].filter((h) => cellToParent(h, 1) === parentCell);
  const tacticalHuman = sameParent.find((h) => h !== tacticalOpp && gridDistance(tacticalOpp, h) === 1);
  if (!tacticalHuman) {
    throw new Error('expected adjacent res4 neighbor under the same res1 parent');
  }
  const tactical: TacticalBattleSnapshot = {
    battleId: 't-best-options-stack',
    enclosingStrategicH3Index: parentCell,
    tacticalChildH3Indexes: [tacticalOpp, tacticalHuman],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: {
      [tacticalOpp]: 'plains',
      [tacticalHuman]: 'plains',
    },
    subUnits: [
      {
        id: 'opp-arm-a',
        parentUnitId: 'parent-arm-a',
        player: 'opponent',
        unitType: 'armor',
        h3Index: tacticalOpp,
        displayName: 'Armor A',
      },
      {
        id: 'opp-arm-b',
        parentUnitId: 'parent-arm-b',
        player: 'opponent',
        unitType: 'armor',
        h3Index: tacticalOpp,
        displayName: 'Armor B',
      },
      {
        id: 'opp-inf-stack',
        parentUnitId: 'parent-inf-stack',
        player: 'opponent',
        unitType: 'infantry',
        h3Index: tacticalOpp,
        displayName: 'Infantry',
      },
      {
        id: 'hum-adj',
        parentUnitId: 'parent-inf',
        player: 'human',
        unitType: 'infantry',
        h3Index: tacticalHuman,
        displayName: 'Infantry',
      },
    ],
  };
  const strategic: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [{ h3Index: parentCell, terrain: 'land', terrainKind: 'plains' }],
    units: [],
    pendingOrders: [],
    seats: [{ seatId: 'human' as const, seatOrder: 1, kind: 'human' as const, homeRegion: 'Home', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }, { seatId: 'opponent' as const, seatOrder: 2, kind: 'ai' as const, homeRegion: 'Away', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }], homeRegionHexesBySeat: { human: [tacticalHuman] },
    strategicControl: [{ h3Index: parentCell, controllerPlayerId: 'opponent' }],
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
  const destsFor = (unitId: string) =>
    rows
      .filter((r) => r.unitId === unitId && (r.actionTypes.includes('move') || r.actionTypes.includes('melee')))
      .map((r) => r.targetH3)
      .sort();
  const armorA = destsFor('opp-arm-a');
  const armorB = destsFor('opp-arm-b');
  assert.ok(armorA.includes(tacticalHuman), 'first stacked armor must keep the adjacent human dest');
  assert.deepStrictEqual(armorA, armorB, 'stacked same-type armor must share legal dests');
  assert.ok(destsFor('opp-inf-stack').includes(tacticalHuman), 'co-located infantry must still get dests');
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
  const parentCell = tacticalParentCell(12, 34);
  const tacticalOpp = tacticalUnderCorner(12, 34);
  const sameParent = [...gridDisk(tacticalOpp, 8)].filter((h) => cellToParent(h, 1) === parentCell);
  const tacticalHuman = sameParent.find((h) => h !== tacticalOpp && gridDistance(tacticalOpp, h) === 5);
  if (!tacticalHuman) {
    throw new Error('expected a res4 cell five steps from the opponent under the same res1 parent');
  }
  const footprint = sameParent.filter((h) => {
    try {
      return gridDistance(tacticalOpp, h) <= 5 || gridDistance(tacticalHuman, h) <= 5;
    } catch {
      return false;
    }
  });
  const terrain: Record<string, string> = {};
  for (const h of footprint) terrain[h] = 'plains';
  const tactical: TacticalBattleSnapshot = {
    battleId: 't-best-options-approach',
    enclosingStrategicH3Index: parentCell,
    tacticalChildH3Indexes: footprint,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: terrain,
    subUnits: [
      {
        id: 'opp-arm-far',
        parentUnitId: 'parent-arm',
        player: 'opponent',
        unitType: 'armor',
        h3Index: tacticalOpp,
        displayName: 'Armor',
      },
      {
        id: 'hum-far',
        parentUnitId: 'parent-inf',
        player: 'human',
        unitType: 'infantry',
        h3Index: tacticalHuman,
        displayName: 'Infantry',
      },
    ],
  };
  const strategic: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [{ h3Index: parentCell, terrain: 'land', terrainKind: 'plains' }],
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
    moves.every((r) => gridDistance(r.targetH3, tacticalHuman) < 5),
    'approach targets must reduce distance to the nearest human'
  );
  assert.ok(!moves.some((r) => r.targetH3 === tacticalHuman), 'distant human hex itself is not this-beat reachable');
  assert.ok(
    moves.every((r) => typeof r.enemySummary === 'string' && r.enemySummary.includes('hum-far')),
    'approach Target Units lists nearest enemy unit id'
  );
}

/**
 * Ensures Best Options does not treat a friendly-occupied urban hex as a this-turn ranged or melee target.
 *
 * Purpose: Regression for the tactical interest filter listing own stacks sitting on cities, which suppressed approach-to-enemy rows.
 * When to use: After edits to tactical this-turn ground-move or ranged interest filters.
 * Expected outcome: No ranged/move/melee row onto the friendly urban hex; approach rows toward the distant human instead.
 * Exceptions: Throws when the fixture cannot place an adjacent urban neighbor and a human six steps away under the same parent.
 */
function testTacticalBestOptionsIgnoresFriendlyOccupiedUrbanHex(): void {
  const parentCell = tacticalParentCell(12, 34);
  const tacticalOpp = tacticalUnderCorner(12, 34);
  const sameParent = [...gridDisk(tacticalOpp, 8)].filter((h) => cellToParent(h, 1) === parentCell);
  const tacticalFriendlyUrban = sameParent.find((h) => h !== tacticalOpp && gridDistance(tacticalOpp, h) === 1);
  const tacticalHuman = sameParent.find((h) => h !== tacticalOpp && h !== tacticalFriendlyUrban && gridDistance(tacticalOpp, h) === 6);
  if (!tacticalFriendlyUrban || !tacticalHuman) {
    throw new Error('expected an adjacent urban neighbor and a human six steps away under the same res1 parent');
  }
  const footprint = sameParent.filter((h) => {
    try {
      return gridDistance(tacticalOpp, h) <= 6 || gridDistance(tacticalHuman, h) <= 6;
    } catch {
      return false;
    }
  });
  const terrain: Record<string, string> = {};
  for (const h of footprint) terrain[h] = 'plains';
  const tactical: TacticalBattleSnapshot = {
    battleId: 't-best-options-friendly-urban',
    enclosingStrategicH3Index: parentCell,
    tacticalChildH3Indexes: footprint,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: terrain,
    tacticalIsUrbanByH3: { [tacticalFriendlyUrban]: true },
    subUnits: [
      {
        id: 'opp-arm-shooter',
        parentUnitId: 'parent-arm-a',
        player: 'opponent',
        unitType: 'armor',
        h3Index: tacticalOpp,
        displayName: 'Armor A',
      },
      {
        id: 'opp-arm-on-city',
        parentUnitId: 'parent-arm-b',
        player: 'opponent',
        unitType: 'armor',
        h3Index: tacticalFriendlyUrban,
        displayName: 'Armor B',
      },
      {
        id: 'hum-far-city',
        parentUnitId: 'parent-inf',
        player: 'human',
        unitType: 'infantry',
        h3Index: tacticalHuman,
        displayName: 'Infantry',
      },
    ],
  };
  const strategic: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [{ h3Index: parentCell, terrain: 'land', terrainKind: 'plains' }],
    units: [],
    pendingOrders: [],
    strategicControl: [{ h3Index: parentCell, controllerPlayerId: 'opponent' }],
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
  const shooterRows = rows.filter((r) => r.unitId === 'opp-arm-shooter');
  assert.ok(
    !shooterRows.some((r) => r.targetH3 === tacticalFriendlyUrban && r.actionTypes.includes('ranged')),
    'friendly-occupied urban hex must not appear as a ranged Best Options target'
  );
  assert.ok(
    !shooterRows.some((r) => r.targetH3 === tacticalFriendlyUrban && r.actionTypes.includes('move/melee')),
    'friendly-occupied urban hex must not appear as a move/melee Best Options target'
  );
  const approaches = shooterRows.filter((r) => r.actionTypes.includes('approach'));
  assert.ok(approaches.length >= 1, 'expected approach rows when the only nearby interest hex is a friendly city');
  assert.ok(
    approaches.every((r) => gridDistance(r.targetH3, tacticalHuman) < 6),
    'approach targets must reduce distance to the distant human'
  );
}

/**
 * Ensures tactical Best Options air strikes list human-occupied cells only (same tempo-rule filter as tactical ranged).
 *
 * Purpose: Empty urban tiles must not crowd out, or substitute for, striking observed humans. Plan-state airports live on the enclosing strategic hex.
 * When to use: After edits to this-turn air-strike filtering in `collectAggregatedPossibleActionRows`.
 * Expected outcome: Air strike on the adjacent human; no air strike on an empty urban tile two steps away.
 * Exceptions: Throws when the fixture cannot place those two neighbors under the same parent.
 */
function testTacticalBestOptionsAirStrikesOnlyHumanOccupied(): void {
  const parentCell = tacticalParentCell(12, 34);
  const tacticalAir = tacticalUnderCorner(12, 34);
  const sameParent = [...gridDisk(tacticalAir, 6)].filter((h) => cellToParent(h, 1) === parentCell);
  const tacticalHuman = sameParent.find((h) => h !== tacticalAir && gridDistance(tacticalAir, h) === 1);
  const tacticalEmptyUrban = sameParent.find(
    (h) => h !== tacticalAir && h !== tacticalHuman && gridDistance(tacticalAir, h) === 2
  );
  if (!tacticalHuman || !tacticalEmptyUrban) {
    throw new Error('expected a human neighbor and an empty urban cell two steps away under the same res1 parent');
  }
  const footprint = sameParent.filter((h) => {
    try {
      return gridDistance(tacticalAir, h) <= 3;
    } catch {
      return false;
    }
  });
  const terrain: Record<string, string> = {};
  for (const h of footprint) terrain[h] = 'plains';
  const tactical: TacticalBattleSnapshot = {
    battleId: 't-best-options-air-strike',
    enclosingStrategicH3Index: parentCell,
    tacticalChildH3Indexes: footprint,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: terrain,
    tacticalIsUrbanByH3: { [tacticalEmptyUrban]: true },
    subUnits: [
      {
        id: 'opp-air-strike',
        parentUnitId: 'parent-air',
        player: 'opponent',
        unitType: 'air',
        h3Index: tacticalAir,
        displayName: 'Air',
      },
      {
        id: 'hum-adj-air',
        parentUnitId: 'parent-inf',
        player: 'human',
        unitType: 'infantry',
        h3Index: tacticalHuman,
        displayName: 'Infantry',
      },
    ],
  };
  const strategic: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [{ h3Index: parentCell, terrain: 'land', terrainKind: 'plains' }],
    units: [],
    pendingOrders: [],
    strategicInfrastructure: [{ h3Index: parentCell, urbanHexCount: 1, airportCount: 1, seaportCount: 0 }],
    strategicControl: [{ h3Index: parentCell, controllerPlayerId: 'opponent' }],
  };
  const plan = buildTacticalAiPlanState(strategic, tactical);
  const latLngByH3 = new Map<string, [number, number]>();
  for (const h of plan.hexes.map((x) => x.h3Index)) {
    latLngByH3.set(h, cellToLatLng(h) as [number, number]);
  }
  const rows = collectAggregatedPossibleActionRows({
    state: plan,
    latLngByH3,
    formatLatLng: (ll) => formatLatLng(ll, LATLNG_DECIMAL_PLACES),
    tacticalBattle: tactical,
    forThisTurnOptionsTable: true,
  });
  const strikes = rows.filter(
    (r) => r.unitId === 'opp-air-strike' && r.actionTypes.includes('air strike')
  );
  assert.ok(
    strikes.some((r) => r.targetH3 === tacticalHuman),
    'tactical Best Options must list an air strike on the adjacent human'
  );
  assert.ok(
    !strikes.some((r) => r.targetH3 === tacticalEmptyUrban),
    'tactical Best Options must not list an air strike on empty urban'
  );
}

/**
 * Verifies Best Options still lists a legal strategic ranged target H3 cannot measure directly.
 *
 * Purpose: `collectRangedTargetHexes` skipped any enemy hex whose `gridDistance` threw, so a legal shot across an
 * icosahedron face crossing never reached the table the model is told to act on.
 * When to use: After changes to `collectRangedTargetHexes` or the shared distance fallback.
 * Expected outcome: The unmeasurable enemy hex appears for an air unit whose range covers the derived distance.
 * Exceptions: Fails the assertion when the world hex list has no such pair.
 */
function testStrategicRangedTargetsIncludeUnmeasurablePair(): void {
  const hexes = getOrderedHexList();
  const airRange = getRange('air');
  let pair: [string, string] | null = null;
  for (const origin of hexes) {
    for (const other of hexes) {
      if (other === origin || computeGridDistancePure(origin, other) !== null) continue;
      const derived = computeGridDistanceWithPathFallbackPure(origin, other);
      if (derived !== null && derived >= 1 && derived <= airRange) {
        pair = [origin, other];
        break;
      }
    }
    if (pair) break;
  }
  assert.ok(pair, 'expected a world res1 pair inside air range that gridDistance cannot measure');
  const [unitH3, enemyHex] = pair!;
  const indexed = { enemyUnitsByHex: new Map([[enemyHex, [{ unitType: 'armor' }]]]) };
  assert.deepStrictEqual(collectRangedTargetHexes(unitH3, 'air', indexed), [enemyHex]);

  // An out-of-range pair must still be excluded, so the fallback did not simply stop filtering.
  const farEnemy = hexes.find(
    (h) => (computeGridDistanceWithPathFallbackPure(unitH3, h) ?? 0) > airRange
  );
  assert.ok(farEnemy, 'expected some hex beyond air range');
  const farIndexed = { enemyUnitsByHex: new Map([[farEnemy!, [{ unitType: 'armor' }]]]) };
  assert.deepStrictEqual(collectRangedTargetHexes(unitH3, 'air', farIndexed), []);
}

/**
 * Documents the module-scope binding `tests` (tests).

 * Purpose: Supports maintainability by documenting why `tests` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const tests = [
  {
    name: 'collectRangedTargetHexes keeps a legal target gridDistance cannot measure',
    fn: testStrategicRangedTargetsIncludeUnmeasurablePair,
  },
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
    name: 'collectAggregatedPossibleActionRows tactical Best Options stacked armor share move dests',
    fn: testTacticalBestOptionsStackedArmorShareMoveDests,
  },
  {
    name: 'collectAggregatedPossibleActionRows tactical Best Options approach fallback when enemy out of reach',
    fn: testTacticalBestOptionsApproachFallbackWhenEnemyOutOfReach,
  },
  {
    name: 'collectAggregatedPossibleActionRows tactical Best Options ignores friendly-occupied urban hex',
    fn: testTacticalBestOptionsIgnoresFriendlyOccupiedUrbanHex,
  },
  {
    name: 'collectAggregatedPossibleActionRows tactical Best Options air strikes only human-occupied',
    fn: testTacticalBestOptionsAirStrikesOnlyHumanOccupied,
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
