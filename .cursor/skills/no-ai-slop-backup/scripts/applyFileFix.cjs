'use strict';

const fs = require('fs');
const path = require('path');

const { applyHeadingHouseStyle } = require('../tests/houseStyle.cjs');
const { rewriteEmDashes } = require('../tests/emDashRewrite.cjs');

/**
 * Applies heading house style and em-dash rewrite to one markdown file in place.
 *
 * Use this from `--file` fix before the judgment pass. It does not rewrite myth-bust,
 * copula, bold, contractions, or thematic breaks. Throws if `filePath` is missing or
 * the file cannot be read. Preserves UTF-8 and the file's LF vs CRLF newline style.
 */
function applyFileFix(filePath) {
  if (!filePath) {
    throw new Error('applyFileFix requires a file path');
  }
  const resolved = path.resolve(filePath);
  const content = fs.readFileSync(resolved, 'utf8');
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const dashed = rewriteEmDashes(content);
  const headed = applyHeadingHouseStyle(dashed.split(/\r?\n/));
  let out = headed.join(newline);
  if (/\r?\n$/.test(content) && !/\r?\n$/.test(out)) {
    out += newline;
  }
  fs.writeFileSync(resolved, out, 'utf8');
}

/**
 * Reads `--file <path>` from argv.
 *
 * Throws a usage error when the flag or path is absent so the CLI can exit without
 * writing anything.
 */
function parseFileArgument(argv) {
  const fileIndex = argv.indexOf('--file');
  if (fileIndex === -1 || !argv[fileIndex + 1]) {
    throw new Error('Usage: node scripts/applyFileFix.cjs --file <path>');
  }
  return argv[fileIndex + 1];
}

if (require.main === module) {
  try {
    applyFileFix(parseFileArgument(process.argv));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  applyFileFix,
};
