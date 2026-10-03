import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HexNamingCaptionBuilder, formatHexNamingCaptionHtml } from './hexNamingCaption';

test('formatHexNamingCaptionHtml bolds headings and leaves plain captions unstyled', () => {
  const grouped = new HexNamingCaptionBuilder()
    .appendHeading('Country1', null, false)
    .appendText('State1, State2; ')
    .appendHeading('Country2', null, false)
    .appendText('State3')
    .build();
  assert.equal(
    formatHexNamingCaptionHtml(grouped),
    '<strong>Country1:</strong> State1, State2; <strong>Country2:</strong> State3'
  );
  const water = new HexNamingCaptionBuilder().appendText('Arctic Ocean, North Pacific Ocean').build();
  assert.equal(formatHexNamingCaptionHtml(water), 'Arctic Ocean, North Pacific Ocean');
});

test('formatHexNamingCaptionHtml puts flags before country headings and country items', () => {
  const states = new HexNamingCaptionBuilder().appendHeading('France', 'FR', true).appendText('Normandy').build();
  assert.equal(
    formatHexNamingCaptionHtml(states),
    '<strong><img class="country-flag" src="flags/fr.svg" alt="" aria-hidden="true" draggable="false">France:</strong> Normandy'
  );
  const countries = new HexNamingCaptionBuilder().appendHeading('Africa', null, false).appendCountryItem('Somaliland', null).build();
  assert.equal(
    formatHexNamingCaptionHtml(countries),
    '<strong>Africa:</strong> <img class="country-flag" src="flag-unknown.svg" alt="" aria-hidden="true" draggable="false">Somaliland'
  );
});

test('formatHexNamingCaptionHtml escapes names and plain text', () => {
  const caption = new HexNamingCaptionBuilder().appendHeading('A&B', null, false).appendText('<x>').build();
  assert.equal(formatHexNamingCaptionHtml(caption), '<strong>A&amp;B:</strong> &lt;x&gt;');
});
