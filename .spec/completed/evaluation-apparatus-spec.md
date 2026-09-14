# Evaluation apparatus specification

## Why this document exists

The application can play a full game against a language model, and it cannot yet score one. Nothing
records what the model was offered, what it chose, or what the call cost, in a form that survives
the turn. Every comparison between models therefore rests on watching games, which is not
reproducible and not defensible.

This specifies the apparatus that would make scored comparison possible. It is a specification, not
an implementation: the work is product-scale, it touches the database schema, and it should be
planned and reviewed as product work rather than bolted on.

Scope is deliberately narrow. This covers instrumentation, a headless driver, and a deterministic
reference opponent. It does not cover the rubric itself, which is frozen separately and must stay
frozen before any run, nor the analysis of results.

**This file lives at `.spec/` root rather than `.spec/completed/` because it is not implemented.**
`.spec/completed/` is a corpus of finished documents, and its file count is a published figure.
Move this document there when the apparatus exists, not before.

---

## 1. State of the code, verified

Everything in this section was read out of the current source. A later plan can be written against
it without re-deriving any of it. Where the code contradicts an earlier assumption, the correction
is called out, because acting on the earlier assumption would waste real effort.

### 1.1 What persists, and what does not

Schema: `src/main/gameDb/schema.ts`, `getFullDdl`.

| Table | Retains | Consequence for scoring |
|---|---|---|
| `units` | current only | No per-turn force composition history. |
| `turn_state` | current only, singleton with `id = 1` | Turn number is readable; no per-turn record. |
| `game_config` | current only, key-value with `INSERT OR REPLACE` | Not a log. |
| `standing_orders` | current only, primary key `(player_id, unit_id)` | `created_turn` sits on the live row; a cancelled or replaced order leaves no trace. |
| `ai_callback_subscriptions` | current set only | `replaceSubscriptions` in `src/main/callbackSubscriptions.ts` deletes every row for the player then re-inserts, so a prior consult's subscription set is gone. |
| `ai_pending_orders` | current only, one row per player | Holds the next-Ready orders and is cleared on consumption in `src/main/gameIpcHandlers.ts` and `src/main/openRouter/afterResolution.ts`. |

The conclusion that matters: **six of the eight rubric metrics cannot be computed from the database
after a game ends.** Only result, turns to terminal state, and final force ratio read cleanly, from
`game_config`, `turn_state` and `units`. Everything else is either never written or overwritten
within the turn that produced it.

### 1.2 The Best Options table

Enumeration is `collectAggregatedPossibleActionRows` in
`src/main/openRouter/possibleUnitActions.ts`, called with `forThisTurnOptionsTable: true`.
Assembly into the prompt runs through `buildStrategicOperationalMapSectionMarkdown` in
`src/main/briefing/map/briefingMapSection.ts` and `renderThisTurnOptionsTableMarkdown` in
`src/main/openRouter/briefingTables.ts`.

Ranking is `compareTableRowsForUnitPriority` in
`src/main/openRouter/possibleUnitActionsTableAssembly.ts`: descending enemy unit count, then a
tempo rank putting air strikes and ranged shots ahead of ferry and move, then urban count with an
exception for approach rows, then distance, then action type, then latitude and longitude, then hex
identifier. `selectTopRowsPerUnit` then caps the list at **five rows per unit**.

Two corrections to earlier assumptions:

- **The ranked list is never persisted.** It exists as a string inside the assembled prompt and
  then is discarded. Recomputing it after the fact would score the model against a different table
  from the one it saw, because unit positions and enemy proximity have moved on.
- **"Top-N" is not a single number.** The cap is per unit, applied per bucket subsection, so N
  varies with how many units are in play. Any post quoting the metric has to state that the
  denominator is the rendered table rather than a fixed N.

### 1.3 What blocks a plain-Node driver

`src/main/openRouter/openRouter.ts` line 8 imports `{ app, safeStorage }` from `electron`. The uses
are inside functions -- `app.getPath('userData')` in `getConfigPath`, `safeStorage` in `loadKey` and
`saveKey` -- so importing the module under plain Node does not throw at load, but calling
`requestOrders` does.

**`src/main/openRouter/requestOrdersFlow.ts` has no Electron dependency at all.** This is the
correction that changes the design: a driver should call `requestOrdersFlow(deps, state, modelId,
options)` directly and construct its own `RequestOrdersFlowDeps`, rather than calling
`requestOrders` and shimming Electron around it. The dependency type is
`src/main/openRouter/requestOrdersFlowDepsTypes.ts`; the field that matters is `loadKey`, which the
driver supplies from the environment.

