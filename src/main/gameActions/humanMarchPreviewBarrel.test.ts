/**
 * Smoke test that the `humanMarchPreview` barrel resolves after the Phase 5 directory split.
 * Run with: `node dist/main/game-actions/humanMarchPreviewBarrel.test.js`
 */

import assert from 'node:assert/strict';
import { previewHumanMarchOrderImpl } from './humanMarchPreview';

assert.equal(typeof previewHumanMarchOrderImpl, 'function');
console.log('OK humanMarchPreview barrel smoke');
