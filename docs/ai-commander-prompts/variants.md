# Runtime variants

What changes, surface by surface, for every gate the engine can present. Rows describe **emitted** behaviour. A surface that does not change says `unchanged`.

Surfaces in every table: **system** (the system prompt), **user** (the opening message), **tools** (the enabled tool list), **envelope** (the response object), **coaching** (rules and heuristics), and **empty-state**.

## 1. Fog of war

Gate: `state.fogOfWarEnabled` on the snapshot, resolved by `isFogOfWarEnabled` (default on). The snapshot handed to prompt assembly is already filtered by `getGameStateForPlayer`, so the prompt never applies fog itself.

### 1.1 Fog on, strategic

| Surface | Contract |
| --- | --- |
| system | Enemy rows in every table are limited to what the snapshot lists. Nearest-enemy cells carry intel quality and a last-seen turn. Unexplored terrain renders as unknown on the map, using the undiscovered marker. Own home region cells and the shared cells are force-visible, so home-region bullets are legitimate even for unscouted ground. After the Unit Status heading, emit the intel-staleness sentence and the path-versus-Best-Options line: printed nearest-enemy distances are march or sail path lengths when a path exists (otherwise a hop count), and Best Options Target Hexes are already this-turn legal destinations even when that printed path is longer than one movement budget. |
| user | unchanged |
| tools | unchanged |
| envelope | unchanged |
| coaching | Include the staleness rule: a last-known position is a report with an age, and a report older than the retention window is dropped rather than shown as old. Include the scouting rule when the observed roster is empty. Include the path-versus-Best-Options caution so the model copies listed dests instead of treating a printed path of two-plus turns as unreachable this turn. |
| empty-state | With no observed enemy, nearest-enemy cells are em dashes and the scouting directive is present. |

### 1.2 Fog off, strategic

| Surface | Contract |
| --- | --- |
| system | Every cell is visible and explored, and every enemy unit appears. The distance-basis caveat line is **required**: printed distances are straight grid hops, not march or sail paths. |
| user | unchanged |
| tools | unchanged |
| envelope | unchanged |
| coaching | Drop the staleness rule; every report is current. Keep the hop-versus-path caution, because an enemy two hops away across water may be many turns away by sea. |
| empty-state | An empty observed roster with fog off means the enemy has no units; the scouting directive is still emitted by the roster gate and does no harm, but the goal statement is what tells the model the game is nearly over. |

The caveat lines' gates are **the meaning of the numbers**. Neither honesty line appears in a battle prompt, because both gates require the strategic resolution. If fog-off distances ever become path-based, the hop-count line would be removed rather than reworded; if fog-on distances ever become hop counts, the path-versus-Best-Options line would be removed rather than reworded.

### 1.3 Tactical, either fog setting

| Surface | Contract |
| --- | --- |
| system | Every sub-unit in the footprint is visible to both sides and the narrative says so. The distance-basis caveat is **never** emitted. Fog-off does not make the battle prompt omniscient in the strategic sense; it changes nothing inside the footprint. |
| user | unchanged |
| tools | unchanged |
| envelope | unchanged |
| coaching | No staleness rule, no scouting rule. |
| empty-state | Not reachable while the battle is live; a battle with no enemy sub-units ends rather than consults. |

## 2. Tool groups disabled

Gate: the enabled tool-name set, reduced to flags by `getToolFlags`. Each group is independent. Compound cases follow from applying each row.

### 2.1 Memory group off

| Surface | Contract |
| --- | --- |
| system | Omit the memory section entirely, including its tables, slot lines, and read and write guidance. |
| user | Do not name the memory tail. |
| tools | The memory read tool is absent from the numbered list. |
| envelope | Omit the memory tail from the contract, the example, and the repair schema. State once that memory entries are ignored when memory tools are not listed, so a model with the habit does not assume silent acceptance. |
| coaching | Drop the persist-intent rule. |
| empty-state | n/a — omission, not emptiness. |

### 2.2 Standing-order group off

| Surface | Contract |
| --- | --- |
| system | Omit the standing-order status section and the orderless table. |
| user | Do not name standing-order actions among the legal ones. |
| tools | The order-query tool is absent. |
| envelope | Omit the standing-order assignment and cancellation actions from the legal-action list, the example, and the repair schema. |
| coaching | Drop the orderless-unit rule, the leave-working-missions rule, and the march-to-own-cell rule. Keep the fire-withholding rule **only if** the withholding order remains issuable; when standing orders are off it is not, so drop it too and rely on the model simply not ordering an attack. |
| empty-state | n/a. |

