import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { api } from './api.mjs';
import { resetDatabase, db } from '../repo.js';

/**
 * Regression tests for `tasks.deleteTasks` (bulk delete): all-or-nothing permissions, input validation, the size cap,
 * duplicate ids, and one audit-log entry per team. Runs in plain Node: `npm run test:api`.
 */
const PW = 'password123';
const tomorrow = '2026-10-15';
const MAX_BULK_DELETE = 200;

async function signUp(name, email) {
  await api.auth.register({ name, email, password: PW, accountRole: 'user', inviteCode: '' });
}
async function as(email) {
  await api.auth.logout().catch(() => {});
  return api.auth.login({ email, password: PW });
}
const rejects = (promise, code) => assert.rejects(promise, (e) => e.code === code || e.status === code);
const fakeIds = (n) => Array.from({ length: n }, (_, i) => i.toString(16).padStart(24, '0'));
const deletions = async () => (await db.activity.find()).filter((a) => /^deleted \d+ tasks?$/.test(a.action));
const exists = async (id) => (await db.tasks.get(id)) !== null;

/** Maya owns/admins the team; Ben is its only Dev, so a task made for the Dev role is his. */
async function setup() {
  await signUp('Maya', 'maya@x.com');
  await signUp('Ben', 'ben@x.com');
  await as('maya@x.com');
  const group = await api.teams.createGroup({ name: 'Crew' });
  const project = await api.tasks.createProject({ name: 'Team project', groupId: group.id });
  const dev = await api.teams.addRole(group.id, 'Dev');
  await as('ben@x.com');
  await api.teams.joinByCode(group.inviteCode, dev.id);
  await as('maya@x.com');
  for (const r of (await api.bootstrap()).joinRequests) await api.teams.approveJoinRequest(r.id);
  const teamTask = (title) => api.tasks.createTask({ title, dueDate: tomorrow, projectId: project.id, roleId: dev.id });
  return { group, project, teamTask };
}

beforeEach(() => resetDatabase());

test('bulk delete is all-or-nothing on permissions: one task you cannot manage blocks the whole batch', async () => {
  const { teamTask } = await setup();
  const t1 = await teamTask('T1');
  const t2 = await teamTask('T2');

  await as('ben@x.com'); // a plain member, not a team admin
  const own = await api.tasks.createProject({ name: 'Mine' });
  const mine = await api.tasks.createTask({ title: 'Mine', dueDate: tomorrow, projectId: own.id });
  await rejects(api.tasks.deleteTasks([t1.id, t2.id]), 'FORBIDDEN');
  await rejects(api.tasks.deleteTasks([mine.id, t1.id]), 'FORBIDDEN');
  assert.ok(await exists(mine.id), 'his own task survives a batch that also named a task he cannot delete');
  assert.ok(await exists(t1.id));
  assert.ok(await exists(t2.id));
  assert.equal((await deletions()).length, 0, 'a refused batch logs nothing');

  await api.tasks.deleteTasks([mine.id]);
  assert.equal(await exists(mine.id), false, 'a batch he is allowed to delete goes through');
});

test('bulk delete: an unknown id fails the whole batch and nothing is deleted', async () => {
  const { teamTask } = await setup();
  const t1 = await teamTask('T1');
  await rejects(api.tasks.deleteTasks([t1.id, fakeIds(1)[0]]), 'NOT_FOUND');
  assert.ok(await exists(t1.id));
  assert.equal((await deletions()).length, 0);
});

test('bulk delete: bad input is rejected, an empty list is a no-op, and nobody can call it signed out', async () => {
  const { teamTask } = await setup();
  const t1 = await teamTask('T1');
  await rejects(api.tasks.deleteTasks('not-a-list'), 'BAD_REQUEST');
  await rejects(api.tasks.deleteTasks(null), 'BAD_REQUEST');
  await rejects(api.tasks.deleteTasks([t1.id, 42]), 'BAD_REQUEST');
  assert.ok(await exists(t1.id));

  await api.tasks.deleteTasks([]);
  assert.ok(await exists(t1.id));
  assert.equal((await deletions()).length, 0, 'an empty batch logs nothing');

  await api.auth.logout().catch(() => {});
  await rejects(api.tasks.deleteTasks([t1.id]), 'UNAUTHORIZED');
  assert.ok(await exists(t1.id));
});

test(`bulk delete: at most ${MAX_BULK_DELETE} tasks at once`, async () => {
  await setup();
  await rejects(api.tasks.deleteTasks(fakeIds(MAX_BULK_DELETE + 1)), 'BAD_REQUEST');
  // Exactly at the cap the size check passes and the lookup runs (these ids do not exist).
  await rejects(api.tasks.deleteTasks(fakeIds(MAX_BULK_DELETE)), 'NOT_FOUND');
});

test('bulk delete: duplicate ids count once', async () => {
  const { teamTask } = await setup();
  const t1 = await teamTask('T1');
  await api.tasks.deleteTasks([t1.id, t1.id, t1.id]);
  assert.equal(await exists(t1.id), false);
  const log = await deletions();
  assert.equal(log.length, 1);
  assert.equal(log[0].action, 'deleted 1 task');
  assert.equal(log[0].target, 'T1');
});

test('bulk delete: the audit log gets one entry per team, so a mixed batch is not filed under the wrong team', async () => {
  const { group, teamTask } = await setup();
  const own = await api.tasks.createProject({ name: 'Personal' });
  const personal = await api.tasks.createTask({ title: 'Solo', dueDate: tomorrow, projectId: own.id });
  const a = await teamTask('A');
  const b = await teamTask('B');

  // The personal task comes first: the team entry must not be filed under its (empty) group, nor the reverse.
  await api.tasks.deleteTasks([personal.id, a.id, b.id]);
  for (const id of [personal.id, a.id, b.id]) assert.equal(await exists(id), false);

  const log = await deletions();
  assert.equal(log.length, 2);
  const team = log.find((e) => e.groupId === group.id);
  const solo = log.find((e) => e.groupId === null);
  assert.equal(team.action, 'deleted 2 tasks');
  assert.equal(team.target, 'from the team project');
  assert.equal(team.scope, 'team');
  assert.equal(solo.action, 'deleted 1 task');
  assert.equal(solo.target, 'Solo');
  assert.equal(solo.scope, 'workspace');
});
