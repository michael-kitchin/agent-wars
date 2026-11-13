# Logistics Commander: Design Proposal

Status: proposal. This file states requirements, decisions, and prompt wording. It is the input for a step-level execution plan, not a replacement for one.

## Why This Change

A 250-turn AI-only match on the global map (no fog of war, no tactical battles, balanced doctrine) showed heavy ground and air construction and fighting, and almost none of the following:

- Missile construction and launches (fewer than in earlier builds).
- Naval construction, naval fire, and sealift (none).
- Airlift (none seen).
- Mercenary hires, in particular hires in remote hexes (none seen).

Agent Wars is a logistics game anchored in production capacity. The winner is the side that:

1. Creates and delivers the necessary force where it is needed, when it is needed.
2. Best prevents its enemies from doing the same, chiefly by hindering production and movement.

Neither goal is stated in the commander prompt today. The causes below were found by reading the builders. No match log was available, so each cause is a reading of the code, not an observation of the run.

## Causes

| Id | Cause | Where |
|----|-------|-------|
| C1 | The strategic goals no longer name production denial. "Degrade or eliminate enemy home regions' urban production capacity" and "Protect your home region's production capacity" were removed. Only the aggressive doctrine still says to strike cities, airports, and seaports. | `buildStrategicGoalsBlock` in `src/main/openRouter/promptSpec/coachingTextStrategic.ts`; `buildDoctrineBlock` in `promptSpec/doctrineText.ts` |
| C2 | The missile rule prints only when the seat owns a missile. A seat without one sees the cost and the cap and nothing about what a missile does. | `buildMissileEmploymentRule` in `promptSpec/gameRuleMissileText.ts` (`gates.hasMissileUnits`) |
| C3 | The naval rule, the naval routing bullet, the sealift bullet, and Naval Transport Status print only when the seat owns a naval unit. | `buildRulesSections` in `promptSpec/gameRuleText.ts`; `buildStrategicCoachingSections`; `buildSealiftBriefingBlock` in `briefingSectionsSealift.ts` |
| C4 | Production coaching is "queue something". The attention flag lists buildable types in the fixed order infantry, armor, naval, air, missile. Nothing says what a type is for or which city should build it. | `PRODUCTION_BULLET`; `formatProductionAttentionBullet` in `productionAttention.ts` |
| C5 | Credits are coached only "when every unit type a hex can build is at cap". Under steady losses that is rare, so the treasury stays at 0. | `PRODUCTION_CAP_QUEUE_GUIDANCE` in `src/main/productionCaps.ts` |
| C6 | With 0 credits, no mercenaries, and no rehire candidate, the Mercenaries section is one line: "Treasury: 0 credits. No one to rehire." The raise rule and Raise Options never print. | `buildMercenariesBriefingBlock` in `briefingSectionsMercenaries.ts` |
| C7 | An owned missile gets a target table and nothing else: no attention flag, no coaching bullet, no Best Options row. `needsAction` returns false for a missile. | `briefingSectionsMissiles.ts`; `needsAction` in `src/main/briefingFormatter.ts` |
| C8 | Best Options has no embark or landing row. Its actions are air strike, air drop, ranged, advance, approach, ferry, and move/melee. The model is told to copy rows. | `BEST_OPTIONS_ACTION_DISPLAY_ORDER` in `possibleUnitActionsTableAssembly.ts` |
| C9 | The campaign is land-only. A target must be within `CAMPAIGN_MAX_LAND_STEPS` (12) land steps of a ground unit, and embarked units are left out of the plan. Naval units have no part in it. | `chooseCampaignTarget` in `campaignTargetSelection.ts`; `campaignInputsFromState` in `campaignObjectiveFlow.ts` |
| C10 | An air unit has one action per turn, and the tempo bullet tells the model to copy every listed air-strike row. A drop row loses to a strike row. | `tempoBullet` and `IDLE_AIR_BULLET` in `coachingTextStrategic.ts` |

## Scope

In scope: C1 through C8.

Out of scope for this change:

- C9. An amphibious campaign phase is the full answer for sealift and the most expensive item. Build it only if a rerun after this change still shows no sealift.
- C10. Airlift is deferred with the instrumentation work.
- New logging. The existing lines are enough for the check in "Verification Run".
- Any change to combat, movement, production, or hire rules. This change alters what the commander is told and which rows it is offered.

## Requirements

