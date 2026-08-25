# AI commander prompt specification

The source of truth for every message the AI opponent's model sees: the system prompt, the opening instruction, tool results, and the two recovery messages. Prompt-generating code is maintained against this package.

Read this file first, then follow the reading order in section 3.

## 1. Purpose

Prompt behaviour used to live in the code that produced it, spread across an assembler, a briefing formatter, a dozen section builders, and a consultation loop. Changing one surface meant guessing at the others, and the guesses were wrong often enough to keep the prompt churning. This package exists so that a coding agent can answer "what should the prompt say here, and why" without reading all of that code and without asking anyone.

It specifies two things at once:

1. **The information and decision model.** What a weak model has to decide each period, what it is allowed to know, and which facts it therefore needs.
2. **The assembly contract.** Which sections appear in which order, with which headings, columns, include and omit conditions, empty forms, legal actions, and response shape.

A change to prompt behaviour is a change to this package first and to code second. A code change that contradicts this package is a defect in one of the two, and the discrepancy log in `source-inventory.md` is where that gets recorded rather than silently resolved.

## 2. Authority order

1. **Live engine behaviour is first authority.** If a fact, stat, range, cap, phase order, or legality rule can be read from a symbol under `src/`, that symbol wins.
2. **Game-rule documents in `docs/` and `.spec/` are second authority.** They apply where the engine is silent, and are treated as suspect where they contradict a symbol. Contradictions are recorded, not reconciled by preference.
3. **Current prompt copy is not authority.** It is an inventory of what we already tell the model. A sentence appearing in today's prompt is evidence that we say it, never evidence that it is true.
4. Captured prompt dumps in the repository root are examples of emitted shape for one consultation. The strategic and user-message dumps are current enough to cross-check headings; the tactical dump is stale and is not a source for anything.
5. `devleopment-plan-v3.3.md` is historical architecture and is not prompt authority.

## 3. How to use this package

| You want to | Read |
| --- | --- |
| Understand what the model is being asked to do | `information-decision-model.md` |
| Add, move, or remove a fact from the prompt | `information-decision-model.md`, then the mode file, then `crosswalk.md` |
| Change section order, headings, or the response shape | `assembly-contract.md`, then the mode file |
| Change a strategic section, column, or coaching rule | `strategic-prompt.md` |
| Change a tactical section, column, or coaching rule | `tactical-prompt.md` |
| Change anything after the system prompt | `consultation-flow.md` |
| Handle a configuration, roster, or scenario case | `variants.md` |
| Find where an existing prompt section is specified | `crosswalk.md` |
| Know why the code and a spec document disagree | `source-inventory.md` |

Reading order for a first pass: this file, then `information-decision-model.md`, `assembly-contract.md`, the mode file you need, `consultation-flow.md`, `variants.md`. `source-inventory.md` and `crosswalk.md` are reference, not narrative.

Two rules that decide most arguments before they start:

- **The system prompt owns every rule and heuristic.** The opening message, the corrective message, and the repair request are submit-only: they say what to do now and what shape to answer in. They never add, weaken, or restate a rule.
- **Include and omit conditions are binary.** Always, never, or a named condition. If a condition cannot be stated as a test, it is not yet specified.

## 4. Contents

- [`source-inventory.md`](source-inventory.md) — what the prompt says today, what the engine provides, and where they disagree.
- [`information-decision-model.md`](information-decision-model.md) — commander jobs, the visibility contract, and every information item with its required, conditional, or excluded status.
- [`assembly-contract.md`](assembly-contract.md) — identity and coordinates, the shared prompt skeleton, the include and omit matrix, tools versus envelope writes, the response envelope, and shared coaching.
- [`strategic-prompt.md`](strategic-prompt.md) — the full strategic system-prompt contract, table columns, legal actions, and coaching.
- [`tactical-prompt.md`](tactical-prompt.md) — the full tactical system-prompt contract, derived from code only.
- [`consultation-flow.md`](consultation-flow.md) — the opening message, tool results, the corrective message, the repair request, and the outcomes with no prompt.
- [`variants.md`](variants.md) — fog, tool groups, roster composition, scenarios, game size, consultation policy, and the combinations that must not fight.
- [`crosswalk.md`](crosswalk.md) — item to contract, existing section to disposition, gap list, and open defects.

## 5. Supersession

These documents keep their mechanics content and lose their prompt-content authority. Where one of them describes what the prompt should say, this package overrides it. Where it describes how the game works, it remains a mechanics reference subject to the authority order above.

**Active documents, prompt-content claims superseded:**

- `../../.spec/assess-unit-omniscient-grid-proximity.md` — the distance-basis caveat and its gate.
- `../../.spec/naval-transport-briefing-embark-rules.md` — the naval transport section, its columns, and its embark prose.
- `../../.spec/orderless-unit-destination-suggestions.md` — the orderless table and its suggested-destination column.
- `../../.spec/tempo-rule-enforcement.md` — the tempo coaching text. Its description of the engine's own attack sweep remains the mechanics reference, and this package deliberately keeps that sweep out of the prompt; see `strategic-prompt.md` section 4.
- `../game-size-unit-caps.md` — how caps are printed. The cap values themselves remain a mechanics reference and agree with the engine.
- `../../.spec/h3-face-crossing-distances.md` — how distance distortion is disclosed. The geometry remains a mechanics reference.

**Active documents that are not prompt authority at all:**

- `../combat-rules-v3.md` — contradicts the live engine on unit caps and on the tactical turn structure. Mechanics reference only, and only where it agrees with the engine.
- `../devleopment-plan-v3.3.md` — historical architecture.

**Active document this package does not touch:** `../../.spec/prompt-debug-log-split.md` keeps full authority. It governs which debug file each consultation writes, not what the prompt says. The staleness noted in section 2 is a property of the tactical file currently on disk, not of that contract.

**Completed execution plans:** any plan under `../../.spec/completed/` that specified prompt sections, wording, or response shape is historical record. Its decisions are either reflected in this package or were superseded by later code; in neither case is it a current authority. The ones most likely to be reached for are the prompt-improvement and prompt-update plans, the strategic and tactical parity plans and their baseline notes, the tactical prompt section parity plan, the strategic prompt unit-table deduplication note, the Best Options notes on occupancy, approach, and single-source reachability, the tool specification and the memory and standing-order tool plans, the production model-support plan, and the deferred-resolution consult note.

## 6. Out of scope

This package specifies text the model sees. It does not specify:

- Response parsing and order validation implementation, beyond the response shape the prompt promises.
- The engine's own attack sweep, standing-order generation, or any other fallback behaviour, beyond recording that it exists and deciding not to describe it to the model.
- Turn resolution, combat, movement, production, and visibility implementation. Those are the engine, and they are the first authority this package answers to.
- The human player's interface, map rendering, tooltips, and styling.
- Transport concerns: model selection, API keys, token budgeting, wall-clock limits, and network retries, except where one of them changes text the model sees. The tool-round limit is in scope for exactly that reason: exhausting it changes the next system prompt.
- Test implementation. The include and omit matrix, the heading strings, the column lists, and the variant rows are written to be assertable, but the tests themselves are a separate piece of work.
