import * as assert from 'assert';

/**
 * Asserts the roster-gated transport guidance in a system prompt.
 *
 * Purpose: The air and naval sections, rules, and JSON contracts appear only when the roster holds that unit type.
 * When to use: Prompt matrix cases after building a system prompt for one roster and group mask.
 * Expected outcome: Returns when the prompt matches the roster; throws an assertion error naming the mask otherwise.
 * Exceptions: Propagates assertion errors.
 */
export function assertRosterTransportGuidance(args: { systemPrompt: string; mask: number; hasAir: boolean; hasNaval: boolean }): void {
  const { systemPrompt, mask, hasAir, hasNaval } = args;
  if (hasAir) {
    assert.ok(systemPrompt.includes('# Air Operations Status'), `air-ops status guidance missing for mask=${mask}`);
    assert.ok(
      systemPrompt.includes('hopping controlled intact airports') &&
        systemPrompt.includes('plan_route confirms the chain'),
      `air-ops rules guidance missing for mask=${mask}`
    );
    assert.ok(
      systemPrompt.includes('Optional top-level air actions: airStrikes[] entries use'),
      `air-strike JSON contract guidance missing for mask=${mask}`
    );
    assert.ok(
      systemPrompt.includes('ferryOrders[] entries use { "unitId" or "unitIds", "destination": "<hex code>" }'),
      `ferry JSON contract guidance missing for mask=${mask}`
    );
  } else {
    assert.ok(!systemPrompt.includes('# Air Operations Status'), `air-ops section must be omitted when roster has no air, mask=${mask}`);
    assert.ok(!systemPrompt.includes('airStrikes'), `airStrikes must be omitted when roster has no air, mask=${mask}`);
  }
  if (hasNaval) {
    assert.ok(systemPrompt.includes('# Naval Transport Status'), `naval transport missing for mask=${mask}`);
    assert.ok(systemPrompt.includes('Embark: coastal'), `embark rule missing for mask=${mask}`);
  } else {
    assert.ok(!systemPrompt.includes('# Naval Transport Status'), `naval section must be omitted when the roster has no naval unit, mask=${mask}`);
  }
  if (hasAir) {
    assert.ok(systemPrompt.includes('An air unit carries up to 2 infantry units'), `airlift rule missing for mask=${mask}`);
  }
  if (hasNaval) {
    assert.ok(systemPrompt.includes('transport_move'), `sealift actions missing for mask=${mask}`);
  } else {
    assert.ok(!systemPrompt.includes('transport_move'), `transport_move must be omitted when roster has no naval, mask=${mask}`);
  }
}
