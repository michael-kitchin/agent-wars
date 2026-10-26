/**
 * Short labels for a side's home name.
 *
 * Purpose: Chips, unit labels, and saved-home matching need one rule for cutting a long
 * home name, and for treating a name with a trailing abbreviation parenthesis as the same home.
 * When to use: Any label or lookup that receives a home display name.
 * Expected outcome: Helpers do not mutate their input.
 * Exceptions: None. This module does not import the main-process logger.
 */

const COMPASS_PREFIXES: readonly (readonly [string, string])[] = [
  ['Northern', 'N.'],
  ['Southern', 'S.'],
  ['Eastern', 'E.'],
  ['Western', 'W.'],
  ['Central', 'C.'],
  ['North', 'N.'],
  ['South', 'S.'],
  ['East', 'E.'],
  ['West', 'W.'],
];

const DIRECTION_STEMS: readonly (readonly [string, string])[] = [
  ['central', 'C'],
  ['north', 'N'],
  ['south', 'S'],
  ['east', 'E'],
  ['west', 'W'],
];

const TRAILING_ABBREVIATION = / \([A-Z]{2,}\)$/;

/**
 * Drops one trailing abbreviation parenthesis.
 *
 * Purpose: "South & east China, Taiwan (SECT)" and "South & east China, Taiwan" are the same home.
 * A saved match may store the name from before the parenthesis was added.
 * When to use: `shortSideName`, and any comparison of a stored home with a side group's display name.
 * Expected outcome: The trimmed name, without one final " (LETTERS)" whose letters are two or more capitals.
 * A parenthesis that contains a comma, a space, or a lowercase letter stays.
 * Exceptions: None.
 */
export function sideHomeNameKey(displayName: string): string {
  return displayName.trim().replace(TRAILING_ABBREVIATION, '');
}

/**
 * Cuts a home display name at the first list separator.
 *
 * Purpose: "Eastern Turkey & Caucasus" shortens from "Eastern Turkey", not from the whole string.
 * When to use: `shortSideName` only.
 * Expected outcome: The substring before the first " & ", ", ", or " and ".
 * Exceptions: None.
 */
function cutAtFirstSeparator(displayName: string): string {
  const separatorAt = [' & ', ', ', ' and ']
    .map((separator) => displayName.indexOf(separator))
    .filter((index) => index >= 0);
  if (separatorAt.length === 0) return displayName;
  return displayName.slice(0, Math.min(...separatorAt));
}

/**
 * Shortens a leading compass word.
 *
 * Purpose: "Western Turkey" reads "W. Turkey" on chips. Longer words are tried first so
 * "Northern" does not become "N.ern".
 * When to use: `shortSideName` only.
 * Expected outcome: A leading compass word becomes its initial and a period. Other names
 * are unchanged.
 * Exceptions: None.
 */
function shortenLeadingCompass(name: string): string {
  for (const [word, short] of COMPASS_PREFIXES) {
    if (name === word) return short;
    if (name.startsWith(`${word} `)) return `${short} ${name.slice(word.length + 1)}`;
  }
  return name;
}

/**
 * Reports whether a cut name is only single-letter words.
 *
 * Purpose: "S." is not a useful chip label. "W. Turkey" still is.
 * When to use: `shortSideName`, after the separator cut and the leading compass shortening.
 * Expected outcome: True when at least one word remains and every word, ignoring punctuation, is one letter.
 * Exceptions: None.
 */
function isOnlySingleLetterWords(value: string): boolean {
  const words = value.split(/\s+/).map((word) => word.replace(/[^A-Za-z]/g, '')).filter((word) => word.length > 0);
  return words.length > 0 && words.every((word) => word.length === 1);
}

/**
 * Reports whether a cut name opened a parenthesis it did not close.
 *
 * Purpose: A comma inside "(Victoria, Tasmania, NZ)" must not leave the chip reading "Tasman (Victoria".
 * When to use: `shortSideName`, after the separator cut and the leading compass shortening.
 * Expected outcome: True when the number of "(" and ")" characters does not match, or a ")" comes first.
 * Exceptions: None.
 */
