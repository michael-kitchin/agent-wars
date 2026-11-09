# Map keyboard pan (screen pixels)

Keyboard pan (WASD and arrows) moves the main Leaflet view in **screen pixels**, not along H3 north/south.

## Direction

- `W` / `ArrowUp` pan the map **up** on screen (negative container Y).
- `S` / `ArrowDown` pan the map **down**.
- `A` / `ArrowLeft` pan left; `D` / `ArrowRight` pan right.
- Diagonals travel the same pixel distance as a cardinal step.

Hold-to-continue, opposite-key cancel, modifiers, focus/blur, and the 133 ms interval stay as in the hold-to-continue pan contract.

## Step size

Each tick moves **0.5×** the on-screen size of one hex at the **current** zoom:

- **Strategic:** one res-1 hex.
- **Tactical:** one res-4 hex (same 0.5× multiplier; do not scale back to a res-1 hex or the pre-tactical zoom).

Leaflet `panBy` applies the offset with animation off. Tactical `maxBounds` still clamp the camera.
