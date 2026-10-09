/**
 * Copies Leaflet dist (JS, CSS, marker images) into static/vendor/leaflet for offline-friendly loads.
 * Run after npm install and before renderer builds; no-op with a warning if node_modules/leaflet is missing.
 * The refresh deletes the destination directory, then copies LICENSE back. BSD requires that notice
 * to stay beside the vendored sources.
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const leafletPackage = path.join(root, 'node_modules', 'leaflet');
const leafletDist = path.join(leafletPackage, 'dist');
const destDir = path.join(root, 'static', 'vendor', 'leaflet');
const licenseFileNames = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'];

if (!fs.existsSync(path.join(leafletDist, 'leaflet.js'))) {
  if (fs.existsSync(path.join(destDir, 'leaflet.js'))) {
    console.warn('copy-leaflet: node_modules/leaflet missing; keeping existing static/vendor/leaflet');
    process.exit(0);
  }
  console.warn('copy-leaflet: skip (no leaflet dist and no static/vendor/leaflet; run npm install)');
  process.exit(0);
}

const preservedLicense = readFirstLicense(destDir);
fs.rmSync(destDir, { recursive: true, force: true });
fs.mkdirSync(destDir, { recursive: true });

for (const f of ['leaflet.css', 'leaflet.js']) {
  fs.copyFileSync(path.join(leafletDist, f), path.join(destDir, f));
}

const imgSrc = path.join(leafletDist, 'images');
const imgDest = path.join(destDir, 'images');
if (fs.existsSync(imgSrc)) {
  fs.mkdirSync(imgDest, { recursive: true });
  for (const name of fs.readdirSync(imgSrc)) {
    fs.copyFileSync(path.join(imgSrc, name), path.join(imgDest, name));
  }
}

const upstreamLicense = readFirstLicense(leafletPackage);
const licenseBytes = upstreamLicense ?? preservedLicense;
if (licenseBytes) {
  fs.writeFileSync(path.join(destDir, 'LICENSE'), licenseBytes);
}

console.log('copy-leaflet: copied to static/vendor/leaflet');

/**
 * Purpose: Keep the BSD notice with the vendored Leaflet files across a destination refresh.
 * When to use: Before deleting static/vendor/leaflet, and again from the installed package.
 * Expected outcome: The first LICENSE, LICENSE.md, or LICENSE.txt bytes in that directory, or null.
 * Exceptions: None. A missing directory or a missing license file returns null.
 */
function readFirstLicense(directory) {
  if (!fs.existsSync(directory)) {
    return null;
  }
  const licensePath = licenseFileNames
    .map((fileName) => path.join(directory, fileName))
    .find((candidate) => fs.existsSync(candidate));
  return licensePath ? fs.readFileSync(licensePath) : null;
}
