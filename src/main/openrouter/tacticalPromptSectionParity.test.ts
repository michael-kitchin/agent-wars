/**
 * Contract tests for tactical prompt section parity (lightweight assessments, briefing sections, air/sealift omit, callback stash/restore).
 *
 * Purpose: Locks inclusion/omission and parent→sub adaptations without requiring a full OpenRouter round-trip.
 * When to use: `npm test` after `build:main` when changing tactical briefing or callback lifecycle.
 * Expected outcome: Always-include sections present; air/naval omitted without typed units; pre-battle callbacks restored after stash/restore.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { cellToChildren, cellToLatLng, gridDistance } from 'h3-js';
import {
  closeGameDatabaseForTests,
  dbRun,
  openGameDatabaseAtPathForTests,
  resetGameForNewMatch,
} from '../gameDb';
import type { GameStateSnapshot } from '../gameDb';
import { buildLatLngCoordinateMap } from '../mapData';
import { getSubscriptions, replaceSubscriptions } from '../callbackSubscriptions';
import { buildTacticalAiPlanState } from '../tacticalBattle/buildTacticalAiPlanState';
import {
  tacticalRes1Cell,
  tacticalRes4UnderRes1Corner,
  firstRingCellDistinctFrom,
} from '../tacticalBattle/testSupport/tacticalRes4HexFixtures';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { getInjectionText as getStandingOrderInjectionText } from '../tools/tool5StandingOrders';
import { buildAirOperationsBriefingBlock, buildSealiftBriefingBlock } from './briefingSections';
import { formatTacticalBriefing } from './formatTacticalBriefing';
import {
  buildLightweightTacticalUnitAssessments,
  buildTacticalBriefingNarrative,
  parentUnitIdFromTacticalSubUnitId,
} from './tacticalBriefingAssessments';
import {
  resetTacticalCallbackSubscriptionStashForTests,
  restoreOpponentCallbackSubscriptionsAfterTacticalBattle,
  stashOpponentCallbackSubscriptionsForTacticalBattle,
  hydrateOpponentCallbackStashFromGameConfig,
  filterCallbackSubscriptionsForTacticalBattleRoster,
} from './tacticalCallbackSubscriptionLifecycle';
import {
  clearTacticalCallbackStashFromGameConfig,
  tacticalCallbackStashConfigExists,
} from '../tacticalBattle/tacticalCallbackStashPersistence';
import { buildSystemPromptForTools } from './openRouterBuildSystemPrompt';
import { WIN_CONDITION_REMINDER_FIRST_SENTENCE } from './scenarioGoals';
import { initTacticalCoordinateRegistry } from '../briefing/map/hex-coordinates';

/**
 * Builds a minimal land-only tactical battle with adjacent opponent and human sub-units.
 *
 * Purpose: Shared fixture for assessment, briefing, and standing-order projection tests.
 * When to use: Any parity test that needs a valid operational map footprint.
 * Expected outcome: Snapshot + planState + latLng map ready for `formatTacticalBriefing`.
 * Exceptions: None.
 */
