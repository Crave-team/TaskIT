import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { organizationModels, MAX_UNIT_DEPTH } from '../src/db/organizationModels.js';
import { planGroup, unitIdFor, memberIdFor } from '../scripts/lib/groupsToOrganizations.js';

/**
 * Organization schemas and the groups -> organizations planner. No database is needed: schemas are validated in memory,
 * and the append-only guard rejects before any query could reach MongoDB. `npm run test:orgmodels`.
 */
mongoose.set('bufferCommands', false);

const M = organizationModels;
const hex = (n) => n.toString(16).padStart(24, '0');
const indexOf = (model, name) => model.schema.indexes().find(([, o]) => o?.name === name);
const hasIndex = (model, keys, opts = {}) => model.schema.indexes().some(([k, o]) => JSON.stringify(k) === JSON.stringify(keys)
  && Object.entries(opts).every(([key, v]) => JSON.stringify(o?.[key]) === JSON.stringify(v)));

test('all eight collections exist with the expected names', () => {
  const names = Object.values(M).map((m) => m.collection.name).sort();
  assert.deepEqual(names, ['orgevaluationfacts', 'orghandoffs', 'orghandofftemplates', 'orgmembers', 'orgratings', 'orgunits', 'organizations', 'reviews'].sort());
});

test('database enforces one Owner per organization and one Leader per unit', () => {
  const owner = indexOf(M.orgMembers, 'one_owner_per_org');
  assert.deepEqual(owner[0], { orgId: 1 });
  assert.equal(owner[1].unique, true);
  assert.deepEqual(owner[1].partialFilterExpression, { role: 'owner' });
  const leader = indexOf(M.orgMembers, 'one_leader_per_unit');
  assert.deepEqual(leader[0], { orgId: 1, unitId: 1 });
  assert.deepEqual(leader[1].partialFilterExpression, { unitRole: 'leader' });
  assert.ok(hasIndex(M.orgMembers, { orgId: 1, userId: 1 }, { unique: true }));
});

test('reviews are unique per (task, seq) so two simultaneous actions cannot both win', () => {
  assert.ok(hasIndex(M.reviews, { taskId: 1, seq: 1 }, { unique: true }));
});

test('ratings are unique per (org, unit, month, raterKey)', () => {
  assert.ok(hasIndex(M.orgRatings, { orgId: 1, unitId: 1, period: 1, raterKey: 1 }, { unique: true }));
});

test('ratings store no evaluator link and no timestamp', () => {
  const paths = Object.keys(M.orgRatings.schema.paths);
  assert.deepEqual(paths.sort(), ['_id', 'orgId', 'period', 'raterKey', 'score', 'unitId'].sort());
});

test('rating score must be an integer from 1 to 5, period must be YYYY-MM', () => {
  const ok = { _id: hex(1), orgId: hex(2), unitId: hex(3), period: '2026-11', raterKey: 'k', score: 4 };
  assert.equal(new M.orgRatings(ok).validateSync(), undefined);
  for (const bad of [{ score: 0 }, { score: 6 }, { score: 3.5 }, { period: '2026-13' }, { period: '2026-1' }]) {
    assert.ok(new M.orgRatings({ ...ok, ...bad }).validateSync(), JSON.stringify(bad));
  }
});

test('unknown fields are rejected (strict: throw)', () => {
  assert.throws(() => new M.orgUnits({ _id: hex(1), orgId: hex(2), name: 'A', nameKey: 'a', createdAt: 'x', surprise: 1 }), /surprise|strict/i);
});

test('unit depth is capped', () => {
  const unit = (depth) => new M.orgUnits({ _id: hex(1), orgId: hex(2), name: 'A', nameKey: 'a', depth, createdAt: 'x' }).validateSync();
  assert.equal(unit(MAX_UNIT_DEPTH - 1), undefined);
  assert.ok(unit(MAX_UNIT_DEPTH));
});

const review = (extra = {}) => new M.reviews({
  _id: hex(1), orgId: hex(2), taskId: hex(3), seq: 1, action: 'approve', authorId: hex(4), actorId: hex(5), actorRole: 'leader', createdAt: 'x', ...extra,
});

test('a reviewer cannot approve or return their own item (schema backstop)', async () => {
  await review().validate();
  for (const action of ['approve', 'return', 'escalate']) {
    await assert.rejects(review({ action, actorId: hex(4) }).validate(), (err) => Boolean(err.errors?.actorId), action);
  }
  // The author submitting their own work is of course fine, and so is the system logging a deadline override.
  await review({ action: 'submit', actorId: hex(4), actorRole: 'author' }).validate();
  await review({ action: 'deadline_override', actorId: null, actorRole: 'system' }).validate();
});

