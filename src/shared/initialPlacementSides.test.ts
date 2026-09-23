import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  claimInitialPlacementHex,
  findMixedInitialPlacementHexes,
  type InitialPlacementSide,
} from './initialPlacementSides';

describe('claimInitialPlacementHex', () => {
  it('records the first side to claim an empty hex', () => {
    const occupiedByHex = new Map<string, InitialPlacementSide>();
    assert.equal(claimInitialPlacementHex(occupiedByHex, 'hex-a', 'human'), true);
    assert.equal(occupiedByHex.get('hex-a'), 'human');
  });

  it('lets the same side claim a hex it already holds', () => {
    const occupiedByHex = new Map<string, InitialPlacementSide>([['hex-a', 'human']]);
    assert.equal(claimInitialPlacementHex(occupiedByHex, 'hex-a', 'human'), true);
    assert.equal(occupiedByHex.get('hex-a'), 'human');
  });

  it('rejects the other side and leaves the recorded side unchanged', () => {
    const occupiedByHex = new Map<string, InitialPlacementSide>([['hex-a', 'human']]);
    assert.equal(claimInitialPlacementHex(occupiedByHex, 'hex-a', 'opponent'), false);
    assert.equal(occupiedByHex.get('hex-a'), 'human');
  });
});

describe('findMixedInitialPlacementHexes', () => {
  it('returns hexes that contain both sides and ignores same-side stacks', () => {
    assert.deepEqual(
      findMixedInitialPlacementHexes([
        { h3Index: 'shared', side: 'human' },
        { h3Index: 'shared', side: 'opponent' },
        { h3Index: 'own', side: 'human' },
        { h3Index: 'own', side: 'human' },
        { h3Index: 'human-only', side: 'human' },
        { h3Index: 'opponent-only', side: 'opponent' },
      ]),
      ['shared']
    );
    assert.deepEqual(findMixedInitialPlacementHexes([]), []);
  });
});
