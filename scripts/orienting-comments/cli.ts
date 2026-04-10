import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { applyEditsToFile, planEditsForSourceFile } from './applyEdits.js';
import { createSrcAstProgram } from './program.js';

/**
 * Parses argv for `dry-run`, `apply`, or `list` orienting-comment passes.
 *
 * Purpose: Keeps CLI behavior explicit for automation and local developer use.
 * When to use: At process startup from the compiled `cli.js` entry.
 * Expected outcome: Returns a structured mode plus optional repo root override.
 * Exceptions: None.
 */
function parseArgs(argv: string[]): { mode: 'dry-run' | 'apply' | 'list'; repoRoot: string } {
  const modeArg = argv[2] ?? 'dry-run';
  if (modeArg !== 'dry-run' && modeArg !== 'apply' && modeArg !== 'list') {
    console.error('Usage: node cli.js <dry-run|apply|list> [repoRoot]');
    process.exit(2);
  }
  const repoRoot = path.resolve(argv[3] ?? process.cwd());
  return { mode: modeArg, repoRoot };
}

/**
 * Entry point for the orienting-comments CLI.
 *
 * Purpose: Runs repository scans and optional writes for orienting comment normalization.
 * When to use: Via npm scripts (`orienting-comments:*`) from the repository root.
 * Expected outcome: Exits 0 after printing a summary, or exits non-zero on fatal errors.
 * Exceptions: Prints errors and exits 1 when the program cannot be created.
 */
function main(): void {
  const { mode, repoRoot } = parseArgs(process.argv);
  const program = createSrcAstProgram(repoRoot);
  let filesTouched = 0;
  let editsPlanned = 0;
  const perFile: { file: string; edits: number }[] = [];

  for (const sf of program.getSourceFiles()) {
    const norm = sf.fileName.replace(/\\/g, '/');
    if (!norm.includes('/src/')) continue;
    if (!norm.endsWith('.ts') && !norm.endsWith('.d.ts')) continue;

    const edits = planEditsForSourceFile(sf);
    if (!edits.length) continue;

    filesTouched += 1;
    editsPlanned += edits.length;
    perFile.push({ file: path.relative(repoRoot, sf.fileName), edits: edits.length });

    if (mode === 'list') {
      continue;
    }

    if (mode === 'apply') {
      applyEditsToFile(sf.fileName, edits);
    }
  }

  perFile.sort((a, b) => b.edits - a.edits);
  console.log(JSON.stringify({ mode, repoRoot, filesTouched, editsPlanned, topFiles: perFile.slice(0, 40) }, null, 2));

  if (mode === 'dry-run') {
    const reportPath = path.join(repoRoot, '.spec', 'orienting-comments-last-dry-run.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({ mode, repoRoot, filesTouched, editsPlanned, files: perFile }, null, 2), 'utf8');
  }
}

main();
