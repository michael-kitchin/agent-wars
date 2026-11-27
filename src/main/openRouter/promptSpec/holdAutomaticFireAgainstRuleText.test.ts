/**
 * The orders contract paragraph for the automatic-fire list.
 * Run with: node dist/main/openRouter/promptSpec/holdAutomaticFireAgainstRuleText.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOLD_AUTOMATIC_FIRE_AGAINST_TALK_BULLET, buildHoldAutomaticFireAgainstParagraph } from './holdAutomaticFireAgainstRuleText';

test('the field paragraph is one line that names the field and the clear word', () => {
  const paragraph = buildHoldAutomaticFireAgainstParagraph('turn');
  assert.ok(paragraph.startsWith('Optional "holdAutomaticFireAgainst": '));
  assert.ok(paragraph.includes('["none"]'));
  assert.equal(paragraph.includes('\n'), false);
});

test('the field paragraph names the period of the consult', () => {
  const turn = buildHoldAutomaticFireAgainstParagraph('turn');
  const beat = buildHoldAutomaticFireAgainstParagraph('beat');
  assert.ok(turn.includes('also on a turn you are not consulted for'));
  assert.ok(beat.includes('also on a beat you are not consulted for'));
});

test('the field paragraph says a shared world-map hex can still be fired on', () => {
  assert.ok(buildHoldAutomaticFireAgainstParagraph('turn').includes(
    'The one exception is a world-map hex that also holds a unit of a side you have not listed: automatic fire can pick that hex, and its hits can fall on units of a listed side there.'
  ));
});

test('the talk bullet is one line that names the field and carries no list marker', () => {
  assert.ok(HOLD_AUTOMATIC_FIRE_AGAINST_TALK_BULLET.includes('"holdAutomaticFireAgainst"'));
  assert.equal(HOLD_AUTOMATIC_FIRE_AGAINST_TALK_BULLET.startsWith('-'), false);
  assert.equal(HOLD_AUTOMATIC_FIRE_AGAINST_TALK_BULLET.includes('\n'), false);
});

test('the field paragraph ties a listing to an agreement and says what it costs', () => {
  const paragraph = buildHoldAutomaticFireAgainstParagraph('turn');
  assert.ok(paragraph.includes(
    'List a side only to keep an agreement or a promise to hold fire toward it. A listed side can still fire at your units on its own, so listing a side you are fighting, or every side, gives up shots and protects nothing.'
  ));
  assert.ok(paragraph.includes('Take a side off the list when that agreement ends or the side attacks you.'));
});
