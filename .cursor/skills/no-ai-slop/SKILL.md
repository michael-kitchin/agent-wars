---
name: no-ai-slop
description: Audits prose and Markdown for the writing patterns characteristic of LLM output, then corrects them. Detects 39 signs across content, language, style, chatbot leakage and vendor markup, each tiered as definitive, strong or corroborating. Use when checking a document or pasted text for AI tells before publishing, or when asked to clean AI tells out of a file. Includes an explicit do-not-flag list so ordinary human writing is not reported. Pure Markdown, no dependencies, no network calls.
---

# No AI Slop

Find the writing and formatting patterns that mark text as LLM-generated, and correct
them without hiding the real problem underneath.

```text
no-ai-slop "your text" [--file path/to/file.md] [--mode audit|fix]
                 [--severity definitive|strong|corroborating]
                 [--context markdown|plaintext]
```

Adapted from [Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing),
a field guide maintained by WikiProject AI Cleanup. Scope here is general prose and
Markdown. Wikipedia-specific material (wikitext, templates, categories, citation
checksums, edit summaries) is deliberately excluded.

## When to use this skill

- Checking a draft for AI tells before publishing it
- Auditing a file someone else wrote when authorship is in question
- Cleaning chatbot artifacts out of text that was pasted from a tool
- Deciding whether a suspicion of AI authorship is actually supported by evidence

## Three rules that override everything else

**1. Corroborating signs are not evidence.** Never state or imply that text is
AI-generated on the strength of `corroborating` findings alone. Em dashes, curly quotes,
title case and triads are common in human writing. The source guide is emphatic that
these patterns are "potential signs of a problem, not the problem itself."

**2. Report the caveat with the finding.** Every sign has a documented false-positive
case. Include it in the report so the reader can dismiss a finding without having to
work out why it might be wrong. House style legitimately overrides many of these.

**3. Never launder a tell.** The source guide warns that fixing the surface sign "could
just make detection harder" while leaving the real problem in place. Where a sign points
at missing substance rather than surface style, report it and stop. Do not invent a fact
to replace a vague claim.

## Quick reference

### Modes

| Mode | Behaviour |
| :--- | :--- |
| `audit` | Scan and report. Changes nothing. Default. |
| `fix` | Apply corrections at or above the severity threshold, then report what changed. |

### Flags

| Flag | Effect |
| :--- | :--- |
| `--file` | Path to scan. Enables the deterministic Grep-driven pass. |
| `--severity` | Minimum tier `fix` will act on. Default `strong`. `audit` always reports all tiers. |
| `--context` | `markdown` or `plaintext`. Decides whether bold syntax is a formatting sign or a rendering failure. Defaults to inference from the file extension. |

### Severity tiers

| Tier | Meaning |
| :--- | :--- |
| `definitive` | Near-proof a tool was involved. Vendor markup, AI UTM parameters, unfilled placeholders, prompt refusals. |
| `strong` | Highly idiosyncratic to LLM output but not proof. |
| `corroborating` | Also common in human writing. Counts only in combination. |

### Verdict bands

| Condition | Verdict |
| :--- | :--- |
| Any `definitive` finding | AI tooling confirmed in this text |
| No `definitive`, 3 or more `strong` | Strong indication |
| No `definitive`, 1 to 2 `strong` | Some indication |
| Only `corroborating` findings | Inconclusive; not evidence of AI authorship on its own |
| No findings | No signs found |

Count **distinct signs, not individual matches**. Twelve em dashes are one corroborating
finding, not twelve. Getting this backwards inflates every verdict.

Do not compute a numeric score. Density of tells is not measurable to two significant
figures, and a fabricated percentage invites more confidence than the evidence supports.

---

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
  ask rather than guess, because the answer changes whether two signs fire at all.

If the input is pasted text longer than roughly 400 words, ask the user to save it to a
file and re-run with `--file`. The mechanical pass is materially more reliable against a
file.

