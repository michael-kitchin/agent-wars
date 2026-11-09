# UI Facelift Frame, Plan 1 of 5: Smoke Harness and Baseline Screenshots

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Add a repeatable screenshot smoke run (`npm run ui:smoke`) and record screenshots of today's layout before anything on screen changes.

**Spec:** [ui-facelift-spec.md](ui-facelift-spec.md) is the target for the whole milestone. This plan is part 1 of the five that build the spec's Phase 2; [ui-facelift-frame-execution-plan.md](ui-facelift-frame-execution-plan.md) lists them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and the spec disagree, follow this plan and report the disagreement.

**What this plan changes:**

- A pinned `playwright-core` devDependency and an `npm run ui:smoke` script.
- An environment variable, `AGENT_WARS_USER_DATA_DIR`, that points the app at a throwaway user-data folder, so the smoke run never touches the player's match, API key, or model choice.
- The smoke harness in `scripts/ui-smoke/`: a runner, the layout checks, and unit tests for the checks.
- A paragraph in `doc/ux-specification.md` that tells developers how to run it.

**Out of scope:**

- Anything on screen. The app looks exactly as it does today.

**How this plan was checked:** every step below was applied to a copy of the repository at commit `586e83b`. On the result, the fast loop and the full tests passed, and the smoke run passed against the real app in Electron. The numbers in Verify come from those runs, and the Exact-match check compares your files with that result.

## Ground Rules

- Follow `AGENTS.md` and every rule in `.cursor/rules/`. These matter most here:
  - **Never commit or push** (rule 11). The reviewer commits after reading your report.
  - **No plan or phase identifiers** (rule 12) in code, comments, tests, `doc/`, or configuration: no plan numbers, no "Phase 2", and no "facelift" outside `.spec/`. Every block in this plan already follows this.
  - Do not add, reword, or "improve" anything this plan does not ask for. The blocks already meet the orienting-comment, file-size, naming, logging, and documentation rules. If you think something is wrong, finish the plan as written and say so in your report.
- **Shell:** Windows PowerShell, at the repository root `F:\Projects\Personal\agent-wars-public`. Run one command at a time; do not chain commands with `&&`.
- **Line endings:** your working tree uses Windows line endings (CRLF). The blocks in this plan show plain lines. Treat each line break in a block as the file's own line break, and keep each file's existing line endings. If your editing tool matches text byte for byte, convert a block to CRLF before matching, or edit line by line.
- **How to apply a step:**
  - "Create" and "Replace the whole file": write exactly the block's content.
  - "Find ... Replace ...": the Find text occurs exactly once in the file at that moment. Match it exactly, including leading spaces. A Find block can be part of a single line.
  - Every code block starts at the left margin of this document, so every space inside a block is part of the text.
  - If a Find text is missing, or occurs more than once, stop and report the step number, the file, and what you found. Do not adapt the edit.
- `static/renderer.js` is a committed build output. It changes whenever `npm run build:renderer` or `npm run ui:smoke` runs. Leave it changed; do not revert it.
- No step needs an API key, and the smoke run makes no model calls.

## Verification Commands

These are used in Before You Start and in Verify.

**Fast loop.** Run these one at a time:

```powershell
npm run build:main
npm run check:renderer-types
npm run lint
npm run naming:check
npm run build:renderer
npm run check:circular
```

Each command exits 0, with two expected outputs and one exception:

- `check:renderer-types` prints `check-renderer-typecheck: ok`.
- `naming:check` prints `naming check: ok`.
- `check:circular` is the exception. It exits 1 and prints `check-circular-deps: found circular dependencies`, then exactly two cycle lines starting with ` - `, both through `src/main/tools/standingOrders.ts`. Those two cycles already exist. A third line means this plan added a cycle: stop and report.

**Full tests.** Run these one at a time. `clean:dist` removes compiled copies of deleted tests, so the count is exact.

```powershell
npm run clean:dist
npm test 2>&1 | Tee-Object -FilePath "$env:TEMP\agent-wars-npm-test.log"
$testLog = Get-Content "$env:TEMP\agent-wars-npm-test.log"
($testLog | Select-String -Pattern '^\S+ tests (\d+)$' | ForEach-Object { [int]$_.Matches[0].Groups[1].Value } | Measure-Object -Sum).Sum
($testLog | Select-String -Pattern '^\S+ fail (\d+)$' | ForEach-Object { [int]$_.Matches[0].Groups[1].Value } | Measure-Object -Sum).Sum
```

The `npm test` output ends with the notices check, and the last two commands print the test total and the failure total. Error-looking log lines such as `hex-code-translator h3ToCode: missing mapping` come from tests that check failure paths and are expected.

**Smoke run.**

```powershell
npm run ui:smoke -- --label <label>
```

- The run builds the app, opens an app window, and takes about two minutes. Do not use the mouse or keyboard in that window while it runs.
- It prints one `PASS` or `FAIL` line per check, then a summary line: `ui-smoke <label>: P passed, F failed, E page errors, N screenshots in <folder>`.
- The window can show a "map tiles failed to load" toast when the network is slow. That toast is not a failure.
- After a smoke run the SQLite module is built for Electron. `npm test` rebuilds it for Node by itself, and `npm start` works as usual.

## Before You Start

- [ ] **Read**

1. `AGENTS.md` and each file in `.cursor/rules/`.
2. [ui-facelift-spec.md](ui-facelift-spec.md): How to Read This Document, Decisions, and Phases.
3. `doc/ux-specification.md`: Authority and How to Use This Suite.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected:

