/**
 * Air-drop rows in Best Options This Turn.
 *
 * Purpose: Locks which hexes are listed, and that a drop sits beside a strike instead of replacing it.
 * When to use: `npm run build:main` then `node dist/main/openRouter/possibleUnitActionsAirDrop.test.js`.
 * Expected outcome: Enemy land and a city the owner does not control are listed. Water, an own city, and a bare airport are not.
 *   A strike still hides the ferry row. A second air unit on the same hex lists a drop when the infantry is free to embark.
 * Exceptions: Throws when the world map has no land hex with four land neighbors.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellToLatLng, gridDisk } from 'h3-js';
import type { GameStateSnapshot } from '../gameDb';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { landUnitCanOccupyHex } from '../../shared/landTraversalStrategic';
import { tacticalChildrenOf } from '../../shared/h3Resolutions';
import { getOrderedHexList, LATLNG_DECIMAL_PLACES } from '../mapData';
import { ensureTerrainClassificationCacheLoaded, getStrategicLandMassByH3 } from '../terrainClassificationCache';
import { collectAggregatedPossibleActionRows } from './possibleUnitActions';
import { airUnitCanListDrop, isStrategicAirDropTarget } from './possibleUnitActionsAirDrop';
import { formatLatLng } from './promptText';

/**
 * Whether this air unit has a Best Options row of one action on one hex.
 *
 * Purpose: The wiring cases share one lookup.
 * When to use: After `collectAggregatedPossibleActionRows`.
 * Expected outcome: True when one row names that unit, action, and hex.
 * Exceptions: None.
 */
function hasAction(rows: readonly { unitId: string; actionTypes: string; targetH3: string }[], unitId: string, action: string, hex: string): boolean {
  return rows.some((row) => row.unitId === unitId && row.targetH3 === hex && row.actionTypes.includes(action));
}

/**
 * A land hex with four land neighbors on the loaded map.
 *
 * Purpose: Drop targets have to be hexes infantry can occupy, which a raw neighbor disk does not guarantee.
 * When to use: The strategic wiring case.
 * Expected outcome: The base and four neighbors, all passable to a land unit.
 * Exceptions: Throws when no such hex exists.
 */
function landBaseWithNeighbors(): { base: string; neighbors: string[] } {
  ensureTerrainClassificationCacheLoaded();
  const landMass = getStrategicLandMassByH3();
  const onMap = new Set(getOrderedHexList());
  for (const base of onMap) {
    if (!landUnitCanOccupyHex(base, landMass)) continue;
    const neighbors = gridDisk(base, 1).filter((hex) => hex !== base && onMap.has(hex) && landUnitCanOccupyHex(hex, landMass));
    if (neighbors.length >= 4) return { base, neighbors: neighbors.slice(0, 4) };
  }
  throw new Error('expected a land hex with four land neighbors');
}

/**
 * One strategic snapshot for the drop-row cases.
 *
 * Purpose: The roster variants differ only by where the infantry is.
 * When to use: The strategic wiring test.
 * Expected outcome: Two air units on an intact airport, plus the four neighbor roles.
 * Exceptions: None.
 */
function strategicState(cargo: 'free' | 'aboard' | 'none'): GameStateSnapshot {
  const { base, neighbors } = landBaseWithNeighbors();
  const [enemyHex, enemyCity, ownCity, bareAirport] = neighbors as [string, string, string, string];
  const infantry =
    cargo === 'none'
      ? []
      : [
          {
            id: 'inf-1',
            player: 'opponent',
            unitType: 'infantry',
            h3Index: base,
            embarkedOnCarrierUnitId: cargo === 'aboard' ? 'air-1' : null,
          },
        ];
  return {
    turnNumber: 1,
    phase: 'planning',
    hexes: [base, enemyHex, enemyCity, ownCity, bareAirport].map((h3Index) => ({
      h3Index,
      terrain: 'land' as const,
      terrainKind: 'plains' as const,
    })),
    units: [
      { id: 'air-1', player: 'opponent', unitType: 'air', h3Index: base },
      { id: 'air-2', player: 'opponent', unitType: 'air', h3Index: base },
      { id: 'human-inf', player: 'human', unitType: 'infantry', h3Index: enemyHex },
      ...infantry,
    ],
    pendingOrders: [],
    strategicInfrastructure: [
      { h3Index: base, urbanHexCount: 0, airportCount: 1, seaportCount: 0 },
      { h3Index: enemyCity, urbanHexCount: 4, airportCount: 0, seaportCount: 0 },
      { h3Index: ownCity, urbanHexCount: 4, airportCount: 1, seaportCount: 0 },
      { h3Index: bareAirport, urbanHexCount: 0, airportCount: 1, seaportCount: 0 },
    ],
    strategicControl: [
      { h3Index: base, controllerPlayerId: 'opponent' },
      { h3Index: enemyCity, controllerPlayerId: 'human' },
      { h3Index: ownCity, controllerPlayerId: 'opponent' },
    ],
  } as unknown as GameStateSnapshot;
}

