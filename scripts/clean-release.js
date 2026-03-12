/**
 * Removes previous electron-builder output dirs so a rebuild does not hit "file in use" locks.
 * Usage: node scripts/clean-release.js [win|linux|mac|all]
 * Default: all. Run before dist:win / dist:linux / dist:mac to avoid locked app.asar when rebuilding.
 * On Windows, retries with delay to work around antivirus/indexer briefly holding handles.
 */

const fs = require('fs');
const path = require('path');

const releaseDir = path.join(__dirname, '..', 'release');
const dirs = {
  win: path.join(releaseDir, 'win-unpacked'),
  linux: path.join(releaseDir, 'linux-unpacked'),
  mac: path.join(releaseDir, 'mac'),
};

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function removeDir(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true });
}

const target = process.argv[2] || 'all';
const toRemove =
  target === 'all' ? Object.values(dirs) : dirs[target] ? [dirs[target]] : [];

(async () => {
  for (const dir of toRemove) {
    if (!fs.existsSync(dir)) continue;
    let lastErr;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        removeDir(dir);
        console.log('Removed', path.relative(releaseDir, dir));
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_RETRIES) {
          console.warn(
            'Remove failed (attempt ' + attempt + '/' + MAX_RETRIES + '):',
            err.code || err.message,
            '- retrying in',
            RETRY_DELAY_MS / 1000,
            's...'
          );
          await sleep(RETRY_DELAY_MS);
        }
      }
    }
    if (lastErr) {
      console.error('Could not remove', dir);
      console.error('Error:', lastErr.code || lastErr.message, lastErr.message);
      console.error(
        'Close any app using that folder, exclude it from antivirus real-time scan, or run the build from a different drive, then retry.'
      );
      process.exit(1);
    }
  }
})();
