# LLM wargame AI is viable — but architecture must evolve to scale

*Historical research (Phase 0, early 2026). Not live mechanics.*

The hybrid architecture this paper recommended — pre-computed briefings, standing orders, and event-driven LLM consultation — is the live 2.4.0 design. Cost and latency numbers below are period research, not current measurements. For what the game actually does, start at [README.md](README.md) and [combat-rules-v3.md](combat-rules-v3.md).

---

**The latency/cost scaling problem does not threaten the fundamental viability of an LLM-powered wargame.** It does, however, require specific architectural changes — primarily adopting a hybrid AI pattern where the LLM serves as a strategic advisor rather than direct tactical controller. This shift, validated by at least six independent projects including Meta's CICERO and the Vox Deorum Civilization V integration, can reduce LLM costs by **90% or more** while preserving the compelling emergent behavior that makes LLM opponents interesting. Simultaneously, API pricing is declining 30–70% year-over-year, and the techniques for managing tool-calling latency are maturing rapidly. The developer's current prototype is well-positioned: the five MCP-style tool services already form the skeleton of a hybrid architecture. The path forward is optimization and selective hybridization, not a fundamental rethink.

---

## The pure-LLM loop works at small scale but hits a wall

The developer's current observations confirm a pattern seen across every LLM game AI project: **cost and latency scale roughly linearly with game state complexity, while player tolerance does not scale at all.** At 271 hexes and 10 units, $0.04/game with Gemini Flash 2.5 is economically trivial and latency is manageable. But at 1,951 hexes and 30 units, the state representation alone can balloon to tens of thousands of tokens, each tool call adds another inference round-trip of 300ms–3 seconds, and the iterative tool-calling loop multiplies these costs by 5–10x per turn.

The TextStarCraft II project illustrates this ceiling vividly: a single game using GPT-3.5-turbo-16k took approximately **7 hours** of wall-clock time for LLM inference. Vox Deorum, the closest analog to this project (a Civilization V mod using LLM strategic AI), consumed **20.35 million input tokens per game** on a tiny 4-player map — roughly $0.50–$0.86 per game with open-source models. These numbers confirm that a pure "LLM reasons about everything" approach cannot scale to medium or large maps without fundamental optimization.

The good news: every one of these projects found solutions, and they converge on a remarkably consistent architecture.

---

## The hybrid pattern is the clear consensus architecture

Six independent projects — Meta's CICERO (Diplomacy), Vox Deorum (Civilization V), the Slay the Spire Strategic Delegation study, the Tank War framework, Sean Goedecke's "Generals" RTS, and JHU APL's GenWar AFSIM integration — all arrived at the same fundamental pattern: **LLM for strategic reasoning, traditional AI for tactical execution.**

The architecture works in three layers. First, an **LLM strategic layer** is called infrequently (once per turn, every N turns, or on major events) to set high-level parameters: grand strategy, risk tolerance, objective prioritization, resource allocation weights. Second, a **utility/scoring layer** runs every turn, applying the LLM-set parameters to evaluate and rank concrete options using influence maps, threat scores, and objective weights. Third, a **behavior tree/execution layer** handles per-unit pathfinding, formation management, and deterministic combat resolution — operations that require spatial precision and sub-second response times.

Crucially, **this pattern maps cleanly onto the existing 5-tool architecture.** The current MCP services (pathfinding, threat assessment, combat estimation, strategic memory, standing orders) are already the building blocks of layers two and three. The architectural change is shifting from "LLM calls these tools to gather information, then reasons about everything" to "these tools run autonomously every turn, the LLM periodically reviews their output and adjusts strategic parameters." The Slay the Spire study confirmed this with a controlled experiment: a **hybrid where heuristics handled navigation and the LLM focused on complex combat decisions achieved the highest performance** of all five tested architectures.

What makes this particularly compelling for this project is that the interesting behavioral variation the developer observes — different models using tools differently — would be preserved. The LLM's personality and strategic reasoning still shapes all decisions; it simply does so through parameterization rather than direct control. Vox Deorum demonstrated this: LLM-controlled civilizations developed **distinct play styles** (aggressive, economic, diplomatic) that persisted across games, despite the tactical layer being entirely algorithmic.

---

## Five techniques that bend the cost curve immediately

Even before a full hybrid refactor, several optimizations can dramatically reduce cost and latency within the current architecture. These are ordered by expected impact.

**Pre-computation eliminates most tool calls.** Instead of waiting for the LLM to request pathfinding, threat assessment, and combat estimates one at a time, run all five tools in parallel before the LLM's first inference pass and inject their results into the initial prompt. This converts 5+ sequential tool-call round-trips into zero, reducing a typical 5–10 inference pass loop to 1–2 passes. Expected latency reduction: **60–80%**. The Anthropic engineering team's "programmatic tool calling" feature takes this further — Claude can write a Python script that orchestrates all tool calls in parallel, keeping intermediate results in the code sandbox rather than polluting the context window, achieving a **37% token reduction** on complex tasks.

