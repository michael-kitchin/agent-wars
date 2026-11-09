# Model Call Reliability and Throughput

> **For the implementing agent:** Follow this plan from top to bottom, one phase at a time. Finish each phase's verification before you start the next one. When a check fails, stop and report the command, the actual output, and the expected output. Do not make a check pass by weakening a test. Do not commit or push. Do not build anything this plan does not name. Phase names and numbers in this file stay in this file. Never put them in code, comments, tests, `doc/`, or configuration.

**Goal:** Give each model call twice as long, stop retrying a call that already used its whole deadline, let each commander choose how OpenRouter picks a host, and record enough per consult that a slow or failed host can be identified after the match.

**Tech stack:** TypeScript under `src/main/`, `src/renderer/`, and `src/shared/`. Node `node:test` tests compiled by `npm run build:main` into `dist/main/` and `dist/shared/`. The renderer is typechecked with `npm run check:renderer-types` and bundled into the tracked file `static/renderer.js` by `npm run build:renderer`. Layout is checked by `npm run ui:smoke`. Markdown docs under `doc/`.

## Locked decisions

These come from the product owner. Do not change them.

- **Two deadlines double.** `AI_MODEL_REQUEST_TIMEOUT_MS` goes from 90_000 to 180_000. `AI_CONSULTATION_WALL_CLOCK_MS` goes from 300_000 to 600_000. Both live in [`src/shared/aiConsultationLimits.ts`](../src/shared/aiConsultationLimits.ts). `AI_CONSULTATION_WAIT_TIMEOUT_MS` keeps its formula, so it becomes 1_320_000. `AI_MODEL_REQUEST_RETRY_COUNT` stays 1.
- **A timeout is not retried.** When the per-request abort timer fires, that call is finished. Do not send it again.
- **What is still retried once.** A thrown socket or connection error. HTTP 408, 429, 502, 503, and 504. Nothing else. HTTP 500 is not retried. The 402 credit-clamp retry, the `tool_choice: required` retry, and the structured-output retry stay as they are, and a stalled response body stays not retried.
- **These timers do not change.** `OPENROUTER_RESPONSE_IDLE_TIMEOUT_MS` (15_000) and `READY_REQUEST_TIMEOUT_MS` (120_000).
- **Think time** is the time from a consult's launch to its settle, for every consult the commander pool settles: finished, failed, or timed out. A player stop and a match reset add nothing. Think time and the consultation count measure different things. A timeout and a failure that spent nothing add think time and do not add a consultation. Do not change that.
- **Telemetry** is one info-level line per consult in `debug.log`, plus one debug line per attempt. It is not shown in the AI activity log and it is not stored in the match database.

## Implementation calls

The plan's author made these calls. They are locked for this plan, and the product owner reviews them along with it.

- **Stored provider values** are `throughput`, `price`, `latency`, and `nitro`. The default is `throughput`. Labels are "Highest Throughput", "Lowest Price", "Lowest Latency", and "Priority Service (Nitro)". A null or unknown stored value reads back as `throughput`.
- **Where it is stored.** On the seat (`seats.provider_sort`) and in the remembered-commander snapshot, beside reasoning effort and doctrine. There is no app-wide provider setting and no new `game_config` key. A new row starts at `throughput` from `defaultCommander()` in [`src/renderer/gameplay/newGameSidesUi.ts`](../src/renderer/gameplay/newGameSidesUi.ts).
- **Request body.** `throughput`, `price`, and `latency` add `provider: { sort: <value> }` and leave `model` unchanged. `nitro` appends `:nitro` to a model id that has no `:` and does not also send `provider`. That suffix is what makes priority hosts eligible; `provider.sort` would only sort, and `"nitro"` is not a legal sort value, so no request ever sends `provider.sort: "nitro"`. See the OpenRouter provider-sorting and Nitro-shortcut docs.
- **A model id that already has a suffix.** When `nitro` is selected and `model` already contains `:`, do not append another suffix. Send the id unchanged with `provider: { sort: 'throughput' }`, and log that choice at info level. Capability lookups, tool-choice memory, and the models list keep using the stored id with no suffix added.
- **Changing provider during a match** cancels that seat's in-flight consult, the same way a reasoning change already does.
- **The commander button and the standings summary do not show the provider.** `formatCommanderSummary` stays as it is.
- **Popover layout, top to bottom.** Nickname, API key, and Model stay on their current rows. The next row is Reasoning and Provider, each half the row. The row under that is Doctrine on the left half and the doctrine description on the right half. The copy button stays last. The popover stays 380 px wide. `popoverLabelWidthText` stays `'Reasoning'`. The longest provider option may clip while the list is closed; the open list shows it in full, which is already how long dropdowns behave.
- **A timed-out attempt has no provider.** The summary records `provider: null` for a timeout, a stall, a socket error, and a cancel. The host is known only when a response body arrived. Do not add streaming or a generation-stats lookup to fill that gap.
- **Two model calls can belong to one pool consult.** A model change retries `requestOrders` once inside the same launch. That writes two telemetry lines and one think-time total covering both. Leave it that way.
- **No telemetry line** for a consult that returns before the tool loop: no key, no model, or an empty roster. The pool still records think time when it settles one of those.
- **Database columns are added on open.** Do not bump `EXPECTED_USER_VERSION`. A bump would make every current save unloadable.

## Exact text

Use these strings exactly.

- **Timeout activity line:** `Model call timed out after {seconds}s (attempt {n} of {max}). Not retried.` `{seconds}` is `Math.round(timeoutMs / 1000)`. `{n}` is the 1-based send number. `{max}` stays `1 + AI_MODEL_REQUEST_RETRY_COUNT` (2). A timeout never ends in `Retrying...` or `No retries left.`
- **Timeout result error:** `Model call timed out after {seconds}s.` This replaces `Model call timed out after 2 attempts.`
- **Provider labels,** in this order: `Highest Throughput`, `Lowest Price`, `Lowest Latency`, `Priority Service (Nitro)`.
- **Balanced doctrine description,** unchanged and shown to the right of Doctrine: `Uses speed and surprise, attacks weak points, and avoids the enemy's strengths.`
- **Telemetry log message:** `consult telemetry`. The summary object is the second argument of `logInfo`. Do not stringify it.
- **Per-attempt log message:** `openRouter chat attempt`.
- **Nitro suffix skipped:** `openRouter provider routing: model id already has a suffix; sorting by throughput instead of nitro`.
- **Pool timeout log message:** `commanderPool consult timed out; standing orders will run`.
- **Think-time label:** `{clock} thinking`. Under one hour, `{clock}` is `formatCommanderClock` (`m:ss`). From one hour, it is `h:mm:ss` with the minutes and seconds padded to two digits. Zero is `0:00 thinking`. Examples: 90_000 ms is `1:30 thinking`, 3_660_000 ms is `1:01:00 thinking`.
- **Invalid provider IPC error:** `Invalid commander provider sort`.

## Global constraints