test('reviews and ratings are append-only: updates, replaces and deletes are refused', async () => {
  for (const Model of [M.reviews, M.orgRatings]) {
    await assert.rejects(Model.updateOne({ _id: hex(1) }, { $set: { note: 'x' } }).exec(), /append-only/);
    await assert.rejects(Model.findOneAndUpdate({ _id: hex(1) }, { $set: { note: 'x' } }).exec(), /append-only/);
    await assert.rejects(Model.replaceOne({ _id: hex(1) }, {}).exec(), /append-only/);
    await assert.rejects(Model.deleteOne({ _id: hex(1) }).exec(), /append-only/);
    await assert.rejects(Model.deleteMany({}).exec(), /append-only/);
  }
});

test('saving an existing review again is refused', async () => {
  const doc = review();
  doc.isNew = false;
  await assert.rejects(doc.save(), /append-only/);
});

test('the explicit purge option is the only way past the delete guard', async () => {
  // With purge the guard lets the query through; there is no connection here, so it then fails for another reason.
  await assert.rejects(M.reviews.deleteMany({ orgId: hex(2) }, { purge: true }).exec(), (err) => !/append-only/.test(err.message));
});

// --- groups -> organizations planner ---------------------------------------------------------------------------

const group = (extra = {}) => ({
  _id: hex(100), name: 'Design Team', description: 'd', visibility: 'private', ownerId: hex(1),
  adminIds: [hex(1), hex(2), hex(3)], memberIds: [hex(1), hex(2), hex(3), hex(4), hex(5)], inviteCode: 'ABC123',
  roles: [{ id: 'r1', name: 'Designer' }], memberRoles: { [hex(4)]: 'r1' }, createdAt: '2026-01-01T00:00:00.000Z', ...extra,
});

test('planGroup keeps the group id, so every old groupId is a valid orgId', () => {
  const { organization, unit } = planGroup(group());
  assert.equal(organization._id, hex(100));
  assert.equal(unit.orgId, hex(100));
  assert.equal(unit.parentId, null);
  assert.equal(unit.name, 'Design Team');
});

test('planGroup maps owner, first other admin, further admins and members', () => {
  const { members, unitId, leaderId } = planGroup(group());
  const byUser = Object.fromEntries(members.map((m) => [m.userId, m]));
  assert.equal(leaderId, hex(2));
  assert.deepEqual([byUser[hex(1)].role, byUser[hex(1)].unitId, byUser[hex(1)].unitRole], ['owner', null, null]);
  assert.deepEqual([byUser[hex(2)].role, byUser[hex(2)].unitRole, byUser[hex(2)].unitId], ['member', 'leader', unitId]);
  assert.equal(byUser[hex(3)].unitRole, 'assistant');
  assert.equal(byUser[hex(4)].unitRole, 'member');
  assert.equal(members.length, 5);
  assert.equal(members.filter((m) => m.role === 'owner').length, 1);
  assert.equal(members.filter((m) => m.unitRole === 'leader').length, 1);
});

test('planGroup: when the owner is the only admin the owner leads the unit', () => {
  const { members, leaderId } = planGroup(group({ adminIds: [hex(1)], memberIds: [hex(1), hex(4)] }));
  assert.equal(leaderId, hex(1));
  const owner = members.find((m) => m.userId === hex(1));
  assert.deepEqual([owner.role, owner.unitRole], ['owner', 'leader']);
});

test('planGroup preserves the old roles and admin list under legacy and keeps no duplicates', () => {
  const { organization, members } = planGroup(group({ memberIds: [hex(4), hex(4), hex(5)] }));
  assert.deepEqual(organization.legacy.roles, [{ id: 'r1', name: 'Designer' }]);
  assert.deepEqual(organization.legacy.adminIds, [hex(1), hex(2), hex(3)]);
  assert.equal(new Set(members.map((m) => m.userId)).size, members.length);
});

test('derived ids are deterministic 24-hex strings, so a re-run finds the same documents', () => {
  assert.equal(unitIdFor(hex(100)), unitIdFor(hex(100)));
  assert.match(unitIdFor(hex(100)), /^[0-9a-f]{24}$/);
  assert.notEqual(memberIdFor(hex(100), hex(1)), memberIdFor(hex(100), hex(2)));
  assert.deepEqual(planGroup(group()), planGroup(group()));
});

test('every planned document passes its schema', () => {
  const { organization, unit, members } = planGroup(group());
  assert.equal(new M.organizations(organization).validateSync(), undefined);
  assert.equal(new M.orgUnits(unit).validateSync(), undefined);
  for (const m of members) assert.equal(new M.orgMembers(m).validateSync(), undefined, m.userId);
});
