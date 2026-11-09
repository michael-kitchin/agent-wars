# UI Facelift Console: Execution Plans

The spec's Phase 3 fills the console and the map with their new contents: the Orders tab's groups and rows, the selection panel, the Reports tab and the toast band, the Opponent tab's sections, and the status line above Ready. See [ui-facelift-spec.md](ui-facelift-spec.md). Five plans build it. Run them in order, one at a time. After each plan, the reviewer reads the agent's report, does the plan's reviewer checks, and commits before the next plan starts. Each plan checks that the previous one is in before it begins.

| Order | Plan | Adds | Tests after | Smoke run after |
| --- | --- | --- | --- | --- |
| 1 | [Orders Tab Groups and Rows](ui-facelift-console-1-orders-tab-execution-plan.md) | Order groups with counts, rows with hex codes and distances, row-click selection, the console subtitle, and the Orders badge | 850 | 195 passed, 21 screenshots |
| 2 | [Selection Panel](ui-facelift-console-2-selection-panel-execution-plan.md) | The selection panel at the map's bottom-left, holding the selected units, their hex, their orders, and Ranged/Strike | 855 | 235 passed, 24 screenshots |
| 3 | [Greyed Actions and Panel Resize](ui-facelift-console-3-panel-actions-and-resize-execution-plan.md) | Ranged/Strike greyed out with a reason, and the panel's resize grip | 862 | 255 passed, 26 screenshots |
| 4 | [Reports Tab and Toast Band](ui-facelift-console-4-reports-and-toasts-execution-plan.md) | The Reports tab with its unread count, the toast band at the top centre, and two plural fixes | 866 | 286 passed, 29 screenshots |
| 5 | [Opponent Tab Sections and Status Line](ui-facelift-console-5-opponent-tab-execution-plan.md) | The Opponent tab's four sections without sub-tabs, and the status line above Ready | 869 | 296 passed, 29 screenshots |

## How the Plans Were Checked

- Each plan was applied, in order, to a copy of the repository starting at `9794169`. After each one, the fast loop, the full tests, and the smoke run against the real app in Electron all passed. The numbers above and in each plan come from those runs.
- The plans' markdown was then replayed mechanically on a fresh copy, step by step, the way an agent reads it. Each replay produced exactly the verified files.
- Each plan ends with an Exact-match check: hashes of every file it creates or edits, so the agent can prove its result matches. Plan 4 leaves `doc/ux/reports-tab.md` out of that check. Its restart sentence was corrected after the recorded run, and the plan says why.
- Each plan has a checkpoint after its source steps (build, types, and lint), so a copying mistake shows up before the markup, styles, smoke checks, and docs.
- The smoke run after plan 5 was repeated three more times, and once more on a small screen (1366 × 768). Every run passed with the same counts.

## Expected Screenshots

Each plan compares its own smoke screenshots with these images. They were made without map tiles, so the basemap is plain grey, and some show a "map tiles failed to load" toast.

- Plan 1: [ui-facelift-console-1-expected-orders.png](ui-facelift-console-1-expected-orders.png)
- Plan 1: [ui-facelift-console-1-expected-reopened.png](ui-facelift-console-1-expected-reopened.png)
- Plan 1: [ui-facelift-console-1-expected-battle.png](ui-facelift-console-1-expected-battle.png)
- Plan 1: [ui-facelift-console-1-expected-game-over.png](ui-facelift-console-1-expected-game-over.png)
- Plan 2: [ui-facelift-console-2-expected-stack.png](ui-facelift-console-2-expected-stack.png)
- Plan 2: [ui-facelift-console-2-expected-strike.png](ui-facelift-console-2-expected-strike.png)
- Plan 2: [ui-facelift-console-2-expected-small-window.png](ui-facelift-console-2-expected-small-window.png)
- Plan 2: [ui-facelift-console-2-expected-battle.png](ui-facelift-console-2-expected-battle.png)
- Plan 3: [ui-facelift-console-3-expected-greyed.png](ui-facelift-console-3-expected-greyed.png)
- Plan 3: [ui-facelift-console-3-expected-resized-large.png](ui-facelift-console-3-expected-resized-large.png)
- Plan 3: [ui-facelift-console-3-expected-resized-small.png](ui-facelift-console-3-expected-resized-small.png)
- Plan 3: [ui-facelift-console-3-expected-small-window.png](ui-facelift-console-3-expected-small-window.png)
- Plan 3: [ui-facelift-console-3-expected-battle.png](ui-facelift-console-3-expected-battle.png)
- Plan 4: [ui-facelift-console-4-expected-turn-resolved.png](ui-facelift-console-4-expected-turn-resolved.png)
- Plan 4: [ui-facelift-console-4-expected-reports.png](ui-facelift-console-4-expected-reports.png)
- Plan 4: [ui-facelift-console-4-expected-battle-beat.png](ui-facelift-console-4-expected-battle-beat.png)
- Plan 5: [ui-facelift-console-5-expected-opponent.png](ui-facelift-console-5-expected-opponent.png)
- Plan 5: [ui-facelift-console-5-expected-strategic.png](ui-facelift-console-5-expected-strategic.png)
- Plan 5: [ui-facelift-console-5-expected-collapsed.png](ui-facelift-console-5-expected-collapsed.png)
- Plan 5: [ui-facelift-console-5-expected-battle.png](ui-facelift-console-5-expected-battle.png)

## Decisions Made for These Plans

- The Reports tab files turn reports, opponent messages, and informational notices. Error toasts are not filed.
- A turn report is tagged with the turn or beat it covers (T6 when turn 7 begins). The standing-orders and unknown-battle notices that the same Ready raises take that tag too. Other messages and notices use the current turn or beat.
- The smoke run covers more than a new world-map match: the 800 × 600 minimum window, the match reopened after a restart, a battle, a new regional match, and a finished match. Plan 1 adds these scenes, and each later plan adds its checks to them.
- An order row selects its unit when clicked, and Shift-click toggles it. The ⊕ button is removed; the × stays.
- Five plans, each committed before the next: Orders tab; selection panel (with Ranged/Strike and the error line moved into it); greyed Ranged/Strike with reasons and the resize grip; Reports, the toast band, and the text fixes; Opponent tab sections and the status line.

## Notes for the Reviewer

- Plan 2 moves `#sidebar-selected-unit` into the selection panel as its header line, and moves the error line (`#sidebar-error`) there too, still hidden. Their ids stay, so the code that writes them keeps working.
- Plan 3 removes the game-over handling of Ranged in `src/renderer/core/uiState.ts`. It ran after the selection refresh and would have re-enabled a greyed button. At game over the overlay hides the selection panel, so Ranged cannot be clicked then.
- Plan 4 files a report by copying the shown toast's text element, so origin flags and line breaks match the toast exactly.
- Plan 5 also updates code comments that still named the Model tab or the Tools tab, including two that still described the tactical battles checkbox as part of the Model tab.
- Each plan updates `doc/` for its own changes, as `AGENTS.md` asks. The README's images, its OpenRouter setup steps, and its test count are left for the spec's Phase 7.
- The smoke run needs no API key and never calls a model. It starts the app three times on one throwaway user-data folder and changes only that folder's saved match between starts: before the second, it moves the enemy's land units into the player's fullest hex, so a battle can start there; before the third, it marks the match as lost. From plan 4 on it plays one turn and one battle beat with Ready, so the opponent runs on standing orders and the dice decide the reports' text.
- The battle's units are placed when the battle opens, so the battle screenshots differ from run to run in where the units stand, which unit the run selects, and the cell codes. The checks do not depend on them.
