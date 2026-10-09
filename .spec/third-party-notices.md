# Third-Party Notices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish one root file, `THIRD-PARTY-NOTICES.md`, that names every third-party work this repository directly ships or directly uses to build shipped data, and reproduces the notice each of those licenses actually requires.

**Architecture:** Hand-write the notices file so each license family keeps its own required wording. A small Node check reads `package.json` and a fixed list of vendored and data works, and fails when a required copyright or attribution line is missing. Electron packaging copies the notices file into the app. Chromium's license bundle is copied from the Electron binary at pack time, because that file is not part of the git tree.

**Tech Stack:** Node (the check is plain `node:test` plus a `.cjs` script), the existing `electron-builder` config, license files already present under `node_modules/`.

## Global Constraints

- Do not commit or push.
- The project license is MIT, in `LICENSE`, chosen after this plan. `"license"` in `package.json` is `MIT`. Earth-data limits on commercial use are stated in `THIRD-PARTY-NOTICES.md` and the README License section. `LICENSE` stays the unmodified MIT text. This plan did not choose that license.
- Do not put identifiers from this plan into `THIRD-PARTY-NOTICES.md`, source comments, or `doc/`.
- Copy license texts byte for byte from the files named below. Do not retype them from memory.
- "Directly relied upon" means the lists in this plan. It does not mean every transitive package under `node_modules`. Those packages keep their own `LICENSE` files, and `electron-builder` already packs `node_modules`.
- `psycopg` is `LGPL-3.0-only`. PostGIS, which the terrain pipeline README requires, is GPL-2.0-or-later. Neither is part of the Electron app. Say that. Do not paste the LGPL or the GPL into the notices file.
- `.github/workflows/build.yml` runs `npm test` after `npm ci --ignore-scripts` and before `node scripts/install-electron-binary.cjs`. The notices check must pass in that state. It may read `node_modules/electron/LICENSE`. It must not require `node_modules/electron/dist/LICENSES.chromium.html`, because that file arrives with the binary download.

## What is in scope

Shipped with the app, or copied into this repository:

| Work | Where | License, verified |
| --- | --- | --- |
| better-sqlite3 12.8.0 | `package.json` `dependencies` | MIT. `node_modules/better-sqlite3/LICENSE`. Copyright (c) 2017 Joshua Wise |
| dotenv 17.4.1 | `package.json` `dependencies` | BSD-2-Clause. `node_modules/dotenv/LICENSE`. Copyright (c) 2015, Scott Motte |
| fflate 0.8.3 | `package.json` `dependencies` | MIT. `node_modules/fflate/LICENSE`. Copyright (c) 2026 Arjun Barrett |
| h3-js 4.4.0 | `package.json` `dependencies` | Apache-2.0. `node_modules/h3-js/LICENSE`. No `NOTICE` file in that package |
| SQLite 3.51.3 | `node_modules/better-sqlite3/deps/sqlite3/sqlite3.c` | Public domain. https://www.sqlite.org/copyright.html says it does not require a license. The amalgamation header disclaims copyright and prints a blessing in place of a legal notice. |
| electron 40.8.0 | `devDependencies`, but it is the app runtime | MIT. `node_modules/electron/LICENSE` |
| Leaflet 1.9.4 | `static/vendor/leaflet/`, not declared in `package.json` | BSD-2-Clause. https://github.com/Leaflet/Leaflet/blob/v1.9.4/LICENSE |
| iso3166-flags | `static/flags/subdivisions/` | MIT. Copyright (c) 2021 AJ McKenna. https://github.com/amckenna41/iso3166-flags |
| country-flags | `static/flags/`, commit `c09927e63705529bbf59ca6684cd9b23225dddad` | No upstream LICENSE. Statement already in `static/flags/README.md` |
| Natural Earth | shapefiles named in `scripts/terrain_pipeline/README.md`; derived maps are in the repo | Public domain. https://www.naturalearthdata.com/about/terms-of-use/ |
| EarthEnv consensus land cover | `consensus_full_class_1.tif` through `consensus_full_class_12.tif` in `scripts/terrain_pipeline/config.py` | CC BY-NC 4.0 |
| EarthEnv topography | `tri_*`, `slope_*`, `elevation_*` GMTED filenames in the same config | Citation known. License sentence must be read from the topography page during Task 3 |

