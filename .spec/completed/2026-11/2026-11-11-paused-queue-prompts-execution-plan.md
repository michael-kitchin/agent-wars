# Paused Queues: Short Pause Sentences and AI Prompt Help

> **For agentic workers:** Work the phases in order. Finish each phase's verification before starting the next. Steps use checkbox (`- [x]`) syntax; tick each one as you finish it. **Never commit or push** (`.cursor/rules/11-no-commit-or-push.mdc`). The user reviews every change first. Before you start, ask any questions you need to; if anything in this plan disagrees with the code you find, stop and ask instead of guessing.

**Goal:** Every explanation of a paused build queue, in the build popup, the turn report, and the AI commander's prompt, uses one short form: `Queue paused: <reasons>.` in the popup and `Queues paused at AA, BB, and CC: <reasons>.` wherever hexes are named. The turn report names a hex only on the turn its queue pauses. The AI commander's situation message gets a `### Paused Queues` subsection under Production Status, with one paragraph per grouped sentence, then the banked points, then one paragraph per remedy. Attention Flags keeps a one-line pointer to that subsection. The Raise Options table marks the cells where a raise would restart building. Prompt headings and paragraph breaks follow the rules in Global Constraints.

**Why:** In a 44-year Gemini Flash-Lite match, captured cities sat paused for decades. Restarting one takes a chain of steps (credits at home, then a mercenary in the paused city, or a unit moved in). Nothing in the briefing flagged the paused cities or connected them to the fix. This plan adds that context. It does not change any game rule.

**Architecture:** One new shared module owns the pause reasons, their wording, and the sentence builders (`src/shared/queuePauseReasons.ts`, with its types in `src/shared/queuePauseTypes.ts`). The end-of-turn production pass, the build-queue view, the turn report, the build popup, and the AI briefing all call it, so the rule and the words exist in one place.

**Tech stack:** TypeScript, `node:test`, SQLite through the existing `gameDb` facade. No new dependencies.

## Requirements

These come from the user's request and answers.

| # | Requirement |
| --- | --- |
| R1 | The build popup's paused note is one line: `Queue paused: <reasons>.` Every reason that applies is listed, joined by `joinWithSerialComma`: two reasons use "and" with no comma, and three or more use a serial comma. Example: `Queue paused: occupying units or fortifications required and unit cap reached.` |
| R2 | The reasons and their exact wording: `occupying units or fortifications required`, `every city cell fortified`, `unit cap reached`. |
| R3 | The turn report names hexes by code, not place name. Hexes with the same set of reasons share one sentence: `Queue paused at AA: <reasons>.` for one hex, `Queues paused at AA and BB: <reasons>.` and `Queues paused at AA, BB, and CC: <reasons>.` for more. |
| R4 | AI-facing pause text uses the R3 sentence form with briefing hex codes. |
| R5 | Attention Flags gets one line when a queue is paused for occupation or a full city: `Paused queues: see Paused Queues under Production Status.` It does not name hexes or restate the fix. The facts and the fixes are a subsection of Production Status in the situation message. After the production heading shift that subsection is `### Paused Queues`: one paragraph per grouped sentence, then the banked points when the total is above 0, then one paragraph per remedy. |
| R6 | `query_production` reports each own hex's pause reasons and banked points. The Raise Options table marks the cells where a raise restarts building. |
| R7 | No on/off setting. The user will compare builds from the same save. |
| R8 | The buildability rule is two paragraphs in the situation message. The second paragraph names the occupation fix. The cached system prompt's production coaching bullet adds one indented paragraph that points at Paused Queues. It does not restate the remedies. |
| R9 | The turn report names a hex only on the turn its queue becomes paused. While it stays paused, it is not named again, even if its reasons change. If it resumes building and pauses again on a later turn, it is named again on that turn. |

### Sentences to Expect

| Where | Situation | Text |
| --- | --- | --- |
| Popup | Captured city, infantry queued, no unit there | `Queue paused: occupying units or fortifications required.` |
| Popup | Same, and infantry is at the unit cap | `Queue paused: occupying units or fortifications required and unit cap reached.` |
| Popup | Home city, fortification queued, every cell fortified | `Queue paused: every city cell fortified.` |
| Report | C2, AA, BB pause for occupation this turn | `Queues paused at AA, BB, and C2: occupying units or fortifications required.` |
| Report | DD pauses this turn for occupation and the unit cap | `Queue paused at DD: occupying units or fortifications required and unit cap reached.` |
| Report | C2 is still paused the next turn, now also at the cap | No line for C2. |
| Report | C2 resumes building, then pauses again two turns later | `Queue paused at C2: ...` on the turn it pauses again. |
| Situation message | Any pause for occupation or a full city | `### Paused Queues`, then one paragraph per grouped sentence, a banked-points paragraph when the total is above 0, and one paragraph per remedy. See Phase 6 for the exact paragraphs. |
| Attention Flags | The subsection is present | `Paused queues: see Paused Queues under Production Status.` |
| Cached coaching | Production tools are on | The production bullet's last paragraph: `When an attention bullet names paused queues, apply the fix in Paused Queues under Production Status.` |

## Decisions Already Made

Don't revisit these.

- **When a queue counts as paused.** Only when the hex has something to build: a queue entry, or Keep building armed with a type. An empty queue is never "paused." This is a small behavior change: today the popup shows the long paused note on an empty queue in an unoccupied city, and after this plan it shows nothing until something is queued. A hex with no production (no city cells) never shows a pause.
- **The next item.** The queue entry with the lowest `queueIndex`, then the lowest `id`, the same order the production pass uses. When the queue is empty and Keep building is armed, the next item is the Keep building type.
- **Reason rules.** These mirror `processProductionAfterControlResolution`:
  - `occupation`: the hex is outside the seat's home region, holds none of the seat's units, and has no fortification (`isHexBuildableForSeat` is false).
  - `allCellsFortified`: the next item is `fortification` and no fortifiable cell is left. On a neutral-border hex, fortifiable cells count as 0, as in the production pass.
  - `unitCap`: the next item is a unit type the seat has at or above its deployment cap. Mercenaries do not count toward caps.
- **Order.** Reasons always print in this order: occupation, every city cell fortified, unit cap reached. Duplicates are dropped.
- **Every reason is recorded.** Today the production pass stops checking after it finds an occupation pause. After this plan it still records whether the next item is also blocked by a full city or a cap, so the report matches the popup.
- **Report grouping.** One sentence per distinct reason set. Sentences are ordered by their reason sets: occupation alone, then occupation plus fortified, then occupation plus cap, then fortified alone, then cap alone. A caller that passes all three sorts between occupation-plus-fortified and occupation-plus-cap. The production pass never emits all three, because the next item is only one type. Hex codes come from `orderTargetHexCode(h3Index, null)` and are joined by the existing `formatTurnReportHexList`, which de-duplicates, sorts, and names a missing code `an unidentified hex` once.
- **Cap pauses are new in the report.** A hex that stalls at the unit cap now gets a `Queue(s) paused at ...: unit cap reached.` line on the turn it stalls. The existing cap-reached Updates line stays.
- **Report only new pauses.** The production pass remembers which queues were paused after the previous pass, per seat. A pause is new when the hex was not in that seat's set last time. Only new pauses reach the turn report. The line shows the reasons that apply on that turn.
- **What counts as resuming.** Any pass in which the hex is not paused removes it from the set: it built, its queue went empty, or it changed hands. A later pause is then new again. The set is keyed by seat, so a captured city's first pause under its new owner is always new.
- **Where the memory lives.** One `game_config` row, `queue_paused_hexes`, holding a JSON object of seat id to H3 indexes. It follows the existing `sight_cue_seen_units` row (`src/main/sightCues/sightCueMemory.ts`). No table is added, so `EXPECTED_USER_VERSION` stays 26 and saves from 2.21.x still load. A missing or unreadable row reads as "nothing was paused," so the first turn after loading an older save reports every paused queue once. A new match deletes the row.
- **Only the report is limited.** The popup note, the Paused Queues subsection, and the attention pointer describe the current state, so they still show on every turn a queue is paused.
- **Unchanged.** The `buildPaused` field on the build-queue view, `withBuildPausedFlags`, and the map label `∞t` keep their current meaning: occupation only. The Production idle flag (`productionAttention.ts`) and the opening-message pointer at it are unchanged.
- **Paused Queues subsection.** It lists hexes whose reasons include occupation or every city cell fortified, and prints all of their reasons, including the cap. A hex paused only by the cap stays in the existing Production idle flag (`blocked at cap`), so it isn't named twice. There is no list limit: the global map has 283 production hexes in all. The body is one paragraph per grouped sentence, the sentences from `formatQueuePausedLines` joined with a blank line. Then the banked-points paragraph when the total is above 0. Then one remedy paragraph per reason that is present. One listed hex says `this cell`. More than one says `these cells`. One point says `point is`. More than one says `points are`. Zero points omits that paragraph. The heading is `subHeading('Paused Queues')`. `formatBriefing` shifts production headings up one level, so the situation message shows `### Paused Queues`. When the briefing is absent the same heading is `## Paused Queues` under `# Production Status`. Omit the heading and the body when there is nothing to say.
- **Attention pointer.** One line: `Paused queues: see Paused Queues under Production Status.` It is appended after the idle-production bullet and does not count against the five-bullet cap. It is omitted when the subsection is omitted. It does not name hexes or restate a remedy.
- **Where the prompt words travel.** The subsection is part of the production section (`productionText`), which is in the situation message. The pointer travels as `pausedProductionAttention`, beside `productionAttention`. The cached system prompt only gains the coaching paragraph in R8. Production Status already carries the production rules in the situation message, so the remedies stay there rather than being copied into the cached prompt in different words.
- **Building column.** The production table's Building column says `paused` when `buildPaused` is true or the hex has any pause reason.
- **`query_production` fields.** `pausedReasons` is a list of the reason texts from R2, present only when at least one applies, so unpaused hexes add no tokens. `storedPoints` is the hex's banked points as an integer, present on every hex the requester controls.
- **One buildability check per view.** The build-queue view computes "can the seat build here now" once and uses it for both `buildPaused` and `pausedReasons`. `query_production` builds a view for every hex on the map, so a second database check per hex would double that cost. The cap set is the same kind of cost. `queryProduction` already computes `maxedTypes` once. It passes that set into every queue view. A single-hex read that does not pass a set queries once. The pause helper itself does not query.
- **Stale compiled tests.** `npm run build:main` does not delete compiled files whose source was removed, and the test runner runs every `*.test.js` under `dist/`. Deleting a test source therefore also means deleting its compiled output.
- **Raise Options.** A new column, `Resumes building`, is `yes` for a cell where the seat has production but cannot build for lack of occupying units or fortifications, and `no` otherwise. `yes` rows sort first, and then the existing distance and index sort applies. The row limit still cuts the tail. A `no` row is not shown while a `yes` row was cut. If the `yes` rows themselves exceed the limit, the farthest `yes` rows are cut.
- **Types live in their own file.** `src/shared/queuePauseTypes.ts` imports nothing, so `src/shared/ipc/readyTypes.ts` can use the types without an import cycle.

## Global Constraints

