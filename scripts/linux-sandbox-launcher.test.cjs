/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildLinuxSandboxLauncherScript,
  installLinuxSandboxLauncher,
  restoreLinuxExecutable,
} = require('./linux-sandbox-launcher.cjs');

function testLauncherScriptKeepsSandboxWhenPossible() {
  const script = buildLinuxSandboxLauncherScript('agent-wars');
  assert.ok(script.startsWith('#!/bin/sh\n'), 'launcher must be a POSIX script');
  assert.ok(!script.includes('\r'), 'launcher must use LF line endings so Linux can execute it');
  assert.ok(script.includes('"$here/agent-wars.bin"'), 'launcher must exec the renamed Electron binary');
  assert.ok(script.includes('[ -L "$source" ]'), 'launcher must follow symlinks to the packaged directory');
  assert.ok(script.includes('id -u'), 'launcher must detect root, which Chromium will not sandbox');
  assert.ok(script.includes('chrome-sandbox'), 'launcher must recognize a root-owned helper');
  assert.ok(script.includes('4755'), 'launcher must require the mode Chromium demands');
  const probeAt = script.indexOf('unshare --user true');
  const fallbackAt = script.indexOf('user namespaces are unavailable');
  assert.ok(probeAt !== -1 && fallbackAt > probeAt, 'namespace probe must precede the unsandboxed fallback');
}

async function testLinuxPackReplacesExecutableWithLauncher() {
  const appOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wars-linux-launcher-'));
  const binaryPath = path.join(appOutDir, 'agent-wars');
  fs.writeFileSync(binaryPath, 'elf-binary');
  try {
    await installLinuxSandboxLauncher({
      electronPlatformName: 'linux',
      appOutDir,
      packager: { executableName: 'agent-wars' },
    });
    assert.strictEqual(fs.readFileSync(path.join(appOutDir, 'agent-wars.bin'), 'utf8'), 'elf-binary');
    const launcher = fs.readFileSync(binaryPath, 'utf8');
    assert.ok(launcher.startsWith('#!/bin/sh\n'));
    assert.ok(launcher.includes('"$here/agent-wars.bin"'));
  } finally {
    fs.rmSync(appOutDir, { recursive: true, force: true });
  }
}

async function testNonLinuxPackIsUnchanged() {
  for (const electronPlatformName of ['darwin', 'win32']) {
    const appOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wars-launcher-skip-'));
    const binaryPath = path.join(appOutDir, 'Agent Wars');
    fs.writeFileSync(binaryPath, 'untouched');
    try {
      await installLinuxSandboxLauncher({
        electronPlatformName,
        appOutDir,
        packager: { executableName: 'agent-wars' },
      });
      assert.strictEqual(fs.readFileSync(binaryPath, 'utf8'), 'untouched');
      assert.ok(!fs.existsSync(path.join(appOutDir, 'agent-wars.bin')));
    } finally {
      fs.rmSync(appOutDir, { recursive: true, force: true });
    }
  }
}

async function testUnsafeExecutableNameIsRejected() {
  const appOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wars-launcher-unsafe-'));
  try {
    await assert.rejects(
      () => installLinuxSandboxLauncher({
        electronPlatformName: 'linux',
        appOutDir,
        packager: { executableName: 'agent wars' },
      }),
      /unsafe Linux executable name/
    );
  } finally {
    fs.rmSync(appOutDir, { recursive: true, force: true });
  }
}

async function testDotDotExecutableNameIsRejected() {
  await assert.rejects(
    () => installLinuxSandboxLauncher({
      electronPlatformName: 'linux',
      appOutDir: os.tmpdir(),
      packager: { executableName: '..' },
    }),
    /unsafe Linux executable name/
  );
}

async function testExistingRuntimeIsRejected() {
  const appOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wars-launcher-runtime-'));
  fs.writeFileSync(path.join(appOutDir, 'agent-wars'), 'elf-binary');
  fs.writeFileSync(path.join(appOutDir, 'agent-wars.bin'), 'already-there');
  try {
    await assert.rejects(
      () => installLinuxSandboxLauncher({
        electronPlatformName: 'linux',
        appOutDir,
        packager: { executableName: 'agent-wars' },
      }),
      /Refusing to replace existing Linux runtime/
    );
    assert.strictEqual(fs.readFileSync(path.join(appOutDir, 'agent-wars'), 'utf8'), 'elf-binary');
  } finally {
    fs.rmSync(appOutDir, { recursive: true, force: true });
  }
}

