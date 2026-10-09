# Agent Instructions

Guidance for coding agents working in this repository.

Coding rules live in `.cursor/rules/`. Cursor applies them automatically; other agents should read each `.mdc` file there and follow it.

## Keep `doc/` Current

`doc/` holds the living product documentation. Before you change code, read the documents that describe the behavior you are about to change. When the change makes one of those documents wrong, update it in the same change as the code.

A design note or execution plan in `.spec` does not by itself call for a `doc/` edit. Update `doc/` when the implementation lands.

### Before You Change Code

- Start at [doc/README.md](doc/README.md). Its index says which documents are current and which are historical. The engine constants table lists the symbols those documents track, and the paragraphs around that table say which document to update.
- For user-visible UI behavior, use the routing table in [doc/ux-specification.md](doc/ux-specification.md). Read the cross-cutting documents it lists, then the element document. Read Known Deviations when the document has that section, before changing code to match the spec. Add a Known Deviations section only when you are recording a known, accepted bug.
- For visual styling and chrome, read [doc/ui-style-guide.md](doc/ui-style-guide.md).
- For what the AI opponent's model is told, start at [doc/ai-commander-prompts/README.md](doc/ai-commander-prompts/README.md).
- For file, directory, and symbol names, follow [doc/naming-conventions-contract-v1.md](doc/naming-conventions-contract-v1.md).

### Which Side Wins a Disagreement

- **Mechanics:** the engine under `src/` is the first authority. When a mechanics document disagrees with the code, the code is right and the document gets fixed.
- **UX:** the UX suite is normative for user-visible behavior. A mismatch is either a code bug or an intended behavior change, and the change that alters behavior also updates the document.
- **Naming:** when an identifier disagrees with the naming contract, fix the identifier.
- **Prompts:** the builders under `src/main/openRouter/` win when `doc/ai-commander-prompts/` drifts from them.

### What to Update in the Same Change

- Every maintained document that describes a behavior, number, name, file path, or symbol you changed. Search `doc/` for the old value, symbol, and path. Leave the historical documents listed below out of that edit.
- When you change a symbol in the engine constants table, follow the update instructions around that table in [doc/README.md](doc/README.md), including the consultation-deadline paragraph after it.
- The requirement text in the affected UX document when user-visible behavior changes. When you fix a bug listed under Known Deviations, remove that entry. When code a document points at moves or is renamed, update the section that names it: Code Entry Points, or Source Anchors in [doc/ux/control-tooltips.md](doc/ux/control-tooltips.md).
- An Open Question in the relevant UX document when the spec is silent or ambiguous. Wait to state a requirement until you know it.
- [doc/ui-style-guide.md](doc/ui-style-guide.md) when chrome, color, or its implementation-status note changes.
- [doc/region-summary-1.md](doc/region-summary-1.md) when regional maps, economy, or terrain rules change. Table 2 is the manifest economy. The command in that file's opening note prints the economy table and the side-group balance table, and it also writes each region's manifest, so run it only when you mean to regenerate economies. Copy the printed economy table into Table 2, and keep the global row and the surrounding prose. Update map, side-group, and terrain text in place when those rules change. The manifest stays authoritative.
- [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) when you add, remove, or upgrade a runtime dependency, a vendored file, or a dataset behind generated data that ships. `npm run notices:check` runs in `npm test`. It checks npm dependency versions and copyright lines against the file, plus the fixed credits listed in `scripts/thirdPartyNotices/noticeCheck.cjs`. It cannot find a new dataset, so add its section and a fixed credit for it. Leave `LICENSE` as the unmodified MIT text, so GitHub recognizes it. Data terms go in the notices file and the README License section.
- [doc/project-instructions.md](doc/project-instructions.md) and [doc/coding-prompts-1.md](doc/coding-prompts-1.md) when a change makes a fact in them wrong, such as a moved directory, a renamed script, or a changed workflow convention. Leave the persona, tone, and prompt wording as written. Neither file is in the [doc/README.md](doc/README.md) index.

### When Nothing Covers the Change

When a change adds a feature or mechanic that no document covers, extend the closest document or add a new one, then register it:

- Product and mechanics documents go in the index table of [doc/README.md](doc/README.md), with a role and status.
- UX element documents go in `doc/ux/`, use the fixed heading set described in [doc/ux-specification.md](doc/ux-specification.md), and get a row in its routing table.
- A new cross-cutting UX document goes in `doc/ux/`, gets a paragraph in the Cross-Cutting Documents list, and is named from the routing-table rows that should be read with it. Use headings that fit the subject, in the style of the existing cross-cutting documents.
- Prompt documents go in `doc/ai-commander-prompts/` and its README.

### Documents to Leave Alone

The index marks some documents as historical or dated research: [doc/devleopment-plan-v3.4.md](doc/devleopment-plan-v3.4.md) (the filename keeps that spelling), [doc/poc-analysis.md](doc/poc-analysis.md), and [doc/market-research.md](doc/market-research.md). Read them for context. Edit them only when asked. Milestone writeups in the development plan are historical.

### How to Write `doc/` Changes

- Edit documents in place. Working specs, execution plans, and debugging notes belong in `.spec`. Keep `doc/` content in `doc/`.
- Take numbers, names, and limits from the code, and name the symbol they come from so the next reader can check it.
- Keep identifiers that exist only in `.spec/` or `.test/` files (plan phases, workflow steps, hypothesis labels) out of `doc/`.
- Match the voice, heading style, and table layout of the document you are editing.

### Before You Finish

Apply the authority rules above and update the document that should change. In your final summary, name the documents you updated, or say that you checked and none needed changes. When you cannot tell which side of a `doc/` and code disagreement should change, say so in that summary.
