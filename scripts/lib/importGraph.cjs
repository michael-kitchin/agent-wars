#!/usr/bin/env node
/**
 * Builds the TypeScript import graph for `src/` and finds cycles in it.
 *
 * Shared by `check-circular-deps.cjs` and `dump-circular-deps.cjs`. Those two must agree exactly:
 * the dump script writes the baseline the check script compares against, so any difference in how
 * they read imports would produce a baseline that can never match. Keeping one implementation is
 * what makes that impossible rather than merely unlikely.
 */
'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Matches an `import`/`export` statement that names a module, capturing the clause and specifier.
 *
 * Anchored to the start of a line so a quoted string that happens to look like an import is not
 * mistaken for one. The clause excludes semicolons, quotes and backticks so a statement without a
 * `from` cannot make the match run on into the next one; it still crosses newlines, which multi-line
 * binding lists need and which cannot smuggle in a semicolon or a string.
 */
const FROM_STATEMENT_PATTERN = /^[ \t]*(import|export)\b([^;'"`]*?)\bfrom\s*['"]([^'"]+)['"]/gm;

/**
 * Matches a side-effect import, which names a module without binding anything from it.
 *
 * These are real runtime edges and a genuine way to create a cycle, so they are counted even though
 * they bind no names. Anchored for the same reason as the pattern above.
 */
const BARE_IMPORT_PATTERN = /^[ \t]*import\s*['"]([^'"]+)['"]/gm;

/** Extensions tried when resolving a relative specifier to a file on disk. */
const RESOLVABLE_EXTENSIONS = Object.freeze(['.ts', '.tsx']);

/**
 * Decides whether an import or export clause survives compilation.
 *
 * This is the correction that matters. TypeScript erases type-only imports, so they cannot
 * participate in a module initialisation cycle -- the bug class this gate exists to catch. Counting
 * them reports cycles that do not exist in the emitted JavaScript.
 *
 * Returns false for `import type ...`, `export type ...`, and for a braced list whose every binding
 * is inline-`type` with no default or namespace binding alongside it. Returns true otherwise,
 * including for a mixed list such as `import { type Config, load } from './x'`.
 */
function clauseProducesRuntimeEdge(clause) {
  const trimmed = clause.trim();
  if (/^type\b/.test(trimmed)) return false;

  const braced = trimmed.match(/\{([\s\S]*)\}/);
  if (!braced) return true;

  const beforeBrace = trimmed.slice(0, trimmed.indexOf('{')).replace(/,\s*$/, '').trim();
  if (beforeBrace.length > 0) return true;

  const bindings = braced[1]
    .split(',')
    .map((binding) => binding.trim())
    .filter((binding) => binding.length > 0);
  if (bindings.length === 0) return false;
  return !bindings.every((binding) => /^type\b/.test(binding));
}

/**
 * Returns every module specifier a file names, including type-only imports.
 *
 * Used only to measure what the old checker would have reported. The gate must never call this:
 * type-only imports are erased and cannot cause an initialisation-order cycle.
 */
function extractAllFromSpecifiers(rawSource) {
  const source = rawSource.charCodeAt(0) === 0xfeff ? rawSource.slice(1) : rawSource;
  const specifiers = new Set();
  for (const match of source.matchAll(FROM_STATEMENT_PATTERN)) {
    specifiers.add(match[3]);
  }
  for (const match of source.matchAll(BARE_IMPORT_PATTERN)) {
    specifiers.add(match[1]);
  }
  return [...specifiers];
}

/**
 * Returns the module specifiers one source file depends on at runtime.
 *
 * Reads the file as text rather than parsing it, which is why the two patterns above are written
 * defensively. Type-only imports are excluded; side-effect imports are included.
 *
 * A leading byte-order mark is stripped first. Because the patterns are anchored to the start of a
 * line, a mark left in place would sit between the line start and the `import` keyword and silently
 * hide the first import in the file -- which would make a cycle through that import invisible.
 */
function extractRuntimeSpecifiers(rawSource) {
  const source = rawSource.charCodeAt(0) === 0xfeff ? rawSource.slice(1) : rawSource;
  const specifiers = new Set();
  for (const match of source.matchAll(FROM_STATEMENT_PATTERN)) {
    if (clauseProducesRuntimeEdge(match[2])) specifiers.add(match[3]);
  }
  for (const match of source.matchAll(BARE_IMPORT_PATTERN)) {
    specifiers.add(match[1]);
  }
  return [...specifiers];
}

/**
 * Lists the TypeScript source files that make up the graph, recursively.
 *
 * Declaration files and tests are excluded: neither ships, and a test importing its subject is not
 * a cycle in the application.
 */
function collectSourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(abs));
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    if (entry.name.endsWith('.d.ts')) continue;
    if (entry.name.endsWith('.test.ts')) continue;
    out.push(abs);
  }
  return out;
}

