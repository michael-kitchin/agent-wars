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
  const seen: Array<{ url: string; headers: RequestInit['headers'] }> = [];
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