Consequence for the narrative paragraph: the sentence counting units without a standing order is suppressed, and the attention flags emit no standing-order warning bullets.

### 2.3 Production group off

| Surface | Contract |
| --- | --- |
| system | Omit the production section, the cap lines, the queue table, and every production clause elsewhere. |
| user | Do not name the production tail and do not carry production doctrine. |
| tools | Both production tools are absent. |
| envelope | Omit the production tail from the contract, the example, and the repair schema. |
| coaching | Drop the keep-production-queued rule and the cap rule. |
| empty-state | n/a. |

### 2.4 Planning and assessment groups off

| Surface | Contract |
| --- | --- |
| system | With planning off and standing orders also off, include the fallback adjacent-cell listing: one line per own unit giving its current cell as a hold option plus the legal empty neighbours. With assessment or estimation off, drop their guidance bullets; those bullets are also dropped whenever a briefing is attached, since the tools are unavailable in that configuration regardless of flags. |
| user | Point at the fallback listing as the only source of move destinations when it is present; otherwise point at the tools. |
| tools | The routing and distance tools disappear with the planning group; the assessment and estimate tools disappear with theirs. |
| envelope | unchanged in shape. Movement remains legal, but the destination rule changes to the fallback listing. |
| coaching | Replace the copy-options rule with the fallback-listing rule: destinations come only from that list, and the unit's own cell means hold. Drop the routing-tool clauses. |
| empty-state | A unit with no legal empty neighbour is listed as hold-only, so the model is never left inferring that an absent unit has no options. |

### 2.5 Tactical mode and tool flags

In battle the memory, standing-order, production, assessment, and estimation groups are **always** off regardless of what the flags would enable strategically. A tactical prompt therefore always follows rows 2.1 through 2.3 and drops the assessment guidance, even when the same game's strategic consultations include all of them. This is not a configuration; it is a mode invariant.

## 3. Roster composition

Gates: presence of each arm among the opponent's own units, presence of observed enemy units, presence of option rows, and presence of orderless units.

### 3.1 Opponent has no air units

| Surface | Contract |
| --- | --- |
| system | Omit the air operations section. Omit the air clause from the combat paragraph, so the tempo sentence names ranged attacks only. |
| user | Do not name the air or ferry tails. |
| tools | unchanged |
| envelope | Omit the air and ferry tails from the contract, the example, and the repair schema. |
| coaching | Drop the idle-air rule and the strike-or-ferry exclusivity rule. |
| empty-state | The section is omitted, not emitted as a row of dashes. A dash table costs context and invites the model to hunt for air options that do not exist. |

### 3.2 Opponent has no naval units

| Surface | Contract |
| --- | --- |
| system | Omit the naval transport section, the naval clause from the combat paragraph, and the routing tool's land-target clause. |
| user | unchanged |
| tools | The routing tool's line is emitted without its naval suffix. |
| envelope | Omit the embark, transport, and disembark actions from the legal-action list. |
| coaching | Drop the naval-routing rule and the sealift rule. |
| empty-state | Section omitted rather than emitted with dashes, same reasoning as 3.1. |

### 3.3 No observed enemy units

| Surface | Contract |
| --- | --- |
| system | Include the scouting directive. The narrative's first sentence states the observed count as zero and adds that enemy forces may be out of view. Nearest-enemy cells in the unit table are em dashes. The observed-enemy roster line uses its empty phrasing. |
| user | unchanged |
| tools | unchanged |
| envelope | unchanged |
| coaching | Include the scouting rule. Suppress target-selection coaching that presumes a target: the casualty rule and the tempo rule still hold as statements of how combat works, but the worklist framing that tells the model to work through ranged rows must degrade gracefully when there are no such rows. |
| empty-state | Attention flags will typically be `None.`, and the model's only work is movement, production, and orders. |

### 3.4 No option rows

| Surface | Contract |
| --- | --- |
| system | Omit the options subsection. |
| user | Point at the routing tool rather than at the options table. |
| tools | unchanged |
| envelope | unchanged |
| coaching | Replace the copy-options rule with an explicit statement that no options are listed this period and that destinations must come from the routing tool. Do not leave a copy instruction pointing at an absent table; that is the failure mode this row exists to prevent. |
| empty-state | The subsection is absent, not present-and-empty. |

### 3.5 Only orderless units, or none

