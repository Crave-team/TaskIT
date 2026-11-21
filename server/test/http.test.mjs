import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

import { resetDatabase, db } from '../../src/api/repo.js';
import { SessionModel } from '../src/db/models.js';
import { createApp } from '../src/http/app.js';
import { serverConfig } from '../src/config.js';

/**
 * HTTP-layer tests (run with `--import ./test/setup-http.mjs`, which boots the real server): session tokens, CSRF,
 * injection attempts, file download security, session lifetime, rate limiting, error shapes.
 * Each `Browser` holds its own session token, i.e. a different person in a different browser tab.
 */
const { baseUrl } = globalThis.__taskitTest;
const PW = 'password123';

class Browser {
  token = '';

  async raw(method, path, { body, headers = {}, form, csrf = true, token = this.token, json = true } = {}) {
    const h = { ...(csrf ? { 'X-Requested-With': 'taskit' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers };
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = typeof body === 'string' ? body : JSON.stringify(body); }
    const res = await fetch(baseUrl + path, { method, headers: h, body: payload });
    const text = await res.text();
    const parsed = json && text ? safeJson(text) : null;
    if (parsed?.sessionToken) this.token = parsed.sessionToken;
    if (path === '/auth/logout' && res.ok) this.token = '';
    return { res, status: res.status, text, json: parsed, sessionToken: parsed?.sessionToken };
  }

  call(method, path, body, opts) { return this.raw(method, path, { body, ...opts }); }
  register(name, email) { return this.call('POST', '/auth/register', { name, email, password: PW }); }
  login(email, password = PW) { return this.call('POST', '/auth/login', { email, password }); }
  me() { return this.call('GET', '/bootstrap').then((r) => r.json.data.me); }
}
const safeJson = (t) => { try { return JSON.parse(t); } catch { return null; } };
const person = async (name, email) => { const b = new Browser(); await b.register(name, email); await b.login(email); return b; };

beforeEach(() => resetDatabase());

test('health, security headers, and no framework fingerprint', async () => {
  const { res, json } = await new Browser().call('GET', '/health');
  assert.equal(json.data.status, 'ok');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('every write needs the custom header (CSRF defence); reads do not', async () => {
  const b = new Browser();
  const blocked = await b.raw('POST', '/auth/register', { body: { name: 'A', email: 'a@x.com', password: PW }, csrf: false });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.json.error.code, 'FORBIDDEN');
  assert.equal((await b.raw('GET', '/bootstrap', { csrf: false })).status, 200);
});

test('the session token goes to the tab once, in no cookie, and the database never stores it raw', async () => {
  const b = new Browser();
  await b.register('Maya', 'maya@x.com');
  const login = await b.login('maya@x.com');
  assert.match(login.sessionToken, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(login.res.headers.getSetCookie().join('; '), /taskit_session=[0-9a-f]{16}/, 'no live cookie is issued');
  assert.equal(login.res.headers.get('cache-control'), 'no-store');
  assert.equal(login.json.data.email, 'maya@x.com');
  assert.ok(!('passwordHash' in login.json.data));
  const token = login.sessionToken;
  assert.ok(!JSON.stringify(login.json.data).includes(token), 'the token is not part of the user record');
  assert.equal(await SessionModel.findById(token), null, 'the database never holds the raw token');
  assert.ok(await SessionModel.findById(createHash('sha256').update(token).digest('hex')), 'only its SHA-256 hash');
  assert.equal((await b.me()).email, 'maya@x.com');
});

test('errors are JSON with a stable shape; unknown routes and bad bodies are handled', async () => {
  const b = await person('Maya', 'maya@x.com');
  const wrong = await new Browser().login('maya@x.com', 'nope-nope');
  assert.deepEqual(Object.keys(wrong.json.error).sort(), ['code', 'message', 'status']);
  assert.equal(wrong.status, 401);
  assert.equal((await b.call('GET', '/definitely/not/here')).status, 404);
  assert.equal((await b.raw('POST', '/tasks', { body: '{not json' })).status, 400);
  const huge = await b.call('POST', '/tasks', { input: { title: 'x'.repeat(200 * 1024) } });
  assert.equal(huge.status, 413);
  assert.ok(!/at .*\.js/.test(wrong.text), 'no stack traces leak');
});

test('unauthenticated callers are refused with 401 everywhere that needs a person', async () => {
  const anon = new Browser();
  for (const [m, p] of [['GET', '/me'], ['POST', '/tasks'], ['DELETE', '/tasks/' + '0'.repeat(24)], ['GET', '/admin/activity'], ['POST', '/teams']]) {
    const r = await anon.call(m, p, m === 'GET' ? undefined : {});
    assert.equal(r.status, 401, `${m} ${p}`);
  }
  assert.deepEqual((await anon.call('GET', '/bootstrap')).json.data, { me: null });
});

test('query-operator injection is rejected before it can reach the database', async () => {
  const victim = await person('Victim', 'victim@x.com');
  void victim;
  const attacker = new Browser();
  // classic "log in as anyone" attempt
  const bypass = await attacker.call('POST', '/auth/login', { email: { $ne: null }, password: { $ne: null } });
  assert.equal(bypass.status, 400);
  assert.equal(await attacker.me(), null);
  assert.equal((await attacker.call('POST', '/auth/register', { name: 'x', email: 'e@x.com', password: PW, $where: '1==1' })).status, 400);
  const me = await person('Me', 'me@x.com');
  assert.equal((await me.call('POST', '/tasks', { input: { title: 't', dueDate: '2026-10-15', projectId: { $ne: null } } })).status, 400);
  assert.equal((await me.call('GET', '/activity/mine?$ne=1')).status, 400);
  assert.equal((await me.call('POST', '/teams/join', { code: { $gt: '' } })).status, 400);
  assert.equal((await me.call('PATCH', '/me', { 'prefs.mentions': false })).status, 400);
});

test('privacy over HTTP: one person cannot read or change another\'s data', async () => {
  const maya = await person('Maya', 'maya@x.com');
  const ben = await person('Ben', 'ben@x.com');
  const project = (await maya.call('POST', '/projects', { name: 'Private' })).json.data;
  const task = (await maya.call('POST', '/tasks', { input: { title: 'Secret', dueDate: '2026-10-15', projectId: project.id } })).json.data;
  const seen = (await ben.call('GET', '/bootstrap')).json.data;
  assert.equal(seen.tasks.length, 0);
  assert.ok(!JSON.stringify(seen).includes('Secret'));
  assert.equal((await ben.call('DELETE', `/tasks/${task.id}`)).status, 403);
  assert.equal((await ben.call('POST', `/tasks/${task.id}/subtasks`, { title: 'hax' })).status, 403);
  assert.equal((await maya.call('DELETE', `/tasks/${task.id}`)).status, 200);
});

function upload(browser, name, content, type) {
  const form = new FormData();
  form.append('file', new Blob([content], { type }), name);
  return browser.raw('POST', '/files', { form });
}

test('files: stored by id, sanitised names, downloads are locked down and permission-checked', async () => {
  const maya = await person('Maya', 'maya@x.com');
  const ben = await person('Ben', 'ben@x.com');

  const evil = (await upload(maya, '../../etc/<b>evil</b>.html', '<script>alert(1)</script>', 'text/html')).json.data;
  assert.ok(!evil.name.includes('/') && !evil.name.includes('<'), `unsafe name kept: ${evil.name}`);
  assert.equal(evil.url, `/api/files/${evil.id}/content`);
  const onDisk = fs.readdirSync(process.env.UPLOAD_DIR);
  assert.ok(onDisk.includes(evil.id), 'bytes are stored under the id, not the client-supplied name');

  const dl = await maya.call('GET', `/files/${evil.id}/content`, undefined, { json: false });
  assert.equal(dl.status, 200);
  assert.match(dl.res.headers.get('content-disposition'), /^attachment/);
  assert.equal(dl.res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(dl.res.headers.get('content-type'), 'application/octet-stream', 'html is never served as html');
  assert.match(dl.res.headers.get('content-security-policy'), /sandbox/);
  assert.equal(dl.text, '<script>alert(1)</script>');

  const png = (await upload(maya, 'pic.png', new Uint8Array([137, 80, 78, 71]), 'image/png')).json.data;
  const img = await maya.call('GET', `/files/${png.id}/content`, undefined, { json: false });
  assert.match(img.res.headers.get('content-disposition'), /^inline/);
  assert.equal(img.res.headers.get('content-type'), 'image/png');

  // someone else cannot download it (and cannot tell it exists)
  assert.equal((await ben.call('GET', `/files/${png.id}/content`)).status, 404);
  assert.equal((await new Browser().call('GET', `/files/${png.id}/content`)).status, 401);
  // ...and cannot attach Maya's file to his own task
  const p = (await ben.call('POST', '/projects', { name: 'B' })).json.data;
  const t = await ben.call('POST', '/tasks', { input: { title: 'x', dueDate: '2026-10-15', projectId: p.id, attachments: [{ fileId: png.id }] } });
  assert.equal(t.status, 400);

  // limits and malformed uploads
  assert.equal((await upload(maya, 'big.bin', new Uint8Array(11 * 1024 * 1024), 'application/octet-stream')).status, 400);
  assert.equal((await maya.call('POST', '/files', { not: 'multipart' })).status, 400);
  // deleting frees the bytes
  assert.equal((await maya.call('DELETE', `/files/${evil.id}`)).status, 200);
  assert.ok(!fs.readdirSync(process.env.UPLOAD_DIR).includes(evil.id));
});

test('a file attached to a team task is readable by the team admin, not by an outsider', async () => {
  const maya = await person('Maya', 'maya@x.com'); // team owner
  const ben = await person('Ben', 'ben@x.com'); // member
  const cleo = await person('Cleo', 'cleo@x.com'); // outsider
  const team = (await maya.call('POST', '/teams', { name: 'Crew' })).json.data;
  const project = (await maya.call('POST', '/projects', { name: 'P', groupId: team.id })).json.data;
  await ben.call('POST', '/teams/join', { code: team.inviteCode });
  const request = (await maya.call('GET', '/bootstrap')).json.data.joinRequests[0];
  await maya.call('POST', `/join-requests/${request.id}/approve`);
  const benId = (await ben.me()).id;
  const task = (await maya.call('POST', '/tasks', { input: { title: 'Do it', dueDate: '2026-10-20', projectId: project.id, assigneeId: benId } })).json.data;
  const file = (await upload(ben, 'work.txt', 'my work', 'text/plain')).json.data;
  assert.equal((await ben.call('POST', `/tasks/${task.id}/turn-in`, { files: [{ fileId: file.id }], note: 'done' })).status, 200);
  assert.equal((await maya.call('GET', `/files/${file.id}/content`, undefined, { json: false })).text, 'my work', 'the team admin can read the submission');
  assert.equal((await cleo.call('GET', `/files/${file.id}/content`)).status, 404, 'an outsider cannot');
});

test('sessions end for real: logout, ban, and idle time all invalidate the token server-side', async () => {
  const maya = await person('Maya', 'maya@x.com');
  const stale = maya.token;
  await maya.call('POST', '/auth/logout');
  assert.equal(await new Browser().call('GET', '/bootstrap', undefined, { token: stale }).then((r) => r.json.data.me), null, 'a copied token is dead after logout');

  // ban
  const admin = new Browser();
  await admin.call('POST', '/auth/register', { name: 'Boss', email: 'boss@x.com', password: PW, accountRole: 'admin', inviteCode: 'ADMIN-2026' });
  await admin.login('boss@x.com');
  const ben = await person('Ben', 'ben@x.com');
  const benToken = ben.token;
  const benId = (await ben.me()).id;
  await admin.call('PUT', `/admin/users/${benId}/status`, { status: 'suspended' });
  assert.equal(await new Browser().call('GET', '/bootstrap', undefined, { token: benToken }).then((r) => r.json.data.me), null);

  // idle timeout from System Settings
  const cleo = await person('Cleo', 'cleo@x.com');
  assert.equal((await admin.call('PATCH', '/admin/settings', { sessionTimeout: '5' })).status, 200);
  await SessionModel.updateMany({}, { $set: { lastSeenAt: new Date(Date.now() - 10 * 60 * 1000) } });
  assert.equal(await cleo.me(), null, 'idle longer than the configured timeout');
});

test('CORS: other origins get no permission; the configured one would', async () => {
  const r = await new Browser().raw('GET', '/health', { headers: { Origin: 'https://evil.example' } });
  assert.equal(r.res.headers.get('access-control-allow-origin'), null);
});

test('brute-force protection: repeated sign-in attempts are rate limited', async () => {
  const limited = createApp({ config: { ...serverConfig, rateLimit: true, staticDir: '/nonexistent' } });
  const server = await new Promise((resolve) => { const s = limited.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/auth/login`;
    const statuses = [];
    for (let i = 0; i < 35; i += 1) {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'taskit' }, body: JSON.stringify({ email: 'x@x.com', password: 'wrong-pass' }) });
      statuses.push(res.status);
    }
    assert.ok(statuses.slice(0, 30).every((s) => s === 401), 'normal attempts are answered');
    assert.ok(statuses.slice(30).every((s) => s === 429), 'then it stops answering');
  } finally {
    await new Promise((r) => server.close(r));
  }
});

after(() => { void db; });
