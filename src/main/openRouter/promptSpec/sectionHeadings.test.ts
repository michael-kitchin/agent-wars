/**
 * Contract tests for briefing and status section titles.
 * Run: `npm run build:main` then `node dist/main/openRouter/promptSpec/sectionHeadings.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'fs';
import * as path from 'path';
import {
  SECTION_TITLE_ACTIVE_CALLBACKS,
  SECTION_TITLE_AIR_OPERATIONS_STATUS,
  SECTION_TITLE_MISSILE_FORCES,
  SECTION_TITLE_ATTENTION_FLAGS,
  SECTION_TITLE_AVAILABLE_TOOLS,
  SECTION_TITLE_BEST_OPTIONS_THIS_TURN,
  SECTION_TITLE_COMMANDERS_BRIEFING,
  SECTION_TITLE_CONTROLLED_HEX_QUEUES,
  SECTION_TITLE_NAVAL_TRANSPORT_STATUS,
  SECTION_TITLE_OPERATIONAL_MAP,
  SECTION_TITLE_PRODUCTION_STATUS,
  SECTION_TITLE_RECENT_TURN_NOTES,
  SECTION_TITLE_SCENARIO_OBJECTIVE,
  SECTION_TITLE_STANDING_ORDER_STATUS,
  SECTION_TITLE_STRATEGIC_MEMORY,
  SECTION_TITLE_SUPPLEMENTAL_HEX_INTELLIGENCE,
  SECTION_TITLE_UNIT_STATUS_AND_THREATS,
  subHeading,
  topLevelHeading,
} from './sectionHeadings';

/**
 * Emitted heading strings currently produced by the assemblers, keyed by export name.
 *
 * Purpose: Pins each constant to the exact title already in the prompt so extracting them cannot change wording.
 * When to use: The equality cases in this file.
 * Expected outcome: Bare titles without ATX hashes; helpers add the hashes.
 * Exceptions: None.
 */
const CURRENT_TITLES: Readonly<Record<string, string>> = {
  SECTION_TITLE_COMMANDERS_BRIEFING: "Commander's Briefing",
  SECTION_TITLE_UNIT_STATUS_AND_THREATS: 'Unit Status and Threats',
  SECTION_TITLE_ATTENTION_FLAGS: 'Attention Flags',
  SECTION_TITLE_OPERATIONAL_MAP: 'Operational Map',
  SECTION_TITLE_BEST_OPTIONS_THIS_TURN: 'Best Options This Turn',
  SECTION_TITLE_SUPPLEMENTAL_HEX_INTELLIGENCE: 'Supplemental Hex Intelligence',
  SECTION_TITLE_RECENT_TURN_NOTES: 'Recent Turn Notes',
  SECTION_TITLE_PRODUCTION_STATUS: 'Production Status',
  SECTION_TITLE_CONTROLLED_HEX_QUEUES: 'Controlled Hex Queues',
  SECTION_TITLE_STRATEGIC_MEMORY: 'Your Strategic Memory',
  SECTION_TITLE_STANDING_ORDER_STATUS: 'Standing Order Status',
  SECTION_TITLE_ACTIVE_CALLBACKS: 'Active Callbacks',
  SECTION_TITLE_AIR_OPERATIONS_STATUS: 'Air Operations Status',
  SECTION_TITLE_MISSILE_FORCES: 'Missile Forces',
  SECTION_TITLE_NAVAL_TRANSPORT_STATUS: 'Naval Transport Status',
  SECTION_TITLE_AVAILABLE_TOOLS: 'Available Tools',
  SECTION_TITLE_SCENARIO_OBJECTIVE: 'Scenario Objective (Required)',
};