async function testMissingBinaryIsRejected() {
  const appOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wars-launcher-missing-'));
  try {
    await assert.rejects(
      () => installLinuxSandboxLauncher({
        electronPlatformName: 'linux',
        appOutDir,
        packager: { executableName: 'agent-wars' },
      }),
      /could not be wrapped/
    );
  } finally {
    fs.rmSync(appOutDir, { recursive: true, force: true });
  }
}

function findBash() {
  const candidates = process.platform === 'win32'
    ? ['bash', 'C:\\Program Files\\Git\\bin\\bash.exe']
    : ['bash'];
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['-c', 'exit 0'], { encoding: 'utf8' });
    if (result.status === 0) {
      return candidate;
    }
  }
  return null;
}

/**
 * Builds the environment for a bash child that runs the launcher.
 *
 * Purpose: Windows may invoke either Git bash or WSL. WSL only receives listed
 * variables. Path variables are marked `/up` so WSL translates them; `FAKE_*`
 * values are passed through. Git bash ignores `WSLENV` and converts paths with `cygpath`.
 * When to use: Any spawn of the installed launcher or a setuid probe from this test.
 * Expected outcome: Native Linux keeps the variables unchanged. Windows passes them
 * through `WSLENV` so the child sees POSIX paths.
 * Exceptions: None.
 */
function bashChildEnv(variables) {
  const env = { ...process.env, ...variables };
  if (process.platform === 'win32') {
    const translated = Object.keys(variables).map((name) => (
      name.startsWith('FAKE_') ? `${name}/u` : `${name}/up`
    ));
    env.WSLENV = translated.join(':');
  }
  return env;
}

const RUN_LAUNCHER_COMMAND = `if command -v cygpath >/dev/null 2>&1; then
  LAUNCHER_PATH=$(cygpath -u "$LAUNCHER_PATH")
  STUB_DIR=$(cygpath -u "$STUB_DIR")
  RECORD_PATH=$(cygpath -u "$RECORD_PATH")
fi
export PATH="$STUB_DIR:$PATH"
export RECORD_ARGS_FILE="$RECORD_PATH"
exec "$LAUNCHER_PATH" extra-arg
`;

function writeExecutable(filePath, contents) {
  fs.writeFileSync(filePath, contents.replace(/\r\n/g, '\n'), { encoding: 'utf8' });
  fs.chmodSync(filePath, 0o755);
}

function bashSupportsSetuidBit(bash) {
  const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wars-setuid-probe-'));
  const probeFile = path.join(probeDir, 'helper');
  try {
    fs.writeFileSync(probeFile, '');
    fs.chmodSync(probeFile, 0o4755);
    const result = spawnSync(bash, ['-c', 'target="$PROBE_FILE"; if command -v cygpath >/dev/null 2>&1; then target=$(cygpath -u "$target"); fi; [ -u "$target" ]'], {
      encoding: 'utf8',
      env: bashChildEnv({ PROBE_FILE: probeFile }),
    });
    return result.status === 0;
  } finally {
    fs.rmSync(probeDir, { recursive: true, force: true });
  }
}

function bashHasUserNamespaceLink(bash) {
  const result = spawnSync(bash, ['-c', '[ -L /proc/self/ns/user ]'], { encoding: 'utf8' });
  return result.status === 0;
}

/**
 * Runs the installed launcher with stub id/stat/unshare binaries.
 * The recorder at agent-wars.bin writes the arguments it received.
 */
