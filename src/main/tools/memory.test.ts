/**
 * Tool 4 (Strategic Memory) — happy path and essential failure cases per execution plan.
 * Run with: node dist/tools/memory.test.js
 */

import * as assert from 'assert';
import { executeMemory } from './memory';

/**
 * Documents the module-scope binding `emptyState` (emptyState).

 * Purpose: Supports maintainability by documenting why `emptyState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const emptyState = { /**
 * Documents the object literal property `turnNumber` (turnNumber: 1).

 * Purpose: Supports maintainability by documenting why `turnNumber` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
turnNumber: 1 };
/**
 * Documents the module-scope binding `emptyMap` (emptyMap).

 * Purpose: Supports maintainability by documenting why `emptyMap` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const emptyMap = new Map<string, [number, number]>();
/**
 * Documents the module-scope binding `noopResolve` (noopResolve).

 * Purpose: Supports maintainability by documenting why `noopResolve` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const noopResolve = (): string | undefined => undefined;

/**
 * Defines the `testMemoryDeleteMissingKey` function shape (function testMemoryDeleteMissingKey(): void).

 * Purpose: Supports maintainability by documenting why `testMemoryDeleteMissingKey` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testMemoryDeleteMissingKey(): void {
  const result = executeMemory(
    'opponent',
    'memory_delete',
    { key: 'nonexistent_key' },
    emptyState,
    emptyMap,
    noopResolve
  );
  assert.strictEqual(result.status, 'error');
  assert.ok((result as { error?: string }).error?.includes('Memory not found'));
}

/**
 * Defines the `testMemoryWriteEmptyContent` function shape (function testMemoryWriteEmptyContent(): void).

 * Purpose: Supports maintainability by documenting why `testMemoryWriteEmptyContent` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testMemoryWriteEmptyContent(): void {
  const result = executeMemory(
    'opponent',
    'memory_write',
    { key: 'k', content: '' },
    emptyState,
    emptyMap,
    noopResolve
  );
  assert.strictEqual(result.status, 'error');
  assert.strictEqual((result as { error?: string }).error, 'Content cannot be empty');
}

/**
 * Defines the `testMemoryWriteContentOver500` function shape (function testMemoryWriteContentOver500(): void).

 * Purpose: Supports maintainability by documenting why `testMemoryWriteContentOver500` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testMemoryWriteContentOver500(): void {
  const result = executeMemory(
    'opponent',
    'memory_write',
    { key: 'k', content: 'x'.repeat(501) },
    emptyState,
    emptyMap,
    noopResolve
  );
  assert.strictEqual(result.status, 'error');
  assert.ok((result as { error?: string }).error?.includes('500 character limit'));
}

/**
 * Defines the `testMemoryWriteInvalidKey` function shape (function testMemoryWriteInvalidKey(): void).

 * Purpose: Supports maintainability by documenting why `testMemoryWriteInvalidKey` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testMemoryWriteInvalidKey(): void {
  const result = executeMemory(
    'opponent',
    'memory_write',
    { key: 'bad key', content: 'ok' },
    emptyState,
    emptyMap,
    noopResolve
  );
  assert.strictEqual(result.status, 'error');
  assert.ok((result as { error?: string }).error?.includes('alphanumeric'));
}

/**
 * Defines the `testMemoryReadRequiresKeyOrTagsOrTierOrAll` function shape (function testMemoryReadRequiresKeyOrTagsOrTierOrAll(): void).

 * Purpose: Supports maintainability by documenting why `testMemoryReadRequiresKeyOrTagsOrTierOrAll` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testMemoryReadRequiresKeyOrTagsOrTierOrAll(): void {
  const result = executeMemory(
    'opponent',
    'memory_read',
    {},
    emptyState,
    emptyMap,
    noopResolve
  );
  assert.strictEqual(result.status, 'error');
  assert.ok((result as { error?: string }).error?.includes('memory_read requires'));
}

/**
 * Defines the `testMemoryDeleteRequiresKey` function shape (function testMemoryDeleteRequiresKey(): void).

 * Purpose: Supports maintainability by documenting why `testMemoryDeleteRequiresKey` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testMemoryDeleteRequiresKey(): void {
  const result = executeMemory(
    'opponent',
    'memory_delete',
    {},
    emptyState,
    emptyMap,
    noopResolve
  );
  assert.strictEqual(result.status, 'error');
  assert.ok((result as { error?: string }).error?.includes('key'));
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function run(): void {
  testMemoryDeleteMissingKey();
  testMemoryWriteEmptyContent();
  testMemoryWriteContentOver500();
  testMemoryWriteInvalidKey();
  testMemoryReadRequiresKeyOrTagsOrTierOrAll();
  testMemoryDeleteRequiresKey();
  console.log('memory tests passed');
}

run();
