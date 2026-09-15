'use strict';

/**
 * Phrase-boundary checks for missing-contraction rewrite.
 *
 * Pair-table guards (aux, hortative, refrain) do not see locative `here is` or
 * a pronoun that is the object of a preposition or gerund. This module does.
 * contractions.cjs calls it from passesGuard. applyFileFix.cjs must not.
 * When a check is unsure, it leaves the span expanded.
 */

/**
 * Words that introduce presentational `here is` / `there is` (`so here is`).
 *
 * Locative `figure here is` is not in this set and must stay expanded.
 */
const PRESENTATIONAL_CUES = new Set([
  'so', 'then', 'and', 'but', 'well', 'now', 'thus', 'hence', 'because', 'since',
]);

/**
 * Second words of a pair that are a copula needing a complement.
 *
 * `it will` / `it would` can be elliptical (`I think it will.`) and are not
 * checked here. Object-pronoun checks still apply to those pairs.
 */
const BARE_COPULAS = new Set(['is', 'are']);

/**
 * Next-word tokens that mean the copula has no complement (`the way it is can`).
 *
 * A real complement is an adjective, noun, participle, or determiner, not another
 * finite auxiliary.
 */
const FINITE_AFTER_BARE_COPULA = new Set([
  'can', 'could', 'will', 'would', 'may', 'might', 'must', 'shall', 'should',
  'do', 'does', 'did',
]);

/**
 * Prepositions that take `it` / `they` as an object (`in it is`, `of it is`).
 *
 * Coordinators and subordinators that can also be prepositions (`since`, `after`)
 * live in ALLOW_BEFORE_PRONOUN instead so `since it is ready` still contracts.
 */
const PREPOSITIONS = new Set([
  'in', 'of', 'to', 'from', 'for', 'on', 'at', 'with', 'about', 'into', 'onto',
  'upon', 'against', 'toward', 'towards', 'by', 'as', 'vs', 'via', 'per', 'over',
  'under', 'between', 'among', 'across', 'through', 'during', 'including',
  'except', 'like', 'near', 'plus', 'unlike', 'within', 'along', 'around',
  'behind', 'below', 'beside', 'beyond', 'despite', 'inside', 'outside', 'past',
  'off', 'out', 'up', 'down',
]);

/**
 * Words ending in `ing` that are not gerunds taking an object.
 *
 * `running it would` must stay expanded. `during` is a preposition and is also
 * in PREPOSITIONS.
 */
const NON_GERUND_ING = new Set([
  'during', 'nothing', 'something', 'anything', 'everything', 'morning',
  'evening', 'according',
]);

/**
 * Previous-word tokens that mean `it` / `they` is a likely subject.
 *
 * Anything else before `it is` / `they are` / `it will` (a noun, `produce`, a
 * locative `here`) stays expanded. Complement verbs include common past forms
 * so `believed it had` still contracts.
 */
