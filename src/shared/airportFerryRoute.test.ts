/**
 * Airport-chain ferry search.
 * Run: `npm run build:main` then `node dist/shared/airportFerryRoute.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findAirportFerryRoute, type AirportFerryNode, type AirportFerryRouteRequest } from './airportFerryRoute';

/**
 * Builds a route request from a distance table.
 *
 * Purpose: Keeps each case on the contract instead of a map pack.
 * When to use: Every case in this file.
 * Expected outcome: Grid distance is the table value, or null when the pair is absent.
 * Exceptions: None.
 */
function request(args: {
  readonly originH3Index: string;
  readonly destinationH3Index: string;
  readonly owner: string;
  readonly nodes: readonly AirportFerryNode[];
  readonly edges: Readonly<Record<string, number | null>>;
  readonly hopRangeHexes?: (destinationH3Index: string) => number;
}): AirportFerryRouteRequest {
  return {
    originH3Index: args.originH3Index,
    destinationH3Index: args.destinationH3Index,
    owner: args.owner,
    nodes: args.nodes,
    gridDistance: (fromH3Index, toH3Index) => {
      const forward = args.edges[`${fromH3Index}>${toH3Index}`];
      if (forward !== undefined) return forward;
      const reverse = args.edges[`${toH3Index}>${fromH3Index}`];
      return reverse === undefined ? null : reverse;
    },
    hopRangeHexes: args.hopRangeHexes ?? (() => 4),
  };
}

/**
 * One intact airport owned by the player.
 *
 * Purpose: Most cases only vary the hex id.
 * When to use: Building the node list.
 * Expected outcome: A node the search may enter.
 * Exceptions: None.
 */
function airport(h3Index: string, owner = 'p1'): AirportFerryNode {
  return { h3Index, owner, intact: true, neutralBorder: false };
}

test('a hop of 4 returns the origin and the destination', () => {
  const result = findAirportFerryRoute(request({
    originH3Index: 'a',
    destinationH3Index: 'b',
    owner: 'p1',
    nodes: [airport('a'), airport('b')],
    edges: { 'a>b': 4 },
  }));
  assert.deepEqual(result, { reachable: true, pathH3Indexes: ['a', 'b'] });
});

test('a destination 8 away uses the intermediate airport and not the direct hop', () => {
  const result = findAirportFerryRoute(request({
    originH3Index: 'a',
    destinationH3Index: 'c',
    owner: 'p1',
    nodes: [airport('a'), airport('b'), airport('c')],
    edges: { 'a>c': 8, 'a>b': 4, 'b>c': 4 },
  }));
  assert.deepEqual(result, { reachable: true, pathH3Indexes: ['a', 'b', 'c'] });
});

test('a nearer illegal airport is skipped when a longer legal chain exists', () => {
  const result = findAirportFerryRoute(request({
    originH3Index: 'a',
    destinationH3Index: 'd',
    owner: 'p1',
    nodes: [
      airport('a'),
      { h3Index: 'wrong-owner', owner: 'p2', intact: true, neutralBorder: false },
      { h3Index: 'wrecked', owner: 'p1', intact: false, neutralBorder: false },
      { h3Index: 'border', owner: 'p1', intact: true, neutralBorder: true },
      airport('m'),
      airport('d'),
    ],
    edges: {
      'a>wrong-owner': 1,
      'wrong-owner>d': 1,
      'a>wrecked': 1,
      'wrecked>d': 1,
      'a>border': 1,
      'border>d': 1,
      'a>m': 4,
      'm>d': 4,
      'a>d': 8,
    },
  }));
  assert.deepEqual(result, { reachable: true, pathH3Indexes: ['a', 'm', 'd'] });
});

test('equal-length paths take the smaller next airport', () => {
  const result = findAirportFerryRoute(request({
    originH3Index: 'a',
    destinationH3Index: 'd',
    owner: 'p1',
    nodes: [airport('a'), airport('m'), airport('z'), airport('d')],
    edges: { 'a>m': 4, 'a>z': 4, 'm>d': 4, 'z>d': 4 },
  }));
  assert.deepEqual(result, { reachable: true, pathH3Indexes: ['a', 'm', 'd'] });
});

