# Hybrid AI (what ships)

Short description of how the LLM opponent is wired in **2.4.0**. Combat, movement, and production rules live in [combat-rules-v3.md](combat-rules-v3.md). **What the model is told today** is catalogued in [ai-commander-prompts/](ai-commander-prompts/README.md) — this page does not restate prompt copy.

The engine under `src/` wins if this file drifts.

## Player-facing picture

You supply an OpenRouter API key and pick a **tool-capable** model. The opponent does not see the true board: it gets a briefing built from **its** fog (or omniscient view if fog is off), then it may call a small set of **read** tools, then it submits one JSON envelope of orders. Standing orders and an engine attack sweep carry quiet turns. You can run **event-driven** consultation (consult when callbacks or mandatory overrides fire) or consult every turn. Tactical battles use the same loop once per beat.

The OpenRouter panel is session control (key, model, reasoning effort, Run, status, tool count). It is not a full briefing observatory. Developer dumps: `debug-last-strategic-prompt.txt`, `debug-last-user-prompt.txt` (tactical dump on disk may be stale).

## Layers

1. **Pre-computation** (`src/main/precomputation.ts`). Before a consult, the engine runs `assess_unit` on opponent units and `assess_hex` on relevant hexes, then `formatBriefing` / `formatTacticalBriefing` injects tables (unit status, Best Options, production, memory, standing orders, air, sealift). Combat-estimate injection was removed; Best Options carries legal this-period actions instead.
2. **Ad-hoc tools** during the consult. Listed in [ai-tools.md](ai-tools.md). When a briefing is present, assessment and estimation tools are usually omitted from the model's tool list because those facts are already in the briefing.
3. **Envelope writes.** Standing-order assign/cancel, memory write/delete, callbacks, and (strategically) production queues are applied from the parsed JSON, not from a second write-tool path — except production, which also exposes `set_build_queue` as a tool. See [ai-tools.md](ai-tools.md).
4. **Standing-order execution** at Ready / tactical beat (`generateOrdersForStandingOrders`). DEFEND auto-fires; `hold_fire` suppresses auto-fire and the tempo sweep.
5. **Tempo sweep** (`collectTempoRuleAttacks` / `collectTacticalTempoAttacks`). One legal attack for each unit that can shoot and was not already ordered. Not described to the model on purpose.

## When a consult happens

- **Every-turn mode:** while Run is on, a background `requestAiOrders` fills a precomputed plan during planning. Ready sends that plan. There is no post-resolution model call.
- **Event-driven mode, strategic:** one model call per turn.
  - The first consult after a new game, after Run is turned on, or after Events is turned on is a background `requestAiOrders`. Ready waits on it, then sends that precomputed plan.
  - After resolution, once playback finishes (or there is nothing to animate), `runEventDrivenAfterResolutionConsultation` in `deferredResolutionPlaybackConsult.ts` evaluates subscriptions and mandatory overrides. If it calls the model, those orders are stored as pending orders for the next Ready. That call does not start a second strategic `requestAiOrders`. When a tactical battle is already in planning, the battle's opponent-plan request was held for this consult. It starts when the result is applied, and when a stale push for another turn only clears the latch. Queue writes in that strategic result apply while the battle is open and the turn phase is planning. Ready keeps the AI wait label until that battle plan is buffered. From the playback notice until the result arrives, Ready shows the AI wait label (see [resolution-playback.md](ux/resolution-playback.md)). Turning Run off does not cancel this consult.
  - The next Ready reads the pending orders. It does not send a precomputed plan.
  - If the evaluation does not call the model, or the call fails, pending orders are cleared and the next Ready uses standing orders. There is no follow-up model call.
  - If the deferred consult is abandoned because the playback notice does not match, one background request may run so the turn is not left without a plan.
- **Event-driven mode, tactical:** after each beat, `runEventDrivenAfterTacticalBeatConsultation` uses the same evaluation. A beat with no trigger does not call the model.
- **Draft edits:** the player's draft orders are not consult input, so editing them never cancels, restarts, or discards a background `requestAiOrders`. Only Run off, a removed key or model, an Events toggle, a new game, battle exit or reconciliation, annihilation, the wait timeout, or a rejected request cancel it.

Mandatory overrides (`evaluateMandatoryOverrides` in `callbackEvaluation.ts`): `first_consultation`, `first_combat`, `new_contact`, `unit_destroyed`, `unordered_unit`, `standing_order_blocked`, `attack_mix_changed`, `deadman` (5 turns, `DEADMAN_TURNS`).

Subscription events the evaluator implements: `turns`, `unit_engaged`, `unit_destroyed`, `unit_arrived`, `threat_escalation`, `infrastructure_destroyed`. **`territory_changed` is a no-op** (accepted, never fires).

