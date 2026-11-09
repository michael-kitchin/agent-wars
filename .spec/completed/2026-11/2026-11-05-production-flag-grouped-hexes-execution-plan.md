# Grouped Idle Hexes in the Production Attention Flag

## Goal

The Production attention flag currently names 6 idle hexes and says "and 29 more". It still tells the model to add a row "for each". On turn 13 the model guessed 22 codes it was never shown. After this change the flag prints every idle hex (up to 60) in grouped form:

```
Production: 5 controlled hexes can build but are not building — empty queue, can build fortification, credits: CH, DH; empty queue, can build air, fortification, credits: C5; blocked at cap, can build fortification, credits: D3; blocked at cap, can build air, fortification, credits: CF. Add a set_build_queue row to productionOrders for each.
```

Past 60 hexes, the sentence ends `...: CF; 12 more not listed (query_production lists every hex). Add a set_build_queue row to productionOrders for each listed hex.` The words `listed hex` are the whole difference. They keep the flag from requesting a code it did not print.

## Decisions (fixed, do not revisit)

- **Group key.** Queue state (`empty` or `blocked`) plus the buildable-type set. Hexes with the same types but different states go in separate groups.
- **Order.** Groups appear in the order of their first hex. Hexes keep the order of `findIdleProductionHexes`, which is the `query_production` row order.
- **Matching type sets.** Two sets match when they hold the same types in any order. The group prints its first hex's type order.
- **Limit.** `PRODUCTION_ATTENTION_LISTED_HEXES` stays and changes from 6 to 60. The first 60 idle hexes are listed, grouped. The rest are counted.
- **Closing sentence.** When every idle hex is listed, keep `Add a set_build_queue row to productionOrders for each.` When some are omitted, use `Add a set_build_queue row to productionOrders for each listed hex.`
- **Coaching sentence.** Replace `it names each such hex and the types it can still build` with `it names the hexes to queue and the types they can still build`. The old wording claims the flag names every idle hex, which is false past 60.
- **Unchanged.** The opening sentence (`Production: N controlled hex(es) can build but is/are not building — `). `findIdleProductionHexes`, `IdleProductionHex`, `selectNextQueueEntry`, `appendProductionAttentionBullet`, and every caller. `consultationText.ts` already says `Queue production for every hex named in the Production attention flag.` Leave that sentence, and `consultationContract.test.ts`, alone.
- **Separators.** Inside a group, the label and the hex list are separated by `: `. Types and hexes are joined with `, `. Groups are joined with `; `.

## Rules the Implementer Must Follow

- Never commit or push.
- Do not put phase numbers or plan names in code, comments, or docs.
- Every new or changed function, field, and constant needs a full orienting block (`Purpose / When to use / Expected outcome / Exceptions`), in the style already used in the file. eslint rejects one-line field comments.
- Getter-style helpers log with `logTrace`.
- PowerShell has no `&&`. Chain commands with `; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`.

---

## Step 0: Save the Plan

Copy this plan to `.spec/production-flag-grouped-hexes-execution-plan.md`.

---

## Phase 1: Rewrite the Test First

File: [src/main/openRouter/productionAttention.test.ts](src/main/openRouter/productionAttention.test.ts)

1. Update the file header's Expected outcome to: "Empty, blocked, fully capped, and already-building queues classify as specified. The bullet groups hexes by queue state and buildable types, and lists at most `PRODUCTION_ATTENTION_LISTED_HEXES` hexes."
2. Change the helper so every row has a distinct label. Today `hex: [hexText.length, 0]` gives every two-letter name the same label, `H2`.

```ts
function hexRow(
  id: number,
  availableUnitTypes: readonly string[],
  entries: readonly { unitType: string; queueIndex: number }[]
): ControlledHexQueueSnapshot {
  return {
    hex: [id, 0],
    availableUnitTypes: [...availableUnitTypes],
    entries: entries.map((entry) => ({ ...entry })),
  };
}
```

   Update the helper's orienting comment to say "A snapshot whose label is `H{id}`." Keep `const label = (ll) => \`H${ll[0]}\`;`. Add `PRODUCTION_ATTENTION_LISTED_HEXES` to the import list.

3. Replace each `hexRow('xx', ...)` call in the existing classification cases (empty, blocked, allCapped, cappedWithCredits, queuedFortification, building) with a numeric id: 1, 2, 3, 4, 5, 6. Keep their assertions, except the `emptyBullet` assertion, which becomes an exact single-hex check:

```ts
assert.strictEqual(
  formatProductionAttentionBullet(empty),
  'Production: 1 controlled hex can build but is not building — empty queue, can build infantry, armor: H1. Add a set_build_queue row to productionOrders for each.'
);
```

4. Delete the `seven` / `sevenBullet` case. Add these two cases:

```ts
const grouped = findIdleProductionHexes(
  [
    hexRow(1, ['armor', 'fortification', 'credits'], []),
    hexRow(2, ['air', 'armor', 'fortification', 'credits'], []),
    hexRow(3, ['credits', 'armor', 'fortification'], []),
    hexRow(4, ['armor', 'fortification', 'credits'], [{ unitType: 'armor', queueIndex: 0 }]),
    hexRow(5, ['air', 'armor', 'fortification', 'credits'], [{ unitType: 'armor', queueIndex: 0 }]),
    hexRow(6, ['air', 'fortification'], [{ unitType: 'air', queueIndex: 0 }]),
  ],
  new Set(['armor']),
  label
);
assert.strictEqual(
  formatProductionAttentionBullet(grouped),
  'Production: 5 controlled hexes can build but are not building — ' +
    'empty queue, can build fortification, credits: H1, H3; ' +
    'empty queue, can build air, fortification, credits: H2; ' +
    'blocked at cap, can build fortification, credits: H4; ' +
    'blocked at cap, can build air, fortification, credits: H5. ' +
    'Add a set_build_queue row to productionOrders for each.'
);

const overflowCount = PRODUCTION_ATTENTION_LISTED_HEXES + 1;
const overflow = findIdleProductionHexes(
  Array.from({ length: overflowCount }, (_, index) => hexRow(index, ['infantry'], [])),
  new Set(),
  label
);
const overflowBullet = formatProductionAttentionBullet(overflow) ?? '';
assert.ok(overflowBullet.startsWith(`Production: ${overflowCount} controlled hexes`), overflowBullet);
assert.ok(overflowBullet.includes(`H${PRODUCTION_ATTENTION_LISTED_HEXES - 1}; 1 more not listed (query_production lists every hex). `), overflowBullet);
assert.ok(overflowBullet.endsWith('Add a set_build_queue row to productionOrders for each listed hex.'), overflowBullet);
assert.ok(!overflowBullet.includes(`H${PRODUCTION_ATTENTION_LISTED_HEXES}`), overflowBullet);
```

   Do not hardcode 6 or 60 in this case. Do not change `label`. `H60` is not a substring of `H6`, so the last assertion is safe.

   Hex 3 lists `credits` before `fortification` on purpose. Its buildable set is still fortification and credits, so it groups with hex 1, and the group prints hex 1's type order. Hex 6's next entry is `air`, and `air` is not in the maxed set, so `findIdleProductionHexes` skips it. The bullet must not contain `H6`.

5. Change the literal in the first `appendProductionAttentionBullet` assertion to the new shape: `'Production: 1 controlled hex can build but is not building — empty queue, can build infantry: H1. Add a set_build_queue row to productionOrders for each.'`. Use it in both the input and the expected value (`- ` prefix). Leave the other two append assertions as they are.

**Verify Phase 1:**

```powershell
npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/productionAttention.test.js
```

- The build must succeed.
- `assert` stops at the first failure. The classification asserts (`reason`, `buildableTypes`, and the empty-array cases) come first and must pass. The run then stops on the single-hex `strictEqual`. The actual value is still the old form, `H1 (empty queue; can build infantry, armor)`.
- That one failure is the expected result. The grouped and overflow asserts are not reached yet. Do not edit any new assertion to match the old parenthetical form. Go on to Phase 2.
- A compile error, or a failure in a classification assert before that `strictEqual`, means Phase 1 is wrong. Fix it before you continue.

---

## Phase 2: Implement Grouping

File: [src/main/openRouter/productionAttention.ts](src/main/openRouter/productionAttention.ts)

1. File header, Expected outcome: "At most one bullet, listing up to `PRODUCTION_ATTENTION_LISTED_HEXES` hexes grouped by queue state and buildable types, or null when nothing is idle."
2. Constant: set the value to `60`. Rewrite its block:
   - Purpose: "Every hex the bullet asks the model to queue needs a printed code to copy, so the bullet lists every idle hex up to this limit. The limit bounds the line on a very large empire. `query_production` still lists every controlled hex."
   - Expected outcome: "Sixty."