async function runLauncherScenario(bash, options) {
  const appOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wars-launcher-run-'));
  try {
    const stubDir = path.join(appOutDir, 'stubs');
    fs.mkdirSync(stubDir);
    const recordPath = path.join(appOutDir, 'args.txt');
    writeExecutable(path.join(stubDir, 'id'), `#!/bin/sh
if [ "$1" = "-u" ]; then
  printf '%s\\n' "$FAKE_UID"
  exit 0
fi
exit 1
`);
    writeExecutable(path.join(stubDir, 'stat'), `#!/bin/sh
if [ "$1" != "-c" ]; then
  exit 1
fi
case "$2" in
  %u) printf '%s\\n' "$FAKE_SANDBOX_UID"; exit 0 ;;
  %a) printf '%s\\n' "$FAKE_SANDBOX_MODE"; exit 0 ;;
esac
exit 1
`);
    writeExecutable(path.join(stubDir, 'unshare'), `#!/bin/sh
if [ "$FAKE_USERNS_OK" = "1" ]; then
  exit 0
fi
exit 1
`);
    writeExecutable(path.join(appOutDir, 'agent-wars'), `#!/bin/sh
printf '%s\\n' "$*" > "$RECORD_ARGS_FILE"
exit 0
`);
    if (options.withHelper) {
      const helperPath = path.join(appOutDir, 'chrome-sandbox');
      fs.writeFileSync(helperPath, '');
      fs.chmodSync(helperPath, 0o4755);
    }
    await installLinuxSandboxLauncher({
      electronPlatformName: 'linux',
      appOutDir,
      packager: { executableName: 'agent-wars' },
    });
    const launcherPath = options.invokePath || path.join(appOutDir, 'agent-wars');
    const result = spawnSync(bash, ['-c', RUN_LAUNCHER_COMMAND], {
      encoding: 'utf8',
      env: bashChildEnv({
        LAUNCHER_PATH: launcherPath,
        STUB_DIR: stubDir,
        RECORD_PATH: recordPath,
        FAKE_UID: options.uid,
        FAKE_USERNS_OK: options.usernsOk ? '1' : '0',
        FAKE_SANDBOX_UID: options.sandboxUid,
        FAKE_SANDBOX_MODE: options.sandboxMode,
      }),
    });
    const args = fs.existsSync(recordPath) ? fs.readFileSync(recordPath, 'utf8').trim() : '';
    return {
      status: result.status,
      stderr: result.stderr || '',
      stdout: result.stdout || '',
      args,
    };
  } finally {
    fs.rmSync(appOutDir, { recursive: true, force: true });
  }
}

async function testLauncherDecisions(bash, userNamespaceLinkPresent) {
  if (userNamespaceLinkPresent) {
    const namespaced = await runLauncherScenario(bash, {
      uid: '1000',
      usernsOk: true,
      sandboxUid: '1000',
      sandboxMode: '0755',
      withHelper: false,
    });
    assert.strictEqual(namespaced.status, 0, `${namespaced.stderr}\n${namespaced.stdout}`);
    assert.strictEqual(namespaced.args, 'extra-arg', 'user namespaces must keep the sandbox');
  }

  const unsandboxed = await runLauncherScenario(bash, {
    uid: '1000',
    usernsOk: false,
    sandboxUid: '1000',
    sandboxMode: '0755',
    withHelper: false,
  });
  assert.strictEqual(unsandboxed.status, 0, `${unsandboxed.stderr}\n${unsandboxed.stdout}`);
  assert.strictEqual(unsandboxed.args, '--no-sandbox extra-arg');
  assert.ok(unsandboxed.stderr.includes('user namespaces are unavailable'));

  const root = await runLauncherScenario(bash, {
    uid: '0',
    usernsOk: true,
    sandboxUid: '0',
    sandboxMode: '4755',
    withHelper: false,
  });
  assert.strictEqual(root.status, 0, `${root.stderr}\n${root.stdout}`);
  assert.strictEqual(root.args, '--no-sandbox extra-arg', 'root must not enter Chromium sandbox setup');
  assert.ok(root.stderr.includes('sandboxed root process'));
}

