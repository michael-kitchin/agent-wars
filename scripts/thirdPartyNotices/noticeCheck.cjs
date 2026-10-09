/**
 * Checks THIRD-PARTY-NOTICES.md against direct dependencies and the fixed credits.
 * Run with no arguments from the repository root via `npm run notices:check`.
 * Exits 1 when a required line is missing, a package has no license file, or a vendored LICENSE was removed.
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const noticesPath = path.join(repoRoot, 'THIRD-PARTY-NOTICES.md');
const licenseFileNames = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'];
const apacheVersionLine = 'Version 2.0, January 2004';

const fixedRequirements = [
  { heading: 'SQLite', snippets: ['The author disclaims copyright to this source code.', 'version 3.51.3'] },
  { heading: 'Leaflet', snippets: ['Copyright (c) 2010-2023, Volodymyr Agafonkin', 'Copyright (c) 2010-2011, CloudMade', '1.9.4'] },
  { heading: 'iso3166-flags', snippets: ['Copyright (c) 2021 AJ McKenna'] },
  { heading: 'country-flags', snippets: ['c09927e63705529bbf59ca6684cd9b23225dddad'] },
  { heading: 'Natural Earth', snippets: ['Made with Natural Earth.'] },
  {
    heading: 'EarthEnv Consensus Land Cover',
    snippets: [
      'Creative Commons Attribution-NonCommercial 4.0 International License',
      'https://www.earthenv.org/landcover',
    ],
  },
  { heading: 'EarthEnv Topography', snippets: ['10.1038/sdata.2018.40'] },
  {
    heading: 'WorldClim',
    snippets: ['Redistribution or commercial use is not allowed without prior permission.'],
  },
  {
    heading: 'Data-generation tools',
    snippets: [
      'psycopg is LGPL-3.0-only.',
      'rasterio is BSD-3-Clause.',
      'Python package h3 is Apache-2.0.',
      'shapely is BSD-3-Clause.',
      'fiona is BSD 3-Clause.',
      'pyproj is MIT.',
      'PostgreSQL is under the PostgreSQL License.',
      'PostGIS is GPL-2.0-or-later.',
    ],
  },
];

/**
 * Why this exists:
 *   The notices file is hand-written, so a renamed heading or a dropped copyright line
 *   would otherwise ship unnoticed.
 * When to use:
 *   Pass the notices markdown and the heading/snippet pairs the file must contain.
 * What to expect:
 *   One `{ heading, snippet }` entry for every snippet whose heading is missing or
 *   whose text is absent from that heading's body. An empty array means the file matches.
 */
function findNoticeGaps(noticesText, requirements) {
  const sections = sectionsByHeading(noticesText);
  const gaps = [];
  for (const requirement of requirements) {
    const body = sections.get(requirement.heading);
    for (const snippet of requirement.snippets) {
      if (body === undefined || !body.includes(snippet)) {
        gaps.push({ heading: requirement.heading, snippet });
      }
    }
  }
  return gaps;
}

/**
 * Why this exists:
 *   Snippets have to be checked inside one section, not across the whole file.
 * When to use:
 *   From `findNoticeGaps`, after the notices text is loaded.
 * What to expect:
 *   A map of heading text to the body that follows it, up to the next heading of
 *   the same or higher level. The first heading wins if a name is repeated.
 */
function sectionsByHeading(noticesText) {
  const lines = noticesText.split(/\r?\n/);
  const parsed = lines.map((line) => ({ line, heading: headingFromLine(line) }));
  const sections = new Map();
  for (let index = 0; index < parsed.length; index += 1) {
    const heading = parsed[index].heading;
    if (!heading || sections.has(heading.text)) {
      continue;
    }
    const body = [];
    for (let cursor = index + 1; cursor < parsed.length; cursor += 1) {
      const next = parsed[cursor].heading;
      if (next && next.level <= heading.level) {
        break;
      }
      if (!next) {
        body.push(parsed[cursor].line);
      }
    }
    sections.set(heading.text, body.join('\n'));
  }
  return sections;
}

/**
 * Why this exists:
 *   Heading text has to match the requirement name with the hashes removed.
 * When to use:
 *   For each line while splitting the notices file.
 * What to expect:
 *   Null when the trimmed line does not start with `#`. Otherwise the hash count
 *   and the text after one following space.
 */
function headingFromLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('#')) {
    return null;
  }
  let hashCount = 0;
  while (hashCount < trimmed.length && trimmed[hashCount] === '#') {
    hashCount += 1;
  }
  let text = trimmed.slice(hashCount);
  if (text.startsWith(' ')) {
    text = text.slice(1);
  }
  return { level: hashCount, text };
}

