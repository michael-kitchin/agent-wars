'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

/**
 * Executable names that can be embedded in the launcher without shell quoting.
 * electron-builder's Linux name is the sanitized package name (`agent-wars`).
 */
const EXECUTABLE_NAME_PATTERN = /^[A-Za-z0-9._+-]+$/;

/**
 * Installs the portable Linux entry point after electron-builder packs the app.
 *
 * Purpose: Chromium aborts when `chrome-sandbox` is present but not owned by root
 * with mode 4755. CI artifacts and user-extracted archives cannot keep that ownership,
 * and the abort runs when unprivileged user namespaces are also unavailable.
 * When to use: electron-builder `afterPack` on every platform. Darwin and Windows return
 * immediately because those builds use other sandboxes and do not ship `chrome-sandbox`.
 * Expected outcome: On Linux, `agent-wars` becomes this launcher and the Electron binary
 * moves to `agent-wars.bin` beside `resources/` and `chrome-sandbox`. The sandbox stays
 * on when user namespaces work or the helper really is root mode 4755.
 * Exceptions: Throws if the executable name is unsafe to embed, the packaged binary is
 * missing, or `agent-wars.bin` already exists.
 * Relaunch note: Electron `app.relaunch()` uses the real binary (`process.execPath`),
 * which skips this launcher. This app does not relaunch that way; a future call must
 * pass the launcher path.
 */
async function installLinuxSandboxLauncher(context) {
  if (context.electronPlatformName !== 'linux') {
    return;
  }

  const executableName = context.packager.executableName;
  assertLinuxExecutableName(executableName);

  const binaryPath = path.join(context.appOutDir, executableName);
  const runtimeName = `${executableName}.bin`;
  const runtimePath = path.join(context.appOutDir, runtimeName);
  await assertRuntimeDestinationIsFree(runtimePath);
  try {
    await fs.rename(binaryPath, runtimePath);
  } catch (error) {
    const detail = error && error.code ? error.code : error;
    const message = `Linux executable "${binaryPath}" could not be wrapped (${detail}).`;
    console.error(message);
    throw new Error(message);
  }
  await fs.chmod(runtimePath, 0o755);
  await fs.writeFile(binaryPath, buildLinuxSandboxLauncherScript(executableName), { encoding: 'utf8' });
  await fs.chmod(binaryPath, 0o755);
  console.log(`Installed Linux sandbox launcher at ${binaryPath} (runtime ${runtimeName})`);
}

/**
 * Builds the shell script that chooses a Chromium sandbox mode at launch.
 *
 * Purpose: Keep the sandbox decision next to the binary so it still runs after a
 * symlink (deb `/usr/bin` links) and so root does not hit Chromium's unsandboxed-root refusal.
 * When to use: From `installLinuxSandboxLauncher` after the executable name is validated.
 * Expected outcome: A POSIX script with LF line endings. It execs the renamed binary
 * with `--no-sandbox` only when namespaces and a correct helper are both unavailable, or when the process is root.
 * Exceptions: Throws if `executableName` is unsafe to embed.
 *
 * @param {string} executableName Linux executable file name, without a directory
 * @returns {string}
 */
function buildLinuxSandboxLauncherScript(executableName) {
  assertLinuxExecutableName(executableName);
  const runtimeName = `${executableName}.bin`;
  return `#!/bin/sh
# Portable Linux entry point. Installed by scripts/linux-sandbox-launcher.cjs.
set -eu
source=$0
hops=0
while [ -L "$source" ]; do
  hops=$((hops + 1))
  if [ "$hops" -gt 8 ]; then
    echo "${executableName}: refusing to resolve a symlink loop at $0" >&2
    exit 1
  fi
  link_dir=$(CDPATH= cd -- "$(dirname -- "$source")" && pwd)
  link_target=$(readlink -- "$source") || exit 1
  case "$link_target" in
    /*) source="$link_target" ;;
    *) source="$link_dir/$link_target" ;;
  esac
done
here=$(CDPATH= cd -- "$(dirname -- "$source")" && pwd)
runtime="$here/${runtimeName}"
sandbox="$here/chrome-sandbox"

# Chromium exits before sandbox setup when uid 0 and --no-sandbox is absent.
if [ "$(id -u)" -eq 0 ]; then
  echo "${executableName}: starting without the Chromium sandbox because Chromium refuses a sandboxed root process." >&2
  exec "$runtime" --no-sandbox "$@"
fi

sandbox_ok=0
if [ -e "$sandbox" ] && [ -u "$sandbox" ] && [ -x "$sandbox" ]; then
  owner=$(stat -c '%u' "$sandbox" 2>/dev/null || echo '')
  mode=$(stat -c '%a' "$sandbox" 2>/dev/null || echo '')
  if [ "$owner" = "0" ] && [ "$mode" = "4755" ]; then
    sandbox_ok=1
  fi
fi

# Same probe electron-builder's Linux install script uses. unshare is a different
# binary from the app; if it succeeds while the app cannot create a user namespace,
# Chromium still aborts and the helper must be root mode 4755.
userns_ok=0
if [ -L /proc/self/ns/user ] && unshare --user true >/dev/null 2>&1; then
  userns_ok=1
fi

if [ "$userns_ok" = "1" ] || [ "$sandbox_ok" = "1" ]; then
  exec "$runtime" "$@"
fi

echo "${executableName}: starting without the Chromium sandbox because chrome-sandbox is not root mode 4755 and user namespaces are unavailable." >&2
exec "$runtime" --no-sandbox "$@"
`;
}

/**
 * Rejects executable names that would break the generated shell script.
 *
 * Purpose: The name is interpolated into the launcher and used as a file name.
 * When to use: Before renaming the packaged binary or building the script.
 * Expected outcome: Returns when the name is a single safe path segment.
 * Exceptions: Throws for non-strings, empty names, `.`, `..`, or characters that need shell quoting.
 *
 * @param {string} executableName
 * @returns {void}
 */
function assertLinuxExecutableName(executableName) {
  if (typeof executableName !== 'string' || !EXECUTABLE_NAME_PATTERN.test(executableName) || executableName === '.' || executableName === '..') {
    throw new Error(`Refusing to wrap an unsafe Linux executable name: ${String(executableName)}`);
  }
}

/**
 * Refuses to overwrite a runtime binary left by an earlier pack.
 *
 * Purpose: A second pack into the same directory must not destroy an existing Electron binary.
 * When to use: Immediately before renaming the packaged executable to `*.bin`.
 * Expected outcome: Returns when the destination is absent.
 * Exceptions: Throws when the destination exists. Rethrows unexpected stat failures after logging them.
 *
 * @param {string} runtimePath
 * @returns {Promise<void>}
 */
async function assertRuntimeDestinationIsFree(runtimePath) {
  try {
    await fs.lstat(runtimePath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return;
    }
    console.error(`Linux sandbox launcher could not stat "${runtimePath}": ${error && error.code ? error.code : error}`);
    throw error;
  }
  throw new Error(`Refusing to replace existing Linux runtime: ${runtimePath}`);
}

module.exports = {
  installLinuxSandboxLauncher,
  buildLinuxSandboxLauncherScript,
};
