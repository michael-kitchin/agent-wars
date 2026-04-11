# Game Vision Document

*Version 3.0 — April 2026*

---

## What I'm Building

A turn-based grand strategy wargame on a real-Earth hex map where every opponent — human or AI — plays through the same fog of war, the same incomplete picture, and the same simultaneous turn resolution. The AI opponents are powered by LLMs via OpenRouter, using player-provided API keys. No other commercial strategy game does this.

The game plays like Axis & Allies at its core — a simple but diverse unit mix, straightforward economics, and decisions driven by geography rather than spreadsheet optimization — but on a detailed global map derived from real geospatial data, with fog of war that makes every player's view subjective and incomplete.

## What Makes This Different

**LLM-powered opponents.** Every AI player reasons about the game through a suite of deterministic tool services — querying what they can see, evaluating terrain, estimating combat outcomes, issuing orders. The LLM handles strategy; the tools handle precision. Players choose what model backs each AI opponent and pay for it through their own OpenRouter key, which means I don't need server infrastructure and players control both the cost and the quality of their opponents. The AI's reasoning is transparent — players can optionally inspect the tool calls, the game state the AI saw, and even manipulate those inputs to create more interesting games. These transparency features are controllable game-level options, not always-on defaults.

**Two-level command: strategic and tactical.** The map operates at two scales built on Uber's H3 hierarchical hex grid. The global level (H3 resolution 1, ~842 hexes at ~610,000 km² each — roughly France-sized) shows the entire Earth and is where you make strategic commitments: allocate forces across theatres, manage the economy, set the overall war plan. The tactical level (H3 resolution 4, ~1,770 km² per hex, ~42 km edge-to-edge) zooms into a single global hex to reveal ~343 child hexes — this is where you fight battles at division scale.

The tactical game is optional and triggered by contact: when your units and enemy units share the same res1 hex, the UI offers a "tactical battle" option. Accepting pauses the strategic game entirely — no other hexes resolve while you're fighting the tactical battle. This is the Total War model: zoom in to fight, or skip it and let the engine resolve the battle using strategic-level dice rolls. You can also bail out mid-battle, in which case the remaining forces resolve automatically with modifiers that account for losses already taken. An immediate bail-out produces results similar to a standard strategic engagement, so there's no incentive to game the system.

This design means the tactical layer doesn't need to be perfect to ship — it's an enhancement to the strategic game, not a dependency. Players who prefer the grand strategic view can ignore it entirely.

**Subjective fog of war.** No player — human or AI — ever sees the true state of the board. You see what your units can see, period. The AI receives only its own subjective view through the same tool services. Different players can have contradictory pictures of the same part of the map, and both can be wrong. This isn't a feature bolted on top — it's the foundation of the game state architecture.

**WEGO simultaneous resolution.** All players issue orders, then all orders resolve at once. This creates a planning-and-anticipation rhythm that maps naturally to how LLMs reason — they're committing to a plan based on incomplete information, exactly like a real commander. It also means the moment of resolution is genuinely suspenseful, because you don't know what anyone else committed to until you see it play out.

**Land, water, and air.** The initial release covers three domains: ground forces from infantry to armor, naval surface units, and aircraft operating from bases with limited range. The unit roster at each zoom level is deliberately small — the design philosophy is fewer types with clearly distinct roles rather than a sprawling roster with overlapping capabilities (see Unit Roster below). Space-based assets for surveillance and communication are a potential post-launch expansion if the game's scope warrants it, but they are not part of the initial design.

## The Map

The two zoom levels correspond to two distinct command experiences, each with its own hex scale and decision texture.

**Global level (H3 resolution 1).** ~842 hexes covering the entire Earth. Each hex is roughly the size of France or Ukraine (~610,000 km²). At this scale, you see the whole war at a glance — continental force distributions, strategic commitments, resource flows. Terrain is broadly categorized: ocean, land, forest, mountain, desert, arctic. The global map is always visible as a minimap and serves as the default planning surface.

**Tactical level (H3 resolution 4).** ~343 hexes per global hex, each ~1,770 km² (~42 km edge-to-edge). This is division-scale combat. Terrain gains tactical significance — mountain passes through ranges, river crossings, coastal approaches, forested regions. The tactical map is visible only during a tactical battle within one global hex.

The jump from res 1 to res 4 spans three H3 hierarchy levels, giving a natural parent-child relationship between global hexes and their tactical-level children. This clean mapping means the zoom transition is architecturally simple: select a global hex with contested units, render its res-4 children, and inject forces.

