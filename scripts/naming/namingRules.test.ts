import * as assert from 'assert';
import {
  bannedSuffixIn,
  directoryViolations,
  isCamelCaseIdentifier,
  isKebabCaseSegment,
  isNumberedToolName,
  isPascalCaseIdentifier,
} from './rules.js';

assert.equal(isCamelCaseIdentifier('hexCoordinates'), true);
assert.equal(isCamelCaseIdentifier('hex-coordinates'), false);
assert.equal(isCamelCaseIdentifier('HexCoordinates'), false);

assert.equal(isPascalCaseIdentifier('GameStateSnapshot'), true);
assert.equal(isPascalCaseIdentifier('submitOrders'), false);

assert.equal(bannedSuffixIn('mapUtils'), 'Utils');
assert.equal(bannedSuffixIn('mapHelpers'), null);
assert.equal(bannedSuffixIn('submitOrdersImpl'), 'Impl');

assert.equal(isNumberedToolName('tool2Assessment'), true);
assert.equal(isNumberedToolName('TOOL2_NAMES'), true);
assert.equal(isNumberedToolName('assessment'), false);

assert.equal(isKebabCaseSegment('game-actions'), true);
assert.equal(isKebabCaseSegment('gameActions'), false);

{
  const kebab = directoryViolations('main/game-actions');
  assert.ok(kebab);
  assert.equal(kebab.category, 'directoryCasing');
  assert.equal(kebab.currentName, 'game-actions');
  assert.equal(kebab.suggestedName, 'gameActions');
}

{
  const brand = directoryViolations('main/openrouter');
  assert.ok(brand);
  assert.equal(brand.category, 'directoryCasing');
  assert.equal(brand.currentName, 'openrouter');
  assert.equal(brand.suggestedName, 'openRouter');
}

{
  const nested = directoryViolations('main/game-actions/humanMarchPreview');
  assert.equal(nested, null);
}

console.log('namingRules.test.ts: ok');
