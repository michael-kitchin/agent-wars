import * as assert from 'assert';
import { gridDisk } from 'h3-js';
import { MAX_UNITS_PER_TYPE } from '../../productionCaps';
import type { SpawnCandidate } from './spawnSelection';
import type { FlexAirSlotDeps } from './initialFlexAirSlot';
import { resolveFlexUnitPlacement } from './initialFlexAirSlot';

/**
 * Defines the `makeDeps` function shape (function makeDeps(airportHexes: string[]): FlexAirSlotDeps).

 * Purpose: Supports maintainability by documenting why `makeDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function makeDeps(airportHexes: string[]): FlexAirSlotDeps {
  return {
    hasDb: () => true,
    run: () => {
      return;
    },
    dbRun: () => {
      return;
    },
    getAll: () => airportHexes.map((h3Index) => ({ h3_index: h3Index })),
    dbGetAll: () => [],
    getOne: () => null,
    dbGetOne: () => null,
  } as unknown as FlexAirSlotDeps;
}

/**
 * Defines the `candidate` function shape (function candidate(h3: string, terrain: string): SpawnCandidate).

 * Purpose: Supports maintainability by documenting why `candidate` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function candidate(h3: string, terrain: string): SpawnCandidate {
  return { h3, lat: 0, lng: 0, terrain };
}

/**
 * Defines the `baseTestHexes` function shape (function baseTestHexes():).

 * Purpose: Supports maintainability by documenting why `baseTestHexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function baseTestHexes(): { homeHex: string; landHex: string; navalHex: string } {
  const homeHex = '81757ffffffffff';
  const ring = gridDisk(homeHex, 2).filter((h) => h !== homeHex);
  const landHex = ring[0]!;
  const navalHex = ring[1]!;
  return { homeHex, landHex, navalHex };
}

/**
 * Defines the `testAirportPresentSeedsAir` function shape (function testAirportPresentSeedsAir(): void).

 * Purpose: Supports maintainability by documenting why `testAirportPresentSeedsAir` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testAirportPresentSeedsAir(): void {
  const { homeHex, landHex, navalHex } = baseTestHexes();
  const result = resolveFlexUnitPlacement({
    deps: makeDeps([homeHex]),
    player: 'human',
    regionHexSet: new Set([homeHex, landHex]),
    passableLandCandidates: [candidate(landHex, 'land')],
    navalCandidates: [candidate(navalHex, 'water')],
    usedH3: new Set<string>(),
    maxUnitsPerType: MAX_UNITS_PER_TYPE,
    plannedCountsAfterSacrifice: { infantry: 0, armor: 0, naval: 0, air: 0 },
  });
  assert.deepStrictEqual(result, { unitType: 'air', h3Index: homeHex });
}

/**
 * Defines the `testNoAirportFallsBackToArmorFirst` function shape (function testNoAirportFallsBackToArmorFirst(): void).

 * Purpose: Supports maintainability by documenting why `testNoAirportFallsBackToArmorFirst` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testNoAirportFallsBackToArmorFirst(): void {
  const { homeHex, landHex, navalHex } = baseTestHexes();
  const result = resolveFlexUnitPlacement({
    deps: makeDeps([]),
    player: 'opponent',
    regionHexSet: new Set([homeHex, landHex]),
    passableLandCandidates: [candidate(landHex, 'land')],
    navalCandidates: [candidate(navalHex, 'water')],
    usedH3: new Set<string>(),
    maxUnitsPerType: MAX_UNITS_PER_TYPE,
    plannedCountsAfterSacrifice: { infantry: 0, armor: 0, naval: 0, air: 0 },
  });
  assert.deepStrictEqual(result, { unitType: 'armor', h3Index: landHex });
}

/**
 * Defines the `testArmorCappedFallsBackToInfantry` function shape (function testArmorCappedFallsBackToInfantry(): void).

 * Purpose: Supports maintainability by documenting why `testArmorCappedFallsBackToInfantry` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testArmorCappedFallsBackToInfantry(): void {
  const { homeHex, landHex, navalHex } = baseTestHexes();
  const result = resolveFlexUnitPlacement({
    deps: makeDeps([]),
    player: 'human',
    regionHexSet: new Set([homeHex, landHex]),
    passableLandCandidates: [candidate(landHex, 'land')],
    navalCandidates: [candidate(navalHex, 'water')],
    usedH3: new Set<string>(),
    maxUnitsPerType: MAX_UNITS_PER_TYPE,
    plannedCountsAfterSacrifice: {
      infantry: 0,
      armor: MAX_UNITS_PER_TYPE.armor,
      naval: 0,
      air: MAX_UNITS_PER_TYPE.air,
    },
  });
  assert.deepStrictEqual(result, { unitType: 'infantry', h3Index: landHex });
}

/**
 * Defines the `testArmorAndInfantryCappedFallsBackToNaval` function shape (function testArmorAndInfantryCappedFallsBackToNaval(): void).

 * Purpose: Supports maintainability by documenting why `testArmorAndInfantryCappedFallsBackToNaval` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testArmorAndInfantryCappedFallsBackToNaval(): void {
  const { homeHex, landHex, navalHex } = baseTestHexes();
  const result = resolveFlexUnitPlacement({
    deps: makeDeps([]),
    player: 'opponent',
    regionHexSet: new Set([homeHex, landHex]),
    passableLandCandidates: [candidate(landHex, 'land')],
    navalCandidates: [candidate(navalHex, 'water')],
    usedH3: new Set<string>(),
    maxUnitsPerType: MAX_UNITS_PER_TYPE,
    plannedCountsAfterSacrifice: {
      infantry: MAX_UNITS_PER_TYPE.infantry,
      armor: MAX_UNITS_PER_TYPE.armor,
      naval: 0,
      air: MAX_UNITS_PER_TYPE.air,
    },
  });
  assert.deepStrictEqual(result, { unitType: 'naval', h3Index: navalHex });
}

/**
 * Defines the `testAllFallbackOptionsInvalidReturnsNull` function shape (function testAllFallbackOptionsInvalidReturnsNull(): void).

 * Purpose: Supports maintainability by documenting why `testAllFallbackOptionsInvalidReturnsNull` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testAllFallbackOptionsInvalidReturnsNull(): void {
  const { homeHex, landHex, navalHex } = baseTestHexes();
  const result = resolveFlexUnitPlacement({
    deps: makeDeps([]),
    player: 'human',
    regionHexSet: new Set([homeHex, landHex]),
    passableLandCandidates: [candidate(landHex, 'land')],
    navalCandidates: [candidate(navalHex, 'water')],
    usedH3: new Set<string>(),
    maxUnitsPerType: MAX_UNITS_PER_TYPE,
    plannedCountsAfterSacrifice: {
      infantry: MAX_UNITS_PER_TYPE.infantry,
      armor: MAX_UNITS_PER_TYPE.armor,
      naval: MAX_UNITS_PER_TYPE.naval,
      air: MAX_UNITS_PER_TYPE.air,
    },
  });
  assert.strictEqual(result, null);
}

/**
 * Documents the module-scope binding `tests` (tests).

 * Purpose: Supports maintainability by documenting why `tests` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const tests = [
  { name: 'resolveFlexUnitPlacement airport present -> air', fn: testAirportPresentSeedsAir },
  { name: 'resolveFlexUnitPlacement no airport -> armor', fn: testNoAirportFallsBackToArmorFirst },
  { name: 'resolveFlexUnitPlacement armor capped -> infantry', fn: testArmorCappedFallsBackToInfantry },
  { name: 'resolveFlexUnitPlacement armor+infantry capped -> naval', fn: testArmorAndInfantryCappedFallsBackToNaval },
  { name: 'resolveFlexUnitPlacement all invalid -> null', fn: testAllFallbackOptionsInvalidReturnsNull },
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
