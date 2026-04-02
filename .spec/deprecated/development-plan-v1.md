# Strategic Development Plan: Grand Strategy Wargame with LLM Opponents

*Version 1.0 — March 2026*

---

## Planning Assumptions

This plan assumes roughly 10–15 hours per week of focused development time. Each milestone targets approximately two weeks of effort at that pace. Some will take one week in flow state; others may stretch to three when life intervenes. If any milestone consistently exceeds three weeks, that's a signal to cut scope within it — the milestone is too big, at least for now.

Milestones are ordered so that each one produces something you can run, play, or demonstrate. Every milestone includes a **playtest hypothesis** — a statement about what the player experience should feel like. The architectural validation ("does the code work end-to-end") matters, but the experience validation ("does this feel like a game worth playing") is the new muscle you're building.

The plan is divided into five phases. Phases 0 and 1 are non-negotiable — they validate whether the core idea works before you've invested months. Phases 2 and 3 build the real game. Phase 4 is the multi-resolution stretch goal. Phase 5 is distribution. You should expect to revisit and revise this plan after completing Phase 1, because you'll know things about your game that you can't know today.

---

## Phase 0: Foundation and Validation (Milestones 0.1–0.5)

**Goal:** Learn the toolchain, validate the LLM opponent concept, and answer the question "is this game idea actually fun?" before building anything permanent.

**What you'll have at the end of Phase 0:** A throwaway prototype where you can play a complete WEGO game against an LLM opponent on a tiny hex map, with enough game feel to tell whether the core concept has legs.

**Critical learning investments before starting:** Read Red Blob Games' complete hex grid guide (https://www.redblobgames.com/grids/hexagons/) — this is the canonical reference and will save you weeks of coordinate math confusion. Skim the H3 documentation and run through their TypeScript examples. Set up your development environment (Node.js, TypeScript, your preferred IDE with RooCode/Cursor).

### Milestone 0.1 — Hello Hex World

**Build:** An Electron (or Tauri — see decision note below) application that renders a small hex grid (19 hexes in a classic hex-flower arrangement) on a Canvas element. Clicking a hex highlights it and displays its H3 index and cube coordinates in a sidebar panel. The hex grid is generated from H3 at a single resolution level. Basic pan and zoom with mouse wheel.

**Playtest hypothesis:** None — this is pure toolchain learning.

**Key decisions to make during this milestone:**

The Electron-versus-Tauri decision should be made here, during the throwaway phase, not later when switching costs are high. Build 0.1 in whichever you're leaning toward (probably Electron given your TypeScript comfort). If performance feels acceptable and the main-process/renderer-process communication model isn't fighting you, stick with it. If Chromium's overhead bothers you or IPC feels clunky for shuttling game state, try rebuilding 0.1 in Tauri before proceeding — it's a day of work at this scale. The key test is whether the rendering-to-game-logic communication path feels natural, not whether either framework can render 19 hexes.

**Learning focus:** H3 TypeScript bindings. Canvas 2D rendering of hexagons. Electron or Tauri project structure. Main process vs. renderer process communication patterns.

### Milestone 0.2 — Game State and Turns

**Build:** Expand to a ~50-hex map with two terrain types (land and water). Place 3–5 units per side (two players, three unit types: infantry, armor, naval). Implement the WEGO turn structure: a planning phase where the human player issues movement orders by clicking a unit and then clicking a destination hex, a "Ready" button that ends the planning phase, and a resolution phase that executes all movement simultaneously. Store game state in SQLite via the main process. No combat yet — units just move.

**Playtest hypothesis:** Issuing orders and watching them resolve simultaneously feels meaningfully different from watching units move one at a time. The WEGO resolution creates a moment of anticipation.

