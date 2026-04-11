const fs = require('node:fs');
const path = require('node:path');
const { getBuildIdentity } = require('./buildIdentity.cjs');

/**
 * Keeps CI packaging cross-platform by only setting icon paths that actually
 * exist and are appropriate for each target OS.
 */
function resolveOptionalBuildResource(relativePath) {
  const absolutePath = path.join(process.cwd(), relativePath);
  return fs.existsSync(absolutePath) ? relativePath : undefined;
}

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
  };
}

module.exports = {
  buildElectronBuilderConfig,
};