- Follow `AGENTS.md` and every file in `.cursor/rules/`. Never commit or push.
- No plan, phase, or workflow identifiers in code, comments, tests, `doc/`, or configuration.
- Every new or changed function, type, interface member, and module-level constant gets an orienting comment with Purpose, When to use, Expected outcome, and Exceptions. Match the comments already in the file you are editing.
- **Logging.** Public functions that change state log at debug on entry with the ids and counts needed to troubleshoot. Caught exceptions log at error with the error object. Read-only helpers log at trace. Use `logDebug`, `logTrace`, `logInfo`, and `logError` from [`src/main/logger.ts`](../src/main/logger.ts). `logConsultTelemetrySummary` is the exception: it logs at info, because the line has to appear at the default log level. It does not also log at debug.
- **Secrets.** The new logs carry seat id, model id, provider name, timings, token counts, and outcome. They do not carry an API key, a request body, or prompt text.
- **Tests.** Cover the happy path and the essential failures of each new contract, and nothing more. Do not test pure delegation. When an existing test asserts text or a number this plan changes, update the assertion. Do not delete the test.
- **Building and running tests.** PowerShell at `F:\Projects\Personal\agent-wars-public`. Run one command per line. Do not chain commands with `&&`. `npm run build:main` compiles `src/main`, `src/shared`, and their tests into `dist/`. Run one test file with `node dist/main/<path>.test.js` or `node dist/shared/<path>.test.js`. `npm run check:renderer-types` typechecks the renderer. `npm run lint` runs ESLint. `npm run check:circular` checks import cycles. `npm test` runs the full main-process suite. `npm run ui:smoke` rebuilds the app and runs the layout checks; it takes several minutes.
- **File size.** The desirable limit is 600 lines and the hard limit is 1000, counted by `(Get-Content <file>).Count`. These files start near or over the desirable limit. A phase that names one of them leaves it at or below 600, except [`src/main/openRouter/commanderPool.ts`](../src/main/openRouter/commanderPool.ts), which is already 633 and may gain only the one `nowMs` line this plan names.

  | File | Lines now |
  | --- | --- |
  | `src/main/openRouter/openRouterChatTransport.ts` | 566 |
  | `src/main/openRouter/requestOrdersToolLoop.ts` | 609 |
  | `src/main/openRouter/requestOrdersFlow.ts` | 593 |
  | `src/renderer/openRouter/commanderPopover.ts` | 579 |
  | `src/main/openRouter/commanderPool.ts` | 633 |
  | `src/shared/standings.ts` | 570 |
  | `static/newGameChrome.css` | 717, already over 600; add the one rule this plan names and do not reorganize it |

- **Arguments.** At most 6 named arguments. Use one `readonly` parameter object when you would need more.
- **Immutability.** Use `const` and `readonly` wherever a value does not change.
- **Naming.** Follow [`doc/naming-conventions-contract-v1.md`](../doc/naming-conventions-contract-v1.md). New files are camelCase. Do not rename stored IPC channel names, SQL columns that already exist, or JSON fields the model sees. The new SQL columns are `provider_sort` and `think_time_ms`.
- **Docs.** Update the `doc/` files each phase names, in that phase. Name the symbol a number comes from. Do not edit the historical documents listed in `AGENTS.md`. Do not edit [`doc/README.md`](../doc/README.md); its consultation paragraph already points at `hybrid-ai.md`, and this work adds no row to its constants table.
- **Out of scope.** Streaming responses, a generation-stats lookup, an app-wide provider dropdown, showing the provider on the commander button or the standings summary, changing the idle timeout, changing the Ready timeout, and persisting per-consult rows.

## Watch for

These are the inputs most likely to be handled wrongly. The phase named on each line tests it.

- A call that times out on its first send must not be sent again, including when the hang simulator is set to `first`. Phase 1.
- A socket error, and HTTP 408 or 503, must still be sent once more. HTTP 500 must not. Phase 1.
- A remembered commander saved before this work has no provider field. Copy from Last Game and a match load both read it as Highest Throughput. Phase 2.
- `nitro` on a model id that already contains `:` must not produce a double suffix such as `model:floor:nitro`. Phase 3.
- The doctrine description stays on the same row as the Doctrine list, and the list stays on the left half. Phase 4.
- A player stop records no think time. A timeout and a finished consult do. Phase 6.

---

## Phase 1: Deadlines and retry policy

**Outcome:** One model call waits 180s. A consult's own loop waits 600s. Callers wait 1_320s. A timeout is reported once and not sent again. A socket error and the five HTTP statuses are sent once more. HTTP 500 is not.

### Files

- Modify [`src/shared/aiConsultationLimits.ts`](../src/shared/aiConsultationLimits.ts).
- Modify [`src/shared/aiConsultationLimits.test.ts`](../src/shared/aiConsultationLimits.test.ts).
- Modify [`src/main/openRouter/openRouterChatTransport.ts`](../src/main/openRouter/openRouterChatTransport.ts). The retry decision is `isRetryableStatus` (line 70) and the `timeoutLike` branch of the `catch` (line 264).
- Modify [`src/main/openRouter/openRouterChatTransport.test.ts`](../src/main/openRouter/openRouterChatTransport.test.ts).
- Modify [`src/main/openRouter/modelCallAttemptMessages.ts`](../src/main/openRouter/modelCallAttemptMessages.ts).
- Create [`src/main/openRouter/modelCallAttemptMessages.test.ts`](../src/main/openRouter/modelCallAttemptMessages.test.ts).
- Modify the comments in [`src/main/openRouter/modelHangSimulation.ts`](../src/main/openRouter/modelHangSimulation.ts) and [`src/main/openRouter/requestOrdersFlowSupport.ts`](../src/main/openRouter/requestOrdersFlowSupport.ts) that say a timed-out call is retried, or that the cap is 5 minutes or 90s. The hang simulator's behavior does not change: `first` hangs attempt index 0 only, `all` hangs every attempt. What changes is that a hang is a timeout, so it no longer reaches a later attempt by itself.
- Modify [`doc/hybrid-ai.md`](../doc/hybrid-ai.md) (the 300000 ms mention and the consult-loop bounds), [`doc/ai-commander-prompts/source-inventory.md`](../doc/ai-commander-prompts/source-inventory.md) (the 90000 / 300000 sentence), [`doc/ai-commander-prompts/consultation-flow.md`](../doc/ai-commander-prompts/consultation-flow.md) (the 5 minute sentence), and [`doc/ux/ai-activity-log.md`](../doc/ux/ai-activity-log.md) (the timeout example).

### Steps

1. Set `AI_MODEL_REQUEST_TIMEOUT_MS` to `180_000` and `AI_CONSULTATION_WALL_CLOCK_MS` to `600_000`. Leave the wait formula as it is. Rewrite the comments so they describe 180s, a 10 minute loop, and a 1320s outer wait. Say that the in-flight round and the repair call can each be sent twice when the failure is a network error or a retryable HTTP status, and that a timeout is not sent twice. The formula still covers that longer case, which is why the retry count stays in it.
2. Replace `isRetryableStatus` with a set membership test. The set holds 408, 429, 502, 503, and 504. Give the set an orienting comment.
3. In the `timeoutLike` branch, stop falling through to the retry. Log the activity line with `willRetry: false`, set the result error to `Model call timed out after {seconds}s.` using that attempt's `attemptTimeoutMs`, and return `{ ok: false, error: lastError }`. Do not increment `networkAttempt`. Leave the branch order alone: parent abort, then timeout, then stream stall, then network. Leave the 402 credit-clamp retry ahead of the status check, and leave it not consuming the network retry.
4. In `formatModelCallFailureLine`, a `timeout` cause always ends with `Not retried.` The other causes keep their current endings.
5. Update the comments named above. In `doc/hybrid-ai.md`, replace 90_000 with 180_000, 300_000 with 600_000, and 660_000 with 1_320_000, and replace the sentence that says a model call is retried once with the retry rule from Locked decisions. Leave the 15_000 ms idle-timeout sentence as it is. In `doc/ux/ai-activity-log.md`, the timeout example becomes `Model call timed out after 180s (attempt 1 of 2). Not retried.` Keep the 503 example as a retry. State that HTTP 500 is not retried and HTTP 408 is.

### Tests

