import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { api } from './api.mjs';
import { resetDatabase, db } from '../repo.js';

/**
 * Service-level tests. They run in plain Node (no browser, no React): `npm run test:api`.
 * Each helper "signs in" as a person by logging in through the same api the UI uses.
 */
const PW = 'password123';
const today = '2026-10-14';
const tomorrow = '2026-10-15';

async function signUp(name, email, accountRole = 'user') {
  await api.auth.register({ name, email, password: PW, accountRole, inviteCode: accountRole === 'admin' ? 'ADMIN-2026' : '' });
}
async function as(email, role) {
  await api.auth.logout().catch(() => {});
  return api.auth.login({ email, password: PW, expectedRole: role });
}
const rejects = (promise, code) => assert.rejects(promise, (e) => e.code === code || e.status === code);

beforeEach(() => resetDatabase());

test('passwords are hashed and emails are unique case-insensitively', async () => {
  await signUp('Maya', 'Maya@X.com');
  assert.ok((await db.users.find())[0].passwordHash.includes(':'));
  assert.notEqual((await db.users.find())[0].passwordHash, PW);
  assert.equal((await db.users.find())[0].email, 'maya@x.com');
  await rejects(signUp('Other', 'maya@x.COM'), 'CONFLICT');
  await rejects(api.auth.login({ email: 'maya@x.com', password: 'wrong-password' }), 'BAD_PASSWORD');
  await rejects(api.auth.register({ name: 'A', email: 'a@b.com', password: PW, accountRole: 'admin', inviteCode: 'nope' }), 'FORBIDDEN');
  await rejects(as('maya@x.com', 'admin'), 'WRONG_PORTAL');
});

test('nobody can act without a session, and a client cannot choose who it is', async () => {
  await api.auth.logout().catch(() => {});
  await rejects(api.tasks.createTask({}), 'UNAUTHORIZED');
  assert.deepEqual(await api.bootstrap(), { me: null });
});

test('personal tasks are private; assignees are IDs with display names populated', async () => {
  await signUp('Maya', 'maya@x.com'); await signUp('Ben', 'ben@x.com');
  await as('maya@x.com');
  const project = await api.tasks.createProject({ name: 'Alpha' });
  const task = await api.tasks.createTask({ title: 'Secret', dueDate: tomorrow, projectId: project.id });
  assert.equal(task.assigneeId, task.ownerId);
  assert.ok(task.timerStartedAt, 'timer is stored on the task, not in the browser');
  const mine = (await api.bootstrap()).tasks;
  assert.equal(mine[0].assignee, 'Maya');

  await as('ben@x.com');
  assert.equal((await api.bootstrap()).tasks.length, 0);
  await rejects(api.tasks.deleteTask(task.id), 'FORBIDDEN');
  await rejects(api.tasks.addSubtask(task.id, 'x'), 'FORBIDDEN');
  await rejects(api.tasks.createTask({ title: 'Mine?', dueDate: tomorrow, projectId: project.id }), 'FORBIDDEN');
});

/** The real flow for changing someone's role: Maya (an admin) proposes it, the member accepts. Ends signed in as Maya. */
async function giveRole(groupId, email, roleId) {
  const user = (await db.users.find()).find((u) => u.email === email);
  await as('maya@x.com');
  const change = await api.teams.proposeRoleChange(groupId, user.id, roleId);
  if (change) {
    await as(email);
    await api.teams.answerRoleChange(change.id, true);
    await as('maya@x.com');
  }
}

/** A team where Maya (owner) is the Lead, Ben the only Dev and Cleo the only QA, so a task made for a role has one possible assignee. */
async function teamSetup() {
  await signUp('Maya', 'maya@x.com'); await signUp('Ben', 'ben@x.com'); await signUp('Cleo', 'cleo@x.com');
  const maya = await as('maya@x.com');
  const group = await api.teams.createGroup({ name: 'Crew' });
  const project = await api.tasks.createProject({ name: 'P1', groupId: group.id });
  const lead = await api.teams.addRole(group.id, 'Lead');
  const dev = await api.teams.addRole(group.id, 'Dev');
  const qa = await api.teams.addRole(group.id, 'QA');
  await api.teams.proposeRoleChange(group.id, maya.id, lead.id); // an admin's own role applies at once
  const ben = await as('ben@x.com');
  await api.teams.joinByCode(group.inviteCode, dev.id);
  const cleo = await as('cleo@x.com');
  await api.teams.joinByCode(group.inviteCode, qa.id);
  await as('maya@x.com');
  for (const r of (await api.bootstrap()).joinRequests) await api.teams.approveJoinRequest(r.id);
  return { maya, ben, cleo, group, project, roles: { lead, dev, qa } };
}

test('team workflow: only admins create/approve, only the assignee turns in', async () => {
  const { maya, ben, project, roles } = await teamSetup();
  const task = await api.tasks.createTask({ title: 'Ben job', dueDate: tomorrow, projectId: project.id, roleId: roles.dev.id });
  assert.equal(task.assigneeId, ben.id, 'Ben is the only Dev');
  assert.equal(task.timerStartedAt, null, 'admin handing a task over does not start their own timer');
  assert.equal((await api.bootstrap()).tasks[0].history[0].detail, 'Assigned to Ben (random Dev)');

  await as('ben@x.com');
  assert.equal((await api.bootstrap()).tasks.length, 1);
  await rejects(api.tasks.createTask({ title: 'nope', dueDate: tomorrow, projectId: project.id, roleId: roles.dev.id }), 'FORBIDDEN');
  await rejects(api.tasks.approveTask(task.id), 'FORBIDDEN');
  await api.tasks.turnInTask(task.id, { note: 'done!' });

  await as('cleo@x.com');
  assert.equal((await api.bootstrap()).tasks.length, 0, 'teammates cannot see each other\'s tasks');
  await rejects(api.tasks.turnInTask(task.id, {}), 'FORBIDDEN');

  await as('maya@x.com');
  assert.equal((await api.bootstrap()).notifications.some((n) => n.type === 'turn-in'), true);
  const done = await api.tasks.approveTask(task.id);
  assert.equal(done.status, 'done');
  assert.equal(done.turnIn.approvedBy ?? done.turnIn.approvedByName, 'Maya');
  assert.ok(maya.id);
});

