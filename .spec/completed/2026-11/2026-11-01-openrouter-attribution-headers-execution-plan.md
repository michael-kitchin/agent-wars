# OpenRouter attribution headers

Audience: a lower-quality coding agent. Implement one phase at a time. Stop after each phase and report the files touched, the commands run, and their results. If a phase fails, undo only the files that phase created or edited. Leave earlier phases in place. Do not run `git reset`, and do not check out the whole tree. If a line in this plan disagrees with the code, trust the code, stop, and report the discrepancy. Do not commit or push.

## Goal

Every OpenRouter HTTP call from the main process sends these headers, with these exact values:

- `HTTP-Referer`: `https://github.com/michael-kitchin/agent-wars`
- `X-OpenRouter-Title`: `Agent Wars`
- `X-OpenRouter-Categories`: `game`

Do not send `X-OpenRouter-App-Visibility`. Leaving that header off is what makes a newly created app public. Do not send the legacy `X-Title` header.

There are exactly two outbound calls:

- Model list: `GET https://openrouter.ai/api/v1/models` in [`src/main/openRouter/openRouter.ts`](src/main/openRouter/openRouter.ts), inside `listModels`, the `fetch` whose headers are `{ Authorization: \`Bearer ${supplied}\` }`.
- Chat: `POST https://openrouter.ai/api/v1/chat/completions` in [`src/main/openRouter/openRouterChatTransport.ts`](src/main/openRouter/openRouterChatTransport.ts), inside `postChatViaHttps`, the `headers` object passed to `https.request`.

Whichever call runs first creates the OpenRouter app page. Both must send the same three attribution headers. Chat retries call `postChatViaHttps` again, so the chat headers belong inside that function.

```mermaid
flowchart TD
  attribution[openRouterAttributionHeaders]
  modelsHeaders[openRouterModelsRequestHeaders]
  chatHeaders[openRouterChatRequestHeaders]
  modelsGet[listModels GET]
  chatPost[postChatViaHttps POST]
  attribution --> modelsHeaders
  attribution --> chatHeaders
  modelsHeaders --> modelsGet
  chatHeaders --> chatPost
```

## Locked decisions

- One module, [`src/main/openRouter/openRouterAttributionHeaders.ts`](src/main/openRouter/openRouterAttributionHeaders.ts), owns the three values and the two header objects. Call sites do not copy the strings.
- Each header function returns a new object. Mutating one result must not change the next call.
- The header name is `HTTP-Referer`, not `Referer`. Node `fetch` drops `Referer`. Do not rename it if a test shows a missing referer.
- `listModels` already trims the key and returns `{ error: 'No API key set' }` before `fetch` when the trimmed key is empty. Keep that. The header helpers do not trim.
- The model-list request stays a `fetch`. It gains the three attribution headers and keeps `Authorization`. It does not gain `Content-Type` or `Accept-Encoding`.
- The chat POST stays on `https.request` through the new wrapper in [`src/main/openRouter/openRouterHttpsRequest.ts`](src/main/openRouter/openRouterHttpsRequest.ts). Do not switch it to `fetch`. `Accept-Encoding` is a forbidden `fetch` header, and this POST depends on `https.request` for the timeout, abort, and gzip path.
- Chat keeps `Content-Type: application/json`, `Authorization: Bearer <key>`, and `Accept-Encoding: gzip, deflate, br, identity`. Add the three attribution headers. Do not rewrite the retry loop, the abort path, or the body decoder.
- Node lowercases header names on the wire. HTTP treats those names as case-insensitive. Set the names in the case this plan spells. Do not add code to preserve mixed case on the socket.
- The chat test must drive `postChatViaHttps`. Do not call `setOpenRouterPostChatForTests` in that test. That override skips the real poster.
- Do not add a dependency, do not edit `package.json`, and do not change the renderer or preload. The renderer does not call OpenRouter.
- Do not log an API key, an `Authorization` value, or a headers object. Trace logs may include `hasKey` as a boolean. The socket wrapper may log hostname, path, and method.
- Do not put phase numbers, or words from this plan’s headings, into `src/`, tests, comments, or `doc/`.
- [`SECURITY.md`](SECURITY.md) is the only document to update. Leave [`doc/release-notes/`](doc/release-notes/) alone. The sentence that the key is sent only to `openrouter.ai` stays true.
- [`src/main/openRouter/openRouter.ts`](src/main/openRouter/openRouter.ts) is already past 600 lines. Add one import and change the `fetch` headers and the `listModels` comment. Do not add a function to that file.
- [`src/main/openRouter/openRouterChatTransport.ts`](src/main/openRouter/openRouterChatTransport.ts) is 570 lines. The socket test hook goes in the new https module, not in the transport. After phase 3 the transport must still be under 600 lines. If it is over 600, move the extra code into `openRouterHttpsRequest.ts`. Do not split the transport yourself, and do not stop the phase only because you were tempted to add the hook there.

