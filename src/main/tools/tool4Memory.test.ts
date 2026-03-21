/**
 * Tool 4 (Strategic Memory) — happy path and essential failure cases per execution plan.
 * Run with: node dist/tools/tool4Memory.test.js
 */

import * as assert from 'assert';
import { executeTool4 } from './tool4Memory';

const emptyState = { turnNumber: 1 };
const emptyMap = new Map<string, [number, number]>();
const noopResolve = (): string | undefined => undefined;

function testMemoryDeleteMissingKey(): void {
  const result = executeTool4(
    'memory_delete',
    { key: 'nonexistent_key' },
    emptyState,
    emptyMap,
    noopResolve
  );
  assert.strictEqual(result.status, 'error');
  assert.ok((result as { error?: string }).error?.includes('Memory not found'));
}

function testMemoryWriteEmptyContent(): void {
  const result = executeTool4(
    'memory_write',
    { key: 'k', content: '' },
    emptyState,
    emptyMap,
    noopResolve
  );
  assert.strictEqual(result.status, 'error');
  assert.strictEqual((result as { error?: string }).error, 'Content cannot be empty');
}

function testMemoryWriteContentOver500(): void {
  const result = executeTool4(
    'memory_write',
    { key: 'k', content: 'x'.repeat(501) },
    emptyState,
    emptyMap,
    noopResolve
  );
  assert.strictEqual(result.status, 'error');
  assert.ok((result as { error?: string }).error?.includes('500 character limit'));
}

function testMemoryWriteInvalidKey(): void {
  const result = executeTool4(
    'memory_write',
    { key: 'bad key', content: 'ok' },
    emptyState,
    emptyMap,
    noopResolve
  );
  assert.strictEqual(result.status, 'error');
  assert.ok((result as { error?: string }).error?.includes('alphanumeric'));
}

function testMemoryReadRequiresKeyOrTagsOrTierOrAll(): void {
  const result = executeTool4(
    'memory_read',
    {},
    emptyState,
    emptyMap,
    noopResolve
  );
  assert.strictEqual(result.status, 'error');
  assert.ok((result as { error?: string }).error?.includes('memory_read requires'));
}

function testMemoryDeleteRequiresKey(): void {
  const result = executeTool4(
    'memory_delete',
    {},
    emptyState,
    emptyMap,
    noopResolve
  );
  assert.strictEqual(result.status, 'error');
  assert.ok((result as { error?: string }).error?.includes('key'));
}

function run(): void {
  testMemoryDeleteMissingKey();
  testMemoryWriteEmptyContent();
  testMemoryWriteContentOver500();
  testMemoryWriteInvalidKey();
  testMemoryReadRequiresKeyOrTagsOrTierOrAll();
  testMemoryDeleteRequiresKey();
  console.log('tool4Memory tests passed');
}

run();