test('leaving or being removed frees unfinished tasks; disbanding purges everything', async () => {
  const { ben, cleo, group, project, roles } = await teamSetup();
  const t1 = await api.tasks.createTask({ title: 'B', dueDate: tomorrow, projectId: project.id, roleId: roles.dev.id });
  const t2 = await api.tasks.createTask({ title: 'C', dueDate: tomorrow, projectId: project.id, roleId: roles.qa.id });

  await as('ben@x.com');
  await api.teams.leaveGroup(group.id);
  await as('maya@x.com');
  assert.equal((await db.groups.get(group.id)).memberRoles[ben.id], undefined, 'a member who leaves no longer holds a role');
  let tasks = (await api.bootstrap()).tasks;
  assert.equal(tasks.find((t) => t.id === t1.id).assigneeId, null);
  assert.equal(tasks.find((t) => t.id === t1.id).assignee, 'Unassigned');

  await api.teams.kickMember(group.id, cleo.id);
  tasks = (await api.bootstrap()).tasks;
  assert.equal(tasks.find((t) => t.id === t2.id).assigneeId, null);
  await rejects(api.tasks.reassignTask(t2.id, ben.id), 'BAD_REQUEST'); // Ben is no longer a member

  await api.teams.deleteGroup(group.id);
  const snap = await api.bootstrap();
  assert.equal(snap.tasks.length, 0);
  assert.equal(snap.projects.length, 0);
  assert.equal((await db.groups.find()).length, 0);
});

test('only the owner disbands; strangers cannot read a private team', async () => {
  const { group, ben } = await teamSetup();
  await as('ben@x.com');
  await rejects(api.teams.deleteGroup(group.id), 'FORBIDDEN');
  await rejects(api.teams.promoteMember(group.id, ben.id), 'FORBIDDEN');
  await signUp('Zed', 'zed@x.com');
  await as('maya@x.com');
  await api.teams.updateGroup(group.id, { visibility: 'private' });
  await as('zed@x.com');
  const snap = await api.bootstrap();
  assert.equal(snap.groups.length, 0);
  await rejects(api.teams.listMessages(group.id), 'FORBIDDEN');
  await rejects(api.teams.sendMessage(group.id, { text: 'hi' }), 'FORBIDDEN');
});

test('deleting a user cascades: personal data gone, teams passed on, tasks freed', async () => {
  const { maya, ben, group, project, roles } = await teamSetup();
  const task = await api.tasks.createTask({ title: 'Mine', dueDate: tomorrow, projectId: project.id, roleId: roles.lead.id });
  assert.equal(task.assigneeId, maya.id);
  await api.teams.promoteMember(group.id, ben.id);
  const solo = await api.tasks.createProject({ name: 'Solo' });
  await api.tasks.addReminder({ title: 'r', date: tomorrow });
  await signUp('Boss', 'boss@x.com', 'admin');
  await as('boss@x.com');
  await api.auth.deleteUser(maya.id);
  assert.equal((await db.users.get(maya.id)), null);
  assert.equal((await db.projects.get(solo.id)), null);
  assert.equal((await db.reminders.find()).length, 0);
  assert.equal((await db.groups.find())[0].ownerId, ben.id, 'ownership passes to another admin');
  assert.equal((await db.tasks.get(task.id)).assigneeId, null);
  await rejects(api.auth.deleteUser((await db.users.find()).find((u) => u.accountRole === 'admin').id), 'FORBIDDEN');
});

test('timers live on the task and stop logs time', async () => {
  await signUp('Maya', 'maya@x.com'); await as('maya@x.com');
  const p = await api.tasks.createProject({ name: 'A' });
  const t = await api.tasks.createTask({ title: 'T', dueDate: tomorrow, projectId: p.id }, { timerStartedAt: Date.now() - 5 * 60000 });
  assert.equal(await api.tasks.stopTimer(t.id), 5);
  assert.equal((await db.tasks.get(t.id)).timerStartedAt, null);
  assert.equal((await db.tasks.get(t.id)).timeEntries.length, 1);
  await api.tasks.moveTaskStatus(t.id, 'done');
  assert.ok((await db.tasks.get(t.id)).completedAt);
});

test('deadline notices are idempotent, dismissible, and respect settings', async () => {
  await signUp('Maya', 'maya@x.com'); await as('maya@x.com');
  const p = await api.tasks.createProject({ name: 'A' });
  const soon = await api.tasks.createTask({ title: 'Soon', dueDate: tomorrow, projectId: p.id });
  await api.tasks.createTask({ title: 'Late', dueDate: '2026-10-01', projectId: p.id });
  await api.tasks.addReminder({ title: 'Pay rent', date: tomorrow });
  assert.equal((await api.notifications.syncDeadlines({ today })).created, 3);
  assert.equal((await api.notifications.syncDeadlines({ today })).created, 0, 'running again never duplicates');
  const pending = (await api.bootstrap()).notifications.filter((n) => n.popup?.pending);
  assert.equal(pending.length, 3);
  await api.notifications.acknowledgePopups(pending.map((n) => n.id));
  assert.equal((await api.notifications.syncDeadlines({ today })).created, 0, 'a dismissed notice never pops up again');
  assert.equal((await api.bootstrap()).notifications.filter((n) => n.popup?.pending).length, 0);
  // finishing a task retires its pending notice
  await api.tasks.createTask({ title: 'Other', dueDate: tomorrow, projectId: p.id });
  await api.notifications.syncDeadlines({ today });
  await api.tasks.moveTaskStatus(soon.id, 'done');
  // personal preference + site switch
  await api.auth.updateProfile({ prefs: { dueReminders: false } });
  await api.notifications.syncDeadlines({ today });
  assert.equal((await api.bootstrap()).notifications.filter((n) => n.popup?.pending).length, 0);
});

