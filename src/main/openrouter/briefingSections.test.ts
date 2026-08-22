/**
 * Contract tests for strategic Naval Transport Status briefing copy.
 * Run with: node dist/main/openrouter/briefingSections.test.js
 */

import assert from 'node:assert/strict';
import type { GameStateSnapshot } from '../gameDb';
import { buildSealiftBriefingBlock } from './briefingSections';

/** Water hex with no seaport (briefing B0). */
const WATER_NO_PORT = '810ebffffffffff';
/** Adjacent land-mass hex used as uncontrolled coastal embark terrain. */
const COASTAL_NO_CONTROL = '81127ffffffffff';
/** Inland hex used as an uncontrolled land seaport. */
const LAND_SEAPORT_NO_CONTROL = '8127bffffffffff';
/** Water hex with a seaport used as an uncontrolled water port. */
const WATER_SEAPORT_NO_CONTROL = '812a3ffffffffff';

/**
 * Builds a minimal strategic snapshot for sealift briefing assertions.
 *
 * Purpose: Avoid a live DB while still using valid res1 indexes so `gridDistance` can score nearest embark.
 * When to use: Strategic `buildSealiftBriefingBlock` cases in this file.
 * Expected outcome: `format` can be a stub; hex/unit/control/infra arrays drive the table.
 * Exceptions: None.
 */
function sealiftSnapshot(args: {
  navalH3: string;
  hexes: GameStateSnapshot['hexes'];
  control?: NonNullable<GameStateSnapshot['res1Control']>;
  infra?: NonNullable<GameStateSnapshot['res1Infrastructure']>;
  extraUnits?: GameStateSnapshot['units'];
}): GameStateSnapshot {
  return {
    hexes: args.hexes,
    units: [
      { id: 'opponent-naval-1', player: 'opponent', unitType: 'naval', h3Index: args.navalH3 },
      ...(args.extraUnits ?? []),
    ],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
    res1Control: args.control ?? [],
    res1Infrastructure: args.infra ?? [],
  } as GameStateSnapshot;
}

/**
 * Locks the strategic embark sentence to the same rule as `canEmbarkAtHex`.
 *
 * Purpose: The AI prompt must not require control for coastal or land seaports, and must not treat open water as a port.
 * When to use: After edits to `buildSealiftBriefingBlock` copy.
 * Expected outcome: Sentence names coastal, land seaport, and controlled water seaport.
 * Exceptions: Propagates assertion errors.
 */
function testStrategicEmbarkSentenceMatchesEngine(): void {
  const md = buildSealiftBriefingBlock(
    sealiftSnapshot({
      navalH3: WATER_NO_PORT,
      hexes: [{ h3Index: WATER_NO_PORT, terrain: 'water', terrainKind: 'water' }],
    }),
    (h3) => h3,
    'strategic'
  );
  assert.match(md, /Embark: coastal or land seaport \(control not required\), or a water seaport you control\./);
  assert.doesNotMatch(md, /your-controlled coastal hex/);
}

/**
 * Verifies nearest embark can be an uncontrolled coastal hex and never a water hex with no seaport.
 *
 * Purpose: Nearest-embark search must use `canEmbarkAtHex`, not a control-always shortcut.
 * When to use: After edits to nearest-embark scoring.
 * Expected outcome: Coastal neighbor is listed; water-without-seaport is not treated as the embark hex.
 * Exceptions: Propagates assertion errors.
 */
function testNearestEmbarkUsesEngineEligibility(): void {
  const md = buildSealiftBriefingBlock(
    sealiftSnapshot({
      navalH3: WATER_NO_PORT,
      hexes: [
        { h3Index: WATER_NO_PORT, terrain: 'water', terrainKind: 'water' },
        { h3Index: COASTAL_NO_CONTROL, terrain: 'coastal', terrainKind: 'coastal' },
      ],
      control: [{ h3Index: WATER_NO_PORT, controllerPlayerId: 'opponent' }],
    }),
    (h3) => h3,
    'strategic'
  );
  assert.match(md, new RegExp(`${COASTAL_NO_CONTROL} at hex distance `));
  assert.doesNotMatch(md, new RegExp(`${WATER_NO_PORT} at hex distance 0`));
}

/**
 * Verifies an uncontrolled land seaport is a legal nearest-embark hex.
 *
 * Purpose: Land seaports embark without control, matching `canEmbarkAtHex`.
 * When to use: After edits to nearest-embark scoring.
 * Expected outcome: The land seaport is listed as nearest.
 * Exceptions: Propagates assertion errors.
 */
function testNearestEmbarkIncludesUncontrolledLandSeaport(): void {
  const md = buildSealiftBriefingBlock(
    sealiftSnapshot({
      navalH3: WATER_NO_PORT,
      hexes: [
        { h3Index: WATER_NO_PORT, terrain: 'water', terrainKind: 'water' },
        { h3Index: LAND_SEAPORT_NO_CONTROL, terrain: 'land', terrainKind: 'plains' },
      ],
      infra: [
        {
          h3Index: LAND_SEAPORT_NO_CONTROL,
          urbanHexCount: 0,
          airportCount: 0,
          seaportCount: 1,
        },
      ],
    }),
    (h3) => h3,
    'strategic'
  );
  assert.match(md, new RegExp(`${LAND_SEAPORT_NO_CONTROL} at hex distance `));
}

