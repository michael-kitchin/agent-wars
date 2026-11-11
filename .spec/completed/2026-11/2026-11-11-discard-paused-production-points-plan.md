# Discard paused production points

A paused queue keeps no production points from one turn to the next. When it resumes, it starts with only that turn's income. A queue that is still building keeps its partial progress. Turn resolution, the AI prompt text, tests, and the docs that describe banking change together.

## Behavior

- **Paused queue.** If a hex's queue ends the production pass paused, for any reason, its stored points become 0. The reasons are occupation (outside the home, with no unit or fortification of that seat on the hex), a full city (a fortification row and no unfortified city cell left), and the unit cap. Any one of them is enough.
- **Same turn.** A queue may spend earlier rows and then pause on a later row. Points already spent stay spent. Only the unspent remainder is stored, and that remainder is 0 because the pass ended paused. Occupation never spends, so stored points from earlier turns and this turn's income are both discarded.
- **Building queue.** A queue that is still building and is short of the next item's cost keeps its points. Today's carry-over is unchanged, so a 10-city hex can still save toward a naval unit. Running out of points is not a pause.
- **Unchanged.** An empty queue with Keep building off never enters the pass. A finite queue that finishes keeps its leftover points. Neither is a pause.
- **Loaded saves.** Stored points stay as saved until the next production pass. There is no load-time wipe and no save-version change. A still-paused hex drops its points on that next pass.
- **Player wording.** The popup note, the turn-report line, and the map label stay as they are. The map label stays `∞t` because it keys off `buildPaused`, not off the point total. The popup's turn estimate uses `storedPoints`, so after a paused pass it counts from 0. [doc/how-to-play.md](../doc/how-to-play.md) and the README explain the loss.

## Turn resolution

`pointsKeptAfterPass` goes in [src/main/gameActions/queuePauseRecording.ts](../src/main/gameActions/queuePauseRecording.ts).

- Signature: `pointsKeptAfterPass(h3Index: string, points: number, reasons: readonly QueuePauseReason[]): number`.
- It returns 0 when `reasons` is non-empty. Otherwise it returns `points`, truncated at 0.
- It logs at debug on every call, with the hex, the points in hand, the reason count, and the points kept. It is not a getter.
- It gets an orienting comment. The production pass does not log the same fact again.

In [src/main/gameActions/controlAndProduction.ts](../src/main/gameActions/controlAndProduction.ts), `processProductionAfterControlResolution`:

- **Occupation branch.** Compute `listQueuePauseReasons(...)` once. Pass that list to `recordQueuePause` and store `pointsKeptAfterPass(h3Index, points, reasons)`.
- **After the spend loop.** Build `pausedReasons` from `fortificationPaused` and `blockedByCapType` before `setBuildProgressPointsForHex`, and store `pointsKeptAfterPass(...)`. Leave the fortify, credits, and spawn steps where they are. The `points < cost` break stays a non-pause.
- Update the function's orienting comment: a paused queue stores 0.

Comments that call stored points "banked" should say they are points carried toward the next item, and that a paused queue keeps none:

- `setBuildProgressPointsForHex` in [src/main/gameDb/controlInfrastructure.ts](../src/main/gameDb/controlInfrastructure.ts)
- `storedPoints` in [src/main/gameActions/buildQueue.ts](../src/main/gameActions/buildQueue.ts), [src/shared/ipc/productionTypes.ts](../src/shared/ipc/productionTypes.ts), and [src/main/openRouter/productionQueueSnapshotTypes.ts](../src/main/openRouter/productionQueueSnapshotTypes.ts)

[src/main/gameActions/controlAndProduction.ts](../src/main/gameActions/controlAndProduction.ts) is near the desirable file-size limit. This change adds a few call sites, not a new block. Do not split the file for this.

## AI prompts

