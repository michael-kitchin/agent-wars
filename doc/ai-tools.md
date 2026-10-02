# AI tools (engine)

What the opponent model can **call**, plus host-only helpers that share the same executors. Prompt wording for those tools is in [ai-commander-prompts/](ai-commander-prompts/README.md). Groups are `TOOL_GROUP_REGISTRY` in `src/main/openRouter/openRouterToolGroups.ts`.

The engine under `src/` wins if this file drifts.

## Groups shown to the model

| Group id | Tools on the model | Notes |
| --- | --- | --- |
| `planning` | `plan_route`, `check_distance` | `PATHFINDING_TOOL_NAMES` |
| `assessment` | `assess_unit`, `assess_hex` | `ASSESSMENT_TOOL_NAMES`. Omitted from the consult tool list when a precomputed briefing is present (`requestOrdersFlow` excludes them). |
| `estimation` | `estimate_combat` | `COMBAT_ESTIMATION_TOOL_NAMES`. Same omission when a briefing is present. |
| `memory` | `memory_read` | `MEMORY_TOOL_NAMES`. Writes are `memoryUpdates` in the envelope, not tools. |
| `orders` | `query_orders` | `STANDING_ORDER_TOOL_NAMES`. Assign/cancel are envelope actions; `executeStandingOrderActionForPlayer` still implements `assign_order` / `cancel_order` for the host and for parsed JSON. |
| `production` | `query_production`, `set_build_queue` | `PRODUCTION_TOOL_NAMES`. Strategic only. `set_build_queue` is a **write** tool; queues can also arrive as `productionOrders` in the envelope. |
| `precomputation` | *(none)* | UI group; the pipeline is `precomputation.ts`, not a model-callable tool. |

Disabled groups drop those tools from the numbered list and omit the matching briefing/envelope tails (see `variants.md` in the prompt package). A model whose OpenRouter listing does not include `tools` is consulted with every model-callable group off, whatever the Tools tab says; the strategic briefing is still attached, and the Tools tab's Events group still applies (`variants.md` section 2.6).

## Pathfinding

`src/main/tools/pathfinding.ts` (tactical: `tacticalPathfinding.ts`).

- **`plan_route`:** Multi-turn path for a unit toward a destination hex code (or a land target that naval must approach via water/coastal). Returns a hex-code path, remaining turns, and optional suggested destinations. Naval land-target handling redirects to the nearest water/coastal hex.
- **`check_distance`:** Grid/path distance and estimated turns between two hex codes.

Strategic movement budgets are `getMovementBudget` (infantry 1, armor 2, naval 2, air 0). Tactical marches use terrain-weighted MP (`tacticalRanges.ts` + `tacticalTerrainCombatModifiers.ts`).

## Assessment

`src/main/tools/assessment.ts`.

- **`assess_unit`:** Nearby enemies/friendlies, threat severity, standing-order status, `canAttackThisTurn`. Distances are hop counts when fog is off at res1 (`usesOmniscientGridProximity`); fog-on uses path lengths when a path exists.
- **`assess_hex`:** Terrain, passability, occupants, notes. Pre-computation runs this on human-occupied (and other relevant) hexes for Supplemental Hex Intelligence.

## Combat estimation

`src/main/tools/combatEstimation.ts`.

- **`estimate_combat`:** Analytical hit probabilities (Poisson-binomial over A&A d6 rolls) for a proposed matchup. Return fire uses planning-parity eligibility. Ad-hoc when the model still has the tool; the briefing no longer dumps a full estimate table.

## Memory

`src/main/tools/memory.ts`.

- **`memory_read`:** Fetch stored-tier notes by key or tag.
- Limits: **5** persistent slots (`PERSISTENT_LIMIT`), **15** stored (`STORED_LIMIT`). Persistent rows appear in every strategic briefing. There are no `memory_write` / `memory_delete` tools on the model.

## Standing orders

`src/main/tools/standingOrders.ts` + `standingOrdersCore.ts` (the status block injected into the briefing is in `standingOrdersInjectionText.ts`).

- **Model tool:** `query_orders` only.
- **Order types:** `defend`, `march`, `pursue`, `patrol`, `hold_fire`. Air cannot take `march`, `pursue`, or `patrol` (`AIR_INELIGIBLE_ORDER_TYPES`).
- **`hold_fire`:** Suppresses DEFEND auto-engagement and the tempo sweep for that unit until replaced.
- Standing orders do **not** move tactical sub-units. They can still generate DEFEND fire from the parent.

## Production

`src/main/tools/productionTools.ts`. Strategic only.

- **`query_production`:** Controlled hexes, urban/airport/seaport counts, available types, queues. Capped types are hidden when another type can still spawn (`filterQueueableUnitTypes`); a hex whose every available type is maxed is marked `all at cap`.
- **`set_build_queue`:** Replaces that hex's queue with one type and count (`BUILD_ENTRY_MIN_COUNT`–`MAX`, 1..99). Rejects a capped type when an alternative exists (`shouldRejectCappedQueueType`).

Costs and prerequisites: [combat-rules-v3.md](combat-rules-v3.md) §2.

## Encoding

Arguments and results that carry geography are converted to briefing hex codes before the model sees them (`encodeOpenRouterToolResultForLlm`). Engine error strings (`status: error`) are passed through.

## Related

- Loop and callbacks: [hybrid-ai.md](hybrid-ai.md)
- Prompt include/omit matrix: [ai-commander-prompts/variants.md](ai-commander-prompts/variants.md)