Each consult **replaces** the full callback list. Tactical subscriptions use sub-unit ids and are cleared when the battle ends.

## Consult loop bounds

`requestOrdersFlow` / `requestOrdersToolLoop.ts`:

- At most `REQUEST_ORDERS_MAX_TOOL_ROUNDS` (**50**) tool rounds. While the consultation offers at least one tool, every round before the model's first tool call sends `tool_choice: required` and no envelope schema, and every later round sends `tool_choice: auto` with the schema, so the model can submit the envelope or call more tools. A provider that rejects `required` (Amazon Bedrock's Claude endpoint does) is retried once with `auto`, and that model stays on `auto` for the rest of the session; its rounds before the first tool call still carry no schema. A model whose `supported_parameters` lists `tools` but not `tool_choice` gets the tools with no `tool_choice`. A model that does not list `tools` is consulted as if every group of model-callable tools were off, so it cannot submit production orders, memory updates, or standing-order actions; the strategic briefing is still attached, and event-driven consultation still follows the Tools tab's Events group. A consultation with no tools sends neither `tools` nor `tool_choice`, and carries the schema on every round. The repair call still refuses tools.
- One model call aborts after `AI_MODEL_REQUEST_TIMEOUT_MS` (**90_000** ms) and is retried once (`AI_MODEL_REQUEST_RETRY_COUNT`). A body that has started and then goes quiet for **15_000** ms is dropped and is not retried. The hard body timer uses the same **90_000** ms, measured from when headers arrive.
- Wall clock `REQUEST_ORDERS_MAX_WALL_CLOCK_MS` (**300_000** ms), checked before each round. The round already in flight, and the parse-repair call, can run past that mark.
- Callers wait up to `AI_CONSULTATION_WAIT_TIMEOUT_MS` (**660_000** ms): the wall clock plus those two retried calls. That value is the post-resolution race and the background `requestAiOrders` timer. `READY_REQUEST_TIMEOUT_MS` stays **120_000** ms because event-driven consultation runs after Ready returns.
- Malformed empty completions retry (`MALFORMED_COMPLETION_RETRY_LIMIT` = 2). Unparseable final JSON gets one repair call with tools off.
- Completion budget: the model's advertised `top_provider.max_completion_tokens` on every call, at every reasoning level (`completionMaxTokensFromAdvertisedLimit`). When that limit is missing, the call uses `OPENROUTER_ORDER_FLOW_COMPLETION_MAX_TOKENS` (**8192**). A 402 that names an affordable count of at least 512 (`OPENROUTER_MIN_COMPLETION_MAX_TOKENS`), and below the request, retries at that count and remembers it for later calls. The remembered count can lower a later request, and the request is never above the chosen budget. An affordable count below 512 is not used as a cap.
- Request options are resolved once per consult (see [source-inventory.md](ai-commander-prompts/source-inventory.md) section 4.4). The saved reasoning effort goes on every request. For models that support structured outputs, a closed envelope schema plus response healing goes on every round after the first tool call, on every round of a consultation without tools, and on the repair call, but never on a round that sends `required`. Anthropic models get it too; their first schema request currently fails because the envelope schema exceeds Anthropic's schema limits, and they continue without it. Each refusal is retried once without the rejected option. These refusals are expected, so they are written to the AI activity log as ordinary lines and to `debug.log` at info level (see [ai-activity-log.md](ux/ai-activity-log.md)). The developer flag `AGENT_WARS_DISABLE_STRUCTURED_OUTPUTS=1` withholds the schema from every model for a run.

Exhausting the tool-round cap records a successful-but-empty consult and warns on the **next** system prompt.

## Writes vs reads

| Path | Used for |
| --- | --- |
| Tools | `plan_route`, `check_distance`, `assess_unit`, `assess_hex`, `estimate_combat`, `memory_read`, `query_orders`, `query_production`, `set_build_queue` |
| JSON envelope | `orders` (including `assign_order` / `cancel_order` / `explicit_move` / `ranged_attack`), `airStrikes`, `ferryOrders`, `callbacks`, `memoryUpdates`, `productionOrders`, `strategy`, `message` |

Tactical envelopes omit `assign_order`, memory writes, and production. Sub-units are ordered with `explicit_move`, `ranged_attack`, embark/disembark, `transport_move`.

## Coordinates

The model never sees raw H3 indexes. Briefing hex codes (and lat/lng internally) are the contract. Tool results are rewritten to hex codes by `encodeOpenRouterToolResultForLlm`.

## Related

- Prompt catalog (emitted text): [ai-commander-prompts/README.md](ai-commander-prompts/README.md)
- Tools: [ai-tools.md](ai-tools.md)
- Scenario: [region-vs-region.md](region-vs-region.md)
- Historical rationale: [poc-analysis.md](poc-analysis.md)
