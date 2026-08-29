import { spawnSync } from 'child_process';

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
 * Runs `git mv` for each planned step with history preserved.
 *
 * Purpose: Path applies must show up as renames, not delete+add.
 * When to use: After import edits are written, before marking the ledger applied.
 * Expected outcome: Paths exist at `newAbs`; git index records the move.
 * Exceptions: Throws when git exits non-zero.
 */
export function gitMvPreserveHistory(repoRoot: string, oldAbs: string, newAbs: string): void {
  for (const step of gitMvSteps(oldAbs, newAbs)) {
    const result = spawnSync('git', ['mv', step.from, step.to], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      throw new Error(
        `git mv failed (${step.from} → ${step.to}): ${result.stderr || result.stdout || result.status}`,
      );
    }
  }
}
