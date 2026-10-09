import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { REGIONAL_RULES_BY_ID } from './regionalRulesCatalog';

test('every regional map keeps a tactical resolution three levels below strategic', () => {
  for (const [id, row] of Object.entries(REGIONAL_RULES_BY_ID)) {
    assert.equal(row.tacticalResolution, row.strategicResolution + 3, id);
    assert.ok(row.strategicResolution === 2 || row.strategicResolution === 3, id);
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