- [`src/shared/aiConsultationLimits.test.ts`](../src/shared/aiConsultationLimits.test.ts): assert 180_000 and 600_000. The wait assertion stays a formula assertion, so it now expects 1_320_000 without a literal.
- [`src/main/openRouter/modelCallAttemptMessages.test.ts`](../src/main/openRouter/modelCallAttemptMessages.test.ts), two cases. A timeout with `willRetry: true` still returns a string that contains `Not retried.` and does not contain `Retrying`. A network cause with `willRetry: true` still ends with `Retrying...`.
- Rewrite `logs a timeout and retries a simulated hang, then stops`. With `AGENT_WARS_SIMULATE_MODEL_HANG=all` and `AGENT_WARS_SIMULATE_MODEL_HANG_MS=100`: the result error is `Model call timed out after 0s.`, the poster is called 0 times, one line contains `timed out after 0s (attempt 1 of 2). Not retried.`, and no line contains `Retrying`.
- Add the same assertion with the hang mode set to `first`. A hang is a timeout, so `first` also does not reach the poster.
- Keep `logs an HTTP retry and then succeeds` (503, two posts).
- Add a 408 case with the same shape: first post 408, second post 200, result ok, two posts.
- Add a 500 case: one post, result not ok, one line contains `HTTP 500 (attempt 1 of 2). Not retried.`
- Keep the cancel-during-retry-delay test and the attribution-header test.
- Add two cases that throw `new Error('socket reset')` from the first post. Before throwing, the poster sets `AGENT_WARS_SIMULATE_MODEL_HANG` to `all` or `first` and the hang length to `100`. With `all`, the retry hangs: 1 post, and the result error is `Model call timed out after 0s.` With `first`, the retry is a real post and returns 200: 2 posts, result ok. This is the case that keeps `all` and `first` different now that a hang no longer causes its own retry.

### Verification

```text
npm run build:main
node dist/shared/aiConsultationLimits.test.js
node dist/main/openRouter/modelCallAttemptMessages.test.js
node dist/main/openRouter/openRouterChatTransport.test.js
npm run lint
npm run check:circular
```

Expected: each test file prints its passing count and exits 0. Lint and the cycle check exit 0.

Confirm the line count of `openRouterChatTransport.ts` is still at or below 600. This phase adds little. If it would pass 600, stop and report. The move out of this file happens in Phase 5, not here.

---

## Phase 2: Provider choice, stored and carried

**Outcome:** Every commander has a provider choice. It round-trips through the seat table, the in-match save, the remembered snapshot, a new match, and Copy from Last Game. Nothing sends it to OpenRouter yet, and the popover does not show it yet. Old saves and old remembered snapshots still load, as Highest Throughput.

### Files

- Create [`src/shared/openRouterProviderSort.ts`](../src/shared/openRouterProviderSort.ts) and [`src/shared/openRouterProviderSort.test.ts`](../src/shared/openRouterProviderSort.test.ts).
- Modify the commander types and every object that builds one. The field is required, so `npm run build:main` and `npm run check:renderer-types` name anything missed. The sites below are the ones that build a commander by listing its fields. Spread sites (`{ ...commander }`) keep the field on their own and must not be rewritten.

  Shared and main, production:

  - [`src/shared/ipc/ordersTypes.ts`](../src/shared/ipc/ordersTypes.ts), `NewGameCommanderInput`. Add `readonly providerSort: ProviderSortChoice` after `reasoningEffort`.
  - [`src/shared/seatRoster.ts`](../src/shared/seatRoster.ts), `SeatCommander`, and the commander object inside `toSeatSnapshot`.
  - [`src/shared/commanderSetupCopy.ts`](../src/shared/commanderSetupCopy.ts), `RememberedCommander`, the fallback object in `prefillFirstAiApiKey`, and a new `commanderFromRemembered`.
  - [`src/shared/newGameSides.ts`](../src/shared/newGameSides.ts), `addSideRow`, which copies `modelId`, `reasoningEffort`, and `doctrineChoice` by name. Add `providerSort` the same way.
  - [`src/shared/ipc/gameApiTypes.ts`](../src/shared/ipc/gameApiTypes.ts) and [`src/main/preload.ts`](../src/main/preload.ts), the `setSeatCommander` argument.
  - [`src/main/gameDb/schema.ts`](../src/main/gameDb/schema.ts), the `seats` table. Add `provider_sort TEXT CHECK (provider_sort IN ('throughput', 'price', 'latency', 'nitro'))` after `reasoning_effort`. A NULL passes that check, which is what an added column holds until it is written.
  - [`src/main/gameDb/seatRosterStore.ts`](../src/main/gameDb/seatRosterStore.ts). `SeatRow`, `seatFromRow`, the `readSeatRoster` select, the `replaceSeatRoster` insert, and `updateSeatCommander`. `updateSeatCommander`'s argument pick gains `providerSort`.
  - [`src/main/gameDb/resetGame.ts`](../src/main/gameDb/resetGame.ts), `commanderForNewAiSeat`, both the missing-input return and the copied return.
  - [`src/main/gameDb.ts`](../src/main/gameDb.ts). Replace the three `ensureSeatNicknameColumn(gameDbOps)` calls with `ensureSeatAddedColumns(gameDbOps)`. Extend the `EXPECTED_USER_VERSION` comment so it names `ensureSeatAddedColumns` instead of `ensureSeatNicknameColumn`. Leave the value at 26.
  - [`src/main/openRouter/commanderKeyMemory.ts`](../src/main/openRouter/commanderKeyMemory.ts), `emptyRememberedCommander`, `rememberedFromUnknown`, and the object in `storeNewMatchCommanderKeys`.
  - [`src/main/ipc/seatCommanderIpcHandler.ts`](../src/main/ipc/seatCommanderIpcHandler.ts). Validate with `isProviderSortChoice`. A missing or unknown value throws `Invalid commander provider sort`. Pass the choice through `updateSeatCommander` and `updateRememberedCommander`. A provider change cancels that seat's consult with reason `model_changed`, beside the existing model and effort check.
  - [`src/main/openRouter/openRouter.ts`](../src/main/openRouter/openRouter.ts), the commander object in `applyAppWideCommanderToLegacySeat`. That path copies the app-wide model and effort only. Set its provider to `DEFAULT_PROVIDER_SORT`. Do not add a config key.

  Renderer, pass-through only. Phase 4 draws the control.

  - [`src/renderer/openRouter/commanderPopover.ts`](../src/renderer/openRouter/commanderPopover.ts), the draft at `openCommanderPopover` and the assignment in `applyOpenDraft`. Copy `providerSort` through unchanged.
  - [`src/renderer/gameplay/newGameSidesUi.ts`](../src/renderer/gameplay/newGameSidesUi.ts), `defaultCommander` returns `providerSort: DEFAULT_PROVIDER_SORT`. `commanderFromLastGame` becomes a call to `commanderFromRemembered`. `commanderButtonLabel` does not gain the field; it feeds `formatCommanderSummary`, which does not show it.
  - [`src/renderer/openRouter/commanderCardsUi.ts`](../src/renderer/openRouter/commanderCardsUi.ts), the object passed to the popover and the save that omits a failed key fetch. Both list fields by name.

  Tests and fixtures that construct a commander. Add `providerSort: 'throughput'` unless the case is specifically about another value:

  - [`src/shared/seatRoster.test.ts`](../src/shared/seatRoster.test.ts)
  - [`src/shared/newGameSides.test.ts`](../src/shared/newGameSides.test.ts), `COMMANDER` and `COPIED_COMMANDER`. The key in `COPIED_COMMANDER` is a fake value for testing; leave it, and leave its comment.
  - [`src/shared/commanderSetupCopy.test.ts`](../src/shared/commanderSetupCopy.test.ts)
  - [`src/main/gameDb/seatRosterStore.test.ts`](../src/main/gameDb/seatRosterStore.test.ts)
  - [`src/main/gameDb/newMatchSeats.test.ts`](../src/main/gameDb/newMatchSeats.test.ts)
  - [`src/main/gameDb/resetGameSeats.test.ts`](../src/main/gameDb/resetGameSeats.test.ts), if it builds a commander.
  - [`src/main/openRouter/commanderKeyMemory.test.ts`](../src/main/openRouter/commanderKeyMemory.test.ts), including `remembered()`.
  - [`src/main/openRouter/ordersRequestProfile.test.ts`](../src/main/openRouter/ordersRequestProfile.test.ts)
  - [`src/main/openRouter/commanderPool.test.ts`](../src/main/openRouter/commanderPool.test.ts), `aiSeat`.
  - [`src/main/openRouter/commanderReadyGather.test.ts`](../src/main/openRouter/commanderReadyGather.test.ts)
  - [`src/main/ipc/deferredResolutionPlaybackConsult.test.ts`](../src/main/ipc/deferredResolutionPlaybackConsult.test.ts)
  - [`src/main/gameIpcHandlers.test.ts`](../src/main/gameIpcHandlers.test.ts)
  - [`src/main/openRouter/afterResolutionTacticalBeat.test.ts`](../src/main/openRouter/afterResolutionTacticalBeat.test.ts)
  - [`src/main/openRouter/promptSpec/doctrineText.test.ts`](../src/main/openRouter/promptSpec/doctrineText.test.ts)
  - [`src/main/sideGroupSeed.test.ts`](../src/main/sideGroupSeed.test.ts)
  - [`src/main/gameActions/endOfTurnOutcomeRules.test.ts`](../src/main/gameActions/endOfTurnOutcomeRules.test.ts)

  [`src/shared/standings.ts`](../src/shared/standings.ts), [`src/shared/commanderSummary.ts`](../src/shared/commanderSummary.ts), and [`src/renderer/gameplay/gameOverStandings.ts`](../src/renderer/gameplay/gameOverStandings.ts) use a smaller commander shape for display. Do not add `providerSort` to that shape.

