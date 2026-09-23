# Game Vision Document

*Version 3.1 — August 2026 (intent plus live 2.4.0 implementation)*

This is the product intent document. **Where a roster, fog radius, cost, cap, or phase claim disagrees with the engine, the engine and [combat-rules-v3.md](combat-rules-v3.md) win.** Unbuilt surfaces (player-facing save/load, diplomacy, async multiplayer, Steam/Discord shipping) remain intent.

**Implementation status (2.4.0):** The global strategic game, hybrid OpenRouter AI, fog of war, production, air, sealift, and optional res4 tactical battles are playable. Milestone 2.5 (save/load) is not shipped. Tactical battles are not deferred.

---

## What I'm Building

A turn-based grand strategy wargame on a real-Earth hex map where every opponent — human or AI — plays through the same fog of war, the same incomplete picture, and the same simultaneous turn resolution. The AI opponents are powered by LLMs via OpenRouter, using player-provided API keys. No other commercial strategy game does this.

The game plays like Axis & Allies at its core — a simple but diverse unit mix, straightforward economics, and decisions driven by geography rather than spreadsheet optimization — but on a detailed global map derived from real geospatial data, with fog of war that makes every player's view subjective and incomplete.

## What Makes This Different

**LLM-powered opponents.** Every AI player reasons about the game through a suite of deterministic tool services — querying what they can see, evaluating terrain, estimating combat outcomes, issuing orders. The LLM handles strategy; the tools handle precision. Players choose what model backs each AI opponent and pay for it through their own OpenRouter key, which means I don't need server infrastructure and players control both the cost and the quality of their opponents. The AI's reasoning is transparent — players can optionally inspect the tool calls, the game state the AI saw, and even manipulate those inputs to create more interesting games. These transparency features are controllable game-level options, not always-on defaults.

**Two-level command: strategic and tactical.** The map operates at two scales built on Uber's H3 hierarchical hex grid. The global level (H3 resolution 1, ~842 hexes at ~610,000 km² each — roughly France-sized) shows the entire Earth and is where you make strategic commitments: allocate forces across theatres, manage the economy, set the overall war plan. The tactical level (H3 resolution 4, ~1,770 km² per hex, ~42 km edge-to-edge) zooms into a single global hex to reveal ~343 child hexes — this is where you fight battles at division scale.

The tactical game is optional and triggered by contact. During planning, a magnifier appears on contested explored res1 hexes. During WEGO resolution, a melee-intercept dialog can offer Fight or Ignore before strategic melee. Accepting pauses the rest of the strategic map. This is the Total War model: zoom in to fight, or skip it and let the engine resolve with strategic-level dice. You can exit mid-battle; remaining sub-units map back to strategic parents with a strict less-than-half survival threshold (exact half survives; see combat rules §12.8–§12.9). There is no extra dice-with-modifiers pass on exit.

This design means the tactical layer doesn't need to be perfect to ship — it's an enhancement to the strategic game, not a dependency. Players who prefer the grand strategic view can ignore it entirely.

**Subjective fog of war.** When fog is on, no player — human or AI — sees the true state of the whole board. You see the disk your units can see: infantry 1 hex, armor 2, naval 2, air 3 from base. Last-known enemy positions persist for two turns after contact is lost, then drop. The AI receives only its own subjective view through the same tool services. Fog can be turned off for a match. Tactical battles have universal visibility inside the footprint.

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
| **Infantry** | 1 | 1 | 2 | 0 (melee only) | Land | 20 |
| **Armor** | 2 | 3 | 2 | 1 (adjacent hex) | Land | 40 |
| **Naval** | 2 | 2 | 2 | 2 hexes | Water | 100 |
| **Air** | 0 (ferry only) | 3 | 1 | 3 (strike radius) | Air | 60 |

Per-side caps scale with match size (Small 12/8/8/6 infantry/armor/naval/air; Medium ×2; Large ×4). See [game-size-unit-caps.md](game-size-unit-caps.md). Build prerequisites: infantry 1 urban hex; armor 2 urban; naval 10 urban + seaport; air 5 urban + airport.

The global roster is validated when: the LLM reasons clearly about force allocation, production decisions feel meaningful, and games at this level alone produce interesting strategic tension for 15–30 turns.

**Live scenario:** [`region_vs_region`](region-vs-region.md). Each side has a home region. Win at end of turn by controlling every res1 hex that intersects the enemy home region, or by eliminating all urban production in the enemy home region while your own home still has urban hexes. Both home-region outlines are always visible. Destroying the last enemy unit also ends the match.

### Tactical Level: Unit Multiplication

The tactical level does not have a separate unit roster. Instead, strategic units entering a tactical battle are decomposed into sub-units that share the same type identity but operate independently on the res4 hex grid.

| Strategic Unit | Tactical Sub-Units | Rationale |
|---------------|-------------------|-----------|
| 1 Infantry | 12 sub-units | Large formations, many divisions to maneuver |
| 1 Armor | 6 sub-units | Fewer but more powerful formations |
| 1 Air | 3 sub-units | Small number of air wings |
| 1 Naval | 2 sub-units | Major task force components |

Tactical ranged baselines (res4 steps): infantry 2, armor 5, naval 10, air anywhere in the footprint. Movement-point budgets on flat terrain: infantry 2, armor 4, naval 3.

