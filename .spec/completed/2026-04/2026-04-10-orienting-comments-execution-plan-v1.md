# Execution Plan: TypeScript `src` Orienting Comments Capability

*Version 1.1 — April 2026*

---

## Goal

Implement a reliable coding-agent capability that ensures all **new and updated fields**, **new and updated constructors**, and **new and updated non-overriding methods** include correctly formatted orienting comments across all access levels and cardinalities.

This plan is structured for maximum reliability and clarity through independently verifiable phases, with each phase producing usable outcomes even before full completion.

---

## Rule Contract To Enforce

The implementation must enforce the following:

- Every **new or updated field** has an orienting comment.
- Every **new or updated constructor** has an orienting comment.
- Every **new or updated non-overriding method** has an orienting comment.
- Every **new or updated TypeScript overload signature** has an orienting comment.
- Coverage applies to public, private, package-private, static, instance, outer, and inner declarations.
- Scope is limited to TypeScript files under `src`.
- Interface and abstract method comments describe **code contracts** (intent, expected behavior, pre/postconditions, exceptions).
- Concrete implementation method comments describe **high-level implementation intent** (why it exists, when to use it, expected results/exceptions).
- Comment format uses **standard Javadoc-style block comments**.
- Comments must be understandable, concise, and troubleshooting-friendly for future developers.

---

## Non-Goals

- Retroactively rewriting every untouched declaration in the entire repository in one pass.
- Enforcing style details unrelated to orienting comments (formatting, naming, architectural refactors) unless needed for safe comment insertion.
- Blocking delivery on optional tooling if a reliable manual/agentic workflow exists first.
- Adding heavyweight custom CI enforcement if this cannot be done reasonably via lint rules.

---

## Delivery Strategy

- Start with deterministic standards and review checklists.
- Add a safe, incremental autofix capability.
- Gate with verification at each phase.
- Execute once across `src` with pre-apply checkpoints and post-apply validation to reduce regression risk.

---

## Phase 1 — Comment Specification and Acceptance Criteria

### Objective

Define exact comment schema, formatting, edge-case behavior, and pass/fail criteria so agent output is consistent and auditable.

### Scope

- Author a comment template library by declaration type:
  - Field comments
  - Constructor comments
  - Concrete non-overriding methods
  - Interface methods
  - Abstract methods
- Define minimum required content in each orienting comment:
  - Why this declaration exists
  - When to use it
  - Expected outcome
  - Notable exceptions/failure behavior (if applicable)
- Define exclusions and clarifications:
  - Overriding methods excluded based on **syntax-only detection**
  - Constructors included
  - Generated code handling: exclude directories outside `src` by scope; optional explicit exclude list for generated TypeScript under `src` if present
- Define unacceptable patterns (placeholder comments, tautologies, implementation noise).

### Verification

- A written checklist exists and is approved.
- At least 10 representative declarations are reviewed against the checklist with 100% agreement among reviewers/agents.

### Deliverables

- `.spec/orienting-comments-style-contract-v1.md`
- Reviewer checklist section (may live in same file)

---

## Phase 2 — Declaration Discovery and Classification Engine

### Objective

Build a reliable detection flow that identifies candidate declarations in changed files and classifies them correctly before any edits occur.

### Scope

- Determine language/file targets in repo scope:
  - Include `src/**/*.ts`
  - Exclude declaration files (for example `*.d.ts`) and configured generated paths
- Implement a parser-based or hybrid discovery step to detect:
  - Fields
  - Constructors
  - Methods
  - Method modifiers and abstract/interface/override status with syntax-based override classification
- Build declaration classifier output format (machine-readable), including:
  - File path
  - Symbol name
  - Declaration type
  - Needs comment: yes/no with reason
- Add confidence markers (high/medium/low) for fallback manual review.

### Verification

- Run against a curated corpus of changed-file examples.
- Measure precision/recall for “needs comment” classification and target >= 98% precision before autofix.
- Manual spot-check on low-confidence results.

### Deliverables

- Discovery/classification module
- Golden test corpus for detection/classification
- Baseline quality report

---

## Phase 3 — Safe Comment Generation and Insertion

### Objective

Generate high-quality orienting comments and insert them safely without breaking behavior or readability.

### Scope

- Implement deterministic comment-generation prompts/templates with declaration-aware phrasing.
- Enforce quality constraints:
  - No placeholder language
  - No contradiction with signature/throws contract
  - No duplicate/redundant comments
- Normalize and correct existing comments on updated declarations when they do not meet the current orienting-comment contract.
- Enforce comment format:
  - Javadoc-style `/** ... */` blocks only
  - Minimum required orienting content sections (purpose, usage context, expected outcome, exception behavior when relevant)
- Implement idempotent insertion/update behavior:
  - Insert when missing
  - Update when stale and declaration changed
  - Preserve existing high-quality comments when still valid
- Add dry-run mode that emits a proposed diff only.

### Verification

- Idempotency test: two consecutive runs produce no additional changes on second run.
- Syntax/parsing validation after insertions.
- Manual quality review on a stratified sample:
  - Interface methods
  - Abstract methods
  - Complex private helpers
  - Static fields

### Deliverables

