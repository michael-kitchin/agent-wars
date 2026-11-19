import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sideCodesToDisplayNames } from './sideCodeDisplayText';
import { AI_SEAT_KIND, HUMAN_SEAT_KIND } from './seatRoster';
import { sideDisplayName, type SideDisplaySeat } from './sideNicknames';

const HUMAN: SideDisplaySeat = { seatId: 'human', kind: HUMAN_SEAT_KIND, homeRegion: '', nickname: null };
const A1: SideDisplaySeat = { seatId: 'opponent', kind: AI_SEAT_KIND, homeRegion: 'Iberia', nickname: 'Sonnet 5.5' };
const A2: SideDisplaySeat = { seatId: 'opponent2', kind: AI_SEAT_KIND, homeRegion: 'Italy', nickname: 'DS 4.1 Flash' };
const A3: SideDisplaySeat = { seatId: 'opponent3', kind: AI_SEAT_KIND, homeRegion: 'Poland', nickname: 'GPT 6.2 Sol' };
const SEATS: readonly SideDisplaySeat[] = [HUMAN, A1, A2, A3];

describe('sideCodesToDisplayNames', () => {
  it('replaces whole codes in a sentence', () => {
    assert.equal(
      sideCodesToDisplayNames('Keep the peace with a2 and a3.', SEATS),
      'Keep the peace with DS 4.1 Flash and GPT 6.2 Sol.',
    );
  });

  it('replaces a code before a possessive and leaves uppercase hex codes alone', () => {
    assert.equal(sideCodesToDisplayNames("a3's armor hit CI", SEATS), "GPT 6.2 Sol's armor hit CI");
  });

  it('replaces codes beside punctuation', () => {
    assert.equal(
      sideCodesToDisplayNames('(a2), a1, a3.', SEATS),
      '(DS 4.1 Flash), Sonnet 5.5, GPT 6.2 Sol.',
    );
  });

  it('shows the human seat by its display name', () => {
    assert.equal(sideCodesToDisplayNames('h1 is weak', SEATS), 'Human is weak');
  });

  it('leaves unit ids, longer tokens, and uppercase codes unchanged', () => {
    for (const text of ['a1-i3', 'a2-i31-s7', 'a12', 'ba1', 'A1', 'A2']) {
      assert.equal(sideCodesToDisplayNames(text, SEATS), text);
    }
  });

  it('leaves a code unchanged when no seat has it', () => {
    assert.equal(sideCodesToDisplayNames('a4 attacks', SEATS), 'a4 attacks');
  });

  it('returns the text unchanged for an empty seat list or text without a code', () => {
    assert.equal(sideCodesToDisplayNames('a1 and a2', []), 'a1 and a2');
    assert.equal(sideCodesToDisplayNames('No codes here.', SEATS), 'No codes here.');
  });

  it('uses the default name for a seat whose nickname is the empty string', () => {
    const blank: SideDisplaySeat = { ...A1, nickname: '' };
    assert.equal(sideCodesToDisplayNames('a1', [blank]), sideDisplayName(blank));
  });
});
