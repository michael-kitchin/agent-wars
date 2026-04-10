import type { DeclarationKind } from './discovery.js';

/**
 * Validates orienting comment blocks against the style contract.
 *
 * Purpose: Centralizes contract checks for the orienting-comments tool and tests.
 * When to use: After extracting a leading block comment in orienting form for a declaration.
 * Expected outcome: Returns whether the block matches required labeled lines.
 * Exceptions: None.
 */
export type OrientingVariant = 'contract' | 'implementation';

const LABEL_CONTRACT = 'Contract:';
const LABEL_PURPOSE = 'Purpose:';
const LABEL_WHEN = 'When to use:';
const LABEL_EXPECTED = 'Expected outcome:';
const LABEL_EXCEPTIONS = 'Exceptions:';

/**
 * Strips the opening block delimiter, closing block delimiter, and star-prefixed line margins.
 *
 * Purpose: Normalizes raw comment text for line-based validation.
 * When to use: Before checking labeled lines in a captured block comment.
 * Expected outcome: Returns interior lines without outer comment delimiters.
 * Exceptions: None.
 */
export function normalizeBlockInterior(raw: string): string[] {
  let t = raw.trim();
  if (!t.startsWith('/**')) return [];
  t = t.slice(3);
  const end = t.lastIndexOf('*/');
  if (end >= 0) t = t.slice(0, end);
  return t
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\*\s?/, '').trimEnd())
    .map((l) => l.replace(/^\s*$/, ''));
}

/**
 * Determines whether a normalized JSDoc interior satisfies the orienting contract.
 *
 * Purpose: Gates whether the tool should replace an existing leading comment.
 * When to use: On every candidate declaration during scan/apply passes.
 * Expected outcome: True only when summary and all required labeled lines exist.
 * Exceptions: None.
 */
export function isValidOrientingInterior(lines: string[], variant: OrientingVariant): boolean {
  const nonEmpty = lines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (nonEmpty.length < 5) return false;
  const summary = nonEmpty[0];
  if (summary.includes('Purpose:') || summary.includes('Contract:') || summary.includes('When to use:')) return false;

  const labelLine = (label: string) => nonEmpty.some((l) => l.startsWith(label) && l.slice(label.length).trim().length > 0);

  const core =
    labelLine(LABEL_WHEN) &&
    labelLine(LABEL_EXPECTED) &&
    labelLine(LABEL_EXCEPTIONS) &&
    (variant === 'contract' ? labelLine(LABEL_CONTRACT) : labelLine(LABEL_PURPOSE));

  return core;
}

/**
 * Validates a raw orienting block comment source slice for a known orienting variant.
 *
 * Purpose: Convenience wrapper used by apply and lint-like checks.
 * When to use: When the full block text is already extracted from a file.
 * Expected outcome: Delegates to interior parsing and labeled-line validation.
 * Exceptions: None.
 */
export function isValidOrientingBlock(raw: string, variant: OrientingVariant): boolean {
  const trimmed = raw.trim();
  const openerCount = (trimmed.match(/\/\*\*/g) ?? []).length;
  if (openerCount !== 1) return false;
  return isValidOrientingInterior(normalizeBlockInterior(raw), variant);
}

/**
 * Chooses contract vs implementation variant for validation from declaration flags.
 *
 * Purpose: Encodes the same variant rules as comment generation.
 * When to use: When only structural flags are known, not the full AST node.
 * Expected outcome: Returns the variant expected for that declaration shape.
 * Exceptions: None.
 */
export function variantForFlags(flags: { isInterfaceMember: boolean; isAbstract: boolean }): OrientingVariant {
  if (flags.isInterfaceMember || flags.isAbstract) return 'contract';
  return 'implementation';
}

/**
 * Returns the first non-empty summary line from a raw orienting block comment.
 *
 * Purpose: Supports refresh heuristics that compare only the summary line without re-parsing the whole contract.
 * When to use: From apply planning when deciding whether to replace a still-valid block with an updated signature hint.
 * Expected outcome: Returns undefined when no summary line exists.
 * Exceptions: None.
 */
export function getFirstOrientingSummaryLine(raw: string): string | undefined {
  const lines = normalizeBlockInterior(raw)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines[0];
}

/**
 * Returns true when an existing orienting summary likely embeds a truncated function or method body in the hint.
 *
 * Purpose: Lets a follow-up apply pass refresh summaries after tightening `buildSignatureHint` for function-like nodes.
 * When to use: Only after `isValidOrientingBlock` succeeds and the declaration kind can carry a callable body.
 * Expected outcome: True only for conservative, low-risk patterns tied to the old hint behavior.
 * Exceptions: None.
 */
export function needsSignatureSummaryRefresh(kind: DeclarationKind, summaryLine: string): boolean {
  const s = summaryLine;
  if (!s) return false;
  const leakyBody =
    /\)\s*:\s*\S+\s*\{/.test(s) ||
    (s.includes('(') && /\{\s*(const|let|var|return|if)\b/.test(s)) ||
    /\bfunction\s+\w+\s*\([^)]*\)\s*:\s*\S+\s*\{/.test(s);

  if (kind === 'functionImplementation' || kind === 'functionOverload') {
    return leakyBody || s.length > 240;
  }
  if (kind === 'constructor') {
    return leakyBody || s.length > 220;
  }
  if (kind === 'method') {
    return leakyBody || s.length > 260;
  }
  if (kind === 'accessor') {
    return leakyBody || s.length > 260;
  }
  return false;
}
