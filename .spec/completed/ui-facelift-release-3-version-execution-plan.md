# UI Facelift Release, Plan 3 of 3: Version 2.6.0 and Regression Pass

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Prepare release 2.6.0 as `doc/releasing.md` describes under Before the build: set the version, write `doc/release-notes/v2.6.0.md`, and update the version, the status, and the test count where the docs state them. Then run every automated check, including the smoke run, so the reviewer can do the manual regression pass and start the release build.

**Spec:** [ui-facelift-spec.md](ui-facelift-spec.md) is the target for the whole milestone. This plan is part 3 of the three that build the spec's Phase 8; [ui-facelift-release-execution-plan.md](ui-facelift-release-execution-plan.md) lists them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and the spec disagree, follow this plan and report the disagreement.

**What this plan changes:**

- `package.json` and `package-lock.json`: version 2.6.0, the same change `npm version 2.6.0 --no-git-tag-version` makes, as exact edits so the Exact-match check covers them.
- A new `doc/release-notes/v2.6.0.md`, from the 2.5.2 notes: downloads, first launch, setting up the key on the Opponent tab, what's new in 2.6.0, and the known limits.
- `README.md`: the executable names, the test count (896), and the Status version and progress. `doc/README.md`: the shipping version and the same progress sentence. `doc/ui-style-guide.md`: its two status notes are as of 2.6.0.

**Out of scope:**

- Committing, pushing, tagging, and running the Build workflow. Those are the reviewer's, after this plan (`doc/releasing.md`, Build and draft the release).
- Code. If a check or the regression pass finds a bug, report it; do not fix it in this plan.

**How this plan was checked:** every step below was applied to a copy of the repository in the state the previous plan leaves, and the result matched the verified files exactly. On that result, the fast loop, the full tests, and the smoke run against the real app in Electron passed. The numbers in Verify come from those runs, and the Exact-match check compares your files with that result.

## Ground Rules

- Follow `AGENTS.md` and every rule in `.cursor/rules/`. These matter most here:
  - **Never commit or push** (rule 11). The reviewer commits after reading your report.
  - **No plan or phase identifiers** (rule 12) in code, comments, tests, `doc/`, or configuration: no plan numbers, no "Phase 8", and no "facelift" outside `.spec/`. Every block in this plan already follows this.
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

- `check:renderer-types` prints `check-renderer-typecheck: ok`. It also prints an `entries=` count, a `resolved baseline entries=` count, and the baseline lines it no longer finds. Those are notes from the check, not failures.
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

**Version check.** The old version must be gone from the files that state the shipping version:

```powershell
Select-String -Path package.json, README.md, doc/README.md -Pattern '2.5.2' -SimpleMatch
Select-String -Path package.json -Pattern '"version": "2.6.0"' -SimpleMatch
```

The first prints nothing. The second prints one line.

**Link check.** Every relative link in `README.md` and in the Markdown files under `doc/` must name a file or folder that exists:

```powershell
node -e "const fs=require('fs'),path=require('path');const md=['README.md'];(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(p.endsWith('.md'))md.push(p)}})('doc');let bad=0;for(const f of md){const t=fs.readFileSync(f,'utf8');for(const m of t.matchAll(/\]\(([^)\s]+)\)/g)){const u=m[1];if(/^(https?:|mailto:|#)/.test(u))continue;const p=path.resolve(path.dirname(f),decodeURI(u.split('#')[0]));if(!fs.existsSync(p)){bad++;console.log('missing: '+f+' -> '+u)}}}console.log('links checked in '+md.length+' files, '+bad+' missing')"
```

It prints one `missing:` line per broken link, then a count.

**Smoke run.**

```powershell
npm run ui:smoke -- --label <label>
```

- The run builds the app and takes about four minutes. It opens the app window three times: it closes the app twice to change its throwaway copy of the match, then reopens it. Do not use the mouse or keyboard in those windows while it runs.
- It prints one `PASS` or `FAIL` line per check, then a summary line: `ui-smoke <label>: P passed, F failed, E page errors, N screenshots in <folder>`.
- The window can show a "map tiles failed to load" toast when the network is slow. That toast is not a failure.
- After a smoke run the SQLite module is built for Electron. `npm test` rebuilds it for Node by itself, and `npm start` works as usual.