## Unit Roster: Design Approach

### Design Process

The unit mix follows a consistent validation process:

1. **Start from the hex scale.** What real-world military formation operates at this geographic resolution? What moves through one hex in one turn? The answer anchors the roster in physical plausibility and sets the pacing of the game.

2. **Define roles before stats.** Each unit type must answer the question "what unique thing can this unit do that no other unit does?" If two units fill the same role at the same scale, one of them shouldn't exist. Roles include: holding ground, breaking through, projecting force at range, scouting, sea control, transport, and area denial.

3. **Ensure asymmetric matchups.** The roster must create rock-paper-scissors dynamics that force composition decisions. If massing a single unit type is the dominant strategy, the roster has failed. Every unit type should have at least one matchup where it's strong and one where it's vulnerable.

4. **Keep it LLM-legible.** The AI opponent must reason about force composition. Fewer unit types with clear, distinct roles produce better AI reasoning than many types with subtle statistical differences. The LLM doesn't need twelve unit types to play interestingly — it needs four to six where the strategic trade-offs are obvious from the descriptions.

5. **Expand only through playtesting.** Start with the minimum roster that produces interesting decisions. Add a new unit type only when playtesting reveals a gap: "I need something that does X because the current roster can't express Y." Never add a unit type because it seems like it should exist.

### Global Level Roster (H3 Res 1)

At ~610,000 km² per hex, individual divisions don't exist. Units at this scale represent large aggregate formations — army groups, naval task forces, air commands. The global roster is simple (4 types) because the decisions at this level are about where to commit force, not how to compose it.

| Unit type | Move | Attack | Defense | Range | Domain | Cost |
|-----------|------|--------|---------|-------|--------|------|
| **Infantry** | 1 | 1 | 2 | 0 (melee only) | Land | 10 |
| **Armor** | 2 | 3 | 2 | 1 (adjacent hex) | Land | 20 |
| **Naval** | 2 | 2 | 2 | 2 hexes | Water | 50 |
| **Air** | 0 (ferry only) | 3 | 1 | 3 (strike radius) | Air | 30 |

Unit caps: 10 infantry, 5 armor, 5 naval, 3 air (23 total). Fallback if playtesting shows 23 is too many for LLM briefing quality: 8 infantry, 4 armor, 4 naval, 2 air (18 total).

The global roster is validated when: the LLM reasons clearly about force allocation, production decisions feel meaningful, and games at this level alone produce interesting strategic tension for 15–30 turns.

### Tactical Level: Unit Multiplication

The tactical level does not have a separate unit roster. Instead, strategic units entering a tactical battle are decomposed into sub-units that share the same type identity but operate independently on the res4 hex grid.

| Strategic Unit | Tactical Sub-Units | Rationale |
|---------------|-------------------|-----------|
| 1 Infantry | 12 sub-units | Large formations, many divisions to maneuver |
| 1 Armor | 6 sub-units | Fewer but more powerful formations |
| 1 Air | 3 sub-units | Small number of air wings |
| 1 Naval | 2 sub-units | Major task force components |

Sub-units inherit their parent's type identity for purposes of terrain interaction, combat, and movement. The multiplication ratios are starting values subject to playtesting — the goal is enough sub-units to create interesting maneuver decisions without overwhelming the player or the LLM.

When a tactical battle ends (all opponents eliminated or the player bails out), surviving sub-units are mapped back to their parent strategic unit's effective strength for the bail-out resolution modifier or, if the battle concluded decisively, the parent unit is either destroyed or survives at full strength. The mapping-back mechanic is deliberately simple: the sub-unit ratio determines proportional loss. If 8 of 12 infantry sub-units survive, the parent infantry unit survives; if fewer than half survive and the battle is resolved by bail-out, the modifier reflects severe attrition.

### The Zoom Transition

When units from opposing sides share a res1 hex, the player may choose to fight a tactical battle. The transition works as follows:

1. **Entry-side injection.** Each strategic unit's sub-units are placed on the res4 hex grid at the edge corresponding to the direction from which the unit entered the res1 hex. The engine tracks which hex side each unit crossed during strategic movement. This rewards strategic positioning — approaching from multiple directions creates tactical advantages.

2. **Tactical play.** The player maneuvers sub-units across the res4 grid using movement budgets, terrain interactions, and ranged fire (see Combat Rules §12 for details). The strategic game is paused.

