# MCP Tool Services Design Specification — Milestone 0.5

*For: Agent Wars — WEGO Hex Wargame*
*Version: 6.0 — March 2026*

---

## Overview

This document specifies five MCP-style tool services that the LLM opponent calls during its planning phase to reason about the game state and issue orders. The tools replace the current raw-text prompt approach (milestone 0.3/0.4) with structured, deterministic services that give the AI precise information and persistent capabilities across turns.

### Design Principles

**Deterministic outputs.** Every tool returns the same result for the same inputs given the same game state. The LLM handles strategy; the tools handle computation. No tool should require the LLM to do math, pathfinding, or coordinate arithmetic.

**Perfect information (current implementation).** The game does not currently implement fog of war. All tools operate on the complete, ground-truth game state — both the AI's own units and all human units are fully visible. The tool interfaces are designed so that a fog-of-war filtering layer can be inserted later (milestone 1.3) without changing the tool schemas. When fog of war is added, every tool response will be filtered through the calling player's subjective view, and response schemas include fields like `confidence` and `lastSeen` that are currently always `"current"` and `currentTurn` respectively. The coding agent should implement these fields now with their constant values so that the fog-of-war layer can populate them meaningfully later.

**Coordinate system.** All tool interfaces use `[lat, lng]` coordinates (latitude, longitude) as established in the prompt layer. These are the center points of H3 hexes at the game's resolution level. Tools accept and return `[lat, lng]` pairs. Internal implementation uses H3 indexes for computation (pathfinding, distance, adjacency) and converts to `[lat, lng]` at the interface boundary. When a tool receives a `[lat, lng]` pair that doesn't exactly match an H3 hex center, it should snap to the nearest hex at the game's resolution level before processing.

**Stateless per call, stateful per game.** Each tool call is a pure function of (request parameters + current game state). The one exception is Tool 4 (Strategic Memory), which reads and writes a persistent store. All other tools have no side effects on game state.

**Error handling.** Every tool response includes a `status` field (`"ok"` or `"error"`) and an `error` field (null or a human-readable string). The LLM integration layer should surface errors clearly so the LLM can adapt — e.g., `"unit not found"` if the AI references a destroyed unit.

### Current Game State Summary

These facts constrain the tool implementations. The coding agent must not invent systems that do not exist.

**Terrain model.** Two terrain types: land and water. All land hexes have uniform movement cost. Water hexes are impassable for land units; land hexes are impassable for naval units. No terrain combat modifiers exist. Terrain modifiers are a planned future extension (see §3.4 of the combat rules: "Terrain modifiers (optional / future): Not required for first implementation").

**Unit roster.** Three unit types with fixed stats:

| Unit type    | Move | Attack | Defense | Range | Domain |
|--------------|------|--------|---------|-------|--------|
| Infantry     | 1    | 1      | 2       | 0     | Land   |
| Armor        | 2    | 3      | 2       | 1     | Land   |
| Naval        | 2    | 2      | 2       | 2     | Water  |

**Health model.** Binary elimination. One hit removes one unit from the map. There are no hit points, no damage accumulation, no partial health. A unit is either alive or destroyed.

**Combat model.** A&A-style dice: each unit rolls one d6. Attacking: hit if roll ≤ attack value. Defending in melee: hit if roll ≤ defense value. Casualties are assigned automatically by fixed priority (lowest defense first; ties broken by unit-type order: infantry → armor → naval). One round per phase, no multi-round combat within a single turn.

**Resolution sequence.** Ranged phase (pre-move positions) → apply all movement → melee phase (post-move positions). Ranged defenders with range ≥ 1 return fire using their attack value. Full details in the Combat Execution and Resolution Rules document.

**Fog of war.** Not implemented. All unit positions and game state are visible to all players. Tool interfaces include fog-of-war-ready fields (`confidence`, `lastSeen`) that should be populated with constant values (`"current"`, `currentTurn`) for now.

### Integration Architecture

The tools are called during the AI's planning phase, after the AI receives the game state summary but before it must submit orders. The LLM may call tools in any order and make multiple calls per turn. The turn lifecycle becomes:

1. Game engine prepares the game state snapshot (currently unfiltered; will be per-player when fog of war is added).
2. System prompt is assembled with tool definitions, the state summary, strategic memory injection, and standing order status.
3. LLM receives the prompt and begins its planning reasoning.
4. LLM calls tools as needed (multiple calls, any order).
5. LLM submits final orders as a JSON object in the existing format: `{ "strategy": "...", "movementOrders": [...], "rangedAttacks": [...] }`.
6. Game engine validates orders, merges them with standing order outputs for unordered units, and queues everything for simultaneous resolution.

**Tool calling mechanism.** Use the native function-calling / tool-use interface of the model invoked via OpenRouter. Each tool is defined as a function schema in the request. The game engine implements an **iterative tool-calling loop**:

