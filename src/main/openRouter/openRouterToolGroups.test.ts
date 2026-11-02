import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  filterToolNamesForStrategicConsult,
  filterToolNamesForTacticalBattle,
  getGroupIdForToolName,
  getToolNamesForEnabledGroups,
  TOOL_GROUP_REGISTRY,
} from './openRouterToolGroups';

test('filterToolNamesForTacticalBattle: keeps battle tools from every enabled group', () => {
  const all = TOOL_GROUP_REGISTRY.flatMap((g) => [...g.toolNames]);
  assert.deepEqual(
    [...filterToolNamesForTacticalBattle(all, getGroupIdForToolName)].sort(),
    ['assess_unit', 'check_distance', 'estimate_combat', 'get_map', 'plan_route', 'rules']
  );
});

test('the production group contains the mercenary tools', () => {
  const production = TOOL_GROUP_REGISTRY.find((group) => group.id === 'production');
  assert.ok(production);
  assert.ok(production.toolNames.includes('query_mercenaries'));
  assert.ok(production.toolNames.includes('hire_mercenaries'));
});

test('filterToolNamesForTacticalBattle: honors disabled tool groups', () => {
  const planningOnly = getToolNamesForEnabledGroups(['planning']);
  assert.deepEqual(
    [...filterToolNamesForTacticalBattle(planningOnly, getGroupIdForToolName)].sort(),
    ['check_distance', 'get_map', 'plan_route', 'rules']
  );
});

test('filterToolNamesForStrategicConsult drops get_map and keeps rules', () => {
  const planning = getToolNamesForEnabledGroups(['planning']);
  assert.deepEqual(
    [...filterToolNamesForStrategicConsult(planning)].sort(),
    ['check_distance', 'plan_route', 'rules']
  );
  assert.deepEqual(
    [...filterToolNamesForTacticalBattle(planning, getGroupIdForToolName)].sort(),
    ['check_distance', 'get_map', 'plan_route', 'rules']
  );
});