## Step 2: Mechanical pass

**With `--file`:** run each pattern below through the Grep tool against the file. This
is the deterministic path. Record the match count and line numbers for each hit.

**With pasted text:** the Grep tool cannot search a string, so apply the same patterns by
reading carefully. Label this section of the report `manually checked` rather than
`tool-verified`, so the reader knows the difference.

Patterns use Rust regex syntax. Two Windows details matter and are already handled:
`$`-anchored patterns use `\s*$` to absorb the carriage return on CRLF files, and
multiline patterns use `[\r\n]+` rather than `\n+`. Changing either back will make the
pattern silently return zero.

### Patterns

Format is `slug`, then flags, then the pattern. `-i` means case-insensitive, `-U` means
multiline.

```text
significance-inflation           -i   (?i)\b(stands as|serves as|is a testament|a testament to|pivotal (moment|role)|crucial role|vital role|key turning point|underscor(es|ing) (its|the) (importance|significance)|reflects broader|evolving landscape|indelible mark|deeply rooted|setting the stage for|represents a shift|marks a shift)\b
canned-notability                -i   (?i)\b(independent coverage|active social media presence|maintains an active (social media |digital |online )?presence|(cited|featured|profiled) in (multiple|several|various|numerous|prominent|leading|major|top|widely-read)|other (prominent |major )?media outlets|(local|regional|national|trade) (media )?(outlets|publications))\b
superficial-ing-analysis         -i   (?i), (highlighting|underscoring|emphasizing|ensuring|reflecting|symbolizing|contributing to|cultivating|fostering|encompassing|showcasing|enhancing|demonstrating|illustrating)\b
promotional-tone                 -i   (?i)\b(boasts a|nestled (in|within|among)|in the heart of|rich (cultural|history|heritage|tapestry)|natural beauty|breathtaking|must-visit|world-class|state-of-the-art|cutting-edge|diverse array|renowned for|commitment to (excellence|sustainability|quality))\b
vague-attribution                -i   (?i)\b(industry reports (suggest|indicate|show)|observers have (cited|noted)|experts (argue|believe|say|note)|some critics argue|it is widely (believed|regarded|interpreted)|research suggests|scholars (argue|note)|analysts note|is described in scholarship)\b
formulaic-challenges             -i   (?i)(despite (its|these|their) [^.]{0,60}(challenges|success|prosperity|promise)|faces (several|numerous|various|many) challenges|challenges and (legacy|future|opportunities)|future (outlook|prospects|directions)|looking ahead|the road ahead)
definitional-opener                   ^["']?[A-Z][^.\n]{2,60}["']? refers to \b
paired-noun-header               -i   (?i)^#{1,6}\s+(awards and recognition|recognition|challenges and \w+|impact and \w+|legacy and \w+)\s*$
ai-vocabulary                    -i   (?i)\b(additionally|boasts|bolstered|crucial|delve|delves|delving|emphasizing|enduring|garner|garnered|intricate|intricacies|interplay|landscape|meticulous|meticulously|pivotal|underscore|underscores|underscoring|tapestry|testament|valuable|vibrant|aligns? with|enhances?|enhancing|fosters?|fostering|highlighting|showcases?|showcasing|robust|leverages?|multifaceted|realm|notably|moreover|furthermore)\b
copula-avoidance                 -i   (?i)\b(serves as|stands as|functions as|operates as|marks the|represents a|boasts|features a|maintains a|offers a)\b
vague-connection                 -i   (?i)\b(in connection with|in association with|associated with|connected with)\b
negative-parallelism             -i   (?i)(not only\b[^.]{1,80}\bbut\b|it's not (just|merely)\b[^.]{1,80}, it's|isn't (just|merely)\b[^.]{1,80}, it's|not\b[^.]{1,60}, but rather\b)
title-case-headings                   ^#{1,6} [A-Z][a-z]+( (([A-Z][a-z]+)|of|and|the|in|for|to|a|an|or|on|with|at|by))* [A-Z][a-z]+\s*$
empty-parent-heading             -U   (?m)^#{1,5} [^\n]+[\r\n]+#{2,6} 
boldface-overuse                      \*\*[^*\n]{1,60}\*\*
inline-header-list                    (?m)^ *([-*+]|\d+\.) +\*\*[^*\n]{1,60}\*\* *:|^ *([-*+]|\d+\.) +\*\*[^*\n]{1,60}:\*\*
em-dash-spaced                        \s\x{2014}\s
em-dash-any                           \x{2014}
emoji-formatting                      (?m)^\s*(#{1,6} |[-*+] )[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]
curly-quotes                          [\x{201C}\x{201D}\x{2018}\x{2019}]
level-one-heading-overuse             (?m)^# \S
thematic-break-between-sections       (?m)^(---|\*\*\*|___|----)\s*$
collaborative-leakage            -i   (?i)(i hope this helps|of course!|certainly!|you're absolutely right|would you like me to|is there anything else|let me know if you|here's a template|in this article,? we will explore|let me walk you through|i hope this message finds you well)
knowledge-cutoff-disclaimer      -i   (?i)(as of my last (knowledge )?(update|training)|up to my last training update|while specific (details|information)[^.]{0,60}(are|is) (limited|scarce|not)|not (widely|extensively) (documented|available|disclosed)|in the (provided|available) (sources|search results)|based on available information|maintains a low profile|keeps (his|her|their) personal (details|life) private)
placeholder-text                      (\[(Your Name|Recipient|Topic|Insert[^\]]*|INSERT[^\]]*|Describe[^\]]*|Add [^\]]*|Link[^\]]*)\]|INSERT_[A-Z_]+|PASTE_[A-Z_]+|SOURCE_PUBLISHER|\b\d{4}-XX-XX\b|\b\d{4}-\d{2}-XX\b|\(Add your [^)]+ here\))
vendor-citation-markup                (contentReference\[oaicite:|oai_citation|turn\d+(search|image|news|file)\d+|attributableIndex|\[cite: ?\d+|\[span_\d+\]\((start|end)_span\)|grok_card|grok_render_citation_card_json|\x{3010}\d+\x{2020}L\d+|\[attached_file:\d+\]|\[web:\d+\]|ppl-ai-file-upload|::: ?writing\{variant=)
ai-utm-parameter                      (utm_source=(chatgpt\.com|openai|copilot\.com)|referrer=grok\.com)
footnote-return-arrow                 \x{21A9}
markdown-bleeding                     \*\*[^*\n]+\*\*
section-summary                  -i   (?i)\b(in summary|in conclusion|overall),
didactic-disclaimer              -i   (?i)(it's (important|crucial|essential|critical|worth) (to )?(note|noting|remember|remembering|consider)|it is (important|crucial|essential) to note|worth noting that|please note that)
prompt-refusal                   -i   (?i)(as an ai language model|as a large language model|i'm sorry,? but as an ai|i cannot (offer|provide) (medical|legal|financial) advice)
```