function hasUnclosedParenthesis(value: string): boolean {
  let open = 0;
  for (const char of value) {
    if (char === '(') open += 1;
    else if (char === ')') open -= 1;
    if (open < 0) return true;
  }
  return open !== 0;
}

/**
 * Reads a compass word as its direction letters.
 *
 * Purpose: "east" contributes E and "northwestern" contributes NW, including the adjective ending "ern".
 * When to use: `lettersFromFullName` for one whitespace token, after non-letters have been removed.
 * Expected outcome: The direction letters when the whole token is compass stems. Null when any letters remain
 * that are not a stem or a following "ern".
 * Exceptions: None.
 */
function compassLetters(lettersOnly: string): string | null {
  let rest = lettersOnly.toLowerCase();
  if (rest.length === 0) return null;
  let letters = '';
  while (rest.length > 0) {
    const stem = DIRECTION_STEMS.find(([name]) => rest.startsWith(name));
    if (!stem) return null;
    letters += stem[1];
    rest = rest.slice(stem[0].length);
    if (rest.startsWith('ern')) rest = rest.slice(3);
  }
  return letters.length > 0 ? letters : null;
}

/**
 * Builds the letter form of a home name.
 *
 * Purpose: A cut that leaves only "S." is replaced by letters taken from the whole name, in order.
 * When to use: `shortSideName` after the trailing abbreviation parenthesis has been removed.
 * Expected outcome: Compass words contribute their direction letters. Every other word contributes its
 * ASCII capitals. Words with neither, such as "and" or "the", contribute nothing.
 * Exceptions: None.
 */
function lettersFromFullName(body: string): string {
  let letters = '';
  for (const token of body.split(/\s+/)) {
    const lettersOnly = token.replace(/[^A-Za-z]/g, '');
    if (lettersOnly.length === 0) continue;
    const compass = compassLetters(lettersOnly);
    if (compass !== null) {
      letters += compass;
      continue;
    }
    for (const char of token) {
      if (char >= 'A' && char <= 'Z') letters += char;
    }
  }
  return letters;
}

/**
 * Makes the short side name used on chips and unit labels.
 *
 * Purpose: Full home names do not fit on a unit token once a match has three or more seats.
 * When to use: Labels shown to someone other than the unit's owner.
 * Expected outcome: A trailing " (LETTERS)" abbreviation is removed first. The body is cut at the first
 * " & ", ", ", or " and ", then a leading compass word is shortened. "Western Turkey" → "W. Turkey".
 * "Eastern Turkey & Caucasus" → "E. Turkey". "Levant & Cyprus" → "Levant". "Southern Asia" → "S. Asia".
 * When that cut is only single-letter words, or it leaves an unclosed parenthesis, the result is the
 * letter form of the body. "South & east China, Taiwan" → "SECT".
 * "Tasman (Victoria, Tasmania, NZ)" → "TVTNZ". A letter form of one letter keeps the body, so "East"
 * stays "East". A result longer than the body keeps the body too.
 * Exceptions: None.
 */
export function shortSideName(displayName: string): string {
  const body = sideHomeNameKey(displayName);
  const shortened = shortenLeadingCompass(cutAtFirstSeparator(body));
  const candidate = isOnlySingleLetterWords(shortened) || hasUnclosedParenthesis(shortened)
    ? letterFormOrBody(body, shortened)
    : shortened;
  if (body.length > 0 && candidate.length > body.length) return body;
  return candidate;
}

/**
 * Picks the letter form, or the whole name when that form is a single letter.
 *
 * Purpose: "S." and "Tasman (Victoria" are replaced by letters from the whole name.
 * When to use: `shortSideName`, when the cut is only single letters or leaves an unclosed parenthesis.
 * Expected outcome: The letter form when it has two or more letters. Otherwise the body, when the body is non-empty.
 * An empty body keeps the cut.
 * Exceptions: None.
 */
function letterFormOrBody(body: string, shortened: string): string {
  const letters = lettersFromFullName(body);
  if (letters.length <= 1) return body.length > 0 ? body : shortened;
  return letters;
}
