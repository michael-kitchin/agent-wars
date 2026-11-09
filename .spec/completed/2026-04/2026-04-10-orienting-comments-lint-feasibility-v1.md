# Orienting Comments Lint Feasibility

*Version 1.0 — April 2026*

## What Was Implemented

- A local ESLint plugin (`eslint-rules/orienting-comments-plugin.cjs`) exposing `orienting-comments/require-orienting-block`.
- The rule is **type-aware** (requires `parserServices.program` / `esTreeNodeToTSNodeMap`) and validates the same labeled-line structure as `.spec/orienting-comments-style-contract-v1.md`, plus a **single `/**` opener** guard to reject stacked blocks.

## Scoping Decisions (Reliability)

- **`*.d.ts` files are ignored** via ESLint `ignores` because they are declaration shapes, not primary authoring surfaces for orienting comments.
- **`MethodDefinition` / `PropertyDefinition` are enforced only under `ClassBody`** to avoid false positives on object/type literal members that reuse similar ESTree shapes.
- **`TSMethodSignature` / `TSPropertySignature` are enforced only under `TSInterfaceBody`** to avoid false positives on inline object types and similar constructs.

## Known Gaps vs the Tool

- **Constructor parameter properties** (`public foo: ...`) are handled by the TypeScript tool, but are not covered by the ESLint rule (node shape differs across ESLint versions and is easy to mis-detect).
- **Decorators + comment placement edge cases** are primarily handled by the tool’s UTF-16 edit planner; ESLint validation uses a simpler “leading block before declaration start” heuristic.

## Repository Lint Status Note

`npm run lint` may still report unrelated existing issues (for example `@typescript-eslint/no-unused-vars` and `@typescript-eslint/no-explicit-any`). Those are outside the orienting-comment contract and were not part of this change set’s remediation scope.
