/**
 * Checks Markdown links in the files it is given.
 *
 * Purpose: A renamed heading or a missing image should fail here, not in a reader's browser.
 * When to use: `node scripts/check-doc-links.cjs <file.md>...`, on the files a change touched.
 * Expected outcome: Prints one `BROKEN` line per broken link and exits 1 when any are broken. Exits 0 when every
 *   in-page anchor and relative file resolves. `http:`, `https:`, and `mailto:` targets are ignored.
 * Exceptions: Exits 1, naming the path, when a named file cannot be read.
 */
'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Drops fenced code blocks, keeping the other lines in place.
 *
 * Purpose: A heading or a link inside a sample must not count.
 * When to use: Before collecting headings or links.
 * Expected outcome: Fence lines and the lines between a matching pair are blank. An unclosed fence blanks to the end.
 * Exceptions: None.
 */
function blankFencedCode(markdown) {
  const lines = markdown.split('\n');
  let fence = null;
  return lines.map((line) => {
    const open = /^(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null;
      return '';
    }
    if (open) {
      fence = open[1];
      return '';
    }
    return line;
  });
}

/**
 * Turns one heading's text into a GitHub anchor, before duplicate suffixes.
 *
 * Purpose: In-page links use the anchor GitHub would generate.
 * When to use: For each heading line, after inline code and links are reduced to their text.
 * Expected outcome: A lowercase slug of letters, numbers, spaces, hyphens, and underscores, with spaces as hyphens.
 * Exceptions: None.
 */
function slugText(text) {
  const plain = text.replace(/`([^`]*)`/g, '$1').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
  return plain.toLowerCase().replace(/[^\p{L}\p{N} \-_]/gu, '').replace(/ /g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Collects the GitHub anchors of a Markdown string.
 *
 * Purpose: An in-page link is broken when its anchor is not in this set.
 * When to use: On the file that holds the link, and on a linked Markdown file.
 * Expected outcome: A set of anchors. The first copy of a heading has no suffix. Later copies are `-1`, `-2`, and so on.
 * Exceptions: None.
 */
function headingSlugs(markdown) {
  const slugs = new Set();
  const seen = new Map();
  for (const line of blankFencedCode(markdown)) {
    const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (!heading) continue;
    const base = slugText(heading[1]);
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    slugs.add(count === 0 ? base : `${base}-${count}`);
  }
  return slugs;
}

/**
 * Lists the inline links in a Markdown file, with their line numbers.
 *
 * Purpose: The report names the line a reader would look at.
 * When to use: Once per file, after fenced code is blanked.
 * Expected outcome: `{ line, target }` for each `](target)`, including images. A target may include a `#anchor`.
 * Exceptions: None.
 */
function inlineLinks(markdown) {
  const links = [];
  blankFencedCode(markdown).forEach((line, index) => {
    const pattern = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let match = pattern.exec(line);
    while (match) {
      links.push({ line: index + 1, target: match[1] });
      match = pattern.exec(line);
    }
  });
  return links;
}

/**
 * Finds links in one Markdown file that do not resolve.
 *
 * Purpose: The CLI and the tests share one check.
 * When to use: With the file's absolute or relative path. Relative targets resolve from that file's directory.
 * Expected outcome: `{ line, target, reason }` for a missing in-page anchor, a missing relative file, or a missing
 *   anchor in a relative Markdown file. Web and mail links are omitted.
 * Exceptions: Throws when the file cannot be read.
 */
function findBrokenLinks(filePath) {
  const markdown = fs.readFileSync(filePath, 'utf8');
  const ownSlugs = headingSlugs(markdown);
  const directory = path.dirname(path.resolve(filePath));
  const broken = [];
  for (const link of inlineLinks(markdown)) {
    const target = link.target;
    if (/^(https?:|mailto:)/i.test(target)) continue;
    if (target.startsWith('#')) {
      if (!ownSlugs.has(decodeURIComponent(target.slice(1)))) broken.push({ ...link, reason: 'no matching heading' });
      continue;
    }
    const hash = target.indexOf('#');
    const filePart = hash === -1 ? target : target.slice(0, hash);
    const anchor = hash === -1 ? '' : decodeURIComponent(target.slice(hash + 1));
    const resolved = path.resolve(directory, filePart);
    if (!fs.existsSync(resolved)) {
      broken.push({ ...link, reason: 'file not found' });
      continue;
    }
    if (anchor && path.extname(resolved).toLowerCase() === '.md' && !headingSlugs(fs.readFileSync(resolved, 'utf8')).has(anchor)) {
      broken.push({ ...link, reason: 'no matching heading' });
    }
  }
  return broken;
}

/**
 * Prints broken links for the named files and sets the exit code.
 *
 * Purpose: The command line is the check a reviewer runs.
 * When to use: When this file is the program.
 * Expected outcome: One `BROKEN <file>:<line> <target> :: <reason>` line per broken link. Exit 1 when any are broken.
 * Exceptions: Exit 1 when a named file cannot be read.
 */
function main() {
  const files = process.argv.slice(2);
  let brokenCount = 0;
  for (const file of files) {
    let broken;
    try {
      broken = findBrokenLinks(file);
    } catch (err) {
      console.error(`BROKEN ${file}:0 ${file} :: ${err && err.message ? err.message : String(err)}`);
      brokenCount += 1;
      continue;
    }
    for (const link of broken) {
      console.log(`BROKEN ${file}:${link.line} ${link.target} :: ${link.reason}`);
      brokenCount += 1;
    }
  }
  process.exit(brokenCount === 0 ? 0 : 1);
}

module.exports = { findBrokenLinks, headingSlugs };

if (require.main === module) main();
