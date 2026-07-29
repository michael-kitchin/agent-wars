# Strategic prompt unit-table dedup

Mirror of the tactical Unit Roster / standing-order column cleanup for the strategic Commander briefing, plus Orders/Memory gating.

**Audience:** Maintainers of briefing / OpenRouter prompt assembly.  
**Do not** put this document’s internal labels into product code, comments, configuration, or other version-controlled artifacts.

---

## Locked decisions

1. Strategic `# Operational Map` omits `### Unit Roster`. Threats, nearest enemy, type, and action-needed live in `## Unit Status and Threats`.
2. Unit Status includes **Type** and omits the standing-order column in both strategic and tactical. Strategic mission detail stays in `# Standing Order Status` (+ Units Without Standing Orders) **only when Orders tools are enabled**.
3. When a Commander briefing override is present, omit the trailing `Your units (ID, type, briefing hex)` line (Type is on Unit Status). Keep the observed-human line.
4. Dead helpers removed with the roster (`renderUnitRosterTableMarkdown` / related summarizer). Map builders no longer take assessments solely for roster rows.
5. Narrative / Attention Flags standing-order language is suppressed when Orders are off (empty SO injection). When standing orders are inactive (tactical or Orders off), **Action needed** and Attention Flags use **moderate/critical** threats only (low-only contact is not actioned).
6. With a Commander briefing present, Combat preamble must not coach `assess_unit` / `estimate_combat` as required next steps (briefing already says Do NOT call them).

## Out of scope (intentional keep)

- `query_orders` tool when Orders is enabled (coaching treats it as rare detail when SO Status is already in the briefing).
- Empty-state Air / Naval strategic sections.
- Trailing own-units line on the **non-briefing** fallback prompt path (tests / no-override).
