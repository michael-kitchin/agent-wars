import * as fs from 'fs';
import * as path from 'path';
import type { LedgerEntry, RenameLedgerDocument } from './types.js';

const LEDGER_REL = path.posix.join('scripts', 'naming', 'renameLedger.json');

/**
 * Loads `scripts/naming/renameLedger.json` from `repoRoot`.
 *
 * Purpose: Apply and check modes share one signed work list.
 * When to use: At the start of an apply/check invocation.
 * Expected outcome: Parsed document with an `entries` array.
 * Exceptions: Throws if the file is missing or JSON is invalid.
 */
export function loadLedger(repoRoot: string): RenameLedgerDocument {
  const abs = path.join(repoRoot, ...LEDGER_REL.split('/'));
  const raw = fs.readFileSync(abs, 'utf8');
  return JSON.parse(raw) as RenameLedgerDocument;
}

/**
 * Writes the ledger document back to disk.
 *
 * Purpose: Persists `applied` status after a successful mutate.
 * When to use: After path/symbol edits succeed.
 * Expected outcome: Pretty-printed JSON with a trailing newline.
 * Exceptions: Throws if the file cannot be written.
 */
export function saveLedger(repoRoot: string, document: RenameLedgerDocument): void {
  const abs = path.join(repoRoot, ...LEDGER_REL.split('/'));
  fs.writeFileSync(abs, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
}

/**
 * Returns the ledger row for `id`.
 *
 * Purpose: Apply looks up exactly one entry per invocation.
 * When to use: After `loadLedger`.
 * Expected outcome: The matching entry.
 * Exceptions: Throws if `id` is unknown.
 */
export function getEntry(document: RenameLedgerDocument, id: string): LedgerEntry {
  const found = document.entries.find((entry) => entry.id === id);
  if (!found) {
    throw new Error(`Unknown ledger id: ${id}`);
  }
  return found;
}

/**
 * Marks `id` as applied in memory (caller must `saveLedger`).
 *
 * Purpose: Makes a second apply a no-op.
 * When to use: After a successful non-dry-run apply.
 * Expected outcome: A new document whose matching entry has `status: applied`.
 * Exceptions: Throws if `id` is unknown.
 */
export function markApplied(document: RenameLedgerDocument, id: string): RenameLedgerDocument {
  getEntry(document, id);
  return {
    entries: document.entries.map((entry) =>
      entry.id === id ? { ...entry, status: 'applied' } : entry,
    ),
  };
}

/**
 * Rewrites `currentPath` using already-applied directory entries.
 *
 * Purpose: File/symbol rows still record pre-rename paths; apply happens after directory batches.
 * When to use: Before reading a file or directory for a pending entry.
 * Expected outcome: Prefix substitutions for each applied `kind: directory` row.
 * Exceptions: None.
 */
export function resolveCurrentPath(document: RenameLedgerDocument, currentPath: string): string {
  let resolved = currentPath.replace(/\\/g, '/');
  for (const entry of document.entries) {
    if (entry.kind !== 'directory' || entry.status !== 'applied' || !entry.proposedPath) continue;
    const from = entry.currentPath.replace(/\\/g, '/');
    const to = entry.proposedPath.replace(/\\/g, '/');
    if (resolved === from || resolved.startsWith(`${from}/`)) {
      resolved = to + resolved.slice(from.length);
    }
  }
  return resolved;
}