Used to build data, not copied into the app. Identify them. Do not paste their full licenses:

| Package | PyPI license field checked 2026-10-09 |
| --- | --- |
| psycopg | `LGPL-3.0-only` |
| rasterio | `BSD-3-Clause` |
| h3 | Apache License 2.0 (the PyPI `license` field is the full text, not an SPDX id) |
| shapely | `BSD-3-Clause` |
| fiona | `BSD 3-Clause` |
| pyproj | `MIT` |

Same section of the notices file, but these are not PyPI packages. The terrain pipeline README requires them, and they are not shipped:

| Tool | License |
| --- | --- |
| PostgreSQL | PostgreSQL License |
| PostGIS | GPL-2.0-or-later |

Out of scope: `typescript`, `eslint`, `esbuild`, `electron-builder`, `@electron/rebuild`, `@types/node`, and transitive npm packages. Dev tools are not shipped. Transitive runtime packages travel inside `node_modules` with their own license files.

## Referencing rules

Use these forms. A link alone is not enough for a work whose files are in this repo or in the packaged app.

- **MIT and BSD:** paste the package `LICENSE` unchanged. The copyright line and the condition that follows it are the required notice. MIT's condition is the sentence beginning "The above copyright notice and this permission notice". BSD's conditions are the numbered redistribution clauses.
- **Apache-2.0:** paste the package `LICENSE` unchanged. If that package also has a `NOTICE` file, paste the `NOTICE` above the license. `h3-js` has no `NOTICE`.
- **CC BY-NC 4.0:** use the licensor's attribution sentence, the license name, the URI `https://creativecommons.org/licenses/by-nc/4.0/`, and a statement of what this project changed. Do not paste the full legal code.
- **Public domain:** quote the steward's own wording. Do not invent a copyright line.
- **Unshipped tools:** one paragraph each: name, license id, project URL, and the sentence "This package is used while generating data. It is not included in the application."

The notices file starts by pointing at `LICENSE` and at the earth-data limit on commercial use of the distributed application. The MIT grant covers Agent Wars source code. Each notice in the file covers that third-party work.

## File structure

- Create: `THIRD-PARTY-NOTICES.md` (the document GitHub visitors and packaged builds should read)
- Create: `static/vendor/leaflet/LICENSE` (BSD requires the notice to sit with the Leaflet sources)
- Create: `static/flags/subdivisions/LICENSE` (MIT requires the notice to sit with those SVGs)
- Create: `scripts/thirdPartyNotices/noticeCheck.cjs`
- Create: `scripts/thirdPartyNotices/noticeCheck.test.cjs`
- Modify: `package.json` (`notices:check` in Task 1; the `test` script calls it only in Task 4, after the notices file exists)
- Modify: `electron-builder.config.cjs` so the notices file and the Chromium license file are in the packaged app
- Modify: `README.md` with a short pointer
- Modify: `doc/terrain-pipeline.md` with a pointer to the data credits
- Modify: `doc/README.md` only if a sentence there still says the folder has no license or attribution duty. Do not add a new index row for a root legal file.

---

### Task 1: Checker

**Files:**

- Create: `scripts/thirdPartyNotices/noticeCheck.cjs`
- Create: `scripts/thirdPartyNotices/noticeCheck.test.cjs`
- Modify: `package.json` scripts

**Interfaces:**

- Consumes: nothing from earlier tasks
- Produces: `findNoticeGaps(noticesText, requirements)` where `requirements` is `{ heading: string, snippets: string[] }[]`. Returns `{ heading, snippet }[]` for every snippet absent from the body under that heading. A heading is a line `#` or `##` plus the heading text. The body runs until the next heading of the same or higher level.

- [x] **Step 1: Write the failing test**

