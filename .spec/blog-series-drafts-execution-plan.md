# Blog Series Draft Generation — Execution Plan

Generate drafts for the Post 0 orienting hub plus all 12 thematic posts of the *Hybrid AI Field Notes* series described in [.social/blog-series-plan.md](../.social/blog-series-plan.md), grounded in the actual `agent-wars` codebase (Electron/TypeScript, hybrid LLM architecture at v2.4.0). Written for a lower-quality implementing agent: staged, with explicit conventions, per-post specs, and per-stage verification.

## Confirmed decisions (from author)

- **Unmeasured numbers:** Use `[DATA]` placeholder blocks with meta-instructions pointing at the specific Appendix A/B/C measurement. **Never invent numbers.** Charts that depend on data become `[IMAGE]` chart specs.
- **Real evidence sources (author-provided):** Two repo artifacts license *real, inline* figures (labelled `verify before publishing`), distinct from the `[DATA]` placeholders above:
  - **Toggl time log** (`.social/TogglTrack_Report_Summary_report_(from_01_01_2026_to_07_12_2026).csv`): agent-wars-specific logged hours, per milestone (M0.1→M2.4) plus Planning / M2.4 Fixes / Promotion. Total ~156 h. Licenses total + per-milestone hours only (not dollars, tokens, or win rates).
  - **`.spec/completed` history**: 99 finished execution plans/design docs, ~1.3 MB, filesystem dates mid-March→early-July 2026. Licenses corpus count/size, monthly cadence **as a relative arc** (not exact per-file authoring dates), and relative plan sizes (ASCII hex-map plan ~60 KB is the largest). Does **not** license a docs-to-**code** ratio (source-LOC unmeasured — stays a placeholder).
  - **`.spec/deprecated` high-level plans**: superseded top-level docs kept rather than deleted — game vision v1 (~8 KB) → v2 (~16 KB); development plan v1 (~37 KB) → v2 (~48 KB) → v3.3 (~72 KB). Licenses the version-progression/growth of the highest-level design and serves as a visible drift record (regenerate-not-patch at the plan level). Version numbers are legitimate content.
  - Canonical figures and usage rules live in `_conventions.md` → "Evidence sources"; per-post usage is tracked in `_media-manifest.md` → "Real figures".
- **Two versions per post:** One file per post containing the canonical **Substack long-form** first, then a **LinkedIn native** section, then a **Cross-post hooks** section (HN/Reddit) where the series plan calls for it.
- **Scope:** All **12 thematic posts**, plus the **Post 0 orienting hub** (`_about-this-series.md`, elevated from an "About" page to a governed first-class post), plus the `methodology-rubric.md` support page.
- **Representative artifacts:** For non-numeric text/code artifacts (briefing/prompt samples, the three coordinate formats, design-doc excerpts, module maps), the agent **generates real representative examples pulled from the actual codebase**, each labelled `(representative — verify before publishing)`. This never extends to numbers — those stay `[DATA]` placeholders. Model-output comparisons that require a live run remain placeholders.
- **Voice:** Everything is written first-person as the author (byline **Michael Kitchin**), in his own voice per `_voice-guide.md`. Matching that voice and passing an anti-LLM-tropes checklist is a hard verification gate on every draft.

## Deliverables & file layout

- Drafts live in `.social/drafts/`.
- One file per post: `.social/drafts/post-01-hex-code-map.md` … `.social/drafts/post-12-closing-reflection.md`.
- Shared support files in `.social/drafts/`:
  - `_conventions.md` — single source of truth for placeholder syntax, front-matter, mermaid rules, artifact-labelling, and the two-version layout.
  - `_media-manifest.md` — consolidated index of every image/video capture instruction and every data measurement. Columns: `Post | Slug | Type | Instruction / measurement | Source ref | Status`.
  - `_about-this-series.md` — the governed **Post 0 orienting hub (Start Here)**: explains the experiment, the three threads, and the cadence; carries the **living series index** (all 12 posts + the methodology page, reading order, one line each, entries marked "coming [week N]" until live); and has both a Substack canonical version (~500-900 words plus the index) and a LinkedIn native front-door version. Pinned on both platforms from day one and kept current on every publish.
  - `methodology-rubric.md` — the public methodology/rubric page (Substack version of Appendix B) that Post 4 links to.
  - `_voice-guide.md` — the author's voice profile + anti-LLM-tropes checklist.

