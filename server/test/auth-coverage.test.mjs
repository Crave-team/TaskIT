import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/http/app.js';
import { serverConfig } from '../src/config.js';
import { createGoogleVerifier } from '../src/http/google.js';
import { setGoogleVerifier } from '../../src/api/google.js';
import { config as apiConfig } from '../../src/api/config.js';
import { resetDatabase } from '../../src/api/repo.js';
import { routes } from '../../src/api/routes.js';

/**
 * "Authentication on everything": every endpoint except a short, explicit allow-list needs a signed-in session,
 * and it makes no difference HOW the person signed in (email + password or "Continue with Google"): both create
 * the same server-side session. Runs against the real Express app on the in-memory repository, so it needs no
 * database and no Google account. `npm run test:auth`.
 */
const CLIENT_ID = 'auth-coverage.apps.googleusercontent.com';
const ADMIN_CODE = apiConfig.ADMIN_INVITE_CODE;

/** Routes that are public ON PURPOSE. Adding a route here is a security decision; the test below makes it explicit. */
const PUBLIC = [
  'auth.getEmailCodeConfig', 'auth.getGoogleConfig', 'auth.login', 'auth.loginWithGoogle', 'auth.register',
  'auth.requestPasswordReset', 'auth.resendEmailCode', 'auth.resetPassword', 'auth.verifyEmailCode', 'bootstrap',
];

const fakeClient = {
  async verifyIdToken({ idToken, audience }) {
    if (audience !== CLIENT_ID || !idToken.startsWith('valid-')) throw new Error('rejected');
    const id = JSON.parse(Buffer.from(idToken.slice(6), 'base64url').toString());
    return { getPayload: () => ({ sub: id.sub, email: id.email, email_verified: true, name: id.name }) };
  },
};
const token = (identity) => `valid-${Buffer.from(JSON.stringify(identity)).toString('base64url')}`;

const config = { ...serverConfig, isTest: false, rateLimit: false, cookieSecure: false, googleClientId: CLIENT_ID, staticDir: '/nonexistent', clientOrigin: '' };
const app = createApp({ config, logger: { warn() {}, error() {} } });
const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const base = `http://127.0.0.1:${server.address().port}/api`;

class Browser {
  token = '';
  async call(method, path, body, headers = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { 'X-Requested-With': 'taskit', 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...headers },
      body: body === undefined || method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (json?.sessionToken) this.token = json.sessionToken;
    return { status: res.status, json };
  }
  register(name, email, extra = {}) { return this.call('POST', '/auth/register', { name, email, password: 'password123', ...extra }); }
  login(email, expectedRole = 'user') { return this.call('POST', '/auth/login', { email, password: 'password123', expectedRole }); }
  google(identity, expectedRole = 'user', inviteCode) { return this.call('POST', '/auth/google', { credential: token(identity), expectedRole, inviteCode }); }
  me() { return this.call('GET', '/bootstrap').then((r) => r.json.data.me); }
}

/** "/tasks/:id/items/:itemId" -> "/tasks/000...1/items/000...1" */
const fill = (path) => path.replace(/:[A-Za-z]+/g, '000000000000000000000001');

beforeEach(async () => {
  apiConfig.GOOGLE_CLIENT_ID = CLIENT_ID;
  setGoogleVerifier(createGoogleVerifier(CLIENT_ID, fakeClient));
  await resetDatabase();
});
after(async () => {
  apiConfig.GOOGLE_CLIENT_ID = '';
  await new Promise((r) => server.close(r));
});

test('the public allow-list is exactly what we intend, nothing else is public', () => {
  const actual = Object.entries(routes).filter(([, spec]) => spec.public).map(([name]) => name).sort();
  assert.deepEqual(actual, PUBLIC);
});