3. After `IdleProductionHex`, add the internal group type. Do not export it.

```ts
/**
 * Idle hexes that share a queue state and a buildable-type set.
 *
 * Purpose: The attention bullet prints each state and type set once, followed by every hex code it covers.
 * When to use: The result of `groupIdleProductionHexes`.
 * Expected outcome: `hexTexts` is never empty and keeps idle-list order.
 * Exceptions: None.
 */
interface IdleProductionHexGroup {
  /**
   * Why every hex in the group is idle.
   *
   * Contract: `empty` when those queues have no entry. `blocked` when each next entry's type is at the deployment cap.
   * When to use: Choosing the group's state label in the attention bullet.
   * Expected outcome: One of those two words.
   * Exceptions: None.
   */
  readonly reason: IdleProductionHex['reason'];
  /**
   * Available build types printed once for the group.
   *
   * Contract: The first hex's `buildableTypes`, in that hex's order. Never empty.
   * When to use: The `can build` list in the attention bullet.
   * Expected outcome: Type names in the first hex's order.
   * Exceptions: None.
   */
  readonly buildableTypes: readonly string[];
  /**
   * Briefing codes of the hexes in the group.
   *
   * Contract: Labels in idle-list order. Never empty.
   * When to use: The hex list after the group's colon.
   * Expected outcome: One label per hex in the group.
   * Exceptions: None.
   */
  readonly hexTexts: readonly string[];
}
```

   Copy those field comments as written. eslint rejects a one-line field comment.

4. Add the grouping helper above `formatProductionAttentionBullet`:

```ts
/**
 * Groups idle hexes by queue state and buildable-type set.
 *
 * Purpose: Lets the attention bullet print every idle hex code without repeating the same type list per hex.
 * When to use: `formatProductionAttentionBullet`, on the hexes it lists.
 * Expected outcome: Groups in order of their first hex. Type sets match regardless of order, and each group prints its first hex's type order. Hexes keep input order.
 * Exceptions: None.
 */
function groupIdleProductionHexes(idle: readonly IdleProductionHex[]): IdleProductionHexGroup[] {
  logTrace('productionAttention groupIdleProductionHexes', { idleCount: idle.length });
  const groups = new Map<string, { reason: IdleProductionHex['reason']; buildableTypes: readonly string[]; hexTexts: string[] }>();
  for (const hex of idle) {
    const key = `${hex.reason}|${[...hex.buildableTypes].sort().join(',')}`;
    const group = groups.get(key);
    if (group) {
      group.hexTexts.push(hex.hexText);
    } else {
      groups.set(key, { reason: hex.reason, buildableTypes: hex.buildableTypes, hexTexts: [hex.hexText] });
    }
  }
  return [...groups.values()];
}
```

5. Replace the body of `formatProductionAttentionBullet` from `const listed = ...` through the `return`:

```ts
  const listed = idle.slice(0, PRODUCTION_ATTENTION_LISTED_HEXES);
  const groups = groupIdleProductionHexes(listed)
    .map((group) => {
      const state = group.reason === 'empty' ? 'empty queue' : 'blocked at cap';
      return `${state}, can build ${group.buildableTypes.join(', ')}: ${group.hexTexts.join(', ')}`;
    })
    .join('; ');
  const extra = idle.length - listed.length;
  const more = extra > 0 ? `; ${extra} more not listed (query_production lists every hex)` : '';
  const closing =
    extra > 0
      ? 'Add a set_build_queue row to productionOrders for each listed hex.'
      : 'Add a set_build_queue row to productionOrders for each.';
  return (
    `Production: ${idle.length} controlled ${noun} can build but ${verb} not building — ${groups}${more}. ` +
    closing
  );
```

   Update its Expected outcome: "The exact production sentence. The first `PRODUCTION_ATTENTION_LISTED_HEXES` hexes are printed as `{empty queue|blocked at cap}, can build {types}: {hexes}` groups joined by `; `. Any remainder is counted, and the closing then asks for each listed hex. When every idle hex is listed, the closing asks for each. Null when the list is empty."

6. Update the `reason` field comment on `IdleProductionHex`. "When to use" becomes "Choosing the group and its state label in the attention bullet." Update the `buildableTypes` field comment the same way: "The `can build` list of the hex's group in the attention bullet."

**Verify Phase 2:**

```powershell
npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/productionAttention.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npx eslint src/main/openRouter/productionAttention.ts src/main/openRouter/productionAttention.test.ts
```

