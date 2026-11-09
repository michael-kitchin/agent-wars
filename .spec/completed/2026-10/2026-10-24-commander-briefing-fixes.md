# Commander Briefing Fixes

> **For agentic workers:** This plan is the record of the change. The working tree already contains the implementation below. Do not commit or push.

**Goal:** French (and similarly collided) country labels use the name that appears most often for that ISO code; armor and naval fire is blocked only by a mountain cell strictly between the shooter and the target; commander instructions tell the model to copy listed Best Options shots instead of inventing a shot the table omitted.

**Architecture:** Three independent behaviors. Country naming is `buildCanonicalCountryNameByCode` in [`src/main/unitOrigin/tacticalBirthCountry.ts`](src/main/unitOrigin/tacticalBirthCountry.ts). Line of sight is `tacticalMountainLosBlockedState` in [`src/shared/tacticalTerrainCombatModifiers.ts`](src/shared/tacticalTerrainCombatModifiers.ts), which ranged validation, return fire, and Best Options all already call. Prompt copy is the tempo and mountain sentences in [`src/main/openRouter/promptSpec/gameRuleText.ts`](src/main/openRouter/promptSpec/gameRuleText.ts), [`coachingTextTactical.ts`](src/main/openRouter/promptSpec/coachingTextTactical.ts), and [`coachingTextStrategic.ts`](src/main/openRouter/promptSpec/coachingTextStrategic.ts), plus the armed-units bullet in [`src/main/briefingFormatter.ts`](src/main/briefingFormatter.ts).

**Tech stack:** TypeScript, Node `node:test`, compiled with `npm run build:main`, then `node --test` on the matching `dist/**/*.test.js` files.

## Global constraints

- Do not commit or push.
- Do not copy phase, stage, or plan names into `src/`, `doc/`, tests, comments, or configuration. The words "Phase 1" and similar stay in `.spec/` only.
- Update maintained `doc/` text in the same phase as the behavior it describes. Leave historical docs listed in [`doc/README.md`](doc/README.md) alone. When a mechanics sentence changes, follow the update notes around the engine constants table in that README.
- Orienting comments on every new or edited function: why it exists, when to use it, what it returns, and that it does not throw unless it already throws.
- Tests cover the happy path and the essential failure. Do not add tests for boilerplate.
- Public backend methods that are new or whose logging already exists keep the repo logging rule (debug on entry, error on catch, trace on getters). Do not add logs to `tacticalMountainLosBlockedState` or `buildCanonicalCountryNameByCode`; they do not log today.
- No new dependencies. No `Utils` or `Impl` names. Stay inside the existing files.

## Out of scope

Leave these alone. They were model compliance, and the existing tempo rule already fills skipped attacks:

- Automatic `defend` for a unit already stacked on an enemy.
- Filling every empty production queue the model left empty.
- Changing `tempoRuleAttacks` or the Best Options filter that hides infrastructure-only shots.

## Phase 1 — Country name for a shared ISO code

**Verify on its own.** No combat or prompt files.

`buildCanonicalCountryNameByCode` sorts country-row names and keeps the first name for each ISO code. `FR` has both `Clipperton I.` and `France`, so every French hex is labeled Clipperton Island. The same rule would label Australia as `Ashmore and Cartier Is.` and Kazakhstan as `Baikonur`. The real naming file is [`data/generated/terrain_res1_naming.json`](data/generated/terrain_res1_naming.json). Hex `81187ffffffffff` (briefing code DH, Bay of Biscay) is Spain and France there.

**Rule:** For each `countryCode`, count how many strategic country rows use each `name`. The name with the highest count wins. If two names have the same count, the ordinal-first name wins (`compareOrdinal`, already used in this file). A code with one name is unchanged.

**Test first** in [`src/main/unitOrigin/tacticalBirthCountry.test.ts`](src/main/unitOrigin/tacticalBirthCountry.test.ts), calling `buildCanonicalCountryNameByCode`:

- Two records named `France` / `FR` and one named `Clipperton I.` / `FR` returns `France`.
- One record each of `Alpha` / `QQ` and `Bravo` / `QQ` returns `Alpha`.
- The existing single-name cases in [`src/main/unitOrigin/countryDisplayName.test.ts`](src/main/unitOrigin/countryDisplayName.test.ts) still pass. Add one cache case: store two `France` rows and one `Clipperton I.` row, then `countryDisplayNameForCode('FR')` is `France`.
- One test loads the bundled strategic naming file through `loadTerrainStrategicNamingBundled` in [`src/main/terrainNamingLoad.ts`](src/main/terrainNamingLoad.ts) and asserts the winners for the four codes that have more than one name: `FR` is `France`, `AU` is `Australia`, `KZ` is `Kazakhstan`, `BR` is `Brazil`. Count rows, not unique hexes. Do not parse the JSON by hand; the loader unwraps the `records` envelope.

Run `npm run build:main`, then:

`node --test dist/main/unitOrigin/tacticalBirthCountry.test.js dist/main/unitOrigin/countryDisplayName.test.js`