- Never commit or push.
- Never write "Phase", "R1", or other plan identifiers in code, comments, or `doc/` (`.cursor/rules/12-no-plan-identifiers.mdc`).
- Every new or changed function, field, interface, and constant gets an orienting comment in the file's existing `Purpose / When to use / Expected outcome / Exceptions` style. Field blocks may use `Contract` in place of `Purpose`, as the files already do. eslint rejects one-line field comments. Fix any comment whose stated behavior this plan changes.
- Getter-style helpers log with `logTrace`. Keep the existing log calls.
- Source files should stay under 600 lines, with a hard limit of 1000. Functions take at most 6 named parameters; use an argument object beyond that. Do not restructure a file that is already over 600 lines for a small addition (`buildQueue.ts`, `briefingFormatter.ts`, `buildQueuePopup.ts`, `gameActionsCore.ts`).
- Prompt prose. The cached system prompt is `staticSystemText`. The user prompt is `situationText`. Both pass through `wrapLongProseLines`, which keeps blank lines and headings and only wraps inside a paragraph. Put the breaks in the builder. Do not join prompt sentences with a space.
  - A new heading uses `subHeading` or `topLevelHeading` from `src/main/openRouter/promptSpec/sectionHeadings.ts`. Do not type the hashes. `formatBriefing` shifts production headings up one level, so `subHeading('Paused Queues')` is `## Paused Queues` in the section builder and `### Paused Queues` in the situation message. That is the same shift that turns Controlled Hex Queues into `###` in the situation message.
  - A heading has a blank line before it and a blank line after it. `briefingSectionsMercenaries.ts` already does this with `lines.push('', subHeading(SECTION_TITLE_RAISE_OPTIONS), '', ...)`.
  - Paragraphs are separated by one blank line (`\n\n`). A coaching continuation stays inside its bullet: a blank line, then two spaces, then the sentence, which is how `PRODUCTION_BULLET` is already built. Do not put a heading inside a bullet.
  - The build popup and the turn report stay one sentence per line. They are not prompt sections.
- Tests cover contracts only. Add only the tests listed here. Delete tests for functions this plan removes.
- Update the `doc/` text named in each phase as part of that phase. Don't touch `doc/release-notes/` or anything under `.spec/`.
- PowerShell has no `&&`. Chain commands with `; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`.

## Review Focus

1. **Occupation plus cap on one hex:** one sentence with both reasons, in the popup and the report. Pure tests in Phase 1; production-pass wiring in Phase 2.
2. **Keep building at a full city:** an empty queue with Keep building armed on `fortification` still reports `every city cell fortified`. Existing test in Phase 2.
3. **An empty queue in an unoccupied city:** no popup note, no report line, not in the attention pointer, and not in Paused Queues. The idle flag still names it.
4. **A hex paused only by the cap:** in the idle flag, not in the attention pointer, and not in Paused Queues. Phase 6 test.
5. **A missing hex code:** printed as `an unidentified hex` once. Phase 1 test.
6. **Observe-all snapshots (fog off):** the Raise Options marker counts only the briefed seat's cells. Phase 1 test.
7. **Report once per pause:** named on the first paused turn, not on the next, not while building, and again when it pauses after resuming. Phase 2 test.
8. **Older save, missing memory row:** reads as empty without an error, and the row is written at the end of the next pass. Phase 2 code review.

## Test Commands

```
npm run build:main
node dist/shared/FILE.test.js        (shared tests)
node dist/main/FILE.test.js          (main tests; use the test's folder under dist/main)
npm run check:renderer-types         (after any src/renderer/ change)
```

A TypeScript error from `build:main` counts as a failed step. Tests that open a database (`withTempGameDb`) need the Node build of the native module: run `npm run rebuild:native:node` once before the first one. `npm start` rebuilds it for Electron afterward.

---

## Phase 1: Shared Pause Reasons and Sentences

Pure code only. Nothing user-visible changes yet.

**Files:** create `src/shared/queuePauseTypes.ts`, `src/shared/queuePauseReasons.ts`, `src/shared/queuePauseReasons.test.ts`. Edit `src/shared/productionBuildability.ts` and `src/shared/productionBuildability.test.ts`.

**Produces:** `QueuePauseReason`, `QueuePause`, `QUEUE_PAUSE_REASON_ORDER`, `QUEUE_PAUSE_REASON_TEXT`, `listQueuePauseReasons`, `sortQueuePauseReasons`, `queuePauseReasonForText`, `formatQueuePausedNote`, `QueuePauseLineEntry`, `formatQueuePausedLines`, `listOccupationPausedHexes`.

- [x] **Step 1: Create `src/shared/queuePauseTypes.ts`.** It must import nothing.

```ts
/**
 * Why a build queue is not spending, and one paused hex.
 *
 * Purpose: The production pass, the Ready result, the build popup, and the AI briefing share these names without importing sentence code.
 * When to use: Type positions only. The wording and sentence builders live in `queuePauseReasons.ts`.
 * Expected outcome: Plain types. This file imports nothing, so IPC types can use it without an import cycle.
 * Exceptions: None.
 */

/**
 * One reason a queue with something to build is not spending.
 *
 * Purpose: Names each pause so every surface can print the same words.
 * When to use: Results of `listQueuePauseReasons`, and the `reasons` of a `QueuePause`.
 * Expected outcome: `occupation` when the hex is outside the seat's home and holds none of its units or fortifications. `allCellsFortified` when the next item is a fortification and no city cell is left to fortify. `unitCap` when the next item is a unit type at the seat's deployment cap.
 * Exceptions: None.
 */
export type QueuePauseReason = 'occupation' | 'allCellsFortified' | 'unitCap';

/**
 * One paused hex and every reason that applies.
 *
 * Purpose: The turn report groups hexes that share the same reasons.
 * When to use: The production pass summary and the Ready result.
 * Expected outcome: `reasons` is never empty.
 * Exceptions: None.
 */
export interface QueuePause {
  /**
   * The paused hex.
   *
   * Contract: An H3 index on the strategic map.
   * When to use: Resolving the hex code for the report.
   * Expected outcome: A non-empty index.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Every reason the hex's queue is paused.
   *
   * Contract: In `QUEUE_PAUSE_REASON_ORDER` order, without duplicates.
   * When to use: Grouping and wording the report sentence.
   * Expected outcome: At least one reason.
   * Exceptions: None.
   */
  readonly reasons: readonly QueuePauseReason[];
}
```

- [x] **Step 2: Write the tests first** in `src/shared/queuePauseReasons.test.ts` (use `node:test` and `node:assert/strict`, like `productionBuildability.test.ts`, with a file header in the same style). Use these cases:

  | Test | Call | Expected |
  | --- | --- | --- |
  | nothing queued is never paused | `listQueuePauseReasons({ buildable: false, nextItemType: null, fortifiableLeft: 0, maxedUnitTypes: new Set<string>(['infantry']) })` | `[]` |
  | an unoccupied hex with a fortification queue in a full city | `listQueuePauseReasons({ buildable: false, nextItemType: 'fortification', fortifiableLeft: 0, maxedUnitTypes: new Set<string>() })` | `['occupation', 'allCellsFortified']` |
  | a capped unit type | `listQueuePauseReasons({ buildable: true, nextItemType: 'armor', fortifiableLeft: 0, maxedUnitTypes: new Set<string>(['armor']) })` | `['unitCap']` |
  | credits are never capped | `listQueuePauseReasons({ buildable: true, nextItemType: 'credits', fortifiableLeft: 0, maxedUnitTypes: new Set<string>(['armor']) })` | `[]` |
  | the note lists one reason | `formatQueuePausedNote(['occupation'])` | `Queue paused: occupying units or fortifications required.` |
  | the note sorts and joins three reasons | `formatQueuePausedNote(['unitCap', 'occupation', 'allCellsFortified'])` | `Queue paused: occupying units or fortifications required, every city cell fortified, and unit cap reached.` |
  | no reasons, no note | `formatQueuePausedNote([])` | `null` |
  | reason text maps back | `queuePauseReasonForText('unit cap reached')` and `queuePauseReasonForText('nope')` | `'unitCap'` and `null` |

  Add one grouping test:

```ts
assert.deepEqual(
  formatQueuePausedLines([
    { hexCode: 'C2', reasons: ['occupation'] },
    { hexCode: 'AA', reasons: ['occupation'] },
    { hexCode: 'BB', reasons: ['occupation'] },
    { hexCode: 'DD', reasons: ['unitCap', 'occupation'] },
    { hexCode: null, reasons: ['allCellsFortified'] },
    { hexCode: 'EE', reasons: [] },
  ]),
  [
    'Queues paused at AA, BB, and C2: occupying units or fortifications required.',
    'Queue paused at DD: occupying units or fortifications required and unit cap reached.',
    'Queue paused at an unidentified hex: every city cell fortified.',
  ]
);
```

- [x] **Step 3: Run it and confirm it fails.** `npm run build:main` fails because the module does not exist yet. That is expected.

- [x] **Step 4: Create `src/shared/queuePauseReasons.ts`.** Give the file a header (Purpose: one rule and one set of words for paused queues; When to use: the production pass, the build-queue view, the popup, the turn report, and the AI briefing). Give every export below an orienting block.

```ts
import { joinWithSerialComma } from './consolidatedTurnUpdateToast';
import { FORTIFICATION_QUEUE_ITEM } from './fortificationRules';
import { isBuildUnitType } from './ipc/productionTypes';
import type { QueuePauseReason } from './queuePauseTypes';
import { formatTurnReportHexList } from './turnReportHexCodes';

export const QUEUE_PAUSE_REASON_ORDER: readonly QueuePauseReason[] = ['occupation', 'allCellsFortified', 'unitCap'];

export const QUEUE_PAUSE_REASON_TEXT: Readonly<Record<QueuePauseReason, string>> = {
  occupation: 'occupying units or fortifications required',
  allCellsFortified: 'every city cell fortified',
  unitCap: 'unit cap reached',
};

export function listQueuePauseReasons(args: {
  readonly buildable: boolean;
  readonly nextItemType: string | null;
  readonly fortifiableLeft: number;
  readonly maxedUnitTypes: ReadonlySet<string>;
}): QueuePauseReason[] {
  if (args.nextItemType === null) return [];
  const reasons: QueuePauseReason[] = [];
  if (!args.buildable) reasons.push('occupation');
  if (args.nextItemType === FORTIFICATION_QUEUE_ITEM && args.fortifiableLeft <= 0) reasons.push('allCellsFortified');
  if (isBuildUnitType(args.nextItemType) && args.maxedUnitTypes.has(args.nextItemType)) reasons.push('unitCap');
  return reasons;
}

export function sortQueuePauseReasons(reasons: readonly QueuePauseReason[]): QueuePauseReason[] {
  return QUEUE_PAUSE_REASON_ORDER.filter((reason) => reasons.includes(reason));
}

export function queuePauseReasonForText(text: string): QueuePauseReason | null {
  const trimmed = text.trim();
  return QUEUE_PAUSE_REASON_ORDER.find((reason) => QUEUE_PAUSE_REASON_TEXT[reason] === trimmed) ?? null;
}

export function formatQueuePausedNote(reasons: readonly QueuePauseReason[]): string | null {
  const sorted = sortQueuePauseReasons(reasons);
  if (sorted.length === 0) return null;
  return `Queue paused: ${joinWithSerialComma(sorted.map((reason) => QUEUE_PAUSE_REASON_TEXT[reason]))}.`;
}

export interface QueuePauseLineEntry {
  readonly hexCode: string | null;
  readonly reasons: readonly QueuePauseReason[];
}

export function formatQueuePausedLines(entries: readonly QueuePauseLineEntry[]): string[] {
  const groups = new Map<string, { readonly reasons: QueuePauseReason[]; readonly codes: (string | null)[] }>();
  for (const entry of entries) {
    const reasons = sortQueuePauseReasons(entry.reasons);
    if (reasons.length === 0) continue;
    const key = reasons.map((reason) => QUEUE_PAUSE_REASON_ORDER.indexOf(reason)).join(',');
    const group = groups.get(key) ?? { reasons, codes: [] };
    group.codes.push(entry.hexCode);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, group]) => {
      const noun = group.codes.length === 1 ? 'Queue' : 'Queues';
      const reasons = joinWithSerialComma(group.reasons.map((reason) => QUEUE_PAUSE_REASON_TEXT[reason]));
      return `${noun} paused at ${formatTurnReportHexList(group.codes)}: ${reasons}.`;
    });
}
```

  Notes for the comments:
  - `QueuePauseLineEntry` fields need full orienting blocks. `hexCode` is a briefing or report code, or null when it cannot be resolved.
  - In `formatQueuePausedLines`, explain that the group key is the reasons' positions in `QUEUE_PAUSE_REASON_ORDER`, so plain string order sorts the groups as `0`, `0,1`, `0,2`, `1`, `2`. That works because there are fewer than ten reasons.
  - `listQueuePauseReasons` Exceptions: none. Expected outcome: reasons in `QUEUE_PAUSE_REASON_ORDER` order, and an empty list when nothing is queued.

