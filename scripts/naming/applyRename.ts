import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { createNamingLanguageService } from './languageServiceHost.js';
import {
  getEntry,
  loadLedger,
  markApplied,
  resolveCurrentPath,
  saveLedger,
} from './ledger.js';
import { rewriteModularizationManifest } from './pathBaselines.js';
import type { ApplyResult, LedgerEntry, RenameLedgerDocument } from './types.js';
import { gitMvPreserveHistory } from './windowsGitMv.js';

/** Hardcoded so string literals in product source are never rewritten. */
export const FIND_IN_STRINGS = false;
/** Hardcoded so comments are reported, not auto-edited. */
export const FIND_IN_COMMENTS = false;

/**
 * Finds a program source file by absolute path, ignoring separator and case differences.
 *
 * Purpose: Windows path spelling from `path.join` often disagrees with tsconfig `fileNames`.
 * When to use: Before `findRenameLocations` / `getEditsForFileRename`.
 * Expected outcome: The matching `SourceFile`, or undefined.
 * Exceptions: None.
 */
function findProgramSourceFile(program: ts.Program, abs: string): ts.SourceFile | undefined {
  const norm = abs.replace(/\\/g, '/').toLowerCase();
  return program.getSourceFiles().find((sf) => sf.fileName.replace(/\\/g, '/').toLowerCase() === norm);
}

/**
 * Collects `.ts` files under `dirAbs` (inclusive if `dirAbs` is a file).
 *
 * Purpose: Directory renames need `getEditsForFileRename` for every moved TypeScript file.
 * When to use: Before computing language-service file-rename edits.
 * Expected outcome: Absolute paths to `.ts` files, excluding `.d.ts`.
 * Exceptions: None.
 */
function collectTsFilesToMove(dirOrFileAbs: string): string[] {
  const stat = fs.statSync(dirOrFileAbs);
  if (stat.isFile()) {
    return dirOrFileAbs.endsWith('.ts') && !dirOrFileAbs.endsWith('.d.ts') ? [dirOrFileAbs] : [];
  }
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) out.push(abs);
    }
  };
  walk(dirOrFileAbs);
  return out;
}

/**
 * Applies TypeScript `FileTextChanges` from the end of each file backward.
 *
 * Purpose: Avoids invalidating later spans in the same file.
 * When to use: After `findRenameLocations` or `getEditsForFileRename`.
 * Expected outcome: Files on disk match the requested identifier/import text.
 * Exceptions: Throws if a target file cannot be read.
 */
export function applyFileTextChanges(changes: readonly ts.FileTextChanges[], dryRun: boolean): string[] {
  const edited: string[] = [];
  for (const fileChange of changes) {
    if (!fs.existsSync(fileChange.fileName)) continue;
    let text = fs.readFileSync(fileChange.fileName, 'utf8');
    const sorted = [...fileChange.textChanges].sort((a, b) => b.span.start - a.span.start);
    for (const change of sorted) {
      text =
        text.slice(0, change.span.start) + change.newText + text.slice(change.span.start + change.span.length);
    }
    if (!dryRun) fs.writeFileSync(fileChange.fileName, text, 'utf8');
    edited.push(fileChange.fileName);
  }
  return edited;
}

/**
 * Finds the character position of an exported identifier in `sf`.
 *
 * Purpose: `findRenameLocations` needs a position on the declaration name.
 * When to use: Symbol applies.
 * Expected outcome: Start offset of the matching exported name.
 * Exceptions: Throws if the export is not found.
 */
export function findExportedIdentifierPosition(sf: ts.SourceFile, name: string): number {
  const visit = (node: ts.Node): number | undefined => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) return node.name.getStart(sf);
    if (ts.isClassDeclaration(node) && node.name?.text === name) return node.name.getStart(sf);
    if (ts.isInterfaceDeclaration(node) && node.name.text === name) return node.name.getStart(sf);
    if (ts.isTypeAliasDeclaration(node) && node.name.text === name) return node.name.getStart(sf);
    if (ts.isEnumDeclaration(node) && node.name.text === name) return node.name.getStart(sf);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      return node.name.getStart(sf);
    }
    return ts.forEachChild(node, visit);
  };
  const pos = visit(sf);
  if (pos === undefined) {
    throw new Error(`Exported identifier ${name} not found in ${sf.fileName}`);
  }
  return pos;
}

