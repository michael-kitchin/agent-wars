/**
 * Copies Leaflet dist (JS, CSS, marker images) into static/vendor/leaflet for offline-friendly loads.
 * Run after npm install and before renderer builds; no-op with a warning if node_modules/leaflet is missing.
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const leafletDist = path.join(root, 'node_modules', 'leaflet', 'dist');
const destDir = path.join(root, 'static', 'vendor', 'leaflet');

if (!fs.existsSync(path.join(leafletDist, 'leaflet.js'))) {
  if (fs.existsSync(path.join(destDir, 'leaflet.js'))) {
    console.warn('copy-leaflet: node_modules/leaflet missing; keeping existing static/vendor/leaflet');
    process.exit(0);
  }
  console.warn('copy-leaflet: skip (no leaflet dist and no static/vendor/leaflet; run npm install)');
  process.exit(0);
}

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

console.log('copy-leaflet: copied to static/vendor/leaflet');
