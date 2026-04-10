# Strategic Development Plan: Grand Strategy Wargame with LLM Opponents

*Version 3.2 — April 2026*

---

## Status and Context

Phase 0 milestones 0.1–0.5 are complete. The prototype validates the core concept: LLM opponents playing through MCP-style tool services produce engaging, intentional-feeling play. The AI is challenging by milestone 0.5, tool usage varies interestingly by model, and concurrent AI planning during the human's planning phase keeps small-map games feeling responsive.

Three scaling concerns emerged during Phase 0 that must be addressed before building the production game:

1. **Cost scales with map and unit count.** A small-map game (271 hexes, 10 units) costs $0.04 with Gemini Flash 2.5 — trivial. But expensive models cost 10x that, and medium/large maps push even cheap models toward similar per-turn costs as expensive models on small maps.
2. **Latency scales with the iterative tool-calling loop.** Each tool call is a full inference round-trip. A 5–10 call planning sequence multiplies base latency by 5–10x. On small maps with expensive models, individual turns can take up to a minute even with concurrent planning.
3. **Both problems compound.** On large maps (1,951 hexes, 30 units), the combination of larger state representations, more tool calls, and longer reasoning chains pushes latency and cost to levels that threaten the player experience.

These observations align with every other LLM game AI project's findings. The solution is well-validated: a hybrid architecture where the LLM serves as a strategic advisor consulted on events, while pre-computed analysis and standing orders handle turn-to-turn execution. The existing 5-tool MCP architecture maps cleanly onto this pattern with minimal waste.

This plan begins after milestone 0.5 and incorporates the hybrid AI architecture as a foundational design decision rather than a future optimization.

**Map resolution decision (settled).** The game uses two H3 zoom levels: global (H3 resolution 1, ~842 hexes at ~610,000 km² each) and theatre (H3 resolution 4, ~343 hexes per global hex at ~1,770 km² each, ~42 km edge-to-edge). This was determined by a rendering performance budget of ~400 hexes on screen. Phase 1 builds the complete game at the global level. Phase 3 adds the theatre zoom with the attention mechanic. The earlier goal of 1 km² hex resolution has been set aside — res 4's ~42 km hexes provide division-scale tactical play, which is the right grain for the Axis & Allies-inspired unit interactions in the game vision.

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
| `transport_arrived(unitId)` | unitId: string | A naval transport stack arrives at its destination coastal hex |

**Mandatory override events (always fire, regardless of LLM subscription):**

- Any AI unit participates in combat for the first time since the last consultation (catches surprise contacts the AI didn't anticipate — distinct from `unit_engaged(unitId)` which the AI subscribes to for specific units it's watching)
- Any AI unit is destroyed
- Any AI unit without a standing order exists (newly spawned, order completed, order cancelled by engine)
- An AI unit's standing order enters a blocked or error state
- An AI air unit's base airport is destroyed or captured
- An embarked AI land unit's assigned naval unit is destroyed on a water hex (cargo lost at sea)
- No LLM consultation has occurred for 5 turns (deadman timer)

When no events fire, standing orders execute, the pre-computation layer runs (to update the briefing for the next consultation), and the LLM is not invoked. The AI's per-turn cost drops to zero on quiet turns.

### LLM Output Format (revised)

When consulted, the LLM responds with:

```json
{
  "strategy": "Natural language summary of current strategic thinking",
  "orders": [
    { "unitId": "...", "action": "assign_order", "order": { "type": "march", "destination": [...], ... } },
    { "unitId": "...", "action": "cancel_order" },
    { "unitId": "...", "action": "explicit_move", "destination": [...] },
    { "unitId": "...", "action": "ranged_attack", "targetHex": [...] },
    { "unitId": "...", "action": "air_strike", "targetHex": [...], "targetType": "units" },
    { "unitId": "...", "action": "ferry", "destinationAirport": [...] },
    { "unitId": "...", "action": "build", "unitType": "armor", "productionHex": [...] },
    { "unitId": "...", "action": "embark", "navalUnitId": "..." },
    { "unitId": "...", "action": "transport_move", "navalUnitId": "...", "destination": [...] },
    { "unitId": "...", "action": "disembark", "destination": [...] }
  ],
  "callbacks": [
    { "event": "turns", "params": { "n": 3 } },
    { "event": "unit_arrived", "params": { "unitId": "opponent-armor-1" } },
    { "event": "threat_escalation", "params": { "unitId": "opponent-infantry-2", "severity": "critical" } },
    { "event": "infrastructure_destroyed", "params": { "type": "airport" } },
    { "event": "transport_arrived", "params": { "unitId": "naval-2" } }
  ],
  "memoryUpdates": [
    { "action": "write", "key": "...", "content": "...", "tier": "persistent" },
    { "action": "delete", "key": "..." }
  ]
}
```

Standing orders remain the primary output mechanism. Explicit per-turn movement, ranged attack, air strike, ferry, and transport orders are available for one-off tactical actions. The `callbacks` array replaces the implicit "call me every turn" contract. Memory updates can be bundled into the response rather than requiring separate tool calls, further reducing round-trips.

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

**Goal:** Transform the validated prototype into a real, replayable game on a real-Earth global map with fog of war, a functional economy, four unit types with distinct roles, naval transport for cross-ocean force projection, and enough depth to sustain multiple playthroughs. This is where you stop writing throwaway code and start building the actual codebase. The hybrid AI architecture is foundational — it's not bolted on later, it's built into the production architecture from the start.

**What you'll have at the end of Phase 1:** A complete single-player game at the global zoom level (H3 res 1, ~842 hexes) against an LLM opponent on a real-Earth map, with fog of war, a functional economy, four unit types (infantry, armor, naval, air) with naval transport capability, creating layered strategic choices. Playable from start to finish in 1–3 hours. The AI is consulted on events, not every turn, keeping per-game costs under $0.20 with mid-tier models.

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

**Build:** Generate a global hex map of the entire Earth from Natural Earth data, preprocessed through PostGIS into H3 cells at resolution 1 (~842 hexes, ~610,000 km² each). Each hex is tagged with a terrain type derived from Natural Earth: plains, forests, mountains, desert, wetlands, arctic, coastal (15–85% land area, passable by both land and naval units), or water. Each hex is also tagged with features where applicable: urban (res4 urban hex count for production), airports, and seaports. Store the terrain data and features in SQLite — water hexes don't need per-cell storage, continental interiors can be stored as ranges. See the combat rules document (§1.1) for terrain type and feature definitions.

