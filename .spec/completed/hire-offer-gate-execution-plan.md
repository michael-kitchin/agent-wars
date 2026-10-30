# Hire Offer Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. Do not commit or push. Do not copy task names into product code, comments, configuration, or `doc/`.

**Goal:** The Hire tab offers a new raise only when one unit fits both remaining production capacity and the present treasury, and a click cannot add a raise that fails either check.

**Architecture:** A shared classifier decides whether any one-unit raise fits. The hire view uses it to omit the raise row and to carry the shortage sentence. The panel paints that sentence when the row is absent. When the row is present, the sentence appears only after Hire is clicked, and the click does not call placement. Placement runs the same per-count check before it spends credits or inserts a row.

**Tech Stack:** TypeScript, Electron main process, renderer bundle built by esbuild, node:test.

**Spec:** This plan is the spec. On execution, save it unchanged in purpose to [`.spec/hire-offer-gate-execution-plan.md`](.spec/hire-offer-gate-execution-plan.md) before editing product code. Leave [`.spec/active-treasury-hire-execution-plan.md`](.spec/active-treasury-hire-execution-plan.md) and [`.spec/completed/`](.spec/completed/) as they are.

## Global Constraints

- Exact sentences, and no others: `Not enough credits.` / `Not enough production capacity.` / `Not enough credits or production capacity.` They already exist as `HIRE_SHORT_CREDITS`, `HIRE_SHORT_PRODUCTION`, and `HIRE_SHORT_BOTH` in [`src/shared/mercenaryRules.ts`](src/shared/mercenaryRules.ts).
- Player-facing amounts stay behind `formatCreditsAmount` and `formatProductionCapacityAmount`. Do not paste currency or production symbols at call sites.
- Do not change rehire rows, payroll, the top-bar short color, the end-of-turn fill, `EXPECTED_USER_VERSION` (26), queue spacing, or `appendOrders`.
- Do not change `raiseTable` in [`src/main/openRouter/briefingSectionsMercenaries.ts`](src/main/openRouter/briefingSectionsMercenaries.ts). The briefing may still name a type the treasury cannot pay. Placement refuses that request. `query_mercenaries` returns `readHexHireView`, so its raise list and `raiseShortage` follow this plan. [`doc/ai-tools.md`](doc/ai-tools.md) does not name `capacityFloorFee`; leave it.
- `RAISE_REASON_CAPACITY_USED` stays unshown. Other blocked sentences (occupied, fortified, not explored) stay.
- `Production (Hire)` stays hidden when the raise row is hidden. That is the current rule in `appendFunds`, and this plan keeps it.
- Renderer UI has no logger. New shared functions are pure. A new or updated public main-process method logs at debug on entry; this plan should not need a new public method.
- Orienting comments on every new or updated function. Tests cover the happy path and the essential failures only.
- Do not commit or push. PowerShell does not accept `&&`. After main-process tests that load `better-sqlite3`, run `npm run rebuild:native:electron` so the app can start. After renderer or shared edits the bundle uses, run `npm run build:renderer`. Do not hand-edit `static/renderer.js`.

## Decisions already made

- The raise row is the type dropdown, the count field, and the Hire button. Hide all three together, or show all three together.
- Show that row when at least one offered type can be hired at count 1: its `unitCost` is less than or equal to `capacityLeft`, and its `fee` is less than or equal to the present balance (`hireShortageLabel` treats a fee of 0 as not a credit shortage). The dropdown lists only those types.
- When no type fits at count 1, hide the row and show the shortage sentence immediately. There is no button to click in that state.
- When the row is visible, do not update the shortage sentence while the player changes the type or the count. A mistyped count stays quiet until Hire is clicked. The click shows the sentence for that type and count and does not add the order.
- Changing the type or the count after that click removes the sentence.
- Rehire keeps its own Hire buttons. A rehire still does not use production capacity. The server still refuses a rehire the balance cannot pay.
- Neutral units, the Hire Queue, and the remove control stay visible in every case above.

## What is already true

[`placeRaise`](src/main/gameActions/hireOrders.ts) already returns `RAISE_REASON_CAPACITY` (`That would raise more than this hex can raise this turn.`) when `option.unitCost * request.count > capacityLeft`, and it does that before `insertReservedOrder` spends credits. The Hire tab does not treat that as the shortage label: the button still submits, and the toast is a different sentence. The panel also shows the shortage sentence live while the count changes ([`paintRaiseShortage`](src/renderer/gameplay/hirePanel.ts)). The dropdown is hidden only when no type's one-unit cost fits capacity ([`capacityFloorFee`](src/main/gameActions/hireOrders.ts)); a balance that cannot pay a type that does fit capacity still shows the dropdown.

