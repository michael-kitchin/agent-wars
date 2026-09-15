# English Variety

Judgment sign `english-variety-mismatch`, corroborating. Not an authorship verdict on
its own. Grep both columns in running prose. Skip YAML, fenced and inline code, HTML
comments, IMAGE/DATA placeholder lines, mapping-only list items (`- catalog ->
catalogue`), and markdown blockquotes (`>`). Quoted prompts are not the author's
variety. If the document's subject is this skill or this pair table, skip the mapping
itself.

Report when both US and UK forms appear, or when UK forms appear, US forms do not,
and distinct UK pairs are fewer than three (stray British spelling; default US).
Three or more distinct UK pairs and no US is a consistent British document; leave
it. Fix: rewrite the minority forms to the majority variety. Empty US and fewer
than three UK pairs means majority is US. When counts otherwise tie, pick US.

Format of the fence: `us | uk`.

## Pairs

```text
behavior | behaviour
canceled | cancelled
catalog | catalogue
center | centre
color | colour
defense | defence
favor | favour
favorite | favourite
honor | honour
labeled | labelled
organize | organise
organized | organised
```
