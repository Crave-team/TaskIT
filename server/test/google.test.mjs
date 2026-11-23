import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/http/app.js';
import { serverConfig } from '../src/config.js';
import { createGoogleVerifier } from '../src/http/google.js';
import { setGoogleVerifier } from '../../src/api/google.js';
import { config as apiConfig } from '../../src/api/config.js';
import { resetDatabase } from '../../src/api/repo.js';

/**
 * Google sign-in at the server boundary. Needs NO database or Google account: the app runs on the in-memory
 * repository, and Google's library is replaced by a fake that behaves like `OAuth2Client.verifyIdToken`
 * (it checks the audience and refuses tokens that are not "valid-*"). Run with `npm run test:google`.
 */
const CLIENT_ID = '123-test.apps.googleusercontent.com';

/** A stand-in for google-auth-library's OAuth2Client. */
const fakeClient = {
  async verifyIdToken({ idToken, audience }) {
    if (audience !== CLIENT_ID) throw new Error('Wrong audience');
    if (!idToken.startsWith('valid-')) throw new Error('Invalid token signature');
    const identity = JSON.parse(Buffer.from(idToken.slice('valid-'.length), 'base64url').toString());
    return { getPayload: () => ({ sub: identity.sub, email: identity.email, email_verified: identity.verified, name: identity.name }) };
  },
};
const token = (identity) => `valid-${Buffer.from(JSON.stringify({ sub: 'g-1', email: 'maya@gmail.com', verified: true, name: 'Maya Lee', ...identity })).toString('base64url')}`;

