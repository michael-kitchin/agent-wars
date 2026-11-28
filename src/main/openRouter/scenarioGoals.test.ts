/**
 * Contract tests for the scenario goal reminder and the generic-objective path.
 * Run: `npm run build:main` then `node dist/main/openRouter/scenarioGoals.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, HUMAN_SEAT_ID, type SeatId } from '../../shared/seatIds';
import type { KnockoutStatusForSeat, SideKnockoutStatus } from '../gameActions/knockoutStatus';
import type { GameStateSnapshot } from '../gameDb';
import { assertHeadingsNest, assertNoTripleBlankLines, headingOutline } from '../testSupport/promptOutlineHelpers';
import { buildCityHexStandingsBody } from './cityHexStandingsText';
import { formatHomeRegionHexCodesForPrompt } from './consultPromptPartsHelpers';
import { shiftMarkdownHeadings, topLevelHeading } from './promptSpec/sectionHeadings';
import {
  GENERIC_OBJECTIVE_SENTENCE,
  REGION_VS_REGION_SCENARIO_WIN_CONTROL_SNIPPET,
  WIN_CONDITION_REMINDER_FIRST_SENTENCE,
  buildScenarioObjectiveRulesBlock,
  buildScenarioProgressLines,
  buildWinConditionReminderClause,
} from './scenarioGoals';

test('region_vs_region reminder uses home-region wording', () => {
  const text = buildWinConditionReminderClause({ scenarioId: 'region_vs_region' });
  assert.ok(text.includes(WIN_CONDITION_REMINDER_FIRST_SENTENCE));
  assert.match(text, /air strikes/i);
});

test('a share replaces the every-hex reminder', () => {
  const text = buildWinConditionReminderClause({ scenarioId: 'region_vs_region', controlWinMinUrbanShare: 0.9 });
  assert.match(text, /see the share below/);
  assert.ok(text.includes(WIN_CONDITION_REMINDER_FIRST_SENTENCE));
  assert.match(text, /no single side wins/);
});

/**
 * Builds a two-seat snapshot for the commander `opponent`, optionally with an explored-hex list.
 *
 * Purpose: The progress lines read the scenario id, the perspective, and the explored hexes.
 * When to use: Each progress-line case below.
 * Expected outcome: A region_vs_region snapshot.
 * Exceptions: None.
 */
function stateWith(exploredHexes?: readonly string[]): GameStateSnapshot {
  return {
    scenarioId: 'region_vs_region',
    playerPerspective: AI_SEAT_IDS[0],
    exploredHexes,
    seats: [
      { seatId: HUMAN_SEAT_ID, seatOrder: 1, kind: 'human', homeRegion: 'South', outTurn: null, commander: null },
      { seatId: AI_SEAT_IDS[0], seatOrder: 2, kind: 'ai', homeRegion: 'North', outTurn: null, commander: null },
    ],
  } as unknown as GameStateSnapshot;
}

/**
 * Builds one side's knockout status row.
 *
 * Purpose: Cases vary the name, city hexes, loss counts, rule, and seat.
 * When to use: Each progress-line case below.
 * Expected outcome: A row whose loss fields follow `everyHexRule`.
 * Exceptions: None.
 */
function row(
  name: string,
  cityHexes: readonly string[],
  everyHexRule = false,
  cells = 1,
  seatId: SeatId = HUMAN_SEAT_ID
): SideKnockoutStatus {
  return {
    seatId,
    name,
    cityHexes: cityHexes.map((h3Index) => ({ h3Index, urbanCells: cells })),
    homeLoss: {
      lostUrbanCells: 30,
      totalUrbanCells: 100,
      neededUrbanCells: everyHexRule ? 0 : 90,
      lostHexes: 4,
      totalHexes: 10,
      everyHexRule,
      homeLost: false,
    },
    viewerHeldHomeUrbanCells: 12,
  };
}

/**
 * Wraps rows in a status value.
 *
 * Purpose: The builder takes the whole status.
 * When to use: Each progress-line case below.
 * Expected outcome: A status with the given share.
 * Exceptions: None.
 */
function statusOf(own: SideKnockoutStatus, enemies: readonly SideKnockoutStatus[], share: number | null = 0.9): KnockoutStatusForSeat {
  return { share, own, enemies };
}

