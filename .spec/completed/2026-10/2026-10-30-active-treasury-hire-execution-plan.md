# Active treasury for hire orders

> **For agentic workers:** Implement this plan phase by phase. Steps use checkbox (`- [x]`) syntax. Do not commit or push. Do not copy phase names, or any other plan identifier, into code, comments, configuration, lint text, or `doc/`.

**Goal:** Taking a hire order spends the treasury immediately, and removing it refunds that spend. The Hire tab drops the Credits line and the capacity-used sentence, and shows one shortage sentence for the unit and count the player has selected.

**Architecture:** The fee is reserved in `res_s_treasury` when the order row is inserted, and stored on that row so a later remove or a failed fill can refund the same amount. The end-of-turn filler does not charge a reserved order again. The Hire tab decides its shortage sentence in the renderer from the balance, the selected option, and the count, with no extra IPC read. The top bar already reloads after a hire mutation, so its number follows the treasury.

**Tech stack:** TypeScript main process, shared module, and renderer. SQLite column added on open when missing. Node `node:test` after `npm run build:main`. Renderer check is `npm run check:renderer-types`.

**Spec:** This file is the spec. UX and mechanics sentences that change are also edited in the living docs named in the last phase.

## Global constraints

- Do not commit or push.
- Do not put phase, stage, or plan identifiers into code, comments, docs, lint text, or configuration.
- New and updated functions get an orienting comment in the shape already used in that file: why it exists, when to use it, what it returns, and what it throws. Main-process public functions log at debug on entry. Caught exceptions log at error. Getter-style reads log at trace. Use the existing logger. Do not add a renderer logger.
- Player-facing credit amounts use `formatCreditsAmount`. Production amounts use `formatProductionCapacityAmount`. Do not paste `¤` or `⚒` at a call site.
- Do not change `EXPECTED_USER_VERSION`. A wrong version makes the app treat the database as corrupt and replace the match. Add the new column with `ALTER TABLE` when it is missing, and include it in the `CREATE TABLE` for a new database.
- Do not change payroll. Upkeep for mercenaries already in service is still collected at Ready from the balance that remains. The top bar may still turn red for that upkeep. The commander briefing may still warn about that upkeep.
- Leave historical docs alone: `doc/devleopment-plan-v3.4.md`, `doc/poc-analysis.md`, `doc/market-research.md`, release notes, and everything under `.spec/completed/`.
- Edit living docs in place. Do not rewrite a whole paragraph to change one clause.
- Tests cover the contract cases named in each phase. Do not add tests for accessors, constructors, or a controller that only forwards a call.

## Decisions already made

- The shortage label is on the Hire tab only. It is hidden when the selected raise fits both the balance and the remaining production capacity. It is never shown on the Build tab.
- While the raise select is on screen, the label follows that select and the count field. Changing either updates the label without a new server read.
- The three sentences, and no others, are: `Not enough credits.` `Not enough production capacity.` `Not enough credits or production capacity.`
- The sentence `Your orders here already use this turn's raise capacity.` is not shown. The select still hides when no raise option fits the remaining capacity.
- The Hire tab no longer has a Credits line. The top bar remains the treasury readout.
- A hire fee is taken when the order is stored and returned when that order is removed. Credits produced later this turn do not pay for an order that was refused.
- An order the end of the turn cannot fill refunds the credits that were reserved for the unfilled count. A raise that fills only some of its count refunds the rest.
- Orders already in a database from before this change have no reserved credits. Those rows still settle the old way: the end of the turn charges only what it fills, and removing one does not refund.

## Review focus

- A reserved order must not be charged a second time when it fills.
- A legacy order with a reserved amount of 0 must still be charged at the end of the turn, and must not be refunded.
- Spending and inserting must not leave the treasury lower if the insert throws.
- The top-bar short check must not add `pendingHireFees` after those fees have already been subtracted from `credits`.
- The shortage label uses the count in the field, not a count of 1, including a count that is too expensive or too large for the remaining capacity.
- Rehire does not use production capacity. A rehire the balance cannot pay is refused. It does not drive the raise-select label.

## File map