## Files

- [`src/shared/mercenaryRules.ts`](src/shared/mercenaryRules.ts) — `oneUnitRaiseShortage`.
- [`src/shared/mercenaryRules.test.ts`](src/shared/mercenaryRules.test.ts) — classifier tests.
- [`src/main/gameActions/hireOrders.ts`](src/main/gameActions/hireOrders.ts) — view filter, `raiseShortage`, placement refusal.
- [`src/shared/ipc/mercenaryTypes.ts`](src/shared/ipc/mercenaryTypes.ts) — replace `capacityFloorFee` with `raiseShortage`.
- [`src/renderer/gameplay/hirePanel.ts`](src/renderer/gameplay/hirePanel.ts) — hide the row, paint the sentence only in the two cases above.
- [`src/main/mercenaryTurnFlow.test.ts`](src/main/mercenaryTurnFlow.test.ts) — an over-capacity raise is not stored and does not spend.
- [`doc/ux/build-popup.md`](doc/ux/build-popup.md) — the Hire panel bullet only.

## Review focus

- Hiding the row because of credits must not also show `HIRE_REASON_NOTHING_HERE` or `RAISE_REASON_CAPACITY_USED`.
- A click refusal must not call `placeHireOrder`. A server refusal must not insert and must not spend.
- `hireAvailable` must count `raiseShortage`. On a build hex, a false value removes the Hire tab, so a credits shortage would hide the sentence.
- Equal balance and equal capacity are enough. A fee of 0 is not a credit shortage.
- Do not filter rehire rows with this classifier.

```mermaid
flowchart TD
  offers[Raise options on this hex]
  oneUnit[oneUnitRaiseShortage]
  offers --> oneUnit
  oneUnit -->|some type fits at count 1| row[Show dropdown count and Hire]
  oneUnit -->|none fit| immediate[Show the shortage sentence and hide the row]
  row --> click[Hire click]
  click --> countCheck[hireShortageLabel for the typed count]
  countCheck -->|null| place[placeRaise]
  countCheck -->|sentence| clickLabel[Show that sentence and do not place]
  place --> serverCheck[Same hireShortageLabel before spend]
  serverCheck -->|null| store[Reserve the fee and insert]
  serverCheck -->|sentence| refuse[Return that sentence and do not insert]
```

## Phase 1 — Classify a one-unit offer

**Produces:** A pure function whose tests name every sentence. No panel or database change yet.

- [x] Add this next to `hireShortageLabel` in [`src/shared/mercenaryRules.ts`](src/shared/mercenaryRules.ts):

```ts
export interface OneUnitRaiseOffer {
  readonly unitCost: number;
  readonly fee: number;
}

export function oneUnitRaiseShortage(
  offers: readonly OneUnitRaiseOffer[],
  capacityLeft: number,
  balance: number
): string | null
```

- [x] Use this body. The fit check comes first. A list where one offer fails capacity and another fails credits must not be classified from the first offer alone.

```ts
if (offers.length === 0) return null;
if (offers.some((offer) => hireShortageLabel(balance, offer.fee, offer.unitCost, capacityLeft) == null)) {
  return null;
}
const capacityFits = offers.some((offer) => offer.unitCost <= capacityLeft);
const creditsFit = offers.some((offer) => !(offer.fee > 0 && offer.fee > balance));
if (capacityFits && !creditsFit) return HIRE_SHORT_CREDITS;
if (!capacityFits && creditsFit) return HIRE_SHORT_PRODUCTION;
return HIRE_SHORT_BOTH;
```

- [x] An empty list returns null so occupied, fortified, and no-capacity hexes keep their existing sentences. Those callers must not ask this function to replace those sentences.
- [x] Comment: the Hire tab uses this to decide whether to show the raise row. Null means the row can be shown. A sentence means the row stays hidden and that sentence is the whole explanation. No exceptions.
- [x] Update the `hireShortageLabel` comment so it no longer says a hidden select passes a production cost of 1 and capacity 0. It now describes the selected type and count, including the count checked on Hire click.
- [x] Tests in [`src/shared/mercenaryRules.test.ts`](src/shared/mercenaryRules.test.ts), using offers shaped like basic infantry (`unitCost` 20, `fee` 3) and a second type (`unitCost` 40, `fee` 5):
  - `( [{20, 3}], 20, 3 )` returns null.
  - `( [{20, 3}], 0, 3 )` returns `HIRE_SHORT_PRODUCTION`.
  - `( [{20, 3}], 20, 0 )` returns `HIRE_SHORT_CREDITS`.
  - `( [{20, 3}], 0, 0 )` returns `HIRE_SHORT_BOTH`.
  - `( [{20, 3}, {40, 5}], 20, 3 )` returns null, because the first offer fits.
  - `( [{20, 3}, {40, 5}], 20, 0 )` returns `HIRE_SHORT_CREDITS`.
  - `( [{20, 5}, {40, 3}], 20, 3 )` returns `HIRE_SHORT_BOTH`, because the cheap fee does not fit capacity and the fitting cost does not fit the balance.
  - `( [], 0, 0 )` returns null.