test('every protected route refuses a request with no session (401), with or without a forged token', async () => {
  // Logging out with no session is a harmless no-op (checked in its own test below), so it is the one exception.
  const protectedRoutes = Object.entries(routes).filter(([name]) => !PUBLIC.includes(name) && name !== 'auth.logout');
  assert.ok(protectedRoutes.length > 60, 'the sweep should cover the whole API');
  const failures = [];
  for (const [name, spec] of protectedRoutes) {
    for (const forged of ['', 'f'.repeat(64)]) {
      const b = new Browser();
      b.token = forged;
      const { status } = await b.call(spec.method, fill(spec.path), {});
      if (status !== 401) failures.push(`${name} ${spec.method} ${spec.path} (${forged ? 'forged token' : 'no token'}) -> ${status}`);
    }
  }
  assert.deepEqual(failures, [], `routes that did not answer 401:\n${failures.join('\n')}`);
});

test('logging out with no session is a harmless no-op that grants nothing', async () => {
  const b = new Browser();
  assert.equal((await b.call('POST', '/auth/logout')).status, 200);
  assert.equal(await b.me(), null);
});

test('an anonymous upload is refused (401) BEFORE the file is read, even an oversized one', async () => {
  // If the server read the file first, this oversized file would be answered with a size error instead of 401.
  const tooBig = new Blob([new Uint8Array(apiConfig.MAX_FILE_BYTES + 1024)]);
  const form = new FormData();
  form.append('file', tooBig, 'huge.bin');
  const res = await fetch(`${base}/files`, { method: 'POST', headers: { 'X-Requested-With': 'taskit' }, body: form });
  assert.equal(res.status, 401);
});

test('the file download route is protected too', async () => {
  assert.equal((await new Browser().call('GET', '/files/000000000000000000000001/content')).status, 401);
});