`boldface-overuse` and `markdown-bleeding` match nearly the same thing, and exactly one
of them applies. Under `--context markdown`, bold renders, so report `boldface-overuse`
only. Under `--context plaintext`, bold does not render, so report `markdown-bleeding`
only. Never report both; that double-counts one piece of evidence.

### Severity, thresholds and confirmation

A match is a candidate, not a finding. Apply the confirmation rule before reporting.

| Slug | Severity | Confirm before reporting |
| :--- | :--- | :--- |
| `significance-inflation` | strong | The clause adds interpretation rather than fact. Editorials use this framing too. |
| `canned-notability` | strong | Focus is on the character of the sources rather than what they said. |
| `superficial-ing-analysis` | strong | The trailing participle interprets rather than informs. Ordinary participles are fine. |
| `promotional-tone` | strong | Adjectives are standing in for facts. Not all promotional writing is AI. |
| `vague-attribution` | strong | The authority is unnamed, or one source is presented as many. |
| `formulaic-challenges` | strong | It is the rigid formula, not the mention of difficulty. Specific problems with dates are fine. |
| `definitional-opener` | corroborating | The subject matches the document title and is a thing, not a term. |
| `paired-noun-header` | corroborating | Weak alone. Counts only alongside other signs. |
| `ai-vocabulary` | by density | The only sign whose tier is not fixed. The aggregate rule below sets it to `corroborating` or `strong`. Never report per hit. |
| `copula-avoidance` | corroborating | A plain `is`, `are` or `has` would carry the sentence. Past perfect `has been featured` does not count. |
| `vague-connection` | corroborating | Only in abundance. Indirection alone proves nothing. |
| `negative-parallelism` | strong | Three or more in one document is the real signal. Common in human myth-busting pieces. |
| `title-case-headings` | corroborating | The destination's house style does not mandate title case. |
| `empty-parent-heading` | corroborating | The second heading is genuinely deeper, and this is not a contents page. |
| `boldface-overuse` | corroborating | Density, not presence. Report above roughly 6 bold spans per 1000 words. Under `--context plaintext` suppress it entirely; the same characters are reported as `markdown-bleeding` instead. |
| `inline-header-list` | strong | Bold label plus colon used as the dominant list form. |
| `em-dash-spaced` | corroborating | Weak. A July 2026 study found only Claude exceeds professional writers; ChatGPT now uses fewer. |
| `em-dash-any` | corroborating | Weaker still. Report only as context for the spaced count. |
| `emoji-formatting` | strong | Emoji decorating headings or bullets, not emoji in running prose. |
| `curly-quotes` | corroborating | Word, macOS, Chicago style and LanguageTool all produce these. Gemini and Claude typically do not. |
| `level-one-heading-overuse` | corroborating | Only a finding when the count exceeds one. |
| `thematic-break-between-sections` | corroborating | Only when breaks appear between most sections rather than occasionally. |
| `collaborative-leakage` | definitive | The text addresses the operator rather than the reader, and is not a deliberate quotation. |
| `knowledge-cutoff-disclaimer` | definitive | Report the whole speculative passage, since the claim that something is undocumented is itself invented. |
| `placeholder-text` | definitive | Not part of a known legitimate boilerplate template. |
| `vendor-citation-markup` | definitive | Effectively no legitimate cause. Name the vendor in the finding. |
| `ai-utm-parameter` | definitive | Proves a tool was involved, not that it wrote the prose. |
| `footnote-return-arrow` | strong | Some legitimate footnote systems use the same character. |
| `markdown-bleeding` | strong | Only when `--context plaintext`. Suppress entirely under `--context markdown`. |
| `section-summary` | strong | A closing restatement that adds nothing. Legitimate in genuinely long documents. |
| `didactic-disclaimer` | strong | Advice addressed to an imagined reader. |
| `prompt-refusal` | definitive | Unambiguous. Report immediately. |