test('either switch off silences BOTH the overdue and the due-tomorrow notices, and turning it back on restores them', async () => {
  await signUp('Boss', 'boss@x.com', 'admin'); await signUp('Maya', 'maya@x.com');
  await as('maya@x.com');
  const p = await api.tasks.createProject({ name: 'A' });
  await api.tasks.createTask({ title: 'Late', dueDate: '2026-10-01', projectId: p.id });
  await api.tasks.createTask({ title: 'Soon', dueDate: tomorrow, projectId: p.id });
  const pending = async () => (await api.bootstrap()).notifications.filter((n) => n.popup?.pending).map((n) => n.type).sort();
  // my own "Due-date reminders" preference off: nothing pops up, even for a task that is already overdue
  await api.auth.updateProfile({ prefs: { dueReminders: false } });
  await api.notifications.syncDeadlines({ today });
  assert.deepEqual(await pending(), []);
  // back on: both notices come back (they were never dismissed)
  await api.auth.updateProfile({ prefs: { dueReminders: true } });
  await api.notifications.syncDeadlines({ today });
  assert.deepEqual(await pending(), ['deadline', 'overdue']);
  // the admin's site-wide switch off silences them again
  await as('boss@x.com');
  await api.auth.updateSettings({ notifyDeadlines: false });
  await as('maya@x.com');
  await api.notifications.syncDeadlines({ today });
  assert.deepEqual(await pending(), []);
});

test('overdue pop-up: off means no pop-up, and turning it back on pops overdue tasks up again immediately', async () => {
  await signUp('Boss', 'boss@x.com', 'admin'); await signUp('Maya', 'maya@x.com');
  await as('maya@x.com');
  const p = await api.tasks.createProject({ name: 'A' });
  await api.tasks.createTask({ title: 'Late', dueDate: '2026-10-01', projectId: p.id });
  const pending = async (type) => (await api.bootstrap()).notifications.filter((n) => n.popup?.pending && (!type || n.type === type)).length;
  const bellEntries = async () => (await api.bootstrap()).notifications.filter((n) => n.type === 'overdue').length;

  // ON: the overdue task pops up straight away.
  await api.notifications.syncDeadlines({ today });
  assert.equal(await pending('overdue'), 1, 'on: overdue pops up');

  // OFF while the pop-up is still waiting: it must stop popping up.
  await api.auth.updateProfile({ prefs: { dueReminders: false } });
  await api.notifications.syncDeadlines({ today });
  assert.equal(await pending(), 0, 'off: no pop-up');

  // Still off, even after a re-check on a later day: nothing new pops up.
  await api.notifications.syncDeadlines({ today: '2026-10-15' });
  assert.equal(await pending(), 0, 'off stays off');

  // ON again: the overdue task pops up again, without creating a second bell entry.
  await api.auth.updateProfile({ prefs: { dueReminders: true } });
  await api.notifications.syncDeadlines({ today });
  assert.equal(await pending('overdue'), 1, 'back on: overdue pops up again');
  assert.equal(await bellEntries(), 1, 'no duplicate bell entry');

  // Dismissing it works, and a plain re-check (no switch change) does not bring it back.
  await api.notifications.acknowledgePopups((await api.bootstrap()).notifications.filter((n) => n.popup?.pending).map((n) => n.id));
  await api.notifications.syncDeadlines({ today });
  assert.equal(await pending(), 0, 'dismissed stays dismissed while the switch is unchanged');

  // Off then on after a dismissal: turning it on is an explicit request, so it pops up again.
  await api.auth.updateProfile({ prefs: { dueReminders: false } });
  await api.notifications.syncDeadlines({ today });
  await api.auth.updateProfile({ prefs: { dueReminders: true } });
  await api.notifications.syncDeadlines({ today });
  assert.equal(await pending('overdue'), 1, 'off then on shows overdue tasks again');

  // The admin's site-wide switch behaves the same way.
  await as('boss@x.com');
  await api.auth.updateSettings({ notifyDeadlines: false });
  await as('maya@x.com');
  await api.notifications.syncDeadlines({ today });
  assert.equal(await pending(), 0, 'site switch off: no pop-up');
  await as('boss@x.com');
  await api.auth.updateSettings({ notifyDeadlines: true });
  await as('maya@x.com');
  await api.notifications.syncDeadlines({ today });
  assert.equal(await pending('overdue'), 1, 'site switch back on: pops up');

  // A task that was finished while the switch was off must not pop up when it is turned back on.
  await api.auth.updateProfile({ prefs: { dueReminders: false } });
  await api.notifications.syncDeadlines({ today });
  const [late] = (await api.bootstrap()).tasks.filter((t) => t.title === 'Late');
  await api.tasks.moveTaskStatus(late.id, 'done');
  await api.auth.updateProfile({ prefs: { dueReminders: true } });
  await api.notifications.syncDeadlines({ today });
  assert.equal(await pending(), 0, 'finished tasks never pop up');
});

