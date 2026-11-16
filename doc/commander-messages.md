# Commander messages

What one side can say to another, what a commander keeps to itself, and when those words are delivered.

The engine is the authority. The symbols named below are the ones to check when this page and the code disagree. Nothing in these rules makes a message binding. A message is a claim. It does not change orders, alliances, or the match.

## What a message is

A message is one short text from one seat to one other seat. `cleanSideMessageText` collapses whitespace, strips other control characters, trims, and cuts the result to `SIDE_MESSAGE_MAX_CHARS` (280), counting each code point once, with no ellipsis. An empty result is not stored.

`side_messages` holds the rows. A row is `staged` or `sent`. A staged row is a draft that has not been delivered. A sent row carries the step it was delivered on (`scope`, `turn_number`, `battle_id`, `beat_number`). At most one staged row exists for a sender and a recipient. Writing another draft deletes the previous one. There is no unique index. The delete and the insert do it.

A commander sees a message only when `sideMessageVisibleTo` says so. For a commander, that is a message it sent or a message sent to it. Fog does not widen that. The chat history lists every sent message, with fog on and while the player is only observing. Within a turn the rows follow the sender's `seatOrder`, then the recipient's. The message dialog and the Reports entry for that consult list every message that commander sent.

## What a stance is

A stance is a commander's private view of one other side. The values are `SIDE_STANCES`: `hostile`, `wary`, `neutral`, `cordial`, `friendly`. Each stored stance has a reason of at most `SIDE_STANCE_REASON_MAX_CHARS` (160) characters. An empty reason is kept. No other commander is told a stance. A stance does not create an alliance. The talk prompt tells the commander to base a stance on what a side has done to it, as the loss lines in Recent Turn Notes record, more than on what that side says.

`side_stances` holds one row per commander and target. `upsertSideStance` writes a row only when the stance or the reason changed.

## The two stages

A wave that is about to ask for orders can start with a talk call. `buildTalkSystemText` and `buildTalkSituationText` are that call. `parseTalkReply` reads the reply. The orders call starts only after every talk call in the wave has finished, failed, or timed out. A commander still waiting on its talk round starts no orders call after Stop, New, or Load. `openTalkRound` is that wait. `speak` and `abstain` each settle a seat once.

A commander talks only when the existing consult policy is about to ask it for orders. An unread message the prompt would show, `countUnreadPromptMessages`, causes an orders consult and does not start a talk call. That holds on the world map and in a battle. A hard skip, such as a seat with no model, no key, or a battle that has already been annihilated, is not overridden by an unread message.

Both the talk prompt and the orders prompt show the messages `sideMessageVisibleTo` allows, through `readSideMessageThreads` and `formatSideMessageThreads`. A thread keeps the newest `SIDE_MESSAGE_THREAD_PROMPT_LINES` (8) lines. The orders section is `buildOrdersMessagesBlock`. A line marked `(new)` is an unread message inside that window. `countUnreadPromptMessages` counts those lines. That count is what asks for an orders consult when the policy would otherwise skip. A successful orders consult marks the shown ids seen (`markSideMessagesSeen`) when the consult still belongs to the open match (`consultStillOnOpenMatch`). An older unread message stays unseen, and it does not by itself request another consult. A failed, timed-out, or replaced consult leaves the shown lines unread. An orders consult that stops at the tool budget still marks the messages it showed as read, because the model saw them.

Both system prompts carry `SIDE_MESSAGE_SOURCE_BULLETS` and `SIDE_MESSAGE_TRUST_BULLETS`. The orders copy is `sideMessageRuleBlock`. With `AGENT_WARS_DISABLE_TALK` set, the diplomacy sentence is left out. The source and trust bullets stay. A talk call that hits its own deadline records outcome `wallClock`. A stop records `cancelled`. The cached system text does not contain a turn number, a count, or a message.

The talk call uses the same model, key, provider, and reasoning as the orders call. It does not retry, and an unparseable reply is not asked for again. The commander stays silent. `requestTalk` records a `consultation` event with `stage` `talk` when the model was reached and the consult still belongs to the open match.

## Timeouts

`AI_TALK_REQUEST_TIMEOUT_MS` (60_000) bounds one talk call. `AI_TALK_ROUND_TIMEOUT_MS` (75_000) bounds the wave. A seat that has not finished when the round closes is silent. The orders calls then start. A timeout does not hold the turn past that round. `AI_CONSULTATION_WAIT_TIMEOUT_MS` includes the round. The orders tool loop still stops at `AI_CONSULTATION_WALL_CLOCK_MS` (600_000). The pool's own wall clock is that constant plus the round timeout.

In a battle, only the two sides fighting talk to each other. A battle commander can send a message to, and set a stance toward, the opposing side only, so a side outside the battle receives nothing from its beats (`readTalkPromptInput`). A battle against Neutral, or against a side that has left the match, makes no talk call and is silent with `no_recipients`.

A silence reason is `abstained`, `failed`, `timed_out`, `unparsed`, `cancelled`, or `no_recipients`. None of those writes a message.

## The tables and the recording

`ensureSideMessageTables` creates `side_messages` and `side_stances` on open. They are not in `GAME_DB_REQUIRED_TABLES`. `EXPECTED_USER_VERSION` is unchanged. `resetGameForNewMatch` deletes both.

`side_stances` is copied into a history frame. `side_messages` is not. Each sent message is a `message_sent` event (`recordSideMessageSent`). Each stance change is a `stance_declared` event (`recordSideStanceDeclared`). A talk call is a `consultation` event with `stage` `talk`. The details are in [match-recording.md](match-recording.md).

## The human player's messages

`stageHumanSideMessage` stores a draft from the active human seat (`activeHumanSeatId`). The chat panel at the map's bottom-right is where the player writes that draft. Enter or the send button stages it. Staging the same side again replaces the draft. Ready sends it. A beat of a battle between two AI sides does not send them. `sendStagedHumanSideMessages` delivers the staged drafts when a strategic turn is committed (`handleGameReady`, after `recordStrategicOrders`) and when a tactical beat is committed (`IPC_GAME.commitHumanTacticalDraftOrders`, after `recordTacticalBeat`). A draft whose recipient has left the match is deleted and not sent. The recipient's next orders consult shows the message. If the policy would not have consulted that commander, the unread message still does, and that consult does not talk. A reply, when the commander sends one, arrives on a later consult. The consult that was caused only by the unread count does not talk.

The message dialog lists every message that commander sent in that consult, including while fog of war is on and while the player is only observing. Under Messages, one line per message, in `seatOrder`: `→ `, the flag, `sideDisplayName`, `: `, and the text. The first line is `1em` under the header, and the lines sit against each other. There is no bullet. The human's flag is the seat-1 badge (`createMessagePartyFlag`) and the name is that seat's nickname, or `Human` when the nickname is empty. Strategy follows when the consult sent it, `1em` under the last message line. The chat history uses the same flag and name, and it lists every sent message, including one commander to another. A battle message adds ` (battle)` after the recipient. Commanders cannot read the player's messages to other sides. An observer reads every message and cannot write. A timed-out orders consult does not open the dialog. The dialog and a filed Reports entry stay as they were when the consult was stored.

## Turning talk off

`AGENT_WARS_DISABLE_TALK=1` makes `isTalkStageEnabled` false. No talk call runs, and no new talk rows are written. Orders consults continue. The orders system prompt still carries the message rules, so a run with talk off still pays for them. A pilot comparison of orders cost with talk on and off measures what talk adds, not what the message rules cost. The flag is read by `isEnvFlagEnabled` in `src/main/envFlag.ts`.
