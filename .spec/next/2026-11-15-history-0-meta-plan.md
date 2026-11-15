# Charts and Replay: Meta-Plan

**Audience:** The user, and any coding agent about to run one of the four execution plans below.

**Purpose:** Say which plan runs when, what each one leaves behind, what has to be true before the next one starts, and what was decided along the way.

This file is not an execution plan. A coding agent does not edit code from it.

---

## The Four Plans

| Order | File | What it delivers | Screens |
| --- | --- | --- | --- |
| 1 | `2026-11-15-history-1-match-statistics-execution-plan.md` | Per-turn statistics for every side, private trust and threat in the talk reply, and `game:readMatchCharts` for the player's charts | none |
| 2 | `2026-11-15-history-2-charts-dialog-execution-plan.md` | The charts dialog on `c`: relationship stacks, the stance timeline, and nine line charts | the dialog |
| 3 | `2026-11-15-history-3-replay-stepping-execution-plan.md` | Recording of what the screen was given, then replay on `p`: the panel, step back and forward, the slider, the turn field, and both dialogs per step | the replay panel |
| 4 | `2026-11-15-history-4-replay-playback-execution-plan.md` | Play with animations, and replay inside a battle | none new |

```
statistics ──► charts dialog ──► replay stepping, Phases 4–8 ──► replay playback
   (1)            (2)                      (3)                         (4)

               replay stepping, Phases 0–3 (the recording): needs nothing
```

Plan 2 needs plan 1. Plan 4 needs plan 3. Plan 3's first four phases are main-process only and need nothing from the chart plans. Its screen phases need plan 2, because both share one test for "another dialog is open" and one keyboard handler.

### Recommended order

1. **Plan 1, then plan 2.** Charts are what you asked for now.
2. **Plan 3, Phases 0 through 3 only, before the first Cup match.** Those phases are the recording, they have no screen, and the plan is written so they can ship on their own. A match is replayable only from the first turn that has this recording, so every Cup match played before it exists can never be replayed.
3. **The rest of plan 3, then plan 4, when the Cup videos need them.** You said to build replay when it is needed and not before. The screen can wait. The recording cannot.

If you would rather run plan 3 whole, that works too. The only wrong order is playing Cup matches before plan 3's Phase 2.

### What each plan leaves usable on its own

- **After plan 1:** commanders report trust and threat with their stances and see their own scores, and every turn's statistics are stored. Nothing on screen changes. This can ship.
- **After plan 2:** the charts dialog is complete. This can ship.
- **After plan 3, Phases 0 to 3:** matches record what replay needs. Nothing on screen changes. This can ship.
- **After plan 3:** replay by stepping, in the strategic game. The Play button is visible and disabled. This can ship.
- **After plan 4:** replay is complete.

---

## Before You Start

1. **Commit the messaging fixes.** The working tree holds the uncommitted fixes pass (86 changed files). These plans were audited against that tree. Plan 1 changes the talk reply, the talk prompt, and `side_stances`, all of which that work added.
2. **Commit before each plan.** The plans never commit, and they back up files to a temp folder instead.
3. **Saves keep working.** `EXPECTED_USER_VERSION` does not change in any of the four. Plan 1 adds two columns on open, the way seat columns are added today. You said a version bump would be acceptable if needed. It was not needed.

## Running Each Plan

Use your usual cycle for each plan, one at a time: audit the plan, implement the phases, audit the implementation.

- **Audit against the tree on the day you run the plan.** The plans were written and audited on 2026-11-15, against the working tree after the messaging fixes pass. Each Phase 0 lists the symbols the plan depends on.
- **Ask the auditing agent to confirm or deny** the claims each plan leans on hardest:
  - Plan 1: recording statistics cannot throw into a turn, the charts channel applies no fog filter, no prompt gains another side's statistics or another commander's stance, trust, or threat with fog of war off, and nothing changing was added to the cached system prompt.
  - Plan 2: no chart block can be taller than a quarter of the dialog, and no text reaches the DOM through `innerHTML`.
  - Plan 3: nothing in replay can change the match, a background commander can neither change the picture nor open a dialog during replay, queued orders and last-seen enemy markers are the same after replay, and the live turn's update dialog, animation, and Reports entries are unchanged.
  - Plan 4: the live turn and the live beat are unchanged, and replay never sends the end-of-animation notification to the main process.

## Gates

**After plan 1, before plan 2**

