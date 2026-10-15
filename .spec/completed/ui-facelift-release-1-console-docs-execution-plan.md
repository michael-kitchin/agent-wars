# UI Facelift Release, Plan 1 of 3: Console Docs

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Bring the docs in line with the console, the column docked on the right that the facelift built. Rename the five `right-panel*.md` documents after what they describe, update every link to them, and say "console" wherever `doc/`, the README, and one code comment still say "right panel". The README's OpenRouter steps, which still name the Model tab, follow the Opponent tab.

**Spec:** [ui-facelift-spec.md](ui-facelift-spec.md) is the target for the whole milestone. This plan is part 1 of the three that build the spec's Phase 8; [ui-facelift-release-execution-plan.md](ui-facelift-release-execution-plan.md) lists them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and the spec disagree, follow this plan and report the disagreement.

**What this plan changes:**

- Five documents move: `right-panel.md` to `console.md`, `right-panel-command-bar.md` to `console-command-bar.md`, `right-panel-selection-and-orders.md` to `orders-tab.md`, `right-panel-model-tab.md` to `opponent-tab-commander.md`, and `right-panel-tools-tab.md` to `opponent-tab-tool-groups.md`. Three titles change: "Console", "Console Command Bar", and "Orders Tab".
- Every link to them follows, including the routing table and the element list in `doc/ux-specification.md`. Its visibility matrix's rows "Right panel" and "Selection and orders" become "Console" and "Orders tab".
- "Right panel", and "the panel" where it means the console, read "console" across `doc/ux/`, `doc/ui-style-guide.md`, and `doc/how-to-play.md`. The style guide's implementation-status line lists the new chrome.
- The README's Play It steps: start a match, click Opponent on the console's rail, then set the key, the model, and Run.
- One code comment in `src/renderer/gameplay/newGame.ts`.

**Out of scope:**

- Code identifiers keep their names: `#sidebar`, `sidebarSupport.ts`, the `#openrouter-*` ids, and the sidebar error line, as the spec's Compatibility Names say.
- The historical documents (`doc/devleopment-plan-v3.4.md`, `doc/poc-analysis.md`, and `doc/market-research.md`) and the release notes of past versions.
- Images and their captions (plan 2), and the version (plan 3).

**How this plan was checked:** every step below was applied to a copy of the repository at commit `d964411`, and the result matched the verified files exactly. On that result, the fast loop and the full tests passed, and the link check found no broken link. The numbers in Verify come from those runs, and the Exact-match check compares your files with that result.

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
- No step needs an API key. This plan runs no smoke run.

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

**Console sweep.** No maintained document, and no source file, may still say "right panel":

```powershell
Get-ChildItem doc -Recurse -Filter *.md | Where-Object { $_.FullName -notmatch 'release-notes|devleopment-plan|poc-analysis|market-research' } | Select-String -Pattern 'right panel', 'right-panel', 'right-side panel'
Select-String -Path README.md -Pattern 'right panel', 'right-panel', 'right-side panel', 'Model\*\* tab'
Get-ChildItem src -Recurse -Include *.ts | Select-String -Pattern 'right panel' -SimpleMatch
```

Each prints nothing when the sweep is complete. `Select-String` ignores case.

**Link check.** Every relative link in `README.md` and in the Markdown files under `doc/` must name a file or folder that exists:

```powershell
node -e "const fs=require('fs'),path=require('path');const md=['README.md'];(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(p.endsWith('.md'))md.push(p)}})('doc');let bad=0;for(const f of md){const t=fs.readFileSync(f,'utf8');for(const m of t.matchAll(/\]\(([^)\s]+)\)/g)){const u=m[1];if(/^(https?:|mailto:|#)/.test(u))continue;const p=path.resolve(path.dirname(f),decodeURI(u.split('#')[0]));if(!fs.existsSync(p)){bad++;console.log('missing: '+f+' -> '+u)}}}console.log('links checked in '+md.length+' files, '+bad+' missing')"
```

It prints one `missing:` line per broken link, then a count.

## Before You Start

- [ ] **Read**

1. `AGENTS.md` and each file in `.cursor/rules/`.
2. [ui-facelift-spec.md](ui-facelift-spec.md): How to Read This Document, Compatibility Names, and Phases.
3. `doc/ux-specification.md`: the routing table and the element list.
4. `doc/ux/right-panel.md`.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected:

- `git status --short` prints nothing, or only `.spec/` files.
- The last commit is `d964411 Doc moves.`, or a later commit of yours that changes only `.spec/`. If it is anything else, stop and report: every block in this plan was checked against `d964411`.

Then check that the five documents still have their old names, and that `.spec/` holds this phase's spec:

```powershell
Test-Path doc/ux/right-panel.md
Test-Path doc/ux/console.md
[bool](Select-String -Path .spec/ui-facelift-spec.md -Pattern 'ui-facelift-release-execution-plan.md' -SimpleMatch -Quiet)
```

Expected: `True`, `False`, `True`. Any other result: stop and report. A `False` from the last one means the reviewer has not yet copied this phase's spec into `.spec/`.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **896**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files, in this order:

- `src/renderer/gameplay/newGame.ts`
- `doc/ux/right-panel.md`, moved to `doc/ux/console.md`
- `doc/ux/right-panel-command-bar.md`, moved to `doc/ux/console-command-bar.md`
- `doc/ux/right-panel-selection-and-orders.md`, moved to `doc/ux/orders-tab.md`
- `doc/ux/right-panel-model-tab.md`, moved to `doc/ux/opponent-tab-commander.md`
- `doc/ux/right-panel-tools-tab.md`, moved to `doc/ux/opponent-tab-tool-groups.md`
- `doc/ux-specification.md`
- `doc/ux/ai-activity-log.md`
- `doc/ux/game-menu.md`
- `doc/ux/map-surface.md`
- `doc/ux/modes-and-transitions.md`
- `doc/ux/new-game-dialog.md`
- `doc/ux/notifications-and-feedback.md`
- `doc/ux/order-lifecycle.md`
- `doc/ux/reports-tab.md`
- `doc/ux/resolution-playback.md`
- `doc/ux/selection-model.md`
- `doc/ux/selection-panel.md`
- `doc/ux/tactical-battles-list.md`
- `doc/ux/top-bar.md`
- `doc/ui-style-guide.md`
- `doc/how-to-play.md`
- `README.md`

- [ ] **Step 1: Edit `src/renderer/gameplay/newGame.ts`**

A comment only: the map is resized beside the console.

In `src/renderer/gameplay/newGame.ts`, find this line. It occurs exactly once:

```ts
 *   sidebars, and overlay from the returned state. The overlay closes, and the map is resized beside the right panel,
```

Replace it with:

```ts
 *   sidebars, and overlay from the returned state. The overlay closes, and the map is resized beside the console,
```

- [ ] **Step 2: Checkpoint: build, types, and lint**

Run these one at a time:

```powershell
npm run build:main
npm run check:renderer-types
npm run lint
```

Each exits 0, and `check:renderer-types` prints `check-renderer-typecheck: ok`. An error here comes from the steps above: open the file the error names, compare it with its step, fix your copying mistake, and run the three again. If the steps as written cannot compile, stop and report.

- [ ] **Step 3: Move the five console documents**

Each document keeps its content; the next steps edit it under its new name. `Move-Item` moves a file without staging anything in git.

1. Run:

```powershell
Move-Item -LiteralPath doc/ux/right-panel.md -Destination doc/ux/console.md
```

2. Run:

```powershell
Move-Item -LiteralPath doc/ux/right-panel-command-bar.md -Destination doc/ux/console-command-bar.md
```

3. Run:

```powershell
Move-Item -LiteralPath doc/ux/right-panel-selection-and-orders.md -Destination doc/ux/orders-tab.md
```

4. Run:

```powershell
Move-Item -LiteralPath doc/ux/right-panel-model-tab.md -Destination doc/ux/opponent-tab-commander.md
```

