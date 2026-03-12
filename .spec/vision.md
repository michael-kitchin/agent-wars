# Game Vision Document

*March 2026*

---

## What I'm Building

A turn-based grand strategy wargame on a real-Earth hex map where every opponent — human or AI — plays through the same fog of war, the same incomplete picture, and the same simultaneous turn resolution. The AI opponents are powered by LLMs via OpenRouter, using player-provided API keys. No other commercial strategy game does this.

The game plays like Axis & Allies at its core — a simple but diverse unit mix, straightforward economics, and decisions driven by geography rather than spreadsheet optimization — but on a detailed global map derived from real geospatial data, with fog of war that makes every player's view subjective and incomplete.

## What Makes This Different

**LLM-powered opponents.** Every AI player reasons about the game through a suite of deterministic tool services — querying what they can see, evaluating terrain, estimating combat outcomes, issuing orders. The LLM handles strategy; the tools handle precision. Players choose what model backs each AI opponent and pay for it through their own OpenRouter key, which means I don't need server infrastructure and players control both the cost and the quality of their opponents. The AI's reasoning is transparent — players can optionally inspect the tool calls, the game state the AI saw, and even manipulate those inputs to create more interesting games. These transparency features are controllable game-level options, not always-on defaults.

**Attention as a strategic resource.** The map supports multiple zoom levels, from theatre scale (the whole world) down to roughly 1km resolution at brigade level, built on Uber's H3 hierarchical hex grid. Players can manage everything at theatre level, or zoom in for finer control at the cost of attention elsewhere. Zooming in one level allows management of 2–3 divisional-scale areas per turn. Zooming to brigade level limits focus to a single area per turn. The AI manages its own attention independently under the same budget constraints — and after each turn, players can optionally view where the AI chose to focus, where it didn't, and how that compared to their own allocation. Areas outside anyone's focus continue executing their last orders through deterministic engine resolution.

**Subjective fog of war.** No player — human or AI — ever sees the true state of the board. You see what your units can see, period. The AI receives only its own subjective view through the same tool services. Different players can have contradictory pictures of the same part of the map, and both can be wrong. This isn't a feature bolted on top — it's the foundation of the game state architecture.

**WEGO simultaneous resolution.** All players issue orders, then all orders resolve at once. This creates a planning-and-anticipation rhythm that maps naturally to how LLMs reason — they're committing to a plan based on incomplete information, exactly like a real commander. It also means the moment of resolution is genuinely suspenseful, because you don't know what anyone else committed to until you see it play out.

**Land, water, air, and space.** The game covers all four domains with unit types appropriate to each — ground forces from infantry to armor, naval surface and subsurface units, aircraft operating from bases with limited range, and space-based assets for surveillance and communication. The initial release will focus on a streamlined Axis & Allies-style roster across the core domains, with space-based units as a later expansion.

## The Interface

The UI is a conventional desktop application dominated by the map view, not a full-screen game engine display. Think Command: Modern Operations or the old Harpoon series, but significantly stripped down to drive map-focused decision making with a simpler unit mix. Interaction is mouse-driven with keyboard accelerators for common actions, supporting more fluid play for experienced players. Information panels are collapsible and subordinate to the map. This is a deliberate choice — it plays to web technology's strengths for complex information-dense layouts and keeps the player's attention on geography and spatial decisions.

## Who This Is For

Strategy wargame players who are frustrated by decades of scripted AI opponents that cheat instead of think. The audience skews older, more technical, and more patient than mainstream gaming — people who play Hearts of Iron IV, Strategic Command, or Combat Mission and wish the AI were smarter. They're willing to pay for depth, they value transparency in game systems, and they'll find the "bring your own AI" model intriguing rather than intimidating.

## Multiplayer

The game supports any mix of human and AI players. The primary experience is single-player against one or more LLM opponents, but the architecture is designed so that human players can join through asynchronous turn exchange — essentially modernized play-by-email, with no server infrastructure required. Each human player hosts their own AI opponents locally. Real-time networked multiplayer is not planned for initial release but the WEGO turn structure and per-player subjective state make it architecturally feasible as a future addition.

## How I'm Building It

Electron desktop application, TypeScript, SQLite for game state. H3 for spatial indexing. Canvas or WebGL for map rendering. OpenRouter for LLM integration. AI-assisted development with RooCode and Cursor, spec-driven with playable milestones every two weeks.

The map data comes from Natural Earth shapefiles preprocessed through PostGIS into H3 cells, with terrain stored using a sparse hierarchical scheme — water is null, homogeneous land regions are stored as ranges at coarse resolution, and fine-grained terrain data only exists where geographic variation creates tactical significance.

## How I'm Shipping It

Free builds on GitHub under my name. Paid convenience builds on Steam. The code is not open source — the GitHub repository hosts compiled builds and release notes, not the source. The Steam listing makes it clear that the free version always exists and the paid version is a way to get managed installation and support the project. This follows the model proven by Dwarf Fortress and others. The goal is to build a player base and a reputation as a developer in this space, not to maximize short-term revenue.

Community building starts early — Discord server and devlog from the first real-map milestone, engagement with wargaming communities and content creators, Early Access on Steam once the core loop is solid.

## What Success Looks Like

A shipped game that people want to play more than once against AI opponents that feel like they're thinking. A small but engaged community. My name associated with a real, finished product in a space I care about. Everything else — multi-resolution zoom, expanded multiplayer, space-based units, additional scenarios — is expansion on that foundation, not a prerequisite for it.

## Development Approach

The game develops in phases. Phase 0 is a throwaway prototype that validates whether LLM opponents produce interesting play on a tiny hex map. Phase 1 builds the real single-player game at theatre zoom level on a global map. Phase 2 polishes the UI, deepens the AI, and adds Early Access features. Phase 3 adds multi-resolution zoom levels. Phase 4 ships it.

Every milestone produces something playable and includes a hypothesis about what the player experience should feel like. The architectural validation matters, but the experience validation is the point. If it doesn't feel like a game worth playing, the code quality is irrelevant.

The most important checkpoint is the first complete game against an LLM opponent. If that's not fun, nothing else matters until I understand why.