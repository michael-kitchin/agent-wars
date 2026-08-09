# Map keyboard pan (hold-to-continue)

## Behavior

- **Keys:** `W`/`A`/`S`/`D` and `ArrowUp`/`ArrowDown`/`ArrowLeft`/`ArrowRight` pan the main map by one res-1 hex per step. Physical keys are tracked separately (via `event.code`), so holding **W** and **ArrowUp** together keeps panning if only one of them is released.
- **Hold:** On first physical keydown, pan immediately, then keep panning every **133 ms** while keys remain held (`200 / 1.5`, rounded).
- **Chord change:** Adding or releasing a pan key that changes the net direction pans **immediately** toward the new net, then restarts the hold interval so an immediate pan and a pending tick cannot fire back-to-back.
- **Diagonals:** One N/S key plus one E/W key pans toward a single neighbor that best matches the combined vector.
- **Opposite cancel:** Holding both N and S (or both E and W) yields no pan on that axis; if the net is zero, no pan occurs.
- **Modifiers:** While Ctrl, Alt, or Meta is held, pan keys are ignored. Pressing Ctrl/Alt/Meta clears any active hold. Pan does **not** resume after the modifier is released until the user presses a pan key again.
- **Focus / blur:** Pan is ignored when focus is in `input` / `textarea` / `select` / contentEditable. Held pan state clears on window blur, when the document becomes hidden, and on focus into an editable field. Keyup for a pan key always clears that direction even if focus moved into an input.
- **Leaflet:** Main map uses `keyboard: false` so Leaflet’s default arrow `panBy` does not compete with hex pan.

## Manual QA

1. Tap W once → map moves one hex north; release quickly → no continuous motion.
2. Hold W → continuous north pan at roughly 133 ms per hex.
3. Hold W then press D → immediate diagonal-ish pan; continues while both held.
4. Hold W+S → no north/south pan; release S while W held → immediate north pan resumes.
5. Arrow keys behave like WASD.
6. Focus a build-queue count input → arrows move the caret, map does not pan.
7. Hold W, press Ctrl → pan stops; release Ctrl while W still down → pan stays stopped until W is released and pressed again.
8. Hold W, switch away from the window (blur) → pan stops.
9. Hold W and ArrowUp, release W → pan continues north until ArrowUp is released.
