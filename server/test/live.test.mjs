import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { createApp } from '../src/http/app.js';
import { createLiveHub } from '../src/http/live.js';
import { serverConfig } from '../src/config.js';
import { resetDatabase } from '../../src/api/repo.js';
import { createSseParser } from '../../src/api/liveStream.js';

/**
 * Live updates (Server-Sent Events). Part 1 tests the hub on its own with fake responses; part 2 runs the real Express
 * app on the in-memory repository (no database needed) and watches real streams. `npm run test:live`.
 */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check, ms = 1500) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (check()) return true; await wait(10); }
  return check();
}

/** A stand-in for an HTTP response that records what was written. */
function fakeRes() {
  const res = new EventEmitter();
  res.chunks = [];
  res.ended = false;
  res.write = (c) => { res.chunks.push(c); return true; };
  res.end = () => { res.ended = true; res.emit('close'); };
  res.text = () => res.chunks.join('');
  return res;
}

// ---- part 1: the hub ------------------------------------------------------------------------------------------

test('a burst of writes becomes ONE "changed" message to each stream', async () => {
  const hub = createLiveHub({ coalesceMs: 20 });
  const a = fakeRes();
  hub.add({ res: a, userId: 'u1', token: 'ta', isValid: async () => true });
  hub.notifyChanged({ token: 'x' }); hub.notifyChanged({ token: 'y' }); hub.notifyChanged({ token: 'x' });
  await wait(60);
  assert.equal((a.text().match(/event: changed/g) || []).length, 1);
  hub.closeAll();
});

test('the tab that made the only change in a window is not pinged about it; everyone else is', async () => {
  const hub = createLiveHub({ coalesceMs: 20 });
  const mine = fakeRes(); const other = fakeRes();
  hub.add({ res: mine, userId: 'u1', token: 'ta', isValid: async () => true });
  hub.add({ res: other, userId: 'u2', token: 'tb', isValid: async () => true });
  hub.notifyChanged({ token: 'ta' });
  await wait(60);
  assert.doesNotMatch(mine.text(), /event: changed/);
  assert.match(other.text(), /event: changed/);
  // Two different writers in one window: both tabs hear about it (each missed the other's change).
  hub.notifyChanged({ token: 'ta' }); hub.notifyChanged({ token: 'tb' });
  await wait(60);
  assert.match(mine.text(), /event: changed/);
  hub.closeAll();
});

test('the message carries nothing but a counter', async () => {
  const hub = createLiveHub({ coalesceMs: 10 });
  const a = fakeRes();
  hub.add({ res: a, userId: 'u1', token: 'ta', isValid: async () => true });
  hub.notifyChanged({ token: 'zz' });
  await wait(40);
  assert.match(a.text(), /^retry: 5000\nevent: ready\ndata: 0\n\nevent: changed\ndata: 1\n\n$/);
  hub.closeAll();
});

test('a heartbeat is sent, and a stream whose session is no longer valid is told so and closed', async () => {
  const hub = createLiveHub({ heartbeatMs: 20 });
  const live = fakeRes(); const dead = fakeRes();
  hub.add({ res: live, userId: 'u1', token: 'ta', isValid: async () => true });
  hub.add({ res: dead, userId: 'u2', token: 'tb', isValid: async () => false });
  await until(() => dead.ended);
  assert.match(live.text(), /: ping/);
  assert.equal(live.ended, false);
  assert.match(dead.text(), /event: unauthorized/);
  assert.equal(dead.ended, true);
  assert.equal(hub.size, 1);
  hub.closeAll();
  assert.equal(hub.size, 0);
});

test('one person cannot hold unlimited streams open: the oldest is closed first', () => {
  const hub = createLiveHub({ maxPerUser: 2 });
  const [a, b, c] = [fakeRes(), fakeRes(), fakeRes()];
  for (const r of [a, b, c]) hub.add({ res: r, userId: 'u1', token: 't', isValid: async () => true });
  assert.equal(a.ended, true);
  assert.equal(b.ended, false);
  assert.equal(hub.size, 2);
  hub.closeAll();
});

// ---- part 2: the real server ---------------------------------------------------------------------------------

