/**
 * Bundles the Electron preload script into dist/main/preload.js.
 *
 * Purpose: A sandboxed preload can require only `electron` and a few built-in modules, so a relative import of `src/shared` modules would fail at runtime. Bundling inlines those modules.
 * When to use: Run by `npm run build:main` right after `tsc`, which type-checks the preload and writes a file this script then replaces.
 * Expected outcome: dist/main/preload.js is one CommonJS file whose only `require` is `electron`.
 * Exceptions: Exits with code 1 and prints the esbuild error when the bundle fails.
 */

const path = require('path');
const { build } = require('esbuild');

const root = path.join(__dirname, '..');

build({
  entryPoints: [path.join(root, 'src', 'main', 'preload.ts')],
  outfile: path.join(root, 'dist', 'main', 'preload.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // Electron 40 ships Node 24; node20 is a safe floor for the generated syntax.
  target: 'node20',
  external: ['electron'],
  sourcemap: false,
  logLevel: 'warning',
})
  .then(() => {
    console.log('build-preload: wrote dist/main/preload.js');
  })
  .catch((error) => {
    console.error('build-preload: bundle failed', error);
    process.exit(1);
  });
