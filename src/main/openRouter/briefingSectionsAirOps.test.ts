/**
 * Contract tests for Air Operations Status briefing copy.
 * Run with: node dist/main/openRouter/briefingSectionsAirOps.test.js
 */

import assert from 'node:assert/strict';
import { gridDisk, gridDistance } from 'h3-js';
import type { GameStateSnapshot } from '../gameDb';
import { buildAirOperationsBriefingBlock } from './briefingSectionsAirOps';

/** Water hex reused as an air-base fixture so `gridDisk` can supply neighbors. */
const WATER_NO_PORT = '810ebffffffffff';

/**
 * Ensures strikeable infra counts only human-controlled hexes, not uncontrolled cities in the envelope.
 *
 * Purpose: Turn 9 listed Strikeable Urban=8 while enemy airports/seaports were 0, which contradicts the tempo rule and invites bombing hexes the AI should capture.
 * When to use: After edits to `countStrikeableEnemyInfrastructure` or the air-operations summary line.
 * Expected outcome: Uncontrolled urban/airport in range is omitted; human-controlled urban/airport/seaport is counted.
 * Exceptions: Throws if `gridDisk` cannot supply two neighbors of the base hex.
 */
function testStrikeableInfraCountsOnlyHumanControlled(): void {
  const base = WATER_NO_PORT;
  const nearby = [...gridDisk(base, 1)].filter((h3) => h3 !== base);
  const uncontrolled = nearby[0];
  const humanHex = nearby[1];
  assert.ok(uncontrolled && humanHex, 'expected two neighbors of the air base');
  const md = buildAirOperationsBriefingBlock(
    {
      hexes: [base, uncontrolled, humanHex].map((h3Index) => ({
        h3Index,
        terrain: 'land',
        terrainKind: 'plains',
      })),
      units: [{ id: 'opponent-air-1', player: 'opponent', unitType: 'air', h3Index: base }],
      phase: 'planning',
      turnNumber: 1,
      pendingOrders: [],
      res1Control: [
        { h3Index: base, controllerPlayerId: 'opponent' },
        { h3Index: humanHex, controllerPlayerId: 'human' },
      ],
      res1Infrastructure: [
        { h3Index: base, urbanHexCount: 0, airportCount: 1, seaportCount: 0 },
        { h3Index: uncontrolled, urbanHexCount: 5, airportCount: 1, seaportCount: 0 },
        { h3Index: humanHex, urbanHexCount: 8, airportCount: 1, seaportCount: 1 },
      ],
    } as GameStateSnapshot,
    (h3) => h3,
    'strategic'
  );
  const airRow = md.split('\n').find((line) => line.includes('opponent-air-1'));
  assert.ok(airRow, 'air unit row must be present');
  const cells = airRow.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
  assert.equal(cells[5], '1', 'Strikeable Urban must count only the human-controlled hex');
  assert.equal(cells[6], '1', 'Strikeable Airports must count only the human-controlled hex');
  assert.equal(cells[7], '1', 'Strikeable Seaports must count only the human-controlled hex');
  assert.match(md, /Enemy infrastructure in your current strike envelope: airports=1, seaports=1/);
  assert.match(md, /infrastructure_destroyed/);
  assert.match(md, /targetType/i);
  assert.doesNotMatch(md, /h3Index/);
}

/**
 * Strategic air operations are omitted when the opponent has no air units.
 *
 * Purpose: A dash-only table invites air orders that cannot be filled.
 * When to use: After roster-empty omission.
 * Expected outcome: Empty string, no heading, no em-dash row.
 * Exceptions: None.
 */
function testStrategicAirSectionOmitsWhenRosterEmpty(): void {
  const md = buildAirOperationsBriefingBlock(
    {
      hexes: [{ h3Index: WATER_NO_PORT, terrain: 'land', terrainKind: 'plains' }],
      units: [{ id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: WATER_NO_PORT }],
      phase: 'planning',
      turnNumber: 1,
      pendingOrders: [],
    } as GameStateSnapshot,
    (h3) => h3,
    'strategic'
  );
  assert.equal(md, '');
}

/**
 * Ferry destinations into snow use the 2-hex ferry range for an air unit that lacks the snow tag.
 *
 * Purpose: The briefing count must match the ferry orders validation will accept.
 * When to use: After edits to the Ferry Destinations column.
 * Expected outcome: A friendly airport three hexes away in a January snow hex counts with weather off or for a
 * snow-tagged unit, and does not count for an untagged unit with weather on.
 * Exceptions: Fails when the weather pack is missing.
 */
function testFerryDestinationsHonorSnowRange(): void {
  const snowHex = '8101bffffffffff';
  const base = [...gridDisk(snowHex, 3)].find((h3) => gridDistance(h3, snowHex) === 3);
  assert.ok(base, 'expected a hex three steps from the snow hex');
  const ferryCount = (weatherBonusEnabled: boolean, weatherTags?: ('snow' | 'rain' | 'heat')[]): string => {
    const md = buildAirOperationsBriefingBlock(
      {
        hexes: [base, snowHex].map((h3Index) => ({ h3Index, terrain: 'land', terrainKind: 'plains' })),
        units: [{ id: 'opponent-air-1', player: 'opponent', unitType: 'air', h3Index: base, ...(weatherTags ? { weatherTags } : {}) }],
        phase: 'planning',
        turnNumber: 1,
        startMonth: 1,
        weatherBonusEnabled,
        pendingOrders: [],
        res1Control: [
          { h3Index: base, controllerPlayerId: 'opponent' },
          { h3Index: snowHex, controllerPlayerId: 'opponent' },
        ],
        res1Infrastructure: [
          { h3Index: base, urbanHexCount: 0, airportCount: 1, seaportCount: 0 },
          { h3Index: snowHex, urbanHexCount: 0, airportCount: 1, seaportCount: 0 },
        ],
      } as GameStateSnapshot,
      (h3) => h3,
      'strategic'
    );
    const airRow = md.split('\n').find((line) => line.includes('opponent-air-1'));
    assert.ok(airRow, 'air unit row must be present');
    return airRow.split('|').map((c) => c.trim()).filter((c) => c.length > 0)[8]!;
  };
  assert.equal(ferryCount(false), '1');
  assert.equal(ferryCount(true), '0');
  assert.equal(ferryCount(true, ['snow']), '1');
}

function run(): void {
  testStrikeableInfraCountsOnlyHumanControlled();
  testStrategicAirSectionOmitsWhenRosterEmpty();
  testFerryDestinationsHonorSnowRange();
  console.log('briefingSectionsAirOps.test.ts passed');
}

run();
