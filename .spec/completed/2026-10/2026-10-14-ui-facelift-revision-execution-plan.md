# UI Facelift Revision: Execution Plans

The spec's Phase 6 revises two parts of the map chrome. The map modes become a row of tabs across the top of the minimap panel, the same size as the console rail's tabs. The selection panel opens as a compact summary bar, with a hint for the next map gesture, and expands upward into the full panel. See [ui-facelift-spec.md](ui-facelift-spec.md) and its mockups. Three plans build it. Run them in order, one at a time. After each plan, the reviewer reads the agent's report, does the plan's reviewer checks, and commits before the next plan starts. Each plan checks that the previous one is in before it begins.

| Order | Plan | Adds | Tests after | Smoke run after |
| --- | --- | --- | --- | --- |
| 1 | [Map-Mode Tabs](ui-facelift-revision-1-mode-tabs-execution-plan.md) | The map modes become a row of tabs across the top of the minimap panel, over a 280 × 200 overview, and the console rail's labels drop to 9 px | 889 | 422 passed, 34 screenshots |
| 2 | [Selection Bar](ui-facelift-revision-2-selection-bar-execution-plan.md) | The selection panel's header and action row become one summary bar: the hex code and count, a hint for the next gesture, Ranged or Strike with its reason as a tip, and Close. The panel opens 440 px wide | 896 | 425 passed, 34 screenshots |
| 3 | [Compact Selection Panel](ui-facelift-revision-3-compact-panel-execution-plan.md) | The selection panel opens compact, as the bar alone. A chevron at the bar's left edge expands it upward with a 150 ms slide, and the grip shows only while it is expanded | 896 | 456 passed, 36 screenshots |

## How the Plans Were Checked

- Each plan's steps, as written here, were applied in order to a copy of the repository starting at `e3b6e05`, and each result matched the verified files exactly.
- After each plan, the fast loop, the full tests, and the smoke run against the real app in Electron passed.
- Each plan ends with an Exact-match check: hashes of every file it creates or edits, so the agent can prove its result matches.
- Each plan has a checkpoint after its source steps (build, types, and lint), so a copying mistake shows up before the markup, styles, smoke checks, and docs.

## Expected Screenshots

Each plan compares its own smoke screenshots with these images. They were made without map tiles, so the basemap is plain grey, and some show a "map tiles failed to load" toast.

- Plan 1: [ui-facelift-revision-1-expected-strategic.png](ui-facelift-revision-1-expected-strategic.png)
- Plan 1: [ui-facelift-revision-1-expected-legend.png](ui-facelift-revision-1-expected-legend.png)
- Plan 1: [ui-facelift-revision-1-expected-legend-small-window.png](ui-facelift-revision-1-expected-legend-small-window.png)
- Plan 2: [ui-facelift-revision-2-expected-one-unit.png](ui-facelift-revision-2-expected-one-unit.png)
- Plan 2: [ui-facelift-revision-2-expected-stack.png](ui-facelift-revision-2-expected-stack.png)
- Plan 2: [ui-facelift-revision-2-expected-strike.png](ui-facelift-revision-2-expected-strike.png)
- Plan 3: [ui-facelift-revision-3-expected-expanded.png](ui-facelift-revision-3-expected-expanded.png)
- Plan 3: [ui-facelift-revision-3-expected-compact.png](ui-facelift-revision-3-expected-compact.png)
- Plan 3: [ui-facelift-revision-3-expected-battle.png](ui-facelift-revision-3-expected-battle.png)

## Decisions Made for These Plans

- Three plans, each committed before the next: the map-mode tabs and the rail's 9 px labels; the selection bar, with the details always showing; the compact state, the expand control, and the slide.
- `mapModeColumn.ts` becomes `mapModeTabs.ts`, `wireMapModeColumn` becomes `wireMapModeTabs`, and comments and `doc/` say "mode tabs". The group's id becomes `#map-mode-tabs`, as the spec's Compatibility Names allows for a name this milestone added. The five button ids stay.
- The tab size and the label size are shared tokens, so the console rail and the map-mode tabs cannot drift apart. The minimap panel takes its width from the 280 px overview, which holds five 56 px tabs exactly.
- Ranged or Strike sits in a tip host, as the disabled placeholders do, so its greyed-out reason can be its tip. The host, not the button, shows and hides, so the source-reading contract test's anchor changes from `btnEl` to `btnHostEl`.
- The hint's rules live in `src/shared/selectionBarText.ts` with unit tests. The hint is refreshed from `updateGameStateSidebar` as well as from the selection panel and Ranged or Strike, because playback starts and ends without a selection change.
- The slide runs on the panel's height with the Web Animations API, not a CSS transition, so a click during a slide can start from the current height and settle once the slide ends.
- A dragged width applies in both states. A dragged height applies only while the panel is expanded, so the compact panel is always just its bar.
- The expand state is kept in memory for the app session and is not saved, as the spec says.

## Notes for the Reviewer

- Before plan 1, copy this phase's `ui-facelift-spec.md` and its seven mockups into `.spec/`, replacing the six that are already there; `ui-facelift-selection-expanded.png` is new. Plan 1 checks that they are in place.
- At 800 × 600 the terrain legend, open beside the minimap panel, covers part of Leaflet's zoom buttons. Before these plans it covered them fully; the narrower panel moved it left. These plans do not change where the legend opens.
- Plan 2 changes one string in `src/main/rendererConsolidation.test.ts` and the matching contract-anchor comment in `src/renderer/renderer.ts`. The test still checks the same behavior: Ranged or Strike hides while a strike is aimed. That test file was already 1,007 lines, over the 1,000-line limit in `.cursor/rules/`; plan 2 adds no lines to it, and splitting it is left for separate work.
- Plan 3's smoke run expands the panel after the strike scene and collapses it after the small-window scene. The state lasts across scenes, so the scenes in between are recorded expanded. The app restarts between the run's sessions, so the battle and regional scenes open compact. The run records two more screenshots than before.
- The completed Phase 5 plans' Next sections say Phase 6 builds the new-game screens. They were written before this phase was added; Phase 7 now does.
- Each plan updates `doc/` for its own changes, as `AGENTS.md` asks.
- This index links to the plans and images beside it in `.spec/`, and the spec links to this index. If the plans and images move to `.spec/completed/`, update the links here.
