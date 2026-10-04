# AI tools (engine)

What the opponent model can **call**, plus host-only helpers that share the same executors. Prompt wording for those tools is in [ai-commander-prompts/](ai-commander-prompts/README.md). Groups are `TOOL_GROUP_REGISTRY` in `src/main/openRouter/openRouterToolGroups.ts`.

The engine under `src/` wins if this file drifts.

## Groups shown to the model

| Group id | Tools on the model | Notes |
| --- | --- | --- |
| `planning` | `plan_route`, `check_distance` | `PATHFINDING_TOOL_NAMES` |
| `assessment` | `assess_unit`, `assess_hex` | `ASSESSMENT_TOOL_NAMES`. Omitted from a strategic consult tool list when a precomputed briefing is present (`requestOrdersFlow` excludes them). In battle, `assess_unit` stays when the group is on and `assess_hex` is stripped (`filterToolNamesForTacticalBattle`). |
| `estimation` | `estimate_combat` | `COMBAT_ESTIMATION_TOOL_NAMES`. Same strategic omission when a briefing is present. Offered in battle when the group is on. |
| `memory` | `memory_read` | `MEMORY_TOOL_NAMES`. Writes are `memoryUpdates` in the envelope, not tools. |
| `orders` | `query_orders` | `STANDING_ORDER_TOOL_NAMES`. Assign/cancel are envelope actions; `executeStandingOrderActionForPlayer` still implements `assign_order` / `cancel_order` for the host and for parsed JSON. |
| `production` | `query_production`, `set_build_queue` | `PRODUCTION_TOOL_NAMES`. Strategic only. `set_build_queue` is a **write** tool; queues can also arrive as `productionOrders` in the envelope. |
| `precomputation` | *(none)* | UI group; the pipeline is `precomputation.ts`, not a model-callable tool. |

Disabled groups drop those tools from the numbered list and omit the matching briefing/envelope tails (see `variants.md` in the prompt package). A model whose OpenRouter listing does not include `tools` is consulted with every model-callable group off, whatever the Tools tab says; the strategic briefing is still attached, and the Tools tab's Events group still applies (`variants.md` section 2.6).

## Pathfinding

`src/main/tools/pathfinding.ts` (tactical: `tacticalPathfinding.ts`).

- **`plan_route`:** Multi-turn path for a unit toward a destination hex code (or a land target that naval must approach via water/coastal). Returns a hex-code path, remaining turns, and optional suggested destinations. Naval land-target handling redirects to the nearest water/coastal hex.
- **`check_distance`:** Grid/path distance and estimated turns between two hex codes.

Strategic movement budgets are `getMovementBudget` (infantry 1, armor 2, naval 2, air 0). With the weather bonus on, `plan_route` and `check_distance` estimate the whole route with the budget of the hex the unit occupies now. Tactical marches use terrain-weighted MP (`tacticalRanges.ts` + `tacticalTerrainCombatModifiers.ts`), including the weather budget and open-ground cost from [combat rules §4.9](combat-rules-v3.md).

## Assessment

`src/main/tools/assessment.ts`.