```javascript
const assert = require('node:assert/strict');
const test = require('node:test');
const { findNoticeGaps } = require('./noticeCheck.cjs');

test('reports a missing copyright line under its heading', () => {
  const gaps = findNoticeGaps('# Third-party notices\n\n## dotenv\n\nBSD-2-Clause\n', [
    { heading: 'dotenv', snippets: ['Copyright (c) 2015, Scott Motte'] },
  ]);
  assert.deepEqual(gaps, [
    { heading: 'dotenv', snippet: 'Copyright (c) 2015, Scott Motte' },
  ]);
});

test('accepts a notice that contains every required snippet', () => {
  const gaps = findNoticeGaps(
    '## dotenv\n\nCopyright (c) 2015, Scott Motte\n',
    [{ heading: 'dotenv', snippets: ['Copyright (c) 2015, Scott Motte'] }],
  );
  assert.deepEqual(gaps, []);
});

test('does not treat a different heading as a match', () => {
  const gaps = findNoticeGaps('## h3-js\n\nh3\n', [
    { heading: 'h3', snippets: ['h3'] },
  ]);
  assert.deepEqual(gaps, [{ heading: 'h3', snippet: 'h3' }]);
});
```

- [x] **Step 2: Run the test and confirm it fails**

Run: `node --test scripts/thirdPartyNotices/noticeCheck.test.cjs`

Expected: fail because `noticeCheck.cjs` does not exist.

- [x] **Step 3: Implement the checker**

`findNoticeGaps` splits the markdown on lines, treating `\r\n` the same as `\n`. A heading is a line whose trimmed text starts with `#`. Heading text is the line with the leading hashes and one following space removed. Comparison is exact, so `h3-js` does not satisfy `h3`. A section body runs until the next heading of the same or higher level. A heading that is not in the file produces one gap for each of its snippets. Each exported function's comment says why it exists, when to call it, and what it returns.

The CLI, when run with no args, reads `THIRD-PARTY-NOTICES.md` and builds requirements this way:

- For each key of `package.json` `dependencies`, plus `electron`: the heading is the package name alone. Read `node_modules/<name>/package.json` `version` and add that version string as a snippet. Read the first existing file among `LICENSE`, `LICENSE.md`, `LICENSE.txt`. Add every trimmed line that starts with `Copyright` and does not contain `[yyyy]`. The Apache appendix template in `h3-js` is the line to ignore. If no copyright line remains, add `Version 2.0, January 2004`.
- For `electron` only, also require the snippet `LICENSES.chromium.html`.
- Then append this list. These headings are exact, and every snippet must appear in that section's body:

```javascript
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
```

If `findNoticeGaps` returns anything, print `heading: snippet` to stderr and exit 1. If a `node_modules` license file is missing, print that path and exit 1. Do not look for `LICENSES.chromium.html` on disk.

- [x] **Step 4: Run the test**

Run: `node --test scripts/thirdPartyNotices/noticeCheck.test.cjs`

Expected: pass. The CLI against the repo will still fail until Task 2 and Task 3 land. That failure is the point.

- [x] **Step 5: Wire the script**

In `package.json` add:

```json
"notices:check": "node scripts/thirdPartyNotices/noticeCheck.cjs"
```

Leave the `test` script unchanged. CI runs it before the notices file exists and before the Electron binary is downloaded. Task 4 adds the hook after `npm run notices:check` passes.

Do not commit.

---

### Task 2: Software notices

**Files:**

- Create: `THIRD-PARTY-NOTICES.md`
- Create: `static/vendor/leaflet/LICENSE`
- Create: `static/flags/subdivisions/LICENSE`

**Interfaces:**

- Consumes: the heading names in `fixedRequirements` and the package names from `package.json` `dependencies`, plus `electron`. A heading is the name only. The version goes in the body, because the checker compares heading text exactly.
- Produces: those sections, with license text copied from disk or from the URLs in the scope table

- [x] **Step 1: Copy the npm license files into sections**

For `better-sqlite3`, `dotenv`, `fflate`, `h3-js`, and `electron`, the section is:

```markdown
## <name>

<one sentence: what the app uses it for> Version <version from node_modules/<name>/package.json>.

License: <SPDX id from package-lock.json>

<source url>

<contents of that package's LICENSE file, unchanged>
```

Versions and SPDX ids are in the scope table. Source URLs are the `repository` or `homepage` fields in each package's `package.json`.

Under `electron`, the body must contain `LICENSES.chromium.html`. The sentence for that filename is written in Task 4, after the packager copy is specified. Until then, include the filename so the checker has something to find, and replace the sentence in Task 4 if the packager wording changes.

- [x] **Step 2: SQLite**

Add this section. The disclaimer and the three blessing lines are copied from `node_modules/better-sqlite3/deps/sqlite3/sqlite3.c` (the block that begins "The author disclaims copyright to this source code"). The public-domain sentences are the copyright page's, not a claim that the blessing is required:

```markdown
## SQLite

better-sqlite3 compiles SQLite from `node_modules/better-sqlite3/deps/sqlite3/sqlite3.c`, which identifies itself as SQLite version 3.51.3.

https://www.sqlite.org/copyright.html says the deliverable SQLite code is dedicated to the public domain and does not require a license. Anyone is free to copy, modify, publish, use, compile, sell, or distribute it.

The amalgamation header disclaims copyright and supplies this text in place of a legal notice:

The author disclaims copyright to this source code. In place of a legal notice, here is a blessing:

May you do good and not evil.
May you find forgiveness for yourself and forgive others.
May you share freely, never taking more than you give.
```

Keep the version string `version 3.51.3` if the amalgamation comment still says that. If the comment's version differs, use the comment.

- [x] **Step 3: Put Leaflet's license next to the vendored files and in the notices**

Write `static/vendor/leaflet/LICENSE` with the exact text of https://github.com/Leaflet/Leaflet/blob/v1.9.4/LICENSE (BSD 2-Clause, Copyright (c) 2010-2023, Volodymyr Agafonkin, and Copyright (c) 2010-2011, CloudMade).

The notices section heading is `## Leaflet`. Its body contains `1.9.4`, says the files live in `static/vendor/leaflet/`, states `License: BSD-2-Clause`, links https://leafletjs.com, and then contains the same LICENSE text. Also say Leaflet is loaded by `static/index.html` and is not listed in `package.json`.

- [x] **Step 4: Put the iso3166-flags MIT text with the SVGs**

Write `static/flags/subdivisions/LICENSE` with the MIT text whose copyright line is `Copyright (c) 2021 AJ McKenna`, from https://github.com/amckenna41/iso3166-flags/blob/main/LICENSE.

The notices section `## iso3166-flags` points at `static/flags/subdivisions/ATTRIBUTION.md` for the per-file list, states `License: MIT`, and contains that same MIT text. Leave `ATTRIBUTION.md` as it is.

- [x] **Step 5: Country flags**

Add `## country-flags` that repeats the statement already in `static/flags/README.md`: the upstream repository has no LICENSE file, the flags came from Wikimedia Commons, and that README says flags are not under copyright protection while other restrictions on how a flag is used may still apply. Name the pinned commit `c09927e63705529bbf59ca6684cd9b23225dddad`. Do not add a copyright line these files do not have.

`static/flag-unknown.svg` is part of this repository. Do not list it.

- [x] **Step 6: Run the unit test**

Run: `node --test scripts/thirdPartyNotices/noticeCheck.test.cjs`

Expected: pass. Do not commit.

---

### Task 3: Data credits and build tools

**Files:**

- Modify: `THIRD-PARTY-NOTICES.md`

**Interfaces:**

- Consumes: the notices file from Task 2
- Produces: sections the checker requires for Natural Earth, EarthEnv land cover, EarthEnv topography, and the six Python packages

- [x] **Step 1: Natural Earth**