- Modify [`doc/save-files.md`](../doc/save-files.md) and [`doc/ux/save-and-load.md`](../doc/ux/save-and-load.md).

### Steps

1. `openRouterProviderSort.ts` exports:
   - `ProviderSortChoice`, the union `'throughput' | 'price' | 'latency' | 'nitro'`.
   - `PROVIDER_SORT_CHOICES`, that list in the order above.
   - `PROVIDER_SORT_LABELS`, a `Record<ProviderSortChoice, string>` of the four labels.
   - `DEFAULT_PROVIDER_SORT`, `'throughput'`.
   - `isProviderSortChoice(value: unknown): value is ProviderSortChoice`.
   - `providerSortOrDefault(value: unknown): ProviderSortChoice`, which returns `value` when `isProviderSortChoice(value)` and `DEFAULT_PROVIDER_SORT` otherwise.
   Each gets an orienting comment. `isProviderSortChoice` and `providerSortOrDefault` log at trace.
2. Add the field to the types, and thread it through the production sites above. `seatFromRow` and `rememberedFromUnknown` use `providerSortOrDefault`, so NULL and an unknown string become `throughput`. `toSeatSnapshot` copies it by name.
3. Replace `ensureSeatNicknameColumn` with `ensureSeatAddedColumns`. It logs at debug, reads `PRAGMA table_info(seats)` once, and adds only the missing columns: `nickname TEXT`, then `provider_sort TEXT`. Phase 6 adds `think_time_ms` to this same function. Do not add it here. Delete `ensureSeatNicknameColumn`.
4. `commanderFromRemembered(remembered: RememberedCommander): NewGameCommanderInput` copies all six commander fields, including `providerSort` and `nickname`. `commanderFromLastGame` calls it. The blank-nickname rule stays in `copyCommanderFrom`, untouched. `SeatSnapshot.commander` is `Omit<SeatCommander, 'doctrine'>`, so the new field reaches the renderer once `toSeatSnapshot` copies it. There is no second snapshot type to edit.
5. In the IPC handler, read the stored choice before the update. Cancel when model, effort, or provider changed. Log the provider change beside `effortChanged` in the existing debug line.
6. In `doc/save-files.md`, add `seats.provider_sort` next to `seats.nickname` as a column `ensureSeatAddedColumns` adds on open, without a version change. Say a NULL reads as `throughput` (`DEFAULT_PROVIDER_SORT`). Say `openrouter_commander_memory` may include `providerSort` on each remembered commander, and a snapshot without it reads as `throughput`. Leave `EXPECTED_USER_VERSION` at 26 in that file. In `doc/ux/save-and-load.md`, add the provider choice to the sentence that lists what each seat keeps in the file.

### Tests

- `openRouterProviderSort.test.ts`. `providerSortOrDefault('latency')` is `'latency'`. `providerSortOrDefault(null)`, `providerSortOrDefault('fast')`, and `providerSortOrDefault(undefined)` are all `'throughput'`. `PROVIDER_SORT_LABELS.nitro` is `Priority Service (Nitro)`.
- `commanderSetupCopy.test.ts`. `commanderFromRemembered` on a commander with `providerSort: 'latency'` returns that choice on `providerSort`, and copies the nickname. This is the Copy from Last Game contract.
- `newGameSides.test.ts`. `COPIED_COMMANDER` gains `providerSort: 'price'`. The existing deep equal then proves Add another opponent copies it. `COMMANDER` gains `providerSort: 'throughput'`.
- `seatRosterStore.test.ts`. Extend the round trip so a written `providerSort: 'nitro'` is read back as `'nitro'`. Add one case that writes a roster, sets `provider_sort` to NULL through `dbRun`, and reads `throughput`. Add one case that sets it to `'nope'` and reads `throughput`.
- `commanderKeyMemory.test.ts`. A remembered commander written without `providerSort` (build the stored JSON without that key, through the same row the existing test uses) is read back as `throughput`. A written `'latency'` is read back as `'latency'`.
- `updateSeatCommander` in the existing round-trip test also writes and reads the choice. One assertion is enough.

### Verification

```text
npm run build:main
node dist/shared/openRouterProviderSort.test.js
node dist/shared/commanderSetupCopy.test.js
node dist/shared/newGameSides.test.js
node dist/shared/seatRoster.test.js
node dist/main/gameDb/seatRosterStore.test.js
node dist/main/openRouter/commanderKeyMemory.test.js
node dist/main/gameDb/newMatchSeats.test.js
npm run check:renderer-types
npm run lint
npm run check:circular
```

Expected: all of these exit 0. `build:main` is the check that every commander literal was updated. Do not silence a compile error with a cast.

---

## Phase 3: Provider choice on the OpenRouter request

**Outcome:** Every order-flow chat request, including a tool-choice retry, a structured-output retry, and the repair call, sends that seat's provider choice. `nitro` uses the `:nitro` suffix. A suffixed model id does not gain a second suffix.

### Files

- Create [`src/main/openRouter/openRouterProviderRouting.ts`](../src/main/openRouter/openRouterProviderRouting.ts) and [`src/main/openRouter/openRouterProviderRouting.test.ts`](../src/main/openRouter/openRouterProviderRouting.test.ts).
- Modify [`src/main/openRouter/ordersRequestProfile.ts`](../src/main/openRouter/ordersRequestProfile.ts). `OrdersRequestProfile` gains `readonly providerSort: ProviderSortChoice`. `BASELINE_ORDERS_REQUEST_PROFILE` sets it to `DEFAULT_PROVIDER_SORT`. `resolveOrdersRequestProfile` takes `persistedProviderSort: ProviderSortChoice` and copies it onto the profile for both known and unknown models. `resolveSeatOrdersRequestProfile` passes `providerSortOrDefault(seat.commander?.providerSort)`.
- Modify [`src/main/openRouter/openRouter.ts`](../src/main/openRouter/openRouter.ts), `resolveSelectedModelOrdersRequestProfile`. The roster path already goes through `resolveSeatOrdersRequestProfile`. The fallback path, used when the roster cannot be read, passes `DEFAULT_PROVIDER_SORT`.
- Modify [`src/main/openRouter/ordersChatRequestHelpers.ts`](../src/main/openRouter/ordersChatRequestHelpers.ts). The inner `send` applies the routing to the body it is about to post, so every retry posts the routed body.
- Modify [`src/main/openRouter/ordersChatRequestHelpers.test.ts`](../src/main/openRouter/ordersChatRequestHelpers.test.ts) and [`src/main/openRouter/ordersRequestProfile.test.ts`](../src/main/openRouter/ordersRequestProfile.test.ts).
- Modify [`doc/hybrid-ai.md`](../doc/hybrid-ai.md) and [`doc/ai-commander-prompts/source-inventory.md`](../doc/ai-commander-prompts/source-inventory.md). The sentence that says the saved reasoning effort goes on every request also names the provider choice and `applyProviderSortToChatBody`.

