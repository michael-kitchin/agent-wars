# Tactical prompt section parity — execution plan

Bring the tactical LLM system prompt to the same briefing **section set and style** as strategic, adapting orders/status to sub-unit IDs and res4, using lightweight assessments (no Tool 2), omitting never-populated sections, and isolating ephemeral tactical callbacks via snapshot/restore on battle end.

**Audience:** Coding agent or developer implementing end-to-end.  
**Do not** put this document’s internal section or phase labels into product code, comments, configuration, or other version-controlled artifacts.

---

## 1. Locked inclusion map

### Always include (empty-state allowed)

- `# Commander's Briefing` + short narrative (beat-aware; full visibility)
- `## Unit Status and Threats`
- `## Attention Flags` (`None.` when empty)
- `# Operational Map` (+ Best Options when non-empty; **no Unit Roster** — Unit Status covers threats/nearest; strategic map matches — see `strategic-prompt-unit-table-dedup.md`)
- `## Recent Turn Notes` (only when notes exist)
- `## Active Callbacks` — sub-unit ids during battle

### Always omit in tactical (in addition to strategic-only sections below)

- `# Standing Order Status` / Units Without Standing Orders — `assign_order`/`cancel_order` blocked; `query_orders` hidden; no SO expansion for AI or human Ready
- Unit Status standing-order column (assessments set `currentStandingOrder: null`)
- `### Unit Roster` under Operational Map

### Include only when roster can populate

- `# Air Operations Status` — ≥1 opponent air sub-unit; Unit ID, Hex, Enemy Unit Targets; no ferry/infra columns
- `# Naval Transport Status` — ≥1 opponent naval sub-unit; Unit ID, Hex, Aboard, Capacity; no nearest-embark/control columns

### Always omit

- Production Status / memory tools / memoryUpdates
- Strategic Memory
- Supplemental Hex Intelligence
- Scenario Objective + home-region / explored-controlled progress bullets

---

## 2. Callback lifecycle

1. On tactical battle start: snapshot opponent `ai_callback_subscriptions` to **memory and `game_config`**.
2. During battle: model uses sub-unit ids (any rostered sub-unit); before replace, **drop** unit-scoped entries whose `unitId` is not in the battle roster and **keep valid siblings**.
3. On battle end: if a stash exists (memory or disk), clear live opponent subscriptions and restore the stash; then clear the persisted key.
4. If stash is **missing** (upgrade / interrupted older save): clear only subscriptions whose `params.unitId` or `params.side` looks like a tactical sub-unit id (`parent:slot`); leave other subscriptions untouched.
5. On `restorePersistedTacticalBattleSession`: hydrate in-memory stash from `game_config`.
6. Double-end is safe: second restore with no stash uses selective clear only.

Standing-order writes: do **not** persist `assign_order` / `cancel_order` against tactical sub-unit ids (drop those actions in tactical parse).

---

## 3. Definition of done

1. Tactical prompt contains always-include sections (Standing Order Status omitted while assign_order is blocked); air/naval only when typed units exist.
2. Lightweight assessments drive Unit Status / Attention / narrative at strategic table density.
3. Scenario Objective and scouting directive suppressed in tactical shell.
4. Callback stash/restore on all end paths; persisted across restart; no sub-unit callbacks left after battle when stash existed.
5. Mid-battle invalid unit-scoped callbacks dropped; valid siblings kept.
6. Strategic briefing / always-on strategic air-sealift empty-state unchanged.
7. Tests cover inclusion/omission, projection, assessments, callback lifecycle (persist, hydrate, missing-stash selective clear, double-end, roster filter).

---

## 4. Phased tasks

1. Lightweight tactical assessments module.
2. `formatTacticalBriefing` + `requestOrdersFlow` wire-up.
3. Standing-order parent→sub projection; mode-aware air/sealift; scenario/scouting gates.
4. Callback snapshot/restore in tactical session start/end (persisted; mid-battle filter; missing-stash selective clear).
5. Contract tests + matrix updates.
