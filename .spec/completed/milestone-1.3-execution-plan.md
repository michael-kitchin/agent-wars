# Milestone 1.3 — Fog of War and Subjective Views

*Execution plan for a coding agent. Aligns with `.spec/devleopment-plan-v3.md` milestone **1.3 — Fog of War and Subjective Views**.*

---

## 1. Goal, non-goals, and success criteria

### 1.1 Goal

Implement reliable, per-side fog of war at global resolution (H3 res 1), including:

- Side-level shared vision (union of all friendly unit vision).
- Subjective intelligence state per side (`current` vs `stale` with `lastSeenTurn`).
- Gameplay/UI behavior for unseen, stale, and currently visible map information.
- AI tooling/pre-computation that uses subjective knowledge rather than omniscient state.
- Mandatory `new_contact` consultation trigger behavior for the AI.

### 1.2 Non-goals (explicitly out of scope for 1.3)

- Theatre-level (res 4) fog-of-war rules.
- Diplomacy/alliance shared-vision mechanics (future milestone).
- Advanced sensor models (weather, terrain LOS attenuation, detection probabilities).
- Save/load UI work (core persistence only, if schema changes are required).

### 1.3 Success criteria (binary)

1. Human and AI each observe only what their side currently sees; hidden enemy units are not shown in the live state for that side.
2. Last-known enemy intelligence is tracked and surfaced as stale intel with turn-staleness.
3. Destroyed units immediately stop contributing visibility for their side.
4. AI briefing and assessments clearly distinguish `current` vs `stale` enemy intelligence.
5. Mandatory `new_contact(unitId)` override triggers AI consultation when previously unseen enemies enter visibility.
6. Tests cover happy path and essential failure cases for visibility contracts.
7. Lint and tests pass.

---

## 2. Baseline product rules for implementation

These are locked defaults from product-owner guidance (March 2026).

1. **Vision range by unit type (initial calibration):**
   - `infantry`: 1 hex
   - `armor`: 2 hexes
   - `naval`: 2 hexes
2. **Vision sharing:** all units on a side share visibility as a union set.
3. **Visibility update timing:** recompute visibility after each full resolution step (post-movement, post-combat).
4. **Map/base visibility policy:** basemap and res-1 outlines are always visible.
5. **Exploration gating policy:**
   - Before first visit to a res-1 hex by that side: hide all hex content (terrain fill/hatching, tooltip info, and child res-4 details).
   - After first visit: hex terrain/content stays known permanently for that side (terrain memory does not decay).
6. **Stale enemy markers (graphics and lifetime):**
   - Show stale enemy as transparent unit icon(s) at last-known position.
   - Fade in stepwise turns and remove after two stale turns.
   - Opacity schedule is locked: stale turn `+0 = 0.50`, stale turn `+1 = 0.30`, removed at stale turn `+2`.
   - Do not add extra stale-intel cues beyond the icon itself (no stale-specific tooltip text, labels, arrows, or ownership color hints).
   - If real enemy unit(s) become visible again in that hex, remove stale marker immediately.
   - If a stale stack exists and any constituent unit reappears, remove the stale stack marker immediately.
   - If friendly vision covers a stale-marked hex and no real enemy remains there, remove stale marker immediately.
7. **Out-of-view combat/death visibility policy:**
   - Always show combat and death animations even when combat hex is currently out of view.
   - Render these as neutral grey unknown markers with a `?` label, with no side/unit identity.
   - Render unknown marker entities in world space, but only display when they are on-screen in the current viewport (no auto-pan).
   - Collapse simultaneous unknown combats to one `?` marker per hex.
   - Event/history panel should include only a generic no-identity entry with associated region names derived from naming data.
   - Region list format is locked: de-duplicated, comma-delimited, with `or` before the final region (example: `Unknown battle observed in Region1, Region2, or Region3.`).
   - Grammar rules are locked:
     - one region: `Unknown battle observed in Region1.`
     - two regions: `Unknown battle observed in Region1 or Region2.`
     - three or more regions: `Unknown battle observed in Region1, Region2, or Region3.`
     - zero valid regions: `Unknown battle observed in an unidentified region.`
   - Suppress identity details across all player-facing channels for out-of-view events (marker, tooltip, animation overlays, event feed snippets).
   - Unknown markers exist only for animation duration and then disappear.