- [x] **Step 5: Add `listOccupationPausedHexes` to `src/shared/productionBuildability.ts`,** after `withBuildPausedFlags`. Orienting block: Purpose, "The Raise Options table marks the cells where a raise would let the seat build again." When to use, "With the snapshot the seat is briefed on. It reads only that seat's control, units, and home." Expected outcome, "The H3 indexes the seat controls that have city cells and fail `isHexBuildableForSeat`."

```ts
export function listOccupationPausedHexes(state: GameStateSnapshot, seatId: string): Set<string> {
  const homeHexes = new Set(state.homeRegionHexesBySeat?.[seatId] ?? []);
  const seatUnitHexes = new Set(state.units.filter((unit) => unit.player === seatId).map((unit) => unit.h3Index));
  const infrastructure = new Map((state.strategicInfrastructure ?? []).map((row) => [row.h3Index, row]));
  const paused = new Set<string>();
  for (const row of state.strategicControl ?? []) {
    if (row.controllerPlayerId !== seatId) continue;
    const infra = infrastructure.get(row.h3Index);
    if (!infra || infra.urbanHexCount <= 0) continue;
    const buildable = isHexBuildableForSeat({
      h3Index: row.h3Index,
      homeHexes,
      seatUnitHexes,
      fortifiedCount: infra.fortifiedCount ?? 0,
    });
    if (!buildable) paused.add(row.h3Index);
  }
  return paused;
}
```

  If TypeScript rejects `infra.fortifiedCount`, read it the way `withBuildPausedFlags` does (`row.fortifiedCount ?? 0` on the same row type). Do not widen the snapshot type.

- [x] **Step 6: Test it** in `src/shared/productionBuildability.test.ts`. Add `listOccupationPausedHexes` to the import and add:

```ts
test('occupation-paused hexes are the seat production cells it cannot build in', () => {
  const state = {
    units: [
      { player: 'opponent', h3Index: 'garrisoned' },
      { player: 'human', h3Index: 'occupied' },
    ],
    hexes: [],
    homeRegionHexesBySeat: { opponent: ['home'] },
    strategicControl: [
      { h3Index: 'home', controllerPlayerId: 'opponent' },
      { h3Index: 'garrisoned', controllerPlayerId: 'opponent' },
      { h3Index: 'fortified', controllerPlayerId: 'opponent' },
      { h3Index: 'occupied', controllerPlayerId: 'opponent' },
      { h3Index: 'rural', controllerPlayerId: 'opponent' },
      { h3Index: 'theirs', controllerPlayerId: 'human' },
    ],
    strategicInfrastructure: [
      { h3Index: 'home', urbanHexCount: 3, airportCount: 0, seaportCount: 0, fortifiedCount: 0 },
      { h3Index: 'garrisoned', urbanHexCount: 2, airportCount: 0, seaportCount: 0, fortifiedCount: 0 },
      { h3Index: 'fortified', urbanHexCount: 2, airportCount: 0, seaportCount: 0, fortifiedCount: 1 },
      { h3Index: 'occupied', urbanHexCount: 2, airportCount: 0, seaportCount: 0, fortifiedCount: 0 },
      { h3Index: 'rural', urbanHexCount: 0, airportCount: 0, seaportCount: 0, fortifiedCount: 0 },
      { h3Index: 'theirs', urbanHexCount: 2, airportCount: 0, seaportCount: 0, fortifiedCount: 0 },
    ],
  } as unknown as GameStateSnapshot;
  assert.deepEqual([...listOccupationPausedHexes(state, 'opponent')], ['occupied']);
});
```

  An enemy unit in `occupied` does not count as the seat's own.

- [x] **Step 7: Verify.**

```powershell
npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/shared/queuePauseReasons.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/shared/productionBuildability.test.js
```

  Expected: both pass. Also run `npm run check:circular`; it must report no new cycle.

---

## Phase 2: Production Pass and Turn Report

The production pass records every reason for each paused hex. It also remembers which queues were paused after the previous pass, so the Ready result carries only the queues that paused this turn. The report prints the grouped sentences with hex codes. The old place-name sentences go away.

**Files:** create `src/main/gameDb/queuePauseMemory.ts`, `src/main/gameActions/queuePauseRecording.ts`, and `src/renderer/gameplay/queuePauseUpdateLines.ts`. Edit `src/main/gameActions/controlAndProduction.ts`, `src/main/gameActions/meleeInterceptReadyFinalize.ts`, `src/main/ipc/readyIpcResolutionMapping.ts`, `src/main/gameDb/resetGame.ts`, `src/shared/ipc/readyTypes.ts`, `src/shared/consolidatedTurnUpdateToast.ts`, `src/shared/consolidatedTurnUpdateToast.test.ts`, `src/shared/productionBuildability.ts`, `src/shared/productionBuildability.test.ts`, `src/shared/fortificationRules.ts`, `src/renderer/gameplay/fortificationUpdateLines.ts`, `src/renderer/gameplay/readyResolutionAnnouncements.ts`, `src/main/productionBuildabilityFlow.test.ts`, `src/main/fortificationProductionFlow.test.ts`, `doc/how-to-play.md`, `doc/ux/reports-tab.md`, `doc/ux/notifications-and-feedback.md`, `doc/save-files.md`, `doc/naming-conventions-contract-v1.md`. Delete `src/renderer/gameplay/productionPauseUpdateLines.ts` and `src/shared/fortificationRules.test.ts`.

**Produces:** `QUEUE_PAUSED_HEXES_CONFIG_KEY`, `readPausedQueueHexes`, `writePausedQueueHexes`, `recordQueuePause`, `maxedUnitTypesFor`, `selectNewlyPausedQueues`, `newlyPausedQueuesByPlayer` on the production summary, `humanNewlyPausedQueues` on `ReadyResult`, `queuePauseUpdateLinesFor`, and the `queuePauseLines` toast argument.

The build stays red between steps 1 and 10. Do every step, then verify.

- [x] **Step 1: The paused-queue memory.** Create `src/main/gameDb/queuePauseMemory.ts`, modeled on `src/main/sightCues/sightCueMemory.ts`. File header: Purpose, "The turn report names a paused queue only on the turn it pauses. This row remembers the previous production pass, including across a save and load." When to use, "Read at the start of the production pass and replaced at its end. A new match deletes the row." Every export gets a full block.

```ts
import type { GameConfigKvDbOps } from './gameConfigKv';
import { selectGameConfigValue, upsertGameConfigValue } from './gameConfigRows';
import { logDebug, logError, logTrace } from '../logger';

export const QUEUE_PAUSED_HEXES_CONFIG_KEY = 'queue_paused_hexes';

export function readPausedQueueHexes(ops: Pick<GameConfigKvDbOps, 'getOne'>): Map<string, Set<string>> {
  logTrace('readPausedQueueHexes');
  const paused = new Map<string, Set<string>>();
  const raw = selectGameConfigValue(ops, QUEUE_PAUSED_HEXES_CONFIG_KEY);
  if (raw == null) return paused;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      logError('readPausedQueueHexes: stored value is not an object', { rawLength: raw.length });
      return paused;
    }
    for (const [seatId, hexes] of Object.entries(parsed)) {
      if (Array.isArray(hexes) && hexes.every((hex) => typeof hex === 'string')) paused.set(seatId, new Set(hexes));
    }
    return paused;
  } catch (err) {
    logError('readPausedQueueHexes: could not parse stored value', { rawLength: raw.length }, err);
    return paused;
  }
}

export function writePausedQueueHexes(
  ops: Pick<GameConfigKvDbOps, 'run'>,
  pausedBySeat: ReadonlyMap<string, readonly string[]>
): void {
  const record: Record<string, string[]> = {};
  for (const [seatId, hexes] of pausedBySeat) {
    if (hexes.length > 0) record[seatId] = [...hexes].sort();
  }
  logDebug('writePausedQueueHexes', { seatCount: Object.keys(record).length });
  upsertGameConfigValue(ops, QUEUE_PAUSED_HEXES_CONFIG_KEY, JSON.stringify(record));
}
```

  Block notes:
  - `QUEUE_PAUSED_HEXES_CONFIG_KEY` Expected outcome: "The string `queue_paused_hexes`."
  - `readPausedQueueHexes` Expected outcome: "Seat id to the H3 indexes that were paused. Invalid entries are dropped. A missing row, which is what a save from before this row existed has, is an empty map." Exceptions: "None. A parse error is logged and returns an empty map."
  - `writePausedQueueHexes` Expected outcome: "One `game_config` row. An empty map writes `{}`, which clears every seat." Exceptions: "Propagates a database error to the caller."

- [x] **Step 2: Recording helpers.** Create `src/main/gameActions/queuePauseRecording.ts` with a file header (Purpose: "The production pass collects paused queues and picks out the ones that paused this pass.") and a full block for each function. Each logs with `logTrace`.

```ts
import type { BuildUnitType } from '../../shared/ipc/productionTypes';
import type { QueuePause, QueuePauseReason } from '../../shared/queuePauseTypes';
import type { SeatId } from '../../shared/seatIds';
import { logTrace } from '../logger';
import { DEPLOYMENT_CAP_TYPE_ORDER } from '../productionCaps';

export function recordQueuePause(
  byPlayer: Map<SeatId, QueuePause[]>,
  seatId: SeatId,
  h3Index: string,
  reasons: readonly QueuePauseReason[]
): void {
  logTrace('queuePauseRecording recordQueuePause', { seatId, h3Index, reasonCount: reasons.length });
  if (reasons.length === 0) return;
  const list = byPlayer.get(seatId) ?? [];
  list.push({ h3Index, reasons: [...reasons] });
  byPlayer.set(seatId, list);
}

export function maxedUnitTypesFor(
  seatId: SeatId,
  countsByPlayerType: ReadonlyMap<string, number>,
  caps: Readonly<Record<BuildUnitType, number>>
): Set<string> {
  logTrace('queuePauseRecording maxedUnitTypesFor', { seatId });
  return new Set(
    DEPLOYMENT_CAP_TYPE_ORDER.filter((unitType) => (countsByPlayerType.get(`${seatId}:${unitType}`) ?? 0) >= caps[unitType])
  );
}

export function selectNewlyPausedQueues(
  previous: ReadonlyMap<string, ReadonlySet<string>>,
  current: ReadonlyMap<SeatId, readonly QueuePause[]>
): Map<SeatId, QueuePause[]> {
  logTrace('queuePauseRecording selectNewlyPausedQueues', { seatCount: current.size });
  const fresh = new Map<SeatId, QueuePause[]>();
  for (const [seatId, pauses] of current) {
    const before = previous.get(seatId);
    const added = pauses.filter((pause) => !before?.has(pause.h3Index));
    if (added.length > 0) fresh.set(seatId, added);
  }
  return fresh;
}
```

  Block notes:
  - `maxedUnitTypesFor` reads the same counts the spend loop uses, keyed `` `${seatId}:${unitType}` ``, which leave mercenaries out.
  - `selectNewlyPausedQueues` Expected outcome: "For each seat, the pauses whose hex was not in that seat's previous set, with their current reasons. Seats with none are omitted."

