'use strict';

const fs = require('fs');
const path = require('path');

/**
 * US/UK spelling-pair checks for english-variety-mismatch.
 *
 * Parses references/englishVariety.md. applyFileFix.cjs must not require this
 * module. Quoted prompts, code, YAML, and mapping lists are not author variety.
 * When US table hits are empty and UK distinct pairs are fewer than three, the
 * overlay defaults to US (stray British spelling). Three or more UK pairs and
 * no US is a consistent British document.
 * Run `node tests/englishVariety.cjs --file <path>` to print mismatch or
 * consistent. This CLI does not rewrite.
 */

const SKILL_DIR = path.join(__dirname, '..');

/**
 * Distinct UK pairs at or above this count, with no US hits, mean British prose.
 *
 * One or two UK pairs is not enough to treat the document as British.
 */
const BRITISH_DISTINCT_PAIR_FLOOR = 3;

/**
 * Removes a leading YAML document when both fences are present.
 *
 * Front-matter spellings are not the author's running-prose variety.
 */
function stripYamlFrontMatter(content) {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return match ? content.slice(match[0].length) : content;
}

/**
 * Escapes a literal spelling so it is safe inside a RegExp word-boundary pattern.
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Loads US/UK spelling pairs from references/englishVariety.md.
 *
 * Parses the fenced `us | uk` table after the Pairs heading. Throws if the fence
 * is missing or empty so a broken reference file fails the suite loudly.
 */
function loadEnglishVarietyPairs() {
  const filePath = path.join(SKILL_DIR, 'references', 'englishVariety.md');
  const markdown = fs.readFileSync(filePath, 'utf8');
  const heading = /(^|\n)#{2,6} Pairs\s*\r?\n/;
  const headingMatch = heading.exec(markdown);
  if (!headingMatch) {
    throw new Error('englishVariety.md has no Pairs heading');
  }
  const after = markdown.slice(headingMatch.index);
  const fence = /```text\r?\n([\s\S]*?)```/;
  const fenceMatch = fence.exec(after);
  if (!fenceMatch) {
    throw new Error('englishVariety.md has no Pairs fence');
  }
  const pairs = [];
  fenceMatch[1].split(/\r?\n/).forEach((line) => {
    if (!line.trim()) {
      return;
    }
    const parts = line.split('|').map((part) => part.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(`englishVariety.md bad pair line: ${JSON.stringify(line)}`);
    }
    pairs.push({ us: parts[0], uk: parts[1] });
  });
  if (pairs.length === 0) {
    throw new Error('englishVariety.md Pairs fence is empty');
  }
  return pairs;
}

/**
 * Returns running prose with YAML, code, quotes, media, and mapping lists removed.
 *
 * Blockquote lines (`>`) are pasted prompts or callouts, not the author's
 * spelling. IMAGE/DATA placeholder lines are skipped even without `>`.
 */
function runningProseForVariety(content) {
  let working = stripYamlFrontMatter(content);
  working = working.replace(/```[\s\S]*?```/g, ' ');
  working = working.replace(/~~~[\s\S]*?~~~/g, ' ');
  working = working.replace(/`[^`]*`/g, ' ');
  working = working.replace(/<!--[\s\S]*?-->/g, ' ');
  return working
    .split(/\r?\n/)
    .filter((line) => {
      if (/^\s*>/.test(line)) {
        return false;
      }
      if (/^\s*\*\*\[(IMAGE|DATA):/.test(line)) {
        return false;
      }
      if (/^\s*[-*+]\s+.+\s*->\s+/.test(line)) {
        return false;
      }
      return true;
    })
    .join('\n');
}

/**
 * Counts distinct pair-table columns that appear in running prose.
 *
 * A pair contributes to US if its US form hits, and to UK if its UK form hits.
 * The same pair can contribute to both when a document mixes that word.
 */
function columnHits(kept, pairs) {
  let usPairs = 0;
  let ukPairs = 0;
  pairs.forEach((pair) => {
    const usRe = new RegExp(`\\b${escapeRegExp(pair.us)}\\b`, 'i');
    const ukRe = new RegExp(`\\b${escapeRegExp(pair.uk)}\\b`, 'i');
    if (usRe.test(kept)) {
      usPairs += 1;
    }
    if (ukRe.test(kept)) {
      ukPairs += 1;
    }
  });
  return { usPairs, ukPairs };
}

/**
 * Returns whether running prose is an english-variety-mismatch finding.
 *
 * True when both columns hit, or when UK hits exist, US hits do not, and
 * distinct UK pairs are below the British floor (stray UK, default US).
 * False for US-only prose, quote-only US, and consistent British (three or
 * more UK pairs, no US).
 */
function varietyMismatch(content, pairs) {
  const kept = runningProseForVariety(content);
  const { usPairs, ukPairs } = columnHits(kept, pairs);
  if (usPairs > 0 && ukPairs > 0) {
    return true;
  }
  if (ukPairs > 0 && usPairs === 0 && ukPairs < BRITISH_DISTINCT_PAIR_FLOOR) {
    return true;
  }
  return false;
}

module.exports = {
  loadEnglishVarietyPairs,
  varietyMismatch,
  runningProseForVariety,
};

/**
 * Reads `--file <path>` from argv.
 *
 * Throws a usage error when the flag or path is absent so the CLI can exit
 * without scanning. This CLI reports; it does not rewrite.
 */
function parseFileArgument(argv) {
  const fileIndex = argv.indexOf('--file');
  if (fileIndex === -1 || !argv[fileIndex + 1]) {
    throw new Error('Usage: node tests/englishVariety.cjs --file <path>');
  }
  return argv[fileIndex + 1];
}

if (require.main === module) {
  try {
    const filePath = parseFileArgument(process.argv);
    const content = fs.readFileSync(path.resolve(filePath), 'utf8');
    const pairs = loadEnglishVarietyPairs();
    const mismatch = varietyMismatch(content, pairs);
    process.stdout.write(mismatch ? 'mismatch\n' : 'consistent\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
