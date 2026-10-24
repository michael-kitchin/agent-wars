import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatHumanKnockoutDialog } from './knockoutDialogCopy';
import { HUMAN_SEAT_ID, aiSeatIdForIndex } from './seatIds';
import { buildStandings, type StandingsSeatInput } from './standings';

const WEST = 'opponent' as const;
const EAST = aiSeatIdForIndex(2);
const LEVANT = aiSeatIdForIndex(3);

/**
 * A seat row with the fields a standings case overrides.
 *
 * Purpose: The cases share zeros and a null commander.
 * When to use: Each standings test.
 * Expected outcome: A complete `StandingsSeatInput`.
 * Exceptions: None.
 */
function seat(row: Pick<StandingsSeatInput, 'seatId' | 'seatOrder' | 'kind' | 'homeRegion' | 'place'> & Partial<StandingsSeatInput>): StandingsSeatInput {
  return {
    outTurn: null,
    outBy: null,
    consultationCount: 0,
    costUsd: 0,
    cityHexes: 0,
    commander: null,
    ...row,
  };
}

test('buildStandings lists four places, a revealed random doctrine, and the match cost', () => {
  const standings = buildStandings({
    viewerSeatId: HUMAN_SEAT_ID,
    gameEndReason: 'last_side_standing',
    turnNumber: 23,
    dateLabel: 'November 2nd, Year 1',
    modelLabels: {
      gemini: 'Google: Gemini 3.5 Flash',
      nova: 'Amazon: Nova Lite 1.0',
      haiku: 'Anthropic: Claude Haiku 5.5',
    },
    seats: [
      seat({
        seatId: HUMAN_SEAT_ID,
        seatOrder: 1,
        kind: 'human',
        homeRegion: 'Iraq & Kuwait',
        place: 2,
        outTurn: 23,
        outBy: WEST,
      }),
      seat({
        seatId: WEST,
        seatOrder: 2,
        kind: 'ai',
        homeRegion: 'Western Turkey',
        place: 1,
        consultationCount: 61,
        costUsd: 1.92,
        commander: { modelId: 'gemini', reasoningEffort: 'minimal', doctrineChoice: 'aggressive', revealedDoctrine: 'aggressive' },
      }),
      seat({
        seatId: EAST,
        seatOrder: 3,
        kind: 'ai',
        homeRegion: 'Eastern Turkey & Caucasus',
        place: 3,
        outTurn: 17,
        outBy: HUMAN_SEAT_ID,
        consultationCount: 44,
        costUsd: 1.1,
        commander: { modelId: 'nova', reasoningEffort: null, doctrineChoice: 'cautious', revealedDoctrine: 'cautious' },
      }),
      seat({
        seatId: LEVANT,
        seatOrder: 4,
        kind: 'ai',
        homeRegion: 'Levant & Cyprus',
        place: 4,
        outTurn: 8,
        outBy: WEST,
        consultationCount: 19,
        costUsd: 0.84,
        commander: { modelId: 'haiku', reasoningEffort: 'low', doctrineChoice: 'random', revealedDoctrine: 'balanced' },
      }),
    ],
  });
  assert.equal(standings.heading, 'You placed 2nd of 4.');
  assert.equal(standings.dateLine, 'Turn 23 · November 2nd, Year 1');
  assert.equal(standings.resultLine, 'Western Turkey is the last side standing. It knocked out Iraq & Kuwait on turn 23.');
  assert.deepEqual(standings.rows.map((row) => row.place), [1, 2, 3, 4]);
  assert.equal(standings.rows[0]?.name, 'Western Turkey');
  assert.equal(standings.rows[0]?.status, 'Winner');
  assert.equal(standings.rows[0]?.commanderSummary, 'Gemini 3.5 Flash · Minimal · Aggressive');
  assert.equal(standings.rows[0]?.consultationsLabel, '61 consultations');
  assert.equal(standings.rows[0]?.costLabel, '$1.92');
  assert.equal(standings.rows[0]?.dotColor, '#9D174D');
  assert.equal(standings.rows[1]?.name, 'Iraq & Kuwait (you)');
  assert.equal(standings.rows[1]?.status, 'Out, turn 23');
  assert.equal(standings.rows[1]?.commanderSummary, null);
  assert.equal(standings.rows[1]?.knockedOutBy, 'Knocked out by Western Turkey');
  assert.equal(standings.rows[2]?.status, 'Out, turn 17');
  assert.equal(standings.rows[2]?.commanderSummary, 'Nova Lite 1.0 · Cautious');
  assert.equal(standings.rows[2]?.knockedOutBy, 'Knocked out by you');
  assert.equal(standings.rows[3]?.commanderSummary, 'Claude Haiku 5.5 · Low · Random, drew Balanced');
  assert.equal(standings.rows[3]?.costLabel, '$0.84');
  assert.equal(standings.rows[3]?.knockedOutBy, 'Knocked out by Western Turkey');
  assert.equal(standings.totalLabel, 'Model cost this match');
  assert.equal(standings.totalCost, '$3.86');
});