- `git status --short` prints nothing, or only `.spec/` files.
- The commit is `586e83b`. If it is not, stop and report: every block in this plan was checked against `586e83b`.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **829**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files:

- `.gitignore`
- `doc/ux-specification.md`
- `package.json`
- `scripts/run-main-node-tests.cjs`
- `scripts/ui-smoke/ui-smoke-checks.cjs`
- `scripts/ui-smoke/ui-smoke-checks.test.cjs`
- `scripts/ui-smoke/ui-smoke.cjs`
- `src/main/main.ts`
- `src/main/userDataDirOverride.test.ts`
- `src/main/userDataDirOverride.ts`

- [ ] **Step 1: Add Playwright as a pinned devDependency**

The smoke run drives the installed Electron through Playwright.

Run:

```powershell
npm install --save-dev --save-exact playwright-core@1.62.0
```

Expected:

- npm finishes without errors. Its `postinstall` rebuilds the SQLite module for Electron, as it always does.
- `package.json` `devDependencies` now has `"playwright-core": "1.62.0"`, with no `^`. `package-lock.json` changes too. `1.63.0` is not published; `1.62.0` is the latest stable release, and the baseline run used it.

`playwright-core` downloads no browsers. It drives the Electron that is already installed. Do not install `playwright` or `@playwright/test`, and do not run `npx playwright install`. Do not change `THIRD-PARTY-NOTICES.md`: dev dependencies don't ship, and `notices:check` reads only `dependencies`.

- [ ] **Step 2: Add the `ui:smoke` script**

The script builds the app and puts the SQLite module on Electron first, so a run always checks the current code.

In `package.json`, find this line. It occurs exactly once:

```json
    "start": "npm run generated:extract && npm run rebuild:native:electron && electron .",
```

Replace it with:

```json
    "start": "npm run generated:extract && npm run rebuild:native:electron && electron .",
    "ui:smoke": "npm run build && npm run rebuild:native:electron && node scripts/ui-smoke/ui-smoke.cjs",
```

- [ ] **Step 3: Ignore the smoke output**

Screenshots and reports go under `.test/`. They are review material, not source.

In `.gitignore`, find this line. It occurs exactly once:

```text
!data/generated/**/*.zip
```

Replace it with:

```text
!data/generated/**/*.zip

# UI smoke run output (screenshots and report.json)
.test/
```

- [ ] **Step 4: Add the user-data override**

The smoke run must never read or change the player's match, API key, or model choice. This module points Electron at a throwaway user-data folder when `AGENT_WARS_USER_DATA_DIR` is set, and does nothing otherwise. The test covers both cases.

1. Create `src/main/userDataDirOverride.ts` with exactly this content:

```ts
import * as fs from 'fs';
import * as path from 'path';
import type { App } from 'electron';
import { logDebug } from './logger';

/**
 * Environment variable that points the app at a different user-data folder.
 *
 * Purpose: Lets the UI smoke run start from a fresh, throwaway folder, so it never reads or changes the player's
 *   saved match, API key, or model choice.
 * When to use: Set it only for automated runs. Players never need it.
 * Expected outcome: Read once by `applyUserDataDirOverride`.
 * Exceptions: None.
 */
export const USER_DATA_DIR_ENV = 'AGENT_WARS_USER_DATA_DIR';

/**
 * Moves Electron's user-data folder when `AGENT_WARS_USER_DATA_DIR` is set.
 *
 * Purpose: The database, the extracted region packs, and the OpenRouter settings all live under `userData`.
 * When to use: Once at startup, before `app.whenReady()`, so every later `app.getPath('userData')` sees the new folder.
 * Expected outcome: With the variable set to a non-blank path, the folder is created when missing and `userData`
 *   becomes its absolute path. Without it, nothing changes. Either way one debug line is logged.
 * Exceptions: Throws when the folder cannot be created; a misconfigured automated run should stop at once.
 */
export function applyUserDataDirOverride(electronApp: App, env: NodeJS.ProcessEnv = process.env): void {
  const requested = env[USER_DATA_DIR_ENV]?.trim() ?? '';
  if (requested.length === 0) {
    logDebug('main applyUserDataDirOverride: not set; userData unchanged');
    return;
  }
  const userDataDir = path.resolve(requested);
  logDebug('main applyUserDataDirOverride', { userDataDir });
  fs.mkdirSync(userDataDir, { recursive: true });
  electronApp.setPath('userData', userDataDir);
}
```

2. Create `src/main/userDataDirOverride.test.ts` with exactly this content:

```ts
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import type { App } from 'electron';
import { applyUserDataDirOverride, USER_DATA_DIR_ENV } from './userDataDirOverride';

/**
 * Records `setPath` calls in place of Electron's `app`.
 *
 * Purpose: The override must only touch `userData`, and only when asked.
 * When to use: Each test below.
 * Expected outcome: `calls` lists every `[name, value]` pair passed to `setPath`.
 * Exceptions: None.
 */
function fakeApp(): { app: App; calls: Array<[string, string]> } {
  const calls: Array<[string, string]> = [];
  const app = { setPath: (name: string, value: string) => calls.push([name, value]) } as unknown as App;
  return { app, calls };
}

test('applyUserDataDirOverride creates the folder and moves userData to it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'user-data-override-test-'));
  try {
    const target = path.join(root, 'smoke-user-data');
    const { app, calls } = fakeApp();
    applyUserDataDirOverride(app, { [USER_DATA_DIR_ENV]: target });
    assert.deepEqual(calls, [['userData', target]]);
    assert.ok(fs.statSync(target).isDirectory());
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('applyUserDataDirOverride leaves userData alone when the variable is missing or blank', () => {
  const { app, calls } = fakeApp();
  applyUserDataDirOverride(app, {});
  applyUserDataDirOverride(app, { [USER_DATA_DIR_ENV]: '   ' });
  assert.deepEqual(calls, []);
});
```