- [x] **Step 3: Production pass** (`controlAndProduction.ts`).
  - Import `listQueuePauseReasons` from `../../shared/queuePauseReasons`; the types `QueuePause` and `QueuePauseReason` from `../../shared/queuePauseTypes`; `recordQueuePause`, `maxedUnitTypesFor`, and `selectNewlyPausedQueues` from `./queuePauseRecording`; and `readPausedQueueHexes` and `writePausedQueueHexes` from `../gameDb/queuePauseMemory`.
  - In the return type of `processProductionAfterControlResolution`, replace `fortificationPausedHexesByPlayer` and `buildPausedHexesByPlayer` with `newlyPausedQueuesByPlayer: ReadonlyMap<SeatId, readonly QueuePause[]>;`.
  - Replace their two `new Map` lines with:

```ts
const previouslyPaused = readPausedQueueHexes({ getOne: dbGetOne });
const queuePausesByPlayer = new Map<SeatId, QueuePause[]>();
```

  - In the branch where `buildability.isBuildable(...)` is false, keep `setBuildProgressPointsForHex(...)` and `continue`. Replace the three lines that push into `buildPausedHexesByPlayer` with:

```ts
recordQueuePause(
  queuePausesByPlayer,
  controllerPlayerId,
  control.h3Index,
  listQueuePauseReasons({
    buildable: false,
    nextItemType:
      queueWorking[0]?.unitType ??
      (standingAtStart.keepBuilding ? standingAtStart.keepBuildingUnitType : null),
    fortifiableLeft: neutralBorder ? 0 : fortifiableCount,
    maxedUnitTypes: maxedUnitTypesFor(controllerPlayerId, unitCountsByPlayerType, maxUnitsPerType),
  })
);
```

  - Replace the `if (fortificationPaused) { ... }` block after the spend loop with:

```ts
const pausedReasons: QueuePauseReason[] = [];
if (fortificationPaused) pausedReasons.push('allCellsFortified');
if (blockedByCapType) pausedReasons.push('unitCap');
recordQueuePause(queuePausesByPlayer, controllerPlayerId, control.h3Index, pausedReasons);
```

  - After the `for (const control of controls)` loop ends, and before the function builds its return object, add the code below. Then return `newlyPausedQueuesByPlayer` in place of the two old maps.

```ts
writePausedQueueHexes(
  { run: dbRun },
  new Map(
    [...queuePausesByPlayer].map(([seatId, pauses]): [SeatId, string[]] => [seatId, pauses.map((pause) => pause.h3Index)])
  )
);
const newlyPausedQueuesByPlayer = selectNewlyPausedQueues(previouslyPaused, queuePausesByPlayer);
```

    The write runs on every pass, even when nothing is paused. That is what removes a resumed queue from the set. If the function has a `return` between the start of the loop and its end, stop and ask.
  - Update the function's orienting block. Expected outcome now says: "Paused queues are remembered in the `queue_paused_hexes` row. `newlyPausedQueuesByPlayer` holds only the queues that paused this pass, each with every reason that applies."
  - The file is about 559 lines. These changes should keep it under 600. If they don't, stop and report.

- [x] **Step 4: Ready result.**
  - In `src/shared/ipc/readyTypes.ts`, delete `humanBuildPausedHexes` and `humanFortificationQueuePausedHexes` with their comment blocks. Add, where `humanBuildPausedHexes` was:

```ts
  /**
   * The human seat's queues that paused this turn, each with every reason that applies.
   *
   * Contract: Only queues that were not paused after the previous production pass. A queue that stays paused is not repeated. One entry per hex.
   * When to use: The Updates section, which prints one sentence per reason set.
   * Expected outcome: Omitted when no queue paused this turn.
   * Exceptions: None.
   */
  humanNewlyPausedQueues?: readonly QueuePause[];
```

    Import the type with `import type { QueuePause } from '../queuePauseTypes';`.
  - In `meleeInterceptReadyFinalize.ts`, replace the `humanBuildPausedHexes` entry with the following, and delete the `humanFortificationQueuePausedHexes` entry:

```ts
humanNewlyPausedQueues: (productionSummary.newlyPausedQueuesByPlayer.get(HUMAN_SEAT_ID)?.length ?? 0) > 0
  ? productionSummary.newlyPausedQueuesByPlayer.get(HUMAN_SEAT_ID)
  : undefined,
```

  - In `readyIpcResolutionMapping.ts`, replace `'humanBuildPausedHexes'` and `'humanFortificationQueuePausedHexes'` in the key union with one `'humanNewlyPausedQueues'`. Replace their two mapping lines with `humanNewlyPausedQueues: source.humanNewlyPausedQueues,`.

- [x] **Step 5: A new match clears the memory.** In `src/main/gameDb/resetGame.ts`, right after `deleteGameConfigRow({ run }, SIGHT_CUE_SEEN_UNITS_CONFIG_KEY);`, add `deleteGameConfigRow({ run }, QUEUE_PAUSED_HEXES_CONFIG_KEY);`. Import the key from `./queuePauseMemory`.

- [x] **Step 6: Report lines.**
  - Create `src/renderer/gameplay/queuePauseUpdateLines.ts` with a file header (Purpose: the Updates sentences for queues that paused this turn, naming hexes by code) and:

```ts
import { orderTargetHexCode } from '../../shared/orderTargetHexCode';
import type { ReadyResult } from '../../shared/ipcTypes';
import { formatQueuePausedLines } from '../../shared/queuePauseReasons';

export function queuePauseUpdateLinesFor(readySlice: ReadyResult): string[] {
  const pauses = readySlice.humanNewlyPausedQueues ?? [];
  return formatQueuePausedLines(
    pauses.map((pause) => ({ hexCode: orderTargetHexCode(pause.h3Index, null), reasons: pause.reasons }))
  );
}
```

    Use the same `ReadyResult` import path that `fortificationUpdateLines.ts` uses. Pass `null` because pauses are only reported on the world map. Give `queuePauseUpdateLinesFor` an orienting block (Purpose: "The toast builder receives finished sentences and does not look up hex codes." Expected outcome: "One sentence per reason set for the queues that paused this turn, or no lines when none did.").
  - Delete `src/renderer/gameplay/productionPauseUpdateLines.ts`.
  - In `fortificationUpdateLines.ts`, delete `fortificationUpdateLinesFor` and `placeNamesForHexes` and the imports only they used (`FORTIFICATION_UNNAMED_PLACE`, `formatFortificationQueuePausedLine`). Keep `fortificationReportLinesFor`. Update the file header: it now only totals fortification losses by owner.
  - In `readyResolutionAnnouncements.ts`, replace the two `await ...UpdateLinesFor(readySlice)` lines with `const queuePauseLines = queuePauseUpdateLinesFor(readySlice);`. In the `buildConsolidatedTurnUpdateToastMessage` argument object, replace `fortificationLines,` and `productionPauseLines,` with `queuePauseLines,`. Fix the imports. The file is about 596 lines and must not grow past 600.

- [x] **Step 7: Toast arguments** (`consolidatedTurnUpdateToast.ts`). Replace the `fortificationLines?` (paused-fortification sentences) and `productionPauseLines?` fields with one field:

```ts
  /**
   * Paused-queue sentences for the Updates section.
   *
   * Contract: Finished sentences from `formatQueuePausedLines` for the queues that paused this turn. This builder does not look up hex codes.
   * When to use: Strategic Ready, when at least one queue paused this turn.
   * Expected outcome: Trimmed lines are appended after missile and fortification sentences that stay in Updates, and before the unknown-battle line.
   * Exceptions: None. Blank lines are dropped.
   */
  queuePauseLines?: readonly string[];
```

  In the body, replace the `fortificationLines` and `productionPauseLines` trimming and appending (around lines 405 to 410) with one `queuePauseLines` block in the position the fortification lines had: after `fortificationReports.updates`, before the unknown-battle line. Do not touch the separate `fortificationLines: ReadonlyMap` parameter of the loss-section helper near line 363. That one is fortification losses.

- [x] **Step 8: Remove the old sentence builders.**
  - `src/shared/productionBuildability.ts`: delete `formatBuildPausedLine`. Delete the `joinWithSerialComma` import if nothing else in the file uses it. Keep `BUILD_PAUSED_NOTE` for now; Phase 4 removes it.
  - `src/shared/fortificationRules.ts`: delete `FORTIFICATION_UNNAMED_PLACE`, `joinPlaceNames`, and `formatFortificationQueuePausedLine`. In the file header, remove "the paused-queue sentence" from Purpose.
  - Delete `src/shared/fortificationRules.test.ts`. Its only cases tested the deleted function.
  - Delete the stale compiled outputs of the two deleted source files, if present: `dist/shared/fortificationRules.test.js` (plus a `.js.map` or `.d.ts` beside it) and `dist/renderer/gameplay/productionPauseUpdateLines.js` (plus its `.js.map` or `.d.ts`). The full test run collects every `*.test.js` under `dist/`, and the stale fortification test would fail against the rebuilt `fortificationRules.js`.
  - `src/shared/productionBuildability.test.ts`: delete the test `the paused line names one place or three` and `formatBuildPausedLine` from the import.

- [x] **Step 9: Tests.**
  - `src/main/productionBuildabilityFlow.test.ts`, first test: replace `assert.ok(summary.buildPausedHexesByPlayer.get(HUMAN_SEAT_ID)?.includes(hex));` with:

```ts
assert.deepEqual(
  summary.newlyPausedQueuesByPlayer.get(HUMAN_SEAT_ID)?.find((pause) => pause.h3Index === hex)?.reasons,
  ['occupation']
);
```

  - Same file, add this test after the fortification test. Every helper it uses is already imported there.