test('buildStandings names two or three sides that share first', () => {
  const tied = [
    seat({ seatId: HUMAN_SEAT_ID, seatOrder: 1, kind: 'human', homeRegion: 'Iraq & Kuwait', place: 1, cityHexes: 6 }),
    seat({ seatId: WEST, seatOrder: 2, kind: 'ai', homeRegion: 'Western Turkey', place: 1, cityHexes: 6, commander: { modelId: null, reasoningEffort: null, doctrineChoice: 'balanced', revealedDoctrine: 'balanced' } }),
    seat({ seatId: EAST, seatOrder: 3, kind: 'ai', homeRegion: 'Eastern Turkey', place: 3, cityHexes: 2, outTurn: 9, commander: { modelId: null, reasoningEffort: null, doctrineChoice: 'balanced', revealedDoctrine: 'balanced' } }),
  ];
  const two = 'Iraq & Kuwait and Western Turkey share first place with 6 city hexes each.';
  assert.equal(buildStandings({ seats: tied, viewerSeatId: HUMAN_SEAT_ID, gameEndReason: 'turn_limit', turnNumber: 30, dateLabel: '', modelLabels: {} }).resultLine, two);
  assert.equal(buildStandings({ seats: tied, viewerSeatId: HUMAN_SEAT_ID, gameEndReason: 'mutual_elimination', turnNumber: 12, dateLabel: '', modelLabels: {} }).resultLine, two);
  assert.equal(buildStandings({ seats: tied, viewerSeatId: HUMAN_SEAT_ID, gameEndReason: 'turn_limit', turnNumber: 30, dateLabel: '', modelLabels: {} }).heading, 'No side won.');
  const three = [
    ...tied.slice(0, 2),
    seat({ seatId: EAST, seatOrder: 3, kind: 'ai', homeRegion: 'Eastern Turkey', place: 1, cityHexes: 6, commander: { modelId: null, reasoningEffort: null, doctrineChoice: 'balanced', revealedDoctrine: 'balanced' } }),
  ];
  const threeNames = 'Iraq & Kuwait, Western Turkey, and Eastern Turkey share first place with 6 city hexes each.';
  assert.equal(buildStandings({ seats: three, viewerSeatId: HUMAN_SEAT_ID, gameEndReason: 'turn_limit', turnNumber: 30, dateLabel: '', modelLabels: {} }).resultLine, threeNames);
  assert.equal(buildStandings({ seats: three, viewerSeatId: null, gameEndReason: 'mutual_elimination', turnNumber: 12, dateLabel: '', modelLabels: {} }).resultLine, threeNames);
});

