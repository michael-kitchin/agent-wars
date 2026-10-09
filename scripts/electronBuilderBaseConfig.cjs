const fs = require('node:fs');
const path = require('node:path');
const { getBuildIdentity } = require('./buildIdentity.cjs');
const { installLinuxSandboxLauncher } = require('./linux-sandbox-launcher.cjs');

const chromiumLicenses = 'node_modules/electron/dist/LICENSES.chromium.html';
const electronDistVersion = 'node_modules/electron/dist/version';

/**
 * Copies Chromium's third-party notices into a packaged app when the Electron binary is present.
 *
 * Purpose: Electron's MIT license does not replace the notices that ship beside the Chromium binary.
 * When to use: While building `extraResources` for either electron-builder entry point.
 * Expected outcome: A one-item resource list, or an empty list when the Electron binary has not been downloaded.
 * Exceptions: Throws when `dist/version` exists and `LICENSES.chromium.html` does not, because the binary
 * was installed without the notices distributors are expected to keep.
 */
function chromiumLicenseExtraResource() {
  if (fs.existsSync(electronDistVersion) && !fs.existsSync(chromiumLicenses)) {
    throw new Error(`Electron binary is installed but ${chromiumLicenses} is missing`);
  }
  if (!fs.existsSync(chromiumLicenses)) {
    return [];
  }
  return [{ from: chromiumLicenses, to: 'LICENSES.chromium.html' }];
}

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
  chromiumLicenseExtraResource,
};
