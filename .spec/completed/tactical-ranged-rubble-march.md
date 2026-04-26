# Tactical ranged rubble and march (§12.4 / §12.5 deltas)

This note captures behavior implemented beyond the baseline `combat-rules-v3.md` §12 narrative.

## Ranged rubble

1. **Defenders killed on infrastructure hexes:** After tactical `runRangedPhase`, if direct fire removed at least one defender on a res4 hex that still had strikeable urban, airport, or seaport infrastructure (per DB override rows and snapshot maps), that footprint cell is collapsed to **rubble** in `res4_feature_overrides` (one row per cell: all facility flags cleared, `is_rubble` set). Res1 infrastructure rollups and build-queue pruning follow the same helpers as air infrastructure destruction.
2. **Infra-only ranged:** Orders against hexes with **no enemy units** but with strikeable infrastructure are resolved separately: each attacker rolls a **d6 to-hit** against its **attack** value (same table as melee/ranged elsewhere). On a hit, the same rubble helper runs; on a miss, the row is unchanged.
3. **Terrain refresh:** After any ranged-driven rubble (or air infrastructure events), the tactical snapshot is refreshed from the game DB so `res4IsUrbanByH3`, `res4IsRubbleByH3`, `res4IsSeaportByH3`, and march cache signatures stay coherent.

## March (§12.4 enter costs)

For **land** units (infantry, armor) entering a destination res4 cell inside the footprint:

- **Urban** (infrastructure, not rubble): enter cost is **1** movement point for that step, overriding category-based costs (e.g. forest/mountain) for that enter.
- **Rubble:** enter cost is **2** movement points for that step.

## Naval

Naval units may **not** enter a res4 cell that is urban or rubble (`Infinity` cost), even if the underlying terrain string would otherwise allow water/coastal routing or seaport treatment.

## Validation and AI

Tactical grouped ranged validation allows targets with **enemies** or **strikeable infrastructure**. AI tactical ranged validation reuses the same tactical grouped rules when a tactical battle snapshot is active.
