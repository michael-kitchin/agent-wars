# UI Facelift Release: Shot List

This list is for the reviewer, not the coding agent. It names the screenshots in `doc/media/` that still show the layout from before the facelift, and what each new one must show. Capture them after plan 1 and the toggles plans (`ui-facelift-toggles-execution-plan.md`) are committed, and before plan 2 runs. Plan 2 rewrites the captions to match this list, and checks that every image the docs name is there.

[ui-facelift-release-execution-plan.md](ui-facelift-release-execution-plan.md) lists the plans.

## How to Capture

- **The real app.** Run `npm start` on a build of the commit with the toggles plans in, with an internet connection so the map tiles load, and with a real opponent model where a shot shows the opponent's work.
- **Same names.** Save each new image over the old file of the same name in `doc/media/`, in the same format (`.png` or `.jpg`). Two images get new names, listed below. Plan 2 deletes the two old files they replace.
- **Full-window shots.** Capture the window's content, from the top bar down, without the title bar. Electron's menu bar hides on its own; if it shows, press Alt to hide it. Scale the shot to the width listed.
- **Crops.** Crop to the area described, at 100% scale, roughly the size listed. The sizes are those of the old images, so the pages keep their look.
- **Nothing private.** The API key field shows "Saved API key" once a key is saved, never the key. Leave other windows, the taskbar, and file paths out of the frame.
- **Captions are fixed.** Each entry quotes the caption plan 2 writes. If a shot can't show what its caption says, keep the old image and tell the agent before plan 2 runs; the caption then needs a change the plan doesn't have.

## Replace

These show the old right-hand panel, the old new-game dialog, or the old Ranged and Strike buttons, which are now one reticle.

### 1. `tactical-battle-mexico.jpg`

- **Used in:** the README's opening image, and How to play under Battles.
- **Captions:** "A tactical battle in central Mexico, during August. Teal/human units face the rose/LLM opponent (in this case, Gemini Flash Lite). The battle header across the top counts each side's sub-units, and queued movement orders are listed in the console, to the right." and "Tactical battle in central Mexico, from a regional game. The battle header across the top names the battle and the beat, and Exit Battle sits beside Settings."
- **Set up:** a regional game on Central America. Your side Central & western Mexico (it holds Mexico City), Opponent NE Mexico & the Bajio, Starting month August. Opponent model Gemini Flash Lite, with Run on, and Offer tactical battles checked in the game menu. Play until a melee in central Mexico, choose Fight, and in the battle queue three or four moves so the Orders tab lists them. Capture while the date is still in August.
- **Must show:** the battle header with the sub-unit bar and Exit Battle; the console expanded on Orders, with the movement rows; both sides' units on the battle map.
- **Size:** full window, about 1024 × 555, JPEG.

### 2. `global-spain-new-world.png`

- **Used in:** the README, under What's Inside.
- **Caption:** "Re-invading the New World, at the start of a global game. What could go wrong?" Its alternative text is "A Spanish fleet heading west across the Atlantic on the global map".
- **Set up:** a global game with Southern Europe as your home. In the first turns, select a fleet born in Spain; its tooltip shows Origin: Spain. If none of your starting fleets is Spanish, build one at a Spanish seaport. Queue a move west across the Atlantic, and rest the pointer on the fleet so its tooltip shows its origin and bonuses.
- **Must show:** the queued route across the ocean, the fleet's tooltip, the top bar, and the console.
- **Size:** full window, about 1024 × 557.

### 3. `opponent-commander.png` (new name; replaces `model-tab.png`)

- **Used in:** the README, step 1 of the OpenRouter table.
- **Caption:** "Step 1: On the console's Opponent tab, enter an OpenRouter API key, pick a model, and click Run. The match's cost of LLM calls (in US$) shows beside the key."
- **Set up:** a match with a key saved, a model chosen, and Run on.
- **Must show:** the Opponent tab's Status section (Run pressed, "Opponent planning is on.") and its Commander section (API key reading "Saved API key", the cost, the model, and Reasoning).
- **Size:** a crop of the console, about 380 px wide.

### 4. `opponent-activity.png` (new name; replaces `tools-tab.png`)

- **Used in:** the README, step 2 of the OpenRouter table.
- **Caption:** "Step 2: Watch the LLM do its thing in the activity log, and optionally turn tool groups on or off."
- **Set up:** the same match, after at least one consultation, so the tool groups show counts.
- **Must show:** the Tool groups section with its counts, and the Activity log with a few recent lines.
- **Size:** a crop of the console, about 380 px wide.

### 5. `global-preview.png`

- **Used in:** How to play, under Global and regional maps.
- **Caption:** "New global game: In the Map section, click the Global tab, then pick the human and LLM home regions (in this case: Eastern Asia vs Southern Africa). The buttons to the right of the dropdowns pick random choices."
- **Set up:** the new-game screen, Global tab, Human Eastern Asia, AI Southern Africa.
- **Must show:** the new-game bar, the setup panel with its Map, Forces, and Rules sections, and the preview with both homes outlined.
- **Size:** full window, about 1426 × 773.

