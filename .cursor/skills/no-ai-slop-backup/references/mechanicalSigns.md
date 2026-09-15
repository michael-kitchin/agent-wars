# Mechanical signs

Canonical ripgrep patterns and the severity table for the no-ai-slop skill. This file
lives at `references/mechanicalSigns.md` inside the skill folder. The agent Grep pass in
SKILL.md Step 2 uses this file, resolved from the skill directory, not the workspace
root. The test runner parses the Patterns fence below, so changing a regex here is what
the suite verifies. JavaScript tests translate `(?i)` / `(?m)` into flags, `\x{HHHH}`
into `\uHHHH` or `\u{HHHHH}`, and `-U` into multiline; they do not spawn ripgrep.

Heading-tree promotion, title case, and metaphor guards are algorithms in SKILL.md, not
rows in this catalog. `missing-contraction` is in the catalog; its pair table and
Guards live in `references/contractions.md` and SKILL.md.

## Patterns

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
myth-bust-lead                   -iU  (?i)((is not|isn't|wasn't|am not claiming) [^.!?\n]{2,80}[.!][ \t]+(It['\x{2019}]s|It isn['\x{2019}]t|I['\x{2019}]m)\b|(is not|isn't|wasn't) [^.!?\n]{2,80}; it['\x{2019}]s\b|(there['\x{2019}]s no|there is no) [^.!?\n]{2,80}[.!][ \t]+(It['\x{2019}]s|It isn['\x{2019}]t|I['\x{2019}]m|The real|That['\x{2019}]s)\b|["'][^"'\n]{2,80}["'][ \t]+(is not|isn['\x{2019}]t)\.\s*$)
empty-parent-heading             -U   (?m)^#{1,5} [^\n]+[\r\n]+#{2,6} 
boldface-overuse                      \*\*[^*\n]{1,60}\*\*
inline-header-list                    (?m)^ *([-*+]|\d+\.) +\*\*[^*\n]{1,60}\*\* *:|^ *([-*+]|\d+\.) +\*\*[^*\n]{1,60}:\*\*
em-dash-spaced                        \s\x{2014}\s
em-dash-any                           \x{2014}
em-dash-ascii                         \s--\s
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
vague-tech-metaphor              -i   (?i)\b(holes?|seams?|threads?|shapes?|shaped|shaping)\b
missing-contraction              -i   (?i)\b(there would|where would|should not|that would|there have|there will|they would|could not|how would|she would|that have|that will|there had|there has|they have|they will|what have|what will|who would|would not|you would|does not|have not|he would|it would|must not|she will|that had|that has|there is|they are|they had|we would|were not|what had|what has|where is|who have|who will|will not|you have|you will|are not|can not|did not|had not|has not|he will|here is|I would|it will|she had|she has|that is|was not|we have|we will|what is|who had|who has|you are|you had|cannot|do not|he had|he has|how is|I have|I will|is not|it had|it has|let us|she is|we are|we had|who is|he is|I had|it is|I am)\b
```

`boldface-overuse` and `markdown-bleeding` match nearly the same thing, and exactly one
of them applies. Under `--context markdown`, bold renders, so report `boldface-overuse`
only. Under `--context plaintext`, bold does not render, so report `markdown-bleeding`
only. Never report both; that double-counts one piece of evidence.

Report `em-dash-spaced`, `em-dash-any`, and `em-dash-ascii` as one distinct sign named
`em-dash`. Twenty dashes are one finding.

`vague-tech-metaphor` is house style: always listed, rewritten in default fix, never
counted in the authorship verdict. Apply the Guards in SKILL.md before reporting.

`missing-contraction` is house style: always listed, rewritten in default fix, never
counted in the authorship verdict. Apply the Guards in SKILL.md and the pair table
in `references/contractions.md` before reporting.

`myth-bust-lead` is authorship, strong, and one instance is enough. The second clause
may start with `It's`, `It isn't`, or `I'm`. For `There's no` / `There is no`, it may
also start with `The real` or `That's`. A sentence that is only a quoted span plus
`is not.` / `isn't.` is the same move. Closing unquoted `It isn't.` and a restatement
after an intervening sentence stay judgment-only.

## Severity, thresholds and confirmation

A match is a candidate, not a finding. Apply the confirmation rule before reporting.

| Slug | Severity | Verdict | Confirm before reporting |
| :--- | :--- | :--- | :--- |
| `significance-inflation` | strong | yes | The clause adds interpretation rather than fact. Editorials use this framing too. |
| `canned-notability` | strong | yes | Focus is on the character of the sources rather than what they said. |
| `superficial-ing-analysis` | strong | yes | The trailing participle interprets rather than informs. Ordinary participles are fine. |
| `promotional-tone` | strong | yes | Adjectives are standing in for facts. Not all promotional writing is AI. |
| `vague-attribution` | strong | yes | The authority is unnamed, or one source is presented as many. |
| `formulaic-challenges` | strong | yes | It is the rigid formula, not the mention of difficulty. Specific problems with dates are fine. |
| `definitional-opener` | corroborating | yes | The subject matches the document title and is a thing, not a term. |
| `paired-noun-header` | corroborating | yes | Weak alone. Counts only alongside other signs. |
| `ai-vocabulary` | by density | yes | The only sign whose tier is not fixed. The aggregate rule in SKILL.md sets it to `corroborating` or `strong`. Never report per hit. |
| `copula-avoidance` | corroborating | yes | A plain `is`, `are` or `has` would carry the sentence. Past perfect `has been featured` does not count. |
| `vague-connection` | corroborating | yes | Only in abundance. Indirection alone proves nothing. |
| `negative-parallelism` | strong | yes | Three or more `not only/but` or `it's not just X, it's` in one document. One hit is not enough. |
| `myth-bust-lead` | strong | yes | One instance is enough. The second clause restates the same point as a positive, or `It isn't` denies the first. Adjacent `There's no X. The real…` / `That's…` / `It's…` is the same move. A quoted `"…" is not.` / `"…" isn't.` at sentence end is the same move. Ordinary contrast that already leads with the claim (`This is a field report, not a review`) is exempt. A second sentence that adds a different fact (`The gate is not empty. It currently passes.` / `There's no evaluation harness yet. I can say how many lines exist.`) is exempt. Closing unquoted `It isn't.` and a restatement after an intervening sentence are judgment, not this regex. |
| `empty-parent-heading` | corroborating | yes | The second heading is genuinely deeper, and this is not a contents page. |
| `boldface-overuse` | corroborating | yes | Density, not presence. Report above roughly 6 bold spans per 1000 words. Under `--context plaintext` suppress it entirely. In `--mode fix`, unbold repeating paragraph-start field labels (`Build:`, `Playtest hypothesis:`, `Goal:`). Keep warning spans. |
| `inline-header-list` | strong | yes | Bold label plus colon used as the dominant list form. |
| `em-dash` | strong | yes | Unicode U+2014 or ASCII ` -- `. Do not match `---`, `--file` / `--severity` / `--mode`, table separator rows, `2300-2600`, or HTML comments. A document whose only strong sign is em dashes verdicts as "Some indication". |
| `emoji-formatting` | strong | yes | Emoji decorating headings or bullets, not emoji in running prose. |
| `curly-quotes` | corroborating | yes | Word, macOS, Chicago style and LanguageTool all produce these. Gemini and Claude typically do not. |
| `level-one-heading-overuse` | corroborating | yes | Only a finding when the count exceeds one. |
| `thematic-break-between-sections` | corroborating | yes | Only when breaks pad heading-less sections rather than sitting next to ATX headings. `---` immediately before or after `#` through `######` is a markdown section rule, not a finding. `--mode fix` may delete a doubled `---` pair; it must not strip heading-adjacent rules. |
| `collaborative-leakage` | definitive | yes | The text addresses the operator rather than the reader, and is not a deliberate quotation. |
| `knowledge-cutoff-disclaimer` | definitive | yes | Report the whole speculative passage, since the claim that something is undocumented is itself invented. |
| `placeholder-text` | definitive | yes | Not part of a known legitimate boilerplate template. |
| `vendor-citation-markup` | definitive | yes | Effectively no legitimate cause. Name the vendor in the finding. |
| `ai-utm-parameter` | definitive | yes | Proves a tool was involved, not that it wrote the prose. |
| `footnote-return-arrow` | strong | yes | Some legitimate footnote systems use the same character. |
| `markdown-bleeding` | strong | yes | Only when `--context plaintext`. Suppress entirely under `--context markdown`. |
| `section-summary` | strong | yes | A closing restatement that adds nothing. Legitimate in genuinely long documents. |
| `didactic-disclaimer` | strong | yes | Advice addressed to an imagined reader. |
| `prompt-refusal` | definitive | yes | Unambiguous. Report immediately. |
| `vague-tech-metaphor` | strong | no | Metaphor for structure, not a literal object. See SKILL.md Guards. |
| `missing-contraction` | strong | no | Expanded auxiliary that has a pair in `references/contractions.md`. See SKILL.md Guards. |
