/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { GENERATED_TERRAIN_JSON_FILES } = require('./generated-data-manifest.cjs');
const {
  assertExtractedGeneratedJsonForPack,
  collectPackagedGeneratedDirs,
} = require('./generated-data-pack-assert.cjs');

const repoRoot = path.resolve(__dirname, '..');

function testPrePackAssertPassesWithExtractedJson() {
  assertExtractedGeneratedJsonForPack();
}

function testCollectPackagedGeneratedDirsFindsLayout() {
  const tmpRoot = fs.mkdtempSync(path.join(require('os').tmpdir(), 'agent-wars-pack-layout-'));
  try {
    const packagedGenerated = path.join(tmpRoot, 'win-unpacked', 'resources', 'data', 'generated');
    fs.mkdirSync(packagedGenerated, { recursive: true });
    for (const jsonFilename of GENERATED_TERRAIN_JSON_FILES) {
      fs.writeFileSync(path.join(packagedGenerated, jsonFilename), '{}');
    }
    const found = collectPackagedGeneratedDirs(tmpRoot);
    assert.ok(found.includes(packagedGenerated), 'expected packaged data/generated directory to be discovered');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function main() {
  testPrePackAssertPassesWithExtractedJson();
  testCollectPackagedGeneratedDirsFindsLayout();
  console.log('generated-data-pack-assert.test.cjs passed');
}

main();