function buildLandBattleFixture(options?: {
  battleId?: string;
  includeAir?: boolean;
  includeNaval?: boolean;
  embarkInfantryOnNaval?: boolean;
}): {
  battle: TacticalBattleSnapshot;
  planState: GameStateSnapshot;
  latLngByH3: Map<string, [number, number]>;
  opponentSubId: string;
  parentId: string;
  humanSubId: string;
  res4Opp: string;
  res4Hum: string;
} {
  const battleId = options?.battleId ?? 'parity-land-battle';
  const res1 = tacticalRes1Cell(12, 34);
  const res4Children = [...cellToChildren(res1, 4)];
  const res4Opp = tacticalRes4UnderRes1Corner(12, 34, { latEpsilon: 0.01 });
  const res4Hum = firstRingCellDistinctFrom(res4Opp);
  const parentId = 'opp-parent-armor-1';
  const opponentSubId = `${parentId}:01`;
  const humanSubId = 'hum-parent-inf-1:01';
  const subUnits: TacticalBattleSnapshot['subUnits'] = [
    {
      id: opponentSubId,
      parentUnitId: parentId,
      player: 'opponent',
      unitType: 'armor',
      h3Index: res4Opp,
      displayName: 'Opp Armor (01)',
    },
    {
      id: humanSubId,
      parentUnitId: 'hum-parent-inf-1',
      player: 'human',
      unitType: 'infantry',
      h3Index: res4Hum,
      displayName: 'Hum Infantry (01)',
    },
  ];
  if (options?.includeAir) {
    subUnits.push({
      id: 'opp-parent-air-1:01',
      parentUnitId: 'opp-parent-air-1',
      player: 'opponent',
      unitType: 'air',
      h3Index: res4Opp,
      displayName: 'Opp Air (01)',
    });
  }
  if (options?.includeNaval) {
    const navalId = 'opp-parent-naval-1:01';
    const infantryId = 'opp-parent-inf-1:01';
    subUnits.push({
      id: navalId,
      parentUnitId: 'opp-parent-naval-1',
      player: 'opponent',
      unitType: 'naval',
      h3Index: res4Opp,
      displayName: 'Opp Naval (01)',
    });
    if (options.embarkInfantryOnNaval) {
      subUnits.push({
        id: infantryId,
        parentUnitId: 'opp-parent-inf-1',
        player: 'opponent',
        unitType: 'infantry',
        h3Index: res4Opp,
        displayName: 'Opp Infantry (01)',
        embarkedOnSubUnitId: navalId,
      });
    }
  }
  const battle: TacticalBattleSnapshot = {
    battleId,
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: res4Children,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 3,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    subUnits,
  };
  const strategic: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [{ h3Index: res1, terrain: 'land', terrainKind: 'plains' }],
    units: [],
    pendingOrders: [],
  };
  const planState = buildTacticalAiPlanState(strategic, battle);
  const { latLngByH3 } = buildLatLngCoordinateMap(planState.hexes.map((h) => h.h3Index));
  initTacticalCoordinateRegistry(battleId, res1);
  return { battle, planState, latLngByH3, opponentSubId, parentId, humanSubId, res4Opp, res4Hum };
}

/**
 * Opens a temp SQLite DB for tests that read standing orders or callback subscriptions.
 *
 * Purpose: Isolates DB-backed parity checks from the developer's game database.
 * When to use: Wrap tests that call `dbRun`, `getSubscriptions`, or standing-order injection.
 * Expected outcome: Fresh match schema; caller must close and delete the temp dir in `finally`.
 * Exceptions: None.
 */
