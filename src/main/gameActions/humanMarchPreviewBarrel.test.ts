/**
 * Smoke test that the `humanMarchPreview` barrel resolves after the directory split.
 * Run with: `node dist/main/gameActions/humanMarchPreviewBarrel.test.js`
 */

import assert from 'node:assert/strict';
import { resolveHumanMarchOrderPreview } from './humanMarchPreview';

assert.equal(typeof resolveHumanMarchOrderPreview, 'function');
console.log('OK humanMarchPreview barrel smoke');
