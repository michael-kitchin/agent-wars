'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Mechanical tests for the no-ai-slop skill.
 *
 * Parses the canonical Patterns fence, translates Rust/ripgrep syntax into JavaScript
 * RegExp, and checks fixtures in cases.json. Heading-tree and title-case live in
 * houseStyle.cjs; em-dash rewrite lives in emDashRewrite.cjs; missing contractions
 * live in contractions.cjs. US/UK variety mismatch lives in englishVariety.cjs.
 * Paths are resolved from this file via __dirname, so the working directory and host
 * project do not matter.
 * The runner never writes SKILL.md or fixtures. No packages beyond Node's fs and path.
 */

const TESTS_DIR = __dirname;
const SKILL_DIR = path.join(TESTS_DIR, '..');
const CASES_PATH = path.join(TESTS_DIR, 'cases.json');

const {
  promoteHeadingTree,
  closeHeadingSkips,
  applyHeadingHouseStyle,
  toTitleCase,
} = require('./houseStyle.cjs');
const { rewriteEmDashes } = require('./emDashRewrite.cjs');
const {
  loadContractionRows,
  missingContractionHitsAfterGuards,
  rewriteMissingContractions,
} = require('./contractions.cjs');
const {
  loadEnglishVarietyPairs,
  varietyMismatch,
} = require('./englishVariety.cjs');
const { applyFileFix } = require('../scripts/applyFileFix.cjs');

/**
 * Finds the markdown file that holds the canonical Patterns fence.
 *
 * Prefers references/mechanicalSigns.md when that file exists and contains a fenced
 * text block after a Patterns heading, so a split of SKILL.md does not break the
 * suite. Throws if neither candidate has a parseable block.
 */
function resolvePatternSourcePath() {
  const mechanical = path.join(SKILL_DIR, 'references', 'mechanicalSigns.md');
  const skill = path.join(SKILL_DIR, 'SKILL.md');
  if (fs.existsSync(mechanical) && extractPatternFence(fs.readFileSync(mechanical, 'utf8'))) {
    return mechanical;
  }
  if (fs.existsSync(skill) && extractPatternFence(fs.readFileSync(skill, 'utf8'))) {
    return skill;
  }
  throw new Error('No Patterns fenced text block found in SKILL.md or references/mechanicalSigns.md');
}

/**
 * Returns the inner text of the first ```text fence after a Patterns heading, or null.
 *
 * Used both to locate the canonical file and to parse slugs. A missing fence is not an
 * empty catalog; it is a broken skill document.
 */
function extractPatternFence(markdown) {
  const heading = /(^|\n)#{2,6} Patterns\s*\r?\n/;
  const headingMatch = heading.exec(markdown);
  if (!headingMatch) {
    return null;
  }
  const after = markdown.slice(headingMatch.index);
  const fence = /```text\r?\n([\s\S]*?)```/;
  const fenceMatch = fence.exec(after);
  return fenceMatch ? fenceMatch[1] : null;
}

/**
 * Parses the Patterns fence into slug, ripgrep flags, and Rust source.
 *
 * Each non-empty line is `slug`, optional `-i`/`-U`, then the rest of the line as the
 * regex. Throws on a line that has a slug but no pattern, because that would silently
 * drop a sign.
 */
function parsePatternBlock(markdown) {
  const fence = extractPatternFence(markdown);
  if (!fence) {
    throw new Error('Patterns fence is missing or empty');
  }
  const patterns = [];
  fence.split(/\r?\n/).forEach((line) => {
    if (!line.trim()) {
      return;
    }
    const tokens = line.trim().split(/\s+/);
    const slug = tokens[0];
    let index = 1;
    const flags = [];
    while (index < tokens.length && /^-[iU]+$/.test(tokens[index])) {
      flags.push(tokens[index]);
      index += 1;
    }
    const rustSource = tokens.slice(index).join(' ');
    if (!rustSource) {
      throw new Error(`Pattern line for ${slug} has no regex`);
    }
    patterns.push({ slug, flags: flags.join(' '), rustSource });
  });
  return patterns;
}

/**
 * Translates one Rust/ripgrep pattern into a JavaScript RegExp source and flags.
 *
 * `(?i)` and `(?m)` become JS flags `i` and `m`. `\x{HHHH}` becomes `\uHHHH` for BMP
 * points and `\u{HHHHH}` (with flag `u`) for supplementary-plane points. `-i` and `-U`
 * from the Patterns line add `i` and `m` as well. Throws if the result does not compile,
 * which is how a bad catalog line is caught.
 */
