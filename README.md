# Agent Wars

Grand strategy wargame with LLM opponents. This repo implements milestones through **Milestone 0.4 — Combat and Victory**.

## What Milestone 0.4 adds

- **Combat resolution:** Resolution order is **ranged (at current positions) → apply all movement → melee (at final positions)**. Ranged is resolved before movement so targets are where you aimed. One d6 per unit; hit when roll ≤ attack/defense. Casualties by priority (lowest defense first, then infantry → armor → naval). A single **game seed** is used for the whole game so replay is deterministic.
- **Ranged attacks:** Armor (range 1) and naval (range 2) can declare a target hex (enemy, in range). Human: select the unit, click **Ranged attack**, then click a valid target hex. Ranged declarations are submitted with movement orders when you click Ready. The AI can also declare ranged attacks via the prompt.
- **Win condition:** Eliminate all enemy units. When one side has no units left, the game ends and the winner is shown. Use **New game** to reset and play again.
- **Combat and stacking visuals:** Resolution animates in five phases: ranged lightning and casualties (units at pre-move positions), then movement, then melee lightning and casualties (units at post-move positions). Combat (yellow lightning) and death (red X) overlays are drawn on the correct hexes for each phase. Stacks show a second layered icon and a unit count in the lower-right of the hex; mixed unit types show an asterisk (*); multi-player stacks use light grey and a black border.

## What Milestone 0.2 adds

- **~37-hex map** (k-ring 3) with **two terrain types**: land and water. Terrain is stored in SQLite and drives map colors.
- **Two players**, each with **3–5 units** of three types: infantry (I), armor (A), naval (N). Units are placed at game start; naval on water, others on land.
- **WEGO turn structure:** In the **planning phase**, click a friendly unit (blue), then click an adjacent destination hex to add a movement order. Orders are listed in the sidebar. Click **Ready** to end planning and **resolve** all movement simultaneously. Turn number and phase are shown in the sidebar.
- **Game state** is stored in **SQLite** in the main process (file in Electron user data directory). No combat yet — units only move. The opponent’s units do not move in 0.2 (no AI).

## Run the app

```bash
npm install
npm run build
npm start
```

- **Build:** Compiles the main process and preload with TypeScript (`dist/`) and bundles the renderer with esbuild (`static/renderer.js`).
- **Start:** Runs Electron; the window loads the renderer from `static/index.html`.

**Note:** Game state is stored in SQLite via **sql.js** (WASM, no native build required). The database file is created in your Electron user data directory.

## How to play

1. **Pan:** Drag with the left mouse button.
2. **Zoom:** Mouse wheel (zooms toward the cursor).
3. **Select a unit:** Click a hex that contains a blue (human) unit. The hex highlights and the sidebar shows hex info.
4. **Issue a move order:** With a unit selected, click a valid destination hex (within movement range; land/water rules apply). The order appears under “Pending orders.”
5. **Ranged attack (armor or naval):** With an armor or naval unit selected, click **Ranged attack (click target hex)**, then click an enemy-occupied hex within range (1 for armor, 2 for naval). The ranged declaration appears under “Ranged attacks” and is submitted with Ready.
6. **Ready:** Click **Ready** to submit orders and resolve the turn. Ranged combat is resolved at current positions, then all movement is applied, then melee combat is resolved at final positions. The resolution animation shows ranged lightning and casualties, then movement, then melee lightning and casualties, each on the correct unit positions. When one side has no units left, the game ends; use **New game** to play again.
7. You can issue multiple movement and ranged orders (one per unit each) before clicking Ready.

## Where messages appear

- **Lower-left (floating log over the map):** User actions and errors — e.g. submit/ready failures, invalid ranged target, AI move summary after Ready. Use the × to dismiss.
- **Lower-right (OpenRouter panel, Status):** AI interactions and errors only — e.g. "Requesting AI orders…", model list errors, turn resolved. AI move and attack counts are still summarized in the lower-left toast.

## UI controls summary

| Action           | Control                    |
|------------------|----------------------------|
| Pan              | Drag with left mouse       |
| Zoom in/out      | Mouse wheel                |
| Select hex/unit  | Click on hex               |
| Add move order   | Select unit, then click destination |
| Ranged attack    | Select armor/naval, click “Ranged attack”, then click enemy hex in range |
| Resolve turn     | Ready button               |
| New game         | After game over, click “New game”   |

## Lint

```bash
npm run lint
```

Runs ESLint on `src/` (main and renderer TypeScript).
