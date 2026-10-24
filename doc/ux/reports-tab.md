# Reports Tab

The console tab that keeps what the map toasts showed during the current match.

## Purpose

Let the player read a turn update, an opponent message, or a notice again after its toast has hidden.

## Availability

Shown while the console's Reports tab is selected and the console is expanded, in every mode where the console is visible. While the tactical battles list is open, the tab stays visible while the console is expanded and does not receive pointer input. In New game and Game over the console is absent, so this tab is absent with it. Entries are filed whether or not the tab is shown.

## Information Displayed

- A "Show reports from" select sits above the list (`#reports-sender-filter`). It offers "Everyone", then every seat's full home name. Choosing a seat hides messages from other seats. Turn reports and notices stay visible. "Everyone" shows every entry.
- One entry per filed event, newest first. A turn report or a notice shows a tag, a kind, and a copy of the toast's text, including the flags a turn update shows. A message shows a tag, the kind "Message", and the model label at the right of that head. Its body is the sender's color dot, the sender's full home name, and the message in quotes. While no human seat is still playing, a muted "Strategy:" line follows when the consult sent strategy.
- The tag says when: "T7" for a strategic turn, or "B2" for a battle beat (`formatConsoleReportTag` in `src/shared/consoleReportLog.ts`). A turn report is tagged with the turn or beat it reports on, which is the one Ready just resolved. The unknown-battle notice and the standing-orders notice that a Ready raises take that same tag. Every other entry is tagged with the current turn or beat when it arrived. An entry filed before a match is loaded has no tag.
- The kind is "Turn report" for a turn or beat update, "Message" for a commander's message, and "Notice" for any other informational map toast, including a knockout. One knockout is one notice even when more than one reason applies (`formatKnockoutNotice` in `src/shared/knockoutNotice.ts`). A turn report names sides: who took hexes, who lost units, and a "Seen:" line for a fight that did not include the side the report calls "you" (`buildTurnReportLines` in `src/shared/turnReportLines.ts`). While no human seat is still playing, the report has only those "Seen:" lines.
- A turn report carries a disabled Replay button.
- Entries filed since the player last left this tab are marked with a gold dot.
- With no entries, the tab reads "No reports yet this match."
- The console header's subtitle reads "this match". The Reports tab in the rail shows the number of unread entries, and hides it at zero. See [console.md](console.md).
- Control tips for the tab and the Replay placeholder are in [control-tooltips.md](control-tooltips.md).

## Inputs and Responses

### Mouse

- None. Replay is disabled in this version.

### Keyboard

- None.

### Other

- Every informational map toast is filed when it appears, except a knockout toast whose notices were already filed one per seat. Error toasts are not filed. A Ready or tactical consult that shows the Message and Strategy toast is filed as one Message, a copy of that toast. A drained commander pool is different: each kept message is its own Message entry, and the "Messages (n)" toast is not filed again. See [notifications-and-feedback.md](notifications-and-feedback.md).
- An entry is unread until the Reports tab is shown. Showing the tab marks every entry read. Entries filed while the tab is shown are never unread.
- The list keeps the newest 200 entries (`MAX_CONSOLE_REPORTS`).
- Starting a new match clears the list, as it clears the AI activity log. The list is not saved. After the app restarts it starts empty, and a toast shown once the app is up, such as a basemap failure, can file a new entry.

## States

- Empty: "No reports yet this match."
- Entries present: newest first.
- Unread: the rail shows a count.

## Invariants

- An error toast never becomes an entry.
- A turn report or a notice copies the toast that filed it. A message from the commander pool is the sender line described above, not a copy of the shared Messages toast.
- The rail count never counts an entry filed while the tab was shown.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| Tag | Turn, such as "T7" | Beat, such as "B2" |
| Turn report | After a turn resolves | After a beat resolves |

## Related Documents

- [console.md](console.md)
- [notifications-and-feedback.md](notifications-and-feedback.md)
- [ai-activity-log.md](ai-activity-log.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#console-tab-reports`, `#console-tab-reports-badge`, `#console-panel-reports`, `#reports-sender-filter`, `#reports-empty`, `#reports-list`)
- `static/consoleChrome.css`
- `src/renderer/chrome/consoleReports.ts` (`recordConsoleReport`, `refreshReportSenderFilter`)
- `src/shared/consoleReportLog.ts` (`consoleReportVisible`)
- `src/shared/knockoutNotice.ts` (`formatKnockoutNotice`)
- `src/renderer/gameplay/knockoutNotices.ts` (`announceKnockouts`)
- `src/renderer/openRouter/openRouterUiHelpers.ts` (`showMapToast`, `showAiStrategyToast`)
- `src/renderer/openRouter/commanderMessagesToast.ts` (`showCommanderMessagesToast`)
- `src/renderer/gameplay/readyResolutionAnnouncements.ts` (`announceResolutionTurnUpdate`, `deriveCombatVisibilityClassification`)
- `src/shared/turnReportLines.ts` (`buildTurnReportLines`)
