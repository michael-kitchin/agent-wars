/**
 * Parsing a talk reply and the schema offered to the model.
 *
 * Purpose: A reply is accepted only when each entry names a side the caller allows, and the schema offers those codes.
 * When to use: `npm run build:main`, then `node dist/main/openRouter/talk/talkReply.test.js`.
 * Expected outcome: Clean replies become seat ids. Refused entries are counted. Text that is not an object returns null.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, HUMAN_SEAT_ID, type SeatId } from '../../../shared/seatIds';
import { SIDE_MESSAGE_MAX_CHARS } from '../../../shared/sideMessages';
import { parseTalkReply } from './talkReply';
import { buildTalkReplyResponseFormat } from './talkReplySchema';

const active: readonly SeatId[] = [HUMAN_SEAT_ID, AI_SEAT_IDS[0], AI_SEAT_IDS[1]];

test('a clean reply and a fenced reply become seat ids', () => {
  const clean = parseTalkReply({
    replyText: '{"messages":[{"to":"h1","text":"Hold the coast."},{"to":"a2","text":"Stay north."}],"stances":[{"toward":"h1","stance":"wary","reason":"Massing."}]}',
    ownSeatId: AI_SEAT_IDS[0],
    addressableSeatIds: active,
  });
  assert.deepEqual(clean?.messages.map((row) => row.toSeatId), [HUMAN_SEAT_ID, AI_SEAT_IDS[1]]);
  assert.equal(clean?.stances[0]?.stance, 'wary');
  assert.equal(clean?.droppedCount, 0);

  const fenced = parseTalkReply({
    replyText: '```json\n{"messages":[{"to":"h1","text":"Hold."}],"stances":[]}\n```',
    ownSeatId: AI_SEAT_IDS[0],
    addressableSeatIds: active,
  });
  assert.equal(fenced?.messages[0]?.text, 'Hold.');
});

test('codes are trimmed and cased, and bad entries are counted', () => {
  const parsed = parseTalkReply({
    replyText: JSON.stringify({
      messages: [
        { to: 'A2', text: 'North.' },
        { to: ' a2 ', text: 'Again.' },
        { to: 'a1', text: 'To myself.' },
        { to: 'a4', text: 'Missing.' },
        { to: 'h1', text: '   ' },
      ],
      stances: [
        { toward: 'h1', stance: 'allied', reason: 'No.' },
        { toward: 'h1', stance: 'friendly', reason: '' },
      ],
    }),
    ownSeatId: AI_SEAT_IDS[0],
    addressableSeatIds: active,
  });
  assert.deepEqual(parsed?.messages.map((row) => row.text), ['North.']);
  assert.equal(parsed?.stances.length, 1);
  assert.equal(parsed?.stances[0]?.reason, '');
  assert.equal(parsed?.droppedCount, 5);
});

test('long text is cut, and text that is not an object is null', () => {
  const long = parseTalkReply({
    replyText: JSON.stringify({ messages: [{ to: 'h1', text: 'x'.repeat(400) }], stances: [] }),
    ownSeatId: AI_SEAT_IDS[0],
    addressableSeatIds: active,
  });
  assert.equal(long?.messages[0]?.text.length, SIDE_MESSAGE_MAX_CHARS);
  assert.equal(parseTalkReply({ replyText: 'not json', ownSeatId: AI_SEAT_IDS[0], addressableSeatIds: active }), null);
  assert.equal(parseTalkReply({ replyText: '[]', ownSeatId: AI_SEAT_IDS[0], addressableSeatIds: active }), null);
  const empty = parseTalkReply({ replyText: '{}', ownSeatId: AI_SEAT_IDS[0], addressableSeatIds: active });
  assert.deepEqual(empty, { messages: [], stances: [], droppedCount: 0 });
});

test('the response format offers the given side codes in both enums', () => {
  const format = buildTalkReplyResponseFormat(['h1', 'a2']);
  const schema = (format.json_schema as { schema: { properties: Record<string, { items: { properties: Record<string, { enum: string[] }> } }> } }).schema;
  assert.deepEqual(schema.properties.messages.items.properties.to.enum, ['h1', 'a2']);
  assert.deepEqual(schema.properties.stances.items.properties.toward.enum, ['h1', 'a2']);
});

test('trust and threat are kept when valid and null when missing or out of range', () => {
  const parsed = parseTalkReply({
    replyText: JSON.stringify({
      messages: [],
      stances: [
        { toward: 'h1', stance: 'wary', reason: '', trust: 2, threat: 4 },
        { toward: 'a2', stance: 'friendly', reason: '' },
      ],
    }),
    ownSeatId: AI_SEAT_IDS[0],
    addressableSeatIds: active,
  });
  assert.deepEqual([parsed?.stances[0]?.trust, parsed?.stances[0]?.threat], [2, 4]);
  assert.deepEqual([parsed?.stances[1]?.trust, parsed?.stances[1]?.threat], [null, null]);
  assert.equal(parsed?.droppedCount, 0);
  const outOfRange = parseTalkReply({
    replyText: JSON.stringify({ messages: [], stances: [{ toward: 'h1', stance: 'wary', reason: '', trust: 9, threat: 1 }] }),
    ownSeatId: AI_SEAT_IDS[0],
    addressableSeatIds: active,
  });
  assert.deepEqual([outOfRange?.stances[0]?.trust, outOfRange?.stances[0]?.threat], [null, 1]);
});

test('the stance item requires both scores, and each is limited to 0 through 4', () => {
  const format = buildTalkReplyResponseFormat(['h1', 'a2']);
  const schema = (format.json_schema as {
    schema: { properties: { stances: { items: { required: string[]; properties: Record<string, { enum: unknown[] }> } } } };
  }).schema;
  const item = schema.properties.stances.items;
  assert.deepEqual(item.required, ['toward', 'stance', 'trust', 'threat', 'reason']);
  assert.deepEqual(item.properties.trust.enum, [0, 1, 2, 3, 4]);
  assert.deepEqual(item.properties.threat.enum, [0, 1, 2, 3, 4]);
});
