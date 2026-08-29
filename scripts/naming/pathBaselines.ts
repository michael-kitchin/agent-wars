import * as fs from 'fs';
import * as path from 'path';

/**
 * Rewrites `dist/` test paths in the modularization manifest after a source path move.
 *
 * Purpose: The manifest throws if a listed compiled test under dist/ is missing.
 * When to use: After a file or directory rename that changes a `src/` path present in the manifest.
 * Expected outcome: Old POSIX `dist/` prefixes become the new prefix; other lines unchanged.
 * Exceptions: None if the manifest file is absent (no-op).
 */
export function rewriteModularizationManifest(
  repoRoot: string,
  oldSrcPosix: string,
  newSrcPosix: string,
): void {
  const manifestPath = path.join(repoRoot, 'scripts', 'verify-modularization-tests.manifest');
  if (!fs.existsSync(manifestPath)) return;
  const oldDist = srcPathToDistJsPrefix(oldSrcPosix);
  const newDist = srcPathToDistJsPrefix(newSrcPosix);
  if (oldDist === newDist) return;
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const next = raw.split(/\r?\n/).map((line) => {
    if (!line || line.startsWith('#')) return line;
    if (line.startsWith(oldDist) || line.includes(`/${path.posix.basename(oldDist)}`)) {
      return line.split(oldDist).join(newDist);
    }
    return line;
  });
  fs.writeFileSync(manifestPath, next.join('\n'), 'utf8');
}

/**
 * Maps a `src/...` path (file or directory, no extension required) to a `dist/` prefix.
 *
 * Purpose: Manifest entries are compiled `.js` under `dist/`, not `src/`.
 * When to use: When translating a ledger path into a manifest needle.
 * Expected outcome: `src/main/foo.ts` → `dist/main/foo`; directories keep their relative tail.
 * Exceptions: None.
 */
function srcPathToDistJsPrefix(srcPosix: string): string {
  let rel = srcPosix.replace(/\\/g, '/');
  if (rel.startsWith('src/')) rel = rel.slice('src/'.length);
  rel = rel.replace(/\.test\.ts$/, '.test').replace(/\.ts$/, '');
  return `dist/${rel}`;
}