test('site admin gets reminders only, can silence deadlines, and cannot be self-destructive', async () => {
  await signUp('Boss', 'boss@x.com', 'admin'); await signUp('Ana', 'ana@x.com', 'admin');
  const boss = await as('boss@x.com');
  await api.tasks.addReminder({ title: 'Audit', date: tomorrow });
  assert.equal((await api.notifications.syncDeadlines({ today })).created, 1);
  await rejects(api.auth.setAccountRole(boss.id, 'user'), 'FORBIDDEN');
  await rejects(api.auth.setAccountStatus(boss.id, 'suspended'), 'FORBIDDEN');
  await api.auth.updateSettings({ notifyDeadlines: false });
  await api.tasks.addReminder({ title: 'Audit 2', date: tomorrow });
  assert.equal((await api.notifications.syncDeadlines({ today })).created, 0);
  await signUp('Maya', 'maya@x.com'); await as('maya@x.com');
  await rejects(api.auth.updateSettings({ notifyDeadlines: true }), 'FORBIDDEN');
  await rejects(api.activity.listAllActivity(), 'FORBIDDEN');
});

test('admin reminders pop up the day before AND on the due date, and follow the profile switch', async () => {
  await signUp('Boss', 'boss@x.com', 'admin');
  await as('boss@x.com');
  await api.tasks.addReminder({ title: 'Renew licence', date: today, time: '09:00' });
  await api.tasks.addReminder({ title: 'Board review', date: tomorrow });
  await api.tasks.addReminder({ title: 'Far away', date: '2026-12-01' });
  assert.equal((await api.notifications.syncDeadlines({ today })).created, 2);
  assert.equal((await api.notifications.syncDeadlines({ today })).created, 0, 'running again never duplicates');
  const pending = async () => (await api.bootstrap()).notifications
    .filter((n) => n.popup?.pending)
    .map((n) => `${n.popup.when}:${n.popup.title}`).sort();
  assert.deepEqual(await pending(), ['today:Renew licence', 'tomorrow:Board review']);

  // the "due today" popup is its own notice: tomorrow's reminder pops up again once its day arrives
  const next = await api.notifications.syncDeadlines({ today: tomorrow });
  assert.equal(next.created, 1);
  assert.ok((await pending()).includes('today:Board review'));
  assert.ok(!(await pending()).includes('tomorrow:Board review'), 'the day-before notice is retired once the day has come');

  // profile switch off: nothing pops up; back on: it returns
  await api.auth.updateProfile({ prefs: { dueReminders: false } });
  await api.notifications.syncDeadlines({ today: tomorrow });
  assert.deepEqual(await pending(), []);
  await api.auth.updateProfile({ prefs: { dueReminders: true } });
  await api.notifications.syncDeadlines({ today: tomorrow });
  assert.ok((await pending()).includes('today:Board review'));
});

test('members are also reminded on the day a task is due', async () => {
  await signUp('Maya', 'maya@x.com'); await as('maya@x.com');
  const p = await api.tasks.createProject({ name: 'A' });
  await api.tasks.createTask({ title: 'Due now', dueDate: today, projectId: p.id });
  await api.tasks.createTask({ title: 'Due soon', dueDate: tomorrow, projectId: p.id });
  assert.equal((await api.notifications.syncDeadlines({ today })).created, 2);
  const pending = (await api.bootstrap()).notifications.filter((n) => n.popup?.pending);
  assert.deepEqual(pending.map((n) => n.popup.when).sort(), ['today', 'tomorrow']);
  assert.ok(pending.find((n) => n.popup.when === 'today').message.includes('due today'));
});

test('profile edits persist, emails stay unique, and renames show everywhere by ID', async () => {
  await signUp('Maya', 'maya@x.com'); await signUp('Ben', 'ben@x.com');
  const maya = await as('maya@x.com');
  await rejects(api.auth.updateProfile({ email: 'BEN@x.com' }), 'CONFLICT');
  const p = await api.tasks.createProject({ name: 'A' });
  await api.tasks.createTask({ title: 'T', dueDate: tomorrow, projectId: p.id });
  await api.auth.updateProfile({ name: 'Maya Santos', email: 'maya.new@x.com' });
  assert.equal((await api.bootstrap()).tasks[0].assignee, 'Maya Santos', 'no rename pass needed: names are looked up by id');
  await rejects(api.auth.login({ email: 'maya@x.com', password: PW }), 'NO_ACCOUNT');
  assert.equal((await api.auth.login({ email: 'maya.new@x.com', password: PW })).id, maya.id);
});

test('banned accounts are signed out and cannot act', async () => {
  await signUp('Boss', 'boss@x.com', 'admin'); await signUp('Maya', 'maya@x.com');
  await as('maya@x.com');
  const mayaId = (await db.users.find()).find((u) => u.email === 'maya@x.com').id;
  await as('boss@x.com');
  await api.auth.setAccountStatus(mayaId, 'suspended');
  await rejects(api.auth.login({ email: 'maya@x.com', password: PW }), 'SUSPENDED');
});

