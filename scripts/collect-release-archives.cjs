'use strict';

/**
 * Publishes the three OS archives downloaded from a Build workflow run.
 *
 * Purpose: The draft release must attach the stored archives. Packing them again would wrap the macOS zip and the Linux tar.gz.
 * When to use: From the release job after `download-artifact` with `skip-decompress: true`.
 * Expected outcome: Exits 0 and prints each published path. Exits 1 when the download is not one Linux tar.gz, one macOS zip, and one Windows app zip.
 */

const fs = require('fs');
const path = require('path');

const GZIP_MAGIC = Buffer.from([0x1f, 0x8b]);
const ZIP_MAGIC = Buffer.from([0x50, 0x4b]);

/**
 * Copies the three stored archives into `publishDir` without packing them again.
 *
 * Purpose: Linux and macOS artifact names are the archive filenames. The Windows artifact is the app zip and its name has no extension.
 * When to use: After the release job downloads every `agent-wars-<version>-*` artifact into one folder.
 * Expected outcome: Returns the published paths. Each file's bytes match the downloaded artifact.
 * Exceptions: Throws when the folder is missing, an artifact is not one archive file, the magic bytes disagree with the name, a publish path already exists, or the set is not one archive per OS.
 *
 * @param {string} sourceDir Folder of artifact directories from `download-artifact`
 * @param {string} publishDir Destination folder, created when absent
 * @returns {string[]} Absolute paths of the published archives
 */
function collectReleaseArchives(sourceDir, publishDir) {
  const plans = planReleaseArchives(sourceDir);
  fs.mkdirSync(publishDir, { recursive: true });
  const published = [];
  for (const plan of plans) {
    const destination = path.join(publishDir, plan.outputName);
    if (fs.existsSync(destination)) {
      throw new Error(`Refusing to overwrite ${destination}`);
    }
    fs.renameSync(plan.sourceFile, destination);
    published.push(destination);
  }
  return published;
}

/**
 * Checks the download folder and returns the rename plan.
 *
 * Purpose: Validation finishes before any file is moved, so a bad set does not leave a partial publish directory.
 * When to use: From `collectReleaseArchives`.
 * Expected outcome: One plan per OS archive, in artifact-name order.
 * Exceptions: Throws for the same contract failures as `collectReleaseArchives`, except an existing publish path.
 *
 * @param {string} sourceDir
 * @returns {{ outputName: string, sourceFile: string }[]}
 */
function planReleaseArchives(sourceDir) {
  const counts = { linux: 0, macos: 0, windows: 0 };
  const plans = [];
  for (const artifactName of artifactDirectoryNames(sourceDir)) {
    const kind = releaseArchiveKind(artifactName);
    const sourceFile = soleArtifactFile(path.join(sourceDir, artifactName), artifactName);
    assertArchiveMagic(sourceFile, artifactName, kind);
    counts[kind] += 1;
    plans.push({
      outputName: publishedArchiveName(artifactName, kind),
      sourceFile,
    });
  }
  if (counts.linux !== 1 || counts.macos !== 1 || counts.windows !== 1) {
    throw new Error(
      `Expected one Linux tar.gz, one macOS zip, and one Windows app zip. Found linux=${counts.linux}, macos=${counts.macos}, windows=${counts.windows}.`,
    );
  }
  return plans;
}

/**
 * Lists artifact directories and rejects anything else in the download folder.
 *
 * Purpose: `download-artifact` puts each artifact in its own directory. A loose file would be omitted by a directory-only loop.
 * When to use: From `planReleaseArchives`.
 * Expected outcome: Directory names sorted by locale.
 * Exceptions: Throws when `sourceDir` is missing or contains a file.
 *
 * @param {string} sourceDir
 * @returns {string[]}
 */
function artifactDirectoryNames(sourceDir) {
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    throw new Error(`Release asset folder does not exist: ${sourceDir}`);
  }
  const names = [];
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      throw new Error(`Release asset folder contains ${entry.name}, which is not an artifact directory.`);
    }
    names.push(entry.name);
  }
  names.sort((left, right) => left.localeCompare(right));
  return names;
}