/**
 * Best Options or the full action list for one snapshot.
 *
 * Purpose: The wiring cases share the collector call.
 * When to use: After `strategicState`.
 * Expected outcome: Aggregated rows. `forThisTurn` selects the Best Options table.
 * Exceptions: None.
 */
function rowsFor(state: GameStateSnapshot, forThisTurn: boolean) {
  const latLngByH3 = new Map<string, [number, number]>();
  for (const hex of state.hexes) latLngByH3.set(hex.h3Index, cellToLatLng(hex.h3Index) as [number, number]);
  return collectAggregatedPossibleActionRows({
    state,
    latLngByH3,
    formatLatLng: (ll) => formatLatLng(ll, LATLNG_DECIMAL_PLACES),
    forThisTurnOptionsTable: forThisTurn,
  });
}

test('a strategic drop target is enemy land or a city the owner does not control', () => {
  assert.equal(
    isStrategicAirDropTarget({
      h3Index: 'enemy',
      owner: 'opponent',
      enemyOccupied: true,
      urbanCellCount: 0,
      controller: 'opponent',
      canOccupy: true,
    }),
    true
  );
  assert.equal(
    isStrategicAirDropTarget({
      h3Index: 'enemy-city',
      owner: 'opponent',
      enemyOccupied: false,
      urbanCellCount: 2,
      controller: 'human',
      canOccupy: true,
    }),
    true
  );
  assert.equal(
    isStrategicAirDropTarget({
      h3Index: 'water',
      owner: 'opponent',
      enemyOccupied: true,
      urbanCellCount: 0,
      controller: null,
      canOccupy: false,
    }),
    false
  );
  assert.equal(
    isStrategicAirDropTarget({
      h3Index: 'own-city',
      owner: 'opponent',
      enemyOccupied: false,
      urbanCellCount: 3,
      controller: 'opponent',
      canOccupy: true,
    }),
    false
  );
  assert.equal(
    isStrategicAirDropTarget({
      h3Index: 'bare-airport',
      owner: 'opponent',
      enemyOccupied: false,
      urbanCellCount: 0,
      controller: null,
      canOccupy: true,
    }),
    false
  );
});

test('only infantry aboard or free on the hex lets an air unit list a drop', () => {
  const air = { id: 'air-1', player: 'opponent', unitType: 'air', h3Index: 'base', carrierId: null };
  const free = { id: 'inf-1', player: 'opponent', unitType: 'infantry', h3Index: 'base', carrierId: null };
  assert.equal(airUnitCanListDrop({ airUnitId: air.id, airH3Index: air.h3Index, owner: air.player, roster: [air, free] }), true);
  assert.equal(
    airUnitCanListDrop({
      airUnitId: 'air-2',
      airH3Index: 'base',
      owner: 'opponent',
      roster: [air, { ...free, carrierId: 'air-1' }],
    }),
    false
  );
  assert.equal(
    airUnitCanListDrop({
      airUnitId: air.id,
      airH3Index: air.h3Index,
      owner: air.player,
      roster: [air, { ...free, unitType: 'armor' }],
    }),
    false
  );
});

