import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { createProgramFromTsconfig } from './program.js';
import {
  bannedSuffixIn,
  directoryViolations,
  isCamelCaseIdentifier,
  isKebabCaseSegment,
  isNumberedToolName,
  isPascalCaseIdentifier,
  kebabToCamel,
} from './rules.js';
import type { ScanReport, Violation } from './types.js';

const UPPER_SNAKE = /^[A-Z][A-Z0-9_]*$/;

/**
 * Recursively collects `.ts` files under `dirAbs`, skipping declaration files.
 *
 * Purpose: One walk rule for `src/` and TypeScript tooling trees.
 * When to use: At the start of a scan before AST work.
 * Expected outcome: Absolute paths to hand-authored TypeScript files.
 * Exceptions: Skips missing roots (returns an empty list).
 */
function collectTsFiles(dirAbs: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dirAbs)) return acc;
  const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) {
      collectTsFiles(abs, acc);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.ts')) continue;
    if (entry.name.endsWith('.d.ts')) continue;
    acc.push(abs);
  }
  return acc;
}

/**
 * Returns the file stem used for casing checks (`foo.test.ts` → `foo`).
 *
 * Purpose: Test files share the implementation module's casing contract.
 * When to use: Before fileCasing / bannedSuffix / numberedTool file checks.
 * Expected outcome: Stem without `.ts` or `.test.ts`.
 * Exceptions: None.
 */
export function fileStemForCasing(filename: string): string {
  if (filename.endsWith('.test.ts')) return filename.slice(0, -'.test.ts'.length);
  if (filename.endsWith('.ts')) return filename.slice(0, -'.ts'.length);
  return filename;
}

/**
 * Lists ancestor directory paths of `relPosix` (file or dir), relative to `src/`.
 *
 * Purpose: Directory casing is checked once per folder, not once per file.
 * When to use: After normalizing a `src/`-relative file path.
 * Expected outcome: `main/gameActions/foo.ts` yields `main/game-actions` and `main`.
 * Exceptions: None.
 */
