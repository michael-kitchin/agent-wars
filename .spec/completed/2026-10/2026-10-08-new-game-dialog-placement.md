# New-game dialog placement

While `#game-over-overlay` is open, including startup, New, and You win / You lose:

- The dialog has no dark veil. `.game-over-box` keeps its navy background.
- The box's upper-left border sits 12px from the top and 12px from the left of `#canvas-container`, the same corner as `#minimap`.
- The form does not shrink. `#game-over-overlay` scrolls when the map pane is shorter or narrower than the box.
- The overlay still catches pointer events. Keyboard pan and T stay as they are.
- `#minimap` and `#terrain-legend` use `visibility: hidden`, not `display: none`, so the minimap keeps its 200px box.
- `#tactical-annihilation-overlay` stays centered on its veil. The minimap and legend stay visible there, and during the tactical battles list.
- When the overlay opens, focus leaves the minimap or the legend if it is inside either. A dialog control is left alone. Later refreshes do not blur the dialog.

The Regional region selector has a teal randomize button, `#new-game-region-randomize`, in the same square control row as the other randomize buttons. It draws one listed region, including the region already shown, then two different sides, prices, the Advanced line, Start, and the map preview. Setting the index does not fire `change`, so the button calls the same follow-up as the selector.

Do not copy these headings into source, comments, configuration, or `doc/`.
