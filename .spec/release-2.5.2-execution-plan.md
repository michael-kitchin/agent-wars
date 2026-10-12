# Release 2.5.2

> **For agentic workers:** Execute this plan phase by phase. Do not start a phase until the previous phase's verification command matches the expected result. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Commit the current uncommitted game work, push it to `main`, and publish GitHub release `v2.5.2` with the three side-load archives.

**Architecture:** Two commits on `main`, then the existing Build workflow. The first commit contains every local path present at the start, including the doc edits, both `.spec` plans, and the four status arrow SVGs. The icon preview under `static/status/temp/` is gone, so this release does not add a packaging exclusion for it. The second commit is only the version number, the release notes, and the version lines [doc/releasing.md](../doc/releasing.md) names. The Build workflow in `.github/workflows/build.yml` creates a draft release. This plan then publishes that draft. Follow [doc/releasing.md](../doc/releasing.md) except where this plan says the user chose to publish without a local smoke test.

**Tech Stack:** Git, npm, GitHub CLI (`gh`), the CI workflow, and the Build workflow.

## Global Constraints

- The user explicitly asked for these two commits, one push to `origin/main`, and a published GitHub release `v2.5.2`. That request is the authorization for those git and GitHub writes. It does not authorize any other commit, any other branch, a force push, a tag created by hand, or a change to git config.
- Do not use `git commit --amend`, `git push --force`, `git reset --hard`, or `--no-verify`.
- Do not update git config.
- Do not copy phase names or this plan's headings into commit messages, release notes, source, or product docs. This plan file itself stays in the feature commit.
- Commit messages are the two sentences in Phase 2 and Phase 4. Do not edit them.
- Repository root for every command: `F:\Projects\Personal\agent-wars-public`.
- Shell is Windows PowerShell. Do not chain commands with `&&`. Run one command, read the result, then run the next.
- Every path in `git status --short` at the start is part of the feature commit. That includes the doc edits. Do not drop a doc file because a later phase also edits docs. Do not add anything under `.env` or any `debug-*.txt` file. Those are gitignored and are not part of this work.
- `npm run check:circular` currently fails on two cycles that are already on `main` (`promptText.ts` / `standingOrders.ts` / `orderResponseParsing.ts`). Do not fix them and do not refresh `scripts/circular-deps-baseline.json` in this release.
- If a verification command does not match, stop. Do not start the next phase. Report the command, the actual output, and the expected output.

---

### Phase 1: Confirm the tree and the tests

**Files:** none. This phase does not edit or commit.

**Interfaces:**

- Consumes: the working tree as it is at the start of this plan.
- Produces: a recorded Node test total, used in Phase 3 to replace `808 tests` in `README.md`. A passing `npm test` is the gate for Phase 2.

- [ ] **Step 1: Confirm the branch and that no 2.5.2 release exists**

Run:

```powershell
git rev-parse --abbrev-ref HEAD
git status -sb
gh release view v2.5.2
```

Expected:

- Branch is `main`.
- The status header is `## main...origin/main` with nothing after it (not ahead, not behind).
- `gh release view v2.5.2` fails because that release does not exist.

Stop if the branch is not `main`, if `main` is ahead or behind `origin/main`, or if release `v2.5.2` already exists.

- [ ] **Step 2: Confirm the file list**

Run:

```powershell
git status --short
```

Expected lines, and no others. Doc edits, this plan, and the icon preview are all required:

```text
 M doc/ai-commander-prompts/strategic-prompt.md
 M doc/ux/hex-tooltips.md
 M src/main/gameActions/humanMarchPreview.test.ts
 M src/main/gameActions/humanMarchPreview/humanMarchPreviewGroundRoute.ts
 M src/main/gameActions/humanMarchPreview/humanMarchPreviewResolve.ts
 M src/main/openRouter/openRouterBuildSystemPrompt.ts
 M src/main/openRouter/openRouterToolResultHex.test.ts
 M src/main/openRouter/openRouterToolResultHex.ts
 M src/main/openRouter/promptText.ts
 M src/main/orderPreviewBlockingCopy.test.ts
 M src/main/orderPreviewEffectsTooltip.test.ts
 M src/main/tools/pathfinding.ts
 M src/main/tools/pathfindingPlanRouteHelpers.ts
 M src/renderer/gameplay/orderPreviewEffectsContext.ts
 M src/shared/humanMarchPreviewGroupAssembly.test.ts
 M src/shared/humanMarchPreviewGroupAssembly.ts
 M src/shared/ipc/humanOrderPreviewTypes.ts
 M src/shared/orderPreviewBlockingCopy.ts
 M src/shared/orderPreviewEffectsTooltip.ts
 M src/shared/orderPreviewSlowTerrainTooltip.ts
 M src/shared/statusIconHtml.test.ts
 M src/shared/statusIconHtml.ts
 M src/shared/strategicTerrainFlags.test.ts
 M src/shared/strategicTerrainFlags.ts
 M src/shared/tacticalMarchHoverPreview.ts
 M src/shared/terrainCoverRules.test.ts
 M src/shared/terrainCoverRules.ts
 M src/shared/terrainEffectsForTooltip.ts
 M static/renderer.js
 M static/status/arrow_down.svg
 M static/status/arrow_down_double.svg
 M static/status/arrow_up.svg
 M static/status/arrow_up_double.svg
?? .spec/completed/terrain-stop-and-block-effects-execution-plan.md
?? .spec/release-2.5.2-execution-plan.md
?? src/main/gameActions/humanMarchPreview/armorMarchStopImpact.test.ts
?? src/main/openRouter/promptText.test.ts
?? src/shared/marchInvalidReasons.ts
?? src/shared/tacticalMarchDestinationBlock.test.ts
?? src/shared/tacticalMarchDestinationBlock.ts
```

Line order may differ. A `warning:` about LF becoming CRLF on `static/renderer.js` or the two SVG files is not a failure. Any other path is a failure. Stop and report it.

- [ ] **Step 3: Run the CI test script**

Run from the repository root. This is the same command as `.github/workflows/ci.yml`. It takes several minutes.

```powershell
npm test
```

Expected: the process exits 0. The log includes `naming check: ok`, `check-renderer-typecheck: ok`, and the `notices:check` script with no error after it.

Stop if the exit code is not 0. Do not commit a failing tree.

- [ ] **Step 4: Record the Node test total**

From the `npm test` output, sum every line that ends in `tests <number>` (the Node test reporter line, including a leading info mark or a `?` where the console could not print that mark). Ignore `pass`, `fail`, `cancelled`, `skipped`, and `todo` lines.

A previous run of this same tree totaled **829**. If your sum is outside 820–840, stop and report the log instead of guessing.

Write the sum down. Phase 3 replaces `808` with that sum.

---

### Phase 2: Commit the feature work

**Files:** every path from Phase 1, including `doc/ai-commander-prompts/strategic-prompt.md`, `doc/ux/hex-tooltips.md`, `.spec/completed/terrain-stop-and-block-effects-execution-plan.md`, `.spec/release-2.5.2-execution-plan.md`, and the four status arrow SVGs. Do not change `electron-builder.config.cjs` or `electron-builder.ci.cjs`.

**Interfaces:**

- Consumes: a clean test run from Phase 1 and the file list from Phase 1.
- Produces: one new commit on `main`, message exactly `Name armor stops on march previews and tell the model which map is loaded.` After this phase, `git status --short` is empty.

- [ ] **Step 1: Stage the feature paths**

Run from the repository root:

```powershell
git add -- doc/ai-commander-prompts/strategic-prompt.md doc/ux/hex-tooltips.md .spec/completed/terrain-stop-and-block-effects-execution-plan.md .spec/release-2.5.2-execution-plan.md src/main/gameActions/humanMarchPreview.test.ts src/main/gameActions/humanMarchPreview/humanMarchPreviewGroundRoute.ts src/main/gameActions/humanMarchPreview/humanMarchPreviewResolve.ts src/main/gameActions/humanMarchPreview/armorMarchStopImpact.test.ts src/main/openRouter/openRouterBuildSystemPrompt.ts src/main/openRouter/openRouterToolResultHex.test.ts src/main/openRouter/openRouterToolResultHex.ts src/main/openRouter/promptText.ts src/main/openRouter/promptText.test.ts src/main/orderPreviewBlockingCopy.test.ts src/main/orderPreviewEffectsTooltip.test.ts src/main/tools/pathfinding.ts src/main/tools/pathfindingPlanRouteHelpers.ts src/renderer/gameplay/orderPreviewEffectsContext.ts src/shared/humanMarchPreviewGroupAssembly.test.ts src/shared/humanMarchPreviewGroupAssembly.ts src/shared/ipc/humanOrderPreviewTypes.ts src/shared/orderPreviewBlockingCopy.ts src/shared/orderPreviewEffectsTooltip.ts src/shared/orderPreviewSlowTerrainTooltip.ts src/shared/statusIconHtml.test.ts src/shared/statusIconHtml.ts src/shared/strategicTerrainFlags.test.ts src/shared/strategicTerrainFlags.ts src/shared/tacticalMarchHoverPreview.ts src/shared/terrainCoverRules.test.ts src/shared/terrainCoverRules.ts src/shared/terrainEffectsForTooltip.ts src/shared/marchInvalidReasons.ts src/shared/tacticalMarchDestinationBlock.test.ts src/shared/tacticalMarchDestinationBlock.ts static/renderer.js static/status/arrow_down.svg static/status/arrow_down_double.svg static/status/arrow_up.svg static/status/arrow_up_double.svg
```

Then:

```powershell
git diff --cached --name-only
```

Expected: exactly these 40 paths. `package.json`, `package-lock.json`, `README.md`, and `doc/README.md` are not in the list. Stop if the list differs.

```text
.spec/completed/terrain-stop-and-block-effects-execution-plan.md
.spec/release-2.5.2-execution-plan.md
doc/ai-commander-prompts/strategic-prompt.md
doc/ux/hex-tooltips.md
src/main/gameActions/humanMarchPreview.test.ts
src/main/gameActions/humanMarchPreview/armorMarchStopImpact.test.ts
src/main/gameActions/humanMarchPreview/humanMarchPreviewGroundRoute.ts
src/main/gameActions/humanMarchPreview/humanMarchPreviewResolve.ts
src/main/openRouter/openRouterBuildSystemPrompt.ts
src/main/openRouter/openRouterToolResultHex.test.ts
src/main/openRouter/openRouterToolResultHex.ts
src/main/openRouter/promptText.test.ts
src/main/openRouter/promptText.ts
src/main/orderPreviewBlockingCopy.test.ts
src/main/orderPreviewEffectsTooltip.test.ts
src/main/tools/pathfinding.ts
src/main/tools/pathfindingPlanRouteHelpers.ts
src/renderer/gameplay/orderPreviewEffectsContext.ts
src/shared/humanMarchPreviewGroupAssembly.test.ts
src/shared/humanMarchPreviewGroupAssembly.ts
src/shared/ipc/humanOrderPreviewTypes.ts
src/shared/marchInvalidReasons.ts
src/shared/orderPreviewBlockingCopy.ts
src/shared/orderPreviewEffectsTooltip.ts
src/shared/orderPreviewSlowTerrainTooltip.ts
src/shared/statusIconHtml.test.ts
src/shared/statusIconHtml.ts
src/shared/strategicTerrainFlags.test.ts
src/shared/strategicTerrainFlags.ts
src/shared/tacticalMarchDestinationBlock.test.ts
src/shared/tacticalMarchDestinationBlock.ts
src/shared/tacticalMarchHoverPreview.ts
src/shared/terrainCoverRules.test.ts
src/shared/terrainCoverRules.ts
src/shared/terrainEffectsForTooltip.ts
static/renderer.js
static/status/arrow_down.svg
static/status/arrow_down_double.svg
static/status/arrow_up.svg
static/status/arrow_up_double.svg
```

- [ ] **Step 3: Commit**

Commit message, exactly:

```text
Name armor stops on march previews and tell the model which map is loaded.
```

```powershell
git commit -m "Name armor stops on march previews and tell the model which map is loaded."
```

Expected: the commit is created. If a hook rejects it, fix the hook's complaint in a new commit after the fix is tested. Do not amend.

- [ ] **Step 4: Verify the commit**