/**
 * The side bullets of a progress result, without the Standings subsection after them.
 *
 * Purpose: The bullet cases compare only the lines they were written for.
 * When to use: A case that counts or indexes the bullets.
 * Expected outcome: The lines before the blank line that precedes the Standings heading.
 * Exceptions: Fails the test when the subsection is missing.
 */
function bulletsOf(lines: readonly string[]): readonly string[] {
  const heading = lines.indexOf('## Standings');
  assert.ok(heading > 0 && lines[heading - 1] === '', lines.join('\n'));
  return lines.slice(0, heading - 1);
}

/**
 * A three-side progress result on a state with the given turn and win rule.
 *
 * Purpose: The standings cases need rows with different seats and a state that carries a turn.
 * When to use: The standings cases below.
 * Expected outcome: The status and the progress lines built from it.
 * Exceptions: None.
 */
function standingsCase(turnNumber: number, victory?: GameStateSnapshot['victory']) {
  const state: GameStateSnapshot = { ...stateWith(), turnNumber, victory };
  const status = statusOf(row('North', ['a'], false, 1, AI_SEAT_IDS[0]), [
    row('South', ['b', 'c', 'd'], false, 1, HUMAN_SEAT_ID),
    row('East', ['e', 'f'], false, 1, AI_SEAT_IDS[1]),
  ]);
  return { status, lines: buildScenarioProgressLines(state, status) };
}

test('a standings subsection closes the progress lines, after the unchanged bullets', () => {
  const { status, lines } = standingsCase(12);
  assert.deepEqual(lines.slice(-4), [
    '',
    '## Standings',
    '',
    buildCityHexStandingsBody({ status, victory: undefined, turnNumber: 12 }),
  ]);
  const bullets = bulletsOf(lines);
  assert.equal(bullets.length, lines.length - 4);
  assert.deepEqual(
    bullets.filter((line) => line.startsWith('- ')).map((line) => line.slice(0, line.indexOf(':'))),
    ['- Your side', '- South', '- East']
  );
});

test('the standings say when a limited match ends and that an unlimited one has no limit', () => {
  assert.ok(standingsCase(12).lines.at(-1)!.endsWith('This match has no turn limit. It ends when one side is left, or when every side would be knocked out on the same turn.'));
  const limited = standingsCase(12, { rule: 'most_city_hexes_at_turn_limit', turnLimit: 30 });
  assert.ok(limited.lines.at(-1)!.includes('This is turn 12 of 30.'));
});

test('the standings heading sits one level under Scenario Progress, with and without a briefing', () => {
  const { lines } = standingsCase(12);
  const text = `${topLevelHeading('Scenario Progress')}\n\n${lines.join('\n')}`;
  assert.deepEqual(headingOutline(text), ['# Scenario Progress', '## Standings']);
  assertHeadingsNest(headingOutline(text));
  assertNoTripleBlankLines(text);
  const printed = text.split('\n');
  const heading = printed.indexOf('## Standings');
  assert.equal(printed[heading - 1], '');
  assert.equal(printed[heading + 1], '');
  const header = printed.indexOf('| Place | Side | Code | City hexes |');
  assert.equal(printed[header - 1], '');
  const briefed = shiftMarkdownHeadings(text, 1);
  assert.deepEqual(headingOutline(briefed), ['## Scenario Progress', '### Standings']);
  assertNoTripleBlankLines(briefed);
});

test('the own row states its city hexes and home loss, and lists city hexes when near knockout', () => {
  const lines = bulletsOf(buildScenarioProgressLines(stateWith(), statusOf(row('North', ['a', 'b']), [])));
  assert.equal(
    lines[0],
    "- Your side: you hold 2 city hexes. Other sides and Neutral hold 30 of your home's 100 original urban cells. You are knocked out if they reach 90, or if you lose every city hex."
  );
  assert.equal(lines[1], `  Your city hexes: ${formatHomeRegionHexCodesForPrompt(['a'])} (1 urban cell), ${formatHomeRegionHexCodesForPrompt(['b'])} (1 urban cell).`);
  assert.equal(lines.length, 2);
});

test('an enemy with more than five city hexes gets one line and no listing', () => {
  const lines = bulletsOf(buildScenarioProgressLines(stateWith(), statusOf(row('North', ['a', 'b', 'c', 'd', 'e', 'f']), [row('South', ['a', 'b', 'c', 'd', 'e', 'f', 'g'], false, 1, AI_SEAT_IDS[1])])));
  assert.equal(lines.length, 2);
  assert.equal(
    lines[1],
    "- South: holds 7 city hexes. Other sides and Neutral hold 30 of its home's 100 original urban cells, 12 of them yours. It is knocked out if they reach 90, or if it loses every city hex."
  );
});

