# Game Vision Document

*Version 2.0 — March 2026*

---

## What I'm Building

A turn-based grand strategy wargame on a real-Earth hex map where every opponent — human or AI — plays through the same fog of war, the same incomplete picture, and the same simultaneous turn resolution. The AI opponents are powered by LLMs via OpenRouter, using player-provided API keys. No other commercial strategy game does this.

The game plays like Axis & Allies at its core — a simple but diverse unit mix, straightforward economics, and decisions driven by geography rather than spreadsheet optimization — but on a detailed global map derived from real geospatial data, with fog of war that makes every player's view subjective and incomplete.

## What Makes This Different

**LLM-powered opponents.** Every AI player reasons about the game through a suite of deterministic tool services — querying what they can see, evaluating terrain, estimating combat outcomes, issuing orders. The LLM handles strategy; the tools handle precision. Players choose what model backs each AI opponent and pay for it through their own OpenRouter key, which means I don't need server infrastructure and players control both the cost and the quality of their opponents. The AI's reasoning is transparent — players can optionally inspect the tool calls, the game state the AI saw, and even manipulate those inputs to create more interesting games. These transparency features are controllable game-level options, not always-on defaults.

**Two-level command with attention as a strategic resource.** The map operates at two scales built on Uber's H3 hierarchical hex grid. The global level (H3 resolution 1, ~842 hexes at ~610,000 km² each — roughly France-sized) shows the entire Earth and is where you make strategic commitments: allocate forces across theatres, manage the economy, set the overall war plan. The theatre level (H3 resolution 4, ~1,770 km² per hex, ~42 km edge-to-edge) zooms into a single global hex to reveal ~343 child hexes at division scale — this is where you manage individual units, plan maneuvers, and fight battles.

The attention mechanic is the bridge between them. Each turn, a player operates at one level: either the global level, issuing broad directives that the engine executes through standing orders, or zoomed into a single theatre for finer control. You cannot do both in the same turn — choosing to zoom into a theatre means your other theatres run on autopilot, and choosing to stay at the global level means every theatre runs on standing orders without fine-grained intervention. This is a strict constraint, not a soft guideline. The AI manages its own attention independently under the same budget — and after each turn, players can optionally view where the AI chose to focus, where it didn't, and how that compared to their own allocation. Areas outside anyone's focus continue executing their last orders through deterministic engine resolution.

**Subjective fog of war.** No player — human or AI — ever sees the true state of the board. You see what your units can see, period. The AI receives only its own subjective view through the same tool services. Different players can have contradictory pictures of the same part of the map, and both can be wrong. This isn't a feature bolted on top — it's the foundation of the game state architecture.

**WEGO simultaneous resolution.** All players issue orders, then all orders resolve at once. This creates a planning-and-anticipation rhythm that maps naturally to how LLMs reason — they're committing to a plan based on incomplete information, exactly like a real commander. It also means the moment of resolution is genuinely suspenseful, because you don't know what anyone else committed to until you see it play out.

**Land, water, and air.** The initial release covers three domains: ground forces from infantry to armor, naval surface and subsurface units, and aircraft operating from bases with limited range. The unit roster at each zoom level is deliberately small — the design philosophy is fewer types with clearly distinct roles rather than a sprawling roster with overlapping capabilities (see Unit Roster below). Space-based assets for surveillance and communication are a potential post-launch expansion if the game's scope warrants it, but they are not part of the initial design.

## The Map

The two zoom levels correspond to two distinct command experiences, each with its own hex scale, unit roster, and decision texture.

**Global level (H3 resolution 1).** ~842 hexes covering the entire Earth. Each hex is roughly the size of France or Ukraine (~610,000 km²). At this scale, you see the whole war at a glance — continental force distributions, strategic commitments, resource flows. Terrain is broadly categorized: ocean, land, forest, mountain, desert, arctic. The global map is always visible as a minimap and serves as the default planning surface.

**Theatre level (H3 resolution 4).** ~343 hexes per global hex, each ~1,770 km² (~42 km edge-to-edge). This is division-scale command. Terrain gains tactical significance — mountain passes, river crossings, coastal approaches, defensible ridgelines. Individual unit types interact differently with terrain. A complete theatre view (one zoomed global hex) fits within the ~400-hex rendering performance budget.

The jump from res 1 to res 4 spans three H3 hierarchy levels, giving a natural parent-child relationship between global hexes and their theatre-level children. This clean mapping means the zoom transition is architecturally simple: select a global hex, render its res-4 children.

## Unit Roster: Design Approach

The two zoom levels call for two distinct but related unit rosters, each designed for the decisions that matter at that scale.

### Design Process

The unit mix at each level follows the same validation process:

1. **Start from the hex scale.** What real-world military formation operates at this geographic resolution? What moves through one hex in one turn? The answer anchors the roster in physical plausibility and sets the pacing of the game.

2. **Define roles before stats.** Each unit type must answer the question "what unique thing can this unit do that no other unit does?" If two units fill the same role at the same scale, one of them shouldn't exist. Roles include: holding ground, breaking through, projecting force at range, scouting, sea control, transport, and area denial.