test('state-changing requests also need the CSRF header, even for signed-in people', async () => {
  const b = new Browser();
  await b.register('Maya', 'maya@gmail.com');
  await b.login('maya@gmail.com');
  const res = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${b.token}` } });
  assert.equal(res.status, 403);
  assert.ok(await b.me(), 'the session survived the refused request');
});

test('manual and Google sign-in create equivalent sessions: both open protected data, both end on logout', async () => {
  const manual = new Browser();
  await manual.register('Maya', 'maya@gmail.com');
  await manual.login('maya@gmail.com');
  const viaGoogle = new Browser();
  assert.equal((await viaGoogle.google({ sub: 'g-ben', email: 'ben@gmail.com', name: 'Ben' })).status, 200);

  for (const [label, who] of [['email+password', manual], ['Google', viaGoogle]]) {
    assert.equal((await who.call('GET', '/me')).status, 200, `${label}: /me`);
    assert.ok(await who.me(), `${label}: bootstrap knows who they are`);
    assert.equal((await who.call('GET', '/activity/mine')).status, 200, `${label}: own activity list`);
    assert.equal((await who.call('GET', '/settings')).status, 200, `${label}: settings`);
    await who.call('POST', '/auth/logout');
    assert.equal((await who.call('GET', '/me')).status, 401, `${label}: logged out`);
  }
});

test('a session cannot be reused after sign-out, whichever way it began', async () => {
  const b = new Browser();
  await b.google({ sub: 'g-1', email: 'maya@gmail.com', name: 'Maya' });
  const stolen = b.token;
  await b.call('POST', '/auth/logout');
  const replay = new Browser();
  replay.token = stolen;
  assert.equal((await replay.call('GET', '/me')).status, 401);
});

test('admin routes: refused for members (however they signed in), allowed for admins (however they signed in)', async () => {
  const adminRoutes = Object.entries(routes).filter(([, spec]) => spec.path.startsWith('/admin/'));
  assert.ok(adminRoutes.length >= 3, 'there are admin-only routes to check');

  const members = [];
  const manualMember = new Browser(); await manualMember.register('Maya', 'maya@gmail.com'); await manualMember.login('maya@gmail.com'); members.push(['manual member', manualMember]);
  const googleMember = new Browser(); await googleMember.google({ sub: 'g-ben', email: 'ben@gmail.com', name: 'Ben' }); members.push(['Google member', googleMember]);
  for (const [label, who] of members) {
    for (const [name, spec] of adminRoutes) {
      const { status } = await who.call(spec.method, fill(spec.path), { accountRole: 'admin', status: 'active' });
      assert.equal(status, 403, `${label} must not use ${name}`);
    }
  }

  const manualAdmin = new Browser();
  await manualAdmin.register('Root', 'root@gmail.com', { accountRole: 'admin', inviteCode: ADMIN_CODE });
  await manualAdmin.login('root@gmail.com', 'admin');
  const googleAdmin = new Browser();
  assert.equal((await googleAdmin.google({ sub: 'g-root', email: 'admin2@gmail.com', name: 'Admin Two' }, 'admin', ADMIN_CODE)).status, 200);
  for (const [label, who] of [['manual admin', manualAdmin], ['Google admin', googleAdmin]]) {
    const { status } = await who.call('GET', '/admin/users');
    assert.notEqual(status, 401, `${label} is signed in`);
    assert.notEqual(status, 403, `${label} is allowed on admin routes`);
  }
});

test('the test-only reset endpoint does not exist outside test mode', async () => {
  assert.equal((await new Browser().call('POST', '/test/reset', {})).status, 404);
});

// ---- one browser, several tabs: each tab is its own session (the token lives in that tab's sessionStorage) ------------

test('two accounts signed in at the same time stay separate: a later sign-in never changes who an earlier tab is', async () => {
  const memberTab = new Browser();
  await memberTab.register('Maya', 'maya@gmail.com');
  await memberTab.login('maya@gmail.com');

  const adminTab = new Browser(); // a second tab of the same browser
  await adminTab.register('Root', 'root@gmail.com', { accountRole: 'admin', inviteCode: ADMIN_CODE });
  await adminTab.login('root@gmail.com', 'admin');

  assert.equal((await memberTab.me()).email, 'maya@gmail.com', 'the member tab is still the member');
  assert.equal((await memberTab.me()).accountRole, 'user');
  assert.equal((await adminTab.me()).email, 'root@gmail.com');
  assert.equal((await adminTab.me()).accountRole, 'admin');
  assert.equal((await memberTab.call('GET', '/admin/activity')).status, 403, 'the member tab gained no admin rights');
  assert.equal((await adminTab.call('GET', '/admin/activity')).status, 200);

  // Signing one tab out ends only that tab's session.
  await adminTab.call('POST', '/auth/logout');
  assert.equal(await adminTab.me(), null);
  assert.equal((await memberTab.me()).email, 'maya@gmail.com', 'the other tab is untouched');
});

test('the old shared cookie is no longer an identity, and sign-in never puts the token in one', async () => {
  const b = new Browser();
  await b.register('Maya', 'maya@gmail.com');
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'X-Requested-With': 'taskit', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'maya@gmail.com', password: 'password123', expectedRole: 'user' }),
  });
  const { sessionToken } = await res.json();
  assert.match(sessionToken, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(res.headers.getSetCookie().join('; '), /taskit_session=[0-9a-f]{16}/, 'no live cookie is issued');

  // A tab with no token of its own must not inherit someone else's identity from a cookie.
  const viaCookie = await fetch(`${base}/me`, { headers: { Cookie: `taskit_session=${sessionToken}` } });
  assert.equal(viaCookie.status, 401);
  const viaHeader = await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${sessionToken}` } });
  assert.equal(viaHeader.status, 200);
});

test('a malformed Authorization header is treated as no session', async () => {
  const b = new Browser();
  for (const header of ['Bearer', 'Bearer short', 'Basic abcdefabcdefabcdefabcdefabcdefabcdef', `Bearer ${'a'.repeat(500)}`]) {
    assert.equal((await b.call('GET', '/me', undefined, { Authorization: header })).status, 401, header.slice(0, 20));
  }
});