/**
 * Resolves a relative specifier to an absolute file path, or null when it is not a project file.
 *
 * Package specifiers return null on purpose: a cycle through `node_modules` is not something this
 * project can fix, and following it would make the graph enormous.
 */
function resolveSpecifier(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    ...RESOLVABLE_EXTENSIONS.map((ext) => `${base}${ext}`),
    ...RESOLVABLE_EXTENSIONS.map((ext) => path.join(base, `index${ext}`)),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Builds the adjacency map for every source file under `srcDir`.
 *
 * Edges point from importer to imported and are restricted to files already in the map, so a
 * specifier resolving outside the tree is dropped rather than silently adding a node. Pass
 * `extractAllFromSpecifiers` only when measuring the old, type-including definition; the gate
 * uses the default, which is runtime edges only.
 */
function buildImportGraph(srcDir, extractSpecifiers = extractRuntimeSpecifiers) {
  const files = collectSourceFiles(srcDir);
  const graph = new Map();
  for (const file of files) graph.set(file, []);
  for (const file of files) {
    const deps = [];
    for (const specifier of extractSpecifiers(fs.readFileSync(file, 'utf8'))) {
      const resolved = resolveSpecifier(file, specifier);
      if (resolved !== null && graph.has(resolved)) deps.push(resolved);
    }
    graph.set(file, deps);
  }
  return graph;
}

/**
 * Finds every distinct cycle in the graph by depth-first search.
 *
 * Each cycle is returned as a node list that starts and ends on the same node, so the printed form
 * reads as a closed loop. Cycles are deduplicated by their exact node sequence, which means the same
 * loop discovered from a different entry point appears once per rotation -- acceptable, because any
 * one rotation is enough to point a reader at the problem.
 */
function detectCycles(graph) {
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const cycles = [];
  const seen = new Set();

  const visit = (node) => {
    if (visited.has(node)) return;
    visiting.add(node);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      if (!graph.has(next)) continue;
      if (visiting.has(next)) {
        const cycle = stack.slice(stack.indexOf(next)).concat(next);
        const key = cycle.join('->');
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push(cycle);
        }
        continue;
      }
      visit(next);
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  };

  for (const node of graph.keys()) visit(node);
  return cycles;
}

/**
 * Returns the project's runtime import cycles as repository-relative arrow strings.
 *
 * This is the one function both command-line scripts should call. Paths use forward slashes on every
 * platform so a baseline recorded on Windows matches one checked on Linux.
 */
function findRuntimeImportCycles(root) {
  return findImportCycles(root, extractRuntimeSpecifiers);
}

/**
 * Returns source-level cycles counting type-only imports as edges.
 *
 * This is the definition the gate used to apply, and it is kept only so the difference from the
 * runtime graph can be measured. Never use it to decide whether the build passes.
 */
function findTypeOnlyInflatedImportCycles(root) {
  return findImportCycles(root, extractAllFromSpecifiers);
}

/**
 * Returns import cycles under `src/` using the given specifier extractor.
 *
 * Paths use forward slashes on every platform so a baseline recorded on Windows matches one
 * checked on Linux.
 */
function findImportCycles(root, extractSpecifiers) {
  const graph = buildImportGraph(path.join(root, 'src'), extractSpecifiers);
  return detectCycles(graph).map((cycle) =>
    cycle.map((abs) => path.relative(root, abs).replace(/\\/g, '/')).join(' -> ')
  );
}

module.exports = {
  clauseProducesRuntimeEdge,
  extractRuntimeSpecifiers,
  extractAllFromSpecifiers,
  collectSourceFiles,
  resolveSpecifier,
  buildImportGraph,
  detectCycles,
  findImportCycles,
  findRuntimeImportCycles,
  findTypeOnlyInflatedImportCycles,
};