```markdown
## Natural Earth

Map names, coasts, lakes, urban areas, airports, and ports are derived from Natural Earth. All versions of Natural Earth raster and vector map data are in the public domain. No permission is needed to use Natural Earth. Crediting the authors is unnecessary.

The maintainers offer this citation for people who want one: Made with Natural Earth.

https://www.naturalearthdata.com/about/terms-of-use/
```

That wording matches the terms page: public domain, credit unnecessary, optional short citation "Made with Natural Earth."

- [x] **Step 2: EarthEnv land cover**

This is the section that matters before a public push. The land-cover rasters are under CC BY-NC 4.0. Generated terrain shipped in this repo is sampled and classified from those rasters, so it is adapted material. CC BY-NC 4.0 allows sharing that adaptation for non-commercial purposes when the attribution below is kept. It does not allow commercial use. The notices file states the terms. It does not ask the EarthEnv authors for broader permission. That permission, or a replacement dataset, is a separate decision.

```markdown
## EarthEnv Consensus Land Cover

EarthEnv Global 1-km Consensus Land Cover Version 1 by Tuanmu & Jetz is licensed under a Creative Commons Attribution-NonCommercial 4.0 International License.

https://www.earthenv.org/landcover

https://creativecommons.org/licenses/by-nc/4.0/

Agent Wars samples those rasters onto H3 cells and classifies the samples into terrain categories. That sampling and classification is a modification of the licensed data.

Cite: Tuanmu, M.-N. and W. Jetz. 2014. A global 1-km consensus land-cover product for biodiversity and ecosystem modelling. Global Ecology and Biogeography 23(9): 1031-1045. https://doi.org/10.1111/geb.12182
```

The first sentence is the sentence published at https://www.earthenv.org/landcover. Keep it intact.

- [x] **Step 3: EarthEnv topography**

The section heading is `## EarthEnv Topography`. The body must contain `10.1038/sdata.2018.40`.

Open https://www.earthenv.org/topography and search the HTML for "licensed" and "Creative Commons". The page body retrieved on 2026-10-09 names GMTED2010 and SRTM4.1dev and gives this citation, and the retrieved text did not include a Creative Commons sentence:

Amatulli, G., Domisch, S., Tuanmu, M.-N., Parmentier, B., Ranipeta, A., Malczyk, J., and Jetz, W. (2018) A suite of global, cross-scale topographic variables for environmental and biodiversity modeling. Scientific Data 5: 180040. https://doi.org/10.1038/sdata.2018.40

If the HTML contains a license sentence, paste that sentence as the section's license statement. If it does not, write that the topography page states no separate license, that the layers are derived from GMTED2010 and SRTM, and include the citation above. GMTED2010 and SRTM are US government works. Say that only if you have confirmed it from a USGS or NASA page in the same change. Do not attach the land-cover CC BY-NC sentence to the topography layers unless the topography page does.

- [x] **Step 4: Pipeline packages**

Add `## Data-generation tools`. One short paragraph per row in the unshipped tables. The first sentence of each paragraph is the matching snippet in `fixedRequirements`, including the final period. `fiona is BSD 3-Clause.` keeps the spaces PyPI returned. `Python package h3 is Apache-2.0.` keeps that package distinct from `h3-js`. Each paragraph ends with: "This package is used while generating data. It is not included in the application." For PostgreSQL and PostGIS, end with: "The terrain pipeline README requires it. It is not included in the application."

The requirements entry for psycopg is `psycopg[binary]`. Say the LGPL applies to that tool, not to Agent Wars. Link https://www.psycopg.org/ and https://www.gnu.org/licenses/lgpl-3.0.html. Do not paste the LGPL or the GPL.

The README also names a PostgreSQL extension called `h3`. That extension is not the Python package and not `h3-js`. This repository does not name the extension's distribution, so say that, say it is not included in the application, and do not invent a license id for it.

- [x] **Step 5: Run the checker**

Run: `npm run notices:check`

Expected: exit 0. Do not commit.

---

### Task 4: Point readers at the file, and ship it in the package

**Files:**