- `src/main/gameDb/schema.ts` — `reserved_credits` on `res_s_hire_orders` for a new database.
- `src/main/gameDb/mercenaryState.ts` — add the column when missing, read it, write it, spend and refund helpers.
- `src/main/gameActions/hireOrders.ts` — refuse a hire the balance cannot pay; reserve on insert; refund on remove.
- `src/main/gameActions/mercenaryTurnStep.ts` — do not charge a reserved order again; refund what did not fill.
- `src/shared/mercenaryRules.ts` — the three sentences and `hireShortageLabel` first. `hirePanelCreditsAreShort`, `HIRE_FUNDS_WARNING`, `formatHireCreditsValue`, and `CREDITS_LINE_LABEL` stay until the Hire tab no longer imports them.
- `src/shared/ipc/mercenaryTypes.ts` — `capacityFloorFee` on the hire view.
- `src/renderer/gameplay/hirePanel.ts` — drop the Credits line and the capacity-used sentence; show the shortage label; space each queue row.
- `src/shared/topBarStats.ts` and `src/main/openRouter/briefingSectionsMercenaries.ts` — short check is upkeep only.
- `src/main/openRouter/promptSpec/gameRuleMercenaryText.ts` and `formatCreditsTooltip` — the fee is taken at placement.
- Living docs named in the last phase.

## Phase 1: Shortage sentence

**Produces:** `hireShortageLabel` returns one of the three sentences or null. The Hire tab still uses `hirePanelCreditsAreShort` and `HIRE_FUNDS_WARNING` until the last phase.

- [x] Add these constants in `src/shared/mercenaryRules.ts`. Do not delete `HIRE_FUNDS_WARNING`, `hirePanelCreditsAreShort`, `formatHireCreditsValue`, or `CREDITS_LINE_LABEL` in this phase. `src/renderer/gameplay/hirePanel.ts` still imports them.

  - `HIRE_SHORT_CREDITS = 'Not enough credits.'`
  - `HIRE_SHORT_PRODUCTION = 'Not enough production capacity.'`
  - `HIRE_SHORT_BOTH = 'Not enough credits or production capacity.'`

- [x] Add `hireShortageLabel(balance: number, fee: number, productionCost: number, capacityLeft: number): string | null`.

  - Both `fee > balance` and `productionCost > capacityLeft`: `HIRE_SHORT_BOTH`.
  - Only the fee: `HIRE_SHORT_CREDITS`.
  - Only the production cost: `HIRE_SHORT_PRODUCTION`.
  - Otherwise null.
  - A fee of 0 is not a credit shortage. A production cost of 0 is not a capacity shortage. An equal balance or an equal capacity is enough.

- [x] Keep the `hirePanelCreditsAreShort` test. Add one `hireShortageLabel` test with these results: `(0, 5, 20, 40)` is the credits sentence; `(10, 5, 40, 20)` is the production sentence; `(0, 5, 40, 20)` is the combined sentence; `(10, 5, 20, 40)` is null; `(0, 0, 0, 0)` is null. The argument order is `(balance, fee, productionCost, capacityLeft)`.

- [x] Run `npm run build:main`, then `node dist/shared/mercenaryRules.test.js`. The new test passes.

## Phase 2: Reserve and refund

**Produces:** Placing a hire subtracts its fee from the treasury. Removing it adds that fee back. Filling a reserved order does not subtract again. An unfilled reserved count is refunded. A row with `reserved_credits` 0 still settles as it does today.

