'use strict';

/**
 * Heading-tree and title-case helpers for the no-ai-slop skill.
 *
 * These functions are the executable counterpart of the house-style algorithms in
 * SKILL.md. The test runner and applyFileFix.cjs both call them so a heading rewrite
 * in `--file` fix matches the suite. They do not read or write files.
 */

/**
 * Small words that stay lowercase in title case unless first or last of a fragment.
 *
 * Includes `with` and `from`. Keep this list aligned with the set in SKILL.md.
 */
const TITLE_CASE_SMALL_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'nor',
  'as',
  'but',
  'for',
  'to',
  'at',
  'by',
  'in',
  'of',
  'on',
  'per',
  'via',
  'vs',
  'with',
  'from',
]);

/**
 * Returns the end index (exclusive) of a leading YAML front-matter block, or 0.
 *
 * The first line must be `---`. A second `---` closes it. Missing closer means there is
 * no front matter, so headings are counted from the start of the file.
 */
function yamlFrontMatterEnd(lines) {
  if (!lines.length || lines[0].trim() !== '---') {
    return 0;
  }
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '---') {
      return index + 1;
    }
  }
  return 0;
}

/**
 * Collects ATX headings (`#` through `######`) after optional YAML.
 *
 * Setext headings are out of scope. Lines inside fenced code (` ``` ` or `~~~`)
 * are ignored so sample markdown is not promoted or title-cased.
 */