| Id | Requirement |
|----|-------------|
| R1 | The strategic goals state both logistics goals: deliver force where it is needed, and stop the enemy doing the same by destroying production and transport infrastructure. |
| R2 | Strategic Context carries a short "Your tools" block. Each line ties one capability to a goal. A line prints when the seat owns the type or can build or hire it this turn. |
| R3 | Every doctrine carries a production-denial line. |
| R4 | The naval rule and the missile rule print when the seat owns the type or a controlled hex can build it. The missile launch instruction and the `missileLaunches` envelope field still require an owned missile. |
| R5 | The mercenary rule and Raise Options print whenever production is enabled and at least one raise option exists, including at 0 credits. |
| R6 | Production Status carries a Production Priorities subsection computed by the engine. It names a city and a reason for a missile, for a naval unit, and for credits, each only when its condition holds. |
| R7 | The production coaching tells the commander to keep one city on credits at all times, and keeps the cap guidance. |
| R8 | A seat with a missile that has a listed target gets an attention flag naming the missile and the best target. |
| R9 | Best Options lists a missile launch row for each owned missile with a target. |
| R10 | Best Options lists an embark row when a ground unit and a naval unit with free capacity share a legal embark hex, and a landing row for each loaded naval unit. |
| R11 | An attention flag fires when the treasury covers at least one listed raise. It names the first Raise Options row. |
| R12 | Living docs in `doc/ai-commander-prompts/` match the builders in the same change. |

## Decisions Already Made

Do not reopen these.

- The engine may propose landings, missile targets, and build purposes the way it proposes the campaign target. The commander may override. The user confirmed this.
- Capability text is gated on "owns or can build", not "owns". The gate is computed from controlled hexes, their urban, seaport, and airport counts, and the unit caps. It does not read the production queue snapshot.
- The `missileLaunches` field and its example stay gated on an owned missile, so the envelope and its JSON schema do not change for a seat without one.
- Priorities name at most one city per line. They are suggestions in the briefing, not orders the engine places.
- No new unit cap, cost, or hire rule.
- The mercenary flank is expressed through Raise Options ordering and the new attention flag, not through a new order type.
- Wording below is final unless a test or a doc contract forces a change. If it does, stop and report.

## Prompt Wording

All text is for the strategic prompt. Numbers come from the named helpers, never from literals.

### Goals (region_vs_region branch of `buildStrategicGoalsBlock`)

```text
- Your goals are, in priority order:
    (1) Take and hold enemy cities. Taking cities is how you knock sides out.
    (2) Bring more force to each fight than the enemy can. Mass your ground units before an attack, and use ships, aircraft, and mercenaries to put units where the enemy is weak.
    (3) Stop the enemy doing the same. Destroy the city cells, airports, and seaports that build and move its units.
    (4) Keep enough units at home to stop a raid on your cities.
    (5) Keep every city building, and keep credits coming in for mercenaries.
    (6) Scout with a few units, not your main force.
```

The other branch (no scenario win paths) gains one line after its current line 2: `Destroy the city cells, airports, and seaports that build and move enemy units.` Renumber the rest.

### Tools block (new, after the strategy block and before the doctrine block)

Print the heading line and only the lines whose gate holds. Omit the block when no line prints. Renumber the printed lines from 1.

```text
- Your tools are:
    (1) Missiles destroy city cells, airports, and seaports up to {missileRangeHexes()} hexes away, beyond the reach of aircraft. Build one in a city that reaches a large enemy city, then launch it.
    (2) Naval units shell any hex within {getRange('naval')} of them, and carry ground units to a coast the enemy has left open.
    (3) Air units strike within {AIR_STRIKE_RANGE_HEXES} hexes of their airport, carry one infantry unit between airports, and drop it within {AIR_STRIKE_RANGE_HEXES} hexes.
    (4) Mercenaries are raised for credits in any explored city outside an enemy home region that holds no enemy unit. They do not count toward unit caps. Raise them beside the campaign target, or behind the enemy to split its force.
```

Gates: line 1 `hasMissileUnits || canBuildMissile`; line 2 `hasNavalUnits || canBuildNaval`; line 3 `hasAirUnits`; line 4 `productionEnabled`.

When the campaign is not enabled, line 4 ends `Raise them beside your objective, or behind the enemy to split its force.`

### Doctrine

- Aggressive: unchanged.
- Balanced: add `(3) Strike the cities, airports, and seaports your ground units cannot reach. Production the enemy loses is force it cannot bring.`
- Cautious: add `(4) Strike enemy cities, airports, and seaports from range before you commit ground units.`

### Missile rule (`buildMissileEmploymentRule`)

When the seat cannot build one and owns none: empty, as today.

When the seat can build one and owns none:

```text
A missile is built in a city with at least {buildMinimumUrbanCells('missile')} urban cells. It never moves and is spent when it launches. It reaches any explored hex within {missileRangeHexes()} hexes of the hex where it was built. A launch always hits: each city, airport, and seaport cell in the target hex is destroyed when its own d20 roll is at or below the air unit's attack of {getAttack('air')}, and every air unit based there is destroyed when an airport cell is destroyed. Other units in the hex are unharmed.
```

When the seat owns one: today's text, unchanged.

### Production coaching

`PRODUCTION_BULLET` gains this paragraph directly after "queue something":

```text
  Keep one city queued on credits at all times. Production Priorities names it. Credits are the only way to raise mercenaries, and mercenaries are the only units you can place away from your own cities.
```

`PRODUCTION_CAP_QUEUE_GUIDANCE` is unchanged.

A new paragraph follows the paused-queue paragraph:

```text
  Production Priorities, under Production Status, names a city for a missile, a naval unit, or credits when one is worth building. Queue what it names before filling the other cities.
```

### Production Priorities subsection

New subsection under Production Status, after Paused Queues and before Controlled Hex Queues. Omit it when no line prints. One bullet per line, in this order.

| Line | Condition | Text |
|------|-----------|------|
| Missile | Missile count is below the cap, and at least one controlled hex that can build a missile has an enemy-controlled hex with urban cells inside `missileReachSet` of it. | `- Missile: {HEX} can build one in {N} turns and reaches {TARGET}, a {OWNER} city with {K} city cells.` |
| Naval | Naval count is below the cap, at least one controlled hex can build a naval unit, and at least one enemy-controlled city hex is within naval range of a water or coastal hex. | `- Naval: {HEX} can build one in {N} turns. {M} enemy cities can be shelled from the sea, and a ship carries 2 infantry or 1 armor to any of them.` |
| Credits | No controlled hex has credits as its next queue item. | `- Credits: no city is producing credits. Queue credits in {HEX}.` |

Selection rules:

- Missile: over every (builder hex, target hex) pair, take the target with the most urban cells. Break ties by fewer build turns, then by hex id (plain string comparison).
- Naval: the builder with the fewest build turns. Break ties by hex id.
- Credits: the controlled hex with the fewest urban cells that lists credits as available and is not paused. Break ties by hex id.
- Build turns: `ceil((cost - stored points) / urban count)`, never less than 1. Use the stored points only when the hex's queue is empty or its next item is that type; otherwise 0.
- A hex whose queue is paused is never a builder.
- "Can be shelled from the sea" reuses the test behind the `Adjacent to water - exposed to naval bombardment` note in `src/main/tools/assessment.ts`. Extract it; do not copy it.

### Mercenaries section

Replace the one-line collapse. When production is enabled and Raise Options has at least one row, print the full section (rule, funds line, Rehire Candidates, Raise Options) whatever the treasury holds. Keep the one-line form only when there is no raise option and no rehire candidate.

Raise Options gains two columns after Hex: `To Campaign Target` (hop count, or an em dash when there is no campaign) and `Enemy Units Within 2`. Row order is unchanged.

### Attention flags

- Missiles: `- Missiles: {ids} can launch. Best target: {TARGET}, a {OWNER} city with {K} city cells. Add a missileLaunches entry.` Fires when at least one owned missile has a row in the missile target table. `{TARGET}` is that table's first row.
- Mercenaries: `- Mercenaries: your treasury of {C} credits can raise {TYPE} at {HEX} for {FEE}. Add a raise_mercenaries row to productionOrders.` Fires when Raise Options has a row whose cheapest option's fee is at most the treasury after pending hire fees. `{HEX}` is the first such row.

### Best Options rows

| Action | When listed | Target Hexes | Copied into |
|--------|-------------|--------------|-------------|
| `missile launch` | Each owned missile with at least one target. One row per target, at most 3 targets per missile, in missile target table order. | The target hex | `missileLaunches` |
| `embark` | A ground unit that is not embarked stands on a hex where `canEmbarkAtHex` is true, and a naval unit with free capacity is on that hex. One row per naval unit, listing the ground units that fit. | The naval unit's hex | `orders` as `embark` |
| `landing` | A naval unit has cargo aboard. One row per loaded naval unit. | The hex chosen by the landing chooser | `orders` as `transport_move`, or `disembark` when the ship is already at the landing |

