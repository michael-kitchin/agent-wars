# UI Facelift Frame: Execution Plans

The spec's Phase 2 builds the app's new frame: the top bar, the docked console, and the game menu. See [ui-facelift-spec.md](ui-facelift-spec.md). Five plans build it. Run them in order, one at a time. After each plan, the reviewer reads the agent's report, does the plan's reviewer checks, and commits before the next plan starts. Each plan checks that the previous one is in before it begins.

| Order | Plan | Adds | Tests after | Smoke run after |
| --- | --- | --- | --- | --- |
| 1 | [Smoke Harness and Baseline Screenshots](ui-facelift-frame-1-smoke-harness-execution-plan.md) | `npm run ui:smoke`, the user-data override, and baseline screenshots | 834 | 23 passed, 5 screenshots |
| 2 | [Top Bar and Docked Console](ui-facelift-frame-2-top-bar-and-console-execution-plan.md) | The top bar (sides and date), the docked console with its tabs, and Ready in the footer | 834 | 62 passed, 7 screenshots |
| 3 | [Console Collapse and Live Map Resize](ui-facelift-frame-3-console-collapse-execution-plan.md) | Console collapse and live map resize | 837 | 80 passed, 9 screenshots |
| 4 | [Top-Bar Readouts](ui-facelift-frame-4-top-bar-readouts-execution-plan.md) | The Production, Forces, Your home, and Enemy home readouts | 843 | 83 passed, 9 screenshots |
| 5 | [Game Menu and Electron Menu Bar](ui-facelift-frame-5-game-menu-execution-plan.md) | The game menu, and the Electron menu bar hidden | 843 | 111 passed, 12 screenshots |

## How the Plans Were Checked

- Each plan was applied, in order, to a copy of the repository starting at `586e83b`. After each one, the fast loop, the full tests, and the smoke run against the real app in Electron all passed. The numbers above and in each plan come from those runs.
- The plans' markdown was then replayed mechanically on a fresh copy, step by step, the way an agent reads it. Each replay produced exactly the verified files.
- Each plan ends with an Exact-match check: hashes of every file it creates or edits, so the agent can prove its result matches. A few files named in each plan were corrected after the recorded run and have no hash. The plan says which ones, and why.
- The smoke run was also checked on a small screen (1366 × 768). Viewport emulation still produced the 1920 × 1080 scene.

## Expected Screenshots

Each plan compares its own smoke screenshots with these images. They were made without map tiles, so the basemap is plain grey, and some show a "map tiles failed to load" toast.

- Plan 1: [ui-facelift-frame-1-expected-strategic.png](ui-facelift-frame-1-expected-strategic.png)
- Plan 2: [ui-facelift-frame-2-expected-strategic.png](ui-facelift-frame-2-expected-strategic.png)
- Plan 2: [ui-facelift-frame-2-expected-opponent.png](ui-facelift-frame-2-expected-opponent.png)
- Plan 2: [ui-facelift-frame-2-expected-ready-tip.png](ui-facelift-frame-2-expected-ready-tip.png)
- Plan 3: [ui-facelift-frame-3-expected-collapsed.png](ui-facelift-frame-3-expected-collapsed.png)
- Plan 4: [ui-facelift-frame-4-expected-strategic-1920.png](ui-facelift-frame-4-expected-strategic-1920.png)
- Plan 4: [ui-facelift-frame-4-expected-strategic-1280.png](ui-facelift-frame-4-expected-strategic-1280.png)
- Plan 5: [ui-facelift-frame-5-expected-menu.png](ui-facelift-frame-5-expected-menu.png)
- Plan 5: [ui-facelift-frame-5-expected-opponent.png](ui-facelift-frame-5-expected-opponent.png)

## Notes for the Reviewer

- Two fixes ride along in plan 2, because the new layout would otherwise cause the problems. The AI activity log scrolls to its newest line when the Opponent tab is shown; without this, lines added while the tab is hidden stay out of view. Control tips near the window's right or bottom edge open toward the inside; without this, the rail's and Ready's tips are squeezed or cut off.
- Plan 3 also makes the tactical battles dialog use the shared map-size watcher instead of its own copy.
- Each plan updates `doc/` for its own changes, as `AGENTS.md` asks. The README's test count and its OpenRouter setup steps are left for the spec's Phase 7. `doc/releasing.md` updates the test count at release time.
- On macOS, Quit closes the window and leaves the app in the dock. That stays an open question in the spec.
- Production's number sums every human-controlled urban hex except neutral borders. Its tip, and one sentence in the layout spec, say a city adds its share only while it is building. The plans keep both. See plan 4.
