import assert from 'node:assert/strict';
import test from 'node:test';
import {
  blockingHoverMessageFromAirStrikeReason,
  blockingHoverMessageFromMarchInvalidReason,
  blockingHoverMessageFromRangedReason,
  blockingHoverMessageHtmlFromPlainMessage,
  composeResolutionMapToastBullets,
} from '../shared/orderPreviewBlockingCopy';
import { LAND_UNIT_DESTINATION_NOT_LANDMASS_REASON } from '../shared/landTraversalStrategic';
import {
  NAVAL_DESTINATION_NOT_OCCUPIABLE_REASON,
  STRATEGIC_DESTINATION_UNREACHABLE_REASON,
  TACTICAL_DESTINATION_BLOCKS_ENTRY_REASON,
} from '../shared/marchInvalidReasons';
import { ARMOR_MOVE_ENDS_ON_ENTER_REASON } from '../shared/strategicTerrainFlags';

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

const rangedBlockingCases: { input: string; expected: string | null }[] = [
  { input: 'Infantry: Target out of range (infantry range 1)', expected: 'Blocked: Range' },
  { input: 'Naval: Target out of range (naval range 2)', expected: 'Blocked: Range' },
  { input: 'Armor: Target out of range.', expected: 'Blocked: Range' },
  { input: 'Naval: Line of sight blocked by mountains.', expected: 'Blocked: Mountain' },
  { input: 'Target hex has no enemy units', expected: 'Blocked: No Target' },
  { input: 'Naval: Target hex has no enemy units', expected: 'Blocked: No Target' },
  { input: 'Target hex has no enemy', expected: 'Blocked: No Target' },
  { input: 'No tactical battle', expected: null },
];

test('blockingHoverMessageFromRangedReason (table)', () => {
  for (const { input, expected } of rangedBlockingCases) {
    assert.equal(blockingHoverMessageFromRangedReason(input), expected, input);
  }
});

const marchBlockingCases: { reason: string; terrainKind: string | null; expected: string | null }[] = [
  { reason: 'No valid tactical route', terrainKind: 'mountain', expected: 'Blocked: Unreachable' },
  { reason: TACTICAL_DESTINATION_BLOCKS_ENTRY_REASON, terrainKind: 'mountain', expected: 'Blocked: Mountain' },
  { reason: LAND_UNIT_DESTINATION_NOT_LANDMASS_REASON, terrainKind: 'water', expected: 'Blocked: Water' },
  { reason: NAVAL_DESTINATION_NOT_OCCUPIABLE_REASON, terrainKind: 'forest', expected: 'Blocked: Forest' },
  { reason: 'Outside tactical footprint', terrainKind: 'plains', expected: 'Blocked: Unreachable' },
  { reason: STRATEGIC_DESTINATION_UNREACHABLE_REASON, terrainKind: 'plains', expected: 'Blocked: Unreachable' },
  { reason: ARMOR_MOVE_ENDS_ON_ENTER_REASON, terrainKind: 'arctic', expected: 'Blocked: Unreachable' },
  { reason: 'Destination out of ferry range (4).', terrainKind: null, expected: 'Blocked: Range' },
  {
    reason: 'Ferry destination must be a human-controlled airport hex.',
    terrainKind: null,
    expected: 'Blocked: Invalid',
  },
  {
    reason: 'Ferry destination must have an intact airport.',
    terrainKind: null,
    expected: 'Blocked: Invalid',
  },
  {
    reason: '1st Air (ferry): Destination airport is not intact',
    terrainKind: null,
    expected: 'Blocked: Invalid',
  },
  {
    reason: '1st Air (ferry): Origin airport is not intact',
    terrainKind: null,
    expected: 'Blocked: Invalid',
  },
  {
    reason: 'Air units do not use tactical march',
    terrainKind: 'plains',
    expected: 'Blocked: Air — use strike mode or ferry (dbl-click)',
  },
  {
    reason: 'Land units cannot move directly from one water or arctic hex to another.',
    terrainKind: 'plains',
    expected: 'Blocked: Arctic, Water',
  },
  {
    reason: 'Mixed land/naval stacks can only move to coastal hexes.',
    terrainKind: 'mountain',
    expected: 'Blocked: Coastal',
  },
  {
    reason: 'Land units must move to land, coastal, or wetlands hexes',
    terrainKind: 'desert',
    expected: 'Blocked: Coastal, Land, Wetlands',
  },
];

test('blockingHoverMessageFromMarchInvalidReason (table)', () => {
  for (const { reason, terrainKind, expected } of marchBlockingCases) {
    const message = blockingHoverMessageFromMarchInvalidReason(reason, terrainKind);
    assert.equal(message, expected, reason);
    if (reason === ARMOR_MOVE_ENDS_ON_ENTER_REASON) assert.equal(message?.includes('Arctic'), false);
  }
});

const airStrikeBlockingCases: { input: string; expected: string | null }[] = [
  { input: 'Alpha: Target out of range (air range 3)', expected: 'Blocked: Range' },
  { input: 'Target out of range (air range 3)', expected: 'Blocked: Range' },
  { input: 'Alpha: Target hex has no enemy units', expected: 'Blocked: No enemies at target' },
  { input: 'Target is outside the tactical battle.', expected: 'Blocked: Target outside battle' },
  { input: 'Database not initialized', expected: null },
  { input: 'Odd future reason', expected: 'Blocked: Cannot strike here' },
];

test('blockingHoverMessageFromAirStrikeReason (table)', () => {
  for (const { input, expected } of airStrikeBlockingCases) {
    assert.equal(blockingHoverMessageFromAirStrikeReason(input), expected, input);
  }
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
  assert.equal(
    blockingHoverMessageHtmlFromPlainMessage('Blocked: Arctic, Water'),
    '<strong>Blocked:</strong> <span class="terrain-swatch" data-terrain-kind="arctic" aria-hidden="true"></span>Arctic, <span class="terrain-swatch" data-terrain-kind="water" aria-hidden="true"></span>Water'
  );
  assert.equal(
    blockingHoverMessageHtmlFromPlainMessage('Blocked: Coastal, Land, Wetlands'),
    '<strong>Blocked:</strong> <span class="terrain-swatch" data-terrain-kind="coastal" aria-hidden="true"></span>Coastal, Land, <span class="terrain-swatch" data-terrain-kind="wetlands" aria-hidden="true"></span>Wetlands'
  );
});