5. Run:

```powershell
Move-Item -LiteralPath doc/ux/right-panel-tools-tab.md -Destination doc/ux/opponent-tab-tool-groups.md
```

Then check that the old names are gone and the new ones are there:

```powershell
(Get-ChildItem doc/ux -Filter 'right-panel*').Count
(Get-ChildItem doc/ux/console.md, doc/ux/console-command-bar.md, doc/ux/orders-tab.md, doc/ux/opponent-tab-commander.md, doc/ux/opponent-tab-tool-groups.md).Count
```

Expected: `0`, then `5`.

- [ ] **Step 4: Edit `doc/ux/console.md`**

Was `right-panel.md`. The title is now "Console", "the panel" and "the right panel" read "the console", and links name the renamed documents.

1. In `doc/ux/console.md`, find this line. It occurs exactly once:

````markdown
# Right Panel
````

Replace it with:

````markdown
# Console
````

2. In `doc/ux/console.md`, find these lines. Together they occur exactly once:

````markdown
Shown in Strategic planning, Tactical planning, Resolution playback, the tactical battles list, and Tactical annihilation. It is not on screen in New game or Game over, including while the new-game choices are hidden, and the map widens to the window's right edge. It accepts pointer input in Strategic planning, Tactical planning, and Resolution playback. While the tactical battles list is open, the panel stays visible and does not receive pointer input. In Tactical annihilation, pointer input on the panel is off except the annihilation dialog, which is not part of this panel.

## Information Displayed

- A tab rail on the panel's outer edge, with Orders, Reports, Opponent, Build, and Forces. Build and Forces are disabled in this version. Each tab is 56 × 58 px, an icon above a 9 px label, the same size as the map-mode tabs on the [minimap panel](minimap.md). The selected tab is marked while the panel is expanded, and the mark is cleared while the panel is collapsed.
- A header with the selected tab's name, a subtitle, and a button that collapses the panel. On the Orders tab the subtitle reads "N queued for turn T", or "N queued for beat B" in a battle, where N counts every row of the three order groups (`formatQueuedOrdersSubtitle` in `src/shared/orderRowDetail.ts`). On the Reports tab it reads "this match". On the Opponent tab it names the opponent's home region, as the top bar does.
- A count on the Orders tab in the rail: the number of queued orders, the same N. It is hidden while nothing is queued.
- A count on the Reports tab in the rail: the number of unread reports. It is hidden at zero. See [reports-tab.md](reports-tab.md).
- The Orders tab: the order groups. See [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md). The selected units, and the Ranged and Strike controls, are in the [selection panel](selection-panel.md) on the map.
- The Reports tab: what the map toasts showed during this match. See [reports-tab.md](reports-tab.md).
- The Opponent tab: four sections shown together, with no sub-tabs. Status holds Run and a sentence saying whether opponent planning is on. Commander holds the API key with the match cost, the model with refresh, and the reasoning effort. Tool groups holds the tool toggles in two columns. The AI activity log fills the height that is left. See [right-panel-model-tab.md](right-panel-model-tab.md), [right-panel-tools-tab.md](right-panel-tools-tab.md), and [ai-activity-log.md](ai-activity-log.md).
- A footer under the tab content, with the opponent status line above Ready. For Ready, see [right-panel-command-bar.md](right-panel-command-bar.md).
````

Replace them with:

````markdown
Shown in Strategic planning, Tactical planning, Resolution playback, the tactical battles list, and Tactical annihilation. It is not on screen in New game or Game over, including while the new-game choices are hidden, and the map widens to the window's right edge. It accepts pointer input in Strategic planning, Tactical planning, and Resolution playback. While the tactical battles list is open, the console stays visible and does not receive pointer input. In Tactical annihilation, pointer input on the console is off except the annihilation dialog, which is not part of the console.

## Information Displayed

- A tab rail on the console's outer edge, with Orders, Reports, Opponent, Build, and Forces. Build and Forces are disabled in this version. Each tab is 56 × 58 px, an icon above a 9 px label, the same size as the map-mode tabs on the [minimap panel](minimap.md). The selected tab is marked while the console is expanded, and the mark is cleared while the console is collapsed.
- A header with the selected tab's name, a subtitle, and a button that collapses the console. On the Orders tab the subtitle reads "N queued for turn T", or "N queued for beat B" in a battle, where N counts every row of the three order groups (`formatQueuedOrdersSubtitle` in `src/shared/orderRowDetail.ts`). On the Reports tab it reads "this match". On the Opponent tab it names the opponent's home region, as the top bar does.
- A count on the Orders tab in the rail: the number of queued orders, the same N. It is hidden while nothing is queued.
- A count on the Reports tab in the rail: the number of unread reports. It is hidden at zero. See [reports-tab.md](reports-tab.md).
- The Orders tab: the order groups. See [orders-tab.md](orders-tab.md). The selected units, and the Ranged and Strike controls, are in the [selection panel](selection-panel.md) on the map.
- The Reports tab: what the map toasts showed during this match. See [reports-tab.md](reports-tab.md).
- The Opponent tab: four sections shown together, with no sub-tabs. Status holds Run and a sentence saying whether opponent planning is on. Commander holds the API key with the match cost, the model with refresh, and the reasoning effort. Tool groups holds the tool toggles in two columns. The AI activity log fills the height that is left. See [opponent-tab-commander.md](opponent-tab-commander.md), [opponent-tab-tool-groups.md](opponent-tab-tool-groups.md), and [ai-activity-log.md](ai-activity-log.md).
- A footer under the tab content, with the opponent status line above Ready. For Ready, see [console-command-bar.md](console-command-bar.md).
````

3. In `doc/ux/console.md`, find these lines. Together they occur exactly once:

````markdown
- When the player clicks the selected tab, the panel collapses to its rail.
- When the player clicks the collapse button, the panel collapses to its rail.
- When the player clicks any tab while the panel is collapsed, the panel expands on that tab.
- The map takes the width the panel gives up, and gives it back when the panel expands.
- Turning Run on or off does not change the selected tab. See [right-panel-model-tab.md](right-panel-model-tab.md).

### Keyboard

- None for the panel as a whole. Fields inside a tab follow [input-map.md](input-map.md).

### Other

- The panel starts expanded on the Orders tab.
- The opponent status line updates whenever Run, the opponent's wait, the selected model, or the match cost changes.
- The selected tab, and whether the panel is collapsed, last until the app closes. Neither is saved.
````

Replace them with:

````markdown
- When the player clicks the selected tab, the console collapses to its rail.
- When the player clicks the collapse button, the console collapses to its rail.
- When the player clicks any tab while the console is collapsed, the console expands on that tab.
- The map takes the width the console gives up, and gives it back when the console expands.
- Turning Run on or off does not change the selected tab. See [opponent-tab-commander.md](opponent-tab-commander.md).

### Keyboard

- None for the console as a whole. Fields inside a tab follow [input-map.md](input-map.md).

### Other

- The console starts expanded on the Orders tab.
- The opponent status line updates whenever Run, the opponent's wait, the selected model, or the match cost changes.
- The selected tab, and whether the console is collapsed, last until the app closes. Neither is saved.
````

4. In `doc/ux/console.md`, find these lines. Together they occur exactly once:

````markdown
- The panel is never hidden just because a tactical battle is active.
- The panel is absent for the whole New game and Game over overlay, and present again as soon as that overlay closes.
- Exactly one tab's content shows while the panel is expanded.
- Ready is on screen whenever the panel is, expanded or collapsed.
````

Replace them with:

````markdown
- The console is never hidden just because a tactical battle is active.
- The console is absent for the whole New game and Game over overlay, and present again as soon as that overlay closes.
- Exactly one tab's content shows while the console is expanded.
- Ready is on screen whenever the console is, expanded or collapsed.
````

5. In `doc/ux/console.md`, find this line. It occurs exactly once:

````markdown
The panel stays visible in both theaters. Its order lists follow the active theater. See [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md).
````

Replace it with:

````markdown
The console stays visible in both theaters. Its order lists follow the active theater. See [orders-tab.md](orders-tab.md).
````

6. In `doc/ux/console.md`, find these lines. Together they occur exactly once:

````markdown
- [right-panel-command-bar.md](right-panel-command-bar.md)
- [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md)
- [reports-tab.md](reports-tab.md)
- [right-panel-tools-tab.md](right-panel-tools-tab.md)
- [right-panel-model-tab.md](right-panel-model-tab.md)
````

Replace them with:

````markdown
- [console-command-bar.md](console-command-bar.md)
- [orders-tab.md](orders-tab.md)
- [reports-tab.md](reports-tab.md)
- [opponent-tab-tool-groups.md](opponent-tab-tool-groups.md)
- [opponent-tab-commander.md](opponent-tab-commander.md)
````

- [ ] **Step 5: Edit `doc/ux/console-command-bar.md`**

Was `right-panel-command-bar.md`. The title is now "Console Command Bar". Says "console" where it said "right panel". Links name the renamed documents.

1. In `doc/ux/console-command-bar.md`, find these lines. Together they occur exactly once:

````markdown
# Right Panel Command Bar

Ready, in the right panel's footer, and the Ranged and air-strike controls in the [selection panel](selection-panel.md). The game-state readout is the date block in the [top bar](top-bar.md), or the battle header's status line in a battle.
````

Replace them with:

````markdown
# Console Command Bar

Ready, in the console's footer, and the Ranged and air-strike controls in the [selection panel](selection-panel.md). The game-state readout is the date block in the [top bar](top-bar.md), or the battle header's status line in a battle.
````

2. In `doc/ux/console-command-bar.md`, find these lines. Together they occur exactly once:

````markdown
Ready shows whenever the right panel does. Ranged and the air-strike controls show in the selection panel, which shows while units are selected. All of them follow the rules below in Strategic planning and Tactical planning. While the tactical battles list is open, the bar stays visible and does not receive pointer input. In New game and Game over the right panel and the selection panel are absent, so these controls are absent with them. In Tactical annihilation they are disabled or hidden as stated in [modes-and-transitions.md](modes-and-transitions.md).

## Information Displayed

- The Ready button, across the width of the footer, under the opponent status line. Its label is "Ready", or "AI:" plus the elapsed wait, while opponent planning is still running. While the right panel is collapsed, the status line is hidden, Ready narrows to the tab rail's width, and the "AI:" label takes two lines. The status line's own rules are in [right-panel.md](right-panel.md).
````

Replace them with:

````markdown
Ready shows whenever the console does. Ranged and the air-strike controls show in the selection panel, which shows while units are selected. All of them follow the rules below in Strategic planning and Tactical planning. While the tactical battles list is open, the bar stays visible and does not receive pointer input. In New game and Game over the console and the selection panel are absent, so these controls are absent with them. In Tactical annihilation they are disabled or hidden as stated in [modes-and-transitions.md](modes-and-transitions.md).

## Information Displayed

- The Ready button, across the width of the footer, under the opponent status line. Its label is "Ready", or "AI:" plus the elapsed wait, while opponent planning is still running. While the console is collapsed, the status line is hidden, Ready narrows to the tab rail's width, and the "AI:" label takes two lines. The status line's own rules are in [console.md](console.md).
````

3. In `doc/ux/console-command-bar.md`, find this line. It occurs exactly once:

````markdown
- [right-panel.md](right-panel.md)
````

Replace it with:

````markdown
- [console.md](console.md)
````

- [ ] **Step 6: Edit `doc/ux/orders-tab.md`**

Was `right-panel-selection-and-orders.md`, which described the Orders tab's order groups. The title is now "Orders Tab". Says "console" where it said "right panel". Links name the renamed documents.

1. In `doc/ux/orders-tab.md`, find this line. It occurs exactly once:

````markdown
# Right Panel Selection and Orders
````

Replace it with:

````markdown
# Orders Tab
````

2. In `doc/ux/orders-tab.md`, find this line. It occurs exactly once:

````markdown
Shown on the right panel's Orders tab while the panel is expanded. The player can use the lists in Strategic planning and Tactical planning, and they follow the active theater. While the tactical battles list is open, the lists stay visible while the panel is expanded and do not receive pointer input. See [modes-and-transitions.md](modes-and-transitions.md). In New game and Game over the panel is absent, so these lists are absent with it.
````

Replace it with:

````markdown
Shown on the console's Orders tab while the console is expanded. The player can use the lists in Strategic planning and Tactical planning, and they follow the active theater. While the tactical battles list is open, the lists stay visible while the console is expanded and do not receive pointer input. See [modes-and-transitions.md](modes-and-transitions.md). In New game and Game over the console is absent, so these lists are absent with it.
````

3. In `doc/ux/orders-tab.md`, find this line. It occurs exactly once:

````markdown
- The header's subtitle and the Orders tab's count follow the lists. See [right-panel.md](right-panel.md).
````

Replace it with:

````markdown
- The console header's subtitle and the Orders tab's count follow the lists. See [console.md](console.md).
````

4. In `doc/ux/orders-tab.md`, find this line. It occurs exactly once:

````markdown
- [right-panel.md](right-panel.md)
````

Replace it with:

````markdown
- [console.md](console.md)
````

- [ ] **Step 7: Edit `doc/ux/opponent-tab-commander.md`**

Was `right-panel-model-tab.md`. Its title already names the Opponent tab. Links name the renamed documents.

1. In `doc/ux/opponent-tab-commander.md`, find this text. It occurs exactly once:

````markdown
The [Tool groups](right-panel-tools-tab.md) section and the [AI activity log](ai-activity-log.md) show below these sections at the same time; the tab has no sub-tabs.
````

Replace it with:

````markdown
The [Tool groups](opponent-tab-tool-groups.md) section and the [AI activity log](ai-activity-log.md) show below these sections at the same time; the tab has no sub-tabs.
````

2. In `doc/ux/opponent-tab-commander.md`, find this line. It occurs exactly once:

````markdown
- The console footer's status line repeats whether planning is on, the selected model's name, and the match cost. See [right-panel.md](right-panel.md).
````

Replace it with:

````markdown
- The console footer's status line repeats whether planning is on, the selected model's name, and the match cost. See [console.md](console.md).
````

3. In `doc/ux/opponent-tab-commander.md`, find this line. It occurs exactly once:

````markdown
- When the selected model does not support tool calls, its consultations run without tools, whatever the Tool groups section says. See [right-panel-tools-tab.md](right-panel-tools-tab.md).
````

Replace it with:

````markdown
- When the selected model does not support tool calls, its consultations run without tools, whatever the Tool groups section says. See [opponent-tab-tool-groups.md](opponent-tab-tool-groups.md).
````

4. In `doc/ux/opponent-tab-commander.md`, find these lines. Together they occur exactly once:

````markdown
- [right-panel.md](right-panel.md)
- [right-panel-tools-tab.md](right-panel-tools-tab.md)
````

Replace them with:

````markdown
- [console.md](console.md)
- [opponent-tab-tool-groups.md](opponent-tab-tool-groups.md)
````

- [ ] **Step 8: Edit `doc/ux/opponent-tab-tool-groups.md`**

Was `right-panel-tools-tab.md`. Its title already names the Opponent tab. Links name the renamed documents.

1. In `doc/ux/opponent-tab-tool-groups.md`, find this line. It occurs exactly once:

````markdown
Shown while the console's Opponent tab is selected and the console is expanded, below the [Status and Commander](right-panel-model-tab.md) sections and above the [AI activity log](ai-activity-log.md). While the tactical battles list is open, the section stays visible while the console is expanded and does not receive pointer input. See [right-panel.md](right-panel.md). In New game and Game over the console is absent, so this section is absent with it.
````

Replace it with:

````markdown
Shown while the console's Opponent tab is selected and the console is expanded, below the [Status and Commander](opponent-tab-commander.md) sections and above the [AI activity log](ai-activity-log.md). While the tactical battles list is open, the section stays visible while the console is expanded and does not receive pointer input. See [console.md](console.md). In New game and Game over the console is absent, so this section is absent with it.
````

2. In `doc/ux/opponent-tab-tool-groups.md`, find these lines. Together they occur exactly once:

````markdown
- [right-panel.md](right-panel.md)
- [right-panel-model-tab.md](right-panel-model-tab.md)
````

Replace them with:

````markdown
- [console.md](console.md)
- [opponent-tab-commander.md](opponent-tab-commander.md)
````

- [ ] **Step 9: Edit `doc/ux-specification.md`**

The routing table and the element list name the renamed documents. The visibility matrix's rows "Right panel" and "Selection and orders" become "Console" and "Orders tab", and the glossary's pending order is "shown in a list on the console's Orders tab".

1. In `doc/ux-specification.md`, find these lines. Together they occur exactly once:

````markdown
| The right panel as a whole, its tabs, its footer status line, or collapsing it | [modes-and-transitions.md](ux/modes-and-transitions.md) | [right-panel.md](ux/right-panel.md) |
| Ready, Ranged, or Strike | [selection-model.md](ux/selection-model.md), [order-lifecycle.md](ux/order-lifecycle.md), [modes-and-transitions.md](ux/modes-and-transitions.md) | [right-panel-command-bar.md](ux/right-panel-command-bar.md) |
| Order lists on the Orders tab | [order-lifecycle.md](ux/order-lifecycle.md), [selection-model.md](ux/selection-model.md) | [right-panel-selection-and-orders.md](ux/right-panel-selection-and-orders.md) |
| The selection panel | [selection-model.md](ux/selection-model.md), [order-lifecycle.md](ux/order-lifecycle.md) | [selection-panel.md](ux/selection-panel.md) |
| The Opponent tab's tool groups | [modes-and-transitions.md](ux/modes-and-transitions.md) | [right-panel-tools-tab.md](ux/right-panel-tools-tab.md) |
| Run, its status sentence, API key, model, or reasoning effort | [modes-and-transitions.md](ux/modes-and-transitions.md), [notifications-and-feedback.md](ux/notifications-and-feedback.md) | [right-panel-model-tab.md](ux/right-panel-model-tab.md) |
````

Replace them with:

````markdown
| The console as a whole, its tabs, its footer status line, or collapsing it | [modes-and-transitions.md](ux/modes-and-transitions.md) | [console.md](ux/console.md) |
| Ready, Ranged, or Strike | [selection-model.md](ux/selection-model.md), [order-lifecycle.md](ux/order-lifecycle.md), [modes-and-transitions.md](ux/modes-and-transitions.md) | [console-command-bar.md](ux/console-command-bar.md) |
| Order lists on the Orders tab | [order-lifecycle.md](ux/order-lifecycle.md), [selection-model.md](ux/selection-model.md) | [orders-tab.md](ux/orders-tab.md) |
| The selection panel | [selection-model.md](ux/selection-model.md), [order-lifecycle.md](ux/order-lifecycle.md) | [selection-panel.md](ux/selection-panel.md) |
| The Opponent tab's tool groups | [modes-and-transitions.md](ux/modes-and-transitions.md) | [opponent-tab-tool-groups.md](ux/opponent-tab-tool-groups.md) |
| Run, its status sentence, API key, model, or reasoning effort | [modes-and-transitions.md](ux/modes-and-transitions.md), [notifications-and-feedback.md](ux/notifications-and-feedback.md) | [opponent-tab-commander.md](ux/opponent-tab-commander.md) |
````

2. In `doc/ux-specification.md`, find these lines. Together they occur exactly once:

````markdown
- [right-panel.md](ux/right-panel.md): the console docked on the right: its tab rail, collapsing it, and the footer that holds the opponent status line and Ready.
- [right-panel-command-bar.md](ux/right-panel-command-bar.md): Ready, and the Ranged and air strike controls in the selection panel.
- [right-panel-selection-and-orders.md](ux/right-panel-selection-and-orders.md): the Movement, Ranged attacks, and Air strikes groups on the Orders tab.
- [selection-panel.md](ux/selection-panel.md): the panel at the map's bottom-left that describes the selected units, their hex, and their orders, and holds Ranged and Strike.
- [right-panel-tools-tab.md](ux/right-panel-tools-tab.md): the Opponent tab's Tool groups section.
- [right-panel-model-tab.md](ux/right-panel-model-tab.md): the Opponent tab's Status and Commander sections: Run and its sentence, API key, model, reasoning effort, and the model description tooltip.
````

Replace them with:

````markdown
- [console.md](ux/console.md): the console docked on the right: its tab rail, collapsing it, and the footer that holds the opponent status line and Ready.
- [console-command-bar.md](ux/console-command-bar.md): Ready, and the Ranged and air strike controls in the selection panel.
- [orders-tab.md](ux/orders-tab.md): the Movement, Ranged attacks, and Air strikes groups on the Orders tab.
- [selection-panel.md](ux/selection-panel.md): the panel at the map's bottom-left that describes the selected units, their hex, and their orders, and holds Ranged and Strike.
- [opponent-tab-tool-groups.md](ux/opponent-tab-tool-groups.md): the Opponent tab's Tool groups section.
- [opponent-tab-commander.md](ux/opponent-tab-commander.md): the Opponent tab's Status and Commander sections: Run and its sentence, API key, model, reasoning effort, and the model description tooltip.
````

3. In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
- Pending order: a draft order shown in a right-panel list.
````

Replace it with:

````markdown
- Pending order: a draft order shown in a list on the console's Orders tab.
````

4. In `doc/ux-specification.md`, find these lines. Together they occur exactly once:

````markdown
| Right panel | Hidden | Shown | Disabled | Shown | Shown | Disabled | Hidden |
| Command bar | Hidden | Shown | Disabled | Shown | Changed | Disabled | Hidden |
| Selection and orders | Hidden | Shown | Disabled | Shown | Changed | Disabled | Hidden |
````

Replace them with:

````markdown
| Console | Hidden | Shown | Disabled | Shown | Shown | Disabled | Hidden |
| Command bar | Hidden | Shown | Disabled | Shown | Changed | Disabled | Hidden |
| Orders tab | Hidden | Shown | Disabled | Shown | Changed | Disabled | Hidden |
````

- [ ] **Step 10: Edit `doc/ux/ai-activity-log.md`**

Says "console" where it said "right panel". "The panel" reads "the console" too. Links name the renamed documents.

1. In `doc/ux/ai-activity-log.md`, find this line. It occurs exactly once:

````markdown
The log of AI interactions and errors on the right panel's Opponent tab.
````

Replace it with:

````markdown
The log of AI interactions and errors on the console's Opponent tab.
````

2. In `doc/ux/ai-activity-log.md`, find this line. It occurs exactly once:

````markdown
Shown at the bottom of the console's Opponent tab, under an "Activity log" heading below the [Tool groups](right-panel-tools-tab.md) section, filling the height that is left, in every mode where the panel is visible and expanded. While the tactical battles list is open, the log stays visible while the panel is expanded and does not receive pointer input. The log itself has no mode of its own. The log is absent in New game and Game over because the panel is absent.
````

Replace it with:

````markdown
Shown at the bottom of the console's Opponent tab, under an "Activity log" heading below the [Tool groups](opponent-tab-tool-groups.md) section, filling the height that is left, in every mode where the console is visible and expanded. While the tactical battles list is open, the log stays visible while the console is expanded and does not receive pointer input. The log itself has no mode of its own. The log is absent in New game and Game over because the console is absent.
````

3. In `doc/ux/ai-activity-log.md`, find these lines. Together they occur exactly once:

````markdown
- A new line is appended at the end, and the log scrolls to that line while it is shown. Showing the Opponent tab, or expanding the panel on it, scrolls the log to its newest line, so lines added while it was hidden are in view.
- Lines are not removed during a match.
- When a new match starts, from startup, New game, or game over, the log clears, together with the cost readout reset in the [Commander](right-panel-model-tab.md) section and on the footer status line, and the [Reports tab](reports-tab.md).
````

Replace them with:

````markdown
- A new line is appended at the end, and the log scrolls to that line while it is shown. Showing the Opponent tab, or expanding the console on it, scrolls the log to its newest line, so lines added while it was hidden are in view.
- Lines are not removed during a match.
- When a new match starts, from startup, New game, or game over, the log clears, together with the cost readout reset in the [Commander](opponent-tab-commander.md) section and on the footer status line, and the [Reports tab](reports-tab.md).
````

4. In `doc/ux/ai-activity-log.md`, find this line. It occurs exactly once:

````markdown
- [right-panel.md](right-panel.md)
````

Replace it with:

````markdown
- [console.md](console.md)
````

- [ ] **Step 11: Edit `doc/ux/game-menu.md`**

Links name the renamed documents.

In `doc/ux/game-menu.md`, find this line. It occurs exactly once:

````markdown
- [right-panel-model-tab.md](right-panel-model-tab.md)
````

Replace it with:

````markdown
- [opponent-tab-commander.md](opponent-tab-commander.md)
````

- [ ] **Step 12: Edit `doc/ux/map-surface.md`**

Says "console" where it said "right panel".

1. In `doc/ux/map-surface.md`, find this text. It occurs exactly once:

````markdown
In the other modes it fills the space under the top bar and beside the right panel.
````

Replace it with:

````markdown
In the other modes it fills the space under the top bar and beside the console.
````

2. In `doc/ux/map-surface.md`, find this text. It occurs exactly once:

````markdown
- When a match starts, the right panel is already on screen. The view frames that match's bounds in the map beside the panel, then zooms one level toward the player's infantry and armor.
````

Replace it with:

````markdown
- When a match starts, the console is already on screen. The view frames that match's bounds in the map beside the console, then zooms one level toward the player's infantry and armor.
````

3. In `doc/ux/map-surface.md`, find this line. It occurs exactly once:

````markdown
- Starting a match frames that match's bounds in the map beside the right panel before the player can act. A later turn does not return the view to that frame while the match's hex footprint is unchanged.
````

Replace it with:

````markdown
- Starting a match frames that match's bounds in the map beside the console before the player can act. A later turn does not return the view to that frame while the match's hex footprint is unchanged.
````

- [ ] **Step 13: Edit `doc/ux/modes-and-transitions.md`**

Says "console" where it said "right panel". Links name the renamed documents.

1. In `doc/ux/modes-and-transitions.md`, find these lines. Together they occur exactly once:

````markdown
The player sees the new-game overlay. The message is "Start the global game when ready." or "Start the regional game when ready." when no match is loaded, and "Start a new global game when ready." or "Start a new regional game when ready." when the player opened the overlay from the game menu during a match. The sentence follows the selected tab. A win or loss does not. The button reads "Start game". The body has three sections: Map, Forces, and Rules. Map holds the Global and Regional tabs. Global chooses a home region for each side. Regional chooses one region and a different side group for each side. Forces holds the Advanced tech line, game size, and each unit type's cap and price. Rules holds a level (Off, Low, or High) for each of the origin bonus, tech bonus, terrain bonus, and weather bonus, a starting month, and fog of war. The right panel and the selection panel are not on screen. The top bar is the new-game bar: the game menu button, the title "New game", Load game…, Settings, and Help, and the game menu works with New game… disabled. The setup panel is docked at the left, under the top bar, and the map fills the rest of the window beside it. Drag and the wheel pan and zoom the preview, with the choices showing or hidden, and a click, double-click, or right-click does not select, order, or change the selection. Hiding the choices leaves only the hide-choices button, and the map widens to the window's left edge. Ready is disabled. The map shows that tab's preview, as in [new-game-dialog.md](new-game-dialog.md). The minimap panel, the terrain legend, and the map's + and − zoom control are hidden. This mode ends when Start game succeeds and a match is loaded.

### Strategic planning

The player sees the top bar, the strategic world map, and the right panel. The top bar's date block shows the date and "Turn N · Planning". The player can pan and zoom, select units, draft orders, open build and stack popups, and press Ready when it is enabled. Strategic planning is blocked while the new-game overlay, the game-over overlay, or the tactical annihilation dialog is open, and it is replaced while a tactical battle is active or the tactical battles list is open.

While the Run control is pressed and the opponent's precomputed orders are not ready yet, Ready is disabled and its label becomes "AI:" plus an elapsed time. The footer status line reads "Opponent planning…" for that same wait. See [right-panel.md](right-panel.md). That wait is every-turn prefetch, and the first event-driven consult after a new game, after Run is turned on, or after Events is turned on. The map stays usable. Pressing Ready in that condition shows a map toast that planning is still running and does not end the turn. Turning Run off stops the wait, and Ready can end the turn without a precomputed plan. After a failed AI planning request, Ready becomes usable again with an empty opponent plan. Drafting, changing, or cancelling orders during that wait does not cancel or restart opponent planning.
````

Replace them with:

````markdown
The player sees the new-game overlay. The message is "Start the global game when ready." or "Start the regional game when ready." when no match is loaded, and "Start a new global game when ready." or "Start a new regional game when ready." when the player opened the overlay from the game menu during a match. The sentence follows the selected tab. A win or loss does not. The button reads "Start game". The body has three sections: Map, Forces, and Rules. Map holds the Global and Regional tabs. Global chooses a home region for each side. Regional chooses one region and a different side group for each side. Forces holds the Advanced tech line, game size, and each unit type's cap and price. Rules holds a level (Off, Low, or High) for each of the origin bonus, tech bonus, terrain bonus, and weather bonus, a starting month, and fog of war. The console and the selection panel are not on screen. The top bar is the new-game bar: the game menu button, the title "New game", Load game…, Settings, and Help, and the game menu works with New game… disabled. The setup panel is docked at the left, under the top bar, and the map fills the rest of the window beside it. Drag and the wheel pan and zoom the preview, with the choices showing or hidden, and a click, double-click, or right-click does not select, order, or change the selection. Hiding the choices leaves only the hide-choices button, and the map widens to the window's left edge. Ready is disabled. The map shows that tab's preview, as in [new-game-dialog.md](new-game-dialog.md). The minimap panel, the terrain legend, and the map's + and − zoom control are hidden. This mode ends when Start game succeeds and a match is loaded.

### Strategic planning

The player sees the top bar, the strategic world map, and the console. The top bar's date block shows the date and "Turn N · Planning". The player can pan and zoom, select units, draft orders, open build and stack popups, and press Ready when it is enabled. Strategic planning is blocked while the new-game overlay, the game-over overlay, or the tactical annihilation dialog is open, and it is replaced while a tactical battle is active or the tactical battles list is open.

While the Run control is pressed and the opponent's precomputed orders are not ready yet, Ready is disabled and its label becomes "AI:" plus an elapsed time. The footer status line reads "Opponent planning…" for that same wait. See [console.md](console.md). That wait is every-turn prefetch, and the first event-driven consult after a new game, after Run is turned on, or after Events is turned on. The map stays usable. Pressing Ready in that condition shows a map toast that planning is still running and does not end the turn. Turning Run off stops the wait, and Ready can end the turn without a precomputed plan. After a failed AI planning request, Ready becomes usable again with an empty opponent plan. Drafting, changing, or cancelling orders during that wait does not cancel or restart opponent planning.
````

2. In `doc/ux/modes-and-transitions.md`, find this text. It occurs exactly once:

````markdown
A dimmed backdrop covers the window, and the dialog is centered on the visible map area rather than on the map plus the right panel. The map, the top bar, the right panel, and the selection panel stay as they were when Ready paused, and they do not receive pointer input.
````