- Modify: `README.md`
- Modify: `doc/terrain-pipeline.md`
- Modify: `electron-builder.config.cjs`
- Modify: `scripts/electronBuilderBaseConfig.cjs` only if the Chromium file path cannot be expressed from `electron-builder.config.cjs`

**Interfaces:**

- Consumes: `THIRD-PARTY-NOTICES.md`
- Produces: a README pointer, a terrain-doc pointer, and a packaged copy of the notices

- [x] **Step 1: README**

After the opening paragraph of `README.md`, add:

```markdown
Third-party software and data are credited in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
```

- [x] **Step 2: Terrain doc**

In `doc/terrain-pipeline.md`, in the opening section that names Natural Earth, add one sentence: credits and license terms for Natural Earth and EarthEnv, including the non-commercial term on the consensus land cover, are in `THIRD-PARTY-NOTICES.md` at the repository root. Do not copy the license text into that doc.

- [x] **Step 3: Package the notices**

In `electron-builder.config.cjs`, add `THIRD-PARTY-NOTICES.md` to the existing `files` array. Keep `dist`, `static`, `package.json`, `node_modules`, `generatedTerrainFiles`, and `regionalZipFiles`.

Keep the existing `extraResources` entries for `data/generated` and `regionalZipResource`. Append the Chromium license file only when the Electron binary is present. `require('node:fs')` at the top of that config file. The file is at `node_modules/electron/dist/LICENSES.chromium.html` after the binary download. This workspace has that file today.

```javascript
const fs = require('node:fs');
const chromiumLicenses = 'node_modules/electron/dist/LICENSES.chromium.html';
const electronDistVersion = 'node_modules/electron/dist/version';
if (fs.existsSync(electronDistVersion) && !fs.existsSync(chromiumLicenses)) {
  throw new Error('Electron binary is installed but node_modules/electron/dist/LICENSES.chromium.html is missing');
}
const chromiumResource = fs.existsSync(chromiumLicenses)
  ? [{ from: chromiumLicenses, to: 'LICENSES.chromium.html' }]
  : [];
```

Pass `extraResources: [ { from: 'data/generated', ... }, regionalZipResource, ...chromiumResource ]`. Replacing that array with only the Chromium entry would drop terrain and regional data from the package.

Loading this config during `npm test` is safe: CI has not downloaded the Electron binary yet, so both paths are missing and the config does not throw. `npm test` does not load this file today. Do not make it load the file.

In `THIRD-PARTY-NOTICES.md`, under `## electron`, state that a packaged build also includes Chromium, that Chromium's third-party notices are `LICENSES.chromium.html`, and that the packager copies that file into the release when the Electron binary is present.

- [x] **Step 4: Hook the check into npm test**

Append `&& npm run notices:check` to the end of the `test` script in `package.json`. Do this only after Step 3's notices text is in place, so the hook does not fail the suite on a half-written file.

- [x] **Step 5: Verify**

Run: `npm run notices:check`

Run: `node --test scripts/thirdPartyNotices/noticeCheck.test.cjs`

Expected: both exit 0.

Confirm `THIRD-PARTY-NOTICES.md` contains each heading in the scope tables. Confirm `static/vendor/leaflet/LICENSE` and `static/flags/subdivisions/LICENSE` exist. Do not commit.

## Self-review

- Direct shipped code, vendored copies, embedded SQLite, Electron, data sources, and direct Python tools each have a task.
- Full license text is required only where the license requires it for a redistributed work. Unshipped LGPL is identified and not pasted.
- The project license is left unset on purpose.
- CC BY-NC is stated with the licensor's sentence, the URI, the modification, and the citation.
- The checker fails closed when a new `dependencies` entry has no matching copyright line. Headings match exactly, so `h3-js` does not satisfy the Python package `h3`.
- `npm test` gains `notices:check` only after the notices file passes, and the check does not require the Electron binary. CI runs tests before that binary is downloaded.
- Packaging appends the Chromium license to `extraResources` and keeps the generated-data entries.

## Execution note

Do not commit. The copyright holder reviews the notices, and decides what to do about CC BY-NC land cover, before this repository is public.