- [ ] **Step 5: Call the override from `src/main/main.ts`**

1. In `src/main/main.ts`, find this line. It occurs exactly once:

```ts
import { logDebug, logError } from './logger';
```

Replace it with:

```ts
import { logDebug, logError } from './logger';
import { applyUserDataDirOverride } from './userDataDirOverride';
```

2. In `src/main/main.ts`, find these lines. Together they occur exactly once:

```ts
applyVersionedAppName();

```

Replace them with:

```ts
applyVersionedAppName();
applyUserDataDirOverride(app);

```

This call runs at module level, before `app.whenReady()`. Every `app.getPath('userData')` call in `src/main/` runs later, inside functions, so they all see the new folder.

- [ ] **Step 6: Add the smoke harness**

Three files and one registration: the checks (pure functions that turn a probe of the page into PASS or FAIL), the runner (starts Electron, plays a fixed match, records each scene), unit tests for the checks, and a line that makes `npm test` run those tests. Each later plan adds its own checks and scenes.

1. Create `scripts/ui-smoke/ui-smoke-checks.cjs` with exactly this content:

```js
/**
 * Layout checks for the UI smoke run.
 *
 * Purpose: Turns one probe of the page into PASS or FAIL results, so a layout change can be verified without
 *   comparing screenshots pixel by pixel.
 * When to use: From `ui-smoke.cjs`. `probePage` runs in the renderer; `runChecks` runs in Node.
 * Expected outcome: Each check names the scenes it applies to and the elements it reads. A check fails, and names
 *   the elements, when any of them is missing from the page.
 * Exceptions: None. A check that throws is reported as FAIL with the error message.
 */
'use strict';

/**
 * Scene names. Each check lists the scenes it applies to; the runner records one probe per scene.
 *
 * Purpose: Keeps scene names in one place for the runner and the checks.
 * When to use: The runner passes one of these, optionally followed by `@<width>x<height>`, to `runChecks`.
 * Expected outcome: Strings only; the runner owns the order.
 * Exceptions: None.
 */
const SCENES = Object.freeze({
  newGameStartup: 'new-game-startup',
  strategic: 'strategic',
  newGameReopened: 'new-game-reopened',
});

/**
 * Scenes that show the new-game overlay.
 *
 * Purpose: The overlay hides the match chrome, so these scenes get their own checks.
 * When to use: The `scenes` list of a check that applies only while the overlay is open.
 * Expected outcome: The first scene and the last scene of every run.
 * Exceptions: None.
 */
const NEW_GAME_SCENES = Object.freeze([SCENES.newGameStartup, SCENES.newGameReopened]);

/**
 * Scenes that show a match: every scene that is not a new-game scene.
 *
 * Purpose: A scene added to `SCENES` is covered by the match checks without editing them.
 * When to use: The `scenes` list of a check that applies while a match is on screen.
 * Expected outcome: Derived from `SCENES` and `NEW_GAME_SCENES`.
 * Exceptions: None.
 */
const MATCH_SCENES = Object.freeze(Object.values(SCENES).filter((scene) => !NEW_GAME_SCENES.includes(scene)));

/**
 * Collects what the checks read from the renderer page.
 *
 * Purpose: Runs inside the page through `page.evaluate`, so it may only use browser globals and its argument.
 * When to use: Once per scene, after the scene has settled, with every selector that any check reads.
 * Expected outcome: A plain object that can be passed back to Node. `elements` has one entry per selector:
 *   null when the selector matches nothing, otherwise its box, text, and the attributes the checks use.
 * Exceptions: None.
 */
function probePage(selectors) {
  /**
   * Describes one element for the checks.
   *
   * Purpose: Every check reads elements the same way.
   * When to use: For each selector passed to `probePage`.
   * Expected outcome: The element's box, whether it is shown, its trimmed text, and selected attributes,
   *   or null when the selector matches nothing.
   * Exceptions: None.
   */
  const describe = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const shown = el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    const ancestorIds = [];
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      if (parent.id) ancestorIds.push(parent.id);
    }
    return {
      x: rect.x,
      y: rect.y,
      w: rect.width,
      h: rect.height,
      shown,
      text: (el.textContent || '').trim(),
      disabled: el.disabled === true,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      canvasWidth: el instanceof HTMLCanvasElement ? el.width : null,
      canvasHeight: el instanceof HTMLCanvasElement ? el.height : null,
      collapsed: el.getAttribute('data-collapsed'),
      expanded: el.getAttribute('aria-expanded'),
      ancestorIds,
    };
  };
  const elements = {};
  for (const selector of selectors) elements[selector] = describe(selector);
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
    scroll: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight },
    activeElementId: document.activeElement ? document.activeElement.id : '',
    elements,
  };
}

/**
 * Reports whether two numbers are within one CSS pixel.
 *
 * Purpose: Layout boxes can land on fractional pixels; a one-pixel tolerance keeps checks stable.
 * When to use: Every geometry comparison in this file.
 * Expected outcome: True when `|a - b| <= 1`.
 * Exceptions: None.
 */
function near(a, b) {
  return Math.abs(a - b) <= 1;
}

/**
 * Formats a box for a failure message.
 *
 * Purpose: Failure lines should show the numbers that failed.
 * When to use: Inside check failure messages.
 * Expected outcome: `x,y wxh` rounded to whole pixels, with ` (hidden)` when the element is not shown.
 * Exceptions: None.
 */
function fmt(b) {
  return `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)}${b.shown ? '' : ' (hidden)'}`;
}

/**
 * The checks, one row each.
 *
 * Purpose: One table that a reviewer can read top to bottom.
 * When to use: Add a row when a layout rule needs a machine check. `needs` lists every selector the row reads;
 *   `run(p, el)` gets the probe and a lookup for those selectors, and returns null on success or a failure message.
 * Expected outcome: Each row is independent of the others.
 * Exceptions: None.
 */
const CHECKS = Object.freeze([
  {
    name: 'no-page-scroll',
    scenes: [...MATCH_SCENES, ...NEW_GAME_SCENES],
    needs: [],
    run: (p) => (p.scroll.w <= p.viewport.w + 1 && p.scroll.h <= p.viewport.h + 1
      ? null
      : `page scrolls: content ${p.scroll.w}x${p.scroll.h}, window ${p.viewport.w}x${p.viewport.h}`),
  },
  {
    name: 'map-fills-container',
    scenes: [...MATCH_SCENES, ...NEW_GAME_SCENES],
    needs: ['#canvas-container', '#main-map'],
    run: (p, el) => {
      const c = el('#canvas-container');
      const m = el('#main-map');
      return near(c.x, m.x) && near(c.y, m.y) && near(c.w, m.w) && near(c.h, m.h)
        ? null
        : `#main-map ${fmt(m)} differs from #canvas-container ${fmt(c)}`;
    },
  },
  {
    name: 'overlay-canvas-matches-container',
    scenes: MATCH_SCENES,
    needs: ['#canvas-container', '#map-overlay'],
    run: (p, el) => {
      const c = el('#canvas-container');
      const o = el('#map-overlay');
      if (!(near(c.x, o.x) && near(c.y, o.y) && near(c.w, o.w) && near(c.h, o.h))) {
        return `#map-overlay ${fmt(o)} differs from #canvas-container ${fmt(c)}`;
      }
      const expectedWidth = Math.floor(c.w) * p.viewport.dpr;
      const expectedHeight = Math.floor(c.h) * p.viewport.dpr;
      return near(o.canvasWidth, expectedWidth) && near(o.canvasHeight, expectedHeight)
        ? null
        : `canvas backing store ${o.canvasWidth}x${o.canvasHeight}, expected about ${expectedWidth}x${expectedHeight}`;
    },
  },
  {
    name: 'new-game-fills-window',
    scenes: NEW_GAME_SCENES,
    needs: ['#canvas-container', '#game-over-overlay'],
    run: (p, el) => {
      const c = el('#canvas-container');
      if (!el('#game-over-overlay').shown) return 'the new-game overlay is not shown';
      return near(c.x, 0) && near(c.y, 0) && near(c.w, p.viewport.w) && near(c.h, p.viewport.h)
        ? null
        : `#canvas-container ${fmt(c)} does not fill the ${p.viewport.w}x${p.viewport.h} window`;
    },
  },
  {
    name: 'frame-hidden-during-new-game',
    scenes: NEW_GAME_SCENES,
    needs: ['#sidebar'],
    run: (p) => {
      const shown = Object.entries(p.elements).filter(([, e]) => e.shown).map(([selector]) => selector);
      return shown.length === 0 ? null : `still shown during the new-game overlay: ${shown.join(', ')}`;
    },
  },
  {
    name: 'map-beside-console',
    scenes: MATCH_SCENES,
    needs: ['#canvas-container', '#sidebar'],
    run: (p, el) => {
      const c = el('#canvas-container');
      const s = el('#sidebar');
      return near(c.x, 0) && near(c.y, 0) && near(c.x + c.w, s.x) && near(c.y + c.h, p.viewport.h)
        ? null
        : `#canvas-container ${fmt(c)} should run from 0,0 to the right panel at x=${Math.round(s.x)} and the window bottom`;
    },
  },
  {
    name: 'scenario-turn-line',
    scenes: [SCENES.strategic],
    needs: ['#sidebar-turn'],
    run: (p, el) => {
      const turn = el('#sidebar-turn').text;
      return turn === 'Turn: 1 · September, Year 1' ? null : `#sidebar-turn reads "${turn}", expected "Turn: 1 · September, Year 1"`;
    },
  },
]);

