const { buildElectronBuilderConfig } = require('./scripts/electronBuilderBaseConfig.cjs');
const {
  buildElectronBuilderGeneratedFileEntries,
  buildElectronBuilderGeneratedResourceFilter,
} = require('./scripts/electronBuilderGeneratedFiles.cjs');

const generatedTerrainFiles = buildElectronBuilderGeneratedFileEntries();
const generatedTerrainResourceFilter = buildElectronBuilderGeneratedResourceFilter();

module.exports = buildElectronBuilderConfig({
  publish: [],
  artifactName: '${productName}-${os}-${arch}.${ext}',
  files: [
    'dist',
    'static',
    'package.json',
    'node_modules',
    ...generatedTerrainFiles,
  ],
  extraResources: [
    {
      from: 'data/generated',
      to: 'data/generated',
      filter: generatedTerrainResourceFilter,
    },
  ],
  winTarget: ['zip'],
  linuxTarget: ['dir'],
  macTarget: ['dir'],
});