test('chat: members only, mentions notify, reactions toggle, deletes leave a placeholder', async () => {
  const { group, ben, cleo } = await teamSetup();
  const msg = await api.teams.sendMessage(group.id, { text: 'hello @Ben', mentionIds: [ben.id] });
  assert.equal(msg.authorId, (await db.users.find()).find((u) => u.email === 'maya@x.com').id);
  await as('ben@x.com');
  assert.equal((await api.bootstrap()).notifications.some((n) => n.type === 'mention'), true);
  await api.teams.reactToMessage(msg.id, '👍');
  assert.equal(Object.keys((await db.messages.get(msg.id)).reactions).length, 1);
  await api.teams.reactToMessage(msg.id, '👍');
  assert.equal(Object.keys((await db.messages.get(msg.id)).reactions).length, 0);
  await rejects(api.teams.deleteMessage(msg.id), 'FORBIDDEN');
  await as('maya@x.com');
  await api.teams.deleteMessage(msg.id);
  assert.equal((await db.messages.get(msg.id)).deleted, true);
  assert.ok(cleo.id);
  const page = await api.teams.listMessages(group.id, { limit: 1 });
  assert.equal(page.length, 1);
});

test('only the team owner can switch a team between public and private, and it shows to everyone at once', async () => {
  const { group, ben } = await teamSetup();
  await as('ben@x.com');
  await rejects(api.teams.updateGroup(group.id, { visibility: 'private' }), 'FORBIDDEN');
  await as('maya@x.com');
  assert.equal((await api.teams.updateGroup(group.id, { visibility: 'private' })).visibility, 'private');
  await signUp('Zed', 'zed@x.com');
  await as('zed@x.com');
  assert.equal((await api.bootstrap()).groups.length, 0, 'a private team is hidden from Discover');
  await as('maya@x.com');
  assert.equal((await api.teams.updateGroup(group.id, { visibility: 'public' })).visibility, 'public');
  await as('zed@x.com');
  assert.equal((await api.bootstrap()).groups.length, 1, 'switching back to public lists it again');
  // Changing the name must not flip visibility back (the form no longer carries it).
  await as('maya@x.com');
  const renamed = await api.teams.updateGroup(group.id, { name: 'Crew 2' });
  assert.equal(renamed.visibility, 'public');
  assert.ok(ben.id);
});

test('asking for the snapshot twice with nothing changed gives identical data (the quiet background refresh relies on this)', async () => {
  const { group } = await teamSetup();
  await api.teams.sendMessage(group.id, { text: 'hello' });
  assert.equal(JSON.stringify(await api.bootstrap()), JSON.stringify(await api.bootstrap()));
});

// ---- daily digest -------------------------------------------------------------------------------------------------

const digests = async () => (await api.bootstrap()).notifications.filter((n) => n.type === 'digest');

test('daily digest: one summary per day with the right counts, never a second one the same day', async () => {
  await signUp('Maya', 'maya@x.com'); await as('maya@x.com');
  const p = await api.tasks.createProject({ name: 'A' });
  await api.tasks.createTask({ title: 'Late 1', dueDate: '2026-10-01', projectId: p.id });
  await api.tasks.createTask({ title: 'Late 2', dueDate: '2026-10-10', projectId: p.id });
  await api.tasks.createTask({ title: 'Now', dueDate: today, projectId: p.id });
  await api.tasks.createTask({ title: 'Soon', dueDate: tomorrow, projectId: p.id });
  await api.tasks.createTask({ title: 'Later A', dueDate: '2026-10-18', projectId: p.id });
  await api.tasks.createTask({ title: 'Later B', dueDate: '2026-10-21', projectId: p.id });
  await api.tasks.createTask({ title: 'Far away', dueDate: '2026-11-30', projectId: p.id });
  const done = await api.tasks.createTask({ title: 'Finished', dueDate: today, projectId: p.id });
  await api.tasks.moveTaskStatus(done.id, 'done');
  await api.tasks.addReminder({ title: 'Call bank', date: today });

  assert.equal((await api.notifications.syncDeadlines({ today })).digestCreated, true);
  const [d, ...rest] = await digests();
  assert.equal(rest.length, 0);
  assert.equal(d.message, 'Daily digest: 2 overdue, 1 due today, 1 due tomorrow, 2 more due in the next 7 days, 1 reminder today.');
  assert.equal(d.link, '/tasks');
  assert.equal(d.read, false);
  assert.equal(d.popup, null, 'a digest sits in the bell; it never pops up');

  assert.equal((await api.notifications.syncDeadlines({ today })).digestCreated, false);
  await api.notifications.syncDeadlines({ today });
  assert.equal((await digests()).length, 1, 'syncing again the same day does not add another');

  // the next day gets its own (counts recomputed for that day)
  await api.notifications.syncDeadlines({ today: tomorrow });
  const all = await digests();
  assert.equal(all.length, 2);
  assert.ok(all.some((n) => n.message.includes('3 overdue')), "tomorrow's digest counts what is overdue then");
});

test('daily digest: nothing to say means no digest, and finished/other people\'s tasks are not counted', async () => {
  await signUp('Maya', 'maya@x.com'); await signUp('Ben', 'ben@x.com');
  await as('ben@x.com');
  const bp = await api.tasks.createProject({ name: 'Bens' });
  await api.tasks.createTask({ title: 'Ben late', dueDate: '2026-10-01', projectId: bp.id });
  await as('maya@x.com');
  await api.notifications.syncDeadlines({ today });
  assert.equal((await digests()).length, 0, 'Maya has nothing due, so no digest (and Ben\'s task is not hers)');
  const p = await api.tasks.createProject({ name: 'A' });
  await api.tasks.createTask({ title: 'Far', dueDate: '2026-12-25', projectId: p.id });
  await api.notifications.syncDeadlines({ today });
  assert.equal((await digests()).length, 0, 'something due far in the future is not worth a digest');
});

