import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getFilteredToolMetadata } from './openRouterToolCatalog';
import { getToolFlags } from './openRouterToolGroups';
import { buildAvailableToolsIntro, buildToolUsageGuidance } from './promptText';

/** Tool names a battle offers when every tool group is on; prompt text may only cite these. */
const BATTLE_TOOLS = ['plan_route', 'check_distance', 'assess_unit', 'estimate_combat'];

test('battle guidance names assess_unit and estimate_combat when enabled, never assess_hex', () => {
  const guidance = buildToolUsageGuidance(getToolFlags(BATTLE_TOOLS), true, 'tactical');
  assert.match(guidance, /assess_unit on sub-units/);
  assert.match(guidance, /one parent on the same cell/);
  assert.doesNotMatch(guidance, /results will be identical/);
  assert.match(guidance, /estimate_combat before any ranged or melee attack/);
  assert.ok(!guidance.includes('assess_hex'), guidance);
});

test('battle guidance names neither tool when only planning is enabled', () => {
  const guidance = buildToolUsageGuidance(getToolFlags(['plan_route', 'check_distance']), true, 'tactical');
  assert.ok(!guidance.includes('assess_unit'), guidance);
  assert.ok(!guidance.includes('estimate_combat'), guidance);
});

test('battle tools intro omits plan_route when planning is disabled', () => {
  const flags = getToolFlags(['assess_unit', 'estimate_combat']);
  for (const hasBestOptionsTable of [true, false]) {
    const intro = buildAvailableToolsIntro(flags, true, 'tactical', { hasBestOptionsTable });
    assert.ok(!intro.includes('plan_route'), intro);
    assert.ok(!intro.includes('routing tool'), intro);
  }
});

test('battle tool list uses battle prompt lines; strategic keeps the shared lines', () => {
  const tactical = getFilteredToolMetadata(['assess_unit', 'estimate_combat'], 'tactical');
  assert.match(tactical[0]!.promptLine, /^assess_unit\(unitId, radius\?\) - Battle briefing on one sub-unit/);
  assert.match(tactical[1]!.promptLine, /Does not cover air strikes/);
  const strategic = getFilteredToolMetadata(['assess_unit'], 'strategic');
  assert.match(strategic[0]!.promptLine, /one of your units/);
});
