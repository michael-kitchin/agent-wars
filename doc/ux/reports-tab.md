# Reports Tab

The console tab that keeps what the map toasts showed during the current match.

## Purpose

Let the player read a turn update, an opponent message, or a notice again after its toast has hidden.

## Availability

Shown while the right panel's Reports tab is selected and the panel is expanded, in every mode where the panel is visible. While the tactical battles list is open, the tab stays visible while the panel is expanded and does not receive pointer input. In New game and Game over the panel is absent, so this tab is absent with it. Entries are filed whether or not the tab is shown.

## Information Displayed

- One entry per filed toast, newest first. Each entry shows a tag, a kind, and a copy of the toast's text, including the flags a turn update shows.
- The tag says when: "T7" for a strategic turn, or "B2" for a battle beat (`formatConsoleReportTag` in `src/shared/consoleReportLog.ts`). A turn report is tagged with the turn or beat it reports on, which is the one Ready just resolved. The unknown-battle notice and the standing-orders notice that a Ready raises take that same tag. Every other entry is tagged with the current turn or beat when it arrived. An entry filed before a match is loaded has no tag.
- The kind is "Turn report" for a turn or beat update, "Message" for the opponent's message and strategy, and "Notice" for any other informational map toast.
- A turn report carries a disabled Replay button.
- Entries filed since the player last left this tab are marked with a gold dot.
- With no entries, the tab reads "No reports yet this match."
- The header's subtitle reads "this match". The Reports tab in the rail shows the number of unread entries, and hides it at zero. See [right-panel.md](right-panel.md).
- Control tips for the tab and the Replay placeholder are in [control-tooltips.md](control-tooltips.md).

## Inputs and Responses

### Mouse

- None. Replay is disabled in this version.

### Keyboard

- None.

### Other

- Every informational map toast and every shown AI strategy toast is filed when it appears. Error toasts are not filed. See [notifications-and-feedback.md](notifications-and-feedback.md).
- An entry is unread until the Reports tab is shown. Showing the tab marks every entry read. Entries filed while the tab is shown are never unread.
- The list keeps the newest 200 entries (`MAX_CONSOLE_REPORTS`).
- Starting a new match clears the list, as it clears the AI activity log. The list is not saved. After the app restarts it starts empty, and a toast shown once the app is up, such as a basemap failure, can file a new entry.

## States

- Empty: "No reports yet this match."
- Entries present: newest first.
- Unread: the rail shows a count.

## Invariants

- An error toast never becomes an entry.
- Each entry's text is the text its toast showed.
- The rail count never counts an entry filed while the tab was shown.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| Tag | Turn, such as "T7" | Beat, such as "B2" |
| Turn report | After a turn resolves | After a beat resolves |

## Related Documents

- [right-panel.md](right-panel.md)
- [notifications-and-feedback.md](notifications-and-feedback.md)
- [ai-activity-log.md](ai-activity-log.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#console-tab-reports`, `#console-tab-reports-badge`, `#console-panel-reports`, `#reports-empty`, `#reports-list`)
- `static/consoleChrome.css`
- `src/renderer/chrome/consoleReports.ts`
- `src/shared/consoleReportLog.ts`
- `src/renderer/openRouter/openRouterUiHelpers.ts` (`showMapToast`, `showAiStrategyToast`)
- `src/renderer/gameplay/readyResolutionAnnouncements.ts` (`announceResolutionTurnUpdate`)