3. **Resolution.** The tactical battle ends when all enemy sub-units are eliminated or the player bails out. On bail-out, remaining sub-units resolve via automatic dice rolls with modifiers that converge toward strategic-level combat odds when no tactical losses have occurred. This prevents the exploit of entering tactical mode for an advantage and immediately bailing out.

**Visibility in tactical battles is universal** — all sub-units on both sides are visible regardless of terrain. This is a deliberate simplification that keeps the tactical layer playable and keeps the LLM's decision space tractable.

## The Interface

The UI is a conventional desktop application dominated by the map view, not a full-screen game engine display. Think Command: Modern Operations or the old Harpoon series, but significantly stripped down to drive map-focused decision making with a simpler unit mix. Interaction is mouse-driven with keyboard accelerators for common actions, supporting more fluid play for experienced players. Information panels are collapsible and subordinate to the map. This is a deliberate choice — it plays to web technology's strengths for complex information-dense layouts and keeps the player's attention on geography and spatial decisions.

When a tactical battle is triggered, the map view zooms smoothly into the res4 grid of the contested hex. A "return to strategic" button allows the player to bail out at any time. The transition should feel like a general leaning over a regional map — assuming a different level of command, not switching games.

## Who This Is For

Strategy wargame players who are frustrated by decades of scripted AI opponents that cheat instead of think. The audience skews older, more technical, and more patient than mainstream gaming — people who play Hearts of Iron IV, Strategic Command, or Combat Mission and wish the AI were smarter. They're willing to pay for depth, they value transparency in game systems, and they'll find the "bring your own AI" model intriguing rather than intimidating.

## Multiplayer

The game supports any mix of human and AI players. The primary experience is single-player against one or more LLM opponents, but the architecture is designed so that human players can join through asynchronous turn exchange — essentially modernized play-by-email, with no server infrastructure required. Each human player hosts their own AI opponents locally. Real-time networked multiplayer is not planned for initial release but the WEGO turn structure and per-player subjective state make it architecturally feasible as a future addition.

## How I'm Building It

Electron desktop application, TypeScript, SQLite for game state. H3 for spatial indexing at two resolutions (res 1 for global, res 4 for theatre). Canvas or WebGL for map rendering. OpenRouter for LLM integration. AI-assisted development with RooCode and Cursor, spec-driven with playable milestones every two weeks.

The map data comes from Natural Earth shapefiles preprocessed through PostGIS into H3 cells at both resolutions, with terrain stored using a sparse hierarchical scheme — ocean is null, homogeneous land regions are stored as ranges at coarse resolution, and fine-grained terrain data only exists at res 4 where geographic variation creates tactical significance.

## How I'm Shipping It

Free builds on GitHub under my name. Paid convenience builds on Steam. The code is not open source — the GitHub repository hosts compiled builds and release notes, not the source. The Steam listing makes it clear that the free version always exists and the paid version is a way to get managed installation and support the project. This follows the model proven by Dwarf Fortress and others. The goal is to build a player base and a reputation as a developer in this space, not to maximize short-term revenue.

Community building starts early — Discord server and devlog from the first real-map milestone, engagement with wargaming communities and content creators, Early Access on Steam once the core loop is solid.

## What Success Looks Like

A shipped game that people want to play more than once against AI opponents that feel like they're thinking. A small but engaged community. My name associated with a real, finished product in a space I care about. Everything else — the tactical zoom level, expanded multiplayer, additional scenarios — is expansion on that foundation, not a prerequisite for it.

## Development Approach

The game develops in phases. Phase 0 is a throwaway prototype that validates whether LLM opponents produce interesting play on a tiny hex map. Phase 1 builds the real single-player game at the global zoom level on a real-Earth map. Phase 2 polishes the UI, deepens the AI, and adds Early Access features. Phase 3 adds the optional tactical battle layer. Phase 4 ships it.

Every milestone produces something playable and includes a hypothesis about what the player experience should feel like. The architectural validation matters, but the experience validation is the point. If it doesn't feel like a game worth playing, the code quality is irrelevant.

The tactical layer (Phase 3) is deferrable to post-launch if the global-level game is strong enough on its own. The optional bail-out design ensures the strategic game is complete without it. If players consistently express a desire to zoom in and fight battles directly, that's strong signal to prioritize Phase 3. If the strategic game satisfies on its own, the tactical layer becomes a post-launch expansion.

The most important checkpoint is the first complete game against an LLM opponent. If that's not fun, nothing else matters until I understand why.