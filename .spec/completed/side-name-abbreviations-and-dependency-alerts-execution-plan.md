
# Side-name abbreviations and dependency alerts

Audience: a lower-quality coding agent. Implement one phase at a time. Stop after each phase and report the files touched, the commands run, and their results. Wait for the human before the next phase. If a phase fails, revert only that phase and stop. If a line in this plan disagrees with the code, trust the code, stop, and report the discrepancy.

## Goal

Two independent tracks. Do the name track first.

1. A short side name that the current cut reduces to single-letter words, or that leaves an unclosed parenthesis, uses a letter form of the full name instead. A short form longer than the full name is not used. Those letter-form sides also gain that letter form, in parentheses, at the end of the stored full name. `East` stays `East`. Names that already abbreviate to something useful stay unchanged, both in spelling and in the short form.
2. Clear the open GitHub Dependabot alerts that a same-major npm update can clear. Leave Electron on 40.x. Do not take a major bump, and do not touch a package that has no patched release.

## Locked abbreviation rule

The short-name helpers move to [src/shared/shortSideName.ts](src/shared/shortSideName.ts). [src/shared/seatRoster.ts](src/shared/seatRoster.ts) re-exports `shortSideName` so existing imports keep working. `seatRoster.ts` is 487 lines, and the new helpers would push it past the desirable 600-line size.

`cutAtFirstSeparator` and `shortenLeadingCompass` keep today's behavior. Compass prefixes stay `Northern`, `Southern`, `Eastern`, `Western`, `Central`, `North`, `South`, `East`, `West`, longer words first.

Before either step, remove one trailing abbreviation parenthesis from the name. The suffix is a space, `(`, two or more ASCII capitals, and `)`. `South & east China, Taiwan (SECT)` and `South & east China, Taiwan` are the same body. A parenthesis that contains a comma, a space, or a lowercase letter stays, so `Tasman (Victoria, Tasmania, NZ)` is not stripped. Strip once, not in a loop.

A cut result is only single-letter words when, after splitting on whitespace and removing every non-letter from each token, at least one word remains and every remaining word is one letter. `S.` qualifies. `W. Turkey`, `S. America`, `NE Mexico`, and `Northwestern Italy` do not.

The cut also qualifies when it leaves an unclosed parenthesis, as in `Tasman (Victoria` from `Tasman (Victoria, Tasmania, NZ)`. That name's letter form is `TVTNZ`: Tasman, Victoria, Tasmania, and NZ.

When the cut result qualifies, scan the body from left to right, splitting on whitespace:

- A token with no letters is skipped (`&`, commas).
- Otherwise take the token's letters only, in lower case. It is a compass word when those letters are entirely consumed by the stems `central`, `north`, `south`, `east`, `west`, longest stem first, and the suffix `ern` may follow a stem. Each stem contributes one letter: central = C, north = N, south = S, east = E, west = W. So eastern = E, northwestern = NW, northeast = NE, and lowercase central = C.
- A token that is not a compass word contributes each of its ASCII capital letters, in order. `DR` contributes `DR`. A second `Congo` contributes another `C`.
- `and`, `the`, `of`, and `to` contribute nothing because they are not compass words and have no capitals.

Join those letters with no spaces and no periods. If that join is empty or one letter, return the body. `East` stays `East`, with no parenthesis added. If the chosen short form is longer than the body, return the body. No current side name hits that length check. `Levant & Cyprus` stays `Levant`, and `Southern Asia` stays `S. Asia`. Those are two names. `Levant` is shorter than `Levant & Cyprus`.

`shortSideName` is:

```typescript
export function shortSideName(displayName: string): string {
  const body = sideHomeNameKey(displayName);
  const shortened = shortenLeadingCompass(cutAtFirstSeparator(body));
  const candidate = isOnlySingleLetterWords(shortened) || hasUnclosedParenthesis(shortened)
    ? letterFormOrBody(body, shortened)
    : shortened;
  if (body.length > 0 && candidate.length > body.length) return body;
  return candidate;
}
```

`sideHomeNameKey` trims and removes that one trailing abbreviation parenthesis. Both the name with the parenthesis and the name without it return the same short name. The function does not write the parenthesis back onto the name.

Locked short names, for the body and for the body plus ` (LETTERS)`:

- `South & east China, Taiwan` → `SECT`
- `Southern & eastern Germany, Austria, Switzerland` → `SEGAS`
- `Northern & western Iran` → `NWI`
- `Southern & eastern Iran` → `SEI`
- `North & East India, Bangladesh, Nepal, Bhutan` → `NEIBNB` (North, East, India, Bangladesh, Nepal, Bhutan, in that order)
- `Central & western Mexico` → `CWM`
- `Central & northwestern Russia` → `CNWR`
- `Central & northern Brazil, Paraguay` → `CNBP`
- `Central & western Cameroon` → `CWC`
- `Northern & eastern Nigeria` → `NEN`
- `Northern & western DR Congo, Congo` → `NWDRCC`
- `Western & central Algeria` → `WCA`
- `East` → `East`
- `Tasman (Victoria, Tasmania, NZ)` → `TVTNZ`

Names that must stay on the old rule:

- `Western Turkey` → `W. Turkey`
- `Eastern Turkey & Caucasus` → `E. Turkey`
- `Levant & Cyprus` → `Levant`
- `Southern Asia` → `S. Asia`
- `Iraq & Kuwait` → `Iraq`
- `South America` → `S. America`
- `Western Europe` → `W. Europe`
- `Central America` → `C. America`
- `Iraq` → `Iraq`
- `Northwestern Italy` → `Northwestern Italy`
- `NE Mexico & the Bajio` → `NE Mexico`
- `Southern France` → `S. France`
- `''` → `''`

## Locked full-name rule

Append ` (LETTERS)` only to the names whose short name is a letter form of two or more letters. The parenthesis text is that short name. Do not append it to `East`. Do not append it to a name whose short name still contains a real word, including `W. Turkey`, `S. America`, `NE Mexico`, `NW Mexico`, and `Northwestern Italy`.

The stored full names become:

- `South & east China, Taiwan (SECT)` — group `south_east_china_taiwan`, pack `data/generated/regions/eastern_asia`
- `Southern & eastern Germany, Austria, Switzerland (SEGAS)` — group `southern_eastern_germany_austria_switzerland`, pack `western_europe`
- `Northern & western Iran (NWI)` — group `northern_western_iran`, pack `southern_asia_west`
- `Southern & eastern Iran (SEI)` — group `southern_eastern_iran`, pack `southern_asia_west`
- `North & East India, Bangladesh, Nepal, Bhutan (NEIBNB)` — group `north_east_india`, pack `southern_asia_east`
- `Central & western Mexico (CWM)` — group `central_western_mexico`, pack `central_america`
- `Central & northwestern Russia (CNWR)` — group `central_northwestern_russia`, pack `eastern_europe`
- `Central & northern Brazil, Paraguay (CNBP)` — group `central_northern_brazil_paraguay`, pack `south_america`
- `Central & western Cameroon (CWC)` — group `central_western_cameroon`, pack `middle_africa_north`
- `Northern & eastern Nigeria (NEN)` — group `northern_eastern_nigeria`, pack `west_africa_coast`
- `Northern & western DR Congo, Congo (NWDRCC)` — group `northern_western_dr_congo`, pack `middle_africa_south`
- `Western & central Algeria (WCA)` — group `western_central_algeria`, pack `maghreb`
- `Tasman (Victoria, Tasmania, NZ) (TVTNZ)` — group `tasman`, pack `australia_new_zealand`

`East` in `southern_africa`, group `east`, stays `East`. The origin unit named `East` in `northern_europe` (`id` `GB:East`) stays `East`. Global home names such as `Western Europe` and `Eastern Asia` are not side groups and stay as they are.

New matches copy `displayName` into `homeRegion` in `regionalHomeNames` in [src/main/gameDb/seatResolution.ts](src/main/gameDb/seatResolution.ts), so a new game stores the name with the parenthesis. The new-game dropdown, the top-bar full name, loss headers, and the commander prompt all show that stored string. The prompt builders already print `homeRegion`. Do not edit `doc/ai-commander-prompts/`.

Do not rewrite a saved match. A seat that already stores the name without the parenthesis must still load and must still resolve its home hexes. `assertStoredSideGroupsExist` in [src/main/gameDb.ts](src/main/gameDb.ts) and `getScenarioHomeRegionHexes` in [src/main/regionScenario.ts](src/main/regionScenario.ts) today require an exact `displayName` match. Change both to treat two names as the same home when their `sideHomeNameKey` values are equal, and still accept a match on `group.id`. An unknown name still fails the save check and still returns no hexes.

Do not run `npm run regional:economy` or `npm run regional:generate`. Those commands rewrite manifests and economies. Edit the letter-form `side_groups[].display_name` strings and the catalog strings only.

