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
 * Rewrites a ledger path using already-applied directory entries only.
 *
 * Purpose: Shared prefix substitution so file remaps can compose on top of directory moves.
 * When to use: Inside `resolveCurrentPath` and when matching waived scan paths.
 * Expected outcome: `src/main/game-actions/foo.ts` becomes `src/main/gameActions/foo.ts` after that directory apply.
 * Exceptions: None.
 */
export function resolveDirectoryPrefixes(document: RenameLedgerDocument, currentPath: string): string {
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

/**
 * Rewrites `currentPath` using already-applied directory and file entries.
 *
 * Purpose: File/symbol rows still record pre-rename paths; apply happens after earlier batches.
 * When to use: Before reading a file or directory for a pending entry.
 * Expected outcome: Directory prefixes plus exact file-path substitutions for applied `kind: file` rows.
 * Exceptions: None.
 */
export function resolveCurrentPath(document: RenameLedgerDocument, currentPath: string): string {
  let resolved = resolveDirectoryPrefixes(document, currentPath);
  for (const entry of document.entries) {
    if (entry.kind !== 'file' || entry.status !== 'applied' || !entry.proposedPath) continue;
    const from = resolveDirectoryPrefixes(document, entry.currentPath);
    const to = resolveDirectoryPrefixes(document, entry.proposedPath);
    if (resolved === from) {
      resolved = to;
    }
  }
  return resolved;
}
