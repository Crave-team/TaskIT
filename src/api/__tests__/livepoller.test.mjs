import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { startLivePoller } from '../livePoller.js';

/** A stand-in for `document` / `window` that lets a test change visibility and fire events. */
function fakeEnv() {
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const win = new EventTarget();
  return { doc, win, hide() { doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange')); }, show() { doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange')); } };
}
const flush = () => new Promise((r) => setImmediate(r));

test('polls on the interval while visible, and stops after being stopped', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const env = fakeEnv();
  let calls = 0;
  const stop = startLivePoller({ tick: async () => { calls += 1; }, intervalMs: 5000, doc: env.doc, win: env.win });
  mock.timers.tick(4999); await flush();
  assert.equal(calls, 0);
  mock.timers.tick(1); await flush();
  assert.equal(calls, 1);
  mock.timers.tick(5000); await flush();
  assert.equal(calls, 2);
  stop();
  mock.timers.tick(60000); await flush();
  assert.equal(calls, 2);
  mock.timers.reset();
});

test('a hidden tab is not polled, and coming back refreshes immediately', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const env = fakeEnv();
  let calls = 0;
  const stop = startLivePoller({ tick: async () => { calls += 1; }, intervalMs: 5000, doc: env.doc, win: env.win });
  env.hide();
  mock.timers.tick(60000); await flush();
  assert.equal(calls, 0, 'nothing while hidden');
  env.show(); await flush();
  assert.equal(calls, 1, 'immediate refresh on return');
  stop();
  mock.timers.reset();
});

test('failures are swallowed and retried with a growing pause; success resets it', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const env = fakeEnv();
  let calls = 0;
  let fail = true;
  const stop = startLivePoller({ tick: async () => { calls += 1; if (fail) throw new Error('offline'); }, intervalMs: 1000, maxBackoffMs: 8000, doc: env.doc, win: env.win });
  mock.timers.tick(1000); await flush();   // 1st try fails -> next in 2s
  assert.equal(calls, 1);
  mock.timers.tick(1999); await flush();
  assert.equal(calls, 1);
  mock.timers.tick(1); await flush();      // 2nd try fails -> next in 4s
  assert.equal(calls, 2);
  fail = false;
  mock.timers.tick(4000); await flush();   // succeeds -> back to 1s
  assert.equal(calls, 3);
  mock.timers.tick(1000); await flush();
  assert.equal(calls, 4);
  stop();
  mock.timers.reset();
});

test('never runs two refreshes at once', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const env = fakeEnv();
  let active = 0; let peak = 0; let release;
  const stop = startLivePoller({
    tick: () => new Promise((resolve) => { active += 1; peak = Math.max(peak, active); release = () => { active -= 1; resolve(); }; }),
    intervalMs: 1000, doc: env.doc, win: env.win,
  });
  mock.timers.tick(1000); await flush();
  env.win.dispatchEvent(new Event('focus')); await flush();   // focus while one is still in flight
  assert.equal(peak, 1);
  release(); await flush();
  stop();
  mock.timers.reset();
});
