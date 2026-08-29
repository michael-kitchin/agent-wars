import * as assert from 'assert';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyLedgerEntry, FIND_IN_COMMENTS, FIND_IN_STRINGS } from './applyRename.js';
import { gitMvSteps } from './windowsGitMv.js';

assert.equal(FIND_IN_STRINGS, false);
assert.equal(FIND_IN_COMMENTS, false);

{
  const steps = gitMvSteps('C:/repo/src/main/openrouter', 'C:/repo/src/main/openRouter');
  assert.equal(steps.length, 2);
  assert.ok(steps[0].to.endsWith('.renamehold'));
}

{
  const steps = gitMvSteps('C:/repo/src/a.ts', 'C:/repo/src/b.ts');
  assert.equal(steps.length, 1);
}

function write(root: string, rel: string, body: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, 'utf8');
}

function makeFixture(kind: 'file' | 'symbol'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'naming-apply-'));
  write(
    root,
    'tsconfig.tools-src-ast.json',
    JSON.stringify({
      compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'node', noEmit: true },
      include: ['src/**/*.ts'],
    }),
  );
  if (kind === 'file') {
    write(root, 'src/sample-name.ts', 'export function sampleName(): number { return 1; }\n');
    write(root, 'src/importer.ts', "import { sampleName } from './sample-name';\nexport const n = sampleName();\n");
    write(
      root,
      'scripts/naming/renameLedger.json',
      JSON.stringify({
        entries: [
          {
            id: 'file-sample-name',
            kind: 'file',
            currentPath: 'src/sample-name.ts',
            currentName: 'sample-name.ts',
            proposedPath: 'src/sampleName.ts',
            proposedName: 'sampleName.ts',
            category: 'fileCasing',
            rationale: 'test',
            referencingFileCount: 1,
            linkedEntryIds: [],
            status: 'pending',
          },
        ],
      }),
    );
  } else {
    write(
      root,
      'src/def.ts',
      "export function oldName(): void {}\nexport const frozen = 'oldName';\n",
    );
    write(root, 'src/caller.ts', "import { oldName } from './def';\noldName();\n");
    write(
      root,
      'scripts/naming/renameLedger.json',
      JSON.stringify({
        entries: [
          {
            id: 'sym-oldName',
            kind: 'symbol',
            currentPath: 'src/def.ts',
            currentName: 'oldName',
            proposedName: 'newName',
            category: 'exportCasing',
            rationale: 'test',
            referencingFileCount: 1,
            linkedEntryIds: [],
            status: 'pending',
          },
        ],
      }),
    );
  }
  spawnSync('git', ['init'], { cwd: root, encoding: 'utf8' });
  spawnSync('git', ['add', '.'], { cwd: root, encoding: 'utf8' });
  return root;
}

{
  const root = makeFixture('file');
  applyLedgerEntry(root, 'file-sample-name', false);
  const importer = fs.readFileSync(path.join(root, 'src/importer.ts'), 'utf8');
  assert.ok(importer.includes("./sampleName"), importer);
  assert.ok(fs.existsSync(path.join(root, 'src/sampleName.ts')));
  const again = applyLedgerEntry(root, 'file-sample-name', false);
  assert.equal(again.noop, true);
}

{
  const root = makeFixture('symbol');
  applyLedgerEntry(root, 'sym-oldName', false);
  const def = fs.readFileSync(path.join(root, 'src/def.ts'), 'utf8');
  const caller = fs.readFileSync(path.join(root, 'src/caller.ts'), 'utf8');
  assert.ok(def.includes('function newName'), def);
  assert.ok(def.includes("'oldName'"), def);
  assert.ok(caller.includes('newName()'), caller);
  assert.ok(!caller.includes('oldName()'), caller);
}

{
  const root = makeFixture('symbol');
  try {
    applyLedgerEntry(root, 'does-not-exist', false);
    assert.fail('expected throw');
  } catch (err) {
    assert.ok(String(err).includes('Unknown ledger id'));
  }
}

console.log('applyRename.test.ts: ok');
