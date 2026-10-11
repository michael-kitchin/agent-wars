# AI commander prompts (what the model is told)

Catalog of every message the AI opponent's model sees today: the system prompt, the opening instruction, tool results, and the two recovery messages. **The builders under `src/main/openRouter/` are first authority.** This package describes those emissions. If a heading, gate, or sentence here disagrees with the builders, the code is correct and this folder should be updated.

Read this file first, then follow the reading order in section 3.

## 1. Purpose

Prompt behaviour used to live only in the assembler. The files here exist so a reader can answer "what does the model see, and why" without reading every builder. They are **not** a backlog of desired copy. Changing prompt behaviour is a code change; this package is updated to match.

It records two things:

1. **The information and decision model.** What a weak model has to decide each period, what it is allowed to know, and which facts the builders therefore carry.
2. **The assembly the builders emit.** Section order, headings, columns, include and omit conditions, empty forms, legal actions, and response shape.

## 2. Authority order

1. **Live engine behaviour is first authority.** If a fact, stat, range, cap, phase order, or legality rule can be read from a symbol under `src/`, that symbol wins. Game-rule pages in `doc/` answer to the same symbols.
2. **Prompt-generating code is first authority for wording.** The system prompt is assembled by `buildSystemPromptForTools` (`openRouterBuildSystemPrompt.ts`). Combat sentences live in `promptSpec/gameRuleText.ts`. Coaching lives in `promptSpec/coachingTextStrategic.ts` and `coachingTextTactical.ts`. Envelope shape lives in `promptSpec/envelopeContract.ts`; the structured-output schema built from the same gates lives in `promptSpec/envelopeJsonSchema.ts`. Opening and repair user messages live in `promptSpec/consultationText.ts`. Briefing tables live in `briefingFormatter.ts`, `formatTacticalBriefing.ts`, and the section builders they call.
3. **This package describes that emission.** A sentence here is evidence of what we tell the model only insofar as it matches those builders.
4. Captured dumps (`debug-last-strategic-prompt.txt`, `debug-last-user-prompt.txt`) are examples of emitted shape for one consultation. The tactical dump on disk may be stale; tactical catalogs below are derived from code.
5. [`devleopment-plan-v3.4.md`](../devleopment-plan-v3.4.md) is historical architecture and is not prompt authority.

## 3. How to use this package

| You want to | Read |
| --- | --- |
| Understand what the model is being asked to do | [`information-decision-model.md`](information-decision-model.md) |
| See which fact a section carries | [`information-decision-model.md`](information-decision-model.md), then the mode file, then [`crosswalk.md`](crosswalk.md) |
| See section order, headings, or the response shape | [`assembly-contract.md`](assembly-contract.md), then the mode file |
| See a strategic section, column, or coaching bullet | [`strategic-prompt.md`](strategic-prompt.md) |
| See a tactical section, column, or coaching bullet | [`tactical-prompt.md`](tactical-prompt.md) |
| See anything after the system prompt | [`consultation-flow.md`](consultation-flow.md) |
| See a configuration, roster, or scenario case | [`variants.md`](variants.md) |
| Find where an existing prompt section is specified | [`crosswalk.md`](crosswalk.md) |
| Know what the builders emit today, and remaining engine-versus-copy gaps | [`source-inventory.md`](source-inventory.md) |

Reading order for a first pass: this file, then [`information-decision-model.md`](information-decision-model.md), [`assembly-contract.md`](assembly-contract.md), the mode file you need, [`consultation-flow.md`](consultation-flow.md), [`variants.md`](variants.md). [`source-inventory.md`](source-inventory.md) and [`crosswalk.md`](crosswalk.md) are reference.

Two rules the builders actually enforce:

- **The system prompt owns every rule and heuristic.** The opening message, the corrective message, and the repair request are submit-only: they say what to do now and what shape to answer in. They do not add, weaken, or restate a rule. The tactical opening repeats `TACTICAL_STANDING_ORDER_PROHIBITION` identically because that is the most common carry-over error.
- **Include and omit conditions are binary.** Always, never, or a named condition the assembler already computes.

## 4. Contents

- [`source-inventory.md`](source-inventory.md) — what the prompt says today, what the engine provides, and remaining disagreements.
- [`information-decision-model.md`](information-decision-model.md) — commander jobs, the visibility contract, and every information item.
- [`assembly-contract.md`](assembly-contract.md) — identity and coordinates, the shared prompt skeleton, the include and omit matrix, tools versus envelope writes, the response envelope, and shared coaching.
- [`strategic-prompt.md`](strategic-prompt.md) — the strategic system prompt as emitted.
- [`tactical-prompt.md`](tactical-prompt.md) — the tactical system prompt as emitted.
- [`consultation-flow.md`](consultation-flow.md) — the opening message, tool results, the corrective message, the repair request, and outcomes with no prompt.
- [`variants.md`](variants.md) — fog, tool groups, roster composition, scenarios, game size, consultation policy.
- [`crosswalk.md`](crosswalk.md) — item to carrier, existing section to disposition, and closed or remaining defects.

## 5. Related documents

These documents keep their mechanics content. They do not override emitted prompt copy.

- [`combat-rules-v3.md`](../combat-rules-v3.md) — mechanics reference, aligned to the engine as of 2.5.0.
- [`hybrid-ai.md`](../hybrid-ai.md), [`ai-tools.md`](../ai-tools.md) — consult loop and tool names, not prompt copy.
- [`devleopment-plan-v3.4.md`](../devleopment-plan-v3.4.md) — historical architecture.
- [`prompt-debug-log-split.md`](../../.spec/completed/prompt-debug-log-split.md) — which debug file each consultation writes, not what the prompt says.

Completed execution plans under [`.spec/completed/`](../../.spec/completed/) that specified prompt wording are historical. Their decisions are either reflected in the builders or were superseded.

## 6. Out of scope

This package describes text the model sees. It does not specify:

- Response parsing and order validation implementation, beyond the response shape the prompt promises.
- The engine's own attack sweep, standing-order generation, or other fallbacks, beyond recording that they exist and that the prompt does not describe them.
- Turn resolution, combat, movement, production, and visibility implementation.
- The human player's interface.
- Transport concerns except where they change text the model sees. The tool-round limit is in scope because exhausting it changes the next system prompt.