8. **Contact semantics:** first observation of an enemy unit not currently in that side’s `currentVisibleEnemyUnitIds` set is a `new_contact`.
9. **Visibility geometry:** pure hex-radius visibility (no LOS/terrain blocking).
10. **No omniscient leaks:** subjective snapshots for each side must be generated from side-specific knowledge stores, not filtered renderer-only tricks.

---

## 3. Reliability principles for this milestone

1. Keep a **single source of truth** for visibility/intel derivation in main-process domain logic.
2. Use **derived snapshots** per side for IPC/AI; do not hand raw omniscient state to renderer/LLM and “hide later.”
3. Prefer deterministic recomputation from current board state plus persisted intel tables.
4. Every new or updated public mutating backend method emits debug-level logs; caught exceptions emit error logs; non-mutating getters emit trace logs.
5. Add orienting comments on new/updated public non-overriding methods.

---

## 4. Data model and contracts (target shape)

### 4.1 New persistence tables (proposed)

1. `player_hex_intel`
   - `player_id TEXT`
   - `h3_index TEXT`
   - `seen_state TEXT CHECK (seen_state IN ('visible', 'stale', 'unexplored'))`
   - `last_seen_turn INTEGER NULL`
   - PK `(player_id, h3_index)`
2. `player_unit_intel`
   - `player_id TEXT`
   - `enemy_unit_id TEXT`
   - `last_known_h3_index TEXT`
   - `intel_state TEXT CHECK (intel_state IN ('current', 'stale'))`
   - `last_seen_turn INTEGER`
   - `stale_until_turn INTEGER NULL` (computed from `last_seen_turn + 2` if persisted explicitly)
   - PK `(player_id, enemy_unit_id)`

Implementation note: `unexplored` can be represented sparsely (row absent means unexplored) if desired. Pick one approach and keep it consistent.

### 4.2 Snapshot/API shape updates (proposed)

Add side-scoped state retrieval for renderer and AI:

- `getGameStateForPlayer(playerId)` returns subjective `GameStateSnapshot` for that side.
- include visibility payloads:
  - `visibleHexes: string[]`
  - `staleHexes: string[]`
  - `enemyIntel: { unitId, lastKnownLatLng, intelState, lastSeenTurn }[]`
  - `exploredHexes: string[]`

Do not remove omniscient internals used by resolution engine.

---

## 5. Phased execution plan (ordered, independently verifiable)

### Phase A — Rule lock and instrumentation baseline

**Work**

1. Add a central visibility rules module (range by unit type, helper APIs).
2. Add debug log scaffolding around visibility recomputation and contact detection.
3. Record baseline behavior (pre-fog) in tests/smoke notes.

**Verification**

- Unit tests for pure range helpers and union-of-vision computation.
- No behavior change to gameplay yet (pre-fog snapshots still omniscient).

**Dependencies:** none.

---

### Phase B — Persistence schema and migration hook

**Work**

1. Add new intel tables to DB DDL and expected schema version bump.
2. Initialize intel state on New Game for both sides.
3. Ensure reset/new-game clears subjective intel tables.

**Verification**

- DB test: fresh DB contains intel tables.
- DB test: New Game clears and reseeds intel state deterministically.
- DB open/validation path remains healthy.

**Dependencies:** Phase A.

---

### Phase C — Visibility recomputation service (engine-side truth)

**Work**

1. Build `recomputeVisibilityForSide(state, playerId)`:
   - gather living units for side,
   - compute union disks by per-unit range,
   - produce visible hex set.
2. Build `applyIntelTransitionForSide(...)`:
   - visible hexes => `visible`, `last_seen_turn = currentTurn`,
   - previously visible now hidden => `stale`,
   - absent rows remain unexplored (if sparse strategy).
3. Build `refreshEnemyUnitIntelForSide(...)`:
   - enemies in visible hexes => `current` with exact latest position,
   - previously current but no longer visible => `stale` at last-known position,
   - stale entries expire after two stale turns,
   - stale entries are removed immediately if friendly visibility re-covers the hex and enemy is absent.
4. Invoke recomputation post-resolution and after any unit destruction.

**Verification**

- Unit tests:
  - infantry sees adjacent only (range 1),
  - armor/naval see radius 2,
  - side union visibility is correct,
  - destroyed observer unit removal shrinks side visibility.