const ALLOW_BEFORE_PRONOUN = new Set([
  'and', 'but', 'or', 'nor', 'so', 'yet', 'because', 'since', 'if', 'unless',
  'when', 'whenever', 'while', 'although', 'though', 'whereas', 'that', 'which',
  'who', 'whom', 'whose', 'whether', 'after', 'before', 'until', 'once', 'than',
  'where', 'what', 'why', 'how', 'wherever', 'yes', 'no', 'well', 'oh',
  'really', 'actually', 'maybe', 'perhaps', 'probably', 'certainly', 'clearly',
  'obviously', 'simply', 'just', 'still', 'even', 'also', 'never', 'always',
  'often', 'now', 'then',
  'think', 'thinks', 'thought', 'believe', 'believes', 'believed', 'know',
  'knows', 'knew', 'say', 'says', 'said', 'mean', 'means', 'meant', 'guess',
  'guesses', 'guessed', 'realize', 'realizes', 'realized', 'assume', 'assumes',
  'assumed', 'suppose', 'supposes', 'supposed', 'feel', 'feels', 'felt', 'find',
  'finds', 'found', 'claim', 'claims', 'claimed', 'argue', 'argues', 'argued',
  'hope', 'hopes', 'hoped', 'fear', 'fears', 'feared', 'admit', 'admits',
  'admitted', 'suggest', 'suggests', 'suggested', 'insist', 'insists',
  'insisted', 'notice', 'notices', 'noticed', 'see', 'sees', 'saw', 'hear',
  'hears', 'heard', 'understand', 'understands', 'understood', 'remember',
  'remembers', 'remembered', 'forget', 'forgets', 'forgot', 'decide', 'decides',
  'decided', 'expect', 'expects', 'expected', 'imagine', 'imagines', 'imagined',
  'doubt', 'doubts', 'doubted', 'suspect', 'suspects', 'suspected', 'reckon',
  'reckons', 'reckoned', 'figure', 'figures', 'figured', 'swear', 'swears',
  'swore', 'agree', 'agrees', 'agreed', 'mention', 'mentions', 'mentioned',
  'explain', 'explains', 'explained', 'confirm', 'confirms', 'confirmed',
  'deny', 'denies', 'denied', 'predict', 'predicts', 'predicted', 'conclude',
  'concludes', 'concluded', 'discover', 'discovers', 'discovered', 'learn',
  'learns', 'learned', 'recognize', 'recognizes', 'recognized', 'consider',
  'considers', 'considered', 'declare', 'declares', 'declared', 'announce',
  'announces', 'announced', 'report', 'reports', 'reported', 'write', 'writes',
  'wrote', 'tell', 'tells', 'told', 'ask', 'asks', 'asked', 'wonder', 'wonders',
  'wondered', 'prove', 'proves', 'proved', 'show', 'shows', 'showed',
  'demonstrate', 'demonstrates', 'demonstrated', 'reveal', 'reveals', 'revealed',
  'indicate', 'indicates', 'indicated', 'imply', 'implies', 'implied', 'ensure',
  'ensures', 'ensured', 'seem', 'seems', 'seemed', 'appear', 'appears',
  'appeared',
]);

/**
 * Returns true when this expanded span is safe to contract at offset.
 *
 * Locative `here is` / `there is` after a noun return false. Object-pronoun
 * copulas (`in it is`, `following it will`, `so here it is.`) return false.
 * Presentational `Here is` / `so here is` and subject `it is ready` return true.
 * Callers still apply pair-table guards after this check.
 */
function bindingAllowsContraction(content, offset, matched) {
  const lower = matched.toLowerCase();
  if (lower === 'here is' || lower === 'there is') {
    return isPresentationalLocative(content, offset);
  }
  const parts = lower.split(/\s+/);
  if (parts.length < 2) {
    return true;
  }
  const first = parts[0];
  const second = parts[1];
  if (first !== 'it' && first !== 'they') {
    return true;
  }
  if (BARE_COPULAS.has(second) && !hasCopulaComplement(content, offset + matched.length)) {
    return false;
  }
  return pronounIsLikelySubject(content, offset);
}

/**
 * Returns true when `here is` / `there is` is presentational, not locative.
 *
 * Clause-initial (`Here is the list`) and cue-adverb (`so here is`) pass.
 * A noun immediately before (`figure here is`) fails.
 */
function isPresentationalLocative(content, offset) {
  if (isClauseInitial(content, offset)) {
    return true;
  }
  const previous = previousWordOnSameLine(content, offset);
  if (!previous) {
    return true;
  }
  return PRESENTATIONAL_CUES.has(previous.toLowerCase());
}

/**
 * Returns true when `it` / `they` at offset is a likely subject of the pair.
 *
 * Prepositions, gerunds, locative `here`, and `the way` fail. Clause-initial
 * pronouns and the allowlist pass. Any other previous word fails, matching
 * "when unsure, leave expanded."
 */