Update the function's orienting comment, which currently says the first sorted name wins. Search `doc/` for `Clipperton` and for a sentence that says the first alphabetical country name wins. Update a maintained doc only if that sentence is there.

## Phase 2 — Intervening mountains only

**Verify on its own.** Depends on nothing from Phase 1.

`tacticalMountainLosBlockedState` treats every cell on `computeGridPathCellsPure`'s path as blocking, including index `0` (the shooter) and the last index (the target). Adjacent armor therefore cannot shoot infantry on a mountain, and armor standing on a mountain cannot shoot at all. Cover in [`src/shared/terrainCoverRules.ts`](src/shared/terrainCoverRules.ts) already lowers the roll against a mountain target; that stays.

**Code:** In the path loop, skip index `0` and the last index. A path of length 2 has no intervening cell, so it is not blocked. A `null` path stays blocked (`traceFailed: true`). Infantry stays exempt. Do not special-case air here; air strikes do not call this function.

**Tests first**, then make them pass.

In [`src/main/tacticalBattle/tacticalTerrainCombatModifiers.test.ts`](src/main/tacticalBattle/tacticalTerrainCombatModifiers.test.ts):

- Adjacent plains shooter and mountain target: armor and naval are not blocked.
- Shooter on mountain, adjacent plains target: armor is not blocked.
- A path of at least three cells whose middle cell is mountain: armor and naval are blocked; infantry is not.
- Rewrite `naval ranged blocked when implicit LOS crosses mountain` and `tacticalRangedDirectFirePassesTerrainAndRange rejects naval shot through mountain footprint`. Those fixtures put the mountain on the target. Under this rule that shot is legal. Put the mountain on a middle cell for the blocked case.
- Rewrite `mountain still blocks LOS across an icosahedron face boundary` the same way. If that pair's path has no middle cell, do not force a block on the destination. Keep `clear terrain stays shootable when the LOS trace crosses an icosahedron face boundary` as it is.

In [`src/main/combatResolution.test.ts`](src/main/combatResolution.test.ts), `testTacticalMountainBlocksArmorReturnFire` puts the returning armor on a mountain and the target on plains. Return fire must now hit. Rename the test comment to say the shooter's own mountain cell does not block return fire. Do not add a second combat fixture; the shared LOS test covers the intervening cell.

In [`src/shared/returnFireEligibility.test.ts`](src/shared/returnFireEligibility.test.ts), `denies tactical armor/naval when mountain blocks LOS; allows infantry` sets the adjacent target cell to mountain and expects armor and naval return fire to be denied. Under this rule both are allowed, and infantry stays allowed. Rename the test to say an adjacent mountain target does not block return fire. Add the intervening denial in the shared LOS test, not a second combat fixture: pick a cell at grid distance 2, take `computeGridPathCellsPure` (or `gridPathCells`), require `path.length >= 3`, set `path[1]` to mountain and both endpoints to plains. Do not assume a named neighbor lies on the shortest path.

[`src/main/gameActions/tacticalGroupRangedTargetValidation.test.ts`](src/main/gameActions/tacticalGroupRangedTargetValidation.test.ts) paints every cell in the disk mountain, including the cells between the naval unit and the distance-2 target. That rejection must still pass. Do not rewrite it to expect success.

**Leave these alone.** They are movement or cover, not line of sight:

- Armor still cannot enter a mountain that has no road or rail (`tacticalMarchDestinationBlock.test.ts`, `tacticalMarchStepCost.test.ts`, and the order-preview string `Blocked: Mountain` for entry).
- Mountain cover stays (`terrainCoverRules.test.ts`). Cover lowers the roll and never makes the shot illegal. The order-preview mapping of `Line of sight blocked by mountains` to `Blocked: Mountain` stays, because an intervening mountain still produces that reason.
- `formatTerrainEffectEntriesHtml preserves x/-/+ symbol order` uses a synthetic map. Do not change it.

**Tooltip:** [`applyRangeSymbols`](src/shared/terrainEffectsForTooltip.ts) adds `(x)` Armored Range and `(x)` Naval Range on a mountain cell. That symbol describes the cell itself, so it contradicts intervening-only line of sight. Remove that mountain branch. A blocked shot still surfaces as `Line of sight blocked by mountains` when validation fails. Armor movement onto mountains stays blocked. Forest, urban, and rubble still slow infantry and armor range. Update these assertions in [`src/main/terrainEffectsForTooltip.test.ts`](src/main/terrainEffectsForTooltip.test.ts): `mountain blocks armor movement and armor and naval range`, `mountain with transport clears land movement penalties and adds bonus for all`, `urban on mountain mixes range symbols for armored`, `rubble mountain with a road blocks armor and does not slow infantry`, and `computeTerrainEffectsLineHtml keeps plain clause order and uses status icons`. The last one asserts an urban-mountain HTML string that includes Naval Range before Armored Range. After the mountain range symbols are gone, recompute both the plain string and the HTML from the remaining symbols. Expected direction, which the agent must recompute rather than trust blindly: a plain mountain keeps the infantry and armor movement blocks and loses the range `(x)` marks; a mountain with rail stays `(+) All Movement`; an urban mountain collapses to `(-) All Movement, (-) All Range` when infantry and armor share only the urban range penalty. Drop any assertion that Naval Range appears solely because the cell is mountain.