const baseConfig = { ...serverConfig, isTest: true, rateLimit: false, cookieSecure: false, staticDir: '/nonexistent', clientOrigin: '' };
const servers = [];
async function serve(config) {
  const app = createApp({ config: { ...baseConfig, ...config }, logger: { warn() {}, error() {} } });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}/api`;
}
const api = await serve({ googleClientId: CLIENT_ID });

class Browser {
  token = '';
  async call(method, path, body, { csrf = true, base = api } = {}) {
    const headers = { ...(csrf ? { 'X-Requested-With': 'taskit' } : {}), ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (json?.sessionToken) this.token = json.sessionToken;
    return { res, status: res.status, sessionToken: json?.sessionToken, json };
  }
  google(identity, extra = {}) { return this.call('POST', '/auth/google', { credential: token(identity), expectedRole: 'user', ...extra }); }
  me() { return this.call('GET', '/bootstrap').then((r) => r.json.data.me); }
}

beforeEach(async () => {
  apiConfig.GOOGLE_CLIENT_ID = CLIENT_ID;
  setGoogleVerifier(createGoogleVerifier(CLIENT_ID, fakeClient));
  await resetDatabase();
});
after(async () => {
  apiConfig.GOOGLE_CLIENT_ID = '';
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
});

// ---------------------------------------------------------------- the verifier wrapper

test('verifier: maps a valid token to an identity and treats email_verified strictly', async () => {
  const verify = createGoogleVerifier(CLIENT_ID, fakeClient);
  assert.deepEqual(await verify(token({})), { sub: 'g-1', email: 'maya@gmail.com', emailVerified: true, name: 'Maya Lee' });
  assert.equal((await verify(token({ verified: false }))).emailVerified, false);
  assert.equal((await verify(token({ verified: 'true' }))).emailVerified, false, 'only a real boolean true counts');
  assert.equal((await verify(token({ verified: undefined }))).emailVerified, false);
});

test('verifier: refuses bad tokens, wrong audience, and tokens with no identity', async () => {
  await assert.rejects(createGoogleVerifier(CLIENT_ID, fakeClient)('forged-token'));
  await assert.rejects(createGoogleVerifier('someone-elses-client-id', fakeClient)(token({})), /audience/i);
  await assert.rejects(createGoogleVerifier(CLIENT_ID, fakeClient)(token({ email: '' })), /no identity/);
  await assert.rejects(createGoogleVerifier(CLIENT_ID, fakeClient)(token({ sub: '' })), /no identity/);
  assert.throws(() => createGoogleVerifier(''), /client id/);
});

// ---------------------------------------------------------------- over HTTP

test('GET /auth/google/config is public and tells the browser which client id to use', async () => {
  const { status, json } = await new Browser().call('GET', '/auth/google/config');
  assert.equal(status, 200);
  assert.deepEqual(json, { data: { enabled: true, clientId: CLIENT_ID } });
  apiConfig.GOOGLE_CLIENT_ID = '';
  assert.deepEqual((await new Browser().call('GET', '/auth/google/config')).json, { data: { enabled: false, clientId: null } });
});

test('POST /auth/google signs in with a per-tab session token (no cookie) and never leaks credentials', async () => {
  const b = new Browser();
  const { res, status, json, sessionToken } = await b.google({});
  assert.equal(status, 200);
  assert.match(sessionToken, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(res.headers.getSetCookie().join('; '), /taskit_session=[0-9a-f]{16}/, 'the token is not put in a shared cookie');
  assert.equal(res.headers.get('cache-control'), 'no-store', 'a response carrying a token is never cached');
  assert.equal(json.data.email, 'maya@gmail.com');
  assert.equal('passwordHash' in json.data, false);
  assert.equal('googleId' in json.data, false);
  assert.equal((await b.me()).email, 'maya@gmail.com');
});

test('POST /auth/google requires the CSRF header and rejects forged tokens, wrong audience and operator keys', async () => {
  const b = new Browser();
  assert.equal((await b.call('POST', '/auth/google', { credential: token({}), expectedRole: 'user' }, { csrf: false })).status, 403);

  const forged = await b.call('POST', '/auth/google', { credential: 'forged-token', expectedRole: 'user' });
  assert.equal(forged.status, 401);
  assert.equal(forged.json.error.code, 'BAD_GOOGLE_TOKEN');
  assert.equal(forged.sessionToken, undefined, 'a failed sign-in hands out no token');

  setGoogleVerifier(createGoogleVerifier('another-app.apps.googleusercontent.com', fakeClient));
  assert.equal((await b.google({})).status, 401, 'a token meant for another app is refused');

  assert.equal((await b.call('POST', '/auth/google', { credential: { $ne: null }, expectedRole: 'user' })).status, 400);
  assert.equal((await b.me()), null);
});

test('admin portal over HTTP: invite code needed to create, never to promote, and the session is an admin session', async () => {
  const admin = { sub: 'g-root', email: 'root@gmail.com', name: 'Root' };
  assert.equal((await new Browser().google(admin, { expectedRole: 'admin' })).json.error.code, 'NO_ACCOUNT');
  assert.equal((await new Browser().google(admin, { expectedRole: 'admin', inviteCode: 'wrong' })).status, 403);

  const b = new Browser();
  const created = await b.google(admin, { expectedRole: 'admin', inviteCode: apiConfig.ADMIN_INVITE_CODE });
  assert.equal(created.status, 200);
  assert.equal((await b.me()).accountRole, 'admin');
  // Admin-only endpoints now work for this session...
  assert.equal((await b.call('GET', '/admin/activity')).status, 200);

  // ...but a member signing in through the same portal is never promoted.
  const member = new Browser();
  await member.google({}, { expectedRole: 'user' });
  const crossing = await new Browser().google({}, { expectedRole: 'admin', inviteCode: apiConfig.ADMIN_INVITE_CODE });
  assert.equal(crossing.status, 403);
  assert.equal(crossing.json.error.code, 'WRONG_PORTAL');
  assert.equal((await member.call('GET', '/admin/activity')).status, 403);
});

test('logging out ends a Google session', async () => {
  const b = new Browser();
  await b.google({});
  await b.call('POST', '/auth/logout');
  assert.equal(await b.me(), null);
});

test('the CSP and opener policy only open up for Google when it is configured', async () => {
  const on = (await fetch(`${api}/health`)).headers;
  assert.match(on.get('content-security-policy'), /script-src 'self' https:\/\/accounts\.google\.com\/gsi\/client/);
  assert.match(on.get('content-security-policy'), /frame-src 'self' https:\/\/accounts\.google\.com\/gsi\//);
  assert.match(on.get('content-security-policy'), /connect-src 'self' https:\/\/accounts\.google\.com\/gsi\//);
  assert.equal(on.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
  assert.match(on.get('content-security-policy'), /frame-src [^;]*\bblob:/, 'PDF previews open from a blob: URL');

  const offApi = await serve({ googleClientId: '' });
  const off = (await fetch(`${offApi}/health`)).headers;
  assert.doesNotMatch(off.get('content-security-policy'), /accounts\.google\.com/);
  assert.match(off.get('content-security-policy'), /frame-src 'self' blob:(;|$)/);
  assert.equal(off.get('cross-origin-opener-policy'), 'same-origin');
});
