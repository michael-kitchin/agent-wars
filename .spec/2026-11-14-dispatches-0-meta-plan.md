# Match Recorder and Commander Messages: Meta-Plan

**Audience:** The user, and any coding agent about to run one of the three execution plans below.

**Purpose:** Say which plan runs when, what each one leaves behind, what has to be true before the next one starts, and how the pilot match is run at the end.

This file is not an execution plan. A coding agent does not edit code from it.

---

## The Three Plans

| Order | File | What it delivers | New tables |
| --- | --- | --- | --- |
| 1 | `2026-11-14-dispatches-1-match-recorder-execution-plan.md` | The match recorder: frames, typed events, consult telemetry in the match database, the recording file, and `npm run recording:summary` | `match_records` |
| 2 | `2026-11-14-dispatches-2-talk-stage-execution-plan.md` | Messages between sides, private stances, the talk stage before the orders stage, timeouts, and the taunt's retirement. Main process only | `side_messages`, `side_stances` |
| 3 | `2026-11-14-dispatches-3-chat-panel-execution-plan.md` | The message dialog's bullets, the chat panel in place of the + and − buttons, and removal of the leftover single-message fields | none |

Run them in this order. Each one checks in its Phase 0 that the one before it is finished, and stops if it is not.

```
recorder  ─────►  talk stage  ─────►  chat panel  ─────►  pilot match
(no screen)       (no screen)         (screens)           (user, with a key)
```

### Why this order

- **The recorder comes first** because the talk stage writes its messages, stance changes, and talk-call telemetry as recorder events. Without the recorder there is nowhere to put them, and the pilot match could not be measured.
- **The talk stage comes before the chat panel** because the panel only displays and stages what the talk stage stores and sends. Building it first would mean building against data that does not exist.
- **The pilot match comes last** because it needs all three: the talk stage to spend the tokens, the recorder to count them, and the chat panel so you can watch what was said.

### What each plan leaves usable on its own

- **After plan 1:** every match records itself and exports a recording when it ends. Nothing on screen changes. This can ship.
- **After plan 2:** commanders talk to each other and to you. You can see only what a commander wrote to you, in the existing dialog, and you cannot write back yet. This can ship, but it is an in-between state. An Observe match shows no messages until plan 3.
- **After plan 3:** the feature is complete.

---

## Before You Start

1. **The maintainability consolidation plan** (`2026-11-14-maintainability-consolidation-execution-plan-v10.md`). On 2026-11-14 its changes were in the working tree, uncommitted (about a hundred modified files, plus new ones such as `src/shared/objectGuards.ts`). It touches files these plans also edit (`afterResolution.ts`, `commanderPool.ts`, `openRouter.ts`, `orderResponseParsing.ts`, `envelopeJsonSchema.ts`, `mapHelpers.ts`). Review and commit it, or revert it, before plan 1. Do not start plan 1 on top of unreviewed refactoring, because a failed phase would be hard to tell apart from it.
2. **Commit before each plan.** The plans never commit, and they back up files to a temp folder instead. A clean commit before each one gives you a second way back.
3. **Saves keep working.** `EXPECTED_USER_VERSION` does not change. The three new tables are created when a database is opened, the way `pending_air_drop_orders` already is, so the match on disk and every existing save still load. A match that began in an earlier build is recorded from the turn it is loaded on. One thing to know: a save made by a new build still opens in an older build, which ignores the new tables and records nothing while it plays.

## Running Each Plan

Use your usual cycle for each plan, one at a time: audit the plan, implement the phases, audit the implementation. Two notes for the audits:

- **Audit against the tree as it is on the day you run the plan.** The plans were written on 2026-11-14 against build 2.25.0 plus the operations work. Each Phase 0 lists the symbols the plan depends on. If the audit finds one has moved or been renamed, fix the plan before running it.
- **Ask the auditing agent to confirm or deny** the three claims each plan leans on hardest:
  - Plan 1: nothing under `src/main/recorder/` can throw into a turn, and nothing it writes can contain a machine-local config row.
  - Plan 2: in every consult path, no orders call can start before the wave's talk round has closed, and an AI commander's prompt can contain only messages addressed to it or sent by it.
  - Plan 3: the renderer never receives a message the viewer may not see, and message text reaches the DOM only through `textContent`.

## Gates Between Plans

Do not start the next plan until every line here is true for the one before it.

**After plan 1, before plan 2**

- [ ] Its Verification Bar passes and its Completion Log has no open item.
- [ ] You played a short match, saved it, and saw `match_started`, frames, `orders_committed`, `strategic_resolution`, and `consultation` rows in `match_records`.
- [ ] Ending a match wrote a recording, and `npm run recording:summary` printed a row per commander.
- [ ] The results file's frame size and capture time are acceptable to you. If a frame is much larger than about 150 KB compressed, or capture takes more than about 100 ms, decide what to do before going on: the cheapest lever is to stop writing a full frame on tactical beats.
- [ ] The recording format is the one you want to keep. After the first Cup match is recorded, changing it means old recordings need a converter.

**After plan 2, before plan 3**

- [ ] Its Verification Bar passes and its Completion Log has no open item.
- [ ] An Observe match of a few turns produced rows in `side_messages` and `side_stances`.
- [ ] In `debug.log`, every `requestTalk` line of a wave comes before that wave's first `requestOrders` line.
- [ ] You read twenty or so real messages and they are worth showing. If commanders mostly produce filler, tune the talk prompt now, in `talkPrompt.ts`, before building the screen around it.

