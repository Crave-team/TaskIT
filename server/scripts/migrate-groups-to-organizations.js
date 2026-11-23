import mongoose from 'mongoose';
import { planGroup } from './lib/groupsToOrganizations.js';

/**
 * One-time migration: `groups` -> `organizations` (TaskIT v60 -> Organization module).
 *
 *   Dry run (changes nothing):  node --env-file=.env scripts/migrate-groups-to-organizations.js
 *   Apply:                      node --env-file=.env scripts/migrate-groups-to-organizations.js --apply --i-have-a-backup
 *
 * Run it from the `server` folder, with the server STOPPED. Back up the database first (docs/ORGANIZATION_DATA_MODEL.md).
 * The old `groups` collection is left untouched so you can compare; drop it yourself once you are satisfied.
 * Safe to run again after a crash: every step only fills in what is missing, and a marker is written only when the
 * verification at the end passes.
 */
const MIGRATION_ID = 'groups-to-organizations-v60';
// Collections whose `groupId` becomes `orgId` (collection names, not model names).
const RENAME_IN = ['tasks', 'projects', 'messages', 'teamannouncements', 'joinrequests', 'rolechanges', 'activity'];

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const uri = process.env.MONGODB_URI;
const mask = (u) => u.replace(/\/\/([^:@/]+):[^@]*@/, '//$1:****@');
const log = (...m) => console.log(...m);
const fail = (msg) => { console.error(`\nSTOP: ${msg}`); process.exitCode = 1; };

