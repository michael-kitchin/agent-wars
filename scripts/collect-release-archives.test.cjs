/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { collectReleaseArchives } = require('./collect-release-archives.cjs');

const GZIP = Buffer.from([0x1f, 0x8b, 0x08]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/**
 * Builds the three artifact directories a release download produces.
 *
 * Purpose: The inner filename is not the artifact name, which is what `skip-decompress` can do.
 * When to use: From the happy-path test and as a base for failure cases that replace one file.
 * Expected outcome: Returns the temp root. Caller deletes it.
 * Exceptions: None.
 *
 * @returns {string}
 */
function writeSampleDownload() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wars-release-'));
  writeArtifact(root, 'agent-wars-2.5.0-windows-x64', 'artifact', ZIP);
  writeArtifact(root, 'agent-wars-2.5.0-linux-x64.tar.gz', 'inner-name', GZIP);
  writeArtifact(root, 'agent-wars-2.5.0-macos-arm64.zip', 'agent-wars-2.5.0-macos-arm64.zip', ZIP);
  return root;
}

/**
 * Writes one stored archive into an artifact directory.
 *
 * Purpose: Keeps the sample layout in one place.
 * When to use: From `writeSampleDownload` and failure cases.
 * Expected outcome: Creates the directory and file.
 * Exceptions: Propagates filesystem errors.
 *
 * @param {string} root
 * @param {string} artifactName
 * @param {string} innerName
 * @param {Buffer} bytes
 * @returns {void}
 */
function writeArtifact(root, artifactName, innerName, bytes) {
  const dir = path.join(root, artifactName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, innerName), bytes);
}

/**
 * Removes a temp download tree.
 *
 * Purpose: Tests must not leave archives in the OS temp directory.
 * When to use: From each test's `finally`.
 * Expected outcome: The tree is gone.
 * Exceptions: Ignores a missing path.
 *
 * @param {string} root
 * @returns {void}
 */
function removeTree(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

function testPublishesStoredBytesUnderArchiveNames() {
  const root = writeSampleDownload();
  const publishDir = path.join(root, 'publish');
  try {
    const published = collectReleaseArchives(root, publishDir).map((filePath) => path.basename(filePath)).sort();
    assert.deepStrictEqual(published, [
      'agent-wars-2.5.0-linux-x64.tar.gz',
      'agent-wars-2.5.0-macos-arm64.zip',
      'agent-wars-2.5.0-windows-x64.zip',
    ]);
    assert.ok(GZIP.equals(fs.readFileSync(path.join(publishDir, 'agent-wars-2.5.0-linux-x64.tar.gz')).subarray(0, 3)));
    assert.ok(ZIP.equals(fs.readFileSync(path.join(publishDir, 'agent-wars-2.5.0-macos-arm64.zip'))));
    assert.ok(ZIP.equals(fs.readFileSync(path.join(publishDir, 'agent-wars-2.5.0-windows-x64.zip'))));
  } finally {
    removeTree(root);
  }
}

function testRejectsLinuxArchiveThatIsNotGzip() {
  const root = writeSampleDownload();
  try {
    writeArtifact(root, 'agent-wars-2.5.0-linux-x64.tar.gz', 'inner-name', ZIP);
    assert.throws(
      () => collectReleaseArchives(root, path.join(root, 'publish')),
      /agent-wars-2.5.0-linux-x64\.tar\.gz is not a gzip archive/,
    );
  } finally {
    removeTree(root);
  }
}

function testRejectsWindowsArchiveThatIsNotZip() {
  const root = writeSampleDownload();
  try {
    writeArtifact(root, 'agent-wars-2.5.0-windows-x64', 'artifact', GZIP);
    assert.throws(
      () => collectReleaseArchives(root, path.join(root, 'publish')),
      /agent-wars-2.5.0-windows-x64 is not a zip archive/,
    );
  } finally {
    removeTree(root);
  }
}

function testRejectsAnArtifactWithTwoFiles() {
  const root = writeSampleDownload();
  try {
    fs.writeFileSync(path.join(root, 'agent-wars-2.5.0-macos-arm64.zip', 'extra.zip'), ZIP);
    assert.throws(
      () => collectReleaseArchives(root, path.join(root, 'publish')),
      /agent-wars-2.5.0-macos-arm64\.zip should be one file, found 2/,
    );
  } finally {
    removeTree(root);
  }
}

function testRejectsTwoLinuxArchives() {
  const root = writeSampleDownload();
  try {
    writeArtifact(root, 'agent-wars-2.5.0-linux-arm64.tar.gz', 'inner-name', GZIP);
    assert.throws(
      () => collectReleaseArchives(root, path.join(root, 'publish')),
      /Found linux=2, macos=1, windows=1/,
    );
    assert.ok(!fs.existsSync(path.join(root, 'publish')));
  } finally {
    removeTree(root);
  }
}

function main() {
  testPublishesStoredBytesUnderArchiveNames();
  testRejectsLinuxArchiveThatIsNotGzip();
  testRejectsWindowsArchiveThatIsNotZip();
  testRejectsAnArtifactWithTwoFiles();
  testRejectsTwoLinuxArchives();
  console.log('collect-release-archives.test.cjs passed');
}

main();
