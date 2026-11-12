/**
 * Heading outline of a full strategic system prompt.
 *
 * Purpose: The assembled prompt must nest, keep the always-present sections in order, and drop the old unheaded labels.
 * When to use: `node dist/main/openRouter/promptOutline.test.js` after `npm run build:main`.
 * Expected outcome: Nesting holds, the always-present headings are a subsequence, and the two old labels are absent.
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
import { buildSystemPromptForTools } from './openRouterBuildSystemPrompt';
import { getSubscriptions } from '../callbackSubscriptions';
import { ensureStrategicCoordinateRegistryInitialized } from '../briefing/map/hexCoordinates';
import { h3ToCode } from '../briefing/map/hexCodeTranslator';
import { briefingOwnSeatId } from '../briefing/briefingPerspective';
import { assertHeadingsNest, assertNoTripleBlankLines, assertProseLinesWithinLimit, headingOutline } from '../testSupport/promptOutlineHelpers';

/**
 * Always-present strategic headings, in outline order.
 *
 * Purpose: Gated sections may be missing. These are present on a fresh match with every tool group enabled.
 * When to use: The subsequence assertion.
 * Expected outcome: Each line appears in the outline, in this order.
 * Exceptions: None.
 */
const STRATEGIC_ALWAYS_PRESENT: readonly string[] = [
  '# Your Command',
  '# Scenario Objective (Required)',
  '## Sides',
  '# Coordinates',
  '# Rules',
  '## Combat',
  '# Strategic Context',
  '# Reading the Briefing',
  '## Map Legend',
  '# Available Tools',
  '## How to Use These Tools Effectively',
  '# Orders Guidance',
  '# Response Format',
  '## Example Response',
  '# Current Situation',
  "# Commander's Briefing",
  '## Unit Status and Threats',
  '## Attention Flags',
  '## Operational Map',
  '## Scenario Progress',
  '## Unit Roster',
];

/**
 * True when `expected` appears in `outline` in order.
 *
 * Purpose: Gated headings sit between the always-present ones, so equality of the whole outline is the wrong check.
 * When to use: After `headingOutline`.
 * Expected outcome: Throws naming the first missing heading.
 * Exceptions: None beyond the assertion.
 */
function assertSubsequence(outline: readonly string[], expected: readonly string[]): void {
  let cursor = 0;
  for (const heading of expected) {
    const at = outline.findIndex((line, index) => index >= cursor && line === heading);
    assert.ok(at >= 0, `missing ${heading}`);
    cursor = at + 1;
  }
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-prompt-outline-'));
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
  const injection = buildStatusInjectionTexts({
    memoryEnabled: true,
    ordersEnabled: true,
    productionEnabled: true,
    state,
    seatId: briefingOwnSeatId(state),
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
    getSubscriptions(briefingOwnSeatId(state)),
    injection.productionText,
    { latLngByH3, includeProductionSection: true, productionAttention: injection.productionAttention }
  );
  const prompt = buildSystemPromptForTools(state, { latLngByH3, resolveToH3, format }, undefined, briefing, {
    mode: 'strategic',
  });
  const outline = headingOutline(prompt);
  assertHeadingsNest(outline);
  assertNoTripleBlankLines(prompt);
  assertSubsequence(outline, STRATEGIC_ALWAYS_PRESENT);
  assert.ok(!prompt.split('\n').includes('Strategic context:'));
  assert.ok(!prompt.split('\n').includes('HOW TO USE THESE TOOLS EFFECTIVELY:'));
  assertProseLinesWithinLimit(prompt);
} finally {
  closeGameDatabaseForTests();
}
console.log('promptOutline.test.ts: ok');
