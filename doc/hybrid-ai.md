# Hybrid AI (what ships)

Short description of how the LLM opponent is wired in **2.4.0**. Combat, movement, and production rules live in [combat-rules-v3.md](combat-rules-v3.md). **What the model is told today** is catalogued in [ai-commander-prompts/](ai-commander-prompts/README.md) — this page does not restate prompt copy.

The engine under `src/` wins if this file drifts.

## Player-facing picture

You supply an OpenRouter API key and pick a **tool-capable** model. The opponent does not see the true board: it gets a briefing built from **its** fog (or omniscient view if fog is off), then it may call a small set of **read** tools, then it submits one JSON envelope of orders. Standing orders and an engine attack sweep carry quiet turns. You can run **event-driven** consultation (consult when callbacks or mandatory overrides fire) or consult every turn. Tactical battles use the same loop once per beat.

The OpenRouter panel is session control (key, model, Run, status, tool count). It is not a full briefing observatory. Developer dumps: `debug-last-strategic-prompt.txt`, `debug-last-user-prompt.txt` (tactical dump on disk may be stale).

## Layers

1. **Pre-computation** (`src/main/precomputation.ts`). Before a consult, the engine runs `assess_unit` on opponent units and `assess_hex` on relevant hexes, then `formatBriefing` / `formatTacticalBriefing` injects tables (unit status, Best Options, production, memory, standing orders, air, sealift). Combat-estimate injection was removed; Best Options carries legal this-period actions instead.
2. **Ad-hoc tools** during the consult. Listed in [ai-tools.md](ai-tools.md). When a briefing is present, assessment and estimation tools are usually omitted from the model's tool list because those facts are already in the briefing.
3. **Envelope writes.** Standing-order assign/cancel, memory write/delete, callbacks, and (strategically) production queues are applied from the parsed JSON, not from a second write-tool path — except production, which also exposes `set_build_queue` as a tool. See [ai-tools.md](ai-tools.md).
4. **Standing-order execution** at Ready / tactical beat (`generateOrdersForStandingOrders`). DEFEND auto-fires; `hold_fire` suppresses auto-fire and the tempo sweep.
5. **Tempo sweep** (`collectTempoRuleAttacks` / `collectTacticalTempoAttacks`). One legal attack for each unit that can shoot and was not already ordered. Not described to the model on purpose.

## When a consult happens

- **Every-turn mode:** a consult is requested as part of Ready / beat planning when Run is on and a key/model exist.
- **Event-driven mode:** after strategic resolution (deferred until resolution playback finishes — `deferredResolutionPlaybackConsult.ts`) and after each tactical beat, `runEventDrivenAfterResolutionConsultation` / `runEventDrivenAfterTacticalBeatConsultation` evaluate subscriptions and mandatory overrides. If nothing fires, standing orders run and the model is not called.

Mandatory overrides (`evaluateMandatoryOverrides` in `callbackEvaluation.ts`): `first_consultation`, `first_combat`, `new_contact`, `unit_destroyed`, `unordered_unit`, `standing_order_blocked`, `attack_mix_changed`, `deadman` (5 turns, `DEADMAN_TURNS`).

Subscription events the evaluator implements: `turns`, `unit_engaged`, `unit_destroyed`, `unit_arrived`, `threat_escalation`, `infrastructure_destroyed`. **`territory_changed` is a no-op** (accepted, never fires).

Each consult **replaces** the full callback list. Tactical subscriptions use sub-unit ids and are cleared when the battle ends.

## Consult loop bounds

`requestOrdersFlow` / `requestOrdersToolLoop.ts`:

- At most `REQUEST_ORDERS_MAX_TOOL_ROUNDS` (**50**) tool rounds.
- Wall clock `REQUEST_ORDERS_MAX_WALL_CLOCK_MS` (**90_000** ms).
- Malformed empty completions retry (`MALFORMED_COMPLETION_RETRY_LIMIT` = 2). Unparseable final JSON gets one repair call with tools off.

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
