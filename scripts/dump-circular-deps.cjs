#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const IMPORT_RE = /import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
const EXPORT_RE = /export\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g;

function walk(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(abs));
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    if (entry.name.endsWith('.d.ts')) continue;
    if (entry.name.endsWith('.test.ts')) continue;
    out.push(abs);
  }
  return out;
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

function extractDeps(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const deps = new Set();
  let m;
  while ((m = IMPORT_RE.exec(src)) !== null) {
    deps.add(m[1]);
  }
  while ((m = EXPORT_RE.exec(src)) !== null) {
    deps.add(m[1]);
  }
  return [...deps];
}

function detectCycles(graph) {
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const cycles = [];
  const seenCycles = new Set();

  function dfs(node) {
    if (visited.has(node)) return;
    visiting.add(node);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      if (!graph.has(next)) continue;
      if (visiting.has(next)) {
        const idx = stack.indexOf(next);
        const cycle = stack.slice(idx).concat(next);
        const key = cycle.join('->');
        if (!seenCycles.has(key)) {
          seenCycles.add(key);
          cycles.push(cycle);
        }
        continue;
      }
      if (!visited.has(next)) dfs(next);
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  }

  for (const node of graph.keys()) dfs(node);
  return cycles;
}

const root = process.cwd();
const srcDir = path.join(root, 'src');
const files = walk(srcDir);
const graph = new Map();
for (const file of files) graph.set(file, []);
for (const file of files) {
  const specs = extractDeps(file);
  const deps = [];
  for (const spec of specs) {
    const resolved = resolveImport(file, spec);
    if (resolved) deps.push(resolved);
  }
  graph.set(file, deps);
}
const cycles = detectCycles(graph);
const relCycles = cycles.map((cycle) =>
  cycle.map((p) => path.relative(root, p).replace(/\\/g, '/')).join(' -> ')
);
const out = `${JSON.stringify(relCycles, null, 2)}\n`;
const dest = process.argv[2];
if (dest) {
  const outPath = path.isAbsolute(dest) ? dest : path.join(root, dest);
  fs.writeFileSync(outPath, out, 'utf8');
} else {
  process.stdout.write(out);
}
