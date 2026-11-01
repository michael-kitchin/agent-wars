/**
 * Attribution headers shared by the OpenRouter model list and chat POST.
 * The key strings in this file are for testing: `test-openrouter-key` and `test-openrouter-key-b`.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  openRouterAttributionHeaders,
  openRouterChatRequestHeaders,
  openRouterModelsRequestHeaders,
} from './openRouterAttributionHeaders';

/**
 * Fake OpenRouter key used by the header builders.
 *
 * Purpose: The assertions need a bearer value that is obviously not a real key.
 * When to use: The models and chat header tests in this file. The second fake key is inlined beside it.
 * Expected outcome: The literal `test-openrouter-key`.
 * Exceptions: None.
 */
const TEST_API_KEY = 'test-openrouter-key';

test('attribution headers are the public app identity', () => {
  const headers = openRouterAttributionHeaders();
  assert.deepEqual(headers, {
    'HTTP-Referer': 'https://github.com/michael-kitchin/agent-wars',
    'X-OpenRouter-Title': 'Agent Wars',
    'X-OpenRouter-Categories': 'game',
  });
  assert.equal(Object.hasOwn(headers, 'X-OpenRouter-App-Visibility'), false);
  assert.equal(Object.hasOwn(headers, 'X-Title'), false);
});

test('each attribution call returns its own object', () => {
  const first = openRouterAttributionHeaders();
  const second = openRouterAttributionHeaders();
  assert.notEqual(first, second);
  assert.deepEqual(first, second);
  const mutated = openRouterAttributionHeaders();
  (mutated as { 'HTTP-Referer': string })['HTTP-Referer'] = 'https://example.invalid';
  assert.equal(
    openRouterAttributionHeaders()['HTTP-Referer'],
    'https://github.com/michael-kitchin/agent-wars'
  );
});

test('models request headers carry the bearer and the app identity', () => {
  const headers = openRouterModelsRequestHeaders(TEST_API_KEY);
  assert.deepEqual(headers, {
    Authorization: 'Bearer test-openrouter-key',
    'HTTP-Referer': 'https://github.com/michael-kitchin/agent-wars',
    'X-OpenRouter-Title': 'Agent Wars',
    'X-OpenRouter-Categories': 'game',
  });
  assert.equal(
    openRouterModelsRequestHeaders('test-openrouter-key-b').Authorization,
    'Bearer test-openrouter-key-b'
  );
  assert.equal(Object.hasOwn(headers, 'Content-Type'), false);
  assert.equal(Object.hasOwn(headers, 'Accept-Encoding'), false);
});

test('chat request headers keep the JSON headers and add the app identity', () => {
  const headers = openRouterChatRequestHeaders(TEST_API_KEY);
  assert.deepEqual(headers, {
    'Content-Type': 'application/json',
    Authorization: 'Bearer test-openrouter-key',
    'Accept-Encoding': 'gzip, deflate, br, identity',
    'HTTP-Referer': 'https://github.com/michael-kitchin/agent-wars',
    'X-OpenRouter-Title': 'Agent Wars',
    'X-OpenRouter-Categories': 'game',
  });
  assert.equal(
    openRouterChatRequestHeaders('test-openrouter-key-b').Authorization,
    'Bearer test-openrouter-key-b'
  );
  assert.equal(Object.hasOwn(headers, 'X-OpenRouter-App-Visibility'), false);
  assert.equal(Object.hasOwn(headers, 'X-Title'), false);
});