test('buildStandings names one winner of a mutual wipe and of a watched match', () => {
  const seats = [
    seat({ seatId: WEST, seatOrder: 1, kind: 'ai', homeRegion: 'Western Turkey', place: 1, cityHexes: 8, commander: { modelId: null, reasoningEffort: null, doctrineChoice: 'balanced', revealedDoctrine: 'balanced' } }),
    seat({ seatId: EAST, seatOrder: 2, kind: 'ai', homeRegion: 'Eastern Turkey', place: 2, cityHexes: 3, commander: { modelId: null, reasoningEffort: null, doctrineChoice: 'balanced', revealedDoctrine: 'balanced' } }),
  ];
  const mutual = buildStandings({ seats, viewerSeatId: null, gameEndReason: 'mutual_elimination', turnNumber: 14, dateLabel: 'June, Year 2', modelLabels: {} });
  assert.equal(mutual.heading, 'Western Turkey wins.');
  assert.equal(mutual.resultLine, 'Western Turkey holds the most city hexes.');
  assert.equal(mutual.rows[0]?.status, '8 city hexes');
  assert.equal(mutual.rows[1]?.status, '3 city hexes');
  assert.equal(mutual.rows[0]?.name, 'Western Turkey');
  const watched = buildStandings({
    seats: [
      seats[0]!,
      seat({ seatId: EAST, seatOrder: 2, kind: 'ai', homeRegion: 'Eastern Turkey', place: 2, outTurn: 14, outBy: WEST, commander: { modelId: null, reasoningEffort: null, doctrineChoice: 'balanced', revealedDoctrine: 'balanced' } }),
    ],
    viewerSeatId: null,
    gameEndReason: 'last_side_standing',
    turnNumber: 14,
    dateLabel: '',
    modelLabels: {},
  });
  assert.equal(watched.heading, 'Western Turkey wins.');
  assert.equal(watched.resultLine, 'Western Turkey is the last side standing. It knocked out Eastern Turkey on turn 14.');
  const alone = buildStandings({
    seats: [seats[0]!, seat({ ...seats[1]!, outTurn: 4, outBy: null })],
    viewerSeatId: null,
    gameEndReason: 'last_side_standing',
    turnNumber: 4,
    dateLabel: '',
    modelLabels: {},
  });
  assert.equal(alone.resultLine, 'Western Turkey is the last side standing.');
});

test('buildStandings says the human ended the match, including a shared first', () => {
  const seats = [
    seat({ seatId: HUMAN_SEAT_ID, seatOrder: 1, kind: 'human', homeRegion: 'Iraq & Kuwait', place: 1, cityHexes: 5 }),
    seat({ seatId: WEST, seatOrder: 2, kind: 'ai', homeRegion: 'Western Turkey', place: 1, cityHexes: 5, commander: { modelId: null, reasoningEffort: null, doctrineChoice: 'balanced', revealedDoctrine: 'balanced' } }),
  ];
  const ended = buildStandings({ seats, viewerSeatId: HUMAN_SEAT_ID, gameEndReason: 'ended_by_human', turnNumber: 5, dateLabel: '', modelLabels: {} });
  assert.equal(ended.heading, 'No side won.');
  assert.equal(ended.resultLine, 'You ended the match on turn 5.');
  assert.equal(ended.rows[0]?.status, '5 city hexes');
  const won = buildStandings({
    seats: [seat({ ...seats[0]!, place: 1, cityHexes: 4 }), seat({ ...seats[1]!, place: 2, cityHexes: 1 })],
    viewerSeatId: HUMAN_SEAT_ID,
    gameEndReason: 'turn_limit',
    turnNumber: 30,
    dateLabel: '',
    modelLabels: {},
  });
  assert.equal(won.heading, 'You placed 1st of 2.');
  assert.equal(won.resultLine, 'Iraq & Kuwait holds the most city hexes at the end of turn 30.');
  assert.equal(won.rows[0]?.status, '4 city hexes');
});

test('formatHumanKnockoutDialog names the side or the reason', () => {
  const named = formatHumanKnockoutDialog({
    outByName: 'Western Turkey',
    turnNumber: 23,
    place: 2,
    seatCount: 4,
    reasons: ['home_control'],
    globalHome: false,
    controlShareLabel: '75%',
  });
  assert.equal(named.title, "You're out");
  assert.equal(named.lead, 'Western Turkey knocked you out on turn 23.');
  assert.equal(named.placeLine, 'You placed 2nd of 4.');
  const unnamed = formatHumanKnockoutDialog({
    outByName: null,
    turnNumber: 9,
    place: 3,
    seatCount: 4,
    reasons: ['no_city_hexes', 'home_cities_destroyed'],
    globalHome: true,
    controlShareLabel: '',
  });
  assert.equal(unnamed.lead, 'You hold no city hexes. Your home has no cities left.');
});
