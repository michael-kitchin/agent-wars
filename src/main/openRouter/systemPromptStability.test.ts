/**
 * The cached system text stays put when the live map changes.
 *
 * Purpose: Turn-invariant sentences must not move back into the situation, and a unit move must not rewrite the system text.
 * When to use: `node dist/main/openRouter/systemPromptStability.test.js` after `npm run build:main`.
 * Expected outcome: The named sentences are in the system text only. Moving one unit and clearing explored hexes leaves the system text identical.
 * Exceptions: Assertion failures.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cellToLatLng } from 'h3-js';
import { closeGameDatabaseForTests, getGameState, openGameDatabaseAtPathForTests, resetGameForNewMatch } from '../gameDb';
import { buildLatLngCoordinateMap } from '../mapData';
import { formatLatLng } from './promptText';
import { runPrecomputation } from '../precomputation';
import { formatBriefing } from '../briefingFormatter';
import { buildStatusInjectionTexts } from './requestOrdersInjection';
import { buildConsultPromptParts } from './consultPromptParts';
import { getSubscriptions } from '../callbackSubscriptions';
import { ensureStrategicCoordinateRegistryInitialized } from '../briefing/map/hexCoordinates';
import { h3ToCode } from '../briefing/map/hexCodeTranslator';
import { briefingOwnSeatId } from '../briefing/briefingPerspective';

/**
 * Sentences that belong in the cached system text and must not repeat in the situation.
 *
 * Purpose: Pins the move of turn-invariant briefing copy.
 * When to use: The presence checks below.
 * Expected outcome: Each string is found in `staticSystemText` and absent from `situationText`.
 * Exceptions: None.
 */
const SYSTEM_ONLY: readonly string[] = [
  'Each cell: top = hex code',
  'Odds is Kill, Hurt, and Loss',
  'Production progress/spawn resolves',
  'Deployment caps (per side)',
  'Use memory_read to retrieve',
  'Every home-region outline is always visible',
  'home region hexes are:',
  'move to regain contact',
];

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-system-stability-'));
const dbPath = path.join(tempDir, 't.sqlite');
try {
  openGameDatabaseAtPathForTests(dbPath);
  resetGameForNewMatch();
  ensureStrategicCoordinateRegistryInitialized();
  const state = getGameState();
  const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(state.hexes.map((hex) => hex.h3Index));
  const format = (h3: string): string => {
    try {
      return h3ToCode(h3, { mode: 'strategic' });
    } catch {
      const ll = latLngByH3.get(h3);
      return formatLatLng(ll ?? (cellToLatLng(h3) as [number, number]), 4);
    }
  };
  const precomputed = runPrecomputation(state, { latLngByH3, resolveToH3 });
  const ownSeat = briefingOwnSeatId(state);
  const injection = buildStatusInjectionTexts({
    memoryEnabled: true,
    ordersEnabled: true,
    productionEnabled: true,
    state,
    seatId: ownSeat,
    latLngByH3,
    resolveToH3,
    formatHexLabel: (ll) => {
      const h3 = resolveToH3(ll[0], ll[1]);
      return h3 ? format(h3) : formatLatLng(ll, 4);
    },
    coordinateContext: { mode: 'strategic' },
  });
  const briefing = formatBriefing(
    state,
    precomputed,
    injection.standingOrderText,
    injection.memoryText,
    getSubscriptions(ownSeat),
    injection.productionText,
    { latLngByH3, includeProductionSection: true, productionAttention: injection.productionAttention }
  );
  const coordMap = { latLngByH3, resolveToH3, format };
  const first = buildConsultPromptParts({
    state,
    coordMap,
    briefingOverride: briefing,
    coordinateContext: { mode: 'strategic' },
    productionAttention: injection.productionAttention,
    campaignAttention: injection.campaignAttention,
  });
  for (const sentence of SYSTEM_ONLY) {
    assert.ok(first.staticSystemText.includes(sentence), `system text missing: ${sentence}`);
    assert.ok(!first.situationText.includes(sentence), `situation text still has: ${sentence}`);
  }
  const ownUnits = state.units.filter((unit) => unit.player === ownSeat);
  if (ownUnits.some((unit) => unit.unitType === 'air')) {
    assert.ok(first.staticSystemText.includes('Air rules:'));
    assert.ok(!first.situationText.includes('Air rules:'));
  }
  if (ownUnits.some((unit) => unit.unitType === 'naval')) {
    assert.ok(first.staticSystemText.includes('Embark: coastal'));
    assert.ok(!first.situationText.includes('Embark: coastal'));
  }
  assert.ok(first.situationText.includes('Current turn: '));
  assert.ok(first.situationText.includes('# Scenario Progress'));
  assert.ok(first.situationText.includes('Your current unit counts:'));
  const ownIndex = state.units.findIndex((unit) => unit.player === ownSeat);
  const ownUnit = state.units[ownIndex];
  assert.ok(ownUnit, 'the seeded side has a unit to move');
  const destination = state.hexes.find((hex) => hex.terrain === 'land' && hex.h3Index !== ownUnit.h3Index);
  assert.ok(destination, 'the map has another land hex');
  const movedUnits = state.units.map((unit, index) =>
    index === ownIndex ? { ...unit, h3Index: destination.h3Index } : unit
  );
  assert.notEqual(movedUnits[ownIndex]?.h3Index, ownUnit.h3Index);
  const moved = buildConsultPromptParts({
    state: { ...state, units: movedUnits, exploredHexes: [] },
    coordMap,
    briefingOverride: briefing,
    coordinateContext: { mode: 'strategic' },
    productionAttention: injection.productionAttention,
    campaignAttention: injection.campaignAttention,
  });
  assert.equal(moved.staticSystemText, first.staticSystemText);
} finally {
  closeGameDatabaseForTests();
}
console.log('systemPromptStability.test.ts: ok');