## Working rules

- Shell is Windows PowerShell. Working directory `F:\Projects\Personal\agent-wars-public`. Run one command at a time. Do not chain with `&&`.
- New and edited functions, exported constants, and module-level fields get an orienting comment: a summary line, then `Purpose`, `When to use`, `Expected outcome`, and `Exceptions`. Use the comment text in this plan. A program-level `function` without that block fails `eslint`.
- `logTrace` on the header getters. `logDebug` on the socket wrapper and the test setter. Do not add another `logError`; the existing `catch` paths already log.
- Tests cover the happy path and the essential failure: a blank or whitespace model-list key must not call `fetch`, and two different keys must produce two different `Authorization` values. Fake keys in new tests are the literals `test-openrouter-key` and `test-openrouter-key-b`. The test file says they are for testing. Do not change the older `test-key` literals already in [`src/main/openRouter/openRouterChatTransport.test.ts`](src/main/openRouter/openRouterChatTransport.test.ts).
- `const` for values that are not reassigned. Header functions take one argument or none. The socket sender takes two.
- Do not reformat unrelated lines, and do not change the line endings of files you edit.
- A phase check is the commands in that phase. `npm test` runs once, in phase 4. It also lints and checks names. Do not refresh `scripts/circular-deps-baseline.json` or `scripts/renderer-typecheck-baseline.json`.

## Phase 1 — Header module

No call-site changes. Requests stay as they are until phase 2.

Create [`src/main/openRouter/openRouterAttributionHeaders.ts`](src/main/openRouter/openRouterAttributionHeaders.ts) with this contents:

```ts
import { logTrace } from '../logger';

/**
 * URL OpenRouter uses as this app's identity.
 *
 * Purpose: `HTTP-Referer` is the key that creates the public app page.
 * When to use: Only from `openRouterAttributionHeaders`.
 * Expected outcome: The GitHub repository URL, with no trailing slash.
 * Exceptions: None.
 */
export const OPENROUTER_APP_HTTP_REFERER = 'https://github.com/michael-kitchin/agent-wars';

/**
 * Display name OpenRouter shows for this app.
 *
 * Purpose: Rankings and analytics use this title together with the referer URL.
 * When to use: Only from `openRouterAttributionHeaders`.
 * Expected outcome: The words Agent Wars.
 * Exceptions: None.
 */
export const OPENROUTER_APP_TITLE = 'Agent Wars';

/**
 * Marketplace category OpenRouter accepts for this app.
 *
 * Purpose: `game` is the recognized entertainment category for this game.
 * When to use: Only from `openRouterAttributionHeaders`.
 * Expected outcome: The single lowercase category `game`.
 * Exceptions: None.
 */
export const OPENROUTER_APP_CATEGORIES = 'game';

/**
 * The three attribution headers, and no others.
 *
 * Purpose: Both OpenRouter calls must send the same app identity. Leaving out `X-OpenRouter-App-Visibility` keeps the app public.
 * When to use: From `openRouterModelsRequestHeaders` and `openRouterChatRequestHeaders` only.
 * Expected outcome: A new object each call. Keys are `HTTP-Referer`, `X-OpenRouter-Title`, and `X-OpenRouter-Categories`.
 * Exceptions: None.
 */
export function openRouterAttributionHeaders(): Readonly<Record<string, string>> {
  logTrace('openRouter openRouterAttributionHeaders');
  return {
    'HTTP-Referer': OPENROUTER_APP_HTTP_REFERER,
    'X-OpenRouter-Title': OPENROUTER_APP_TITLE,
    'X-OpenRouter-Categories': OPENROUTER_APP_CATEGORIES,
  };
}

/**
 * Headers for the models-list GET.
 *
 * Purpose: `listModels` must identify the app without dropping the bearer token.
 * When to use: The `headers` option of the models `fetch`.
 * Expected outcome: `Authorization` is `Bearer` plus the given key, then the three attribution headers. The key is not logged. A new object each call.
 * Exceptions: None. Does not trim `apiKey`. Does not set `Content-Type` or `Accept-Encoding`.
 */
export function openRouterModelsRequestHeaders(apiKey: string): Readonly<Record<string, string>> {
  logTrace('openRouter openRouterModelsRequestHeaders', { hasKey: apiKey.length > 0 });
  return {
    Authorization: `Bearer ${apiKey}`,
    ...openRouterAttributionHeaders(),
  };
}

/**
 * Headers for the chat-completion POST.
 *
 * Purpose: `postChatViaHttps` must keep the JSON and compression headers and add the same app identity.
 * When to use: The `headers` option of the chat `https.request`.
 * Expected outcome: `Content-Type`, `Authorization`, and `Accept-Encoding` keep their current values, then the three attribution headers. The key is not logged. A new object each call.
 * Exceptions: None. Does not trim `apiKey`.
 */
export function openRouterChatRequestHeaders(apiKey: string): Readonly<Record<string, string>> {
  logTrace('openRouter openRouterChatRequestHeaders', { hasKey: apiKey.length > 0 });
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'Accept-Encoding': 'gzip, deflate, br, identity',
    ...openRouterAttributionHeaders(),
  };
}
```

Create [`src/main/openRouter/openRouterAttributionHeaders.test.ts`](src/main/openRouter/openRouterAttributionHeaders.test.ts) with this contents. The key strings in this file are for testing.

```ts
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
```

Verify, one command at a time:

```powershell
npm run build:main
node dist/main/openRouter/openRouterAttributionHeaders.test.js
npx eslint src/main/openRouter/openRouterAttributionHeaders.ts src/main/openRouter/openRouterAttributionHeaders.test.ts
```

Expected: each command exits 0. The test reports 4 passing tests and no `not ok`.

## Phase 2 — Model list

In [`src/main/openRouter/openRouter.ts`](src/main/openRouter/openRouter.ts), add this import next to the existing `buildOpenRouterModelList` import:

```ts
import { openRouterModelsRequestHeaders } from './openRouterAttributionHeaders';
```

`openRouterAttributionHeaders.ts` must not import `openRouter.ts`.

Replace the `fetch` headers object so the call is:

```ts
const res = await fetch(OPENROUTER_MODELS_URL, {
  headers: openRouterModelsRequestHeaders(supplied),
});
```

Replace the comment on `listModels` with this comment. Keep the function body except for the headers change above.

```ts
/**
 * Loads the OpenRouter model catalog with the caller's key.
 *
 * Purpose: Each popover refresh uses the key in that popover.
 * When to use: The model-list IPC. Pass `''` when the argument is not a string.
 * Expected outcome: The model list on success. The request headers are `openRouterModelsRequestHeaders(supplied)`. `{ error: 'No API key set' }` without a fetch when the trimmed key is empty. The key is not logged.
 * Exceptions: None. A failed fetch returns `{ error }` and is logged.
 */
```

