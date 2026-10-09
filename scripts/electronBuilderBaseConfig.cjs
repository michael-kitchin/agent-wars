const fs = require('node:fs');
const path = require('node:path');
const { getBuildIdentity } = require('./buildIdentity.cjs');
const { installLinuxSandboxLauncher } = require('./linux-sandbox-launcher.cjs');

/**
 * Resolves a build-resource path only when the file is present.
 *
 * Purpose: Keeps CI packaging cross-platform by setting icon paths that exist for the target OS.
 * When to use: While building the electron-builder config for Windows, Linux, and macOS icons.
 * Expected outcome: The relative path when the file exists; otherwise undefined so the config omits that icon.
 * Exceptions: None.
 */
function resolveOptionalBuildResource(relativePath) {
  const absolutePath = path.join(process.cwd(), relativePath);
  return fs.existsSync(absolutePath) ? relativePath : undefined;
}

/**
 * Builds the electron-builder config shared by the local and CI entry points.
 *
 * Purpose: Keep app id, product name, icons, and the Linux sandbox launcher in one object.
 * When to use: From `electron-builder.config.cjs` and `electron-builder.ci.cjs`.
 * Expected outcome: A config electron-builder can load. `afterPack` installs the Linux launcher
 * and leaves macOS and Windows bundles unchanged.
 * Exceptions: None. Missing icon files are omitted rather than failing config load.
 */
function buildElectronBuilderConfig(options) {
  const buildIdentity = getBuildIdentity();
  const windowsIcon = resolveOptionalBuildResource('build/icon.ico');
  const linuxIcon = resolveOptionalBuildResource('build/icon.png');
  const macIcon = resolveOptionalBuildResource('build/icon.icns');
  return {
    appId: buildIdentity.appId,
    productName: buildIdentity.productName,
    publish: options.publish,
    directories: {
      output: 'release',
      buildResources: 'build',
    },
    files: options.files,
    ...(options.extraResources ? { extraResources: options.extraResources } : {}),
    ...(options.artifactName ? { artifactName: options.artifactName } : {}),
    win: {
      target: options.winTarget,
      ...(windowsIcon ? { icon: windowsIcon } : {}),
    },
    linux: {
      target: options.linuxTarget,
      ...(linuxIcon ? { icon: linuxIcon } : {}),
    },
    mac: {
      target: options.macTarget,
      category: 'public.app-category.games',
      ...(macIcon ? { icon: macIcon } : {}),
    },
    afterPack: installLinuxSandboxLauncher,
  };
}

module.exports = {
  buildElectronBuilderConfig,
};
