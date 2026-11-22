import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// A tiny sessionStorage so the module behaves as it does in a browser tab.
const data = new Map();
globalThis.sessionStorage = {
  get length() { return data.size; },
  key: (i) => [...data.keys()][i] ?? null,
  getItem: (k) => (data.has(k) ? data.get(k) : null),
  setItem: (k, v) => { data.set(k, String(v)); },
  removeItem: (k) => { data.delete(k); },
};

const { saveState, readRestored, clearSavedState, reloadSnapshotForTests } = await import('../../utils/uiState.js');
const { setSessionToken } = await import('../clientSession.js');

beforeEach(() => { data.clear(); setSessionToken(null); reloadSnapshotForTests(); });

test('a saved value comes back only after a (simulated) page load, not during the same visit', () => {
  saveState('workspace.view', 'list');
  assert.equal(readRestored('workspace.view').found, false, 'the running page never re-reads its own writes');
  reloadSnapshotForTests();
  assert.deepEqual(readRestored('workspace.view'), { found: true, value: 'list' });
});

test('objects, arrays, empty strings and false round-trip', () => {
  saveState('a', { title: 'Hi', tags: ['x'] });
  saveState('b', '');
  saveState('c', false);
  reloadSnapshotForTests();
  assert.deepEqual(readRestored('a').value, { title: 'Hi', tags: ['x'] });
  assert.equal(readRestored('b').value, '');
  assert.equal(readRestored('c').value, false);
});

test('undefined removes a saved value', () => {
  saveState('x', 1);
  saveState('x', undefined);
  reloadSnapshotForTests();
  assert.equal(readRestored('x').found, false);
});

test('corrupt storage is ignored instead of throwing', () => {
  data.set('taskit.ui.broken', '{not json');
  reloadSnapshotForTests();
  assert.equal(readRestored('broken').found, false);
});

test('signing in, out or switching account wipes everything saved', () => {
  setSessionToken('a'.repeat(64));
  saveState('team.1.draft', 'half a message');
  reloadSnapshotForTests();
  setSessionToken('b'.repeat(64)); // another account in this tab
  assert.equal(readRestored('team.1.draft').found, false);
  assert.equal([...data.keys()].some((k) => k.startsWith('taskit.ui.')), false);
});

test('clearSavedState leaves unrelated storage alone', () => {
  data.set('taskit.session', 'token');
  saveState('k', 1);
  clearSavedState();
  assert.equal(data.get('taskit.session'), 'token');
  assert.equal(data.has('taskit.ui.k'), false);
});