Create [`src/main/openRouter/openRouter.test.ts`](src/main/openRouter/openRouter.test.ts) with this contents. `listModels` lives in a module that imports Electron and `better-sqlite3`. This file installs the same Electron stand-in as [`src/main/openRouter/requestOrdersSeats.test.ts`](src/main/openRouter/requestOrdersSeats.test.ts), then `require`s `./openRouter`. Do not add a top-level import of `./openRouter` or `./secretConfig`. The key strings in this file are for testing.

```ts
/* eslint-disable @typescript-eslint/no-require-imports -- openRouter loads Electron, so this file requires it after the mock. */
/**
 * Model-list requests send the shared OpenRouter attribution headers.
 * The key strings in this file are for testing: `test-openrouter-key` and `test-openrouter-key-b`.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import Module = require('module');
import * as os from 'os';
import * as path from 'path';
import { afterEach, test } from 'node:test';
import { resetOpenRouterModelCapabilitiesForTests } from './openRouterModelCapabilities';

const originalFetch = globalThis.fetch;
const originalLoad = (Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load;

/**
 * Installs a stand-in Electron so `openRouter` can load under Node.
 *
 * Purpose: `openRouter.ts` imports `electron` at load time. `listModels` itself does not read the key store.
 * When to use: Before the first `require('./openRouter')` in a test.
 * Expected outcome: A later `require('electron')` returns `app.getPath` and a plaintext `safeStorage`.
 * Exceptions: None. Restored by the file's `afterEach`.
 */
function installElectronMock(userDataDir: string): void {
  (Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load = function patchedLoad(
    request: string,
    parent: unknown,
    isMain: boolean
  ) {
    if (request === 'electron') {
      return {
        app: { getPath: () => userDataDir },
        safeStorage: {
          isEncryptionAvailable: () => false,
          encryptString: (value: string) => Buffer.from(value, 'utf8'),
          decryptString: (value: Buffer) => value.toString('utf8'),
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  (Module as unknown as { _load: typeof originalLoad })._load = originalLoad;
  resetOpenRouterModelCapabilitiesForTests();
});

test('listModels sends attribution headers', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-list-models-'));
  installElectronMock(userData);
  const openRouter = require('./openRouter') as {
    listModels: (key: string) => Promise<{ models: unknown[] } | { error: string }>;
  };
  const seen: Array<{ url: string; headers: HeadersInit | undefined }> = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    seen.push({ url: String(url), headers: init?.headers });
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  }) as typeof fetch;
  try {
    const first = await openRouter.listModels('test-openrouter-key');
    const second = await openRouter.listModels('test-openrouter-key-b');
    assert.deepEqual(first, { models: [] });
    assert.deepEqual(second, { models: [] });
    assert.equal(seen.length, 2);
    assert.equal(seen[0].url, 'https://openrouter.ai/api/v1/models');
    assert.equal(seen[1].url, 'https://openrouter.ai/api/v1/models');
    const firstHeaders = new Headers(seen[0].headers);
    const secondHeaders = new Headers(seen[1].headers);
    assert.equal(firstHeaders.get('authorization'), 'Bearer test-openrouter-key');
    assert.equal(secondHeaders.get('authorization'), 'Bearer test-openrouter-key-b');
    for (const headers of [firstHeaders, secondHeaders]) {
      assert.equal(headers.get('HTTP-Referer'), 'https://github.com/michael-kitchin/agent-wars');
      assert.equal(headers.get('X-OpenRouter-Title'), 'Agent Wars');
      assert.equal(headers.get('X-OpenRouter-Categories'), 'game');
      assert.equal(headers.get('X-OpenRouter-App-Visibility'), null);
      assert.equal(headers.get('X-Title'), null);
      assert.equal(headers.get('content-type'), null);
      assert.equal(headers.get('accept-encoding'), null);
    }
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('listModels does not fetch when the key is blank', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-list-models-'));
  installElectronMock(userData);
  const openRouter = require('./openRouter') as {
    listModels: (key: string) => Promise<{ models: unknown[] } | { error: string }>;
  };
  let fetches = 0;
  globalThis.fetch = (async () => {
    fetches += 1;
    return new Response('{}', { status: 500 });
  }) as typeof fetch;
  try {
    assert.deepEqual(await openRouter.listModels(''), { error: 'No API key set' });
    assert.deepEqual(await openRouter.listModels('   '), { error: 'No API key set' });
    assert.equal(fetches, 0);
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
```

