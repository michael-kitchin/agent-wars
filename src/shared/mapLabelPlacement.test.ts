/**
 * Contracts for which place names are drawn and where.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import type { MapLabelAnchor, MapLabelFeature } from './mapLabelPack';
import { parseMapLabelPack } from './mapLabelPack';
import { labelFeatureIsCandidate, placeMapLabels, type LabelPlacementInput } from './mapLabelPlacement';
import {
  CONTINENT_BESIDE_COUNTRY_OPACITY,
  CONTINENT_LABEL_OPACITY,
  COUNTRY_BESIDE_STATE_OPACITY,
  COUNTRY_LABEL_OPACITY,
  STATE_LABEL_OPACITY,
  labelKindOpacity,
  visibleLabelKinds,
  type MapLabelKind,
} from './mapLabelRules';

const VIEW = { width: 200, height: 200 };
const MEASURE = { width: 20, height: 10 };

/**
 * Confirms the three name bands.
 *
 * Purpose: Borders and labels share this rule, so the bands stay fixed.
 * When to use: As the contract test for `visibleLabelKinds`.
 * Expected outcome: Zoom 3 is continents. Zoom 5 is continents and countries. A tactical view is countries and states.
 * Exceptions: Assertion failures name the band that moved.
 */
test('label kinds follow zoom and the tactical view', () => {
  assert.deepEqual(visibleLabelKinds(3, false), ['continent']);
  assert.deepEqual(visibleLabelKinds(5, false), ['continent', 'country']);
  assert.deepEqual(visibleLabelKinds(3, true), ['country', 'state']);
});

/**
 * Confirms how strongly each kind is painted.
 *
 * Purpose: Country zoom fades continents. A tactical view fades countries and omits continents.
 * When to use: As the contract test for `labelKindOpacity`.
 * Expected outcome: A lone continent, a country beside continents, and a state are the theme color. A continent beside countries is four fifths. A country beside states is three fifths.
 * Exceptions: Assertion failures name the kind whose strength moved.
 */
test('label opacity follows the view', () => {
  assert.equal(labelKindOpacity('continent', 3, false), CONTINENT_LABEL_OPACITY);
  assert.equal(labelKindOpacity('continent', 4, false), CONTINENT_BESIDE_COUNTRY_OPACITY);
  assert.equal(labelKindOpacity('continent', 5, false), CONTINENT_BESIDE_COUNTRY_OPACITY);
  assert.equal(labelKindOpacity('country', 5, false), COUNTRY_LABEL_OPACITY);
  assert.equal(labelKindOpacity('country', 3, true), COUNTRY_BESIDE_STATE_OPACITY);
  assert.equal(labelKindOpacity('state', 3, true), STATE_LABEL_OPACITY);
  assert.equal(COUNTRY_LABEL_OPACITY, 1);
  assert.equal(CONTINENT_BESIDE_COUNTRY_OPACITY, 4 / 5);
  assert.equal(CONTINENT_LABEL_OPACITY, COUNTRY_LABEL_OPACITY);
  assert.equal(STATE_LABEL_OPACITY, COUNTRY_LABEL_OPACITY);
  assert.equal(COUNTRY_BESIDE_STATE_OPACITY, 3 / 5);
});

/**
 * Confirms an off-screen primary point yields to a fragment that is on screen.
 *
 * Purpose: A country that is only partly visible still needs a name inside the view.
 * When to use: As the contract test for fragment choice.
 * Expected outcome: The placed label uses anchor index 1.
 * Exceptions: Assertion failures when the primary point is used or the label is omitted.
 */
test('an off-screen primary anchor yields to a fragment on screen', () => {
  const placed = placeMapLabels(input({
    features: [named('adm0:AAA', 'country', [anchor(0, 0, 0), anchor(100, 100, 1_000_000_000)])],
    kinds: ['country'],
  }));
  assert.equal(placed.length, 1);
  assert.equal(placed[0]?.anchorIndex, 1);
});

/**
 * Confirms the previous anchor stays while it is usable.
 *
 * Purpose: A name should not jump to a closer point on every small pan.
 * When to use: As the contract test for hysteresis.
 * Expected outcome: Anchor 1 is kept even though anchor 0 is closer to the center.
 * Exceptions: Assertion failures when the closer anchor wins.
 */
test('the previous anchor is kept while it stays usable', () => {
  const placed = placeMapLabels(input({
    features: [named('adm0:AAA', 'country', [anchor(100, 100, 0), anchor(40, 40, 1_000_000_000)])],
    kinds: ['country'],
    previousAnchors: new Map([['adm0:AAA', 1]]),
  }));
  assert.equal(placed[0]?.anchorIndex, 1);
});

/**
 * Confirms a state that sits on a country is kept and painted after it.
 *
 * Purpose: Both names stay, and the later paint puts the state on top.
 * When to use: As the contract test for collision across those kinds.
 * Expected outcome: The country is placed first and the state second.
 * Exceptions: Assertion failures when either name is omitted or the state is painted first.
 */