function srcAncestorDirs(relPosix: string): string[] {
  const dirs: string[] = [];
  let current = path.posix.dirname(relPosix);
  while (current && current !== '.') {
    dirs.push(current);
    const parent = path.posix.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dirs;
}

/**
 * Suggests a camelCase file stem after stripping a `toolN` / `tacticalToolN` prefix.
 *
 * Purpose: Gives the report a usable default; the ledger may still override collisions.
 * When to use: When emitting a `numberedTool` file violation.
 * Expected outcome: `tool1Pathfinding` → `pathfinding`; `tacticalTool1Pathfinding` → `tacticalPathfinding`.
 * Exceptions: None.
 */
function suggestNumberedStem(stem: string): string {
  if (/^tacticalTool\d+/i.test(stem)) {
    return stem.replace(/^tacticalTool\d+/i, 'tactical');
  }
  const stripped = stem.replace(/^tool\d+/i, '');
  if (!stripped) return stem;
  return stripped.charAt(0).toLowerCase() + stripped.slice(1);
}

/**
 * Returns true when `node` is an exported declaration.
 *
 * Purpose: Limits identifier checks to high-visibility exports.
 * When to use: On top-level statements in a source file.
 * Expected outcome: True when the `export` modifier is present.
 * Exceptions: None.
 */
function isExported(node: ts.Node): boolean {
  return (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0;
}

/**
 * Classifies an exported identifier and pushes a violation when it breaks the contract.
 *
 * Purpose: Shared export checks for functions, consts, and type-like names.
 * When to use: From the source-file statement walk.
 * Expected outcome: At most one violation per name (numbered tool wins over casing).
 * Exceptions: None.
 */
function classifyExport(
  filePathPosix: string,
  name: string,
  kind: 'function' | 'const' | 'typeLike',
  out: Violation[],
): void {
  if (isNumberedToolName(name)) {
    out.push({
      category: 'numberedTool',
      filePath: filePathPosix,
      currentName: name,
      detail: 'Exported identifier encodes a tool-group number',
    });
    return;
  }
  const banned = bannedSuffixIn(name);
  if (banned) {
    const suggested =
      banned === 'Utils' ? name.slice(0, -'Utils'.length) + 'Helpers' : name.replace(/Impl$/, '');
    out.push({
      category: 'bannedSuffix',
      filePath: filePathPosix,
      currentName: name,
      suggestedName: suggested,
      detail: `Banned suffix ${banned}`,
    });
    return;
  }
  if (kind === 'typeLike') {
    if (!isPascalCaseIdentifier(name)) {
      out.push({
        category: 'exportCasing',
        filePath: filePathPosix,
        currentName: name,
        detail: 'Exported types must be PascalCase',
      });
    }
    return;
  }
  if (kind === 'const') {
    if (isCamelCaseIdentifier(name) || UPPER_SNAKE.test(name)) return;
    out.push({
      category: 'exportCasing',
      filePath: filePathPosix,
      currentName: name,
      detail: 'Exported consts must be camelCase or UPPER_SNAKE',
    });
    return;
  }
  if (!isCamelCaseIdentifier(name)) {
    out.push({
      category: 'exportCasing',
      filePath: filePathPosix,
      currentName: name,
      detail: 'Exported functions must be camelCase',
    });
  }
}

/**
 * Walks top-level exported declarations in `sf`.
 *
 * Purpose: Compiler-API discovery of high-visibility symbols without regex.
 * When to use: For each program source file under scan.
 * Expected outcome: Violations for banned suffixes, numbered tools, and casing.
 * Exceptions: None.
 */
function collectExportViolations(sf: ts.SourceFile, filePathPosix: string, out: Violation[]): void {
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && isExported(stmt) && stmt.name) {
      classifyExport(filePathPosix, stmt.name.text, 'function', out);
      continue;
    }
    if (ts.isClassDeclaration(stmt) && isExported(stmt) && stmt.name) {
      classifyExport(filePathPosix, stmt.name.text, 'typeLike', out);
      continue;
    }
    if (ts.isInterfaceDeclaration(stmt) && isExported(stmt)) {
      classifyExport(filePathPosix, stmt.name.text, 'typeLike', out);
      continue;
    }
    if (ts.isTypeAliasDeclaration(stmt) && isExported(stmt)) {
      classifyExport(filePathPosix, stmt.name.text, 'typeLike', out);
      continue;
    }
    if (ts.isEnumDeclaration(stmt) && isExported(stmt)) {
      classifyExport(filePathPosix, stmt.name.text, 'typeLike', out);
      continue;
    }
    if (ts.isVariableStatement(stmt) && isExported(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const init = decl.initializer;
        const asFunction =
          init !== undefined &&
          (ts.isFunctionExpression(init) || ts.isArrowFunction(init));
        classifyExport(filePathPosix, decl.name.text, asFunction ? 'function' : 'const', out);
      }
    }
  }
}

/**
 * Adds file-stem violations for kebab-case, banned suffixes, and numbered tools.
 *
 * Purpose: Path-level checks that do not need the type checker.
 * When to use: For every scanned `.ts` file.
 * Expected outcome: `fileCasing`, `bannedSuffix`, or `numberedTool` rows.
 * Exceptions: None.
 */
function collectFileViolations(absFile: string, repoRoot: string, out: Violation[]): void {
  const rel = path.relative(repoRoot, absFile).replace(/\\/g, '/');
  const stem = fileStemForCasing(path.basename(absFile));
  if (isKebabCaseSegment(stem)) {
    out.push({
      category: 'fileCasing',
      filePath: rel,
      currentName: path.basename(absFile),
      suggestedName: `${kebabToCamel(stem)}${absFile.endsWith('.test.ts') ? '.test.ts' : '.ts'}`,
      detail: 'TypeScript file names must be camelCase',
    });
    return;
  }
  if (!isCamelCaseIdentifier(stem)) {
    out.push({
      category: 'fileCasing',
      filePath: rel,
      currentName: path.basename(absFile),
      suggestedName: `${stem.replace(/\./g, '')}${absFile.endsWith('.test.ts') ? '.test.ts' : '.ts'}`,
      detail: 'TypeScript file names must be camelCase',
    });
    return;
  }
  if (isNumberedToolName(stem)) {
    let suggestedStem = suggestNumberedStem(stem);
    if (rel.replace(/\\/g, '/').includes('/tools/tool6Production')) {
      suggestedStem = absFile.endsWith('.test.ts') ? 'productionTools' : 'productionTools';
    }
    out.push({
      category: 'numberedTool',
      filePath: rel,
      currentName: path.basename(absFile),
      suggestedName: `${suggestedStem}${absFile.endsWith('.test.ts') ? '.test.ts' : '.ts'}`,
      detail: 'File name encodes a tool-group number',
    });
    return;
  }
  const banned = bannedSuffixIn(stem);
  if (banned) {
    const next =
      banned === 'Utils' ? `${stem.slice(0, -'Utils'.length)}Helpers` : stem.replace(/Impl$/, 'Resolve');
    out.push({
      category: 'bannedSuffix',
      filePath: rel,
      currentName: path.basename(absFile),
      suggestedName: `${next}${absFile.endsWith('.test.ts') ? '.test.ts' : '.ts'}`,
      detail: `Banned suffix ${banned} in file name`,
    });
  }
}

