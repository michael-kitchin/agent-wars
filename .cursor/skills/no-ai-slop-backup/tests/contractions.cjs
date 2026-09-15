'use strict';

const fs = require('fs');
const path = require('path');
const {
  bindingAllowsContraction,
  isClauseInitial,
  nextWordOnSameLine,
  sameLineEnd,
} = require('./contractionBinding.cjs');

/**
 * Missing-contraction house style: parse the pair table, detect expanded forms
 * after Guards, and rewrite them. applyFileFix.cjs must not require this file.
 * Run `node tests/contractions.cjs --file <path>` after copula rewrites.
 * Phrase-boundary skips live in contractionBinding.cjs so locative `here is`
 * and object-pronoun copulas stay expanded.
 */

/**
 * Skill root, one level above this test helper.
 *
 * Pair-table paths and CLI writes resolve from here so the working directory
 * does not matter.
 */
const SKILL_DIR = path.join(__dirname, '..');
/**
 * Path of the canonical pair table.
 *
 * Resolved from this file so the working directory does not matter. Tests and
 * the CLI both read this path; applyFileFix.cjs must not.
 */
const PAIRS_PATH = path.join(SKILL_DIR, 'references', 'contractions.md');

/**
 * Next-word tokens that mean have/has/had is an auxiliary, so contraction is safe.
 *
 * `set` is omitted on purpose: `I had set` is noun-or-participle and must stay
 * expanded. `-ed` tokens are handled separately.
 */
const AUX_PARTICIPLES = new Set([
  'been', 'got', 'gotten', 'done', 'gone', 'seen', 'known', 'given', 'taken',
  'made', 'come', 'become', 'found', 'left', 'written', 'said', 'told',
  'thought', 'felt', 'heard', 'met', 'run', 'eaten', 'spoken', 'broken',
  'chosen', 'driven', 'forgotten', 'fallen', 'grown', 'proven', 'proved',
  'shown', 'lost', 'won', 'paid', 'built', 'kept', 'held', 'put', 'cut',
  'hit', 'read',
]);

/**
 * Next-word tokens that mean have/has/had is a main verb or have-to.
 *
 * Includes `that` so `I have that` is not treated as an auxiliary.
 */
const MAIN_VERB_FOLLOWERS = new Set([
  'to', 'a', 'an', 'the', 'this', 'that', 'these', 'those', 'my', 'your',
  'his', 'her', 'its', 'our', 'their', 'some', 'any', 'no', 'each', 'every',
  'all', 'both', 'few', 'many', 'much', 'more', 'most', 'several',
]);

/**
 * Words after clause-initial `let us` that mean "permit us", not hortative let's.
 */
const LET_US_PATIENT = new Set(['know', 'in', 'out', 'through', 'alone', 'off', 'by']);

/**
 * Guard names the pair table may use.
 *
 * A row with any other name throws at parse time so a typo cannot skip a pair.
 */
const ALLOWED_GUARDS = new Set(['none', 'aux-have', 'aux-had', 'hortative', 'not-refrain']);

/**
 * Returns the pair rows from references/contractions.md.
 *
 * Used by detection, rewrite, and the catalog-sync test so SKILL.md is not the
 * source of truth for individual pairs. Throws if the Pairs fence is missing or a
 * row has an unknown guard, because a silent empty table would skip every fix.
 */
function loadContractionRows() {
  const markdown = fs.readFileSync(PAIRS_PATH, 'utf8');
  return parseContractionRows(markdown);
}

/**
 * Parses the Pairs ```text fence into expanded/contracted/guard objects.
 *
 * Each non-empty line is `expanded | contracted | guard`. Duplicate expanded
 * forms throw so a typo cannot hide a second mapping. Throws on a malformed
 * line so a typo cannot pass as a skipped pair.
 */
function parseContractionRows(markdown) {
  const fence = extractPairsFence(markdown);
  if (!fence) {
    throw new Error('Contractions Pairs fence is missing or empty');
  }
  const rows = [];
  const seen = new Set();
  fence.split(/\r?\n/).forEach((line) => {
    if (!line.trim()) {
      return;
    }
    const parts = line.split('|').map((part) => part.trim());
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
      throw new Error(`Contraction row must be expanded | contracted | guard: ${JSON.stringify(line)}`);
    }
    const expanded = parts[0];
    const contracted = parts[1];
    const guard = parts[2];
    if (!ALLOWED_GUARDS.has(guard)) {
      throw new Error(`Unknown contraction guard ${JSON.stringify(guard)} on ${JSON.stringify(expanded)}`);
    }
    if (/[\u2018\u2019]/.test(contracted)) {
      throw new Error(`Contraction must use ASCII apostrophe: ${JSON.stringify(contracted)}`);
    }
    const key = expanded.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`Duplicate expanded form ${JSON.stringify(expanded)}`);
    }
    seen.add(key);
    rows.push({ expanded, contracted, guard });
  });
  if (!rows.length) {
    throw new Error('Contractions Pairs fence has no rows');
  }
  return rows;
}

