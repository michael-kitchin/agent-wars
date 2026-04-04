const { getBuildIdentity } = require('./buildIdentity.cjs');

function buildElectronBuilderConfig(options) {
  const buildIdentity = getBuildIdentity();
  return {
    appId: buildIdentity.appId,
    productName: buildIdentity.productName,
    publish: options.publish,
    directories: {
      output: 'release',
    },
    files: options.files,
    ...(options.extraResources ? { extraResources: options.extraResources } : {}),
    ...(options.artifactName ? { artifactName: options.artifactName } : {}),
    win: {
      target: options.winTarget,
    },
    linux: {
      target: options.linuxTarget,
    },
    mac: {
      target: options.macTarget,
      category: 'public.app-category.games',
    },
  };
}

module.exports = {
  buildElectronBuilderConfig,
};