Database opening does require Electron on the production path. `initDatabase` in
`src/main/gameDb.ts` resolves through `resolveGameDbFileUnderUserData`, which calls
`requireElectronApp().getPath('userData')` and throws without it. The plain-Node entry point is
`openGameDatabaseAtPathForTests(absolutePath)`, with `closeGameDatabaseForTests()` to release it,
and `src/main/testSupport/withTempGameDb.ts` shows the established pattern of creating a temporary
directory, opening there, and calling `resetGameForNewMatch`.

### 1.4 The playback lock and the two interrupts

The lock is not in `src/main/hybridTurnPipeline.ts`, which only logs pipeline boundaries. It is a
module-level `pendingPlaybackConsult` in `src/main/ipc/deferredResolutionPlaybackConsult.ts`, set by
`setPendingStrategicReadyConsult`, `setPendingMeleeResolveConsult` or
`setPendingTacticalBeatConsult`, and cleared by `handleNotifyResolutionPlaybackComplete`. While it
is set, `hasDeferredPlaybackConsultPending()` makes `handleGameReady` in
`src/main/gameIpcHandlers.ts` fail, so no second turn can start.

A driver has to complete the handshake by calling `handleNotifyResolutionPlaybackComplete` with a
matching payload -- `{ kind: 'strategic', planningTurnNumber }`, `{ kind: 'melee',
planningTurnNumber }`, or `{ kind: 'tactical', battleId }`, per `shared/ipc/readyTypes`. A mismatched
payload routes to `abandonDeferredPlaybackConsult`, which discards the consultation silently. That
is a scoring hazard rather than a crash: the run continues and a turn's decision is missing, so the
driver must treat an abandoned consult as a failed run rather than a skipped turn.

Two branches interrupt a normal advance and both need handling:

- **Melee interception.** `readyStrategicResolutionPipeline.ts` can return `awaitingMeleeDecision`;
  the snapshot lives in `src/main/gameActions/meleeInterceptPendingState.ts`, and
  `failIfMeleeInterceptDecisionPending` in `readyStrategicGuards.ts` blocks another Ready until
  `game:resolveMeleeIntercept` runs.
- **Tactical battle.** `failIfTacticalBattleActive` in the same guards module blocks strategic Ready
  while `isTacticalBattleActive()`, entered through `game:startTacticalBattle`.

### 1.5 Seeding

`seedGameSeedIfMissingWithOps` in `src/main/gameDb/gameConfigKv.ts` inserts
`Math.floor(Math.random() * 2 ** 31)` when no row exists, and `resetGameForNewMatch` in
`src/main/gameDb/resetGame.ts` deletes the row and re-seeds. `getGameSeedWithOps` reads it.

**There is no exported setter.** Tests pin the seed with raw SQL against `game_config`. A
reproducible run needs a real API, because a comparison across models on "the same scenario" is
meaningless if the seed differs between runs.

### 1.6 Cost, tokens and latency

Token counts and cost come from the OpenRouter response `usage` field, read in
`src/main/openRouter/requestOrdersToolLoop.ts` and the repair pass in
`requestOrdersRepairExchange.ts`, aggregated as `RequestOrdersUsageTotals`. Latency is `wallClockMs`,
computed in `requestOrdersApplyParsed.ts`.

All four values are attached to the result object and returned over IPC on `game:ready` and the
melee-resolve reply as `cost`, `wallClockMs`, `inputTokens` and `outputTokens`. **None of them is
written to SQLite.** The renderer displays them and they are gone.

### 1.7 Rejected hex codes

`decodeOpenRouterToolArgsForExecution` in `src/main/openRouter/openRouterToolArgsHex.ts` throws on
an unknown code; `requestOrdersToolLoop.ts` catches it, logs at error level, and returns a tool
error to the model. Order-level drops accumulate as `dropReasons` in
`src/main/openRouter/orderResponseParsing.ts` and surface as `RequestOrdersResult.dropped`.
Tactical validation returns `tacticalInvalidResult` strings from
`src/main/tacticalBattle/tacticalOpponentOrderValidation.ts`.

Every one of these is per-consultation and in memory. There is no counter and no persistence, so
the coordinate-validity metric currently exists only as log lines a human could grep.

### 1.8 Production points

`res1_build_progress.stored_points` holds the current balance, read and written through
`getBuildProgressPointsForHex` and `setBuildProgressPointsForHex` in
`src/main/gameDb/controlInfrastructure.ts`. `processProductionAfterControlResolution` in
`src/main/gameActions/controlAndProduction.ts` computes income as stored points plus urban hex count,
spends, and writes back only the remainder.

Per-turn spend is therefore not recoverable. The balance after spending does not tell you what was
available before it.

### 1.9 What already exists of a reference opponent

**Correction to an earlier assumption: the existing non-LLM path does not drive off the Best Options
table.** `buildUnconsultedOpponentOrders` in `src/main/gameIpcHandlers.ts` combines
`generateOrdersForStandingOrders` from `src/main/tools/standingOrdersGeneration.ts` with
`collectTempoRuleAttacks`. It runs when AI planning is off or no key is configured, and the tempo
sweep also runs after successful model orders.

