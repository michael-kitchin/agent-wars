/**
 * Renames res1/res4 identifiers to strategic/tactical using the TypeScript compiler API.
 *
 * Purpose: Change code names without touching IPC strings, SQL, or other string literals.
 * When to use: `node dist/scripts/naming/resolutionWordRename.js --dry-run` then `--apply`.
 * Expected outcome: Identifiers and `src/` file stems change. A name collision prints and `--apply` does nothing.
 * Exceptions: `--apply` throws when two different names would become one name and no distinct replacement is listed.
 */
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

/**
 * Old identifier spelling to a hand-written new spelling when the automatic name collides.
 *
 * Purpose: Lets a person split two names that would otherwise become the same identifier.
 * When to use: After a dry-run lists a collision. Leave empty when there is no collision.
 * Expected outcome: `--apply` uses this spelling instead of the automatic one.
 * Exceptions: A collision with no entry here aborts the apply.
 */
const DISTINCT_NAMES: Readonly<Record<string, string>> = {
  tacticalRes1Cell: 'tacticalParentCell',
  tacticalRes4Cell: 'tacticalCell',
  res4Cell: 'tacticalSampleCell',
  tacticalRes4: 'tacticalStrikeTarget',
  res4: 'tacticalIndex',
};

interface RenameSpan {
  readonly start: number;
  readonly end: number;
  readonly next: string;
}

/**
 * Returns the strategic/tactical spelling of an identifier, or null when it has no res1/res4 token.
 *
 * Purpose: One rule for file stems and TypeScript identifiers.
 * When to use: Before recording a rename span.
 * Expected outcome: `getTerrainRes1Naming` becomes `getTerrainStrategicNaming`. A name that already says strategic or tactical drops the res token.
 * Exceptions: None.
 */
export function resolutionWordFor(name: string): string | null {
  if (!/res[14]/i.test(name)) return null;
  const drop = /strategic|tactical/i.test(name);
  const next = drop
    ? name.replace(/RES1|RES4|Res1|Res4|res1|res4/g, '')
    : name
      .replace(/RES1/g, 'STRATEGIC')
      .replace(/RES4/g, 'TACTICAL')
      .replace(/Res1/g, 'Strategic')
      .replace(/Res4/g, 'Tactical')
      .replace(/res1/g, 'strategic')
      .replace(/res4/g, 'tactical');
  const cleaned = next.replace(/_{2,}/g, '_').replace(/^_|_$/g, '');
  if (!cleaned || cleaned === name) return null;
  return DISTINCT_NAMES[name] ?? cleaned;
}

function collectIdentifiers(sourceFile: ts.SourceFile): RenameSpan[] {
  const spans: RenameSpan[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      const next = resolutionWordFor(node.text);
      if (next) spans.push({ start: node.getStart(sourceFile), end: node.getEnd(), next });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return spans;
}

function replaceComments(sourceFile: ts.SourceFile, text: string): string {
  const ranges = [
    ...(ts.getLeadingCommentRanges(text, 0) ?? []),
    ...sourceFile.getChildren().flatMap((node) => collectCommentRanges(text, node)),
  ];
  const unique = [...new Map(ranges.map((range) => [range.pos, range])).values()].sort((a, b) => b.pos - a.pos);
  let updated = text;
  for (const range of unique) {
    const body = updated.slice(range.pos, range.end);
    const replaced = body
      .replace(/(?<!terrain_)RES1/g, 'STRATEGIC')
      .replace(/(?<!terrain_)RES4/g, 'TACTICAL')
      .replace(/(?<!terrain_)Res1/g, 'Strategic')
      .replace(/(?<!terrain_)Res4/g, 'Tactical')
      .replace(/(?<!terrain_)res1/g, 'strategic')
      .replace(/(?<!terrain_)res4/g, 'tactical');
    updated = updated.slice(0, range.pos) + replaced + updated.slice(range.end);
  }
  return updated;
}

function collectCommentRanges(text: string, node: ts.Node): ts.CommentRange[] {
  const ranges = [
    ...(ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []),
    ...(ts.getTrailingCommentRanges(text, node.getEnd()) ?? []),
  ];
  node.getChildren().forEach((child) => ranges.push(...collectCommentRanges(text, child)));
  return ranges;
}

function applySpans(text: string, spans: readonly RenameSpan[]): string {
  const ordered = [...spans].sort((a, b) => b.start - a.start);
  let updated = text;
  for (const span of ordered) {
    updated = updated.slice(0, span.start) + span.next + updated.slice(span.end);
  }
  return updated;
}

function listSourceFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) found.push(full);
    }
  };
  walk(path.join(root, 'src'));
  return found;
}

