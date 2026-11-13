/**
 * Contracts for reading the place-name document.
 * Run: `node dist/shared/mapLabelPack.test.js` after `npm run build:main`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseMapLabelPack } from './mapLabelPack';

/**
 * A minimal place-name document.
 *
 * Purpose: The tests name the feature fields that matter.
 * When to use: From each parse test.
 * Expected outcome: JSON with schema `1.0.0` and kind `map_labels`.
 * Exceptions: None.
 */
function document(features: readonly unknown[]): string {
  return JSON.stringify({ schema_version: '1.0.0', kind: 'map_labels', features });
}

/**
 * One stored feature with a single anchor.
 *
 * Purpose: The tests do not depend on unused fields.
 * When to use: From each parse test.
 * Expected outcome: A feature whose anchors are one triple at the origin.
 * Exceptions: None.
 */
function feature(kind: string, extra: Record<string, unknown> = {}): unknown {
  return { id: 'id', kind, name: 'Name', rank: 0, min_zoom: 0, anchors: [[0, 0, 1]], ...extra };
}

describe('map label pack', () => {
  /**
   * Confirms a strait flag is kept and a land record without the field is not narrow.
   *
   * Purpose: Old documents have no `narrow` field, and a missing field must not reject them.
   * When to use: As the contract test for the optional flag.
   * Expected outcome: A major water record with `"narrow": true` parses true. A state without the field parses false.
   * Exceptions: Assertion failures when the flag is thrown away or required.
   */
  it('reads the narrow flag only when it is true', () => {
    const water = parseMapLabelPack(document([feature('major_water', { narrow: true })])).features[0];
    assert.equal(water?.narrow, true);
    const state = parseMapLabelPack(document([feature('state')])).features[0];
    assert.equal(state?.narrow, false);
  });

  /**
   * Confirms a kind outside the place-name list rejects the document.
   *
   * Purpose: A river must not become a label.
   * When to use: As the contract test for an unknown kind.
   * Expected outcome: An error that names the kind.
   * Exceptions: Assertion failures when the document is accepted.
   */
  it('rejects a river kind', () => {
    assert.throws(() => parseMapLabelPack(document([feature('river')])), /kind/);
  });
});
