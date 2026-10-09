# Agent Wars

Grand strategy wargame with LLM opponents on a real-Earth H3 map. Early milestones **0.5–0.7** validated tools, hybrid AI, and event-driven callbacks; **1.1** established the production baseline (see [.spec/completed/milestone-1.1-execution-plan.md](.spec/completed/milestone-1.1-execution-plan.md)). The current shipping version is **2.5.0** (`package.json`).

![Tactical planning over central Mexico](doc/media/tactical-battle-mexico.jpg)

*A tactical battle in central Mexico on turn 2, a rainy August. Teal human units face the rose opponent, and their movement orders are queued in the right panel. The hex readout for Guerrero, Morelos, and México lists the road, the forest and urban terrain, the rain, and what those do to range, movement, and cover. At the upper right, the opponent's message reads "Your lines will shatter before you even realize the battle has begun."*

Third-party software and data are credited in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Development roadmap: [doc/devleopment-plan-v3.4.md](doc/devleopment-plan-v3.4.md).

## Repository status

- **Release version:** **2.5.0** (developer / side-load distribution only; no store or notarization requirements yet)
- **Progress:** Phase 0 (hybrid AI validation) and Phase 1 (global strategic game) are complete. Phase 2 is complete through **milestone 2.5** (regional game and rules enhancements), including tactical battles (2.1 to 2.4) and playtester UI fixes (2.45). Milestone **2.6** (player-facing save/load and session management) is not shipped.
- CI: GitHub Actions matrix build and test on Windows/Linux/macOS

## Current capabilities (2.5)

- **Strategic map:** Real-Earth H3 hexes with terrain, fog of war, economy/production, standing orders, and WEGO resolution (ranged → movement → melee, plus air/ferry phases where applicable). The global map uses H3 resolution 1.
- **Regional maps:** A Regional tab on the new-game dialog starts a match on one region, with side groups instead of home regions, weekly turns, and region-specific economies. Regional strategic hexes are H3 resolution 2 or 3 (`strategicH3Resolution`).
- **Tactical battles:** Optional zoom-in fights when forces contest a strategic hex — sub-unit maneuver, terrain-aware movement, ranged/return fire, melee, bail-out back to strategic resolution, and LLM tactical play. Battle cells sit three H3 resolutions below the strategic grid: 4 on the global map, 5 or 6 on a regional map (`tacticalH3Resolution`).
- **Hybrid AI:** Pre-computed briefings, ad-hoc planning tools, standing orders, and callback-driven consultations via OpenRouter (BYOK). A model without tool calls still plays, without the planning tools.
- **Units:** Infantry, armor, naval, and air — with sealift, production, and infrastructure interactions at the strategic layer.
- **Packaging:** `npm run dist` / `dist:win` / `dist:linux` / `dist:mac` via electron-builder (see [.spec/completed/packaging.md](.spec/completed/packaging.md)).

