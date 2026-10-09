# Strategic Development Plan: Grand Strategy Wargame with LLM Opponents

*Version 3.4 — October 2026 (historical roadmap, renumbered for the regional game)*

---

## Current progress (October 2026, engine 2.5.0)

This file is the original phased plan. **It is not live rules.** Combat, caps, vision, costs, and phase order live in [combat-rules-v3.md](combat-rules-v3.md) and `src/`. Regional map data and economy numbers live in [region-summary-1.md](region-summary-1.md) and each map's manifest. Prompt text lives in [ai-commander-prompts/](ai-commander-prompts/README.md).

| Planned milestone | Status in the live build |
| --- | --- |
| 0.6 Pre-computation and briefing | Complete |
| 0.7 Callback / event-driven consultation | Complete |
| 1.1–1.7 Global strategic game (map, fog, economy, air, sealift, region-vs-region) | Complete. Live caps, costs, and vision radii differ from the numbers written inside those milestone sections. 1.7 shipped as the single `region_vs_region` scenario with player-chosen homes, not as preset scenarios. |
| 2.1–2.4 Tactical rendering, movement, combat, LLM play, integration | Complete. Tactical ranged baselines are infantry 2 / armor 5 / naval 10, not the 5/10/20 in the 2.2 writeup. Mountain LOS and terrain MP modifiers are live. |
| 2.45 Playtester UI fixes | Complete (September 2026). |
| 2.5 Regional game and rules enhancements | Complete (October 2026). Ships as engine 2.5.0. |
| 2.6 Save/load and session management | **Not shipped.** SQLite persists the in-progress match in Electron user data; there is no player-facing save slot, load list, or turn replay UI. Numbered 2.5 before version 3.4. |
| 3.1–3.5 Polish, personalities, diplomacy, sound, async multiplayer | Not started as named milestones. Some 3.1 UI (minimap, map-first chrome, OpenRouter panel, keyboard pan, the October UI facelift) and some 3.4 resolution feedback (dice chips, destroyed-unit playback) exist in partial form. |
| 4.1–4.4 Onboarding, store packaging, community beta, launch | Not started. Desktop packaging via electron-builder exists for developer / side-load builds. |

**Do not copy unit costs, caps, fog radii, tactical ranges, or bail-out formulas from the milestone writeups below.** Those paragraphs were design-time targets.

**Renumbering in version 3.4.** Two milestones were built after 2.4 without a number in this plan: 2.45 (playtester UI fixes) and 2.5 (the regional game, plus the rules and UI enhancements built alongside it). Save/load and session management, formerly 2.5, is now 2.6. Phase 3 and Phase 4 numbers are unchanged. Commits, execution plans under `.spec/completed/`, and blog drafts written before October 2026 that say "milestone 2.5" mean save/load.

**Filename:** `devleopment-plan-v3.4.md` keeps the historical spelling. Version 3.3 is in git history.

---

## Status and Context (as written in April 2026)

Phase 0 milestones 0.1–0.5 are complete. The prototype validates the core concept: LLM opponents playing through MCP-style tool services produce engaging, intentional-feeling play. The AI is challenging by milestone 0.5, tool usage varies interestingly by model, and concurrent AI planning during the human's planning phase keeps small-map games feeling responsive.

Three scaling concerns emerged during Phase 0 that must be addressed before building the production game:

1. **Cost scales with map and unit count.** A small-map game (271 hexes, 10 units) costs $0.04 with Gemini Flash 2.5 — trivial. But expensive models cost 10x that, and medium/large maps push even cheap models toward similar per-turn costs as expensive models on small maps.
2. **Latency scales with the iterative tool-calling loop.** Each tool call is a full inference round-trip. A 5–10 call planning sequence multiplies base latency by 5–10x. On small maps with expensive models, individual turns can take up to a minute even with concurrent planning.
3. **Both problems compound.** On large maps (1,951 hexes, 30 units), the combination of larger state representations, more tool calls, and longer reasoning chains pushes latency and cost to levels that threaten the player experience.

These observations align with every other LLM game AI project's findings. The solution is well-validated: a hybrid architecture where the LLM serves as a strategic advisor consulted on events, while pre-computed analysis and standing orders handle turn-to-turn execution. The existing 5-tool MCP architecture maps cleanly onto this pattern with minimal waste.

This plan begins after milestone 0.5 and incorporates the hybrid AI architecture as a foundational design decision rather than a future optimization.

**Map resolution decision (settled).** The game uses two H3 zoom levels: global (H3 resolution 1, ~842 hexes at ~610,000 km² each) and tactical (H3 resolution 4, ~343 hexes per global hex at ~1,770 km² each, ~42 km edge-to-edge). This was determined by a rendering performance budget of ~400 hexes on screen. Phase 1 builds the complete game at the global level. Phase 2 adds optional tactical battles at res 4 when opposing units share a res1 hex, plus session persistence. The earlier goal of 1 km² hex resolution has been set aside — res 4's ~42 km hexes provide division-scale tactical play, which is the right grain for the Axis & Allies-inspired unit interactions in the game vision.

*Version 3.4 note:* milestone 2.5 adds a second family of maps. A regional map uses strategic H3 resolution 2 or 3, with battles three levels down at resolution 5 or 6. The global map stays at resolutions 1 and 4. The active map supplies both resolutions (`strategicH3Resolution` and `tacticalH3Resolution` in `src/shared/h3Resolutions.ts`).

**Tactical vs strategic turn resolution.** Ordering, playback parity, reconciliation, and human march merge (standing orders previewed without DB mutation, then merged at tactical Ready) are documented in [.spec/completed/tactical-strategic-turn-resolution-alignment-plan.md](../.spec/completed/tactical-strategic-turn-resolution-alignment-plan.md), with a focused audit of res1/res4 infrastructure reconciliation in [.spec/completed/tactical-infra-reconciliation-audit.md](../.spec/completed/tactical-infra-reconciliation-audit.md). Live phase order is embark → air → ranged → movement → cargo sync → ferry → melee (tactical beats put cargo sync after ferry). See combat rules §4.

---

## Planning Assumptions

Unchanged from v2.0: roughly 10–15 hours per week of focused development. Two-week target per milestone. If any milestone consistently exceeds three weeks, cut scope within it. Every milestone produces something runnable and includes a playtest hypothesis.

**New assumption:** The hybrid AI architecture is validated during Phase 0 (milestones 0.6–0.7) before any production code is written. If validation fails — if the pre-computation + callback approach produces noticeably worse AI play than the current iterative loop — the fallback is to optimize within the current architecture (prompt compression, caching, parallel tool calls) and accept the latency/cost constraints on larger maps as a design limitation rather than pursuing the hybrid pattern.

---

## Hybrid AI Architecture: Tool Fusion Summary

The five existing MCP tools reorganize into two operational modes. No tools are removed — they shift roles.

### Pre-Computation Layer (engine runs automatically)

Before invoking the LLM, the engine runs these analyses for all AI units and injects the results into the prompt as a structured briefing:

- **assess_unit** on every AI unit — nearby enemies, friendlies, threats, attack options
- **assess_hex** on strategically relevant hexes — contested areas, objectives, chokepoints
- **estimate_combat** on all likely engagements — any enemy-AI unit pair within striking distance
- **Standing order status** — progress, blocks, arrivals, contacts (already implemented in 0.5)
- **Route progress** for all march/pursue orders (already implemented in 0.5)

This replaces the current pattern where the LLM requests each assessment individually through sequential tool calls. The engine knows what the LLM needs; it computes everything in parallel before the LLM sees it.

### Ad-Hoc Tools (available during LLM consultation)

When the LLM is consulted, it retains access to read/query tools for scenarios the pre-computation didn't cover:

- **plan_route** — exploring hypothetical routes ("what if I rerouted armor-1 through the southern pass?")
- **check_distance** — quick comparisons between options the LLM is weighing
- **estimate_combat** — what-if scenarios with hypothetical force compositions ("what if I combined these two units against that position?")
- **assess_unit** — assessing enemy units the AI is curious about, or re-assessing a friendly unit with a different scan radius
- **assess_hex** — evaluating hexes outside the pre-computed set
- **memory_read** — retrieving stored-tier memories by key or tag during reasoning
- **query_orders** — checking standing order details beyond what the briefing summary provides

Write operations — standing orders (`assign_order`, `cancel_order`), memory updates (`memory_write`, `memory_delete`), and callback subscriptions — are issued exclusively through the response JSON (see LLM Output Format below). This eliminates a dual-path ambiguity where the LLM could issue the same operation through either a tool call or the response, which would confuse models and complicate validation. One path for reads (ad-hoc tools during reasoning), one path for writes (response JSON).

The critical difference from 0.5: the iterative tool-calling loop still exists, but the expected number of ad-hoc calls drops from 5–10 per consultation to 0–2, because the pre-computation layer has already answered the standard questions. The max-iteration cap drops from 10 to 5, and most consultations should complete in a single inference pass.

### Callback Event System (new)

Instead of being called every turn, the LLM subscribes to events from a finite, engine-evaluable vocabulary. After each turn's resolution, the engine checks all active subscriptions. When any condition fires, it re-runs the pre-computation layer and calls the LLM.