function withTempDb(fn: () => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-tactical-parity-'));
  const dbPath = path.join(dir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    fn();
  } finally {
    resetTacticalCallbackSubscriptionStashForTests();
    closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('parentUnitIdFromTacticalSubUnitId strips slot suffix', () => {
  assert.equal(parentUnitIdFromTacticalSubUnitId('parent-a:01'), 'parent-a');
  assert.equal(parentUnitIdFromTacticalSubUnitId('no-slot'), 'no-slot');
});

test('lightweight assessments report nearest enemy distance and critical adjacency', () => {
  withTempDb(() => {
    const { battle, opponentSubId, humanSubId, res4Opp, res4Hum } = buildLandBattleFixture();
    const assessments = buildLightweightTacticalUnitAssessments(battle);
    assert.equal(assessments.length, 1);
    const row = assessments[0]!;
    assert.equal(row.unitId, opponentSubId);
    const nearest = row.result.nearbyEnemies[0];
    assert.ok(nearest);
    assert.equal(nearest.unitId, humanSubId);
    assert.equal(nearest.hexDistance, gridDistance(res4Opp, res4Hum));
    assert.equal(nearest.inMeleeRange, nearest.hexDistance <= 1);
    if (nearest.inMeleeRange) {
      assert.ok(row.result.threats.some((t) => t.severity === 'critical'));
    }
    const narrative = buildTacticalBriefingNarrative(battle, assessments);
    assert.match(narrative, /Tactical beat 3/);
    assert.match(narrative, /sub-unit/);
  });
});

test('lightweight assessments mark embarked cargo and omit standing orders', () => {
  withTempDb(() => {
    const { battle, parentId } = buildLandBattleFixture({
      includeNaval: true,
      embarkInfantryOnNaval: true,
    });
    dbRun(
      `INSERT INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
       VALUES ('opponent', ?, 'hold_fire', '{}', NULL, 'holding', 1, '[0,0]')`,
      [parentId]
    );
    const assessments = buildLightweightTacticalUnitAssessments(battle);
    const embarked = assessments.find((a) => a.unitId === 'opp-parent-inf-1:01');
    assert.ok(embarked);
    assert.ok(
      (embarked.result.threats ?? []).some((t) => t.description.includes('Embarked on')),
      'embarked infantry should carry an embark threat note'
    );
    const armor = assessments.find((a) => a.unitId.startsWith(parentId));
    assert.ok(armor);
    assert.equal(armor.result.unit.currentStandingOrder, null, 'tactical assessments must not inherit parent standing orders');
  });
});

test('formatTacticalBriefing includes always-on sections and omits standing-order plus strategic-only sections', () => {
  withTempDb(() => {
    const { battle, planState, latLngByH3, opponentSubId } = buildLandBattleFixture({
      battleId: 'parity-briefing-sections',
    });
    const md = formatTacticalBriefing({ planState, latLngByH3, tacticalBattle: battle });
    assert.ok(md.includes("# Commander's Briefing"));
    assert.ok(md.includes('## Unit Status and Threats'));
    assert.ok(md.includes('| Unit ID | Type | Hex |'), 'Unit Status includes Type');
    assert.ok(md.includes('## Attention Flags'));
    assert.ok(md.includes('# Operational Map'));
    assert.ok(!md.includes('### Unit Roster'), 'tactical omits Unit Roster; Unit Status covers threats');
    assert.ok(!md.includes('Standing order'));
    assert.ok(!md.includes('# Standing Order Status'));
    assert.ok(!md.includes('## Units Without Standing Orders'));
    assert.ok(md.includes('## Active Callbacks'));
    assert.ok(md.includes(opponentSubId));
    assert.ok(!md.includes('# Production Status'));
    assert.ok(!md.includes('# Your Strategic Memory'));
    assert.ok(!md.includes('## Supplemental Hex Intelligence'));
    assert.ok(!md.includes('# Scenario Objective'));
    assert.ok(!md.includes('# Air Operations Status'), 'air section lives in shell, not briefing override');
    assert.ok(!md.includes('# Naval Transport Status'), 'sealift section lives in shell, not briefing override');
  });
});

test('getInjectionText returns empty in tactical mode', () => {
  withTempDb(() => {
    const { battle, planState, parentId } = buildLandBattleFixture({
      battleId: 'parity-standing-omit',
    });
    dbRun(
      `INSERT INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
       VALUES ('opponent', ?, 'hold_fire', '{}', NULL, 'holding', 1, '[0,0]')`,
      [parentId]
    );
    const text = getStandingOrderInjectionText('opponent', planState, {
      mode: 'tactical',
      battleId: battle.battleId,
    });
    assert.equal(text, '');
  });
});

test('tactical air and sealift blocks omit when roster lacks type and adapt columns when present', () => {
  const landOnly = buildLandBattleFixture({ battleId: 'parity-air-omit' });
  const format = (h3: string) => h3.slice(0, 4);
  assert.equal(buildAirOperationsBriefingBlock(landOnly.planState, format, 'tactical'), '');
  assert.equal(buildSealiftBriefingBlock(landOnly.planState, format, 'tactical'), '');

  const withAir = buildLandBattleFixture({ battleId: 'parity-air-include', includeAir: true });
  const airMd = buildAirOperationsBriefingBlock(withAir.planState, format, 'tactical');
  assert.ok(airMd.includes('# Air Operations Status'));
  assert.ok(airMd.includes('Enemy Unit Targets'));
  assert.ok(!airMd.includes('Ferry Destinations'));
  assert.ok(!airMd.includes('Strikeable Urban'));

  const withNaval = buildLandBattleFixture({
    battleId: 'parity-sealift-include',
    includeNaval: true,
    embarkInfantryOnNaval: true,
  });
  const sealiftMd = buildSealiftBriefingBlock(withNaval.planState, format, 'tactical');
  assert.ok(sealiftMd.includes('# Naval Transport Status'));
  assert.ok(sealiftMd.includes('Aboard'));
  assert.ok(sealiftMd.includes('opp-parent-inf-1:01'));
  assert.ok(!sealiftMd.includes('Nearest Embark'));

  const strategicEmptyAir = buildAirOperationsBriefingBlock(
    { ...landOnly.planState, units: landOnly.planState.units.filter((u) => u.unitType !== 'air') },
    format,
    'strategic'
  );
  assert.ok(strategicEmptyAir.includes('# Air Operations Status'), 'strategic keeps always-on empty-state');
});

test('callback stash restores pre-battle subscriptions and drops tactical sub-unit callbacks', () => {
  withTempDb(() => {
    replaceSubscriptions(
      'opponent',
      [{ event: 'turns', params: { n: 2 }, subscribedTurn: 5 }],
      5
    );
    stashOpponentCallbackSubscriptionsForTacticalBattle();
    replaceSubscriptions(
      'opponent',
      [{ event: 'unit_destroyed', params: { unitId: 'opp-parent-armor-1:01' }, subscribedTurn: 1 }],
      1
    );
    assert.equal(getSubscriptions('opponent')[0]?.event, 'unit_destroyed');
    restoreOpponentCallbackSubscriptionsAfterTacticalBattle();
    const restored = getSubscriptions('opponent');
    assert.equal(restored.length, 1);
    assert.equal(restored[0]?.event, 'turns');
    assert.equal((restored[0]?.params as { n?: number }).n, 2);
    assert.ok(
      !restored.some((s) => String(s.params?.unitId ?? '').includes(':')),
      'sub-unit callbacks must not remain after restore'
    );
  });
});

test('callback stash persists to game_config and hydrates after memory clear', () => {
  withTempDb(() => {
    replaceSubscriptions(
      'opponent',
      [{ event: 'turns', params: { n: 4 }, subscribedTurn: 2 }],
      2
    );
    stashOpponentCallbackSubscriptionsForTacticalBattle();
    assert.ok(tacticalCallbackStashConfigExists(), 'stash should be written to game_config');
    resetTacticalCallbackSubscriptionStashForTests();
    hydrateOpponentCallbackStashFromGameConfig();
    replaceSubscriptions(
      'opponent',
      [{ event: 'unit_engaged', params: { unitId: 'opp-parent-armor-1:01' }, subscribedTurn: 1 }],
      1
    );
    restoreOpponentCallbackSubscriptionsAfterTacticalBattle();
    const restored = getSubscriptions('opponent');
    assert.equal(restored.length, 1);
    assert.equal(restored[0]?.event, 'turns');
    assert.equal((restored[0]?.params as { n?: number }).n, 4);
    assert.ok(!tacticalCallbackStashConfigExists(), 'stash key cleared after restore');
  });
});

test('missing stash selectively clears parent:slot callbacks and keeps strategic ones', () => {
  withTempDb(() => {
    replaceSubscriptions(
      'opponent',
      [
        { event: 'turns', params: { n: 3 }, subscribedTurn: 1 },
        { event: 'unit_engaged', params: { unitId: 'opp-parent-armor-1:01' }, subscribedTurn: 1 },
        { event: 'unit_engaged', params: { unitId: 'strategic-parent-1' }, subscribedTurn: 1 },
      ],
      1
    );
    resetTacticalCallbackSubscriptionStashForTests();
    clearTacticalCallbackStashFromGameConfig();
    restoreOpponentCallbackSubscriptionsAfterTacticalBattle();
    const remaining = getSubscriptions('opponent');
    assert.ok(remaining.some((s) => s.event === 'turns'));
    assert.ok(remaining.some((s) => s.params?.unitId === 'strategic-parent-1'));
    assert.ok(!remaining.some((s) => s.params?.unitId === 'opp-parent-armor-1:01'));
  });
});

test('double restore does not wipe restored strategic callbacks', () => {
  withTempDb(() => {
    replaceSubscriptions(
      'opponent',
      [{ event: 'turns', params: { n: 1 }, subscribedTurn: 7 }],
      7
    );
    stashOpponentCallbackSubscriptionsForTacticalBattle();
    replaceSubscriptions(
      'opponent',
      [{ event: 'unit_engaged', params: { unitId: 'opp-parent-armor-1:01' }, subscribedTurn: 1 }],
      1
    );
    restoreOpponentCallbackSubscriptionsAfterTacticalBattle();
    restoreOpponentCallbackSubscriptionsAfterTacticalBattle();
    const remaining = getSubscriptions('opponent');
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0]?.event, 'turns');
  });
});

