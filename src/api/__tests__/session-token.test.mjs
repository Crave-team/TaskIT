import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { configureHttp, httpApi } from '../http.js';
import { getSessionToken, setSessionToken, onSessionChange } from '../clientSession.js';
import { needsAuth, resolveFileUrl } from '../protectedUrl.js';

/**
 * The browser tab's session token: kept by the HTTP client, sent as `Authorization: Bearer`, and forgotten exactly when
 * the server says the session is over. A scripted `fetch` stands in for the server, so no database is needed.
 */
const TOKEN_A = 'a'.repeat(64);
const TOKEN_B = 'b'.repeat(64);

let calls;
let reply;
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });

beforeEach(() => {
  setSessionToken(null);
  calls = [];
  reply = () => json(200, { data: null });
  configureHttp({
    baseUrl: 'http://test/api',
    fetchFn: async (url, init) => { calls.push({ url, init }); return reply(url, init); },
  });
});

test('sign-in stores the token from the response and every later request sends it as a Bearer header', async () => {
  reply = () => json(200, { data: { id: 'u1' }, sessionToken: TOKEN_A });
  await httpApi.auth.login({ email: 'maya@x.com', password: 'password123' });
  assert.equal(getSessionToken(), TOKEN_A);

  reply = () => json(200, { data: { me: { id: 'u1' } } });
  await httpApi.bootstrap({});
  assert.equal(calls.at(-1).init.headers.Authorization, `Bearer ${TOKEN_A}`);
  assert.equal(calls.at(-1).init.credentials, 'omit', 'no cookies are involved');
});

test('a request made before sign-in carries no Authorization header', async () => {
  await httpApi.auth.getGoogleConfig();
  assert.equal(calls.at(-1).init.headers.Authorization, undefined);
});

test('a second sign-in in the same tab replaces the token (a different tab is a different module state, see the browser test)', async () => {
  reply = () => json(200, { data: {}, sessionToken: TOKEN_A });
  await httpApi.auth.login({});
  reply = () => json(200, { data: {}, sessionToken: TOKEN_B });
  await httpApi.auth.login({});
  assert.equal(getSessionToken(), TOKEN_B);
});

test('logout forgets the token even when the request fails', async () => {
  setSessionToken(TOKEN_A);
  reply = () => json(500, { error: { code: 'ERROR', message: 'boom' } });
  await assert.rejects(httpApi.auth.logout());
  assert.equal(getSessionToken(), null);
});

test('an UNAUTHORIZED answer drops a dead token, but a wrong password does not touch a live one', async () => {
  setSessionToken(TOKEN_A);
  reply = () => json(401, { error: { code: 'BAD_PASSWORD', message: 'Incorrect password.' } });
  await assert.rejects(httpApi.auth.login({}));
  assert.equal(getSessionToken(), TOKEN_A);

  reply = () => json(401, { error: { code: 'UNAUTHORIZED', message: 'Please log in.' } });
  await assert.rejects(httpApi.auth.getMe());
  assert.equal(getSessionToken(), null);
});

test('a late UNAUTHORIZED for an old token does not wipe a newer sign-in', async () => {
  setSessionToken(TOKEN_A);
  reply = () => { setSessionToken(TOKEN_B); return json(401, { error: { code: 'UNAUTHORIZED', message: 'Please log in.' } }); };
  await assert.rejects(httpApi.auth.getMe());
  assert.equal(getSessionToken(), TOKEN_B);
});

test('bootstrap reporting nobody signed in drops the stale token, unless a newer sign-in happened meanwhile', async () => {
  setSessionToken(TOKEN_A);
  reply = () => json(200, { data: { me: null } });
  await httpApi.bootstrap({});
  assert.equal(getSessionToken(), null);

  setSessionToken(TOKEN_A);
  reply = () => { setSessionToken(TOKEN_B); return json(200, { data: { me: null } }); };
  await httpApi.bootstrap({});
  assert.equal(getSessionToken(), TOKEN_B);
});

test('subscribers hear about sign-in and sign-out, and an unchanged token is not a change', () => {
  const seen = [];
  const off = onSessionChange((t) => seen.push(t));
  setSessionToken(TOKEN_A);
  setSessionToken(TOKEN_A);
  setSessionToken(null);
  off();
  setSessionToken(TOKEN_B);
  assert.deepEqual(seen, [TOKEN_A, null]);
});

test('file URLs: only our own API paths get the token; other URLs pass through untouched', async () => {
  assert.equal(needsAuth('/api/files/000000000000000000000001/content'), true);
  for (const other of ['blob:http://x/1', 'data:image/png;base64,AAAA', 'https://evil.example/api/files/1', 'memory://files/1', null, undefined]) {
    assert.equal(needsAuth(other), false, String(other));
  }
  assert.equal(await resolveFileUrl('blob:http://x/1'), 'blob:http://x/1');
});
