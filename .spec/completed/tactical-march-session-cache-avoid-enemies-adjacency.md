# Tactical march session cache: avoid-enemies adjacency poison

## Problem

Human tactical marches failed with `plannerReason: "no_path"` and the toast “out of movement range” even for adjacent forest→forest steps (armor MP budget 2). AI adjacent marches in the same beat succeeded (~20ms Dijkstra). Human plans logged `elapsedMs: 0` (empty neighbor expansion).

## Root cause

`planTacticalRes4MarchWithSessionCache` built its process-global footprint adjacency map from the **first** `res4Set` after a terrain reset. Opponent Tool1 `plan_route` defaults to avoid-enemies and passes a **subset** that omits human-occupied cells. That subset became the cached adjacency for the rest of the beat, so planning **from** a human cell saw zero neighbors and returned instant `no_path`.

## Fix

- Always build session adjacency from the full battle footprint (`res4ChildH3Indexes` when present).
- Restrict Dijkstra neighbors to the per-call `res4Set` (so avoid-enemies still works).
- Include a footprint-set tag in the plan memo key so subset and full-set plans do not collide.

## Regression

`tacticalMovementPlanningCache.test.ts`: “avoid-enemies subset plan does not leave human origin cells with empty adjacency”.