### Steps

1. `applyProviderSortToChatBody(body: Readonly<Record<string, unknown>>, providerSort: ProviderSortChoice): Record<string, unknown>`. It returns a shallow copy and never sends `provider.sort: 'nitro'`. When `providerSort` is `nitro` and `body.model` is a non-empty string with no `:`, the copy's `model` is `${body.model}:nitro` and the copy has no `provider` key. Every other `nitro` input keeps `model` and sets `provider: { sort: 'throughput' }`, and logs the suffix message at info with the model id. `throughput`, `price`, and `latency` keep `model` and set `provider: { sort: providerSort }`. Log at debug on every call with the model id and the choice. Do not log the body.
2. In `postOrdersChatRequest`, change `send` so the posted body is `applyProviderSortToChatBody(body, settings.profile.providerSort)`. Do not apply it to `baseBody` before the tool-choice and schema branches; those branches replace fields and then call `send`.
3. In the two docs, name the four choices and the two wire forms (`provider.sort`, and the `:nitro` suffix). Say a suffixed model id falls back to a throughput sort.

### Tests

`openRouterProviderRouting.test.ts`, five cases:

- `applyProviderSortToChatBody({ model: 'm', max_tokens: 10 }, 'throughput')` returns `model: 'm'` and `provider: { sort: 'throughput' }`.
- The same body with `'price'` returns `provider: { sort: 'price' }`.
- The same body with `'nitro'` returns `model: 'm:nitro'` and the result has no `provider` key.
- `nitro` with `{ model: 'm:floor' }` returns `model: 'm:floor'` and `provider: { sort: 'throughput' }`.
- `nitro` with `{ max_tokens: 10 }` returns `provider: { sort: 'throughput' }` and no `model`. No case returns `provider.sort` of `'nitro'`.

`ordersChatRequestHelpers.test.ts`. The existing baseline post already spreads `BASELINE_ORDERS_REQUEST_PROFILE`. Assert `bodies[0].provider` deep-equals `{ sort: 'throughput' }` and `bodies[0].model` is `'m'`. One assertion. The routing file covers the other choices. Also assert that the tool-choice retry body still has `provider: { sort: 'throughput' }`, so a retry cannot drop it. That body is the second post in the existing required-tool-choice test.

`ordersRequestProfile.test.ts`. `testTwoSeatsGetDifferentProfiles` already builds two seats. Give one `providerSort: 'latency'` and the other `providerSort: 'nitro'`, and assert the two profiles carry those choices. `testUnknownModelGetsBaseline` compares against `BASELINE_ORDERS_REQUEST_PROFILE`, so it keeps passing once the baseline constant carries `throughput`.

### Verification

```text
npm run build:main
node dist/main/openRouter/openRouterProviderRouting.test.js
node dist/main/openRouter/ordersChatRequestHelpers.test.js
node dist/main/openRouter/ordersRequestProfile.test.js
npm run lint
npm run check:circular
```

Expected: all exit 0.

---

## Phase 4: Popover layout and the Provider control

**Outcome:** The popover shows Provider where Doctrine was, Doctrine on its own row with the description to its right, and a change is saved, copied, and sent. The layout is checked in the running app.

### Files