Also generate the res 4 terrain data (~1,770 km² per hex) in the same pipeline and store it, even though the game doesn't use it yet. This avoids re-running the GIS pipeline in Phase 3 and validates that the res 1 → res 4 parent-child mapping works correctly. The res 4 data sits in the database unused until Phase 3.

Render the global map with basic terrain coloring, smooth pan and zoom, and a minimap for orientation. At ~842 total hexes with roughly 250–350 land hexes carrying game logic, this is well within the rendering performance budget.

**AI architecture impact:** The global map is a significant jump from the 271-hex prototype in geographic scope but a modest jump in hex count. The pre-computation layer should scale comfortably — at ~842 hexes, even assessing every hex is fast. Measure pre-computation time to confirm.

**Playtest hypothesis:** Looking at the map, you should immediately recognize the Earth's continents and major geographic features. The terrain distribution should create obviously interesting strategic geography — chokepoints at Central America and the Middle East, defensible mountain ranges, critical naval passages like Gibraltar and Suez. Pre-computation on the global map should complete in under 1 second.

**Learning focus:** PostGIS-to-H3 data pipeline at both resolutions. Efficient Canvas rendering of hex grids with terrain. Validating the res 1 → res 4 parent-child relationship in H3.

**Community:** Start a Discord server and post your first devlog entry — "building a global hex map from real geographic data." The GIS-to-game pipeline is visually interesting content that will attract technically-minded followers even before you have gameplay to show.

### Milestone 1.3 — Fog of War and Subjective Views

**Build:** Implement per-player visibility. Each player can only see hexes where they have units — ground units (infantry, armor) and naval units see **only the hex they occupy**, with no adjacent-hex vision. The map outside visibility is either unexplored (never seen — rendered dark) or last-known (previously seen but not currently visible — rendered dimmed, showing terrain but not current enemy units). Each player's game state in SQLite tracks their own subjective knowledge.

This own-hex-only model means fog of war is thick by default. Players are blind beyond their front line. Extended visibility comes exclusively from air units (added in milestone 1.5), which see a 3-hex radius around their base airport. This deliberate separation — ground units see nothing beyond their hex, air units see deep — makes air reconnaissance a transformative strategic asset rather than an incremental improvement over existing unit vision. In milestone 1.3, before air units exist, players must push units forward to discover the map, creating genuine exploration tension.

**AI architecture impact:** This is where the `confidence` and `lastSeen` fields in the tool responses become meaningful. The pre-computation layer filters through the AI's subjective view — assessments can only reference enemies the AI has actually seen, with staleness information. The briefing format gains a new dimension: distinguishing between confirmed enemy positions and last-known positions. The callback event `threat_escalation` should fire when a previously unseen enemy appears in a unit's visibility range (new contact), even if the AI didn't explicitly subscribe to it — add `new_contact(unitId)` to the mandatory override list.

**Playtest hypothesis:** Fog of war transforms the game from a puzzle into a contest of information. With own-hex-only vision, you should feel genuinely blind about enemy movements beyond your front line. Pushing a unit forward to scout should feel risky and valuable. You should experience genuine surprise when you discover the AI's forces by moving into their hex. The AI's briefing should clearly distinguish confirmed vs. stale intelligence, and the AI should reason about uncertainty — sending scouts, hedging its deployments, avoiding overcommitting based on incomplete information. The thick fog should make milestone 1.5's air reconnaissance feel like a game-changing upgrade when it arrives.

**Design note:** The subjective-view architecture is also the foundation for multiplayer. Each player's state is already isolated and independent.

### Milestone 1.4 — Economy and Production

**Build:** Add the production system. The production resource is **res4 urban hex count** per territory — each res1 hex generates production points per turn equal to its res4 urban hex count. This is a production *rate*, not a consumable stockpile — the urban hex count doesn't decrease from building units, only from air strikes (milestone 1.5). Points accumulate toward the cost of the queued unit across multiple turns; when accumulated points meet or exceed the unit cost, the unit spawns. Excess production carries over to the next unit in the queue.

Unit costs: 10 (infantry), 20 (armor), 50 (naval). Excess production carries over immediately to the next unit in the queue, and a hex produces as many units per turn as its production rate and unit caps allow. Examples: a hex with 5 urban hexes produces 1 infantry every 2 turns. A hex with 15 urban hexes and a seaport queues a naval unit followed by an infantry: the naval unit spawns on turn 4 (15 × 4 = 60 ≥ 50) with 10 points left over, which immediately covers the infantry cost (10), so both spawn on turn 4. Naval units can only be launched from hexes with seaports.

Unit caps for the base three types: 10 infantry, 5 armor, 5 naval (20 total). Air units are not available yet — they are added in milestone 1.5, where caps become 10/5/5/3. Production is local (per-hex pooling, not global). Territorial control changes when any enemy unit enters a hex.

Hex label format: `N1c / N2t` (urban hex count / turns to next spawn), with exceptions for unexplored (no label), lost control (`N1c / ?t`), nothing enqueued (`N1c`), and unit-capped state (∞ symbol).

**AI architecture impact:** The pre-computation layer adds economic data to the briefing — current resources per territory, production queue status, available build options with costs and build times. The LLM issues production orders through its response JSON alongside unit orders (e.g., `{ "action": "build", "unitType": "armor", "productionHex": [...] }`). No new ad-hoc tools are needed — production decisions are strategic, not exploratory, and the briefing provides all the information the LLM needs to decide what to build and where. Production completion is a natural callback event: add `production_complete(unitType, hexId)` to the event vocabulary.

**Playtest hypothesis:** Resource scarcity forces meaningful trade-offs. The production system should make the early game feel different from the late game. The AI should make reasonable production decisions — building units appropriate to its strategic situation rather than randomly or always building the most expensive option.

### Milestone 1.5 — Air Power and Infrastructure Destruction

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

**Resolution sequence update.** The combat resolution procedure gains two new phases. The full five-phase sequence is: air strikes (pre-move) → ranged (pre-move) → ground/naval movement → ferry movement (with abort check) → melee (post-move). See the updated combat rules document (v2.1) for full details.

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

**Update the combat rules document.** The combat rules document has been updated to v2.1 to reflect the four-unit roster, five-phase resolution sequence, infrastructure destruction system, and air operation rules.