- **Income rule.** In [src/main/openRouter/promptSpec/gameRuleText.ts](../src/main/openRouter/promptSpec/gameRuleText.ts), `buildProductionIncomeRule` gains one sentence: "A queue that is building keeps its unspent points toward the next item. A paused queue loses its points at the end of the turn." This is the sentence that covers the unit cap. A cap-only pause is not listed in Paused Queues.
- **Buildability rule.** In [src/main/openRouter/promptSpec/gameRuleMercenaryText.ts](../src/main/openRouter/promptSpec/gameRuleMercenaryText.ts), the second paragraph of `buildBuildabilityRule` becomes: "Elsewhere a queue pauses, and its points are lost at the end of each turn until you end a turn with a unit there or raise a mercenary there."
- **Paused Queues.** In [src/main/openRouter/pausedProductionAttention.ts](../src/main/openRouter/pausedProductionAttention.ts), remove the banked-points paragraph and the `storedPoints` field on `PausedProductionHex`, including the read in `findPausedProductionHexes`. After the grouped pause sentences, add one fixed paragraph: "A paused queue loses its production points at the end of each turn." The remedy paragraphs follow. Update the file header and the orienting comments.
- **Left as they are.** `query_production` still returns `storedPoints`, the partial progress of a queue that is building, which is 0 after a paused pass. `PRODUCTION_CAP_QUEUE_GUIDANCE` and the coaching text stay. Their advice, to switch to a type that can still be built, already avoids the loss, and the income rule states it.

## Tests

Each test checks the contract only.

- [src/main/productionBuildabilityFlow.test.ts](../src/main/productionBuildabilityFlow.test.ts). The first test asserts stored points of 0 and keeps the queue. Its name and the file header drop "banks". Add one test: a buildable hex whose queue is short of the next item's cost keeps its points.
- [src/main/fortificationProductionFlow.test.ts](../src/main/fortificationProductionFlow.test.ts). The full-city pause test asserts stored points of 0. The keep-building test that fortifies the last cell and then pauses also asserts 0, which locks the same-turn case: points already spent stay spent, and the remainder is discarded.
- [src/main/gameActionsProduction.test.ts](../src/main/gameActionsProduction.test.ts). Both cap-block tests assert stored points of 0, and their comments drop "accumulate". The keep-building cap stall asserts stored points of 0 as well.
- [src/main/openRouter/pausedProductionAttention.test.ts](../src/main/openRouter/pausedProductionAttention.test.ts). Drop the points cases and the `storedPoints` argument on the row helper. The loss paragraph appears once, after the pause sentences and before the remedies.
- [src/main/openRouter/promptContracts.test.ts](../src/main/openRouter/promptContracts.test.ts). Update the expected text of `buildBuildabilityRule`.
- [src/main/tools/productionTools.test.ts](../src/main/tools/productionTools.test.ts). The pause test's comment stops saying "banked". The assertion stays `typeof storedPoints === 'number'`, because that read happens before a production pass.

## Docs

Update in place. Do not edit completed specs or historical docs.

- [doc/how-to-play.md](../doc/how-to-play.md). "Idle hexes save nothing", "Points stay banked", and "keeps its points". A building queue still carries partial progress. A paused queue does not. The map label stays `∞t`.
- [doc/combat-rules-v3.md](../doc/combat-rules-v3.md). The Cost paragraph: points carry over only while the queue is building. The pause paragraph: name `pointsKeptAfterPass` and replace "Points stay banked".
- [doc/region-vs-region.md](../doc/region-vs-region.md). "keeps its points".
- [README.md](../README.md). "Elsewhere it pauses and keeps its points."
- [doc/ux/build-popup.md](../doc/ux/build-popup.md). A paused queue keeps no points. The note text is unchanged.
- [doc/ai-tools.md](../doc/ai-tools.md). `storedPoints` is partial progress, and it is 0 after a paused pass.
- [doc/ai-commander-prompts/strategic-prompt.md](../doc/ai-commander-prompts/strategic-prompt.md). In the Paused Queues body order, the fixed loss paragraph replaces the banked-points paragraph. Note the new income-rule sentence.
- [doc/ai-commander-prompts/information-decision-model.md](../doc/ai-commander-prompts/information-decision-model.md). The `PRODUCTION_INCOME` row.
- [doc/ai-commander-prompts/example-strategic-prompt.md](../doc/ai-commander-prompts/example-strategic-prompt.md). The income sentence and the buildability paragraph.

[doc/ai-commander-prompts/assembly-contract.md](../doc/ai-commander-prompts/assembly-contract.md) says the subsection body is whatever `formatPausedQueuesSection` returns. That stays true.

## Verification

Run the TypeScript build, lint, and the full `npm test`. Do not commit.
