import assert from 'node:assert/strict';
import test from 'node:test';
import {
  blockingHoverMessageFromAirStrikeReason,
  blockingHoverMessageFromMarchInvalidReason,
  blockingHoverMessageFromRangedReason,
  blockingHoverMessageHtmlFromPlainMessage,
  composeResolutionMapToastBullets,
} from '../shared/orderPreviewBlockingCopy';

test('composeResolutionMapToastBullets keeps primary when present', () => {
  const out = composeResolutionMapToastBullets(['• Direct fire: x'], ['• Melee engagements at 1 hex.']);
  assert.deepEqual(out, ['• Direct fire: x']);
});

test('composeResolutionMapToastBullets suppresses engagement-counter-only fallback', () => {
  assert.deepEqual(composeResolutionMapToastBullets([], ['• Melee engagements at 1 hex.']), []);
  assert.deepEqual(
    composeResolutionMapToastBullets([], ['• Ranged engagements at 2 hexes.', '• Melee engagements at 1 hex.']),
    []
  );
});

test('composeResolutionMapToastBullets keeps fallback when casualty outcomes present', () => {
  const fb = ['• Melee engagements at 1 hex.', '• Casualty outcomes at 1 hex.'];
  assert.deepEqual(composeResolutionMapToastBullets([], fb), fb);
});

test('blockingHoverMessageFromRangedReason', () => {
  assert.equal(blockingHoverMessageFromRangedReason('Infantry: Target out of range (infantry range 1)'), 'Blocked: Range');
  assert.equal(blockingHoverMessageFromRangedReason('Naval: Line of sight blocked by mountains.'), 'Blocked: Mountain');
  assert.equal(blockingHoverMessageFromRangedReason('Target hex has no enemy units'), 'Blocked: No Target');
  assert.equal(blockingHoverMessageFromRangedReason('Naval: Target hex has no enemy units'), 'Blocked: No Target');
  assert.equal(blockingHoverMessageFromRangedReason('Target hex has no enemy'), 'Blocked: No Target');
  assert.equal(blockingHoverMessageFromRangedReason('No tactical battle'), null);
});

test('blockingHoverMessageFromMarchInvalidReason', () => {
  assert.equal(blockingHoverMessageFromMarchInvalidReason('No valid tactical route', 'mountain'), 'Blocked: Mountain');
  assert.equal(blockingHoverMessageFromMarchInvalidReason('Destination out of ferry range (4).', null), 'Blocked: Range');
});

test('blockingHoverMessageFromAirStrikeReason is range-only', () => {
  assert.equal(
    blockingHoverMessageFromAirStrikeReason('Target out of range (air range 3)'),
    'Blocked: Range'
  );
  assert.equal(blockingHoverMessageFromAirStrikeReason('Target hex has no urban infrastructure'), null);
});

test('blockingHoverMessageHtmlFromPlainMessage bolds Blocked and escapes suffix', () => {
  assert.equal(
    blockingHoverMessageHtmlFromPlainMessage('Blocked: Range'),
    '<strong>Blocked:</strong> Range'
  );
  assert.equal(
    blockingHoverMessageHtmlFromPlainMessage('Blocked: <script>x</script>'),
    '<strong>Blocked:</strong> &lt;script&gt;x&lt;/script&gt;'
  );
});