- [x] In `getFullDdl`'s `res_s_hire_orders` definition, add `reserved_credits INTEGER NOT NULL DEFAULT 0 CHECK (reserved_credits >= 0)`.
- [x] On database open, after the handle exists, if `pragma table_info(res_s_hire_orders)` has no `reserved_credits` column, run `ALTER TABLE res_s_hire_orders ADD COLUMN reserved_credits INTEGER NOT NULL DEFAULT 0`. Do not put `CHECK` on that `ALTER`. SQLite rejects a `CHECK` on `ADD COLUMN` here, and the `CHECK` already lives on the `CREATE TABLE`. Call this from `createFreshGameDatabaseAt` (a no-op once the new DDL is in place), from `openExistingGameDatabaseAt` after `setDbHandle`, and from `openGameDatabaseAtPathForTests` after `setDbHandle` on an existing file. Do not change `EXPECTED_USER_VERSION`. In `doc/save-files.md`, say this one column is added on open when missing and that addition does not change the version. Leave the rest of the "no versioned migration" rule in place.
- [x] Thread `reservedCredits` through `HireOrderRow`, both `SELECT`s, and `mapHireOrderRows`. `insertHireOrder` already takes a row object. Add `reservedCredits` to that object. Every object literal must include it or the build breaks: both inserts in `src/main/gameActions/hireOrders.ts`, the three inserts in `src/main/mercenaryTurnFlow.test.ts`, and the three inserts in `src/main/mercenarySchema.test.ts`. Test inserts that expect Ready to charge use `reservedCredits: 0`.
- [x] Add `spendTreasuryCredits(ops, seatId, amount): boolean` next to `addTreasuryCredits`. It logs at debug. It returns false when `amount` is not a positive integer or the balance is below `amount`. Otherwise it stores `balance - amount` and returns true. Never write a negative balance.
- [x] In `placeRaise` and `placeRehire`, after the checks that already exist, the fee is `option.fee * request.count` for a raise and the candidate fee for a rehire. When the fee is 0, do not call `spendTreasuryCredits` (it returns false for a non-positive amount). Insert with `reservedCredits: 0` and succeed. When the fee is above 0 and `spendTreasuryCredits` returns false, return a failure whose reason is `HIRE_SHORT_CREDITS` and do not insert. If the insert throws after a successful spend, log the error, call `addTreasuryCredits` for that same fee, and rethrow.
- [x] In `executeRemoveHireOrder`, load the seat's order with `listHireOrdersForSeat` before `deleteHireOrder`. If that id is absent, return `HIRE_REASON_ORDER_MISSING` and do not refund. After a successful delete, if the loaded `reservedCredits` is above 0, `addTreasuryCredits` for that amount. A row with 0 is deleted and not refunded. A delete that returns false is not refunded.
- [x] In `fillRaise` and `fillRehire`:
  - When `order.reservedCredits` is above 0, do not subtract the fee from `creditsBySeat`. Still apply the board checks (explored, blocked, room, candidate). The count filled is limited by room and by `order.unitCount`, not by the remaining balance.
  - When the filled count is below `order.unitCount`, the per-unit amount is `Math.trunc(order.reservedCredits / order.unitCount)`. Refund `(order.unitCount - filled) * perUnit` by adding it to the balance `creditsOf` already cached for that seat. Do not replace the treasury with the refund alone. A filled count of 0 refunds the whole reserve, including an early return for an unexplored, blocked, or missing candidate. Apply that refund on the single exit of `fillRaise` and of `fillRehire`.
  - When `order.reservedCredits` is 0, keep today's charge: a raise fills only `min(count, room, floor(balance / fee))`, and a rehire fills only when `candidate.fee` fits. Do not refund those.
  - An order skipped because the seat is already out of the match is not passed to `fillRaise` or `fillRehire` and is not refunded. Knockout already dropped that treasury.
- [x] Tests, in the existing mercenary turn-flow or hire-order test file, using the test database helpers already there:
  - Set the balance to `infantryFee(h3, 'raise') - 1` on an empty raise hex: place fails, the balance stays at that amount, and no order row is inserted. Do not hard-code 4. A basic infantry fee can be 3, and a balance of 4 would then succeed.
  - Balance at least one infantry fee: place succeeds, balance drops by that fee, `reserved_credits` equals that fee.
  - Remove of that order restores the balance.
  - Resolving a reserved order that fills does not drop the balance again.
  - Resolving a reserved order that the board rejects restores the reserved amount.
  - The existing raise test that inserts `reservedCredits: 0` still drops the balance at resolution, by the filled fee only. Do not switch that insert to a reserved fee.
  - `place accepts an empty city, rejects a visible enemy, and rejects a turn that is not planning` must `setTreasuryCredits` to at least `infantryFee(h3, 'raise')` before the successful place, and assert the balance dropped by that fee. The occupied-hex rejection stays before any spend.
- [x] Change the top-bar short check in `src/shared/topBarStats.ts` to `economy.credits < economy.upkeepPerTurn`. Do not add `pendingHireFees`. Update the test in `src/shared/topBarStats.test.ts` that uses credits 5, upkeep 3, and fees 4: that case is not short, because 5 covers 3. Add the case credits 2, upkeep 3, fees 0, which is short.
- [x] Change the briefing condition in `briefingSectionsMercenaries.ts` the same way: warn only when `credits < upkeepPerTurn`. Replace `MERCENARY_FUNDS_WARNING` with a sentence that the treasury does not cover upkeep, that credits produced this turn arrive before upkeep, and that random mercenaries desert only if upkeep cannot be paid. Do not say hire orders are dropped for lack of pay.
- [x] In `buildMercenaryRule`, keep arrival at the end of the turn and the upkeep numbers. Replace the idea that the hire is paid after production with: the fee is taken when the order is placed, returned when the order is removed, and returned for any count the end of the turn does not fill. Leave `buildMercenaryUpkeepRule`'s production-before-upkeep sentence as it is.
- [x] In `formatMercenaryFundsLine` and `formatCreditsTooltip`, say the hire-order amount has already been taken from the balance. Keep the sentence that credits produced this turn arrive before upkeep is paid.
- [x] Run `npm run build:main`, then the mercenary turn-flow test, the hire-order test if it is separate, `node dist/shared/topBarStats.test.js`, and `node dist/shared/mercenaryRules.test.js`.