test('Best Options lists a drop beside a strike, and a free infantry unit covers every air unit on the hex', () => {
  const state = strategicState('free');
  const [enemyHex, enemyCity, ownCity, bareAirport] = state.hexes.slice(1).map((hex) => hex.h3Index) as [
    string,
    string,
    string,
    string,
  ];
  const thisTurn = rowsFor(state, true);
  for (const unitId of ['air-1', 'air-2']) {
    assert.equal(hasAction(thisTurn, unitId, 'air drop', enemyHex), true, `${unitId} drop on enemy land`);
    assert.equal(hasAction(thisTurn, unitId, 'air drop', enemyCity), true, `${unitId} drop on an enemy city`);
    assert.equal(hasAction(thisTurn, unitId, 'air strike', enemyHex), true, `${unitId} keeps its strike`);
    assert.equal(hasAction(thisTurn, unitId, 'air drop', ownCity), false, `${unitId} does not drop on its own city`);
    assert.equal(hasAction(thisTurn, unitId, 'air drop', bareAirport), false, `${unitId} does not drop on a bare airport`);
    assert.equal(
      thisTurn.some((row) => row.unitId === unitId && row.actionTypes.includes('ferry')),
      false,
      `${unitId} strike still hides ferry`
    );
  }
  const full = rowsFor(state, false);
  assert.equal(
    full.some((row) => row.actionTypes.includes('air drop')),
    false,
    'the full action list does not add drop rows'
  );
  assert.equal(hasAction(full, 'air-1', 'ferry', ownCity), true, 'a ferry to the owned airport remains outside Best Options');

  const aboard = rowsFor(strategicState('aboard'), true);
  assert.equal(hasAction(aboard, 'air-1', 'air drop', enemyHex), true);
  assert.equal(aboard.some((row) => row.unitId === 'air-2' && row.actionTypes.includes('air drop')), false);
  const empty = rowsFor(strategicState('none'), true);
  assert.equal(empty.some((row) => row.actionTypes.includes('air drop')), false);
});

/**
 * A five-cell battle on real tactical children of one map hex.
 *
 * Purpose: Parent lookup has to succeed, and the drop listing reads sub-units plus the enclosing controller.
 * When to use: The tactical wiring case.
 * Expected outcome: Two air units, optional infantry, an enemy cell, a fortified enemy cell, a city, and rubble.
 *   `leadPartyId` marks an AI-only battle. `embarkedOn` puts the infantry aboard that air sub-unit.
 * Exceptions: Throws when the first map hex has fewer than five tactical children.
 */
function tacticalBattle(withInfantry: boolean, leadPartyId?: string, embarkedOn?: string): {
  state: GameStateSnapshot;
  battle: TacticalBattleSnapshot;
  cells: { origin: string; enemy: string; fortified: string; city: string; rubble: string };
} {
  const parent = getOrderedHexList()[0]!;
  const children = tacticalChildrenOf(parent);
  if (children.length < 5) throw new Error('expected five tactical children');
  const cells = {
    origin: children[0]!,
    enemy: children[1]!,
    fortified: children[2]!,
    city: children[3]!,
    rubble: children[4]!,
  };
  const air = (id: string): TacticalSubUnitSnapshot => ({
    id,
    parentUnitId: id,
    player: 'opponent',
    unitType: 'air',
    h3Index: cells.origin,
    displayName: id,
  });
  const infantry: TacticalSubUnitSnapshot = {
    id: 'inf-1',
    parentUnitId: 'inf-1',
    player: 'opponent',
    unitType: 'infantry',
    h3Index: cells.origin,
    displayName: 'Infantry',
    ...(embarkedOn ? { embarkedOnSubUnitId: embarkedOn } : {}),
  };
  const enemy = (id: string, h3Index: string): TacticalSubUnitSnapshot => ({
    id,
    parentUnitId: id,
    player: 'human',
    unitType: 'infantry',
    h3Index,
    displayName: id,
  });
  const subUnits = [air('air-1'), air('air-2'), enemy('enemy-1', cells.enemy), enemy('enemy-2', cells.fortified)];
  if (withInfantry) subUnits.push(infantry);
  const terrain = {
    [cells.origin]: 'plains',
    [cells.enemy]: 'plains',
    [cells.fortified]: 'plains',
    [cells.city]: 'plains',
    [cells.rubble]: 'plains',
  };
  const battle = {
    battleId: 'drop-rows',
    enclosingStrategicH3Index: parent,
    tacticalTurnNumber: 1,
    tacticalChildH3Indexes: [cells.origin, cells.enemy, cells.fortified, cells.city, cells.rubble],
    subUnits,
    tacticalTerrainKindByH3: terrain,
    tacticalIsUrbanByH3: { [cells.city]: true, [cells.rubble]: true },
    tacticalIsRubbleByH3: { [cells.rubble]: true },
    tacticalFortificationOwnerByH3: { [cells.fortified]: 'human' },
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    ...(leadPartyId ? { leadPartyId } : {}),
  } as unknown as TacticalBattleSnapshot;
  const state = {
    turnNumber: 1,
    phase: 'planning',
    playerPerspective: 'opponent',
    hexes: [{ h3Index: parent, terrain: 'land', terrainKind: 'plains' }],
    units: [
      { id: 'air-1', player: 'opponent', unitType: 'air', h3Index: cells.origin },
      { id: 'air-2', player: 'opponent', unitType: 'air', h3Index: cells.origin },
    ],
    pendingOrders: [],
    strategicControl: [{ h3Index: parent, controllerPlayerId: 'human' }],
  } as unknown as GameStateSnapshot;
  return { state, battle, cells };
}

