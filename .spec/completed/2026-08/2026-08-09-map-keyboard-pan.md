# Map keyboard pan (hold-to-continue)

**Direction and step size** are defined in [map-keyboard-pan-screen-pixels.md](map-keyboard-pan-screen-pixels.md): WASD moves in screen pixels (up/down/left/right). Each tick is 0.5× one hex at the current zoom (res-1 strategic, res-4 tactical). The hold-to-continue rules below still apply.

## Behavior

- **Keys:** `W`/`A`/`S`/`D` and `ArrowUp`/`ArrowDown`/`ArrowLeft`/`ArrowRight` pan the main map in screen pixels (see the screen-pixels spec). Physical keys are tracked separately (via `event.code`), so holding **W** and **ArrowUp** together keeps panning if only one of them is released.
- **Hold:** On first physical keydown, pan immediately, then keep panning every **133 ms** while keys remain held (`200 / 1.5`, rounded).
- **Chord change:** Adding or releasing a pan key that changes the net direction pans **immediately** toward the new net, then restarts the hold interval so an immediate pan and a pending tick cannot fire back-to-back.
- **Diagonals:** One vertical key plus one E/W key pans on a screen diagonal with the same pixel travel as a cardinal step.
- **Opposite cancel:** Holding both up and down (or both left and right) yields no pan on that axis; if the net is zero, no pan occurs.
- **Modifiers:** While Ctrl, Alt, or Meta is held, pan keys are ignored. Pressing Ctrl/Alt/Meta clears any active hold. Pan does **not** resume after the modifier is released until the user presses a pan key again.
- **Focus / blur:** Pan is ignored when focus is in `input` / `textarea` / `select` / contentEditable. Held pan state clears on window blur, when the document becomes hidden, and on focus into an editable field. Keyup for a pan key always clears that direction even if focus moved into an input.
- **Leaflet:** Main map uses `keyboard: false` so Leaflet’s default arrow `panBy` does not compete with app-owned keyboard pan.

## Manual QA

1. Tap W once → map moves up; release quickly → no continuous motion.
2. Hold W → continuous up pan at roughly 133 ms per step.
3. Hold W then press D → immediate diagonal pan; continues while both held.
4. Hold W+S → no vertical pan; release S while W held → immediate up pan resumes.
5. Arrow keys behave like WASD.
6. Focus a build-queue count input → arrows move the caret, map does not pan.
7. Hold W, press Ctrl → pan stops; release Ctrl while W still down → pan stays stopped until W is released and pressed again.
8. Hold W, switch away from the window (blur) → pan stops.
9. Hold W and ArrowUp, release W → pan continues up until ArrowUp is released.
10. In a tactical battle, W/S still move the view up/down (not along hex-north), at 0.5× a res-4 hex.