Sub-units inherit their parent's type identity for purposes of terrain interaction, combat, and movement. The multiplication ratios are starting values subject to playtesting — the goal is enough sub-units to create interesting maneuver decisions without overwhelming the player or the LLM.

When a tactical battle ends by annihilation, the empty side's parents are already gone. On human voluntary exit, a parent is destroyed when fewer than half of its placed sub-units remain; exact half survives. Strategic units stay binary — alive or dead.

### The Zoom Transition

When units from opposing sides share a res1 hex, the player may choose to fight a tactical battle. The transition works as follows:

1. **Entry-side injection.** Each strategic unit's sub-units are placed on the res4 hex grid at the edge corresponding to the direction from which the unit entered the res1 hex. The engine tracks the previous strategic hex. This rewards strategic positioning — approaching from multiple directions creates tactical advantages.

2. **Tactical play.** The player maneuvers sub-units across the res4 grid using movement-point budgets, terrain enter costs, road/rail, and ranged fire with mountain LOS (see Combat Rules §12). The rest of the strategic map is paused.

3. **Resolution.** The tactical battle ends when one side is annihilated or the player exits. Voluntary exit maps remaining sub-units back with the less-than-half rule; there is no second dice pass. An immediate exit with a full roster therefore returns the same strategic units that entered.

**Visibility in tactical battles is universal** — all sub-units on both sides are visible regardless of terrain. This is a deliberate simplification that keeps the tactical layer playable and keeps the LLM's decision space tractable.

## The Interface

The UI is a conventional desktop application dominated by the map view, not a full-screen game engine display. Think Command: Modern Operations or the old Harpoon series, but significantly stripped down to drive map-focused decision making with a simpler unit mix. Interaction is mouse-driven with keyboard accelerators for common actions, supporting more fluid play for experienced players. Information panels are collapsible and subordinate to the map. This is a deliberate choice — it plays to web technology's strengths for complex information-dense layouts and keeps the player's attention on geography and spatial decisions.

When a tactical battle is triggered, the map view zooms into the res4 grid of the contested hex. An exit control returns to strategic mapping (voluntary-exit mapping, combat rules §12.8). The transition should feel like a general leaning over a regional map — assuming a different level of command, not switching games.

## Who This Is For

Strategy wargame players who are frustrated by decades of scripted AI opponents that cheat instead of think. The audience skews older, more technical, and more patient than mainstream gaming — people who play Hearts of Iron IV, Strategic Command, or Combat Mission and wish the AI were smarter. They're willing to pay for depth, they value transparency in game systems, and they'll find the "bring your own AI" model intriguing rather than intimidating.

## Multiplayer

The game supports any mix of human and AI players. The primary experience is single-player against one LLM opponent on the real-Earth map (region-vs-region home regions). Human-vs-human async turn exchange and real-time networked multiplayer are not shipped.

## How I'm Building It

Electron desktop application, TypeScript, SQLite (better-sqlite3) for game state. H3 for spatial indexing at two resolutions (res 1 for global, res 4 for tactical). Leaflet plus canvas overlay for map rendering. OpenRouter for LLM integration (BYOK). Six tool groups (pathfinding, assessment, combat estimation, memory, standing orders, production) — [ai-tools.md](ai-tools.md). Hybrid loop: [hybrid-ai.md](hybrid-ai.md). AI-assisted development with Cursor, spec-driven.

The map data comes from Natural Earth shapefiles preprocessed into H3 cells at both resolutions, with per-hex terrain metadata, urban/airport/seaport features, and road/rail side masks. Runtime loads generated JSON under `data/generated/`.

## How I'm Shipping It

*Intent, not current distribution.* Live builds are developer / side-load Electron packages (electron-builder). There is no Steam listing or public GitHub-releases pipeline in this tree yet.

Free builds on GitHub under my name. Paid convenience builds on Steam. The code is not open source — the GitHub repository hosts compiled builds and release notes, not the source. The Steam listing makes it clear that the free version always exists and the paid version is a way to get managed installation and support the project. This follows the model proven by Dwarf Fortress and others. The goal is to build a player base and a reputation as a developer in this space, not to maximize short-term revenue.

Community building starts early — Discord server and devlog from the first real-map milestone, engagement with wargaming communities and content creators, Early Access on Steam once the core loop is solid.

## What Success Looks Like

A shipped game that people want to play more than once against AI opponents that feel like they're thinking. A small but engaged community. My name associated with a real, finished product in a space I care about. Everything else — the tactical zoom level, expanded multiplayer, additional scenarios — is expansion on that foundation, not a prerequisite for it.

## Development Approach

The original roadmap treated Phase 0 as a throwaway prototype, Phase 1 as the global game, Phase 2 as polish, Phase 3 as tactical, and Phase 4 as ship. **That numbering is historical.** The live plan in [devleopment-plan-v3.3.md](devleopment-plan-v3.3.md) moved tactical battles into Phase 2 (milestones 2.1–2.5). As of 2.4.0, hybrid AI validation, the global strategic game, and tactical battles through 2.4 are complete. Save/load (2.5) and Phase 3 polish are not shipped.

Every milestone still aims at something playable. The tactical layer is no longer deferrable in the sense of "not built" — it is in the current build and remains skippable in play.