function collectAtxHeadings(lines) {
  const start = yamlFrontMatterEnd(lines);
  const headings = [];
  const pattern = /^(#{1,6}) (.*?)\r?$/;
  let inFence = false;
  for (let index = start; index < lines.length; index += 1) {
    if (isFenceDelimiter(lines[index])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    const match = pattern.exec(lines[index]);
    if (match) {
      headings.push({ index, hashes: match[1], text: match[2], level: match[1].length });
    }
  }
  return headings;
}

/**
 * Returns true when a line opens or closes a CommonMark fenced code block.
 *
 * Used so heading collection can skip sample markdown. A line with 0 to 3 leading
 * spaces and three or more backticks or tildes is a delimiter; other lines are not.
 */
function isFenceDelimiter(line) {
  return /^ {0,3}(?:`{3,}|~{3,})/.test(line);
}

/**
 * Shifts every ATX heading so the shallowest becomes level 1, preserving relative depth.
 *
 * YAML and fenced-code lines are left untouched. A document whose first heading is
 * already `#` is unchanged.
 * Returns a new line array.
 */
function promoteHeadingTree(lines) {
  const next = lines.slice();
  const headings = collectAtxHeadings(next);
  if (!headings.length) {
    return next;
  }
  const minLevel = Math.min(...headings.map((heading) => heading.level));
  if (minLevel === 1) {
    return next;
  }
  headings.forEach((heading) => {
    const newLevel = heading.level - minLevel + 1;
    next[heading.index] = `${'#'.repeat(newLevel)} ${heading.text}`;
  });
  return next;
}

/**
 * Closes skipped heading levels by reducing a heading that jumps more than one step.
 *
 * Walks headings in document order. A jump from H1 to H3 becomes H2. A proper H1/H2/H3
 * tree is unchanged. Must run after promoteHeadingTree so the first heading is already
 * level 1.
 */
function closeHeadingSkips(lines) {
  const next = lines.slice();
  const headings = collectAtxHeadings(next);
  let previousLevel = null;
  headings.forEach((heading) => {
    let level = heading.level;
    if (previousLevel !== null && level > previousLevel + 1) {
      level = previousLevel + 1;
      next[heading.index] = `${'#'.repeat(level)} ${heading.text}`;
    }
    previousLevel = level;
  });
  return next;
}

/**
 * Applies the house-style heading pipeline: promote, close skips, then title-case text.
 *
 * Heading-rewrite cases use this so tree fixes and title case stay one algorithm, matching
 * Step 7 order. YAML, fenced-code lines, and non-heading lines are left untouched.
 */
function applyHeadingHouseStyle(lines) {
  const tree = closeHeadingSkips(promoteHeadingTree(lines));
  const next = tree.slice();
  collectAtxHeadings(next).forEach((heading) => {
    next[heading.index] = `${'#'.repeat(heading.level)} ${toTitleCase(heading.text)}`;
  });
  return next;
}

/**
 * Title-cases heading text using the house-style word list.
 *
 * First and last words of each fragment are always capitalized. Hyphenated compounds are
 * title-cased on each side. Small words stay lowercase unless they are first or last of
 * their fragment. Existing inner capitals (`LLM`, `ASCII`) are preserved by capitalizing
 * only the first letter.
 */
function toTitleCase(headingText) {
  if (!headingText) {
    return headingText;
  }
  return headingText
    .split('`')
    .map((part, index) => (index % 2 === 1 ? part : titleCasePlain(part)))
    .join('`');
}

/**
 * Title-cases a heading fragment that is not inside inline code.
 *
 * Split on `: ` first so the word after a colon is first of a new fragment, then on
 * spaces. Small words stay lowercase unless they are first or last of that fragment.
 */
function titleCasePlain(fragment) {
  if (!fragment) {
    return fragment;
  }
  return fragment
    .split(': ')
    .map((piece) => titleCaseFragmentWords(piece))
    .join(': ');
}

/**
 * Title-cases the space-delimited words of one colon fragment.
 *
 * First and last words of this piece are always capitalized. Empty pieces (from a
 * trailing `: `) are returned unchanged.
 */
function titleCaseFragmentWords(piece) {
  if (!piece) {
    return piece;
  }
  const words = piece.split(/ /);
  return words
    .map((word, index) => titleCaseSpaceWord(word, index === 0 || index === words.length - 1))
    .join(' ');
}

/**
 * Title-cases one space-delimited token, including wrapping punctuation.
 *
 * Leading and trailing punctuation are stripped for the small-word lookup and
 * restored afterward. A leading `(` force-caps the inner word so parentheticals start
 * in title case. Tokens with no letter (`2.4.0`) are left unchanged.
 */
function titleCaseSpaceWord(word, isFirstOrLast) {
  const leadMatch = word.match(/^[^A-Za-z0-9]*/);
  const lead = leadMatch ? leadMatch[0] : '';
  const rest = word.slice(lead.length);
  const trailMatch = rest.match(/[^A-Za-z0-9]*$/);
  const trailing = trailMatch ? trailMatch[0] : '';
  const core = rest.slice(0, rest.length - trailing.length);
  if (!core) {
    return word;
  }
  const forceParen = lead.includes('(');
  const hyphenated = core.split('-').map((part, index) => {
    return titleCaseHyphenPart(part, isFirstOrLast || (forceParen && index === 0));
  });
  return `${lead}${hyphenated.join('-')}${trailing}`;
}

/**
 * Title-cases one hyphen side by the first letter, not the first character.
 *
 * Empty parts (from a leading hyphen) are returned unchanged. Parts with no letter
 * are returned unchanged. Small words lowercase unless `forceCap` is true.
 */
function titleCaseHyphenPart(part, forceCap) {
  if (!part) {
    return part;
  }
  const letterIndex = part.search(/[A-Za-z]/);
  if (letterIndex === -1) {
    return part;
  }
  const lookup = part.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  const letter = !forceCap && TITLE_CASE_SMALL_WORDS.has(lookup)
    ? part[letterIndex].toLowerCase()
    : part[letterIndex].toUpperCase();
  return part.slice(0, letterIndex) + letter + part.slice(letterIndex + 1);
}

module.exports = {
  TITLE_CASE_SMALL_WORDS,
  yamlFrontMatterEnd,
  collectAtxHeadings,
  promoteHeadingTree,
  closeHeadingSkips,
  applyHeadingHouseStyle,
  toTitleCase,
};
