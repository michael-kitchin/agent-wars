# Res4 city + road/rail display (living reference)

Baseline phased plan (city labels, initial road/rail spokes, packaging, acceptance) is archived at:

- `.spec/completed/res4-city-road-rail-display-execution-plan.md`

This file captures **supplements** that apply on top of that baseline without duplicating the full phase history.

---

## Transport overlay geometry — mask-inferred chords (post-baseline)

**Scope:** Map inspection (`t` hold + res4 visible) only. No IPC or JSON schema change.

**Source:** Boolean `road_sides` / `rail_sides` per res4 cell (`Res4RoadRailOverlayRow`), same as the original spoke overlay.

**Drawing policy:**

1. Collect active mask slot indices in ascending order (`mask[i] === true`).
2. While at least two remain: take the smallest remaining index `a`, pair it with remaining `b` that **maximizes** shortest cyclic distance on the ring (`n` = side count, 5 or 6). Tie: **lower** `b`.
3. If one index remains after pairing: draw a **short spur** from that edge’s projected midpoint toward the projected cell centroid, length = `RES4_MAP_OVERLAY_TRANSPORT_CHORD_SPUR_LENGTH_FACTOR` (0.35) × distance to centroid.
4. Chord endpoints use **edge midpoints** in projected polygon order (`maskSlotToForwardEdgeStartIndex` when valid, else identity order).
5. Roads and rails run the same pairing **independently** (no cross-suppression).

**Implementation:** `src/shared/res4TransportChordGeometry.ts` (pure logic), `src/renderer/rendering/res4MapInspectionOverlays.ts` (canvas). Rails reuse screen offset on both endpoints; tie density uses `triple` vs `single` patterns per segment (short spurs and very short chords use a single midpoint tie).

**Non-goals:** This is still a **heuristic** for inspection, not clipped source polylines. If a future increment needs GIS-faithful paths, add explicit geometry to generated data and loader contracts (separate plan).