## Draft conventions (see `_conventions.md` for the authoritative copy)

Front-matter, section skeleton (Substack canonical -> LinkedIn native -> Cross-post hooks), and placeholder syntax for `[IMAGE]`, `[VIDEO]`, and `[DATA]` are defined in `_conventions.md`. Mermaid diagrams are real fenced blocks that reflect the real code (cite source files in an HTML comment above each), follow repo mermaid rules (no spaces in node IDs, quote labels with special characters, no explicit colors/styling, avoid reserved IDs, no click events), and lean on diagrams/screenshots over long code listings. Posts may expand beyond the series plan but never shrink below its intent.

## Constraints

- Do **not** leak this plan's internal stage identifiers into any draft file. Blog references to game milestones (like 2.4) and to the series' own Appendices are legitimate content.
- Substack version is authored first; LinkedIn is derived from it.
- Screenshots/clips avoid debug overlays and JSON dumps unless the post is specifically about internals.
- **Built vs planned:** drafts must clearly distinguish shipped features (code is at **v2.4.0** — global + tactical gameplay, hybrid AI, tools, fog, economy) from planned ones (e.g., **AI Observatory** and **tiered model routing** are future Milestone 3.2 work). "AI reasoning visible" screenshots point at the **existing OpenRouter log panel** (`src/renderer/openRouter/openRouterUiHelpers.ts`), not the future Observatory.
- Representative artifacts drawn from code are labelled `(representative — verify before publishing)`.

## Stages (each = a verifiable batch)

Ordered to front-load code-grounded posts and respect dependencies (synthesis post last). Diagrams built early (hybrid architecture, coordinate translation) are reused later.

- **Foundation:** create `_voice-guide.md`, `_conventions.md`, `_media-manifest.md` (table skeleton), and `_about-this-series.md`. `_about-this-series.md` (the governed Post 0 hub, with living index + LinkedIn front-door version) doubles as the first voice calibration check. Its living index is drafted with all 12 entries up front, each marked "coming [week N]", and refreshed whenever a title or the lineup changes.
- **Architecture spine:** Posts 2 and 8 (establish the canonical hybrid three-layer diagram + turn sequence reused elsewhere).
- **Agentic Development thread:** Posts 3, 9, 6.
- **Spatial Reasoning thread:** Posts 1, 5, 10.
- **LLM Systems Engineering thread:** Posts 4, 7, 11.
- **Synthesis & consistency:** Post 12 (index links to all draft files) + `methodology-rubric.md` + a final cross-draft consistency pass and a finalized `_media-manifest.md`. Reconcile the two indexes: Post 0's living index (front door) and Post 12's retrospective index must list the same lineup and titles.

## Per-batch verification

A batch passes when, for each post in it:
- File exists at the correct path with valid front-matter and all applicable sections.
- Substack body meets word-minimum; LinkedIn hook fits the char budget.
- Contains the required mermaid diagram(s), each with a `<!-- source: ... -->` comment.
- Contains the required IMAGE/VIDEO/DATA placeholders, each mirrored in `_media-manifest.md`.
- No invented numbers; every numeric claim is a `[DATA]` placeholder.
- No internal stage identifiers present.
- **Voice pass:** reads in the author's first-person voice per `_voice-guide.md` and passes the anti-LLM-tropes checklist.

The synthesis batch additionally verifies: Post 12 links resolve to all 11 other files, terminology/diagram reuse is consistent, and `_media-manifest.md` covers every placeholder.

## Appendix — per-post spec (thesis via the series plan; diagrams/media grounded in code)

For each post, first read that post's section in [.social/blog-series-plan.md](../.social/blog-series-plan.md) for editorial intent, then add the diagrams/media below.