- [ ] Its Verification Bar passes and its Completion Log has no open item.
- [ ] A save holds one `side_statistics` row per strategic turn.
- [ ] `side_stances` holds trust and threat values after a few turns with a key.
- [ ] With fog of war off, an orders prompt shows the commander's own stances and scores and nothing about other commanders' views.

**After plan 2**

- [ ] Its Verification Bar and `ui:smoke` pass, and you worked through its manual checklist.
- [ ] The numbers on the charts match the top bar for the current turn.

**After plan 3, Phase 3 (the recording), before any Cup match**

- [ ] A played match holds `view_snapshot` rows after every frame and a `resolution_view` row per resolved turn and beat.
- [ ] The sizes in the results file are acceptable. This recording roughly doubles what each turn adds to the match database.

**After plan 3, before plan 4**

- [ ] Its Verification Bar and `ui:smoke` pass, and you worked through its manual checklist.
- [ ] A normal turn looks exactly as it did before.

---

## Decisions Already Made

| Decision | Chosen |
| --- | --- |
| Relationship graphs | One stack per side, spoke graph over row card, up to four in a row. A separate timeline strip, as wide as a line chart, with a subject selector, zoomable |
| Relationship metrics | Stance, trust (0 to 4), threat (0 to 4), and hexes taken in the last five turns |
| Charts | Built units, mercenary units, hexes, production per turn, stored production points, credits, upkeep per turn, units lost per turn, model cost so far |
| Chart library | uPlot |
| Fog and charts | Ignored for the player, who sees every value. Commanders see none of it, fog or no fog, beyond their own stance, trust, and threat |
| Replay and fog | A player sees each past turn as they saw it then. An observer, and anyone after the match, sees everything |
| Replay and commanders | They keep planning in the background. Ready is disabled until replay is left |
| Replay scope | Strategic turns in the strategic game, that battle's beats in a battle, never both |
| Older matches | Charts and replay start at the first turn recorded by the new build |

### Things to know that you did not ask for

1. **Commanders' views stay private.** Trust and threat are private, as stances are. The talk prompt still calls a stance private and says no other commander is told it, trust, or threat. It does not mention that the player's charts show them.
2. **Statistics are recorded each turn, not extracted from frames later.** Upkeep and production come from the same engine functions the top bar uses. Computing them at the turn boundary and storing one small event is far less likely to drift from the top bar than re-deriving them from a frame. The price is that charts start at the first turn recorded by plan 1.
3. **"City cells held" is not a separate chart.** A side's production per turn is the sum of the city cells in the hexes it controls, so the two charts would be identical. The other two extras I suggested, units lost per turn and model cost, are in.
4. **Replay shows recorded snapshots.** Plan 3 stores the exact snapshot the screen is given at every step, in two views, and the exact result each resolution handed to the renderer. Replay hands those back. This is why the recording has to exist before the Cup, and why it adds to the size of a match. Weather is stored with each snapshot, because it changes from turn to turn.
5. **Replay blocks map input at the map's own handlers.** Pan and zoom work. Clicks, double-clicks, right-clicks, and the build and battle-entry buttons do nothing, the selection and chat panels are hidden, and the console's Orders tab is disabled. The console moves to Commanders and stays there afterwards. The Reports tab, the Commanders tab, and destroyed-city overlays at battle-detail zoom do not follow the replay turn.
6. **Replay protects the live game's memory.** Last-seen enemy markers, queued orders, and a battle's pending marches are kept aside and put back when replay ends.
7. **Plans 3 and 4 each move a stretch of live-turn code** into a shared function, so replay shows the same update dialog and the same animations as a live turn. Those are the riskiest steps in the set. Each has a strict "move, do not rewrite" rule, a comparison against the live turn, and a fallback that leaves the live code untouched. Replay inside a battle has its own stop rule: if it disturbs anything outside the battle view, replay stays strategic only.
8. **Play becomes Pause while it runs.** You described Play with no way to stop it short of leaving replay. Pressing it again stops after the turn that is animating.

### Known limits

- **Losses and hexes taken are unknown for the first turn after a load,** because both are differences from a turn kept in memory.
- **A commander that never talks never reports.** Its row on a relationship graph says "no report", and that is correct.
- **The human player is never a reporter** on a relationship graph. The player reports no stance.
- **A recorded match grows.** With frames, statistics, and two view snapshots per step, expect each turn to add a few hundred kilobytes before compression. Plan 3's results file gives measured numbers.
- **An update dialog that waited for a battle** is replayed at the start of its turn without the battle lines the live game added afterwards.
- **`README.md` is not edited.** Add `c` and `p` to it yourself if you want them there.
