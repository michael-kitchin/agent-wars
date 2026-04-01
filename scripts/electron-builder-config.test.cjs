/* eslint-disable no-console */
const assert = require('assert');

const packageJson = require('../package.json');
const buildConfig = require('../electron-builder.config.cjs');

function testVersionedIdentityContract() {
  const versionText = String(packageJson.version || '0.0.0');
  const versionForId = versionText.replace(/[^0-9A-Za-z.-]/g, '-');
  assert.strictEqual(
    buildConfig.productName,
    `Agent Wars v${versionText}`,
    'electron-builder productName must include package version'
  );
  assert.strictEqual(
    buildConfig.appId,
    `com.agent-wars.app.${versionForId}`,
    'electron-builder appId must include package version for side-by-side installs'
  );
}

function testGeneratedTerrainResourcesContract() {
  const expected = [
    'terrain_res1_metadata.json',
    'terrain_res4_metadata.json',
    'terrain_res1_naming.json',
    'terrain_res4_naming.json',
  ];
  const entry =
    Array.isArray(buildConfig.extraResources) &&
    buildConfig.extraResources.find((item) => item && item.to === 'data/generated');
  assert.ok(entry, 'electron-builder extraResources must include data/generated entry');
  for (const filename of expected) {
    assert.ok(
      Array.isArray(entry.filter) && entry.filter.includes(filename),
      `electron-builder extraResources filter must include ${filename}`
    );
  }
}

function testWindowsZipTargetContract() {
  assert.ok(buildConfig.win && Array.isArray(buildConfig.win.target), 'electron-builder win.target must be configured');
  assert.ok(
    buildConfig.win.target.includes('zip'),
    'electron-builder win.target must include zip for double-click distribution'
  );
  assert.ok(
    !buildConfig.win.target.includes('nsis'),
    'electron-builder win.target must not include nsis installer'
  );
}

function testArtifactNameContract() {
  assert.strictEqual(
    buildConfig.artifactName,
    '${productName}-${os}-${arch}.${ext}',
    'electron-builder artifactName must avoid duplicating version while staying cross-platform explicit'
  );
}

function main() {
  testVersionedIdentityContract();
  testGeneratedTerrainResourcesContract();
  testWindowsZipTargetContract();
  testArtifactNameContract();
  console.log('electron-builder-config.test.cjs passed');
}

main();
