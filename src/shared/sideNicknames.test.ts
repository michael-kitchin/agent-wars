import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AI_SEAT_KIND, HUMAN_SEAT_KIND } from './seatRoster';
import {
  HUMAN_NICKNAME_DEFAULT,
  SIDE_NICKNAME_MAX_LENGTH,
  defaultAiNickname,
  nicknameFieldValue,
  normalizeSideNickname,
  sideDisplayName,
  storedAiNickname,
} from './sideNicknames';

describe('normalizeSideNickname', () => {
  it('trims a normal name and cuts it to 16 code points', () => {
    assert.equal(normalizeSideNickname('  Scout  '), 'Scout');
    assert.equal(SIDE_NICKNAME_MAX_LENGTH, 16);
    assert.equal(normalizeSideNickname('ABCDEFGHIJKLMNOPQRST'), 'ABCDEFGHIJKLMNOP');
  });

  it('drops characters the turn-update painter cannot safely show', () => {
    assert.equal(normalizeSideNickname('A<b'), 'Ab');
    assert.equal(normalizeSideNickname('A&B'), 'AB');
    assert.equal(normalizeSideNickname('A"B'), 'AB');
    assert.equal(normalizeSideNickname('A,B'), 'AB');
    assert.equal(normalizeSideNickname('A\nB'), 'AB');
    assert.equal(normalizeSideNickname('W. Turkey'), 'W. Turkey');
    assert.equal(normalizeSideNickname('Seven seas (open ocean)'), 'Seven seas open');
    assert.equal(normalizeSideNickname("O'Brien"), "O'Brien");
  });

  it('rejects the words the update popup already uses as sentence structure', () => {
    assert.equal(normalizeSideNickname('you'), '');
    assert.equal(normalizeSideNickname('YOUR'), '');
    assert.equal(normalizeSideNickname('Neutral'), '');
    assert.equal(normalizeSideNickname('we lost 1'), '');
    assert.equal(normalizeSideNickname('they took 2'), '');
    assert.equal(normalizeSideNickname('A and B'), '');
    assert.equal(normalizeSideNickname('Andes'), 'Andes');
  });

  it('treats a non-string as blank', () => {
    assert.equal(normalizeSideNickname(undefined), '');
    assert.equal(normalizeSideNickname(12), '');
  });
});

describe('storedAiNickname', () => {
  it('keeps a custom name and leaves the short home name unset', () => {
    assert.equal(storedAiNickname('Grok', 'Central African Republic', 'opponent'), 'Grok');
    assert.equal(storedAiNickname('C. African Republic', 'Central African Republic', 'opponent'), null);
    assert.equal(storedAiNickname('Seven seas (open ocean)', 'Seven seas (open ocean)', 'opponent'), null);
    assert.equal(storedAiNickname('you', 'Western Turkey', 'opponent'), null);
    assert.equal(nicknameFieldValue('C. African Republic', 'C. African Republic'), 'C. African Republic');
    assert.equal(nicknameFieldValue('Grok', 'C. African Republic'), 'Grok');
  });
});

describe('sideDisplayName', () => {
  it('uses a cleaned nickname when one is stored', () => {
    assert.equal(sideDisplayName({
      nickname: '  Grok  ',
      homeRegion: 'Western Turkey',
      seatId: 'opponent',
      kind: AI_SEAT_KIND,
    }), 'Grok');
  });

  it('falls back to Human for a human seat and the short home name for an AI seat', () => {
    assert.equal(HUMAN_NICKNAME_DEFAULT, 'Human');
    assert.equal(sideDisplayName({
      nickname: null,
      homeRegion: 'Western Turkey',
      seatId: 'human',
      kind: HUMAN_SEAT_KIND,
    }), 'Human');
    assert.equal(sideDisplayName({
      nickname: null,
      homeRegion: 'Western Turkey',
      seatId: 'opponent',
      kind: AI_SEAT_KIND,
    }), 'W. Turkey');
    assert.equal(defaultAiNickname('Western Turkey', 'opponent'), 'W. Turkey');
    assert.equal(sideDisplayName({
      nickname: null,
      homeRegion: '   ',
      seatId: 'opponent',
      kind: AI_SEAT_KIND,
    }), 'opponent');
    assert.equal(sideDisplayName({
      nickname: null,
      homeRegion: 'Central African Republic',
      seatId: 'opponent',
      kind: AI_SEAT_KIND,
    }), 'C. African Republic');
  });

  it('uses the same default when a stored nickname cleans to blank', () => {
    assert.equal(sideDisplayName({
      nickname: 'you',
      homeRegion: 'Western Turkey',
      seatId: 'human',
      kind: HUMAN_SEAT_KIND,
    }), 'Human');
    assert.equal(sideDisplayName({
      nickname: '<&>',
      homeRegion: '   ',
      seatId: 'opponent2',
      kind: AI_SEAT_KIND,
    }), 'opponent2');
  });
});