That is a fallback, not a baseline. It executes standing orders and takes free attacks; it has no
planner, so a unit with no standing order and no tempo-rule target does nothing. Scoring a model
against it as-is would measure the model against near-passivity, and metric 1 would be comparing the
model's choices against a table the opponent never consulted.

---

## 2. Instrumentation, metric by metric

One design decision governs all eight: **capture at decision time, not by reconstruction.** Six of
these metrics are unrecoverable precisely because the code discards the context that produced a
choice. Reconstruction after the fact scores the model against a world that has moved.

The mechanism is a single append-only table written once per consultation, plus a per-run manifest.
One table rather than eight keeps the write on one code path, which is the path a later plan has to
get right.

Proposed table, to be defined in `src/main/gameDb/schema.ts`:

```
CREATE TABLE IF NOT EXISTS evaluation_consultations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  consult_kind TEXT NOT NULL,          -- strategic | tactical | melee
  model_id TEXT NOT NULL,
  offered_options TEXT NOT NULL,       -- JSON: the rendered Best Options rows
  chosen_actions TEXT NOT NULL,        -- JSON: orders that survived validation
  rejected_actions TEXT NOT NULL,      -- JSON: drop reasons and bad hex codes
  standing_orders_before TEXT NOT NULL,
  standing_orders_after TEXT NOT NULL,
  callback_subscriptions TEXT NOT NULL,
  production_available INTEGER,
  production_spent INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL,
  wall_clock_ms INTEGER
);
```

Nothing in this table is derived. Every column is a value the code already holds and currently
throws away, which is what makes the write cheap and the figures trustworthy.

| # | Metric | What must be captured | Where the write goes |
|---|---|---|---|
| 1 | Action efficiency | The rendered Best Options rows, exactly as the model saw them, plus which of them the model's surviving orders match | `briefingMapSection.ts` must return the row array alongside the markdown instead of discarding it; `requestOrdersApplyParsed.ts` records offered against chosen |
| 2 | Standing-order persistence | The standing-order set before the consult and after it, so maintained-versus-replaced is a comparison rather than an inference | `requestOrdersFlow.ts` snapshots before calling the model; `standingOrdersCore.ts` writes are already complete by the time the after-snapshot is taken |
| 3 | Engagement initiation rate | Opportunities meeting the proximity-and-force criterion, which is derivable from the offered rows, and engagements actually ordered | Derived from columns `offered_options` and `chosen_actions`; needs no separate capture, which is the payoff of storing the offered table |
| 4 | Production utilization | Points available before the spend and points spent | `controlAndProduction.ts` must record income before `setBuildProgressPointsForHex` overwrites the balance |
| 5 | Coordinate validity | Every rejected hex code and every dropped order, with its reason | `openRouterToolArgsHex.ts` decode failures and `orderResponseParsing.ts` drop reasons both funnel into `rejected_actions` |
| 6 | Result | Terminal outcome against the reference opponent | Run manifest, written at terminal detection |
| 7 | Turns to terminal state | `turn_state.turn_number` at terminal detection | Run manifest |
| 8 | Final force ratio | `units` grouped by player at terminal detection | Run manifest |

Callback discipline is reported alongside the eight rather than scored within them, and the
`callback_subscriptions` column carries it: subscriptions per consult, distinct events used, and the
all-events, no-events or selective classification.

Cost, tokens and latency are not rubric metrics and are captured in the same row because they are
already in hand at the same moment and are needed for cost-per-rubric-point.

### 2.1 What this instrumentation must not do

It must not change what the model sees. Returning the offered rows from
`buildStrategicOperationalMapSectionMarkdown` alongside the markdown is additive; altering the
ranking, the cap or the rendering to make capture easier would invalidate every comparison against
a run made before the change.

It must not fail a turn. A failed evaluation write is a lost data point and must not lose a game, so
the write is wrapped and logged at error level rather than propagated.

---

## 3. The headless driver

A plain-Node script that plays a scripted game to a terminal state and writes rows. Not an Electron
process, not a test.

### 3.1 Prerequisites the driver needs from product code

Each of these is a change to product code, not something the driver can work around:

1. **A seed API.** An exported setter for `game_config.game_seed`, because pinning it by raw SQL
   from a driver puts schema knowledge in the wrong place and will silently stop working.
2. **A supported non-Electron database path.** Either `openGameDatabaseAtPathForTests` is renamed
   and documented as a real entry point, or an equivalent is added. A driver depending on a
   `ForTests` symbol is a driver that breaks the next time someone tidies test support.
3. **A turn-advance entry point that does not require the renderer.** Either the playback handshake
   becomes callable directly, or a headless mode is added that does not set the pending consult.
   Option one is preferable: it exercises the same code the application does.
