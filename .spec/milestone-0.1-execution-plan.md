# Milestone 0.1 — Hello Hex World: Execution Plan

*Version 1.0 — March 2026*

This document is an execution plan for implementing **Milestone 0.1** from the [Strategic Development Plan](development-plan.md). It is written for a coding agent (e.g., Cursor, RooCode) and is organized in phases that are independently verifiable or verifiable with previously completed phases. Each phase produces reliable, understandable code suitable for future developers.

---

## Scope Summary

**Deliverable:** An Electron application that:

1. Renders a small hex grid of **19 hexes** in a classic hex-flower arrangement (1 center + 6 in first ring + 12 in second ring) on a **Canvas** element.
2. Generates the grid from **H3** at a **single resolution level**.
3. **Clicking a hex** highlights it and displays its **H3 index** and **cube coordinates** in a **sidebar panel**.
4. Supports **basic pan and zoom** with the mouse wheel.

**Technical constraints:**

- **Electron:** Use the **latest LTS version** of Electron at the time of implementation. (As of March 2026 this is Electron v40; verify at [Electron Releases](https://releases.electronjs.org/releases/stable) before starting.)
- **TypeScript:** Use the **latest stable TypeScript** in both **main** and **renderer** process code. (TypeScript does not have a formal LTS; use the current stable release, e.g. 5.x, from [TypeScript releases](https://github.com/microsoft/TypeScript/releases).)
- **Electron vs Tauri:** This plan assumes **Electron**. The development plan recommends deciding during this milestone; if switching to Tauri is desired, do it before Phase 2.

**Out of scope for 0.1:** Game logic, units, terrain types, persistence, or LLM integration.

**Code quality goals:** Generated code must be reliable and understandable for future developers. Prefer simple, explicit logic over clever shortcuts. Use consistent naming, a single coordinate-system convention, and minimal branching so behavior is easy to trace. Each phase produces a small, testable increment so regressions are easy to isolate. When generating code for the first time, double-check correctness and clarity.

---

## Compliance with project rules

Implementing agents must follow the project’s coding rules. The following are specific to this milestone and the TypeScript/Electron stack; treat them as additive to the project’s current coding rules:

- **Comments:** All new and updated **public, non-overriding** methods must have an **orienting comment** that explains why the method exists, when to use it, how to use it, and what to expect (results and exceptions). For interface/API methods, focus on **contracts**; for implementation methods, focus on **high-level implementation details**. Phase 6 tasks must enforce this.
- **Logging:** When logging is introduced (e.g. main process or renderer), use a single logging API. Emit **debug**-level logs for public method invocations, **error**-level for caught exceptions, and **trace**-level for getter-style methods that do not modify state. Include enough detail for troubleshooting. Do not check log level before calling the logging API unless building potentially large message strings inline.
- **Testing:** If tests are added, test only **happy paths and essential failure cases**; verify **code contracts**, not implementation details. Do not add tests for trivial delegation, DTOs/accessors, or similar boilerplate. Remove any tests that become unnecessary under these rules.
- **Nullability:** Use TypeScript strict null checks. Document optional or nullable parameters and return values where the type alone is insufficient (TypeScript’s analogue to explicit nullability).

Rules that refer to Java (e.g. `package-info.java`, `@CheckForNull`) do not apply to this TypeScript codebase; the intent above is the TypeScript-equivalent guidance.

---

## Prerequisites (Before Phase 1)

- **Node.js:** Use a version compatible with the chosen Electron LTS (see [Electron docs](https://www.electronjs.org/docs/latest/tutorial/electron-timelines) for Node version per Electron version). Prefer current Node LTS.
- **Learning (human or agent):** Skim [Red Blob Games — Hexagonal Grids](https://www.redblobgames.com/grids/hexagons/) for cube coordinates and hex geometry. Skim H3 TypeScript/JS docs and a minimal example (e.g. [h3-js](https://github.com/uber/h3-js) or official H3 bindings).

No code is written in Prerequisites; verification is that the implementer has access to the above resources.

---

## Phase 1: Electron + TypeScript project bootstrap

**Goal:** A runnable Electron app with TypeScript in both main and renderer processes, and a single window that loads a local HTML page.

**Tasks:**

1. Initialize the project (e.g. `npm init` or equivalent) in the repository root.
2. Add Electron as a dependency using the **latest LTS** version (e.g. `electron@^40` or whatever is current LTS; avoid `latest` in package.json for reproducibility).
3. Add TypeScript and type definitions:
   - `typescript` (latest stable, e.g. `^5.x`).
   - `@types/node` for main process.
   - Ensure the renderer is either typed via a preload script and/or `@types/electron` or equivalent so both main and renderer are type-checked.
4. Configure TypeScript:
   - One `tsconfig.json` or separate `tsconfig.main.json` / `tsconfig.renderer.json` as needed so that **main process** and **renderer process** code are both compiled with the latest stable TypeScript and strict options (e.g. `strict: true`). Document which config applies to which process.
5. Set up the build so that:
   - Main process TypeScript compiles to a single entry (e.g. `dist/main.js` or `out/main.js`).
   - Renderer can be a single HTML file that loads one or more JS bundles (compiled from TypeScript), or a minimal build pipeline (e.g. esbuild, tsc, or a bundler) that outputs renderer JS.
6. Implement the main process:
   - Create a `BrowserWindow` that loads the renderer (via `file://` or a simple `loadFile` to a local HTML file).
   - No security-sensitive flags (e.g. avoid disabling webSecurity unless strictly required and documented).
7. Implement the renderer:
   - A minimal HTML page with a `<title>` and a placeholder (e.g. a div or canvas) so the window is not blank.
8. Add npm scripts:
   - `build` (or `compile`): compile TypeScript for main and renderer.
   - `start` (or `electron`): run Electron with the compiled main script (e.g. `electron .` or `electron dist/main.js`).
9. Add a brief README section or comment describing how to run the app (`npm install`, `npm run build`, `npm start`).

**Verification:**

- Run `npm install`, `npm run build`, `npm start`. The Electron window opens and displays the placeholder content (not a blank or error page). No console errors in the main process or renderer devtools.

**Exit condition:** Window opens; build and start scripts work; TypeScript is used in both processes and compiles without errors.

---

## Phase 2: Canvas and viewport

**Goal:** The renderer shows a full-content Canvas that fills the window content area and responds to window resize. No hexes yet.

**Tasks:**

1. Replace or augment the placeholder in the renderer with a single `<canvas>` element that is sized to fill the available content area (e.g. via CSS and/or JS resize).
2. Obtain the 2D rendering context and clear the canvas with a neutral background (e.g. gray or off-white) so that resize and redraw are visible.
3. On window resize (and on initial load), resize the canvas to match the content area and redraw. Use a single resize/redraw path to avoid duplication.
4. Optionally add a simple layout: e.g. a flex or grid layout with the canvas on one side and a reserved area for the future sidebar on the other, so that Phase 5 does not require a large layout change. The sidebar area can be empty or show placeholder text.

**Verification:**

- After `npm run build` and `npm start`, the window shows a canvas that fills its area and keeps filling when the window is resized. Background color is visible. No hex drawing yet.

**Exit condition:** Canvas is visible, resizes correctly, and is ready for drawing.

---

## Phase 3: H3 hex grid (19-hex flower) and hex drawing

**Goal:** Generate 19 H3 hexagons in a hex-flower arrangement at a single resolution and draw them on the canvas using 2D Canvas API.

**Tasks:**

1. Add the H3 library for TypeScript/JavaScript (e.g. `h3-js` from Uber or the official H3 bindings). Ensure types are available (e.g. `@types/h3-js` if needed or use a typed package).
2. Choose a **fixed H3 resolution** (e.g. 2 or 3) and a **center index** (e.g. a cell near the “origin” or a well-known cell). Document the choice in code or a short comment.
3. Generate the 19 cells:
   - Use the H3 API equivalent of “center + k-ring with k=2” (e.g. `kRing(center, 2)` or `gridDisk(center, 2)`) so the set has exactly 19 hexes: 1 center, 6 at distance 1, 12 at distance 2.
   - Store them in a deterministic order (e.g. center first, then by ring/distance) for stable drawing and hit-testing.
4. Map H3 cells to hexagon geometry:
   - Use H3’s edge/cell boundary APIs (e.g. `cellToBoundary` or equivalent) to get latitude/longitude or Cartesian vertices for each cell. Convert to canvas coordinates using a simple 2D projection (scale + optional offset). Alternatively, use cube coordinates from H3 (if the library exposes them) or derive cube coordinates from the H3 index and use the Red Blob Games formulas to compute pixel vertices. Document the coordinate system (e.g. “cube coordinates with flat-top” or “axial”) in code.
5. Implement a **draw function** that:
   - Clears the canvas.
   - Draws each of the 19 hexes (outline and optionally fill) with a default style (e.g. light fill, dark stroke) so all hexes are clearly visible.
6. Call the draw function after canvas resize and on initial load. Ensure the grid is fully visible (e.g. centered and scaled to fit or to a fixed scale).

**Verification:**

- Run the app; the canvas shows exactly 19 hexagons in a symmetric flower pattern (1 center, 6 around it, 12 in the outer ring). No duplicate or missing hexes. Resizing the window keeps the grid visible (scale or position can be simple; pan/zoom comes in Phase 4).

**Exit condition:** 19 H3 hexes are generated and drawn correctly on the canvas.

---

## Phase 4: Pan and zoom (mouse wheel)

**Goal:** The user can zoom with the mouse wheel and pan (e.g. drag with mouse or wheel-based pan). The hex grid is the only content; pan/zoom apply to the grid view.

**Tasks:**

1. Introduce a **view state** (e.g. scale factor and translation offset) that is applied when converting world/model coordinates (hex vertices) to canvas coordinates. All hex drawing in Phase 3 should go through this transform so that a single draw path uses the current view state.
2. **Zoom:** On mouse wheel events, adjust the scale factor (e.g. multiply/divide by a constant per tick) and optionally zoom toward the cursor position so the point under the cursor stays under the cursor. Clamp scale to reasonable min/max to avoid invisible or huge grids.
3. **Pan:** Implement pan by either:
   - Mouse drag (mousedown + mousemove + mouseup) updating the translation offset, or
   - Secondary wheel behavior (e.g. shift+wheel for horizontal pan), or both. Document the chosen controls in the UI or README.
4. Ensure the canvas receives focus/keyboard if needed for wheel events. Redraw after every pan/zoom change.

**Verification:**

- Mouse wheel zooms in and out; the grid scales and (if implemented) zooms toward the cursor. Pan (drag or shift+wheel) moves the grid. No broken or flickering drawing. View state is consistent after multiple zoom and pan operations.

**Exit condition:** Pan and zoom work and are applied consistently to the hex grid.

---

## Phase 5: Hit-testing, selection, and sidebar (H3 index + cube coordinates)

**Goal:** Clicking a hex highlights it and displays its H3 index and cube coordinates in a sidebar panel.

**Tasks:**

1. **Hit-testing:** Given canvas click coordinates, reverse the view transform to get world/model coordinates, then determine which hex (if any) contains that point. Use the same hex geometry as drawing (e.g. polygon containment test or hex-specific math). Handle only the 19 hexes; clicks outside the grid select nothing.
2. **Selection state:** Store the currently selected hex (H3 index or index into the 19-hex list). On click, update selection and redraw. Redraw so the selected hex is visually highlighted (e.g. different fill color or thicker border).
3. **Cube coordinates:** For the selected hex, compute or obtain cube coordinates. If the H3 library does not expose cube coordinates directly, derive them from the H3 index (e.g. via H3’s internal representation or by using the cell’s position in the grid). Document the cube coordinate system (e.g. axial q,r or cube x,y,z) in code or UI.
4. **Sidebar panel:** Add a sidebar panel (reuse the reserved area from Phase 2 if present). When a hex is selected, display in the sidebar:
   - The **H3 index** (e.g. the full string).
   - The **cube coordinates** (e.g. `(x, y, z)` or `(q, r)` as chosen).
   When no hex is selected, show a neutral message (e.g. “Click a hex” or leave the fields empty).
5. Ensure layout works: canvas and sidebar both visible; sidebar text readable and not overlapping the canvas.

**Verification:**

- Clicking each of the 19 hexes highlights that hex and updates the sidebar with the correct H3 index and cube coordinates. Clicking empty space clears selection (or keeps previous; specify behavior). Pan and zoom from Phase 4 still work; hit-testing correctly uses the current transform.

**Exit condition:** Selection and sidebar display are correct and consistent with the drawn grid.

---

## Phase 6: Polish and documentation

**Goal:** Code is clear, consistent, and ready for handoff or for building Milestone 0.2.

**Tasks:**

1. **Naming and structure:** Use clear, consistent names for modules and functions (e.g. `hexGrid`, `viewTransform`, `drawHexes`, `getSelectedHexInfo`). Keep main and renderer responsibilities separated (e.g. no game logic in renderer beyond view and input).
2. **Comments:** Add **orienting comments** for all new/updated public non-overriding methods (why the method exists, when/how to use it, results and exceptions). Interface/API methods: focus on contracts. Implementation methods: focus on high-level implementation details. Also document non-obvious logic (e.g. coordinate conversion, H3 resolution choice).
3. **README:** Update the README with:
   - How to install, build, and run.
   - What Milestone 0.1 does (hex grid, click to select, pan/zoom, sidebar with H3 index and cube coords).
   - How to operate the UI (pan, zoom, click to select).
4. **Dependencies:** Pin major/minor versions in `package.json` (no `latest`). Document why H3 resolution and center were chosen if non-obvious.
5. **Linting/formatting:** Add a single lint or format step (e.g. ESLint + Prettier, or project default) and ensure the new code passes. Fix any new warnings in the touched files.

**Verification:**

- A new developer (or agent) can read the README, run the app, and understand how to use it. Code passes the project’s lint/format. No regressions in Phases 1–5.

**Exit condition:** Codebase is consistent, documented, and lint-clean.

---

## Verification matrix

| Phase  | Verification |
|--------|---------------|
| 1      | Electron window opens; TypeScript compiles for main and renderer; `npm run build` and `npm start` succeed. |
| 2      | Canvas fills content area and resizes with window; background visible. |
| 3      | Exactly 19 hexes drawn in hex-flower layout; grid generated from H3 at one resolution. |
| 4      | Mouse wheel zooms; pan (drag or shift+wheel) moves the grid; view state consistent. |
| 5      | Click hex → highlight and sidebar shows correct H3 index and cube coordinates; hit-test respects pan/zoom. |
| 6      | README and comments sufficient; lint passes; no regression in 1–5. |

---

## Risk and clarification notes

- **Electron vs Tauri:** Decided at the start of the milestone. This plan assumes Electron; if the team chooses Tauri, Phase 1 must be replaced with a Tauri bootstrap (window, build, TypeScript in frontend and backend), and later phases adapted for Tauri’s API and process model.
- **H3 API differences:** H3 bindings vary (e.g. `h3-js` vs native bindings). The implementer should use the chosen library’s documented API for `kRing`/`gridDisk`, `cellToBoundary` (or equivalent), and any cube/axial helpers. If cube coordinates are not provided, they must be derived from the cell’s position and documented.
- **Coordinate systems:** Cube vs axial vs offset can cause bugs. Document the chosen system (e.g. “cube coordinates, z = -x - y”) in one place and use it consistently for drawing and sidebar.
- **Security:** Do not enable `nodeIntegration` in the renderer without a clear need; use a preload script if the renderer needs to call main. For 0.1, renderer can be fully standalone (no IPC required).

---

## Questions for the product owner (optional)

1. **Sidebar position:** Prefer sidebar on the left or right of the canvas?
2. **Pan control:** Prefer mouse-drag pan, shift+wheel, or both?
3. **Default view:** Should the initial view show the entire 19-hex grid fitted in the canvas, or a fixed scale (e.g. 1:1) with pan only?
4. **Selection persistence:** When zooming or panning, should the selected hex remain selected (and sidebar updated) or clear on pan/zoom?

If these are not specified, the implementing agent should choose sensible defaults and document them in the README and/or code comments.