async function main() {
  if (!uri) return fail('MONGODB_URI is not set. Run with --env-file=.env from the server folder.');
  if (apply && !args.has('--i-have-a-backup')) return fail('Refusing to apply without --i-have-a-backup. Back up the database and the zip first.');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));
  const col = (name) => db.collection(name);
  log(`Connected to ${mask(uri)} (${db.databaseName}). Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);

  if (existing.has('migrations') && await col('migrations').findOne({ _id: MIGRATION_ID })) {
    return log('This migration was already applied. Nothing to do.');
  }
  if (!existing.has('groups')) return log('No `groups` collection found: nothing to migrate (new installation).');

  const groups = await col('groups').find({}).toArray();
  const plans = groups.map(planGroup);
  const memberCount = plans.reduce((n, p) => n + p.members.length, 0);
  const withGroupId = {};
  for (const name of RENAME_IN) withGroupId[name] = existing.has(name) ? await col(name).countDocuments({ groupId: { $exists: true } }) : 0;

  log(`\nPlan\n  groups -> organizations: ${groups.length}\n  top-level units to create: ${plans.length}\n  organization members to create: ${memberCount}`);
  for (const [name, n] of Object.entries(withGroupId)) log(`  ${name}: ${n} documents with groupId to rename to orgId`);
  if (!apply) return log('\nDry run only. Nothing was changed. Add --apply --i-have-a-backup to run it.');

  // 1. Create the new documents (only the ones that are missing).
  const insertMissing = async (name, docs) => {
    if (!docs.length) return 0;
    const found = new Set((await col(name).find({ _id: { $in: docs.map((d) => d._id) } }, { projection: { _id: 1 } }).toArray()).map((d) => d._id));
    const missing = docs.filter((d) => !found.has(d._id));
    if (missing.length) await col(name).insertMany(missing);
    return missing.length;
  };
  log(`\nCreated organizations: ${await insertMissing('organizations', plans.map((p) => p.organization))}`);
  log(`Created units: ${await insertMissing('orgunits', plans.map((p) => p.unit))}`);
  log(`Created members: ${await insertMissing('orgmembers', plans.flatMap((p) => p.members))}`);

  // 2. Drop every old index that mentions groupId. Must happen BEFORE the rename: a leftover unique index on
  //    (groupId, accountId) would see every renamed document as groupId = null and reject the second one.
  for (const name of RENAME_IN.filter((n) => existing.has(n))) {
    for (const ix of await col(name).indexes()) {
      if ('groupId' in ix.key) { await col(name).dropIndex(ix.name); log(`Dropped index ${name}.${ix.name}`); }
    }
  }

  // 3. groupId -> orgId, then fill in the new fields.
  for (const name of RENAME_IN.filter((n) => existing.has(n))) {
    const r = await col(name).updateMany({ groupId: { $exists: true } }, { $rename: { groupId: 'orgId' } });
    log(`Renamed groupId -> orgId in ${name}: ${r.modifiedCount}`);
  }
  for (const { organization, unitId, leaderId } of plans) {
    const orgId = organization._id;
    await col('tasks').updateMany({ orgId, unitId: { $exists: false } }, { $set: { unitId } });
    await col('projects').updateMany({ orgId, unitIds: { $exists: false } }, { $set: { unitIds: [unitId] } });
    await col('messages').updateMany({ orgId, unitId: { $exists: false } }, { $set: { unitId: null } });
    await col('joinrequests').updateMany({ orgId, unitId: { $exists: false } }, { $set: { unitId: null } });
    // Existing review state: handed in and waiting -> submitted; approved -> approved; sent back -> returned.
    const fresh = { reviewState: { $exists: false } };
    await col('tasks').updateMany({ orgId, ...fresh, status: 'review', turnIn: { $ne: null }, 'turnIn.approvedAt': { $exists: false } }, { $set: { reviewState: 'submitted', reviewHolderId: leaderId } });
    await col('tasks').updateMany({ orgId, ...fresh, 'turnIn.approvedAt': { $exists: true } }, { $set: { reviewState: 'approved', reviewHolderId: null } });
    // One update per returned task (the holder is each task's own assignee); the count is small.
    const returned = await col('tasks').find({ orgId, ...fresh, returned: { $ne: null }, status: { $ne: 'done' } }).toArray();
    for (const t of returned) await col('tasks').updateOne({ _id: t._id }, { $set: { reviewState: 'returned', reviewHolderId: t.assigneeId ?? null } });
    await col('tasks').updateMany({ orgId, ...fresh }, { $set: { reviewState: 'none', reviewHolderId: null } });
  }
  await col('tasks').updateMany({ orgId: { $ne: null }, reviewReturnCount: { $exists: false } }, { $set: { reviewReturnCount: 0, deadlineOverride: false } });
  if (existing.has('rolechanges')) await col('rolechanges').updateMany({ status: { $exists: false } }, { $set: { status: 'legacy', toRole: null, unitId: null } });
  if (existing.has('activity')) await col('activity').updateMany({ scope: 'team' }, { $set: { scope: 'organization' } });

  // 4. Verify before writing the marker.
  const problems = [];
  const orgIds = new Set(plans.map((p) => p.organization._id));
  if (await col('organizations').countDocuments({ _id: { $in: [...orgIds] } }) !== groups.length) problems.push('organizations count differs from groups count');
  for (const name of RENAME_IN.filter((n) => existing.has(n))) {
    const left = await col(name).countDocuments({ groupId: { $exists: true } });
    if (left) problems.push(`${name}: ${left} documents still have groupId`);
    const dangling = (await col(name).distinct('orgId')).filter((id) => id && !orgIds.has(id));
    if (dangling.length) problems.push(`${name}: orgId values that match no organization: ${dangling.slice(0, 5).join(', ')}`);
  }
  const noUnit = await col('tasks').countDocuments({ orgId: { $ne: null }, unitId: { $exists: false } });
  if (noUnit) problems.push(`tasks: ${noUnit} organization tasks have no unitId`);
  if (problems.length) {
    problems.forEach((p) => console.error(`  - ${p}`));
    return fail('Verification failed. No marker written. Restore your backup, or fix the data and run again.');
  }

  await col('migrations').insertOne({ _id: MIGRATION_ID, appliedAt: new Date().toISOString(), organizations: groups.length, members: memberCount });
  log('\nDone. Verification passed. The old `groups` collection is untouched; drop it after you have checked the app.');
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
