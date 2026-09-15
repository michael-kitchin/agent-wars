# No AI Slop

Copy this entire folder. It is the whole skill: operator manual, pattern catalog, tests,
and the `--file` applicator. Nothing outside this folder is required. There is no
package to install.

## Install

| Scope | Destination |
| :--- | :--- |
| One project | `.cursor/skills/no-ai-slop/` |
| Every Cursor project on this machine | `~/.cursor/skills/no-ai-slop/` |

On Windows the personal path is `%USERPROFILE%\.cursor\skills\no-ai-slop\`.

Do not copy into `~/.cursor/skills-cursor/`. That directory is Cursor's built-in skills.

Keep the folder name `no-ai-slop`. Cursor loads `SKILL.md` from a directory of that
name.

Installing in both places lists `/no-ai-slop` twice. Prefer one destination.

## Layout

```text
no-ai-slop/
  SKILL.md                      operator manual
  README.md                     this file
  references/mechanicalSigns.md pattern catalog and severity table
  references/contractions.md    house-style contraction pairs
  references/englishVariety.md  US/UK spelling pairs for variety mismatch
  scripts/applyFileFix.cjs     --file heading and em-dash rewrite
  tests/houseStyle.cjs          heading tree and title case
  tests/emDashRewrite.cjs      em-dash rewrite
  tests/contractions.cjs        contraction detection and rewrite
  tests/contractionBinding.cjs  locative and object-pronoun skips
  tests/englishVariety.cjs      US/UK variety mismatch after Guards
  tests/runTests.cjs            mechanical tests (Node, no packages)
  tests/cases.json
  tests/fixtures/
```

## Tests

From this folder:

```text
node tests/runTests.cjs
```

The working directory does not matter if you pass the script's path.

## `--file` fix

Node is required for `--file` fix and for tests. From this folder, run these steps
**in order**. Do not batch step 1 with step 3.

```text
1. node scripts/applyFileFix.cjs --file path/to/file.md
2. Judgment (myth-bust, copula, bold, remaining detectors) per SKILL.md
3. node tests/contractions.cjs --file path/to/file.md
```

Step 1 applies headings and em dashes only. Metaphors and contractions are not part
of `applyFileFix.cjs`. Step 2 must finish before contractions so quoted `"…" is not.`
closers are still visible; if contractions already ran, Grep `isn't.` as well.
Step 3 leaves locative `here is` and object-pronoun copulas expanded. Pasted-text
audit still follows SKILL.md without Node.
