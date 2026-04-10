/* eslint-disable no-console */
const assert = require('assert');

const packageJson = require('../package.json');
const buildConfig = require('../electron-builder.config.cjs');
const ciBuildConfig = require('../electron-builder.ci.cjs');
const { getBuildIdentity } = require('./buildIdentity.cjs');

function testVersionedIdentityContract() {
  const versionText = String(packageJson.version || '0.0.0');
  const versionForId = versionText.replace(/[^0-9A-Za-z.-]/g, '-');
  const buildIdentity = getBuildIdentity();
  assert.strictEqual(buildIdentity.versionText, versionText, 'build identity should read package version');
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
  assert.strictEqual(ciBuildConfig.productName, buildConfig.productName, 'CI and default builder configs should share product name');
  assert.strictEqual(ciBuildConfig.appId, buildConfig.appId, 'CI and default builder configs should share app id');
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

function testWindowsIconContract() {
  assert.ok(buildConfig.win && buildConfig.win.icon, 'electron-builder win.icon must be configured');
  assert.strictEqual(
    buildConfig.win.icon,
    'build/icon.ico',
    'electron-builder win.icon must point to build/icon.ico'
  );
}

function testLinuxAndMacIconContract() {
  assert.ok(buildConfig.linux && buildConfig.linux.icon, 'electron-builder linux.icon must be configured');
  assert.ok(buildConfig.mac && buildConfig.mac.icon, 'electron-builder mac.icon must be configured');
  assert.strictEqual(
    buildConfig.linux.icon,
    'build/icon.ico',
    'electron-builder linux.icon must point to build/icon.ico'
  );
  assert.strictEqual(
    buildConfig.mac.icon,
    'build/icon.ico',
    'electron-builder mac.icon must point to build/icon.ico'
  );
}

function testIconPackagingContract() {
  const files = Array.isArray(buildConfig.files) ? buildConfig.files : [];
  const ciFiles = Array.isArray(ciBuildConfig.files) ? ciBuildConfig.files : [];
  assert.ok(files.includes('symbols'), 'electron-builder files must include symbols directory');
  assert.ok(ciFiles.includes('symbols'), 'CI electron-builder files must include symbols directory');
}

function main() {
  testVersionedIdentityContract();
  testGeneratedTerrainResourcesContract();
  testWindowsZipTargetContract();
  testArtifactNameContract();
  testWindowsIconContract();
  testLinuxAndMacIconContract();
  testIconPackagingContract();
  console.log('electron-builder-config.test.cjs passed');
}

main();