### 6. `regional-preview.png`

- **Used in:** How to play, under Global and regional maps.
- **Caption:** "New regional game: Click the Regional tab, then pick the region and each player's side (in this case: Eastern Asia, with Japan vs South & east China, Taiwan)."
- **Set up:** the new-game screen, Regional tab, Region Eastern Asia, Your side Japan, Opponent South & east China, Taiwan.
- **Must show:** the setup panel on the Regional tab, and the region's preview with both sides outlined.
- **Size:** full window, about 1426 × 773.

### 7. `stack-select-1.png`

- **Used in:** How to play, under Selecting Units.
- **Caption:** "Click to select lone units or open the stack popup. In the stack popup, click + to select or +All to select all units."
- **Set up:** click a stack of three of your units with nothing selected.
- **Must show:** the stack popup with its + and + All buttons, beside the stack on the map.
- **Size:** a crop of the map, about 390 × 220.

### 8. `stack-select-2.png`

- **Used in:** How to play, under Selecting Units.
- **Caption:** "Shift-click to multi-select. In the stack popup, click +/- to select/deselect, or +All/-All to select/deselect all units."
- **Set up:** the same stack with one or two of its units selected.
- **Must show:** the stack popup with both + and - buttons and both + All and - All, and the gold ring on the hex.
- **Size:** a crop of the map, about 390 × 220.

### 9. `movement-planning-1.png`

- **Used in:** How to play, under Planning Movement.
- **Caption:** "Step 1: Plan movement orders by selecting units, then hovering over a destination hex. The game will automatically pick the fastest route."
- **Set up:** select a unit and rest the pointer on a destination a few hexes away, so the route and its tip show.
- **Must show:** the route with its arrowhead, and the tip that shows when the route is slowed, if your route has one.
- **Size:** a crop of the map, about 550 × 290.

### 10. `movement-planning-2.png`

- **Used in:** How to play, under Planning Movement.
- **Caption:** "Step 2: Double-click to create movement orders, or right-click to stop. Orders are listed on the console's Orders tab, on the right."
- **Set up:** double-click that destination.
- **Must show:** the queued route on the map, and its row on the console's Orders tab, with the target hex code and distance.
- **Size:** a crop across the map's right side and the console, about 600 × 275.

### 11. `ranged-attack-1.png`

- **Used in:** How to play, under Aiming ranged attacks and air strikes.
- **Caption:** "Step 1: Select a unit or stack, then click the reticle on the selection bar, at the map's bottom left."
- **Set up:** select an armor or naval unit, and rest the pointer on the reticle until its tip shows.
- **Must show:** the selection bar with the reticle and its tip, and the selected unit on the map with its gold ring.
- **Size:** a crop of the map's lower left, about 750 × 310.

### 12. `ranged-attack-2.png`

- **Used in:** How to play, under Aiming ranged attacks and air strikes.
- **Caption:** "Step 2: Double-click on a visible target to order the attack."
- **Set up:** click the reticle, then rest the pointer on an enemy hex in reach.
- **Must show:** the amber reach outline, the amber line with its arrowhead to the target, and the selection panel's amber border with the reticle pressed in amber.
- **Size:** a crop of the map, about 750 × 320.

### 13. `air-strike.png`

- **Used in:** How to play, under Air power.
- **Caption:** "Select an air unit or stack, then click the reticle on the selection bar and pick a type of air strike to order. Then double-click on a hex to order the attack."
- **Set up:** select an air unit, click the reticle, and open the target-type list.
- **Must show:** the target-type list open beside the pressed reticle on the selection bar, the purple reach outline, and the selection panel's purple border.
- **Size:** a crop of the map, about 900 × 730.

## Optional

These map crops are still accurate, but order lines now have a pale casing under them. Recapture them only if you want the new look; their captions stay as they are, so a new shot must match them.

- `terrain-bonus-movement.png`: "Ukrainian 1st Fleet moves through wetlands, thanks to their terrain bonus (built on a wetland hex, near the Black Sea)."
- `tactical-road-movement.png`: "Shaanxi 1st Armored moving faster by road, then slower through urban hexes. Movement planning automatically picks the fastest route."
- `tactical-rail-movement.png`: "A stack of Ukraine's armored units plans rapid movement by rail. Rail is faster than road, and movement planning will use both."

## Keep

These show surfaces the facelift didn't change: `message-popup.png` and `status-popup.png` (the toasts), `sealift.png` (the stack popup), `unit-building.png` (the build popup), `tactical-battle-dialog.png` (the tactical battles list), `unit-bonuses-armored-mexico.png` and `unit-origin-saskatchewan.png` (unit tooltips), and the four charts (`hours-and-tokens-by-*.png`, `hybrid-ai-turn-loop.png`).
