const { getBuildIdentity } = require('./buildIdentity.cjs');

function buildElectronBuilderConfig(options) {
  const buildIdentity = getBuildIdentity();
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
      icon: 'build/icon.ico',
    },
    linux: {
      target: options.linuxTarget,
      icon: 'build/icon.ico',
    },
    mac: {
      target: options.macTarget,
      category: 'public.app-category.games',
      icon: 'build/icon.ico',
    },
  };
}

module.exports = {
  buildElectronBuilderConfig,
};
