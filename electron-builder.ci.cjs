const { buildElectronBuilderConfig } = require('./scripts/electronBuilderBaseConfig.cjs');

module.exports = buildElectronBuilderConfig({
  publish: null,
  files: ['dist', 'static', 'symbols', 'package.json', 'node_modules'],
  winTarget: ['nsis'],
  linuxTarget: ['AppImage'],
  macTarget: ['dmg'],
});