### The AI vocabulary aggregate rule

Report vocabulary once per document, never once per hit. A per-hit report flags every
instance of a common word and buries everything else.

Count the matches, count the document's words, and compute occurrences per 1000 words.

| Density | Treatment |
| :--- | :--- |
| Below 2 per 1000 | Do not report |
| 2 to 5 per 1000 | Report as `corroborating` |
| Above 5 per 1000, or 3+ distinct words from one era-set | Report as `strong` |

Say which era-set the matches cluster in, because the overused set has moved.

| Era | Words |
| :--- | :--- |
| 2023 to mid-2024 | Additionally, boasts, bolstered, crucial, delve, emphasizing, enduring, garner, intricate, intricacies, interplay, key, landscape, meticulous, pivotal, underscore, tapestry, testament, valuable, vibrant |
| Mid-2024 to mid-2025 | align with, bolstered, crucial, emphasizing, enhance, enduring, fostering, highlighting, pivotal, showcasing, underscore, vibrant |
| Mid-2025 onward | emphasizing, enhance, highlighting, showcasing |
| Grok | causal, empirical, correlate, underscore |

Matches in the later sets say more about current tooling. A cluster of `delve` and
`tapestry` suggests 2023-era output or a human who reads a lot of it.

These sets describe behaviour observed up to the source guide's 2026 revision. The
vocabulary keeps drifting, so treat an era label as a dated observation rather than a
fixed fact, and weight a word the reader recognises as current over one this table calls
recent.