## Locked dependency rule

All 84 open alerts are npm Dependabot alerts on `package-lock.json`, marked development. There is no code scanning and no secret scanning. Do not add CodeQL, do not open issues, and do not push.

Direct versions to set in [package.json](package.json):

- `electron`: `^40.10.6` (installed today: 40.8.0; newest 40.x is 40.10.6). Never 41 or 42.
- `esbuild`: `^0.28.2` (installed today: 0.27.3). Never 0.29 or newer.

Then `npm update` these names only, so each copy stays inside the range its parent already declares. Do not add npm `overrides`. Do not run `npm audit fix` or `npm audit fix --force`. Do not hand-edit `package-lock.json`.

Expected versions after that update, from the registry on 26 Oct 2026. A newer patch inside the same major, or the same minor for esbuild, is acceptable. A new major is not.

- `@xmldom/xmldom` 0.8.15
- `@humanfs/node` 0.16.8
- `@tootallnate/once` 2.0.1
- `brace-expansion` 1.1.21, 2.1.7, and 5.0.12, each copy keeping its own major
- `flatted` 3.4.4
- `form-data` 4.0.6
- `ip-address` 10.7.5
- `js-yaml` 4.3.2
- `lodash` 4.18.1
- `picomatch` 4.0.7, and any 3.x copy stays 3.x
- `tar` 7.5.22 for every 7.x copy; every 6.x copy stays 6.x
- `tmp` 0.2.7

Leave these alone, even if `npm audit` still names them:

- `app-builder-lib` 25.1.8, because the fix is 26.x and that moves `electron-builder` off 25
- `builder-util-runtime` 9.2.10, because electron-builder 25 pins it
- `extract-zip` 2.0.1 and `http-cache-semantics` 4.2.0, because no patched release is listed
- any Electron advisory whose first fixed version is 41 or 42

## Working rules

- Shell is Windows PowerShell at `F:\Projects\Personal\agent-wars-public`. Run one command at a time. Do not chain with `&&`.
- Do not commit or push. Do not put phase numbers, this file's name, or words from these headings into code, comments, tests, lint text, or `doc/`.
- Keep each file's existing line endings. New files use CRLF. `shortSideName.ts` does not import a logger. The two main functions already log; do not add another log call.
- Orienting comments on every new or changed function: Purpose, When to use, Expected outcome, Exceptions. Match the comments already in `seatRoster.ts`.
- Tests cover the locked names, the save-load cases, and the guards listed above. Do not add tests for private helpers, log lines, or comment text.
- `npm test` builds, lints, checks names, and runs `dist/**/*.test.js`. It does not rebuild [static/renderer.js](static/renderer.js). Do not hand-edit that file.
- Named arguments stay at or below 6. Use `const` for values that are not reassigned.
- Leave `doc/release-notes/`, `doc/ai-commander-prompts/`, `doc/devleopment-plan-v3.4.md`, `doc/poc-analysis.md`, `doc/market-research.md`, and `.spec/completed/` alone. Do not edit files under `doc/media/`.
- [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) mentions Electron because `scripts/thirdPartyNotices/noticeCheck.cjs` checks direct dependencies plus Electron. `esbuild` is a devDependency and gets no notices section. Change only the Electron version sentence.

## Phase 1: Letter form for a single-initial short name

**Goal.** The letter forms and `East` match the locked table, with and without a trailing abbreviation parenthesis. Every guard name stays on the old rule.

**Read first.** `cutAtFirstSeparator`, `shortenLeadingCompass`, and `shortSideName` in [src/shared/seatRoster.ts](src/shared/seatRoster.ts), and the `shortSideName` test in [src/shared/seatRoster.test.ts](src/shared/seatRoster.test.ts).

**Behavior.** Move those three functions, the compass prefix table, `sideHomeNameKey`, and the new helpers into `src/shared/shortSideName.ts`. Re-export `shortSideName` from `seatRoster.ts`. Export `sideHomeNameKey` from `shortSideName.ts` only.

`sideHomeNameKey` trims, then removes one trailing ` ([A-Z]{2,})`. `isOnlySingleLetterWords` splits on whitespace, strips non-letters, and returns true only when one or more words remain and each is one letter. `lettersFromFullName` scans the body, not the unstripped input. Stems are checked longest first: `central`, `north`, `south`, `east`, `west`.

Update the comment on `shortSideName` so its expected outcome states the parenthesis strip, the cut, the compass initial, the letter-form fallback, and that one letter keeps the body with no parenthesis added.

