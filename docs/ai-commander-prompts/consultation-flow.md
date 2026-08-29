# Consultation flow

Every message the model sees after the system prompt: the opening instruction, tool results, the corrective message after an unusable reply, and the repair request after unparseable output.

**One rule governs this whole file.** The system prompt owns every game rule and every heuristic. Messages contracted here are submit-only: they say what to do now and what shape to answer in. They must not add a rule, weaken one, or restate one in different words. A message that needs a rule points at the system section that holds it.

## 1. Conversation shape

Roles in order for a normal consultation:

1. `system` — the prompt assembled by `buildSystemPromptForTools` per `assembly-contract.md` and the active mode file. Built once.
2. `user` — the opening instruction, section 2.
3. Zero or more rounds of: `assistant` carrying tool calls, then one `tool` message per call, section 3.
4. `assistant` — the response envelope as text.

Invariants:

1. **The system prompt is never rewritten mid-consultation.** It is not replaced, re-sent, or appended to. Any fact that must reach the model after the first call arrives as a tool result, and any fact that only becomes known between consultations reaches the model in the *next* system prompt. The previous-consultation tool-budget warning is the one example of that, and it belongs to the system prompt, not here.
2. **Exactly one opening user message.** Additional user messages appear only in the two recovery cases in sections 4 and 5.
3. **Tool rounds are bounded.** The loop ends after a fixed number of rounds and is separately bounded by a wall-clock limit. Exhausting either produces no orders for the period, sets the flag that puts the warning in the next system prompt, and records the consultation as having produced nothing. There is no additional prompt in that case.
4. **The repair exchange is off to the side.** It runs on a copy of the conversation. Neither the unparseable assistant text nor the repair request and its answer is merged back into the main message list.

## 2. Opening user message

### 2.1 Contract

The opening message does exactly three things, in this order:

1. Names where the situation is: the briefing in the system prompt above.
2. Names the action for this period in one clause: use the listed options, and use the routing tool only for something not listed.
3. Names the response envelope fields to emit, in envelope order, marking the optional tails that this consultation's flags allow.

It must not:

- restate combat statistics, ranges, resolution order, or the tempo rule;
- restate the win conditions or any scenario text;
- restate production doctrine, cap rules, or queue policy;
- restate embark legality, air employment rules, or movement budgets;
- restate the option-row copy mapping beyond the one clause in item 2;
- introduce a field the mode's envelope contract does not permit, or omit a required one;
- name a tool that is not in this consultation's tool list.

Pointing at a system section is allowed and preferred: naming the briefing, the options table, or the envelope is not restating a rule.

### 2.2 Branches

One contract per branch of the opening-message builder. The gate column names the flag combination; the contract column states what the submit-only message says. Every branch names the same envelope fields the mode's contract permits, with the same optional tails.

| Gate | Contract |
| --- | --- |
| Planning tools on, briefing present, tactical | Point at the briefing for status, flags, and this beat's options. One clause: copy one move or approach row and one ranged row per sub-unit; route only for an unlisted destination. Then name the envelope: message, strategy, orders with the beat's legal actions, and the callbacks tail. State that standing-order assignment and cancellation are not accepted this beat — this is the one prohibition the opening message repeats, because it is the most common carry-over error and the envelope contract already states it identically. |
| Planning tools on, briefing present, strategic | Point at the briefing for status, flags, options, and hex intelligence. One clause: copy one option row per unit per action into the matching envelope field; route only for an unlisted destination. When standing-order tools are on, one clause: give the units in the orderless table standing orders. Then name the envelope: message, strategy, orders with the strategic legal actions, plus the callbacks tail and, when their flags are on, the memory and production tails. **No production doctrine paragraph.** The cap and queue rules live in the production section of the system prompt. |
| Planning tools on, briefing absent | Point at the tools as the way to derive destinations, since there is no options table. Then name the envelope with the same tails as the matching briefing-present branch. |
| Planning tools off, standing-order tools on | State that movement planning is unavailable and that missions are issued as standing orders in the envelope. Then name the envelope, with `orders` expected to carry standing-order actions and an empty movement set. |
| Planning tools off, standing-order tools off, fallback movement on | Point at the fallback adjacent-cell listing in the system prompt as the only source of move destinations. Then name the envelope. |
| Any remaining combination | Point at the briefing and name the envelope with an empty `orders` array as the acceptable answer. |

`getToolFlags` derives `fallbackMovementEnabled` as the negation of planning and standing-order flags, so the last two rows are the fallback listing versus empty-orders, not dead code.

### 2.3 Opening message versus system prompt

The opening message does **not** carry game rules. Production doctrine, cap rules, option-copy mapping, memory-write instructions, and `plan_route` restrictions live in the system prompt. The opening message keeps only the situation pointer, one action clause, the envelope field list, and (tactical only) `TACTICAL_STANDING_ORDER_PROHIBITION` worded identically to the envelope contract.

## 3. Tool-result messages