**Docs in this phase:**

- [`doc/combat-rules-v3.md`](doc/combat-rules-v3.md) in both places that state the rule: the short bullet **Line of sight (tactical)** in section 6, and §12.5. A mountain cell strictly between the shooter and the target blocks armor and naval. The shooter's cell and the target cell do not. Infantry is exempt. Air strikes and ferry are not blocked. The target cell still applies its cover. Leave **Cover never blocks** as written; the new line-of-sight sentence is what makes that sentence true for a mountain target. A missing path still fails closed, with the existing face-crossing fallback. [`doc/game-vision-v2.md`](doc/game-vision-v2.md) only points at Combat Rules §12; leave that pointer.
- [`doc/how-to-play.md`](doc/how-to-play.md) firing note that says a mountain can block a shot inside the reach outline: say a mountain cell between the shooter and the target can block armor and naval, and the cell either unit stands on does not.
- Update the orienting comment on `tacticalMountainLosBlockedState` and on `applyRangeSymbols`.

Run `npm run build:main`, then `node --test` on:

- `dist/main/tacticalBattle/tacticalTerrainCombatModifiers.test.js`
- `dist/main/combatResolution.test.js`
- `dist/shared/returnFireEligibility.test.js`
- `dist/main/gameActions/tacticalGroupRangedTargetValidation.test.js`
- `dist/main/terrainEffectsForTooltip.test.js`

## Phase 3 — Prompt sentences match the options table

**Verify after Phase 2**, because the mountain sentence must describe intervening cells, not the old endpoint block. Do not change `tempoRuleAttacks`. The engine may still add a legal shot the model skipped, including an infrastructure shot the table hid.

Replace the standing "take every legal shot" orders so they name the Best Options table. Keep the fact that firing does not spend the move.

In `buildAttackConstraintsClause` ([`gameRuleText.ts`](src/main/openRouter/promptSpec/gameRuleText.ts)), replace the tempo sentence with: copy each ranged or air-strike row that Best Options This Turn lists for that unit, and choose among those listed rows. Do not invent a target the table does not list. Those attacks resolve from the period-start positions and do not prevent movement in the same period. Keep the air-strike wording only when `hasAirUnits` is true. Use the existing `period` noun (`turn` or `beat`).

In `buildRangedReachRule`, replace `Mountain along the line of sight blocks armor and naval shots (infantry is exempt).` with: a mountain cell between the shooter and the target blocks armor and naval shots. The cell the shooter stands on and the target cell do not. Infantry is exempt. Leave the forest/urban/rubble cap and the air-strike/ferry sentence in place.

In `tempoBullet` in both [`coachingTextTactical.ts`](src/main/openRouter/promptSpec/coachingTextTactical.ts) and [`coachingTextStrategic.ts`](src/main/openRouter/promptSpec/coachingTextStrategic.ts): every unit (tactical: sub-unit) that has a ranged or air-strike row in Best Options This Turn should be given that shot, chosen from the listed rows, because the shot resolves from the period-start position and does not consume the move. Do not invent a target the table does not list. Tactical copy says `beat` and `sub-unit`. Strategic copy says `turn` and `unit`.

In [`coachingTextTactical.ts`](src/main/openRouter/promptSpec/coachingTextTactical.ts), the duplicate baseline bullet near the range-cap sentence gets the same intervening-mountain sentence as `buildRangedReachRule`.

In `armedUnitsBulletText` ([`briefingFormatter.ts`](src/main/briefingFormatter.ts)), the shot clause currently says `order a ranged_attack for each and choose the targets yourself`. Change it to `copy a Best Options ranged or air-strike row for each and do not invent a target`, still listing the unit ids. Leave the same-hex contact clause (`do not order a ranged_attack`, `already in contact`, `melee resolves if they stay`) unchanged.

Update [`src/main/briefingAttentionShot.test.ts`](src/main/briefingAttentionShot.test.ts), which expects `order a ranged_attack for each`. The melee-only test must still find `choose the targets yourself` absent.

Search `doc/ai-commander-prompts/` for `Mountain along the line of sight`, `If a legal ranged_attack`, and `legal shot should be given`. Update those maintained sentences, including [`doc/ai-commander-prompts/tactical-prompt.md`](doc/ai-commander-prompts/tactical-prompt.md), [`doc/ai-commander-prompts/information-decision-model.md`](doc/ai-commander-prompts/information-decision-model.md), and the example tactical prompt, so they match the builders. Do not edit historical docs.

Run `npm run build:main`, then `node --test` on:

- `dist/main/briefingAttentionShot.test.js`
- `dist/main/openRouter/promptSpec/coachingText.test.js`
- `dist/main/openRouter/promptSpec/consultationContract.test.js`
- `dist/main/openRouter/promptContracts.test.js`

If a prompt test fails on the old sentence, update that assertion to the new sentence. Do not weaken the assertion to make it pass.

## Final check

Run the Phase 1, Phase 2, and Phase 3 `node --test` files in one command after a fresh `npm run build:main`. All of them pass. Do not commit.
