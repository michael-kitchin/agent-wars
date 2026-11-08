/**
 * Contracts for which place names are drawn and where.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import type { MapLabelAnchor, MapLabelFeature } from './mapLabelPack';
import { parseMapLabelPack } from './mapLabelPack';
import { placeMapLabels, type LabelPlacementInput } from './mapLabelPlacement';
import {
  CONTINENT_BESIDE_COUNTRY_OPACITY,
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
 * Purpose: Country zoom fades continents and countries. A tactical view fades countries and states and omits continents.
 * When to use: As the contract test for `labelKindOpacity`.
 * Expected outcome: A lone continent stays at full strength. Beside countries it is half. Countries are two thirds. States are half.
 * Exceptions: Assertion failures name the kind whose strength moved.
 */
test('label opacity follows the view', () => {
  assert.equal(labelKindOpacity('continent', 3, false), 1);
  assert.equal(labelKindOpacity('continent', 4, false), CONTINENT_BESIDE_COUNTRY_OPACITY);
  assert.equal(labelKindOpacity('continent', 5, false), CONTINENT_BESIDE_COUNTRY_OPACITY);
  assert.equal(labelKindOpacity('country', 5, false), COUNTRY_LABEL_OPACITY);
  assert.equal(labelKindOpacity('country', 3, true), COUNTRY_LABEL_OPACITY);
  assert.equal(labelKindOpacity('state', 3, true), STATE_LABEL_OPACITY);
  assert.equal(COUNTRY_LABEL_OPACITY, 2 / 3);
  assert.equal(STATE_LABEL_OPACITY, 1 / 2);
  assert.equal(CONTINENT_BESIDE_COUNTRY_OPACITY, 1 / 2);
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
 * Confirms a state that sits on a country is dropped.
 *
 * Purpose: The country has priority, so the names do not cover each other.
 * When to use: As the contract test for collision.
 * Expected outcome: Only the country is placed.
 * Exceptions: Assertion failures when the state is also placed.
 */
test('a state that overlaps a country is dropped', () => {
  const placed = placeMapLabels(input({
    features: [
      named('adm0:AAA', 'country', [anchor(100, 100, 0)], 'Country'),
      named('adm1:BBB', 'state', [anchor(100, 100, 0)], 'State'),
    ],
    kinds: ['country', 'state'],
  }));
  assert.deepEqual(placed.map((label) => label.featureId), ['adm0:AAA']);
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
 * Expected outcome: An input at zoom 4 with a 200-pixel view and a 20 by 10 measure.
 * Exceptions: None.
 */
function input(partial: {
  features: readonly MapLabelFeature[];
  kinds: readonly MapLabelKind[];
  previousAnchors?: ReadonlyMap<string, number>;
}): LabelPlacementInput {
  return {
    features: partial.features,
    kinds: partial.kinds,
    zoom: 4,
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
 * Expected outcome: A feature whose bounds cover its anchors.
 * Exceptions: None.
 */
function named(
  id: string,
  kind: MapLabelKind,
  anchors: readonly MapLabelAnchor[],
  name = id,
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
  return { id, kind, name, rank: 0, minZoom: 1, anchors, bounds: { west, south, east, north } };
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