test('daily digest: the "Daily digest" preference and the site-wide deadline switch both control it', async () => {
  await signUp('Boss', 'boss@x.com', 'admin'); await signUp('Maya', 'maya@x.com');
  await as('maya@x.com');
  const p = await api.tasks.createProject({ name: 'A' });
  await api.tasks.createTask({ title: 'Now', dueDate: today, projectId: p.id });

  await api.auth.updateProfile({ prefs: { dailyDigest: false } });
  await api.notifications.syncDeadlines({ today });
  assert.equal((await digests()).length, 0, 'preference off: no digest');
  // turning it on later the same day creates today's digest at once
  await api.auth.updateProfile({ prefs: { dailyDigest: true } });
  await api.notifications.syncDeadlines({ today });
  assert.equal((await digests()).length, 1);

  // "Due-date reminders" is a different switch: it does not affect the digest
  await api.auth.updateProfile({ prefs: { dueReminders: false } });
  await api.notifications.syncDeadlines({ today: tomorrow });
  assert.equal((await digests()).length, 2, 'the digest does not depend on the pop-up reminders preference');

  await as('boss@x.com');
  await api.auth.updateSettings({ notifyDeadlines: false });
  await as('maya@x.com');
  await api.notifications.syncDeadlines({ today: '2026-10-16' });
  assert.equal((await digests()).length, 2, 'site-wide alerts off: no new digest');
});

test('daily digest: admins (who have no tasks) get one only for their calendar reminders; old digests are cleared out', async () => {
  await signUp('Boss', 'boss@x.com', 'admin'); await as('boss@x.com', 'admin');
  await api.notifications.syncDeadlines({ today });
  assert.equal((await digests()).length, 0);
  await api.tasks.addReminder({ title: 'Board meeting', date: today });
  await api.notifications.syncDeadlines({ today });
  const [d] = await digests();
  assert.equal(d.message, 'Daily digest: 1 reminder today.');
  assert.equal(d.link, '/calendar');
  // a digest from more than a week ago is removed the next time it syncs
  await api.notifications.syncDeadlines({ today: '2026-10-22' });
  assert.equal((await digests()).length, 0, 'the old digest was cleared');
});

// ---- team roles ----------------------------------------------------------------------------------------------------

test('team roles: admins define them, members pick their own, an admin\'s change needs the member\'s approval', async () => {
  const { maya, ben, cleo, group, roles } = await teamSetup();
  const roleOf = async (id) => (await db.groups.get(group.id)).memberRoles[id];

  // Defining roles: admins only, a name is required, unique ignoring case.
  await rejects(api.teams.addRole(group.id, '   '), 'BAD_REQUEST');
  await rejects(api.teams.addRole(group.id, 'dev'), 'BAD_REQUEST');
  const design = await api.teams.addRole(group.id, '  Design   lead ');
  assert.equal(design.name, 'Design lead');
  await as('ben@x.com');
  await rejects(api.teams.addRole(group.id, 'Sneaky'), 'FORBIDDEN');
  await rejects(api.teams.removeRole(group.id, design.id), 'FORBIDDEN');
  await rejects(api.teams.proposeRoleChange(group.id, cleo.id, design.id), 'FORBIDDEN');

  // A member cannot change their own role: there is no call for it, and proposing one for yourself is admin-only too.
  assert.equal(api.teams.chooseMyRole, undefined);
  await rejects(api.teams.proposeRoleChange(group.id, ben.id, design.id), 'FORBIDDEN');
  assert.equal(await roleOf(ben.id), roles.dev.id, 'Ben is still a Dev');
  await signUp('Zed', 'zed@x.com'); await as('zed@x.com');
  await rejects(api.teams.proposeRoleChange(group.id, ben.id, design.id), 'FORBIDDEN'); // outsiders neither
  await giveRole(group.id, 'ben@x.com', design.id); // through the admin's proposal and Ben's acceptance
  assert.equal(await roleOf(ben.id), design.id);

  // A role somebody holds cannot be deleted; an empty one can.
  await as('maya@x.com');
  await rejects(api.teams.removeRole(group.id, design.id), 'BAD_REQUEST');
  await rejects(api.teams.removeRole(group.id, 'f'.repeat(24)), 'NOT_FOUND');
  const spare = await api.teams.addRole(group.id, 'Spare');
  await api.teams.removeRole(group.id, spare.id);
  assert.deepEqual((await db.groups.get(group.id)).roles.map((r) => r.name), ['Lead', 'Dev', 'QA', 'Design lead']);

  // An admin can only PROPOSE a change for someone else; nothing moves until they accept.
  await rejects(api.teams.proposeRoleChange(group.id, cleo.id, 'f'.repeat(24)), 'BAD_REQUEST');
  await rejects(api.teams.proposeRoleChange(group.id, 'f'.repeat(24), roles.dev.id), 'BAD_REQUEST');
  await rejects(api.teams.proposeRoleChange(group.id, cleo.id, roles.qa.id), 'BAD_REQUEST'); // already hers
  const proposal = await api.teams.proposeRoleChange(group.id, cleo.id, roles.dev.id);
  assert.equal(await roleOf(cleo.id), roles.qa.id, 'the proposal alone changes nothing');
  const again = await api.teams.proposeRoleChange(group.id, cleo.id, design.id);
  assert.equal((await db.roleChanges.find({ accountId: cleo.id })).length, 1, 'a newer proposal replaces the open one');
  assert.equal(await db.roleChanges.get(proposal.id), null);

  await as('cleo@x.com');
  const snap = await api.bootstrap();
  assert.equal(snap.roleChanges.length, 1, 'the member sees the proposal made to them');
  assert.ok(snap.notifications.some((n) => n.message.includes('Design lead')));
  await as('ben@x.com');
  assert.equal((await api.bootstrap()).roleChanges.length, 0, 'other members do not see it');
  await rejects(api.teams.answerRoleChange(again.id, true), 'NOT_FOUND'); // not addressed to Ben
  await as('cleo@x.com');
  await api.teams.answerRoleChange(again.id, false);
  assert.equal(await roleOf(cleo.id), roles.qa.id, 'declining keeps the role');
  await rejects(api.teams.answerRoleChange(again.id, true), 'NOT_FOUND'); // it is gone once answered

  await as('maya@x.com');
  const second = await api.teams.proposeRoleChange(group.id, cleo.id, roles.dev.id);
  await api.teams.cancelRoleChange(second.id);
  assert.equal((await db.roleChanges.find()).length, 0, 'an admin can withdraw a proposal');
  const third = await api.teams.proposeRoleChange(group.id, cleo.id, roles.dev.id);
  await as('cleo@x.com');
  await rejects(api.teams.cancelRoleChange(third.id), 'FORBIDDEN'); // only an admin withdraws
  await api.teams.answerRoleChange(third.id, true);
  assert.equal(await roleOf(cleo.id), roles.dev.id, 'accepting applies the role');

  // An admin's own role is theirs to set: no approval step.
  await as('maya@x.com');
  assert.equal(await api.teams.proposeRoleChange(group.id, maya.id, roles.qa.id), null);
  assert.equal(await roleOf(maya.id), roles.qa.id);

  // Leaving drops both the role and any open proposal.
  await api.teams.proposeRoleChange(group.id, cleo.id, design.id);
  await api.teams.kickMember(group.id, cleo.id);
  assert.equal(await roleOf(cleo.id), undefined);
  assert.equal((await db.roleChanges.find()).length, 0);
});