1. Send the assembled prompt (system prompt + game state + memory injection + standing order status + tool definitions) to the LLM.
2. Receive the LLM's response. If the response contains one or more tool-call requests (and no final order JSON), execute each requested tool locally and collect the results.
3. Append the tool results to the conversation as a new message (following the model's expected tool-result format) and send the updated conversation back to the LLM.
4. Repeat steps 2–3 until the LLM produces a final response containing the order-submission JSON (`{ "strategy": "...", "movementOrders": [...], "rangedAttacks": [...] }`) with no further tool calls.

**Maximum iterations.** Cap the loop at **10 round-trips** to prevent runaway tool-call chains that burn through the player's API budget. If the LLM has not produced a final order JSON after 10 iterations, the engine should: (a) log a warning with the full tool-call history for debugging, (b) submit no explicit orders for this turn, allowing standing orders (if any) to execute and unordered units to hold position, and (c) inject a note into the next turn's prompt: `"WARNING: Last turn's planning exceeded the tool-call limit (10 rounds). You submitted no explicit orders. Ensure you submit your final orders JSON promptly after gathering the information you need."`

Only models that support native tool use are supported for now. A JSON-in-prompt fallback for models without native tool use may be added in a later milestone.

**Order submission and standing orders.** The AI submits explicit orders in the same JSON format used in milestone 0.4. Units with standing orders (Tool 5) that do not receive an explicit order in the current turn have their standing order executed by the engine. If the AI submits an explicit order for a unit that also has a standing order, the explicit order takes precedence for that turn only; the standing order resumes next turn. To permanently change a unit's behavior, the AI cancels or replaces its standing order.

**Token budget awareness.** Tool responses should be concise. Avoid returning data the AI didn't ask for. Prefer structured arrays over prose. The AI's player is paying per token through their OpenRouter key, and bloated tool responses consume context window and API budget.

**Prompt format change from milestone 0.4.** The current 0.4 prompt includes a per-unit list of valid move destinations (e.g., `"opponent-armor-1 (armor) at [16.196, 16.574] can move to: [11.444, 14.946], ..."`). With tools available, this list should be **removed** from the base prompt. The AI should use `plan_route` and `check_distance` for movement planning instead. Retaining both the raw move list and the tools wastes tokens, bloats the prompt, and risks the AI ignoring the tools in favor of the simpler list (defeating the purpose of building tools). The base prompt should include only: the unit roster (ID, type, position as `[lat, lng]`) for both sides, the current turn number, and the game objective. All tactical analysis and movement planning flows through the tools.

---

## Tool 1: Pathfinding and Movement Planning

### Purpose

Computes optimal movement routes between any two hexes, accounting for domain constraints (land vs. water) and multi-turn travel. Eliminates the need for the LLM to reason about distances, reachability, or multi-turn movement sequences.

### Current Simplifications

Because all land hexes have uniform movement cost and all water hexes have uniform movement cost, pathfinding is currently a BFS (breadth-first search) over the hex grid, not a weighted A*. The path returned is the shortest path in hex distance. When terrain movement costs are introduced in a future milestone, this should be upgraded to A* with terrain-weighted edge costs. The tool interface does not change — only the internal algorithm.

### Function Schema

```
tool: plan_route
parameters:
  unitId: string          # ID of the unit to route (used to determine domain: land or water)
  destination: [lat, lng]  # target hex in lat/lng coordinates
  options?:
    avoidEnemies: boolean  # default true — route around known enemy positions
    maxTurns: number       # optional — stop computing if route exceeds this many turns
```

### Response Schema

```json
{
  "status": "ok",
  "unitId": "opponent-armor-1",
  "unitType": "armor",
  "origin": [16.196350, 16.574284],
  "destination": [2.097908, 0.499473],
  "hexDistance": 10,
  "turnsRequired": 5,
  "path": [
    {
      "turn": 1,
      "hexes": [[16.196350, 16.574284], [14.271977, 14.275271], [12.378869, 12.076128]],
      "movementSpent": 2,
      "movementBudget": 2,
      "endHex": [12.378869, 12.076128]
    },
    {
      "turn": 2,
      "hexes": [[12.378869, 12.076128], [10.478920, 9.877000], [8.571234, 7.678000]],
      "movementSpent": 2,
      "movementBudget": 2,
      "endHex": [8.571234, 7.678000]
    }
  ],
  "warnings": []
}
```

The `hexes` array for each turn includes the starting hex of that turn's movement as the first element (the unit's position at the start of the turn), followed by each hex the unit moves through. The `endHex` is where the unit rests at end of turn, which is also the first element of the next turn's `hexes` array.

`movementBudget` is the unit's per-turn movement allowance (from the unit roster: infantry = 1, armor = 2, naval = 2). `movementSpent` is how much of that budget the route consumes this turn. With uniform movement costs, each hex entered costs 1 movement point.

### Implementation Notes

**Algorithm.** BFS from origin to destination over the hex grid. Land units can only traverse land hexes. Naval units can only traverse water hexes. The BFS explores all hexes at distance 1, then distance 2, etc., and terminates when it reaches the destination. Then partition the resulting shortest path into per-turn segments based on the unit's movement budget.

**`avoidEnemies` flag.** When true, treat hexes occupied by known enemy units (and optionally their adjacent hexes) as impassable during the BFS. If this makes the destination unreachable, fall back to the route without avoidance and add a warning: `"Route passes through enemy-occupied hexes — avoidance was not possible"`. When false, ignore enemy positions entirely.

**Multi-turn partitioning.** Walk the BFS path and consume movement points per hex entered (currently always 1 per hex). When the movement budget is exhausted, end the current turn's segment. The unit resumes from that hex on the next turn. The final turn's segment may consume less than the full budget.

**Edge cases:**
- Destination is unreachable (wrong domain, or no path exists): `status: "error"`, `error: "No path exists — destination is [impassable for this unit type / unreachable]"`.
- Unit not found or destroyed: `status: "error"`, `error: "Unit not found: {unitId}"`.
- Origin equals destination: return `turnsRequired: 0`, empty `path` array, `status: "ok"`.
- `maxTurns` exceeded: return the partial path computed so far with `warnings: ["Route truncated at maxTurns limit — destination not reached in {maxTurns} turns"]` and include `"reachable": false` in the response.

### Ancillary Function: Distance Query

A lightweight variant that returns distance and travel time without computing the full path. Useful for quick comparisons before requesting full routes.

```
tool: check_distance
parameters:
  from: [lat, lng]    # origin hex
  to: [lat, lng]      # destination hex
  unitType: string    # "infantry", "armor", or "naval"
```

```json
{
  "status": "ok",
  "from": [16.196350, 16.574284],
  "to": [2.097908, 0.499473],
  "hexDistance": 9,
  "estimatedTurns": 5,
  "reachable": true
}
```

