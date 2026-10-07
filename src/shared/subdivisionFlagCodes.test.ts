import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { SUBDIVISION_FLAG_CODES } from './subdivisionFlagCodes';

test('SUBDIVISION_FLAG_CODES matches static/flags/subdivisions exactly', () => {
  const flagDir = path.join(process.cwd(), 'static', 'flags', 'subdivisions');
  const fileCodes = fs.existsSync(flagDir)
    ? fs.readdirSync(flagDir).filter((name) => name.endsWith('.svg')).map((name) => path.basename(name, '.svg')).sort()
    : [];
  assert.deepEqual([...SUBDIVISION_FLAG_CODES].sort(), fileCodes);
});