test('a state that overlaps a country is painted over it', () => {
  const placed = placeMapLabels(input({
    features: [
      named('adm1:BBB', 'state', [anchor(100, 100, 1_000_000_000)], 'State'),
      named('adm0:AAA', 'country', [anchor(100, 100, 0)], 'Country'),
    ],
    kinds: ['country', 'state'],
  }));
  assert.deepEqual(placed.map((label) => label.featureId), ['adm0:AAA', 'adm1:BBB']);
});

/**
 * Confirms two states that sit on each other keep one.
 *
 * Purpose: Allowing a state over a country must not let two states cover each other.
 * When to use: As the contract test for same-kind collision.
 * Expected outcome: The state with the lesser id remains. The one listed first does not win by being first.
 * Exceptions: Assertion failures when both states are placed or the later id wins.
 */
test('two overlapping states keep one', () => {
  const placed = placeMapLabels(input({
    features: [
      named('adm1:BBB', 'state', [anchor(100, 100, 1_000_000_000)], 'Second'),
      named('adm1:AAA', 'state', [anchor(100, 100, 1_000_000_000)], 'First'),
    ],
    kinds: ['state'],
  }));
  assert.deepEqual(placed.map((label) => label.featureId), ['adm1:AAA']);
});

/**
 * Confirms a continent under a country is kept.
 *
 * Purpose: The country zoom draws both, and the country name has to stay readable on top.
 * When to use: As the contract test for cross-kind collision.
 * Expected outcome: Both labels are placed, continent first.
 * Exceptions: Assertion failures when either name is omitted or the country is painted first.
 */
test('a continent that overlaps a country is kept', () => {
  const placed = placeMapLabels(input({
    features: [
      named('continent:EUROPE', 'continent', [anchor(100, 100, 0)], 'Europe'),
      named('adm0:FRA', 'country', [anchor(100, 100, 0)], 'France'),
    ],
    kinds: ['continent', 'country'],
  }));
  assert.deepEqual(placed.map((label) => label.featureId), ['continent:EUROPE', 'adm0:FRA']);
});

/**
 * Confirms a fragment thinner than the text is not used.
 *
 * Purpose: A sliver must not carry a name.
 * When to use: As the contract test for the radius test.
 * Expected outcome: No label, because the primary point is off screen and the fragment is too small.
 * Exceptions: Assertion failures when a label is placed.
 */
test('a fragment thinner than the text is rejected', () => {
  const placed = placeMapLabels(input({
    features: [named('adm0:AAA', 'country', [anchor(0, 0, 0), anchor(100, 100, 1)])],
    kinds: ['country'],
  }));
  assert.equal(placed.length, 0);
});

/**
 * Confirms a country waits one level past its stored minimum, with no linger.
 *
 * Purpose: Minor countries share a minimum of 5, so they must stay hidden at 5.25 and return at 6.
 * When to use: As the contract test for country eligibility.
 * Expected outcome: Minima 2, 3, and 4 pass at 5.25. Minimum 5 fails at 5.25 and 5.75, and passes at 6.
 * Exceptions: Assertion failures name the zoom that showed or hid the wrong country.
 */
test('a country waits one zoom level past its minimum', () => {
  const country = (minZoom: number) => named('adm0:X', 'country', [anchor(0, 0, 1)], 'X', minZoom);
  const kinds: MapLabelKind[] = ['continent', 'country'];
  for (const minZoom of [2, 3, 4]) assert.equal(labelFeatureIsCandidate(country(minZoom), kinds, 5.25), true);
  assert.equal(labelFeatureIsCandidate(country(5), kinds, 5.25), false);
  assert.equal(labelFeatureIsCandidate(country(5), kinds, 5.75), false);
  assert.equal(labelFeatureIsCandidate(country(5), kinds, 6), true);
});

/**
 * Confirms a state needs room on screen and may appear before its stored minimum.
 *
 * Purpose: Minor states share a minimum, so on-screen size is what removes them, while a large state lingers across a small zoom-out.
 * When to use: As the contract test for state eligibility.
 * Expected outcome: 55,108 m passes at zoom 7 and 41,520 m does not. 41,520 m passes at 7.5.
 *   A minimum of 8 still passes at zoom 7. A minimum of 8.6 does not.
 * Exceptions: Assertion failures name the radius or minimum that was judged the wrong way.
 */
test('a state needs its minimum zoom, the linger, and room on screen', () => {
  const state = (radiusM: number, minZoom: number) => named('adm1:X', 'state', [anchor(0, 0, radiusM)], 'X', minZoom);
  const kinds: MapLabelKind[] = ['country', 'state'];
  assert.equal(labelFeatureIsCandidate(state(55_108, 6.7), kinds, 7), true);
  assert.equal(labelFeatureIsCandidate(state(41_520, 6.7), kinds, 7), false);
  assert.equal(labelFeatureIsCandidate(state(41_520, 6.7), kinds, 7.5), true);
  assert.equal(labelFeatureIsCandidate(state(55_108, 8), kinds, 7), true);
  assert.equal(labelFeatureIsCandidate(state(55_108, 8.6), kinds, 7), false);
});