async function testSetuidHelperKeepsSandbox(bash) {
  const result = await runLauncherScenario(bash, {
    uid: '1000',
    usernsOk: false,
    sandboxUid: '0',
    sandboxMode: '4755',
    withHelper: true,
  });
  assert.strictEqual(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.strictEqual(result.args, 'extra-arg', 'a root mode 4755 helper must keep the sandbox');
}

async function testSymlinkInvokesRuntimeBesideLauncher(bash) {
  const appOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wars-launcher-link-'));
  const linkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wars-launcher-linkdir-'));
  const stubDir = path.join(appOutDir, 'stubs');
  const recordPath = path.join(appOutDir, 'args.txt');
  try {
    fs.mkdirSync(stubDir);
    writeExecutable(path.join(stubDir, 'id'), `#!/bin/sh
printf '%s\\n' "1000"
exit 0
`);
    writeExecutable(path.join(stubDir, 'unshare'), `#!/bin/sh
exit 0
`);
    writeExecutable(path.join(appOutDir, 'agent-wars'), `#!/bin/sh
printf '%s\\n' "$*" > "$RECORD_ARGS_FILE"
exit 0
`);
    await installLinuxSandboxLauncher({
      electronPlatformName: 'linux',
      appOutDir,
      packager: { executableName: 'agent-wars' },
    });
    const linkPath = path.join(linkDir, 'agent-wars');
    fs.symlinkSync(path.join(appOutDir, 'agent-wars'), linkPath, 'file');
    const result = spawnSync(bash, ['-c', RUN_LAUNCHER_COMMAND], {
      encoding: 'utf8',
      env: bashChildEnv({
        LAUNCHER_PATH: linkPath,
        STUB_DIR: stubDir,
        RECORD_PATH: recordPath,
        FAKE_UID: '1000',
        FAKE_USERNS_OK: '1',
        FAKE_SANDBOX_UID: '1000',
        FAKE_SANDBOX_MODE: '0755',
      }),
    });
    assert.strictEqual(result.status, 0, result.stderr || '');
    const args = fs.readFileSync(recordPath, 'utf8').trim();
    assert.ok(args === 'extra-arg' || args === '--no-sandbox extra-arg', `symlink launch reached the runtime with unexpected args: ${args}`);
  } finally {
    fs.rmSync(appOutDir, { recursive: true, force: true });
    fs.rmSync(linkDir, { recursive: true, force: true });
  }
}

function symlinkErrorIsPermission(error) {
  return Boolean(error) && (error.code === 'EPERM' || error.code === 'EACCES');
}

/**
 * A failed write must put the Electron binary back at the original name.
 * The runtime file holds the binary, and the entry-point path holds a partial script.
 */
async function testFailedInstallRestoresTheElectronBinary() {
  const appOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wars-launcher-restore-'));
  const binaryPath = path.join(appOutDir, 'agent-wars');
  const runtimePath = path.join(appOutDir, 'agent-wars.bin');
  fs.writeFileSync(runtimePath, 'elf-binary');
  fs.writeFileSync(binaryPath, 'partial-script');
  try {
    await restoreLinuxExecutable(binaryPath, runtimePath);
    assert.strictEqual(fs.readFileSync(binaryPath, 'utf8'), 'elf-binary');
    assert.ok(!fs.existsSync(runtimePath));
  } finally {
    fs.rmSync(appOutDir, { recursive: true, force: true });
  }
}

async function main() {
  testLauncherScriptKeepsSandboxWhenPossible();
  await testLinuxPackReplacesExecutableWithLauncher();
  await testNonLinuxPackIsUnchanged();
  await testUnsafeExecutableNameIsRejected();
  await testDotDotExecutableNameIsRejected();
  await testExistingRuntimeIsRejected();
  await testMissingBinaryIsRejected();
  await testFailedInstallRestoresTheElectronBinary();

  const bash = findBash();
  if (!bash) {
    if (process.platform === 'linux') {
      throw new Error('bash is required to execute the Linux sandbox launcher contract');
    }
    console.log('linux-sandbox-launcher.test.cjs passed (launcher execution skipped; bash not found)');
    return;
  }
  if (process.platform === 'linux' && !bashHasUserNamespaceLink(bash)) {
    throw new Error('Linux bash must see /proc/self/ns/user so the namespace branch can be tested');
  }
  await testLauncherDecisions(bash, bashHasUserNamespaceLink(bash));
  if (bashSupportsSetuidBit(bash)) {
    await testSetuidHelperKeepsSandbox(bash);
  } else if (process.platform === 'linux') {
    throw new Error('Linux must honor the setuid bit so the chrome-sandbox branch can be tested');
  }
  try {
    await testSymlinkInvokesRuntimeBesideLauncher(bash);
  } catch (error) {
    if (process.platform === 'linux' || !symlinkErrorIsPermission(error)) {
      throw error;
    }
    console.log('symlink launch check skipped; creating a symlink was not permitted');
  }
  console.log('linux-sandbox-launcher.test.cjs passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