| Surface | Contract |
| --- | --- |
| system | The orderless table is emitted whenever the standing-order block is present, listing every march-capable unit without an order. A suggested destination is required for every such unit that has a closing cell; a unit with no closing cell shows an em dash. |
| user | unchanged |
| tools | unchanged |
| envelope | unchanged |
| coaching | unchanged. The orderless rule already covers both the full and empty cases. |
| empty-state | When every unit has an order, the table shows one row of dashes rather than being omitted, so the model can tell "none outstanding" from "section missing". |

## 4. Scenarios

Gate: `state.scenarioId`, which is optional on the snapshot and today has exactly one value.

### 4.1 Region-versus-region

| Surface | Contract |
| --- | --- |
| system | Include the scenario objective section with the scenario id, both region names when present, both win paths, and the always-visible-outlines statement. Include the home-region bullets in the coaching block: own home control, own home cells when the region sets differ, control of the enemy home region, enemy home cells when the sets differ, and the shared-cell line when the regions intersect. |
| user | unchanged |
| tools | unchanged |
| envelope | unchanged |
| coaching | Include the win-path rule. Include the shared-home-cell rule only when an intersection exists. |
| empty-state | A region with no cells produces a progress line of zero of zero rather than a missing bullet. When the two regions are the same set, the exclusive hex lists are omitted and only the shared line and the progress lines appear. |

### 4.2 Scenario id absent or unrecognised

| Surface | Contract |
| --- | --- |
| system | Omit the scenario objective section. Omit every home-region bullet. The goal statement becomes the generic objective: destroy enemy forces and take ground. **Do not reuse region-versus-region sentences.** |
| user | unchanged |
| tools | unchanged |
| envelope | unchanged |
| coaching | Drop the win-path rule and the shared-home-cell rule. |
| empty-state | Explored and controlled progress lines remain, since they do not depend on a scenario. |

Adding a scenario is a change to this file and to the goal statement. Silently letting a new scenario inherit region-versus-region wording is the specific regression this row forbids.

### 4.3 Tactical mode

Scenario surfaces are omitted in battle regardless of the scenario id, per `tactical-prompt.md`.

## 5. Game size and large rosters

Gate: `state.gameSize`, normalised by `parseGameSize`, with caps from `getMaxUnitsPerType`.

| Surface | Contract |
| --- | --- |
| system | Every printed cap comes from the resolved size. The small-size table is never hardcoded, and an unrecognised or missing size resolves to the smallest size through the normaliser rather than through prompt logic. Current counts are printed against those caps, and the maxed-type list is derived from the same numbers. |
| user | unchanged |
| tools | unchanged |
| envelope | unchanged |
| coaching | The cap rule is stated in terms of the printed caps, never as literal numbers. |
| empty-state | A size with no units of a type prints zero against that type's cap. |

Roster-volume rules that hold at every size:

1. **The unit table is never capped.** Every own unit the snapshot includes has a row. A large game means a long table; that is the intended cost of not making the model guess which units exist.
2. **Attention flags stay capped at five bullets**, with the aggregate armed-units bullet naming at most twelve ids and then stating how many further units need action. The remainder is always still reachable in the unit table.
3. **Option rows are capped per unit before merging**, and identical rows merge with their unit ids listed together. The cap is a presentation limit and the routing tool remains available for anything unlisted.
4. **The queue table shows the highest-capacity cells plus every cell with something queued**, so no active queue is hidden by the presentation limit.
5. **No other list may be truncated.** Any new cap requires stating the cap, the sort, and where the remainder remains visible, in the mode file and in this file. A summary that replaces rows with a count is only acceptable if the engine already computes that count; inventing an aggregate to save tokens is not.
6. **Grouped envelope actors are the volume valve.** The unit table stays uncapped. The completion budget is protected by accepting `unitIds` on move, ranged, air, and ferry entries so one Best Options row becomes one JSON object, by teaching the model to pick one row per unit per action rather than copying overlapping rows, and by requiring compact JSON with no markdown fence. Both modes must teach that compact form; a prompt that still requires one object per unit at large roster size, or that shows a pretty-printed fenced example, is defective.

The largest size is the regression case for context volume. If volume forces a change, it must be a stated cap with a stated remainder, not a silently shorter table.

## 6. Consultation policy

Gate: which consultation entry point runs — every period, or only when an event fires.

### 6.1 Every period

| Surface | Contract |
| --- | --- |
| system | unchanged |
| user | unchanged |
| tools | unchanged |
| envelope | unchanged |
| coaching | The callback rules still apply, because subscriptions are still recorded and replaced; they simply do not gate whether the model is asked. |
| empty-state | An empty callback list is normal and carries no penalty. |

### 6.2 Event-driven