/**
 * Returns the inner text of the first ```text fence after a Pairs heading, or null.
 *
 * A missing fence is a broken reference file, not an empty inventory.
 */
function extractPairsFence(markdown) {
  const heading = /(^|\n)#{2,6} Pairs\s*\r?\n/;
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
 * Returns true when the pair is a negation (`cannot` or a form ending in ` not`).
 *
 * Negation rows occupy first so `are not` wins over `they are` in `they are not`.
 */
function isNegationRow(row) {
  const expanded = row.expanded.toLowerCase();
  return expanded === 'cannot' || expanded.endsWith(' not');
}

/**
 * Returns rows ordered for overlap: negations first, then longer expanded form.
 *
 * `are not` before `they are` is why `They are not` becomes `They aren't`.
 * Among the same class, longest-first is why `will not` wins over `I will`.
 */
function sortRowsForMatch(rows) {
  return rows.slice().sort((left, right) => {
    const leftNegation = isNegationRow(left) ? 0 : 1;
    const rightNegation = isNegationRow(right) ? 0 : 1;
    if (leftNegation !== rightNegation) {
      return leftNegation - rightNegation;
    }
    const lengthDelta = right.expanded.length - left.expanded.length;
    if (lengthDelta !== 0) {
      return lengthDelta;
    }
    return left.expanded.localeCompare(right.expanded);
  });
}

/**
 * Returns a boolean mask of characters the contraction sign must ignore.
 *
 * True means YAML, fenced code, HTML comments, inline code, IMAGE/DATA
 * placeholder lines, or mapping-only list items. Detection and rewrite share
 * this mask.
 */
function maskProtectedRegions(content) {
  const skip = new Array(content.length).fill(false);
  maskRange(skip, yamlFrontMatterRange(content));
  maskFencedCode(content, skip);
  maskHtmlComments(content, skip);
  maskInlineCode(content, skip);
  maskMatchingLines(content, skip, /^\s*>?\s*\*\*\[(IMAGE|DATA):/);
  maskMatchingLines(content, skip, /^\s*[-*+]\s+.+\s*->\s+/);
  return skip;
}

/**
 * Returns [start, end) of a leading YAML block, or null when there is no closer.
 *
 * Missing closer means there is no front matter, matching heading-tree YAML rules.
 */
function yamlFrontMatterRange(content) {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return match ? [0, match[0].length] : null;
}

/**
 * Returns '`' or '~' when the line is a CommonMark fence delimiter, else null.
 *
 * Opening and closing fences must use the same character. A `~~~` line inside a
 * backtick fence is content, not a closer. Length of the run is not checked
 * beyond the three-character minimum, matching houseStyle.cjs.
 */
function fenceDelimiterChar(line) {
  const match = /^ {0,3}([`~])\1{2,}/.exec(line);
  return match ? match[1] : null;
}

/**
 * Marks CommonMark fenced blocks (backtick or tilde), including an unclosed fence.
 *
 * Closing a fence requires the same character that opened it so nested sample
 * fences are not treated as closers. Fence lines themselves are also skipped.
 */
function maskFencedCode(content, skip) {
  let start = 0;
  let fenceChar = null;
  while (start <= content.length) {
    const newlineAt = content.indexOf('\n', start);
    const lineEnd = newlineAt === -1 ? content.length : newlineAt;
    const raw = content.slice(start, lineEnd);
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const delimiter = fenceDelimiterChar(line);
    if (fenceChar === null && delimiter) {
      maskRange(skip, [start, lineEnd]);
      fenceChar = delimiter;
    } else if (fenceChar !== null && delimiter === fenceChar) {
      maskRange(skip, [start, lineEnd]);
      fenceChar = null;
    } else if (fenceChar !== null) {
      maskRange(skip, [start, lineEnd]);
    }
    if (newlineAt === -1) {
      return;
    }
    start = newlineAt + 1;
  }
}

/**
 * Marks HTML comments, including an unclosed comment through end of file.
 *
 * Em-dash rewrite already leaves comments alone. Contractions must not rewrite
 * `it is` inside `<!-- ... -->` either.
 */
function maskHtmlComments(content, skip) {
  let searchFrom = 0;
  while (searchFrom < content.length) {
    const open = content.indexOf('<!--', searchFrom);
    if (open === -1) {
      return;
    }
    const close = content.indexOf('-->', open + 4);
    const end = close === -1 ? content.length : close + 3;
    maskRange(skip, [open, end]);
    searchFrom = end;
  }
}

/**
 * Marks inline `code` spans that are not already inside a fenced skip range.
 *
 * Unclosed backticks leave the remainder unmasked so a stray tick cannot hide
 * the rest of the document.
 */
function maskInlineCode(content, skip) {
  let index = 0;
  while (index < content.length) {
    if (skip[index] || content[index] !== '`') {
      index += 1;
      continue;
    }
    const close = content.indexOf('`', index + 1);
    if (close === -1) {
      return;
    }
    maskRange(skip, [index, close + 1]);
    index = close + 1;
  }
}

/**
 * Marks whole lines (not the trailing newline) that match a skip pattern.
 */
function maskMatchingLines(content, skip, pattern) {
  let start = 0;
  while (start <= content.length) {
    const newlineAt = content.indexOf('\n', start);
    const lineEnd = newlineAt === -1 ? content.length : newlineAt;
    const raw = content.slice(start, lineEnd);
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (pattern.test(line)) {
      maskRange(skip, [start, lineEnd]);
    }
    if (newlineAt === -1) {
      return;
    }
    start = newlineAt + 1;
  }
}

/**
 * Sets skip[start..end) to true. Ignores a null range.
 */
function maskRange(skip, range) {
  if (!range) {
    return;
  }
  const end = Math.min(range[1], skip.length);
  for (let index = range[0]; index < end; index += 1) {
    skip[index] = true;
  }
}

/**
 * Returns true when every index in [start, start+length) is unprotected.
 */
function rangeIsClear(skip, start, length) {
  for (let index = start; index < start + length; index += 1) {
    if (skip[index]) {
      return false;
    }
  }
  return true;
}

/**
 * Escapes a literal expanded form for use inside a RegExp.
 */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Finds contraction spans that survive Guards, negations then longest-first.
 *
 * Occupied characters are skipped so `are not` wins over `they are` in
 * `they are not`, and `will not` wins over `I will` in `I will not`. Masked
 * regions and failed guards do not occupy, so a shorter pair can still match
 * the leftover text. Same-line matches only.
 */
function findContractionMatches(content) {
  const rows = sortRowsForMatch(loadContractionRows());
  const skip = maskProtectedRegions(content);
  const occupied = new Array(content.length).fill(false);
  const matches = [];
  rows.forEach((row) => {
    const pattern = new RegExp(`\\b${escapeRegex(row.expanded)}\\b`, 'gi');
    let found = pattern.exec(content);
    while (found) {
      const start = found.index;
      const text = found[0];
      if (spanCrossesNewline(text) || !rangeIsClear(skip, start, text.length) || rangeOccupied(occupied, start, text.length)) {
        found = pattern.exec(content);
        continue;
      }
      if (!passesGuard(row, content, start, text)) {
        found = pattern.exec(content);
        continue;
      }
      markOccupied(occupied, start, text.length);
      matches.push({ start, end: start + text.length, text, row });
      found = pattern.exec(content);
    }
  });
  matches.sort((left, right) => left.start - right.start);
  return matches;
}

/**
 * Returns true when a match contains a CR or LF, which the table forbids.
 */
function spanCrossesNewline(text) {
  return text.includes('\n') || text.includes('\r');
}

/**
 * Returns true when any character in the span is already claimed by a longer pair.
 */
function rangeOccupied(occupied, start, length) {
  for (let index = start; index < start + length; index += 1) {
    if (occupied[index]) {
      return true;
    }
  }
  return false;
}

/**
 * Marks a span as claimed by a longer contraction pair.
 */
function markOccupied(occupied, start, length) {
  for (let index = start; index < start + length; index += 1) {
    occupied[index] = true;
  }
}

/**
 * Returns true when this row's guard allows rewriting the span at offset.
 *
 * Phrase-boundary checks run first. `none` then passes. Failed aux/hortative/
 * refrain checks leave the span expanded. Does not throw; an unknown guard was
 * already rejected at parse.
 */
function passesGuard(row, content, offset, matched) {
  if (!bindingAllowsContraction(content, offset, matched)) {
    return false;
  }
  if (row.guard === 'none') {
    return true;
  }
  if (row.guard === 'aux-have' || row.guard === 'aux-had') {
    return isAuxiliaryHave(content, offset + matched.length);
  }
  if (row.guard === 'hortative') {
    return isHortativeLetUs(content, offset, matched);
  }
  if (row.guard === 'not-refrain') {
    return !isRefrainCanNot(content, offset + matched.length);
  }
  return false;
}

/**
 * Returns true when the next same-line word is an auxiliary complement.
 *
 * Determiners, `to`, numerals, end of clause, and anything not in the participle
 * list or `-ed` stay expanded. `set` is not in the yes-list.
 */
function isAuxiliaryHave(content, afterOffset) {
  const next = nextWordOnSameLine(content, afterOffset);
  if (!next) {
    return false;
  }
  const lower = next.toLowerCase();
  if (MAIN_VERB_FOLLOWERS.has(lower) || /^\d+$/.test(next)) {
    return false;
  }
  if (AUX_PARTICIPLES.has(lower) || /^[A-Za-z]+ed$/.test(next)) {
    return true;
  }
  return false;
}

/**
 * Returns true when `let us` is a clause-initial hortative, not "permit us".
 *
 * Requires a preceding clause boundary, no please/kindly, no subject pronoun
 * immediately before `let`, and a next word that is not a patient particle.
 * Clause and next-word checks come from contractionBinding.cjs.
 */
function isHortativeLetUs(content, offset, matched) {
  if (/\b(please|kindly)[,\s]+$/i.test(content.slice(Math.max(0, offset - 16), offset))) {
    return false;
  }
  if (/\b(they|he|she|we|you|I)\s+$/i.test(content.slice(Math.max(0, offset - 8), offset))) {
    return false;
  }
  if (!isClauseInitial(content, offset)) {
    return false;
  }
  const next = nextWordOnSameLine(content, offset + matched.length);
  if (!next) {
    return false;
  }
  return !LET_US_PATIENT.has(next.toLowerCase());
}

/**
 * Returns true when two-word `can not` means "allowed to refrain".
 *
 * Inability `can not` and one-word `cannot` still contract. Cue is a nearby
 * `if you/they want|prefer|choose|wish`.
 */
function isRefrainCanNot(content, afterOffset) {
  const window = content.slice(afterOffset, afterOffset + 80);
  return /\bif (you|they)\b[\s\S]{0,40}\b(want|prefer|choose|wish|like)\b/i.test(window);
}

/**
 * Applies the contraction's capitalization to a matched expanded span.
 *
 * All-caps spans become all-caps (`DO NOT` -> `DON'T`). Otherwise the first
 * character's case is preserved (`It is` -> `It's`, `we are` -> `we're`).
 */
function applyContractionCaps(matched, contracted) {
  if (/[A-Z]/.test(matched) && matched === matched.toUpperCase()) {
    return contracted.toUpperCase();
  }
  if (matched.charAt(0) !== matched.charAt(0).toLowerCase()) {
    return contracted.charAt(0).toUpperCase() + contracted.slice(1);
  }
  return contracted;
}

/**
 * Returns expanded forms that survive Guards, for audit listings and tests.
 *
 * House-style only. Callers must not feed this count into the authorship verdict.
 */
function missingContractionHitsAfterGuards(content) {
  return findContractionMatches(content).map((item) => item.text);
}

/**
 * Rewrites surviving expanded forms using the pair table.
 *
 * Replaces from the end of the string so earlier offsets stay valid. Masked
 * regions are unchanged. Returns a new string; does not write a file.
 */
function rewriteMissingContractions(content) {
  const matches = findContractionMatches(content);
  let result = content;
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const item = matches[index];
    const replacement = applyContractionCaps(item.text, item.row.contracted);
    result = result.slice(0, item.start) + replacement + result.slice(item.end);
  }
  return result;
}

/**
 * Rewrites missing contractions in one file in place.
 *
 * Use this after copula edits. Throws if `filePath` is missing or the file
 * cannot be read. Preserves UTF-8. Does not change headings or em dashes.
 */
function rewriteContractionsFile(filePath) {
  if (!filePath) {
    throw new Error('rewriteContractionsFile requires a file path');
  }
  const resolved = path.resolve(filePath);
  const original = fs.readFileSync(resolved, 'utf8');
  const rewritten = rewriteMissingContractions(original);
  fs.writeFileSync(resolved, rewritten, 'utf8');
}

/**
 * Reads `--file <path>` from argv.
 *
 * Throws a usage error when the flag or path is absent so the CLI can exit
 * without writing anything.
 */
function parseFileArgument(argv) {
  const fileIndex = argv.indexOf('--file');
  if (fileIndex === -1 || !argv[fileIndex + 1]) {
    throw new Error('Usage: node tests/contractions.cjs --file <path>');
  }
  return argv[fileIndex + 1];
}

if (require.main === module) {
  try {
    rewriteContractionsFile(parseFileArgument(process.argv));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  loadContractionRows,
  parseContractionRows,
  missingContractionHitsAfterGuards,
  rewriteMissingContractions,
  rewriteContractionsFile,
};