- [x] Verify: `npm run build:main` then `node --test dist/shared/mercenaryRules.test.js`. This test file does not load `better-sqlite3`.

## Phase 2 — Refuse the raise before it is stored

**Produces:** A count the hex cannot produce, or a fee the balance cannot pay, does not insert a row and does not change the treasury. The failure reason is one of the three sentences.

- [x] In [`src/main/gameActions/hireOrders.ts`](src/main/gameActions/hireOrders.ts), add `getTreasuryCredits` to the existing import from [`src/main/gameDb/mercenaryState.ts`](src/main/gameDb/mercenaryState.ts). Call `getTreasuryCredits(gameDbOps, seatId)`. That function takes the database ops and the seat. Do not import the seat-only wrapper from `mercenaryStateAccess.ts`. This file does not import `getTreasuryCredits` today.
- [x] Remove the `RAISE_REASON_CAPACITY` import from this file. Leave the constant defined in [`src/shared/mercenaryRules.ts`](src/shared/mercenaryRules.ts). This path no longer returns it.
- [x] In `placeRaise`, after the option is found and before `insertReservedOrder`, replace the `RAISE_REASON_CAPACITY` return with:

```ts
const shortage = hireShortageLabel(
  getTreasuryCredits(gameDbOps, seatId),
  option.fee * request.count,
  option.unitCost * request.count,
  evaluated.capacityLeft
);
if (shortage) return failure(shortage);
```

- [x] Do not spend first. `insertReservedOrder` still returns `HIRE_SHORT_CREDITS` if the balance changes before the spend. Update the `placeRaise` comment so it names the shortage check rather than a capacity-only check.
- [x] Add one test in [`src/main/mercenaryTurnFlow.test.ts`](src/main/mercenaryTurnFlow.test.ts) beside the existing short-balance place test. Use `emptyRaiseHex()`, which sets 10 city cells. `raiseCapacityForHex(10, false)` is `10 * MERCENARY_RAISE_CAPACITY_MULTIPLIER` (2), so capacity is 20. Default-map infantry costs 20 (`GLOBAL_GAME_MAP.rules.infantryCost`). Count 1 fits. Count 2 costs 40 and does not. Set the treasury to `infantryFee(h3, 'raise') * 2`, so the fee for two infantry fits and only production fails. Place once with `count: 2`. Do not place a count of 1 first. Assert `success` is false, `reason` is `HIRE_SHORT_PRODUCTION`, `getTreasuryCredits` is still that funded amount, and `readHexHireView(...).pendingOrders.length` is 0.
- [x] Do not fund only two fees and then place one infantry before the count of 2. That first place spends one fee, so the count of 2 fails both checks and the reason is `HIRE_SHORT_BOTH`.
- [x] Do not add another credits-refusal test. The existing short-balance test already covers `HIRE_SHORT_CREDITS`.
- [x] Verify: `npm run build:main`, then `npm run rebuild:native:node`, then `node --test dist/main/mercenaryTurnFlow.test.js`. The first throw inside the native rebuild script is expected. Then `npm run rebuild:native:electron`.

## Phase 3 — Hire tab controls and the living UX sentence

**Produces:** The screenshot case stays a shortage sentence with no raise controls. The same layout appears when credits, rather than capacity, block every one-unit raise. A visible row stays quiet until Hire is clicked.