`Headers.get` is case-insensitive. If `HTTP-Referer` comes back null, stop and report that. Do not rename the header to `Referer`.

Verify, one command at a time. The native rebuild is first because loading `openRouter.ts` loads `better-sqlite3`.

```powershell
npm run rebuild:native:node
npm run build:main
node dist/main/openRouter/openRouter.test.js
npx eslint src/main/openRouter/openRouter.ts src/main/openRouter/openRouter.test.ts
```

Expected: each command exits 0. Both tests pass. A blank key does not increment `fetches`. If `node` exits while loading `better-sqlite3`, run `npm run rebuild:native:node` again and rerun the test once. Do not edit the native-load helper.

## Phase 3 — Chat POST

Create [`src/main/openRouter/openRouterHttpsRequest.ts`](src/main/openRouter/openRouterHttpsRequest.ts) with this contents. The cast on `nodeHttpsRequest` is only there so the overloads of `https.request` match this one call shape. Do not log headers.

```ts
import type { ClientRequest, IncomingMessage } from 'node:http';
import { request as nodeHttpsRequest, type RequestOptions } from 'node:https';
import { logDebug } from '../logger';

/**
 * Socket opener used for one OpenRouter chat POST.
 *
 * Purpose: Names the `https.request` shape the chat transport and its tests share.
 * When to use: The parameter of `setOpenRouterHttpsRequestForTests`, and the implementation behind `requestOpenRouterHttps`.
 * Expected outcome: An options object plus a response callback, returning the `ClientRequest`.
 * Exceptions: None.
 */
export type OpenRouterHttpsRequest = (
  options: RequestOptions,
  callback: (res: IncomingMessage) => void
) => ClientRequest;

/**
 * Production socket opener. Tests replace it.
 *
 * Purpose: Keeps `postChatViaHttps` on `https.request` while a test can record the options.
 * When to use: Only through `requestOpenRouterHttps` and `setOpenRouterHttpsRequestForTests`.
 * Expected outcome: `https.request` until a test passes an override. `null` restores `https.request`.
 * Exceptions: None.
 */
let openRouterHttpsRequest: OpenRouterHttpsRequest = nodeHttpsRequest as OpenRouterHttpsRequest;

/**
 * Opens the chat-completion socket, or the test override.
 *
 * Purpose: `postChatViaHttps` has one call site for the POST so a test can see the headers without a network.
 * When to use: The `https.request` call inside `postChatViaHttps`.
 * Expected outcome: Returns the `ClientRequest` from the current opener. Logs hostname, path, and method. Does not log headers or the API key.
 * Exceptions: The opener's own socket errors. This function does not catch them.
 */
export function requestOpenRouterHttps(
  options: RequestOptions,
  callback: (res: IncomingMessage) => void
): ClientRequest {
  logDebug('openRouter requestOpenRouterHttps', {
    hostname: options.hostname ?? null,
    path: options.path ?? null,
    method: options.method ?? null,
  });
  return openRouterHttpsRequest(options, callback);
}

/**
 * Replaces the socket opener used by `requestOpenRouterHttps`.
 *
 * Purpose: The attribution test records the chat POST options and returns a fake response.
 * When to use: That test, then `null` from `afterEach`.
 * Expected outcome: The next `requestOpenRouterHttps` uses `override`, or `https.request` when `override` is null.
 * Exceptions: None.
 */
export function setOpenRouterHttpsRequestForTests(override: OpenRouterHttpsRequest | null): void {
  logDebug('openRouter setOpenRouterHttpsRequestForTests', { enabled: override !== null });
  openRouterHttpsRequest = override ?? (nodeHttpsRequest as OpenRouterHttpsRequest);
}
```

