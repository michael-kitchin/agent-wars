import * as assert from 'assert';
import { gridDisk } from 'h3-js';
import { MAX_UNITS_PER_TYPE } from '../../productionCaps';
import type { SpawnCandidate } from './spawnSelection';
import type { FlexAirSlotDeps } from './initialFlexAirSlot';
import { resolveFlexUnitPlacement } from './initialFlexAirSlot';

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

function candidate(h3: string, terrain: string): SpawnCandidate {
  return { h3, lat: 0, lng: 0, terrain };
}

function baseTestHexes(): { homeHex: string; landHex: string; navalHex: string } {
  const homeHex = '81757ffffffffff';
  const ring = gridDisk(homeHex, 2).filter((h) => h !== homeHex);
  const landHex = ring[0]!;
  const navalHex = ring[1]!;
  return { homeHex, landHex, navalHex };
}

function testAirportPresentSeedsAir(): void {
  const { homeHex, landHex, navalHex } = baseTestHexes();
  const result = resolveFlexUnitPlacement({
    deps: makeDeps([homeHex]),
    player: 'human',
    regionHexSet: new Set([homeHex, landHex]),
    passableLandCandidates: [candidate(landHex, 'land')],
    navalCandidates: [candidate(navalHex, 'water')],
    usedH3: new Set<string>(),
    plannedCountsAfterSacrifice: { infantry: 0, armor: 0, naval: 0, air: 0 },
  });
  assert.deepStrictEqual(result, { unitType: 'air', h3Index: homeHex });
}

function testNoAirportFallsBackToArmorFirst(): void {
  const { homeHex, landHex, navalHex } = baseTestHexes();
  const result = resolveFlexUnitPlacement({
    deps: makeDeps([]),
    player: 'opponent',
    regionHexSet: new Set([homeHex, landHex]),
    passableLandCandidates: [candidate(landHex, 'land')],
    navalCandidates: [candidate(navalHex, 'water')],
    usedH3: new Set<string>(),
    plannedCountsAfterSacrifice: { infantry: 0, armor: 0, naval: 0, air: 0 },
  });
  assert.deepStrictEqual(result, { unitType: 'armor', h3Index: landHex });
}

function testArmorCappedFallsBackToInfantry(): void {
  const { homeHex, landHex, navalHex } = baseTestHexes();
  const result = resolveFlexUnitPlacement({
    deps: makeDeps([]),
    player: 'human',
    regionHexSet: new Set([homeHex, landHex]),
    passableLandCandidates: [candidate(landHex, 'land')],
    navalCandidates: [candidate(navalHex, 'water')],
    usedH3: new Set<string>(),
    plannedCountsAfterSacrifice: {
      infantry: 0,
      armor: MAX_UNITS_PER_TYPE.armor,
      naval: 0,
      air: MAX_UNITS_PER_TYPE.air,
    },
  });
  assert.deepStrictEqual(result, { unitType: 'infantry', h3Index: landHex });
}

function testArmorAndInfantryCappedFallsBackToNaval(): void {
  const { homeHex, landHex, navalHex } = baseTestHexes();
  const result = resolveFlexUnitPlacement({
    deps: makeDeps([]),
    player: 'opponent',
    regionHexSet: new Set([homeHex, landHex]),
    passableLandCandidates: [candidate(landHex, 'land')],
    navalCandidates: [candidate(navalHex, 'water')],
    usedH3: new Set<string>(),
    plannedCountsAfterSacrifice: {
      infantry: MAX_UNITS_PER_TYPE.infantry,
      armor: MAX_UNITS_PER_TYPE.armor,
      naval: 0,
      air: MAX_UNITS_PER_TYPE.air,
    },
  });
  assert.deepStrictEqual(result, { unitType: 'naval', h3Index: navalHex });
}

function testAllFallbackOptionsInvalidReturnsNull(): void {
  const { homeHex, landHex, navalHex } = baseTestHexes();
  const result = resolveFlexUnitPlacement({
    deps: makeDeps([]),
    player: 'human',
    regionHexSet: new Set([homeHex, landHex]),
    passableLandCandidates: [candidate(landHex, 'land')],
    navalCandidates: [candidate(navalHex, 'water')],
    usedH3: new Set<string>(),
    plannedCountsAfterSacrifice: {
      infantry: MAX_UNITS_PER_TYPE.infantry,
      armor: MAX_UNITS_PER_TYPE.armor,
      naval: MAX_UNITS_PER_TYPE.naval,
      air: MAX_UNITS_PER_TYPE.air,
    },
  });
  assert.strictEqual(result, null);
}

const tests = [
  { name: 'resolveFlexUnitPlacement airport present -> air', fn: testAirportPresentSeedsAir },
  { name: 'resolveFlexUnitPlacement no airport -> armor', fn: testNoAirportFallsBackToArmorFirst },
  { name: 'resolveFlexUnitPlacement armor capped -> infantry', fn: testArmorCappedFallsBackToInfantry },
  { name: 'resolveFlexUnitPlacement armor+infantry capped -> naval', fn: testArmorAndInfantryCappedFallsBackToNaval },
  { name: 'resolveFlexUnitPlacement all invalid -> null', fn: testAllFallbackOptionsInvalidReturnsNull },
];

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