**State abstraction shrinks the prompt dramatically.** Research on hex-based wargame AI specifically demonstrated that **localized observation with spatial decay** — full detail for the active area, summary for adjacent sectors, minimal mention of distant quiet zones — consistently outperforms global observation while using far fewer tokens. For format, Markdown tables use roughly **half the tokens** of JSON for tabular unit data due to eliminated key repetition and punctuation. A briefing-style prompt combining natural language strategic context with compact tabular tactical data is the emerging best practice. The key finding from format research: JSON output constraints degrade LLM reasoning accuracy by **10–15%**, so the LLM should reason in natural language and output structured decisions only at the end.

**Caching persists results across turns.** Pathfinding results for static terrain, combat estimation tables for unchanged unit matchups, and threat assessments for quiet sectors don't need recomputation every turn. Application-level caching with game-state-change invalidation can eliminate **40–60%** of redundant computation. Provider-level prompt caching (available from Anthropic, OpenAI, and Google) prices cached input tokens at roughly **10% of normal cost** — since game rules, tool definitions, and faction personality prompts are identical every turn, this alone cuts input costs substantially.

**Tiered model routing matches cost to decision importance.** Not every AI decision needs a frontier model. A recommended tier structure for this game:

- **Routine movement/positioning** (80% of decisions): DeepSeek V3.2 or Gemini Flash at $0.25–$0.50/M input tokens
- **Tactical combat planning** (15% of decisions): Claude Haiku 4.5 or Grok 4.1 Fast at $0.20–$1.00/M input
- **Strategic reassessment** (4% of decisions): Claude Sonnet 4.6 or Gemini 3.1 Pro at $2–$3/M input
- **Critical war-altering decisions** (1% of decisions): Claude Opus 4.6 at $5/M input

This tiered approach yields an estimated **$0.39–$1.94 per game** depending on game length, versus **$33–$84/game** if using mid-tier or premium models for everything. The 4x-game-agent project demonstrated the extreme version of this: reducing LLM game bot costs from **$1.20/hour to $0.01/hour** — a 100x reduction — by using the LLM only for periodic strategic review.

**Parallel tool calling cuts latency per inference pass.** Claude 4 models achieve ~100% parallel tool-calling success with minor prompting; GPT-4o and Gemini support it natively. When the LLM does need to call tools mid-loop, requesting all independent calls simultaneously reduces latency from the sum of all calls to the maximum of any single call. The LLMCompiler framework (ICML 2024) demonstrated up to **3.7x latency speedup** through automated parallelization of tool-call DAGs.

---

## Player experience during AI thinking is a solved design problem

Research on wait-time tolerance in turn-based games reveals a clear hierarchy. Players find **under 5 seconds** generally invisible, **5–15 seconds** acceptable with visual feedback, **15–60 seconds** tolerable in deep strategy games if they have something to do, and **1–5 minutes** accepted only by hardcore grognards playing games of corresponding depth. Gary Grigsby's War in the East players routinely accept 10–15 minute AI turns — but their own turns take 30 minutes to 5 hours, making the ratio proportional.

The WEGO format is the single strongest structural advantage this project has. **Simultaneous planning means AI computation is hidden within the player's own planning time.** On small maps where the player plans for 2–3 minutes, even a 60-second AI computation is invisible. The challenge emerges only when AI planning exceeds player planning time on larger maps.

Four UX patterns handle the overflow effectively. **Progressive disclosure** — showing "AI evaluating northern front... AI planning armored thrust... AI finalizing logistics" — transforms opaque waiting into intelligence gathering, similar to how chess engines show evolving evaluation bars. **Productive waiting** — allowing players to review previous turn results, examine unit reports, or study the map during AI computation — is the approach Civilization VI uses and the strongest predictor of player tolerance. **Execution replay as entertainment** — the WEGO resolution phase where both plans collide is inherently engaging content, not dead time. And **time estimation** — showing "AI planning: ~30 seconds remaining" — lets players calibrate their attention, which Nielsen's research identifies as critical for waits exceeding 10 seconds.

The observation that AI behavioral variation across models is itself compelling suggests a fifth pattern: **make the AI's reasoning visible as a feature.** Showing partial AI reasoning ("The AI commander is concerned about your flanking maneuver and is reinforcing the eastern sector") transforms a latency problem into a gameplay feature — intelligence about opponent thinking that players would pay for, not tolerate.

---

## The pricing trajectory strongly favors this concept

