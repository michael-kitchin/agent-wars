# UI Facelift Map: Execution Plans

The spec's Phase 4 builds the map chrome and the map drawing: the minimap panel with its map modes and the legend popover, Leaflet's controls on the right of the map, a casing and arrowheads on order lines, and the selection ring. See [ui-facelift-spec.md](ui-facelift-spec.md). Three plans build it. Run them in order, one at a time. After each plan, the reviewer reads the agent's report, does the plan's reviewer checks, and commits before the next plan starts. Each plan checks that the previous one is in before it begins.

| Order | Plan | Adds | Tests after | Smoke run after |
| --- | --- | --- | --- | --- |
| 1 | [Minimap Panel and Map Controls](ui-facelift-map-1-minimap-panel-execution-plan.md) | The minimap panel with its Weather, Tech, Control, Production, and Legend buttons; the legend popover; the zoom buttons, scale, and attribution on the right; and the toast band between them | 879 | 352 passed, 32 screenshots |
| 2 | [Order Line Casing and Arrowheads](ui-facelift-map-2-order-lines-execution-plan.md) | A pale casing under every order line, and the movement arrowhead on ranged and air-strike lines | 882 | 352 passed, 32 screenshots |
| 3 | [Selection Ring](ui-facelift-map-3-selection-ring-execution-plan.md) | A gold ring around the top marker of each hex that holds a selected unit | 882 | 352 passed, 32 screenshots |

## How the Plans Were Checked

- Each plan's steps, as written here, were applied in order to a copy of the repository starting at `b1b2d6f`, and each result matched the verified files exactly.
- After each plan, the fast loop and the smoke run against the real app in Electron passed. The full tests ran once, after plan 3, and passed; the totals for plans 1 and 2 add each plan's new tests to the starting total of 869.
- Each plan ends with an Exact-match check: hashes of every file it creates or edits, so the agent can prove its result matches.
- Each plan has a checkpoint after its source steps (build, types, and lint), so a copying mistake shows up before the markup, styles, smoke checks, and docs.

## Expected Screenshots

Each plan compares its own smoke screenshots with these images. They were made without map tiles, so the basemap is plain grey, and some show a "map tiles failed to load" toast.

- Plan 1: [ui-facelift-map-1-expected-strategic.png](ui-facelift-map-1-expected-strategic.png)
- Plan 1: [ui-facelift-map-1-expected-tech.png](ui-facelift-map-1-expected-tech.png)
- Plan 1: [ui-facelift-map-1-expected-legend.png](ui-facelift-map-1-expected-legend.png)
- Plan 1: [ui-facelift-map-1-expected-legend-small-window.png](ui-facelift-map-1-expected-legend-small-window.png)
- Plan 1: [ui-facelift-map-1-expected-toast-small-window.png](ui-facelift-map-1-expected-toast-small-window.png)
- Plan 1: [ui-facelift-map-1-expected-toast.png](ui-facelift-map-1-expected-toast.png)
- Plan 2: [ui-facelift-map-2-expected-march.png](ui-facelift-map-2-expected-march.png)
- Plan 3: [ui-facelift-map-3-expected-stack.png](ui-facelift-map-3-expected-stack.png)
- Plan 3: [ui-facelift-map-3-expected-battle.png](ui-facelift-map-3-expected-battle.png)

## Decisions Made for These Plans

- A Tech view chosen in the mode column applies on the world map only. A battle, the new-game preview, and the game-over screen keep their normal view, Tech still reads as pressed there, and it applies again when they close. Holding T works as before everywhere.
- The toast band sits between the minimap panel (or the open legend) and the zoom buttons. When that space is under 280 px, as at the 800 × 600 minimum window with the console expanded, the band runs from the map's left inset to the zoom buttons and covers the panel while a toast shows.
- The legend opens beside the panel when it fits on the map, and under it otherwise.
- Order lines keep their colors and dash patterns: movement stays solid for this turn and dashed beyond. Only the casing, and arrowheads on ranged and air-strike lines, are added.
- Three plans, each committed before the next: the minimap panel and the map controls; order line casing and arrowheads; the selection ring.

## Notes for the Reviewer

- Plan 1 keeps the name `isMapInspectionModeHeld`, because many callers pass it along, and widens what it means to cover the Tech view. Its comment says so.
- Plan 1 fixes a smoke check from the spec's Phase 3. The battle-beat Reports check required the battle's first beat to file a turn report, but a beat files one only when the dice give it something to report, so the check failed now and then. It now passes when the beat filed nothing, and still requires any turn report listed to be tagged B1.
- Plan 1 moves the toast band check from the battle beat to the Reports scene, where a toast always shows, so it checks the band at 1280 × 720 every run as well as at the 800 × 600 minimum.
- Plan 2 removes `drawArrowheadOnly` and `strokePolylineSkippingWrap` from `src/renderer/rendering/pathDrawing.ts`; nothing else used them. It changes one source-reading contract test, `src/main/rangePerimeterStroke.test.ts`, to follow the shared drawer.
- Plan 3 also draws every stack's count badge after all markers, so a neighboring marker no longer covers a badge.
- Each plan updates `doc/` for its own changes, as `AGENTS.md` asks.
- This index links to the plans and images beside it in `.spec/`, and the spec links to this index. If the plans and images move to `.spec/completed/`, update the links here.
