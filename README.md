# Agent Wars

Grand strategy wargame with LLM opponents on a real-Earth H3 map. Early milestones **0.5–0.7** validated tools, hybrid AI, and event-driven callbacks; **1.1** established the production baseline (see [.spec/completed/milestone-1.1-execution-plan.md](.spec/completed/milestone-1.1-execution-plan.md)). The current shipping version is **2.4.0** (`package.json`).

Development roadmap: [.spec/devleopment-plan-v3.3.md](.spec/devleopment-plan-v3.3.md).

## Repository status

- **Release version:** **2.4.0** (developer / side-load distribution only; no store or notarization requirements yet)
- **Progress:** Phase 0 (hybrid AI validation) and Phase 1 (global strategic game) are complete. Phase 2 tactical battles are complete through **milestone 2.4** (integration and balance). Next planned milestone is **2.5** (save/load and session management). Post-2.4 work on this branch is playtest hardening and UX polish (pathfinding, build queue, return-fire visuals, keyboard pan, and related fixes).
- CI: GitHub Actions matrix build and test on Windows/Linux/macOS

## Current capabilities (2.4)

- **Strategic map (H3 res 1):** Global Earth hexes with terrain, fog of war, economy/production, standing orders, and WEGO resolution (ranged → movement → melee, plus air/ferry phases where applicable).
- **Tactical battles (H3 res 4):** Optional zoom-in fights when forces contest a strategic hex — sub-unit maneuver, terrain-aware movement, ranged/return fire, melee, bail-out back to strategic resolution, and LLM tactical play.
- **Hybrid AI:** Pre-computed briefings, ad-hoc planning tools, standing orders, and callback-driven consultations via OpenRouter (BYOK). Tool-capable models only.
- **Units:** Infantry, armor, naval, and air — with sealift, production, and infrastructure interactions at the strategic layer.
- **Packaging:** `npm run dist` / `dist:win` / `dist:linux` / `dist:mac` via electron-builder (see [.spec/completed/packaging.md](.spec/completed/packaging.md)).

## Prerequisites

- Node.js 24+ (`.nvmrc` pins 24)
- npm 10+

## Quick start

```bash
npm install
npm run build
npm start
```

## OpenRouter setup (required for AI turns)

1. Launch the app (`npm start`).
2. In the right-side OpenRouter panel, open the **Model** tab.
3. Paste your OpenRouter API key into **API key** (`Set key and blur to save`).
4. Click outside the field to save.
5. Click **Refresh models** and choose a tool-capable model.
6. Use the OpenRouter run toggle to enable background AI planning.

Notes:

- API keys are handled only in the Electron main process.
- The key is stored locally in the Electron user-data directory, not in repo files.
- If key/model is missing, the app can still run but AI turns are skipped.

## Run and verify

- **Build:** Compiles the main process and preload with TypeScript (`dist/`) and bundles the renderer with esbuild (`static/renderer.js`). Generated terrain data is extracted as part of the build.
- **Start:** Runs Electron; the window loads the renderer from `static/index.html`.

**Note:** Game state is stored in SQLite via **better-sqlite3** (native module). The database file is created in your Electron user data directory.

## How to play

1. **Pan:** Drag with the left mouse button, or use WASD / arrow keys.
2. **Zoom:** Mouse wheel (zooms toward the cursor). At high zoom over a contested strategic hex, tactical battle entry may be available.
3. **Select a unit:** Click a hex that contains a blue (human) unit. The hex highlights and the sidebar shows hex info.
4. **Issue a move order:** With a unit selected, click a valid destination hex (within movement range; land/water/terrain rules apply). The order appears under “Pending orders.” Standing march orders can also be set for multi-turn movement.
5. **Ranged attack (armor or naval on strategic; broader types on tactical):** With a capable unit selected, click **Ranged attack (click target hex)**, then click an enemy-occupied hex within range. Declarations are submitted with Ready.
6. **Ready:** Click **Ready** to submit orders and resolve the turn. When one side has no units left, the game ends; use **New game** to play again.
7. You can issue multiple movement and ranged orders (one per unit each) before clicking Ready.

## Where messages appear

- **Lower-left (floating log over the map):** User actions and errors — e.g. submit/ready failures, invalid ranged target, AI move summary after Ready. Use the × to dismiss. Planning toasts are suppressed while you are still issuing orders.
- **Lower-right (OpenRouter panel, Status):** AI interactions and errors only — e.g. "Requesting AI orders…", model list errors, turn resolved. AI move and attack counts are still summarized in the lower-left toast.

## UI controls summary

- Pan: drag with left mouse, or WASD / arrows.
- Zoom in/out: mouse wheel.
- Select hex/unit: click on hex.
- Add move order: select unit, then click destination.
- Ranged attack: select capable unit, click “Ranged attack”, then click enemy hex in range.
- Resolve turn: Ready button.
- New game: after game over, click “New game”.

## Lint

```bash
npm run lint
```

Runs ESLint on `src/` (main and renderer TypeScript).

## Tests

```bash
npm run test
```

Runs core main-process and tool contract tests.

## Terrain generation pipeline

**Electron runtime** loads generated metadata under `data/generated/` (extracted from the pack on build/start), classifies hex kinds in the main process, and seeds SQLite from that cache. Packaged builds include those JSON files; regenerate them with `npm run terrain:generate` when the metadata or road/rail pipeline changes. Startup fails fast if required metadata is missing or invalid (including empty res-4 metadata).

**Classification outputs** (res-1 base + res-4 exceptions CSVs and run metadata) are produced by the main Python CLI:

```bash
python -m scripts.terrain_pipeline.cli validate --verbose
python -m scripts.terrain_pipeline.cli run --verbose
```

**Per-hex feature metadata and road/rail sides** use:

```bash
python -m scripts.terrain_pipeline.metadata_cli validate --verbose
npm run terrain:generate
```

- `npm run terrain:generate` → metadata CLI, then road/rail sides CLI (`fast` mode)
- Related: `terrain:generate:landmass`, `terrain:generate:road-rail:high-fidelity`, `terrain:generate:road-rail-vectors`

Shared Python tests for the terrain scripts:

```bash
npm run terrain:test
```

Classification environment check:

```bash
npm run terrain:validate
```

Setup and troubleshooting are documented in `scripts/terrain_pipeline/README.md`.

## Early prototype notes (milestones 0.2–0.5)

These describe the throwaway Phase 0 loop that validated combat, tools, and AI before the production baseline. The live game is the 2.x global + tactical build above.

- **0.2:** Small hex map, WEGO movement only, SQLite state, no AI.
- **0.4:** Combat (ranged → move → melee), win condition, resolution visuals and stacking.
- **0.5:** OpenRouter tool-calling AI (`plan_route`, `check_distance`), tool-capable models only, capped planning round-trips.

## License

ISC (`package.json`).