const config = { ...serverConfig, isTest: false, rateLimit: false, cookieSecure: false, staticDir: '/nonexistent', clientOrigin: '' };
const app = createApp({ config, logger: { warn() {}, error() {} } });
const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const base = `http://127.0.0.1:${server.address().port}/api`;
after(async () => {
  app.locals.liveHub.closeAll();
  await new Promise((r) => server.close(r));
});

async function call(method, path, token, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'X-Requested-With': 'taskit', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}
async function signUp(name, email) {
  await call('POST', '/auth/register', undefined, { name, email, password: 'password123' });
  const { json } = await call('POST', '/auth/login', undefined, { email, password: 'password123', expectedRole: 'user' });
  return json.sessionToken;
}
/** Opens /live like the browser does and collects its events. */
async function openStream(token) {
  const controller = new AbortController();
  const res = await fetch(base + '/live', { headers: { 'X-Requested-With': 'taskit', Authorization: `Bearer ${token}` }, signal: controller.signal });
  const out = { status: res.status, contentType: res.headers.get('content-type'), cache: res.headers.get('cache-control'), events: [], close: () => controller.abort() };
  if (!res.ok) { await res.text(); return out; }
  const parser = createSseParser((e) => out.events.push(e));
  const dec = new TextDecoder();
  (async () => {
    try { for await (const chunk of res.body) parser.push(dec.decode(chunk, { stream: true })); } catch { /* aborted */ }
  })();
  return out;
}
const changes = (s) => s.events.filter((e) => e.event === 'changed').length;

test('/live refuses anyone who is not signed in', async () => {
  await resetDatabase();
  assert.equal((await openStream('f'.repeat(64))).status, 401);
  const res = await fetch(base + '/live', { headers: { 'X-Requested-With': 'taskit' } });
  assert.equal(res.status, 401);
  await res.text();
});

test('a write by one person reaches another person\'s open stream, but not the writer\'s own tab', async () => {
  await resetDatabase();
  const maya = await signUp('Maya', 'maya@x.com');
  const ben = await signUp('Ben', 'ben@x.com');
  await wait(300); // let the sign-ups' own announcements go out before listening
  const mayaStream = await openStream(maya);
  const benStream = await openStream(ben);
  assert.equal(mayaStream.status, 200);
  assert.match(mayaStream.contentType, /text\/event-stream/);
  assert.match(mayaStream.cache, /no-cache/);
  assert.ok(await until(() => mayaStream.events.some((e) => e.event === 'ready') && benStream.events.some((e) => e.event === 'ready')));

  assert.equal((await call('PATCH', '/me', maya, { title: 'Lead' })).status, 200);
  assert.ok(await until(() => changes(benStream) === 1), 'Ben is told');
  await wait(300);
  assert.equal(changes(mayaStream), 0, 'Maya, who made the change, is not pinged about it');

  // A second tab signed in as Maya (its own session) is told, because that tab did not make the change.
  const mayaTab2Token = (await call('POST', '/auth/login', undefined, { email: 'maya@x.com', password: 'password123', expectedRole: 'user' })).json.sessionToken;
  const tab2 = await openStream(mayaTab2Token);
  assert.ok(await until(() => tab2.events.some((e) => e.event === 'ready')));
  await call('PATCH', '/me', maya, { title: 'Lead 2' });
  assert.ok(await until(() => changes(tab2) === 1), "Maya's other tab is told");

  // A refused write is not announced.
  const before = changes(benStream);
  assert.equal((await call('PATCH', '/me', maya, { name: '' })).status >= 400, true);
  await wait(300);
  assert.equal(changes(benStream), before);
  [mayaStream, benStream, tab2].forEach((s) => s.close());
});

test('closing the hub (server shutdown) ends every open stream', async () => {
  await resetDatabase();
  const maya = await signUp('Maya', 'maya@x.com');
  const s = await openStream(maya);
  assert.ok(await until(() => s.events.length > 0));
  assert.ok(app.locals.liveHub.size >= 1);
  app.locals.liveHub.closeAll();
  assert.ok(await until(() => app.locals.liveHub.size === 0));
  s.close();
});
