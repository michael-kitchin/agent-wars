# Return fire planning parity

## Audience and intent

Implement ranged-phase return-fire eligibility so a defender may return fire only when a human could plan the reverse shot (ground: ranged planning rules; air: strike-planning rules). Leave air-strike AA and infrastructure counter-fire unchanged.

## Goals

1. Shared pure eligibility API used by combat resolution, return-fire shot lines, and Tool 3.
2. Strategic ground: `getRange` / `strategicRangedRangeHexesForUnitType` + `isWithinGridRangePure`.
3. Tactical ground: reuse `tacticalRangedDirectFirePassesTerrainAndRange` (terrain caps + mountain LOS).
4. Air: strike range + intact airport (strategic); airport only in tactical engagements (footprint assumed).
5. Fail closed when required context is missing.

## Non-goals

- Air-strike phase AA (no distance-to-base check).
- Infrastructure counter-fire thresholds.
- Changing who may *order* ranged or air strikes.
- Melee mechanics.

## Supersession

This work **supersedes** the non-goal in `.spec/completed/tactical-terrain-movement-ranged-execution-plan.md` that forbade terrain/LOS gates on return fire (“if attack allowed, return fire allowed”). Return fire is now re-checked with planning-parity rules.

## Eligibility matrix

| Theater | Defender | Eligible when |
|---------|----------|---------------|
| Strategic | Infantry | Never (`strategicRangedRangeHexesForUnitType` is 0; melee only) |
| Strategic | Armor / naval | `strategicRangedRangeHexesForUnitType >= 1` and `isWithinGridRangePure(defender, attacker, range)` |
| Strategic | Air | Intact airport at base hex **and** within `AIR_STRIKE_RANGE_HEXES` of attacker hex |
| Tactical | Infantry / armor / naval | `tacticalRangedDirectFirePassesTerrainAndRange(battle, footprint, type, defenderHex, attackerHex)` |
| Tactical | Air | Intact airport on parent res1 (engagement hexes already in footprint); no mountain/forest gates |

**Intentional expansion:** Tactical ground previously used strategic `getRange` inside resolution. Clear-terrain tactical return fire may now reach farther (e.g. armor at distance 2); terrain-illegal shots are blocked.

### Fail closed

- Air without `hasIntactAirportAtAirBase` → ineligible.
- Tactical ground without `tacticalBattle` + `tacticalFootprint` → ineligible.
- Tactical air still only airport-gated when battle/footprint omitted.

## API / files

| Piece | Location |
|-------|----------|
| Helper | `src/shared/returnFireEligibility.ts` |
| Tests | `src/shared/returnFireEligibility.test.ts` |
| Dice | `resolveOneRangedEngagement` / `runRangedPhase` in `src/main/combatResolution.ts` |
| Shot lines | `src/shared/rangedResolutionShotLines.ts` |
| Strategic caller | `src/main/game-actions/readyStrategicResolutionPipeline.ts` |
| Tactical caller | `src/main/tacticalBattle/tacticalStrategicOrderPhases.ts` |
| Tool 3 | `src/main/tools/tool3CombatEstimation.ts` |
| Rules | `.spec/combat-rules-v3.md` §4.7–4.8 |

## Stop gates

- [x] Eligibility unit tests pass in isolation.
- [x] Resolution + shot-line tests pass; dice and connectors share eligibility.
- [x] Production callers pass complete context bags.
- [x] Tool 3 `canReturnFire` matches resolution for strategic inputs.
- [x] Air-strike AA path left unchanged (`airStrikeResolution.ts` not modified).
- [x] `combat-rules-v3.md` updated for planning parity.