In [`src/main/openRouter/openRouterChatTransport.ts`](src/main/openRouter/openRouterChatTransport.ts), replace this import:

```ts
import { request as httpsRequest } from 'node:https';
```

with these two imports:

```ts
import { openRouterChatRequestHeaders } from './openRouterAttributionHeaders';
import { requestOpenRouterHttps } from './openRouterHttpsRequest';
```

Replace the boilerplate comment immediately above `async function postChatViaHttps` with:

```ts
/**
 * Posts one chat completion over HTTPS and decodes the body.
 *
 * Purpose: One attempt of the OpenRouter chat call, including the socket timeout and gzip decoding.
 * When to use: The default attempt poster. Retries call it again.
 * Expected outcome: Request headers come from `openRouterChatRequestHeaders`. The promise resolves with status, response headers, and decoded body text.
 * Exceptions: Rejects on socket errors, abort, and body-decode failure.
 */
```

Inside `postChatViaHttps`, change `httpsRequest(` to `requestOpenRouterHttps(` and replace the `headers` object with `openRouterChatRequestHeaders(args.key)`. The options object is then:

```ts
{
  protocol: url.protocol,
  hostname: url.hostname,
  port: url.port || 443,
  path: `${url.pathname}${url.search}`,
  method: 'POST',
  headers: openRouterChatRequestHeaders(args.key),
}
```

Leave the response callback, the abort listener, `req.setTimeout`, `req.on`, `req.write`, and `req.end` as they are. Do not edit other comments in that file.

In [`src/main/openRouter/openRouterChatTransport.test.ts`](src/main/openRouter/openRouterChatTransport.test.ts), add these imports beside the existing ones:

```ts
import { EventEmitter } from 'node:events';
import type { ClientRequest, IncomingMessage } from 'node:http';
import {
  setOpenRouterHttpsRequestForTests,
  type OpenRouterHttpsRequest,
} from './openRouterHttpsRequest';
```

In the existing `afterEach`, call `setOpenRouterHttpsRequestForTests(null)` immediately after `setOpenRouterPostChatForTests(null)`.

Add this test inside the existing `describe`, after the other tests. It uses `it`, which this file already imports. Do not call `setOpenRouterPostChatForTests` in this test. The keys in this test are for testing.