**Event vocabulary (initial set — extend only when playtesting demands it):**

| Event | Parameters | Fires when |
|-------|-----------|------------|
| `turns(N)` | N: integer | N turns have elapsed since subscription |
| `unit_engaged(unitId)` | unitId: string | This unit participates in combat |
| `unit_destroyed(side?)` | side: "own" or "enemy" or specific unitId | A unit is destroyed |
| `unit_arrived(unitId)` | unitId: string | Unit's standing march order reaches destination |
| `threat_escalation(unitId, severity)` | unitId: string, severity: "moderate" or "critical" | Unit's threat assessment worsens to specified level |
| `territory_changed(hexId?)` | hexId: optional | Control of an objective hex changes hands |
| `infrastructure_destroyed(type?, hexId?)` | type: "urban" or "airport" or "seaport", hexId: optional | Infrastructure destroyed at a hex |

**Mandatory override events (always fire, regardless of LLM subscription):**

- First consultation of the match (`first_consultation`)
- Any AI unit participates in combat for the first time since the last consultation (`first_combat`)
- New contact (`new_contact`)
- Any AI unit is destroyed
- Any AI unit without a standing order exists (`unordered_unit`)
- An AI unit's standing order enters a blocked or warning state
- Attack mix changed (`attack_mix_changed`)
- No LLM consultation has occurred for 5 turns (deadman timer)

`territory_changed` is accepted as a subscription name but does not fire. Airport-destroyed-as-mandatory is covered by existing destroy and infrastructure paths rather than a dedicated override type.

When no events fire, standing orders execute and the LLM is not invoked. The AI's per-turn cost drops to zero on quiet turns.

### LLM Output Format (revised)

When consulted, the LLM responds with:

```json
{
  "strategy": "Natural language summary of current strategic thinking",
  "orders": [
    { "unitId": "...", "action": "assign_order", "order": { "type": "march", "destination": [...], ... } },
    { "unitId": "...", "action": "cancel_order" },
    { "unitId": "...", "action": "explicit_move", "destination": [...] },
    { "unitId": "...", "action": "explicit_attack", "targetHex": [...] },
    { "unitId": "...", "action": "air_strike", "targetHex": [...], "targetType": "units" },
    { "unitId": "...", "action": "ferry", "destinationAirport": [...] },
    { "unitId": "...", "action": "build", "unitType": "armor", "productionHex": [...] }
  ],
  "callbacks": [
    { "event": "turns", "params": { "n": 3 } },
    { "event": "unit_arrived", "params": { "unitId": "opponent-armor-1" } },
    { "event": "threat_escalation", "params": { "unitId": "opponent-infantry-2", "severity": "critical" } },
    { "event": "infrastructure_destroyed", "params": { "type": "airport" } }
  ],
  "memoryUpdates": [
    { "action": "write", "key": "...", "content": "...", "tier": "persistent" },
    { "action": "delete", "key": "..." }
  ]
}
```

Standing orders remain the primary output mechanism. Explicit per-turn movement, ranged attack, air strike, and ferry orders are available for one-off tactical actions. The `callbacks` array replaces the implicit "call me every turn" contract. Memory updates can be bundled into the response rather than requiring separate tool calls, further reducing round-trips.

The LLM can still use ad-hoc tools during its reasoning if needed — the response format doesn't prevent tool calls. But the design encourages single-pass responses by front-loading all the information the LLM typically requests.

---

## Phase 0 (Continued): Hybrid Architecture Validation (Milestones 0.6–0.7)

**Goal:** Validate that the hybrid architecture produces AI play quality comparable to the current iterative tool-calling approach, at dramatically lower cost and latency. This is still throwaway prototype code — the goal is to answer architectural questions, not to write production systems.

**What you'll have at the end of Phase 0:** Empirical data comparing the current architecture against the hybrid approach across quality, cost, and latency dimensions. A clear go/no-go decision for building Phase 1 on the hybrid pattern.

### Milestone 0.6 — Pre-Computation and Briefing Format

**Build:** Add a pre-computation pipeline that runs all assessment tools on all AI units before the LLM is invoked, then injects the results into the prompt as a structured briefing. Design the briefing format — natural language strategic overview followed by Markdown tables for unit assessments, standing order status, and pre-computed combat estimates. Keep the ad-hoc tools available but observe whether the LLM still calls them.

Implement this as a toggle so you can A/B test: play the same starting position with the current iterative tool-calling approach (0.5 architecture) and the pre-computation approach (0.6 architecture) using the same model.

**Playtest hypothesis:** The AI's play quality with pre-computed briefings should be comparable to or better than the iterative tool-calling approach. The LLM should make 0–2 ad-hoc tool calls per turn instead of 5–10. Per-turn latency should drop by at least 50%. Per-turn token cost should drop by at least 40%.

**Key metrics to capture:** Side-by-side comparison on the same starting position and model:

- Number of ad-hoc tool calls per turn (target: 0–2 with pre-computation vs. 5–10 without)
- Total tokens per turn (input + output)
- Wall-clock time per AI turn
- Subjective play quality (does the AI still make coherent, intentional-feeling moves?)

**Briefing format design guidance:** Based on the scaling research, use spatial decay — full detail for units near enemies or objectives, summary for units in quiet areas. Use Markdown tables for tactical data (roughly half the tokens of JSON). Use natural language for strategic context. Let the LLM reason in natural language and output structured orders only at the end. Example structure:

```
=== COMMANDER'S BRIEFING (Turn 12) ===

STRATEGIC OVERVIEW:
You control 8 of 12 land hexes. The human holds 4, concentrated southeast.
Your armor thrust toward [2.1, 0.5] is 2 turns from contact. No naval
engagements active. Overall position: favorable, pressing advantage.

UNIT ASSESSMENTS:
| Unit | Position | Order | Status | Nearest Enemy | Dist | Threat |
|------|----------|-------|--------|---------------|------|--------|
| armor-1 | [12.4,12.1] | MARCH→[2.1,0.5] | en_route, 2t | human-inf-2 | 3 | moderate |
| inf-1 | [4.0,21.5] | DEFEND | holding | human-armor-1 | 5 | low |
| inf-2 | [8.2,4.3] | — | NO ORDERS | human-inf-1 | 2 | critical |
| naval-1 | [-3.1,0.6] | PATROL | patrolling | human-naval-1 | 4 | low |

COMBAT ESTIMATES (likely engagements):
• armor-1 vs human-inf-2 at [2.1,0.5]: FAVORABLE
  (P(eliminate)=0.50, P(your loss)=0.33, return fire unlikely)
• inf-2 vs human-inf-1 at [8.2,4.3]: EVEN
  (P(eliminate)=0.17, P(your loss)=0.33, melee if they advance)

⚠ ATTENTION REQUIRED:
• inf-2 has NO STANDING ORDER and faces a critical threat at distance 2

YOUR STRATEGIC MEMORY: [persistent memories injected here]
ACTIVE CALLBACKS: turns(3) fires turn 15; unit_arrived(armor-1) ~turn 14
```

**Learning focus:** Prompt format engineering for pre-computed data. Measuring the relationship between briefing verbosity and AI decision quality. Understanding which ad-hoc tool calls the LLM still makes, and why — these indicate gaps in the pre-computation coverage.

### Milestone 0.7 — Callback System and Event-Driven Consultation

**Build:** Implement the callback event system. After each turn's resolution, the engine evaluates all active event subscriptions and mandatory override conditions. When an event fires, re-run pre-computation and consult the LLM. When no events fire, execute standing orders silently.

Play a complete game (10–20 turns) where the LLM is consulted only when events fire. Compare against a game where the LLM is consulted every turn. Measure total LLM invocations, total cost, total latency, and — critically — whether the AI's play feels coherent across the turns where it wasn't consulted.

**Playtest hypothesis:** The AI should be consulted on roughly 30–50% of turns in a typical small-map game (the rest handled by standing orders). Total per-game cost should drop by at least 50% compared to every-turn consultation. The AI's play should not feel noticeably worse during the turns where it was not consulted — standing orders should carry the game plan forward competently. When the AI is consulted after an event, its response should show awareness of what changed (via the pre-computed briefing).

**Critical validation test:** Play 3–5 complete games with the hybrid system on a small map. After each game, ask yourself: "Could I tell which turns the AI was thinking and which turns it was on autopilot?" If the answer is consistently yes — if the autopilot turns feel obviously different or worse — the standing order system or the callback trigger set needs tuning before proceeding. If you can't tell, or if the variation feels natural (like a human opponent who sometimes makes bold moves and sometimes executes a plan), the system works.

**Edge case to test:** What happens when the LLM sets poor callback criteria? For example, `turns(10)` on a fast-moving front where contact happens on turn 2. The mandatory overrides (unit destroyed, unit engaged, unordered unit exists) should catch this. Verify that the mandatory overrides fire correctly and that the LLM receives useful context about what happened while it wasn't looking.

