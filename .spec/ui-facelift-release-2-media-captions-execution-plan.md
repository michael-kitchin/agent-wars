# UI Facelift Release, Plan 2 of 3: Media Captions

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Make the README and How to play describe the screenshots the reviewer captured from [ui-facelift-release-shot-list.md](ui-facelift-release-shot-list.md). Rewrite the captions and alternative text that name the old layout, point the README at the two renamed images, and delete the two old images they replace. Then check that every image link resolves and every image in `doc/media/` is used.

**Spec:** [ui-facelift-spec.md](ui-facelift-spec.md) is the target for the whole milestone. This plan is part 2 of the three that build the spec's Phase 8; [ui-facelift-release-execution-plan.md](ui-facelift-release-execution-plan.md) lists them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and the spec disagree, follow this plan and report the disagreement.

**What this plan changes:**

- `README.md`: the opening image's caption, the What's Inside image's alternative text, and the OpenRouter table, which names `opponent-commander.png` and `opponent-activity.png` in place of `model-tab.png` and `tools-tab.png`.
- `doc/how-to-play.md`: the captions and alternative text for the new-game previews, movement planning, Ranged, Strike, and the battle screen. One alternative text loses a duplicated "Step 2:".
- `doc/media/model-tab.png` and `doc/media/tools-tab.png` are deleted.

**Out of scope:**

- Capturing the images. The reviewer does that from the shot list before this plan. This plan does not open, crop, convert, or judge any image.
- Captions of the images the shot list keeps.
- Code. This plan changes only Markdown and deletes two images, so it runs no build, tests, or smoke run.

**How this plan was checked:** every step below was applied to a copy of the repository in the state the previous plan leaves, and the result matched the verified files exactly. On that result, the link check and the media check passed, with stand-ins for the reviewer's two new images. The numbers in Verify come from those runs, and the Exact-match check compares your files with that result.

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
- No step needs an API key or the app.

## Verification Commands

These are used in Before You Start and in Verify.

**Link check.** Every relative link in `README.md` and in the Markdown files under `doc/` must name a file or folder that exists:

```powershell
node -e "const fs=require('fs'),path=require('path');const md=['README.md'];(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(p.endsWith('.md'))md.push(p)}})('doc');let bad=0;for(const f of md){const t=fs.readFileSync(f,'utf8');for(const m of t.matchAll(/\]\(([^)\s]+)\)/g)){const u=m[1];if(/^(https?:|mailto:|#)/.test(u))continue;const p=path.resolve(path.dirname(f),decodeURI(u.split('#')[0]));if(!fs.existsSync(p)){bad++;console.log('missing: '+f+' -> '+u)}}}console.log('links checked in '+md.length+' files, '+bad+' missing')"
```

It prints one `missing:` line per broken link, then a count.

**Media check.** Every file in `doc/media/` must be named by `README.md` or a Markdown file under `doc/`:

```powershell
node -e "const fs=require('fs'),path=require('path');const md=['README.md'];(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(p.endsWith('.md'))md.push(p)}})('doc');const text=md.map(f=>fs.readFileSync(f,'utf8')).join('\n');const unused=fs.readdirSync('doc/media').filter(n=>!text.includes('media/'+n));console.log(unused.length?'not referenced: '+unused.join(', '):'every doc/media file is referenced')"
```

## Before You Start

- [ ] **Read**

1. The shot list, [ui-facelift-release-shot-list.md](ui-facelift-release-shot-list.md).
2. The Play It section of `README.md`, and the image captions in `doc/how-to-play.md`.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected: `git status --short` prints nothing, or only `.spec/` files and images under `doc/media/`. The reviewer may have saved the new images without committing them.

Then check that plan 1 is in, that the reviewer's two new images are in place, and that this plan is not:

```powershell
Test-Path doc/ux/console.md
Test-Path doc/media/opponent-commander.png
Test-Path doc/media/opponent-activity.png
Test-Path doc/media/model-tab.png
```

Expected: `True`, `True`, `True`, `True`. A `False` from the second or third means the reviewer has not saved those images yet: stop and report. Any other `False`: stop and report.

Then record which images the reviewer changed, for your report:

```powershell
git status --short -- doc/media
```

- [ ] **Run the link check once**

Run the link check from Verification Commands. Expected: `links checked in 62 files, 0 missing`. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files, in this order:

- `README.md`
- `doc/how-to-play.md`
- `doc/media/model-tab.png` (deleted)
- `doc/media/tools-tab.png` (deleted)

- [ ] **Step 1: Edit `README.md`**

The opening image's caption describes the new battle screen, and the What's Inside image's alternative text no longer names a fleet number. The OpenRouter table names the two new images, `opponent-commander.png` and `opponent-activity.png`, and its captions describe the Opponent tab.

