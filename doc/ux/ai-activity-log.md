# AI Activity Log

The log of AI interactions and errors under the right-panel tabs.

## Purpose

Give the player a running record of opponent consultations, model-list failures, and turn updates that also appeared as toasts.

## Availability

Shown with the right panel in every mode where the panel is visible, whichever tab is selected. While the tactical battles list is open, the log stays visible and does not receive pointer input. The log itself has no mode of its own.

## Information Displayed

- One line per event, prefixed with the local time.
- Error lines are distinguished from ordinary lines.
- Lines include consultation results, ignored stale consultations, model-list failures, standing-order notices, and a one-line copy of a turn-update toast.

The log does not show the API key.

## Inputs and Responses

### Mouse

- None. The player can scroll the log. Clicks do not toggle or delete lines.

### Keyboard

- None.

### Other

- A new line is appended at the end, and the log scrolls to that line.
- Lines are not removed during a match.
- When a new match starts, from startup, New, or game over, the log clears, together with the cost readout reset on the Model tab.

## States

- Empty: no lines yet in this match.
- Recording: one or more lines, newest at the bottom.

## Invariants

- A new line never replaces an older line.
- The log never mixes lines from two matches.
- Error lines stay in the log even when the same text is also shown as a map toast.

## Strategic and Tactical Differences

The same log records strategic consultations and tactical consultations. Cancelling planning because a battle ended can add a line. The log is not cleared merely by entering or leaving a battle.

## Related Documents

- [right-panel.md](right-panel.md)
- [notifications-and-feedback.md](notifications-and-feedback.md)
- [modes-and-transitions.md](modes-and-transitions.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#openrouter-log`)
- `src/renderer/openRouter/openRouterUiHelpers.ts`
- `src/renderer/openRouter/openRouterControls.ts`
- `src/renderer/openRouter/openRouterRuntime.ts`