```ts
test('a paused queue is reported on the turn it pauses, and again only after it resumes', () => {
  withTempGameDb('aw-pause-once-', () => {
    const hex = outsideHomeCity();
    setHexController(hex, HUMAN_SEAT_ID);
    dbRun('DELETE FROM units WHERE player = ? AND h3_index = ?', [HUMAN_SEAT_ID, hex]);
    replaceBuildQueueForHex(hex, [{ unitType: 'infantry', remainingCount: 1 }]);
    const reportedThisPass = (): boolean =>
      processProductionAfterControlResolution()
        .newlyPausedQueuesByPlayer.get(HUMAN_SEAT_ID)
        ?.some((pause) => pause.h3Index === hex) === true;
    assert.equal(reportedThisPass(), true, 'first paused pass');
    assert.equal(reportedThisPass(), false, 'still paused');
    insertUnitRow(dbRun, {
      id: 'h1-i951',
      player: HUMAN_SEAT_ID,
      unitType: 'infantry',
      displayOrder: 951,
      h3Index: hex,
      origin: null,
      formedTurn: 1,
    });
    setBuildProgressPointsForHex(hex, 100);
    assert.equal(reportedThisPass(), false, 'building again');
    dbRun('DELETE FROM units WHERE player = ? AND h3_index = ?', [HUMAN_SEAT_ID, hex]);
    replaceBuildQueueForHex(hex, [{ unitType: 'infantry', remainingCount: 1 }]);
    assert.equal(reportedThisPass(), true, 'paused again after resuming');
  });
});
```

    The third pass builds the queued infantry, because a unit now stands on the hex. The hex is then not paused, so the pass drops it from the stored set. The fourth pass pauses it again and must report it.
  - `src/main/fortificationProductionFlow.test.ts`: replace both `assert.ok(result.fortificationPausedHexesByPlayer.get(HUMAN_SEAT_ID)?.includes(hex));` lines with the same shape as the first bullet, using `result` and expecting `['allCellsFortified']`. Both fixtures use `humanCityHex()`, a home city, so occupation does not apply. If a result includes `occupation`, stop. The second of those tests is Review Focus 2. That pass fortifies the last cell and then pauses, so the hex is newly paused with `allCellsFortified`.
  - `src/shared/consolidatedTurnUpdateToast.test.ts`:
    - Test `a production pause line follows the fortification pause line`: rename it to `paused-queue lines land in Updates`. Replace its two arguments with `queuePauseLines: ['Queues paused at AA and C2: occupying units or fortifications required.', 'Queue paused at DD: every city cell fortified.']`, and expect those two lines, in that order, under `## Updates`.
    - The other two tests that pass `fortificationLines: ['Every city cell at Prague is fortified, so its build queue is paused.']`: pass `queuePauseLines: ['Queue paused at DD: every city cell fortified.']` instead, and change the expected line to match. Keep each test's expected position: after the missile or fortification-report line, before the unknown-battle line.

- [x] **Step 10: Docs.**
  - `doc/how-to-play.md`, the **Reading the turn report** bullet: replace "and hexes where building paused" with "and queues that paused this turn, one sentence per set of reasons, naming hexes by code: `Queues paused at AA and C2: occupying units or fortifications required.` A queue that stays paused is not named again until it builds and then pauses again".
  - `doc/ux/reports-tab.md`: in the source list, replace `` `src/shared/fortificationRules.ts` (`formatFortificationQueuePausedLine`) `` with `` `src/shared/queuePauseReasons.ts` (`formatQueuePausedLines`) ``. In the long bullet that starts `The kind is "Turn report"`, replace the text from `queues paused because every city cell is fortified, credits added,` through `which holds none of your units or fortifications.").` with:

```text
credits added, mercenaries hired, units that deserted, hire orders that were not filled, and the queues that paused this turn (`formatQueuePausedLines`, one sentence per set of reasons, before the unknown-battle line: `Queues paused at AA and C2: occupying units or fortifications required.`). A queue that stays paused is not named again until it builds and then pauses again.
```

  - `doc/ux/notifications-and-feedback.md`: in the source list, change the `fortificationUpdateLines.ts` entry to list only `fortificationReportLinesFor`. Replace the `productionPauseUpdateLines.ts` entry with `` `src/renderer/gameplay/queuePauseUpdateLines.ts` (`queuePauseUpdateLinesFor`) ``. In the same file, replace the sentence that starts "A paused build hex names its places in" and the sentence after it ("Several places use "which hold".") with:

```text
Queues that paused this turn get one sentence per set of reasons, naming hexes by code (`formatQueuePausedLines`), before the unknown-battle line: "Queues paused at AA and C2: occupying units or fortifications required." One hex reads "Queue paused at". A queue that stays paused is not named again until it builds and then pauses again.
```

    If any other sentence in that file still describes the old paused wording, change it the same way.
  - `doc/save-files.md`, the paragraph that lists match rows that stay in the file (the one naming `sight_cues` and `sight_cue_seen_units`): add "The match row `queue_paused_hexes` stays in the file too. A missing row reads as no paused queues (`readPausedQueueHexes`), so the first turn after loading an older save reports every paused queue once." `EXPECTED_USER_VERSION` does not change.
  - `doc/naming-conventions-contract-v1.md`: add `'queue_paused_hexes'` to the `game_config` keys row, after `'sight_cue_seen_units'`.

- [x] **Step 11: Verify.**

```powershell
npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm run check:renderer-types; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/shared/consolidatedTurnUpdateToast.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/shared/productionBuildability.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm run rebuild:native:node; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/productionBuildabilityFlow.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/fortificationProductionFlow.test.js
```

  Expected: all pass, including the new once-per-pause test. Then grep `src/` and `doc/` (not `doc/release-notes/`) for `buildPausedHexesByPlayer`, `fortificationPausedHexesByPlayer`, `humanBuildPausedHexes`, `humanFortificationQueuePausedHexes`, `queuePausesByPlayer` outside `controlAndProduction.ts`, `formatBuildPausedLine`, `formatFortificationQueuePausedLine`, `placeNamesForHexes`, `FORTIFICATION_UNNAMED_PLACE`, `productionPauseUpdateLinesFor`, and `productionPauseLines`. Every search must return nothing. Confirm `dist/shared/fortificationRules.test.js` no longer exists, and that `EXPECTED_USER_VERSION` in `src/main/gameDb.ts` is still 26.

---

## Phase 3: Pause Reasons on the Build-Queue View and `query_production`

**Files:** `src/main/gameActions/productionBuildability.ts`, `src/main/gameActions/buildQueue.ts`, `src/main/gameActions/gameActionsCore.ts`, `src/shared/ipc/productionTypes.ts`, `src/main/tools/productionTools.ts`, `src/main/openRouter/productionQueueSnapshotTypes.ts`, `src/main/productionBuildabilityFlow.test.ts`, `src/main/tools/productionTools.test.ts`, `doc/ai-tools.md`.

**Produces:** `readMaxedUnitTypesForSeat`, `readQueuePauseReasonsForHex`, the `pausedReasons` view field, and the `pausedReasons` and `storedPoints` tool fields.

- [x] **Step 1: Write the tests first.**
  - `src/main/productionBuildabilityFlow.test.ts`, first test: after the existing `buildPaused` assert, add `assert.deepEqual(getHexBuildQueue(hex, HUMAN_SEAT_ID).pausedReasons, ['occupation']);`.
  - Same file, add this test after the fortification test. `setTacticalCellFortified`, `listFortifiableCellsForHex`, and `getStrategicInfrastructureForHex` are already imported.

```ts
test('a fortification queue in a fully fortified city reports every city cell fortified', () => {
  withTempGameDb('aw-pause-full-', () => {
    const hex = outsideHomeCity();
    setHexController(hex, HUMAN_SEAT_ID);
    dbRun('DELETE FROM units WHERE player = ? AND h3_index = ?', [HUMAN_SEAT_ID, hex]);
    for (const cell of listFortifiableCellsForHex(hex)) setTacticalCellFortified(cell, true);
    assert.equal(getStrategicInfrastructureForHex(hex).fortifiableCount, 0, 'fixture must leave no fortifiable cell');
    replaceBuildQueueForHex(hex, [{ unitType: 'fortification', remainingCount: 1 }]);
    assert.deepEqual(getHexBuildQueue(hex, HUMAN_SEAT_ID).pausedReasons, ['allCellsFortified']);
  });
});
```

    If the fixture assert fails, stop and report. Do not change the assertion. The hex is outside home and its units are deleted, but every cell is fortified, so occupation does not apply. If `pausedReasons` includes `occupation`, the fortified count did not stick; stop.
  - `src/main/tools/productionTools.test.ts`, `testQueryProductionReportsBuildPausedOutsideHome`: right after `setStrategicInfrastructureForHex(...)`, queue one infantry with `replaceBuildQueueForHex(hex.h3Index, [{ unitType: 'infantry', remainingCount: 1 }]);`. Import it from `../gameDb` if it is not already imported. Under a queue that is empty, the hex no longer counts as paused. After the `buildPaused` assert, add:

```ts
assert.deepEqual(production && 'pausedReasons' in production ? production.pausedReasons : undefined, [
  'occupying units or fortifications required',
]);
assert.equal(typeof (production && 'storedPoints' in production ? production.storedPoints : undefined), 'number');
```

    Update that function's orienting block to mention the reasons and banked points.

- [x] **Step 2: Run and confirm failure.** Build, `npm run rebuild:native:node` if needed, then run both test files. Expected: the new asserts fail because `pausedReasons` is undefined.

- [x] **Step 3: Main-side helpers** in `src/main/gameActions/productionBuildability.ts`. Both need orienting blocks, and both log with `logTrace`.

```ts
export function readMaxedUnitTypesForSeat(seatId: SeatId): Set<BuildUnitType> {
  logTrace('gameActions readMaxedUnitTypesForSeat', { seatId });
  const caps = readPersistedMaxUnitsPerType({ run: dbRun, getOne: dbGetOne });
  const rows = dbGetAll<{ unitType: string; count: number }>(
    `SELECT unit_type AS unitType, COUNT(*) AS count
     FROM units
     WHERE player = ? AND is_mercenary = 0
     GROUP BY unit_type`,
    [seatId]
  );
  const maxed = new Set<BuildUnitType>();
  for (const row of rows) {
    if (isBuildUnitType(row.unitType) && row.count >= caps[row.unitType]) maxed.add(row.unitType);
  }
  return maxed;
}

export function readQueuePauseReasonsForHex(args: {
  readonly seatId: SeatId;
  readonly h3Index: string;
  readonly buildable: boolean;
  readonly fortifiableCount: number;
  readonly queueRows: readonly { readonly id: number; readonly queueIndex: number; readonly unitType: string }[];
  readonly keepBuildingUnitType: string | null;
  readonly maxedUnitTypes: ReadonlySet<string>;
}): QueuePauseReason[] {
  logTrace('gameActions readQueuePauseReasonsForHex', { seatId: args.seatId, h3Index: args.h3Index });
  const next = [...args.queueRows].sort((a, b) => a.queueIndex - b.queueIndex || a.id - b.id)[0];
  const nextItemType = next ? next.unitType : args.keepBuildingUnitType;
  return listQueuePauseReasons({
    buildable: args.buildable,
    nextItemType,
    fortifiableLeft: isNeutralBorderHex(args.h3Index) ? 0 : args.fortifiableCount,
    maxedUnitTypes: args.maxedUnitTypes,
  });
}
```

  `buildable` is the caller's `isHexBuildableNow` result. The caller already computes it, so this helper does not query again. `maxedUnitTypes` is the caller's set. This helper does not query for it. `readMaxedUnitTypesForSeat` remains for a caller that has no set yet.

  Imports: `dbRun` from `../gameDb` (beside `dbGetAll` and `dbGetOne`), `readPersistedMaxUnitsPerType` from `../gameDb/gameSizeConfig`, `isBuildUnitType` and `type BuildUnitType` from `../../shared/ipc/productionTypes`, `isNeutralBorderHex` from `../../shared/h3Resolutions`, `listQueuePauseReasons` from `../../shared/queuePauseReasons`, and `type QueuePauseReason` from `../../shared/queuePauseTypes`. Use the same import paths the production pass uses for these. `readQueuePauseReasonsForHex` does not need `isBuildUnitType` once the caller owns the cap set. Drop that import from this function if nothing else in the new code uses it. Keep it if `readMaxedUnitTypesForSeat` uses it.