test('joining a team with roles asks for one; the choice travels with the request and is applied on approval', async () => {
  const { group, roles } = await teamSetup();
  await signUp('Dan', 'dan@x.com'); await signUp('Eve', 'eve@x.com'); await signUp('Fay', 'fay@x.com');

  await as('dan@x.com');
  const ask = await api.teams.joinByCode(group.inviteCode);
  assert.equal(ask.roleRequired, true);
  assert.deepEqual(ask.roles.map((r) => r.name), ['Lead', 'Dev', 'QA']);
  assert.equal((await db.joinRequests.find()).length, 0, 'nothing is filed until a role is chosen');
  await rejects(api.teams.joinByCode(group.inviteCode, 'f'.repeat(24)), 'BAD_REQUEST');
  assert.equal((await api.teams.joinByCode(group.inviteCode, roles.dev.id)).pending, true);
  assert.equal((await api.teams.joinByCode(group.inviteCode)).alreadyPending, true);

  await as('eve@x.com');
  assert.equal((await api.teams.joinPublicGroup(group.id)).roleRequired, true);
  assert.equal((await api.teams.joinPublicGroup(group.id, roles.qa.id)).pending, true);

  // Discover cards carry the role list (so the joiner can choose) but never who holds what.
  await as('fay@x.com');
  const card = (await api.bootstrap()).groups.find((g) => g.id === group.id);
  assert.equal(card.roles.length, 3);
  assert.ok(!card.memberRoles || Object.keys(card.memberRoles).length === 0, 'who holds which role stays private to the team');

  await as('maya@x.com');
  const requests = (await api.bootstrap()).joinRequests;
  assert.deepEqual(requests.map((r) => r.roleId).sort(), [roles.dev.id, roles.qa.id].sort());
  // A role the admin deletes while a request waits: the person still joins and can pick again.
  const spare = await api.teams.addRole(group.id, 'Spare');
  await as('fay@x.com');
  await api.teams.joinByCode(group.inviteCode, spare.id);
  await as('maya@x.com');
  await api.teams.removeRole(group.id, spare.id);
  for (const r of (await api.bootstrap()).joinRequests) await api.teams.approveJoinRequest(r.id);
  const memberRoles = (await db.groups.get(group.id)).memberRoles;
  const dan = (await db.users.find()).find((u) => u.email === 'dan@x.com');
  const fay = (await db.users.find()).find((u) => u.email === 'fay@x.com');
  assert.equal(memberRoles[dan.id], roles.dev.id);
  assert.equal(memberRoles[fay.id], undefined);
  assert.ok((await db.groups.get(group.id)).memberIds.includes(fay.id));
});

test('every team task is made for a role, and the server picks the assignee among that role\'s holders', async () => {
  const { ben, cleo, group, project, roles } = await teamSetup();
  const make = (extra = {}) => api.tasks.createTask({ title: 'T', dueDate: tomorrow, projectId: project.id, ...extra });

  await rejects(make(), 'BAD_REQUEST'); // no role
  await rejects(make({ roleId: 'f'.repeat(24) }), 'BAD_REQUEST'); // not a role of this team
  const empty = await api.teams.addRole(group.id, 'Nobody');
  await rejects(make({ roleId: empty.id }), 'BAD_REQUEST'); // a role nobody holds never leaves a task unassigned
  const forced = await make({ roleId: roles.dev.id, assigneeId: cleo.id });
  assert.equal(forced.assigneeId, ben.id, 'a hand-picked assignee in the request is ignored');
  assert.equal(forced.roleId, roles.dev.id); assert.equal(forced.roleName, 'Dev');
  assert.equal((await db.tasks.find({ groupId: group.id })).length, 1, 'refused requests created nothing');

  // Two Devs: a batch of 40 is split 20/20, and never reaches anyone else.
  await giveRole(group.id, 'cleo@x.com', roles.dev.id);
  const rows = Array.from({ length: 40 }, (_, i) => ({ title: `R${i}`, dueDate: tomorrow, roleId: roles.dev.id }));
  const made = await api.tasks.createTeamTasks(project.id, rows);
  const got = new Set(made.map((m) => m.task.assigneeId));
  assert.deepEqual([...got].sort(), [ben.id, cleo.id].sort(), 'both holders get work, nobody else does');
  assert.equal(made.filter((m) => m.task.assigneeId === ben.id).length, 20, 'an even split');
  assert.ok(made.every((m) => m.decision.roleName === 'Dev' && m.task.autoAssigned === true));

  // Suspended people are not drawn.
  await signUp('Boss', 'boss@x.com', 'admin');
  await as('boss@x.com');
  await api.auth.setAccountStatus(cleo.id, 'suspended');
  await as('maya@x.com');
  const after = await api.tasks.createTeamTasks(project.id, rows.slice(0, 10));
  assert.ok(after.every((m) => m.task.assigneeId === ben.id));
});