- Integration test: one side loses stale/current updates correctly after combat casualties.

**Dependencies:** Phase B.

---

### Phase D — Side-subjective snapshots for renderer

**Work**

1. Add side-aware snapshot builder(s):
   - human renderer uses `player` perspective,
   - AI request path uses `opponent` perspective.
2. Subjective map rendering semantics:
   - unexplored: basemap + res-1 boundaries visible; no terrain fill/hatching, no tooltip content, no res-4 detail,
   - explored but not currently visible: terrain remains known; stale enemy markers may appear if still within stale lifetime,
   - visible: full terrain + current units.
3. Implement stale marker visual lifecycle:
   - transparent icon rendering with turn-step fade,
   - immediate replacement/removal when current symbol becomes known,
   - stacked stale marker removal when any constituent unit reappears.
4. Implement out-of-view combat/death animation mask:
   - spawn temporary neutral grey `?` marker at combat hex for animation playback,
   - do not auto-pan camera; marker appears only if combat hex is on-screen,
   - one `?` marker per hex even when multiple combats occur there in same step,
   - append only generic history/event entry for these events, including associated deduplicated region list and no side/unit identity,
   - no side/unit attribution in marker or tooltip,
   - no side/unit attribution in auxiliary UI surfaces for those out-of-view events,
   - marker removed immediately after associated animation completes.
5. Ensure hidden enemy units are absent from side snapshots (not merely flagged hidden).

**Verification**

- Renderer integration smoke test:
  - move scout into view, detect enemy, move away -> enemy becomes stale.
- Renderer integration smoke test:
  - stale marker fades across two stale turns then disappears.
- Renderer integration smoke test:
  - stale marker disappears immediately if visibility returns and enemy is absent, or if any constituent of stale stack reappears.
- Renderer integration smoke test:
  - combat outside visibility shows neutral grey `?` animation marker only during animation.
- Contract test: hidden enemy never appears in side’s `units` list unless visible.

**Dependencies:** Phase C.

---

### Phase E — AI pre-computation/tooling subjective compliance

**Work**

1. Route pre-computation inputs through side-subjective snapshot.
2. Update tool2/tool3/precomputation/briefing output:
   - include `confidence: current|stale`,
   - include `lastSeenTurn` consistently.
3. Add briefing section for intelligence quality:
   - confirmed contacts vs last-known contacts.

**Verification**

- Tool tests assert no references to unseen enemy units in AI-side outputs.
- Briefing tests validate current-vs-stale labeling and turn staleness.

**Dependencies:** Phase D.

---

### Phase F — Callback and mandatory override integration (`new_contact`)

**Work**

1. Add `new_contact(unitId)` event evaluation.
2. Add mandatory override behavior:
   - if any new contact appears for AI side since last consultation, force consultation.
3. Persist minimal “seen since last consultation” state needed for dedupe.

**Verification**

- Callback evaluation test:
  - previously unseen enemy becomes visible -> mandatory consultation true.
  - already-known visible enemy remains visible -> no duplicate new_contact trigger.

**Dependencies:** Phase E.

---

### Phase G — Balancing pass and acceptance tests

**Work**

1. Playtest script for 10-20 turn scenarios emphasizing reconnaissance.
2. Validate pacing with initial ranges (1/2/2).
3. Keep ranges as code constants in one module for future-stage edits (not runtime-configurable in 1.3).
4. Tune constants only if objective acceptance checks fail.

**Verification**

- Acceptance checklist (Section 8) passes.
- Performance sanity: visibility recomputation remains fast enough for turn loop.

**Dependencies:** Phases A-F.

---

## 6. Recommended implementation details

1. **Centralize constants** in one module:
   - `VISION_RANGE_BY_UNIT_TYPE`
   - future-proof for config-driven balancing.
2. **Pure functions first**, DB adapters second:
   - easier tests and fewer regressions.
3. **No UI-only fog logic**:
   - renderer consumes already subjective data.
4. **Bounded logs**:
   - log counts and IDs, avoid dumping huge sets unless debug mode asks for it.

---