/**
 * Groups rename locations into per-file text changes.
 *
 * Purpose: Converts language-service hits into `applyFileTextChanges` input.
 * When to use: After `findRenameLocations`.
 * Expected outcome: One `FileTextChanges` per file with spans replaced by `newName`.
 * Exceptions: None.
 */
function locationsToFileTextChanges(
  locations: readonly ts.RenameLocation[],
  newName: string,
): ts.FileTextChanges[] {
  const byFile = new Map<string, ts.TextChange[]>();
  for (const loc of locations) {
    const list = byFile.get(loc.fileName) ?? [];
    list.push({ span: loc.textSpan, newText: newName });
    byFile.set(loc.fileName, list);
  }
  return [...byFile.entries()].map(([fileName, textChanges]) => ({ fileName, textChanges }));
}

/**
 * Builds a relative module specifier from `fromFile` to `targetAbs` without a `.ts` suffix.
 *
 * Purpose: Fallback import rewrite when `getEditsForFileRename` returns nothing (common in small fixtures).
 * When to use: After a failed language-service file-rename edit collection.
 * Expected outcome: A `./`-prefixed POSIX specifier.
 * Exceptions: None.
 */
function relativeSpecifier(fromFile: string, targetAbs: string): string {
  let rel = path.relative(path.dirname(fromFile), targetAbs).replace(/\\/g, '/').replace(/\.ts$/, '');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

/**
 * Rewrites relative import/export specifiers that pointed at `oldAbs` so they point at `newAbs`.
 *
 * Purpose: Keeps modules compiling when the language service skips import edits.
 * When to use: When `getEditsForFileRename` produced no `FileTextChanges`.
 * Expected outcome: Matching specifiers in program files are replaced; paths listed in `editedFiles`.
 * Exceptions: None.
 */
function rewriteRelativeImportSpecifiers(
  program: ts.Program,
  oldAbs: string,
  newAbs: string,
  dryRun: boolean,
  editedFiles: string[],
): void {
  const quote = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile) continue;
    const oldSpec = relativeSpecifier(sf.fileName, oldAbs);
    const newSpec = relativeSpecifier(sf.fileName, newAbs);
    if (oldSpec === newSpec) continue;
    const pattern = new RegExp(`(['"])${quote(oldSpec)}\\1`, 'g');
    const next = sf.getFullText().replace(pattern, `$1${newSpec}$1`);
    if (next === sf.getFullText()) continue;
    if (!dryRun) fs.writeFileSync(sf.fileName, next, 'utf8');
    editedFiles.push(sf.fileName);
  }
}

/**
 * Applies one ledger entry (or prints a dry-run plan).
 *
 * Purpose: Single-id mutation with language-service safety for identifiers and imports.
 * When to use: From the CLI `apply --id` after the ledger is signed.
 * Expected outcome: Disk (unless dry-run) plus ledger `applied`; comment hits listed, not rewritten.
 * Exceptions: Throws on unknown id, waived entries, missing paths, or git mv failure.
 */
export function applyLedgerEntry(repoRoot: string, entryId: string, dryRun: boolean): ApplyResult {
  const document = loadLedger(repoRoot);
  const entry = getEntry(document, entryId);
  if (entry.status === 'applied') {
    return { id: entryId, dryRun, noop: true, commentOccurrences: [], editedFiles: [] };
  }
  if (entry.status === 'waived') {
    throw new Error(`Ledger id ${entryId} is waived and cannot be applied`);
  }
  if (entry.kind === 'symbol') {
    return applySymbol(repoRoot, document, entry, dryRun);
  }
  return applyPath(repoRoot, document, entry, dryRun);
}

/**
 * Renames an exported identifier via `findRenameLocations` (strings and comments excluded).
 *
 * Purpose: Updates callers without rewriting frozen string values.
 * When to use: `kind: symbol` entries.
 * Expected outcome: Identifier text replaced; comment-only hits returned for manual edit.
 * Exceptions: Throws if the language service returns no locations.
 */