- [x] **Step 4: The view** (`buildQueue.ts`, `buildQueueViewForRequester`).
  - Add an optional third argument, `maxedUnitTypes?: ReadonlySet<string>`, to `buildQueueViewForRequester`, to `readHexBuildQueue`, and to `getHexBuildQueue` in `gameActionsCore.ts`. `getHexBuildQueue` only forwards it. That file is already over 600 lines; do not restructure it.
  - Before the `return`, add:

```ts
  const queueRows = listBuildQueueRowsForHex(h3Index);
  const seatId = controlledByRequester && isSeatId(requestingPlayerId) ? requestingPlayerId : null;
  const buildableNow = seatId === null || isHexBuildableNow(seatId, h3Index, infra.fortifiedCount);
  const maxed =
    maxedUnitTypes ??
    (seatId !== null && productionView.urbanHexCount > 0
      ? readMaxedUnitTypesForSeat(seatId)
      : new Set<string>());
```

  - Use `queueRows` in the existing `entries:` mapping in place of the inline `listBuildQueueRowsForHex(h3Index)` call.
  - Replace the existing `buildPaused` spread with the two spreads below. `buildPaused` keeps its exact meaning; only the repeated check is removed. Pass `maxed` through. A caller that passed a set, including an empty one, must not also hit the database.

```ts
    ...(seatId !== null && !buildableNow ? { buildPaused: true as const } : {}),
    ...(seatId !== null && productionView.urbanHexCount > 0
      ? {
          pausedReasons: readQueuePauseReasonsForHex({
            seatId,
            h3Index,
            buildable: buildableNow,
            fortifiableCount: infra.fortifiableCount,
            queueRows,
            keepBuildingUnitType: standing.keepBuilding ? standing.keepBuildingUnitType : null,
            maxedUnitTypes: maxed,
          }),
        }
      : {}),
```

  - Add the field to the `HexBuildQueueView` interface after `buildPaused`, with a full block. Contract: "Present only when the requester controls a hex with city cells. Empty when nothing is queued or nothing blocks the next item." When to use: "The build popup's paused note and `query_production`." Import `readQueuePauseReasonsForHex` beside `isHexBuildableNow`, and the `QueuePauseReason` type.
  - Add the same optional field, `pausedReasons?: readonly QueuePauseReason[];`, with the same block, to `HexBuildQueueSnapshot` in `src/shared/ipc/productionTypes.ts`, after `buildPaused`. Import the type from `../queuePauseTypes`.
  - In `queryProduction`, pass the `maxedTypes` set it already built into both `getHexBuildQueue` calls. That set comes from the snapshot, which is the same set `filterQueueableUnitTypes` uses, so a cap pause and the available-types list cannot disagree. Do not call `readMaxedUnitTypesForSeat` on that path.

- [x] **Step 5: `query_production`** (`productionTools.ts`, `summarizeQueue`). Replace the `buildPaused` spread with:

```ts
    ...(queue.controlledByRequester
      ? {
          buildPaused: queue.buildPaused === true,
          ...((queue.pausedReasons ?? []).length > 0
            ? { pausedReasons: (queue.pausedReasons ?? []).map((reason) => QUEUE_PAUSE_REASON_TEXT[reason]) }
            : {}),
          storedPoints: Math.max(0, Math.trunc(queue.storedPoints)),
        }
      : {}),
```

  Import `QUEUE_PAUSE_REASON_TEXT` from `../../shared/queuePauseReasons`. Update the function's Expected outcome to name the two new fields and say `pausedReasons` is omitted when empty.

- [x] **Step 6: Snapshot row type** (`productionQueueSnapshotTypes.ts`, `ControlledHexQueueSnapshot`). After `buildPaused`, add `pausedReasons?: unknown;` and `storedPoints?: unknown;` with full blocks. `pausedReasons`: "Reason texts from `QUEUE_PAUSE_REASON_TEXT`. Present on the requester's hexes only when at least one reason applies." `storedPoints`: "Banked production points on the hex."

- [x] **Step 7: Docs.** In `doc/ai-tools.md`, `query_production`: after the fortified and fortifiable counts, add "`buildPaused`, `pausedReasons` (each reason's text, from `QUEUE_PAUSE_REASON_TEXT`; omitted when nothing is queued or nothing blocks the next item), and `storedPoints` (banked points) for hexes you control". In the `set_build_queue` bullet, change "A queue the seat controls reports `buildPaused` when building is paused there." to "A queue the seat controls reports `buildPaused`, `pausedReasons`, and `storedPoints`, as `query_production` does." Both tools return the same `summarizeQueue` row.

- [x] **Step 8: Verify.**

```powershell
npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/productionBuildabilityFlow.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/tools/productionTools.test.js
```

  Expected: both pass, including `productionTools.test.ts passed`.

---

## Phase 4: The Build Popup Note

**Files:** `src/renderer/gameplay/buildQueuePopupFormatting.ts`, `src/renderer/gameplay/buildQueuePopup.ts`, `src/shared/productionBuildability.ts`, `doc/ux/build-popup.md`, `doc/how-to-play.md`.

- [x] **Step 1: Formatting helper.** In `buildQueuePopupFormatting.ts`, replace `createBuildPausedNote()` with `createQueuePausedNote(text: string): HTMLDivElement`. It builds the same `div.build-no-urban` and sets `textContent` to `text`. Rewrite its block: Purpose, "The player sees in one line why the queue is not spending." When to use, "When `formatQueuePausedNote` returns text for a hex the viewer controls." Remove the `BUILD_PAUSED_NOTE` import.

- [x] **Step 2: Popup.** In `buildQueuePopup.ts`, replace:

```ts
    if (snapshot.controlledByRequester && snapshot.buildPaused === true) {
      section.appendChild(createBuildPausedNote());
    }
```

  with:

```ts
    const pausedNote = snapshot.controlledByRequester ? formatQueuePausedNote(snapshot.pausedReasons ?? []) : null;
    if (pausedNote) section.appendChild(createQueuePausedNote(pausedNote));
```

  Fix the imports: `formatQueuePausedNote` comes from `../../shared/queuePauseReasons`. The note stays where the old one was.

- [x] **Step 3: Remove the old note.** Delete `BUILD_PAUSED_NOTE` and its block from `src/shared/productionBuildability.ts`.

- [x] **Step 4: Docs.**
  - `doc/ux/build-popup.md`: after the "Queue cost" bullet, add: "- When the queue is paused, one line names every reason that applies: `Queue paused: occupying units or fortifications required.`, `every city cell fortified`, or `unit cap reached`, joined with a serial comma (`formatQueuePausedNote` in `src/shared/queuePauseReasons.ts`). A queue counts as paused only when it has an entry or Keep building is armed."
  - `doc/how-to-play.md`, **Where you can build:** after "Elsewhere the queue pauses.", add "The build popup says `Queue paused: occupying units or fortifications required.`"
  - Same file, fortification step 3: change it to "When every such cell is fortified, that queue pauses, and the popup says `Queue paused: every city cell fortified.` **Keep building** can still be on."
  - Same file, **A queue can pause:** add a sentence at the end: "A queue whose next unit type is at your unit cap also waits, and its popup says `unit cap reached`."

- [x] **Step 5: Verify.**

```powershell
npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm run check:renderer-types; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npx eslint src/renderer/gameplay/buildQueuePopup.ts src/renderer/gameplay/buildQueuePopupFormatting.ts src/shared/productionBuildability.ts
```

  Expected: clean. Grep `src/` for `BUILD_PAUSED_NOTE` and `createBuildPausedNote`; both must return nothing.

---

## Phase 5: Mark Raise Options That Restart Building

**Files:** `src/main/openRouter/briefingSectionsMercenaries.ts`, `src/main/openRouter/briefingSectionsMercenaries.test.ts`, `doc/ai-commander-prompts/strategic-prompt.md`.

- [x] **Step 1: Write the test first.** Add this test to `briefingSectionsMercenaries.test.ts`. Add `dbGetAll`, `dbRun`, and `setHexController` to the `../gameDb` import, and import `isNeutralBorderHex` from `../../shared/h3Resolutions`.

```ts
test('a raise cell that would restart a paused city is marked and listed first', () => {
  withTempGameDb('aw-brief-merc-resume-', () => {
    const seat = AI_SEAT_IDS[0];
    const homes = new Set(getSeatRoster().flatMap((row) => getScenarioHomeRegionHexes(row.homeRegion)));
    const hex = dbGetAll<{ h3Index: string }>(
      'SELECT h3_index AS h3Index FROM res_s_infrastructure WHERE urban_hex_count >= 10 AND fortified_count = 0'
    )
      .map((row) => row.h3Index)
      .find((h3Index) => !homes.has(h3Index) && !isNeutralBorderHex(h3Index));
    assert.ok(hex, 'fixture needs a city outside every home');
    setHexController(hex, seat);
    dbRun('DELETE FROM units WHERE h3_index = ?', [hex]);
    setTreasuryCredits(seat, 40);
    const loaded = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
    const state = { ...loaded, exploredHexes: [...new Set([...(loaded.exploredHexes ?? []), hex])] };
    const block = buildMercenariesBriefingBlock(state, (h3Index) => h3Index, 'strategic', { productionEnabled: true });
    assert.ok(block.includes('| Hex | Capacity | Resumes building | Options |'), block);
    const raiseRows = block
      .slice(block.indexOf('## Raise Options'))
      .split('\n')
      .filter((line) => line.startsWith('| ') && !line.startsWith('| Hex |') && !line.startsWith('| --- |'));
    const hexIndex = raiseRows.findIndex((line) => line.startsWith(`| ${hex} | `));
    const firstNo = raiseRows.findIndex((line) => line.includes(' | no | '));
    assert.ok(hexIndex >= 0, raiseRows.join('\n'));
    assert.ok(raiseRows[hexIndex]?.includes(' | yes | '), raiseRows[hexIndex]);
    assert.ok(firstNo === -1 || hexIndex < firstNo, 'yes rows must sort before no rows');
  });
});
```

  An infantry raise needs capacity 20, and capacity is twice the city cells, so the fixture needs at least 10 city cells. If no such hex exists in the seeded map, stop and report. The explored list is de-duplicated so the hex is not listed twice. The order assert allows other `yes` rows, which a seeded map may have.

- [x] **Step 2: Run and confirm failure.** Build, then run `node dist/main/openRouter/briefingSectionsMercenaries.test.js`. Expected: the new test fails on the header assert.

- [x] **Step 3: Implement.**
  - In `buildMercenariesBriefingBlock`, before the Raise Options line, add `const resumable = listOccupationPausedHexes(state, ownSeat);`. Pass it to `raiseTable` as a fifth argument. Import the helper from `../../shared/productionBuildability`.
  - In `raiseTable`, add the parameter `resumable: ReadonlySet<string>`. Give each row `resumes: resumable.has(h3Index)`. Sort with `Number(right.resumes) - Number(left.resumes)` first, then the existing distance and index comparisons. The slice to `MERCENARY_BRIEFING_MAX_ROWS` stays after that sort. Headers become `['Hex', 'Capacity', 'Resumes building', 'Options']`, and each row becomes `[format(row.h3Index), String(row.capacityLeft), row.resumes ? 'yes' : 'no', row.text]`.
  - Update `raiseTable`'s orienting block: "Cells that would restart a paused city sort first and show `yes` under Resumes building."

