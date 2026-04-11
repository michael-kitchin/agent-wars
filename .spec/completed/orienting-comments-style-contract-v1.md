# Orienting Comments Style Contract (TypeScript `src`)

*Version 1.0 — April 2026*

This document defines the machine-checkable and human-reviewable contract for **orienting comments** on TypeScript declarations under `src/`. It pairs with `.spec/orienting-comments-execution-plan-v1.md`.

---

## Scope

- Applies to TypeScript (`.ts` only, not `.d.ts`) under `src/`.
- Targets: fields, constructors, methods/accessors, interface members, enum members, module-level function declarations (including each overload signature), and parameter properties on constructors.
- Excludes declarations that use the **`override` modifier** (syntax-based exclusion only).
- Comment format: **Javadoc-style** block comments only (`/** ... */`).

---

## Required Block Structure

Every orienting comment MUST be a single `/** ... */` block placed immediately before the declaration (standard TypeScript / JSDoc attachment rules).

### Contract-oriented declarations

Use this variant for:

- `abstract` class methods
- Interface `MethodSignature` and `PropertySignature`

Required lines (in order, each line starts with ` * ` after the opening `/**`):

1. **Summary** — first non-empty line after `/**` is a one-line human summary (no label).
2. ` * Contract: ...` — what callers/readers may rely on; inputs/outputs at a high level.
3. ` * When to use: ...` — when this member is the right tool vs alternatives.
4. ` * Expected outcome: ...` — observable postconditions or read semantics.
5. ` * Exceptions: ...` — thrown/rejected errors, or `None.` if none are expected.

### Implementation-oriented declarations

Use this variant for everything else in scope (concrete class methods, fields, constructors, enum members, overload signatures without bodies, parameter properties, module-level functions, getters/setters).

Required lines:

1. **Summary** — first non-empty line after `/**` is a one-line human summary.
2. ` * Purpose: ...` — why this declaration exists in this type/module.
3. ` * When to use: ...` — when maintainers or callers should reach for it.
4. ` * Expected outcome: ...` — what happens when used correctly.
5. ` * Exceptions: ...` — notable failure modes, thrown errors, or `None.`

---

## Overloads

- Each overload signature MUST have its **own** orienting block immediately preceding that signature.
- Overloads without a body still receive the same template; the summary should name the overload shape (parameters) distinctly.

---

## Machine Validation Notes

- Automated tooling treats a leading documentation region as **invalid** if it contains **more than one** `/**` opener sequence. This guards against stacked or partially applied blocks.

## Normalization Policy

When a declaration already has a `/** ... */` block:

- If any required labeled line is missing, malformed, or clearly stale relative to the signature, **replace** the block with a freshly generated one that satisfies this contract.
- If the block already satisfies the contract, **preserve** it (tool runs should be idempotent).

---

## Unacceptable Comments

- Placeholder text (`TODO`, `FIXME`, `...`, lorem ipsum).
- Empty labels (`Purpose:` with no content).
- Comments that contradict the signature (wrong parameters, wrong return type claims).
- Line comments (`//`) or non-Javadoc block comments (`/* ... */` without a second `*`) used **instead of** the required `/** ... */` orienting block.

---

## Reviewer Checklist (Quick)

- [ ] Block is `/** ... */` directly above the declaration.
- [ ] Correct variant: **Contract** vs **Purpose** line matches declaration kind.
- [ ] All five structural parts present: summary + four labeled lines.
- [ ] `Exceptions:` is accurate (or `None.`).
- [ ] Overload: each signature has its own block; summaries differ when signatures differ.
- [ ] `override` members: no orienting block required by this contract.

---

## Representative Examples (Minimum Set)

### 1) Class field (implementation-oriented)

```ts
/**
 * Holds the last error returned by the transport layer, if any.
 *
 * Purpose: Centralizes transport error visibility for UI diagnostics.
 * When to use: Read after failed sends; clear when starting a new attempt.
 * Expected outcome: Either a descriptive string or undefined when unset.
 * Exceptions: None.
 */
private lastTransportError?: string;
```

### 2) Constructor (implementation-oriented)