function applySymbol(
  repoRoot: string,
  document: RenameLedgerDocument,
  entry: LedgerEntry,
  dryRun: boolean,
): ApplyResult {
  const rel = resolveCurrentPath(document, entry.currentPath);
  const abs = path.join(repoRoot, ...rel.split('/'));
  const service = createNamingLanguageService(repoRoot);
  const program = service.getProgram();
  if (!program) throw new Error('Language service has no program');
  const sourceFile = findProgramSourceFile(program, abs);
  if (!sourceFile) {
    throw new Error(`Source file not in program: ${rel}`);
  }
  const position = findExportedIdentifierPosition(sourceFile, entry.currentName);
  const fileName = sourceFile.fileName;
  const identifierHits =
    service.findRenameLocations(fileName, position, FIND_IN_STRINGS, FIND_IN_COMMENTS) ?? [];
  const withComments =
    service.findRenameLocations(fileName, position, FIND_IN_STRINGS, true) ?? [];
  const idKeys = new Set(identifierHits.map((h) => `${h.fileName}:${h.textSpan.start}`));
  const commentOccurrences = withComments
    .filter((h) => !idKeys.has(`${h.fileName}:${h.textSpan.start}`))
    .map((h) => `${h.fileName}:${h.textSpan.start}`);
  if (identifierHits.length === 0) {
    throw new Error(`No rename locations for ${entry.currentName} in ${rel}`);
  }
  const editedFiles = applyFileTextChanges(locationsToFileTextChanges(identifierHits, entry.proposedName), dryRun);
  if (!dryRun) saveLedger(repoRoot, markApplied(document, entry.id));
  return { id: entry.id, dryRun, noop: false, commentOccurrences, editedFiles };
}

/**
 * Renames a file or directory: language-service import edits, then `git mv`.
 *
 * Purpose: Keeps module specifiers aligned with the new path.
 * When to use: `kind: file` or `kind: directory`.
 * Expected outcome: Imports updated, path moved, modularization manifest rewritten.
 * Exceptions: Throws if `proposedPath` is missing or git mv fails.
 */
function applyPath(
  repoRoot: string,
  document: RenameLedgerDocument,
  entry: LedgerEntry,
  dryRun: boolean,
): ApplyResult {
  if (!entry.proposedPath) {
    throw new Error(`Ledger id ${entry.id} is missing proposedPath`);
  }
  const oldRel = resolveCurrentPath(document, entry.currentPath);
  const newRel = resolveCurrentPath(document, entry.proposedPath);
  const oldAbs = path.join(repoRoot, ...oldRel.split('/'));
  const newAbs = path.join(repoRoot, ...newRel.split('/'));
  const service = createNamingLanguageService(repoRoot);
  const program = service.getProgram();
  if (!program) throw new Error('Language service has no program');
  const toMove = collectTsFilesToMove(oldAbs);
  const allChanges: ts.FileTextChanges[] = [];
  for (const oldFile of toMove) {
    const newFile = path.join(newAbs, path.relative(oldAbs, oldFile));
    const target = fs.statSync(oldAbs).isFile() ? newAbs : newFile;
    const lsOld = findProgramSourceFile(program, oldFile)?.fileName ?? oldFile.replace(/\\/g, '/');
    const lsNew = target.replace(/\\/g, '/');
    const edits = service.getEditsForFileRename(lsOld, lsNew, {}, {});
    allChanges.push(...edits);
  }
  const editedFiles = applyFileTextChanges(allChanges, dryRun);
  if (allChanges.length === 0) {
    if (fs.statSync(oldAbs).isFile()) {
      rewriteRelativeImportSpecifiers(program, oldAbs, newAbs, dryRun, editedFiles);
    } else {
      for (const oldFile of toMove) {
        const newFile = path.join(newAbs, path.relative(oldAbs, oldFile));
        rewriteRelativeImportSpecifiers(program, oldFile, newFile, dryRun, editedFiles);
      }
    }
  }
  if (!dryRun) {
    gitMvPreserveHistory(repoRoot, oldAbs, newAbs);
    rewriteModularizationManifest(repoRoot, oldRel, newRel);
    saveLedger(repoRoot, markApplied(document, entry.id));
  }
  return { id: entry.id, dryRun, noop: false, commentOccurrences: [], editedFiles };
}