/**
 * Lists every selector the checks read.
 *
 * Purpose: The runner probes these once per scene, so each check can read any of them.
 * When to use: Before calling `probePage`.
 * Expected outcome: Each selector once, in first-use order.
 * Exceptions: None.
 */
function probeSelectors(checks = CHECKS) {
  return [...new Set(checks.flatMap((check) => check.needs))];
}

/**
 * Runs every check that applies to one scene.
 *
 * Purpose: The runner calls this once per probe.
 * When to use: After `probePage` returns for that scene. Pass `checks` only in tests.
 * Expected outcome: One result per applicable check: `{ check, status: 'PASS' | 'FAIL', detail }`. A check whose
 *   elements are missing from the page fails and names them.
 * Exceptions: None; a check that throws becomes FAIL.
 */
function runChecks(sceneName, probe, checks = CHECKS) {
  const sceneKey = sceneName.split('@')[0];
  return checks
    .filter((check) => check.scenes.includes(sceneKey))
    .map((check) => {
      const missing = check.needs.filter((selector) => !probe.elements[selector]);
      if (missing.length > 0) return { check: check.name, status: 'FAIL', detail: `not in page: ${missing.join(', ')}` };
      const lookup = (selector) => probe.elements[selector];
      const scoped = { ...probe, elements: Object.fromEntries(check.needs.map((selector) => [selector, probe.elements[selector]])) };
      try {
        const failure = check.run(scoped, lookup);
        return { check: check.name, status: failure ? 'FAIL' : 'PASS', detail: failure || '' };
      } catch (err) {
        return { check: check.name, status: 'FAIL', detail: `check threw: ${err && err.message ? err.message : String(err)}` };
      }
    });
}