Known false positives in this pattern: `landscape` for actual scenery, `realm` in
fantasy writing, and `underscore` meaning a typographic mark or incidental music.

## Step 3: Judgment pass

These cannot be found by pattern. Read for them.

**`rule-of-three`** — corroborating.
Forced triads: three adjectives, or three short parallel phrases, especially abstract
ones. Used to make thin analysis look comprehensive.
Distinguish: triads are a standard rhetorical device. The sign is a triad whose third
item adds nothing, or a document where nearly every list has exactly three items.
Fix: use the natural number. Two is fine. Four is fine.
> AI: innovation, inspiration, and industry insights
> Human: talks and panels, plus time for networking

**`unnecessary-table`** — corroborating.
A two or three row table carrying material that is not tabular.
Distinguish: tables are usually correct. The sign is a table whose rows are a sentence
each, or a comparison table with one meaningful column.
Fix: write it as a sentence.

**`register-shift`** — corroborating.
One passage in polished formal prose beside casual text with errors, or the reverse.
Distinguish: writers code-switch between venues legitimately, and multi-author documents
mix registers naturally. Only counts when the shift is dramatic and unexplained.
Fix: rewrite the outlier to match the author's established voice.
> AI: yeah so the bug is in line 42 lol. The aforementioned implementation exhibits suboptimal performance characteristics.
> Human: yeah so the bug is in line 42. The loop allocates on every iteration instead of reusing the buffer.

**`english-variety-mismatch`** — corroborating.
American spelling in text whose author and subject are not American, or both varieties
inside one document.
Distinguish: non-native speakers mix varieties routinely without AI involvement.
Fix: pick one variety and apply it throughout.

**`abrupt-cutoff`** — strong.
Text stopping mid-sentence with no closing.
Distinguish: also caused by a malformed copy-paste, and sometimes signals a copyright
violation rather than AI. Do not assume.
Fix: flag for the author. Never invent the missing ending.

**`elegant-variation`** — corroborating.
The same referent named three or more ways in a paragraph, each more elaborate than the
last, because the model is avoiding repetition.
Distinguish: some schooling teaches avoiding repetition explicitly. Does not apply when
passages were written separately.
Fix: pick the clearest term and repeat it. Humans repeat words.
> AI: Yankilevsky, alongside other non-conformist artists, faced obstacles. The visionary creator's distinctive artistic journey continued.
> Human: Yankilevsky and other non-conformist artists faced obstacles. His work continued.

## Step 4: Structural pass

Single document only. Describe the document's skeleton in one line, then test it against
the formulaic shapes below.

Do not compare against other documents. Repeating one skeleton across a body of work is a
real and separate tell, often the dominant one, because a model working from a style guide
converges on a default shape that each individual piece passes on its own. Catching it
means comparing this draft's opening move, list usage, recurring slots and closer against
the last few pieces actually published, which this skill never sees. The remedy is one or
two visible restructures rather than a rewrite: enumerated block into prose, answer first
instead of setup, or a recurring closer dropped. Defer to a dedicated draft-review pass if
one exists.

