'use strict';

/**
 * Em-dash rewrite for `--file` fix.
 *
 * Replaces Unicode U+2014 (spaced or not) and ASCII ` -- ` using the SKILL.md Step 7
 * punctuation rules. Does not match `---`, `--file` / `--severity` / `--mode`, numeric
 * ranges, or HTML comments. En dashes are left unchanged. Pairing never crosses a
 * newline.
 */

/**
 * Words that start a new sentence after a remaining spaced em dash.
 *
 * `and` / `but` / `in` / `or` are deliberately omitted so those stay comma joins.
 * `these` / `those` are included so a gloss after "why" becomes a new sentence.
 */
const CLAUSE_START = /^(the|they|they're|they've|they'll|if|this|it|it's|its|these|those)\b/i;

/**
 * Rewrites em dashes in a markdown document, preserving newline style.
 *
 * Returns a new string. YAML fences, thematic `---`, and `--file` flags are not
 * em dashes and are not modified. Throws nothing for ordinary markdown; unexpected
 * input is returned with only the dash substitutions that the rules allow.
 */
function rewriteEmDashes(content) {
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const endedWithNewline = /\r?\n$/.test(content);
  const lines = content.split(/\r?\n/);
  let inHtmlComment = false;
  const next = lines.map((line) => {
    const mapped = rewriteOutsideHtmlComments(line, inHtmlComment, rewriteEmDashesInLine);
    inHtmlComment = mapped.inComment;
    return mapped.text;
  });
  let result = next.join(newline);
  if (endedWithNewline && !/\r?\n$/.test(result)) {
    result += newline;
  }
  return result;
}

/**
 * Rewrites only the parts of a line that sit outside HTML comments.
 *
 * Catalog confirmation treats dashes inside `<!-- ... -->` as non-findings. Pairing
 * still never crosses a newline. Returns the rewritten line and whether a comment
 * stays open at the end of the line.
 */
function rewriteOutsideHtmlComments(line, inComment, rewrite) {
  let result = '';
  let index = 0;
  let state = inComment;
  while (index < line.length) {
    if (state) {
      const close = line.indexOf('-->', index);
      if (close === -1) {
        result += line.slice(index);
        return { text: result, inComment: true };
      }
      result += line.slice(index, close + 3);
      index = close + 3;
      state = false;
      continue;
    }
    const open = line.indexOf('<!--', index);
    if (open === -1) {
      result += rewrite(line.slice(index));
      return { text: result, inComment: false };
    }
    result += rewrite(line.slice(index, open));
    const close = line.indexOf('-->', open);
    if (close === -1) {
      result += line.slice(open);
      return { text: result, inComment: true };
    }
    result += line.slice(open, close + 3);
    index = close + 3;
  }
  return { text: result, inComment: state };
}

/**
 * Rewrites em dashes on a single line.
 *
 * Headings use a colon. Isolated table cells become a hyphen. Safe paired asides
 * become parentheses, with a comma if the next text starts a new clause. Remaining
 * spaced dashes use a colon after a bold label or list item, a period before a
 * clause, or a comma. Leftover unspaced U+2014 uses a colon in headings and a comma
 * in running text.
 */
function rewriteEmDashesInLine(line) {
  if (/^#{1,6} /.test(line)) {
    const spaced = line.replace(/ \u2014 /g, ': ').replace(/ -- /g, ': ');
    return replaceLeftoverEmDashes(spaced, true);
  }
  let out = line.replace(/\| \u2014 \|/g, '| - |').replace(/\| -- \|/g, '| - |');
  out = replaceSafePairs(out);
  while (/( \u2014 | -- )/.test(out)) {
    out = replaceOneDash(out);
  }
  return replaceLeftoverEmDashes(out, false);
}

/**
 * Replaces U+2014 that still remains after spaced ` — ` and ASCII ` -- ` handling.
 *
 * Isolated table cells become a hyphen. Headings use a colon. Running text uses a
 * comma, inserting a space when the dash had no spaces around it. ASCII `--` is
 * left alone so `--file` and `---` stay intact.
 */