/**
 * Plans identifier renames under `src/` and optionally writes them.
 *
 * Purpose: Dry-run first so a collision is visible before any file changes.
 * When to use: From the compiled script.
 * Expected outcome: Returns 0 when the apply is clean or the dry-run finds no collision. Returns 1 when a collision is unresolved.
 * Exceptions: None. Problems are printed.
 */
export function runResolutionWordRename(repoRoot: string, apply: boolean): number {
  const files = listSourceFiles(repoRoot);
  const byNext = new Map<string, Set<string>>();
  const planned: { file: string; spans: RenameSpan[] }[] = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const spans = collectIdentifiers(source);
    for (const span of spans) {
      const oldName = text.slice(span.start, span.end);
      const bucket = byNext.get(span.next) ?? new Set<string>();
      bucket.add(oldName);
      byNext.set(span.next, bucket);
    }
    if (spans.length > 0) planned.push({ file, spans });
  }
  const collisions = [...byNext.entries()].filter(([, names]) => names.size > 1);
  if (collisions.length > 0) {
    console.error('Name collisions:');
    for (const [next, names] of collisions) console.error(`  ${[...names].join(', ')} -> ${next}`);
    return 1;
  }
  console.log(`Identifiers to rename in ${planned.length} files.`);
  if (!apply) return 0;
  for (const plan of planned) {
    const text = fs.readFileSync(plan.file, 'utf8');
    const withIdentifiers = applySpans(text, plan.spans);
    const source = ts.createSourceFile(plan.file, withIdentifiers, ts.ScriptTarget.Latest, true, plan.file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    fs.writeFileSync(plan.file, replaceComments(source, withIdentifiers));
  }
  renameFiles(repoRoot, files);
  return 0;
}

function renameFiles(repoRoot: string, files: readonly string[]): void {
  const stemMap = new Map<string, string>();
  for (const file of files) {
    const stem = path.basename(file, path.extname(file));
    const next = resolutionWordFor(stem);
    if (next) stemMap.set(stem, next);
  }
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    let updated = text;
    const specifiers: RenameSpan[] = [];
    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const literal = node.moduleSpecifier;
        const replaced = replaceStem(literal.text, stemMap);
        if (replaced) specifiers.push({ start: literal.getStart(source) + 1, end: literal.getEnd() - 1, next: replaced });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (specifiers.length > 0) {
      updated = applySpans(updated, specifiers);
      fs.writeFileSync(file, updated);
    }
  }
  for (const file of files) {
    const stem = path.basename(file, path.extname(file));
    const next = stemMap.get(stem);
    if (!next) continue;
    const target = path.join(path.dirname(file), next + path.extname(file));
    if (fs.existsSync(target)) throw new Error(`Refusing to overwrite ${path.relative(repoRoot, target)}`);
    fs.renameSync(file, target);
  }
}

function replaceStem(specifier: string, stemMap: ReadonlyMap<string, string>): string | null {
  const base = path.posix.basename(specifier);
  const stem = base.replace(/\.js$/, '');
  const next = stemMap.get(stem);
  if (!next) return null;
  const directory = specifier.slice(0, specifier.length - base.length);
  return directory + next + base.slice(stem.length);
}

if (require.main === module) {
  const apply = process.argv.includes('--apply');
  process.exit(runResolutionWordRename(process.cwd(), apply));
}