**Decision gate after 0.7:** If both milestones validate — pre-computation produces comparable AI quality at lower cost, and event-driven consultation maintains game coherence — proceed to Phase 1 with the hybrid architecture as the foundational pattern. If pre-computation validates but callbacks don't (the AI degrades too much when not consulted every turn), build Phase 1 with pre-computation only and call the LLM every turn but with fewer tool calls. If neither validates, build Phase 1 with the original iterative architecture and manage scaling through prompt compression, caching, and model tiering.

---

## Phase 1: The Real Game (Milestones 1.1–1.7)

**Goal:** Transform the validated prototype into a real, replayable game on a real-Earth global map with fog of war, a functional economy, four unit types with distinct roles, naval transport, and enough depth to sustain multiple playthroughs. This is where you stop writing throwaway code and start building the actual codebase. The hybrid AI architecture is foundational — it's not bolted on later, it's built into the production architecture from the start.

**What you'll have at the end of Phase 1:** A complete single-player game at the global zoom level (H3 res 1, ~842 hexes) against an LLM opponent on a real-Earth map, with fog of war, a functional economy, four unit types (infantry, armor, naval, air) creating layered strategic choices, and naval transport enabling amphibious operations. Playable from start to finish in 1–3 hours. The AI is consulted on events, not every turn, keeping per-game costs under $0.20 with mid-tier models.

**Critical decision before starting Phase 1:** How much code from Phase 0 do you carry forward? The honest answer is the architectural lessons, the tool service logic, and the prompt format patterns — but mostly rewritten code. Phase 0 was learning and validation. Phase 1 is building a codebase you'll maintain for years.

### Milestone 1.1 — Clean Architecture

**Build:** Set up the production project structure from scratch, informed by everything you learned in Phase 0. Establish the core patterns:

- The game state schema in SQLite
- The main-process / renderer-process communication protocol
- The turn lifecycle state machine (now incorporating the hybrid AI cycle: resolve → pre-compute → evaluate callbacks → consult LLM if triggered → execute standing orders → planning phase)
- The pre-computation pipeline as a first-class system
- The callback event engine
- The briefing generator (game state → structured prompt)
- The AI service interface (OpenRouter integration with ad-hoc tool support)
- The rendering pipeline

Seaport the basic hex rendering and WEGO turn loop from Phase 0, restructured for the hybrid architecture. Set up your build pipeline, linting, and whatever CI you want. Ship the same small-map game from Phase 0 running on the new codebase.

**Playtest hypothesis:** None — this is infrastructure. But constrain yourself to one milestone. If you're still refactoring architecture after two weeks, you're over-engineering. The game should play identically to the 0.7 prototype on the new codebase.

**Anti-pattern warning:** This is where your enterprise instincts will most strongly tempt you to over-architect. The callback event system needs a simple registry and a per-turn evaluation loop, not a publish-subscribe framework. The pre-computation pipeline needs a function that runs the assessment tools and formats the output, not a configurable data processing pipeline. The briefing generator is a template, not a layout engine. Build for the next three milestones, not for hypothetical future requirements.

### Milestone 1.2 — The Real Map (Global Level)

**Build:** Generate a global hex map of the entire Earth from Natural Earth data, preprocessed through PostGIS into H3 cells at resolution 1 (~842 hexes, ~610,000 km² each). Each hex is tagged with a dominant terrain type derived from Natural Earth: ocean, land (plains), forest, mountain, desert, arctic. Store the terrain data in SQLite — ocean hexes don't need per-cell storage, continental interiors can be stored as ranges.

Also generate the res 4 terrain data (~1,770 km² per hex) in the same pipeline and store it, even though the game doesn't use it yet. This avoids re-running the GIS pipeline in Phase 3 and validates that the res 1 → res 4 parent-child mapping works correctly. The res 4 data sits in the database unused until Phase 3.

Render the global map with basic terrain coloring, smooth pan and zoom, and a minimap for orientation. At ~842 total hexes with roughly 250–350 land hexes carrying game logic, this is well within the rendering performance budget.

**AI architecture impact:** The global map is a significant jump from the 271-hex prototype in geographic scope but a modest jump in hex count. The pre-computation layer should scale comfortably — at ~842 hexes, even assessing every hex is fast. Measure pre-computation time to confirm.

**Playtest hypothesis:** Looking at the map, you should immediately recognize the Earth's continents and major geographic features. The terrain distribution should create obviously interesting strategic geography — chokepoints at Central America and the Middle East, defensible mountain ranges, critical naval passages like Gibraltar and Suez. Pre-computation on the global map should complete in under 1 second.

**Learning focus:** PostGIS-to-H3 data pipeline at both resolutions. Efficient Canvas rendering of hex grids with terrain. Validating the res 1 → res 4 parent-child relationship in H3.

**Community:** Start a Discord server and post your first devlog entry — "building a global hex map from real geographic data." The GIS-to-game pipeline is visually interesting content that will attract technically-minded followers even before you have gameplay to show.

### Milestone 1.3 — Fog of War and Subjective Views

*Historical writeup. Live vision radii are infantry 1, armor 2, naval 2, air 3 (`VISION_RANGE_BY_UNIT_TYPE`), not own-hex-only.*

**Build:** Implement per-player visibility. Each player can only see hexes where they have units — ground units (infantry, armor) and naval units see **only the hex they occupy**, with no adjacent-hex vision. The map outside visibility is either unexplored (never seen — rendered dark) or last-known (previously seen but not currently visible — rendered dimmed, showing terrain but not current enemy units). Each player's game state in SQLite tracks their own subjective knowledge.

This own-hex-only model means fog of war is thick by default. Players are blind beyond their front line. Extended visibility comes exclusively from air units (added in milestone 1.5), which see a 3-hex radius around their base airport. This deliberate separation — ground units see nothing beyond their hex, air units see deep — makes air reconnaissance a transformative strategic asset rather than an incremental improvement over existing unit vision. In milestone 1.3, before air units exist, players must push units forward to discover the map, creating genuine exploration tension.

**AI architecture impact:** This is where the `confidence` and `lastSeen` fields in the tool responses become meaningful. The pre-computation layer filters through the AI's subjective view — assessments can only reference enemies the AI has actually seen, with staleness information. The briefing format gains a new dimension: distinguishing between confirmed enemy positions and last-known positions. The callback event `threat_escalation` should fire when a previously unseen enemy appears in a unit's visibility range (new contact), even if the AI didn't explicitly subscribe to it — add `new_contact(unitId)` to the mandatory override list.

**Playtest hypothesis:** Fog of war transforms the game from a puzzle into a contest of information. With own-hex-only vision, you should feel genuinely blind about enemy movements beyond your front line. Pushing a unit forward to scout should feel risky and valuable. You should experience genuine surprise when you discover the AI's forces by moving into their hex. The AI's briefing should clearly distinguish confirmed vs. stale intelligence, and the AI should reason about uncertainty — sending scouts, hedging its deployments, avoiding overcommitting based on incomplete information. The thick fog should make milestone 1.5's air reconnaissance feel like a game-changing upgrade when it arrives.

**Design note:** The subjective-view architecture is also the foundation for multiplayer. Each player's state is already isolated and independent.

### Milestone 1.4 — Economy and Production

*Historical writeup. Live costs are 20/40/100/60; Small caps are 12/8/8/6. See combat-rules §2.*

**Build:** Add the production system. The production resource is **res4 urban hex count** per territory — each res1 hex generates production points per turn equal to its res4 urban hex count. This is a production *rate*, not a consumable stockpile — the urban hex count doesn't decrease from building units, only from air strikes (milestone 1.5). Points accumulate toward the cost of the queued unit across multiple turns; when accumulated points meet or exceed the unit cost, the unit spawns. Excess production carries over to the next unit in the queue.

Unit costs: 10 (infantry), 20 (armor), 50 (naval). Excess production carries over immediately to the next unit in the queue, and a hex produces as many units per turn as its production rate and unit caps allow. Examples: a hex with 5 urban hexes produces 1 infantry every 2 turns. A hex with 15 urban hexes and a seaport queues a naval unit followed by an infantry: the naval unit spawns on turn 4 (15 × 4 = 60 ≥ 50) with 10 points left over, which immediately covers the infantry cost (10), so both spawn on turn 4. Naval units can only be launched from hexes with seaports.

Unit caps for the base three types: 10 infantry, 5 armor, 5 naval (20 total). Air units are not available yet — they are added in milestone 1.5, where caps become 10/5/5/3. Production is local (per-hex pooling, not global). Territorial control changes when any enemy unit enters a hex.

Hex label format: `N1c / N2t` (urban hex count / turns to next spawn), with exceptions for unexplored (no label), lost control (`N1c / ?t`), nothing enqueued (`N1c`), and unit-capped state (∞ symbol).

**AI architecture impact:** The pre-computation layer adds economic data to the briefing — current resources per territory, production queue status, available build options with costs and build times. The LLM issues production orders through its response JSON alongside unit orders (e.g., `{ "action": "build", "unitType": "armor", "productionHex": [...] }`). No new ad-hoc tools are needed — production decisions are strategic, not exploratory, and the briefing provides all the information the LLM needs to decide what to build and where. Production completion is a natural callback event: add `production_complete(unitType, hexId)` to the event vocabulary.