The LLM API pricing landscape is moving decisively in this project's favor. **Claude Opus dropped from $75/M output tokens (Opus 3) to $25/M (Opus 4.6) — a 67% decrease in under two years.** The cheapest usable models have gone from $0.60/M output (GPT-4o-mini, 2024) to $0.30/M (ByteDance Seed Flash, 2026). Free models on OpenRouter now include production-quality options like Xiaomi's MiMo-V2-Flash (309B MoE, leading SWE-bench scores) and Qwen3 Coder 480B — models that would have been frontier-competitive 18 months ago.

For this specific project, the math is encouraging even without architectural changes. Gemini Flash 2.5 at $0.30/$2.50 per million tokens currently costs $0.04/game on small maps. With the optimizations described above (pre-computation, caching, state abstraction), a medium map game could plausibly cost **$0.08–$0.15** with the same model. With tiered routing, a large-map game using premium models for critical decisions and budget models for routine ones would likely land at **$0.50–$2.00**. By the time this project reaches Phase 3–4 (projected 9–15 months out), pricing will likely have dropped another 30–50%, and the free-tier models will be stronger still.

The key pricing risk is not absolute cost but **cost scaling with concurrent users.** A single-player game where the developer absorbs AI costs needs different economics than a multiplayer game where multiple AI opponents plan simultaneously. At $0.15/game on medium maps, 10,000 games/month costs $1,500 — manageable for a niche indie game. But this calculation should be explicit in the business model, and player-funded models (subscription, per-game credits, or BYOK options where players supply their own API keys) should be considered for premium AI features.

---

## What this means for the development plan

The research supports a phased approach to architectural evolution rather than an immediate rewrite. The current pure-LLM prototype is the right architecture for Phase 0–1 because it maximizes learning about AI behavior and tool usage patterns. The hybrid refactoring should begin in Phase 2–3 as the game scales to medium maps.

**Phase 1 priority: Optimize within the current architecture.** Implement pre-computation (run all 5 tools before LLM inference), state abstraction (hierarchical briefing-style prompts with spatial decay), provider-level prompt caching, and parallel tool calling. These changes require no architectural redesign and should reduce cost and latency by **50–70%** on current map sizes.

**Phase 2 priority: Implement the hybrid layer.** Extract the utility/scoring logic that's currently implicit in the LLM's reasoning into explicit traditional AI systems — influence maps, threat scoring, objective priority queues. The LLM shifts from "controller" to "advisor," setting parameters that the utility layer executes. This requires the most design work but yields the largest scaling benefit: LLM calls drop from every-unit-every-turn to once-per-turn or less. Vox Deorum's experience suggests this transition costs roughly $0.50/game at medium scale with open-source models.

**Phase 3 priority: Tiered model routing and event-driven consultation.** Implement a decision router that sends routine decisions to budget models and reserves premium models for strategic turning points. Add event detection that triggers LLM re-consultation only on significant state changes (major territory shifts, unexpected enemy behavior, strategic objectives achieved/failed). This is where the cost curve bends most dramatically.

**Phase 4–5 consideration: Local model deployment.** By 2027, models equivalent to today's Claude Haiku 4.5 will likely run on consumer hardware. For the tactical layer, local inference eliminates per-token costs entirely and reduces latency to single-digit milliseconds. The hybrid architecture makes this transition natural — only the strategic layer needs cloud API access; the tactical layer can run locally.

The vision document should explicitly frame the **per-model behavioral variation as a feature, not a bug.** Different AI personalities using different reasoning styles is the kind of emergent complexity that distinguishes this project from conventional wargame AI. The hybrid architecture preserves this: the LLM still determines personality, strategy, and risk tolerance; it simply delegates spatial execution to systems better suited for it.

---

## Conclusion

The scaling problem is real but bounded, and the solution space is well-mapped. Three independent lines of evidence — the convergent hybrid architectures across multiple game AI projects, the rapid decline in API pricing, and the maturation of tool-calling optimization techniques — all indicate that **the concept is fundamentally viable at all planned map sizes.** The required changes are architectural optimizations within the existing development trajectory, not a pivot. The most important single change is shifting from "LLM controls everything through tools" to "LLM advises a utility AI layer that controls execution" — a transition that the current 5-tool MCP architecture is already structured to support.

The deeper strategic insight is that **the latency constraint may actually be a design advantage.** It pushes toward exactly the hybrid architecture that produces the best AI behavior: LLMs doing what they do well (strategic reasoning, personality, adaptation) and traditional AI doing what it does well (spatial optimization, deterministic execution, real-time response). Every project that tried pure LLM control found the same spatial reasoning failures; every project that adopted the hybrid pattern found the same quality improvements. The scaling problem isn't an obstacle to overcome — it's a signal pointing toward the right architecture.