module.exports = {
  SCENES,
  probePage,
  probeSelectors,
  runChecks,
};
```

2. Create `scripts/ui-smoke/ui-smoke.cjs` with exactly this content:

```js
/**
 * UI smoke run: starts the built app in Electron, plays one fixed scenario, and records screenshots plus layout checks.
 *
 * Purpose: Lets a layout change be verified the same way every time, with a report a reviewer can read and
 *   screenshots a person can compare.
 * When to use: `npm run ui:smoke` (it builds first). Pass `-- --label <name>` to choose the output folder.
 * Expected outcome: Writes `.test/ui-smoke/<label>/` with numbered PNG files and `report.json`, prints one line per
 *   check, and exits 0 only when no check failed and the page threw no uncaught error.
 * Exceptions: Exits 1 when the app cannot start, the scenario cannot be set up, or a check fails.
 *
 * The run uses a fresh, temporary Electron user-data folder (`AGENT_WARS_USER_DATA_DIR`), so it never reads or
 * changes the player's saved match, API key, or model choice, and it never calls a model.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron: electron } = require('playwright-core');
const { SCENES, probePage, probeSelectors, runChecks } = require('./ui-smoke-checks.cjs');

/**
 * Repository root, two levels above this file.
 *
 * Purpose: The app is launched from the repository, and the output folder lives under it.
 * When to use: Launch arguments, the working directory, and the output path.
 * Expected outcome: An absolute path.
 * Exceptions: None.
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Window sizes for the strategic scene, in CSS pixels.
 *
 * Purpose: The layout must hold at the common sizes and at the app's minimum window size.
 * When to use: The strategic scene runs once per size. Every other scene uses the first size.
 * Expected outcome: 1280 x 720, 1920 x 1080, then the 800 x 600 minimum.
 * Exceptions: None.
 */
const VIEWPORTS = Object.freeze([
  { w: 1280, h: 720 },
  { w: 1920, h: 1080 },
  { w: 800, h: 600 },
]);

/**
 * The fixed scenario, as option values in the new-game overlay.
 *
 * Purpose: Every run shows the same match, so checks can compare known values.
 * When to use: Only by `startScenarioMatch`.
 * Expected outcome: Southern Europe against Northern Africa, a small game, starting in September.
 * Exceptions: None.
 */
const SCENARIO = Object.freeze({
  humanRegion: 'Southern Europe',
  aiRegion: 'Northern Africa',
  startMonth: '9',
  gameSize: 'small',
});

/**
 * How long to let the page settle, in milliseconds.
 *
 * Purpose: Map tiles, canvas redraws, and the new-game overlay's own start-up work finish before a probe.
 * When to use: After a size change (`resize`), a click (`click`), the overlay opening (`overlay`), and a match
 *   start (`start`).
 * Expected outcome: Fixed waits; the checks do not depend on map tiles having loaded.
 * Exceptions: None.
 */
const SETTLE_MS = Object.freeze({ resize: 1500, click: 500, overlay: 2500, start: 2500 });

/**
 * Reads `--label <name>` from the command line.
 *
 * Purpose: Keeps each run's output in its own folder, so an earlier run can be compared with a later one.
 * When to use: Once at start-up.
 * Expected outcome: The label, or `latest` when none is given. Only letters, digits, dots, dashes, and underscores are kept.
 * Exceptions: None.
 */
function readLabel(argv) {
  const index = argv.indexOf('--label');
  const raw = index >= 0 && argv[index + 1] ? argv[index + 1] : 'latest';
  const label = raw.replace(/[^A-Za-z0-9._-]/g, '');
  return label || 'latest';
}

/**
 * Sets the page to an exact CSS size and waits until the page reports it.
 *
 * Purpose: Screenshots and checks must describe the size they claim.
 * When to use: Before each sized scene.
 * Expected outcome: True when `innerWidth` and `innerHeight` match. Falls back to resizing the window's content
 *   area when viewport emulation does not take.
 * Exceptions: None; returns false when neither method reaches the size.
 */
async function setViewport(app, page, size) {
  const matches = async () => page.evaluate(([w, h]) => window.innerWidth === w && window.innerHeight === h, [size.w, size.h]);
  await page.setViewportSize({ width: size.w, height: size.h });
  await page.waitForTimeout(200);
  if (await matches()) return true;
  await app.evaluate(({ BrowserWindow }, s) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.setContentSize(s.w, s.h);
  }, size);
  await page.waitForTimeout(500);
  return matches();
}