/**
 * Why this exists:
 *   Direct npm packages change version and copyright lines without a hand edit of the check.
 * When to use:
 *   When the CLI runs, before the fixed credit list is appended.
 * What to expect:
 *   One requirement per dependency, plus electron. Throws when a package has no license file.
 *   Does not look for the Chromium license bundle on disk.
 */
function dependencyRequirements(root) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const names = Object.keys(packageJson.dependencies ?? {});
  if (!names.includes('electron')) {
    names.push('electron');
  }
  return names.map((name) => requirementForPackage(root, name));
}

/**
 * Why this exists:
 *   Each shipped package's own license file is the text the notices section has to contain.
 * When to use:
 *   Once per direct dependency and for electron.
 * What to expect:
 *   A heading equal to the package name, plus its version and copyright lines.
 *   Apache packages whose only copyright line is the appendix template contribute the
 *   license's version line instead. Throws if no license file exists.
 */
function requirementForPackage(root, name) {
  const packageDir = path.join(root, 'node_modules', name);
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
  const licensePath = licenseFileNames
    .map((fileName) => path.join(packageDir, fileName))
    .find((candidate) => fs.existsSync(candidate));
  if (!licensePath) {
    throw new Error(`Missing license file for ${name} under ${packageDir}`);
  }
  const snippets = [packageJson.version, ...copyrightSnippets(fs.readFileSync(licensePath, 'utf8'))];
  if (name === 'electron') {
    snippets.push('LICENSES.chromium.html');
  }
  return { heading: name, snippets };
}

/**
 * Why this exists:
 *   MIT and BSD notices are identified by their copyright lines. The Apache appendix
 *   template is not a copyright for the package.
 * When to use:
 *   After a package license file has been read.
 * What to expect:
 *   Every trimmed line that starts with `Copyright` and does not contain `[yyyy]`.
 *   When none remain, the Apache 2.0 version line.
 */
function copyrightSnippets(licenseText) {
  const lines = licenseText.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('Copyright') && !line.includes('[yyyy]'));
  return lines.length > 0 ? lines : [apacheVersionLine];
}

/**
 * Why this exists:
 *   The BSD and MIT texts have to remain beside the vendored files, not only inside the notices file.
 * When to use:
 *   From `missingVendoredLicenses`.
 * What to expect:
 *   Pairs of a repo-relative license path and a copyright line that file must contain.
 */
const vendoredLicenseRequirements = [
  ['static/vendor/leaflet/LICENSE', 'Copyright (c) 2010-2023, Volodymyr Agafonkin'],
  ['static/flags/subdivisions/LICENSE', 'Copyright (c) 2021 AJ McKenna'],
];

/**
 * Purpose: The notices file can still quote a license after the copy next to the vendored files is deleted.
 * When to use: From the CLI, and from the unit test that passes a directory without those files.
 * Expected outcome: Repo-relative paths whose license file is missing or does not contain the required copyright line.
 * Exceptions: None.
 */
function missingVendoredLicenses(root) {
  const missing = [];
  for (const [relativePath, snippet] of vendoredLicenseRequirements) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath) || !fs.readFileSync(absolutePath, 'utf8').includes(snippet)) {
      missing.push(relativePath);
    }
  }
  return missing;
}

/**
 * Why this exists:
 *   `npm run notices:check` is the command CI and local runs call.
 * When to use:
 *   When this file is executed directly, not when the unit tests import `findNoticeGaps`.
 * What to expect:
 *   Exit 0 when every requirement is present. Otherwise prints `heading: snippet` lines
 *   to stderr and exits 1. A missing notices file, package license, or vendored LICENSE also exits 1.
 */
function main() {
  const missingLicenses = missingVendoredLicenses(repoRoot);
  if (missingLicenses.length > 0) {
    for (const relativePath of missingLicenses) {
      console.error(`Missing vendored license: ${relativePath}`);
    }
    process.exit(1);
  }
  if (!fs.existsSync(noticesPath)) {
    console.error(`Missing ${noticesPath}`);
    process.exit(1);
  }
  let requirements;
  try {
    requirements = [...dependencyRequirements(repoRoot), ...fixedRequirements];
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  const noticesText = fs.readFileSync(noticesPath, 'utf8');
  const gaps = findNoticeGaps(noticesText, requirements);
  if (gaps.length > 0) {
    for (const gap of gaps) {
      console.error(`${gap.heading}: ${gap.snippet}`);
    }
    process.exit(1);
  }
}

module.exports = {
  findNoticeGaps,
  missingVendoredLicenses,
};

if (require.main === module) {
  main();
}