function pronounIsLikelySubject(content, offset) {
  if (isClauseInitial(content, offset)) {
    return true;
  }
  const previous = previousWordOnSameLine(content, offset);
  if (!previous) {
    return true;
  }
  const lower = previous.toLowerCase();
  if (lower === 'here' || lower === 'way') {
    return false;
  }
  if (PREPOSITIONS.has(lower) && !ALLOW_BEFORE_PRONOUN.has(lower)) {
    return false;
  }
  if (isGerundTakingObject(lower)) {
    return false;
  }
  return ALLOW_BEFORE_PRONOUN.has(lower);
}

/**
 * Returns true when word is a gerund that can take `it` / `they` as an object.
 *
 * `running it would` must stay expanded. `during` is excluded.
 */
function isGerundTakingObject(word) {
  if (NON_GERUND_ING.has(word)) {
    return false;
  }
  return /^[a-z]{3,}ing$/i.test(word);
}

/**
 * Returns true when a copula at afterOffset has a same-line complement.
 *
 * End of line, `.` `!` `?`, or a following finite auxiliary means no complement
 * (`so here it is.`, `the way it is can find`).
 */
function hasCopulaComplement(content, afterOffset) {
  const next = nextWordOnSameLine(content, afterOffset);
  if (!next) {
    return false;
  }
  const lower = next.toLowerCase();
  if (FINITE_AFTER_BARE_COPULA.has(lower)) {
    return false;
  }
  return true;
}

/**
 * Returns the previous same-line token before offset, or null at line start.
 *
 * Strips wrapping quotes and trailing punctuation so `"think` still allowlists.
 */
function previousWordOnSameLine(content, offset) {
  const lineStart = lineStartIndex(content, offset);
  const before = content.slice(lineStart, offset);
  const match = before.match(/(\S+)[^\S\r\n]*$/);
  if (!match) {
    return null;
  }
  const token = match[1].replace(/^["'`([{]+/, '').replace(/[.,:;!?)"'\]]+$/g, '');
  return token || null;
}

/**
 * Returns the next same-line token after offset, or null at clause end.
 *
 * A token that is only punctuation (`.`) counts as no word so a sentence-final
 * copula stays expanded.
 */
function nextWordOnSameLine(content, offset) {
  const lineEnd = sameLineEnd(content, offset);
  const rest = content.slice(offset, lineEnd);
  const match = rest.match(/^[^\S\r\n]*(\S+)/);
  if (!match) {
    return null;
  }
  const token = match[1].replace(/[.,:;!?)"']+$/g, '');
  return token || null;
}

/**
 * Returns true when offset sits at the start of a clause.
 *
 * Shared by phrase-boundary checks and the hortative `let us` guard: line start,
 * list markers, `>`, quotes, or `.` `!` `?` `:` `;` before optional space.
 */
function isClauseInitial(content, offset) {
  const before = content.slice(0, offset);
  const lineStart = lineStartIndex(content, offset);
  const prefix = before.slice(lineStart);
  if (/^[ \t>]*((?:[-*+]|\d+\.)[ \t]+)?["'`\u201C\u201D\u2018\u2019]*$/.test(prefix)) {
    return true;
  }
  const trimmed = before.replace(/[ \t>"'`\u201C\u201D\u2018\u2019]+$/g, '');
  if (!trimmed) {
    return true;
  }
  return /[.!?:;]$/.test(trimmed);
}

/**
 * Returns the index of the start of the line that contains offset.
 */
function lineStartIndex(content, offset) {
  const from = Math.max(0, offset - 1);
  return Math.max(content.lastIndexOf('\n', from), content.lastIndexOf('\r', from)) + 1;
}

/**
 * Returns the index of the next CR/LF, or content.length on the last line.
 */
function sameLineEnd(content, offset) {
  const newlineAt = content.indexOf('\n', offset);
  const crAt = content.indexOf('\r', offset);
  let end = content.length;
  if (newlineAt !== -1) {
    end = newlineAt;
  }
  if (crAt !== -1 && crAt < end) {
    end = crAt;
  }
  return end;
}

module.exports = {
  bindingAllowsContraction,
  isClauseInitial,
  nextWordOnSameLine,
  sameLineEnd,
};
