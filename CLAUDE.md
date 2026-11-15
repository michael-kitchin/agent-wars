# Claude Code Instructions

Claude Code does not read `AGENTS.md` or `.cursor/rules/` on its own. This file imports them so every session follows the same guidance as Cursor.

When you add, rename, or remove a rule file in `.cursor/rules/`, update the import list below in the same change.

## Agent Instructions

@AGENTS.md

## Coding Rules

@.cursor/rules/01-reliable-code.mdc
@.cursor/rules/02-backend-logging.mdc
@.cursor/rules/03-testing-standards.mdc
@.cursor/rules/04-orienting-comments.mdc
@.cursor/rules/05-spec-documents.mdc
@.cursor/rules/06-reusable-code.mdc
@.cursor/rules/07-modern-patterns.mdc
@.cursor/rules/08-boilerplate-reduction.mdc
@.cursor/rules/09-file-size-limits.mdc
@.cursor/rules/10-argument-limits.mdc
@.cursor/rules/11-no-commit-or-push.mdc
@.cursor/rules/12-no-plan-identifiers.mdc
@.cursor/rules/13-mutable-and-immutable.mdc
@.cursor/rules/14-naming-conventions.mdc
@.cursor/rules/15-managing-secrets-and-pii.mdc
@.cursor/rules/16-markdown-structure.mdc