**`duplicated-title-heading`** — corroborating.
A heading repeating the document or file title, placed above all content, because the
model did not know a title already existed.
Distinguish: legitimate wherever the title is not rendered separately.

**`skipped-heading-level`** — corroborating.
Heading levels jumping, such as a level 1 straight to a level 3.
Distinguish: a common human error in hand-written Markdown. Very weak alone.

**Formulaic skeletons.** Flag the document shape itself when it matches one of these:

- Introduction, then parallel topic sections, then a "Challenges" section, then a
  "Future outlook" or "Conclusion" section. This is the single most recognisable
  LLM article shape.
- Every section closing with a restatement of its own opening.
- Headings that contain only other headings, with no prose between.
- Inline-header vertical lists used as the dominant structure rather than prose.
- Sections of near-identical length and internal shape, each self-contained.

Report the skeleton as one finding, `strong` when two or more shapes match, otherwise
`corroborating`. Fixing it means restructuring, so report rather than rewrite unless
explicitly asked.

## Step 5: Guards

Run both lists against the draft findings before writing the report. Drop anything that
survives only on the strength of an entry in the first list.

### Do not flag

The source guide classifies these as ineffective indicators. They are not evidence, and
several point the other way.

| Non-indicator | Why it fails |
| :--- | :--- |
| Perfect grammar | Many writers are skilled or professionally trained |
| Mixed casual and formal register | Indicates technical writing, youth, playfulness, neurodivergence, or multiple authors |
| Bland or robotic prose | LLM output skews positive and verbose, which readers do not perceive as robotic |
| Fancy, academic or formal prose | Only specific overused words correlate, not formality itself |
| Transition words in isolation | Only a few are actually overused, and essay convention accepts them |
| Unsourced content | Most uncited text predates LLMs, and modern models often do add citations |
| Bizarre or broken markup | More often browser extensions or editor bugs |
| Correct markup | Visual editors make correct formatting normal |
| Detector-tool scores | Non-trivial error rates, defeated by paraphrasing |

### Documents that discuss AI writing

A document that quotes the tells will match the patterns for them. Style guides,
editorial checklists, training material and this skill itself all light up heavily and
none of it means anything.

Before reporting, check whether each match sits inside a quotation, an example, a word
list or a code block. If the document's subject is AI writing, say so at the top of the
report and audit only the running prose. A catalog of the words to watch is not evidence
that a machine wrote the catalog.

### Signs of human writing

Never report these as problems. Their presence should soften the verdict.

| Signal | Detail |
| :--- | :--- |
| Simple copulas | `there is a`, `it has a` |
| Plain verbs over stiff synonyms | `wrote` not `authored`, `moved` not `relocated`, `used` not `utilized`, `tried` not `attempted`, `died` not `passed away` |
| Superlative or definitive statements | `one of the best`, `is the only`, `was the first` |
| Hedging qualifiers and intensifiers | `very`, `perhaps`, `tends to` |
| Wordy constructions | `as a result of`, `in order to`, `all of the`, `a part of`, `the fact that` |
| Age | Text written before 30 November 2022 predates public ChatGPT |

The last three rows matter more than they look. Stripping hedging and wordy
constructions to make text "tighter" removes evidence of human authorship and makes the
result read more like a machine, not less. Do not do it, and do not recommend it.

## Step 6: Report

```text
## No AI slop: <path, or "supplied text">

Definitive 2 | Strong 5 | Corroborating 11
Verdict: <band from the table above>
Mechanical pass: tool-verified | manually checked
Context: markdown | plaintext

| Sign | Severity | Where | Excerpt | Caveat | Fix |
|------|----------|-------|---------|--------|-----|
| vendor-citation-markup | definitive | L42 | "...centre. turn0search1" | none; effectively no legitimate cause | Delete the markup |
| ai-vocabulary | strong | 14 hits, 8.2 per 1000 words | delve, tapestry, pivotal | literal uses of landscape and realm | Replace or cut |
| em-dash-spaced | corroborating | L7, L19 | "the scheme — over objections —" | house style may permit; ChatGPT now uses fewer | none by default |

### Substance to check
<findings that point at missing facts rather than surface style>

### Not flagged
<anything considered and dismissed, with the reason, when the reader might expect it>
```