function toJavaScriptRegex(rustSource, flags) {
  let source = rustSource;
  let jsFlags = '';
  if (/\(\?i\)/.test(source) || /(^|\s)-i/.test(` ${flags}`)) {
    jsFlags += 'i';
  }
  if (/\(\?m\)/.test(source) || String(flags).includes('U')) {
    jsFlags += 'm';
  }
  source = source.replace(/\(\?i\)/g, '').replace(/\(\?m\)/g, '');
  let needsUnicode = false;
  source = source.replace(/\\x\{([0-9A-Fa-f]+)\}/g, (_, hex) => {
    if (hex.length > 4) {
      needsUnicode = true;
      return `\\u{${hex}}`;
    }
    return `\\u${hex.padStart(4, '0')}`;
  });
  if (needsUnicode && !jsFlags.includes('u')) {
    jsFlags += 'u';
  }
  jsFlags = uniqueFlags(jsFlags);
  try {
    // eslint-disable-next-line no-new
    new RegExp(source, jsFlags);
  } catch (error) {
    throw new Error(`Invalid JS regex from ${rustSource}: ${error.message}`);
  }
  return { source, jsFlags };
}

/**
 * Deduplicates flag characters while preserving order.
 *
 * `immu` would be rejected by JavaScript; callers may add the same flag from both the
 * inline modifier and the Patterns `-i` column.
 */
function uniqueFlags(jsFlags) {
  let result = '';
  for (const character of jsFlags) {
    if (!result.includes(character)) {
      result += character;
    }
  }
  return result;
}

/**
 * Compiles the catalog pattern for a slug, or throws if the slug is absent.
 *
 * Used by fixture cases so a typo in cases.json fails the suite instead of reporting a
 * silent miss.
 */
function compileCatalogPattern(patterns, slug) {
  const entry = patterns.find((item) => item.slug === slug);
  if (!entry) {
    throw new Error(`Unknown pattern slug: ${slug}`);
  }
  const translated = toJavaScriptRegex(entry.rustSource, entry.flags);
  return new RegExp(translated.source, translated.jsFlags);
}

/**
 * Returns the authorship verdict band from detector counts only.
 *
 * House-style findings are ignored. Pass them in `houseStyle` to prove they cannot
 * change the band. Used so overlay volume cannot flip "No signs found" or "Some
 * indication" into a stronger verdict.
 */
function authorshipVerdict(counts) {
  const definitive = counts.definitive || 0;
  const strong = counts.strong || 0;
  const corroborating = counts.corroborating || 0;
  if (definitive > 0) {
    return 'AI tooling confirmed in this text';
  }
  if (strong >= 3) {
    return 'Strong indication';
  }
  if (strong >= 1) {
    return 'Some indication';
  }
  if (corroborating > 0) {
    return 'Inconclusive; not evidence of AI authorship on its own';
  }
  return 'No signs found';
}

/**
 * Strips regions the metaphor sign must ignore, then returns remaining matches.
 *
 * Drops YAML front matter, fenced and inline code, IMAGE/DATA placeholder lines,
 * `thread:` keys, literal geometry (`shape of the map/icon`), programming `thread(s)`,
 * and garment `seam` when it is a physical join. Remaining hole/seam/thread/shape hits
 * are the house-style findings.
 */