test('filterCallbackSubscriptionsForTacticalBattleRoster drops invalid unit ids and keeps siblings', () => {
  const roster = new Set(['opp-parent-armor-1:01', 'hum-parent-inf-1:01']);
  const { kept, droppedCount } = filterCallbackSubscriptionsForTacticalBattleRoster(
    [
      { event: 'turns', params: { n: 2 } },
      { event: 'unit_engaged', params: { unitId: 'opp-parent-armor-1:01' } },
      { event: 'unit_engaged', params: { unitId: 'strategic-parent-1' } },
      { event: 'unit_destroyed', params: { side: 'own' } },
      { event: 'unit_destroyed', params: { unitId: 'not-in-roster:01' } },
      { event: 'unit_engaged', params: { unitId: 'hum-parent-inf-1:01' } },
    ],
    roster
  );
  assert.equal(droppedCount, 2);
  assert.equal(kept.length, 4);
  assert.ok(kept.some((s) => s.event === 'turns'));
  assert.ok(kept.some((s) => s.params?.unitId === 'opp-parent-armor-1:01'));
  assert.ok(kept.some((s) => s.params?.unitId === 'hum-parent-inf-1:01'));
  assert.ok(kept.some((s) => s.params?.side === 'own'));
  assert.ok(!kept.some((s) => s.params?.unitId === 'strategic-parent-1'));
  assert.ok(!kept.some((s) => s.params?.unitId === 'not-in-roster:01'));
});