/**
 * Verifies an uncontrolled water seaport is not treated as an embark hex.
 *
 * Purpose: Water seaports still require acting-player control.
 * When to use: After edits to nearest-embark scoring.
 * Expected outcome: Nearest embark is `—` when the only port is an uncontrolled water seaport.
 * Exceptions: Propagates assertion errors.
 */
function testNearestEmbarkSkipsUncontrolledWaterSeaport(): void {
  const md = buildSealiftBriefingBlock(
    sealiftSnapshot({
      navalH3: WATER_NO_PORT,
      hexes: [
        { h3Index: WATER_NO_PORT, terrain: 'water', terrainKind: 'water' },
        { h3Index: WATER_SEAPORT_NO_CONTROL, terrain: 'water', terrainKind: 'water' },
      ],
      infra: [
        {
          h3Index: WATER_SEAPORT_NO_CONTROL,
          urbanHexCount: 0,
          airportCount: 0,
          seaportCount: 1,
        },
      ],
    }),
    (h3) => h3,
    'strategic'
  );
  assert.match(md, /\| 0\/2 \| — \|/);
}

/**
 * Verifies a water seaport the opponent controls is a legal nearest-embark hex.
 *
 * Purpose: Completes the engine truth table for water seaports with control.
 * When to use: After edits to nearest-embark scoring.
 * Expected outcome: The controlled water seaport is listed as nearest.
 * Exceptions: Propagates assertion errors.
 */
function testNearestEmbarkIncludesControlledWaterSeaport(): void {
  const md = buildSealiftBriefingBlock(
    sealiftSnapshot({
      navalH3: WATER_NO_PORT,
      hexes: [
        { h3Index: WATER_NO_PORT, terrain: 'water', terrainKind: 'water' },
        { h3Index: WATER_SEAPORT_NO_CONTROL, terrain: 'water', terrainKind: 'water' },
      ],
      infra: [
        {
          h3Index: WATER_SEAPORT_NO_CONTROL,
          urbanHexCount: 0,
          airportCount: 0,
          seaportCount: 1,
        },
      ],
      control: [{ h3Index: WATER_SEAPORT_NO_CONTROL, controllerPlayerId: 'opponent' }],
    }),
    (h3) => h3,
    'strategic'
  );
  assert.match(md, new RegExp(`${WATER_SEAPORT_NO_CONTROL} at hex distance `));
}

/**
 * Verifies Aboard counts assigned cargo, not merely co-located land.
 *
 * Purpose: Co-located armor on water is not embarked; the table must not spend capacity for it.
 * When to use: After edits to strategic sealift row assembly.
 * Expected outcome: Empty cargo shows infantry 0, armor 0 and capacity 0/2.
 * Exceptions: Propagates assertion errors.
 */
function testAboardCountsAssignedCargoNotCoLocatedLand(): void {
  const md = buildSealiftBriefingBlock(
    sealiftSnapshot({
      navalH3: WATER_NO_PORT,
      hexes: [{ h3Index: WATER_NO_PORT, terrain: 'water', terrainKind: 'water' }],
      extraUnits: [
        { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: WATER_NO_PORT },
      ],
    }),
    (h3) => h3,
    'strategic'
  );
  assert.match(md, /infantry 0, armor 0/);
  assert.match(md, /0\/2/);
}

/**
 * Verifies assigned cargo appears in Aboard and fills armor capacity.
 *
 * Purpose: Happy path for embarked armor on the strategic sealift table.
 * When to use: After edits to strategic sealift row assembly.
 * Expected outcome: Armor 1 and capacity 2/2 when `embarkedOnNavalUnitId` points at the ship.
 * Exceptions: Propagates assertion errors.
 */
function testAboardShowsEmbarkedArmor(): void {
  const md = buildSealiftBriefingBlock(
    sealiftSnapshot({
      navalH3: WATER_NO_PORT,
      hexes: [{ h3Index: WATER_NO_PORT, terrain: 'water', terrainKind: 'water' }],
      extraUnits: [
        {
          id: 'opponent-armor-1',
          player: 'opponent',
          unitType: 'armor',
          h3Index: WATER_NO_PORT,
          embarkedOnNavalUnitId: 'opponent-naval-1',
        },
      ],
    }),
    (h3) => h3,
    'strategic'
  );
  assert.match(md, /infantry 0, armor 1/);
  assert.match(md, /2\/2/);
}

/**
 * Runs strategic sealift briefing tests.
 *
 * Purpose: Node test entrypoint.
 * When to use: `node dist/main/openrouter/briefingSections.test.js`.
 * Expected outcome: Throws on failure; logs pass when all succeed.
 * Exceptions: Propagates assertion errors.
 */
function run(): void {
  testStrategicEmbarkSentenceMatchesEngine();
  testNearestEmbarkUsesEngineEligibility();
  testNearestEmbarkIncludesUncontrolledLandSeaport();
  testNearestEmbarkSkipsUncontrolledWaterSeaport();
  testNearestEmbarkIncludesControlledWaterSeaport();
  testAboardCountsAssignedCargoNotCoLocatedLand();
  testAboardShowsEmbarkedArmor();
  console.log('briefingSections.test.ts passed');
}

run();