```powershell
git log -1 --format="%s"
git status --short
git diff --cached --name-only
```

Expected:

- The subject is `Name armor stops on march previews and tell the model which map is loaded.`
- `git status --short` prints nothing. Checking a box in this file after the commit makes a new local change. If that happens before the version commit, add this file again in Phase 4. Do not make a third commit. Do not edit this file after the version commit.
- The cached diff is empty.

---

### Phase 3: Write the 2.5.2 version files

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md` (three strings only)
- Modify: `doc/README.md` (the shipping version only)
- Create: `doc/release-notes/v2.5.2.md`

**Interfaces:**

- Consumes: the test total from Phase 1 Step 4.
- Produces: version `2.5.2` in the files the Build workflow and [doc/releasing.md](../doc/releasing.md) read. No tag. No commit yet.

- [ ] **Step 1: Bump the package version without a tag or a commit**

```powershell
npm version 2.5.2 --no-git-tag-version
```

Expected: npm prints `v2.5.2`. It updates `package.json` and `package-lock.json` only. It does not create a git tag and it does not commit.

Confirm:

```powershell
node -e "console.log(require('./package.json').version)"
git tag --list "v2.5.2"
```

Expected: the node command prints `2.5.2`. The tag list is empty.

- [ ] **Step 2: Update the three README strings**

In `README.md`, change only these three strings:

- `Agent Wars v2.5.1.exe` to `Agent Wars v2.5.2.exe`
- `Agent Wars v2.5.1.app` to `Agent Wars v2.5.2.app`
- `(808 tests)` to `(<total> tests)` where `<total>` is the sum from Phase 1 Step 4
- `**Version:** 2.5.1,` to `**Version:** 2.5.2,`

Do not change the milestone sentence that says `milestone 2.5`. That is a milestone name, not the shipping version.

- [ ] **Step 3: Update the shipping version in `doc/README.md`**

Change `Shipping version as of this writing: **2.5.1**` to `Shipping version as of this writing: **2.5.2**`.

Do not change `milestone **2.5**` in that same paragraph.

- [ ] **Step 4: Create `doc/release-notes/v2.5.2.md`**

Create the file with this exact body:

```markdown
A turn-based grand strategy game on a real-Earth hex map. Your opponent is a large language model you choose through OpenRouter. Coding agents wrote the code; the story is told in the Agent Wars series in [*Standing Orders*](https://standingorders.substack.com).

## Downloads

| File | For |
| --- | --- |
| `agent-wars-2.5.2-windows-x64.zip` | Windows, x64 |
| `agent-wars-2.5.2-macos-arm64.zip` | macOS on Apple silicon |
| `agent-wars-2.5.2-linux-x64.tar.gz` | Linux, x64 |
| `SHA256SUMS.txt` | SHA-256 checksums for the three archives |

These are unsigned side-load builds, so Windows and macOS warn before the first launch.

- **Windows:** unzip, then run `Agent Wars v2.5.2.exe`. If SmartScreen stops it, choose **More info**, then **Run anyway**.
- **macOS:** unzip, then open `Agent Wars v2.5.2.app`. If macOS blocks it, open **System Settings > Privacy & Security** and choose **Open Anyway**.
- **Linux:** extract the archive, then run `./agent-wars`. That launcher handles Chromium's sandbox when the archive can't keep `chrome-sandbox` owned by root. On Ubuntu 23.10 and later, where AppArmor blocks unprivileged user namespaces, it starts without the sandbox and says so.

To check a download, compare its SHA-256 with the line in `SHA256SUMS.txt`: `Get-FileHash <file>` in PowerShell, `shasum -a 256 <file>` on macOS, or `sha256sum -c --ignore-missing SHA256SUMS.txt` on Linux.

## Before you play

- **Bring your own OpenRouter key.** Paste it on the Model tab, choose a model, and click **Run**. OpenRouter bills your account for the opponent's model calls. Without a key the app still runs, but the opponent makes no model calls. The key stays on your computer and is sent only to OpenRouter ([SECURITY.md](https://github.com/michael-kitchin/agent-wars/blob/main/SECURITY.md)).
- **Map imagery needs an internet connection.** Map tiles come from Esri and OpenStreetMap.
- **Non-commercial use.** The app ships earth data under non-commercial terms, so the application as distributed is for non-commercial use. See [THIRD-PARTY-NOTICES.md](https://github.com/michael-kitchin/agent-wars/blob/main/THIRD-PARTY-NOTICES.md).

How a match plays is in [doc/how-to-play.md](https://github.com/michael-kitchin/agent-wars/blob/main/doc/how-to-play.md).

## What's in 2.5.2

- **Armor stops.** A world hex that is rugged, arctic, or city leads its Effects line with a double-down arrow and the words Armored Movement. A legal armor march lists Urban, Mountain, and Arctic on the Slower line for each of those kinds the route enters after the start, including the destination. One hex can add more than one of those words. Weather stays on that line. A legal march does not also say Blocked.
- **Blocked terrain.** When the hovered cell is terrain this unit cannot enter, the preview says Blocked and names that terrain. Every other illegal march, including a cell that is merely out of reach, says Blocked: Unreachable.
- **The loaded map.** The strategic prompt says Global Earth map at H3 resolution 1 on the global map. On a regional map it names that map at that map's strategic resolution.

## Known limits

- There is no player-facing save slot or load list yet. SQLite keeps the match in progress on disk.
- The macOS build is for Apple silicon only, and it hasn't been opened on a Mac before this release, so its first-launch steps are untested.
- Model quality varies. A model without tool calls plays without the planning tools.
- This is a personal R&D project. It doesn't take issues or pull requests; security reports go through the repository's **Security** tab.
```

- [ ] **Step 5: Verify the version strings**

```powershell
git diff --name-only
git status --short
```

Expected modified or untracked paths, and no others. `.spec/release-2.5.2-execution-plan.md` may also be modified if a box was checked after the feature commit. No other extra path is allowed:

```text
package.json
package-lock.json
README.md
doc/README.md
doc/release-notes/v2.5.2.md
```

Then search:

```powershell
Select-String -Path README.md, doc/README.md, package.json, package-lock.json, doc/release-notes/v2.5.2.md -Pattern "2\.5\.1"
```

Expected: no matches. `milestone 2.5` and `milestone **2.5**` may remain. `2.5.1` must not remain in those five paths.

Confirm `package-lock.json` top-level `"version"` and `packages[""].version` are both `2.5.2`.

---

### Phase 4: Commit the version

**Files:** the five paths from Phase 3. If `.spec/release-2.5.2-execution-plan.md` is still modified, include it too so the push does not leave that local change behind.

**Interfaces:**

- Consumes: the version files from Phase 3.
- Produces: a second commit, message exactly `Set the shipping version to 2.5.2.` `HEAD` is the commit the release will be built from. Still no tag. Still not pushed.

- [ ] **Step 1: Stage the version paths**

```powershell
git add -- package.json package-lock.json README.md doc/README.md doc/release-notes/v2.5.2.md
git add -- .spec/release-2.5.2-execution-plan.md
git diff --cached --name-only
```

The second `git add` is required only when that plan file is modified. If it is already committed and unchanged, `git add` succeeds and does not add a new cached name. Silence is not a failure.

Expected names are the five version paths below. `.spec/release-2.5.2-execution-plan.md` may be a sixth name. Stop if any other name appears.

```text
README.md
doc/README.md
doc/release-notes/v2.5.2.md
package-lock.json
package.json
```

- [ ] **Step 2: Commit**

Commit message, exactly:

```text
Set the shipping version to 2.5.2.
```

```powershell
git commit -m "Set the shipping version to 2.5.2."
```

- [ ] **Step 3: Verify both commits and a clean tree**

```powershell
git log -2 --format="%s"
git status -sb
git tag --list "v2.5.2"
```

Expected:

- The first subject printed is `Set the shipping version to 2.5.2.`
- The second subject printed is `Name armor stops on march previews and tell the model which map is loaded.`
- Status is exactly `## main...origin/main [ahead 2]`. No modified or untracked paths. If `.spec/release-2.5.2-execution-plan.md` is still listed, go back and include it in this commit. Do not start Phase 5 with a dirty tree.
- The tag list is empty.

Record `git rev-parse HEAD`. Later phases call this the release SHA.

---

### Phase 5: Push and wait for CI

**Files:** none.

**Interfaces:**

- Consumes: the two local commits from Phase 4.
- Produces: `origin/main` at the release SHA, and a successful CI run on that SHA.

- [ ] **Step 1: Push `main`**

```powershell
git push origin main
```

Expected: the push succeeds and `origin/main` moves forward by the two commits. Do not force. Do not push tags.

```powershell
git status -sb
git rev-parse HEAD
git rev-parse origin/main
```

Expected: `HEAD` and `origin/main` are the same SHA, the release SHA from Phase 4. The status header has no `ahead` and no `behind`.

- [ ] **Step 2: Wait for the CI run on that SHA**

CI starts on the push. Find the run whose `headSha` equals the release SHA. Do not watch an older green run.

```powershell
gh run list --workflow=ci.yml --branch main --limit 5 --json databaseId,headSha,status,conclusion,event
```

When a row has `headSha` equal to the release SHA, watch it:

```powershell
gh run watch <databaseId> --exit-status
```

Expected: the watch command exits 0 and the conclusion is `success`.

Stop if CI fails. Do not start the Build workflow. Report the run URL.

---

### Phase 6: Build the draft release

**Files:** none locally. The workflow reads `package.json` version `2.5.2` and `doc/release-notes/v2.5.2.md` from the release SHA.

**Interfaces:**

- Consumes: CI success on the release SHA.
- Produces: a draft GitHub release `v2.5.2` whose target is the release SHA, with the four assets named below.

The user chose to publish without a local smoke test. This phase still stops at the draft so Phase 7 can check the asset names before publishing. Do not download the archives and do not launch the game.

- [ ] **Step 1: Start the Build workflow with a draft release**

```powershell
gh workflow run build.yml --ref main -f draft_release=true
```

Expected: GitHub accepts the dispatch.

- [ ] **Step 2: Watch the run for the release SHA**

Wait until a Build run exists whose `headSha` is the release SHA and whose `event` is `workflow_dispatch`. Ignore older Build runs.

```powershell
gh run list --workflow=build.yml --limit 5 --json databaseId,headSha,event,status,conclusion,createdAt
```

Then:

```powershell
gh run watch <databaseId> --exit-status
```

Expected: exit 0. The jobs `Build (ubuntu-22.04)`, `Build (windows-latest)`, `Build (macos-latest)`, and `Draft release` all succeed.

If any build fails, do not publish. Do not delete the release unless a draft `v2.5.2` was created and you are certain it came from this failed run. Report the run URL and stop.

- [ ] **Step 3: Verify the draft and the asset names**

```powershell
gh release view v2.5.2 --json isDraft,tagName,targetCommitish,assets
```

Expected:

- `isDraft` is true.
- `tagName` is `v2.5.2`.
- `targetCommitish` is the release SHA.
- Asset names are exactly `agent-wars-2.5.2-windows-x64.zip`, `agent-wars-2.5.2-macos-arm64.zip`, `agent-wars-2.5.2-linux-x64.tar.gz`, and `SHA256SUMS.txt`.

Stop if an asset name differs from `doc/release-notes/v2.5.2.md`. Do not publish a draft whose file names disagree with the notes.

---

### Phase 7: Publish the release

**Files:** none.

**Interfaces:**

- Consumes: the verified draft from Phase 6.
- Produces: a public release `v2.5.2`, not a draft, tagged on the release SHA.

The user chose to publish as soon as the three builds succeed, without playing the archives. Do not pause for a smoke test.

- [ ] **Step 1: Publish**

```powershell
gh release edit v2.5.2 --draft=false
```

- [ ] **Step 2: Verify the published release**

```powershell
gh release view v2.5.2 --json isDraft,tagName,url
git fetch origin tag v2.5.2
git rev-parse v2.5.2
git rev-parse HEAD
```

Expected:

- `isDraft` is false.
- `tagName` is `v2.5.2`.
- The URL is `https://github.com/michael-kitchin/agent-wars/releases/tag/v2.5.2`.
- `v2.5.2` and `HEAD` are the same SHA.

Report that URL when both SHAs match.