**Tests.** In `describe('shortSideName')`, keep the existing assertions. Add the letter-form bodies, the same bodies with ` (LETTERS)` appended, `East`, `Tasman (Victoria, Tasmania, NZ)` → `TVTNZ`, and the guard names listed in the locked rule, including `''`.

**Doc.** In [doc/ux/top-bar.md](doc/ux/top-bar.md), after the sentence that introduces `shortSideName`, add: "That short name is the full home name cut at the first ` & `, `, `, or ` and `, with a leading compass word shortened to its initial and a period: `Western Turkey` is `W. Turkey`. When the cut name is only single-letter words, the chip uses the letter form of the full name instead: `South & east China, Taiwan` is `SECT`. When that letter form is still one letter, the chip keeps the full name: `East`. A trailing abbreviation in parentheses, such as ` (SECT)`, is not part of the short name."

In the turn-report bullet of [doc/how-to-play.md](doc/how-to-play.md), keep the `E. Turkey` and `W. Turkey` examples and add: "A short name that would otherwise be a single initial is the letter form of the full home name, so South & east China, Taiwan reads SECT, and East stays East."

In the hex-sentence paragraph of [doc/ux/notifications-and-feedback.md](doc/ux/notifications-and-feedback.md), keep the `N. Africa` example and add: "A name the ordinary cut would reduce to a single initial uses the letter form of the full home name, such as SECT. A trailing abbreviation in parentheses is left off that short name."

Search `doc/` for `shortSideName`. Update another sentence only when it says every short name is the cut form. Do not change examples that are still true.

**Verify.** `npm run build:main`, then `node dist/shared/seatRoster.test.js`. Then `npm run build:renderer`. Then `npm test`. This phase does not change catalog strings or zips.

## Phase 2: Store the parenthesis on the letter-form full names

**Goal.** Each stored letter-form full name ends with its letter form. `East` and every ordinary name stay spelled as they are. A saved home that uses the previous spelling still loads and still finds its hexes.

**Depends on Phase 1.** `sideHomeNameKey` must exist. Without it, a stored ` (SECT)` would be fed into the letter scan and the short name would double.

**Catalog.** In [scripts/regional_pipeline/side_group_catalog.py](scripts/regional_pipeline/side_group_catalog.py), replace every exact copy of each previous letter-form spelling with the new name. A group id has several `_rule` lines and they must all use one display name. Do not change any other string in that file.

**Manifests.** The packs under `data/generated/regions/` ship `region_manifest.json.zip` and do not ship the extracted JSON. For each pack that contains one of those previous spellings, use `extractZip` and `zipJsonFile` from [scripts/generated-data-zip-helpers.cjs](scripts/generated-data-zip-helpers.cjs), with the Python resolver in `scripts/resolve-python.cjs`. Extract only `region_manifest.json`. In `side_groups`, change a `display_name` only when it is exactly one of those previous spellings. Do not edit hexes, origin units, economy, `side_group_balance`, `generated_at_utc`, or any other field. Write the JSON back, zip that one file, then delete the extracted `region_manifest.json` so the directory again contains only zips.

**Saved names.** In `assertStoredSideGroupsExist` and `getScenarioHomeRegionHexes`, a stored home matches a group when `group.id === name` or `sideHomeNameKey(group.displayName) === sideHomeNameKey(name)`. Extend the existing comments on those two functions. Leave their existing log calls as they are.

**Tests.** In [src/main/storedSideGroups.test.ts](src/main/storedSideGroups.test.ts), install a group whose display name is `South & east China, Taiwan (SECT)` and whose hexes are one known id. The previous spelling and the new spelling both pass `assertStoredSideGroupsExist` and `getScenarioHomeRegionHexes` returns that hex id for both. `Not A Group` still throws. A group named `Tasman (Victoria, Tasmania, NZ) (TVTNZ)` matches that spelling and `Tasman (Victoria, Tasmania, NZ)`. The stored name `Tasman` does not match it. `Highveld` still matches exactly, as the existing test requires.

**Doc.** In [doc/region-summary-1.md](doc/region-summary-1.md) Table 1, replace each previous letter-form spelling with the new name. Leave the following percentage and land-hex parenthesis, such as `25.6% (54)`, as they are. Do the same exact replacement in `data/generated/regions/qa/economy-markdown.txt`. In [doc/how-to-play.md](doc/how-to-play.md), the new-game caption and its image alt text name `South & east China, Taiwan`. Change those words to `South & east China, Taiwan (SECT)`. Do not edit `doc/media/regional-preview.png`. Report that the picture still shows the old dropdown.

