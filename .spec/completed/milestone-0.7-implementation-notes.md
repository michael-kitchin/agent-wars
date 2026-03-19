# Milestone 0.7 — Implementation Notes

*Post-implementation summary for the callback system and event-driven consultation.*

## Where things live

- **Callback subscription storage:** `src/main/callbackSubscriptions.ts`
  - `getSubscriptions(playerId)` — returns all subscriptions for a player (for evaluation and ACTIVE CALLBACKS section).
  - `replaceSubscriptions(playerId, subscriptions, subscribedTurn)` — replace-all semantics; call after a successful LLM consultation when the response includes a `callbacks` array.
  - `clearSubscriptions(playerId)` — remove all subscriptions (e.g. on new game).
  - Persisted in table `ai_callback_subscriptions`; cleared in `resetGameForNewMatch()` in `gameDb.ts`.

- **Mandatory override and subscription evaluation:** `src/main/callbackEvaluation.ts`
  - `evaluateMandatoryOverrides(state, lastConsultationTurn, opponentUnitsInCombatSinceConsultation, thisResolutionOpponentCombatants, removedOpponentUnitIds)` — returns list of fired mandatory overrides (first_consultation, first_combat, unit_destroyed, unordered_unit, standing_order_blocked, deadman).
  - `evaluateSubscriptionEvents(state, subscriptions, ctx)` — returns list of fired subscription events (turns, unit_engaged, unit_destroyed, unit_arrived, threat_escalation); territory_changed is no-op for 0.7.

- **After-resolution hook:** `src/main/afterResolution.ts`
  - `afterResolution(state, resolutionResult, deps)` — call only when event-driven consultation is on and resolution succeeded. Builds resolution context, adds this resolution’s opponent combat participants to the persisted set, runs mandatory overrides and subscription evaluation; if any fire, calls `requestOrders`, then on success stores pending orders, updates last consultation turn, and clears combat-since-consultation; if none fire, clears pending orders.

- **Ready path:** `src/main/gameIpcHandlers.ts` — `handleGameReady`
  - When `useEventDrivenConsultation` is true: AI orders from `getAiPendingOrders('opponent')` if present, else `generateOrdersForStandingOrders(...)`; no `requestOrders` at Ready. After `ready()` returns successfully, calls `afterResolution(getGameState(), readyResult, deps)` synchronously so the next Ready can use pending orders.

- **Parse and apply callbacks/memoryUpdates:** `src/main/openRouter.ts`
  - `parseOrdersResponse` returns optional `callbacks` and `memoryUpdates`; after a successful parse, callbacks are applied via `replaceSubscriptions('opponent', parsed.callbacks, state.turnNumber)`; memory updates are applied via `executeTool4('memory_write', ...)` / `executeTool4('memory_delete', ...)`.

- **Briefing and prompt:** `src/main/briefingFormatter.ts` — optional 5th parameter `subscriptions`; section "**ACTIVE CALLBACKS**" lists current subscriptions or "None. You may add callbacks...". System prompt in `openRouter.ts` instructs the LLM to output optional `callbacks` and `memoryUpdates` in the response JSON.

## Event vocabulary and mandatory overrides

| Event / override | Parameters | Fires when |
|------------------|------------|------------|
| `turns` | `n` (integer) | N turns have elapsed since subscription (subscribedTurn + n). |
| `unit_engaged` | `unitId` | This AI unit participates in combat (ranged or melee) this resolution. |
| `unit_destroyed` | `side?` or unitId | A unit is destroyed; filter by owner if side given. |
| `unit_arrived` | `unitId` | Unit reached its standing-order destination (arrived). |
| `threat_escalation` | `unitId`, `severity` | Threat severity for unit meets subscription (e.g. moderate/critical). |
| `territory_changed` | `hexId?` | No-op for 0.7 (no territory control logic yet). |
| **Mandatory:** first_consultation | — | No consultation yet this game. |
| **Mandatory:** first_combat | unitId | AI unit participates in combat for the first time since last consultation. |
| **Mandatory:** unit_destroyed | unitId | Any AI unit is destroyed. |
| **Mandatory:** unordered_unit | unitId | AI unit has no standing order. |
| **Mandatory:** standing_order_blocked | unitId | Standing order in warning status (blocked, target_lost, etc.). |
| **Mandatory:** deadman | turnsSince | No consultation for 5 turns. |

## Constants

- **Deadman interval:** 5 turns. Defined as `DEADMAN_TURNS` in `callbackEvaluation.ts`.
- **Warning statuses** (standing order): `blocked`, `target_lost`, `target_out_of_range`, `target_destroyed`, `arrived`, `contact` — same set as tool5; used for mandatory override "standing_order_blocked" and for attention flags in the briefing.

## Pending orders flow

1. **After resolution (event-driven on):** `afterResolution` runs. If any callback or mandatory override fires, `requestOrders` is called; on success, `setAiPendingOrders('opponent', orders, rangedAttacks)` and `setAiLastConsultationTurn(state.turnNumber)`, `clearOpponentCombatSinceConsultation()`. If none fire, `clearAiPendingOrders('opponent')`.
2. **At next Ready (event-driven on):** If `getAiPendingOrders('opponent')` returns data, use it as AI orders and `clearAiPendingOrders('opponent')`. Else call `generateOrdersForStandingOrders('opponent', ...)` (standing-order-only). No LLM call at Ready.

## UI and metrics

- **Toggle:** "Use event-driven consultation (0.7)" checkbox in the AI panel (Model tab), id `openrouter-event-driven`. In-session only (no persistence). When on, renderer does not start background `requestAiOrders`; Ready payload includes `useEventDrivenConsultation: true` and no precomputed orders.
- **Status:** When event-driven and orders came from standing-order-only (`aiConsulted === false`), the UI shows "AI executing standing orders (no event fired)." and a map toast "AI: standing orders only (no consultation)." Cost for that turn is zero (no LLM call).
- **Ready result:** `aiConsulted?: boolean` — when event-driven, `true` if orders came from pending (consultation ran previously), `false` if standing-order-only.

## How to run event-driven playtests

1. Start a new game, set API key and model, turn Run on.
2. Check "Use event-driven consultation (0.7)".
3. Click Ready each turn. First turn(s) may use standing-order-only until an event fires (e.g. first_consultation, first_combat, deadman). When an event fires, `afterResolution` calls the LLM and stores pending orders; the next Ready uses those orders and shows normal cost/metrics.
4. Compare with Run on and event-driven off (0.6 path): every turn requests orders in the background and Ready uses precomputed or calls requestOrders. Compare cost and latency over many turns.

## afterResolution: synchronous

`afterResolution` is invoked synchronously after `ready()` returns in `handleGameReady`, so the next planning phase already has pending orders set if consultation ran. The Ready response may take longer when an event fires and the LLM is called; the UI shows "Resolving…" until the handler returns.

## New game and DB reset

`resetGameForNewMatch()` in `gameDb.ts` deletes from `ai_callback_subscriptions`, `ai_pending_orders`, `ai_combat_since_consultation`, and removes `game_config` key `ai_last_consultation_turn`. New game clears all 0.7 state so no callback or pending data leaks into the new game.