- [x] **Step 4: Docs.**
  - `doc/ai-commander-prompts/strategic-prompt.md`, `# Mercenaries`, **Content:** add "The Raise Options table's columns are `Hex`, `Capacity`, `Resumes building`, and `Options`. `Resumes building` is `yes` for a cell where the seat has city cells but cannot build for lack of occupying units or fortifications (`listOccupationPausedHexes`). Those rows sort first."
  - Search `doc/ai-commander-prompts/` for any other listing of the Raise Options columns and add the new column there. None is known; if the search finds none, skip this bullet.

- [x] **Step 5: Verify.** `npm run build:main`, then `node dist/main/openRouter/briefingSectionsMercenaries.test.js`. Expected: all three tests pass.

---

## Phase 6: Paused Queues in the Situation Message

**Files:** create `src/main/openRouter/pausedProductionAttention.ts` and `src/main/openRouter/pausedProductionAttention.test.ts`. Edit `src/main/openRouter/promptSpec/sectionHeadings.ts`, `src/main/openRouter/promptSpec/sectionHeadings.test.ts`, `src/main/openRouter/briefingSections.ts`, `src/main/openRouter/requestOrdersInjection.ts`, `src/main/openRouter/consultPromptParts.ts`, `src/main/openRouter/requestOrdersFlow.ts`, `src/main/briefingFormatter.ts`, `doc/ai-tools.md`, and the prompt documents named below.

**Produces:** `SECTION_TITLE_PAUSED_QUEUES`, `PausedProductionHex`, `findPausedProductionHexes`, `formatPausedQueuesSection`, `formatPausedProductionPointer`, `PAUSED_OCCUPATION_REMEDY`, `PAUSED_FORTIFICATION_REMEDY`, and the `pausedProductionAttention` field.

- [x] **Step 1: Write the tests first** in `pausedProductionAttention.test.ts` (`node:test`, file header in the usual style).

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QUEUE_PAUSE_REASON_TEXT } from '../../shared/queuePauseReasons';
import {
  SECTION_TITLE_PAUSED_QUEUES,
  SECTION_TITLE_PRODUCTION_STATUS,
} from './promptSpec/sectionHeadings';
import {
  PAUSED_FORTIFICATION_REMEDY,
  PAUSED_OCCUPATION_REMEDY,
  findPausedProductionHexes,
  formatPausedProductionPointer,
  formatPausedQueuesSection,
} from './pausedProductionAttention';
import type { ControlledHexQueueSnapshot } from './productionQueueSnapshotTypes';

const occupied = QUEUE_PAUSE_REASON_TEXT.occupation;
const full = QUEUE_PAUSE_REASON_TEXT.allCellsFortified;
const capped = QUEUE_PAUSE_REASON_TEXT.unitCap;
const label = (ll: [number, number]): string => `H${ll[0]}`;
const pointer = `Paused queues: see ${SECTION_TITLE_PAUSED_QUEUES} under ${SECTION_TITLE_PRODUCTION_STATUS}.`;

function row(id: number, reasons: readonly string[], storedPoints: number): ControlledHexQueueSnapshot {
  return { hex: [id, 0], availableUnitTypes: [], entries: [], pausedReasons: [...reasons], storedPoints };
}

test('paused hexes keep occupation and full-city pauses and leave cap-only pauses to the idle flag', () => {
  const paused = findPausedProductionHexes(
    [
      row(3, [occupied], 40),
      row(1, [occupied], 25),
      row(2, [full], 0),
      row(4, [capped], 7),
      row(5, [], 9),
      row(6, [occupied, full], 10),
      row(8, [occupied, capped], 5),
    ],
    label
  );
  assert.deepEqual(paused.map((hex) => hex.hexText), ['H3', 'H1', 'H2', 'H6', 'H8']);
  assert.equal(
    formatPausedQueuesSection(paused),
    [
      'Queues paused at H1 and H3: occupying units or fortifications required.',
      'Queue paused at H6: occupying units or fortifications required and every city cell fortified.',
      'Queue paused at H8: occupying units or fortifications required and unit cap reached.',
      'Queue paused at H2: every city cell fortified.',
      '80 banked production points are waiting in these cells.',
      PAUSED_OCCUPATION_REMEDY,
      PAUSED_FORTIFICATION_REMEDY,
    ].join('\n\n')
  );
  assert.equal(formatPausedProductionPointer(paused), pointer);
});

test('one point is singular, zero points are omitted, and nothing paused is null', () => {
  assert.equal(
    formatPausedQueuesSection(findPausedProductionHexes([row(7, [occupied], 1)], label)),
    [
      'Queue paused at H7: occupying units or fortifications required.',
      '1 banked production point is waiting in this cell.',
      PAUSED_OCCUPATION_REMEDY,
    ].join('\n\n')
  );
  assert.equal(
    formatPausedQueuesSection(findPausedProductionHexes([row(7, [occupied], 1), row(2, [full], 0)], label)),
    [
      'Queue paused at H7: occupying units or fortifications required.',
      'Queue paused at H2: every city cell fortified.',
      '1 banked production point is waiting in these cells.',
      PAUSED_OCCUPATION_REMEDY,
      PAUSED_FORTIFICATION_REMEDY,
    ].join('\n\n')
  );
  assert.equal(
    formatPausedQueuesSection(findPausedProductionHexes([row(2, [full], 0)], label)),
    ['Queue paused at H2: every city cell fortified.', PAUSED_FORTIFICATION_REMEDY].join('\n\n')
  );
  assert.equal(formatPausedQueuesSection([]), null);
  assert.equal(formatPausedProductionPointer([]), null);
});
```

- [x] **Step 2: Run and confirm failure.** `npm run build:main` fails because the module does not exist. That is expected.

- [x] **Step 3: Create the heading constant and `pausedProductionAttention.ts`.**
  - In `sectionHeadings.ts`, next to `SECTION_TITLE_CONTROLLED_HEX_QUEUES`, add `SECTION_TITLE_PAUSED_QUEUES = 'Paused Queues' as const` with a full block. Purpose: the production section names paused queues under their own heading. When to use: `subHeading` in the production briefing, the attention pointer, and the coaching sentence. Expected outcome: the words `Paused Queues`.
  - In `sectionHeadings.test.ts`, import that constant, add `SECTION_TITLE_PAUSED_QUEUES: 'Paused Queues'` to `CURRENT_TITLES`, and assert the export equals that string. The existing test lists titles one by one, so a new export is not picked up on its own.
  - Give `pausedProductionAttention.ts` a file header (Purpose: "The situation message names the seat's paused queues, their banked points, and how to restart them, in the same sentences as the turn report, one paragraph each.") and a full block for every export.

```ts
import { formatQueuePausedLines, QUEUE_PAUSE_REASON_TEXT, queuePauseReasonForText } from '../../shared/queuePauseReasons';
import type { QueuePauseReason } from '../../shared/queuePauseTypes';
import { logTrace } from '../logger';
import { SECTION_TITLE_PAUSED_QUEUES, SECTION_TITLE_PRODUCTION_STATUS } from './promptSpec/sectionHeadings';
import type { ControlledHexQueueSnapshot } from './productionQueueSnapshotTypes';

export interface PausedProductionHex {
  readonly hexText: string | null;
  readonly reasons: readonly QueuePauseReason[];
  readonly storedPoints: number;
}

export const PAUSED_OCCUPATION_REMEDY =
  `To clear "${QUEUE_PAUSE_REASON_TEXT.occupation}", end a turn with one of your units in the cell, ` +
  'or raise a mercenary there (Raise Options shows yes under Resumes building).';

export const PAUSED_FORTIFICATION_REMEDY =
  `To clear "${QUEUE_PAUSE_REASON_TEXT.allCellsFortified}", replace that cell's queue with set_build_queue.`;

export function findPausedProductionHexes(
  rows: readonly ControlledHexQueueSnapshot[],
  formatHexLabel: (ll: [number, number]) => string
): PausedProductionHex[] {
  logTrace('pausedProductionAttention findPausedProductionHexes', { rowCount: rows.length });
  const paused: PausedProductionHex[] = [];
  for (const row of rows) {
    const texts = Array.isArray(row.pausedReasons) ? (row.pausedReasons as unknown[]).map((value) => String(value)) : [];
    const reasons = texts
      .map((text) => queuePauseReasonForText(text))
      .filter((reason): reason is QueuePauseReason => reason !== null);
    if (!reasons.includes('occupation') && !reasons.includes('allCellsFortified')) continue;
    const points = Number(row.storedPoints);
    const hex = Array.isArray(row.hex) ? (row.hex as [number, number]) : null;
    paused.push({
      hexText: hex ? formatHexLabel(hex) : null,
      reasons,
      storedPoints: Number.isFinite(points) ? Math.max(0, Math.trunc(points)) : 0,
    });
  }
  return paused;
}

export function formatPausedQueuesSection(paused: readonly PausedProductionHex[]): string | null {
  logTrace('pausedProductionAttention formatPausedQueuesSection', { pausedCount: paused.length });
  if (paused.length === 0) return null;
  const paragraphs = formatQueuePausedLines(paused.map((hex) => ({ hexCode: hex.hexText, reasons: hex.reasons })));
  const points = paused.reduce((sum, hex) => sum + hex.storedPoints, 0);
  const where = paused.length === 1 ? 'this cell' : 'these cells';
  if (points === 1) paragraphs.push(`1 banked production point is waiting in ${where}.`);
  else if (points > 1) paragraphs.push(`${points} banked production points are waiting in ${where}.`);
  if (paused.some((hex) => hex.reasons.includes('occupation'))) paragraphs.push(PAUSED_OCCUPATION_REMEDY);
  if (paused.some((hex) => hex.reasons.includes('allCellsFortified'))) paragraphs.push(PAUSED_FORTIFICATION_REMEDY);
  return paragraphs.join('\n\n');
}

export function formatPausedProductionPointer(paused: readonly PausedProductionHex[]): string | null {
  logTrace('pausedProductionAttention formatPausedProductionPointer', { pausedCount: paused.length });
  if (paused.length === 0) return null;
  return `Paused queues: see ${SECTION_TITLE_PAUSED_QUEUES} under ${SECTION_TITLE_PRODUCTION_STATUS}.`;
}
```

  The section helper returns the body only. The heading is added in step 4, with a blank line before it and a blank line after it. Do not join the paragraphs with a space.

  Block notes: each of the three `PausedProductionHex` fields needs its own full block (`hexText`: the briefing code, or null when the row has no center; `reasons`: in `QUEUE_PAUSE_REASON_ORDER` order; `storedPoints`: banked points, never negative). `findPausedProductionHexes` Purpose says hexes paused only by the cap are left to the Production idle flag. `formatPausedQueuesSection` Expected outcome: "Paragraphs separated by a blank line: one grouped pause sentence each, then banked points when above 0, then one remedy paragraph per reason present. One hex says `this cell`. More than one says `these cells`. Null when nothing is paused. No heading." `formatPausedProductionPointer` Expected outcome: "The one pointer sentence, or null when the section is omitted."

- [x] **Step 4: Production briefing** (`briefingSections.ts`, `buildProductionBriefing`).
  - Add `readonly pausedHexes: readonly PausedProductionHex[]` to the return type, and give every `return` a `pausedHexes` value. The off, error, and unavailable returns get `[]`.
  - After `const idleHexes = ...`, and before `if (queues.length === 0)`, add the paused hexes and the subsection. Both success returns then include `pausedHexes`. The empty-queue return keeps the subsection when it is non-null, which it is not when there are no rows.

```ts
  const pausedHexes = findPausedProductionHexes(queues as ControlledHexQueueSnapshot[], args.formatHexLabel);
  const pausedSection = formatPausedQueuesSection(pausedHexes);
  if (pausedSection) {
    lines.push('');
    lines.push(subHeading(SECTION_TITLE_PAUSED_QUEUES));
    lines.push('');
    lines.push(pausedSection);
  }