**Learning focus:** SQLite integration via better-sqlite3 (synchronous, fast, excellent for Electron's main process). Game state schema design. The WEGO turn loop as a state machine.

### Milestone 0.3 — The LLM Opponent

**Build:** Add an AI player controlled by an LLM via OpenRouter. Before the resolution phase, the game sends the current game state (as structured text or JSON) to the LLM along with a system prompt describing the game rules and available actions. The LLM returns a set of movement orders in a structured format. The game validates and executes those orders alongside the human's. Start with a simple prompt — no MCP services yet, just a text description of the board state and a request for orders.

**Playtest hypothesis:** The LLM produces orders that feel intentional rather than random. When you see the AI's units move during resolution, you should be able to infer something about what the AI is "thinking" — even if it's wrong or suboptimal.

**Key metrics to capture:** API latency per turn. Token count per request and response. Cost per turn at different model tiers (try at least one cheap model like Haiku and one expensive model like Opus or GPT-4). Whether the LLM consistently returns parseable, valid orders or requires retry logic.

**Learning focus:** OpenRouter API integration. Prompt engineering for structured game output. Error handling for LLM responses (malformed JSON, illegal moves, timeouts).

### Milestone 0.4 — Combat and Victory

**Build:** Add deterministic combat resolution. When opposing units occupy the same hex (or adjacent hexes, depending on what feels right) after movement resolves, combat occurs automatically. Simple combat model: attack strength vs. defense strength with a modest random factor, producing casualties or unit elimination. Add a win condition — eliminate all enemy units, or control a set of objective hexes for a number of turns. A complete game should last 10–20 turns.

**Playtest hypothesis:** Playing a complete game against the LLM opponent creates genuine decision tension — you should feel the weight of choosing where to commit your limited forces, and the outcome of the game should feel like it was determined by the quality of your decisions, not by luck or by the AI being stupid.

**This is the most important milestone in the entire plan.** If this hypothesis validates — if you play a few games and find yourself thinking about strategy between sessions, wanting to try different approaches, feeling satisfaction when your plan works and frustration (the good kind) when the AI outmaneuvers you — then you have a game worth building. If it doesn't, you need to understand why before proceeding. The answer might be in the combat model, the map design, the LLM prompt, or the WEGO resolution pacing. Iterate on 0.4 until you're satisfied or until you've identified specific, addressable reasons why it's not working.

### Milestone 0.5 — MCP Service Layer (v1)

**Build:** Replace the raw text game-state prompt with a structured MCP-style tool interface for the AI. Implement 3–4 deterministic services the AI can call: query the game state (what units do I have, where are they, what can I see), evaluate a potential move (what's the terrain at hex X, how far can unit Y move this turn), estimate combat outcome (if I attack hex X with these units, what's the expected result), and issue orders. The LLM now reasons about the game by calling tools rather than parsing a wall of text.

**Playtest hypothesis:** The AI plays noticeably better with tools than it did with raw text prompts. Its moves should feel more purposeful — it should tend to concentrate forces, avoid unfavorable terrain, and pursue objectives rather than moving units semi-randomly.

**Key comparison:** Play the same starting position against the raw-prompt AI from 0.3 and the tool-equipped AI from 0.5. Is the difference obvious? If not, the tool interface needs redesign before you build more services on top of it.

**Learning focus:** Designing tool interfaces that bridge the gap between LLM strategic reasoning and precise tactical actions. This is the core architectural innovation of your game and will be iterated on throughout development.

---

## Phase 1: The Real Game (Milestones 1.1–1.6)

**Goal:** Transform the validated prototype into a real, replayable game with a proper map, fog of war, and enough depth to sustain multiple playthroughs. This is where you stop writing throwaway code and start building the actual codebase.

**What you'll have at the end of Phase 1:** A complete single-player game at theatre zoom level against an LLM opponent on a real-Earth map, with fog of war, a functional economy, and enough unit variety to create interesting strategic choices. Playable from start to finish in 1–3 hours.

**Critical decision before starting Phase 1:** How much code from Phase 0 do you carry forward? The honest answer is probably "the architecture and the lessons, but mostly rewritten code." Phase 0 was about learning and validation. Phase 1 is about building a codebase you'll maintain for years. Invest a milestone in getting the foundation right.

### Milestone 1.1 — Clean Architecture

**Build:** Set up the production project structure from scratch, informed by everything you learned in Phase 0. Establish the core patterns you'll use throughout: the game state schema in SQLite, the main-process/renderer-process communication protocol, the turn lifecycle state machine, the AI service interface, and the rendering pipeline. Seaport the basic hex rendering and WEGO turn loop from Phase 0, but restructured for maintainability. Set up your build pipeline, linting, and whatever CI you want.

**Playtest hypothesis:** None — this is infrastructure. But constrain yourself to one milestone. If you're still refactoring architecture after two weeks, you're over-engineering. Ship the same 50-hex game from Phase 0 running on the new codebase and move on.

**Anti-pattern warning:** This milestone is where your enterprise instincts will most strongly tempt you to over-architect. You do not need a plugin system. You do not need an event bus. You do not need abstract factory patterns for unit creation. You need a clean, readable codebase that you can change easily. Resist the urge to build for hypothetical future requirements — build for the next three milestones.

### Milestone 1.2 — The Real Map (Theatre Level)

**Build:** Generate a theatre-level hex map of the entire Earth from Natural Earth data, preprocessed through PostGIS into H3 cells at your chosen theatre resolution (roughly H3 resolution 3, giving ~12,000 km² hexes — experiment to find the resolution that looks right on screen). Each hex is tagged with a dominant terrain type derived from Natural Earth: ocean, land (plains), forest, mountain, desert, arctic. Store the terrain data in SQLite using your hierarchical bucketing scheme — ocean hexes don't need per-cell storage, continental interiors can be stored as ranges. Render this map with basic terrain coloring, smooth pan and zoom, and a minimap for orientation.

**Playtest hypothesis:** Looking at the map, you should immediately recognize the Earth's continents and major geographic features. The terrain distribution should create obviously interesting strategic geography — chokepoints, defensible terrain, naval passages. If the map reads well at a glance, the resolution is right. If it feels like a blur of tiny hexes or a collection of indistinct blobs, adjust the resolution.

**Learning focus:** PostGIS-to-H3 data pipeline. Efficient Canvas rendering of thousands of hexes with culling (only render what's in the viewport). Terrain data compression and storage optimization.

**Reach out:** This is a good time to start a development Discord server and post your first devlog entry — "building a global hex map from real geographic data." The GIS-to-game pipeline is visually interesting content that will attract technically-minded followers even before you have gameplay to show.

### Milestone 1.3 — Fog of War and Subjective Views

**Build:** Implement per-player visibility. Each player can only see hexes within their units' visibility range (start with a simple fixed radius — say, 2 hexes for ground units, 4 for air). The map outside visibility is either unexplored (never seen — rendered dark) or last-known (previously seen but not currently visible — rendered dimmed, showing terrain but not current enemy units). Each player's game state in SQLite tracks their own subjective knowledge. The AI opponent receives only its subjective view through the MCP services, never the ground truth.

**Playtest hypothesis:** Fog of war transforms the feel of the game from a puzzle (where you can see everything and optimize) into a genuine contest of information. You should feel uncertainty about where the AI's forces are concentrated, and moments of surprise when you discover them. Scouting should feel valuable — you should want to dedicate units to reconnaissance even though it reduces your combat strength.

**Design note:** The subjective-view architecture is also the foundation for the multi-player game you'll eventually build. Each player's state is already isolated and independent, which means adding additional human or AI players later is additive rather than requiring a rearchitecture.

### Milestone 1.4 — Economy and Production

**Build:** Add a simple production system. Certain hexes (or regions of hexes) generate resources each turn. Players spend resources to build new units, which appear at designated production hexes after a build time of 1–3 turns. Supply lines: units that are too far from a friendly production hex (measured in hexes, not requiring explicit supply route tracing at this stage) fight at reduced effectiveness. The AI gets MCP services for querying its economy (what can I build, where, how long until it's ready) and making production decisions.

**Playtest hypothesis:** Resource scarcity forces meaningful trade-offs — you can't build everything everywhere, so you have to decide between reinforcing a threatened front and investing in a future offensive. The production system should make the early game feel different from the late game, as force compositions shift and economic advantages compound.

**Keep it simple:** Axis & Allies has essentially one resource (IPCs) and a fixed production menu. That's a proven design. Don't add multiple resource types, tech trees, or population mechanics in this milestone. You can layer those in later if the game needs them, but most of the depth should come from spatial decisions (where to build, where to deploy), not economic optimization.

### Milestone 1.5 — Unit Variety and Terrain Interactions

**Build:** Expand from three unit types to your target roster. Based on the Axis & Allies model with your modern-era setting, something like: infantry (cheap, slow, defensive), mechanized (faster, balanced), armor (fast, strong, vulnerable in mountains/forests), artillery (ranged attack, can't move and fire same turn), fighter aircraft (fast, limited range from airbases), naval surface (sea movement, coastal bombardment), submarine (sea, invisible until adjacent), and transport (sea, carries land units). Each unit type interacts with terrain differently — armor is strong on plains, weak in mountains; infantry defends well in forests; naval units are restricted to ocean hexes.

**Playtest hypothesis:** The unit mix creates rock-paper-scissors style interactions that make force composition decisions interesting. You shouldn't be able to win by massing a single unit type. Different terrain regions should favor different approaches — a European land war should feel different from a Pacific island-hopping campaign, even with the same abstract unit types.

**Playtest with another person:** This is the milestone where you should get your first external playtester — a friend, a family member, someone from the wargaming community. Watch them play without helping. Take notes on what confuses them, what they find boring, and what makes them lean forward. Their experience will be dramatically different from yours because you know the systems intimately and they don't.

### Milestone 1.6 — Game Scenarios and Win Conditions

**Build:** Create 2–3 preset scenarios that use the real-Earth map: a contained regional conflict (e.g., a European theatre), a two-front global scenario, and a free-play sandbox on the full map. Each scenario defines starting territories, forces, production centers, and victory conditions (control specific objective hexes for N turns, or eliminate all enemy forces, or achieve an economic threshold). Add a scenario selection screen and a basic end-game summary showing the progression of territory control over the course of the game.

**Playtest hypothesis:** At least one scenario produces a consistently engaging 60–90 minute game experience. The game should feel complete — it has a beginning (deploying your starting forces), a middle (maneuvering for advantage while building your economy), and an end (a decisive campaign that resolves the conflict). When you finish a game, you should want to play again with a different strategy.

**This is your "vertical slice" milestone** — the point where you have a genuinely shippable game, even if it's minimal. Everything from here forward is expansion and polish.

---

## Phase 2: Polish and Depth (Milestones 2.1–2.6)

**Goal:** Transform the functional game into something you'd be comfortable showing to the public. Improve the UI, deepen the AI, add the distinctive features that differentiate your game from existing wargames.

**What you'll have at the end of Phase 2:** An Early Access-ready game with a polished UI, competent AI opponents at multiple difficulty levels, AI transparency features, scenario variety, and enough depth to sustain a community of early players.

**Reach out:** Before starting Phase 2, set up your Steam page (you need a $100 Steamworks account) and start accumulating wishlists. Post the GitHub repository with your first playable build. Begin regular devlog updates. The LLM opponent angle is your marketing hook — every devlog should show the AI doing something interesting.

### Milestone 2.1 — Art Direction and UI Overhaul

**Build:** Commit to your visual style and implement it consistently. The recommendation is a clean military-cartographic aesthetic: NATO standard unit symbols (APP-6 series), a muted topographic color palette for terrain, clear sans-serif typography for all game information, and a restrained color accent system for player identification and alerts. Implement proper UI panels: a collapsible sidebar for selected-unit details, a top bar for turn info and resources, a bottom bar for orders and notifications. Keyboard accelerators for common actions (next unit, end turn, zoom to last combat).

**Playtest hypothesis:** A new player looking at a screenshot should immediately understand that this is a serious strategy game and should be able to identify the major map features, their own units, and the current game state without explanation. Information density should feel high but organized, not cluttered.

### Milestone 2.2 — AI Personality and Difficulty

**Build:** Implement AI personality differentiation through system prompt engineering and tool-interface configuration. Create at least three distinct AI profiles: a cautious/defensive player, a balanced player, and an aggressive player. Difficulty scaling works through two levers: the quality of the LLM model backing the AI (selectable by the player via their OpenRouter key — cheaper models play weaker), and the information available to the AI's MCP services (on lower difficulty, the AI's terrain analysis and combat estimation tools are slightly less accurate, simulating worse intelligence). Add the "AI observatory" panel where players can view the AI's MCP call log, see what information the AI requested, and read its reasoning.

**Playtest hypothesis:** Playing against the aggressive AI should feel noticeably different from playing against the cautious AI — not just in outcomes, but in the texture of the game. The aggressive AI should create pressure that forces you to react; the cautious AI should make you work to find openings. The AI observatory should be fascinating to read after a game — you should learn something about your opponent's strategy that you didn't know during play.

### Milestone 2.3 — Diplomacy and Alliances

**Build:** If the game supports more than two players (which it should for a grand strategy wargame), add a diplomacy layer. Players can propose alliances (shared visibility, non-aggression), declare war, and negotiate peace. AI players make diplomatic decisions through the LLM with diplomatic MCP services (evaluate relationship, propose treaty, assess threat). Allied players share fog-of-war visibility within the constraints of their agreement. Alliances can be broken — and the LLM can decide to betray the player if it judges that strategically sound, which is exactly the kind of emergent behavior that makes LLM opponents interesting.

**Playtest hypothesis:** Alliances should create genuine diplomatic tension. You should feel uncertain about whether your AI ally will remain loyal, and that uncertainty should influence your strategic planning — do you commit fully to a joint offensive, or keep a reserve in case your ally turns on you?

**Research note:** Study Meta's CICERO system, which achieved top-tier human performance in Diplomacy specifically through combining strategic reasoning with natural-language negotiation. You won't replicate that system, but its architecture (separate strategic planning and communication modules) is informative for your tool interface design.

### Milestone 2.4 — Sound Design and Game Feel

**Build:** Add audio. You need at minimum: ambient music (1–3 tracks, looping — licensed from an indie composer or generated via AI music tools, ensuring you have commercial rights), UI feedback sounds (order confirmed, turn resolving, combat occurring, unit destroyed), and notification sounds for important events (enemy spotted, territory lost, unit built). Sound is disproportionately impactful for game feel relative to implementation effort. Also add visual juice to the resolution phase: brief combat animations (even just a flash and a health bar change), smooth unit movement interpolation rather than teleporting between hexes, and a camera that automatically pans to show significant engagements.

**Playtest hypothesis:** The resolution phase should feel like watching a story unfold rather than watching a database update. Sound and animation should make combat outcomes feel impactful — losing a unit should sting, and destroying an enemy unit should feel satisfying, even though the underlying mechanics haven't changed from Phase 1.

### Milestone 2.5 — Save/Load and Session Management

**Build:** Full game save and load. Since your game state is already in SQLite, this is largely about serializing the complete database state (including per-player subjective views, pending orders, AI conversation history, and turn counter) to a save file and restoring it cleanly. Add auto-save at the start of each turn. Add the ability to replay past turns — step through the resolution sequence of any previous turn, including the AI's MCP call log for that turn. This last feature is both a debugging tool for you and a distinctive game feature.

**Playtest hypothesis:** You should be able to close the game mid-session, reopen it days later, and resume with full context — both mechanically (the game state is correct) and cognitively (the replay feature helps you remember where you were strategically).

### Milestone 2.6 — Asynchronous Multiplayer

**Build:** Add human-vs-human play via an asynchronous turn file system. Each player has their own game instance. After submitting orders, the game exports a turn file. All players' turn files are combined (manually, via file sharing — no server infrastructure yet) and fed into the resolution engine. Each player then receives the resolution results and the next turn's game state, filtered through their own fog of war. This is essentially play-by-email modernized. LLM players can participate in the same game alongside human players, each running locally on their respective human host's machine.

**Playtest hypothesis:** Playing against a human opponent with fog of war and WEGO resolution should feel meaningfully different from playing against the AI. The uncertainty about your opponent's capabilities and intentions should be deeper, and the stakes of each turn's decisions should feel higher.

**Design note:** This architecture also validates the full multiplayer model without requiring any server infrastructure. If the game works well asynchronously, synchronous network play (later, if ever) is an optimization, not a new feature.

---

## Phase 3: Multi-Resolution (Milestones 3.1–3.4)

**Goal:** Implement the hierarchical zoom system that allows players to engage at theatre, divisional, and brigade levels. This is the phase where your 1km-resolution ambition becomes real.

**Critical prerequisite:** Phase 3 should only begin when the single-zoom-level game from Phases 1–2 is stable, fun, and has been played by at least a handful of external testers who confirm the core experience works. The multi-resolution system adds significant complexity, and if the base game isn't solid, this complexity will amplify existing problems rather than creating new appeal.

### Milestone 3.1 — Hierarchical Terrain Data

**Build:** Extend your PostGIS-to-H3 pipeline to generate terrain data at three resolution levels: theatre (H3 resolution 3), divisional (H3 resolution 5), and brigade (H3 resolution 7). Implement the sparse hierarchical storage scheme — coarse-resolution terrain where regions are homogeneous, fine-resolution only where terrain variation creates tactical significance (mountain passes, river crossings, coastal geography). Build MCP services that can aggregate terrain data at any resolution level for the AI. This milestone is backend-only — the game still renders and plays at theatre level.

**Playtest hypothesis:** None directly — this is data infrastructure. But validate by spot-checking specific geographic areas. The Strait of Gibraltar should show as a narrow naval passage at divisional level. The Swiss Alps should show passable valleys at brigade level that are invisible at theatre level. The Korean peninsula should show the narrow land bridge connecting to Manchuria.

### Milestone 3.2 — Zoom Level Transition

**Build:** Implement the ability to zoom from theatre into divisional level for a specific area of the map. When the player selects a theatre-level hex and "zooms in," the view transitions to show the ~7 child hexes at divisional resolution, with finer terrain detail. Units in the zoomed-in area are displayed with more detail. The player can issue more granular movement orders at this level. Implement the attention budget constraint: zooming in to divisional level locks out divisional-level interaction elsewhere for this turn. Orders in non-focused areas continue on autopilot.

**Playtest hypothesis:** The transition between zoom levels should feel like assuming a different level of command. At theatre level, you're a head of state moving armies across continents. At divisional level, you're a field commander managing a specific operation. The constraint of limited attention should feel like a strategic choice ("I'm committing my focus here because this operation matters"), not a UI limitation ("I wish I could zoom in everywhere").

### Milestone 3.3 — Brigade Level and Combat Detail

**Build:** Add the brigade-level zoom (H3 resolution 7, ~1km hexes). At this level, terrain matters tactically — elevation, cover, road networks. Combat resolution at brigade level is more granular than at theatre level, giving the player who zooms in more influence over outcomes. Build the full zoom chain: theatre → divisional → brigade. The AI independently decides its own attention allocation each turn, communicating with the game engine about where it wants to focus.

**Playtest hypothesis:** A player who zooms in to brigade level for a critical engagement should achieve better outcomes than auto-resolution — but the improvement should be proportional to the quality of their tactical decisions, not guaranteed. A bad plan at brigade level should perform worse than auto-resolution with well-positioned forces. This creates the genuine trade-off that makes the attention system strategic.

### Milestone 3.4 — Attention Visualization and Balance

**Build:** Add post-turn visualization of attention allocation: show where the AI focused during the last turn, overlay with where you focused, and highlight areas where unattended forces encountered unexpected situations. Tune the balance between zoom levels through playtesting: how much better is manual brigade-level control versus auto-resolution? How many divisional areas should a player be able to manage per turn? These numbers should emerge from playtesting, not be designed on paper.

**Playtest hypothesis:** After playing several games with the multi-resolution system, you should be able to articulate a personal "command style" — do you tend to micromanage one critical front while letting other areas run on autopilot, or do you spread your attention evenly? Different styles should be viable. There should be no single dominant strategy for attention allocation.

---

## Phase 4: Ship It (Milestones 4.1–4.4)

**Goal:** Prepare the game for public distribution. Polish, packaging, documentation, and community launch.

### Milestone 4.1 — Onboarding and Tutorial

**Build:** A tutorial scenario that teaches the game's core mechanics through guided play rather than text walls. Start the player with a small force in a constrained scenario, introduce one concept per turn (movement, then combat, then fog of war, then production), and let them play through a short scripted experience that ends in a satisfying victory. Also write a reference manual — not a tutorial, but a comprehensive explanation of every game system, terrain type, unit statistic, and keyboard shortcut. Host this as a searchable HTML document bundled with the game.

**Playtest hypothesis:** A strategy game player who has never seen your game should be able to complete the tutorial and then start a real scenario without asking you any questions. If they need to ask questions, those questions tell you what the tutorial missed.

### Milestone 4.2 — Platform Packaging

**Build:** Production builds for Windows, macOS, and Linux. Proper installers, application signing (at least for macOS where unsigned apps are increasingly restricted), auto-update mechanism, and crash reporting. Steam SDK integration for achievements, cloud saves, and the Steam overlay. Simultaneously, package a standalone build for GitHub releases that doesn't depend on Steam. Test on machines that aren't your development machine — borrow a friend's laptop if needed.

**Playtest hypothesis:** None — this is pure engineering. But verify by having someone who isn't you install the game from scratch on a clean machine and successfully play a complete game.

### Milestone 4.3 — Community Beta

**Build:** Release a beta to your Discord community and any interested content creators you've been in contact with. Instrument the game to collect opt-in analytics: average turn time, most-used zoom levels, game length, AI model choices, crash reports. Run a structured feedback cycle — provide a feedback form with specific questions rather than open-ended "what do you think?" Expect to do 2–4 rapid bug-fix releases during this period.

**Playtest hypothesis:** At least some beta players complete multiple full games voluntarily — not as a favor to you, but because they want to keep playing. If that doesn't happen, you have a retention problem that needs diagnosis before public launch.

### Milestone 4.4 — Launch

**Build:** Final polish pass based on beta feedback. Announce launch date 2–4 weeks in advance. Coordinate Steam page updates (screenshots, trailer, description) with GitHub release. Tag the launch in your devlog and Discord. Price the Steam version at $15–20 for Early Access (you can raise the price at 1.0 if the game has grown substantially). Post launch, commit to a regular update cadence — even small updates keep the Steam algorithm showing your game to new users.

**Playtest hypothesis:** Launch week Steam reviews should be 80%+ positive. If they're below 70%, something fundamental is wrong with either the game or its presentation to new players, and you should pause new features to diagnose and fix.

---

## Cross-Cutting Concerns

These are not milestones but ongoing activities that run in parallel throughout development.

**Community building** should start at Milestone 1.2 (when you have a real-Earth map to show) and continue throughout. Post devlog updates at least biweekly. Share screenshots and short clips. Engage with wargaming communities (r/computerwargames, r/hexandcounter, Slitherine forums, wargaming Discord servers). Your LLM opponent feature is genuinely novel — lead with it in every piece of community content. Target niche wargaming YouTubers for early coverage once you have a playable build (Milestone 1.6 or later).

**Playtesting** should happen every milestone from 0.2 onward. You are the primary playtester through Phase 0. Get at least one external tester by Milestone 1.5. Aim for 3–5 regular external testers by the end of Phase 2. Beta testing in Phase 4 should target 20–50 players.

**Source control and project management** should use GitHub from day one — even though the project isn't open source, private repos are free, and you'll eventually want the GitHub releases infrastructure. Use issues for tracking work, even if you're the only contributor. This habit will serve you well when the community starts filing bug reports.

**AI prompt engineering** is an ongoing refinement that happens in every milestone from 0.3 onward. Keep a log of your prompt iterations and their effects on AI behavior. When you find a prompt pattern that produces noticeably better play, document what changed and why you think it works. This log will become invaluable when you're tuning AI personalities in Phase 2 and when you eventually write about your approach for the community.

---

## Estimated Timeline

Assuming 2-week milestones at 10–15 hours per week:

| Phase | Milestones | Calendar Time |
|-------|-----------|---------------|
| Phase 0: Foundation and Validation | 0.1–0.5 | 8–12 weeks |
| Phase 1: The Real Game | 1.1–1.6 | 10–14 weeks |
| Phase 2: Polish and Depth | 2.1–2.6 | 10–14 weeks |
| Phase 3: Multi-Resolution | 3.1–3.4 | 8–12 weeks |
| Phase 4: Ship It | 4.1–4.4 | 6–10 weeks |

**Total estimated range: 10–15 months from first line of code to launch.**

This estimate assumes no major scope changes, no extended breaks, and no fundamental design pivots. Reality will intervene. A more honest expectation is 12–18 months, with the possibility that Phase 3 (multi-resolution) gets deferred to a post-launch update if the single-resolution game is strong enough on its own. That's a legitimate and common strategy — ship the game that works, expand it once it has an audience.

**The most critical checkpoint is after Milestone 0.4.** If the core WEGO-plus-LLM loop isn't fun after that milestone, stop and diagnose before proceeding. The answer might be a design change, a better prompt, a different map size, or — in the worst case — a different game concept. Better to discover this at week 8 than at month 12.

---

## Summary of Key External Touchpoints

| When | Action |
|------|--------|
| Before Milestone 0.1 | Read Red Blob Games hex guide, H3 docs, set up dev environment |
| During Milestone 0.1 | Decide Electron vs. Tauri |
| Milestone 1.2 | Start Discord server, first devlog post |
| Milestone 1.5 | First external playtester |
| Before Phase 2 | Create Steam developer account, set up Steam page |
| Milestone 2.2 | Study Meta's CICERO architecture for AI design insights |
| Phase 2 ongoing | Engage wargaming content creators |
| Milestone 4.3 | Community beta launch |
| Milestone 4.4 | Public launch on Steam and GitHub |
