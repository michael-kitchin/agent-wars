import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface GitMvStep {
  readonly from: string;
  readonly to: string;
}

/**
 * Plans one or two `git mv` steps, using a hold path when only case changes.
 *
 * Purpose: NTFS cannot rename `openrouter` → `openRouter` in a single move.
 * When to use: Before spawning git for a file or directory rename.
 * Expected outcome: Two steps through `*.renamehold` when paths differ only by case.
 * Exceptions: None.
 */
export function gitMvSteps(oldAbs: string, newAbs: string): readonly GitMvStep[] {
  const oldNorm = oldAbs.replace(/\\/g, '/');
  const newNorm = newAbs.replace(/\\/g, '/');
  if (oldNorm.toLowerCase() === newNorm.toLowerCase() && oldNorm !== newNorm) {
    return [
      { from: oldAbs, to: `${oldAbs}.renamehold` },
      { from: `${oldAbs}.renamehold`, to: newAbs },
    ];
  }
  return [{ from: oldAbs, to: newAbs }];
}

/**
 * Blocks the current thread for `ms` milliseconds.
 *
 * Purpose: Retry `git mv` after brief lock contention on Windows.
 * When to use: Between git mv attempts when Permission denied is likely transient.
 * Expected outcome: Returns after approximately `ms` milliseconds.
 * Exceptions: None.
 */
function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Runs a single `git mv` with retries.
 *
 * Purpose: Shared spawn for both whole-path and per-file fallback moves.
 * When to use: Inside `gitMvPreserveHistory`.
 * Expected outcome: Source path no longer exists at `from`.
 * Exceptions: Throws when git still fails after retries.
 */
function gitMvOnce(repoRoot: string, from: string, to: string): void {
  let lastError = '';
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = spawnSync('git', ['mv', from, to], { cwd: repoRoot, encoding: 'utf8' });
    if (result.status === 0) return;
    lastError = result.stderr || result.stdout || String(result.status);
    sleepMs(250 * (attempt + 1));
  }
  throw new Error(`git mv failed (${from} → ${to}): ${lastError}`);
}

/**
 * Moves a directory by `git mv` of each file when the directory itself is locked.
 *
 * Purpose: Windows often denies renaming a folder that the editor still has open.
 * When to use: After a whole-directory `git mv` fails with permission denied.
 * Expected outcome: All tracked files live under `newAbs`; empty old dirs are removed.
 * Exceptions: Throws on git mv failure for a child path.
 */
function gitMvDirectoryTree(repoRoot: string, oldAbs: string, newAbs: string): void {
  fs.mkdirSync(newAbs, { recursive: true });
  const entries = fs.readdirSync(oldAbs, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(oldAbs, entry.name);
    const to = path.join(newAbs, entry.name);
    if (entry.isDirectory()) {
      gitMvDirectoryTree(repoRoot, from, to);
      continue;
    }
    gitMvOnce(repoRoot, from, to);
  }
  fs.rmdirSync(oldAbs);
}

/**
 * Runs `git mv` for each planned step with history preserved.
 *
 * Purpose: Path applies must show up as renames, not delete+add.
 * When to use: After import edits are written, before marking the ledger applied.
 * Expected outcome: Paths exist at `newAbs`; git index records the move.
 * Exceptions: Throws when git exits non-zero after retries and the tree fallback also fails.
 */
export function gitMvPreserveHistory(repoRoot: string, oldAbs: string, newAbs: string): void {
  for (const step of gitMvSteps(oldAbs, newAbs)) {
    try {
      gitMvOnce(repoRoot, step.from, step.to);
    } catch (err) {
      const isDir = fs.existsSync(step.from) && fs.statSync(step.from).isDirectory();
      if (!isDir) throw err;
      gitMvDirectoryTree(repoRoot, step.from, step.to);
    }
  }
}