4. **The instrumentation in section 2.**

### 3.2 What the driver assembles itself

- A `RequestOrdersFlowDeps` with its own `loadKey` reading the key from the environment. Everything
  else in that dependency object -- `getToolFlags`, `toolGroupRegistry`,
  `buildSystemPromptForTools`, `buildToolDefinitions`,
  `postOpenRouterChatWithTimeoutAndRetry`, `getGroupIdForToolName`, `validateAiOrder`,
  `validateAiRangedOrder`, `formatLatLng` -- comes from product code unmodified. Substituting any of
  them would mean scoring something other than the application.
- A temporary database per run, following `src/main/testSupport/withTempGameDb.ts`.
- A run manifest: run identifier, model identifier, scenario identifier, seed, application version,
  git commit, and the wall-clock start. Without the version and commit, two runs are not comparable
  and there is no way to find out afterwards.

### 3.3 The loop

Set up the database and pin the seed. Then per turn: request orders through `requestOrdersFlow`,
write the evaluation row, advance the turn, complete the playback handshake, and handle the two
interrupts. Stop at a terminal state or at a turn cap, and write the manifest either way.

Three failure modes must abort the run rather than continue, because each one produces a plausible
score from an incomplete game:

- An abandoned deferred consult, which loses a turn's decision silently.
- A model call that exhausts its retries, which is not the same as a model choosing to do nothing.
- A turn cap reached without a terminal state, which must be recorded as censored rather than as a
  draw.

### 3.4 Where it lives

`scripts/evaluation/` rather than `src/`, because it is not part of the shipped application and
should not be in the renderer or main bundle. It is project-owned code and is held to the same
standards: orienting comments, levelled logging, and tests for the loop's essential failure cases.

---

## 4. The reference opponent

The rubric calls for a deterministic non-LLM opponent giving every model an identical challenge at
zero opponent-side API cost. Section 1.9 establishes that what exists is a fallback rather than a
baseline.

Requirements:

- **It decides from the same Best Options rows the model is offered.** This is what makes metric 1
  meaningful: both sides are choosing from one enumeration, so a difference in choices is a
  difference in judgment rather than a difference in information.
- **It is deterministic given a seed.** Same seed, same scenario, same play, every time. Any
  tie-break must be explicit, and `compareTableRowsForUnitPriority` already provides a total
  ordering to borrow.
- **It is a stated policy, not a good player.** Take the highest-ranked offered row per unit,
  subject to a small number of written rules. The point is a fixed yardstick, not a strong
  opponent, and a policy that can be stated in a paragraph is one a reader can judge.
- **It is separable.** A module the driver selects, not a branch inside `gameIpcHandlers.ts`,
  because the existing fallback is entangled with IPC handling and the baseline has to be
  independently testable.

The published caveat is that the ranking encodes one defensible definition of a good action, and a
model scored against agreement with that ranking is being measured against its author's
assumptions. That belongs in any post using metric 1.

---

## 5. Sequencing

The order is forced by dependency, and the reason to state it is that doing the interesting part
first produces numbers nobody should trust.

1. Instrumentation. Everything downstream needs somewhere to write.
2. The seed API and the non-Electron database entry point. Small, and the driver cannot be
   reproducible without them.
3. The driver, run against the existing fallback opponent. This proves the loop and the handshake
   before the baseline's behaviour becomes a variable.
4. The reference opponent.
5. Scored runs.

Steps 1 through 4 produce no results and are the whole cost. Anyone tempted to reorder should note
that the application reached a working state without any of this, which is exactly how the
measurement gap arose.

---

## 6. Verification

Each step is checkable without the next one existing.

**Instrumentation.** A single game played through the application writes one
`evaluation_consultations` row per consultation, and the `offered_options` column reproduces the
Best Options table in the prompt dump for that turn byte for byte. That comparison is the whole
point: it proves the capture is the offered table and not a reconstruction.

**Seed API and database entry point.** Two runs at the same seed produce identical initial unit
placement. A plain-Node script opens a database at an explicit path without Electron.

**Driver.** One scripted game reaches a terminal state and writes a manifest plus a row per turn.
Then, deliberately: an abandoned consult, an exhausted retry, and a turn cap each abort with a
distinguishable reason. A driver that only works when nothing goes wrong is not usable for
comparison, because a partial run scores as a complete one.

**Reference opponent.** Same seed and scenario, two runs, identical play. Its choices are all
present in the offered rows for their turn.

**Scored runs.** Every one of the eight metrics computes from the tables with no manual step, and
the rubric used is the frozen one.

---

## 7. Out of scope

Analysis and presentation of results. Media capture. The round-robin tournament, which needs the
baseline first. Any change to prompt assembly, the tool surface, or the briefing format, since all
three are the system under test and changing them mid-measurement invalidates the comparison.