In [doc/ux/top-bar.md](doc/ux/top-bar.md), add: "The full home name of a side whose short name is a letter form ends with that letter form in parentheses, such as `South & east China, Taiwan (SECT)`. `East` does not." In the loss-header sentence of [doc/ux/notifications-and-feedback.md](doc/ux/notifications-and-feedback.md), add the same example beside the full home name. Do not edit `doc/ux/selection-panel.md`: its `W. Turkey` example is still true.

**Verify.** Read each changed zip back and assert the new `display_name`, and assert that every other `display_name` in those zips is unchanged. Assert `southern_africa` group `east` is still `East`, and that `northern_europe` still contains an origin unit `GB:East` named `East`. Count side-group display names that end in ` ([A-Z]{2,})`: the count is 13. Run `python -m unittest scripts.regional_pipeline.tests.test_side_group_catalog`. Then `npm run build:main` and `node dist/main/storedSideGroups.test.js`. Then `npm test`.

## Phase 3: Electron 40.10 and esbuild 0.28

**Goal.** The app stays on Electron 40, at 40.10.6 or a newer 40.x, and the renderer bundler moves to esbuild 0.28.2 or a newer 0.28.x.

**Before editing.** Copy `package.json`, `package-lock.json`, and `THIRD-PARTY-NOTICES.md` to temporary files outside the repo, or to files you will delete. If this phase fails, copy them back and delete the copies.

**Edits.** In `package.json`, set `electron` to `^40.10.6` and `esbuild` to `^0.28.2`. Run `npm install`. Read `node_modules/electron/package.json` and `node_modules/esbuild/package.json`. Electron must be `>= 40.10.6` and `< 41`. esbuild must be `>= 0.28.2` and `< 0.29`. In `THIRD-PARTY-NOTICES.md`, change `Version 40.8.0` to the installed Electron version and leave the rest of that section as it is.

**Verify.** `npm test`. `app-builder-lib` is still 25.1.8. If install or tests fail, restore the three files, delete the copies, and stop.

## Phase 4: Same-range transitive updates

**Goal.** The packages in the expected-version list move, and every deferred package stays put.

**Before editing.** Copy `package-lock.json` aside. This phase must not change `package.json`. If it fails, restore the lockfile and delete the copy.

**Command.** `npm update @xmldom/xmldom @humanfs/node @tootallnate/once brace-expansion flatted form-data ip-address js-yaml lodash picomatch tar tmp`

**Check.** Walk `package-lock.json` `packages` and compare each installed copy with the expected-version list. `tar` 6.x may move to a newer 6.x and must not become 7. A 3.x `picomatch`, if one appears, stays 3.x. `electron` and `esbuild` stay on the Phase 3 versions. `app-builder-lib` stays 25.1.8, `builder-util-runtime` stays 9.2.10, `extract-zip` stays 2.0.1, and `http-cache-semantics` stays 4.2.0. If a targeted package is older than the expected version because its parent range forbids the newer one, stop and report the parent range. Do not add an override.

**Verify.** `npm test`. On failure, restore the lockfile copy and stop.

## Phase 5: Record what the audit still reports

**Goal.** A read-only account of the alerts this plan did not clear.

**Command.** `npm audit`.

**Report.** Group the remaining findings by package name. The report should still be able to name Electron advisories that need 41 or 42, `app-builder-lib`, `extract-zip`, and `http-cache-semantics`. Say whether `tar` 6.x and `builder-util-runtime` still appear. Do not change files in this phase. Do not run `npm audit fix`. GitHub's Dependabot list updates only after these lockfile changes are on the default branch, which this phase does not do.

## Doc check before you finish

Phase 1 updates `doc/ux/top-bar.md`, `doc/how-to-play.md`, and `doc/ux/notifications-and-feedback.md` for the short name. Phase 2 updates those same short-name sentences only by the parenthesis clauses named above, plus `doc/region-summary-1.md` Table 1, the how-to-play new-game caption, and `data/generated/regions/qa/economy-markdown.txt`. Phase 3 updates the Electron version sentence in `THIRD-PARTY-NOTICES.md`. Prompt documents stay as they are because they already say the prompt prints the stored home name. No other `doc/` file should need an edit. Say which documents changed in the Phase 1, Phase 2, and Phase 3 reports.
