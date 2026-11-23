import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSseParser, startLiveStream } from '../liveStream.js';

const collect = () => { const events = []; return { events, parser: createSseParser((e) => events.push(e)) }; };

test('the stream parser reads events however the bytes are sliced, and ignores heartbeats', () => {
  const { events, parser } = collect();
  parser.push('retry: 5000\nevent: ready\ndata: 0\n\n: ping\n\nev');
  parser.push('ent: changed\r\nda');
  parser.push('ta: 7\r\n\r\n');
  assert.deepEqual(events, [{ event: 'ready', data: '0' }, { event: 'changed', data: '7' }]);
});

test('multi-line data is joined, and an event with no data is not delivered', () => {
  const { events, parser } = collect();
  parser.push('data: a\ndata: b\n\nevent: nothing\n\n');
  assert.deepEqual(events, [{ event: 'message', data: 'a\nb' }]);
});

/** A fetch whose body we feed by hand. */
function fakeStream() {
  let controller;
  const body = new ReadableStream({ start(c) { controller = c; } });
  const enc = new TextEncoder();
  return { body, send: (text) => controller.enqueue(enc.encode(text)), end: () => controller.close() };
}
const tick = () => new Promise((r) => setTimeout(r, 10));

test('startLiveStream reports connected, fires onChange per "changed", and stops when asked', async () => {
  const s = fakeStream();
  const seen = { changes: 0, status: [], headers: null };
  const stop = startLiveStream({
    url: '/api/live',
    getToken: () => 'tok'.repeat(20),
    onChange: () => { seen.changes += 1; },
    onStatus: (c) => seen.status.push(c),
    fetchFn: async (_url, init) => { seen.headers = init.headers; return { ok: true, status: 200, body: s.body }; },
  });
  await tick();
  s.send('retry: 5000\nevent: ready\ndata: 0\n\n');
  await tick();
  s.send('event: changed\ndata: 1\n\nevent: changed\ndata: 2\n\n');
  await tick();
  assert.deepEqual(seen.status, [true]);
  assert.equal(seen.changes, 2);
  assert.equal(seen.headers.Authorization, `Bearer ${'tok'.repeat(20)}`);
  assert.equal(seen.headers['X-Requested-With'], 'taskit');
  stop();
  await tick();
  assert.deepEqual(seen.status, [true, false]);
});

test('a dropped stream is reported as disconnected and reconnected; a 401 stops for good', async () => {
  let opens = 0;
  const status = [];
  const first = fakeStream();
  const second = fakeStream();
  const stop = startLiveStream({
    url: '/api/live', getToken: () => 'tok', onChange() {}, onStatus: (c) => status.push(c), retryMs: [5],
    fetchFn: async () => { opens += 1; return opens === 1 ? { ok: true, status: 200, body: first.body } : { ok: true, status: 200, body: second.body }; },
  });
  await tick(); first.send('event: ready\ndata: 0\n\n'); await tick();
  first.end(); await tick(); await tick();
  assert.equal(opens, 2, 'it reconnected');
  second.send('event: ready\ndata: 0\n\n'); await tick();
  assert.deepEqual(status, [true, false, true]);
  stop();

  let tries = 0;
  const stop401 = startLiveStream({ url: '/x', getToken: () => 'tok', onChange() {}, retryMs: [5], fetchFn: async () => { tries += 1; return { ok: false, status: 401, body: null }; } });
  await tick(); await tick(); await tick();
  assert.equal(tries, 1, 'no retry after the session was refused');
  stop401();
});

test('with no session token it does not connect at all', async () => {
  let called = false;
  const stop = startLiveStream({ url: '/x', getToken: () => null, onChange() {}, fetchFn: async () => { called = true; } });
  await tick();
  assert.equal(called, false);
  stop();
});