function replaceLeftoverEmDashes(line, isHeading) {
  const withTable = line.replace(/\|\u2014\|/g, '| - |');
  const joiner = isHeading ? ': ' : ', ';
  return withTable.replace(/(\S)?\u2014(\S)?/g, (_, left, right) => {
    return `${left || ''}${joiner}${right || ''}`;
  });
}

/**
 * Converts ` — aside — ` to parentheses when the aside has no sentence-ending marks.
 *
 * Inner parentheses in the aside are allowed unless the first dash already sits
 * inside parentheses. Inserts a comma unless the following word is a be-verb that
 * continues the same clause. Asides that contain `.` `?` or `!` are left for
 * single-dash replacement.
 */
function replaceSafePairs(line) {
  const pair = / (?:\u2014|--) ([^.\u2014?!\n]+?) (?:\u2014|--) /g;
  return line.replace(pair, (match, aside, offset, whole) => {
    if (parenDepthAt(whole, offset) > 0) {
      return match;
    }
    const after = whole.slice(offset + match.length);
    const trimmed = after.replace(/^\s+/, '');
    const needsComma = wrapNeedsComma(trimmed, whole.slice(0, offset));
    return ` (${aside.trim()})${needsComma ? ',' : ''} `;
  });
}

/**
 * Returns true when a wrapped aside should be followed by a comma.
 *
 * Clause starters (`the`, `they`, `if`) always take a comma. A following be-verb
 * (`is`, `are`, `was`, `were`) never does, so `Write operations (aside) are issued`
 * stays one clause. Other following words take a comma only when the left side is
 * already an `if`/`when` clause, so `validate (aside), proceed` gets a comma and
 * `separation (aside) makes` does not.
 */
function wrapNeedsComma(following, left) {
  if (!following) {
    return false;
  }
  if (CLAUSE_START.test(following)) {
    return true;
  }
  if (!/^[A-Za-z]/.test(following)) {
    return false;
  }
  if (/^(is|are|was|were|am|been|have|has|had)\b/i.test(following)) {
    return false;
  }
  return /\b(if|when|unless|although|because)\b/i.test(left);
}

/**
 * Returns how many parentheses are still open at `index`.
 *
 * Pairing is skipped when the first dash already sits inside parentheses, so
 * `(never seen — dark) or (last-known — dim)` does not wrap across both asides.
 */
function parenDepthAt(text, index) {
  let depth = 0;
  for (let i = 0; i < index; i += 1) {
    if (text[i] === '(') {
      depth += 1;
    } else if (text[i] === ')') {
      depth = Math.max(0, depth - 1);
    }
  }
  return depth;
}

/**
 * Replaces the first remaining spaced em dash or ASCII ` -- ` on the line.
 *
 * Bold labels take a colon. Clause-starting right sides take a period and a capital.
 * List items take a colon (definition gloss). Everything else takes a comma. Returns
 * the original line if no dash remains, so the caller loop can terminate.
 */
function replaceOneDash(line) {
  const match = / (?:\u2014|--) /.exec(line);
  if (!match) {
    return line;
  }
  const left = line.slice(0, match.index);
  const right = line.slice(match.index + match[0].length);
  if (/\*\*\s*$/.test(left)) {
    return `${left}: ${right}`;
  }
  if (CLAUSE_START.test(right)) {
    return `${left.replace(/[\s,;:]+$/, '')}. ${capitalize(right)}`;
  }
  if (/^\s*(?:[-*+]|\d+\.)\s/.test(line)) {
    return `${left}: ${right}`;
  }
  return `${left}, ${right}`;
}

/**
 * Capitalizes the first letter of a string, leaving leading punctuation in place.
 *
 * Used after converting a dash to a period. Strings with no letter are returned
 * unchanged.
 */
function capitalize(text) {
  const letterIndex = text.search(/[A-Za-z]/);
  if (letterIndex === -1) {
    return text;
  }
  return text.slice(0, letterIndex) + text[letterIndex].toUpperCase() + text.slice(letterIndex + 1);
}

module.exports = {
  rewriteEmDashes,
};
