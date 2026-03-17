# Strategic Development Plan: Grand Strategy Wargame with LLM Opponents

*Version 3.0 — March 2026*

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

**Mandatory override events (always fire, regardless of LLM subscription):**

- Any AI unit participates in combat for the first time since the last consultation (catches surprise contacts the AI didn't anticipate — distinct from `unit_engaged(unitId)` which the AI subscribes to for specific units it's watching)
- Any AI unit is destroyed
- Any AI unit without a standing order exists (newly spawned, order completed, order cancelled by engine)
- An AI unit's standing order enters a blocked or error state
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
    { "unitId": "...", "action": "explicit_attack", "targetHex": [...] }
  ],
  "callbacks": [
    { "event": "turns", "params": { "n": 3 } },
    { "event": "unit_arrived", "params": { "unitId": "opponent-armor-1" } },
    { "event": "threat_escalation", "params": { "unitId": "opponent-infantry-2", "severity": "critical" } }
  ],
  "memoryUpdates": [
    { "action": "write", "key": "...", "content": "...", "tier": "persistent" },
    { "action": "delete", "key": "..." }
  ]
}
```

Standing orders remain the primary output mechanism. Explicit per-turn movement and ranged attack orders are available for one-off tactical overrides that don't warrant a standing order. The `callbacks` array replaces the implicit "call me every turn" contract. Memory updates can be bundled into the response rather than requiring separate tool calls, further reducing round-trips.

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

## Phase 1: The Real Game (Milestones 1.1–1.6)

**Goal:** Transform the validated prototype into a real, replayable game on a real-Earth global map with fog of war, a functional economy, and enough depth to sustain multiple playthroughs. This is where you stop writing throwaway code and start building the actual codebase. The hybrid AI architecture is foundational — it's not bolted on later, it's built into the production architecture from the start.

**What you'll have at the end of Phase 1:** A complete single-player game at the global zoom level (H3 res 1, ~842 hexes) against an LLM opponent on a real-Earth map, with fog of war, a functional economy, and enough unit variety to create interesting strategic choices. Playable from start to finish in 1–3 hours. The AI is consulted on events, not every turn, keeping per-game costs under $0.20 with mid-tier models.

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

Port the basic hex rendering and WEGO turn loop from Phase 0, restructured for the hybrid architecture. Set up your build pipeline, linting, and whatever CI you want. Ship the same small-map game from Phase 0 running on the new codebase.

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

**Build:** Implement per-player visibility. Each player can only see hexes within their units' visibility range. At the global level (res 1), visibility ranges need to be calibrated for the hex scale: each hex is ~440 km edge-to-edge, so a visibility range of 1 hex means a unit can see its own hex and all adjacent hexes — roughly a 900 km radius, which is plausible for a major military formation with air reconnaissance and signals intelligence. Naval formations might see 2 hexes (representing broader maritime patrol coverage). These are starting values — tune through playtesting.

The map outside visibility is either unexplored (never seen — rendered dark) or last-known (previously seen but not currently visible — rendered dimmed, showing terrain but not current enemy units). Each player's game state in SQLite tracks their own subjective knowledge.

**AI architecture impact:** This is where the `confidence` and `lastSeen` fields in the tool responses become meaningful. The pre-computation layer filters through the AI's subjective view — assessments can only reference enemies the AI has actually seen, with staleness information. The briefing format gains a new dimension: distinguishing between confirmed enemy positions and last-known positions. The callback event `threat_escalation` should fire when a previously unseen enemy appears in a unit's visibility range (new contact), even if the AI didn't explicitly subscribe to it — add `new_contact(unitId)` to the mandatory override list.

**Playtest hypothesis:** Fog of war transforms the game from a puzzle into a contest of information. Scouting should feel valuable. You should experience genuine surprise when you discover the AI's forces. The AI's briefing should clearly distinguish confirmed vs. stale intelligence, and the AI should reason about uncertainty — sending scouts, hedging its deployments, avoiding overcommitting based on incomplete information.

**Design note:** The subjective-view architecture is also the foundation for multiplayer. Each player's state is already isolated and independent.

### Milestone 1.4 — Economy and Production

**Build:** Add a simple production system. Certain hexes generate resources each turn. Players spend resources to build new units, which appear at designated production hexes after 1–3 turns. Supply lines: units too far from a friendly production hex fight at reduced effectiveness.

**AI architecture impact:** The pre-computation layer adds economic data to the briefing — current resources, production queue status, available build options with costs and build times, and supply status per unit. The LLM issues production orders through its response JSON alongside unit orders (e.g., `{ "action": "build", "unitType": "armor", "productionHex": [...] }`). No new ad-hoc tools are needed — production decisions are strategic, not exploratory, and the briefing provides all the information the LLM needs to decide what to build and where. Production completion is a natural callback event: add `production_complete(unitType, hexId)` to the event vocabulary.

**Playtest hypothesis:** Resource scarcity forces meaningful trade-offs. The production system should make the early game feel different from the late game. The AI should make reasonable production decisions — building units appropriate to its strategic situation rather than randomly or always building the most expensive option.

**Keep it simple:** One resource type and a fixed production menu. Most depth comes from spatial decisions (where to build, where to deploy), not economic optimization.

### Milestone 1.5 — Unit Variety and the Global Roster

**Build:** Design and implement the global-level unit roster — the set of unit types that operate at H3 res 1 where each hex is ~610,000 km². This is a deliberate design exercise, not just a stats table. The prototype's infantry/armor/naval roster was designed for a small abstract map; the global map requires units scaled to represent large formations.

**Unit mix design process for this milestone:**

1. **Anchor to the hex scale.** At ~610,000 km² per hex, an "infantry" unit is not a division — it's an army group or field army. A "naval" unit is a fleet, not a destroyer. Name and describe units accordingly. The LLM reasons better about "Field Army" than "Infantry" when each hex is the size of France.

2. **Start with three types, expand only if playtesting demands it.** The prototype proved that three types (land/armor/naval) create interesting play. The global level may need the same three (rebalanced for the hex scale) or may need a fourth (air power or logistics). Do not start with more than four types. Add types only when you can point to a specific gameplay gap: "I need something that does X because no current unit can."

3. **Validate movement rates against the hex scale.** Infantry move 1 = one France-sized region per turn. This feels like a strategic redeployment taking weeks. Armor/mechanized move 2 = two regions per turn — a fast strategic thrust. Naval move 2–3 = fleet repositioning across ocean zones. Air move 3+ = rapid force projection. Do these rates create interesting pacing over 20–40 turns? Play and find out.

4. **Validate the combat system at this scale.** The A&A-style dice system from the prototype should carry forward, but attack/defense values may need rebalancing. At the global level, combat between France-sized hexes represents a major offensive operation, not a single battle. Each combat round should feel like a season of campaigning.

5. **Test LLM comprehension.** Play a game with the new roster and read the AI's strategy field. Is the LLM reasoning about the units by their roles? Does it build sensible force compositions? Does it understand the rock-paper-scissors dynamics? If not, adjust unit descriptions in the system prompt before adjusting stats.

**Terrain interactions at global scale.** Terrain modifiers matter at this level: armor should be weaker in mountain hexes (Alps, Himalayas), infantry should defend better in forest, naval is restricted to ocean. Desert, arctic, and mountain hexes should have movement penalties. These interactions create the strategic geography that makes the real-Earth map interesting — the game should reward players who read the terrain.

**Upgrade Tool 1:** BFS upgrades to A* with terrain-weighted movement costs. Tool 2 gains terrain modifier information. Tool 3 applies terrain combat modifiers. These changes are internal — the tool interfaces don't change, and the briefing format absorbs the new data naturally.

**Update the combat rules document.** The current combat rules (v1.0) define infantry/armor/naval with stats designed for the prototype's small abstract map. When the global roster is finalized, update the combat rules document to reflect the new unit names, stats, terrain modifiers, and any changes to the resolution procedure. This keeps the spec documents synchronized with the actual game state.

**Playtest hypothesis:** The unit mix creates interesting force composition decisions at the global scale. You shouldn't be able to win by massing a single unit type. Different continental theatres should favor different approaches — a Pacific strategy looks different from a European land war. The AI should build varied force compositions.

**External playtesting:** Get your first external playtester. Watch them play without helping. Take notes on confusion, boredom, and engagement. Pay particular attention to whether the global hex scale feels too abstract — if players want to zoom in, that's signal that Phase 3 is high priority.

### Milestone 1.6 — Game Scenarios and Win Conditions

**Build:** Create 2–3 preset scenarios on the real-Earth map: a contained regional conflict (e.g., European theatre — limit the playable area to ~50–80 global hexes), a two-front global scenario, and a free-play sandbox. Each scenario defines starting territories, forces, production centers, and victory conditions. Add a scenario selection screen and a basic end-game summary showing territory control over the course of the game.

**AI architecture impact:** Different scenarios may warrant different callback sensitivities. A fast-paced regional conflict might need more frequent LLM consultation than a sprawling global scenario where fronts are stable for many turns. Consider making the deadman timer (currently 5 turns) scenario-configurable. The end-game summary should include AI consultation statistics — how many times the AI was consulted, what events triggered consultations, total API cost for the game. This is interesting data for the player and essential data for you.

**Playtest hypothesis:** At least one scenario produces a consistently engaging 60–90 minute game experience with a beginning, middle, and end. When you finish a game, you want to play again with a different strategy.

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

- **System prompt personality** — strategic doctrine, risk tolerance, aggression level
- **Callback sensitivity** — aggressive AI subscribes to more frequent `turns(N)` with lower N and lower `threat_escalation` thresholds; cautious AI uses longer intervals and reacts mainly to direct contact
- **Briefing emphasis** — aggressive AI's briefing highlights offensive opportunities; cautious AI's briefing emphasizes defensive vulnerabilities

Difficulty scaling works through two levers: the model tier (player selects via their OpenRouter key) and information accuracy (on lower difficulty, combat estimates and threat assessments include a small error margin, simulating worse intelligence).

**Add the AI Observatory.** A panel where players can view: the briefing the AI received on its last consultation, the callback events that triggered the consultation, the AI's response (strategy summary and orders issued), and which turns the AI was and wasn't consulted. This is the transparency feature that no other strategy game offers. Make it a post-game feature initially (review after the game ends), with an option to view the last-turn briefing during play.

**Tiered model routing (optional, scope-dependent):** If the callback system is working well and consultations are infrequent enough, this may not be needed yet. But if cost or latency on larger maps still exceeds targets, implement a simple router: use the player's selected model for event-triggered consultations (the important decisions) and a cheaper model for the deadman-timer consultations (routine check-ins). This is a natural extension of the callback architecture — the event type determines the model tier.

**Playtest hypothesis:** Playing against the aggressive AI should feel noticeably different from playing against the cautious AI — not just in outcomes, but in pacing and texture. The AI Observatory should be fascinating to read after a game.

### Milestone 2.3 — Diplomacy and Alliances

**Build:** Multi-player support (3+ sides) with a diplomacy layer. Players can propose alliances (shared visibility, non-aggression), declare war, and negotiate peace. AI players make diplomatic decisions through the LLM with diplomatic context added to the briefing. Allied players share fog-of-war visibility. Alliances can be broken.

**AI architecture impact:** Diplomatic events are a natural addition to the callback vocabulary: `alliance_proposed(byPlayer)`, `alliance_broken(byPlayer)`, `war_declared(byPlayer)`. These are high-importance events that should always trigger a full consultation with the player's selected model. The briefing format gains a diplomacy section summarizing current relationships and recent diplomatic actions. The LLM's response format gains a `diplomaticActions` array.

The possibility of AI betrayal — the LLM deciding that breaking an alliance is strategically sound — is exactly the kind of emergent behavior that makes this system compelling. Don't prevent it; surface it in the AI Observatory.

**Playtest hypothesis:** Alliances create genuine diplomatic tension. You should feel uncertain about whether your AI ally will remain loyal.

### Milestone 2.4 — Sound Design and Game Feel

**Build:** Add audio: ambient music (1–3 tracks, licensed or AI-generated with commercial rights), UI feedback sounds, notification sounds. Add visual juice to the resolution phase: brief combat animations, smooth unit movement interpolation, camera auto-pan to significant engagements.

**Playtest hypothesis:** The resolution phase should feel like watching a story unfold. Sound and animation should make combat outcomes feel impactful — losing a unit should sting, destroying an enemy should satisfy.

### Milestone 2.5 — Save/Load and Session Management

**Build:** Full save and load. Since game state is in SQLite, this is largely about serializing the complete database state — including per-player subjective views, pending orders, AI memory, standing orders, active callback subscriptions, and turn counter — to a save file and restoring it cleanly. Auto-save at the start of each turn. Add turn replay: step through any previous turn's resolution, including the AI's briefing and response for turns where it was consulted.

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

2. **Start with the roles that matter at this scale.** The theatre level is where terrain interactions, combined arms, and rock-paper-scissors dynamics have the most impact. Start with 5–6 types: infantry, armor, artillery (ranged, can't move and fire same turn), naval surface, submarine (invisible until adjacent), and transport (carries land units across water). Add mechanized infantry and aircraft only if playtesting reveals the gap.

3. **Design the terrain interaction matrix.** At res 4, terrain should meaningfully shape tactics: armor strong on plains, penalized in mountains/forest; infantry defends well in forest and mountains; artillery range extends over flat terrain; naval restricted to ocean hexes. Build this matrix before assigning stats.

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

**Build:** Full integration pass. Theatre-level combat, production, fog of war, and economy all function correctly within the zoomed view. Scenarios from milestone 1.6 work with both zoom levels active. Balance pass on theatre-level unit stats, terrain modifiers, and attention budget constraints. Ensure the AI plays coherently across both levels — making sensible attention allocation decisions and issuing appropriate orders at whichever level it's focused on.

**Playtest hypothesis:** A complete game using both zoom levels should feel richer than the global-only experience, not more tedious. The theatre zoom should be something you want to use, not something you feel obligated to use. If the global-only game is still the preferred experience after this milestone, the attention mechanic or the theatre-level gameplay needs further tuning — but that's a balance problem, not an architectural one.

---

## Phase 4: Ship It (Milestones 4.1–4.4)

**Goal:** Prepare the game for public distribution.

### Milestone 4.1 — Onboarding and Tutorial

**Build:** A tutorial scenario teaching core mechanics through guided play — one concept per turn. Start at the global level; introduce the theatre zoom once the player is comfortable with the base mechanics. Also write a comprehensive reference manual as a searchable HTML document bundled with the game. Include a section explaining the AI system: how LLM opponents work, what the "bring your own API key" model means, how the AI Observatory works, and what the cost expectations are at different model tiers.

**Playtest hypothesis:** A strategy game player who has never seen your game should complete the tutorial and start a real scenario without asking questions.

### Milestone 4.2 — Platform Packaging

**Build:** Production builds for Windows, macOS, and Linux. Proper installers, application signing, auto-update, crash reporting. Steam SDK integration. Standalone GitHub releases. Test on machines that aren't yours.

**Playtest hypothesis:** Someone who isn't you can install and complete a full game on a clean machine.

### Milestone 4.3 — Community Beta

**Build:** Release to your Discord community and content creators. Instrument opt-in analytics: turn time, AI consultation frequency, AI model choices, callback trigger distribution, game length, cost per game, crash reports, zoom usage patterns (how often players use theatre zoom, which theatres they zoom into). Run a structured feedback cycle with specific questions.

**AI-specific analytics to capture:** Average consultations per game by scenario size. Most common callback triggers. Average cost per game by model tier and scenario. Distribution of ad-hoc tool calls during consultations (are players' AIs still needing ad-hoc tools, or does pre-computation cover everything?). Theatre zoom usage: do players engage with it, or do they stay at global level? These metrics will tell you whether the hybrid architecture and the two-level design are working as intended in the wild.

**Playtest hypothesis:** At least some beta players complete multiple full games voluntarily. Per-game AI cost with mid-tier models should be under $0.25 on standard scenarios.

### Milestone 4.4 — Launch

**Build:** Final polish based on beta feedback. Steam page updates, trailer, description. Simultaneously publish the free standalone build to GitHub releases — the dual-distribution model (free compiled builds on GitHub, paid convenience on Steam) should launch together, not sequentially. Price the Steam version at $15–20 for Early Access. Post-launch, commit to regular update cadence.

**Playtest hypothesis:** Launch week Steam reviews 80%+ positive.

---

## Cross-Cutting Concerns

**Community building** starts at Milestone 1.2 and continues throughout. The hybrid AI architecture is a unique technical story — the "LLM opponent that only thinks when something interesting happens" narrative is compelling for both wargaming and AI audiences.

**Playtesting** happens every milestone from 0.6 onward. External testers by Milestone 1.5. 3–5 regulars by end of Phase 2. Beta targets 20–50 players.

**Source control** uses GitHub from day one. Private repo, issues for tracking work.

**AI prompt engineering** is ongoing from 0.6 onward, but the nature of the work shifts. In the iterative tool-calling architecture, prompt engineering was about teaching the LLM to use tools effectively. In the hybrid architecture, it's about two different things: designing briefings that give the LLM the right information to make strategic decisions, and designing callback criteria descriptions that help the LLM set appropriate triggers. Keep a log of prompt iterations and their effects.

**Cost and latency monitoring** is a new cross-cutting concern. From 0.6 onward, every AI consultation should log: trigger event, pre-computation time, prompt token count, completion token count, ad-hoc tool calls, total wall-clock time, and estimated cost. This data is essential for tuning the system and is the foundation for the in-game cost display that BYOK players will expect.

**Unit roster iteration** is a cross-cutting design concern from 1.5 onward. The global roster (designed in 1.5) and the theatre roster (designed in 3.2) must both follow the same validation process: start minimal, expand only through playtesting, test LLM comprehension, and ensure asymmetric matchups. Resist the urge to design the theatre roster before Phase 3 — you'll know more about what the game needs after 6+ months of playing the global-level game.

---

## Estimated Timeline

Assuming 2-week milestones at 10–15 hours per week:

| Phase | Milestones | Calendar Time |
|-------|-----------|---------------|
| Phase 0 (continued): Hybrid Validation | 0.6–0.7 | 3–5 weeks |
| Phase 1: The Real Game | 1.1–1.6 | 10–14 weeks |
| Phase 2: Polish and Depth | 2.1–2.6 | 10–14 weeks |
| Phase 3: Theatre Zoom | 3.1–3.5 | 8–12 weeks |
| Phase 4: Ship It | 4.1–4.4 | 6–10 weeks |

**Total estimated range from current position: 9–14 months to launch.**

Phase 3 (theatre zoom) remains deferrable to post-launch if the global-level game is strong enough on its own. Without Phase 3, the range compresses to 7–11 months. That's a legitimate shipping strategy — launch the game that works, expand it once it has an audience. The unit relationship question (milestone 3.2) is the highest-risk element in Phase 3 — if it takes longer than two weeks, that's a signal to simplify rather than extend.

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
| `assess_unit` | All AI units | Yes — for assessing enemy units or re-assessing a friendly unit with a different scan radius |
| `assess_hex` | Contested hexes, objectives, chokepoints | Yes — for evaluating hexes the AI is considering but weren't pre-scanned |
| `estimate_combat` | All unit pairs within 2 turns of contact | Yes — for what-if scenarios with hypothetical force compositions |
| `plan_route` | Route updates for all standing march/pursue orders | Yes — for exploring hypothetical new routes |
| `check_distance` | Included in unit assessments | Yes — for quick comparisons during reasoning |

### Tools That Become Response-JSON-Only (write operations)

These tools are no longer available as ad-hoc tool calls. Their operations are issued through the LLM's response JSON instead, eliminating a dual-path ambiguity:

| Tool | Response JSON equivalent |
|------|------------------------|
| `assign_order` | `orders` array with `"action": "assign_order"` |
| `cancel_order` | `orders` array with `"action": "cancel_order"` |
| `memory_write` | `memoryUpdates` array with `"action": "write"` |
| `memory_delete` | `memoryUpdates` array with `"action": "delete"` |

### Tools That Remain Ad-Hoc Only (read operations)

| Tool | Reason |
|------|--------|
| `memory_read` | The LLM retrieves stored-tier memories by key or tag during reasoning — inherently interactive, cannot be pre-computed because the engine doesn't know which stored memories the LLM will need |
| `query_orders` | Standing order summary is in the briefing, but the LLM may need detailed order parameters beyond what the summary provides |

### New System: Callback Event Engine

Not a tool the LLM calls, but a new output the LLM produces. The LLM includes callback subscriptions in its response. The engine evaluates them each turn. This replaces the implicit "call me every turn" contract.

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
  1. Engine resolves previous turn
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