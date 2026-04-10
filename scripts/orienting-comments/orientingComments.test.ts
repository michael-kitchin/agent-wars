import * as assert from 'assert';
import * as ts from 'typescript';
import { buildSignatureHint } from './commentGenerate.js';
import { planEditsForSourceFile } from './applyEdits.js';
import { isValidOrientingBlock, needsSignatureSummaryRefresh } from './commentValidate.js';
import { discoverTargets } from './discovery.js';

/**
 * Runs lightweight assertions for orienting-comment discovery and planning.
 *
 * Purpose: Protects essential contracts without coupling to full repository scans.
 * When to use: From `npm run test:orienting-comments` after compiling the tool.
 * Expected outcome: Throws assertion errors when invariants regress.
 * Exceptions: None.
 */
function parseSf(text: string): ts.SourceFile {
  return ts.createSourceFile('fixture.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

{
  const sf = parseSf(`export class Demo {
    public x = 1;
    public m(): void {}
  }`);
  const targets = discoverTargets(sf);
  assert.equal(targets.length, 2);
  const edits = planEditsForSourceFile(sf);
  assert.equal(edits.length, 2);
}

{
  const sf = parseSf(`export class Base {
    /** ok */
    public override toString(): string { return ''; }
  }`);
  assert.equal(discoverTargets(sf).length, 0);
}

{
  const sf = parseSf(`export interface I {
    readonly n: number;
    go(): void;
  }`);
  const targets = discoverTargets(sf);
  assert.equal(targets.length, 3);
  assert.ok(targets.some((t) => t.kind === 'interfaceDeclaration' && t.displayName === 'I'));
  assert.ok(targets.filter((t) => t.kind !== 'interfaceDeclaration').every((t) => t.isInterfaceMember));
}

{
  const good = `/**
 * Summary line here.
 *
 * Contract: Stable contract text for tests.
 * When to use: When tests need a valid block.
 * Expected outcome: Validation passes.
 * Exceptions: None.
 */`;
  assert.ok(isValidOrientingBlock(good, 'contract'));
}

{
  const stacked = `/**\n * A\n */\n/**\n * B\n *\n * Contract: c\n * When to use: d\n * Expected outcome: e\n * Exceptions: None.\n */`;
  assert.equal(isValidOrientingBlock(stacked, 'contract'), false);
}

{
  const leaky = 'Defines `f` (function f(): string { const x = 1; }).';
  assert.equal(needsSignatureSummaryRefresh('functionImplementation', leaky), true);
  assert.equal(needsSignatureSummaryRefresh('functionOverload', leaky), true);
  assert.equal(needsSignatureSummaryRefresh('field', leaky), false);
}

{
  const sf = parseSf(`export const x = 1;\nexport const bag = { a: 1, b() {} };`);
  const targets = discoverTargets(sf);
  assert.ok(targets.some((t) => t.kind === 'moduleVariable' && t.displayName === 'x'));
  assert.ok(targets.some((t) => t.kind === 'moduleVariable' && t.displayName === 'bag'));
  assert.ok(targets.some((t) => t.kind === 'objectProperty' && t.displayName === 'a'));
  assert.ok(targets.some((t) => t.kind === 'method' && t.displayName === 'b'));
}

{
  const sf = parseSf(`export const items = { k1: 1, k2: 2 };`);
  const items = discoverTargets(sf).find((t) => t.kind === 'moduleVariable' && t.displayName === 'items');
  assert.ok(items && ts.isVariableDeclaration(items.node));
  const hint = buildSignatureHint(sf, items!.node);
  assert.ok(!hint.includes('{'));
  assert.ok(!hint.includes('k1'));
  assert.ok(!hint.includes('k2'));
}

{
  const inner = `/**
 * Documents the module-scope binding x (x = 1).

 * Purpose: Supports maintainability by documenting why x exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */`;
  const source = `/**
 * Documents the module-scope binding x (x = 1).

 * Purpose: Supports maintainability by documenting why x exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const ${inner}
x = 1;`;
  const sf = parseSf(source);
  const edits = planEditsForSourceFile(sf);
  assert.equal(edits.length, 1);
  assert.ok(edits[0]!.newText === '');
}

{
  const sf = parseSf(`export interface I { n: number; }\nexport type T = { k: string };`);
  const targets = discoverTargets(sf);
  assert.ok(targets.some((t) => t.kind === 'interfaceDeclaration' && t.displayName === 'I'));
  assert.ok(targets.some((t) => t.kind === 'field' && t.displayName === 'n'));
  assert.ok(targets.some((t) => t.kind === 'typeAliasDeclaration' && t.displayName === 'T'));
  assert.ok(targets.some((t) => t.kind === 'field' && t.displayName === 'k'));
}

{
  const sf = parseSf(`export function f(a: string): void;
export function f(a: number): void;
export function f(a: string | number): void {}`);
  assert.equal(discoverTargets(sf).length, 3);
}

{
  const source = `export class C {
    /**
     * Summary line here.
     *
     * Purpose: Purpose text for tests.
     * When to use: When tests need a valid block.
     * Expected outcome: Validation passes.
     * Exceptions: None.
     */
    public m(): void {}
  }`;
  const sf = parseSf(source);
  assert.equal(planEditsForSourceFile(sf).length, 0);
}

{
  const source = `export class C {
    /**
     * Summary line here.
     *
     * Purpose: Purpose text for tests.
     * When to use: When tests need a valid block.
     * Expected outcome: Validation passes.
     * Exceptions: None.
     */
    public m(): void {}
  }`;
  const sf1 = parseSf(source);
  const edits = planEditsForSourceFile(sf1);
  assert.equal(edits.length, 0);
}

console.log('orientingComments.test.ts: ok');
