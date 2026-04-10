import * as fs from 'fs';
import * as ts from 'typescript';
import { generateOrientingBlock } from './commentGenerate.js';
import {
  getFirstOrientingSummaryLine,
  isValidOrientingBlock,
  needsSignatureSummaryRefresh,
  variantForFlags,
} from './commentValidate.js';
import type { DeclarationTarget } from './discovery.js';
import { discoverTargets } from './discovery.js';

/**
 * Describes a single text replacement in a UTF-8 source file.
 *
 * Purpose: Keeps file mutations explicit and easy to sort for safe application order.
 * When to use: When aggregating planned orienting-comment insertions/replacements.
 * Expected outcome: `start`/`end` slice semantics match `String.prototype.slice`.
 * Exceptions: None.
 */
export interface TextEdit {
  readonly start: number;
  readonly end: number;
  readonly newText: string;
}

/**
 * Plans edits for one `SourceFile` without mutating it.
 *
 * Purpose: Enables dry-run reporting and deterministic apply ordering.
 * When to use: After parsing, before writing any files.
 * Expected outcome: Returns zero or more non-overlapping edits sorted by ascending start.
 * Exceptions: None.
 */
export function planEditsForSourceFile(sourceFile: ts.SourceFile): TextEdit[] {
  const targets = discoverTargets(sourceFile);
  const edits: TextEdit[] = [];
  for (const t of targets) {
    const e = planEditForTarget(sourceFile, t);
    if (e) edits.push(e);
    const stray = planStrayGeneratedOrientingBeforeBindingName(sourceFile, t);
    if (stray) edits.push(stray);
  }
  edits.sort((a, b) => a.start - b.start);
  return edits;
}

/**
 * Applies UTF-8 text edits to a file using reverse start order to keep offsets stable.
 *
 * Purpose: Performs the Phase 4 write step safely for batched edits.
 * When to use: After `planEditsForSourceFile` (or merged edit lists) are finalized.
 * Expected outcome: File content reflects all edits exactly once on disk.
 * Exceptions: Propagates filesystem errors from read/write.
 */
export function applyEditsToFile(absolutePath: string, edits: TextEdit[]): void {
  if (!edits.length) return;
  let text = fs.readFileSync(absolutePath, 'utf8');
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  for (const e of sorted) {
    text = text.slice(0, e.start) + e.newText + text.slice(e.end);
  }
  fs.writeFileSync(absolutePath, text, 'utf8');
}

/**
 * Detects tool-style orienting blocks mistakenly placed as trivia immediately before a binding name.
 *
 * Purpose: Cleans up a known bad insertion pattern where a block comment was wedged between the
 *   variable keyword and the binding identifier, left by earlier apply passes so validation and re-apply can converge.
 * When to use: Only from `planEditsForSourceFile` for `moduleVariable` targets.
 * Expected outcome: True when the slice matches generated orienting boilerplate closely enough to remove safely.
 * Exceptions: None.
 */
function looksLikeGeneratedOrientingBlock(raw: string): boolean {
  const t = raw.trim();
  if (!t.startsWith('/**')) return false;
  return (
    t.includes('When to use:') &&
    t.includes('Expected outcome:') &&
    t.includes('Exceptions:') &&
    (t.includes('Purpose:') || t.includes('Contract:'))
  );
}

/**
 * Plans removal of a stray block comment between `const`/`let` and the binding identifier for module variables.
 *
 * Purpose: Removes duplicate or wedged orienting blocks without touching statement-level leading comments.
 * When to use: After the primary `planEditForTarget` step for the same target.
 * Expected outcome: Zero or one edit whose range ends at the binding identifier start and deletes only trivia between the list keyword and that identifier.
 * Exceptions: None.
 */
function planStrayGeneratedOrientingBeforeBindingName(
  sourceFile: ts.SourceFile,
  target: DeclarationTarget,
): TextEdit | undefined {
  if (target.kind !== 'moduleVariable' || !ts.isVariableDeclaration(target.node)) return undefined;
  const decl = target.node;
  const list = decl.parent;
  if (!ts.isVariableDeclarationList(list)) return undefined;
  const kw = list.getFirstToken(sourceFile);
  if (!kw) return undefined;
  const low = kw.getEnd();
  const nameStart = decl.name.getStart(sourceFile, false);
  if (low >= nameStart) return undefined;
  const text = sourceFile.text;
  let i = nameStart - 1;
  while (i >= low && /\s/.test(text[i]!)) i--;
  if (i < low || text[i] !== '/') return undefined;
  if (i < 1 || text[i - 1] !== '*') return undefined;
  const closeEnd = i + 1;
  const open = text.lastIndexOf('/**', closeEnd);
  if (open < low) return undefined;
  const raw = text.slice(open, closeEnd);
  if (!looksLikeGeneratedOrientingBlock(raw)) return undefined;
  return { start: open, end: nameStart, newText: '' };
}