- Comment generation/insertion module
- Dry-run and apply modes
- Quality rubric with examples of accepted/rejected comments

---

## Phase 4 — One-Pass Repository Execution

### Objective

Apply capability safely in one automated pass across `src` with clear verification checkpoints.

### Scope

- Execution strategy:
  - Execute a repository-wide run over `src` in one pass, with internally staged checkpoints for recoverability
- One-pass execution flow:
  - Run full detection/classification on `src`
  - Produce full dry-run diff and summary report
  - Apply all approved changes automatically
  - Run lint/type checks and essential tests
- Track metrics:
  - Declarations processed
  - Comments inserted/updated
  - False positives/negatives discovered in review

### Verification

- One-pass run passes lint/type checks and essential tests.
- Reviewer sign-off on readability and correctness.
- No unresolved high-severity regressions at completion.

### Deliverables

- One-pass execution log
- Coverage and quality metrics report
- Completion tracker with unresolved-item list (target: empty)

---

## Phase 5 — Ongoing Enforcement for New Changes

### Objective

Prevent regression by enforcing orienting-comment compliance for all future PRs/agent edits.

### Scope

- Prefer lint-rule-based enforcement where reasonably feasible:
  - Implement or configure lint rules to detect missing orienting comments for targeted declarations in changed TypeScript under `src`
  - Use lint as check-only enforcement signal
- If robust lint-rule enforcement is not reasonably achievable, skip hard enforcement and rely on automated one-pass execution plus periodic reruns.
- Keep autofix available for local/agent workflows.

### Verification

- Simulated PR tests:
  - Missing comment should fail
  - Correctly commented change should pass
  - Override method without new comment requirement should pass
- Lint-rule feasibility assessment recorded with rationale when enforcement is partially or not implemented.

### Deliverables

- CI/workflow enforcement config
- Developer-facing usage guide
- Troubleshooting guide for false positives
- Enforcement feasibility note (if lint-only approach is limited)

---

## Reliability and Understandability Standards

All implementation work for this capability must follow these standards:

- Prefer parser-backed declaration understanding over regex-only logic where available.
- Keep changes local and explicit; avoid bulk opaque rewrites.
- Require deterministic outputs where possible (stable templates and ordering).
- Preserve developer intent: update comments only when declaration meaning changed.
- Keep comments concise and actionable for maintainers unfamiliar with the original author.
- Maintain an audit trail of generated vs manually curated comments.

---

## Essential Test Strategy (Happy Path + Essential Failure Cases)

### Happy Path

- Detect and comment a newly added field.
- Detect and comment a newly added constructor.
- Detect and comment a newly added non-overriding concrete method.
- Detect and comment each newly added TypeScript overload signature.
- Detect and comment interface/abstract methods using contract-focused format.
- Update stale comment when declaration contract changes.

### Essential Failure Cases

- Parser/classifier ambiguity returns low confidence and requires manual review.
- Existing comment is present but malformed/insufficient and must be replaced safely.
- Overload groups are partially commented; tool must enforce per-signature coverage without breaking overload structure.
- Declaration resembles override incorrectly; classifier must not require comment when override exclusion applies.
- Autofix attempts insertion where formatting would break syntax; operation must fail safely with actionable report.
- Lint rule cannot express a required edge case without high false positives; document limitation and fall back to non-blocking automation.

---

## Execution Order and Dependencies

- Phase 1 is mandatory before all others.
- Phase 2 depends on Phase 1 acceptance criteria.
- Phase 3 depends on Phase 2 classifier reliability thresholds.
- Phase 4 depends on Phase 3 idempotency and syntax safety.
- Phase 5 depends on stable results from a successful Phase 4 one-pass execution.

Execution mode note: although rollout occurs "all at once" for `src`, checkpoint artifacts from Phases 1-3 remain required before the full apply step in Phase 4.

---

## Definition of Done

The capability is complete when all of the following are true:

- Standards document approved and in active use.
- Detection + classification + insertion pipeline is stable and idempotent.
- CI/workflow enforcement prevents regressions on changed code.
- Developers can understand and maintain generated comments without reverse-engineering the tool.
- One-pass `src` execution completes with a validated report and no unresolved high-severity issues.

---

## Locked Decisions (From Direction)

1. Scope is `src` only.
2. Language coverage is TypeScript only.
3. Override detection is syntax-based only (bias toward extra comments instead of missed comments).
4. Constructors are included.
5. Generated/vendor/external code is excluded.
6. Enforcement should be implemented through lint rules where reasonably possible; otherwise no hard enforcement.
7. Comment style is standard Javadoc-style block comments.
8. Execution is one automated all-at-once run (not phased over time), while preserving phase gates for verification.
9. Current assumption: there are no known generated TypeScript paths under `src`; if discovered, they will be added to explicit exclusions before apply mode.
10. TypeScript overload signatures require orienting comments on each overload declaration.
11. Existing comments on updated declarations should be normalized/corrected when needed to match the contract.

---

## Suggested Next Step

Next step is implementation of Phase 1 artifacts (`.spec/orienting-comments-style-contract-v1.md`) and the TypeScript `src` discovery prototype so we can validate classification before one-pass application.