test('tactical system prompt omits Scenario Objective and includes battle goal plus adapted air when air present', () => {
  withTempDb(() => {
    const { battle, planState, latLngByH3 } = buildLandBattleFixture({
      battleId: 'parity-shell-scenario',
      includeAir: true,
    });
    const briefing = formatTacticalBriefing({ planState, latLngByH3, tacticalBattle: battle });
    const coordMap = {
      latLngByH3,
      resolveToH3: (lat: number, lng: number) => {
        for (const [h3, ll] of latLngByH3) {
          if (Math.abs(ll[0] - lat) < 1e-9 && Math.abs(ll[1] - lng) < 1e-9) return h3;
        }
        return undefined;
      },
      format: (h3: string) => {
        const ll = cellToLatLng(h3);
        return `${ll[0].toFixed(2)},${ll[1].toFixed(2)}`;
      },
    };
    const prompt = buildSystemPromptForTools(
      planState,
      coordMap,
      ['plan_route'],
      briefing,
      { mode: 'tactical', battleId: battle.battleId, tacticalTurnNumber: battle.tacticalTurnNumber }
    );
    assert.ok(!prompt.includes('# Scenario Objective (Required)'));
    assert.ok(!prompt.includes(WIN_CONDITION_REMINDER_FIRST_SENTENCE));
    assert.ok(prompt.includes('engage and defeat enemy forces in this battle'));
    assert.ok(prompt.includes(`tactical beat: ${battle.tacticalTurnNumber}`));
    assert.ok(!prompt.includes('- Explored:'));
    assert.ok(!prompt.includes('# Production Status'));
    assert.ok(!prompt.includes('# Your Strategic Memory'));
    assert.ok(prompt.includes("# Commander's Briefing"));
    assert.ok(prompt.includes('# Air Operations Status'));
    assert.ok(prompt.includes('Air rules (tactical)'));
    assert.ok(prompt.includes('airStrikes'));
    assert.ok(prompt.includes('tactical sub-unit ids'));
    assert.ok(prompt.includes('Do not emit assign_order'));
    assert.ok(prompt.includes('Standing orders do not move units'));
    assert.ok(!prompt.includes('query_orders'));
    assert.ok(!prompt.includes('# Standing Order Status'));
    assert.ok(!prompt.includes('Your units (ID, type, briefing hex)'));
    assert.ok(!prompt.includes('When assess_unit reports'));
    assert.ok(!prompt.includes('use estimate_combat to pick'));
    assert.ok(!prompt.includes('prioritize scouting this turn'));
  });
});