Expected: `productionAttention.test.ts: ok`, and eslint reports nothing.

---

## Phase 3: Coaching Sentence and Docs

### Coaching

File: [src/main/openRouter/promptSpec/coachingTextStrategic.ts](src/main/openRouter/promptSpec/coachingTextStrategic.ts)

In `PRODUCTION_BULLET`, replace this exact sentence:

`When the Production attention flag is present, it names each such hex and the types it can still build.`

with:

`When the Production attention flag is present, it names the hexes to queue and the types they can still build.`

Add this to that constant's Expected outcome: "The last sentence tells the model to queue the hexes the flag names."

File: [src/main/openRouter/promptContracts.test.ts](src/main/openRouter/promptContracts.test.ts)

In `testProductionGuidanceSkipsTypesAtDeploymentCap`, after the existing `at maximum` asserts, add:

```ts
assert.ok(
  guidance.includes(
    'When the Production attention flag is present, it names the hexes to queue and the types they can still build.'
  ),
  'flag sentence must tell the model to queue the named hexes'
);
assert.ok(!guidance.includes('names each such hex'), 'flag sentence must not claim every idle hex is named');
```

Add to that function's Expected outcome: "The flag sentence names the hexes to queue and does not claim every idle hex is named."

Do not change `consultationText.ts` or `consultationContract.test.ts`.

### Docs

Edit each passage in place. Do not rewrap or shorten a line.

1. [doc/ai-commander-prompts/strategic-prompt.md](doc/ai-commander-prompts/strategic-prompt.md), Attention Flags, Include. Replace "`findIdleProductionHexes` supplies it, and `PRODUCTION_ATTENTION_LISTED_HEXES` (6) is how many hexes it names." with:
   > "`findIdleProductionHexes` supplies it. `formatProductionAttentionBullet` groups the hexes by queue state and buildable types, as in `empty queue, can build fortification, credits: CH, DH`, and joins the groups with semicolons. It names up to `PRODUCTION_ATTENTION_LISTED_HEXES` (60) hexes. Past that, it counts the rest and asks for a `set_build_queue` row only for the listed hexes."
2. Same file, the `productionOrders` entry row: change only `(6)` to `(60)` in `up to `PRODUCTION_ATTENTION_LISTED_HEXES` (6)`. Change nothing else on that row.
3. Same file, item 11, **Keep production queued.** Replace `it names each such hex and the types it can still build` with `it names the hexes to queue and the types they can still build`.
4. [doc/ai-commander-prompts/assembly-contract.md](doc/ai-commander-prompts/assembly-contract.md), the `## Attention Flags` row: change "It names at most `PRODUCTION_ATTENTION_LISTED_HEXES` (6) hexes." to "It names at most `PRODUCTION_ATTENTION_LISTED_HEXES` (60) hexes, grouped by queue state and buildable types."
5. [doc/ai-commander-prompts/example-strategic-prompt.md](doc/ai-commander-prompts/example-strategic-prompt.md): replace `it names each such hex and the types it can still build` with `it names the hexes to queue and the types they can still build`. Keep the surrounding indentation.

**Verify Phase 3:**

```powershell
npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptContracts.test.js
```

Expected: the file's existing success line, and no assertion failure.

Then:

- Grep `src/` and `doc/` for `names each such hex` and for `(6)` next to `PRODUCTION_ATTENTION_LISTED_HEXES`. Both must return no matches. A copy under `.spec/` is historical; do not edit it.
- Grep `doc/` for `PRODUCTION_ATTENTION_LISTED_HEXES`. It must return the Include sentence, the `productionOrders` row, and the assembly-contract row, each showing `(60)`.

---

## Phase 4: Final Verification

```powershell
npm run lint; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm run naming:check
```

Then grep `src/` for `(empty queue;` and `and ${extra} more`. Both must return no matches.

`productionAttention.test.js` and `promptContracts.test.js` do not need `npm run rebuild:native:node`. Optionally run the full `npm test`, which takes about 28 minutes. Before that full run, `npm test` itself rebuilds the native module.

Final summary for the user:
- Name the changed source files: `productionAttention.ts`, `productionAttention.test.ts`, `coachingTextStrategic.ts`, and `promptContracts.test.ts`.
- Name the changed docs: `strategic-prompt.md`, `assembly-contract.md`, and `example-strategic-prompt.md`.
- State that `consultationText.ts` was checked and left unchanged, because it already says to queue every hex the flag names.
- Do not commit.