![Spain's 1st Fleet heading west across the Atlantic on the global map](doc/media/global-spain-new-world.png)

*Re-invading the New World. What's waiting for us?*

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
2. In the right-side panel, open the **Model** tab (the panel starts on it).
3. Paste your OpenRouter API key into the API key field (placeholder `Set key and blur to save`).
4. Click outside the field, or press Enter, to save. A saved key loads the model list.
5. Choose a model. **Refresh model list** reloads the list.
6. Click **Run** to start opponent planning.

Notes:

- API keys are handled only in the Electron main process.
- The key is stored locally in the Electron user-data directory, not in repo files.
- If the key or model is missing, the app still runs, Run stays disabled, and the opponent makes no model calls.

## Run and verify

- **Build:** Compiles the main process and preload with TypeScript (`dist/`) and bundles the renderer with esbuild (`static/renderer.js`). Generated terrain data is extracted as part of the build.
- **Start:** Runs Electron; the window loads the renderer from `static/index.html`.

**Note:** Game state is stored in SQLite via **better-sqlite3** (native module). The database file is created in your Electron user data directory.

## How to play

Each match starts on the new-game dialog, with a Global tab and a Regional tab. This regional setup puts South Central against Great Lakes & Ontario in Northern America, at Small size with fog of war, a March start, and every bonus at Low. The open list shows the region's other side groups. The badges over each unit type are the per-side caps for the chosen game size, and the prices follow the selected region.

![Regional new-game dialog for Northern America](doc/media/regional-new-game.png)

1. **Pan:** Drag with the left mouse button, or use WASD / arrow keys.
2. **Zoom:** Mouse wheel (zooms toward the cursor). Zoomed in, contested strategic hexes show a marker that starts a tactical battle.
3. **Select units:** Click a teal (human) unit's icon. A lone unit is selected right away. A stack opens a list of its units, where you can pick one or use **+ All**.
4. **Issue a move order:** With units selected, double-click a destination hex (land/water/terrain rules apply). The order appears under "Movement orders." Standing march orders can also be set for multi-turn movement.
5. **Ranged attack (armor or naval on strategic; broader types on tactical):** With capable units selected, click **Ranged**, then double-click an enemy hex within range. An all-air selection shows **Strike** instead. Attacks are submitted with Ready.
6. **Ready:** Click **Ready** to submit orders and resolve the turn. A side wins by controlling the enemy home or wiping out its urban cells (rules in [doc/region-vs-region.md](doc/region-vs-region.md)), or by destroying every enemy unit. The new-game dialog then returns for the next match.
7. You can issue multiple movement and ranged orders (one per unit each) before clicking Ready.

Hovering a unit's flag, in the stack list or anywhere else it appears, or the token of a one-unit hex, shows the bonuses that unit was born with. On the left, a stack near Mexico City is open, and the tooltip belongs to an armor unit born in the Mexican mountains in rain, with advanced tech. On the right, a lone unit near Colorado Springs was born on Saskatchewan plains in snow, with basic tech.

| Stack list near Mexico City | Lone unit near Colorado Springs |
| --- | --- |
| ![Bonuses tooltip for an armor unit in a stack list](doc/media/unit-bonuses-armored-mexico.png) | ![Bonuses tooltip for a single unit token](doc/media/unit-origin-saskatchewan.png) |

## Where messages appear

- **Lower right of the map (map toast):** Errors, rejected orders, turn-loss summaries, and unknown-battle announcements. Use the × to dismiss; it also hides after a fixed interval, and a newer message replaces it.
- **Upper right of the map (AI strategy toast):** The opponent's Message and Strategy after a consultation. It dismisses and times out the same way.
- **Right panel, below the Tools and Model tabs (AI activity log):** AI interaction lines and errors, including a one-line copy of each turn update. Starting a new match clears it.

## UI controls summary

- Pan: drag with left mouse, or WASD / arrows.
- Zoom in/out: mouse wheel.
- Select units: click a unit icon; a stack opens its unit list.
- Add move order: select units, then double-click the destination.
- Ranged attack: select capable units, click "Ranged", then double-click an enemy hex in range.
- Resolve turn: Ready button.
- New game: **New** on the Model tab during strategic planning, or the dialog that opens at game over.

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

These describe the throwaway Phase 0 loop that validated combat, tools, and AI before the production baseline. The live game is the 2.x global, regional, and tactical build above.

- **0.2:** Small hex map, WEGO movement only, SQLite state, no AI.
- **0.4:** Combat (ranged → move → melee), win condition, resolution visuals and stacking.
- **0.5:** OpenRouter tool-calling AI (`plan_route`, `check_distance`), tool-capable models only, capped planning round-trips.

## License

Source code written for Agent Wars is under the [MIT license](LICENSE). Reuse it, and keep the copyright notice and the license text with the copy.

Third-party software, vendored files, and the generated earth data under `data/generated/` keep the terms in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). The terrain uses EarthEnv consensus land cover, which is CC BY-NC 4.0. The weather uses WorldClim, which allows academic and other non-commercial use and requires permission before redistribution or commercial use. Those terms prevent commercial use of the application as distributed.