```

  - In the row normalizer (`normalizeControlledHexQueueRow`), change `building:` to `row.buildPaused === true || (Array.isArray(row.pausedReasons) && row.pausedReasons.length > 0) ? 'paused' : 'yes'`. Update the `building` field's block in the row interface: Expected outcome becomes "`paused` when the snapshot says building is paused or the row has any pause reason."
  - Update the function's block: "`pausedHexes` lists queues paused for occupation or a full city. The section text includes `### Paused Queues` only after `formatBriefing` shifts the heading."

- [x] **Step 5: Plumbing.**
  - `requestOrdersInjection.ts`: add `readonly pausedProductionAttention: string | null;` to `StatusInjectionTexts`, with a block whose Expected outcome is "Null unless production is on and a queue is paused for occupation or a full city. The sentence is the pointer, not the subsection." Fix the stale `productionAttention` block: "Names at most six idle hexes" becomes "Names up to `PRODUCTION_ATTENTION_LISTED_HEXES` idle hexes." Change the production-off fallback to `{ text: '', idleHexes: [], pausedHexes: [] }`. Return `pausedProductionAttention: args.productionEnabled ? formatPausedProductionPointer(production.pausedHexes) : null,`.
  - `consultPromptParts.ts`: in the object literal used when the attention is already supplied (`productionAttention: input.productionAttention ?? null,`), add `pausedProductionAttention: null,`. That path skips the injection and does not print Attention Flags. Leave the opening-message flag (`hasProductionAttention`) unchanged.
  - `requestOrdersFlow.ts`: in the options object passed to `formatBriefing`, add `pausedProductionAttention: injection.pausedProductionAttention,` after `productionAttention,`.
  - `briefingFormatter.ts`: add `pausedProductionAttention?: string | null;` to the options type after `productionAttention`, with a block ("The one-line pointer from `formatPausedProductionPointer`. Appended after the production bullet. The Paused Queues subsection is already inside the production section."). Nest the append:

```ts
    appendProductionAttentionBullet(
      appendProductionAttentionBullet(
        buildAttentionFlags(
          precomputed.unitAssessments,
          'strategic',
          standingOrdersActive,
          orderlessAction,
          airStrikeRowUnitIds
        ),
        sharedContext?.productionAttention ?? null
      ),
      sharedContext?.pausedProductionAttention ?? null
    )
```

  - If the TypeScript build names any other place that builds a `StatusInjectionTexts` object, add `pausedProductionAttention: null` there. Do not append the subsection here. It is already in `productionText`.

- [x] **Step 6: Docs.**
  - `doc/ai-commander-prompts/strategic-prompt.md`, Attention Flags, **Include:** after the production bullet text, add: "A one-line pointer may follow it: `Paused queues: see Paused Queues under Production Status.` `formatPausedProductionPointer` writes it. It does not name hexes. Like the production bullet, it does not count against the five-bullet cap."
  - Same file, Production Status, **Content order:** after resolution timing and before the queue table, add `Paused Queues` when any queue is paused for occupation or a full city. Say the builder emits it with `subHeading(SECTION_TITLE_PAUSED_QUEUES)`, so the situation message shows `### Paused Queues` and a standalone production section shows `## Paused Queues`. One blank line before the heading and one after. The body is one paragraph per grouped sentence, then banked points when the total is above 0 (`this cell` for one hex, `these cells` for more; `point is` for one point, `points are` for more), then one paragraph per remedy. Omit the heading when nothing qualifies. A cap-only pause stays in the idle flag.
  - Same file, Production Status: change "The table's last column is `Building` (`BUILD_STATUS_COLUMN_HEADER`), `paused` or `yes`." to "The table's last column is `Building` (`BUILD_STATUS_COLUMN_HEADER`): `paused` when `buildPaused` is true or the row has any pause reason, otherwise `yes`."
  - `doc/ai-tools.md`, the `set_build_queue` bullet: make the same change to "The production table's last column is `BUILD_STATUS_COLUMN_HEADER` (`Building`), `paused` or `yes`."
  - `doc/ai-commander-prompts/assembly-contract.md`, the `## Attention Flags` row: add "then at most one paused-queue pointer from `formatPausedProductionPointer`". Add a `### Paused Queues` row after the Production Status row: present in the situation message when production is on and a queue is paused for occupation or a full city; `## Paused Queues` when that section stands alone; omit otherwise. Say the paragraphs are the body from `formatPausedQueuesSection`.
  - `doc/ai-commander-prompts/information-decision-model.md`, decision 9 (**Keep production running**): add "the Paused Queues subsection" to what it needs.
  - Search `doc/ai-commander-prompts/source-inventory.md` for `formatProductionAttentionBullet` or the production bullet description, and add a sibling mention of `formatPausedProductionPointer` and `formatPausedQueuesSection`.

- [x] **Step 7: Verify.**

```powershell
npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/pausedProductionAttention.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/sectionHeadings.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/productionAttention.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/briefingSections.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/consultPromptParts.test.js
```

  Expected: all pass.

---

## Phase 7: The Buildability Rule and the Coaching Sentence

**Files:** `src/main/openRouter/promptSpec/gameRuleMercenaryText.ts`, `src/main/openRouter/briefingSections.ts`, `src/main/openRouter/promptSpec/coachingTextStrategic.ts`, `src/main/openRouter/promptContracts.test.ts`, `doc/ai-commander-prompts/example-strategic-prompt.md`, `doc/ai-commander-prompts/information-decision-model.md`, `doc/ai-commander-prompts/strategic-prompt.md`.

- [x] **Step 1: Write the asserts first** in `promptContracts.test.ts`.
  - At the end of `testProductionGuidanceSkipsTypesAtDeploymentCap`, add:

```ts
assert.ok(
  guidance.includes('When an attention bullet names paused queues, apply the fix in Paused Queues under Production Status.'),
  'production guidance must point at the Paused Queues subsection'
);
```

  - Add a function `testBuildabilityRuleNamesTheFix` (with a block) that asserts `buildBuildabilityRule()` equals the two paragraphs below, joined by a blank line. Call it from `run()` next to `testProductionGuidanceSkipsTypesAtDeploymentCap()`. Import `buildBuildabilityRule` from `./promptSpec/gameRuleMercenaryText`.

```ts
[
  'You can build only in your home region and in cells that hold one of your units or fortifications at the end of the turn.',
  'Elsewhere a queue pauses and keeps banking its points until you end a turn with a unit there or raise a mercenary there.',
].join('\n\n')
```

- [x] **Step 2: Run and confirm failure.** Build, then run `node dist/main/openRouter/promptContracts.test.js`. Expected: the first new assert fails.

- [x] **Step 3: Implement.**
  - `buildBuildabilityRule()` returns the two paragraphs in the test, joined by `\n\n`. Update its block: Purpose says the second paragraph names the fix. Expected outcome says two paragraphs separated by a blank line, not one sentence.
  - In `buildProductionBriefing`, replace `lines.push(buildBuildabilityRule())` with a blank line, the rule, and a blank line:

```ts
  lines.push('');
  lines.push(buildBuildabilityRule());
  lines.push('');
```

    A single newline would glue the first paragraph to the income rule. The blank lines keep them separate. The rule's own `\n\n` keeps its two paragraphs separate.
  - `PRODUCTION_BULLET` in `coachingTextStrategic.ts`: append `'\n\n  When an attention bullet names paused queues, apply the fix in Paused Queues under Production Status.'` after the Production attention flag sentence. That is its own indented paragraph inside the existing bullet. Do not add a heading. Update the block's Expected outcome. Import the two titles from `./sectionHeadings` and interpolate them, so the coaching sentence cannot drift from the heading. The words must match the pointer.

- [x] **Step 4: Docs.**
  - `doc/ai-commander-prompts/example-strategic-prompt.md`: replace the buildability sentence (near line 488) with the two paragraphs, and leave a blank line before them, between them, and after them. Do not invent a Paused Queues block in that reading copy. That consultation had no paused queue, so omitting the subsection is correct. Then search the file for the production coaching block and add `When an attention bullet names paused queues, apply the fix in Paused Queues under Production Status.` as its own indented paragraph after `it names the hexes to queue and the types they can still build`.
  - `doc/ai-commander-prompts/information-decision-model.md`, the `PRODUCTION_INCOME` row: replace "elsewhere it pauses and keeps banking" with "the next paragraph says that elsewhere it pauses and keeps banking until a unit ends the turn there or a mercenary is raised there".
  - `doc/ai-commander-prompts/strategic-prompt.md`, item 11, **Keep production queued.**: after `it names the hexes to queue and the types they can still build.`, add `When an attention bullet names paused queues, apply the fix in Paused Queues under Production Status.` Say that sentence is its own paragraph inside the bullet.

- [x] **Step 5: Verify.** `npm run build:main`, then `node dist/main/openRouter/promptContracts.test.js`. Expected: the file's success line and no assertion failure.

---

## Phase 8: Final Verification

```powershell
npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm run build:renderer; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm run lint; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm run naming:check; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm run check:renderer-types; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm run check:circular
```

Then:

- Grep `src/` and `doc/` (not `doc/release-notes/`) for `Building is paused`, `build queues are paused`, `so its build queue is paused`, `BUILD_PAUSED_NOTE`, `createBuildPausedNote`, `formatBuildPausedLine`, `formatFortificationQueuePausedLine`, and `placeNamesForHexes`. Each must return nothing.
- Grep `src/` for `Phase` in files this plan touched. Nothing new may appear.
- Check every file this plan touched is under 600 lines, or was already over 600 before and grew by no more than the lines this plan names.
- Optionally run the full `npm test` (about 30 minutes). It rebuilds the native module itself.

**Manual checks for the user** (the agent cannot run the game). List these in the summary:

1. Capture a city outside your home, queue infantry, and move your units out. The popup says `Queue paused: occupying units or fortifications required.` After Ready, Updates says `Queue paused at {code}: occupying units or fortifications required.` After the next Ready, with the city still empty, Updates does not name it again, but the popup still shows the note. Move a unit in and let it build, then move out again: the line returns on the turn it pauses.
2. Load a save made before this change and press Ready. Every paused queue is named once. On the following turn, only new pauses are named.
3. In a home city, fortify every cell and queue one more fortification. The popup says `Queue paused: every city cell fortified.`
4. With prompt logging on (see the README's prompt-debugging section), run one AI turn in a match where the AI holds a paused captured city. In the user prompt, Production Status has `### Paused Queues`, with a blank line around the heading and a blank line between the grouped sentence, the banked points, and the remedy. Attention Flags has one line, `Paused queues: see Paused Queues under Production Status.`, and does not repeat those paragraphs. In the cached system prompt, the production coaching bullet has that pointer sentence as its own indented paragraph. Raise Options shows `Resumes building` with `yes` on that city's row when a raise is possible there.

**Final summary for the user:**

- Name every changed, created, and deleted source file, grouped by phase.
- Name every changed doc.
- State the behavior changes: an empty queue in an unoccupied city no longer shows a paused note, and the turn report names a paused queue only on the turn it pauses. The situation message gains `### Paused Queues` and a one-line Attention Flags pointer. The cached coaching bullet gains one paragraph that points at that subsection. Saves from before this change still load; their first turn names every paused queue once.
- State that `buildPaused`, the map label `∞t`, the Production idle flag, and the opening-message pointer were left unchanged.
- Do not commit.
