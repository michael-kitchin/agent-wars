# UI Facelift Battle: Execution Plans

The spec's Phase 5 builds the battle header: while a battle is open, the top bar names the battle and its beat, holds Exit Battle, and compares the two sides in a force bar. See [ui-facelift-spec.md](ui-facelift-spec.md). Three plans build it. Run them in order, one at a time. After each plan, the reviewer reads the agent's report, does the plan's reviewer checks, and commits before the next plan starts. Each plan checks that the previous one is in before it begins.

| Order | Plan | Adds | Tests after | Smoke run after |
| --- | --- | --- | --- | --- |
| 1 | [Battle Header](ui-facelift-battle-1-header-execution-plan.md) | While a battle is open, the top bar becomes the battle header: a darker face, the battle's title and hex caption, and the beat line | 885 | 391 passed, 33 screenshots |
| 2 | [Exit Battle in the Header](ui-facelift-battle-2-exit-battle-execution-plan.md) | Exit Battle moves into the battle header beside Settings, and the control at the bottom of the map goes | 885 | 406 passed, 34 screenshots |
| 3 | [Force Bar](ui-facelift-battle-3-force-bar-execution-plan.md) | The force bar in the middle of the battle header: each side's sub-unit count and the player's share | 889 | 416 passed, 34 screenshots |

## How the Plans Were Checked

- Each plan's steps, as written here, were applied in order to a copy of the repository starting at `2e3ec02`, and each result matched the verified files exactly.
- After each plan, the fast loop and the smoke run against the real app in Electron passed. The full tests ran once, after plan 3, and passed; the totals for plans 1 and 2 follow from the tests each plan adds and removes, starting from 882.
- Each plan ends with an Exact-match check: hashes of every file it creates or edits, so the agent can prove its result matches.
- Each plan has a checkpoint after its source steps (build, types, and lint), so a copying mistake shows up before the markup, styles, smoke checks, and docs.

## Expected Screenshots

Each plan compares its own smoke screenshots with these images. They were made without map tiles, so the basemap is plain grey, and some show a "map tiles failed to load" toast.

- Plan 1: [ui-facelift-battle-1-expected-header.png](ui-facelift-battle-1-expected-header.png)
- Plan 1: [ui-facelift-battle-1-expected-small-window.png](ui-facelift-battle-1-expected-small-window.png)
- Plan 2: [ui-facelift-battle-2-expected-exit.png](ui-facelift-battle-2-expected-exit.png)
- Plan 2: [ui-facelift-battle-2-expected-exited.png](ui-facelift-battle-2-expected-exited.png)
- Plan 3: [ui-facelift-battle-3-expected-force-bar.png](ui-facelift-battle-3-expected-force-bar.png)
- Plan 3: [ui-facelift-battle-3-expected-small-window.png](ui-facelift-battle-3-expected-small-window.png)

## Decisions Made for These Plans

- The force bar counts every sub-unit in the battle, including any carried by a ship.
- In a narrow window the hex caption gives way first. Below 1100 px the force bar narrows to its two counts and the bar, without "yours", "enemy", or the caption.
- The smoke run leaves its battle with Exit Battle mid-fight. Playing a battle to the end is a reviewer check in plan 2, because its length depends on the dice.
- The spec's open question on the enemy count under fog is settled: a battle has no fog of war (`doc/combat-rules-v3.md`, "Visibility in tactical battles is universal"), and the battle snapshot lists every sub-unit. The bar's tip says the counts are exact.
- The battle header takes the mockup's darker, warmer face, with two new tokens. Exit Battle keeps the shared button colors rather than the mockup's amber outline, as the style guide asks of every button.
- The status line keeps the weather icon and word, as the date line showed them before, rather than the icon alone.
- While a beat plays back, the force bar keeps the counts from before the beat, so it does not show losses before the map does.
- Three plans, each committed before the next: the battle header; Exit Battle in the header; the force bar.

## Notes for the Reviewer

- Plan 1 makes the date block show only the world-map turn and moves the beat wording to `src/shared/battleHeaderText.ts`. In a battle the date block is hidden, but it still names the world-map turn, so the smoke run's wait for world-map planning also checks that the battle header is gone.
- Plan 1 moves the smoke run's new-game steps, unchanged, into `scripts/ui-smoke/ui-smoke-new-game.cjs`, and the settle times into `ui-smoke-scenes.cjs`, because `ui-smoke.cjs` had reached the 600-line limit.
- Before the second session the smoke run moves every enemy land unit into the battle's hex, and the first session's turn depends on the dice, so the battle's counts differ from run to run, sometimes even and sometimes lopsided.
- The smoke run gains two scenes: the battle at 800 × 600 (plan 1) and the world map after leaving the battle (plan 2).
- Plan 2 renames `refreshTacticalExitHud` to `refreshTacticalExitButton` and rewords the renderer comments that named the removed `#tactical-battle-hud`, so no code points at a control that no longer exists.
- Each plan updates `doc/` for its own changes, as `AGENTS.md` asks.
- This index links to the plans and images beside it in `.spec/`, and the spec links to this index. If the plans and images move to `.spec/completed/`, update the links here.