test('exported titles match the current emitted heading text', () => {
  assert.equal(SECTION_TITLE_COMMANDERS_BRIEFING, CURRENT_TITLES.SECTION_TITLE_COMMANDERS_BRIEFING);
  assert.equal(SECTION_TITLE_UNIT_STATUS_AND_THREATS, CURRENT_TITLES.SECTION_TITLE_UNIT_STATUS_AND_THREATS);
  assert.equal(SECTION_TITLE_ATTENTION_FLAGS, CURRENT_TITLES.SECTION_TITLE_ATTENTION_FLAGS);
  assert.equal(SECTION_TITLE_OPERATIONAL_MAP, CURRENT_TITLES.SECTION_TITLE_OPERATIONAL_MAP);
  assert.equal(SECTION_TITLE_BEST_OPTIONS_THIS_TURN, CURRENT_TITLES.SECTION_TITLE_BEST_OPTIONS_THIS_TURN);
  assert.equal(SECTION_TITLE_SUPPLEMENTAL_HEX_INTELLIGENCE, CURRENT_TITLES.SECTION_TITLE_SUPPLEMENTAL_HEX_INTELLIGENCE);
  assert.equal(SECTION_TITLE_RECENT_TURN_NOTES, CURRENT_TITLES.SECTION_TITLE_RECENT_TURN_NOTES);
  assert.equal(SECTION_TITLE_PRODUCTION_STATUS, CURRENT_TITLES.SECTION_TITLE_PRODUCTION_STATUS);
  assert.equal(SECTION_TITLE_CONTROLLED_HEX_QUEUES, CURRENT_TITLES.SECTION_TITLE_CONTROLLED_HEX_QUEUES);
  assert.equal(SECTION_TITLE_STRATEGIC_MEMORY, CURRENT_TITLES.SECTION_TITLE_STRATEGIC_MEMORY);
  assert.equal(SECTION_TITLE_STANDING_ORDER_STATUS, CURRENT_TITLES.SECTION_TITLE_STANDING_ORDER_STATUS);
  assert.equal(SECTION_TITLE_ACTIVE_CALLBACKS, CURRENT_TITLES.SECTION_TITLE_ACTIVE_CALLBACKS);
  assert.equal(SECTION_TITLE_AIR_OPERATIONS_STATUS, CURRENT_TITLES.SECTION_TITLE_AIR_OPERATIONS_STATUS);
  assert.equal(SECTION_TITLE_MISSILE_FORCES, CURRENT_TITLES.SECTION_TITLE_MISSILE_FORCES);
  assert.equal(SECTION_TITLE_NAVAL_TRANSPORT_STATUS, CURRENT_TITLES.SECTION_TITLE_NAVAL_TRANSPORT_STATUS);
  assert.equal(SECTION_TITLE_AVAILABLE_TOOLS, CURRENT_TITLES.SECTION_TITLE_AVAILABLE_TOOLS);
  assert.equal(SECTION_TITLE_SCENARIO_OBJECTIVE, CURRENT_TITLES.SECTION_TITLE_SCENARIO_OBJECTIVE);
});

test('heading helpers add a single hash level and no extra spacing', () => {
  assert.equal(topLevelHeading(SECTION_TITLE_COMMANDERS_BRIEFING), "# Commander's Briefing");
  assert.equal(subHeading(SECTION_TITLE_UNIT_STATUS_AND_THREATS), '## Unit Status and Threats');
  assert.equal(`### ${SECTION_TITLE_BEST_OPTIONS_THIS_TURN}`, '### Best Options This Turn');
});

test('assemblers import the title module instead of restating the briefing opener', () => {
  const briefingFormatter = fs.readFileSync(
    path.resolve(process.cwd(), 'src/main/briefingFormatter.ts'),
    'utf8'
  );
  const tactical = fs.readFileSync(
    path.resolve(process.cwd(), 'src/main/openRouter/formatTacticalBriefing.ts'),
    'utf8'
  );
  assert.ok(briefingFormatter.includes('SECTION_TITLE_COMMANDERS_BRIEFING'));
  assert.ok(!briefingFormatter.includes('markdownHeading1("Commander\'s Briefing")'));
  assert.ok(tactical.includes('SECTION_TITLE_COMMANDERS_BRIEFING'));
  assert.ok(tactical.includes('markdownHeading1(SECTION_TITLE_COMMANDERS_BRIEFING)'));
});
