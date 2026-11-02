/**
 * Explicit prompt-cache marks and the two request retries that protect them.
 *
 * Purpose: A google or anthropic system message can be cached, and a refusal must not disable an unrelated request.
 * When to use: `node dist/main/openRouter/promptCacheBreakpoint.test.js` after `npm run build:main`.
 * Expected outcome: The mark sits only on the system text. An unrelated 400 is not a cache rejection.
 * Exceptions: Assertion failures.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSULT_SITUATION_LEAD_IN } from './consultPromptMessages';
import {
  applySystemCacheBreakpoint,
  isCacheBreakpointRejection,
  joinOpeningUserMessages,
  modelUsesExplicitPromptCache,
} from './promptCacheBreakpoint';

test('a google model body gets the breakpoint on the system message only', () => {
  const body = {
    model: 'google/gemini',
    messages: [
      { role: 'system', content: 'rules' },
      { role: 'user', content: CONSULT_SITUATION_LEAD_IN },
      { role: 'user', content: 'live' },
    ],
  };
  const marked = applySystemCacheBreakpoint(body);
  const messages = marked.messages as Array<{ role: string; content: unknown }>;
  assert.deepEqual(messages[0]?.content, [
    { type: 'text', text: 'rules', cache_control: { type: 'ephemeral' } },
  ]);
  assert.equal(messages[1]?.content, CONSULT_SITUATION_LEAD_IN);
  assert.equal(messages[2]?.content, 'live');
  assert.equal(body.messages[0]?.content, 'rules');
  const already = applySystemCacheBreakpoint(marked);
  assert.equal(already, marked);
});

test('an openai model body is not given a breakpoint', () => {
  const body = {
    messages: [{ role: 'system', content: 'rules' }, { role: 'user', content: 'live' }],
  };
  assert.equal(modelUsesExplicitPromptCache('openai/gpt'), false);
  assert.equal(modelUsesExplicitPromptCache('google/gemini'), true);
  assert.equal(modelUsesExplicitPromptCache('anthropic/claude'), true);
  const sent = modelUsesExplicitPromptCache('openai/gpt') ? applySystemCacheBreakpoint(body) : body;
  assert.equal(sent, body);
  assert.equal((sent.messages as Array<{ content: string }>)[0]?.content, 'rules');
});

test('a cache_control error is a breakpoint rejection and a schema error is not', () => {
  assert.equal(isCacheBreakpointRejection({ error: 'provider rejected cache_control' }), true);
  assert.equal(isCacheBreakpointRejection({ error: 'bad schema' }), false);
});

test('two opening user messages join with the lead-in on the first line', () => {
  const body = {
    messages: [
      { role: 'system', content: 'rules' },
      { role: 'user', content: CONSULT_SITUATION_LEAD_IN },
      { role: 'user', content: '# Current Situation' },
      { role: 'assistant', content: 'later' },
    ],
  };
  const joined = joinOpeningUserMessages(body);
  const messages = joined.messages as Array<{ role: string; content: string }>;
  assert.equal(messages.length, 3);
  assert.equal(messages[0]?.content, 'rules');
  assert.equal(messages[1]?.content, `${CONSULT_SITUATION_LEAD_IN}\n# Current Situation`);
  assert.equal(messages[2]?.role, 'assistant');
  assert.equal(body.messages.length, 4);
});