/**
 * Maps an artifact directory name to the OS archive it must be.
 *
 * Purpose: The upload names Linux and macOS artifacts after the archive file. The Windows name has no extension.
 * When to use: From `planReleaseArchives`.
 * Expected outcome: `linux` for a `.tar.gz` name, `macos` for a `.zip` name, otherwise `windows`.
 * Exceptions: None.
 *
 * @param {string} artifactName
 * @returns {'linux' | 'macos' | 'windows'}
 */
function releaseArchiveKind(artifactName) {
  if (artifactName.endsWith('.tar.gz')) return 'linux';
  if (artifactName.endsWith('.zip')) return 'macos';
  return 'windows';
}

/**
 * Returns the release-asset filename for one artifact.
 *
 * Purpose: The Windows upload name omits `.zip` because the upload action adds the zip. The published asset needs the extension.
 * When to use: From `planReleaseArchives`.
 * Expected outcome: The artifact name for Linux and macOS, and that name plus `.zip` for Windows.
 * Exceptions: None.
 *
 * @param {string} artifactName
 * @param {'linux' | 'macos' | 'windows'} kind
 * @returns {string}
 */
function publishedArchiveName(artifactName, kind) {
  if (kind === 'windows') return `${artifactName}.zip`;
  return artifactName;
}

/**
 * Returns the only regular file in an artifact directory.
 *
 * Purpose: `skip-decompress` stores the uploaded file under a content-disposition name that can differ from the artifact name.
 * When to use: From `planReleaseArchives`.
 * Expected outcome: The absolute path of that file.
 * Exceptions: Throws when the directory does not contain exactly one regular file.
 *
 * @param {string} artifactDir
 * @param {string} artifactName
 * @returns {string}
 */
function soleArtifactFile(artifactDir, artifactName) {
  const entries = fs.readdirSync(artifactDir, { withFileTypes: true });
  if (entries.length !== 1) {
    throw new Error(`Artifact ${artifactName} should be one file, found ${entries.length}.`);
  }
  if (!entries[0].isFile()) {
    throw new Error(`Artifact ${artifactName} should be one file.`);
  }
  return path.join(artifactDir, entries[0].name);
}

/**
 * Checks the leading bytes of a stored archive.
 *
 * Purpose: A macOS artifact is a zip and a Linux artifact is gzip. Accepting the wrong bytes would publish a file the name does not describe.
 * When to use: From `planReleaseArchives` after the sole file is known.
 * Expected outcome: Returns when the magic matches the kind.
 * Exceptions: Throws when the file is shorter than the magic or the bytes disagree.
 *
 * @param {string} filePath
 * @param {string} artifactName
 * @param {'linux' | 'macos' | 'windows'} kind
 * @returns {void}
 */
function assertArchiveMagic(filePath, artifactName, kind) {
  if (kind === 'linux') {
    if (!hasMagic(filePath, GZIP_MAGIC)) {
      throw new Error(`Artifact ${artifactName} is not a gzip archive.`);
    }
    return;
  }
  if (!hasMagic(filePath, ZIP_MAGIC)) {
    throw new Error(`Artifact ${artifactName} is not a zip archive.`);
  }
}

/**
 * Reads the start of a file and compares it to `magic`.
 *
 * Purpose: Archive kinds are identified without unpacking them.
 * When to use: From `assertArchiveMagic`.
 * Expected outcome: True when the file begins with `magic`.
 * Exceptions: Propagates filesystem errors from opening or reading the file.
 *
 * @param {string} filePath
 * @param {Buffer} magic
 * @returns {boolean}
 */
function hasMagic(filePath, magic) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(magic.length);
    const read = fs.readSync(fd, buf, 0, magic.length, 0);
    return read === magic.length && buf.equals(magic);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * Runs the collector from the release job.
 *
 * Purpose: Prints published paths for the workflow log.
 * When to use: `node scripts/collect-release-archives.cjs <source-dir> <publish-dir>`.
 * Expected outcome: Exits 0 after printing one path per archive.
 * Exceptions: Exits 1 on a usage error or a contract failure. The message is written to stderr.
 *
 * @returns {void}
 */
function main() {
  const sourceDir = process.argv[2];
  const publishDir = process.argv[3];
  if (!sourceDir || !publishDir || process.argv.length !== 4) {
    console.error('Usage: node scripts/collect-release-archives.cjs <source-dir> <publish-dir>');
    process.exit(1);
  }
  try {
    const published = collectReleaseArchives(sourceDir, publishDir);
    for (const filePath of published) console.log(filePath);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  collectReleaseArchives,
};
