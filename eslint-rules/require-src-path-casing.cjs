/**
 * ESLint rule requiring camelCase directories and TypeScript file stems under src/.
 *
 * Purpose: Catches kebab-case folders/files and other path-casing drift that tsc does not treat as an error.
 * When to use: As an `error` rule on TypeScript sources under src/ in this repository.
 * Expected outcome: Reports path segments that are not camelCase, except the frozen Electron/module-augmentation names.
 * Exceptions: None.
 */
'use strict';

const path = require('path');

const ALLOWED_FILE_BASES = new Set(['main', 'preload', 'renderer', 'index', 'better-sqlite3']);
const CAMEL_SEGMENT = /^[a-z][a-zA-Z0-9]*$/;

/**
 * Returns the file stem used for casing checks (`foo.test.ts` → `foo`, `foo.d.ts` → `foo`).
 *
 * Purpose: Test and declaration files share the implementation module's casing contract.
 * When to use: Before comparing a filename against camelCase or the allowlist.
 * Expected outcome: Stem without `.ts`, `.test.ts`, or `.d.ts`.
 * Exceptions: None.
 */
function fileStemForCasing(filename) {
  if (filename.endsWith('.test.ts')) return filename.slice(0, -'.test.ts'.length);
  if (filename.endsWith('.d.ts')) return filename.slice(0, -'.d.ts'.length);
  if (filename.endsWith('.ts')) return filename.slice(0, -'.ts'.length);
  return filename;
}

/**
 * Returns the path of `filename` relative to the repository `src/` directory, using POSIX separators.
 *
 * Purpose: Directory and file checks are defined against `src/`, not the process cwd.
 * When to use: At the start of a Program visitor.
 * Expected outcome: A POSIX relative path, or null when the file is not under src/.
 * Exceptions: None.
 */
function srcRelativePosix(filename, cwd) {
  const abs = path.resolve(filename);
  const srcRoot = path.resolve(cwd, 'src');
  const rel = path.relative(srcRoot, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require camelCase src/ directories and TypeScript file stems',
    },
    schema: [],
    messages: {
      directoryCasing: "Directory '{{name}}' under src/ must be camelCase.",
      fileCasing: "File '{{name}}' under src/ must be a camelCase stem (or an allowed entry/augmentation name).",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    const cwd = context.cwd ?? process.cwd();
    return {
      Program(node) {
        const rel = srcRelativePosix(filename, cwd);
        if (!rel) return;
        const parts = rel.split('/').filter((part) => part.length > 0);
        const filePart = parts[parts.length - 1];
        const dirParts = parts.slice(0, -1);
        for (const name of dirParts) {
          if (!CAMEL_SEGMENT.test(name)) {
            context.report({ node, messageId: 'directoryCasing', data: { name } });
          }
        }
        const stem = fileStemForCasing(filePart);
        if (ALLOWED_FILE_BASES.has(stem)) return;
        if (!CAMEL_SEGMENT.test(stem)) {
          context.report({ node, messageId: 'fileCasing', data: { name: filePart } });
        }
      },
    };
  },
};
