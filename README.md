# Agent Wars

Grand strategy wargame with LLM opponents. This repo implements **Milestone 0.1 — Hello Hex World** and **Milestone 0.2 — Game State and Turns**.

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

## How to play (0.2)

1. **Pan:** Drag with the left mouse button.
2. **Zoom:** Mouse wheel (zooms toward the cursor).
3. **Select a unit:** Click a hex that contains a blue (human) unit. The hex highlights and the sidebar shows hex info.
4. **Issue a move order:** With a unit selected, click an **adjacent** hex. Land units (I, A) must move to land; naval (N) must move to water. The order appears under “Pending orders.”
5. **Ready:** Click the **Ready** button to resolve all pending orders at once. Units move; the turn advances. Refresh the view from the new game state.
6. You can issue multiple orders (one per unit) before clicking Ready. Clicking “Ready” with no orders still ends the turn (pass).

## UI controls summary

| Action           | Control                    |
|------------------|----------------------------|
| Pan              | Drag with left mouse       |
| Zoom in/out      | Mouse wheel                |
| Select hex/unit  | Click on hex               |
| Add move order   | Select unit, then click destination |
| Resolve turn     | Ready button               |

## Lint

```bash
npm run lint
```

Runs ESLint on `src/` (main and renderer TypeScript).
