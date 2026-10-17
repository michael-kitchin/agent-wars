# Orders envelope schema — execution plan

Audience: a **lower-quality coding agent**. Follow the steps in order. Do not invent a second schema, a new repair prompt, or a new JSON Schema keyword.

Goal: make OpenRouter structured outputs require the fields the parser drops, for every model, and send the existing repair call once when a parsed reply's actor rows were all dropped.

Gemini Flash Lite is the model this is for. On a strategic turn it returned valid JSON (`finish_reason: stop`) whose moves had no destination, whose standing orders had no `order` object, and whose air strikes had no target. Structured outputs were on. Response healing left the body alone. The turn's pending orders then came from standing orders and the tempo sweep, not from that reply.

Other models stay safe because rows the prompt already shows still fit the schema, and a provider that rejects the schema still uses the existing one-time retry that drops `response_format` for the rest of the session.

---

## How to use this document

1. Work **one phase per change set**, in the order given.
2. Run the **verification bar** at the end of every phase.
3. **Stop and report** after each phase: files touched, test outcome, and any grep the phase asks for. Wait for a human go-ahead before the next phase.
4. If a phase fails verification, **revert that phase entirely**. Do not patch forward.
5. If a phase's diff grows beyond the files that phase lists, **stop and report**.
6. If a line number or a quote in this document disagrees with the code, **trust the code and stop to report the discrepancy**.
7. Never commit or push.

Every phase is verifiable by `npm test`. No manual play session is required.

---

## Verification bar (end of every phase)

```bash
npm test
```

`npm test` rebuilds native code, builds `src/main`, lints, checks names, type-checks the renderer, runs every discovered `dist/**/*.test.js`, and checks third-party notices. A new `*.test.ts` under `src/main` is picked up after `build:main`. Do not edit `package.json` to register a test.

Do not run `npm run check:circular` as a pass/fail gate. It is already failing on cycles this work does not touch. Do not refresh `scripts/circular-deps-baseline.json` or `scripts/renderer-typecheck-baseline.json`. Do not run `npm run build:renderer` unless a phase edits a renderer file. No phase edits a renderer file.

---

## Why the current schema does not constrain Gemini

`orderRowSchema` in `src/main/openRouter/promptSpec/envelopeJsonSchema.ts` builds one closed object whose only required key is `action`, then adds `anyOf` **beside** `type`, `properties`, `required`, and `additionalProperties`.

Vertex ignores `anyOf` unless it is the only field on that node. Gemini is therefore constrained to the loose object: a move without `destination` and an `assign_order` without `order` are legal. The same shape makes an air-strike row legal when only `targetType` is present.

`ranged_attack`'s own branch currently requires nothing beyond `action`, so a bare union would still allow a shot with no target.

OpenRouter's `response-healing` plugin repairs syntax only (brackets, trailing commas, markdown fences, prose around JSON). It does not add missing properties. The plugin id stays `response-healing`, and it stays attached beside `response_format`. Do not change `ordersChatRequestHelpers.ts`.

`strict` stays `false`. `strict: true` would force every property onto `required` and bring the loose row back.

---

## Schema to build

One schema for every model. No Google-only branch and no DeepSeek-only branch.

A provider that rejects `anyOf` without a sibling `type` (DeepSeek does this today) gets the existing HTTP 400/404/422 retry in `postOrdersChatRequest`. That retry drops the schema for the rest of the session. Do not add a fallback schema to avoid that retry.

Allowed keywords, and no others: `type`, `properties`, `required`, `additionalProperties`, `items`, `enum`, `anyOf`. Do not add `pattern`, `minLength`, `minItems`, `oneOf`, `$ref`, or `description`. An empty string and a garbage unit id such as `a1-n9},` can still appear. The repair backstop covers a reply in which every actor row was dropped. A reply that keeps one good row and drops another is applied as it is.

### `orders[]` items

The items schema is exactly:

```json
{ "anyOf": [ /* one closed object per branch */ ] }
```

No sibling `type`, `properties`, `required`, or `additionalProperties` on that node. Each branch is `{ "type": "object", "additionalProperties": false, "properties": { ... }, "required": [ ... ] }`.

Keep calling `legalOrderActionsForMode(gates.coordinateMode, true, gates.includeStandingOrderActions !== false)`. The `true` keeps embark, transport move, and disembark in the schema even when the prompt omits them for a side with no naval unit. Do not change `legalOrderActionsForMode`.

On **every** branch, `unitId` and `unitIds` are optional properties. Do not put either name in `required`. The parser already drops a row that has neither. Repair examples use `unitId`. The system-prompt example uses `unitIds` on some rows and `unitId` on others. Both must fit.

Branches:

| Action | Required keys besides those listed | Properties besides `action`, `unitId`, `unitIds` |
| --- | --- | --- |
| `explicit_move` | `destination` | `destination` |
| `disembark` | `destination` | `destination` |
| `transport_move` | `navalUnitId`, `destination` | both |
| `embark` | `navalUnitId` | `navalUnitId` |
| `cancel_order` | none | none |
| `ranged_attack` | two branches, see below | see below |
| `assign_order` | `order` | `order`, see below |

`action` on a branch is an enum of that one action name, and `action` is required.

`ranged_attack` is two branches, not one:

- Requires `targetHexCode`. Properties include `targetHexCode`. Do **not** list `targetUnitId`.
- Requires `targetUnitId`. Properties include `targetUnitId`. Do **not** list `targetHexCode`.

A row with both targets, or with neither, matches no branch.

`assign_order`'s `order` value is the same bare shape, `{ "anyOf": [ ... ] }`, with no sibling fields. One branch per `STANDING_ORDER_TYPES` entry (`defend`, `march`, `pursue`, `patrol`, `hold_fire`). Each branch's `type` enum is that single string.

Every standing-order branch lists these properties, so an extra taught key is not stripped: `type`, `destination`, `defendHex`, `waypoints`, `targetUnitId`, `engageRange`, `maxDistance`, `avoidEnemies`, `engageEnRoute`. Use the same leaf schemas those keys have today (`STRING_SCHEMA`, `STRING_ARRAY_SCHEMA`, `{ type: 'number' }`, `{ type: 'boolean' }`).

Required keys on a standing-order branch:

| `type` | Required |
| --- | --- |
| `march` | `type`, `destination` |
| `defend` | `type`, `defendHex` |
| `pursue` | `type`, `targetUnitId` |
| `patrol` | `type`, `waypoints` |
| `hold_fire` | `type` |

