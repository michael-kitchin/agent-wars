# UI Facelift Start Screen: Execution Plans

The spec's Phase 7 rebuilds the new-game and game-over screen. The top bar stays on screen as a "New game" bar, with a working game menu. The centred dialog becomes a setup panel docked at the left, with the map preview beside it, in three sections: Map, Forces, and Rules. See [ui-facelift-spec.md](ui-facelift-spec.md) and its mockups [ui-facelift-new-game-global.png](ui-facelift-new-game-global.png) and [ui-facelift-new-game-regional.png](ui-facelift-new-game-regional.png). Three plans build it. Run them in order, one at a time. After each plan, the reviewer reads the agent's report, does the plan's reviewer checks, and commits before the next plan starts. Each plan checks that the previous one is in before it begins.

| Order | Plan | Adds | Tests after | Smoke run after |
| --- | --- | --- | --- | --- |
| 1 | [New-Game Bar](ui-facelift-start-1-new-game-bar-execution-plan.md) | While the new-game overlay is open, the top bar stays as a "New game" bar with Load game…, and the game menu works there with New game… disabled | 896 | 466 passed, 37 screenshots |
| 2 | [Docked Setup Panel](ui-facelift-start-2-setup-panel-execution-plan.md) | The new-game dialog becomes a 432 px panel docked at the left, with the map beside it taking drag and the wheel. Hiding the choices widens the map | 896 | 489 passed, 39 screenshots |
| 3 | [Setup Panel Sections](ui-facelift-start-3-setup-sections-execution-plan.md) | The panel's choices become the mockup's Map, Forces, and Rules sections, with its wording, a compact unit row, and Add another opponent as a placeholder | 896 | 527 passed, 40 screenshots |

## How the Plans Were Checked

- Each plan's steps, as written here, were applied in order to a copy of the repository starting at `d4f986d`, and each result matched the verified files exactly.
- After each plan, the fast loop, the full tests, and the smoke run against the real app in Electron passed.
- Each plan ends with an Exact-match check: hashes of every file it creates or edits, so the agent can prove its result matches.
- Each plan has a checkpoint after its source steps (build, types, and lint), so a copying mistake shows up before the markup, styles, smoke checks, and docs.

## Expected Screenshots

Each plan compares its own smoke screenshots with these images. They were made without map tiles, so the basemap is plain grey, and some show a "map tiles failed to load" toast.

- Plan 1: [ui-facelift-start-1-expected-new-game-bar.png](ui-facelift-start-1-expected-new-game-bar.png)
- Plan 1: [ui-facelift-start-1-expected-menu.png](ui-facelift-start-1-expected-menu.png)
- Plan 2: [ui-facelift-start-2-expected-panel.png](ui-facelift-start-2-expected-panel.png)
- Plan 2: [ui-facelift-start-2-expected-hidden.png](ui-facelift-start-2-expected-hidden.png)
- Plan 2: [ui-facelift-start-2-expected-small-window.png](ui-facelift-start-2-expected-small-window.png)
- Plan 3: [ui-facelift-start-3-expected-global.png](ui-facelift-start-3-expected-global.png)
- Plan 3: [ui-facelift-start-3-expected-regional.png](ui-facelift-start-3-expected-regional.png)
- Plan 3: [ui-facelift-start-3-expected-small-window.png](ui-facelift-start-3-expected-small-window.png)

## Decisions Made for These Plans

- Three plans, each committed before the next: the new-game bar and the game menu on the new-game screen; the dialog docked at the left as the setup panel, with today's controls inside; the panel's Map, Forces, and Rules sections.
- The setup panel is a real column in `#app-body`, moved out of `#canvas-container`, so the map is the area right of it. Every fit, the map's bounds and minimum zoom, the toast band, and the attribution work unchanged, and the preview frame centres on the visible map without new framing code.
- The top bar's new-game mode is pure CSS, keyed on the overlay's `hidden` class, as the console's hiding already was. It follows every path that opens or closes the overlay, including New game… from a battle.
- The top bar keeps the pointer while the new-game overlay is open. New game… is disabled there, with the tip "The new-game screen is already open." on its tip host.
- The map beside the panel takes drag and the wheel while the choices show, not only while they are hidden. Clicks still do not select or order.
- The hide-choices button sits at the header's left, before the message. Hiding the choices takes the panel out of the row, so the map widens, and the button stays in the same spot.
- The wording follows the mockups: Human and AI, or Region, Your side, and Opponent; no colons after labels and no slashes between choices; the unit row as icon, cap, and price, such as 12 · $20, with each icon named in its alternative text. The Advanced tech line keeps its colon, as in the mockups.
- The new-game screen's styles go in a new stylesheet, `static/newGameChrome.css`. Plan 1 creates it for the new-game bar, which keeps `static/frameChrome.css` under the 600-line limit, and plan 2 moves the dialog's rules there from `static/feedbackChrome.css`. `feedbackChrome.css` keeps the toasts and the battle-result dialog, which still use `.game-over-overlay` and `.game-over-box`. The `game-over-*` ids stay, as the spec's Compatibility Names ask.
- Grids replace two helpers: `newGameRegionSelectWidth.ts`, which measured one shared dropdown width, and the slash watcher in `newGameOptionsUi.ts`.

## Notes for the Reviewer

- This phase's `ui-facelift-spec.md` is already in `.spec/`, and plan 1 checks that it is in place. If you restore an older copy, put this one back before plan 1. The new-game mockups are unchanged.
- Plan 2's panel shows today's controls, with the two sides on two lines, until plan 3 replaces them. That interim look is expected.
- Plan 1 changes the game menu's click rule: any button click closes the menu. A disabled button gets no clicks, so this only matters for New game, which disables itself by opening the new-game screen.
- Plan 3 changes the price format from `($20)` to `$20` (`formatUnitCostLabel`), and updates its unit test. The test total does not change.
- Plan 3 also corrects an existing error in `doc/ux/new-game-dialog.md`: its code entry points named `#new-game-country-bonus-select`, but the dropdown is `#new-game-origin-bonus-select`.
- The map rows' label column is at least 5em (65 px), a little wider than the mockup's, so "Opponent" also fits in system fonts wider than Windows' Segoe UI. A font wider still grows the column rather than running a label into its dropdown. The dropdowns are a few pixels narrower than in the mockup.
- The smoke run gains four scenes: the game menu on the new-game screen (plan 1), the choices hidden and the game-over screen at 800 × 600 (plan 2), and the Regional tab (plan 3).
- Each plan updates `doc/` for its own changes, as `AGENTS.md` asks.
- This index links to the plans and images beside it in `.spec/`, and the spec links to this index. If the plans and images move to `.spec/completed/`, update the links here.
