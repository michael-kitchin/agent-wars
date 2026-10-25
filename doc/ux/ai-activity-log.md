# AI Activity Log

The log of AI interactions and errors on the console's Commanders tab.

## Purpose

Give the player a running record of opponent consultations, model-list failures, and turn updates that also appeared as toasts.

## Availability

Shown at the bottom of the console's Commanders tab, under an "Activity log" heading below the [Tool groups](opponent-tab-tool-groups.md) section, filling the height that is left, in every mode where the console is visible and expanded. While the tactical battles list is open, the log stays visible while the console is expanded and does not receive pointer input. The log itself has no mode of its own. The log is absent in New game and Game over because the console is absent.

## Information Displayed

- A filter, "All commanders" or one AI seat by its full name. It shows that seat's lines. Lines with no seat stay hidden while a seat is selected.
- One line per event, prefixed with the local time. A consult line also starts with the turn tag and the seat's short name, such as "T7 E. Turkey".
- Error lines use the light-red chrome error text from the [UI style guide](../ui-style-guide.md). Ordinary lines use the chrome text.
- Lines include consultation results, ignored stale consultations, model-list failures, failures to load or save the reasoning effort, standing-order notices, and a one-line copy of a turn-update toast. That copy is plain text. It has no origin flags, type icons, or opponent number flags.
- An ordinary line, not an error line, appears when a provider rejects a consultation's structured JSON request. The request is retried once without it, so the line does not mean the consultation failed. Anthropic models currently produce this line once per session, on their first request that carries the schema (normally the first request after the model's first tool call), because the envelope schema uses `anyOf` and exceeds Anthropic's schema limits.
- An ordinary line, not an error line, appears when a provider rejects a required tool call. The request is retried once with automatic tool choice, so the line does not mean the consultation failed. Claude served by Amazon Bedrock produces this line once per session.
- An ordinary line, not an error line, reads "This model does not support tool calls; planning without tools." the first time in an app session that a model whose listing does not include tool support is consulted. Its consultations run as if every group of model-callable tools were off; Events still applies. A new match clears the log but does not show the line again for the same model.
- A model call that fails writes an error line naming the attempt, such as `Model call timed out after 90s (attempt 1 of 2). Retrying...` or `Model call failed with HTTP 503 (attempt 1 of 2). Retrying...`. The last attempt ends with `No retries left.` A stalled response, and an HTTP status that is not retried, end with `Not retried.` A network failure uses the same attempt numbers.
- Stopping opponent planning writes one ordinary line, and only when that stop aborted a call, or when New game found a deferred consult still waiting. A second stop that aborts nothing does not add another line. Leaving a battle does not add a line merely because a strategic consult is still pending. The sentences are `Opponent planning stopped: Stop was turned off.`, `Opponent planning stopped: the model changed.`, `Opponent planning stopped for a new game.`, `Opponent planning stopped: you left the battle.`, and `Opponent planning stopped.` The Stop sentence is the one for turning planning off: a click on Stop, removing the last key or model, and the stop before a new match applies its planning choice (`modelCallCancelLogLine` for `run_off`).
- With the developer hang simulator on, an ordinary line reads `Simulating a hung model call (AGENT_WARS_SIMULATE_MODEL_HANG).`
- A consultation that still fails shows `API error: …`. When OpenRouter's own message is only "Provider returned error", that line also includes the provider's message, such as a schema or `tool_choice` refusal.

The log does not show the API key.

## Inputs and Responses

### Mouse

- None. The player can scroll the log. Clicks do not toggle or delete lines.

### Keyboard

- None.

### Other

- A new line is appended at the end, and the log scrolls to that line while it is shown. Showing the Commanders tab, or expanding the console on it, scrolls the log to its newest line, so lines added while it was hidden are in view.
- Lines are not removed during a match.
- When a new match starts, from startup, New game, or game over, the log clears, together with the cost readout reset in the [Commander](opponent-tab-commander.md) section and on the footer status line, and the [Reports tab](reports-tab.md).

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

- [console.md](console.md)
- [notifications-and-feedback.md](notifications-and-feedback.md)
- [modes-and-transitions.md](modes-and-transitions.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#openrouter-log`)
- `src/renderer/openRouter/openRouterUiHelpers.ts` (`appendOpenRouterLog`, `scrollOpenRouterLogToEnd`)
- `src/renderer/chrome/consoleFrame.ts`
- `src/renderer/openRouter/openRouterControls.ts`
- `src/renderer/openRouter/openRouterRuntime.ts`
- `src/shared/ipc/modelCallCancelTypes.ts` (`modelCallCancelLogLine`)
