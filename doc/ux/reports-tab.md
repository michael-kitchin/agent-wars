# Reports Tab

The console tab that keeps what the map toasts showed during the current match.

## Purpose

Let the player read a turn update, an opponent message, or a notice again after its toast has hidden.

## Availability

Shown while the console's Reports tab is selected and the console is expanded, in every mode where the console is visible. While the tactical battles list is open, the tab stays visible while the console is expanded and does not receive pointer input. In New game and Game over the console is absent, so this tab is absent with it. Entries are filed whether or not the tab is shown.

## Information Displayed

- A "Show reports from" select sits above the list (`#reports-sender-filter`). It offers "Everyone", then every seat's full home name. Choosing a seat hides messages from other seats. Turn reports and notices stay visible. "Everyone" shows every entry.
- One entry per filed event, newest first. A turn report or a notice shows a tag, a kind, and a copy of the toast's text, including the origin flags, type icons, and opponent number flags a turn update shows. A message shows a tag, the kind "Message", and the model label at the right of that head. Its body is the sender's number flag when the sender is an opponent, otherwise the sender's color dot, then the sender's full home name, and the message in quotes when that message is non-empty. A muted "Strategy:" line follows when the consult sent strategy, including while a human seat is playing. A strategy-only consult shows the home name and that line, with no empty quotes.
- The tag says when: "T7" for a strategic turn, or "B2" for a battle beat (`formatConsoleReportTag` in `src/shared/consoleReportLog.ts`). A turn report is tagged with the turn or beat it reports on, which is the one Ready just resolved. Its Updates section ends with the unknown-battle sentence when combat was outside vision. The standing-orders notice that a Ready raises takes that same tag. Every other entry is tagged with the current turn or beat when it arrived. An entry filed before a match is loaded has no tag.
- The kind is "Turn report" for a turn or beat update, "Message" for a commander's message, and "Notice" for any other informational map toast, including a knockout. One knockout is one notice even when more than one reason applies (`formatKnockoutNotice` in `src/shared/knockoutNotice.ts`). A turn report is a copy of the turn-update toast: one section per side that lost a visible unit or lost hexes, then Updates. Hex sentences are the last lines of that side's section. Updates keeps deployments and caps, and does not list hex changes. When combat was outside vision, Updates ends with the sentence from `formatUnknownBattleAnnouncement` in `src/shared/unknownBattleAnnouncement.ts`: names sorted with `localeCompare('en')` and joined with commas, as in `Unknown battle observed in Africa, Europe.`, or `Unknown battle observed in an unidentified continent.` when no name remains. The viewer is `reportViewerSeatId` in `src/renderer/gameplay/readyResolutionAnnouncements.ts`. While that viewer is absent, the sections use each side's full name and the hex sentences do not say you.
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

- Every informational map toast is filed when it appears, except a knockout toast whose notices were already filed one per seat. Error toasts are not filed. Each kept commander dispatch is its own Message entry. The message dialog is not filed. An absence line shown on a message tab is not a Reports entry. A stale or abandoned consult is filed and does not open the dialog. See [notifications-and-feedback.md](notifications-and-feedback.md).
- An entry is unread until the Reports tab is shown. Showing the tab marks every entry read. Entries filed while the tab is shown are never unread.
- The list keeps the newest 200 entries (`MAX_CONSOLE_REPORTS`).
- Starting a new match clears the list, as it clears the AI activity log. The list is not saved. After the app restarts, and after a successful load, it starts empty, and a toast shown once the app is up, such as a basemap failure, can file a new entry. Save and load toasts are not filed. See [save-and-load.md](save-and-load.md).

## States

- Empty: "No reports yet this match."
- Entries present: newest first.
- Unread: the rail shows a count.

## Invariants

- An error toast never becomes an entry.
- A turn report or a notice copies the toast that filed it. A message from the commander pool is the sender line described above, not a copy of the message dialog.
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
- `src/renderer/chrome/consoleReports.ts` (`recordConsoleReport`, `messageReportBody`, `refreshReportSenderFilter`)
- `src/shared/consoleReportLog.ts` (`consoleReportVisible`)
- `src/shared/knockoutNotice.ts` (`formatKnockoutNotice`)
- `src/renderer/gameplay/knockoutNotices.ts` (`announceKnockouts`)
- `src/renderer/openRouter/openRouterUiHelpers.ts` (`showMapToast`, `showFilledAiStrategyToast`) and `src/renderer/openRouter/commanderMessageTabsUi.ts` (`showCommanderMessageTabs`)
- `src/shared/turnLossSections.ts` (`buildTurnLossSections`)
- `src/renderer/gameplay/readyResolutionAnnouncements.ts` (`announceResolutionTurnUpdate`, `deriveCombatVisibilityClassification`, `reportViewerSeatId`)
- `src/shared/unknownBattleAnnouncement.ts` (`formatUnknownBattleAnnouncement`)
- `src/shared/turnReportLines.ts` (`hexChangeLinesByOwner`)
