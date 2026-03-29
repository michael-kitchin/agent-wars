/**
 * Resolve a Python executable for zip/extract scripts.
 * Linux/macOS CI and dev boxes often expose `python3` but not `python`; Windows typically has `python`.
 */
const { spawnSync } = require('child_process');

/**
 * @returns {string | null}
 */
function resolvePythonExecutable() {
  const candidates = [];
  if (process.env.PYTHON && process.env.PYTHON.trim()) {
    candidates.push(process.env.PYTHON.trim());
  }
  for (const c of ['python3', 'python']) {
    if (!candidates.includes(c)) {
      candidates.push(c);
    }
  }
  for (const cmd of candidates) {
    const result = spawnSync(cmd, ['--version'], {
      encoding: 'utf8',
      shell: false,
    });
    if (!result.error && result.status === 0) {
      return cmd;
    }
  }
  return null;
}

module.exports = { resolvePythonExecutable };
