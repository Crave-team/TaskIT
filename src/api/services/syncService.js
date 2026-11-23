import { db, settingsStore } from '../repo.js';
import { isGroupAdmin } from '../core.js';
import { makeNamer, populateTask, publicUser, privateUser } from '../views.js';
import { visibleTasksFor, visibleProjectsFor } from './taskService.js';
import { config } from '../config.js';
import { listMyActivity, listAllActivity } from './activityService.js';

/**
 * `GET /api/bootstrap`: everything the signed-in person's screens need, FILTERED ON THE SERVER by
 * who is asking. This is where privacy is decided:
 *   - a member never receives other people's personal tasks, other teams' data, private teams,
 *     member lists of teams they are not in, or other users' emails;
 *   - a team admin additionally receives every task of the teams they admin;
 *   - the site admin receives the overview data (all users, teams, tasks, projects, activity) but
 *     only the *shape* of team chats, never their text.
 * The client holds this as a cache and refetches after each change.
 *
 * Every read is a targeted query (by owner, membership, or a set of ids), not a table scan.
 */

/** Every user id a task mentions (so their current names can be looked up in one query). */
function userIdsIn(task) {
  const ids = [task.ownerId, task.assigneeId, task.turnIn?.byId, task.turnIn?.approvedById, task.returned?.byId];
  (task.comments || []).forEach((c) => ids.push(c.authorId));
  (task.attachments || []).forEach((a) => ids.push(a.uploadedById));
  (task.history || []).forEach((h) => ids.push(h.byId));
  (task.previousTurnIns || []).forEach((t) => ids.push(t?.byId, t?.approvedById));
  return ids.filter(Boolean);
}

export async function bootstrap(ctx, { activityLimit = 200 } = {}) {
  const actor = ctx?.actorId ? await db.users.get(ctx.actorId) : null;
  if (!actor || actor.status === 'suspended') return { me: null };

  const isSiteAdmin = actor.accountRole === 'admin';

  // ---- teams -------------------------------------------------------------------------------
  const myGroups = await db.groups.find({ memberIds: actor.id });
  const myGroupIds = myGroups.map((g) => g.id);
  const adminGroupIds = myGroups.filter((g) => isGroupAdmin(g, actor.id)).map((g) => g.id);
  let groups;
  if (isSiteAdmin) {
    groups = await db.groups.find();
  } else {
    // Public teams you could join arrive as stripped cards (counts only, no member lists or invite code).
    const publicOthers = (await db.groups.find({ visibility: 'public' })).filter((g) => !myGroupIds.includes(g.id));
    groups = [
      ...myGroups,
      ...publicOthers.map((g) => ({
        id: g.id, name: g.name, description: g.description, visibility: g.visibility, ownerId: g.ownerId,
        memberIds: [], adminIds: [], roles: g.roles || [], memberCount: g.memberIds.length, createdAt: g.createdAt,
      })),
    ];
  }

  let joinRequests;
  if (isSiteAdmin) {
    joinRequests = await db.joinRequests.find();
  } else {
    const mine = await db.joinRequests.find({ accountId: actor.id });
    const toReview = adminGroupIds.length ? await db.joinRequests.find({ groupId: { $in: adminGroupIds } }) : [];
    joinRequests = [...mine, ...toReview];
  }

  // A member sees proposals made to them; an admin sees the ones open in their teams.
  let roleChanges;
  if (isSiteAdmin) {
    roleChanges = await db.roleChanges.find();
  } else {
    const mine = await db.roleChanges.find({ accountId: actor.id });
    const proposed = adminGroupIds.length ? await db.roleChanges.find({ groupId: { $in: adminGroupIds } }) : [];
    roleChanges = [...new Map([...mine, ...proposed].map((c) => [c.id, c])).values()];
  }

  // ---- work --------------------------------------------------------------------------------
  const rawTasks = await visibleTasksFor(actor);
  const projects = await visibleProjectsFor(actor);

  // ---- people ------------------------------------------------------------------------------
  const directoryIds = new Set([actor.id]);
  myGroups.forEach((g) => g.memberIds.forEach((id) => directoryIds.add(id)));
  groups.forEach((g) => directoryIds.add(g.ownerId));
  joinRequests.forEach((r) => directoryIds.add(r.accountId));
  const nameIds = new Set(directoryIds);
  rawTasks.forEach((t) => userIdsIn(t).forEach((id) => nameIds.add(id)));

  const allUsers = isSiteAdmin ? await db.users.find() : await db.users.find({ id: { $in: [...nameIds] } });
  const nameOf = makeNamer(allUsers);
  const accounts = isSiteAdmin
    ? allUsers.map(privateUser)
    : allUsers.filter((u) => directoryIds.has(u.id)).map((u) => (u.id === actor.id ? privateUser(u) : publicUser(u)));

  // ---- chat and announcements ---------------------------------------------------------------
  let messages;
  if (isSiteAdmin) {
    messages = (await db.messages.find()).map(({ id, groupId, createdAt, deleted }) => ({ id, groupId, createdAt, deleted: Boolean(deleted) }));
  } else {
    messages = [];
    for (const g of myGroups) messages.push(...(await db.messages.page({ groupId: g.id }, { limit: config.PAGE_SIZE })).reverse());
  }
  const teamAnnouncements = isSiteAdmin
    ? await db.teamAnnouncements.find()
    : myGroupIds.length ? await db.teamAnnouncements.find({ groupId: { $in: myGroupIds } }) : [];

  return {
    me: privateUser(actor),
    accounts,
    settings: await settingsStore.get(),
    tasks: rawTasks.map((t) => populateTask(t, nameOf)),
    projects,
    reminders: await db.reminders.find({ ownerId: actor.id }),
    notifications: await db.notifications.page({ recipientId: actor.id }, { limit: 200 }),
    groups,
    joinRequests,
    roleChanges,
    messages,
    // Members: their own recent actions. Site admin: the whole audit trail, newest first, paged by `activityLimit`.
    activity: isSiteAdmin ? await listAllActivity(ctx, { limit: activityLimit }) : await listMyActivity(ctx, { limit: 30 }),
    teamAnnouncements,
  };
}
