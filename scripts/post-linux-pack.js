
'use strict';

/**
 * Post-pack step for the Linux build: sets the executable bit on the main
 * binary and creates a distribution archive (TGZ) of the unpacked directory.
 * Run after electron-builder --linux so that the archive is ready to ship.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const projectRoot = path.resolve(__dirname, '..');
const releaseDir = path.join(projectRoot, 'release');
const linuxUnpacked = path.join(releaseDir, 'linux-unpacked');

const pkg = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
);
const version = pkg.version;
const executableName = (pkg.build && pkg.build.productName
  ? pkg.build.productName
  : pkg.name
)
  .toLowerCase()
  .replace(/\s+/g, '-');
const binaryPath = path.join(linuxUnpacked, executableName);

if (!fs.existsSync(linuxUnpacked)) {
  console.error('post-linux-pack: release/linux-unpacked not found. Run npm run dist:linux first.');
  process.exit(1);
}

if (!fs.existsSync(binaryPath)) {
  console.error('post-linux-pack: main executable not found at', binaryPath);
  process.exit(1);
}

// Set executable bit so the binary is runnable when the dir is used directly on Linux.
try {
  fs.chmodSync(binaryPath, 0o755);
} catch (e) {
  console.warn('post-linux-pack: could not chmod executable (may be Windows):', e.message);
}

// Create TGZ with explicit Unix modes so extraction on Linux works. On Windows,
// stat.mode is unreliable (often 0), which causes "Permission denied" and the
// extracted top-level directory to lose its execute bit.
const archiveName = `${executableName}-${version}-linux-x64.tar.gz`;
const archivePath = path.join(releaseDir, archiveName);

const tarFs = require('tar-fs');
const DIR_MODE = 0o755;
const FILE_MODE = 0o644;
const EXEC_MODE = 0o755;

const pack = tarFs.pack(linuxUnpacked, {
  map: (header) => {
    const isDir = header.type === 'directory' || header.type === 'Directory' || header.type === 5;
    const base = path.basename(header.name);
    const isMainBinary = base === executableName;
    if (isDir) {
      header.mode = DIR_MODE;
    } else if (isMainBinary) {
      header.mode = EXEC_MODE;
    } else {
      header.mode = FILE_MODE;
    }
    return header;
  },
});

const writeStream = fs.createWriteStream(archivePath);
pack
  .pipe(zlib.createGzip())
  .pipe(writeStream);

writeStream.on('finish', () => {
  console.log('post-linux-pack: created', archivePath);
  process.exit(0);
});
writeStream.on('error', (err) => {
  console.error('post-linux-pack: failed to write archive:', err);
  process.exit(1);
});
pack.on('error', (err) => {
  console.error('post-linux-pack: failed to create tarball:', err);
  process.exit(1);
});