**Playtest hypothesis:** Resource scarcity forces meaningful trade-offs. The production system should make the early game feel different from the late game. The AI should make reasonable production decisions — building units appropriate to its strategic situation rather than randomly or always building the most expensive option.

### Milestone 1.5 — Air Power and Infrastructure Destruction

*Historical writeup. Live air cost is 60; Small cap is 6 air. Vision is not exclusive to air (see 1.3 note).*

**Build:** Add the **air unit** as the fourth unit type and implement the **infrastructure destruction** system. This is the major roster expansion for the global level. Unit caps expand to: 10 infantry, 5 armor, 5 naval, 3 air (23 total). If playtesting shows 23 units degrades LLM briefing quality, fall back to 8/4/4/2 (18 total).

**Air unit mechanics:**

1. **Base-dependent.** Air units can only be built at and based from hexes with airports. Production cost: 30 urban hexes (a starting value, between armor at 20 and naval at 50 — subject to playtesting). They do not occupy the hex in the way ground units do — they are co-located with the airport.

2. **3-hex visibility.** Each air unit grants continuous visibility in a 3-hex radius around its base airport, including terrain, occupying units, build queues, and infrastructure status. This is the strongest reconnaissance asset in the game, making airport placement a critical strategic decision.

3. **Strike capability.** Air units can strike any hex within their 3-hex radius during the air strike phase (before ranged, before movement). No incremental movement — they project force from their base. They can target enemy units, urban hexes, airports, or seaports. Each target type has different counter-fire risk (see combat rules §8).

4. **One action per turn.** An air unit may strike or ferry, never both. This forces a meaningful choice between repositioning and attacking.

5. **Ferry movement.** Air units can relocate up to 4 hexes between airports in owned hexes. Ferry range (4) is longer than strike/visibility range (3) because ferry destinations don't require reconnaissance — a player always knows where their own airports are. The constraint is ownership and an intact airport, not visibility. If the destination airport is destroyed or captured during resolution, the ferry aborts to the origin. If the origin is also lost, the air unit is destroyed. Air units cannot be intercepted in transit (see combat rules §6).

6. **Fragile.** Defense 1 — the lowest in the roster. Destroyed if an enemy ground unit enters the base airport hex. No melee participation.

**Infrastructure destruction:**

1. **Permanent.** Destroyed urban hexes, airports, and seaports do not rebuild. This is a scorched-earth system — the attacker permanently degrades the value of territory they might later want. Players may also strike their own infrastructure to deny it to an advancing enemy (see combat rules §6).

2. **Urban hex strikes** destroy 3 res4 urban hexes per hit (capped at remaining), permanently reducing a territory's per-turn production rate. Low counter-fire risk (17%). Sustained strikes can cripple or halt production entirely.

3. **Airport strikes** destroy the airport and all co-located enemy air units. High counter-fire risk (33%) due to AA defenses. This is the primary air-vs-air mechanism.

4. **Seaport strikes** permanently prevent naval production/launch from that hex. Low counter-fire risk (17%).

**Resolution sequence update.** The combat resolution procedure gains two new phases. The full five-phase sequence is: air strikes (pre-move) → ranged (pre-move) → ground/naval movement → ferry movement (with abort check) → melee (post-move). See the combat rules document (v3.0) for full details.

**AI architecture impact:** The pre-computation layer adds air-specific assessments to the briefing: air unit visibility coverage, available strike targets within range (units and infrastructure) with counter-fire risk estimates, ferry options, and airport vulnerability status. The LLM issues air orders through the response JSON: `{ "action": "air_strike", "targetHex": [...], "targetType": "airport" }` or `{ "action": "ferry", "destinationAirport": [...] }`. The `infrastructure_destroyed` callback event fires when any infrastructure is destroyed, giving the AI awareness of the scorched-earth landscape even on turns it wasn't consulted.

The briefing format gains an air operations section:

```
AIR OPERATIONS:
| Air Unit | Base Airport | Visibility Coverage | Strike Targets in Range |
|----------|-------------|--------------------|-----------------------|
| air-1 | [12.4,12.1] | 37 hexes | [2.1,0.5] units (2×inf+1×armor, 50%hit, counter-fire: armor@att3), airport at [10.5,9.9] (50%hit/33%risk) |
| air-2 | [4.0,21.5] | 37 hexes | No targets in range |

INFRASTRUCTURE STATUS:
• Airport at [12.4,12.1]: intact, 2 air units based
• Airport at [-3.1,0.6]: intact, unoccupied
• Seaport at [8.2,4.3]: intact
⚠ Enemy air unit at [human-airport] has your seaport at [8.2,4.3] in strike range
```

**Playtest hypothesis:** Air units should create a new strategic layer that changes how the game feels. Specifically:

- **Airport placement matters.** Building an air unit is only the start — where you base it determines your visibility and strike coverage. Repositioning via ferry should feel like a deliberate strategic commitment, not a routine move.
- **The infrastructure destruction trade-off is real.** You should experience genuine hesitation before ordering an urban hex strike on a territory you plan to capture — every urban hex you destroy permanently slows the production rate at that territory, for you too. The scorched-earth dynamic should produce moments where the AI (or you) deliberately choose not to destroy infrastructure because the long-term production cost outweighs the short-term military advantage.
- **Air defense is a ground problem.** Keeping infantry or armor at your airports should feel essential, not optional. Losing an undefended airport to a ground incursion — and the air unit with it — should be a memorable lesson.
- **The AI reasons about air power distinctly.** Read the AI's strategy field. Is it making deliberate choices about what to strike vs. what to preserve? Is it defending its own airports? Is it using air visibility to inform ground maneuvers?

**LLM comprehension test:** The air unit introduces the most complex decision space in the roster: base placement, strike target selection (four target types with different risk profiles), ferry timing, and the strategic calculus of permanent destruction. Play several games and verify the AI handles this complexity. If the AI consistently makes poor air decisions (always striking the highest-risk target, never ferrying, ignoring airport defense), simplify the briefing's air section before adjusting the mechanics.

**Terrain interactions at global scale (if playtesting demands).** If playtesting reveals that the flat movement model makes the real-Earth map feel insufficiently geographic — if the Alps don't slow armor, if forests don't favor infantry — introduce terrain combat modifiers: armor attack/defense reduced in mountain/forest hexes, infantry defensive bonus in forest, desert and arctic movement penalties. These would interact with air power — an armor unit weakened by mountain terrain becomes a more attractive air strike target. Do not introduce terrain modifiers preemptively; add them only when the game feels wrong without them.

**Upgrade Tool 1 (conditional on terrain modifiers):** If terrain modifiers are introduced, BFS upgrades to A* with terrain-weighted movement costs. Tool 2 gains terrain modifier information. Tool 3 applies terrain combat modifiers. These changes are internal — the tool interfaces don't change, and the briefing format absorbs the new data naturally. Tool 3 also gains air strike estimation (target type selection with counter-fire risk) regardless of terrain modifiers.

**Update the combat rules document.** The combat rules document has been updated to v3.0 to reflect the four-unit roster, five-phase resolution sequence, infrastructure destruction system, air operation rules, sealift mechanics, and tactical game rules.