test('createTeamTasks checks every row before creating anything, and only admins can use it', async () => {
  const { project, group, roles } = await teamSetup();
  const good = { title: 'Good', dueDate: tomorrow, roleId: roles.dev.id };
  const before = (await db.tasks.find({ groupId: group.id })).length;
  const empty = await api.teams.addRole(group.id, 'Nobody');

  await rejects(api.tasks.createTeamTasks(project.id, []), 'BAD_REQUEST');
  await rejects(api.tasks.createTeamTasks(project.id, [good, { ...good, roleId: '' }]), 'BAD_REQUEST'); // a row without a role
  await rejects(api.tasks.createTeamTasks(project.id, [good, { ...good, title: ' ' }]), 'BAD_REQUEST');
  await rejects(api.tasks.createTeamTasks(project.id, [good, { ...good, dueDate: 'soon' }]), 'BAD_REQUEST');
  await rejects(api.tasks.createTeamTasks(project.id, [good, { ...good, roleId: empty.id }]), 'BAD_REQUEST'); // nobody holds it
  await rejects(api.tasks.createTeamTasks(project.id, Array.from({ length: 51 }, () => good)), 'BAD_REQUEST');
  await rejects(api.tasks.createTeamTasks('', [good]), 'BAD_REQUEST');
  assert.equal((await db.tasks.find({ groupId: group.id })).length, before, 'one bad row means no task was created');

  await as('ben@x.com');
  await rejects(api.tasks.createTeamTasks(project.id, [good]), 'FORBIDDEN');
});

test('a batch is split evenly per role: everyone gets a share, the leftovers go to randomly chosen people', async () => {
  const { cleo, group, project, roles } = await teamSetup();
  // Four Devs: Ben, Cleo (switches from QA), Dan and Eve.
  await giveRole(group.id, 'cleo@x.com', roles.dev.id);
  for (const [name, email] of [['Dan', 'dan@x.com'], ['Eve', 'eve@x.com']]) {
    await signUp(name, email); await as(email);
    await api.teams.joinByCode(group.inviteCode, roles.dev.id);
  }
  await as('maya@x.com');
  for (const r of (await api.bootstrap()).joinRequests) await api.teams.approveJoinRequest(r.id);
  const users = await db.users.find();
  const idOf = (email) => users.find((u) => u.email === email).id;
  const devs = ['ben@x.com', 'cleo@x.com', 'dan@x.com', 'eve@x.com'].map(idOf);

  const batch = async (roleIds) => (await api.tasks.createTeamTasks(
    project.id,
    roleIds.map((roleId, i) => ({ title: `T${i}`, dueDate: tomorrow, roleId })),
  )).map((m) => m.task.assigneeId);
  const devTasks = (n) => Array(n).fill(roles.dev.id);
  const counts = (ids) => devs.map((d) => ids.filter((id) => id === d).length).sort();

  assert.deepEqual(counts(await batch(devTasks(5))), [1, 1, 1, 2], '5 tasks, 4 people: one each and one random person gets a second');
  assert.deepEqual(counts(await batch(devTasks(10))), [2, 2, 3, 3]);
  assert.deepEqual(counts(await batch(devTasks(3))), [0, 1, 1, 1], 'fewer tasks than people: nobody gets two');
  assert.deepEqual(counts(await batch(devTasks(8))), [2, 2, 2, 2]);

  // The leftover person is chosen at random, not always the same one (a fluke is a 1 in 4^29 chance).
  const extras = new Set();
  for (let i = 0; i < 30; i += 1) {
    const ids = await batch(devTasks(5));
    extras.add(devs.find((d) => ids.filter((id) => id === d).length === 2));
  }
  assert.ok(extras.size > 1, 'the extra task does not always land on the same person');

  // Roles are split independently inside one batch. Cleo moves to a new role "Ops" that only she holds.
  const ops = await api.teams.addRole(group.id, 'Ops');
  await giveRole(group.id, 'cleo@x.com', ops.id);
  const mixed = await api.tasks.createTeamTasks(project.id, [roles.dev.id, ops.id, roles.dev.id, ops.id, roles.dev.id].map((roleId, i) => ({ title: `M${i}`, dueDate: tomorrow, roleId })));
  assert.ok(mixed.filter((m) => m.decision.roleName === 'Ops').every((m) => m.task.assigneeId === cleo.id));
  const devPart = mixed.filter((m) => m.decision.roleName === 'Dev').map((m) => m.task.assigneeId);
  assert.equal(new Set(devPart).size, 3, 'three Dev tasks go to the three Devs, one each');
  assert.ok(!devPart.includes(cleo.id));

  // Nothing is remembered between requests: a single task is just a random holder.
  const single = (await batch([roles.dev.id]))[0];
  assert.ok(devs.filter((d) => d !== cleo.id).includes(single));
  assert.equal((await db.groups.get(group.id)).roleDraws, undefined);
});
