# UI Facelift Toggles: Execution Plans

Changes requested after the facelift's last phase: drawer toggles that make close buttons unnecessary, the minimap's map-mode tabs moved under the overview behind a corner toggle, Weather and Tech as independent toggles, and the selection bar's close control and reticle. Three plans build them. Run them in order, one at a time. After each plan, the reviewer reads the agent's report, does the plan's reviewer checks, and commits before the next plan starts. Each plan checks that the previous one is in before it begins.

| Order | Plan | Adds | Tests after | Smoke run after |
| --- | --- | --- | --- | --- |
| 1 | [Console Header and Selection Bar](ui-facelift-toggles-1-console-and-selection-bar-execution-plan.md) | The console header loses its collapse button; the selection bar's × becomes a full-height end cap; Ranged and Strike become one reticle toggle, and the air-strike Cancel button goes | 896 | 551 passed, 42 screenshots |
| 2 | [Map-Mode Tabs Under the Minimap](ui-facelift-toggles-2-map-mode-row-execution-plan.md) | The minimap's overview moves to the top of its panel, and the row of tabs moves under it, hidden until a corner toggle on the overview shows it | 896 | 563 passed, 43 screenshots |
| 3 | [Weather and Tech Toggles](ui-facelift-toggles-3-weather-and-tech-execution-plan.md) | Weather and Tech become independent toggles; a hex showing both status icons draws them side by side on the band above its center | 897 | 575 passed, 44 screenshots |

## Requested Changes

- Remove each drawer's close button when the button that opens the drawer also closes it. The console's collapse button is the one example: the rail's selected tab already folds the console.
- Minimap: move the row of layer buttons below the minimap. Make Weather a real toggle, on by default, that shows or hides the weather icons. Add a downward-pointing chevron toggle in the overview's lower-left corner, in the selection bar's arrow-toggle style and off by default, that shows or hides the row.
- Status icons: the first request put the weather icons at the hex's center. The follow-up answer replaced that: when only one of the weather and tech icons shows, it stays in the top position, where the weather icon is today, and when both show, the tech icon takes that position and the weather icon goes below the center by the same distance. That spot holds the production label, so the pair shares the top band instead (see Decisions).
- Selection bar: style the close control like the expand control, with its divider running the bar's full height. Replace the Strike and Ranged labels with one target-reticle icon, styled the same for both, since the two never show together.

## How the Plans Were Checked

- Each plan's steps, as written here, were applied in order to a copy of the repository starting at `779f214`, and each result matched the verified files exactly.
- After each plan, the fast loop, the full tests, and the smoke run against the real app in Electron passed.
- Each plan ends with an Exact-match check: hashes of every file it creates or edits, so the agent can prove its result matches.
- Each plan has a checkpoint after its source steps (build, types, and lint), so a copying mistake shows up before the markup, styles, smoke checks, and docs.

## Expected Screenshots

Each plan compares its own smoke screenshots with these images. They were made without map tiles, so the basemap is plain grey, and some show a "map tiles failed to load" toast.

- Plan 1: [ui-facelift-toggles-1-expected-strategic.png](ui-facelift-toggles-1-expected-strategic.png)
- Plan 1: [ui-facelift-toggles-1-expected-ranged.png](ui-facelift-toggles-1-expected-ranged.png)
- Plan 1: [ui-facelift-toggles-1-expected-strike.png](ui-facelift-toggles-1-expected-strike.png)
- Plan 1: [ui-facelift-toggles-1-expected-expanded.png](ui-facelift-toggles-1-expected-expanded.png)
- Plan 2: [ui-facelift-toggles-2-expected-strategic.png](ui-facelift-toggles-2-expected-strategic.png)
- Plan 2: [ui-facelift-toggles-2-expected-tabs.png](ui-facelift-toggles-2-expected-tabs.png)
- Plan 2: [ui-facelift-toggles-2-expected-tabs-hidden.png](ui-facelift-toggles-2-expected-tabs-hidden.png)
- Plan 3: [ui-facelift-toggles-3-expected-tech.png](ui-facelift-toggles-3-expected-tech.png)
- Plan 3: [ui-facelift-toggles-3-expected-weather-off.png](ui-facelift-toggles-3-expected-weather-off.png)

## Decisions Made for These Plans

- Three plans, each committed before the next: the console header and the selection bar; the minimap's row of tabs; the Weather and Tech toggles.
- Only the console's collapse button goes. The build popups and the stack callout keep their ×: they are popups, not drawers, and only the single-hex build popup's marker also closes it. The title and the subtitle take the freed width; nothing new goes there.
- Each enabled console tab's tip gains "Click the selected tab to hide the console and widen the map.", because the collapse button's tip was the only on-screen hint.
- The reticle is a pressed toggle while aiming, its face in the ranged amber or the strike purple, the same color as the panel's border; a second click stops aiming. The strike target list shows beside it, and the separate air-strike Cancel button goes. Its accessible name is "Ranged attack" or "Air strike". Idle, both look the same.
- The selection bar's × mirrors the expand control: the bar's full height, 32 px wide, with a divider on its inner side. The resize grip stays at the panel's top-right corner, over the ×'s corner and clear of its glyph. This replaces the spec's "clear of the close control".
- The minimap's overview moves to the top of its panel, and the tabs under it. The corner toggle is 32 px, and its chevron flips up while the tabs show. The tabs start hidden each time the app opens; whether they show lasts until the app closes and is not saved. Hiding them also closes the terrain legend, whose tab hides with them.
- Weather and Tech are independent toggles: Weather, on at start, shows or hides the weather icons in either view; Tech, off at start, turns the Tech view on or off, as before. Holding T still shows the Tech view while it is down, and no longer hides the weather icons.
- One status icon stays centered on the band above the hex center. When a hex shows both, the tech icon and the weather icon sit side by side on that band, tech on the left, 2 px apart, centered as a pair, as the reviewer chose. Below the center, the Tech view draws every hex's production label, and the normal view draws the label on the player's own hexes.
- The new-game preview ignores the Weather tab, which is hidden with the minimap there. Holding T over the preview shows tech beside weather.

## Notes for the Reviewer

- There is no new spec document. The requirements are the request summarized under Requested Changes, with the decisions above. `ui-facelift-spec.md` and the earlier plans are in `.spec/completed/`, and they are left as written. Where they differ from these plans (the minimap tabs above the overview, Weather and Tech as one choice, the Ranged, Strike, and Cancel labels, the collapse button, and the grip clear of the close control), these plans win.
- Each smoke run adds scenes, so later screenshots are numbered one or two higher than in the earlier plans' runs: plan 1 adds a ranged attack aimed and a strike stopped, plan 2 the tabs hidden, and plan 3 Weather off.
- Plan 3 adds one unit test, so the full test total goes from 896 to 897.
- `src/main/rendererConsolidation.test.ts` was already 1,007 lines, over the 1,000-line limit. Plan 1 changes one assertion there and keeps its length; splitting the file is out of scope.
- The release plans 2 and 3, their index, and their shot list in `.spec/completed/` are updated for these controls, with new step blocks and numbers checked on top of this set. Run them after this set, as before: capture the screenshots, then the media captions, then version 2.6.0.
