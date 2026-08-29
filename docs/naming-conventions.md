# Naming conventions

Living index for how files, directories, and exported TypeScript symbols are named in this repository.

**Authoritative rules:** [`.spec/naming-conventions-contract-v1.md`](../.spec/naming-conventions-contract-v1.md). This page does not add or weaken those rules.

**Signed rename work list:** [`.spec/naming-rename-ledger-v1.md`](../.spec/naming-rename-ledger-v1.md) and `scripts/naming/renameLedger.json`.

Enforcement:

- `npm run naming:report` — read-only scan
- `npm run naming:check` — fails if the ledger still has pending entries or a fresh scan finds unwaived violations (wired into `npm test`)
- ESLint `@typescript-eslint/naming-convention` plus `naming-conventions/require-src-path-casing` on `src/**/*.ts`

Boundary-mirroring properties (SQL columns, vendor JSON, persisted keys) stay in the external schema’s case. LLM tool **string values** such as `'assess_unit'` are frozen even when the const that holds them is renamed.