test('hop range 2 rejects a hop of 3 and accepts a hop of 2', () => {
  const nodes = [airport('a'), airport('far'), airport('near')];
  const rejected = findAirportFerryRoute(request({
    originH3Index: 'a',
    destinationH3Index: 'far',
    owner: 'p1',
    nodes,
    edges: { 'a>far': 3 },
    hopRangeHexes: () => 2,
  }));
  const accepted = findAirportFerryRoute(request({
    originH3Index: 'a',
    destinationH3Index: 'near',
    owner: 'p1',
    nodes,
    edges: { 'a>near': 2 },
    hopRangeHexes: () => 2,
  }));
  assert.deepEqual(rejected, { reachable: false, reason: 'No chain of your airports stays within ferry range.' });
  assert.deepEqual(accepted, { reachable: true, pathH3Indexes: ['a', 'near'] });
});

test('a missing, wrecked, foreign, or current airport is refused with its reason', () => {
  const nodes = [
    airport('a'),
    { h3Index: 'wrecked', owner: 'p1', intact: false, neutralBorder: false },
    { h3Index: 'border', owner: 'p1', intact: true, neutralBorder: true },
    airport('foreign', 'p2'),
  ];
  const missing = findAirportFerryRoute(request({
    originH3Index: 'a',
    destinationH3Index: 'nowhere',
    owner: 'p1',
    nodes,
    edges: {},
  }));
  const wrecked = findAirportFerryRoute(request({
    originH3Index: 'a',
    destinationH3Index: 'wrecked',
    owner: 'p1',
    nodes,
    edges: { 'a>wrecked': 1 },
  }));
  const border = findAirportFerryRoute(request({
    originH3Index: 'a',
    destinationH3Index: 'border',
    owner: 'p1',
    nodes,
    edges: { 'a>border': 1 },
  }));
  const foreign = findAirportFerryRoute(request({
    originH3Index: 'a',
    destinationH3Index: 'foreign',
    owner: 'p1',
    nodes,
    edges: { 'a>foreign': 1 },
  }));
  const same = findAirportFerryRoute(request({
    originH3Index: 'a',
    destinationH3Index: 'a',
    owner: 'p1',
    nodes,
    edges: {},
  }));
  assert.equal(missing.reachable, false);
  assert.equal(wrecked.reachable, false);
  assert.equal(border.reachable, false);
  assert.equal(foreign.reachable, false);
  assert.equal(same.reachable, false);
  if (!missing.reachable) assert.equal(missing.reason, 'Destination airport is not intact');
  if (!wrecked.reachable) assert.equal(wrecked.reason, 'Destination airport is not intact');
  if (!border.reachable) assert.equal(border.reason, 'Destination airport is not intact');
  if (!foreign.reachable) assert.equal(foreign.reason, 'Destination airport must be controlled by unit owner');
  if (!same.reachable) assert.equal(same.reason, 'Air unit is already based at that airport');
});

test('a null grid distance is not an edge and does not throw', () => {
  const result = findAirportFerryRoute(request({
    originH3Index: 'a',
    destinationH3Index: 'b',
    owner: 'p1',
    nodes: [airport('a'), airport('b')],
    edges: { 'a>b': null },
  }));
  assert.deepEqual(result, { reachable: false, reason: 'No chain of your airports stays within ferry range.' });
});

test('an unmeasured hop is an edge only when the disk fallback accepts it', () => {
  const nodes = [airport('a'), airport('b')];
  const accepted = findAirportFerryRoute({
    ...request({
      originH3Index: 'a',
      destinationH3Index: 'b',
      owner: 'p1',
      nodes,
      edges: { 'a>b': null },
    }),
    unmeasuredHopWithinRange: () => true,
  });
  const rejected = findAirportFerryRoute({
    ...request({
      originH3Index: 'a',
      destinationH3Index: 'b',
      owner: 'p1',
      nodes,
      edges: { 'a>b': null },
    }),
    unmeasuredHopWithinRange: () => false,
  });
  assert.deepEqual(accepted, { reachable: true, pathH3Indexes: ['a', 'b'] });
  assert.deepEqual(rejected, { reachable: false, reason: 'No chain of your airports stays within ferry range.' });
});
