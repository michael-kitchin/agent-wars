const { buildElectronBuilderConfig, chromiumLicenseExtraResource } = require('./scripts/electronBuilderBaseConfig.cjs');
const {
  buildElectronBuilderGeneratedFileEntries,
  buildElectronBuilderGeneratedResourceFilter,
  buildElectronBuilderRegionalZipFileEntries,
  buildElectronBuilderRegionalZipResource,
} = require('./scripts/electronBuilderGeneratedFiles.cjs');

const generatedTerrainFiles = buildElectronBuilderGeneratedFileEntries();
const generatedTerrainResourceFilter = buildElectronBuilderGeneratedResourceFilter();
const regionalZipFiles = buildElectronBuilderRegionalZipFileEntries();
const regionalZipResource = buildElectronBuilderRegionalZipResource();
const chromiumResource = chromiumLicenseExtraResource();

module.exports = buildElectronBuilderConfig({
  publish: [],
  artifactName: '${productName}-${os}-${arch}.${ext}',
  files: [
    'dist',
    'static',
    'package.json',
    'LICENSE',
    'THIRD-PARTY-NOTICES.md',
    'node_modules',
    ...generatedTerrainFiles,
    ...regionalZipFiles,
  ],
  extraResources: [
    {
      from: 'data/generated',
      to: 'data/generated',
      filter: generatedTerrainResourceFilter,
    },
    regionalZipResource,
    ...chromiumResource,
  ],
  winTarget: ['zip'],
  linuxTarget: ['dir'],
  macTarget: ['dir'],
});
