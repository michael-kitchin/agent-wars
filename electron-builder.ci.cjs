const { buildElectronBuilderConfig, chromiumLicenseExtraResource } = require('./scripts/electronBuilderBaseConfig.cjs');

module.exports = buildElectronBuilderConfig({
  publish: null,
  files: ['dist', 'static', 'package.json', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'node_modules'],
  extraResources: chromiumLicenseExtraResource(),
  winTarget: ['nsis'],
  linuxTarget: ['AppImage'],
  macTarget: ['dmg'],
});