function metaphorHitsAfterGuards(content) {
  let working = stripYamlFrontMatter(content);
  working = working.replace(/```[\s\S]*?```/g, ' ');
  working = working.replace(/`[^`]*`/g, ' ');
  const kept = working
    .split(/\r?\n/)
    .filter((line) => {
      if (/^\s*>?\s*\*\*\[(IMAGE|DATA):/.test(line)) {
        return false;
      }
      if (/^thread:/i.test(line.trim())) {
        return false;
      }
      if (/^\s*[-*+]\s+.+\s*->\s+/.test(line)) {
        return false;
      }
      return true;
    })
    .join('\n');
  const pattern = /\b(holes?|seams?|threads?|shapes?|shaped|shaping)\b/gi;
  const hits = [];
  let match = pattern.exec(kept);
  while (match) {
    const window = kept.slice(Math.max(0, match.index - 40), match.index + match[0].length + 40);
    if (isLiteralMetaphor(match[0], window)) {
      match = pattern.exec(kept);
      continue;
    }
    hits.push(match[0]);
    match = pattern.exec(kept);
  }
  return hits;
}

/**
 * Returns true when a metaphor-list word is a literal object in this window.
 *
 * Geometry (`shape of the map/icon`), OS/worker/Node threads, and garment seams are
 * exempt. Series-framing `thread` and structural `seam`/`shape`/`hole` are not.
 */
function isLiteralMetaphor(word, window) {
  const lower = word.toLowerCase();
  const around = window.toLowerCase();
  if (lower.startsWith('shape') && /shape of the (map|icon|graphical icon)/i.test(around)) {
    return true;
  }
  if (lower.startsWith('thread') && /\b(os|worker|node|cpu|background)\s+threads?\b/i.test(around)) {
    return true;
  }
  if (lower.startsWith('seam') && /\b(sewing|garment|fabric|stitched)\b/i.test(around)) {
    return true;
  }
  return false;
}

/**
 * Removes a leading YAML document from markdown when both fences are present.
 *
 * Used by metaphor guards so `thread: Synthesis` in front matter is not a finding.
 */
function stripYamlFrontMatter(content) {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return match ? content.slice(match[0].length) : content;
}

/**
 * Loads cases.json, runs each case, and returns pass/fail counts.
 *
 * Fixture cases compile a catalog slug against a file. Translation cases compile an
 * inline Rust snippet. Heading, title-case, metaphor-guard, english-variety, and
 * verdict cases call the helpers. Throws only for a broken catalog; individual case
 * failures accumulate.
 */
function runCases(casesPath) {
  const markdown = fs.readFileSync(resolvePatternSourcePath(), 'utf8');
  const patterns = parsePatternBlock(markdown);
  patterns.forEach((entry) => {
    toJavaScriptRegex(entry.rustSource, entry.flags);
  });
  const catalog = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  const failed = [];
  let passed = 0;
  catalog.cases.forEach((testCase) => {
    try {
      runOneCase(testCase, patterns);
      passed += 1;
    } catch (error) {
      failed.push({ id: testCase.id, message: error.message });
    }
  });
  return { passed, failed };
}

/**
 * Case kinds the runner understands.
 *
 * A typo in cases.json must fail loudly instead of being treated as a skipped
 * fixture. Keep this list in sync with the branches in runOneCase.
 */
const CASE_KINDS = [
  'fixture',
  'translation',
  'heading-rewrite',
  'title-case',
  'metaphor-guard',
  'english-variety',
  'verdict',
  'em-dash-rewrite',
  'apply-file',
  'apply-file-error',
  'missing-contraction-sync',
  'missing-contraction-guard',
  'missing-contraction-rewrite',
];

/**
 * Runs a single cases.json entry against the compiled catalog and helpers.
 *
 * Unknown `kind` values fail loudly so a typo cannot pass as a skipped test.
 * `apply-file-error` checks the missing-path contract without writing a file.
 */
function runOneCase(testCase, patterns) {
  const kind = testCase.kind || 'fixture';
  if (!CASE_KINDS.includes(kind)) {
    throw new Error(`Unknown case kind: ${kind}`);
  }
  if (kind === 'missing-contraction-sync') {
    const rows = loadContractionRows();
    const regex = compileCatalogPattern(patterns, 'missing-contraction');
    rows.forEach((row) => {
      if (!regex.test(row.expanded)) {
        throw new Error(`catalog missed ${JSON.stringify(row.expanded)}`);
      }
    });
    (testCase.mustNotMatch || []).forEach((sample) => {
      if (regex.test(sample)) {
        throw new Error(`catalog matched excluded ${JSON.stringify(sample)}`);
      }
    });
    return;
  }
  if (kind === 'missing-contraction-guard') {
    const content = fs.readFileSync(path.join(TESTS_DIR, 'fixtures', testCase.fixture), 'utf8');
    const hits = missingContractionHitsAfterGuards(content);
    if (testCase.expectHits === 0 && hits.length !== 0) {
      throw new Error(`expected no contraction hits, got ${JSON.stringify(hits)}`);
    }
    if (testCase.expectHits > 0 && hits.length !== testCase.expectHits) {
      throw new Error(`expected ${testCase.expectHits} contraction hits, got ${hits.length}: ${JSON.stringify(hits)}`);
    }
    return;
  }
  if (kind === 'missing-contraction-rewrite') {
    const actual = rewriteMissingContractions(testCase.input);
    if (actual !== testCase.expect) {
      throw new Error(`contraction rewrite: expected ${JSON.stringify(testCase.expect)}, got ${JSON.stringify(actual)}`);
    }
    return;
  }
  if (kind === 'apply-file-error') {
    try {
      applyFileFix('');
    } catch (error) {
      if (!/requires a file path/.test(error.message)) {
        throw new Error(`expected a missing-path error, got ${JSON.stringify(error.message)}`);
      }
      return;
    }
    throw new Error('applyFileFix("") should throw');
  }
  if (kind === 'translation') {
    const translated = toJavaScriptRegex(testCase.rustSource, testCase.flags || '');
    const regex = new RegExp(translated.source, translated.jsFlags);
    if (!regex.test(testCase.mustMatch)) {
      throw new Error(`translated /${translated.source}/ did not match ${JSON.stringify(testCase.mustMatch)}`);
    }
    return;
  }
  if (kind === 'apply-file') {
    const original = path.join(TESTS_DIR, 'fixtures', testCase.fixture);
    const expected = fs.readFileSync(path.join(TESTS_DIR, 'fixtures', testCase.expectFixture), 'utf8');
    const temp = path.join(os.tmpdir(), `no-ai-slop-apply-${process.pid}.md`);
    fs.copyFileSync(original, temp);
    try {
      applyFileFix(temp);
      const actual = fs.readFileSync(temp, 'utf8');
      if (actual !== expected) {
        throw new Error(`apply-file mismatch\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
      }
    } finally {
      fs.unlinkSync(temp);
    }
    return;
  }
  if (kind === 'em-dash-rewrite') {
    const original = fs.readFileSync(path.join(TESTS_DIR, 'fixtures', testCase.fixture), 'utf8');
    const rewritten = rewriteEmDashes(original);
    const expected = fs.readFileSync(path.join(TESTS_DIR, 'fixtures', testCase.expectFixture), 'utf8');
    if (rewritten !== expected) {
      throw new Error(`em-dash rewrite mismatch\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(rewritten)}`);
    }
    return;
  }
  if (kind === 'heading-rewrite') {
    const original = fs.readFileSync(path.join(TESTS_DIR, 'fixtures', testCase.fixture), 'utf8');
    const lines = original.split(/\r?\n/);
    const rewritten = applyHeadingHouseStyle(lines);
    const expected = fs.readFileSync(path.join(TESTS_DIR, 'fixtures', testCase.expectFixture), 'utf8').split(/\r?\n/);
    if (rewritten.join('\n') !== expected.join('\n')) {
      throw new Error(`heading rewrite mismatch\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(rewritten)}`);
    }
    return;
  }
  if (kind === 'verdict') {
    const actual = authorshipVerdict(testCase.counts);
    if (actual !== testCase.expect) {
      throw new Error(`verdict: expected ${JSON.stringify(testCase.expect)}, got ${JSON.stringify(actual)}`);
    }
    return;
  }
  if (kind === 'title-case') {
    const actual = toTitleCase(testCase.input);
    if (actual !== testCase.expect) {
      throw new Error(`title case: expected ${JSON.stringify(testCase.expect)}, got ${JSON.stringify(actual)}`);
    }
    return;
  }
  if (kind === 'metaphor-guard') {
    const content = fs.readFileSync(path.join(TESTS_DIR, 'fixtures', testCase.fixture), 'utf8');
    const hits = metaphorHitsAfterGuards(content);
    if (testCase.expectHits === 0 && hits.length !== 0) {
      throw new Error(`expected no metaphor hits, got ${JSON.stringify(hits)}`);
    }
    if (testCase.expectHits > 0 && hits.length < testCase.expectHits) {
      throw new Error(`expected at least ${testCase.expectHits} metaphor hits, got ${hits.length}`);
    }
    return;
  }
  if (kind === 'english-variety') {
    const content = fs.readFileSync(path.join(TESTS_DIR, 'fixtures', testCase.fixture), 'utf8');
    const pairs = loadEnglishVarietyPairs();
    const mismatch = varietyMismatch(content, pairs);
    if (Boolean(testCase.expectMismatch) !== mismatch) {
      throw new Error(`english variety expectMismatch=${testCase.expectMismatch} but mismatch=${mismatch}`);
    }
    return;
  }
  const fixturePath = path.join(TESTS_DIR, 'fixtures', testCase.fixture);
  const content = fs.readFileSync(fixturePath, 'utf8');
  const regex = compileCatalogPattern(patterns, testCase.slug);
  const matched = regex.test(content);
  if (Boolean(testCase.expectMatch) !== matched) {
    throw new Error(`slug ${testCase.slug} expectMatch=${testCase.expectMatch} but matched=${matched}`);
  }
}

function main() {
  const result = runCases(CASES_PATH);
  result.failed.forEach((item) => {
    process.stderr.write(`FAIL ${item.id}: ${item.message}\n`);
  });
  process.stdout.write(`no-ai-slop tests: ${result.passed} passed, ${result.failed.length} failed\n`);
  process.exitCode = result.failed.length === 0 ? 0 : 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  parsePatternBlock,
  toJavaScriptRegex,
  runCases,
  promoteHeadingTree,
  closeHeadingSkips,
  applyHeadingHouseStyle,
  authorshipVerdict,
  toTitleCase,
  rewriteEmDashes,
  metaphorHitsAfterGuards,
};
