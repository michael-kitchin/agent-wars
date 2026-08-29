# Tempo Rule Enforcement

## The problem

The strategic prompt tells the model:

> If a legal ranged_attack or air strike is available this turn, take it — these attacks resolve from turn-start
> positions and do not prevent movement in the same turn.

Ranged attacks and air strikes cost nothing but the shot, so declining one is always a mistake. The prompt states the
rule, Best Options lists the legal targets, and Unit Status shows the distances. None of that binds the model.

A captured turn 17 showed what happens when a model ignores it. `google/gemini-3.5-flash-lite` received a
129,293-character briefing listing 121 units and, in reply, produced two `assign_order` march orders pointing at hexes
the units already occupied — both dropped as already arrived — plus a few production queue changes. No attacks, no
movement, no tool calls. Best Options had offered two naval ranged shots and four air strikes against an enemy stack,
and three of the AI's units were flagged `critical`.

Standing orders only partly covered the gap. DEFEND units auto-engage, so the four air units on DEFEND took their
strikes. The two naval units two hexes from the enemy did not, because they happened to be carrying MARCH orders.
Which units fought came down to which standing order each was holding rather than which had a target.

## The sweep

`collectTempoRuleAttacks` (`src/main/tools/tempoRuleAttacks.ts`) runs after the model's orders and the standing-order
output are both known. For each unit the opponent owns it emits one attack against the nearest legal enemy, skipping:

- units that already have a ranged attack or air strike from any source this turn,
- units under a `hold_fire` standing order,
- units with no strategic range, which is infantry.

Target selection reuses `appendNearestLegalEngagement`, the same helper the DEFEND branch uses, so both paths pick
targets and validate air strikes identically. That helper was previously named for its only caller.

## The tactical sweep

Tactical beats had the same hole, and a worse one. An earlier draft of this document claimed tactical ran its own
engagement pass; it did not. `generateTacticalDefendEngagementForPlayer` existed but had no production caller, and
`assign_order` is blocked for sub-unit ids, so the model's reply was the *only* source of opponent attacks in a
battle. Worse, a beat only gets a model reply when the post-beat consultation policy fires. On every other beat the
opponent's buffer was empty and it sat out the beat entirely.

`collectTacticalTempoAttacks` (`src/main/tacticalBattle/tacticalRangedTargetResolve.ts`) is the res4 counterpart. It
replaced the unused DEFEND helper rather than sitting beside it, since the only difference was which sub-units it
skipped. Targets come from `pickClosestEnemyTacticalRangedTargetForSubUnit`, so range, terrain, and mountain line of
sight are already applied; air sub-units produce air strikes so the AA-defense phase still runs.

Parent `hold_fire` reaches into the battle. Sub-units carry no standing orders, so the sweep looks each pawn's
strategic parent up in the same table the strategic sweep reads. Without that, `hold_fire` would silently stop
meaning anything the moment a unit entered a battle.

## Scope

**Opponent only.** `generateOrdersForStandingOrders` also runs for the human player, whose standing orders auto-engage
the same way. The human's attacks are theirs to choose, so the human resolution path does not call the sweep.

**Additive.** The sweep never replaces or retargets an attack. When the model orders a unit to fire, that order wins;
the unit is simply absent from the sweep.

**Model orders outrank everything, in both directions.** `mergeOpponentAttackOrders` drops a unit's standing-order
rows from *both* the ranged and the air-strike list when the model named that unit in either, so an auto air strike
cannot ride along behind a model-ordered ranged attack for the same unit. Only one attack per unit resolves, and the
one that survives is the model's.

## Call sites

| Path | Where | Ordering |
| --- | --- | --- |
| Consulted strategic turn | `requestOrdersFlow` | Through `mergeOpponentAttackOrders`, after model and standing-order attacks are merged |
| Pending orders absent | `handleGameReady` | Via `buildUnconsultedOpponentOrders` |
| No model or no API key | `handleGameReady` | Via `buildUnconsultedOpponentOrders` |
| Consulted tactical beat | `requestOrdersFlow` | Same merge, selected by passing `tacticalBattle` |
| Any tactical beat, consulted or not | `commitHumanTacticalDraftOrders` | Via `withTacticalTempoAttacks`, before draft sanitization |

The tactical beat appears twice on purpose. The merge fills the buffered plan the renderer displays; the commit-time
pass is what covers beats where the policy never consulted the model at all. It is idempotent — anything already
holding an attack is skipped — so running both is not double fire.

Everything the sweep emits still passes normal validation. Strategic ranged attacks go through `validateAiRangedOrder`
and air strikes through `validateAirStrikeOrder` inside the shared helper. Tactical rows added at commit are inserted
*before* `sanitizeOpponentTacticalDraftForReadyCommit`, so they face exactly the checks a model-ordered row faces.

## Keeping the model's agency

Automatic fire that the model cannot see is a trap: the model stops choosing targets, and the opponent settles for
"nearest legal enemy" forever. Two things guard against that.

**The prompt never mentions the fallback.** `buildTempoRuleLine` states the rule and points at the Best Options
attack rows and the units flagged `Action needed: yes`. A model told its units will fire anyway has no reason to
choose.

**A shot is never hidden behind a standing order.** `needsAction` and `isQuiet` used to treat "covered by a healthy
standing order" as "nothing to do", which is how a naval unit facing a `critical` threat with a legal shot rendered
as `no (quiet)`. Any unit with a `canAttackThisTurn` row now reads `yes`, and earns an Attention Flags bullet ranked
below every threat bullet so it cannot displace one. Tactical assessments populate `canAttackThisTurn` from the same
resolver the tactical sweep uses, so the flag and the fallback always agree about which pawns have a shot.

## Consequence to keep in mind

The opponent now attacks whenever it legally can, so a weaker or cheaper model changes how well the AI *manoeuvres*
but no longer changes whether it *shoots*. Turn-over-turn damage output is therefore a poor signal for comparing
models; judge them on positioning, production, and target priority instead. Target priority is still entirely the
model's: the fallback always aims at the nearest legal enemy, so a model that picks better targets than "nearest"
still shows a measurable advantage.