Landing choice reuses `chooseNeutralLandingTarget` in `src/main/gameActions/neutralLanding.ts`. Candidates are hexes where `canManualDebarkAtHex` is true and that are within 2 hexes of the campaign target, or of the nearest enemy city when there is no campaign. Prefer an unoccupied candidate, as that function already does.

Display order becomes: missile launch, air strike, air drop, ranged, embark, landing, advance, approach, ferry, move/melee.

The copy sentences that list row kinds gain the new kinds (`buildOptionCopyOrRoutingBullet`, the Available Tools intro, the opening message). Odds for all three new kinds are an em dash.

## New Gates

| Gate | True when | Used by |
|------|-----------|---------|
| `canBuildMissile` | Missile count is below the cap, and a controlled hex that is not a neutral border hex has at least `buildMinimumUrbanCells('missile')` urban cells. | Tools block, missile rule |
| `canBuildNaval` | Naval count is below the cap, and a controlled hex has at least `buildMinimumUrbanCells('naval')` urban cells and at least one seaport. | Tools block, naval rule, naval coaching bullets |

Compute both once in `buildConsultPromptParts`, from `state.strategicControl`, `state.strategicInfrastructure`, and `getMaxedUnitTypesForPlayer`, with `getAvailableBuildUnitTypes`. Put the helper in its own small file. Both gates are false in tactical mode.

The system prompt is cached. These gates change only when a cap is reached or a qualifying city changes hands, so the cache breaks rarely. Confirm that with `promptCacheBreakpoint.test.ts`.

## Suggested Phases

Each phase leaves the build and tests green.

1. Goals, tools block, and doctrine lines (R1, R2, R3). Text only, plus the two gates.
2. Capability gates on the rules and coaching (R4).
3. Mercenaries section, Raise Options columns, and the mercenary attention flag (R5, R11).
4. Production Priorities and the production coaching (R6, R7).
5. Missile attention flag and missile launch row (R8, R9).
6. Embark and landing rows (R10).
7. Docs (R12): `strategic-prompt.md`, `assembly-contract.md`, `information-decision-model.md`, `variants.md`, `crosswalk.md`, `source-inventory.md`, and `example-strategic-prompt.md`.

Phases 1 through 5 are independent of phase 6. If time is short, ship 1 through 5 and rerun.

## Tests That Will Need New Expected Strings

Found by grep. The execution plan must re-run the grep and list every hit.

- `src/main/openRouter/promptSpec/coachingText.test.ts`
- `src/main/openRouter/promptSpec/doctrineText.test.ts`
- `src/main/openRouter/promptSpec/gameRuleText.test.ts`
- `src/main/openRouter/promptSpec/variantConformance.test.ts`
- `src/main/openRouter/promptContracts.test.ts`
- `src/main/openRouter/openRouterMatrix.test.ts`
- `src/main/openRouter/briefingSectionsMercenaries.test.ts`
- `src/main/openRouter/briefingSectionsMissiles.test.ts`
- `src/main/openRouter/possibleUnitActionsTableAssembly.test.ts`
- `src/main/openRouter/productionAttention.test.ts`

Never delete a content assertion. Change the expected string.

## Verification Run

Logging slows the engine, so the check is a short logged run, not a full match.

1. Run 40 turns of the same setup (global map, no fog, no tactical battles, balanced doctrine) with `AGENT_WARS_LOG_LEVEL=debug`.
2. Keep that run's `debug.log`.
3. Count, per seat:
   - `openRouter requestOrders: orders applied` lines with `embark` above 0, and with `missileLaunches` above 0.
   - `openRouter applyProductionOrdersFromEnvelope` lines, and their `droppedReasons`.
   - `mercenaryTools executeMercenaryTools` lines.
4. Read the final unit counts by type from the Production Status line of the last `debug-last-user-prompt-N.txt`.

Pass: every seat that could build a missile or a naval unit queued at least one, at least one seat placed a raise order outside its home region, and at least one missile launched. Sealift is expected only after phase 6.

Known gap: no existing line counts air drops. That stays open with the airlift item.

## Open Items

- The example prompt in `doc/ai-commander-prompts/example-strategic-prompt.md` lists `armor, fortification, credits` for an 80-urban city while missiles stand at 0/2. `getAvailableBuildUnitTypes` would list `missile` there. Correct the example in phase 7.
- A missile costs 200 and destroys about half the cells of one hex once. An air unit costs 60 and destroys 9 urban cells per hit, every turn, within 3 hexes. The missile is worth its price only against a large city outside air reach. The Missile priority line picks the largest reachable city for that reason. If the rerun still shows few missiles, the price or the hit chance is the next thing to look at, not the prompt.