- **`assess_unit`:** Nearby enemies/friendlies, threat severity, standing-order status, `canAttackThisTurn`. Distances are hop counts when fog is off at res1 (`usesOmniscientGridProximity`); fog-on uses path lengths when a path exists.
- **`assess_unit` in battle** (`tacticalAssessUnit.ts`): the sub-unit's terrain, `movementPointsThisBeat`, and `rangedRangeThisBeat`; per nearby enemy, `inRangedRange` / `inEnemyRangedRange` under battle range, terrain, and line-of-sight rules (air needs an intact airport), `canEnterCellThisBeat`, and `estimatedBeatsToReach` / `estimatedBeatsToReachYou` from the battle march planner (`tacticalMarchEstimate.ts`); threats and `canAttackThisBeat`. `radius` counts battle cells (default 4). Distances are battle-cell hops. Cargo shares its carrier's cell, cannot march, and when embarked at sea neither fires nor is a ranged target. Air sub-units do not march, so their beats-to-reach fields are null. A `canAttackThisBeat` row with no attack names the rule that blocks it: no intact airport for air, cargo embarked at sea on either side, or distance against battle range.
- **`assess_hex`:** Terrain, passability, occupants, notes. Pre-computation runs this on human-occupied (and other relevant) hexes for Supplemental Hex Intelligence. Not available in battle: a call that reaches the engine returns an error. With the weather bonus on, the result includes `weather` for that hex.
- **Weather fields** (rules in [combat rules §4.9](combat-rules-v3.md)): present only while the weather bonus is on. Strategic and battle `assess_unit` add `weatherTags`, `weatherHere`, `rangedAttackPenalized`, and `airStrikePenalizedAtBase`. The two penalized flags are true for any penalty, at Low or High. A unit with no tags has `weatherTags: []`. `weatherHere` is the weather of the hex or battle. An unexplored hex reports `weather: null` on `assess_hex`. The assessed unit's movement budget, and each nearby unit's turn estimate, uses the weather of the hex that mover occupies. In battle, `movementPointsThisBeat` already includes the weather budget. `estimate_combat` uses the same ranged and air-strike thresholds as resolution and does not change melee.
- **Origin bonus fields** (`originBonusAssessment.ts`; rules in [combat rules §4.9](combat-rules-v3.md)): present only while a flag that applies in the mode is on, so with both flags off results are unchanged. The `assess_unit` unit block gains `originBonusHere` (`[]`, `['country']`, `['terrain']`, or both) when the country bonus is on, or in battle when either flag is on, with `originBonusAmount` beside it (0 when the list is empty, otherwise the 1 or 2 that unit adds where it stands); `birthCountry` when the country bonus is on; and in battle `birthTerrain` when the terrain bonus is on. `assess_hex` gains `country` (the hex's majority country, or null) when the country bonus is on. Stacked units each get their own values.

## Combat estimation

`src/main/tools/combatEstimation.ts`.

- **`estimate_combat`:** Analytical hit probabilities (Poisson-binomial over A&A d6 rolls) for a proposed matchup. Return fire uses planning-parity eligibility. Ad-hoc when the model still has the tool; the briefing no longer dumps a full estimate table.
- **Arguments** (`normalizeCombatSideArgs` in `combatEstimationSides.ts`): `attackers` and the optional `defenders` each take real `units` ids or hypothetical `assumed` `{ type, count }` entries, and non-empty `units` wins. Non-string ids and `assumed` entries without a string `type` and a finite `count` are ignored; counts round down, never go below zero, and may arrive as numeric strings. `attackers` must keep at least one id or entry.
- **Sides:** real ranged attackers that cannot reach the target are dropped with a warning, and the call fails when none can. Assumed attackers stand on the target cell, so ranged return fire is not evaluated for them (a warning says so). Without `defenders`, every non-AI unit on the target cell defends; units there that sit out the engagement (such as cargo embarked at sea) are named in a warning, and an empty cell yields an `uncontested` prediction.
- **Melee roles:** melee resolution picks at random which side rolls attack values and which rolls defense values, so melee predictions average both cases and report each in `meleeRoleOutcomes` (`attackersRollAttack`, `attackersRollDefense`).
- **Origin bonuses:** summary `attackValue` and `defenseValue` are the effective values, including the origin bonus, and every hit probability uses them. A row whose unit qualifies adds `originBonus: 1` (Low) or `originBonus: 2` (High), the amount actually added. Real ranged attackers are judged where they stand, real melee attackers and all defenders at the target. Assumed units never qualify.
- **Theaters** (`combatEstimationTheater.ts`): strategic estimates leave land units embarked at sea out of ranged and melee, like strategic resolution. Battle estimates use battle range, terrain, and line-of-sight rules and the battle return-fire context (`tacticalCombatInput.ts`), place cargo on its carrier's cell, leave cargo embarked at sea out of ranged combat only, and reject air attackers because battle air strikes use different dice.

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
- **While a tactical battle is open:** Opponent `set_build_queue` and `productionOrders` from a strategic consult apply when the turn phase is planning. The human build popup stays closed for that battle. See [build-popup.md](ux/build-popup.md).

Costs and prerequisites: [combat-rules-v3.md](combat-rules-v3.md) §2.

## Encoding

Arguments and results that carry geography are converted to briefing hex codes before the model sees them (`encodeOpenRouterToolResultForLlm`). Engine error strings (`status: error`) are passed through.

## Related

- Loop and callbacks: [hybrid-ai.md](hybrid-ai.md)
- Prompt include/omit matrix: [ai-commander-prompts/variants.md](ai-commander-prompts/variants.md)
