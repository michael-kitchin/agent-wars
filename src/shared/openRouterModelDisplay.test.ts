/**
 * Tests for OpenRouter model dropdown label formatting.
 * Run with: node dist/shared/openRouterModelDisplay.test.js
 */

import assert from 'node:assert/strict';
import type { OpenRouterModel } from './ipc/openRouterTypes';
import { formatModelOptionLabel, formatModelOptionSuffix } from './openRouterModelDisplay';

/**
 * Builds a minimal model fixture for label tests.

 * Purpose: Keeps cases focused on the fields under test.
 * When to use: Inside this file’s assertions.
 * Expected outcome: An `OpenRouterModel` with id `m` plus optional overrides.
 * Exceptions: None.
 */
function model(overrides: Partial<OpenRouterModel> = {}): OpenRouterModel {
  return { id: 'm', ...overrides };
}

/**
 * Verifies cost suffix from string prompt and completion rates.

 * Purpose: Locks `(prompt + completion) * 1e6` → `$…/M` cents formatting.
 * When to use: After changing cost scaling or decimal rounding.
 * Expected outcome: `$18.00/M` alone when reasoning is absent.
 * Exceptions: None.
 */
function testBothStringPrices(): void {
  assert.equal(
    formatModelOptionSuffix(
      model({ pricing: { prompt: '0.000003', completion: '0.000015' } })
    ),
    ' [$18.00/M]'
  );
}

/**
 * Verifies numeric pricing fields are accepted like strings.

 * Purpose: Guards OpenRouter rows that emit numbers instead of decimal strings.
 * When to use: After changing price coercion.
 * Expected outcome: Same `$18.00/M` as the string case.
 * Exceptions: None.
 */
function testNumericPrices(): void {
  assert.equal(
    formatModelOptionSuffix(
      model({
        pricing: {
          prompt: 0.000003 as unknown as string,
          completion: 0.000015 as unknown as string,
        },
      })
    ),
    ' [$18.00/M]'
  );
}

/**
 * Verifies a single usable price still produces a cost part.

 * Purpose: Missing sibling price must not drop the whole cost part.
 * When to use: After changing “usable field” rules.
 * Expected outcome: `$3.00/M` from prompt only.
 * Exceptions: None.
 */
function testOnePriceOnly(): void {
  assert.equal(
    formatModelOptionSuffix(model({ pricing: { prompt: '0.000003' } })),
    ' [$3.00/M]'
  );
}

/**
 * Verifies invalid or missing prices and off/unknown reasoning yield no suffix.

 * Purpose: Essential failure path for garbage pricing / absent reasoning.
 * When to use: After changing finite-number guards or omit-empty reasoning rules.
 * Expected outcome: Empty string when neither cost nor on-reasoning applies.
 * Exceptions: None.
 */
function testNeitherPrice(): void {
  assert.equal(formatModelOptionSuffix(model({})), '');
  assert.equal(formatModelOptionSuffix(model({ pricing: {} })), '');
  assert.equal(
    formatModelOptionSuffix(model({ pricing: { prompt: 'nope', completion: 'NaN' } })),
    ''
  );
  assert.equal(
    formatModelOptionSuffix(model({ pricing: { prompt: '   ', completion: '\t' } })),
    ''
  );
}

/**
 * Verifies non-finite scaled totals omit the cost part.

 * Purpose: Guards Infinity after scaling.
 * When to use: After changing cost math.
 * Expected outcome: Empty suffix when cost is non-finite and reasoning is off/unknown.
 * Exceptions: None.
 */
function testNonFiniteRejected(): void {
  assert.equal(
    formatModelOptionSuffix(model({ pricing: { prompt: 'Infinity' } })),
    ''
  );
}

/**
 * Verifies on/off/unknown reasoning status phrases.

 * Purpose: Locks reasoning metadata: effort label, `reasoning: default`, or omit.
 * When to use: After changing `formatReasoningStatusPart` rules.
 * Expected outcome: On phrases as specified; off/unknown omit the part.
 * Exceptions: None.
 */