- [x] On `HexHireView` in [`src/shared/ipc/mercenaryTypes.ts`](src/shared/ipc/mercenaryTypes.ts), remove `capacityFloorFee`. Add `raiseShortage: string | null`. Contract: one of the three sentences when the hex has raise options, the evaluation has no blocked raise reason, and `oneUnitRaiseShortage` is non-null. Otherwise null. It is not a second copy of occupied, fortified, or not-explored text.
- [x] Update the `hireAvailable` contract so it matches the formula below. [`renderBuildOrHirePopupIntoMount`](src/renderer/gameplay/buildHirePopup.ts) drops the Hire tab on a build hex when `hireAvailable` is false. A credits shortage makes `raise` null, so the formula has to count `raiseShortage` or that tab disappears and the sentence is never shown.
- [x] Update the `HireRaiseView.options` contract: each option fits one unit in both `capacityLeft` and the present balance.
- [x] In `readHexHireView`, read `funds` once with `readMercenaryFunds` and use that balance. Delete `capacityUsed`, `capacityFloorFee`, and the assignment that stores `RAISE_REASON_CAPACITY_USED`. Handle the raise section in this order:
  1. When `evaluation.raiseBlockedReason` is set (occupied, fortified, or no base capacity), `raise` is null, `raiseShortage` is null, and the view's `raiseBlockedReason` is that evaluation reason. Do this before `oneUnitRaiseShortage`. An occupied hex still has raise options, and the classifier must not replace the occupied sentence.
  2. Otherwise set `raiseShortage` from `oneUnitRaiseShortage(evaluation.raiseOptions, capacityLeft, funds.credits)`. When that sentence is non-null, `raise` is null and the view's `raiseBlockedReason` is null.
  3. When the sentence is null, `raise.options` is the options for which `hireShortageLabel(balance, option.fee, option.unitCost, capacityLeft)` is null. Build `raise` from those options, including `capacityLeft`. That list is non-empty in this branch: an empty option list already set `evaluation.raiseBlockedReason`.
- [x] `hireAvailable` is `(evaluation.blockedReason == null && (raise != null || raiseShortage != null || rehireUnits.length > 0)) || pendingOrders.length > 0`. `unavailableReason` is null when `hireAvailable` is true. Update the `readHexHireView` comment to match.
- [x] In [`src/renderer/gameplay/hirePanel.ts`](src/renderer/gameplay/hirePanel.ts), delete the `capacityFloorFee` branch. When `view.raiseShortage` is non-null, call the existing `appendShortage(panel, view.raiseShortage)` and do not call `appendRaise`. `appendShortage` already adds the 0.5em spacer, so `endsWithSpacer` in `appendOrders` still prevents a second gap above Hire Queue. Do not add another spacer. Keep skipping `RAISE_REASON_CAPACITY_USED`. Do not append `raiseBlockedReason` when `raiseShortage` is already shown.
- [x] Keep the empty shortage host that `appendRaise` already inserts above the controls (`panel.append(shortage, section)`). Leave it empty on first paint. Delete `paintRaiseShortage` and its first-paint, `change`, and `input` calls. Keep the tooltip sync and the count sanitizer.
- [x] On select `change` and count `input`, call `shortage.replaceChildren()` so a sentence from an earlier click, and its spacer, go away. Do not remove the host.
- [x] On Hire click, take the count from `selectedHireCount`. If it returns null, or the selected type is not in `raise.options`, return without a sentence and without `submitHire`. Otherwise call `hireShortageLabel(view.funds.credits, option.fee * count, option.unitCost * count, raise.capacityLeft)`. If that returns a sentence, `shortage.replaceChildren()` and then `appendShortage(shortage, sentence)`, and return before `submitHire`. If it returns null, call `submitHire` as today. Update the `selectedHireCount` comment so it names the Hire click.
- [x] Do not run this click check for rehire buttons.
- [x] `Production (Hire)` stays tied to `view.raise`, so it remains hidden when the row is hidden.
- [x] Replace the shortage sentences in the Hire panel bullet of [`doc/ux/build-popup.md`](doc/ux/build-popup.md). State that the type list, count, and Hire button appear only when one type fits at count 1 on both remaining production and the balance, and that the list contains only those types. When none fit, the panel shows `raiseShortage` from `oneUnitRaiseShortage` and does not show those controls. When they fit, the shortage sentence stays hidden until Hire is clicked with a type and count `hireShortageLabel` rejects, and that click does not add the order. Changing the type or the count clears it. Remove the `capacityFloorFee` sentence and the sentence that says changing the type or count updates the label without another read. Keep the rest of the bullet, including the unshown capacity-used sentence, the queue gaps, and the blocked-hex sentence.
- [x] Search `doc/` for `capacityFloorFee` and update only this living bullet. Do not edit historical docs.
- [x] Verify: `npm run check:renderer-types` and `npm run build:renderer`. The leaflet copy warning is not a failure. The two existing `hoverPreview.ts` null warnings are pre-existing. Then restart the app and check:
  - Capacity left below every one-unit cost, balance able to pay the cheapest fee: no dropdown, no count, no Hire, red `Not enough production capacity.`, existing queue row still removable.
  - Capacity able to fit a type, balance below every such fee: same hidden controls, red `Not enough credits.`
  - Both blocked: red `Not enough credits or production capacity.`
  - One infantry fits at count 1, count typed past either the remaining capacity or the balance: controls stay, no red text while typing, Hire shows the matching sentence, and the queue does not gain a row.
  - Count 1 of a fitting type still adds the order and lowers the top-bar treasury by the fee.
  - A rehire row, when one exists, still shows its Hire button.