/**
 * Waits for the new-game overlay to be open.
 *
 * Purpose: Both the first start and a new game opened from the match end on this overlay.
 * When to use: After launch, and after opening the overlay from the match.
 * Expected outcome: Resolves once `#game-over-overlay` is in the page without the `hidden` class.
 * Exceptions: Throws a Playwright timeout after 60 seconds.
 */
async function waitForNewGameOverlay(page) {
  await page.waitForFunction(() => {
    const overlay = document.getElementById('game-over-overlay');
    return overlay !== null && !overlay.classList.contains('hidden');
  }, null, { timeout: 60000 });
}

/**
 * Chooses the fixed scenario on the new-game overlay and starts the match.
 *
 * Purpose: Every run must show the same match so checks can compare known values.
 * When to use: Once, while the startup overlay is open.
 * Expected outcome: The overlay closes with Southern Europe against Northern Africa, a small game, starting in September.
 * Exceptions: Throws when a choice does not hold or the match does not start within 60 seconds.
 */
async function startScenarioMatch(page) {
  await page.waitForFunction((region) => {
    const select = document.getElementById('new-game-human-region-select');
    return select !== null && Array.from(select.options).some((o) => o.value === region || o.textContent.trim() === region);
  }, SCENARIO.humanRegion, { timeout: 60000 });
  // The overlay draws random homes and a random month after its lists load; let that finish first.
  await page.waitForTimeout(SETTLE_MS.overlay);
  await page.click('#new-game-tab-global');
  await page.selectOption('#new-game-human-region-select', SCENARIO.humanRegion);
  await page.selectOption('#new-game-ai-region-select', SCENARIO.aiRegion);
  await page.selectOption('#new-game-start-month', SCENARIO.startMonth);
  await page.selectOption('#new-game-size-select', SCENARIO.gameSize);
  await page.waitForTimeout(SETTLE_MS.click);
  const chosen = await page.evaluate(() => ({
    human: document.getElementById('new-game-human-region-select').value,
    ai: document.getElementById('new-game-ai-region-select').value,
    month: document.getElementById('new-game-start-month').value,
    size: document.getElementById('new-game-size-select').value,
  }));
  if (chosen.month !== SCENARIO.startMonth || chosen.size !== SCENARIO.gameSize
    || !chosen.human.includes(SCENARIO.humanRegion) || !chosen.ai.includes(SCENARIO.aiRegion)) {
    throw new Error(`scenario choices did not hold: ${JSON.stringify(chosen)}`);
  }
  await page.click('#new-game-btn');
  await page.waitForFunction(() => document.getElementById('game-over-overlay').classList.contains('hidden'), null, { timeout: 60000 });
  await page.waitForTimeout(SETTLE_MS.start);
}

/**
 * Opens the new-game overlay from the running match, the way a player would.
 *
 * Purpose: The last scene checks the overlay opened from a match, not only at startup.
 * When to use: For the last scene.
 * Expected outcome: The Model tab is selected, New is clicked, and the overlay is open.
 * Exceptions: Throws a Playwright timeout when a control is missing or the overlay does not open.
 */
async function openNewGameOverlay(page) {
  await page.click('#openrouter-tab-model');
  await page.click('#openrouter-new-btn');
  await waitForNewGameOverlay(page);
  await page.waitForTimeout(SETTLE_MS.click);
}

/**
 * Probes, checks, and photographs the page for one scene.
 *
 * Purpose: Every scene produces the same three things.
 * When to use: After the scene's clicks or resize have settled.
 * Expected outcome: Appends the scene's results to `report.results` and writes `<NN>-<scene>.png`.
 * Exceptions: None from the checks; Playwright errors propagate to the caller.
 */
async function recordScene(page, report, outDir, sceneName) {
  const probe = await page.evaluate(probePage, probeSelectors());
  for (const result of runChecks(sceneName, probe)) report.results.push({ scene: sceneName, ...result });
  report.sceneCount += 1;
  const fileName = `${String(report.sceneCount).padStart(2, '0')}-${sceneName.replace('@', '-')}.png`;
  await page.screenshot({ path: path.join(outDir, fileName) });
  report.screenshots.push(fileName);
}

/**
 * Runs every scene in order.
 *
 * Purpose: The scene order is part of the contract with the checks. The match starts after the first scene, and
 *   the new-game overlay is opened last because it ends the match view.
 * When to use: Once, after the app window exists.
 * Expected outcome: One recorded scene per step below, in this order.
 * Exceptions: Propagates Playwright and scenario errors.
 */
async function runScenes(app, page, report, outDir) {
  const first = VIEWPORTS[0];
  if (!(await setViewport(app, page, first))) report.notes.push(`could not size the page to ${first.w}x${first.h}`);
  await waitForNewGameOverlay(page);
  await page.waitForTimeout(SETTLE_MS.resize);
  await recordScene(page, report, outDir, SCENES.newGameStartup);

  await startScenarioMatch(page);
  for (const size of VIEWPORTS) {
    if (!(await setViewport(app, page, size))) {
      report.results.push({ scene: `${SCENES.strategic}@${size.w}x${size.h}`, check: 'viewport-size', status: 'FAIL', detail: 'the page did not take this size' });
      continue;
    }
    await page.waitForTimeout(SETTLE_MS.resize);
    await recordScene(page, report, outDir, `${SCENES.strategic}@${size.w}x${size.h}`);
  }
  await setViewport(app, page, first);
  await page.waitForTimeout(SETTLE_MS.resize);

  await openNewGameOverlay(page);
  await recordScene(page, report, outDir, SCENES.newGameReopened);
}

