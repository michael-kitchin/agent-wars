import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Extracts one function body from TypeScript source by brace-depth scan.
 *
 * Purpose: Lets renderer source-text contract tests isolate a named function without compiling the renderer.
 * When to use: After reading a `src/renderer/**` file as UTF-8 text.
 * Expected outcome: The slice from `function name(` through the matching closing brace.
 * Exceptions: Throws if the function is missing or unterminated.
 */
export function getFunctionSource(source: string, functionName: string): string {
  const signaturePattern = new RegExp(`(^|\\n)(?:export\\s+)?(?:async\\s+)?function\\s+${functionName}\\s*\\(`, 'm');
  const match = signaturePattern.exec(source);
  const start = match ? match.index + (match[1]?.length ?? 0) : -1;
  assert.ok(start >= 0, `Expected function ${functionName} to exist`);

  const openBrace = source.indexOf('{', start);
  assert.ok(openBrace >= 0, `Expected function ${functionName} to have a body`);

  let depth = 0;
  for (let i = openBrace; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }

  throw new Error(`Unterminated function body for ${functionName}`);
}

/**
 * Asserts that `source` matches `pattern`.
 *
 * Purpose: Shared regex assertion used by renderer source-text contracts.
 * When to use: When a substring check needs whitespace-tolerant matching.
 * Expected outcome: Throws via `assert.ok` with `message` when the pattern does not match.
 * Exceptions: AssertionError when the pattern fails.
 */
export function assertMatches(source: string, pattern: RegExp, message: string): void {
  assert.ok(pattern.test(source), message);
}

/**
 * Reads a renderer TypeScript file as UTF-8 from the repo working directory.
 *
 * Purpose: Avoid repeating `path.resolve(process.cwd(), 'src', 'renderer', ...)` in contract tests.
 * When to use: New topic-scoped renderer source-text tests.
 * Expected outcome: File contents for the path segments under `src/renderer`.
 * Exceptions: Throws if the file cannot be read.
 */
export function readRendererSource(...segments: string[]): string {
  return fs.readFileSync(path.resolve(process.cwd(), 'src', 'renderer', ...segments), 'utf8');
}
