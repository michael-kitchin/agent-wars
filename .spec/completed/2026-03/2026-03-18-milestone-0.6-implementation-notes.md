# Milestone 0.6 — Implementation Notes

*Post-implementation summary for the pre-computation and briefing format feature.*

## Where things live

- **Pre-computation pipeline:** `src/main/precomputation.ts`
  - `runUnitAssessments(state, coordMap)` — runs `assess_unit` for every AI unit.
  - `runPrecomputation(state, coordMap, options?)` — orchestrator: unit assessments, combat estimates (capped), and `assess_hex` for every hex with at least one human unit.
  - Uses the same tool executors as the LLM loop (`executeTool2`, `executeTool3`); pre-computation does not duplicate tool logic.

- **Briefing formatter:** `src/main/briefingFormatter.ts`
  - `formatBriefing(state, precomputed, standingOrderText, memoryText)` — builds the Commander's Briefing string (strategic narrative, unit status table, combat estimates table, attention flags, memory block, standing order block).

- **Integration:** `src/main/openRouter.ts`
  - `RequestOrdersOptions.usePrecomputation` — when `true`, runs pre-computation before building the prompt and passes the briefing via `buildSystemPromptForTools(..., briefingOverride)`.
  - `buildSystemPromptForTools(..., briefingOverride?)` — when `briefingOverride` is present, it replaces the usual memory + standing-order + roster block with the briefing; combat rules, tools section, and submit instruction are unchanged.

- **Toggle and metrics:** Toggle is in-session only (no persistence).
  - **IPC:** `game:requestAiOrders` and `game:ready` payloads accept `usePrecomputation?: boolean`. Handlers in `src/main/gameIpcHandlers.ts` pass it through to `requestOrders`.
  - **UI:** Checkbox "Use pre-computation (0.6)" in the AI panel Tools tab (`openrouter-use-precomputation`). State is kept in renderer and sent with each request/ready call.

## Constants

- **Max combat estimates:** 15 (default). Configurable via `runPrecomputation(..., { maxCombatEstimates })`. Defined as `DEFAULT_MAX_COMBAT_ESTIMATES` in `precomputation.ts`.
- **Max tool iterations:** 50 (unchanged from 0.5). Defined as `MAX_TOOL_ITERATIONS` in `openRouter.ts`. Not reduced when pre-computation is on; goal is to measure ad-hoc tool usage, not limit it.
- **assess_hex:** Run for every hex that contains at least one human unit (no cap). Can be skipped by passing `skipHexAssessments: true` to `runPrecomputation` options (default: false/undefined).

## Metrics (A/B testing)

- **toolInvocationCounts:** Counts only ad-hoc LLM tool calls during the tool loop; pre-computation calls are not included.
- **cost:** Total API cost (sum of `usage.cost` across round-trips).
- **wallClockMs:** Elapsed time from before the tool loop to final response (or error). Returned on success and on tool-limit-exceeded.
- **inputTokens / outputTokens:** When the OpenRouter API returns `usage.prompt_tokens` and `usage.completion_tokens`, they are summed across round-trips and included in the result.

All of the above are exposed on the IPC result (e.g. `RequestAiOrdersResult`, `ReadyResultMinimal`) so the renderer or logs can show them. No separate analytics UI; logging and result shape are sufficient for 0.6 playtests.

## How to run A/B

1. Start a game, select model and key, enable Run.
2. **0.5 path:** Leave "Use pre-computation (0.6)" unchecked. Click Ready when AI is ready. Note tool counts, cost, and latency (e.g. from status log or dev tools).
3. **0.6 path:** Check "Use pre-computation (0.6)". Same seed/setup; run the same number of turns. Compare tool invocation counts (expect 0–2 ad-hoc with briefing vs. 5–10 without), latency, and cost.

Playtest hypothesis (from dev plan): with pre-computation, AI play quality is comparable or better; ad-hoc tool calls drop to 0–2 per turn; per-turn latency drops by at least 50%; per-turn token cost drops by at least 40%.

## Callbacks

Callbacks are out of scope for 0.6. The briefing includes a one-line placeholder: "Callbacks not yet active (Milestone 0.7)."
