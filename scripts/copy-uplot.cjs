/**
 * Copies uPlot's stylesheet and license into static/vendor/uplot so the page can link them without a bundler.
 * Run after npm install and before renderer builds; keeps the existing copy with a warning if node_modules/uplot is missing.
 * The script code itself is not copied, because esbuild bundles it into static/renderer.js from the npm package.
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const uplotPackage = path.join(root, 'node_modules', 'uplot');
const stylesheetSource = path.join(uplotPackage, 'dist', 'uPlot.min.css');
const destDir = path.join(root, 'static', 'vendor', 'uplot');
const licenseFileNames = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'];

if (!fs.existsSync(stylesheetSource)) {
  if (fs.existsSync(path.join(destDir, 'uPlot.min.css'))) {
    console.warn('copy-uplot: node_modules/uplot missing; keeping existing static/vendor/uplot');
    process.exit(0);
  }
  console.warn('copy-uplot: skip (no uplot package and no static/vendor/uplot; run npm install)');
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(stylesheetSource, path.join(destDir, 'uPlot.min.css'));

const licenseName = licenseFileNames.find((fileName) => fs.existsSync(path.join(uplotPackage, fileName)));
if (licenseName) {
  fs.copyFileSync(path.join(uplotPackage, licenseName), path.join(destDir, 'LICENSE'));
}

console.log('copy-uplot: copied to static/vendor/uplot');