1. **One result message per tool call**, carrying the call's identifier and a JSON payload.
2. **Results are facts, not rules.** A tool result must not contain instructions, coaching, or policy. If a tool's output would need explaining, the explanation belongs in the tool's line in `# Available Tools`.
3. **Geography is code-first.** Every geographic value in a successful result is rewritten to briefing codes before the model sees it, in the registry of the active mode. The rewriting covers: the routing tool's ordered destination, path cells, and suggested destinations; the distance tool's endpoints; production queue cells; and the position, destination, defend cell, target cell, next-move cell, origin, endpoint, and range endpoints on assessment, estimate, standing-order, and memory results, plus waypoint and full-path lists.
4. **Nothing outside that set is rewritten.** A tool whose result carries a geographic value under a key not in the rewrite set is a defect: the model would receive raw geometry it is told never to use. Adding a geographic key to a tool result requires adding it to the rewrite set in the same change.
5. **Failures pass through as the engine states them.** An unsuccessful result reaches the model unchanged. The prompt must not invent a second error vocabulary. The three model-visible failure shapes are: a call to a tool that is not enabled, arguments containing a cell code that cannot be resolved, and a call to a tool the dispatcher does not recognise.
6. **Encoding never fails loudly.** If rewriting a value throws, the original result is delivered rather than an error, so a rewrite bug degrades to raw data rather than to a dead consultation. This is a known trade-off and the reason rule 4 exists.
7. **Tools stay available during recovery.** Tool calls remain legal after an unusable reply, section 4.

## 4. Corrective message after an unusable reply

1. **Trigger.** The model returns neither a tool call nor any text content.
2. **Budget.** A small fixed number of retries, with a short randomised delay between them. On exhaustion the consultation fails with the engine's own failure reason and produces no orders. There is no further prompt.
3. **When the message is appended.** Only before the final retry. Earlier retries re-send the same conversation unchanged, so a transient empty completion is not answered with extra instructions the model did not need.
4. **Content contract.** Four clauses, and nothing else: the previous reply was unusable because it contained neither a tool call nor text; do not repeat it; answer now with exactly one of a single well-formed tool call or the complete response envelope as one JSON object matching the schema in the system prompt; never return an empty message. It must not restate the schema, the field list, or any game rule — it points at the system prompt for both.
5. **Tools remain enabled** on retries, with the same tool list and the same automatic tool choice. The corrective message must not tell the model to stop using tools.

## 5. Repair request after unparseable output

1. **Trigger.** The final assistant text is present but cannot be parsed as the response envelope.
2. **Budget.** Exactly one repair call per consultation. A second failure fails the consultation with the engine's parse-failure reason and produces no orders. There is no fallback prompt and no partial-order salvage.
3. **Tools are disabled** for the repair call: no tool list is sent and tool use is explicitly refused. The model has one job, which is to re-emit the object.
4. **Content contract.** Three clauses: the previous response was not parseable JSON; reply with compact JSON only, with no prose, no markdown, no code fences, and no extra whitespace; use exactly this top-level object schema, with the schema inlined. Plus two constraints that are shape, not rules: never a top-level array, and omit optional arrays when empty. It must not teach a game rule, must not re-explain any action's meaning, and must not introduce a field the mode forbids.
5. **Legacy field names.** The request states that only the `orders` array is accepted and that the legacy top-level movement and ranged-attack arrays are not. This is a restatement of the envelope contract's own invalid-output rule, worded identically, and is the only duplication permitted here because unparseable output is frequently exactly that mistake.

### 5.1 Repair schema contract

The inlined schema is a single JSON object with fields in envelope order: `message`, `strategy`, `orders`, then the air and ferry tails, then `callbacks`, then the memory tail, then the production tail.

| Field | Strategic | Tactical |
| --- | --- | --- |
| `message`, `strategy`, `orders` | always, in that order | always, in that order |
| `airStrikes`, `ferryOrders` | when the opponent has air units | when the opponent has air sub-units |
| `callbacks` | always | always |
| `memoryUpdates` | when memory tools are enabled | **never** |
| `productionOrders` | when production tools are enabled | **never** |

Consistency requirements, each of which a contract test can assert:

1. `message` precedes `strategy`, which precedes `orders`.
2. No field appears in the repair schema that the active mode's envelope contract forbids. In particular a tactical repair schema contains neither the production tail nor any standing-order action.
3. No field the active mode's envelope contract requires is missing from the repair schema.
4. Illustrative action entries in the schema use only actions the active mode permits: strategic may show standing-order assignment, cancellation, movement, and a ranged action; tactical may show movement and a ranged action only.
5. Placeholder cell codes and unit ids in the schema are marked as illustrative wherever the surrounding text could be read as naming real units.

## 6. Outcomes with no prompt

Four ways a consultation ends without producing orders. In none of them does another message reach the model, and none may be given a fallback prompt.

| Outcome | Model-visible consequence |
| --- | --- |
| Unusable replies exhaust the retry budget | Consultation fails; no orders for the period |
| Repair fails | Consultation fails; no orders for the period |
| Tool rounds exhausted | No orders for the period; the next system prompt carries the tool-budget warning |
| Wall-clock limit exceeded | Consultation is cancelled; no orders for the period |

Two consequences that belong to the prompt rather than to transport:

1. **The warning is a next-consultation surface.** Its text belongs to the system prompt's situational directives and states the round limit, the fact that nothing was submitted, and the instruction to submit promptly. The quoted limit is `REQUEST_ORDERS_MAX_TOOL_ROUNDS`.
2. **No orders is not no consequence.** A period with no orders still resolves. Under the strategic layer the engine's own fallbacks act for unordered units; in battle nothing moves, because standing orders are inert there. The prompt does not tell the model about the strategic fallbacks (`TEMPO_SWEEP_SILENCE`).