Replace it with:

````markdown
A dimmed backdrop covers the window, and the dialog is centered on the visible map area rather than on the map plus the console. The map, the top bar, the console, and the selection panel stay as they were when Ready paused, and they do not receive pointer input.
````

3. In `doc/ux/modes-and-transitions.md`, find this text. It occurs exactly once:

````markdown
Pan, zoom, hex tooltips, and right-click still work, the selection panel's close control still clears the selection, and the right panel keeps its own rules.
````

Replace it with:

````markdown
Pan, zoom, hex tooltips, and right-click still work, the selection panel's close control still clears the selection, and the console keeps its own rules.
````

4. In `doc/ux/modes-and-transitions.md`, find these lines. Together they occur exactly once:

````markdown
The player sees the battle map for one contested hex, the top bar as the battle header with Exit Battle, and the same right panel. The battle header names the battle and shows the beat. The player drafts tactical orders and presses Ready to commit a beat. Exit Battle is enabled while the player drafts. It is disabled from the tactical Ready commit until that beat's playback ends, and hidden while the annihilation dialog is open. The header's status line reads "Beat N · Tactical planning" while drafting. While a beat resolves it reads "Beat N · Tactical resolution", and N is already the next beat.

Clicks outside the battle area show an error toast and do not issue an order. The right panel stays usable. Strategic drafts are hidden for the duration of the battle and restored when it ends, except drafts whose units no longer exist.
````

Replace them with:

````markdown
The player sees the battle map for one contested hex, the top bar as the battle header with Exit Battle, and the same console. The battle header names the battle and shows the beat. The player drafts tactical orders and presses Ready to commit a beat. Exit Battle is enabled while the player drafts. It is disabled from the tactical Ready commit until that beat's playback ends, and hidden while the annihilation dialog is open. The header's status line reads "Beat N · Tactical planning" while drafting. While a beat resolves it reads "Beat N · Tactical resolution", and N is already the next beat.

Clicks outside the battle area show an error toast and do not issue an order. The console stays usable. Strategic drafts are hidden for the duration of the battle and restored when it ends, except drafts whose units no longer exist.
````

5. In `doc/ux/modes-and-transitions.md`, find these lines. Together they occur exactly once:

````markdown
The player sees an overlay with "You win!", "You lose.", or "All units destroyed.", and an Exit Battle button. The map, the top bar, the right panel, and the selection panel do not accept input. The in-battle Exit Battle control is hidden, and Ready is disabled. Any in-flight AI planning request is cancelled. This mode ends when the player presses Exit Battle, which leaves the battle, returns to strategic planning, and then runs Ready.

### Game over

The player sees the same overlay as New game. The message is "You win!" or "You lose." The button reads "New game". The right panel and the selection panel are not on screen, and the top bar is the same new-game bar. The map follows the same show and hide rules as New game, and Ready is disabled. The map shows the same preview as New game. The setup panel, the hide-choices button, and the hidden minimap panel, legend, and + and − zoom control match New game. Starting a new match leaves this mode for strategic planning.
````

Replace them with:

````markdown
The player sees an overlay with "You win!", "You lose.", or "All units destroyed.", and an Exit Battle button. The map, the top bar, the console, and the selection panel do not accept input. The in-battle Exit Battle control is hidden, and Ready is disabled. Any in-flight AI planning request is cancelled. This mode ends when the player presses Exit Battle, which leaves the battle, returns to strategic planning, and then runs Ready.

### Game over

The player sees the same overlay as New game. The message is "You win!" or "You lose." The button reads "New game". The console and the selection panel are not on screen, and the top bar is the same new-game bar. The map follows the same show and hide rules as New game, and Ready is disabled. The map shows the same preview as New game. The setup panel, the hide-choices button, and the hidden minimap panel, legend, and + and − zoom control match New game. Starting a new match leaves this mode for strategic planning.
````

6. In `doc/ux/modes-and-transitions.md`, find this text. It occurs exactly once:

````markdown
The top bar and the right panel are on screen, and the map view frames the new match beside the panel, as in [map-surface.md](map-surface.md).
````

Replace it with:

````markdown
The top bar and the console are on screen, and the map view frames the new match beside the console, as in [map-surface.md](map-surface.md).
````

7. In `doc/ux/modes-and-transitions.md`, find this line. It occurs exactly once:

````markdown
On the map, tactical play limits orders to the battle area and shows the battle turn. The top bar and the right panel stay visible in both theaters. In a battle the top bar shows the battle header, and the panel's order groups follow the active theater. Build markers are hidden when a battle starts. Tactical entry markers are a strategic-planning affordance. Exit Battle and the annihilation dialog exist only in a battle. Details live in [map-surface.md](map-surface.md), [right-panel.md](right-panel.md), [tactical-entry-markers.md](tactical-entry-markers.md), and [tactical-battle-controls.md](tactical-battle-controls.md).
````

Replace it with:

````markdown
On the map, tactical play limits orders to the battle area and shows the battle turn. The top bar and the console stay visible in both theaters. In a battle the top bar shows the battle header, and the console's order groups follow the active theater. Build markers are hidden when a battle starts. Tactical entry markers are a strategic-planning affordance. Exit Battle and the annihilation dialog exist only in a battle. Details live in [map-surface.md](map-surface.md), [console.md](console.md), [tactical-entry-markers.md](tactical-entry-markers.md), and [tactical-battle-controls.md](tactical-battle-controls.md).
````

8. In `doc/ux/modes-and-transitions.md`, find this line. It occurs exactly once:

````markdown
- AI wait is a condition on Ready inside Strategic planning and Tactical planning, not a mode. It never locks the map or the right panel.
````

Replace it with:

````markdown
- AI wait is a condition on Ready inside Strategic planning and Tactical planning, not a mode. It never locks the map or the console.
````

- [ ] **Step 14: Edit `doc/ux/new-game-dialog.md`**

Says "console" where it said "right panel". Links name the renamed documents.

1. In `doc/ux/new-game-dialog.md`, find this text. It occurs exactly once:

````markdown
The right panel and the selection panel are not on screen while it is open, including while the choices are hidden.
````

Replace it with:

````markdown
The console and the selection panel are not on screen while it is open, including while the choices are hidden.
````

2. In `doc/ux/new-game-dialog.md`, find this text. It occurs exactly once:

````markdown
The top bar shows the match status again, the right panel is on screen, and the view then frames the new match in the map beside the right panel, as in [map-surface.md](map-surface.md).
````

Replace it with:

````markdown
The top bar shows the match status again, the console is on screen, and the view then frames the new match in the map beside the console, as in [map-surface.md](map-surface.md).
````

3. In `doc/ux/new-game-dialog.md`, find this line. It occurs exactly once:

````markdown
- [right-panel-model-tab.md](right-panel-model-tab.md)
````

Replace it with:

````markdown
- [opponent-tab-commander.md](opponent-tab-commander.md)
````

- [ ] **Step 15: Edit `doc/ux/notifications-and-feedback.md`**

Links name the renamed documents.

In `doc/ux/notifications-and-feedback.md`, find this line. It occurs exactly once:

````markdown
- [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md)
````

Replace it with:

````markdown
- [orders-tab.md](orders-tab.md)
````

- [ ] **Step 16: Edit `doc/ux/order-lifecycle.md`**

Says "console" where it said "right panel".

In `doc/ux/order-lifecycle.md`, find this line. It occurs exactly once:

````markdown
- Draft: the order sits in a group on the right panel's Orders tab. Movement, ranged attacks, and air strikes are separate groups. Ferries are listed in the Movement group in both theaters, and their rows select and cancel the same way.
````

Replace it with:

````markdown
- Draft: the order sits in a group on the console's Orders tab. Movement, ranged attacks, and air strikes are separate groups. Ferries are listed in the Movement group in both theaters, and their rows select and cancel the same way.
````