test('an enemy near knockout lists its city hexes by what the viewer has explored', () => {
  const enemy = row('South', ['a', 'b'], false, 3);
  const codes = `${formatHomeRegionHexCodesForPrompt(['a'])} (3 urban cells), ${formatHomeRegionHexCodesForPrompt(['b'])} (3 urban cells)`;
  const all = buildScenarioProgressLines(stateWith(['a', 'b']), statusOf(row('North', []), [enemy]));
  assert.ok(all.includes(`  Its city hexes: ${codes}. Taking all of them knocks it out.`));
  const missingList = buildScenarioProgressLines(stateWith(), statusOf(row('North', []), [enemy]));
  assert.ok(missingList.includes(`  Its city hexes: ${codes}. Taking all of them knocks it out.`));
  const some = buildScenarioProgressLines(stateWith(['a']), statusOf(row('North', []), [enemy]));
  assert.ok(some.includes(`  Its known city hexes: ${formatHomeRegionHexCodesForPrompt(['a'])} (3 urban cells). Some of its city hexes are unexplored.`));
  const none = buildScenarioProgressLines(stateWith([]), statusOf(row('North', []), [enemy]));
  assert.ok(none.includes('  Its city hexes are unexplored.'));
});

test('the every-hex fallback uses its own wording for both rows', () => {
  const lines = buildScenarioProgressLines(stateWith(), statusOf(row('North', ['a', 'b', 'c', 'd', 'e', 'f'], true), [row('South', ['a', 'b', 'c', 'd', 'e', 'f'], true)], null));
  assert.equal(
    lines[0],
    '- Your side: you hold 6 city hexes. Other sides and Neutral hold 4 of your 10 home hexes. You are knocked out if they hold all of them, or if you lose every city hex.'
  );
  assert.equal(
    lines[1],
    '- South: holds 6 city hexes. Other sides and Neutral hold 4 of its 10 home hexes. It is knocked out if they hold all of them, or if it loses every city hex.'
  );
});

test('city hex counts read as none, one, and several', () => {
  const none = bulletsOf(buildScenarioProgressLines(stateWith(), statusOf(row('North', []), [])));
  assert.match(none[0]!, /you hold no city hexes\./);
  assert.equal(none.length, 1);
  const one = buildScenarioProgressLines(stateWith(), statusOf(row('North', ['a']), []));
  assert.match(one[0]!, /you hold 1 city hex\./);
  const three = buildScenarioProgressLines(stateWith(), statusOf(row('North', ['a', 'b', 'c']), []));
  assert.match(three[0]!, /you hold 3 city hexes\./);
});

test('no progress lines without a status or outside region_vs_region', () => {
  assert.deepEqual(buildScenarioProgressLines(stateWith(), null), []);
  const other = { ...stateWith(), scenarioId: 'skirmish' } as unknown as GameStateSnapshot;
  assert.deepEqual(buildScenarioProgressLines(other, statusOf(row('North', []), [])), []);
});

test('the objective block names three knockout paths and the share', () => {
  const state = stateWith();
  const share = buildScenarioObjectiveRulesBlock(state, { controlWinMinUrbanShare: 0.9 });
  assert.ok(share.includes('90% of its original urban cells'));
  assert.ok(share.includes('(3) Taking every city hex the enemy holds anywhere.'));
  const plain = buildScenarioObjectiveRulesBlock(state);
  assert.equal(plain, buildScenarioObjectiveRulesBlock(state, {}));
  assert.ok(plain.includes(REGION_VS_REGION_SCENARIO_WIN_CONTROL_SNIPPET));
  assert.ok(plain.includes('every hex of the enemy home region'));
});

test('absent or unrecognised scenario id uses only the generic objective', () => {
  const absent = buildWinConditionReminderClause({});
  const unrecognised = buildWinConditionReminderClause({ scenarioId: 'skirmish' });
  assert.equal(absent, GENERIC_OBJECTIVE_SENTENCE);
  assert.equal(unrecognised, GENERIC_OBJECTIVE_SENTENCE);
  assert.doesNotMatch(absent, /home region/);
  assert.doesNotMatch(absent, /production capacity can be destroyed/);
  assert.doesNotMatch(unrecognised, /home region/);
});