function planEditForTarget(sourceFile: ts.SourceFile, target: DeclarationTarget): TextEdit | undefined {
  const variant =
    target.orientingVariant ??
    variantForFlags({ isInterfaceMember: target.isInterfaceMember, isAbstract: target.isAbstract });
  const anchor = getCommentAnchorNode(target.node);
  const existing = readLeadingOrientingRaw(sourceFile, anchor);
  if (existing && isValidOrientingBlock(existing, variant)) {
    const summaryLine = getFirstOrientingSummaryLine(existing);
    let signatureOnlyCallable = false;
    if (target.kind === 'method' && ts.isMethodDeclaration(target.node) && target.node.body === undefined) {
      signatureOnlyCallable = true;
    }
    if (
      target.kind === 'accessor' &&
      (ts.isGetAccessorDeclaration(target.node) || ts.isSetAccessorDeclaration(target.node)) &&
      target.node.body === undefined
    ) {
      signatureOnlyCallable = true;
    }
    const wantsRefresh =
      !!summaryLine &&
      !signatureOnlyCallable &&
      needsSignatureSummaryRefresh(target.kind, summaryLine);
    if (!wantsRefresh) return undefined;
  }

  const insertAnchor = getInsertPosition(sourceFile, anchor);
  const indent = getIndentAt(sourceFile, insertAnchor);
  const block = indentBlock(generateOrientingBlock(target, sourceFile), indent);

  const range = leadingBlockCommentReplaceRange(sourceFile, anchor);
  if (range.start === range.end) {
    return { start: range.start, end: range.end, newText: `${block}\n` };
  }
  return { start: range.start, end: range.end, newText: `${block}\n` };
}

function readLeadingOrientingRaw(sourceFile: ts.SourceFile, node: ts.Node): string | undefined {
  const codeStart = getCodeStartForLeadingComments(sourceFile, node);
  const start = scanLeadingOrientingBlockStart(sourceFile.text, codeStart);
  if (start == null) return undefined;
  const raw = sourceFile.text.slice(start, codeStart).trim();
  if (!raw.startsWith('/**')) return undefined;
  return raw;
}

/**
 * Computes the UTF-16 range to replace when normalizing leading orienting blocks.
 *
 * Purpose: Removes duplicated or malformed block comments by spanning consecutive orienting block runs.
 * When to use: During edit planning before writing updated source text.
 * Expected outcome: Range covers from the first leading orienting block through the declaration token start.
 * Exceptions: None.
 */
function leadingBlockCommentReplaceRange(sourceFile: ts.SourceFile, node: ts.Node): { start: number; end: number } {
  const codeStart = getCodeStartForLeadingComments(sourceFile, node);
  const start = scanLeadingOrientingBlockStart(sourceFile.text, codeStart);
  if (start == null) {
    const pos = getInsertPosition(sourceFile, node);
    return { start: pos, end: pos };
  }
  return { start, end: codeStart };
}

/**
 * Finds the earliest `/**` that begins a chain of block comments immediately before `codeStart`.
 *
 * Purpose: Supports replacing stacked or duplicated orienting blocks as one edit range.
 * When to use: When computing ranges for read/validate/replace of leading documentation.
 * Expected outcome: Returns the start index, or null when no such chain exists.
 * Exceptions: None.
 */
function scanLeadingOrientingBlockStart(text: string, codeStart: number): number | null {
  let earliest = codeStart;
  let i = codeStart - 1;
  while (i >= 0 && /\s/.test(text[i]!)) i--;

  let found = false;
  while (i >= 0) {
    if (i > 0 && text[i] === '/' && text[i - 1] === '*') {
      found = true;
      const open = text.lastIndexOf('/**', i - 1);
      if (open < 0) break;
      earliest = Math.min(earliest, open);
      i = open - 1;
      while (i >= 0 && /\s/.test(text[i]!)) i--;
      continue;
    }
    break;
  }
  return found ? earliest : null;
}

function getInsertPosition(sourceFile: ts.SourceFile, node: ts.Node): number {
  if (ts.canHaveDecorators(node)) {
    const decs = ts.getDecorators(node as ts.HasDecorators);
    if (decs?.length) return decs[0].getFullStart();
  }
  return node.getStart(sourceFile, false);
}

/**
 * Picks the AST node whose leading trivia holds the orienting block for `export const` and similar forms.
 *
 * Purpose: Avoids inserting between `const` and the binding name on the first variable in a statement.
 * When to use: For all leading-comment reads and insert positions in this module.
 * Expected outcome: Returns the variable statement for the first declaration, otherwise the original node.
 * Exceptions: None.
 */
function getCommentAnchorNode(node: ts.Node): ts.Node {
  if (!ts.isVariableDeclaration(node)) return node;
  const list = node.parent;
  if (!ts.isVariableDeclarationList(list)) return node;
  const stmt = list.parent;
  if (!ts.isVariableStatement(stmt)) return node;
  if (list.declarations[0] !== node) return node;
  return stmt;
}

/**
 * Returns the code start index used when scanning or replacing leading documentation trivia.
 *
 * Purpose: Keeps trivia spans aligned with the anchor node used for comments.
 * When to use: Together with getCommentAnchorNode for consistent UTF-16 ranges.
 * Expected outcome: Matches `getStart(..., false)` on the anchor node.
 * Exceptions: None.
 */
function getCodeStartForLeadingComments(sourceFile: ts.SourceFile, node: ts.Node): number {
  return getCommentAnchorNode(node).getStart(sourceFile, false);
}

function getIndentAt(sourceFile: ts.SourceFile, pos: number): string {
  const lineStart = sourceFile.text.lastIndexOf('\n', Math.max(pos - 1, 0)) + 1;
  const line = sourceFile.text.slice(lineStart, pos);
  return /^[ \t]*/.exec(line)?.[0] ?? '';
}

function indentBlock(block: string, indent: string): string {
  return block
    .split('\n')
    .map((line) => {
      if (line.length === 0) return '';
      const trimmed = line.trimStart();
      if (trimmed.startsWith('/**')) return `${indent}/**`;
      if (trimmed === '*/') return `${indent} */`;
      if (trimmed.startsWith('*')) return `${indent} ${trimmed}`;
      return `${indent}${trimmed}`;
    })
    .join('\n');
}