/**
 * Prints the report and returns the exit code.
 *
 * Purpose: The terminal output is what the implementing agent pastes back.
 * When to use: Once, at the end.
 * Expected outcome: One line per result, then a summary line. Exit code 1 when any check failed or the page threw.
 * Exceptions: None.
 */
function printReport(report, outDir) {
  for (const r of report.results) {
    console.log(`${r.status.padEnd(4)} ${r.scene} :: ${r.check}${r.detail ? ` :: ${r.detail}` : ''}`);
  }
  for (const note of report.notes) console.log(`NOTE ${note}`);
  for (const err of report.pageErrors) console.log(`PAGE-ERROR ${err}`);
  const passed = report.results.filter((r) => r.status === 'PASS').length;
  const failed = report.results.length - passed;
  console.log(`ui-smoke ${report.label}: ${passed} passed, ${failed} failed, ${report.pageErrors.length} page errors, ${report.screenshots.length} screenshots in ${outDir}`);
  return failed === 0 && report.pageErrors.length === 0 ? 0 : 1;
}

/**
 * Entry point.
 *
 * Purpose: Owns the app's lifetime and the temporary user-data folder.
 * When to use: Run by `npm run ui:smoke`.
 * Expected outcome: The app is closed and the temporary folder removed even when a scene fails.
 * Exceptions: Exits 1 on any failure.
 */
async function main() {
  const label = readLabel(process.argv);
  const outDir = path.join(REPO_ROOT, '.test', 'ui-smoke', label);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wars-ui-smoke-'));
  const report = { label, startedAt: new Date().toISOString(), sceneCount: 0, results: [], screenshots: [], notes: [], pageErrors: [], consoleErrors: [] };
  let app = null;
  let exitCode = 1;
  try {
    app = await electron.launch({
      executablePath: require('electron'),
      args: [REPO_ROOT],
      cwd: REPO_ROOT,
      env: { ...process.env, AGENT_WARS_USER_DATA_DIR: userDataDir },
      timeout: 60000,
    });
    const page = await app.firstWindow();
    page.on('pageerror', (err) => report.pageErrors.push(err && err.message ? err.message : String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') report.consoleErrors.push(msg.text());
    });
    await page.waitForLoadState('domcontentloaded');
    await runScenes(app, page, report, outDir);
    exitCode = printReport(report, outDir);
  } catch (err) {
    report.notes.push(`run stopped: ${err && err.stack ? err.stack : String(err)}`);
    printReport(report, outDir);
    exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    if (app) await app.close().catch(() => undefined);
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch (err) {
      // A file still held open by the closing app must not turn a passing run into a failure.
      console.log(`NOTE could not remove the temporary user-data folder ${userDataDir}: ${err && err.message ? err.message : String(err)}`);
    }
  }
  process.exit(exitCode);
}

main();
```

3. Create `scripts/ui-smoke/ui-smoke-checks.test.cjs` with exactly this content:

```js
#!/usr/bin/env node
'use strict';

/**
 * Unit tests for the UI smoke checks.
 *
 * Purpose: Covers how a check result is decided, without starting Electron.
 * When to use: Discovered by `scripts/run-main-node-tests.cjs` as an extra CJS test.
 * Expected outcome: Exits 0 when the pass, missing-element, and thrown-check contracts hold.
 * Exceptions: Assertion failures abort the process via node:test.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { probeSelectors, runChecks } = require('./ui-smoke-checks.cjs');

/**
 * A one-row check table for these tests.
 *
 * Purpose: The tests must not depend on the real checks, which change with the layout.
 * When to use: Pass as the `checks` argument of `runChecks` and `probeSelectors`.
 * Expected outcome: The `wide` check passes when `#panel` is at least 100 pixels wide.
 * Exceptions: None.
 */
const TEST_CHECKS = Object.freeze([
  {
    name: 'wide',
    scenes: ['scene'],
    needs: ['#panel'],
    run: (p, el) => (el('#panel').w >= 100 ? null : `#panel is ${el('#panel').w} wide`),
  },
]);

/**
 * Builds a probe holding one `#panel` element of the given width, or none.
 *
 * Purpose: Keeps each test to the one value it varies.
 * When to use: Each test below.
 * Expected outcome: The shape `probePage` returns, with only what the test check reads.
 * Exceptions: None.
 */
function probeWithPanel(width) {
  return { viewport: { w: 800, h: 600, dpr: 1 }, scroll: { w: 800, h: 600 }, activeElementId: '', elements: { '#panel': width === null ? null : { w: width } } };
}

test('runChecks passes a check whose rule holds, for a sized scene name', () => {
  assert.deepEqual(probeSelectors(TEST_CHECKS), ['#panel']);
  assert.deepEqual(runChecks('scene@800x600', probeWithPanel(120), TEST_CHECKS), [{ check: 'wide', status: 'PASS', detail: '' }]);
});

test('runChecks fails a check whose element is missing, and names it', () => {
  assert.deepEqual(runChecks('scene', probeWithPanel(null), TEST_CHECKS), [{ check: 'wide', status: 'FAIL', detail: 'not in page: #panel' }]);
});