**After plan 3, before the pilot**

- [ ] Its Verification Bar and `ui:smoke` pass.
- [ ] You worked through its manual checklist.

---

## Decisions Already Made

These hold across all three plans. Each plan repeats the ones it needs under "Locked Decisions".

| Decision | Chosen |
| --- | --- |
| Frames | Full snapshots at every strategic turn and every tactical beat, in the match database |
| Events | Only for causes: orders, resolutions, consultations, strategies, match start and end, messages, stance changes. Everything else is derived by comparing frames |
| Timeline, charts, relationship graph | Not in these plans. They read this data later |
| Where messages run | Strategic turns and tactical beats |
| When a commander talks | Only in a wave where it is being consulted for orders anyway |
| A waiting message | Is enough to cause an orders consult for its recipient, and does not cause a talk call |
| Stage order | Every talk call in a wave ends, fails, or times out before any orders call in that wave starts |
| Who sees a message | AI commanders: only their own, always. A player: only their own with fog of war on, everything with fog of war off. An observer: everything |
| Alliances | None. A message binds nobody |
| The taunt | Retired. The orders reply has no `message` field. The `turn_notes_history.message_text` column stays, unused, so saves stay compatible |
| Save format | `EXPECTED_USER_VERSION` is not raised. New tables are created on open |

### Four things to know that you did not ask for

1. **"Same transaction" is met a different way.** Turn resolution is not one database transaction today, and three places inside it open their own, so it cannot simply be wrapped. Plan 1 instead makes every record a single insert written in the same synchronous step as its state change, never opens a transaction of its own, and writes a frame whenever the current step differs from the last recorded one. The effect you wanted holds: history cannot quietly drift from state. Messages and stance changes in plan 2 are written with their events inside one real transaction.
2. **The word "dispatch" is taken.** `CommanderDispatch` already means one finished consult's text for the dialog. In code the new things are side messages, stances, and the talk stage. On screen the word is **Messages**.
3. **The + and − buttons really go away.** The wheel and the keyboard still zoom. Several `doc/ux/` pages and one smoke check mention the buttons, and plan 3 updates them.
4. **`README.md` is not edited.** It lists the app's environment variables. The two new ones, `AGENT_WARS_DISABLE_RECORDER` and `AGENT_WARS_DISABLE_TALK`, are documented in `doc/` only. Add them to the README yourself if you want them there.

### Known limits

- **No reply within a wave.** Commanders write at the same time. A reply to something said this turn comes next turn at the earliest.
- **One path talks one commander at a time.** When Ready has to consult a commander inline because nothing was planned ahead, that commander is a wave of one. It still talks first and still sees earlier messages. It just has no one talking beside it.
- **A commander that is only consulted because of a message does not answer in that wave.** It answers the next time the game's own policy consults it. That is the rule you chose to keep cost bounded. If replies feel slow in the pilot, this is the first thing to revisit.
- **The talk prompt is thin.** It gives the commander its recent turns, its last plan, the sides, its stances, and the conversation so far. It does not give a map or unit counts. That keeps the call cheap. The pilot will show whether the messages are grounded enough.
- **Stances are stored and recorded but not shown.** The relationship graph is later work.
- **The player's turn-update text is not recorded.** The renderer composes it. It can be rebuilt from a recorded resolution.

---

## The Pilot Match

**Goal:** Find out what the talk stage costs, and whether a Cup of the size you want fits the $200 to $300 budget.

**Who runs it:** You. It spends real money and no coding agent should run it.

### Setup

- An Observe match, four AI sides, the models you intend to use in the Cup (or the cheapest and the most expensive of them, in two matches).
- A regional map, with a turn limit of 15.
- Logging off, as you run long simulations today.
- Run it twice with the same models, map, and limit: once normally, and once with `AGENT_WARS_DISABLE_TALK=1` set in the environment. The second run is the baseline.

### Measure

When each match ends, a recording is written under `recordings` in the app's user-data folder. Then:

```powershell
npm run build:main
npm run recording:summary -- "<path to the first recording>"
npm run recording:summary -- "<path to the second recording>"
```

Each prints a row per commander and stage (`talk` and `orders`) with consult counts, tokens, cost, and wall-clock time, and a total.

### Read the result

Write these down in a short results file in `.spec` (`2026-11-14-dispatches-pilot-results.md`):

| Question | Where the answer is |
| --- | --- |
| What does talk cost per match? | The `talk` rows' total cost in the first run |
| What does talk add to the orders stage? | The `orders` total in the first run minus the `orders` total in the second. Messages in the orders prompt, and consults caused by a waiting message, both land here |
| What does a match cost with messages on? | The first run's total |
| How much slower is a turn? | Total wall-clock time, first run against second, divided by turns |
| How big is a recording? | The file sizes, and the frame figure the summary prints |

Then project: cost per match with messages on × the number of Cup matches, scaled by the turn limit you will actually use. Compare it with the budget.

### If it does not fit

In order of how little they cost you:

1. Use cheaper models for the early rounds of the bracket.
2. Lower the turn limit.
3. Talk on strategic turns only. This is a one-line condition where the pool opens a round for a tactical wave.
4. Let a commander talk every second consult.

Do not change the format of the recording to save money. The Cup's recordings are the footage and the data for everything that comes after.

### Then

Freeze the build and the recording format, and start the Cup. The timeline and replay screen, the charts, and the relationship graph can be built while matches are being played, because every match will already have recorded what they need.