| Surface | Contract |
| --- | --- |
| system | unchanged in structure. |
| user | unchanged |
| tools | unchanged |
| envelope | unchanged |
| coaching | State that the model is consulted when a subscribed event fires or when the engine forces a consultation, that the response replaces the entire subscription list, and that a period without a consultation is a period the model did not act in. Mandatory override ids (`first_consultation`, `deadman`, and the rest) are not listed by name. In battle, add that nothing moves in an unconsulted beat because standing orders are inert there. |
| empty-state | An empty callback list under event-driven policy means the model has no self-chosen triggers left and will only be consulted when the engine forces it. The coaching must make that consequence explicit rather than leaving an empty list looking free. |

### 6.3 Tactical beat consulted versus skipped

| Surface | Contract |
| --- | --- |
| system | A consulted beat gets the full tactical prompt. A skipped beat gets **no prompt at all**. |
| user | Skipped beat: none. |
| tools | Skipped beat: none. |
| envelope | Skipped beat: none. |
| coaching | The consulted prompt must state that an unconsulted beat is one in which its sub-units do not move, so the model does not defer a move to a beat it may never be asked about. |
| empty-state | n/a. |

### 6.4 Previous consultation exhausted its tool budget

| Surface | Contract |
| --- | --- |
| system | Include the tool-budget warning in the situational directives: the round limit, the fact that nothing was submitted last period, and the instruction to submit promptly once information is gathered. Include it only when planning or standing-order tools are enabled, since without them there is little to over-spend on. |
| user | unchanged |
| tools | unchanged |
| envelope | unchanged |
| coaching | The spend-budget-on-unknowns rule is always present; the warning is the situational reinforcement of it. |
| empty-state | Omit the warning entirely when the flag is not set. |

## 7. Combinations that must not fight

Each row is a pair of gates that would otherwise fight. The resolution column matches the builders.

| Combination | Resolution |
| --- | --- |
| Fog on **and** no observed enemy | Both apply. Nearest-enemy cells are dashes, the narrative says forces may be out of view, and the scouting directive is present. The staleness rule still appears, because dropped reports are why the roster is empty. |
| Fog off **and** no observed enemy | Both apply, but the scouting rule is redundant and must not contradict the goal statement: with full visibility an empty roster means no enemy units exist. Emit the directive from the roster gate and let the goal statement carry the meaning; do not add a second sentence claiming the enemy is hidden. |
| Largest size **and** no air units | Caps for air still print with a count of zero, and the air section is still omitted. Cap printing and section inclusion are separate gates and must not be collapsed. |
| Tactical **and** production flag enabled | Tactical wins. No production section, no production tail, no production coaching, no production tool, and the forbidden-marker guard applies. |
| Event-driven **and** empty callback list | Both apply. The list is legitimately empty and the coaching states the consequence: only engine-forced consultations remain. |
| Briefing absent **and** planning tools on | The memory, standing-order, and production sections are emitted standalone with no briefing heading; the own-unit listing is emitted, since there is no unit table to carry it; the copy-options rule is replaced by the routing rule. Exactly one of the two paths emits these sections. |
| Briefing absent **and** planning tools off | The fallback adjacent-cell listing is the only destination source, and the own-unit listing is still emitted. |
| Fire withheld **and** a legal shot exists | The withholding order wins: the unit does not fire and the engine's fallback does not fire for it. The prompt must not imply that a withheld unit will shoot anyway, and must not imply that omitting an attack is equivalent to withholding. |
| Overlapping home regions | The shared cells appear once, in the shared-cell line, and the exclusive lists exclude them. When the regions are identical as sets, only the shared line and the progress lines appear. The shared cells count toward both win conditions and the coaching says so. |
| Option target already occupied | Cannot occur: move and approach targets are filtered to unoccupied cells. If it does occur, the filter has regressed. The occupancy rule stays in the coaching regardless, because the model can also propose destinations from the routing tool. |
| Air unit given both a strike and a ferry | The strike wins and the ferry is discarded. The coaching states the exclusivity so the model does not spend a decision on a discarded order. |
| Air unit whose base is not intact or not controlled | It cannot ferry. The air table's base columns carry this, and the coaching must not tell such a unit to reposition. |
| Tactical destination beyond the beat budget | The order is clamped to the first reachable leg, not rejected. The coaching states the clamp so the model does not read partial movement as a failed order. |
| Distances are hop counts **and** the mode is tactical | The caveat line is omitted, because its gate requires the strategic resolution. Res4 step counts inside one footprint do not carry the same distortion. |
