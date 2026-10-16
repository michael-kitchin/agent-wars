# UI Facelift Release: Execution Plans

The spec's Phase 8 finishes the UI facelift. The docs say "console" for the column docked on the right, and its five documents are renamed to match. The screenshots in `doc/media/` show the new layout, with captions to match. Then the version becomes 2.6.0, with its release notes, and every check runs once more. See [ui-facelift-spec.md](ui-facelift-spec.md). Three plans do this work, and a shot list tells the reviewer which screenshots to capture before the second. Run the plans in order, one at a time. After each plan, the reviewer reads the agent's report, does the plan's reviewer checks, and commits before the next plan starts. Each plan checks that the previous one is in before it begins.

Plan 1 is in. The toggles plans (`ui-facelift-toggles-execution-plan.md`) change the selection bar and the minimap after it, so plans 2 and 3 and the shot list were updated for those controls. Run the toggles plans first, then capture the screenshots, then plans 2 and 3.

| Order | Plan | Adds | Checks after |
| --- | --- | --- | --- |
| 1 | [Console Docs](ui-facelift-release-1-console-docs-execution-plan.md) | The five right-panel documents are renamed after the console and its tabs, `doc/` and the README say "console", and the README's OpenRouter steps use the Opponent tab | 896 tests; links |
| 2 | [Media Captions](ui-facelift-release-2-media-captions-execution-plan.md) | Captions and alternative text follow the new screenshots, which the reviewer captures first from the shot list; two images get new names | links; media |
| 3 | [Version 2.6.0 and Regression Pass](ui-facelift-release-3-version-execution-plan.md) | Version 2.6.0: the package files, the release notes, the README and doc/README status, and the test count; then the full automated regression pass | 897 tests; smoke 575 passed, 44 screenshots |

After the toggles plans and before plan 2, the reviewer captures the screenshots in [ui-facelift-release-shot-list.md](ui-facelift-release-shot-list.md). Plan 2 checks that the toggles plans are in and that the two new images are in place before it starts.

## How the Plans Were Checked

- Plan 1's steps were applied to a copy of the repository at `d964411`, and the result matched the verified files exactly.
- Plans 2 and 3 were checked again on top of the toggles plans: their steps, as written here, were applied in order to the toggles' verified result, and each result matched the verified files exactly. Plan 2 ran with stand-ins for the reviewer's two new images.
- After plan 1, the fast loop and the full tests passed and the link check found no broken link. After plan 2, the link and media checks passed. After plan 3, the fast loop, the full tests, and the smoke run against the real app in Electron passed.
- Each plan ends with an Exact-match check: hashes of every file it creates or edits, so the agent can prove its result matches.

## Decisions Made for These Plans

- Three plans, each committed before the next: the console docs; the media captions; version 2.6.0 and the regression pass.
- The five right-panel documents are renamed after what they describe: `console.md`, `console-command-bar.md`, `orders-tab.md`, `opponent-tab-commander.md`, and `opponent-tab-tool-groups.md`. "Right panel" becomes "console" in `doc/`, the README, and one code comment. Code identifiers keep their names, as the spec's Compatibility Names say.
- The reviewer captures the new screenshots from [ui-facelift-release-shot-list.md](ui-facelift-release-shot-list.md), and plan 2 rewrites the captions to match. The captions are fixed text, so each shot's set-up in the shot list is what makes its caption true.
- Two images get names that match the Opponent tab: `opponent-commander.png` and `opponent-activity.png`. Every other image keeps its name, so the reviewer saves over it.
- The version is 2.6.0. The status lines say release 2.6.0 redesigns the layout, and that player-facing save/load, the development plan's milestone 2.6, isn't shipped. The development plan is historical and is not edited.
- The version edits are exact edits to `package.json` and `package-lock.json`, the same result as `npm version 2.6.0 --no-git-tag-version`, so the Exact-match check covers them.
- Plans 1 and 2 change only docs and one comment, so they run no smoke run; plan 2 runs no build either. Plan 3 runs every check, including the smoke run, as the automated half of the regression pass.
- The toggles plans came after plan 1 and change the selection bar and the minimap. Plan 2's captions for the ranged-attack and air-strike images name the reticle, the shot list sets those shots up with it, and plan 3's release notes describe the reticle, the minimap's corner toggle, and the Weather and Tech toggles. Plan 3's test count is 897, and its smoke numbers include the toggles' scenes.

## Notes for the Reviewer

- Capture the screenshots after the toggles plans are committed and before plan 2. Plan 2 stops if the toggles plans are not in, or if `opponent-commander.png` or `opponent-activity.png` is missing.
- The link and media checks are one-line `node -e` commands in the plans. They are not added to the repository.
- Links from outside the repository to the five old document names, such as a blog post that links to `doc/ux/right-panel.md` on GitHub, stop working after plan 1. Links inside the repository are all updated, and the link check proves it.
- Review two pieces of wording in plan 3 before you run it: the status sentence about release 2.6.0 and milestone 2.6, and the release notes' "What's in 2.6.0" and "Known limits". The macOS Quit line comes from the spec's open question.
- `doc/releasing.md` builds the release from `main`, so merge this branch into `main` before the Build workflow.
- This index links to the plans, the shot list, and the spec beside it in `.spec/completed/`, and every one of those links still works there.
