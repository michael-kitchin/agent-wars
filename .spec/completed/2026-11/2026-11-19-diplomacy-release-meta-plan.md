# Diplomacy Release Meta-Plan

**Audience:** A coding agent that runs all three plans of this release, one after another, without asking questions.

**Goal:** Commanders can make private agreements, keep or break them, and see who is who in their prompts. The player reads side codes as names. The charts dialog shows agreements over time. The three plans are run together as one release.

**Shape:** Three execution plans, in a fixed order. Each one is run in full with its own instructions. This document only says the order, what passes between the plans, how verification is shared, and how to stop and hand off.

---

## The Plans, in Order

| Order | Plan | What it delivers | Needs |
|---|---|---|---|
| 1 | `.spec/2026-11-18-side-agreements-execution-plan.md` | The agreements table, store, recorder events (`agreement_recorded`, `agreement_decision`), prompt text, talk and orders handling, keep-or-break decisions, the Sides table with `Code (unit id prefix)`, loss lines with home regions, and talk prompt logging | Nothing from this release |
| 2 | `.spec/2026-11-18-side-code-display-names-execution-plan.md` | `sideCodesToDisplayNames` and display names in the chat panel, message dialog, and Reports tab, with the raw text as a tooltip | Nothing from plan 1, but it runs second so the agreements' message text is covered by the same change |
| 3 | `.spec/2026-11-19-agreement-timeline-execution-plan.md` | The "Agreements over time" strip in the charts dialog | Plan 1 (types, guards, standing rule, recorder events, zone codes) and plan 2 (`sideCodesToDisplayNames`) |

Do not reorder the plans. Do not run phases from two plans at the same time.

---

## How to Run the Release

1. Read all three plans once before starting, so you know what each one will touch.
2. Run plan 1 from its Phase 0 to its last phase, exactly as it says.
3. Run plan 2 the same way.
4. Run plan 3 the same way. Its Phase 0 checks that plans 1 and 2 left what it needs.
5. Finish with the Release Hand-Off below.

Each plan's own rules apply while it runs, except where Shared Verification below says to skip a Phase 0 Verification Bar. That table overrides the plans: its file lists, its Backup and Revert steps, its Phase Check, its Conventions, and its Completion Log. Never commit, push, stash, or run `git checkout`, `git restore`, `git reset`, or `git clean`.

### Backups

Each plan keeps its backups in its own folder under `%TEMP%`. Do not delete any backup folder until the user has reviewed the whole release. A later plan may need to revert one of its own phases. It never reverts an earlier plan's phases.

---

## Shared Verification

The full Verification Bar (`npm test`, `npm run build:renderer`, `npm run check:circular`) takes about 20 minutes. Run it four times in the release, not six:

| When | Run | Notes |
|---|---|---|
| Plan 1, Phase 0 | Full bar | The release baseline. Record the `check:circular` cycle list here; every later Phase Check compares against it |
| Plan 1, last phase | Full bar | Required |
| Plan 2, Phase 0 | **Skip.** Reuse plan 1's final run | Run `git status --short` and record it. Record the same cycle list |
| Plan 2, last phase | Full bar | Required |
| Plan 3, Phase 0 | **Skip.** Reuse plan 2's final run | Run `git status --short`, then do every prerequisite check in plan 3's Phase 0 |
| Plan 3, last phase | Full bar | Required. This is the release's final verification |

Record each skip in that plan's Phase 0 Inventory as "reused from the previous plan's final run", with that run's results.

Every phase that is not Phase 0 or a final phase still runs its plan's Phase Check. That is never skipped.

---

## Handoffs Between Plans

What each plan leaves for the next. Plan 3's Phase 0 checks these. If any is missing, stop and report it.

**From plan 1:**

- `src/shared/sideAgreements.ts`, with the kinds, statuses, intents, decisions, guards, and `sideAgreementStanding`
- `'agreement_recorded'` and `'agreement_decision'` in `MATCH_EVENT_TYPES`
- `src/main/recorder/sideAgreementRecordingEvents.ts`
- `src/main/sideAgreements/sideAgreementZoneCodes.ts`, with `zoneH3ToCodes` and `STRATEGIC_ZONE_CODE_TRANSLATOR`

**From plan 2:**

- `src/shared/sideCodeDisplayText.ts`, with `sideCodesToDisplayNames`

Plan 3's Phase 1 changes two files from earlier plans: `src/shared/sideAgreements.ts` gains label tables, and `src/shared/sideCodeDisplayText.ts` gains `sideCodesToNamesByCode`. Both changes are additive. The existing tests of both files must keep passing unchanged.

---

## Files More Than One Plan Touches

Read each of these again before you edit it, because an earlier plan has changed it.

| File | Plans | Note |
|---|---|---|
| `src/shared/sideAgreements.ts` | 1, 3 | Plan 3 only adds the two label tables |
| `src/shared/sideCodeDisplayText.ts` and its test | 2, 3 | Plan 3 splits the rule without changing its output |
| `doc/commander-messages.md` | 1, 2, 3 | Each plan adds to it. Keep the earlier text |
| `static/renderer.js` | 2, 3 | Rebuilt by `npm run build:renderer`. Never edit it by hand |

If a plan's sketch disagrees with a file because an earlier plan changed it, the file wins. Record the difference in that plan's Completion Log.

---

## Stopping

- When a phase fails and cannot be fixed within its file lists, follow that plan's stop rule: revert that phase, record the defect, and stop the **whole release**. Do not start the next plan.
- Tell the user which plan and phase failed, why, and which plans and phases finished.
- When plan 1 or plan 2 stops, plan 3 cannot run. Say so.

---

## Release Hand-Off

After plan 3's final Verification Bar passes, your final message to the user has:

1. One line per plan: finished, with the result of its final Verification Bar.
2. Every document updated across the three plans, as `AGENTS.md` requires.
3. Every file changed outside a phase's Add and Edit lists, from all three Completion Logs.
4. All three manual checklists, in plan order, under one heading each.
5. Any open entries from the three Defect Inventories.
6. The result of one release-wide search for plan vocabulary, in changed **and new** files, because `git diff` does not list untracked files:

   ```powershell
   $pattern = 'Phase \d|execution plan|meta-plan|locked decision'
   git diff -- src doc static | Select-String -Pattern $pattern
   git ls-files --others --exclude-standard -- src doc static | ForEach-Object { Select-String -Path $_ -Pattern $pattern }
   ```

   Nothing may match. Fix any match in the file it is in, then rerun plan 3's Phase Check.

## Release Success Definition

- All three plans are finished, and each plan's Success Definition holds.
- The final Verification Bar, run at the end of plan 3, passes.
- `npm run check:circular` shows only the cycles recorded in plan 1's Phase 0.
- No commit, push, or baseline edit was made.