`hexDistance` is the H3 grid distance (number of hexes in the shortest path, accounting for domain passability — computed via H3's `gridDistance` function on the internal hex indexes). `estimatedTurns` is `ceil(hexDistance / movementBudget)` for the given unit type. `reachable` is false if no valid path exists between the two hexes for the given unit type.

---

## Tool 2: Threat and Situation Assessment

### Purpose

Provides a structured tactical briefing about a specific unit's situation or a specific hex's properties. Replaces the LLM's need to scan raw coordinate lists and mentally compute distances, adjacencies, and force ratios.

### Function Schema — Unit Assessment

```
tool: assess_unit
parameters:
  unitId: string        # the unit to assess
  radius?: number       # how far out to scan (default: 4 hexes)
```

### Response Schema — Unit Assessment

```json
{
  "status": "ok",
  "unit": {
    "unitId": "opponent-armor-1",
    "type": "armor",
    "position": [16.196350, 16.574284],
    "terrain": "land",
    "movementBudget": 2,
    "currentStandingOrder": null
  },
  "nearbyEnemies": [
    {
      "unitId": "human-infantry-2",
      "type": "infantry",
      "position": [2.097908, 0.499473],
      "hexDistance": 5,
      "estimatedTurnsToReach": 3,
      "inRangedRange": false,
      "inMeleeRange": false,
      "confidence": "current",
      "lastSeen": 1
    }
  ],
  "nearbyFriendlies": [
    {
      "unitId": "opponent-infantry-1",
      "type": "infantry",
      "position": [4.019553, 21.453605],
      "hexDistance": 7,
      "estimatedTurnsToReach": 7
    }
  ],
  "threats": [
    {
      "description": "human-infantry-2 (infantry) can reach your hex in 5 turns",
      "severity": "low",
      "sourceUnit": "human-infantry-2"
    }
  ],
  "canAttackThisTurn": [
    {
      "unitId": "human-infantry-2",
      "attackType": "none",
      "reason": "Out of range (distance 5, armor range 1)"
    }
  ]
}
```

### Function Schema — Hex Assessment

```
tool: assess_hex
parameters:
  position: [lat, lng]  # the hex to assess
  forUnitType?: string  # optional — assess from this unit type's perspective
```

### Response Schema — Hex Assessment

```json
{
  "status": "ok",
  "position": [-3.079545, 0.569734],
  "terrain": "land",
  "passableBy": ["infantry", "armor"],
  "unitsAtHex": [],
  "unitsInRange": {
    "rangedRange1": [
      {
        "unitId": "human-armor-2",
        "type": "armor",
        "position": [-1.474674, 2.658173],
        "hexDistance": 1,
        "confidence": "current",
        "lastSeen": 1
      }
    ],
    "rangedRange2": [],
    "meleeRange": []
  },
  "adjacentTerrain": {
    "land": 4,
    "water": 2
  },
  "strategicNotes": [
    "Adjacent to water — exposed to naval bombardment (range 2)"
  ]
}
```

### Implementation Notes

**`nearbyEnemies` and `nearbyFriendlies`.** Sorted by `hexDistance` ascending. Include all units within the requested radius. The `estimatedTurnsToReach` value has different semantics for enemies and friendlies: for `nearbyEnemies`, it is the assessed unit's travel time to reach the enemy ("how quickly could I attack"), calculated as `ceil(hexDistance / assessedUnit.movementBudget)`. For `nearbyFriendlies`, it is the friendly unit's travel time to reach the assessed unit ("how quickly could they reinforce me"), calculated as `ceil(hexDistance / friendlyUnit.movementBudget)`. This distinction matters because a fast unit assessing the area might see a slow friendly infantry 7 hexes away — the armor could reach the infantry in 4 turns, but the infantry needs 7 turns to reinforce the armor.

**`confidence` and `lastSeen` fields.** With no fog of war, `confidence` is always `"current"` and `lastSeen` is always the current turn number. These fields exist so the fog-of-war layer (milestone 1.3) can populate them with meaningful staleness information without changing the schema. The coding agent should implement them as constants for now.

**`threats` array.** Enumerate all enemy units within the scan radius, classified by how quickly they can reach the assessed unit. Severity classification: `"critical"` if the enemy can attack this turn (is in ranged range or adjacent for melee), `"moderate"` if the enemy can reach within 1–2 turns, `"low"` if 3+ turns away but within scan radius. This is a simple distance-based calculation using each enemy unit's movement budget.

**`canAttackThisTurn` array.** For each enemy within scan radius, report whether the assessed unit can attack it this turn. `attackType` is `"ranged"` (enemy is within the assessed unit's range), `"melee"` (enemy is in the same hex — unlikely during planning, but possible if the assessed unit was moved into a contested hex), or `"none"` (out of range, with a reason string explaining why).

**`strategicNotes` for `assess_hex`.** Deterministically generated from hex properties, not LLM-generated. Current notes to generate: "Adjacent to water — exposed to naval bombardment (range 2)" if any adjacent hex is water. "Chokepoint — only N passable adjacent hexes" if the hex has 3 or fewer passable-by-the-specified-unit-type neighbors. The list is intentionally short. Add more note types only as the game gains more terrain features. Maximum 3 notes.

**`unitsInRange` for `assess_hex`.** This field answers the question "if I move a unit here, who can shoot at it?" It lists enemy units that can attack the assessed hex from their current positions. `rangedRange1` includes enemies at distance 1 whose range stat is ≥ 1. `rangedRange2` includes enemies at distance 2 whose range stat is ≥ 2. `meleeRange` includes enemies at distance 0 (same hex). This is the inbound threat perspective, not the outbound attack perspective.

**`currentStandingOrder` field in unit assessment.** This is `null` until Tool 5 (Standing Orders) is implemented. Once Tool 5 exists, this field should display the unit's current standing order type and status (e.g., `{ "type": "march", "destination": [2.097, 0.499], "status": "en_route" }`). The coding agent should implement this as a constant `null` for now and wire it up when Tool 5 is built.

**Edge cases:**
- Unit not found: `status: "error"`, `error: "Unit not found: {unitId}"`.
- Hex is off-map or invalid: `status: "error"`, `error: "Invalid hex position"`.
- No enemies/friendlies within radius: return empty arrays (not an error).

---

## Tool 3: Combat Outcome Estimation

### Purpose

Predicts the expected result of a single combat engagement (either a ranged attack or a melee fight) before the AI commits forces. Runs Monte Carlo simulation using the game's actual combat resolution logic and returns win probability, expected casualties, and a tactical assessment.

### Scope: Single Engagement, Not Full Turn

This tool simulates one engagement in isolation: either a set of attackers firing at a defender hex in the ranged phase, or a set of units fighting in the same hex during the melee phase. It does **not** simulate a full turn sequence (ranged → movement → melee). The AI calls it to answer questions like "if my armor fires at that hex from range, what happens?" or "if my infantry ends up in the same hex as that enemy, what are the odds?" The AI is responsible for reasoning about the sequencing of ranged-then-move-then-melee at the strategic level; this tool handles the probability math for individual engagements.

### Function Schema

```
tool: estimate_combat
parameters:
  engagementType: "ranged" | "melee"
  attackers:
    units: string[]          # array of attacking unit IDs
    # OR
    assumed: [               # hypothetical attackers (for what-if analysis)
      { type: string, count: number }
    ]
  targetHex: [lat, lng]     # the hex being attacked
  defenders?:
    units: string[]          # specific defender unit IDs (overrides auto-detection)
    # OR
    assumed: [               # hypothetical defenders (for what-if analysis)
      { type: string, count: number }
    ]
```

If `defenders` is omitted, the tool auto-detects enemy units currently at `targetHex`. If no units are at the target hex and no `defenders.assumed` is provided, the tool returns an uncontested result.

### Response Schema

```json
{
  "status": "ok",
  "engagementType": "ranged",
  "targetHex": [-1.474674, 2.658173],
  "attackerSummary": {
    "units": [
      { "unitId": "opponent-armor-1", "type": "armor", "attackValue": 3, "position": [-3.079545, 0.569734] }
    ],
    "totalUnits": 1
  },
  "defenderSummary": {
    "units": [
      { "unitId": "human-armor-1", "type": "armor", "defenseValue": 2 }
    ],
    "totalUnits": 1,
    "canReturnFire": true,
    "returnFireDetails": "human-armor-1 (armor, range 1) can return fire — attacker is at distance 1, within range"
  },
  "prediction": {
    "trials": 10000,
    "attackerHitsExpected": 0.50,
    "defenderHitsExpected": 0.50,
    "attackerLossesExpected": 0.50,
    "defenderLossesExpected": 0.50,
    "probabilityDefenderEliminated": 0.50,
    "probabilityAttackerLosesUnit": 0.50,
    "assessment": "even",
    "reasoning": "Armor attacks at value 3 (50% hit chance). Defender is armor at distance 1 — return fire at value 3 (50% hit chance). Expected outcome: 0.5 casualties each side."
  }
}
```

### Assessment Categories

Derived from `probabilityDefenderEliminated` relative to `probabilityAttackerLosesUnit`:

- `"strongly_favorable"`: P(defender eliminated) > 0.75 AND P(attacker loses unit) < 0.25
- `"favorable"`: P(defender eliminated) > P(attacker loses unit) by at least 0.20
- `"even"`: difference between the two probabilities is less than 0.20
- `"unfavorable"`: P(attacker loses unit) > P(defender eliminated) by at least 0.20
- `"strongly_unfavorable"`: P(attacker loses unit) > 0.75 AND P(defender eliminated) < 0.25

These thresholds are starting points. Tune them based on playtesting — if the AI is too aggressive or too cautious, adjust the category boundaries.

### Implementation Notes

**Monte Carlo simulation.** Run the relevant combat resolution subroutine N times (recommend N=10,000 for stable probabilities with small unit counts). For each trial:

For **ranged** engagements: each attacking unit rolls d6, hit if roll ≤ attack value. If the defender has ranged capability and the attacker is within the defender's range, each defending unit rolls d6 for return fire (hit if roll ≤ attack value — return fire uses attack, not defense). Apply casualty priority to both sides. Count attacker and defender eliminations.

For **melee** engagements: each attacker rolls d6, hit if roll ≤ attack value. Each defender rolls d6, hit if roll ≤ defense value. Apply casualty priority to both sides. Count eliminations.

Casualty priority: remove units with lowest defense value first. Ties: infantry → armor → naval.

**Return fire in ranged estimation.** Whether a defender can return fire depends on the distance between the attacker and defender hexes and the defender's range stat. The tool must check this. For the current unit roster: if armor attacks a hex at range 1, defenders with range ≥ 1 (armor, naval) can return fire. If naval attacks at range 2, defenders with range ≥ 2 (naval only) can return fire, and defenders with range 1 (armor) can return fire only if the naval unit is at distance 1. Infantry (range 0) never returns fire at range.

The tool needs the attacker's position (looked up from the unit ID) to determine return fire eligibility. When attackers are specified by unit ID, the tool knows the attacker's position and must give a **definitive** return fire determination — the `canReturnFire` field is true or false, the `returnFireDetails` states the actual distance and whether return fire occurs, and the prediction values reflect the actual return fire (or lack thereof). The response must not hedge with conditional language like "can return fire if within range." If using `assumed` attackers instead of unit IDs, the tool cannot determine attacker position and should assume no return fire, with a warning: `"Using assumed attackers — return fire not evaluated (attacker position unknown)"`.

**`reasoning` field.** A deterministic, template-generated string explaining the key factors. Not LLM-generated. Template: `"{attacker_type} attacks at value {attack_val} ({hit_pct}% hit chance). {return_fire_description}. Expected outcome: {expected_losses_summary}."` Keep it to 1–2 sentences. The purpose is to help the LLM understand *why* the numbers are what they are, not to provide strategic advice.

**`assumed` units for what-if analysis.** When the AI provides `assumed` attackers or defenders instead of unit IDs, the tool creates virtual units with the specified types and default stats. This lets the AI ask "what if I attack 2 infantry with 1 armor?" without referencing specific unit IDs. Virtual units don't have positions, so return fire calculations require the distance to be inferred from context or omitted with a warning.

**Edge cases:**
- Attacker unit not found: `status: "error"`, `error: "Unit not found: {unitId}"`.
- No defenders at target hex and no `defenders` parameter: return result with 0 defender units, `assessment: "uncontested"`, `reasoning: "No defenders at target hex"`.
- Ranged engagement where attacker is out of range: `status: "error"`, `error: "Attacker {unitId} (range {range}) cannot reach target hex at distance {dist}"`.
- Melee engagement type but attacker is not at the target hex: this is valid — the AI is asking "what if my unit ends up in that hex?" The tool simulates the melee as if the units were co-located.
- Mixed attacker types in the same call (e.g., armor and infantry attacking the same hex): valid for melee (both participate). For ranged, only units with sufficient range to reach the target participate; others are excluded from the simulation with a note in the response.

---

## Tool 4: Strategic Memory

### Purpose

Provides the AI with persistent memory across turns. The LLM can store observations, plans, and reminders that survive between turns, compensating for the fundamental limitation that each turn's LLM call is stateless.

### Two-Tier Design

Memory is divided into two tiers that trade off token cost against always-available context.

**Persistent tier (limit: 5 memories).** These memories are injected into the system prompt every turn automatically. The AI sees them without calling any tool. Use this tier for the AI's current strategic plan, standing threat assessments, and any context it needs to reference on every decision. Because they consume tokens every turn, the limit is tight — 5 memories forces the AI to be selective about what stays in its active working context.

**Stored tier (limit: 15 memories).** These memories are NOT injected into the prompt. They live in the database and are accessible only through `memory_read` (by key or tag query) or through scheduled reminders. Use this tier for observations, historical notes, situational details, and anything the AI might need later but doesn't need to see every turn. Stored memories cost zero tokens on turns where they aren't retrieved.

The total budget is 20 memories (5 persistent + 15 stored). Each tier enforces its own limit independently — when a tier is full, writes to that tier return an error. The AI must delete an existing memory from the same tier before adding a new one.

### Function Schema — Write

```
tool: memory_write
parameters:
  key: string              # unique identifier (e.g., "southern_front_plan")
  content: string          # the text to remember (max 500 characters)
  tier?: "persistent" | "stored"  # default: "stored"
  options?:
    expiresOnTurn?: number  # auto-delete after this turn number
    recurring?:
      intervalTurns: number # remind every N turns
      nextTurn?: number     # first turn to trigger (default: current turn + intervalTurns)
    tags?: string[]         # categorization tags (e.g., ["threat", "south"])
```

### Function Schema — Read

```
tool: memory_read
parameters:
  key?: string             # read a specific memory by key
  tags?: string[]          # read all memories matching any of these tags
  tier?: "persistent" | "stored"  # filter by tier (default: both tiers)
  all?: boolean            # read all active memories (default false)
```

### Function Schema — Delete

```
tool: memory_delete
parameters:
  key: string              # delete a specific memory
```

### Response Schema — Write

```json
{
  "status": "ok",
  "key": "southern_front_plan",
  "tier": "persistent",
  "action": "created",
  "persistentCount": 3,
  "persistentLimit": 5,
  "storedCount": 8,
  "storedLimit": 15
}
```

If the key already exists, this is an upsert: the content, tier, and options are all replaced. The response `action` field is `"updated"` instead of `"created"`. If the tier changes on upsert (e.g., promoting a stored memory to persistent), the counts adjust accordingly — this is valid as long as the destination tier has room.

### Response Schema — Read

```json
{
  "status": "ok",
  "memories": [
    {
      "key": "southern_front_plan",
      "content": "Committed armor-1 and infantry-2 to southern push. ETA 3 turns from turn 5.",
      "tier": "persistent",
      "createdOnTurn": 5,
      "lastTriggered": null,
      "tags": ["plan", "south"]
    },
    {
      "key": "scout_north",
      "content": "No visibility north of [4.020, 21.454] since turn 2. Send a unit to check.",
      "tier": "stored",
      "createdOnTurn": 3,
      "recurring": { "intervalTurns": 3, "nextTurn": 9 },
      "lastTriggered": 6,
      "tags": ["scouting"]
    }
  ]
}
```

### Response Schema — Delete

```json
{
  "status": "ok",
  "key": "southern_front_plan",
  "deleted": true
}
```

### Context Injection

At the start of each AI turn, the memory system injects a section into the system prompt containing only two things: all persistent-tier memories (full content) and any reminders triggered this turn from either tier (key + content summary). Stored-tier memories that are not triggered this turn are never injected — the AI retrieves them via `memory_read` when needed.

Injection format:

```
=== YOUR STRATEGIC MEMORY (Turn 8) ===

[PERSISTENT — your active strategic context]
• southern_front_plan (set turn 5): "Committed armor-1 and infantry-2 to southern push. ETA 3 turns from turn 5."
• naval_doctrine (set turn 1): "Keep naval-1 in a support role — do not advance unsupported."
• current_objective (set turn 6): "Priority target is human-armor-2. Concentrate forces south."

[REMINDERS TRIGGERED THIS TURN]
• scout_north (stored, recurring every 3 turns): "No visibility north of [4.020, 21.454] since turn 2. Send a unit to check."
• current_objective (also persistent, recurring every 5 turns): "Priority target is human-armor-2. Concentrate forces south."

Persistent: 3 of 5 slots used. Stored: 8 of 15 slots used.
Use memory_write to store or update. Use memory_read to retrieve stored memories by key or tag. Use memory_delete to free slots.
```

The `[REMINDERS TRIGGERED THIS TURN]` section includes triggered reminders from both tiers. For persistent memories that are also recurring, they appear in both the persistent section (as always) and the reminders section (marked with `(also persistent)` so the AI knows this isn't new information — it's a scheduled trigger for something already in its active context). For stored memories, the triggered reminder is the only time their content appears in the injection — if the AI needs more detail, it calls `memory_read`.

### Implementation Notes

**Storage.** SQLite table:

```sql
CREATE TABLE ai_memory (
  player_id TEXT NOT NULL,
  key TEXT NOT NULL,
  content TEXT NOT NULL,         -- max 500 characters, enforced at the tool layer
  tier TEXT NOT NULL DEFAULT 'stored',  -- "persistent" or "stored"
  created_turn INTEGER NOT NULL,
  expires_turn INTEGER,          -- null = no expiration
  recurring_interval INTEGER,    -- null = not recurring
  next_trigger_turn INTEGER,     -- null = not scheduled
  last_triggered_turn INTEGER,   -- null = never triggered
  tags TEXT NOT NULL DEFAULT '[]', -- JSON array of strings
  PRIMARY KEY (player_id, key)
);
```

**Memory budget.** Two independent hard caps: 5 persistent, 15 stored. When a tier is full:
- Persistent full: `status: "error"`, `error: "Persistent memory full (5/5). Delete a persistent memory or use tier 'stored' instead."`
- Stored full: `status: "error"`, `error: "Stored memory full (15/15). Delete a stored memory or promote an important one to 'persistent' tier."`

The budget is communicated to the AI in the system prompt tool description and the injection footer.

**Content size limit.** 500 characters per memory. Enforced at the tool layer. If exceeded: `status: "error"`, `error: "Content exceeds 500 character limit ({n} characters provided)"`.

**Recurring reminders.** At the start of each AI turn, before context injection, query for memories where `next_trigger_turn <= currentTurn AND recurring_interval IS NOT NULL`. These appear in the `[REMINDERS TRIGGERED THIS TURN]` section regardless of tier. After triggering, set `last_triggered_turn = currentTurn` and `next_trigger_turn = currentTurn + recurring_interval`.

**Expiration.** At the start of each AI turn, delete all memories where `expires_turn <= currentTurn`. This happens before context injection, so expired memories never appear in the prompt.

**Tier promotion and demotion.** When an existing key is upserted with a different `tier` value, the memory moves between tiers. The engine must check that the destination tier has room before completing the move. If not, return the appropriate tier-full error. A common pattern: the AI has a stored observation and decides it's strategically important enough to keep in active context — it calls `memory_write` with the same key and `tier: "persistent"` to promote it.

**Edge cases:**
- `memory_read` with a key that doesn't exist: `status: "error"`, `error: "Memory not found: {key}"`.
- `memory_read` with tags that match nothing: `status: "ok"`, `memories: []` (empty array, not an error).
- `memory_read` with `tier` filter: return only memories in the specified tier. Combinable with `tags`.
- `memory_delete` with a key that doesn't exist: `status: "error"`, `error: "Memory not found: {key}"`.
- `memory_write` with empty content: `status: "error"`, `error: "Content cannot be empty"`.
- `memory_write` with a key containing whitespace or special characters: `status: "error"`, `error: "Key must be alphanumeric with underscores and hyphens only"`. Enforce pattern: `/^[a-zA-Z0-9_-]+$/`, max 64 characters.

---

## Tool 5: Standing Orders

### Purpose

Allows the AI to assign persistent behavioral directives to individual units. The game engine translates these directives into concrete movement and attack orders each turn without requiring the LLM to re-issue commands. The AI intervenes only when it wants to change a unit's assignment.

### Critical Design Constraint: WEGO Compatibility

In the WEGO resolution model, all movement resolves simultaneously. There is no sequential moment where "an enemy enters a hex." Standing orders must therefore be translated into concrete orders during the **planning phase** (before resolution), not triggered during the **resolution phase**. The engine evaluates standing orders at the start of each AI turn, examines the current game state, and generates movement and/or attack orders as if the AI had issued them manually. These generated orders then enter the normal resolution pipeline alongside all other players' orders and are resolved simultaneously.

This means a `defend` order does not "intercept" an incoming enemy during resolution. Instead, at planning time, the engine looks at the defending unit's surroundings, determines if any known enemies are within engagement range, and generates an attack order against the nearest/most threatening one. If no enemies are nearby, the engine generates no movement order (the unit holds position). During resolution, the defend unit's attack order resolves simultaneously with all other orders — the defending unit might fire at an enemy that is simultaneously moving away.

### Timing: New Orders Take Effect Next Turn

When the AI calls `assign_order` during its planning phase (step 4 of the per-turn execution sequence), the standing order is stored in the database and the response includes the computed route and status. However, the order does **not** generate a concrete movement or attack order for the current turn — concrete order generation (step 2) has already run before the LLM was invoked. The standing order takes effect starting the **next** turn.

If the AI wants the unit to move or attack this turn in alignment with the new standing order, it should issue an explicit movement or attack order alongside the `assign_order` call. The explicit order handles this turn; the standing order handles subsequent turns automatically. This is the expected pattern — assign the strategic intent via `assign_order`, handle the immediate tactical action via an explicit order.

The system prompt's tool description should communicate this: "Standing orders take effect next turn. If you want a unit to act this turn, issue an explicit order in addition to assigning the standing order."

### Function Schema — Assign Order

```
tool: assign_order
parameters:
  unitId: string
  order:
    type: "defend" | "march" | "pursue" | "patrol" | "hold_fire"

    # --- defend ---
    defendHex?: [lat, lng]       # hex to hold (default: unit's current position)
    engageRange?: number         # max hex distance to generate attack orders (default: unit's range stat)

    # --- march ---
    destination?: [lat, lng]     # final destination
    avoidEnemies?: boolean       # route around known threats (default: true)
    engageEnRoute?: boolean      # generate attack orders against enemies adjacent to the route (default: false)

    # --- pursue ---
    targetUnitId?: string        # enemy unit to chase
    maxDistance?: number         # max hex distance from the unit's position at time of order (default: unlimited)

    # --- patrol ---
    waypoints?: [lat, lng][]     # cycle through these hexes in order (minimum 2)

    # --- hold_fire ---
    # no additional parameters
```

### Function Schema — Query Orders

```
tool: query_orders
parameters:
  unitId?: string              # query a specific unit's standing order
  all?: boolean                # query all standing orders (default false)
```

### Function Schema — Cancel Order

```
tool: cancel_order
parameters:
  unitId: string               # cancel this unit's standing order
```

### Response Schema — Assign Order

```json
{
  "status": "ok",
  "unitId": "opponent-armor-1",
  "order": {
    "type": "march",
    "destination": [2.097908, 0.499473],
    "computedRoute": {
      "turnsRemaining": 5,
      "nextMoveHex": [14.271977, 14.275271],
      "totalPath": [[14.271977, 14.275271], [12.378869, 12.076128], [10.478920, 9.877000], [8.571234, 7.678000], [6.663548, 5.479000], [4.755862, 3.280000], [2.097908, 0.499473]]
    },
    "avoidEnemies": true,
    "engageEnRoute": false
  },
  "replacedOrder": null
}
```

If the unit previously had a standing order, `replacedOrder` contains the previous order's type and key details for confirmation.

### Response Schema — Query Orders

```json
{
  "status": "ok",
  "orders": [
    {
      "unitId": "opponent-armor-1",
      "type": "march",
      "destination": [2.097908, 0.499473],
      "turnsRemaining": 3,
      "nextMoveHex": [10.478920, 9.877000],
      "status": "en_route"
    },
    {
      "unitId": "opponent-infantry-1",
      "type": "defend",
      "defendHex": [4.019553, 21.453605],
      "engageRange": 0,
      "status": "holding"
    }
  ]
}
```

### Response Schema — Cancel Order

```json
{
  "status": "ok",
  "unitId": "opponent-armor-1",
  "cancelled": true,
  "previousOrder": { "type": "march", "destination": [2.097908, 0.499473] }
}
```

### Order Behavior Definitions

Each order type describes what the engine does at the **start of the AI's planning phase** to generate concrete orders for the resolution pipeline.

**`defend`:** The engine checks if any known enemy units are within `engageRange` hexes of `defendHex`. If so, it generates a ranged attack order against the nearest enemy (if the defending unit has range and the enemy is within range) or generates no movement (the unit stays put and will participate in melee if an enemy moves into its hex during resolution). The unit never moves away from `defendHex`. If the unit is not yet at `defendHex`, the engine generates a movement order toward it (using BFS shortest path). `engageRange` defaults to the unit's range stat (0 for infantry, 1 for armor, 2 for naval), meaning by default a defending unit only generates attack orders against enemies it can actually hit. Setting `engageRange` higher than the unit's range stat has no additional effect for ranged attacks but could be used in future extensions for triggering movement-to-engage.

**`march`:** The engine computes a route from the unit's current position to `destination` using Tool 1's pathfinding logic (BFS, with enemy avoidance if `avoidEnemies` is true). Each turn, it generates a movement order advancing the unit along the route by its movement budget. If `engageEnRoute` is true and a known enemy unit is adjacent to the unit's current position (before movement), the engine generates a ranged attack order against it (if the unit has range) in addition to the movement order. When the unit arrives at the destination, the standing order's status becomes `"arrived"` and the order remains active but generates no further movement (the unit holds at the destination until reassigned). If the route becomes blocked (a hex that was passable is no longer passable), status becomes `"blocked"` and the engine generates no movement order; the AI is notified via the standing order status injection.

**`pursue`:** Each turn, the engine looks up the last-known position of `targetUnitId` and computes a route toward it. It generates a movement order advancing the unit along that route by its movement budget. If the target is within attack range, it also generates a ranged attack order. The route is recomputed each turn as the target's known position updates. If `maxDistance` is set and the target's last-known position is more than `maxDistance` hexes from the unit's position when the order was originally issued (stored as `originHex`), the status becomes `"target_out_of_range"` and the engine generates no movement. If the target has been destroyed and the AI is aware of it (the target no longer appears in the game state), status becomes `"target_destroyed"` and the order auto-cancels. If the target hasn't been observed for 3+ turns (relevant once fog of war is implemented; currently this never happens since all units are visible), status becomes `"target_lost"` — the unit proceeds to the last-known position and then holds.

**`patrol`:** The engine cycles through `waypoints` in order. Each turn, it generates a movement order advancing the unit along the BFS route to the next waypoint by the unit's movement budget. On reaching the last waypoint, the next target becomes the first waypoint (cyclic). Patrol units do not generate attack orders — they are scouts. If an enemy is adjacent to the patrol unit's current position, this is reported in the standing order status as `"contact"` so the AI can decide whether to intervene, but the engine takes no offensive action.

**`hold_fire`:** The engine generates no movement and no attack orders. The unit stays in its current hex and does not participate in ranged attacks. It still defends in melee if an enemy moves into its hex (melee defense rolls are automatic in the combat resolution system), but it does not initiate any attacks.

### Standing Order Status Injection

At the start of each AI turn, the standing order status is injected into the system prompt after the memory injection and before the tool definitions:

```
=== STANDING ORDER STATUS (Turn 8) ===
• opponent-armor-1: MARCH to [2.097, 0.499] — en_route, 3 turns remaining, next move to [10.479, 9.877]
• opponent-infantry-1: DEFEND [4.020, 21.454] — holding, no enemy contacts within range
• opponent-naval-1: PURSUE human-armor-2 — closing, distance 3, next move to [-9.042, -14.238]
⚠ opponent-infantry-2: MARCH to [-19.459, 5.396] — BLOCKED (no passable path from current position)

Units without standing orders: opponent-armor-2
```

The `⚠` prefix flags orders that need the AI's attention. Status values that trigger the warning flag: `"blocked"`, `"target_lost"`, `"target_out_of_range"`, `"target_destroyed"`, `"arrived"` (the unit reached its destination and is idle), `"contact"` (patrol unit spotted an enemy).

The injection must include a footer line listing all AI units that currently have no standing order (e.g., `"Units without standing orders: opponent-armor-2"`). This tells the AI which units require explicit orders this turn. If all units have standing orders, the footer reads `"All units have standing orders."` If no units have standing orders (e.g., Tool 5 was just deployed and no orders have been assigned yet), the footer lists every unit.

### Implementation Notes

**Storage.** SQLite table:

```sql
CREATE TABLE standing_orders (
  player_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  order_type TEXT NOT NULL,      -- "defend", "march", "pursue", "patrol", "hold_fire"
  params TEXT NOT NULL,          -- JSON: type-specific parameters
  computed_route TEXT,           -- JSON: current computed path for march/pursue/patrol (null for defend/hold_fire)
  status TEXT NOT NULL,          -- "en_route", "holding", "closing", "patrolling", "arrived", "blocked", etc.
  created_turn INTEGER NOT NULL,
  origin_hex TEXT NOT NULL,      -- JSON [lat, lng]: unit's position when order was assigned (for maxDistance calc)
  PRIMARY KEY (player_id, unit_id)
);
```

**Per-turn execution sequence.** At the start of the AI's planning phase, before the LLM is invoked:

1. Expire/update standing order statuses (check for destroyed units, arrived march orders, destroyed pursue targets).
2. For each unit with an active standing order, generate concrete orders for this turn's resolution pipeline. These orders are provisional — they will be overridden in step 5 if the AI issues explicit orders for the same unit.
3. Inject standing order status into the system prompt.
4. Invoke the LLM with tools.
5. After the LLM responds, merge its explicit orders with the standing-order-generated orders from step 2. If the AI issued an explicit order for a unit that also has a standing order, the explicit order replaces the standing order's generated order for this turn only. The standing order remains active and resumes generating orders next turn.

**Route recomputation.** `march` (with `avoidEnemies`) and `pursue` orders recompute their routes each turn using the current game state. Since pathfinding is BFS on a small map, this is computationally trivial even for all units every turn.

**Edge cases:**
- Unit not found: `status: "error"`, `error: "Unit not found: {unitId}"`.
- Pursue target not found: `status: "error"`, `error: "Target unit not found: {targetUnitId}"`.
- March destination is current position: auto-complete, `status: "arrived"`.
- Patrol with fewer than 2 waypoints: `status: "error"`, `error: "Patrol requires at least 2 waypoints"`.
- Patrol waypoint is impassable for the unit type: `status: "error"`, `error: "Waypoint {position} is impassable for {unitType}"`.
- Assign order to a unit that already has one: replace the existing order. Return the replaced order in `replacedOrder`.
- Cancel order for a unit with no standing order: `status: "error"`, `error: "No standing order found for unit {unitId}"`.
- Unit with a standing order is destroyed during resolution: the engine deletes the standing order from the database during the status update step (step 1 of per-turn execution). The standing order status injection must not include destroyed units. If a pursue order's owner is destroyed, no further processing occurs. If a defend order's owner is destroyed, no further processing occurs.

---

## System Prompt Integration

The AI's system prompt should describe all available tools. Below is the recommended tool-description block. Adjust wording based on playtesting of how well different LLMs respond to the descriptions.

```
=== AVAILABLE TOOLS ===

You have access to the following tools to help you plan your turn. Call them as needed before submitting your final orders. You may call multiple tools and call the same tool multiple times.

MOVEMENT AND POSITIONING:
1. plan_route(unitId, destination, options?) — Compute the optimal path for a unit to a destination hex. Returns the full multi-turn route with per-turn waypoints. Use this to understand how long moves take before committing.
2. check_distance(from, to, unitType) — Quick distance and turn estimate between two hexes. Use this to compare options before requesting full routes.

INTELLIGENCE:
3. assess_unit(unitId, radius?) — Tactical briefing on one of your units: nearby enemies and friendlies, threats, and what you can attack this turn.
4. assess_hex(position, forUnitType?) — Intelligence on a hex: terrain, units present, units in range, chokepoint analysis.

COMBAT:
5. estimate_combat(engagementType, attackers, targetHex, defenders?) — Predict the outcome of a ranged or melee engagement. Returns win probability, expected casualties, and a tactical assessment. Always check before committing to an attack.

MEMORY:
6. memory_write(key, content, tier?, options?) — Store a note, plan, or reminder. Two tiers: "persistent" (always shown in your briefing, limit 5 — use for your active strategic plan and key assessments) and "stored" (default, retrieved on demand via memory_read, limit 15 — use for observations, details, and situational notes). 500 chars each.
7. memory_read(key?, tags?, tier?, all?) — Retrieve memories by key, tag, or tier. Essential for accessing your stored-tier memories — they are NOT shown in your briefing automatically.
8. memory_delete(key) — Delete a memory to free a slot in its tier.

STANDING ORDERS:
9. assign_order(unitId, order) — Give a unit a persistent mission: defend, march, pursue, patrol, or hold_fire. The engine executes it each turn automatically. NOTE: New standing orders take effect NEXT turn. If you want the unit to act THIS turn, also issue an explicit movement or attack order.
10. query_orders(unitId?, all?) — Check standing order statuses.
11. cancel_order(unitId) — Cancel a standing order.

HOW TO USE THESE TOOLS EFFECTIVELY:
- Start by reviewing your standing order statuses and persistent strategic memory (both are shown above).
- Use assess_unit on units near the enemy to understand the tactical picture.
- Use estimate_combat before any attack. Do not guess at combat odds.
- Use plan_route to understand multi-turn moves before issuing march orders.
- Use memory_write with tier "persistent" for your active strategic plan and key threat assessments (limit 5). Use tier "stored" for observations and details you may need later (limit 15).
- Use memory_read to retrieve stored memories by key or tag when you need situational detail.
- Units with standing orders do not need explicit orders from you unless you want to override their current mission this turn.
- Submit your final orders as: { "strategy": "...", "movementOrders": [...], "rangedAttacks": [...] }
```

---

## Implementation Priority and Dependencies

```
Tool 1 (Pathfinding) ← foundation, no dependencies
    ↑
Tool 2 (Assessment) ← uses distance calculations from Tool 1 (check_distance logic)
    ↑
Tool 3 (Combat Estimation) ← uses range checking shared with Tool 2

Tool 4 (Memory) ← fully independent, no gameplay dependencies

Tool 5 (Standing Orders) ← depends on Tool 1 for route computation
                         ← depends on Tool 2 for defend engagement detection
                         ← depends on combat model for defend attack generation
```

**Recommended build and integration sequence:**

**Step 1: Tool 1 (Pathfinding) + Tool 4 (Memory).** Build in parallel — they share no dependencies. Tool 1 establishes the BFS pathfinding and distance calculation that Tools 2, 3, and 5 need. Tool 4 is pure CRUD against SQLite with a context-injection layer. Both are independently testable. After this step, the AI can plan routes and remember things across turns.

**Step 2: Tool 2 (Assessment).** Uses `check_distance` logic from Tool 1. After this step, the AI gets structured tactical briefings instead of raw coordinate lists. This is where you should see the most dramatic improvement in AI decision quality.

**Step 3: Tool 3 (Combat Estimation).** Wraps the existing combat resolution function in a Monte Carlo loop. Requires range-checking logic that should already be factored out during Tool 2 development. After this step, the AI stops guessing at combat odds.

**Step 4: Tool 5 (Standing Orders).** The most complex tool with the deepest engine integration. Depends on Tool 1 (pathfinding for march/pursue), Tool 2 concepts (threat detection for defend), and the order-generation pipeline. Build this last because the AI is fully functional without it — standing orders are a quality-of-life improvement that makes the AI feel more coherent across turns, but the AI can play competently by re-issuing manual orders every turn using Tools 1–4.

### Testing Strategy

**Unit tests.** For each tool, write deterministic test cases:
- Tool 1: Known map layouts with known shortest paths. Verify BFS produces correct routes and multi-turn partitioning is correct for each unit type's movement budget. Test land-unit-on-water and naval-on-land rejection.
- Tool 2: Known unit placements with known distances. Verify threat classification (critical/moderate/low) matches expected values. Verify `canAttackThisTurn` correctly evaluates range.
- Tool 3: Known force compositions with analytically computable probabilities. Example: 1 armor (attack 3) vs 1 infantry (defense 2) in melee. P(attacker hits) = 3/6 = 0.5. P(defender hits) = 2/6 = 0.33. Verify Monte Carlo converges to these values within tolerance.
- Tool 4: Full CRUD lifecycle. Write to both tiers, read-back by key/tag/tier, overwrite, tier promotion/demotion, expire, recurring trigger from both tiers, delete. Verify context injection includes only persistent memories and triggered reminders. Verify tier-full errors fire independently.
- Tool 5: Multi-turn march execution. Pursue with moving target. Defend with enemy in range vs. out of range. Patrol cycle. Explicit order override.

**Integration playtesting.** After each tool is deployed, play a complete game and evaluate:
- Does the AI call the tool? If not, the tool description in the system prompt needs adjustment.
- Does the AI use the tool's output in its reasoning? Check by reading the AI's `strategy` field — does it reference information that could only have come from a tool call?
- Does the AI over-call the tool, wasting tokens? If so, add guidance to the system prompt about when to use each tool.
- Does the AI misinterpret the response? If so, simplify the response schema or add a `summary` field with a plain-English one-liner.

**Log all tool calls.** Every tool call and response should be logged with the turn number and player ID. This log is a debugging tool now and the foundation for the "AI observatory" feature in milestone 2.2.

---

## Future Extension Points

The following capabilities are explicitly **not** in scope for milestone 0.5 but the tool interfaces are designed to accommodate them without schema changes:

**Fog of war (milestone 1.3).** Insert a filtering layer between the game state and tool responses. Every tool response that references enemy units or hex contents gets filtered through the player's subjective view. The `confidence` and `lastSeen` fields in Tool 2's responses become meaningful. Tool 1's pathfinding operates on the player's known terrain map instead of ground truth. Tool 3's combat estimation warns when defender information is stale.

**Terrain movement costs (milestone 1.2+).** Upgrade Tool 1's BFS to A* with a `movementCost(unitType, terrainType)` lookup table. Tool 2's `assess_hex` response gains a `movementCosts` field showing per-unit-type costs. No schema changes needed — the fields are already designed for it.

**Terrain combat modifiers (milestone 1.5+).** Tool 3's combat estimation applies terrain modifiers to attack/defense values. Tool 2's responses gain defense modifier information. The `reasoning` field in Tool 3 explains terrain effects.

**Additional unit types (milestone 1.5+).** The unit roster expands. All tools handle unit types generically (by looking up stats from the roster), so new types require no tool code changes — only roster data changes.