- [ ] **Step 17: Edit `doc/ux/reports-tab.md`**

Says "console" where it said "right panel". "The panel" and "the header" read "the console" and "the console header". Links name the renamed documents.

1. In `doc/ux/reports-tab.md`, find this line. It occurs exactly once:

````markdown
Shown while the right panel's Reports tab is selected and the panel is expanded, in every mode where the panel is visible. While the tactical battles list is open, the tab stays visible while the panel is expanded and does not receive pointer input. In New game and Game over the panel is absent, so this tab is absent with it. Entries are filed whether or not the tab is shown.
````

Replace it with:

````markdown
Shown while the console's Reports tab is selected and the console is expanded, in every mode where the console is visible. While the tactical battles list is open, the tab stays visible while the console is expanded and does not receive pointer input. In New game and Game over the console is absent, so this tab is absent with it. Entries are filed whether or not the tab is shown.
````

2. In `doc/ux/reports-tab.md`, find this line. It occurs exactly once:

````markdown
- The header's subtitle reads "this match". The Reports tab in the rail shows the number of unread entries, and hides it at zero. See [right-panel.md](right-panel.md).
````

Replace it with:

````markdown
- The console header's subtitle reads "this match". The Reports tab in the rail shows the number of unread entries, and hides it at zero. See [console.md](console.md).
````

3. In `doc/ux/reports-tab.md`, find this line. It occurs exactly once:

````markdown
- [right-panel.md](right-panel.md)
````

Replace it with:

````markdown
- [console.md](console.md)
````

- [ ] **Step 18: Edit `doc/ux/resolution-playback.md`**

Says "console" where it said "right panel".

In `doc/ux/resolution-playback.md`, find this line. It occurs exactly once:

````markdown
- The right panel is not blocked by playback. Its own rules apply.
````

Replace it with:

````markdown
- The console is not blocked by playback. Its own rules apply.
````

- [ ] **Step 19: Edit `doc/ux/selection-model.md`**

Links name the renamed documents.

In `doc/ux/selection-model.md`, find this text. It occurs exactly once:

````markdown
See [right-panel-command-bar.md](right-panel-command-bar.md).
````

Replace it with:

````markdown
See [console-command-bar.md](console-command-bar.md).
````

- [ ] **Step 20: Edit `doc/ux/selection-panel.md`**

Links name the renamed documents.

1. In `doc/ux/selection-panel.md`, find this line. It occurs exactly once:

````markdown
  - A divider, then the Ranged and Strike controls. See [right-panel-command-bar.md](right-panel-command-bar.md).
````

Replace it with:

````markdown
  - A divider, then the Ranged and Strike controls. See [console-command-bar.md](console-command-bar.md).
````

2. In `doc/ux/selection-panel.md`, find this text. It occurs exactly once:

````markdown
See [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md).
````

Replace it with:

````markdown
See [orders-tab.md](orders-tab.md).
````

3. In `doc/ux/selection-panel.md`, find these lines. Together they occur exactly once:

````markdown
- [right-panel-command-bar.md](right-panel-command-bar.md)
- [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md)
````

Replace them with:

````markdown
- [console-command-bar.md](console-command-bar.md)
- [orders-tab.md](orders-tab.md)
````

- [ ] **Step 21: Edit `doc/ux/tactical-battles-list.md`**

Says "console" where it said "right panel". Links name the renamed documents.

1. In `doc/ux/tactical-battles-list.md`, find this text. It occurs exactly once:

````markdown
A dimmed backdrop covers the window, and the panel is centered on the visible map area (not on the map plus the right panel). The panel follows the map area when the window resizes. On a small map area the panel shrinks to fit, and a long list scrolls inside it. The map, the top bar, the right panel, and the selection panel stay visible underneath and do not receive pointer input.
````

Replace it with:

````markdown
A dimmed backdrop covers the window, and the panel is centered on the visible map area (not on the map plus the console). The panel follows the map area when the window resizes. On a small map area the panel shrinks to fit, and a long list scrolls inside it. The map, the top bar, the console, and the selection panel stay visible underneath and do not receive pointer input.
````

2. In `doc/ux/tactical-battles-list.md`, find this line. It occurs exactly once:

````markdown
- [right-panel-model-tab.md](right-panel-model-tab.md)
````

Replace it with:

````markdown
- [opponent-tab-commander.md](opponent-tab-commander.md)
````

- [ ] **Step 22: Edit `doc/ux/top-bar.md`**

Links name the renamed documents.

In `doc/ux/top-bar.md`, find this line. It occurs exactly once:

````markdown
- [right-panel.md](right-panel.md)
````

Replace it with:

````markdown
- [console.md](console.md)
````

- [ ] **Step 23: Edit `doc/ui-style-guide.md`**

The implementation-status line lists the top bar, the docked console, the selection panel, and the minimap panel in place of "OpenRouter side panel". The stylesheet note and the color table say "console", and the checklist names the Opponent tab where it said "OpenRouter panel".

1. In `doc/ui-style-guide.md`, find this text. It occurs exactly once:

````markdown
**Implementation status (2.5.0):** The live app is a map-first Electron window: Leaflet world map + canvas overlay, minimap, hex tooltips, control tips, stack callout, build-queue popup, OpenRouter side panel, an update toast and a message toast at the top centre of the map, WASD/arrow pan, wheel zoom, NATO-inspired SVG unit glyphs, and tactical-entry magnifiers on contested hexes.
````

Replace it with:

````markdown
**Implementation status (2.5.0):** The live app is a map-first Electron window: Leaflet world map + canvas overlay, top bar, docked console with the Orders, Reports, and Opponent tabs, selection panel, minimap panel with map-mode tabs, hex tooltips, control tips, stack callout, build-queue popup, an update toast and a message toast at the top centre of the map, WASD/arrow pan, wheel zoom, NATO-inspired SVG unit glyphs, and tactical-entry magnifiers on contested hexes.
````

2. In `doc/ui-style-guide.md`, find this text. It occurs exactly once:

````markdown
The top bar, the right panel's frame and tab rail, and the game menu are in `static/frameChrome.css`. The right panel's contents, such as the order groups, the rail counts, the Opponent tab's sections, and the footer status line, are in `static/consoleChrome.css`.
````

Replace it with:

````markdown
The top bar, the console's frame and tab rail, and the game menu are in `static/frameChrome.css`. The console's contents, such as the order groups, the rail counts, the Opponent tab's sections, and the footer status line, are in `static/consoleChrome.css`.
````

3. In `doc/ui-style-guide.md`, find these lines. Together they occur exactly once:

````markdown
| Top bar and right-panel footer bg | `#121b27` | `--chrome-bg-deep` |
| Right-panel tab rail bg | `#141f2d` | `--chrome-rail-bg` |
| Dividers inside the top bar and the rail | `#243246` | `--chrome-divider` |
| Battle header bg / bottom edge | `#17141f` / `#4a3247` | `--battle-header-bg` / `--battle-header-border`. The top bar's face while a battle is open, so the theater reads at a glance |
| Force bar, human / opponent | `#1b8a82` / `#b02a62` | `--force-bar-human` / `--force-bar-opponent`. Brighter forms of the side colors, so both parts of the battle header's force bar read on its dark face |
| Panel, popup, tooltip, and toast bg | `#1b2838` | Right panel, game menu, legend, hex tooltip, control tips, stack callout, build popup, new-game setup panel, tactical-battles dialog, update toast, message toast, and Reports tab |
````

Replace them with:

````markdown
| Top bar and console footer bg | `#121b27` | `--chrome-bg-deep` |
| Console tab rail bg | `#141f2d` | `--chrome-rail-bg` |
| Dividers inside the top bar and the rail | `#243246` | `--chrome-divider` |
| Battle header bg / bottom edge | `#17141f` / `#4a3247` | `--battle-header-bg` / `--battle-header-border`. The top bar's face while a battle is open, so the theater reads at a glance |
| Force bar, human / opponent | `#1b8a82` / `#b02a62` | `--force-bar-human` / `--force-bar-opponent`. Brighter forms of the side colors, so both parts of the battle header's force bar read on its dark face |
| Panel, popup, tooltip, and toast bg | `#1b2838` | Console, game menu, legend, hex tooltip, control tips, stack callout, build popup, new-game setup panel, tactical-battles dialog, update toast, message toast, and Reports tab |
````

4. In `doc/ui-style-guide.md`, find this text. It occurs exactly once:

````markdown
The right panel is not on screen.
````

Replace it with:

````markdown
The console is not on screen.
````

5. In `doc/ui-style-guide.md`, find this line. It occurs exactly once:

````markdown
- [ ] AI observatory of last briefing (OpenRouter panel is session/status, not a briefing viewer).
````

Replace it with:

````markdown
- [ ] AI observatory of last briefing (the console's Opponent tab shows session and status, not a briefing viewer).
````

- [ ] **Step 24: Edit `doc/how-to-play.md`**

Where messages appear: the activity log is on the console's Opponent tab.

In `doc/how-to-play.md`, find this line. It occurs exactly once:

````markdown
- **Right panel, Opponent tab, at the bottom (AI activity log):** AI interaction lines and errors, including a retry, a line when opponent planning stops, and a one-line copy of each turn update. Starting a new match clears it.
````

Replace it with:

````markdown
- **Console, Opponent tab, at the bottom (Activity log):** AI interaction lines and errors, including a retry, a line when opponent planning stops, and a one-line copy of each turn update. Starting a new match clears it.
````

- [ ] **Step 25: Edit `README.md`**

Play It: the OpenRouter steps start a match, then open the Opponent tab on the console's rail. The Model tab, which they named, is gone.

In `README.md`, find these lines. Together they occur exactly once:

````markdown
1. In the right-side panel, open the **Model** tab (the panel starts on it).
2. Paste your OpenRouter API key into the API key field (placeholder `Set key and blur to save`).
3. Click outside the field, or press Enter, to save. A saved key loads the model list.
4. Choose a model from Anthropic, Google, Meta, OpenAI, SpaceX, etc. **Refresh model list** reloads the list.
    - My go-to playtesting model is Google Gemini Flash Lite (version 3.5, currently). A fast, inexpensive, tool-using model that fights reasonably well. It can also finish a typical game for <$1.
    - Ollama/other local model support is on my radar (pun intended, I guess).
5. Click **Run** to start opponent planning.
````

Replace them with:

````markdown
1. Start a match from the new-game screen. The console then shows on the right.
2. On the console's tab rail, at the window's right edge, click **Opponent**.
3. Under **Commander**, paste your OpenRouter API key into the **API key** field (placeholder `Set key and blur to save`).
4. Click outside the field, or press Enter, to save. A saved key loads the model list.
5. Choose a model from Anthropic, Google, Meta, OpenAI, SpaceX, etc. The refresh button beside the list reloads it.
    - My go-to playtesting model is Google Gemini Flash Lite (version 3.5, currently). A fast, inexpensive, tool-using model that fights reasonably well. It can also finish a typical game for <$1.
    - Ollama/other local model support is on my radar (pun intended, I guess).
6. Click **Run**, at the top of the Opponent tab, to start opponent planning. The line above **Ready** shows whether the opponent is planning, its model, and the match's cost so far.
````

## Verify

- [ ] **Step 26: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 27: Full tests**

Run the full tests. Expected: exit 0, test total **896**, failure total **0**.

- [ ] **Step 28: Console sweep**

Run the console sweep. Expected: all three commands print nothing.

- [ ] **Step 29: Link check**

Run the link check. Expected, as its only line:

```text
links checked in 62 files, 0 missing
```

- [ ] **Step 30: Exact match**

This proves that every file this plan creates or edits matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" src/renderer/gameplay/newGame.ts doc/ux/console.md doc/ux/console-command-bar.md doc/ux/orders-tab.md doc/ux/opponent-tab-commander.md doc/ux/opponent-tab-tool-groups.md doc/ux-specification.md doc/ux/ai-activity-log.md doc/ux/game-menu.md doc/ux/map-surface.md doc/ux/modes-and-transitions.md doc/ux/new-game-dialog.md doc/ux/notifications-and-feedback.md doc/ux/order-lifecycle.md doc/ux/reports-tab.md doc/ux/resolution-playback.md doc/ux/selection-model.md doc/ux/selection-panel.md doc/ux/tactical-battles-list.md doc/ux/top-bar.md doc/ui-style-guide.md doc/how-to-play.md README.md
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `src/renderer/gameplay/newGame.ts` | `5639d30e03e94ce5` |
| `doc/ux/console.md` | `c0603d33a8d71511` |
| `doc/ux/console-command-bar.md` | `6f3a3168d459f8e2` |
| `doc/ux/orders-tab.md` | `fa289f2ccc66e696` |
| `doc/ux/opponent-tab-commander.md` | `dc2ea5e700b17627` |
| `doc/ux/opponent-tab-tool-groups.md` | `20df0582839986a0` |
| `doc/ux-specification.md` | `9d75ebf269f3024a` |
| `doc/ux/ai-activity-log.md` | `95276099974fcbbf` |
| `doc/ux/game-menu.md` | `7f1f7d6bf86d6656` |
| `doc/ux/map-surface.md` | `c0f1ff1c164132e8` |
| `doc/ux/modes-and-transitions.md` | `641c35aa35b8d318` |
| `doc/ux/new-game-dialog.md` | `b738e746766522f1` |
| `doc/ux/notifications-and-feedback.md` | `584d79e3f840ae16` |
| `doc/ux/order-lifecycle.md` | `1e9d81ee9f642282` |
| `doc/ux/reports-tab.md` | `8f9c6fe326e915ea` |
| `doc/ux/resolution-playback.md` | `00d151641ed4e633` |
| `doc/ux/selection-model.md` | `bd2ff89477ef1751` |
| `doc/ux/selection-panel.md` | `d2e313f9d587ad5c` |
| `doc/ux/tactical-battles-list.md` | `0920cc959fe3e46e` |
| `doc/ux/top-bar.md` | `17755d4b21dc9ba3` |
| `doc/ui-style-guide.md` | `cb03bbf6cb5b9146` |
| `doc/how-to-play.md` | `95fdbcf5f2715041` |
| `README.md` | `b10be55d729c8a30` |

These must print `False`, because this plan moves them:

```powershell
Test-Path doc/ux/right-panel.md
Test-Path doc/ux/right-panel-command-bar.md
Test-Path doc/ux/right-panel-selection-and-orders.md
Test-Path doc/ux/right-panel-model-tab.md
Test-Path doc/ux/right-panel-tools-tab.md
```

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.

## Report

Report, in this order:

1. The final `git status --short`.
2. The test total and failure total from Step 27.
3. The output of every check in Verify, in order.
4. Anything you think is wrong in this plan, without having changed it.
5. The `doc/` files you changed. This plan changes exactly the `doc/` files listed under Steps.

Do not commit.

## For the Reviewer

These checks need a person. Run them after the report is in.

1. Open `doc/ux-specification.md` in a Markdown preview and follow the routing table's links for the console, Ready, the Orders tab, and the Opponent tab: each opens its renamed document.
2. Read `doc/ux/console.md` from top to bottom: it says "console" throughout, and "panel" only for the minimap panel and the selection panel.
3. Follow the README's Play It steps in the app (`npm start`): start a match, click Opponent, set the key, choose a model, and click Run. The line above Ready says the opponent is planning.
4. Stage the result with `git add -A`: `git status --short` shows the five documents as renamed (`R`), because each keeps most of its content.

## Next

Before plan 2, capture the screenshots in [ui-facelift-release-shot-list.md](ui-facelift-release-shot-list.md). Plan 2 rewrites the captions to match them.