## Phase 3: Hire tab

**Produces:** The Hire tab has no Credits line and never shows `RAISE_REASON_CAPACITY_USED`. The shortage label follows the select and the count. Each queue row has the same 0.5em gap Tech uses.

- [x] On `HexHireView`, add `capacityFloorFee: number | null`. Set it in `readHexHireView` only when `raise` is null because no option fits `capacityLeft` and the hex still has raise options. The value is the smallest `fee` among those options. Otherwise null. This is the fee of one unit, not a count.
- [x] In `renderHirePanel`, stop calling `appendLabeledAmount` for `CREDITS_LINE_LABEL`. Delete `formatHireCreditsValue`, `hirePanelCreditsAreShort`, `HIRE_FUNDS_WARNING`, and `CREDITS_LINE_LABEL` only after a search shows the Hire tab was their last importer, and delete the tests that called the removed functions. Keep `Production (Hire)` and `RAISE_CAPACITY_LABEL`.
- [x] Do not append a note whose text is `RAISE_REASON_CAPACITY_USED`. Other blocked sentences stay.
- [x] Under the production line, or under Tech when production is omitted, show one `div.hire-funds-warning` when the label below is non-null. Follow it with the same `spacer()` Tech uses (height `0.5em`).
  - When `view.raise` is set: `hireShortageLabel(view.funds.credits, option.fee * count, option.unitCost * count, view.raise.capacityLeft)`. `option` is the selected type. `count` is the sanitized count field, the same sanitizer the Hire button uses. If that text is not an integer from 1 to 99, hide the label.
  - When `view.raise` is null and `capacityFloorFee` is a number: `hireShortageLabel(view.funds.credits, capacityFloorFee, 1, 0)` so production is short, and credits are short only when the balance is below that one-unit fee.
  - Wire `change` on the select and `input` on the count field to replace that div's text, or remove it, without refetching the view.
- [x] In `appendOrders`, keep the gap above the Hire Queue heading. After each order row, append one `spacer()` of height `0.5em`. Do not also insert a spacer before each row.
- [x] Update `doc/ux/build-popup.md` in place: no Credits line; the three sentences and when each shows; the capacity-used sentence is gone; queue rows use the Tech gap. Update `doc/ux/order-lifecycle.md` and the one sentence in `doc/combat-rules-v3.md` §2.1 that says a hire does not check the treasury: the fee is reserved at placement, refunded on remove, and refunded for a count that does not fill. In `doc/how-to-play.md`, change the top-bar short rule (the sentence that says upkeep plus hire fees) to upkeep only, and change the clause that says the order does not check the balance and a dropped order costs nothing. In `doc/ux/top-bar.md` and the matching sentence in `doc/ui-style-guide.md`, the short color is upkeep only. In `doc/ux/control-tooltips.md`, the credits tip says the hire amount was already taken.
- [x] Search `doc/ai-commander-prompts/` for the old hire-payment sentence. If a reading copy quotes it, change that clause in place. The builders in `src/main/openRouter/` are the authority.
- [x] Run `npm run check:renderer-types` and `npm run build:main`, then `node dist/shared/mercenaryRules.test.js`.

## Done when

- Placing a hire the balance can pay lowers the top-bar credits by the fee. Removing it restores that amount.
- Placing a hire the balance cannot pay leaves the balance unchanged and adds no row.
- Ready does not charge a reserved order again. A reserved order that cannot fill returns its unused credits.
- An old order with `reserved_credits` 0 still pays at Ready.
- The Hire tab has no Credits line and does not show `Your orders here already use this turn's raise capacity.`
- With a raise select on screen, the label is one of the three sentences or absent, and it follows the selected type and the count.
- The top bar turns red when the balance is below upkeep, and not merely because hire fees were reserved.