**Update the MCP tools spec.** Tool 2 (assess_unit and assess_hex) gains air-specific fields: visibility coverage, strike range, based-at-airport status. Tool 3 (estimate_combat) gains air strike estimation with target type and counter-fire risk. Tool 5 (standing orders) does not apply to air units — air actions are per-turn decisions, not persistent orders, because the one-action-per-turn constraint makes standing orders less useful (you can't set "always strike hex X" without also committing the unit to never ferry).

**External playtesting:** Get your first external playtester. Watch them play without helping. Take notes on confusion, boredom, and engagement. Pay particular attention to: whether air power feels overpowered or underpowered, whether the infrastructure destruction trade-off creates interesting decisions, and whether the global hex scale feels too abstract — if players want to zoom in, that's signal that Phase 3 is high priority.

### Milestone 1.6 — Sealift and Naval Transport

**Build:** Add naval transport mechanics. Naval units can carry land units across water using an explicit cargo assignment model. The `embarkedOn` field on each land unit identifies which naval unit it is assigned to (e.g. `"embarkedOn": "naval-2"`). Explicit assignment was chosen over co-location inference because coastal hexes are passable by both land and naval units, making co-location ambiguous.

**Embark/disembark rules:** Embark requires a seaport (land unit and naval unit must be in the same hex with a seaport; water seaports must be controlled by the acting player). Human players debark manually at any coastal hex or controlled water seaport (stack popup or sealift slot `(none)`). Auto-assignment on embark uses armor-priority ordering; players can reassign via the stack popup UI; the LLM assigns via the order format.

**LLM auto-debark:** When an opponent land unit with an `embarkedOn` assignment receives an independent movement order (`explicit_move`, `disembark`, or standing-order march expansion at Ready), the engine clears cargo as a pre-step before applying the move. Human players cannot bypass manual debark.

**Combat while embarked:** Embarked units can participate in melee on coastal hexes but cannot use ranged attacks. On water hexes, embarked units are pure cargo and cannot participate in combat.

**Transport loss:** If a naval unit carrying cargo is destroyed, all embarked units are destroyed with it (fatal transport loss), regardless of terrain. Manually debarked co-located land units survive because they no longer have an `embarkedOn` assignment.

**AI architecture impact:** The briefing format gains a transport section showing which naval units carry cargo, embark/disembark options at current positions, and nearby seaports. The LLM issues embark/disembark and cargo reassignment through the order format. Add sealift-specific fields to the `assess_unit` output for naval units (current cargo, available capacity, nearby embark/disembark points).

**Playtest hypothesis:** Sealift should make naval units more strategically important — they're not just for sea control and coastal bombardment, they're the only way to move land forces across water. Amphibious operations should feel like deliberate, high-commitment maneuvers. The AI should use sealift to open second fronts or reinforce threatened coastlines, and should protect loaded transports as high-value assets.

### Milestone 1.7 — Game Scenarios and Win Conditions

*Version 3.4 note: the live build has one scenario, `region_vs_region`, where each player picks a home instead of choosing a preset scenario ([region-vs-region.md](region-vs-region.md)). The contained regional conflict proposed below arrived in milestone 2.5 as the regional game, on its own higher-resolution maps rather than as a fenced-off area of the global map.*

**Build:** Create 2–3 preset scenarios on the real-Earth map: a contained regional conflict (e.g., European theatre — limit the playable area to ~50–80 global hexes), a two-front global scenario, and a free-play sandbox. Each scenario defines starting territories, forces, production centers, airport and seaport locations, and victory conditions. Add a scenario selection screen and a basic end-game summary showing territory control over the course of the game.

Scenarios should vary in how much infrastructure is available at start — a scenario with few airports makes air power scarce and valuable; a scenario with many airports makes air superiority a central strategic concern. This lets you test air balance across different setups without changing the rules. Include at least one scenario with significant water separating the two sides to exercise sealift mechanics.

**AI architecture impact:** Different scenarios may warrant different callback sensitivities. A fast-paced regional conflict might need more frequent LLM consultation than a sprawling global scenario where fronts are stable for many turns. Consider making the deadman timer (currently 5 turns) scenario-configurable. The end-game summary should include AI consultation statistics — how many times the AI was consulted, what events triggered consultations, total API cost for the game, and infrastructure destroyed by each side. This is interesting data for the player and essential data for you.

**Playtest hypothesis:** At least one scenario produces a consistently engaging 60–90 minute game experience with a beginning, middle, and end. When you finish a game, you want to play again with a different strategy. The scorched-earth dynamic should produce noticeably different end-game maps across playthroughs — some games end with infrastructure mostly intact (careful players), others with devastated territories (aggressive air campaigns).

**This is your vertical-slice milestone** — the point where you have a genuinely shippable game. Everything from here forward is expansion and polish.

---


---

## Phase 2: Tactical Battles (Milestones 2.1–2.6)

**Goal:** Add the optional tactical battle layer and session persistence. The tactical battle layer at H3 res 4 lets players zoom into contested res1 hexes and fight division-scale battles on ~343 child hexes, or skip them and resolve via standard strategic dice rolls. The strategic game pauses while a tactical battle is in progress. This is the Total War model: optional zoom-in battles that enhance the strategic game without being required. Save/load comes last in this phase so it can handle both strategic and tactical game state from the start.

*Version 3.4 note: Phase 2 now also holds two milestones built after 2.4: 2.45 (playtester UI fixes) and 2.5 (regional game and rules enhancements). Save/load moves to 2.6 and still comes last, so it covers strategic, tactical, and regional state from the start.*

**Why Phase 2 and not later:** UI, sound, and art design are more effective when applied to the complete gameplay experience rather than an incomplete slice. Polishing the strategic game first and then retrofitting polish onto the tactical layer means doing presentation work twice. Building all gameplay systems first — then polishing everything in one pass — is more efficient and produces a more cohesive result.

**What you'll have at the end of Phase 2:** The complete game at both strategic and tactical levels, on the global map and on regional maps, with session persistence, but pre-polish. All gameplay mechanics are in place and playable. The game looks and sounds like a developer build — functional but not presentable.

**Critical prerequisite:** Phase 2 begins only when the global-level game from Phase 1 is stable, fun, and has at least one external tester's confirmation. The tactical layer adds significant complexity; the base game must be solid. If Phase 1 playtesting reveals that players never express a desire to "zoom in" — if the global level is satisfying on its own — consider skipping directly to Phase 3 (polish) and deferring tactical battles to post-launch.

**Design decisions already resolved:** Several questions that would normally require prototyping have been answered during design:

- **Unit relationship:** Multiplication. Strategic units decompose into fixed-ratio sub-units (infantry ×8, armor ×4, air ×3, naval ×4). No separate tactical roster. No open design question.
- **Entry-side injection:** Sub-units appear at the res4 edge corresponding to the direction the parent strategic unit entered the res1 hex. The engine already tracks hex-side crossing during strategic movement.
- **Visibility:** Universal. No fog of war at the tactical level. Both sides see everything.
- **Turn structure:** WEGO simultaneous resolution at the tactical level — the same model as the strategic game. Both sides commit orders, then all orders resolve at once. This maintains identity consistency across zoom levels and eliminates the reactive advantage IGOUGO would give human players over the LLM opponent.
- **Bail-out:** Player can exit at any time. Remaining forces resolve via dice rolls with modifiers calibrated so that an immediate bail-out produces results similar to strategic resolution. No exploit loop.

These resolved decisions significantly reduce Phase 2 risk and scope compared to earlier estimates that included open-ended prototyping of the unit relationship model.

### Milestone 2.1 — Tactical Rendering and Zoom Transition

**Build:** Implement the zoom transition from a contested res1 hex to its res4 child hexes. When opposing units share a res1 hex after strategic resolution, the UI presents a "Fight Tactical Battle" button. Clicking it zooms smoothly into the res4 hex grid with terrain data (already generated and stored since milestone 1.2). The tactical view renders with finer terrain detail — at ~42 km per hex, terrain types that were aggregated at global level now show distinct features: mountain passes through ranges, coastal approaches, forested regions within a broadly "land" global hex.

Build the zoom-in and zoom-out transitions, the tactical-level rendering path, the UI state management for tracking that the strategic game is paused, and a "Return to Strategic" button. The terrain should be visually readable at a glance — the player needs to see movement obstacles and ranged-fire lanes without studying a legend.

Place sub-units on the map using entry-side injection. Implement the multiplication ratios (infantry ×8, armor ×4, air ×3, naval ×4) and position sub-units at the appropriate res4 edge hexes based on the parent unit's recorded entry side.

**Playtest hypothesis:** The zoom transition should feel like assuming a different level of command — like a general leaning over a regional map after studying the global one. The terrain at res 4 should reveal geographic detail that was invisible at res 1: the Strait of Gibraltar as a narrow passage, the Swiss Alps as a barrier with passable valleys, coastal approaches that invite flanking maneuvers. Entry-side injection should visually confirm strategic positioning decisions — approaching from two sides should look like a two-pronged advance on the tactical map.

### Milestone 2.2 — Tactical Movement and Combat

*Historical writeup. Live tactical ranged baselines are infantry 2, armor 5, naval 10. Mountain LOS and terrain MP modifiers are implemented. See combat-rules §12.*

**Build:** Implement the tactical gameplay systems: movement budgets with terrain costs, ranged combat, and melee resolution.

**Movement:** Each sub-unit has a per-turn movement budget consumed as it traverses res4 hexes. Terrain modifies movement cost by unit type (see combat rules §12.4): infantry traverses all land but is slowed by mountains and forests; armor is blocked by mountains, arctic, and wetlands, and slowed by forests and coastal terrain; naval is restricted to water and coastal hexes. Starting movement budgets (res4 hexes per turn on flat terrain): infantry 2, armor 4, naval 3. Air sub-units do not use the movement system — they can strike anywhere in the res1 hex.

**Ranged combat:** All unit types gain ranged attack at the tactical level, reflecting the finer geographic scale: infantry 5 hexes, armor 10 hexes, naval 20 hexes, air unlimited within the res1 hex. Ranged attacks use the same A&A-style dice resolution as strategic combat (roll d6, hit if ≤ attack value). Counter-fire applies if the target has range to reach the attacker. Ranged attacks are not blocked by terrain — line of sight is not modeled. This is a deliberate simplification; terrain-blocked LOS can be added later if playtesting reveals it adds meaningful depth.

**Melee:** Sub-units sharing a hex resolve melee using the same A&A-style dice as strategic melee.

**Turn structure:** WEGO simultaneous resolution, consistent with the strategic level. Each tactical turn: both sides issue movement and ranged attack orders → air strikes resolve → ranged resolves (both sides fire simultaneously; counter-fire applies) → all sub-units move simultaneously → melee resolves for shared hexes → casualties removed. This is the same five-phase sequence as the strategic game (minus the ferry phase), running on sub-units instead of strategic units.

**Playtest hypothesis:** Tactical combat should feel meaningfully different from strategic resolution while retaining the same core rhythm of plan-commit-resolve. Terrain should create interesting approach problems — armor can't cross those mountains, so infantry needs to clear the pass. Ranged fire should create standoff dynamics where positioning matters. The WEGO structure should produce the same suspenseful moment of resolution as the strategic game — you commit your tactical maneuvers, the AI commits its, and you see what happens.

### Milestone 2.3 — Bail-Out Resolution and AI Tactical Play

*Historical writeup. Live voluntary exit uses strict less-than-half parent elimination with no extra dice pass. The LLM has no bail-out action.*

**Build:** Implement the bail-out system and the AI's ability to play tactical battles.

**Bail-out:** When the player clicks "Return to Strategic," the remaining sub-units on both sides resolve automatically via dice rolls with bail-out modifiers. The modifiers are calibrated so that an immediate bail-out (no tactical combat has occurred) produces results approximately equivalent to the standard strategic engagement from combat rules §4–§5. As tactical losses accumulate before bail-out, the modifiers matter less — the attrition already taken dominates the outcome. The modifier formula must be simple enough to summarize to the player: "remaining forces fight it out with a slight defender advantage."

**Sub-unit-to-strategic mapping:** After a tactical battle ends (decisive victory or bail-out), surviving sub-units map back to parent strategic units using a proportional threshold: if more than half of a strategic unit's sub-units survive, the strategic unit survives at full strength (strategic units are binary — alive or dead). If half or fewer survive, the strategic unit is destroyed. The threshold is a playtesting variable.

**AI tactical play:** When the AI participates in a tactical battle (as the opponent of a human who chose to fight tactically), the LLM receives a tactical briefing with the full res4 grid state, all sub-unit positions (universal visibility), terrain, and available actions. The briefing follows the same design principles as strategic briefings but at tactical scale. The AI's tactical decision space is bounded by universal visibility (no scouting uncertainty), fixed multiplication ratios (no force composition decisions), and the same A&A dice mechanics.

If the LLM struggles with tactical-level reasoning (too many sub-units, too many hexes, too many decisions per turn), the response hierarchy is: first reduce multiplication ratios, then simplify the terrain matrix, then make the AI auto-resolve and restrict tactical play to human-vs-engine only.

The AI may also choose to bail out of a tactical battle if it determines continuing is disadvantageous.

**Playtest hypothesis:** The bail-out system should feel fair — a player who fought well tactically before bailing should see a better result than one who bailed immediately. The AI should make reasonable tactical decisions: advancing toward objectives, concentrating fire, using terrain advantages. If the AI's tactical play is noticeably weak but its strategic play is strong, that's acceptable — the tactical layer is optional and the AI can bail out when it's losing.

### Milestone 2.4 — Tactical Integration and Balance

**Build:** Full integration pass. Tactical battles triggered from all scenario types. Bail-out resolution verified against strategic resolution for consistency. Test edge cases: tactical battle with only air units, tactical battle where one side has naval and the other doesn't, tactical battle where all units entered from the same side.

Balance pass on: multiplication ratios (do 8 infantry sub-units produce interesting maneuver?), movement budgets (does it take the right number of turns to cross the battlefield?), ranged attack values (do standoff dynamics emerge?), and the bail-out modifier formula (does immediate bail-out ≈ strategic resolution?).

Ensure scenarios from milestone 1.7 work correctly with tactical battles available. The end-game summary gains tactical battle statistics: how many were fought, how many were bailed out of, average sub-unit losses per battle.

**Playtest hypothesis:** A complete game using both strategic and tactical layers should feel richer than the strategic-only experience, not more tedious. The tactical battle should be something you want to use when you have a positional advantage or want finer control, not something you feel obligated to engage with every time. If players consistently skip tactical battles, the tactical layer needs more compelling differentiation from strategic resolution — but that's a balance problem, not an architectural one.

### Milestone 2.45 — Playtester UI Fixes

*Added in version 3.4. Built in September 2026, after 2.4. Status: complete.*

**Build:** Work through a round of external playtester feedback on the 2.4 build. The fixes covered map clicks and selection (double-click planning and deselect, clicks during resolution playback), Shift as the multi-select modifier, opening unit placement, ranged-attack button visibility, build-queue seeding and failed queue edits, toasts and tooltips during playback, the Model tab across match start and end, Escape in the tactical battles list, the tactical ferry movement list, and the tactical phase label and exit control during playback. The same pass wrote the UX specification suite under `doc/ux/`, one page per surface, so later UI work has a written contract to check against.

Two feedback items were deferred to the design backlog rather than fixed: port-to-port land travel rules and automatic build planning.

**Playtest hypothesis:** A returning playtester can plan and resolve turns without the selection and dialog traps that caused most of the frustration in earlier sessions.

### Milestone 2.5 — Regional Game and Rules Enhancements

*Added in version 3.4. Built in October 2026 and shipped as engine 2.5.0. Status: complete. Save/load, previously numbered 2.5, is now 2.6.*

**Build (regional game):** A second way to play. A regional match is the global game on one regional map, with that map's resolutions and economy numbers. Everything else is the same rulebook.

- **Maps.** 23 maps drawn from UN subregions. Some subregions are split into two maps (Northern, Middle, and Eastern Africa, and Southern Asia) or trimmed (Western Asia, Northern Europe, Northern America). Melanesia, Micronesia, Polynesia, Antarctica, and the Sahel are excluded. Each map has about 240 to 470 strategic hexes, of which about 120 to 310 are land; the rest is sea rings and, on three maps, neutral border. Strategic hexes are H3 res2 or res3. Battles are three levels down, at res5 or res6. Maps are tiered Strong, Passable, or Weak by expected fun. Eastern Asia is the recommended pilot ([region-summary-1.md](region-summary-1.md)).
- **Sides.** The human and the AI each pick a side group, a named group of provinces, on a new Regional tab in the new-game dialog. The two groups must differ. Side groups are the homes for the `region_vs_region` win check. On a regional map a control win needs controlled enemy-home hexes holding at least 75% of that home's generated urban cells. The global map still needs every enemy home hex. Land outside the two groups is neutral, as in the global game. A saved match whose side groups no longer exist fails with a clear message.
- **Per-map economy.** Each manifest's `economy` block holds that map's costs (one scale per map, keeping the global 1:2:5:3 price ratio), build minimums, Advanced tech threshold, and urban cells destroyed per strategic air-strike hit. The pipeline writes those integers. The match reads the manifest.
- **Origin areas and flags.** On a regional map, units take their name, flag, and origin bonus from admin-1 provinces, Natural Earth regions, or whole small countries instead of countries alone. Sub-national flags are SVGs from Wikimedia Commons with recorded attribution, falling back to the national flag.
- **Neutral-border hexes** (Western Europe, Western Asia north, South-Eastern Asia). They can be entered and held, produce nothing, accept no build queue, and cannot base air.
- **Data and loading.** A regional pipeline (`scripts/regional_pipeline/`) generates one pack per map. The installer ships zipped packs. The first play of a region extracts only that region, and a clean launch reads no terrain files until a match loads. SQLite grid objects are renamed `res_s_` and `res_t_`, and code reads resolutions from the active map. The match records its map in `game_config` as `game_map_id`.
- **Map extent.** Pan and zoom stop at the loaded map's bounds, on the main map and the minimap.
- **Calendar.** A regional turn is one week, starting on the 1st of the chosen month. A global turn stays one month.

**Build (enhancements built alongside, both modes):**

- **d20 combat.** Combat moved from d6 to d20. Hit numbers have a floor of 2 and a cap of 17 (combat rules §1, §4.9).
- **Four optional bonuses,** each Off, Low, or High, all defaulting to Low:
  - Origin bonus (formerly "country bonus"). Units carry a birth area and a flag, and fight better at home.
  - Terrain bonus. Tactical only. Units fight better on their birth terrain kind.
  - Weather bonus. Each hex gets monthly climate weather (mild, rain, snow, heat) from a chosen starting month. Units are tagged by their birth climate, and untagged units are slowed or lose attack.
  - Tech bonus. Units are Basic or Advanced by the urban count of their birth hex.
- **Strategic terrain rules.** Armor that enters a rugged, arctic, or city hex ends its move there. City and rugged hexes add strategic cover.
- **Battle size.** Battles add three rings of neighboring tactical cells around the core 343. On a regional map, a margin cell whose strategic hex is off the map is left out. Sub-unit counts are infantry 8, armor 4, air 3, naval 4.
- **AI.** OpenRouter structured output with a reasoning-effort selector, model labels that list reasoning levels, a fixed consultation round shape that adapts to each model's tool support, `estimate_combat` and `assess_unit` in battles, and no restart of the AI's background planning on every draft edit.
- **UI and feedback.** A UI facelift, dice chips and destroyed-unit playback during resolution, weather and tech icons on the strategic map, control tooltips, a reworked new-game dialog with a live map preview and a collapse button, and the game date on the turn line.
- **Code health.** Codebase consolidation and source-file decomposition to the 1,000-line hard limit.

**Out of scope (open issues in [region-summary-1.md](region-summary-1.md), not scheduled):** the shoreline-wetlands classifier, the forest-before-mountain classifier order, urban data quality (the scalerank filter), per-unit price scales, port and airport counts at regional resolutions, and EarthEnv 1 km topography for res6 maps. Side groups pass ±25% of an equal urban share, and a regional control win is the 75% urban-cell share above.

**AI architecture impact:** The prompts take resolutions, costs, thresholds, and strike damage from the active map. The turn line and briefing name the date. Bonuses appear in tool output, the briefing Bonus cell, and the combat rules paragraph only while their option is on. Regional maps carry no more land hexes than the global map's playable land, so pre-computation and briefing size stay inside what was already measured.

**Playtest hypothesis:** A match on a Strong-tier map, starting with Eastern Asia, plays to a decision in fewer turns than a global match, with terrain that channels movement and cities worth fighting over. The bonuses make where a unit was born and when it fights matter, without the AI losing track of them.

### Milestone 2.6 — Save/Load and Session Management

*Numbered 2.5 before version 3.4. Status: not started.*

**Build:** Full save and load. Since game state is in SQLite, this is largely about serializing the complete database state — including per-player subjective views, pending orders, AI memory, standing orders, active callback subscriptions, infrastructure state (which urban hexes/airports/seaports have been destroyed), embarked cargo assignments, tactical battle state (sub-unit positions, tactical turn count, which res1 hex is in tactical mode), and turn counter — to a save file and restoring it cleanly. Auto-save at the start of each strategic turn and at the start of each tactical turn. Add turn replay: step through any previous turn's resolution, including the AI's briefing and response for turns where it was consulted.

*Added in version 3.4:* milestone 2.5 widened the state a save must carry.

- **Map identity.** `game_map_id` and the map's resolutions. Loading a regional save must load that region's pack, extracting it if needed, and apply its map extent before the snapshot draws.
- **Match settings.** Game size, fog, the four bonus levels, and the starting month. The calendar, weather, and tech tiers derive from these.
- **Per-unit identity.** Origin area, birth hex, birth terrain, weather tags, tech tier, and formation date.
- **Battle footprint.** A saved battle includes the margin rings that were on the map when it started, and the sub-units placed at entry, so voluntary exit keeps using the counts placed at the start. A margin cell whose strategic hex is off a regional map is not in a new battle.
- **Save format version.** Today a schema change discards the in-progress match without migration. Saves need a version number and a stated policy for older saves, or every schema change will silently break a player's save list.

**AI architecture impact:** The callback subscription state must be persisted and restored. On load, the engine must re-evaluate whether any callback conditions are already satisfied in the loaded game state (e.g., if the game was saved mid-crisis, the loaded state might immediately trigger a consultation). AI strategic memory (Tool 4) is already in SQLite and persists naturally. If the game is saved mid-tactical-battle, restoring it must resume the tactical battle at the correct sub-unit positions and turn state. Decide before writing the serializer whether a save must hold more than one AI opponent (milestone 3.3). Settling that scope now avoids a save-format change later.

**Playtest hypothesis:** You should be able to close the game mid-session — whether during strategic play or mid-tactical-battle, on the global map or a regional one — reopen it days later, and resume with full context. The turn replay with AI briefing review should help you remember your strategic situation.

---

## Phase 3: Polish and Depth (Milestones 3.1–3.5)

**Goal:** Transform the functional game into something you'd be comfortable showing to the public. All gameplay systems — strategic combat, air operations, sealift, and tactical battles — are in place. This phase applies art, sound, UI, AI personality, diplomacy, and multiplayer to the complete experience in a single cohesive pass. No presentation work has been done yet; no presentation work will need to be redone.

**What you'll have at the end of Phase 3:** An Early Access-ready game with a polished UI, competent AI opponents with distinct personalities, AI transparency features, scenario variety, sound design covering both strategic and tactical gameplay, and enough depth to sustain a community of early players.

**Community:** Before starting Phase 3, set up your Steam page ($100 Steamworks account) and start accumulating wishlists. Post the GitHub repository with your first playable build. Begin regular devlog updates. The hybrid AI architecture — LLM strategic reasoning with event-driven consultation — is a unique technical story. Lead with it.

### Milestone 3.1 — Art Direction and UI Overhaul

**Build:** Commit to your visual style and implement it consistently across both strategic and tactical views. Recommended: clean military-cartographic aesthetic — NATO APP-6 unit symbols, muted topographic terrain palette, clear sans-serif typography, restrained color accents for player identification and alerts. Implement proper UI panels: collapsible sidebar for unit details, top bar for turn info and resources, bottom bar for orders and notifications. Keyboard accelerators for common actions.

The tactical view needs its own UI treatment: sub-unit markers that are visually distinct from strategic unit markers (smaller, more numerous, same type symbology), terrain coloring that reads at a glance, movement range indicators, and ranged-fire arc displays. The zoom transition should be polished in this milestone — smooth animation, appropriate camera behavior, clear visual cues that you've entered tactical mode.

**AI architecture impact (UX for AI wait states):** This is the milestone where you implement the progressive-disclosure pattern for AI thinking time. When the AI is being consulted (event-driven, not every turn), show a brief status indicator: "AI Commander is reviewing the situation..." with sub-status updates derived from the pre-computation layer: "Evaluating northern front... Assessing combat options... Finalizing orders." On turns where the AI is not consulted, show nothing — the standing orders execute silently as part of resolution. This makes the AI's consultation pattern visible as a gameplay signal: the player can learn to read when the AI is rethinking its strategy.

**Playtest hypothesis:** A new player looking at a screenshot — whether of the strategic map or a tactical battle — should immediately understand this is a serious strategy game. The visual distinction between strategic and tactical views should be clear without being jarring. The AI status indicator should feel like intelligence about the opponent, not a loading screen.

### Milestone 3.2 — AI Personality, Difficulty, and Model Routing

**Build:** Implement AI personality differentiation through system prompt engineering and callback configuration. Create at least three distinct AI profiles: cautious/defensive, balanced, and aggressive. Each profile configures:

- **System prompt personality** — strategic doctrine, risk tolerance, aggression level, air power doctrine (aggressive profiles favor infrastructure destruction; cautious profiles preserve infrastructure for potential capture)
- **Callback sensitivity** — aggressive AI subscribes to more frequent `turns(N)` with lower N and lower `threat_escalation` thresholds; cautious AI uses longer intervals and reacts mainly to direct contact
- **Briefing emphasis** — aggressive AI's briefing highlights offensive opportunities and air strike targets; cautious AI's briefing emphasizes defensive vulnerabilities and airport protection
- **Tactical battle behavior** — aggressive AI fights tactical battles to the last sub-unit; cautious AI bails out when losses exceed a threshold

Difficulty scaling works through two levers: the model tier (player selects via their OpenRouter key) and information accuracy (on lower difficulty, combat estimates and threat assessments include a small error margin, simulating worse intelligence).

**Add the AI Observatory.** A panel where players can view: the briefing the AI received on its last consultation, the callback events that triggered the consultation, the AI's response (strategy summary and orders issued), and which turns the AI was and wasn't consulted. This is the transparency feature that no other strategy game offers. Make it a post-game feature initially (review after the game ends), with an option to view the last-turn briefing during play.

**Tiered model routing (optional, scope-dependent):** If the callback system is working well and consultations are infrequent enough, this may not be needed yet. But if cost or latency on larger maps still exceeds targets, implement a simple router: use the player's selected model for event-triggered consultations (the important decisions) and a cheaper model for the deadman-timer consultations (routine check-ins). This is a natural extension of the callback architecture — the event type determines the model tier.

**Playtest hypothesis:** Playing against the aggressive AI should feel noticeably different from playing against the cautious AI — not just in outcomes, but in pacing and texture. An aggressive AI should conduct scorched-earth air campaigns and fight tactical battles aggressively; a cautious AI should preserve infrastructure, use air primarily for reconnaissance, and bail out of tactical battles early when losing. The AI Observatory should be fascinating to read after a game.

### Milestone 3.3 — Diplomacy and Alliances

**Build:** Multi-player support (3+ sides) with a diplomacy layer. Players can propose alliances (shared visibility, non-aggression), declare war, and negotiate peace. AI players make diplomatic decisions through the LLM with diplomatic context added to the briefing. Allied players share fog-of-war visibility. Alliances can be broken.

**AI architecture impact:** Diplomatic events are a natural addition to the callback vocabulary: `alliance_proposed(byPlayer)`, `alliance_broken(byPlayer)`, `war_declared(byPlayer)`. These are high-importance events that should always trigger a full consultation with the player's selected model. The briefing format gains a diplomacy section summarizing current relationships and recent diplomatic actions. The LLM's response format gains a `diplomaticActions` array.

The possibility of AI betrayal — the LLM deciding that breaking an alliance is strategically sound — is exactly the kind of emergent behavior that makes this system compelling. Don't prevent it; surface it in the AI Observatory.

**Playtest hypothesis:** Alliances create genuine diplomatic tension. You should feel uncertain about whether your AI ally will remain loyal.

### Milestone 3.4 — Sound Design and Game Feel

**Build:** Add audio: ambient music (1–3 tracks, licensed or AI-generated with commercial rights), UI feedback sounds, notification sounds. Add visual juice to the resolution phase: brief combat animations, smooth unit movement interpolation, camera auto-pan to significant engagements. Air strike animations should be distinctive — visually and aurally different from ranged combat to reinforce the five-phase resolution sequence.

Tactical battle sound design should be distinct from strategic resolution — when you zoom into a tactical battle, the audio environment should shift to reinforce the change in scale. Sub-unit movement, ranged fire, and melee should each have characteristic sounds. The bail-out transition back to strategic view should have a clear audio cue.

**Playtest hypothesis:** The resolution phase — both strategic and tactical — should feel like watching a story unfold. Sound and animation should make combat outcomes feel impactful — losing a unit should sting, destroying an enemy should satisfy. Infrastructure destruction should feel consequential — not just a stat change, but a visible scar on the map. The shift between strategic and tactical audio should reinforce the sense of zooming into a different level of command.

### Milestone 3.5 — Asynchronous Multiplayer

**Build:** Human-vs-human play via asynchronous turn file exchange. Each player has their own game instance. After submitting orders, the game exports a turn file. All players' turn files are combined and fed into the resolution engine. Each player receives results filtered through their fog of war. LLM players participate alongside humans, each running locally.

**AI architecture impact:** In async multiplayer, each human player's AI opponents run locally with their own callback state and memory. The turn file format must include the AI's orders (generated from standing orders and any triggered consultations) alongside the human's orders. The callback evaluation happens independently on each player's machine.

**Tactical battles in multiplayer:** When two human players' units share a res1 hex, the tactical battle option is available to the player whose turn it is to act (or both players in sequence, depending on the async protocol). For initial implementation, tactical battles in multiplayer may auto-resolve to avoid the complexity of coordinating real-time tactical play across async players. This is a reasonable limitation for launch.

**Playtest hypothesis:** Playing against a human opponent with WEGO resolution and fog of war should feel meaningfully different from playing against the AI.

---

## Phase 4: Ship It (Milestones 4.1–4.4)

**Goal:** Prepare the game for public distribution.

### Milestone 4.1 — Onboarding and Tutorial

**Build:** A tutorial scenario teaching core mechanics through guided play — one concept per turn. Start at the global level; introduce air power after the player is comfortable with ground and naval operations; introduce sealift once basic combat is familiar; introduce the tactical battle option once the player is comfortable with all strategic-level mechanics. Also write a comprehensive reference manual as a searchable HTML document bundled with the game. Include a section explaining the AI system: how LLM opponents work, what the "bring your own API key" model means, how the AI Observatory works, and what the cost expectations are at different model tiers.

**Playtest hypothesis:** A strategy game player who has never seen your game should complete the tutorial and start a real scenario without asking questions.

### Milestone 4.2 — Platform Packaging

**Build:** Production builds for Windows, macOS, and Linux. Proper installers, application signing, auto-update, crash reporting. Steam SDK integration. Standalone GitHub releases. Test on machines that aren't yours.

**Playtest hypothesis:** Someone who isn't you can install and complete a full game on a clean machine.

### Milestone 4.3 — Community Beta

**Build:** Release to your Discord community and content creators. Instrument opt-in analytics: turn time, AI consultation frequency, AI model choices, callback trigger distribution, game length, cost per game, crash reports, tactical battle engagement (how often players fight tactical battles vs. skip them, bail-out rate, average sub-unit losses), air unit usage (strike target distribution, ferry frequency, infrastructure destroyed per game). Run a structured feedback cycle with specific questions.

**AI-specific analytics to capture:** Average consultations per game by scenario size. Most common callback triggers. Average cost per game by model tier and scenario. Distribution of ad-hoc tool calls during consultations (are players' AIs still needing ad-hoc tools, or does pre-computation cover everything?). Tactical battle analytics: do players engage with tactical battles, or do they prefer strategic resolution? How does the AI perform tactically — does it make reasonable maneuver decisions, or do players feel they're fighting a dumb opponent at the tactical level? Air power analytics: what percentage of AI consultations involve air strike decisions? How often does the AI destroy its own future territory's infrastructure? These metrics will tell you whether the hybrid architecture, the tactical layer, and the scorched-earth mechanic are working as intended in the wild.

**Playtest hypothesis:** At least some beta players complete multiple full games voluntarily. Per-game AI cost with mid-tier models should be under $0.25 on standard scenarios.

### Milestone 4.4 — Launch

**Build:** Final polish based on beta feedback. Steam page updates, trailer, description. Simultaneously publish the free standalone build to GitHub releases — the dual-distribution model (free compiled builds on GitHub, paid convenience on Steam) should launch together, not sequentially. Price the Steam version at $15–20 for Early Access. Post-launch, commit to regular update cadence.

**Playtest hypothesis:** Launch week Steam reviews 80%+ positive.

---

## Cross-Cutting Concerns

**Community building** starts at Milestone 1.2 and continues throughout. The hybrid AI architecture is a unique technical story — the "LLM opponent that only thinks when something interesting happens" narrative is compelling for both wargaming and AI audiences.

**Playtesting** happens every milestone from 0.6 onward. External testers by Milestone 1.5. 3–5 regulars by end of Phase 2. Beta targets 20–50 players.

**Source control** uses GitHub from day one. Private repo, issues for tracking work.

**AI prompt engineering** is ongoing from 0.6 onward, but the nature of the work shifts across phases. In the iterative tool-calling architecture, prompt engineering was about teaching the LLM to use tools effectively. In the hybrid architecture, it's about two different things: designing briefings that give the LLM the right information to make strategic decisions, and designing callback criteria descriptions that help the LLM set appropriate triggers. The air unit's decision space (four target types, ferry timing, base defense) is the most complex briefing challenge — invest time in formatting this section clearly. In Phase 2, tactical briefings are a new prompt engineering surface — the LLM must reason about sub-unit maneuver across a ~343-hex grid, which is a qualitatively different challenge from strategic reasoning. Keep a log of prompt iterations and their effects.

**Cost and latency monitoring** is a new cross-cutting concern. From 0.6 onward, every AI consultation should log: trigger event, pre-computation time, prompt token count, completion token count, ad-hoc tool calls, total wall-clock time, and estimated cost. This data is essential for tuning the system and is the foundation for the in-game cost display that BYOK players will expect. In Phase 2, tactical AI consultations are a new cost category — if tactical battles trigger frequent LLM calls, per-game costs could spike. Monitor and consider capping the number of AI tactical consultations per battle.

**Unit roster iteration** is a cross-cutting design concern from 1.5 onward. The global roster (infantry/armor/naval from 1.4, air added in 1.5) follows the standard validation process: start minimal, expand only through playtesting, test LLM comprehension, and ensure asymmetric matchups. The tactical level does not have a separate roster — it uses multiplication of strategic units — but the multiplication ratios (infantry ×8, armor ×4, air ×3, naval ×4) and tactical-level stats (movement budgets, ranged values) are subject to the same playtesting discipline. Resist the urge to add new tactical-only unit types unless playtesting clearly reveals a gap.

---

## Estimated Timeline

Assuming 2-week milestones at 10–15 hours per week:

| Phase | Milestones | Calendar Time |
|-------|-----------|---------------|
| Phase 0 (continued): Hybrid Validation | 0.6–0.7 | 3–5 weeks |
| Phase 1: The Real Game | 1.1–1.7 | 12–16 weeks |
| Phase 2: Tactical Battles | 2.1–2.6 | 8–12 weeks |
| Phase 3: Polish and Depth | 3.1–3.5 | 8–12 weeks |
| Phase 4: Ship It | 4.1–4.4 | 6–10 weeks |

**Total estimated range from current position: 9–14 months to launch.**

*Version 3.4 note: these estimates date from April 2026 and have not been re-baselined. Phase 2 has run from April 11 to October 9, 2026 (about 26 weeks) through milestone 2.5, against an 8–12 week estimate that did not include 2.45 or 2.5.*

Phase 2 (tactical battles) remains deferrable to post-launch if the global-level game is strong enough on its own. If deferred, Phase 3 (polish) follows Phase 1 directly and the range compresses to 7–11 months. That's a legitimate shipping strategy — launch the game that works, expand it once it has an audience. If Phase 2 is deferred, save/load (milestone 2.6) should still be pulled into Phase 1 or early Phase 3, since session persistence is essential for any serious playtesting.

Phase 2 carries significantly less risk than earlier estimates because the key design decisions (unit relationship, visibility model, bail-out mechanic) are already resolved. The highest-risk element is AI tactical reasoning quality — if the LLM can't play tactically at an acceptable level, the fallback is human-only tactical battles with AI auto-resolve, which is still a valuable feature.

Phase 3 benefits from the restructuring: all presentation work (art, UI, sound, game feel) is applied once to the complete game rather than retrofitted after adding tactical battles. This avoids duplicated effort and produces a more cohesive visual and audio identity.

**The next critical checkpoint is after Milestone 0.7.** If the hybrid architecture validates, you proceed with confidence that the game can scale to real-world map sizes without prohibitive cost or latency. If it doesn't, you still have a viable game on small maps with the current architecture — the scope of Phase 1's map ambitions adjusts downward, but the game concept remains sound.