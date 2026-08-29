/* eslint-disable no-console */
import * as path from 'path';
import { scanRepository } from './discovery.js';
import { formatViolationSummary, writeReportArtifact } from './report.js';
import { applyLedgerEntry } from './applyRename.js';
import { loadLedger, resolveCurrentPath } from './ledger.js';

/**
 * Parses CLI argv for `report`, `check`, or `apply`.
 *
 * Purpose: Keeps automation flags explicit (`--id`, `--dry-run`, optional repo root).
 * When to use: At process startup from the compiled `cli.js` entry.
 * Expected outcome: Structured mode plus options; unknown modes exit 2.
 * Exceptions: None (process.exit on bad usage).
 */
function parseArgs(argv: string[]): {
  readonly mode: 'report' | 'check' | 'apply';
  readonly repoRoot: string;
  readonly id?: string;
  readonly dryRun: boolean;
} {
  const mode = argv[2] ?? 'report';
  if (mode !== 'report' && mode !== 'check' && mode !== 'apply') {
    console.error('Usage: node cli.js <report|check|apply> [--id <ledgerId>] [--dry-run] [repoRoot]');
    process.exit(2);
  }
  let id: string | undefined;
  let dryRun = false;
  const positionals: string[] = [];
  for (let i = 3; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--id') {
      id = argv[i + 1];
      i += 1;
      continue;
    }
    positionals.push(arg);
  }
  const repoRoot = path.resolve(positionals[0] ?? process.cwd());
  return { mode, repoRoot, id, dryRun };
}

/**
 * Entry point for the naming-conventions CLI.
 *
 * Purpose: Runs read-only scans and later ledger apply/check modes.
 * When to use: Via npm scripts (`naming:report`, `naming:check`, `naming:apply`).
 * Expected outcome: Exits 0 after printing JSON for `report`; other modes may exit non-zero.
 * Exceptions: Prints errors and exits 1 on fatal failures.
 */
function main(): void {
  const parsed = parseArgs(process.argv);
  const { mode, repoRoot, dryRun } = parsed;
  if (mode === 'report') {
    const report = scanRepository(repoRoot);
    const artifact = writeReportArtifact(repoRoot, report);
    console.log(JSON.stringify(report, null, 2));
    console.error(`${formatViolationSummary(report)} wrote ${artifact}`);
    return;
  }
  if (mode === 'apply') {
    if (!parsed.id) {
      console.error('apply requires --id <ledgerId>');
      process.exit(2);
    }
    try {
      const result = applyLedgerEntry(repoRoot, parsed.id, dryRun);
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
    return;
  }
  if (mode === 'check') {
    const document = loadLedger(repoRoot);
    const pending = document.entries.filter((e) => e.status === 'pending');
    const report = scanRepository(repoRoot);
    const waived = new Set(
      document.entries
        .filter((e) => e.status === 'waived')
        .map((e) => `${resolveCurrentPath(document, e.currentPath)}|${e.currentName}`),
    );
    const leftover = report.violations.filter((v) => !waived.has(`${v.filePath}|${v.currentName}`));
    if (pending.length > 0 || leftover.length > 0) {
      console.error(
        JSON.stringify({ pendingIds: pending.map((e) => e.id), leftoverViolations: leftover }, null, 2),
      );
      process.exit(1);
    }
    console.log('naming check: ok');
  }
}

main();
