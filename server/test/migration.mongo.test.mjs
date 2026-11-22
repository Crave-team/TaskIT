import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

import { models } from '../src/db/models.js';
import { organizationModels as M } from '../src/db/organizationModels.js';

/**
 * Runs the real groups -> organizations migration script against a THROWAWAY database on a real MongoDB server
 * (set MONGODB_URI to the server; the database name is replaced by `taskit_migration_test`, which is dropped at the end).
 * It seeds v60-shaped data, then checks the dry run, the apply, the re-run, and the indexes. `npm run test:migration`.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, '..', 'scripts', 'migrate-groups-to-organizations.js');
const server = new URL(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/x');
server.pathname = '/taskit_migration_test';
const uri = server.toString();
const hex = (n) => n.toString(16).padStart(24, '0');
const [u1, u2, u3, u4, u5, u6, u7] = [1, 2, 3, 4, 5, 6, 7].map(hex);
const [g1, g2] = [hex(101), hex(102)];
const run = (...args) => execFileSync(process.execPath, [script, ...args], { env: { ...process.env, MONGODB_URI: uri }, encoding: 'utf8' });
let db;
const col = (n) => db.collection(n);

before(async () => {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  db = mongoose.connection.db;
  await db.dropDatabase();
  // Build the OLD indexes exactly as v60 does, so the migration has real indexes to drop.
  for (const key of ['groups', 'joinRequests', 'roleChanges', 'messages', 'teamAnnouncements', 'projects', 'tasks', 'activity']) await models[key].syncIndexes();
  const at = '2026-01-01T00:00:00.000Z';
  await col('groups').insertMany([
    { _id: g1, name: 'Design Team', description: '', visibility: 'private', ownerId: u1, adminIds: [u1, u2, u3], memberIds: [u1, u2, u3, u4, u5], inviteCode: 'AAA111', roles: [{ id: 'r1', name: 'Designer' }], memberRoles: { [u4]: 'r1' }, createdAt: at },
    { _id: g2, name: 'Solo', description: '', visibility: 'public', ownerId: u6, adminIds: [u6], memberIds: [u6, u7], inviteCode: 'BBB222', roles: [], memberRoles: {}, createdAt: at },
  ]);
  const task = (n, extra) => ({ _id: hex(200 + n), title: `t${n}`, status: 'todo', priority: 'medium', dueDate: '2026-12-01', projectId: hex(300), ownerId: u1, assigneeId: u4, createdAt: at, ...extra });
  await col('tasks').insertMany([
    task(1, { groupId: null, assigneeId: null }),
    task(2, { groupId: g1, status: 'review', turnIn: { files: [], at, byId: u4 } }),
    task(3, { groupId: g1, status: 'done', turnIn: { files: [], at, byId: u4, approvedAt: at } }),
    task(4, { groupId: g1, status: 'in-progress', returned: { note: 'fix', at, byId: u2 } }),
    task(5, { groupId: g1 }),
    task(6, { groupId: g2, assigneeId: u7 }),
  ]);
  await col('projects').insertMany([
    { _id: hex(300), name: 'P', ownerId: u1, groupId: g1, createdAt: at },
    { _id: hex(301), name: 'Personal', ownerId: u1, groupId: null, createdAt: at },
  ]);
  await col('messages').insertMany([{ _id: hex(400), groupId: g1, authorId: u2, text: 'hi', createdAt: at }, { _id: hex(401), groupId: g1, authorId: u3, text: 'yo', createdAt: at }]);
  await col('teamannouncements').insertOne({ _id: hex(500), groupId: g1, authorId: u1, text: 'news', createdAt: at });
  await col('joinrequests').insertMany([{ _id: hex(600), groupId: g1, accountId: u7, roleId: '', createdAt: at }]);
  await col('rolechanges').insertOne({ _id: hex(700), groupId: g1, accountId: u4, roleId: 'r1', requestedById: u2, createdAt: at });
  await col('activity').insertMany([{ _id: hex(800), kind: 'action', scope: 'team', actorId: u1, actorName: 'A', action: 'x', target: 'y', groupId: g1, createdAt: at }, { _id: hex(801), kind: 'action', scope: 'workspace', actorId: u1, actorName: 'A', action: 'x', target: 'y', groupId: null, createdAt: at }]);
});

after(async () => { await db?.dropDatabase(); await mongoose.disconnect(); });

test('the dry run reports the plan and changes nothing', async () => {
  const out = run();
  assert.match(out, /DRY RUN/);
  assert.match(out, /groups -> organizations: 2/);
  assert.equal(await col('organizations').countDocuments(), 0);
  assert.equal(await col('tasks').countDocuments({ groupId: { $exists: true } }), 6);
});

test('apply refuses to run without the backup flag', () => {
  assert.throws(() => run('--apply'), (err) => /i-have-a-backup/.test(`${err.stderr}${err.stdout}`));
  assert.throws(() => run('--apply'), (err) => err.status === 1);
});

test('apply migrates organizations, units, members and fields', async () => {
  const out = run('--apply', '--i-have-a-backup');
  assert.match(out, /Verification passed/);
  assert.equal(await col('organizations').countDocuments(), 2);
  assert.equal(await col('orgunits').countDocuments(), 2);
  assert.equal(await col('orgmembers').countDocuments(), 7);
  const org = await col('organizations').findOne({ _id: g1 });
  assert.equal(org.inviteCode, 'AAA111');
  assert.deepEqual(org.legacy.roles, [{ id: 'r1', name: 'Designer' }]);

  const members = await col('orgmembers').find({ orgId: g1 }).toArray();
  const by = Object.fromEntries(members.map((m) => [m.userId, m]));
  assert.deepEqual([by[u1].role, by[u1].unitRole], ['owner', null]);
  assert.equal(by[u2].unitRole, 'leader');
  assert.equal(by[u3].unitRole, 'assistant');
  assert.equal(by[u4].unitRole, 'member');
  const solo = await col('orgmembers').find({ orgId: g2 }).toArray();
  assert.deepEqual(solo.find((m) => m.userId === u6) && [solo.find((m) => m.userId === u6).role, solo.find((m) => m.userId === u6).unitRole], ['owner', 'leader']);

  const unit = await col('orgunits').findOne({ orgId: g1 });
  for (const name of ['tasks', 'projects', 'messages', 'teamannouncements', 'joinrequests', 'rolechanges', 'activity']) {
    assert.equal(await col(name).countDocuments({ groupId: { $exists: true } }), 0, `${name} still has groupId`);
  }
  const tasks = Object.fromEntries((await col('tasks').find({}).toArray()).map((t) => [t.title, t]));
  assert.equal(tasks.t1.orgId, null);
  assert.equal(tasks.t1.unitId, undefined);
  assert.equal(tasks.t1.reviewState, undefined, 'personal tasks are not touched');
  assert.deepEqual([tasks.t2.reviewState, tasks.t2.reviewHolderId, tasks.t2.unitId], ['submitted', u2, unit._id]);
  assert.deepEqual([tasks.t3.reviewState, tasks.t3.reviewHolderId], ['approved', null]);
  assert.deepEqual([tasks.t4.reviewState, tasks.t4.reviewHolderId], ['returned', u4]);
  assert.deepEqual([tasks.t5.reviewState, tasks.t5.reviewReturnCount, tasks.t5.deadlineOverride], ['none', 0, false]);
  assert.deepEqual([tasks.t6.reviewState, tasks.t6.orgId], ['none', g2]);
  assert.deepEqual((await col('projects').findOne({ _id: hex(300) })).unitIds, [unit._id]);
  assert.equal((await col('projects').findOne({ _id: hex(301) })).unitIds, undefined);
  assert.equal((await col('messages').findOne({ _id: hex(400) })).unitId, null);
  assert.equal((await col('rolechanges').findOne({})).status, 'legacy');
  assert.equal((await col('activity').findOne({ _id: hex(800) })).scope, 'organization');
  assert.equal((await col('activity').findOne({ _id: hex(801) })).scope, 'workspace');
  assert.equal(await col('groups').countDocuments(), 2, 'the old groups collection is left untouched');
});

test('old indexes on groupId are gone, so renamed documents cannot collide', async () => {
  for (const name of ['joinrequests', 'rolechanges', 'messages', 'teamannouncements', 'projects', 'tasks', 'activity']) {
    const keys = (await col(name).indexes()).flatMap((ix) => Object.keys(ix.key));
    assert.ok(!keys.includes('groupId'), `${name} still has a groupId index`);
  }
  // Under the old unique (groupId, accountId) index this second request would be a duplicate of the first.
  await col('joinrequests').insertOne({ _id: hex(601), orgId: g2, accountId: u7, roleId: '', createdAt: 'x' });
});

test('running it again does nothing', async () => {
  assert.match(run('--apply', '--i-have-a-backup'), /already applied/);
  assert.equal(await col('orgmembers').countDocuments(), 7);
});

test('the new indexes build and enforce one Owner per organization and one Leader per unit', async () => {
  for (const model of Object.values(M)) await model.syncIndexes();
  await assert.rejects(M.orgMembers.create({ _id: hex(900), orgId: g1, userId: u5, role: 'owner', joinedAt: 'x' }), /E11000|duplicate/i);
  const unit = await col('orgunits').findOne({ orgId: g1 });
  await assert.rejects(M.orgMembers.create({ _id: hex(901), orgId: g1, userId: hex(8), unitId: unit._id, unitRole: 'leader', joinedAt: 'x' }), /E11000|duplicate/i);
  await M.orgMembers.create({ _id: hex(902), orgId: g1, userId: hex(9), unitId: unit._id, unitRole: 'member', joinedAt: 'x' });
});

test('two actions on the same review step cannot both be recorded', async () => {
  const row = (id, extra) => ({ _id: hex(id), orgId: g1, taskId: hex(202), seq: 1, action: 'approve', authorId: u4, actorId: u2, actorRole: 'leader', createdAt: 'x', ...extra });
  await M.reviews.create(row(950));
  await assert.rejects(M.reviews.create(row(951, { action: 'return', actorId: u3 })), /E11000|duplicate/i);
  await M.reviews.create(row(952, { seq: 2, action: 'return', actorId: u3 }));
});
