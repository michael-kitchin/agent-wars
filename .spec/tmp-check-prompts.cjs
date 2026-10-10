const fs = require('fs');

function check(name) {
  const text = fs.readFileSync(name, 'utf8');
  const start = text.indexOf('```\n');
  const end = text.indexOf('\n```', start + 4);
  if (start < 0 || end < 0) {
    console.log(name, 'no map');
    return;
  }
  const lines = text.slice(start + 4, end).split('\n');
  console.log('---', name, 'lines', lines.length);
  const codes = new Map();
  const dups = [];
  for (let i = 0; i < lines.length; i += 2) {
    const codeLine = lines[i];
    const terrLine = lines[i + 1];
    if (terrLine === undefined) {
      console.log(' unpaired code line', i);
      continue;
    }
    const codeTokens = [...codeLine.matchAll(/\S+/g)];
    const terrTokens = [...terrLine.matchAll(/\S+/g)];
    if (codeTokens.length !== terrTokens.length) {
      console.log(' count mismatch row', i / 2, 'codes', codeTokens.length, 'terrain', terrTokens.length);
    }
    const mis = [];
    const n = Math.min(codeTokens.length, terrTokens.length);
    for (let t = 0; t < n; t++) {
      if (codeTokens[t].index !== terrTokens[t].index) {
        mis.push(`${codeTokens[t][0]}@${codeTokens[t].index} vs ${terrTokens[t][0]}@${terrTokens[t].index}`);
      }
    }
    if (mis.length) {
      console.log(' align mismatch row', i / 2, mis.slice(0, 4).join('; '), 'total', mis.length);
    }
    const weird = terrTokens.filter((t) => !/^[x.][?*#!USABusab]$/.test(t[0]));
    if (weird.length) {
      console.log(' weird terrain row', i / 2, weird.slice(0, 8).map((t) => t[0]).join(','));
    }
    for (const tok of codeTokens) {
      if (!/^[A-Z0-9]{2}$/.test(tok[0])) {
        console.log(' bad code', tok[0]);
      }
      if (codes.has(tok[0])) dups.push(tok[0]);
      codes.set(tok[0], (codes.get(tok[0]) || 0) + 1);
    }
  }
  console.log(' unique codes', codes.size, 'dup samples', [...new Set(dups)].slice(0, 15), 'dupCount', dups.length);
  return codes;
}

const strategic = check('debug-last-strategic-prompt.txt');
const tactical = check('debug-last-tactical-prompt.txt');

function listed(text, label) {
  const re = /\b[A-Z0-9]{2}\b/g;
  return text;
}

const s = fs.readFileSync('debug-last-strategic-prompt.txt', 'utf8');
const best = s.split('### Best Options This Turn')[1].split('## Recent Turn Notes')[0];
const bestHexes = [...best.matchAll(/\| ([A-Z0-9]{2}) \|/g)].map((m) => m[1]);
const missingBest = [...new Set(bestHexes)].filter((h) => !strategic.has(h));
console.log('best option hexes missing from map', missingBest);

const unitHexes = [...s.matchAll(/\| a1-[a-z0-9]+ \| [a-z]+ \| ([A-Z0-9]{2}) \|/g)].map((m) => m[1]);
console.log('unit hexes', unitHexes.join(','));
console.log('unit hexes missing', unitHexes.filter((h) => !strategic.has(h)));

const prod = s.split('## Controlled Hex Queues')[1].split('# Your Strategic Memory')[0];
const prodHexes = [...prod.matchAll(/^\| ([A-Z0-9]{2}) \|/gm)].map((m) => m[1]);
console.log('production hexes missing', prodHexes.filter((h) => !strategic.has(h)));

function glyphs(file, codes) {
  const text = fs.readFileSync(file, 'utf8');
  const start = text.indexOf('```\n');
  const end = text.indexOf('\n```', start + 4);
  const lines = text.slice(start + 4, end).split('\n');
  const found = new Map();
  for (let i = 0; i < lines.length; i += 2) {
    const codeTokens = [...lines[i].matchAll(/\S+/g)];
    const terrTokens = [...lines[i + 1].matchAll(/\S+/g)];
    for (let t = 0; t < codeTokens.length; t++) {
      if (codes.includes(codeTokens[t][0])) found.set(codeTokens[t][0], terrTokens[t][0]);
    }
  }
  console.log(file, [...found.entries()].map(([k, v]) => k + '=' + v).join(' '));
}
glyphs('debug-last-strategic-prompt.txt', ['F1', 'FL', 'FQ', 'FZ', 'H6', 'HG', 'G7', 'GD', 'GW', 'G2', 'BS', 'DI', 'DS', 'D3', 'GZ']);
glyphs('debug-last-tactical-prompt.txt', ['HP', 'KU', 'GQ', 'GD', 'FT', 'E9', 'F6', 'HB', 'F0', 'OS', 'MW', 'PD']);
