import * as fs from 'fs';
import * as path from 'path';
import type { ScanReport } from './types.js';

/**
 * Writes the scan JSON to `.spec/naming-last-report.json`.
 *
 * Purpose: Leaves a human-inspectable artifact next to other spec reports.
 * When to use: After a successful `report` CLI run.
 * Expected outcome: File created or overwritten with pretty-printed JSON.
 * Exceptions: Throws if the `.spec` directory cannot be created or written.
 */
export function writeReportArtifact(repoRoot: string, report: ScanReport): string {
  const outPath = path.join(repoRoot, '.spec', 'naming-last-report.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return outPath;
}

/**
 * Builds a short human summary of violation counts by category.
 *
 * Purpose: Makes CLI stdout usable without reading the full JSON.
 * When to use: After `scanRepository`.
 * Expected outcome: One line per category that has at least one hit.
 * Exceptions: None.
 */
export function formatViolationSummary(report: ScanReport): string {
  const counts = new Map<string, number>();
  for (const violation of report.violations) {
    counts.set(violation.category, (counts.get(violation.category) ?? 0) + 1);
  }
  const parts = [...counts.entries()].map(([category, n]) => `${category}=${n}`);
  return `scannedFileCount=${report.scannedFileCount} violations=${report.violations.length}${
    parts.length ? ` ${parts.join(' ')}` : ''
  }`;
}