## 7. Risk register and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Omniscient data leak into AI prompt or renderer | High | Use side-specific snapshot builders; test for absence of unseen enemies. |
| Visibility regressions after combat/death | High | Post-resolution recompute hook + destruction-path tests. |
| Performance degradation from repeated grid-disk calls | Medium | Cache disk results by `(h3, range)` per turn and side. |
| Ambiguous stale intel UX | Medium | Lock to transparent stale icon + 2-turn step fade + immediate stale purge rules. |
| Callback spam from repeated contacts | Medium | Track first-seen-since-last-consultation and dedupe triggers. |
| Out-of-view combat leaks identity | Medium | Always route through neutral grey `?` marker renderer with no ownership metadata. |
| Over-testing implementation details | Low | Focus tests on contract: what is visible/stale/unseen and when. |

---

## 8. Acceptance checklist (manual)

- [ ] Human cannot see enemy units outside friendly union visibility.
- [ ] Infantry reveals ring 1 only; armor/naval reveal ring 2.
- [ ] Destroying a friendly scout can immediately hide previously seen areas (unless other friendlies still cover).
- [ ] Previously observed enemy transitions to transparent stale marker and fades in turn-steps across two stale turns.
- [ ] Stale marker disappears immediately when visibility returns and enemy is absent.
- [ ] If one unit from a stale stack reappears, stale stack marker is removed immediately.
- [ ] Out-of-view combat/death still animates at location, using only neutral grey `?` marker with no side identity.
- [ ] Out-of-view combat/death reveals no side/unit identity in any player-facing UI channel.
- [ ] Out-of-view unknown markers do not trigger camera auto-pan; they are only visible when the combat location is within current viewport.
- [ ] Multiple out-of-view combats in one hex collapse to one `?` marker for that hex during animation.
- [ ] Event/history panel uses generic no-identity entry for out-of-view combats and includes deduplicated region list in `Region1, Region2, or Region3` style.
- [ ] Basemap and res-1 outlines are always visible, while terrain fill/hatching + tooltip/res-4 details stay hidden until first exploration.
- [ ] AI briefing differentiates confirmed (`current`) and stale (`lastKnown`) contacts.
- [ ] New contact forces AI consultation even when event-driven mode is otherwise quiet.
- [ ] No obvious latency spike from visibility recomputation.

---

## 9. Suggested test matrix (happy paths + essential failures only)

1. **Happy: shared vision union**
   - two friendly units reveal disjoint areas; union contains both.
2. **Happy: stale intel transition**
   - enemy seen on turn N, hidden on N+1 => stale with `lastSeenTurn = N`.
3. **Happy: stale expiry**
   - enemy remains unseen for two stale turns => stale marker removed automatically.
4. **Happy: stale immediate purge on re-vision**
   - stale marker exists, friendly regains vision and enemy moved => stale marker removed immediately.
5. **Happy: stale stack invalidation**
   - stale stack marker exists, one constituent reappears current => stale stack marker removed immediately.
6. **Happy: unknown combat marker**
   - out-of-view combat produces neutral grey `?` marker only for animation duration.
7. **Happy: unknown combat no-identity leak**
   - out-of-view combat/death does not expose player/unit identity in tooltip, overlays, or event feed.
8. **Happy: destruction updates vision**
   - remove observer unit, recompute, visibility shrinks.
9. **Happy: no auto-pan for unknown marker**
   - out-of-view combat does not move camera and marker becomes visible only when in viewport.
10. **Happy: unknown marker per-hex collapse**
   - multiple unknown combats in same hex produce one temporary `?` marker at that hex.
11. **Essential failure: invalid player side**
   - side-subjective snapshot request for unknown side returns safe error.
12. **Essential failure: corrupted intel row**
   - recovery behavior logs error and avoids crash (fallback recompute path).

Avoid tests for pure delegation IPC methods or DTO boilerplate.

---

## 10. Follow-ups status

No open product follow-ups remain for milestone 1.3 planning. Implementation can proceed on locked behavior.

---

## 11. Suggested implementation order inside a single coding session

1. Phase A + B schema updates and tests.
2. Phase C pure visibility engine and tests.
3. Phase D subjective snapshot plumbing to renderer.
4. Phase E AI pre-computation/tooling adjustments.
5. Phase F callback mandatory override.
6. Phase G smoke checks and minor tuning.

This order minimizes rework and keeps each increment verifiable.

---

*End of plan.*