**Post 0 — Start Here / orienting hub (Synthesis):** `_about-this-series.md`.
- Two versions: Substack canonical (~500-900 words plus the living index) and a LinkedIn native front-door version (pinned to the profile from day one).
- Living index (hard requirement): all 12 thematic posts + the methodology page, in reading order, one line each, entries marked "coming [week N]" until published; kept consistent with Post 12's retrospective index.
- Images: one clean strategic-map screenshot (`about-strategic-map`); the three-threads overview diagram reused from Post 2 (`about-three-threads`) — optional as a Substack visual TOC, used as the LinkedIn feed image.
- Real evidence: the ~156 h / ~99-doc scope figures as the up-front honesty anchor (Toggl + `.spec` history; label verify-before-publishing). No new numbers beyond the registered sources.

**Post 1 — Hex Code Map (Spatial):** `post-01-hex-code-map.md`.
- Mermaid: coordinate translation H3 -> 2-char code -> ASCII map `<!-- src/main/briefing/map/hex-coordinates.ts, hex-code-translator.ts, hex-map-renderer.ts -->`; briefing assembly sequence `<!-- src/main/briefingFormatter.ts -->`.
- Images: side-by-side of the three formats (lat/lng table, hex-code table, ASCII hex map) from sanitized real briefing output; token-count-by-format chart; hallucinated-coordinate-rate chart.
- Video (optional): 15-30s of the AI issuing orders that reference hex codes.
- Data: Appendix A #2, #4, #9.
- Real evidence: the ASCII hex-map execution plan is the single largest design doc in the corpus (~60 KB), used as inline proof the representation change was a deliberate, major effort — not a tweak.

**Post 2 — The Project (framing):** `post-02-the-project.md`.
- Mermaid (canonical, reused later): hybrid three-layer architecture `<!-- src/main/hybridTurnPipeline.ts + layer map -->`; three R&D threads overview.
- Images: one clean strategic-map screenshot (no overlays). Video: 15-30s turn resolving with AI strategy text visible.
- Real evidence: "what's actually working" grounded in real scale — ~156 h logged (~four work-weeks) and ~99 completed design docs (~1.3 MB), mid-March→early-July, as concrete proof the project is real and the agentic-development leverage is measurable.

**Post 3 — TS Codebase for Agentic Dev (Agentic):** `post-03-codebase-for-agents.md`.
- Mermaid: doc-to-code flow (`.spec/` design doc -> execution plan -> agent generation -> audit -> regenerate); repo module map `<!-- src/main, src/renderer, src/shared -->`.
- Images: sanitized `.spec/completed/*` doc excerpt; docs-to-code ratio chart. Data: Appendix A #7, #6.
- Real evidence: the ~99-doc / ~1.3 MB spec corpus as inline proof the docs stayed load-bearing; the M1.1 case (~3 h implementation behind a 33 KB design doc) as a concrete "doc-heavy, implementation-light" anchor; hours-split teaser (~141 h dev/test vs ~3 h planning) pointing forward to Posts 6/7. The docs-to-**code** *ratio* stays a `[DATA]` placeholder (source-LOC unmeasured).

**Post 4 — Three-Way Head-to-Head (LLM Systems):** `post-04-head-to-head.md`.
- Mermaid: eval harness flow (scenario -> fixed heuristic baseline -> model -> rubric); the five process metrics.
- Images: comparison table, cost-vs-quality scatter, sanitized side-by-side outputs (model-output comparisons stay placeholders — require a live run). Link the inline rubric summary to `methodology-rubric.md`. Data: Appendix C exp 1; Appendix B rubric; Appendix A #3, #5.

**Post 5 — What LLMs Can/Can't Do Spatially (Spatial):** `post-05-spatial-limits.md`.
- Mermaid: context-vs-model failure diagnostic flowchart; passivity -> engagement-initiation metric, compensated by precompute/callbacks `<!-- src/main/precomputation.ts, callbackEvaluation.ts -->`.
- Images: before/after AI-behavior vignette with metric delta. Data: Appendix B metrics 2/3/5; Appendix C exp 2/10.