3. **Ensure asymmetric matchups.** The roster must create rock-paper-scissors dynamics that force composition decisions. If massing a single unit type is the dominant strategy, the roster has failed. Every unit type should have at least one matchup where it's strong and one where it's vulnerable.

4. **Keep it LLM-legible.** The AI opponent must reason about force composition. Fewer unit types with clear, distinct roles produce better AI reasoning than many types with subtle statistical differences. The LLM doesn't need twelve unit types to play interestingly — it needs four to six where the strategic trade-offs are obvious from the descriptions.

5. **Expand only through playtesting.** Start with the minimum roster that produces interesting decisions. Add a new unit type only when playtesting reveals a gap: "I need something that does X because the current roster can't express Y." Never add a unit type because it seems like it should exist.

### Global Level Roster (H3 Res 1)

At ~610,000 km² per hex, individual divisions don't exist. Units at this scale represent large aggregate formations — army groups, naval task forces, air commands. The global roster should be simple (3–5 types) because the decisions at this level are about where to commit force, not how to compose it.

**Candidate roles to fill** (not a final roster — to be validated through prototyping):

- A land force that holds and takes territory (army group equivalent, move 1 hex/turn — one major region per turn, matching a realistic strategic redeployment pace)
- A naval force that controls sea lanes and projects power to coastal hexes (fleet equivalent, move 2, range 2)
- An air/ranged force that strikes at distance but can't hold ground (air command equivalent, high mobility, fragile)
- Possibly a logistics/supply unit if the economy system demands visible supply chains at the global level

The global roster is validated when: the LLM reasons clearly about force allocation, production decisions feel meaningful, and games at this level alone produce interesting strategic tension for 15–30 turns.

### Theatre Level Roster (H3 Res 4)

At ~1,770 km² per hex (~42 km edge), individual divisions and brigades operate. This is where the full unit variety lives. Movement rates map to historically plausible operational tempos: infantry at 1 hex/turn is a day's march for a WW2-era division (~42 km); armor at 2 hexes/turn is a fast mechanized exploitation (~84 km).

**Candidate roles to fill** (starting set — expand through playtesting):

- Infantry: holds ground, defends well in terrain, cheap, slow
- Armor: offensive punch, fast, strong on open ground, weak in mountains/forest
- Mechanized infantry: balanced mobile force, moves with armor, fights like infantry
- Artillery: ranged fire support, can't move and fire same turn, force multiplier
- Fighter aircraft: fast, limited range from airbases, air superiority and interdiction
- Naval surface: sea control, coastal bombardment, range 2
- Submarine: invisible until adjacent, area denial, anti-shipping
- Transport: carries land units across water, vulnerable, essential for amphibious operations

This roster is validated when: no single unit type dominates, terrain creates meaningful deployment decisions, and the LLM builds varied force compositions that adapt to geography.

### The Zoom Transition Question

When a player zooms from a global hex into its theatre view, how do global-level units relate to theatre-level units? This is a Phase 3 design decision with several viable approaches:

- **Decomposition:** A global "Army" breaks into a fixed or player-configured mix of theatre-level units when you zoom in. This is the most realistic but most complex.
- **Abstraction boundary:** Global and theatre units are separate systems. The global level tracks aggregate strength; the theatre level has its own units that exist independently. Simpler to implement, but the zoom feels like switching games.
- **Unified with aggregation:** Theatre-level units are the "real" units. The global view aggregates them into summary markers. Zooming in reveals the actual composition. Most elegant, but requires theatre-level units to exist everywhere, which has storage and AI complexity implications.

The right answer will emerge from prototyping in Phase 3. For Phase 1 (global level only), design the global roster as an independent system. For Phase 3 (adding theatre zoom), evaluate these approaches based on which one makes the zoom transition feel like assuming a different level of command rather than switching games.

## The Interface

The UI is a conventional desktop application dominated by the map view, not a full-screen game engine display. Think Command: Modern Operations or the old Harpoon series, but significantly stripped down to drive map-focused decision making with a simpler unit mix. Interaction is mouse-driven with keyboard accelerators for common actions, supporting more fluid play for experienced players. Information panels are collapsible and subordinate to the map. This is a deliberate choice — it plays to web technology's strengths for complex information-dense layouts and keeps the player's attention on geography and spatial decisions.

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

A shipped game that people want to play more than once against AI opponents that feel like they're thinking. A small but engaged community. My name associated with a real, finished product in a space I care about. Everything else — the theatre zoom level, expanded multiplayer, additional scenarios — is expansion on that foundation, not a prerequisite for it.

## Development Approach

The game develops in phases. Phase 0 is a throwaway prototype that validates whether LLM opponents produce interesting play on a tiny hex map. Phase 1 builds the real single-player game at the global zoom level on a real-Earth map. Phase 2 polishes the UI, deepens the AI, and adds Early Access features. Phase 3 adds the theatre zoom level with the attention mechanic. Phase 4 ships it.

Every milestone produces something playable and includes a hypothesis about what the player experience should feel like. The architectural validation matters, but the experience validation is the point. If it doesn't feel like a game worth playing, the code quality is irrelevant.

The most important checkpoint is the first complete game against an LLM opponent. If that's not fun, nothing else matters until I understand why.