function testReasoningStatusParts(): void {
  assert.equal(
    formatModelOptionSuffix(
      model({ reasoning: { default_enabled: true, default_effort: ' high ' } })
    ),
    ' [reasoning: high]'
  );
  assert.equal(
    formatModelOptionSuffix(model({ reasoning: { default_enabled: true } })),
    ' [reasoning: default]'
  );
  assert.equal(
    formatModelOptionSuffix(model({ reasoning: { mandatory: true, default_effort: 'medium' } })),
    ' [reasoning: medium]'
  );
  assert.equal(
    formatModelOptionSuffix(model({ reasoning: { mandatory: true } })),
    ' [reasoning: default]'
  );
  assert.equal(
    formatModelOptionSuffix(
      model({
        reasoning: { default_enabled: false, mandatory: true, default_effort: 'low' },
      })
    ),
    ' [reasoning: low]'
  );
  assert.equal(
    formatModelOptionSuffix(
      model({ reasoning: { default_enabled: false, mandatory: false, default_effort: 'high' } })
    ),
    ''
  );
  assert.equal(
    formatModelOptionSuffix(model({ reasoning: { default_effort: 'high' } })),
    ''
  );
  assert.equal(
    formatModelOptionSuffix(model({ reasoning: { default_enabled: false } })),
    ''
  );
}

/**
 * Verifies full part order cost → reasoning status.

 * Purpose: Locks the bracket assembly order from the display contract.
 * When to use: After changing suffix join logic.
 * Expected outcome: ` [$9.00/M, reasoning: high]`.
 * Exceptions: None.
 */
function testFullComboOrder(): void {
  assert.equal(
    formatModelOptionSuffix(
      model({
        pricing: { prompt: '0.000004', completion: '0.000005' },
        reasoning: { default_effort: 'high', default_enabled: true },
      })
    ),
    ' [$9.00/M, reasoning: high]'
  );
  assert.equal(
    formatModelOptionSuffix(
      model({
        pricing: { prompt: '0.000004', completion: '0.000005' },
        reasoning: { default_enabled: true },
      })
    ),
    ' [$9.00/M, reasoning: default]'
  );
}

/**
 * Verifies `$…/M` amounts round to cents with two fractional digits.

 * Purpose: Locks dollar-and-cent display (half-up to nearest cent).
 * When to use: After changing cost rounding or `toFixed` digits.
 * Expected outcome: `$1.50/M`, `$0.15/M`, `$0.16/M` from values that round up.
 * Exceptions: None.
 */
function testCentsRounding(): void {
  assert.equal(
    formatModelOptionSuffix(model({ pricing: { prompt: '0.0000015' } })),
    ' [$1.50/M]'
  );
  assert.equal(
    formatModelOptionSuffix(model({ pricing: { prompt: '0.00000015' } })),
    ' [$0.15/M]'
  );
  assert.equal(
    formatModelOptionSuffix(model({ pricing: { prompt: '0.000000154' } })),
    ' [$0.15/M]'
  );
  assert.equal(
    formatModelOptionSuffix(model({ pricing: { prompt: '0.000000156' } })),
    ' [$0.16/M]'
  );
}

/**
 * Verifies labels use name/id and ignore description content.

 * Purpose: Description is tooltip-only; must not alter option text.
 * When to use: After changing `formatModelOptionLabel`.
 * Expected outcome: Name/id + suffix; description absent from the string.
 * Exceptions: None.
 */
function testLabelIgnoresDescription(): void {
  const labeled = formatModelOptionLabel(
    model({
      name: 'GPT',
      description: 'Should not appear',
      pricing: { prompt: '0.000001' },
    })
  );
  assert.equal(labeled, 'GPT [$1.00/M]');
  assert.equal(formatModelOptionLabel(model({ id: 'only-id' })), 'only-id');
}

/**
 * Runs OpenRouter model display tests.

 * Purpose: Node entrypoint for shared test discovery.
 * When to use: `node dist/shared/openRouterModelDisplay.test.js`.
 * Expected outcome: Throws on failure; logs pass when all succeed.
 * Exceptions: Propagates assertion errors.
 */
function run(): void {
  testBothStringPrices();
  testNumericPrices();
  testOnePriceOnly();
  testNeitherPrice();
  testNonFiniteRejected();
  testReasoningStatusParts();
  testFullComboOrder();
  testCentsRounding();
  testLabelIgnoresDescription();
  console.log('openRouterModelDisplay.test.ts passed');
}

run();