1. In `README.md`, find this line. It occurs exactly once:

````markdown
*A tactical battle in central Mexico on turn 2, during a rainy August. Teal/human units face the rose/LLM opponent (in this case, Gemini Flash Lite). Movement orders are queued up in the planning panel, to the right.*
````

Replace it with:

````markdown
*A tactical battle in central Mexico, during August. Teal/human units face the rose/LLM opponent (in this case, Gemini Flash Lite). The battle header across the top counts each side's sub-units, and queued movement orders are listed in the console, to the right.*
````

2. In `README.md`, find these lines. Together they occur exactly once:

````markdown
| *Step 1: Enter an OpenRouter API key, pick a model, and click Run. The ongoing cost of LLM calls (in US$) is displayed on the right.*                           | *Step 2: Watch the LLM do its thing, and optionally enable/disable tools.*                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| ![Step 1: Enter an OpenRouter API key, pick a model, and click Run. The ongoing cost of LLM calls (in US$) is displayed on the right.](doc/media/model-tab.png) | ![Step 2: Watch the LLM do its thing, and optionally enable/disable tools](doc/media/tools-tab.png) |
````

Replace them with:

````markdown
| *Step 1: On the console's Opponent tab, enter an OpenRouter API key, pick a model, and click Run. The match's cost of LLM calls (in US$) shows beside the key.* | *Step 2: Watch the LLM do its thing in the activity log, and optionally turn tool groups on or off.* |
| --- | --- |
| ![Step 1: On the console's Opponent tab, enter an OpenRouter API key, pick a model, and click Run. The match's cost of LLM calls (in US$) shows beside the key.](doc/media/opponent-commander.png) | ![Step 2: Watch the LLM do its thing in the activity log, and optionally turn tool groups on or off](doc/media/opponent-activity.png) |
````

3. In `README.md`, find this line. It occurs exactly once:

````markdown
![Spain's 1st Fleet heading west across the Atlantic on the global map](doc/media/global-spain-new-world.png)
````

Replace it with:

````markdown
![A Spanish fleet heading west across the Atlantic on the global map](doc/media/global-spain-new-world.png)
````

- [ ] **Step 2: Edit `doc/how-to-play.md`**

Captions and alternative text follow the new screens: the new-game Map section, the Orders tab, Ranged and Strike on the selection bar, and the battle header. A duplicated "Step 2:" in one alternative text goes.

1. In `doc/how-to-play.md`, find these lines. Together they occur exactly once:

````markdown
*New global game: Click the Global tab, then pick human and LLM home regions (in this case: Eastern Asia vs Southern Africa). Buttons to the right of the drop-down lists pick random choices.*

![New global game: Click the Global tab, then pick human and LLM home regions (in this case: Eastern Asia vs Southern Africa). Buttons to the right of the drop-down lists pick random choices.](media/global-preview.png)

*New regional game: Click the Regional tab, then pick the region and player home sub-regions (in this case: Japan vs South & East China).*

![New regional game: Click the Regional tab, then pick the region and player home sub-regions (in this case: Japan vs South & East China).](media/regional-preview.png)
````

Replace them with:

````markdown
*New global game: In the Map section, click the Global tab, then pick the human and LLM home regions (in this case: Eastern Asia vs Southern Africa). The buttons to the right of the dropdowns pick random choices.*

![New global game: In the Map section, click the Global tab, then pick the human and LLM home regions (in this case: Eastern Asia vs Southern Africa). The buttons to the right of the dropdowns pick random choices.](media/global-preview.png)

*New regional game: Click the Regional tab, then pick the region and each player's side (in this case: Eastern Asia, with Japan vs South & east China, Taiwan).*

![New regional game: Click the Regional tab, then pick the region and each player's side (in this case: Eastern Asia, with Japan vs South & east China, Taiwan).](media/regional-preview.png)
````

2. In `doc/how-to-play.md`, find these lines. Together they occur exactly once:

````markdown
| *Step 1: Plan movement orders by selecting units, then hovering over a destination hex. The game will automatically pick the fastest route.*              | *Step 2: Double-click to create movement orders, or right-click to stop. Orders are listed on the planning panel, on the right.*
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| ![Step 1: Plan movement orders by selecting units, then hovering over a destination hex. The game will automatically pick the fastest route.](media/movement-planning-1.png) | ![Step 2: Double-click to create movement orders, or right-click to stop. Orders are listed on the planning panel, on the right.](media/movement-planning-2.png) |
````

Replace them with:

````markdown
| *Step 1: Plan movement orders by selecting units, then hovering over a destination hex. The game will automatically pick the fastest route.*              | *Step 2: Double-click to create movement orders, or right-click to stop. Orders are listed on the console's Orders tab, on the right.*
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| ![Step 1: Plan movement orders by selecting units, then hovering over a destination hex. The game will automatically pick the fastest route.](media/movement-planning-1.png) | ![Step 2: Double-click to create movement orders, or right-click to stop. Orders are listed on the console's Orders tab, on the right.](media/movement-planning-2.png) |
````

3. In `doc/how-to-play.md`, find these lines. Together they occur exactly once:

````markdown
| *Step 1: Select a unit or stack, then click the **Ranged** button.*              | *Step 2: Double-click on a visible target to order the attack.*
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| ![Step 1: Select a unit or stack, then the Ranged button](media/ranged-attack-1.png) | ![Step 2: Step 2: Double-click on a visible target to order the attack](media/ranged-attack-2.png) |
````

Replace them with:

````markdown
| *Step 1: Select a unit or stack, then click **Ranged** on the selection bar, at the map's bottom left.*              | *Step 2: Double-click on a visible target to order the attack.*
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| ![Step 1: Select a unit or stack, then click Ranged on the selection bar](media/ranged-attack-1.png) | ![Step 2: Double-click on a visible target to order the attack](media/ranged-attack-2.png) |
````

4. In `doc/how-to-play.md`, find these lines. Together they occur exactly once:

````markdown
*Select an air unit or stack, then click the **Strike** button and pick a type of air strike to order. Then double-click on a hex to order the attack.*

![Select an air unit or stack, then click the Strike button and pick a type of air strike to order. Then double-click on a hex to order the attack.](media/air-strike.png)
````

Replace them with:

````markdown
*Select an air unit or stack, then click **Strike** on the selection bar and pick a type of air strike to order. Then double-click on a hex to order the attack.*

![Select an air unit or stack, then click Strike on the selection bar and pick a type of air strike to order. Then double-click on a hex to order the attack.](media/air-strike.png)
````

5. In `doc/how-to-play.md`, find these lines. Together they occur exactly once:

````markdown
*Tactical battle in central Mexico, from a global game.*

![Tactical battle in central Mexico, from a global game](media/tactical-battle-mexico.jpg)
````

Replace them with:

````markdown
*Tactical battle in central Mexico, from a regional game. The battle header across the top names the battle and the beat, and Exit Battle sits beside Settings.*

![Tactical battle in central Mexico, from a regional game](media/tactical-battle-mexico.jpg)
````

- [ ] **Step 3: Delete the two images the new ones replace**

The reviewer saved `opponent-commander.png` and `opponent-activity.png` before this plan. The two old images they replace are no longer named by any document after the steps above.

1. Delete `doc/media/model-tab.png`:

```powershell
Remove-Item doc/media/model-tab.png
```

2. Delete `doc/media/tools-tab.png`:

```powershell
Remove-Item doc/media/tools-tab.png
```

## Verify

- [ ] **Step 4: Link check**

Run the link check. Expected, as its only line:

```text
links checked in 62 files, 0 missing
```

- [ ] **Step 5: Media check**

Run the media check. Expected, as its only line:

```text
every doc/media file is referenced
```

A `not referenced:` line names an image no document uses. If it names an image the shot list keeps or replaces, stop and report.

- [ ] **Step 6: Exact match**

This proves that every file this plan creates or edits matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" README.md doc/how-to-play.md
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `README.md` | `ceb71825dcc4d990` |
| `doc/how-to-play.md` | `06278ea21714a244` |

These must print `False`, because this plan deletes them:

```powershell
Test-Path doc/media/model-tab.png
Test-Path doc/media/tools-tab.png
```

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.

## Report

Report, in this order:

1. The final `git status --short`.
2. The output of every check in Verify, in order.
3. The `git status --short -- doc/media` output from Before You Start.
4. Anything you think is wrong in this plan, without having changed it.
5. The `doc/` files you changed. This plan changes exactly the `doc/` files listed under Steps.

Do not commit.

## For the Reviewer

These checks need a person. Run them after the report is in.

1. Open `README.md` and `doc/how-to-play.md` in a Markdown preview: every image shows, and each caption describes its image.
2. Compare each new image with its entry in the shot list. A caption that no longer fits its image needs a follow-up change.
3. Stage the result with `git add -A`, then check `git status --short -- doc/media`: the images you replaced are modified, `opponent-commander.png` and `opponent-activity.png` are added, and `model-tab.png` and `tools-tab.png` are deleted.

## Next

Plan 3 sets the version to 2.6.0, writes its release notes, and runs the regression pass.