## Before You Start

- [ ] **Read**

1. `doc/releasing.md`.
2. `doc/release-notes/v2.5.2.md`.
3. The Status section of `README.md`.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected: `git status --short` prints nothing, or only `.spec/` files. Then check that plan 2 is in and this plan is not:

```powershell
Test-Path doc/media/model-tab.png
Test-Path doc/release-notes/v2.6.0.md
[bool](Select-String -Path package.json -Pattern '"version": "2.5.2"' -SimpleMatch -Quiet)
```

Expected: `False`, `False`, `True`. Otherwise stop and report.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **896**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files, in this order:

- `package.json`
- `package-lock.json`
- `doc/release-notes/v2.6.0.md` (new)
- `README.md`
- `doc/README.md`
- `doc/ui-style-guide.md`

- [ ] **Step 1: Edit `package.json`**

The version becomes 2.6.0, as `npm version 2.6.0 --no-git-tag-version` would write it.

In `package.json`, find this line. It occurs exactly once:

```json
  "version": "2.5.2",
```

Replace it with:

```json
  "version": "2.6.0",
```

- [ ] **Step 2: Edit `package-lock.json`**

The same version, in the lock file's two places for this package.

1. In `package-lock.json`, find these lines. Together they occur exactly once:

```json
  "name": "agent-wars",
  "version": "2.5.2",
  "lockfileVersion": 3,
```

Replace them with:

```json
  "name": "agent-wars",
  "version": "2.6.0",
  "lockfileVersion": 3,
```

2. In `package-lock.json`, find this line. It occurs exactly once:

```json
      "version": "2.5.2",
```

Replace it with:

```json
      "version": "2.6.0",
```

- [ ] **Step 3: Create `doc/release-notes/v2.6.0.md`**

A new file: the release notes the draft-release job reads. Downloads and first-launch steps as in 2.5.2, the key set-up on the Opponent tab, what's new in the layout, and the known limits, including the placeholders.

Create `doc/release-notes/v2.6.0.md` with exactly this content:

````markdown
A turn-based grand strategy game on a real-Earth hex map. Your opponent is a large language model you choose through OpenRouter. Coding agents wrote the code; the story is told in the Agent Wars series in [*Standing Orders*](https://standingorders.substack.com).

## Downloads

| File | For |
| --- | --- |
| `agent-wars-2.6.0-windows-x64.zip` | Windows, x64 |
| `agent-wars-2.6.0-macos-arm64.zip` | macOS on Apple silicon |
| `agent-wars-2.6.0-linux-x64.tar.gz` | Linux, x64 |
| `SHA256SUMS.txt` | SHA-256 checksums for the three archives |

These are unsigned side-load builds, so Windows and macOS warn before the first launch.

- **Windows:** unzip, then run `Agent Wars v2.6.0.exe`. If SmartScreen stops it, choose **More info**, then **Run anyway**.
- **macOS:** unzip, then open `Agent Wars v2.6.0.app`. If macOS blocks it, open **System Settings > Privacy & Security** and choose **Open Anyway**.
- **Linux:** extract the archive, then run `./agent-wars`. That launcher handles Chromium's sandbox when the archive can't keep `chrome-sandbox` owned by root. On Ubuntu 23.10 and later, where AppArmor blocks unprivileged user namespaces, it starts without the sandbox and says so.

To check a download, compare its SHA-256 with the line in `SHA256SUMS.txt`: `Get-FileHash <file>` in PowerShell, `shasum -a 256 <file>` on macOS, or `sha256sum -c --ignore-missing SHA256SUMS.txt` on Linux.

## Before you play

- **Bring your own OpenRouter key.** Start a match, click **Opponent** on the console's tab rail, paste the key under **Commander**, choose a model, and click **Run**. OpenRouter bills your account for the opponent's model calls. Without a key the app still runs, but the opponent makes no model calls. The key stays on your computer and is sent only to OpenRouter ([SECURITY.md](https://github.com/michael-kitchin/agent-wars/blob/main/SECURITY.md)).
- **Map imagery needs an internet connection.** Map tiles come from Esri and OpenStreetMap.
- **Non-commercial use.** The app ships earth data under non-commercial terms, so the application as distributed is for non-commercial use. See [THIRD-PARTY-NOTICES.md](https://github.com/michael-kitchin/agent-wars/blob/main/THIRD-PARTY-NOTICES.md).

How a match plays is in [doc/how-to-play.md](https://github.com/michael-kitchin/agent-wars/blob/main/doc/how-to-play.md).

## What's in 2.6.0

A new layout. The rules, the opponent, and saved matches are unchanged.

- **The map takes the window.** A top bar runs across the top, and a console docks on the right. On Windows and Linux, the app's menu bar (File, Edit, View, and so on) stays hidden until you press Alt.
- **Top bar.** The two sides, then Production, Forces, Your home, and Enemy home, then the date and the turn. In a battle it becomes the battle header: the battle's hex and beat, a bar comparing each side's sub-units, and Exit Battle.
- **Game menu.** New game, Offer tactical battles, and Quit are in a menu under the top bar's menu button.
- **Console.** Orders, Reports, and Opponent tabs, with Ready at the bottom. Click the selected tab to fold the console to its rail and widen the map. Queued orders name their target hex, such as "→ E5 · 1h".
- **Reports tab.** Turn updates and the opponent's messages stay there after their toasts close.
- **Opponent tab.** Run, the API key, the model, and the reasoning effort, then the tool groups and the AI activity log, all on one tab. The line above Ready shows whether the opponent is planning, its model, and the match's cost.
- **Selection panel.** A bar at the map's bottom left names the selected hex and units and says what a double-click does next. Expand it to see the hex and each unit's orders. Ranged and Strike moved here. They stay on screen, greyed out with the reason in their tip, when the selection can't use them.
- **Map.** Weather, Tech, and the terrain legend are tabs across the top of the minimap. Selected units get a gold ring. Ranged and strike lines get arrowheads, and every order line gets a pale edge that keeps it readable on any terrain.
- **New-game screen.** The choices sit in a panel docked at the left, in Map, Forces, and Rules sections, beside a preview you can pan and zoom. Hide them to widen the map.

## Known limits

- There is no player-facing save slot or load list yet. SQLite keeps the match in progress on disk.
- Settings, Help, Save game, Load game, How to play, the Build and Forces tabs, the Control and Production map modes, Replay on a turn report, and Add another opponent are placeholders in this version.
- On macOS, Quit closes the window and the app stays in the dock.
- The macOS build is for Apple silicon only, and it hasn't been opened on a Mac yet, so its first-launch steps are untested.
- Model quality varies. A model without tool calls plays without the planning tools.
- This is a personal R&D project. It doesn't take issues or pull requests; security reports go through the repository's **Security** tab.
````

- [ ] **Step 4: Edit `README.md`**

Play It names the 2.6.0 executables. What's Inside gives the current test count, 896. Status gives the version and says what 2.6.0 adds.

1. In `README.md`, find these lines. Together they occur exactly once:

````markdown
- **Windows:** unzip, then run `Agent Wars v2.5.2.exe`. If SmartScreen stops it, choose **More info**, then **Run anyway**.
- **macOS:** unzip, then open `Agent Wars v2.5.2.app`. If macOS blocks it, open **System Settings > Privacy & Security** and choose **Open Anyway**.
````

Replace them with:

````markdown
- **Windows:** unzip, then run `Agent Wars v2.6.0.exe`. If SmartScreen stops it, choose **More info**, then **Run anyway**.
- **macOS:** unzip, then open `Agent Wars v2.6.0.app`. If macOS blocks it, open **System Settings > Privacy & Security** and choose **Open Anyway**.
````

2. In `README.md`, find this line. It occurs exactly once:

````markdown
- **Guardrails.** `npm test` builds the main process, then runs ESLint (with custom rules in [eslint-rules/](eslint-rules/)), a naming-convention check, a renderer type check, the main-process and tool tests (829 tests), and a third-party-notices check. The renderer runs with context isolation, without Node integration, and under a Content-Security-Policy.
````

Replace it with:

````markdown
- **Guardrails.** `npm test` builds the main process, then runs ESLint (with custom rules in [eslint-rules/](eslint-rules/)), a naming-convention check, a renderer type check, the main-process and tool tests (896 tests), and a third-party-notices check. The renderer runs with context isolation, without Node integration, and under a Content-Security-Policy.
````

3. In `README.md`, find these lines. Together they occur exactly once:

````markdown
- **Version:** 2.5.2, distributed as side-load builds only (no store, signing, or notarization).
- **Progress:** Phase 0 (hybrid AI validation) and Phase 1 (global strategic game) are complete. Phase 2 is complete through milestone 2.5 (regional game and rules enhancements), including tactical battles (2.1 to 2.4) and playtester UI fixes (2.45). Milestone 2.6 (player-facing save/load and session management) isn't shipped. See the [development plan (v3.4)](doc/devleopment-plan-v3.4.md); milestones 0.2 to 0.5 were a throwaway prototype that validated combat, tools, and the AI loop before the production baseline.
````

Replace them with:

````markdown
- **Version:** 2.6.0, distributed as side-load builds only (no store, signing, or notarization).
- **Progress:** Phase 0 (hybrid AI validation) and Phase 1 (global strategic game) are complete. Phase 2 is complete through milestone 2.5 (regional game and rules enhancements), including tactical battles (2.1 to 2.4) and playtester UI fixes (2.45). Release 2.6.0 redesigns the layout: a top bar, a console docked on the right, a selection panel on the map, and a new-game panel docked at the left. Player-facing save/load and session management, the development plan's milestone 2.6, isn't shipped. See the [development plan (v3.4)](doc/devleopment-plan-v3.4.md); milestones 0.2 to 0.5 were a throwaway prototype that validated combat, tools, and the AI loop before the production baseline.
````

- [ ] **Step 5: Edit `doc/README.md`**

The shipping version and the same status sentence.

In `doc/README.md`, find this line. It occurs exactly once:

````markdown
Shipping version as of this writing: **2.5.2** (`package.json`). Phase 0 (hybrid AI) and Phase 1 (global strategic game) are complete. Phase 2 is complete through milestone **2.5** (regional game and rules enhancements), including tactical battles (2.1 to 2.4) and playtester UI fixes (2.45). Milestone **2.6** (player-facing save/load and session management) is not shipped. Later polish, diplomacy, and async multiplayer remain unbuilt.
````

Replace it with:

````markdown
Shipping version as of this writing: **2.6.0** (`package.json`). Phase 0 (hybrid AI) and Phase 1 (global strategic game) are complete. Phase 2 is complete through milestone **2.5** (regional game and rules enhancements), including tactical battles (2.1 to 2.4) and playtester UI fixes (2.45). Release **2.6.0** redesigns the layout: a top bar, a console docked on the right, a selection panel on the map, and a new-game panel docked at the left. Player-facing save/load and session management, the development plan's milestone **2.6**, is not shipped. Later polish, diplomacy, and async multiplayer remain unbuilt.
````

- [ ] **Step 6: Edit `doc/ui-style-guide.md`**

The implementation-status and palette notes are as of 2.6.0.

1. In `doc/ui-style-guide.md`, find this text. It occurs exactly once:

````markdown
**Implementation status (2.5.0):** The live app is a map-first Electron window: Leaflet world map + canvas overlay, top bar, docked console with the Orders, Reports, and Opponent tabs, selection panel, minimap panel with map-mode tabs, hex tooltips, control tips, stack callout, build-queue popup, an update toast and a message toast at the top centre of the map, WASD/arrow pan, wheel zoom, NATO-inspired SVG unit glyphs, and tactical-entry magnifiers on contested hexes.
````

Replace it with:

````markdown
**Implementation status (2.6.0):** The live app is a map-first Electron window: Leaflet world map + canvas overlay, top bar, docked console with the Orders, Reports, and Opponent tabs, selection panel, minimap panel with map-mode tabs, hex tooltips, control tips, stack callout, build-queue popup, an update toast and a message toast at the top centre of the map, WASD/arrow pan, wheel zoom, NATO-inspired SVG unit glyphs, and tactical-entry magnifiers on contested hexes.
````

2. In `doc/ui-style-guide.md`, find this text. It occurs exactly once:

````markdown
**Implemented palette (2.5.0).
````

Replace it with:

````markdown
**Implemented palette (2.6.0).
````

## Verify

- [ ] **Step 7: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 8: Full tests**

Run the full tests. Expected: exit 0, test total **896**, failure total **0**.

- [ ] **Step 9: Version check**

Run the version check. Expected: the first command prints nothing, and the second prints one line from `package.json`.

- [ ] **Step 10: Link check**

Run the link check. Expected, as its only line:

```text
links checked in 63 files, 0 missing
```

- [ ] **Step 11: Exact match**

This proves that every file this plan creates or edits matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" package.json package-lock.json doc/release-notes/v2.6.0.md README.md doc/README.md doc/ui-style-guide.md
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `package.json` | `67f63c9f48eb9f01` |
| `package-lock.json` | `4491cfaeb32bc65d` |
| `doc/release-notes/v2.6.0.md` | `b21648ca82cb14fc` |
| `README.md` | `b5a76d83735b28df` |
| `doc/README.md` | `a7939f6c00ea0a8b` |
| `doc/ui-style-guide.md` | `e69ce768d3e4e41f` |

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.

- [ ] **Step 12: Smoke run**

```powershell
npm run ui:smoke -- --label release-check
```

Expected summary line:

```text
ui-smoke release-check: 527 passed, 0 failed, 0 page errors, 40 screenshots in F:\Projects\Personal\agent-wars-public\.test\ui-smoke\release-check
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/release-check/report.json`. Then open `01-new-game-startup.png`, `04-strategic-1280x720.png`, and `29-battle-start.png` in `.test/ui-smoke/release-check/` and describe each in your report; they are the new-game screen, a strategic turn, and a battle, all drawn without map tiles if the network is slow.

## Report

Report, in this order:

1. The final `git status --short`.
2. The test total and failure total from Step 8.
3. The output of every check in Verify, in order.
4. The smoke summary line, any `FAIL`, `NOTE`, or `PAGE-ERROR` lines, and what you saw in the three screenshots.
5. Anything you think is wrong in this plan, without having changed it.
6. The `doc/` files you changed. This plan changes exactly the `doc/` files listed under Steps.

Do not commit.

## For the Reviewer

These checks need a person. Run them after the report is in.

1. The manual regression pass, with `npm start` and a real model. If the app reopens a match, choose New game… in the game menu first.
2. New-game screen: the new-game bar, the setup panel's Map, Forces, and Rules sections, panning and zooming the preview, hiding and showing the choices, and switching between Global and Regional.
3. Start a global match: the top bar shows the sides, the four readouts, and the date; the console opens on Orders; the minimap panel shows Weather, Tech, and Legend tabs.
4. Opponent tab: set the key and a model, and click Run. Ready shows "AI:" and a time while the opponent plans, and the line above it follows.
5. Orders: select units (gold ring, and the selection bar names them), queue a move, a ranged attack, and a strike from the selection bar, then cancel one from its row's ×.
6. Click Ready: the turn plays back, toasts show at the top centre of the map, and the Reports tab counts them.
7. Collapse the console to its rail and expand it again. Shrink the window to 800 × 600: nothing runs off the window.
8. With Offer tactical battles checked in the game menu, play until a melee, choose Fight, play a beat, and click Exit Battle in the battle header.
9. Start a regional match from the game menu's New game…. On Windows, press Alt: the menu bar shows. Choose Quit: the app closes.
10. Read `doc/release-notes/v2.6.0.md`, then commit, push, and follow `doc/releasing.md` from Build and draft the release.

## Next

This completes the spec's Phase 8, and with it the UI facelift. Release 2.6.0 then follows `doc/releasing.md`.
