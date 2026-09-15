---
name: no-ai-slop
description: Use when checking a document or pasted text for AI writing tells before publishing, when asked to clean AI tells out of a file, or when applying this skill's house style (title-case headings, heading trees that start at H1, metaphor replacement, contractions) in default fix mode.
---

# No AI Slop

Find the writing and formatting patterns that mark text as LLM-generated, and correct
them without hiding the real problem underneath. This skill also applies a house-style
overlay that does not count toward the authorship verdict.

```text
no-ai-slop "your text" [--file path/to/file.md] [--mode audit|fix]
                 [--severity definitive|strong|corroborating]
                 [--context markdown|plaintext]
```

Adapted from [Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing).
Scope is general prose and Markdown. Wikipedia-specific material is excluded.

The authorship catalog is 39 distinct signs. Title-case headings left that catalog and
became overlay; `myth-bust-lead` occupies that slot. The overlay (title case, heading
tree, technical metaphors, contractions) is extra and never changes the verdict.

This folder is the whole skill. Resolve every relative path from the directory that
contains this SKILL.md, whether that is `.cursor/skills/no-ai-slop/` in a project or
`~/.cursor/skills/no-ai-slop/` as a personal install. After changing patterns or
algorithms, run `node tests/runTests.cjs` from that folder (working directory does not
matter if you pass the script's full path). See [README.md](README.md) to copy the
skill.

## When to use this skill

- Checking a draft for AI tells before publishing it
- Applying house style (title case, H1-start, metaphor replacement, contractions) before publishing
- Auditing a file someone else wrote when authorship is in question
- Cleaning chatbot artifacts out of text that was pasted from a tool

## Three rules that override everything else

**1. Corroborating signs are not evidence.** Never state or imply that text is
AI-generated on the strength of `corroborating` findings alone. Curly quotes and
triads are common in human writing. Em dashes are **strong** in this skill (Unicode
U+2014 and ASCII ` -- `) and **do** count toward the verdict; twenty dashes are still
one finding. Title case is required house style and **does not** count toward the
verdict.

**2. Report the caveat with the finding.** Every sign has a documented false-positive
case. Include it in the report.

**3. Never launder a tell.** Where a sign points at missing substance rather than
surface style, report it and stop. Do not invent a fact to replace a vague claim.

House-style findings are always listed. In `--mode fix` at default `--severity strong`
(or `corroborating`), rewrite them. They do not increment Definitive / Strong /
Corroborating counts. `--severity definitive` leaves house-style unfixed.

## Quick reference

### Modes

| Mode | Behaviour |
| :--- | :--- |
| `audit` | Scan and report. Changes nothing. Default. |
| `fix` | Apply corrections at or above the severity threshold, plus house style unless `--severity definitive`. |

### Flags

| Flag | Effect |
| :--- | :--- |
| `--file` | Path to scan. Enables the deterministic Grep-driven pass. |
| `--severity` | Minimum tier `fix` will act on. Default `strong`. `audit` always reports all tiers. |
| `--context` | `markdown` or `plaintext`. Defaults to inference from the file extension. |

### Severity tiers

| Tier | Meaning |
| :--- | :--- |
| `definitive` | Near-proof a tool was involved. |
| `strong` | Highly idiosyncratic to LLM output but not proof. Em dashes are strong here. |
| `corroborating` | Also common in human writing. Counts only in combination. |
| House style | Always reported. Default fix rewrites. Never part of the verdict. |

### Verdict bands

| Condition | Verdict |
| :--- | :--- |
| Any `definitive` finding | AI tooling confirmed in this text |
| No `definitive`, 3 or more `strong` | Strong indication |
| No `definitive`, 1 to 2 `strong` | Some indication |
| Only `corroborating` findings | Inconclusive; not evidence of AI authorship on its own |
| No detector findings | No signs found |

Count **distinct signs, not individual matches**. A document whose only strong detector
sign is em dashes verdicts as "Some indication". House-style rows do not change that.

Do not compute a numeric score.

## Step 1: Parse arguments

Read the arguments from the user's invocation. Extract:

- **Text or `--file`.** If neither is present, ask for one. If both, `--file` wins.
- **`--mode`**, one of `audit` or `fix`. Default `audit`.
- **`--severity`**, one of `definitive`, `strong`, `corroborating`. Default `strong`.
  Applies to `fix` only.
- **`--context`**, one of `markdown` or `plaintext`. If absent, infer: `markdown` for
  `.md` and `.markdown` files and for anything destined for Reddit, Substack, GitHub or
  a chat client; `plaintext` for email, word processors and plain comment fields. When
  the destination is genuinely unclear and the document contains bold or heading syntax,
  ask rather than guess.

If the input is pasted text longer than roughly 400 words, ask the user to save it to a
file and re-run with `--file`.

## Step 2: Mechanical pass

**With `--file`:** Grep each pattern in
[`references/mechanicalSigns.md`](references/mechanicalSigns.md) **in this skill
folder**, not a file of the same name in the workspace. Record match count and line
numbers. That file is the canonical Patterns fence and severity table. Scan with the
Grep tool or Node, UTF-8. Do not use PowerShell `Get-Content` for U+2014.

**With pasted text:** apply the same patterns by reading carefully. Label this section
`manually checked`.

Patterns use Rust regex syntax. `$`-anchored patterns use `\s*$` for CRLF;
multiline patterns use `[\r\n]+` rather than `\n+`.

Do not Grep `^#{2,6}` as a finding. Heading trees and title case are the algorithms
below, not a naive H2 match.

## House style (no verdict)

Always list these. Rewrite in default fix. Contractions apply to running prose.
Heading tree and title case apply to ATX headings only (`#` through `######`).
Setext headings are out of scope; do not "fix" them.

### Heading tree

1. **Promote.** Ignore YAML between a leading pair of `---` lines. Ignore
   ATX-looking lines inside fenced code. Collect remaining ATX headings. Let `min`
   be the smallest level. Rewrite each to level `level - min + 1` so the first
   heading becomes `#`. Relative nesting is preserved. Do not title-case YAML keys
   or fenced-code lines.
2. **Close skips.** Walk headings in order. If a heading is more than one level deeper
   than the previous, reduce it to `previous + 1`. A proper H1 then H2 then H3 tree
   is unchanged. Do not flatten nested H3 to H2.

Before: `## Title` then `### Section`. After: `# Title` then `## Section`.
Before: `# Title` then `### Section`. After: `# Title` then `## Section`.

### Title case

This skill **requires** title case on ATX headings. Sentence-case headings are a
house-style miss, not an AI tell.

Algorithm: split the heading on backticks. Title-case even fragments (outside inline
code); leave odd fragments unchanged. In each plain fragment, split on `: ` so the
word after a colon is first of a new fragment, then split on spaces. Capitalize the
first and last word of that fragment always. Lowercase a word if, after stripping
leading and trailing punctuation for the lookup, it is in
`{a, an, the, and, or, nor, as, but, for, to, at, by, in, of, on, per, via, vs, with, from}`
and it is not first or last. A leading `(` force-caps the inner word. Hyphenated
words: apply the same rule to each side (`pre-computation` -> `Pre-Computation`;
`AI-Developed` stays). Otherwise capitalize the first *letter* and leave the rest
(`LLM`, `ASCII` stay). Tokens with no letter (`2.4.0`) stay unchanged. Do not split
on `/` (`Save/Load` is one token).

### Technical metaphors

Grep `vague-tech-metaphor` then apply Guards. Replace with a concrete noun that fits:

- seam -> boundary, or dividing line
- shape (of a document, module, or plan) -> mix of fields, contract, outline, or layout
- thread (series framing) -> goal, or aim, or purpose
- hole (in a claim or account) -> blank, or gap in the record

Do not use those defaults blindly.

### Contractions

Grep `missing-contraction` then apply Guards. Replace using the pair table in
[`references/contractions.md`](references/contractions.md). That table is the only
list. Do not invent pairs (`there're`, `ain't`, `I'd've`, `shan't`, `what'd` from
`what would`). `what had` still maps to `what'd` under `aux-had`.

Prefer a `* not` / `cannot` pair over an overlapping copula or modal (`are not`
before `they are`, `is not` before `it is`). Among those, longest expanded form
first (`will not` before `I will`). The apostrophe is ASCII `'`. Preserve the first
letter's case (`It is` -> `It's`); all-caps spans stay all caps (`DO NOT` -> `DON'T`).

`have` / `has` / `had` contract only as auxiliaries (`I've been`, not `I have a
list` or `I have to go`). If `had` vs a noun reading is unclear, leave it.
`let us` becomes `let's` only as a clause-initial hortative, never `Please let
us know` or `Let us in`. A leading `>`, list marker, or opening quote still
counts as a clause start. Two-word `can not` meaning "allowed to refrain" stays.
Do not contract locative `here is` / `there is` after a noun (`figure here is`).
Presentational `Here is` and `so here is` still contract. Do not contract `it` /
`they` plus a copula or modal when the pronoun is the object of a preposition or
gerund (`in it is`, `following it will`), when the copula has no complement
(`so here it is.`, `the way it is can`), or when the previous word is not a
subject cue. `that is` after `of` still contracts (`Most of that's`).
When you're unsure, leave the span expanded.

For `--file` fix, after copula rewrites run
`node tests/contractions.cjs --file <path>`. Do not fold this into
`applyFileFix.cjs`. Pasted text uses the same table. `--severity definitive`
leaves contractions unfixed.

## Step 3: Judgment pass

These cannot be found by pattern. Read for them.

**`rule-of-three`** — corroborating.
Forced triads whose third item adds nothing, or a document where nearly every list has
exactly three items. Fix: use the natural number.

**`unnecessary-table`** — corroborating.
A two or three row table carrying material that is not tabular. Fix: write a sentence.

**`register-shift`** — corroborating.
One passage in polished formal prose beside casual text with errors, unexplained.
Fix: rewrite the outlier to match the author's voice.

**`english-variety-mismatch`** — corroborating.
Grep both columns of the pair table in
[`references/englishVariety.md`](references/englishVariety.md) against running
prose. Skip YAML, fenced and inline code, HTML comments, IMAGE/DATA lines,
mapping-only list items, and markdown blockquotes (`>`), including quoted
prompts. Quoted prompts are not the author's variety.

Report when **both** US and UK forms appear in that prose, or when UK forms
appear, US forms do not, and distinct UK pairs are fewer than three (a stray
British spelling; the overlay defaults to US, same as a tie). Three or more
distinct UK pairs and no US is a consistent British document; leave it. For
`--file` audit, `node tests/englishVariety.cjs --file <path>` prints `mismatch`
or `consistent`; it does not rewrite.

Fix: rewrite the minority forms to the majority variety. Empty US and fewer than
three UK pairs means majority is US. Still not evidence of AI authorship on its
own.

**`abrupt-cutoff`** — strong.
Text stopping mid-sentence. Fix: flag for the author. Never invent the ending.

**`elegant-variation`** — corroborating.
The same referent named three or more ways in a paragraph, each more elaborate.
Fix: pick the clearest term and repeat it.

**`myth-bust-lead`** — strong, detector, one instance.
`X is not Y. It's Z` / `wasn't A. It was B` / `I am not claiming X. I'm claiming Y` /
`There's no X. The real Y` / `There is no X. That's Y` / a sentence that is only a
quoted span plus `is not.` or `isn't.`. Rewrite so the sentence leads with the
positive claim. Drop the "isn't X", "There's no X", or quoted-denial setup. Do not
invent a third claim. A closing unquoted `It isn't.` after a characterization is the
same move; rewrite it in the judgment pass even if the first sentence has no "is not".
A restatement after an intervening sentence (`There's no X. Other fact. The real Y`)
is also judgment only; the mechanical pattern only sees an adjacent second clause.
If contractions already ran, still Grep the quoted closer for `isn't.` as well as
`is not.`.

- Before: `The largest document is not a feature. It's the sixth consolidation plan.`
- After: `The largest document is the sixth consolidation plan.`
- Before: `There's no three-layer architecture. The real arrangement is the three parts named in the title.`
- After: `The real arrangement is the three parts named in the title.`
- Before: `"About 44,000 characters" is correct either way. "44,047 characters" is not.`
- After: `"About 44,000 characters" is correct either way.`

Exempt: contrast that already leads with the claim (`This is a field report, not a
review`). Exempt: a second sentence that adds a different fact (`The gate is not
empty. It currently passes.` / `There's no evaluation harness yet. I can say how many
lines exist.`). Classic `not only / but` and `it's not just X, it's`
stay on `negative-parallelism` and still need three or more in one document.

## Step 4: Structural pass

Single document only. Describe the skeleton in one line.

**`duplicated-title-heading`** — corroborating.
A heading repeating the document title above all content, when a title already exists.

**`skipped-heading-level`** — house style (also listed under Heading tree).
Fix with the close-skips algorithm. Do not count it in the verdict.

**Formulaic skeletons.** Flag when the document matches two or more of: introduction /
parallel topics / Challenges / Future outlook; every section restating its opening;
headings that contain only headings; inline-header lists as the dominant structure;
sections of near-identical length. `strong` when two or more match, otherwise
`corroborating`. Report rather than rewrite unless asked.

## Step 5: Guards

Drop anything that survives only on the strength of an entry in the first list.

### Do not flag

Perfect grammar; mixed register; bland or robotic prose; formality itself; transition
words in isolation; unsourced content; bizarre or correct markup; detector-tool scores.

### Documents that discuss AI writing

Style guides, this skill, and replacement lists will match their own examples. If the
document's subject is AI writing or house style, audit only running prose. Skip:

- YAML front matter, including `thread:` keys
- Fenced and inline code, including `~~~` fences
- HTML comments
- IMAGE/DATA placeholder lines
- Markdown blockquotes (`>`), including quoted prompts (english-variety)
- List items whose only job is a mapping (`- seam -> boundary`, `- I am -> I'm`)
- Literal geometry: `shape of the map`, `shape of the icon`
- Programming `thread` / `threads` (OS, worker, Node)
- Garment `seam` when it is a physical join

### Signs of human writing

Never report these as problems: simple copulas; plain verbs (`wrote` not `authored`);
superlatives; hedging (`very`, `perhaps`); wordy constructions; text from before
30 November 2022. Do not strip hedging to make text "tighter".

## Step 6: Report

```text
## No AI slop: <path, or "supplied text">

Definitive D | Strong S | Corroborating C
House style H
Verdict: <band from detector counts only>
Mechanical pass: tool-verified | manually checked
Context: markdown | plaintext

| Sign | Severity | Where | Excerpt | Caveat | Fix |
|------|----------|-------|---------|--------|-----|
| vendor-citation-markup | definitive | L42 | "...centre. turn0search1" | none | Delete the markup |
| em-dash | strong | L7 | "log -- roughly" | one distinct sign | comma, parentheses, colon, or a new sentence |

### House style
| Sign | Where | Excerpt | Fix |
|------|--------|---------|-----|
| title-case-headings | L12 | "## what the hours say" | "# What the Hours Say" |
| missing-contraction | L4 | "we are ready" | "we're ready" |

### Substance to check
<findings that point at missing facts rather than surface style>

### Not flagged
<anything considered and dismissed, with the reason>
```

House-style rows are omitted from D/S/C. "Substance to check" is required when a finding
points at an unsupported claim. "Not flagged" is required when a well-known tell was
present but dismissed.

## Step 7: Fix mode

Act on detector findings at or above `--severity`, default `strong`. Also rewrite
house style unless `--severity` is `definitive`. Remaining corroborating **detector**
signs are reported and left alone.

Apply in this order:

1. **`--file` applicator.** From this skill folder run
   `node scripts/applyFileFix.cjs --file <path>`. That applies heading house style and
   em-dash rewrite. Do not reimplement those by hand. Do not fold contractions into
   the applicator. Pasted-text fix still follows the heading and dash rules below
   without Node.
2. **Delete outright**: vendor citation markup, AI UTM parameters (strip the parameter,
   keep the URL), footnote return arrows, prompt refusals, collaborative leakage,
   knowledge-cutoff disclaimers and the speculation attached to them.
3. **House style leftovers:** technical metaphors. Heading tree and title case are
   already done when the applicator ran.
4. **Replace with the plain form**: copula avoidance to `is`, `are`, `has`. Stiff
   synonyms to plain verbs. AI vocabulary to ordinary words. Myth-bust leads: lead
   with the claim (quoted `"…" is not.` / `"…" isn't.`, closing unquoted `It isn't.`,
   and intervening `There's no` restatements). Do this **before** contractions so
   `is not.` is still visible to Grep; if contractions already ran, still Grep
   `isn't.` on the quoted closer.
5. **Contractions.** After judgment and copula, apply `missing-contraction` from
   `references/contractions.md`. Prefer a `* not` / `cannot` pair over an overlapping
   copula or modal, then longest expanded form. For `--file` run
   `node tests/contractions.cjs --file <path>`. Pasted text uses the same table.
   `--severity definitive` leaves contractions unfixed. **Do not** run the contraction
   rewriter in the same loop as the applicator.
6. **Cut the interpretive layer**: trailing participle analyses, significance
   inflation, symbolic gloss. State the fact and stop.
7. **Restructure locally**: inline-header lists into prose, classic negative
   parallelisms (3+) into direct statements. Remaining em dashes (Unicode U+2014
   with or without spaces, and ASCII ` -- `) only if the applicator left any: a
   comma, parentheses, a colon, or a new sentence. Prefer the smallest grammatical
   change. Leave U+2014 inside HTML comments.
   - Before: `The hours came out of a time log -- roughly four work-weeks.`
   - After: `The hours came out of a time log, roughly four work-weeks.`
   Do not wrap a paired aside in parentheses if the aside contains `.` `?` or `!`.
   Inner parentheses in the aside are allowed. Do not pair dashes that already sit
   inside parentheses. After a safe wrap, insert a comma if the following text
   starts a new clause, or if the left side is already an `if`/`when` clause and
   the next word is not a be-verb. Do not insert a comma before the predicate of the
   same clause (`makes`, `are`).
8. **Boldface-overuse:** unbold repeating paragraph-start field labels (`Build:`,
   `Playtest hypothesis:`, `Goal:`). Keep warning spans (`**Not shipped.**`,
   `**Do not copy…**`).
9. **Leave alone**: remaining corroborating detector signs; house style when
   `--severity definitive`; `---` that sits next to an ATX heading.

### Two prohibitions

**Never invent a fact.** Report unsupported claims under "Substance to check".

**Never strip the sign and leave the problem.** If a promotional adjective is hiding the
absence of a concrete fact, say so in the report.

### Placeholder text

Placeholders are `definitive` and must never be silently filled.

### Applying edits

With `--file`, the required sequence is:

1. `node scripts/applyFileFix.cjs --file <path>` (headings and dashes only)
2. Judgment, including myth-bust (quoted closer, closing `It isn't.`, intervening
   `There's no`), copula, bold, and remaining detectors
3. `node tests/contractions.cjs --file <path>`

Do not run the contraction rewriter in the same loop as the applicator. Do not create
backups. Do not commit. With pasted text, return the corrected text. After editing,
re-run `node tests/runTests.cjs` from this skill folder, then Grep the target for
leftover U+2014 outside HTML comments. Findings at or above the threshold should be
zero, and a second `fix` run should change nothing.

## The AI vocabulary aggregate rule

Report vocabulary once per document. Density below 2 per 1000 words: do not report.
2 to 5: corroborating. Above 5, or 3+ distinct words from one era-set: strong.

| Era | Words |
| :--- | :--- |
| 2023 to mid-2024 | Additionally, boasts, bolstered, crucial, delve, emphasizing, enduring, garner, intricate, intricacies, interplay, key, landscape, meticulous, pivotal, underscore, tapestry, testament, valuable, vibrant |
| Mid-2024 to mid-2025 | align with, bolstered, crucial, emphasizing, enhance, enduring, fostering, highlighting, pivotal, showcasing, underscore, vibrant |
| Mid-2025 onward | emphasizing, enhance, highlighting, showcasing |
| Grok | causal, empirical, correlate, underscore |

False positives: `landscape` for scenery, `realm` in fantasy, `underscore` as a mark.

---

## Worked example

### Before

> Nestled in the heart of the valley, Ashcombe stands as a testament to the enduring
> legacy of rural craft, boasting a vibrant tradition of weaving that underscores its
> importance to the region. Experts argue that the mill played a pivotal role in the
> local economy. Despite its success, the village faces several challenges typical of
> rural areas. citeturn0search3

### Audit

```text
Definitive 1 | Strong 5 | Corroborating 1
House style 0
Verdict: AI tooling confirmed in this text
```

vendor-citation-markup (definitive, ChatGPT), significance-inflation, promotional-tone,
vague-attribution, formulaic-challenges, ai-vocabulary clustering in the 2023 era-set,
copula-avoidance. The passage is 58 words, too short for a meaningful density figure, so
report the matched words rather than a rate.

### After `fix --severity strong`

> Ashcombe is a village in the valley with a tradition of weaving.

That is all the original actually asserts.

**Substance to check.**

- "Experts argue" was cut, not rewritten. No source was named.
- The mill's existence, dates, output and workforce are unstated.
- "Faces several challenges" names no challenge.

No founding date or employment figure appears in the corrected text, because none
appeared in the original.

---

*Signs are evidence, not verdicts. House style is not a verdict. Weak detector signs
stay weak no matter how many you count.*