test('runChecks reports a failing rule and a thrown error as FAIL', () => {
  assert.deepEqual(runChecks('scene', probeWithPanel(40), TEST_CHECKS), [{ check: 'wide', status: 'FAIL', detail: '#panel is 40 wide' }]);
  const throwing = [{ ...TEST_CHECKS[0], run: () => { throw new Error('boom'); } }];
  assert.deepEqual(runChecks('scene', probeWithPanel(120), throwing), [{ check: 'wide', status: 'FAIL', detail: 'check threw: boom' }]);
});
```

4. In `scripts/run-main-node-tests.cjs`, find this line. It occurs exactly once:

```js
      'renderer-typecheck-report.test.cjs',
```

Replace it with:

```js
      'renderer-typecheck-report.test.cjs',
      'ui-smoke/ui-smoke-checks.test.cjs',
```

`npm test` now runs the three harness unit tests. They do not start Electron.

- [ ] **Step 7: Document the smoke run in `doc/ux-specification.md`**

Future developers find the smoke run where they read about changing the UI.

In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
5. If the spec is silent or ambiguous, add an Open Question rather than inventing a requirement.
````

Replace it with:

````markdown
5. If the spec is silent or ambiguous, add an Open Question rather than inventing a requirement.

`npm run ui:smoke` checks the layout after a change. It builds the app, starts it in Electron with a throwaway user-data folder (the `AGENT_WARS_USER_DATA_DIR` environment variable), plays one fixed global match, and writes numbered screenshots and `report.json` to `.test/ui-smoke/<label>/`. Pass `-- --label <name>` to name that folder. It prints one PASS or FAIL line per check and exits with an error when any check fails. The checks are in `scripts/ui-smoke/ui-smoke-checks.cjs`; add one there when a layout rule needs a machine check.
````

## Verify

- [ ] **Step 8: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 9: Full tests**

Run the full tests. Expected: exit 0, test total **834**, failure total **0**.

- [ ] **Step 10: Exact match**

This proves that every file this plan creates or edits matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" .gitignore doc/ux-specification.md package.json scripts/run-main-node-tests.cjs scripts/ui-smoke/ui-smoke-checks.cjs scripts/ui-smoke/ui-smoke-checks.test.cjs scripts/ui-smoke/ui-smoke.cjs src/main/main.ts src/main/userDataDirOverride.test.ts src/main/userDataDirOverride.ts
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `.gitignore` | `e838853d48a83ea5` |
| `doc/ux-specification.md` | `c9083139517ef6f0` |
| `package.json` | `a054838a9079d653` |
| `scripts/run-main-node-tests.cjs` | `96d7bd605ab5a1ca` |
| `scripts/ui-smoke/ui-smoke-checks.cjs` | `85379f01e09db321` |
| `scripts/ui-smoke/ui-smoke-checks.test.cjs` | `3b2df886e877df9b` |
| `scripts/ui-smoke/ui-smoke.cjs` | `3d722da10a2206b0` |
| `src/main/main.ts` | `44db0baaa5d0ef99` |
| `src/main/userDataDirOverride.test.ts` | `167bf4c4c069ecca` |
| `src/main/userDataDirOverride.ts` | `217d592b2e463c58` |

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.

`package.json` is written partly by npm. If only its hash differs, and `git diff -- package.json` shows nothing but the `playwright-core` line and the `ui:smoke` line, put that diff in your report and continue.


- [ ] **Step 11: Smoke run**

```powershell
npm run ui:smoke -- --label baseline
```

Expected summary line. The recorded run used `F:\Projects\Personal\agent-wars-public`. Another checkout is fine when the counts match and the path ends in `.test\ui-smoke\baseline`.

```text
ui-smoke baseline: 23 passed, 0 failed, 0 page errors, 5 screenshots in <repository>\.test\ui-smoke\baseline
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/baseline/report.json`.

- [ ] **Step 12: Look at the screenshots**

Open each screenshot in `.test/ui-smoke/baseline/` named below and compare it with the expected image in `.spec/`. The layout, the text, and the controls must match. Two differences are expected: the expected images were made without map tiles, so their basemap is plain grey, and they can show a "map tiles failed to load" toast.

- `02-strategic-1280x720.png` against [ui-facelift-frame-1-expected-strategic.png](ui-facelift-frame-1-expected-strategic.png): Today's layout: the map on the left and the 320 px right panel. The panel reads "Selected hex", then "Game state" with "Phase: Planning" and "Turn: 1 · September, Year 1", then Ready, the order lists, the Tools and Model tabs, and the model row with New and Tactical battles. Southern Europe and Northern Africa are in the middle of the map.

Describe what you see in your report. If an arrangement differs, stop and report.

## Report

Report, in this order:

1. The final `git status --short`.
2. The test total and failure total from Step 9.
3. The output of the Exact-match check.
4. The smoke summary line, and any `FAIL`, `NOTE`, or `PAGE-ERROR` lines.
5. What you saw in each screenshot from Step 12.
6. Anything you think is wrong in this plan, without having changed it.
7. The `doc/` files you changed. This plan changes exactly the `doc/` files listed under Steps.

Do not commit.

## For the Reviewer

These checks need a person at the app with real data. Run `npm start` after the report is in.

1. Run `npm start`. Your own match, API key, and model choice are as they were before the smoke run. The run used a temporary folder.
2. Open `.test/ui-smoke/baseline/` and look through the five screenshots. Later plans compare against them.

Spec disagreements: none. This plan adds the smoke run and leaves the screen as it is.

## Next

Plan 2 adds the top bar and the docked console with its tabs.