The "Substance to check" section is required whenever a finding points at a claim that
may not be supported. The "Not flagged" section is required whenever a well-known tell
was present but deliberately dismissed, so the reader knows it was considered.

## Step 7: Fix mode

Act only on findings at or above `--severity`, default `strong`. Corroborating findings
are reported and left alone, which is what keeps deliberate house style from being
quietly edited away.

Apply in this order. Mechanical removals first, because they are unambiguous and shrink
the text before judgment work begins.

1. **Delete outright**: vendor citation markup, AI UTM parameters (strip the parameter,
   keep the URL), footnote return arrows, prompt refusals, collaborative leakage,
   knowledge-cutoff disclaimers and the speculation attached to them.
2. **Replace with the plain form**: copula avoidance to `is`, `are`, `has`. Stiff
   synonyms to plain verbs. AI vocabulary to ordinary words, or cut where the word was
   carrying no meaning.
3. **Cut the interpretive layer**: trailing participle analyses, significance inflation,
   symbolic gloss. State the fact and stop.
4. **Restructure locally**: inline-header lists into prose, negative parallelisms into
   direct statements, formulaic challenge sections into specific problems with dates.
5. **Leave alone**: everything below the severity threshold.

### Two prohibitions

**Never invent a fact.** Where a vague attribution, an unsupported significance claim or
a suspiciously precise detail needs a real source or a real specific, report it under
"Substance to check" and leave the text as it is. Replacing "experts argue" with a
plausible-sounding named expert is a worse outcome than leaving the weasel wording in
place.

**Never strip the sign and leave the problem.** If a promotional adjective is hiding the
absence of a concrete fact, deleting the adjective produces a shorter sentence that is
still empty. Say so in the report.

### Placeholder text

Placeholders are `definitive` and must never be silently filled. Report each one and ask
the author for the real value.

### Applying edits

With `--file`, edit in place with targeted string replacements rather than rewriting the
whole document. Preserve everything already in the author's voice. Review happens through
the `git` diff, so do not create backup copies and do not commit anything.

With pasted text, return the corrected text in the reply.

After editing, re-run the mechanical pass. Findings at or above the threshold should be
zero, and a second `fix` run should change nothing. Report both results.

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
Verdict: AI tooling confirmed in this text
```

vendor-citation-markup (definitive, ChatGPT), significance-inflation, promotional-tone,
vague-attribution, formulaic-challenges, ai-vocabulary clustering in the 2023 era-set,
copula-avoidance. The passage is 58 words, too short for a meaningful density figure, so
report the matched words rather than a rate.

### After `fix --severity strong`

> Ashcombe is a village in the valley with a tradition of weaving.

That is all the original actually asserts. Everything else was adjective, gloss or
attribution to nobody, and the fix has nothing to replace it with.

**Substance to check.** This is the important half of the report, and it is longer than
the corrected text on purpose.

- "Experts argue that the mill played a pivotal role in the local economy" was cut, not
  rewritten. No source was named. Supplying a plausible economist here would be a worse
  outcome than the weasel wording.
- The mill's existence, dates, output and workforce are all unstated. The original
  implied a substantial history without asserting a single verifiable fact about it.
- "Faces several challenges typical of rural areas" names no challenge. If there are
  real ones, state them with dates and figures; otherwise drop the sentence.

Note what did **not** happen: no founding date, employment figure or closure year appears
in the corrected text, because none appeared in the original. A fix that reads better by
inventing specifics is the failure mode this skill exists to prevent.

---

*Signs are evidence, not verdicts. Weak signs stay weak no matter how many you count.*