test('a tactical drop lists an enemy cell and a city, and skips a fortified cell', () => {
  const listed = tacticalBattle(true);
  const rows = collectAggregatedPossibleActionRows({
    state: listed.state,
    latLngByH3: new Map([[listed.cells.origin, [0, 0]]]),
    formatLatLng: () => 'AA',
    tacticalBattle: listed.battle,
    forThisTurnOptionsTable: true,
  });
  for (const unitId of ['air-1', 'air-2']) {
    assert.equal(hasAction(rows, unitId, 'air drop', listed.cells.enemy), true, `${unitId} drops on an enemy cell`);
    assert.equal(hasAction(rows, unitId, 'air drop', listed.cells.city), true, `${unitId} drops on a city the owner does not control`);
    assert.equal(hasAction(rows, unitId, 'air drop', listed.cells.fortified), false, `${unitId} does not drop on a fortified cell`);
    assert.equal(hasAction(rows, unitId, 'air drop', listed.cells.rubble), false, `${unitId} does not treat rubble as a city`);
    assert.equal(hasAction(rows, unitId, 'air drop', listed.cells.origin), false, `${unitId} does not drop on its own cell`);
  }
  const empty = tacticalBattle(false);
  const withoutInfantry = collectAggregatedPossibleActionRows({
    state: empty.state,
    latLngByH3: new Map([['parent', [0, 0]]]),
    formatLatLng: () => 'AA',
    tacticalBattle: empty.battle,
    forThisTurnOptionsTable: true,
  });
  assert.equal(withoutInfantry.some((row) => row.actionTypes.includes('air drop')), false);
});

/**
 * The lead side of an AI-only battle embarks after the drop, so a free infantry sub-unit is not a legal cargo source this beat.
 *
 * Purpose: Best Options must not list a drop the engine will skip.
 * When to use: After the tactical listing case.
 * Expected outcome: The lead side lists a drop only when infantry is already aboard. The other side still lists one for free infantry.
 * Exceptions: None.
 */
test('the lead side of an AI-only battle lists a drop only when infantry is already aboard', () => {
  const collect = (battle: ReturnType<typeof tacticalBattle>) =>
    collectAggregatedPossibleActionRows({
      state: battle.state,
      latLngByH3: new Map([[battle.cells.origin, [0, 0]]]),
      formatLatLng: () => 'AA',
      tacticalBattle: battle.battle,
      forThisTurnOptionsTable: true,
    });
  const leadFreeBattle = tacticalBattle(true, 'opponent');
  const leadFree = collect(leadFreeBattle);
  assert.equal(leadFree.some((row) => row.actionTypes.includes('air drop')), false);
  const leadAboardBattle = tacticalBattle(true, 'opponent', 'air-1');
  const leadAboard = collect(leadAboardBattle);
  assert.equal(hasAction(leadAboard, 'air-1', 'air drop', leadAboardBattle.cells.enemy), true);
  assert.equal(leadAboard.some((row) => row.unitId === 'air-2' && row.actionTypes.includes('air drop')), false);
  const otherSide = tacticalBattle(true, 'opponent2');
  const otherRows = collect(otherSide);
  assert.equal(hasAction(otherRows, 'air-1', 'air drop', otherSide.cells.enemy), true);
});
