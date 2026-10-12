/**
 * Contracts for armor stop chips along a strategic route.
 *
 * Purpose: The origin is never a stop label. Entered stop hexes become legend words. Other unit types stay quiet.
 * When to use: `node --test dist/main/gameActions/humanMarchPreview/armorMarchStopImpact.test.js` after `tsc -p tsconfig.main.json`.
 * Expected outcome: Mountain for a rugged destination, Urban then Mountain for a city on rugged ground, and null otherwise.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { setStrategicTerrainFlags } from '../../../shared/strategicTerrainFlags';
import { armorMarchStopImpact } from './humanMarchPreviewGroundRoute';

const origin = 'origin';
const plains = 'plains';
const rugged = 'rugged';
const cityAndRugged = 'city-rugged';

test('armor stop labels follow entered hexes only', () => {
  setStrategicTerrainFlags({
    rugged: [origin, rugged, cityAndRugged],
    arctic: [],
    city: [cityAndRugged],
  });
  try {
    assert.equal(armorMarchStopImpact('armor', [origin, plains]), null);
    assert.deepEqual(armorMarchStopImpact('armor', [plains, rugged])?.slower, ['Mountain']);
    assert.deepEqual(armorMarchStopImpact('armor', [origin, cityAndRugged])?.slower, ['Urban', 'Mountain']);
    assert.equal(armorMarchStopImpact('infantry', [origin, cityAndRugged]), null);
  } finally {
    setStrategicTerrainFlags(null);
  }
});