**Update the MCP tools spec.** Tool 2 (assess_unit and assess_hex) gains air-specific fields: visibility coverage, strike range, based-at-airport status. Tool 3 (estimate_combat) gains air strike estimation with target type and counter-fire risk. Tool 5 (standing orders) does not apply to air units — air actions are per-turn decisions, not persistent orders, because the one-action-per-turn constraint makes standing orders less useful (you can't set "always strike hex X" without also committing the unit to never ferry).

**External playtesting:** Get your first external playtester. Watch them play without helping. Take notes on confusion, boredom, and engagement. Pay particular attention to: whether air power feels overpowered or underpowered, whether the infrastructure destruction trade-off creates interesting decisions, and whether the global hex scale feels too abstract — if players want to zoom in, that's signal that Phase 3 is high priority.

### Milestone 1.6 — Naval Transport (Sealift)

**Build:** Add **naval transport** — the ability for land units to travel across oceans aboard naval units. Without sealift, land power is permanently continent-locked, and global scenarios devolve into separate continental wars connected only by air and naval forces. This mechanic is prerequisite to meaningful scenario design in milestone 1.7.

**Naval transport mechanics:**

1. **Embarkation.** Land units embark at a coastal hex with a seaport where naval units are present. The player issues an embark order assigning each land unit to a specific naval unit via a per-unit `embarkedOn` field (e.g., `embarkedOn: "naval-2"`). Embarkation and sailing cannot occur in the same turn — the land units must be assigned to ships before the stack can move.

2. **Cargo assignment and UX.** The engine auto-assigns land units to available naval units on embark: armor first (to avoid splitting a heavy unit across ships), then infantry, filling ships in order. The player can reassign cargo via the stack popup — the existing multi-unit stack popup is expanded to show cargo controls when naval units are part of the stack. Symbology: "/" for embarked, "\" for not embarked. The LLM specifies assignments explicitly: `{ "action": "embark", "unitId": "inf-3", "navalUnitId": "naval-2" }`.

3. **Capacity.** Each naval unit can carry **1 armor or 2 infantry** (capacity 2; armor weight 2, infantry weight 1). Capacity is enforced per naval unit via the cargo assignment. Orders that would violate a ship's capacity are rejected.

4. **Stack movement.** On water hexes, naval units and their assigned cargo move as a transport stack using the naval unit's movement (2 hexes/turn). The entire stack must be selected and moved together. Splitting a stack on water hexes is permitted only if each sub-stack has sufficient naval capacity for its assigned cargo. Land units in the stack are passengers — they do not consume their own movement action.

5. **Combat restrictions while embarked.** Embarked land units **cannot** use ranged attacks or return counter-fire against air strikes on any hex type. On water hexes, embarked units also cannot participate in melee — they are fully dependent on their naval escorts. On coastal hexes, embarked units **can** participate in melee at their full attack and defense values, enabling amphibious landings. This means armor must disembark before it can use its range-1 attack, creating a natural beachhead phase where the first turn on a contested coast is melee-only.

6. **Transport loss.** The coastal-vs-water distinction drives transport loss: on **water hexes**, if a naval unit is destroyed, all land units assigned to that specific ship are destroyed (the per-ship assignment makes this deterministic — no random selection). On **coastal hexes**, if a naval unit is destroyed, its assigned cargo is automatically disembarked (assignment cleared, units remain on the hex). This applies uniformly across all combat phases.

7. **Disembarkation.** When a transport stack arrives at a coastal hex, embarked units remain embarked (and can melee if enemies are present). On a subsequent turn, if the player gives the land units independent movement orders, the engine auto-disembarks them (clears the `embarkedOn` assignment) before executing movement. This also handles the "drop off and go" pattern — the player orders land units to march inland and the naval unit to sail away, and both execute in the same movement phase. No seaport is required for disembarkation — land units can land at any coastal hex.

**Turn count examples:**

- **Inland-to-inland (minimum 3 turns):** Turn 1: land units move to a coastal port hex with naval units; embark order assigns them. Turn 2: the stack sails across water. Turn 3: stack arrives at a coastal hex; on a subsequent turn the player orders land units inland (auto-disembark triggers).
- **Port-to-coast amphibious assault (minimum 2 turns):** Turn 1: land units are already at the port with naval units; embark order issued. Turn 2: stack sails to target coastal hex; embarked land units fight in melee if enemies are present, still aboard their ships.
- **Long-distance sealift:** Multiple turns of sailing at naval move speed (2 hexes/turn). The stack is vulnerable to air strikes and naval engagements throughout.

**AI architecture impact:** The pre-computation layer adds transport-specific data to the briefing: naval units with available capacity and current cargo assignments, coastal ports accessible for embarkation, estimated transit times to key coastal targets, and current transport stacks at sea with their vulnerability status. The LLM issues transport orders through the response JSON: `{ "action": "embark", "unitId": "inf-3", "navalUnitId": "naval-2" }` for embarkation, `{ "action": "transport_move", "navalUnitId": "naval-2", "destination": [...] }` for stack movement, and `{ "action": "disembark", "unitId": "inf-3", "destination": [...] }` for landing.

The briefing format gains a sealift section:

```
NAVAL TRANSPORT:
| Naval Unit | Position | Capacity | Cargo | Status |
|------------|----------|----------|-------|--------|
| naval-1 | [8.2,4.3] | 2/2 free | — | at port, available for transport |
| naval-2 | [-15.3,22.1] | 0/2 free | inf-3, inf-5 | at sea, 2 turns from [target] |

EMBARKATION OPTIONS:
• Seaport at [8.2,4.3]: naval-1 available, inf-1 and armor-2 within 1 turn
• Seaport at [12.4,12.1]: no naval units present

⚠ Transport stack naval-2 is in range of enemy air unit at [human-airport]
```

**Update the combat rules document** to v2.2 to cover naval transport mechanics: per-ship cargo assignment, capacity rules, embarked combat restrictions (no ranged on any hex, melee on coastal only), transport loss (fatal on water, incidental on coast), auto-disembark pre-step, and amphibious landing interactions with the melee phase.

**Update the MCP tools spec.** Tool 2 (assess_unit) gains transport-specific fields for naval units: current cargo assignments, available capacity, estimated transit times. Tool 3 (estimate_combat) gains transport vulnerability estimation — combat estimates for naval units should flag when they are carrying land units and distinguish water-hex (fatal) from coastal-hex (incidental) transport loss scenarios.

**Playtest hypothesis:** Naval transport should make global scenarios feel genuinely global — land armies should be able to project force across oceans, but at meaningful cost and risk. Specifically:

- **Sealift should feel like a commitment.** Loading armies onto ships and sailing across open water should create genuine tension — the vulnerability window is real, and losing a loaded transport stack at sea should be devastating (all assigned cargo destroyed).
- **Amphibious landings should be dramatic.** Sailing a transport stack into a defended coast and fighting in melee on arrival — without ranged support from embarked armor — should feel like a high-stakes gamble, not a routine operation. The beachhead phase (melee-only until disembarkation) creates a natural tension point.
- **Port denial is a defensive strategy.** Destroying your own seaports to prevent enemy embarkation (using air strikes from milestone 1.5) should emerge as a viable defensive tactic. The AI should reason about port vulnerability and consider preemptive port denial.
- **The AI plans multi-turn transport operations.** Read the AI's strategy field — is it staging units at ports, planning sealift routes that avoid enemy air coverage, and timing landings to coincide with other offensives? Multi-turn planning is the LLM comprehension test for this mechanic.
- **Cargo assignment feels natural.** The auto-assign on embark should handle the common case; the stack popup should handle edge cases. Neither should feel tedious.

### Milestone 1.7 — Game Scenarios and Win Conditions

**Build:** Create 2–3 preset scenarios on the real-Earth map: a contained regional conflict (e.g., European theatre — limit the playable area to ~50–80 global hexes), a two-front global scenario, and a free-play sandbox. Each scenario defines starting territories, forces, production centers, airport and seaport locations, and victory conditions. Add a scenario selection screen and a basic end-game summary showing territory control over the course of the game.

Scenarios should vary in how much infrastructure is available at start — a scenario with few airports makes air power scarce and valuable; a scenario with many airports makes air superiority a central strategic concern. At least one scenario should feature separated landmasses requiring naval transport for cross-ocean force projection — this validates the sealift mechanics from milestone 1.6 in a scenario context. This lets you test air balance and sealift balance across different setups without changing the rules.

**AI architecture impact:** Different scenarios may warrant different callback sensitivities. A fast-paced regional conflict might need more frequent LLM consultation than a sprawling global scenario where fronts are stable for many turns. Consider making the deadman timer (currently 5 turns) scenario-configurable. The end-game summary should include AI consultation statistics — how many times the AI was consulted, what events triggered consultations, total API cost for the game, and infrastructure destroyed by each side. This is interesting data for the player and essential data for you.

**Playtest hypothesis:** At least one scenario produces a consistently engaging 60–90 minute game experience with a beginning, middle, and end. When you finish a game, you want to play again with a different strategy. The scorched-earth dynamic should produce noticeably different end-game maps across playthroughs — some games end with infrastructure mostly intact (careful players), others with devastated territories (aggressive air campaigns). Scenarios with cross-ocean sealift requirements should produce games that feel meaningfully different from continent-only scenarios.

**This is your vertical-slice milestone** — the point where you have a genuinely shippable game. Everything from here forward is expansion and polish.

---

## Phase 2: Polish and Depth (Milestones 2.1–2.6)

**Goal:** Transform the functional game into something you'd be comfortable showing to the public. Improve the UI, deepen the AI, add distinctive features that differentiate your game.

**What you'll have at the end of Phase 2:** An Early Access-ready game with a polished UI, competent AI opponents with distinct personalities, AI transparency features, scenario variety, and enough depth to sustain a community of early players.

**Community:** Before starting Phase 2, set up your Steam page ($100 Steamworks account) and start accumulating wishlists. Post the GitHub repository with your first playable build. Begin regular devlog updates. The hybrid AI architecture — LLM strategic reasoning with event-driven consultation — is a unique technical story. Lead with it.

### Milestone 2.1 — Art Direction and UI Overhaul

**Build:** Commit to your visual style and implement it consistently. Recommended: clean military-cartographic aesthetic — NATO APP-6 unit symbols, muted topographic terrain palette, clear sans-serif typography, restrained color accents for player identification and alerts. Implement proper UI panels: collapsible sidebar for unit details, top bar for turn info and resources, bottom bar for orders and notifications. Keyboard accelerators for common actions.

**AI architecture impact (UX for AI wait states):** This is the milestone where you implement the progressive-disclosure pattern for AI thinking time. When the AI is being consulted (event-driven, not every turn), show a brief status indicator: "AI Commander is reviewing the situation..." with sub-status updates derived from the pre-computation layer: "Evaluating northern front... Assessing combat options... Finalizing orders." On turns where the AI is not consulted, show nothing — the standing orders execute silently as part of resolution. This makes the AI's consultation pattern visible as a gameplay signal: the player can learn to read when the AI is rethinking its strategy.

**Playtest hypothesis:** A new player looking at a screenshot should immediately understand this is a serious strategy game. The AI status indicator should feel like intelligence about the opponent, not a loading screen.

### Milestone 2.2 — AI Personality, Difficulty, and Model Routing

**Build:** Implement AI personality differentiation through system prompt engineering and callback configuration. Create at least three distinct AI profiles: cautious/defensive, balanced, and aggressive. Each profile configures:

- **System prompt personality** — strategic doctrine, risk tolerance, aggression level, air power doctrine (aggressive profiles favor infrastructure destruction; cautious profiles preserve infrastructure for potential capture), sealift doctrine (aggressive profiles launch amphibious operations; cautious profiles use naval transport only for reinforcement)
- **Callback sensitivity** — aggressive AI subscribes to more frequent `turns(N)` with lower N and lower `threat_escalation` thresholds; cautious AI uses longer intervals and reacts mainly to direct contact
- **Briefing emphasis** — aggressive AI's briefing highlights offensive opportunities, air strike targets, and amphibious assault options; cautious AI's briefing emphasizes defensive vulnerabilities, airport protection, and transport escort requirements

Difficulty scaling works through two levers: the model tier (player selects via their OpenRouter key) and information accuracy (on lower difficulty, combat estimates and threat assessments include a small error margin, simulating worse intelligence).

**Add the AI Observatory.** A panel where players can view: the briefing the AI received on its last consultation, the callback events that triggered the consultation, the AI's response (strategy summary and orders issued), and which turns the AI was and wasn't consulted. This is the transparency feature that no other strategy game offers. Make it a post-game feature initially (review after the game ends), with an option to view the last-turn briefing during play.

**Tiered model routing (optional, scope-dependent):** If the callback system is working well and consultations are infrequent enough, this may not be needed yet. But if cost or latency on larger maps still exceeds targets, implement a simple router: use the player's selected model for event-triggered consultations (the important decisions) and a cheaper model for the deadman-timer consultations (routine check-ins). This is a natural extension of the callback architecture — the event type determines the model tier.

**Playtest hypothesis:** Playing against the aggressive AI should feel noticeably different from playing against the cautious AI — not just in outcomes, but in pacing and texture. An aggressive AI should conduct scorched-earth air campaigns and launch daring amphibious assaults; a cautious AI should preserve infrastructure, use air primarily for reconnaissance, and use naval transport conservatively. The AI Observatory should be fascinating to read after a game.

### Milestone 2.3 — Diplomacy and Alliances

**Build:** Multi-player support (3+ sides) with a diplomacy layer. Players can propose alliances (shared visibility, non-aggression), declare war, and negotiate peace. AI players make diplomatic decisions through the LLM with diplomatic context added to the briefing. Allied players share fog-of-war visibility. Alliances can be broken.

**AI architecture impact:** Diplomatic events are a natural addition to the callback vocabulary: `alliance_proposed(byPlayer)`, `alliance_broken(byPlayer)`, `war_declared(byPlayer)`. These are high-importance events that should always trigger a full consultation with the player's selected model. The briefing format gains a diplomacy section summarizing current relationships and recent diplomatic actions. The LLM's response format gains a `diplomaticActions` array.

The possibility of AI betrayal — the LLM deciding that breaking an alliance is strategically sound — is exactly the kind of emergent behavior that makes this system compelling. Don't prevent it; surface it in the AI Observatory.

**Playtest hypothesis:** Alliances create genuine diplomatic tension. You should feel uncertain about whether your AI ally will remain loyal.

### Milestone 2.4 — Sound Design and Game Feel

**Build:** Add audio: ambient music (1–3 tracks, licensed or AI-generated with commercial rights), UI feedback sounds, notification sounds. Add visual juice to the resolution phase: brief combat animations, smooth unit movement interpolation, camera auto-pan to significant engagements. Air strike animations should be distinctive — visually and aurally different from ranged combat to reinforce the five-phase resolution sequence. Naval transport stacks should render distinctively — land units visually "aboard" naval units during water movement.

**Playtest hypothesis:** The resolution phase should feel like watching a story unfold. Sound and animation should make combat outcomes feel impactful — losing a unit should sting, destroying an enemy should satisfy. Infrastructure destruction should feel consequential — not just a stat change, but a visible scar on the map. A loaded transport sinking should feel like a disaster.

### Milestone 2.5 — Save/Load and Session Management

**Build:** Full save and load. Since game state is in SQLite, this is largely about serializing the complete database state — including per-player subjective views, pending orders, AI memory, standing orders, active callback subscriptions, infrastructure state (which urban hexes/airports/seaports have been destroyed), cargo assignments (embarkedOn state for all units), and turn counter — to a save file and restoring it cleanly. Auto-save at the start of each turn. Add turn replay: step through any previous turn's resolution, including the AI's briefing and response for turns where it was consulted.

**AI architecture impact:** The callback subscription state must be persisted and restored. On load, the engine must re-evaluate whether any callback conditions are already satisfied in the loaded game state (e.g., if the game was saved mid-crisis, the loaded state might immediately trigger a consultation). AI strategic memory (Tool 4) is already in SQLite and persists naturally.

**Playtest hypothesis:** You should be able to close the game mid-session, reopen it days later, and resume with full context. The turn replay with AI briefing review should help you remember your strategic situation.

### Milestone 2.6 — Asynchronous Multiplayer

**Build:** Human-vs-human play via asynchronous turn file exchange. Each player has their own game instance. After submitting orders, the game exports a turn file. All players' turn files are combined and fed into the resolution engine. Each player receives results filtered through their fog of war. LLM players participate alongside humans, each running locally.

**AI architecture impact:** In async multiplayer, each human player's AI opponents run locally with their own callback state and memory. The turn file format must include the AI's orders (generated from standing orders and any triggered consultations) alongside the human's orders. The callback evaluation happens independently on each player's machine.

**Playtest hypothesis:** Playing against a human opponent with WEGO resolution and fog of war should feel meaningfully different from playing against the AI.

---

## Phase 3: Theatre Zoom (Milestones 3.1–3.5)

**Goal:** Add the theatre zoom level (H3 res 4) and the attention mechanic. Players can zoom from the global map into a single res-1 hex to see and command at division scale. This transforms the game from a pure grand strategy experience into a two-level command game where strategic allocation and operational execution are distinct, interdependent skills.

**Critical prerequisite:** Phase 3 begins only when the global-level game from Phases 1–2 is stable, fun, and has external tester confirmation. The theatre zoom adds significant complexity; the base game must be solid. If Phase 1–2 playtesting reveals that players rarely express a desire to "zoom in" — if the global level is satisfying on its own — consider deferring Phase 3 to post-launch.

### Milestone 3.1 — Theatre-Level Rendering and Navigation

**Build:** Implement the zoom transition from global (res 1) to theatre (res 4). Clicking a global hex reveals its ~343 res-4 child hexes with terrain data (already generated and stored in the database since milestone 1.2). The theatre view renders with finer terrain detail — at ~42 km per hex, terrain types that were aggregated at global level now show distinct features: mountain passes through ranges, river-adjacent hexes, coastal approaches, forested regions within a broadly "land" global hex.

Build the zoom-in and zoom-out transitions, the theatre-level rendering path, and the UI state management for tracking which level the player is viewing. The player can zoom into any global hex to view it at theatre level, but cannot issue orders at theatre level yet — this milestone is rendering and navigation only.

**Playtest hypothesis:** The zoom transition should feel like assuming a different level of command — like a general leaning over a regional map after studying the global one. The terrain at res 4 should reveal geographic detail that was invisible at res 1: the Strait of Gibraltar as a narrow passage, the Swiss Alps as a barrier with passable valleys, coastal approaches that invite amphibious operations. The transition should be smooth enough that zooming in and out feels like a natural part of the decision loop, not a mode switch.

### Milestone 3.2 — Global-to-Theatre Unit Relationship

**Build:** This milestone answers the foundational design question: when a player zooms from a global hex into its theatre view, how do global-level units relate to theatre-level units? Three approaches to prototype and evaluate:

- **Decomposition:** A global "Field Army" breaks into a fixed or player-configured mix of theatre-level infantry, armor, and artillery when you zoom in. Zooming out re-aggregates them. Most realistic, most complex. Key questions: who decides the composition? Can the player reconfigure it? What happens to theatre-level units that move to a different global hex's children?
- **Abstraction boundary:** Global and theatre units are separate systems. The global level tracks aggregate strength; theatre-level units exist independently within their parent hex's children. Simpler, but risks feeling like two different games. Key question: what's the relationship between global strength and the theatre-level units underneath?
- **Unified with aggregation:** Theatre-level units are the "real" units everywhere. The global view aggregates them into summary markers showing composition and strength. Zooming in reveals the actual units. Most elegant, but requires theatre-level units to exist in every global hex, which has storage and AI implications. Key question: is the performance cost acceptable at full map scale?

Build a quick prototype of the two most promising approaches (spend no more than 3–4 days each). Test each against one criterion: does zooming in feel like assuming a different level of command, or does it feel like switching games? The right answer is whichever one makes the transition feel natural.

Do not design the theatre-level unit roster in this milestone. Use placeholder theatre units (re-skinned prototype infantry/armor/naval with adjusted stats) to test the relationship mechanic in isolation. The real roster design comes next.

**Playtest hypothesis:** One approach should feel clearly better than the others within a few test games. If none feels right, that's signal to step back and reconsider whether the two-level design is the right model — but this is unlikely if the rendering transition from 3.1 felt natural.

### Milestone 3.3 — Theatre-Level Unit Roster and Commands

**Build:** Design and implement the theatre-level unit roster — the set of unit types that operate at H3 res 4 where each hex is ~1,770 km² (~42 km edge-to-edge). Apply the same unit mix design process used in milestone 1.5, now calibrated for division scale:

1. **Anchor to the hex scale.** At ~42 km per hex, infantry move 1 = a day's march for a WW2-era division. Armor move 2 = a fast mechanized exploitation (~84 km). These are the ground-truth rates the roster is built around.

2. **Start with the roles that matter at this scale.** The theatre level is where terrain interactions, combined arms, and rock-paper-scissors dynamics have the most impact. Start with 5–6 types: infantry, armor, artillery (ranged, can't move and fire same turn), naval surface, submarine (invisible until adjacent), and transport (carries land units across water). Add mechanized infantry and tactical aircraft only if playtesting reveals the gap. Note: global-level air units provide strategic air power; theatre-level aircraft (if added) would represent tactical air support with shorter range and different mechanics. The global-level naval transport mechanic (milestone 1.6) operates at a different scale — theatre-level transport is a dedicated unit type for tactical amphibious operations within a single global hex's children.

3. **Design the terrain interaction matrix.** At res 4, terrain should meaningfully shape tactics: armor strong on plains, penalized in mountains/forest; infantry defends well in forest and mountains; artillery range extends over flat terrain; naval restricted to water and coastal hexes. Build this matrix before assigning stats.

4. **Test LLM comprehension at this scale.** The AI must reason about theatre-level units distinctly from global-level units. The system prompt must clearly distinguish the two command levels and the unit types available at each.

Implement the ability to issue orders at theatre level — select a theatre-level unit and give it movement or attack orders within the res-4 hex grid. Theatre-level orders resolve through the same WEGO system as global orders. Integrate the unit relationship model chosen in milestone 3.2.

**Update the combat rules document** to cover theatre-level unit stats, terrain modifiers at res 4, and any resolution differences between the two zoom levels.

**Playtest hypothesis:** Issuing orders at theatre level should feel meaningfully different from the global level — more tactical, more terrain-dependent, more about combined arms and positioning. The unit roster at this scale should create decisions that didn't exist at the global level.

### Milestone 3.4 — Attention Mechanic

**Build:** Implement the attention budget as a strict constraint: each turn, the player operates at exactly one level. Either the global level (issuing global-scale orders, all theatres running on standing orders) or zoomed into a single theatre (issuing theatre-level orders within that one global hex, all other theatres and global-level decisions running on standing orders). You cannot do both in the same turn.

This means the turn structure branches: at the start of planning, the player chooses "stay global" or "zoom into theatre X." That choice locks for the turn. The UI reflects this — if you're in a theatre, the global map is visible as a minimap but not interactive. If you're at global level, theatre views are read-only.

The AI manages its own attention independently under the same constraint — its briefing at consultation time includes a recommended attention focus (pre-computed from threat assessments), and it responds with an attention allocation decision. The AI's choice is binary in the same way: it either issues global-level orders or focuses on one theatre per consultation.

Add the post-turn attention visualization: a display showing where the AI focused, where you focused, and areas where unattended forces encountered surprises. This is the payoff for the attention mechanic — the moment where you see the consequences of your allocation choice.

**AI architecture impact:** The AI's attention allocation is managed through its callback subscriptions and standing orders, independent of the human's attention. When the AI is consulted, its briefing includes theatre-level detail for the area it's focusing on and global-level summary for everywhere else. The LLM responds with attention allocation decisions as part of its orders. The AI does not need to "zoom in" like the player does — its attention allocation is abstract, expressed as which regions receive detailed pre-computation in the briefing and which get summary treatment.

**Playtest hypothesis:** The attention constraint should feel strategic, not limiting. The strict one-scope-per-turn rule should create genuine tension: "Do I stay global and redirect my Pacific fleet, or zoom into the European theatre where my offensive is about to make contact?" After several games, you should be able to articulate a personal "command style" — some players will micromanage critical theatres, others will trust their standing orders and manage from the global level. Both approaches should be viable. The post-turn attention comparison with the AI should be one of the most interesting parts of the game.

### Milestone 3.5 — Theatre Zoom Integration and Balance

**Build:** Full integration pass. Theatre-level combat, production, fog of war, and economy all function correctly within the zoomed view. Scenarios from milestone 1.7 work with both zoom levels active. Balance pass on theatre-level unit stats, terrain modifiers, and attention budget constraints. Ensure the AI plays coherently across both levels — making sensible attention allocation decisions and issuing appropriate orders at whichever level it's focused on.

**Playtest hypothesis:** A complete game using both zoom levels should feel richer than the global-only experience, not more tedious. The theatre zoom should be something you want to use, not something you feel obligated to use. If the global-only game is still the preferred experience after this milestone, the attention mechanic or the theatre-level gameplay needs further tuning — but that's a balance problem, not an architectural one.

---

## Phase 4: Ship It (Milestones 4.1–4.4)

**Goal:** Prepare the game for public distribution.

### Milestone 4.1 — Onboarding and Tutorial

**Build:** A tutorial scenario teaching core mechanics through guided play — one concept per turn. Start at the global level; introduce air power after the player is comfortable with ground and naval operations; introduce naval transport after the player has seen the need to move armies across water; introduce the theatre zoom once the player is comfortable with all global-level mechanics. Also write a comprehensive reference manual as a searchable HTML document bundled with the game. Include a section explaining the AI system: how LLM opponents work, what the "bring your own API key" model means, how the AI Observatory works, and what the cost expectations are at different model tiers.

**Playtest hypothesis:** A strategy game player who has never seen your game should complete the tutorial and start a real scenario without asking questions.

### Milestone 4.2 — Platform Packaging

**Build:** Production builds for Windows, macOS, and Linux. Proper installers, application signing, auto-update, crash reporting. Steam SDK integration. Standalone GitHub releases. Test on machines that aren't yours.

**Playtest hypothesis:** Someone who isn't you can install and complete a full game on a clean machine.

### Milestone 4.3 — Community Beta

**Build:** Release to your Discord community and content creators. Instrument opt-in analytics: turn time, AI consultation frequency, AI model choices, callback trigger distribution, game length, cost per game, crash reports, zoom usage patterns (how often players use theatre zoom, which theatres they zoom into), air unit usage (strike target distribution, ferry frequency, infrastructure destroyed per game), naval transport usage (sealift operations per game, amphibious assault frequency, transport losses). Run a structured feedback cycle with specific questions.

**AI-specific analytics to capture:** Average consultations per game by scenario size. Most common callback triggers. Average cost per game by model tier and scenario. Distribution of ad-hoc tool calls during consultations (are players' AIs still needing ad-hoc tools, or does pre-computation cover everything?). Theatre zoom usage: do players engage with it, or do they stay at global level? Air power analytics: what percentage of AI consultations involve air strike decisions? How often does the AI destroy its own future territory's infrastructure? Sealift analytics: does the AI successfully plan and execute multi-turn transport operations? How often does it attempt amphibious assaults vs. defensive reinforcement sealifts? These metrics will tell you whether the hybrid architecture, the two-level design, the scorched-earth mechanic, and naval transport are working as intended in the wild.

**Playtest hypothesis:** At least some beta players complete multiple full games voluntarily. Per-game AI cost with mid-tier models should be under $0.25 on standard scenarios.

### Milestone 4.4 — Launch

**Build:** Final polish based on beta feedback. Steam page updates, trailer, description. Simultaneously publish the free standalone build to GitHub releases — the dual-distribution model (free compiled builds on GitHub, paid convenience on Steam) should launch together, not sequentially. Price the Steam version at $15–20 for Early Access. Post-launch, commit to regular update cadence.

**Playtest hypothesis:** Launch week Steam reviews 80%+ positive.

---

## Cross-Cutting Concerns

**Community building** starts at Milestone 1.2 and continues throughout. The hybrid AI architecture is a unique technical story — the "LLM opponent that only thinks when something interesting happens" narrative is compelling for both wargaming and AI audiences.

**Playtesting** happens every milestone from 0.6 onward. External testers by Milestone 1.5. 3–5 regulars by end of Phase 2. Beta targets 20–50 players.

**Source control** uses GitHub from day one. Private repo, issues for tracking work.

**AI prompt engineering** is ongoing from 0.6 onward, but the nature of the work shifts. In the iterative tool-calling architecture, prompt engineering was about teaching the LLM to use tools effectively. In the hybrid architecture, it's about two different things: designing briefings that give the LLM the right information to make strategic decisions, and designing callback criteria descriptions that help the LLM set appropriate triggers. The air unit's decision space (four target types, ferry timing, base defense) is the most complex briefing challenge — invest time in formatting this section clearly. Naval transport adds multi-turn planning complexity to the briefing; the AI must reason about embarkation staging, transit vulnerability, and landing timing as a coordinated sequence, not isolated decisions. Keep a log of prompt iterations and their effects.

**Cost and latency monitoring** is a new cross-cutting concern. From 0.6 onward, every AI consultation should log: trigger event, pre-computation time, prompt token count, completion token count, ad-hoc tool calls, total wall-clock time, and estimated cost. This data is essential for tuning the system and is the foundation for the in-game cost display that BYOK players will expect.

**Unit roster iteration** is a cross-cutting design concern from 1.5 onward. The global roster (infantry/armor/naval from 1.4, air added in 1.5, naval transport capability added in 1.6) and the theatre roster (designed in 3.3) must both follow the same validation process: start minimal, expand only through playtesting, test LLM comprehension, and ensure asymmetric matchups. Resist the urge to design the theatre roster before Phase 3 — you'll know more about what the game needs after 6+ months of playing the global-level game.

---

## Estimated Timeline

Assuming 2-week milestones at 10–15 hours per week:

| Phase | Milestones | Calendar Time |
|-------|-----------|---------------|
| Phase 0 (continued): Hybrid Validation | 0.6–0.7 | 3–5 weeks |
| Phase 1: The Real Game | 1.1–1.7 | 12–16 weeks |
| Phase 2: Polish and Depth | 2.1–2.6 | 10–14 weeks |
| Phase 3: Theatre Zoom | 3.1–3.5 | 8–12 weeks |
| Phase 4: Ship It | 4.1–4.4 | 6–10 weeks |

**Total estimated range from current position: 10–15 months to launch.**

Phase 3 (theatre zoom) remains deferrable to post-launch if the global-level game is strong enough on its own. Without Phase 3, the range compresses to 7–12 months. That's a legitimate shipping strategy — launch the game that works, expand it once it has an audience. The unit relationship question (milestone 3.2) is the highest-risk element in Phase 3 — if it takes longer than two weeks, that's a signal to simplify rather than extend.

**The next critical checkpoint is after Milestone 0.7.** If the hybrid architecture validates, you proceed with confidence that the game can scale to real-world map sizes without prohibitive cost or latency. If it doesn't, you still have a viable game on small maps with the current architecture — the scope of Phase 1's map ambitions adjusts downward, but the game concept remains sound.

---

## Summary of Key External Touchpoints

| When | Action |
|------|--------|
| Milestone 0.6 | Instrument cost/latency metrics for A/B testing |
| Milestone 0.7 | Go/no-go decision on hybrid architecture |
| Milestone 1.2 | Start Discord server, first devlog post |
| Milestone 1.5 | First external playtester |
| Before Phase 2 | Create Steam developer account, set up Steam page |
| Phase 2 ongoing | Engage wargaming content creators |
| Milestone 4.3 | Community beta launch |
| Milestone 4.4 | Public launch on Steam and GitHub |

---

## Appendix: Tool Service Evolution from 0.5 to Hybrid Architecture

This section maps the existing MCP tool spec (v6.0) to the hybrid architecture, showing what changes and what's preserved.

### Tools That Become Pre-Computed

These tools continue to exist with unchanged interfaces but are now called by the engine before LLM invocation rather than by the LLM during its reasoning:

| Tool | Pre-Computation Scope | Remains Ad-Hoc? |
|------|----------------------|-----------------|
| `assess_unit` | All AI units (including air units — base status, visibility coverage, strike options; naval units — cargo assignments, available capacity) | Yes — for assessing enemy units or re-assessing a friendly unit with a different scan radius |
| `assess_hex` | Contested hexes, objectives, chokepoints, airport/seaport hexes, coastal hexes relevant to transport operations | Yes — for evaluating hexes the AI is considering but weren't pre-scanned |
| `estimate_combat` | All unit pairs within 2 turns of contact; all air strike options with counter-fire risk; transport vulnerability estimates for loaded naval stacks (distinguishing water-hex fatal from coastal-hex incidental loss) | Yes — for what-if scenarios with hypothetical force compositions |
| `plan_route` | Route updates for all standing march/pursue orders; transport route estimates for sealift planning | Yes — for exploring hypothetical new routes |
| `check_distance` | Included in unit assessments | Yes — for quick comparisons during reasoning |

### Tools That Become Response-JSON-Only (write operations)

These tools are no longer available as ad-hoc tool calls. Their operations are issued through the LLM's response JSON instead, eliminating a dual-path ambiguity:

| Tool | Response JSON equivalent |
|------|------------------------|
| `assign_order` | `orders` array with `"action": "assign_order"` |
| `cancel_order` | `orders` array with `"action": "cancel_order"` |
| `memory_write` | `memoryUpdates` array with `"action": "write"` |
| `memory_delete` | `memoryUpdates` array with `"action": "delete"` |
| *(new)* air strike | `orders` array with `"action": "air_strike"` |
| *(new)* ferry | `orders` array with `"action": "ferry"` |
| *(new)* embark | `orders` array with `"action": "embark"` |
| *(new)* transport move | `orders` array with `"action": "transport_move"` |
| *(new)* disembark | `orders` array with `"action": "disembark"` |

### Tools That Remain Ad-Hoc Only (read operations)

| Tool | Reason |
|------|--------|
| `memory_read` | The LLM retrieves stored-tier memories by key or tag during reasoning — inherently interactive, cannot be pre-computed because the engine doesn't know which stored memories the LLM will need |
| `query_orders` | Standing order summary is in the briefing, but the LLM may need detailed order parameters beyond what the summary provides |

### New System: Callback Event Engine

Not a tool the LLM calls, but a new output the LLM produces. The LLM includes callback subscriptions in its response. The engine evaluates them each turn. This replaces the implicit "call me every turn" contract. The `infrastructure_destroyed` event type enables the AI to react to scorched-earth actions even on turns it wasn't consulted. The `transport_arrived` event enables the AI to coordinate landing operations with broader strategic timing.

### Integration Architecture Change

**Before (0.5):**
```
Each turn:
  1. Engine prepares game state
  2. Engine sends state + tool definitions to LLM
  3. LLM calls tools iteratively (5-10 round-trips)
  4. LLM submits orders
  5. Engine resolves
```

**After (hybrid):**
```
Each turn:
  1. Engine resolves previous turn (5-phase: air strike → ranged →
     ground/naval movement → ferry → melee)
  2. Engine runs pre-computation on all AI units (parallel, <2 sec)
  3. Engine evaluates callback subscriptions against post-resolution state
  4. IF any callback fires:
     a. Engine generates briefing from pre-computed data
     b. Engine sends briefing + ad-hoc tool definitions to LLM
     c. LLM reasons (0-2 ad-hoc tool calls typical)
     d. LLM responds with orders + callbacks + memory updates
     e. Engine applies new standing orders and callback subscriptions
  5. IF no callback fires:
     a. Standing orders execute (already computed in step 2)
     b. No LLM invocation — zero cost, zero latency
  6. Human planning phase (concurrent with steps 2-5)
```

This converts the AI from an every-turn cost to an event-driven cost, while preserving the full tool suite for the turns when the AI does reason.

### Resolution-Level Awareness (Phase 3)

When theatre zoom is implemented (Phase 3), the tools gain resolution awareness. The strict attention constraint (global OR theatre per turn) applies to the AI in the same way it applies to the human player:

- **Pre-computation** runs at global level for all AI units every turn. When the AI chooses to focus on a specific theatre during consultation, pre-computation also runs at res 4 within that theatre, providing division-level assessments in the briefing alongside global-level summaries elsewhere. The AI cannot issue theatre-level orders and global-level orders in the same consultation — it chooses one scope per consultation, just like the human player chooses one scope per turn.
- **Ad-hoc tools** accept an optional `resolution` parameter. `assess_hex` at res 4 returns finer terrain detail. `plan_route` at res 4 routes through res-4 hexes within a theatre. `estimate_combat` at res 4 uses theatre-level unit stats and terrain modifiers.
- **The briefing format** uses spatial decay across resolution levels: theatre-level detail for the AI's attention focus, global-level summary for everywhere else. This is a natural extension of the spatial-decay pattern already established.

The tool interfaces are designed to accommodate this without schema breaks — the `resolution` parameter is optional and defaults to the current game level.