/**
 * Scans in-scope TypeScript for naming-contract violations.
 *
 * Purpose: Read-only inventory used by `naming:report` and later `naming:check`.
 * When to use: From the CLI against a repository root.
 * Expected outcome: Deduplicated, stably sorted violations plus a scanned-file count.
 * Exceptions: Throws if a required tsconfig cannot be loaded.
 */
export function scanRepository(repoRoot: string): ScanReport {
  const srcDir = path.join(repoRoot, 'src');
  const srcFiles = collectTsFiles(srcDir);
  const toolingFiles = [
    ...collectTsFiles(path.join(repoRoot, 'scripts', 'orienting-comments')),
    ...collectTsFiles(path.join(repoRoot, 'scripts', 'naming')),
  ];
  const allFiles = [...srcFiles, ...toolingFiles];
  const violations: Violation[] = [];

  const dirSet = new Set<string>();
  for (const abs of srcFiles) {
    const rel = path.relative(srcDir, abs).replace(/\\/g, '/');
    for (const dir of srcAncestorDirs(rel)) dirSet.add(dir);
  }
  for (const dir of dirSet) {
    const violation = directoryViolations(dir);
    if (violation) violations.push(violation);
  }

  for (const abs of allFiles) {
    collectFileViolations(abs, repoRoot, violations);
  }

  const srcProgram = createProgramFromTsconfig(repoRoot, 'tsconfig.tools-src-ast.json');
  for (const sf of srcProgram.getSourceFiles()) {
    const norm = sf.fileName.replace(/\\/g, '/');
    if (sf.isDeclarationFile) continue;
    if (!norm.includes('/src/')) continue;
    if (!norm.endsWith('.ts')) continue;
    const rel = path.relative(repoRoot, sf.fileName).replace(/\\/g, '/');
    collectExportViolations(sf, rel, violations);
  }

  const toolingTsconfigs = ['tsconfig.tools-orienting-comments.json', 'tsconfig.tools-naming.json'];
  for (const tsconfigRel of toolingTsconfigs) {
    const absConfig = path.join(repoRoot, tsconfigRel);
    if (!fs.existsSync(absConfig)) continue;
    const program = createProgramFromTsconfig(repoRoot, tsconfigRel);
    for (const sf of program.getSourceFiles()) {
      if (sf.isDeclarationFile) continue;
      const rel = path.relative(repoRoot, sf.fileName).replace(/\\/g, '/');
      if (!rel.startsWith('scripts/')) continue;
      collectExportViolations(sf, rel, violations);
    }
  }

  const seen = new Set<string>();
  const unique: Violation[] = [];
  for (const violation of violations) {
    const key = `${violation.category}|${violation.filePath}|${violation.currentName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(violation);
  }
  unique.sort((a, b) => {
    const byPath = a.filePath.localeCompare(b.filePath);
    if (byPath !== 0) return byPath;
    const byName = a.currentName.localeCompare(b.currentName);
    if (byName !== 0) return byName;
    return a.category.localeCompare(b.category);
  });

  return {
    repoRoot,
    scannedFileCount: allFiles.length,
    violations: unique,
  };
}
