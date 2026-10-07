import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { REGIONAL_RULES_BY_ID } from './regionalRulesCatalog';

test('every regional rules row keeps cost ratios and a positive integer price', () => {
  for (const [id, row] of Object.entries(REGIONAL_RULES_BY_ID)) {
    const rules = row.rules;
    assert.equal(rules.armorCost, rules.infantryCost * 2, id);
    assert.equal(rules.navalCost, rules.infantryCost * 5, id);
    assert.equal(rules.airCost, rules.infantryCost * 3, id);
    for (const cost of [rules.infantryCost, rules.armorCost, rules.navalCost, rules.airCost]) {
      assert.equal(Number.isInteger(cost) && cost > 0, true, id);
    }
    assert.equal(row.tacticalResolution, row.strategicResolution + 3, id);
  }
});

test('regional rules catalog ids match tracked region packs', () => {
  const regionsDir = path.join(process.cwd(), 'data', 'generated', 'regions');
  const packedIds = readdirSync(regionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'qa')
    .map((entry) => entry.name)
    .filter((name) => existsSync(path.join(regionsDir, name, 'region_manifest.json.zip')))
    .sort();
  assert.deepEqual(Object.keys(REGIONAL_RULES_BY_ID).sort(), packedIds);
});