```ts
/**
 * Creates a coordinator that owns the lifecycle of a single game session.
 *
 * Purpose: Bundles dependencies that must stay consistent for one session.
 * When to use: Construct once per Electron window load path.
 * Expected outcome: Instance is ready to register IPC handlers.
 * Exceptions: Throws if required services are missing from the container.
 */
constructor(deps: SessionDeps) { ... }
```

### 3) Concrete method (implementation-oriented)

```ts
/**
 * Recomputes fog-of-war visibility after terrain or unit updates.
 *
 * Purpose: Keeps fog arrays aligned with authoritative game state.
 * When to use: After any mutation that can change line-of-sight inputs.
 * Expected outcome: Fog masks match engine truth for the active player.
 * Exceptions: None.
 */
public recomputeFog(): void { ... }
```

### 4) Interface method (contract-oriented)

```ts
/**
 * Persists the current turn orders atomically.
 *
 * Contract: Either all submitted orders persist or none do; no partial writes.
 * When to use: End of planning phase when the player confirms orders.
 * Expected outcome: Database reflects submitted orders for the active turn.
 * Exceptions: Rejects with a structured error when validation fails.
 */
submitOrders(orders: OrderPayload): Promise<void>;
```

### 5) Abstract method (contract-oriented)

```ts
/**
 * Computes the next AI action for the active side.
 *
 * Contract: Must not mutate game state; returns a validated action descriptor only.
 * When to use: During AI planning ticks for automated sides.
 * Expected outcome: A single action the engine can apply or reject safely.
 * Exceptions: May throw if the model adapter is misconfigured.
 */
protected abstract planNextAction(state: GameState): AiAction;
```

### 6) Getter (implementation-oriented)

```ts
/**
 * Exposes whether the renderer has completed its first paint.
 *
 * Purpose: Lets gameplay code gate interactions on readiness.
 * When to use: Before attaching input listeners that assume DOM nodes exist.
 * Expected outcome: True only after initial paint hooks have fired.
 * Exceptions: None.
 */
public get isReady(): boolean { ... }
```

### 7) Enum member (implementation-oriented)

```ts
/**
 * Identifies a standing order that waits until contact before executing.
 *
 * Purpose: Distinguishes passive wait states from active movement orders.
 * When to use: Serialize/deserialize standing order enums in save files.
 * Expected outcome: Stable string token in persisted payloads.
 * Exceptions: None.
 */
WaitUntilContact = 'wait_until_contact',
```

### 8) Module-level overload pair (implementation-oriented)

```ts
/**
 * Parses a coordinate from a compact string token.
 *
 * Purpose: Centralizes parsing rules for editor-pasted coordinates.
 * When to use: When ingesting user text that may be either axial or offset form.
 * Expected outcome: Returns a parsed coordinate for valid inputs.
 * Exceptions: Throws SyntaxError when the token cannot be parsed.
 */
export function parseCoord(token: string): Coord;

/**
 * Parses a coordinate from separate numeric components.
 *
 * Purpose: Supports programmatic construction from validated numbers.
 * When to use: When UI spinners already produced numeric components.
 * Expected outcome: Returns a combined coordinate value.
 * Exceptions: Throws RangeError when components are out of supported bounds.
 */
export function parseCoord(q: number, r: number): Coord;

export function parseCoord(a: string | number, b?: number): Coord { ... }
```

### 9) Parameter property (implementation-oriented)

```ts
/**
 * Exposes the owning session id for downstream log correlation.
 *
 * Purpose: Stores an immutable correlation key on the constructed instance.
 * When to use: Constructing handlers that emit structured logs for one session.
 * Expected outcome: `this.sessionId` matches the constructor argument.
 * Exceptions: None.
 */
constructor(public readonly sessionId: string) { ... }
```

### 10) Class method with `override` (excluded)

```ts
// No orienting block is required by this contract when `override` is present.
public override toString(): string { ... }
```

---

## Tooling Alignment

- Automated insertion/normalization MUST emit comments that satisfy this contract.
- Lint enforcement SHOULD validate labeled lines for in-scope declarations when type-aware linting is available.