- Create [`src/renderer/openRouter/commanderPopoverChoices.ts`](../src/renderer/openRouter/commanderPopoverChoices.ts).
- Modify [`src/renderer/openRouter/commanderPopover.ts`](../src/renderer/openRouter/commanderPopover.ts). It must end this phase at or below 600 lines. Move `doctrineField` into the new file rather than growing this one.
- Modify [`src/renderer/openRouter/commanderPopoverLabels.ts`](../src/renderer/openRouter/commanderPopoverLabels.ts). Add `provider: 'commander-popover-provider'` to `POPOVER_CONTROL_IDS`. Leave `popoverLabelWidthText` as `'Reasoning'`.
- Modify [`static/newGameChrome.css`](../static/newGameChrome.css). Add one rule. Do not reorganize the file.
- Modify [`scripts/ui-smoke/ui-smoke-checks.cjs`](../scripts/ui-smoke/ui-smoke-checks.cjs). `describe` gains two fields: `selectValue` (an `HTMLSelectElement`'s `value`, otherwise null) and `selectOptions` (its option texts, otherwise null).
- Modify [`scripts/ui-smoke/ui-smoke-new-game-checks.cjs`](../scripts/ui-smoke/ui-smoke-new-game-checks.cjs). Add one check.
- Modify [`doc/ux/new-game-dialog.md`](../doc/ux/new-game-dialog.md), [`doc/ux/opponent-tab-commander.md`](../doc/ux/opponent-tab-commander.md), [`doc/ux-specification.md`](../doc/ux-specification.md), and [`doc/how-to-play.md`](../doc/how-to-play.md).

### Steps

1. `choiceSelect` in the new file. One parameter object: `id: string`, `label: string`, `options: readonly T[]`, `optionLabel: (choice: T) => string`, `selected: T`, `onChange: (choice: T) => void`, with `T extends string`. It builds a `<select>` with one option per entry, selects `selected`, and calls `onChange` with `select.value as T` on change. It returns `{ pair, show }`, where `pair` is `choicePair(id, label, select)` from `commanderPopoverLabels.ts` and `show(next: T)` sets `select.value`. The select's `aria-label` is `label`.
2. `doctrineChoiceControl` wraps `choiceSelect` with `DOCTRINE_CHOICES`, `DOCTRINE_CHOICE_LABELS`, and id `POPOVER_CONTROL_IDS.doctrine`. It also builds the description `<p class="commander-popover-doctrine">` and a row `<div class="commander-popover-doctrine-row">` that contains the pair, then the description. `show` sets the description from `DOCTRINE_CHOICE_DESCRIPTIONS`. The `onChange` it exposes receives the choice; the popover stores it and calls `request.onChange`. Move this behavior out of `doctrineField`. Delete `doctrineField` from the popover.
3. `providerChoiceControl` wraps `choiceSelect` with `PROVIDER_SORT_CHOICES`, `PROVIDER_SORT_LABELS`, and id `POPOVER_CONTROL_IDS.provider`. No description.
4. In `popoverFields`, the choices row (`commander-popover-choices`) contains the reasoning pair and `providerChoiceControl`'s pair. Append `doctrineChoiceControl`'s row after that row, and do not append the description a second time. `applyOpenDraft` calls both `show` functions. A provider change sets `draft.providerSort` and calls `request.onChange(current())`.
5. CSS, added after `.commander-popover-choices`:

```css
/* Doctrine takes the left half of its own row. Its description fills the right half. */
.commander-popover-doctrine-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.commander-popover-doctrine-row > .commander-popover-choice,
.commander-popover-doctrine-row > .commander-popover-doctrine {
  flex: 1 1 0;
  min-width: 0;
}
```

The existing `.commander-popover-choices` rule already gives its two children half the row each. Reasoning and Provider use it. Do not add a third child to that row.

6. Docs. Search the two UX documents for `reasoning effort, and doctrine` and add the provider choice to each copied-settings list. Replace the layout sentences. The new layout, in both [`doc/ux/new-game-dialog.md`](../doc/ux/new-game-dialog.md) and [`doc/ux/opponent-tab-commander.md`](../doc/ux/opponent-tab-commander.md), is: Reasoning and Provider share a line, each half of it. Doctrine takes the left half of the next line and its description fills the right half. Provider lists the four labels, with Highest Throughput selected until the player picks another. The labels stay as wide as "Reasoning". In the opponent-tab doc, a provider change cancels that seat's planning, and the summary button does not show the provider. Add `commanderPopoverChoices.ts` and `openRouterProviderSort.ts` to that doc's Code Entry Points. In [`doc/ux-specification.md`](../doc/ux-specification.md), add the provider choice to the sentence that lists what the popover sets. In [`doc/how-to-play.md`](../doc/how-to-play.md), add one bullet after the reasoning-cost bullet: `**Provider:** each commander's popover chooses the OpenRouter host. Highest Throughput is the default. Lowest Price and Lowest Latency prefer a cheaper or a faster host. Priority Service (Nitro) asks for a priority host.`

### Tests

There is no renderer unit-test runner. The layout check is `commander-popover-provider` in `ui-smoke-new-game-checks.cjs`, on the scene `SCENES.newGameFourSides`, which already opens Opponent 1's popover on a fresh commander.

`describe` in `ui-smoke-checks.cjs` gains `selectValue` and `selectOptions` as specified above. No existing check reads them.

The new check needs `select[aria-label="Reasoning"]`, `select[aria-label="Provider"]`, `select[aria-label="Doctrine"]`, and `.commander-popover-doctrine`. It fails with a sentence naming the actual and expected value when any of these is wrong:

- Provider `selectOptions` deep-equals the four labels in order, and `selectValue` is `throughput`.
- The Reasoning and Provider tops differ by at most 2. Their widths differ by at most 8.
- The Doctrine top is at least 20 below the Reasoning top. The Doctrine left edge is within 4 of the Reasoning left edge. The Doctrine width is within 8 of the Reasoning width.
- The description's vertical center is within 8 of the Doctrine select's vertical center. The description's left edge is to the right of the Doctrine select's horizontal center.
- The description text is `Uses speed and surprise, attacks weak points, and avoids the enemy's strengths.`

Use the `el()` result fields (`x`, `y`, `w`, `h`, `text`, `selectValue`, `selectOptions`). Follow the shape of the existing checks in that file.

The save, copy, and request behavior is already covered by Phases 2 and 3. Do not add a second test for it here.

### Verification

```text
npm run check:renderer-types
npm run lint
npm run ui:smoke
```

Expected: the typecheck and lint exit 0. `ui:smoke` reports the new check passing along with the existing ones. This command rebuilds the app and takes several minutes. Run it once.

Confirm `(Get-Content src/renderer/openRouter/commanderPopover.ts).Count` is at or below 600.

---

## Phase 5: Consult telemetry

**Outcome:** Every consult that reaches the tool loop writes one `consult telemetry` line at info level. Each attempt writes one debug line. The line names the wall time, the rounds, the providers that answered and the providers that failed, the tokens, the timeouts, and each fallback.

### Files

Moves first, with no behavior change. Run the named tests after the moves and before adding the recorder.

- Create [`src/main/openRouter/openRouterHttpsChatPost.ts`](../src/main/openRouter/openRouterHttpsChatPost.ts). Move `postChatViaHttps` into it, unchanged, and export it. [`src/main/openRouter/openRouterChatTransport.ts`](../src/main/openRouter/openRouterChatTransport.ts) imports it. The test override `setOpenRouterPostChatForTests` stays in the transport file.
- Create [`src/main/openRouter/requestOrdersToolDispatch.ts`](../src/main/openRouter/requestOrdersToolDispatch.ts). Move the per-tool execution block out of [`src/main/openRouter/requestOrdersToolLoop.ts`](../src/main/openRouter/requestOrdersToolLoop.ts) (the chain that picks mercenary, standing orders, production, memory, combat, assessment, or pathfinding). One function, `executeRequestOrdersTool`, with one parameter object. The loop calls it and pushes the tool result exactly as it does now.
- Create [`src/main/openRouter/requestOrdersConsultationMarks.ts`](../src/main/openRouter/requestOrdersConsultationMarks.ts). Move the `markSuccessfulConsultation` body out of [`src/main/openRouter/requestOrdersFlow.ts`](../src/main/openRouter/requestOrdersFlow.ts).

Then the recorder.

- Create [`src/main/openRouter/consultTelemetry.ts`](../src/main/openRouter/consultTelemetry.ts) and [`src/main/openRouter/consultTelemetry.test.ts`](../src/main/openRouter/consultTelemetry.test.ts).
- Modify [`src/main/openRouter/ordersChatRequestHelpers.ts`](../src/main/openRouter/ordersChatRequestHelpers.ts). `OrdersChatRequestSettings` gains an optional `readonly telemetry?: ConsultTelemetry`. When it is absent, nothing is recorded. Production always passes it.
- Modify the transport, the tool loop, [`src/main/openRouter/requestOrdersRepairExchange.ts`](../src/main/openRouter/requestOrdersRepairExchange.ts), the flow, and [`src/main/openRouter/commanderPoolSettle.ts`](../src/main/openRouter/commanderPoolSettle.ts).
- Modify [`src/main/openRouter/openRouterChatTransport.test.ts`](../src/main/openRouter/openRouterChatTransport.test.ts) and [`src/main/openRouter/ordersChatRequestHelpers.test.ts`](../src/main/openRouter/ordersChatRequestHelpers.test.ts).
- Modify [`doc/hybrid-ai.md`](../doc/hybrid-ai.md). One paragraph: a consult that reaches the tool loop logs `consult telemetry` at info through `logConsultTelemetrySummary`, and each attempt logs `openRouter chat attempt` at debug. Name the summary fields. Say a timeout, a stall, a socket error, and a cancel record a null provider, because no response body arrived.

### The recorder

`ConsultTelemetry` has: `recordAttempt`, `recordFallback`, `setToolRounds`, `noteWallClockExceeded`, and `setOutcome`.

`recordAttempt` takes one object: `requestLabel: string`, `attempt: number`, `durationMs: number`, `outcome: 'ok' | 'http' | 'timeout' | 'network' | 'streamStall' | 'cancelled'`, `httpStatus: number | null`, `provider: string | null`, `retried: boolean`.

`recordFallback` takes `'networkRetry' | 'httpStatusRetry' | 'creditClamp' | 'toolChoiceAuto' | 'structuredOutputDropped' | 'malformedCompletion' | 'parseRepair'`.

`setOutcome` takes `'finished' | 'failed' | 'cancelled' | 'budgetExceeded' | 'wallClock'`.

`providerFromChatBody(bodyText: string, ok: boolean): string | null` parses JSON and never throws. On success it returns a string `provider` field, else null. On failure it returns a string `error.metadata.provider_name`, else null. Malformed JSON returns null. It logs at trace.

`buildConsultTelemetrySummary` is pure. Its input object carries the identity (`seatId`, `turnNumber`, `theater`, `battleId`, `modelId`, `providerSort`), `wallClockMs`, `error: string | null`, `cancelReason: string | null`, the usage totals (`inputTokens`, `outputTokens`, `costUsd`), and the recorder's attempts, fallbacks, tool rounds, outcome, and wall-clock flag. Its result has exactly these keys:

- `seatId`, `turnNumber`, `theater`, `battleId`, `modelId`, `providerSort`
- `outcome`, `error`, `cancelReason`
- `wallClockMs`, `toolRounds`, `modelCalls`
- `timeouts`, `streamStalls`, `wallClockExceeded`
- `servedBy`, `failedOn`
- `inputTokens`, `outputTokens`, `costUsd`
- `fallbacks`, `attempts`

`modelCalls` is the attempt count. `timeouts` and `streamStalls` count attempts of those outcomes. `servedBy` is the distinct providers of `ok` attempts, first seen first. `failedOn` is the distinct non-null providers of every other attempt, first seen first. `fallbacks` stays in the order `recordFallback` was called. `toolRounds` is the last value passed to `setToolRounds`, or 0.

`logConsultTelemetrySummary(summary)` calls `logInfo('consult telemetry', summary)` and nothing else.

`createConsultTelemetry(): ConsultTelemetry` logs at debug and returns a fresh recorder.

### Steps

1. Do the three moves. Export the moved functions. Move the imports that only the moved function uses, and leave the others. Do not change a moved function's body, its log lines, or its call arguments. None of the new files may import the file it was moved out of. Then run the verification commands below before continuing. `openRouterChatTransport.test.ts` includes the attribution-header test, which posts through `postChatViaHttps`, so it proves the move.
2. Build the recorder and `providerFromChatBody` as specified.
3. The transport takes an optional `telemetry` on `OpenRouterChatTransportPayload`. `postOrdersChatRequest` forwards `settings.telemetry`. Record each send in the attempt's existing `finally`, so a `return` and a `continue` each record it once. Set `retried` before a `continue`. A cancel that returns before that `try` starts is not an attempt; do not add a record there. A 2xx is `ok`. A response with a non-2xx status is `http`. The abort-timer branch is `timeout`. The stream-stall branch is `streamStall`. A parent abort is `cancelled`. Any other throw is `network`. `provider` comes from `providerFromChatBody` when there is a response body, and is null otherwise. `retried` is true when this attempt will be followed by another send. Record `networkRetry` or `httpStatusRetry` when the loop actually continues for that reason, and `creditClamp` when the 402 retry continues. Also `logDebug('openRouter chat attempt', attempt)` with those fields and without the body or the key.
4. `postOrdersChatRequest` records `toolChoiceAuto` when it retries with `auto`, and `structuredOutputDropped` when it retries without the schema.
5. The tool loop calls `setToolRounds(iteration)` at the top of each round. It records `malformedCompletion` when `resolveMalformedCompletionRetry` returns a retry. It calls `noteWallClockExceeded` on the wall-clock return.
6. `runParseRepairExchange` records `parseRepair` when it is about to send the repair.
7. Export the wall-clock sentence `AI planning took too long and was cancelled. Please try again.` as `REQUEST_ORDERS_WALL_CLOCK_ERROR` from [`src/main/openRouter/requestOrdersFlowSupport.ts`](../src/main/openRouter/requestOrdersFlowSupport.ts). The tool loop uses that constant for both its log line and its returned error. The flow creates the recorder next to `wallClockStart` (this is after the no-key, no-model, and empty-roster returns). It puts the recorder on `requestSettings`. It calls `setOutcome` immediately before each return inside the `try`: `wallClock` when the loop error is that constant, `cancelled` when the error is `'Cancelled'` or the catch identifies an abort, `budgetExceeded` on that return, `finished` immediately before `applyParsedRequestOrders`, and `failed` on every other `failRequest` and on a non-abort catch. The `finally` calls `logConsultTelemetrySummary` with the usage totals, which are already accumulated on the paths that return a failure. `theater` is `'tactical'` when `tacticalBattle` is set and `'strategic'` otherwise. `battleId` is the battle id or null. `cancelReason` is null in this line; the pool timeout has its own line. Do not import the model-call controller into the flow.
8. Add `nowMs: () => number` to `ConsultSettleContext`. The one allowed addition to [`src/main/openRouter/commanderPool.ts`](../src/main/openRouter/commanderPool.ts) is `nowMs: () => currentTiming().nowMs()` inside `settleContext`. `expireConsult` logs `logInfo('commanderPool consult timed out; standing orders will run', { seatId, turnNumber, elapsedMs })`, where `elapsedMs` is `Math.max(0, context.nowMs() - (entry.planningStartedAt ?? context.nowMs()))`. Phase 6 uses the same `nowMs` for think time.
9. Each of `openRouterChatTransport.ts`, `requestOrdersToolLoop.ts`, and `requestOrdersFlow.ts` ends this phase at or below 600 lines. If a step would pass 600, move the new code into the file this phase already created for that area instead of growing the caller.

### Tests

`consultTelemetry.test.ts`:

- Two ok attempts with providers `DeepInfra` then `Novita`, and one http attempt with provider `DeepInfra` and status 503, summarize to `servedBy: ['DeepInfra', 'Novita']`, `failedOn: ['DeepInfra']`, `modelCalls: 3`, `timeouts: 0`.
- A timeout attempt with `provider: null` summarizes to `timeouts: 1` and `failedOn: []`.
- `providerFromChatBody('{"provider":"DeepInfra"}', true)` is `DeepInfra`. `providerFromChatBody('{"error":{"metadata":{"provider_name":"AtlasCloud"}}}'`, false)` is `AtlasCloud`. `providerFromChatBody('not json', true)` is null. `providerFromChatBody('{}', true)` is null.

`openRouterChatTransport.test.ts`. Pass a recorder on the payload. The 503-then-200 case records two attempts: `http` with status 503 and `retried: true`, then `ok`. The fallback list contains `httpStatusRetry`. The hang-once case records one `timeout` attempt with `provider: null` and no retry fallback.

`ordersChatRequestHelpers.test.ts`. Pass a recorder. The required-tool-choice retry records `toolChoiceAuto`. The structured-output retry records `structuredOutputDropped`. One assertion each, on the cases that already exist.

### Verification

After the moves, before the recorder:

```text
npm run build:main
node dist/main/openRouter/openRouterChatTransport.test.js
node dist/main/openRouter/ordersChatRequestHelpers.test.js
npm run check:circular
```

After the recorder:

```text
npm run build:main
node dist/main/openRouter/consultTelemetry.test.js
node dist/main/openRouter/openRouterChatTransport.test.js
node dist/main/openRouter/ordersChatRequestHelpers.test.js
npm run lint
npm run check:circular
```

Expected: all exit 0. Confirm the three line counts are at or below 600, and that `commanderPool.ts` grew by no more than the `nowMs` line.

---

## Phase 6: Think time on the result screen

**Outcome:** Each settled consult adds its launch-to-settle time to that seat. The result row shows it between the consultation count and the cost. A player stop adds nothing. An old save loads with zero.

### Files

- Modify [`src/main/gameDb/schema.ts`](../src/main/gameDb/schema.ts). Add `think_time_ms INTEGER NOT NULL DEFAULT 0` after `cost_usd`.
- Modify [`src/main/gameDb/seatRosterStore.ts`](../src/main/gameDb/seatRosterStore.ts). `ensureSeatAddedColumns` also adds `think_time_ms INTEGER NOT NULL DEFAULT 0` when `PRAGMA table_info` does not list it. `SeatRow`, the select, the insert, and `seatFromRow` carry it. Add `recordSeatThinkTime`.
- Modify [`src/shared/seatRoster.ts`](../src/shared/seatRoster.ts). `SeatRecord` gains `readonly thinkTimeMs: number`. `toSeatSnapshot` spreads the seat, so the snapshot gains it with no extra line. Confirm that and do not rebuild the snapshot by hand.
- Modify [`src/main/gameDb/seatResolution.ts`](../src/main/gameDb/seatResolution.ts). A new match sets `thinkTimeMs: 0` beside `consultationCount: 0`.
- Modify [`src/main/openRouter/commanderPoolSettle.ts`](../src/main/openRouter/commanderPoolSettle.ts). `expireConsult` and every branch of `applyConsultOutcome` call `recordSeatThinkTime`. `abandon` in [`src/main/openRouter/commanderPool.ts`](../src/main/openRouter/commanderPool.ts) does not, and this phase does not edit that file: `abandon` never reaches the settle functions, which is what excludes a player stop.
- Create [`src/shared/thinkTimeLabel.ts`](../src/shared/thinkTimeLabel.ts) and [`src/shared/thinkTimeLabel.test.ts`](../src/shared/thinkTimeLabel.test.ts).
- Modify [`src/shared/standings.ts`](../src/shared/standings.ts) and [`src/shared/standings.test.ts`](../src/shared/standings.test.ts). `StandingsSeatInput` and `StandingsRow` gain the think-time field and `thinkTimeLabel`. `standingsRow` fills it for an AI seat and leaves it null for a human seat.
- Modify [`src/renderer/gameplay/gameOverStandings.ts`](../src/renderer/gameplay/gameOverStandings.ts). `seatInput` copies `thinkTimeMs`. `metaLine` joins `thinkTimeLabel` between `consultationsLabel` and `costLabel`.
- Modify [`src/main/gameDb/seatRosterStore.test.ts`](../src/main/gameDb/seatRosterStore.test.ts) and [`src/main/openRouter/commanderPool.test.ts`](../src/main/openRouter/commanderPool.test.ts).
- Modify [`doc/ux/new-game-dialog.md`](../doc/ux/new-game-dialog.md), [`doc/save-files.md`](../doc/save-files.md), and [`doc/hybrid-ai.md`](../doc/hybrid-ai.md).

`thinkTimeMs` is required on `SeatRecord`, and `SeatSnapshot` extends it, so every seat literal in a snapshot fixture has to carry it. Default it to 0 in the `seat()` helpers in [`src/shared/seatRoster.test.ts`](../src/shared/seatRoster.test.ts), [`src/main/gameDb/seatRosterStore.test.ts`](../src/main/gameDb/seatRosterStore.test.ts), and [`src/shared/standings.test.ts`](../src/shared/standings.test.ts). Then fix whatever `build:main` still reports, by adding `thinkTimeMs: 0` beside `costUsd: 0` in that literal. Known clusters that list the fields inline: [`src/main/tools/standingOrdersInjectionMission.test.ts`](../src/main/tools/standingOrdersInjectionMission.test.ts), [`src/main/tools/orderlessUnitSuggestions.test.ts`](../src/main/tools/orderlessUnitSuggestions.test.ts), [`src/main/openRouter/promptHexExclusiveAudit.test.ts`](../src/main/openRouter/promptHexExclusiveAudit.test.ts), [`src/main/openRouter/possibleUnitActions.test.ts`](../src/main/openRouter/possibleUnitActions.test.ts), [`src/main/briefingOrderlessMission.test.ts`](../src/main/briefingOrderlessMission.test.ts), [`src/main/sideGroupSeed.test.ts`](../src/main/sideGroupSeed.test.ts), and [`src/main/gameActions/endOfTurnOutcomeRules.test.ts`](../src/main/gameActions/endOfTurnOutcomeRules.test.ts). The compiler names anything else. Do not hide a missing field with a type assertion, and do not add the field to an object the compiler accepts without it.

### Steps

1. `recordSeatThinkTime(ops, seatId, elapsedMs)` adds the elapsed time when it is a positive finite number, and adds 0 otherwise. It logs at debug with the seat id and the added amount. It updates `think_time_ms` only. It does not change `consultation_count` or `cost_usd`.
2. Elapsed time is `Math.max(0, context.nowMs() - (entry.planningStartedAt ?? context.nowMs()))`. `nowMs` was added to `ConsultSettleContext` in Phase 5. `planningStartedAt` is set from that same clock at launch, so a test that moves `now` between launch and settle measures the gap. Call `recordSeatThinkTime` inside the database write, after the existing `recordSeatConsultation` calls where those exist, and also in the branches that do not record a consultation: the pool-timer timeout, and a failure whose cost is 0. A finished consult records both. Do not record twice in one settle. `expireConsult` and `applyConsultOutcome` cannot both pass `isCurrentLaunch` for the same launch, so one call in each is safe.
3. `formatThinkTimeLabel(ms: number): string` uses `formatCommanderClock` from [`src/shared/commanderCardState.ts`](../src/shared/commanderCardState.ts) below 3_600_000 ms, and `h:mm:ss` from one hour. A negative or non-finite input formats as `0:00 thinking`. It logs at trace.
4. `StandingsRow.thinkTimeLabel` is `string | null`. The row comment says it is null for the human seat and `{clock} thinking` for an AI seat, including `0:00 thinking` when that seat never settled a consult.
5. Docs. In `doc/ux/new-game-dialog.md`, the AI result row shows the think-time label between the consultation count and the cost. Name `formatThinkTimeLabel`. Say the total includes consults that timed out or failed, and the consultation count does not. In `doc/save-files.md`, `seats.think_time_ms` is added on open by `ensureSeatAddedColumns`, defaults to 0, and is the seat's accumulated launch-to-settle time in milliseconds. A player stop adds nothing. Leave the version at 26. In `doc/hybrid-ai.md`, the sentence that says cost and the consultation count are stored on the seat also names `think_time_ms` and `recordSeatThinkTime`, and says a timeout adds think time without adding a consultation.

### Tests

- `thinkTimeLabel.test.ts`. `formatThinkTimeLabel(0)` is `0:00 thinking`. `formatThinkTimeLabel(90_000)` is `1:30 thinking`. `formatThinkTimeLabel(3_660_000)` is `1:01:00 thinking`. `formatThinkTimeLabel(-5)` is `0:00 thinking`.
- `seatRosterStore.test.ts`. `recordSeatThinkTime` of 1500 then 500 reads back 2000. `recordSeatThinkTime` of `Number.NaN` leaves the stored total unchanged. The round trip writes `thinkTimeMs: 1500` and reads it back.
- `commanderPool.test.ts`. Extend `a hung consult times out only that seat`. The clock starts at 1_000 and advances 40 before the timer fires. After the first `flushWrites`, the two finished seats have `thinkTimeMs` 0. After the timer and the second flush, the hung seat has `thinkTimeMs` 40. Read it from `getSeatRoster()`.
- Add `a finished consult records its think time` in that file, using the same fake clock and `withMatch`. One seat has a model and the other two do not (`['model-a', null, null]`). The runner awaits a gate, the test advances `now` by 2_500, then releases the gate. After `waitForSeatsSettled`, that seat's `thinkTimeMs` is 2500.
- Extend `cancelling one commander aborts only that consult`. After the cancel and a flush, the cancelled seat's `thinkTimeMs` is 0.
- `standings.test.ts`. Give the first AI seat `thinkTimeMs: 90_000` and assert `thinkTimeLabel` is `1:30 thinking`. Assert the human row's `thinkTimeLabel` is null. The `seat()` helper defaults the field to 0 so the other cases stay at `0:00 thinking`; assert that on one AI row that does not set the field.

### Verification

```text
npm run build:main
node dist/shared/thinkTimeLabel.test.js
node dist/shared/standings.test.js
node dist/main/gameDb/seatRosterStore.test.js
node dist/main/openRouter/commanderPool.test.js
npm run check:renderer-types
npm run lint
npm run check:circular
```

Expected: all exit 0. `commanderPool.test.js` skips its match cases when no regional map with three side groups is installed. If it skips, say so in the report. Do not treat a skip as a pass you earned; the machine this repo builds on has that map.

Confirm `standings.ts` is at or below 600 lines. The label function lives in its own file so this one stays under.

---

## Phase 7: Final verification

**Outcome:** The whole suite, the renderer bundle, and the docs agree with the code.

### Steps

1. Run the full checks below. `npm run ui:smoke` already passed in Phase 4, and no later phase changes the popover. Do not run it again.
2. Search `doc/` for the old numbers and the old sentences. The search excludes `doc/release-notes/`, `doc/devleopment-plan-v3.4.md`, `doc/poc-analysis.md`, and `doc/market-research.md`.

```text
npm test
npm run build:renderer
```

Then search:

```text
rg -n "90_000|300_000|660_000|after 90s|5 minutes" doc --glob "!release-notes/**" --glob "!devleopment-plan-v3.4.md" --glob "!poc-analysis.md" --glob "!market-research.md"
rg -n "reasoning effort, and doctrine" doc/ux doc/ux-specification.md
```

Expected: `npm test` exits 0. `npm run build:renderer` exits 0 and updates the tracked `static/renderer.js`. Leave that update in the working tree. Do not commit it.

The first search returns no matches. A match in a historical file is outside this search. The second search returns no matches, because each of those lists now includes the provider choice. If either search finds a live document this plan missed, update that document in the same terms as the phase that owns the change, then run the search again.

Confirm once more, with `(Get-Content <file>).Count`, that `openRouterChatTransport.ts`, `requestOrdersToolLoop.ts`, `requestOrdersFlow.ts`, and `commanderPopover.ts` are each at or below 600.
