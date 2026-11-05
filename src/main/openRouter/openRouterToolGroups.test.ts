import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  filterToolNamesForTacticalBattle,
  getGroupIdForToolName,
  getToolNamesForEnabledGroups,
  resolveConsultToolNames,
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

test('strategic consults keep get_map and rules', () => {
  const planning = getToolNamesForEnabledGroups(['planning']);
  const names = resolveConsultToolNames({
    requested: planning,
    usePrecomputation: true,
    tactical: false,
    allToolNames: planning,
    groupIdForToolName: getGroupIdForToolName,
  });
  assert.deepEqual([...names].sort(), ['check_distance', 'get_map', 'plan_route', 'rules']);
  assert.deepEqual(
    [...filterToolNamesForTacticalBattle(planning, getGroupIdForToolName)].sort(),
    ['check_distance', 'get_map', 'plan_route', 'rules']
  );
});