```ts
it('sends attribution headers on the chat POST', async () => {
  delete process.env.AGENT_WARS_SIMULATE_MODEL_HANG;
  const seen: Array<{
    hostname?: string | null;
    path?: string | null;
    method?: string;
    headers?: unknown;
  }> = [];
  const fake: OpenRouterHttpsRequest = (options, callback) => {
    seen.push({
      hostname: options.hostname,
      path: typeof options.path === 'string' ? options.path : null,
      method: options.method,
      headers: options.headers,
    });
    const req = new EventEmitter();
    const end = (): void => {
      const res = new EventEmitter();
      queueMicrotask(() => {
        callback(
          Object.assign(res, {
            statusCode: 200,
            headers: {},
            setTimeout: () => res,
          }) as unknown as IncomingMessage
        );
        res.emit('end');
      });
    };
    return Object.assign(req, {
      destroy: () => req,
      setTimeout: () => req,
      write: () => true,
      end,
    }) as unknown as ClientRequest;
  };
  setOpenRouterHttpsRequestForTests(fake);
  const first = await resolveOpenRouterChatTransport()({
    key: 'test-openrouter-key',
    body: { max_tokens: 128 },
    requestLabel: 'test',
  });
  const second = await resolveOpenRouterChatTransport()({
    key: 'test-openrouter-key-b',
    body: { max_tokens: 128 },
    requestLabel: 'test',
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(seen.length, 2);
  assert.equal(seen[0].hostname, 'openrouter.ai');
  assert.equal(seen[0].path, '/api/v1/chat/completions');
  assert.equal(seen[0].method, 'POST');
  assert.deepEqual(seen[1].hostname, seen[0].hostname);
  assert.deepEqual(seen[1].path, seen[0].path);
  assert.deepEqual(seen[1].method, seen[0].method);
  assert.deepEqual(seen[0].headers, {
    'Content-Type': 'application/json',
    Authorization: 'Bearer test-openrouter-key',
    'Accept-Encoding': 'gzip, deflate, br, identity',
    'HTTP-Referer': 'https://github.com/michael-kitchin/agent-wars',
    'X-OpenRouter-Title': 'Agent Wars',
    'X-OpenRouter-Categories': 'game',
  });
  assert.deepEqual(seen[1].headers, {
    'Content-Type': 'application/json',
    Authorization: 'Bearer test-openrouter-key-b',
    'Accept-Encoding': 'gzip, deflate, br, identity',
    'HTTP-Referer': 'https://github.com/michael-kitchin/agent-wars',
    'X-OpenRouter-Title': 'Agent Wars',
    'X-OpenRouter-Categories': 'game',
  });
});
```

`end` must call `callback` and then `emit('end')` on the response, in that order, on a microtask. That attaches the transport's listeners before `end`. The fake `setTimeout` must not start a real timer. This test should finish in a few seconds. If it is still running after about 10 seconds, the fake did not emit `end`. Fix the fake. Do not raise the transport timeout.

Verify, one command at a time:

```powershell
npm run build:main
node dist/main/openRouter/openRouterChatTransport.test.js
npx eslint src/main/openRouter/openRouterHttpsRequest.ts src/main/openRouter/openRouterChatTransport.ts src/main/openRouter/openRouterChatTransport.test.ts
```

Expected: each command exits 0. The previous transport tests still pass, and the new test records two requests with two bearer tokens and the same attribution headers. The transport file is still under 600 lines.

## Phase 4 — Security note and full gate

In [`SECURITY.md`](SECURITY.md), under “What the app does with your OpenRouter key”, keep the existing three bullets. After the bullet that says the key is sent only to OpenRouter, add:

```markdown
- Those same chat and model-list requests also send `HTTP-Referer: https://github.com/michael-kitchin/agent-wars`, `X-OpenRouter-Title: Agent Wars`, and `X-OpenRouter-Categories: game`. They do not send `X-OpenRouter-App-Visibility`, so OpenRouter treats the app as public. The key stays in the `Authorization` header only.
```

Search `src` for `openrouter.ai`. The only request sites are the models `fetch` and the chat socket. The models call uses `openRouterModelsRequestHeaders`. The chat call uses `openRouterChatRequestHeaders` inside `postChatViaHttps`. Search the repo’s markdown, outside `.spec/` and `doc/release-notes/`, for `HTTP-Referer`. The new bullet in `SECURITY.md` should be the only hit. Do not edit release notes. Those notes already say the key is sent only to OpenRouter, which is still true.

Verify:

```powershell
npm test
```

Expected: exit 0. This rebuilds native modules, compiles, lints, checks names, runs every main-process test, and checks third-party notices.

## Done when

- Both request sites send the three headers and do not send `X-OpenRouter-App-Visibility` or `X-Title`.
- Two different keys produce two different `Authorization` bearers. The attribution headers stay the same.
- A blank or whitespace model-list key still does not call `fetch`.
- The chat POST still uses the https wrapper, with the same timeout, abort, and body decoding as before.
- `SECURITY.md` names the three headers and the public-app choice.
- `npm test` exits 0.
- Nothing is committed.