`defend` without `defendHex` is legal in `standingOrdersCore.ts` (the engine uses the unit's current cell). The prompt already says defend needs `defendHex`. The schema follows the prompt. Do not change `standingOrdersCore.ts`. When a provider is running without the schema, the engine default still applies.

These existing rows must still fit. Do not edit them:

- `STRATEGIC_REPAIR_ORDERS` and `TACTICAL_REPAIR_ORDERS` in `src/main/openRouter/promptSpec/envelopeContract.ts`
- The `orders` arrays inside `getFinalJsonOrdersExampleBlock` in `src/main/openRouter/promptContracts.ts`
- The repair air-strike example `{ unitId: 'a1-a1', targetHexCode: 'CI', targetType: 'units' }`
- The repair ferry example `{ unitId: 'a1-a2', destination: 'CJ' }`

### `airStrikes[]` items

Replace the single closed object with a bare `anyOf` of two closed objects.

- Requires `targetType` and `targetHexCode`. Properties: `unitId`, `unitIds`, `targetHexCode`, `targetType`. Do not list `targetUnitId`.
- Requires `targetType` and `targetUnitId`. Properties: `unitId`, `unitIds`, `targetUnitId`, `targetType`. Do not list `targetHexCode`.

`targetType` stays the enum `units`, `urban`, `airport`, `seaport`. `unitId` and `unitIds` stay optional.

### Leave these schemas alone

`ferryOrders` (already requires `destination`), `callbacks`, `memoryUpdates`, `productionOrders`, and the top-level envelope (`message`, `strategy`, and `orders` required; `strict: false`; field order from `envelopeFieldsForGates`).

---

## Repair backstop

`parseOrdersResponse` in `src/main/openRouter/orderResponseParsing.ts` returns a non-null object for the bad Gemini body, so `requestOrdersFlow` never calls `runParseRepairExchange`. Standing orders and production are applied **inside** that parse. A successful `assign_order` or `cancel_order` is not stored in `movementOrders`.

Add `appliedStandingOrderCount` to `EnvelopeOrderRowsResult` in `src/main/openRouter/envelopeOrderRows.ts`. Increment it only on these two paths inside `processV3OrdersArray`:

- `assign_order` when `executeStandingOrders` does not return `status: 'error'`
- `cancel_order` when the tactical guard did not push a drop reason

Do not inspect the cancel tool's return value. Today a non-tactical cancel is treated as applied even when the tool reports an error. Keep that.

Add `everyActorRowDropped: boolean` to the object `parseOrdersResponse` returns.

Set it true only when all of these hold:

- The expanded `orders` array, the expanded `airStrikes` array, and the expanded `ferryOrders` array together have length greater than 0. Count those arrays after `expandGroupedActorEntries`, including entries that are not objects.
- `movementOrders`, `rangedAttacks`, `embarkOrders`, `airStrikes`, and `ferryOrders` on the result are all empty.
- `appliedStandingOrderCount` is 0.

Otherwise false. In particular:

- Empty `orders`, `airStrikes`, and `ferryOrders` is false. That is a legal do-nothing envelope.
- One kept move plus one dropped move is false.
- A successful `assign_order` or `cancel_order` is false even though `movementOrders` is empty.
- Production drops do not count. Do not use the merged `dropReasons` list for this flag.

In `requestOrdersFlow.ts`, after the first `parseOrdersResponse` call, use this order. Do not call `runParseRepairExchange` more than once.

1. The first parse returned null. Keep today's repair. If the repair text parses, use it. If it does not, `failRequest` with the existing parse-failure reason.
2. The first parse returned non-null, `everyActorRowDropped` is true, and `productionAppliedCount` is missing or 0. Log a debug line that names the trigger and the expanded actor-row count. Call `runParseRepairExchange` with the same arguments as step 1. Pass the original assistant text as `unparseableContent`. If the repair text parses, **use that result even when its `everyActorRowDropped` is also true**. If the repair call returns nothing or its text does not parse, **apply the original parse**. Do not `failRequest`. The tempo sweep in `applyParsedRequestOrders` must still run.
3. `everyActorRowDropped` is true and `productionAppliedCount` is greater than 0. Do not repair. A second parse would call `executeProductionTools` again. Apply the original parse.
4. Otherwise apply the first parse.

Do not change `buildRepairRequestMessage` or any other prompt string. The repair user message still says the previous response was not parseable JSON. That wording is slightly wide for step 2. Leave it.

---

## Test walker

`schemaMismatch` in `src/main/openRouter/promptSpec/envelopeJsonSchema.test.ts` requires `schema.properties` before it looks at `anyOf`. A bare `anyOf` node has no `properties`. Update it first in Phase 1, in the same change as the schema:

- When `schema.anyOf` is an array and `schema.properties` is absent, the value fits if any branch fits. Otherwise the message names every branch mismatch.
- When `properties` is present, keep the current required-key and extra-key checks, then the current `anyOf` check.

`testTacticalDropsStrategicOnlySurface` reads `orderRow.properties`. After Phase 1 that node has no `properties`. Read `action` enums from the `anyOf` branches. Assert no branch's action is `assign_order` or `cancel_order`, and no branch lists an `order` property. Leave the callback, memory, and production assertions as they are.

`assertEveryObjectClosed` can stay. It only requires `additionalProperties: false` where `type` is `object`. The bare `anyOf` node is not an object. Each branch is.

---

## Non-goals

1. No change to prompt text, repair text, briefing text, toast text, drop-reason strings, or IPC channel names.
2. No change to parser drop rules, tempo sweep, production tools, or standing-order validation.
3. No change to `ordersChatRequestHelpers.ts`, the healing plugin id, or `strict`.
4. No per-model schema.
5. No second repair call, and no `failRequest` for an envelope that parsed.
6. No new JSON Schema keyword.
7. No requirement that `unitId` or `unitIds` be present.
8. No edit under `.spec/completed/`.
9. No plan, phase, or workflow identifiers in source, comments, configuration, or `doc/`. This file is the only place they may appear.
10. No commit or push.
11. No dependency upgrade.
12. Do not edit the engine-constants table in `doc/README.md`.

---

## Conventions

- New and updated functions and fields need an orienting comment: why it exists, when to use it, what it returns, and what it throws. The first summary line does not contain the labels "Purpose" or "Contract".
- A new or updated public main-process function logs at debug on entry. A caught exception logs at error. A getter that does not change state logs at trace. Use `logDebug`, `logError`, and `logTrace` from the existing logger. Shared and renderer code must not import the logger.
- Tests cover the happy path and the essential failures named in each phase. Do not add tests for accessors, wrappers, or every action once one action of that shape is covered.
- `src/main/openRouter/promptSpec/envelopeJsonSchema.ts` is about 390 lines. If a phase would push it past 600 lines, move the branch builders into `src/main/openRouter/promptSpec/envelopeJsonSchemaHelpers.ts` in that same phase. `Helpers` is an allowed role suffix. Do not split the file before it crosses 600 lines. Do not cross 1000 lines in either file.
- At most six named parameters on a new function. Ten is the hard limit. A parameter object is acceptable.
- Mark values that are not reassigned as `const`.
- Directory and file names under `src/` stay camelCase.

---

## Phase 0 — Baseline

Edit nothing.

1. Run `npm test`. Record pass or fail. A failure here is pre-existing. Stop and report it. Do not start Phase 1 on a red suite.
2. Record `(Get-Content <file>).Count` for:
   - `src/main/openRouter/promptSpec/envelopeJsonSchema.ts`
   - `src/main/openRouter/promptSpec/envelopeJsonSchema.test.ts`
   - `src/main/openRouter/orderResponseParsing.ts`
   - `src/main/openRouter/envelopeOrderRows.ts`
   - `src/main/openRouter/requestOrdersFlow.ts`
3. Confirm `orderRowSchema` still spreads a closed object and then sets `anyOf`. If it does not, stop and report.

---

## Phase 1 — Bare `anyOf` for order rows

Files:

- `src/main/openRouter/promptSpec/envelopeJsonSchema.ts`
- `src/main/openRouter/promptSpec/envelopeJsonSchema.test.ts`

Replace the `orders[]` items schema with the bare `anyOf` described above, using today's per-action required keys. In this phase, `ranged_attack` is still one branch and its `required` array is still empty (both target keys listed, neither required). `assign_order` still uses today's `standingOrderSchema()` (one object, only `type` required). Do not yet split ranged attacks, air strikes, or standing-order types.

Update `schemaMismatch` and `testTacticalDropsStrategicOnlySurface` as specified under "Test walker".

Keep `testMoveRowsRequireDestination` and `testTaughtExamplesFitSchema`. They must pass without edits to the examples.

Add these assertions to the schema test file, strategic and tactical:

- The `orders[]` items node has exactly one key, `anyOf`.
- An `explicit_move` with `unitId` and `destination` fits. The same row with `unitIds` instead of `unitId` fits. The same row with neither destination fails.
- An `assign_order` with `unitId` and `order: { type: 'hold_fire' }` fits. The same row without `order` fails.

Do not add a test per sealift action. `testMoveRowsRequireDestination` already covers destination on move, transport move, and disembark.

Verification: `npm test`. Then stop.

---

## Phase 2 — Standing-order type branches

Files: the same two as Phase 1.

Replace `standingOrderSchema()` with the bare `anyOf` of five type branches specified above. `assign_order` still requires `order`. Delete `standingOrderSchema` if nothing else calls it.

Add these schema assertions, strategic gates only:

- `{ type: 'march', destination: 'CF' }` fits as `order`. `{ type: 'march' }` does not.
- `{ type: 'defend', defendHex: 'CF' }` fits. `{ type: 'defend' }` does not.
- `{ type: 'pursue', targetUnitId: 'h1-i1' }` fits. `{ type: 'pursue' }` does not.
- `{ type: 'patrol', waypoints: ['CD', 'CF'] }` fits. `{ type: 'patrol' }` does not.
- `{ type: 'hold_fire' }` fits.

`testTaughtExamplesFitSchema` must still pass. The strategic example already contains a march with `destination` and a patrol with `waypoints`.

Verification: `npm test`. Then stop.

---

## Phase 3 — Ranged and air-strike targets

Files: the same two as Phase 1.

Split `ranged_attack` into the two branches specified above. Replace the `airStrikes[]` item schema with the two branches specified above.

Add these schema assertions:

- Strategic and tactical: a ranged row with only `targetHexCode` fits. A ranged row with only `targetUnitId` fits. A ranged row with neither fails. A ranged row with both fails.
- Strategic gates with air on: an air-strike row with `targetType: 'units'` and `targetHexCode` fits. The same with `targetUnitId` instead of `targetHexCode` fits. A row with only `targetType` fails. A row with both target keys fails.
- The existing ferry example `{ unitId: 'a1-a2', destination: 'CJ' }` still fits. A ferry row without `destination` still fails. Do not change the ferry schema to make that true. It is already true.

Verification: `npm test`. Then stop.

---

## Phase 4 — All-dropped repair

Files:

- `src/main/openRouter/envelopeOrderRows.ts`
- `src/main/openRouter/orderResponseParsing.ts`
- `src/main/openRouter/orderResponseParsing.test.ts`
- `src/main/openRouter/requestOrdersFlow.ts`

Implement `appliedStandingOrderCount` and `everyActorRowDropped` as specified under "Repair backstop". Implement the four-step branch in `requestOrdersFlow.ts`.

The debug log for step 2 must include the expanded actor-row count. Use `logDebug`. Do not log at error for this path. Do not change existing drop-reason strings.

Tests, in `orderResponseParsing.test.ts`, using the existing `parseFixture` helper:

- `testMoveWithoutDestinationSurfacesDropReason`: also assert `everyActorRowDropped === true`.
- `testUnitIdsExpandsGroupedMoveFireAirAndFerry`: also assert `everyActorRowDropped === false`.
- One new test: `orders`, `airStrikes`, and `ferryOrders` are all `[]`. Assert the parse is non-null and `everyActorRowDropped === false`.
- One new test: one `explicit_move` with an on-map destination (copy the destination setup from `testUnitIdsExpandsGroupedMoveFireAirAndFerry`) plus one `explicit_move` with no destination. Assert `everyActorRowDropped === false` and `movementOrders.length === 1`.

Do not add a test that stands up a database to prove a successful `assign_order` clears the flag. The counter increment is on the existing success `continue`. Do not add an HTTP test for `requestOrdersFlow`.

Verification: `npm test`. Then stop.

---

## Phase 5 — Documents

Files, and only these, unless a search shows another living `doc/` file stating the old schema:

- `doc/ai-commander-prompts/source-inventory.md` section 4.4
- `doc/ai-commander-prompts/consultation-flow.md` section 5 and the paragraph after it that describes the schema
- `doc/hybrid-ai.md` the sentence "Unparseable final JSON gets one repair call with tools off."
- `doc/ux/ai-activity-log.md` the Anthropic schema-rejection bullet, only if the reason it gives is now false

Search `doc/` for `anyOf`, `only \`action\` required`, and `combined row`. Update each living hit in place. Do not edit `doc/devleopment-plan-v3.4.md`, `doc/poc-analysis.md`, or `doc/market-research.md`.

Write these facts, in the voice of the file you are editing:

- An `orders[]` item and an `airStrikes[]` item are a bare `anyOf`. There is no combined row whose only required key is `action`.
- Move, transport move, and disembark branches require `destination`. Embark requires `navalUnitId`. Transport move also requires `navalUnitId`. `assign_order` requires `order`, and that object is a bare `anyOf` by standing-order type with the required keys in the table above. `ranged_attack` and air strikes each have two branches so exactly one target key is present.
- `strict` remains false. The parser still drops a row the schema let through (off-map hex, missing unit, both targets if a provider ignored the union).
- A provider that rejects the schema is still retried once without it, and then runs without it for the session. Do not publish a new count of optional or union parameters. The old figures (26 and 59) described the combined row. Delete those two figures. Keep the qualitative sentence that Anthropic can reject the first schema request and then continue without it.
- Repair has two triggers. Unparseable JSON is unchanged: one repair, then `failRequest` if the repair text does not parse. A parsed envelope whose actor rows were all dropped, and whose production apply count is 0, gets that same repair call once. If that repair does not parse, the original envelope is applied so the tempo sweep still runs. A parsed envelope that already applied production is not repaired. The repair user message is unchanged.

Do not change a prompt sentence, a symbol in the engine-constants table, or a file path that is still correct.

Verification: `npm test`. Then stop.

---

## Phase completion log

The human asked to run every phase without waiting between them. Phases 1–5 were implemented in one pass on 2026-10-17.

- Phase 0 was not run as a separate `npm test` before edits. The schema shape matched this document (`orderRowSchema` spread a closed object and then set `anyOf`).
- Phases 1–3: `envelopeJsonSchema.ts` and `envelopeJsonSchema.test.ts`. Order rows, standing-order types, ranged attacks, and air strikes are bare `anyOf` branches. `envelopeJsonSchema.test.js` passed after `tsc`.
- Phase 4: `envelopeOrderRows.ts`, `orderResponseParsing.ts`, `orderResponseParsing.test.ts`, `requestOrdersFlow.ts`. `appliedStandingOrderCount`, `everyActorRowDropped`, and `expandedActorRowCount` (the count the debug log needs). `orderResponseParsing.test.js` passed.
- Phase 5: `doc/ai-commander-prompts/source-inventory.md`, `doc/ai-commander-prompts/consultation-flow.md`, `doc/hybrid-ai.md`. `doc/ux/ai-activity-log.md` was left as written: it still correctly says Anthropic can reject the schema because the envelope uses `anyOf` and can exceed Anthropic's limits.
- `npm test` passed on 2026-10-17 (exit 0), including main-process tests, lint, naming check, renderer typecheck, and notices check.
- Follow-up the same day: `assign_order` increments `appliedStandingOrderCount` only when the tool status is not `error`. A string error is still the only assign failure written as a drop reason. `consultation-flow.md` section 6 now says a failed repair ends the consultation only when the original text never parsed. The plan has no optional phases. Typecheck, lint, and `envelopeJsonSchema.test.js` passed. A second `npm test` could not rebuild `better-sqlite3` because the running Electron process holds that native module.
- Later the same day: `source-inventory.md` now says the parser still drops a row with both target keys. `npm test` passed (exit 0), including `envelopeJsonSchema.test.js`, the all-dropped parse cases, lint, the naming check, renderer typecheck, and the notices check.