**Post 6 — Cursor & RooCode Breakdown (Agentic):** `post-06-tool-breakdown.md`.
- Mermaid: categorized failure seams.
- Images: agent-intervention-rate chart; seams graphic. Data: Appendix A #8, #6.
- Real evidence: logged hours concentrate on exactly the named seams — terrain/spatial pipeline (M1.2 ~20 h), tactical resolution/ordering (M2.3 ~21 h), region-vs-region (M1.7 ~15 h) — as real support for "these are where humans drove"; the maintainability-consolidation plan reaching v4 as evidence of adapting the codebase to the tool's shape. The accept/override intervention *rate* stays a `[DATA]` placeholder.

**Post 7 — Cost-per-Decision Economics (LLM Systems):** `post-07-cost-economics.md`.
- Mermaid: single-turn cost path showing precompute-free / LLM-only-on-events `<!-- src/main/callbackEvaluation.ts, afterResolution.ts -->`; briefing token composition.
- Images: cost-per-game over milestones; cost-per-decision by model; worked single-turn example. Data: Appendix A #1/#3/#9; Appendix C exp 9.

**Post 8 — Hybrid LLM Architecture Pattern (LLM Systems):** `post-08-hybrid-architecture.md`.
- Mermaid: three-layer architecture (reuse Post 2's canonical); single-turn sequence of which layer fires when `<!-- afterResolution -> callbackEvaluation -> precomputation -> requestOrdersFlow -> tool5StandingOrdersGeneration -->`; layer-to-tool mapping table (tool1-6, pathfinding.ts, combatResolution.ts).
- Images (optional): the existing OpenRouter log panel (Observatory is future — flag as planned). Cite CICERO (see [.spec/market-research.md](market-research.md)) as supporting evidence, not own finding.
- Real evidence: the tool layer was a heavy design lift — the MCP tools spec (~58 KB) and standing-orders tool spec (~55 KB) are among the largest docs in the corpus — used as a light inline anchor for "the layering emerged from the tools."

**Post 9 — Living Design Documents (Agentic):** `post-09-living-docs.md`.
- Mermaid: audit cycle loop (completeness/correctness/consistency/compliance); regenerate-not-patch flow.
- Images: sanitized doc excerpt; `.spec/completed/` listing. Data: reuse Post 3 docs-to-code ratio.
- Real evidence: the corpus made concrete — 99 completed docs (~1.3 MB) over ~four months, largest the ~60 KB ASCII hex-map plan; the maintainability plan's v1→v4 progression and the deprecated high-level plans (vision v1→v2, dev plan v1→v2→v3.3) as a *visible drift record* — old versions kept, not deleted. This is the strongest concrete grounding for the whole living-docs thesis.

**Post 10 — Information Symmetry & Fairness (Spatial):** `post-10-information-symmetry.md`.
- Mermaid: symmetric vs asymmetric info setup (full-map briefing for AI vs cropped); subjective fog pipeline `<!-- src/main/visibility.ts, game-db/fogState.ts, gameDb.getGameStateForPlayer -->`.
- Images: what-gets-cropped vs not; the full AI briefing map.

**Post 11 — Model Selection in a Hybrid Architecture (LLM Systems):** `post-11-model-selection.md`.
- Mermaid: task-type -> model-tier decision matrix; tiered routing by event type `<!-- consultationPolicy.ts; note Milestone 3.2 routing is partly future — flag honestly -->`.
- Images: cost-per-rubric-point bar chart; tiered-routing savings chart. Data: Appendix C exp 3/4; Appendix B.

**Post 12 — Closing Reflection & Index (Synthesis):** `post-12-closing-reflection.md`.
- Mermaid: three-threads-across-weeks synthesis timeline (ground the timeline in real spec-history arcs + high-level plan versions).
- Images: synthesis chart (cost-per-game across milestones overlaid with architectural changes); final clean screenshot.
- Content: index linking all 11 other draft files with one-line summaries.
- Real evidence: the headline arc — ~156 h logged (~four work-weeks), ~99 completed design docs (~1.3 MB), high-level plan from vision v1 to development plan v3.3 over ~four months — as the concrete spine of the closing reflection.