/**
 * Confirms a small primary anchor does not hide a state that has a large fragment.
 *
 * Purpose: The stored primary point can sit on a sliver while a larger piece of the same state is nameable.
 * When to use: As the contract test for which radius the size rule reads.
 * Expected outcome: The state is a candidate at zoom 7.
 * Exceptions: Assertion failures when the primary radius is the one that was tested.
 */
test('the largest anchor decides whether a state has room', () => {
  const state = named('adm1:X', 'state', [anchor(0, 0, 1_371), anchor(1, 1, 55_108)], 'X', 6.6);
  assert.equal(labelFeatureIsCandidate(state, ['state'], 7), true);
});

/**
 * Confirms continents skip the zoom and size tests, and a kind that is not in view is refused.
 *
 * Purpose: A world view names every continent. A detail view does not.
 * When to use: As the contract test for kind filtering.
 * Expected outcome: The continent passes at zoom 1.5 in a continent view and fails in a country-and-state view.
 * Exceptions: Assertion failures when a continent is dropped or a hidden kind is kept.
 */
test('a continent has no zoom or size test, and another kind is refused', () => {
  const continent = named('continent:X', 'continent', [anchor(0, 0, 0)], 'X', 99);
  assert.equal(labelFeatureIsCandidate(continent, ['continent'], 1.5), true);
  assert.equal(labelFeatureIsCandidate(continent, ['country', 'state'], 7), false);
});

/**
 * Confirms the larger state wins when rank and minimum zoom match.
 *
 * Purpose: Two states that share a place should keep the one with more room for its name.
 * When to use: As the contract test for the radius tie-break.
 * Expected outcome: The state with the larger anchor remains. The lesser id does not win.
 * Exceptions: Assertion failures when both states are placed or the smaller one wins.
 */
test('the state with more room wins a collision between equal ranks', () => {
  const placed = placeMapLabels(input({
    features: [
      named('adm1:AAA', 'state', [anchor(100, 100, 1_000_000_000)]),
      named('adm1:BBB', 'state', [anchor(100, 100, 2_000_000_000)]),
    ],
    kinds: ['state'],
  }));
  assert.deepEqual(placed.map((label) => label.featureId), ['adm1:BBB']);
});

/**
 * Confirms a document with an unknown kind is rejected.
 *
 * Purpose: Only continents, countries, and states are named.
 * When to use: As the contract test for `parseMapLabelPack`.
 * Expected outcome: An error that names the kind.
 * Exceptions: Assertion failures when the document is accepted.
 */
test('a city kind is rejected', () => {
  const text = JSON.stringify({
    schema_version: '1.0.0',
    kind: 'map_labels',
    features: [{ id: 'x', kind: 'city', name: 'City', rank: 0, min_zoom: 0, anchors: [[0, 0, 1]] }],
  });
  assert.throws(() => parseMapLabelPack(text), /kind/);
});

/**
 * Builds a placement input with a projection that uses longitude as x and latitude as y.
 *
 * Purpose: The tests choose coordinates directly instead of through Mercator.
 * When to use: From each placement test.
 * Expected outcome: An input at the given zoom, or zoom 4, with a 200-pixel view and a 20 by 10 measure.
 * Exceptions: None.
 */
function input(partial: {
  features: readonly MapLabelFeature[];
  kinds: readonly MapLabelKind[];
  previousAnchors?: ReadonlyMap<string, number>;
  zoom?: number;
}): LabelPlacementInput {
  return {
    features: partial.features,
    kinds: partial.kinds,
    zoom: partial.zoom ?? 4,
    viewSize: VIEW,
    project: (lat, lng) => ({ x: lng, y: lat }),
    measure: () => MEASURE,
    previousAnchors: partial.previousAnchors ?? new Map(),
  };
}

/**
 * Builds one feature.
 *
 * Purpose: The tests name the fields that matter and share the rest.
 * When to use: From a placement test.
 * Expected outcome: A feature whose bounds cover its anchors and whose minimum zoom is the given value, or 1.
 * Exceptions: None.
 */
function named(
  id: string,
  kind: MapLabelKind,
  anchors: readonly MapLabelAnchor[],
  name = id,
  minZoom = 1,
): MapLabelFeature {
  let west = anchors[0]!.lng;
  let east = west;
  let south = anchors[0]!.lat;
  let north = south;
  for (const anchor of anchors) {
    west = Math.min(west, anchor.lng);
    east = Math.max(east, anchor.lng);
    south = Math.min(south, anchor.lat);
    north = Math.max(north, anchor.lat);
  }
  return { id, kind, name, rank: 0, minZoom, anchors, bounds: { west, south, east, north } };
}

/**
 * Builds one anchor. The tests pass latitude, then longitude.
 *
 * Purpose: The projection uses longitude as x and latitude as y.
 * When to use: From a placement test.
 * Expected outcome: An anchor with the given radius.
 * Exceptions: None.
 */
function anchor(lat: number, lng: number, radiusM: number): MapLabelAnchor {
  return { lat, lng, radiusM };
}
