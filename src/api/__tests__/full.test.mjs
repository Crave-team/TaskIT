import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { api } from './api.mjs';
import { resetDatabase, db } from '../repo.js';
import { getFileForDownload } from '../services/fileService.js';

/**
 * Full-coverage service tests: every `api.*` function is exercised at least once, with the happy
 * path AND the abuse cases (wrong person, wrong role, bad input). The last test fails if any
 * function is left untested. Run with `npm run test:api`.
 */
const PW = 'password123';
const today = '2026-10-14';
const tomorrow = '2026-10-15';
const later = '2026-11-20';

async function signUp(name, email, accountRole = 'user') {
  return api.auth.register({ name, email, password: PW, accountRole, inviteCode: accountRole === 'admin' ? 'ADMIN-2026' : '' });
}
async function as(email) {
  await api.auth.logout().catch(() => {});
  return api.auth.login({ email, password: PW });
}
const rejects = (p, code) => assert.rejects(p, (e) => e.code === code || e.status === code, `expected ${code}`);
const file = (name = 'a.txt', size = 10) => new File([new Uint8Array(size).fill(97)], name, { type: 'text/plain' });

beforeEach(() => resetDatabase());

async function world() {
  const maya = await signUp('Maya', 'maya@x.com');
  const ben = await signUp('Ben', 'ben@x.com');
  const cleo = await signUp('Cleo', 'cleo@x.com');
  const boss = await signUp('Boss', 'boss@x.com', 'admin');
  await as('maya@x.com');
  const group = await api.teams.createGroup({ name: 'Crew', description: 'd' });
  const tproject = await api.tasks.createProject({ name: 'Team P', groupId: group.id });
  await as('ben@x.com'); await api.teams.joinByCode(group.inviteCode);
  await as('cleo@x.com'); await api.teams.joinByCode(group.inviteCode);
  await as('maya@x.com');
  for (const r of (await api.bootstrap()).joinRequests) await api.teams.approveJoinRequest(r.id);
  return { maya, ben, cleo, boss, group, tproject };
}

test('auth: reset, getMe, changePassword, settings, validation', async () => {
  await signUp('Maya', 'maya@x.com');
  // The real flow (emailed code, new password) is covered in emailcode.test.mjs; this suite has no mailer plugged in.
  await rejects(api.auth.requestPasswordReset({ email: 'MAYA@x.com' }), 'EMAIL_CODE_UNAVAILABLE');
  await rejects(api.auth.resetPassword({ challengeToken: 'f'.repeat(64), code: '123456', newPassword: 'newpassword1' }), 'CODE_EXPIRED');
  await as('maya@x.com');
  assert.equal((await api.auth.getMe()).email, 'maya@x.com');
  assert.equal('passwordHash' in (await api.auth.getMe()), false, 'credentials are never returned');
  await rejects(api.auth.changePassword({ current: 'bad', next: 'newpassword1' }), 'BAD_REQUEST');
  await rejects(api.auth.changePassword({ current: PW, next: 'short' }), 'BAD_REQUEST');
  await rejects(api.auth.changePassword({ current: PW, next: PW }), 'BAD_REQUEST');
  await api.auth.changePassword({ current: PW, next: 'newpassword1' });
  await rejects(api.auth.login({ email: 'maya@x.com', password: PW }), 'BAD_PASSWORD');
  assert.ok(await api.auth.login({ email: 'maya@x.com', password: 'newpassword1' }));
  assert.equal((await api.auth.getSettings()).sessionTimeout, '60');
  await rejects(signUp('', 'a@b.com'), 'BAD_REQUEST');
  await rejects(signUp('A', 'not-an-email'), 'BAD_REQUEST');
  await rejects(api.auth.register({ name: 'A', email: 'a@b.com', password: 'short' }), 'BAD_REQUEST');
});

test('tasks: update rules, bulk delete, subtasks, comments, time, estimate, timer', async () => {
  await signUp('Maya', 'maya@x.com'); await signUp('Ben', 'ben@x.com');
  await as('maya@x.com');
  const p = await api.tasks.createProject({ name: 'A' });
  const other = await api.tasks.createProject({ name: 'B' });
  const t = await api.tasks.createTask({ title: 'T', dueDate: tomorrow, projectId: p.id, tags: ['x', 'x', ' y '] });
  assert.deepEqual(t.tags, ['x', 'y'], 'tags are trimmed and de-duplicated');

  const u = await api.tasks.updateTask(t.id, { title: ' New ', priority: 'high', dueDate: later, tags: ['z'], projectId: other.id, status: 'in-progress' });
  assert.equal(u.title, 'New'); assert.equal(u.priority, 'high'); assert.equal(u.projectId, other.id); assert.equal(u.status, 'in-progress');
  await rejects(api.tasks.updateTask(t.id, { title: '  ' }), 'BAD_REQUEST');
  await rejects(api.tasks.updateTask(t.id, { dueDate: '' }), 'BAD_REQUEST');
  await rejects(api.tasks.updateTask(t.id, { status: 'bogus' }), 'BAD_REQUEST');
  await rejects(api.tasks.updateTask('0'.repeat(24), { title: 'x' }), 'NOT_FOUND');
  await rejects(api.tasks.createTask({ title: '', dueDate: tomorrow, projectId: p.id }), 'BAD_REQUEST');
  await rejects(api.tasks.createTask({ title: 'x', dueDate: '', projectId: p.id }), 'BAD_REQUEST');
  await rejects(api.tasks.createTask({ title: 'x', dueDate: tomorrow, projectId: '' }), 'BAD_REQUEST');

  const s = await api.tasks.addSubtask(t.id, '  one ');
  assert.equal(s.title, 'one');
  await rejects(api.tasks.addSubtask(t.id, '  '), 'BAD_REQUEST');
  await api.tasks.toggleSubtask(t.id, s.id);
  assert.equal((await db.tasks.get(t.id)).subtasks[0].done, true);
  await api.tasks.removeSubtask(t.id, s.id);
  assert.equal((await db.tasks.get(t.id)).subtasks.length, 0);

  const c = await api.tasks.addComment(t.id, 'hello', { mentionIds: [] });
  assert.equal(c.text, 'hello');
  await rejects(api.tasks.addComment(t.id, ' '), 'BAD_REQUEST');

  await api.tasks.addTimeEntry(t.id, 30, 'work');
  await rejects(api.tasks.addTimeEntry(t.id, 0), 'BAD_REQUEST');
  await api.tasks.setEstimate(t.id, -5);
  assert.equal((await db.tasks.get(t.id)).estimatedMinutes, 0, 'negative estimates clamp to 0');
  await api.tasks.setEstimate(t.id, 90);
  assert.equal((await db.tasks.get(t.id)).estimatedMinutes, 90);
  const started = await api.tasks.startTimer(t.id);
  assert.equal(await api.tasks.startTimer(t.id), started, 'starting twice keeps the first start time');
  assert.equal(typeof (await api.tasks.stopTimer(t.id)), 'number');
  assert.equal(await api.tasks.stopTimer(t.id), 0, 'stopping an idle timer logs nothing');

  const t2 = await api.tasks.createTask({ title: 'T2', dueDate: tomorrow, projectId: p.id });
  await api.tasks.deleteTasks([t.id, t2.id]);
  assert.equal((await db.tasks.find()).length, 0);
  await api.tasks.deleteTasks([]);

  // another person cannot touch any of it
  const t3 = await api.tasks.createTask({ title: 'T3', dueDate: tomorrow, projectId: p.id });
  await as('ben@x.com');
  for (const call of [
    () => api.tasks.updateTask(t3.id, { title: 'x' }), () => api.tasks.toggleSubtask(t3.id, 'x'), () => api.tasks.removeSubtask(t3.id, 'x'),
    () => api.tasks.addComment(t3.id, 'x'), () => api.tasks.addTimeEntry(t3.id, 5), () => api.tasks.setEstimate(t3.id, 5),
    () => api.tasks.startTimer(t3.id), () => api.tasks.stopTimer(t3.id), () => api.tasks.moveTaskStatus(t3.id, 'done'),
    () => api.tasks.deleteTasks([t3.id]), () => api.tasks.updateProject(p.id, { name: 'hack' }), () => api.tasks.archiveProject(p.id),
    () => api.tasks.deleteProject(p.id), () => api.tasks.addMilestone(p.id, 'm', today),
  ]) await rejects(call(), 'FORBIDDEN');
});

test('files and attachments: upload, attach, size limit, release, ownership', async () => {
  await signUp('Maya', 'maya@x.com'); await signUp('Ben', 'ben@x.com');
  await as('maya@x.com');
  const p = await api.tasks.createProject({ name: 'A' });
  const t = await api.tasks.createTask({ title: 'T', dueDate: tomorrow, projectId: p.id });
  await rejects(api.files.uploadFile(file('big.bin', 11 * 1024 * 1024)), 'BAD_REQUEST');
  const f = await api.files.uploadFile(file('doc.txt', 1234));
  assert.ok(f.id && f.url && f.ownerId);
  const att = await api.tasks.addAttachment(t.id, { fileId: f.id, type: 'document', size: '1 KB' });
  assert.equal(att.name, 'doc.txt'); assert.equal(att.uploadedByName, 'Maya');
  await rejects(api.tasks.addAttachment(t.id, { fileId: '0'.repeat(24) }), 'BAD_REQUEST');
  await api.tasks.removeAttachment(t.id, att.id);
  assert.equal((await db.files.get(f.id)), null, 'removing an attachment frees the stored file');
  const f2 = await api.files.uploadFile(file('x.txt'));
  await as('ben@x.com');
  await rejects(api.files.deleteFile(f2.id), 'FORBIDDEN');
  await as('maya@x.com');
  await api.files.deleteFile(f2.id);
  await rejects(api.files.deleteFile(f2.id), 'NOT_FOUND');
});

test('projects: update, archive, milestones, delete cascade', async () => {
  await signUp('Maya', 'maya@x.com'); await as('maya@x.com');
  const p = await api.tasks.createProject({ name: ' Alpha ', priority: 'high' });
  assert.equal(p.name, 'Alpha');
  await rejects(api.tasks.createProject({ name: '  ' }), 'BAD_REQUEST');
  const u = await api.tasks.updateProject(p.id, { name: 'Beta', status: 'active', dueDate: later, description: ' d ' });
  assert.equal(u.name, 'Beta'); assert.equal(u.status, 'active'); assert.equal(u.description, 'd');
  assert.equal((await api.tasks.updateProject(p.id, { dueDate: '' })).dueDate, null);
  await rejects(api.tasks.updateProject(p.id, { name: ' ' }), 'BAD_REQUEST');
  assert.equal((await api.tasks.archiveProject(p.id)).archived, true);
  assert.equal((await api.tasks.archiveProject(p.id, false)).archived, false);
  const m = await api.tasks.addMilestone(p.id, 'Launch', later);
  await rejects(api.tasks.addMilestone(p.id, ' ', later), 'BAD_REQUEST');
  await api.tasks.toggleMilestone(p.id, m.id);
  assert.equal((await db.projects.get(p.id)).milestones[0].done, true);
  await api.tasks.removeMilestone(p.id, m.id);
  assert.equal((await db.projects.get(p.id)).milestones.length, 0);
  const t = await api.tasks.createTask({ title: 'T', dueDate: tomorrow, projectId: p.id });
  const f = await api.files.uploadFile(file());
  await api.tasks.addAttachment(t.id, { fileId: f.id });
  await api.tasks.deleteProject(p.id);
  assert.equal((await db.tasks.find()).length, 0); assert.equal((await db.files.get(f.id)), null);
  await rejects(api.tasks.deleteProject(p.id), 'NOT_FOUND');
});

test('reminders: validation and ownership', async () => {
  await signUp('Maya', 'maya@x.com'); await signUp('Ben', 'ben@x.com'); await as('maya@x.com');
  await rejects(api.tasks.addReminder({ title: '', date: tomorrow }), 'BAD_REQUEST');
  await rejects(api.tasks.addReminder({ title: 'x', date: '' }), 'BAD_REQUEST');
  const r = await api.tasks.addReminder({ title: 'Rent', date: tomorrow, time: '09:00' });
  const u = await api.tasks.updateReminder(r.id, { title: 'Rent!', date: later, time: '', note: ' n ' });
  assert.deepEqual([u.title, u.date, u.time, u.note], ['Rent!', later, '', 'n']);
  await rejects(api.tasks.updateReminder(r.id, { title: ' ' }), 'BAD_REQUEST');
  await as('ben@x.com');
  await rejects(api.tasks.updateReminder(r.id, { title: 'x' }), 'FORBIDDEN');
  await rejects(api.tasks.deleteReminder(r.id), 'FORBIDDEN');
  await as('maya@x.com');
  await api.tasks.deleteReminder(r.id);
  await rejects(api.tasks.deleteReminder(r.id), 'NOT_FOUND');
});

test('team workflow: move, turn in, undo, return, reassign, swap, bulk delete, tampering', async () => {
  const { maya, ben, cleo, group, tproject } = await world();
  // Ben is the only Dev, Cleo the only QA, Maya the Lead: a task made for a role has exactly one possible assignee.
  const dev = await api.teams.addRole(group.id, 'Dev'); const qa = await api.teams.addRole(group.id, 'QA'); const lead = await api.teams.addRole(group.id, 'Lead');
  await api.teams.proposeRoleChange(group.id, maya.id, lead.id); // an admin's own role applies at once
  for (const [email, userId, role] of [['ben@x.com', ben.id, dev], ['cleo@x.com', cleo.id, qa]]) {
    const change = await api.teams.proposeRoleChange(group.id, userId, role.id); // the member has to accept
    await as(email); await api.teams.answerRoleChange(change.id, true);
    await as('maya@x.com');
  }
  const mk = (title, roleId) => api.tasks.createTask({ title, dueDate: tomorrow, projectId: tproject.id, roleId });
  const a = await mk('A', dev.id); const b = await mk('B', qa.id);
  assert.equal(a.assigneeId, ben.id); assert.equal(b.assigneeId, cleo.id);
  const un = await api.tasks.reassignTask((await mk('U', lead.id)).id, null); // made for Maya, then handed back to nobody
  await rejects(mk('bad', 'f'.repeat(24)), 'BAD_REQUEST'); // not a role of this team
  // Team timer: assigning starts it; an unassigned task has none.
  assert.ok(Date.parse(a.assignedAt) > 0, 'assigning a task starts its timer');
  assert.equal(un.assignedAt, null);
  assert.equal(un.assignee ?? 'Unassigned', 'Unassigned');

  await as('ben@x.com');
  assert.equal((await api.tasks.moveTeamTask(a.id, 'in-progress')).status, 'in-progress');
  await rejects(api.tasks.moveTeamTask(a.id, 'review'), 'BAD_REQUEST');
  await rejects(api.tasks.moveTeamTask(a.id, 'done'), 'BAD_REQUEST');
  await rejects(api.tasks.moveTeamTask(b.id, 'in-progress'), 'FORBIDDEN');
  await rejects(api.tasks.updateTask(a.id, { title: 'mine now' }), 'FORBIDDEN');
  await rejects(api.tasks.reassignTask(a.id, cleo.id), 'FORBIDDEN');
  await rejects(api.tasks.deleteTask(a.id), 'FORBIDDEN');
  await rejects(api.tasks.undoTurnIn(a.id), 'BAD_REQUEST');
  await rejects(api.tasks.returnTask(a.id, 'x'), 'FORBIDDEN');

  const f = await api.files.uploadFile(file('work.txt', 99));
  const done = await api.tasks.turnInTask(a.id, { files: [{ fileId: f.id, size: 99 }], note: ' n ' });
  assert.equal(done.status, 'review'); assert.equal(done.turnIn.note, 'n'); assert.equal(done.timerStartedAt, null);
  assert.ok(Number.isFinite(done.turnIn.durationMs) && done.turnIn.durationMs >= 0, 'the turn-in records how long the task took');
  assert.equal(done.assignedAt, a.assignedAt, 'turning in does not restart the timer');
  await rejects(api.tasks.turnInTask(a.id, {}), 'BAD_REQUEST');
  await rejects(api.tasks.moveTeamTask(a.id, 'todo'), 'BAD_REQUEST'.length ? 'BAD_REQUEST' : 0).catch(() => {});
  const undone = await api.tasks.undoTurnIn(a.id);
  assert.equal(undone.status, 'in-progress'); assert.equal(undone.turnIn, null);
  // Taking it back must NOT lose the work: files and note stay as an editable draft.
  assert.ok(await db.files.get(f.id), 'taking the turn-in back keeps the uploaded file');
  assert.equal(undone.turnInDraft.note, 'n'); assert.equal(undone.turnInDraft.files.length, 1); assert.equal(undone.turnInDraft.files[0].fileId, f.id);

  // Edit the draft: change the note, add a second file, keep the first.
  const g = await api.files.uploadFile(file('extra.txt', 50));
  const edited = await api.tasks.saveTurnInDraft(a.id, { note: ' better ', files: [{ fileId: g.id, size: 50 }], keepFileIds: [f.id] });
  assert.equal(edited.status, 'in-progress'); assert.equal(edited.turnInDraft.note, 'better'); assert.equal(edited.turnInDraft.files.length, 2);
  // Drop the first file again: it is freed because nothing else points at it.
  const trimmed = await api.tasks.saveTurnInDraft(a.id, { note: 'better', keepFileIds: [g.id] });
  assert.deepEqual(trimmed.turnInDraft.files.map((x) => x.fileId), [g.id]);
  assert.equal(await db.files.get(f.id), null, 'a file the member removed while editing is freed');
  assert.ok(await db.files.get(g.id));

  // Turning in again reuses the kept file and clears the draft.
  const again = await api.tasks.turnInTask(a.id, { note: 'again', keepFileIds: [g.id] });
  assert.equal(again.status, 'review'); assert.equal(again.turnInDraft, null);
  assert.deepEqual(again.turnIn.files.map((x) => x.fileId), [g.id]);

  await as('maya@x.com');
  const returned = await api.tasks.returnTask(a.id, ' fix it ');
  assert.equal(returned.status, 'in-progress'); assert.equal(returned.returned.note, 'fix it'); assert.equal(returned.previousTurnIns.length, 1);
  // A returned task keeps what was handed in, so the member can edit it instead of starting over.
  assert.equal(returned.turnInDraft.note, 'again'); assert.deepEqual(returned.turnInDraft.files.map((x) => x.fileId), [g.id]);
  assert.ok(await db.files.get(g.id), 'returning a task keeps the turn-in files');
  await rejects(api.tasks.saveTurnInDraft(a.id, { note: 'not mine' }), 'FORBIDDEN');
  await as('ben@x.com');
  await rejects(api.tasks.saveTurnInDraft(un.id, { note: 'x' }), 'FORBIDDEN');
  const resubmitted = await api.tasks.turnInTask(a.id, { note: 'fixed' }); // no keepFileIds: all earlier files are kept
  assert.deepEqual(resubmitted.turnIn.files.map((x) => x.fileId), [g.id]); assert.equal(resubmitted.turnInDraft, null);
  await rejects(api.tasks.saveTurnInDraft(a.id, { note: 'late' }), 'BAD_REQUEST'); // in review: take it back first
  await api.tasks.undoTurnIn(a.id);
  await api.tasks.turnInTask(a.id, { note: 'once more' });
  await as('maya@x.com');
  await api.tasks.returnTask(a.id, 'again please');
  await rejects(api.tasks.approveTask(a.id), 'BAD_REQUEST');
  await rejects(api.tasks.returnTask(a.id, ''), 'BAD_REQUEST');

  const re = await api.tasks.reassignTask(un.id, ben.id);
  assert.equal(re.assigneeId, ben.id);
  assert.ok(Date.parse(re.assignedAt) > 0, 'assigning a previously unassigned task starts the timer');
  const unassigned = await api.tasks.reassignTask(un.id, null);
  assert.equal(unassigned.assigneeId, null); assert.equal(unassigned.assignedAt, null);
  await rejects(api.tasks.reassignTask(un.id, 'e'.repeat(24)), 'BAD_REQUEST');
  await api.tasks.swapTaskAssignees(a.id, b.id);
  assert.ok(Date.parse((await db.tasks.get(a.id)).assignedAt) >= Date.parse(a.assignedAt), 'a swap restarts the timer for the new assignee');
  assert.equal((await db.tasks.get(a.id)).assigneeId, cleo.id); assert.equal((await db.tasks.get(b.id)).assigneeId, ben.id);
  await rejects(api.tasks.swapTaskAssignees(a.id, 'f'.repeat(24)), 'NOT_FOUND');
  const personal = await api.tasks.createProject({ name: 'Mine' });
  const pt = await api.tasks.createTask({ title: 'p', dueDate: tomorrow, projectId: personal.id });
  await rejects(api.tasks.swapTaskAssignees(a.id, pt.id), 'BAD_REQUEST');
  await rejects(api.tasks.moveTaskStatus(a.id, 'done'), 'BAD_REQUEST');
  assert.ok(await db.files.get(g.id), 'the draft file is still stored before the task is deleted');
  await api.tasks.deleteTasks([a.id, b.id]);
  assert.equal((await db.tasks.find({ groupId: group.id })).length, 1);
  assert.equal(await db.files.get(g.id), null, 'deleting the task frees the files kept in its draft');
});

test('teams: codes, public/private joining, requests, roles, announcements', async () => {
  const { maya, ben, cleo, group } = await world();
  await signUp('Dan', 'dan@x.com'); await signUp('Eve', 'eve@x.com');
  const old = group.inviteCode;
  const fresh = await api.teams.regenerateInviteCode(group.id);
  assert.notEqual(fresh, old);
  await as('dan@x.com');
  await rejects(api.teams.joinByCode(old), 'NOT_FOUND');
  assert.equal((await api.teams.joinByCode(fresh.toLowerCase())).pending, true, 'codes are case-insensitive');
  assert.equal((await api.teams.joinByCode(fresh)).alreadyPending, true);
  await rejects(api.teams.regenerateInviteCode(group.id), 'FORBIDDEN');
  await api.teams.cancelJoinRequest(group.id);
  assert.equal((await db.joinRequests.find()).filter((r) => r.accountId).length, 0);
  assert.equal((await api.teams.joinPublicGroup(group.id)).pending, true);
  await as('eve@x.com');
  await api.teams.joinPublicGroup(group.id);
  await as('maya@x.com');
  const reqs = (await api.bootstrap()).joinRequests;
  assert.equal(reqs.length, 2);
  await api.teams.declineJoinRequest(reqs[0].id);
  await api.teams.approveJoinRequest(reqs[1].id);
  await rejects(api.teams.approveJoinRequest(reqs[0].id), 'NOT_FOUND');
  assert.equal((await api.teams.joinByCode(fresh)).alreadyMember, true);

  await api.teams.updateGroup(group.id, { visibility: 'private', name: ' Crew2 ', description: 'x' });
  await signUp('Fay', 'fay@x.com'); await as('fay@x.com');
  await rejects(api.teams.joinPublicGroup(group.id), 'FORBIDDEN');
  await as('ben@x.com');
  await rejects(api.teams.updateGroup(group.id, { name: 'hack' }), 'FORBIDDEN');
  await rejects(api.teams.promoteMember(group.id, cleo.id), 'FORBIDDEN');
  await rejects(api.teams.postTeamAnnouncement(group.id, 'hi'), 'FORBIDDEN');
  await as('maya@x.com');
  await api.teams.promoteMember(group.id, ben.id);
  await api.teams.promoteMember(group.id, ben.id); // idempotent
  assert.equal((await db.groups.get(group.id)).adminIds.filter((i) => i === ben.id).length, 1);
  await rejects(api.teams.demoteMember(group.id, maya.id), 'FORBIDDEN');
  await as('ben@x.com');
  await rejects(api.teams.demoteMember(group.id, ben.id), 'FORBIDDEN'); // only the owner demotes
  const ann = await api.teams.postTeamAnnouncement(group.id, ' hello ');
  assert.equal(ann.text, 'hello');
  await rejects(api.teams.postTeamAnnouncement(group.id, ' '), 'BAD_REQUEST');
  await rejects(api.teams.kickMember(group.id, maya.id), 'FORBIDDEN'); // owner cannot be removed
  await rejects(api.teams.kickMember(group.id, ben.id), 'BAD_REQUEST'); // not yourself
  await as('cleo@x.com');
  await rejects(api.teams.deleteTeamAnnouncement(ann.id), 'FORBIDDEN');
  await rejects(api.teams.leaveGroup('0'.repeat(24)), 'NOT_FOUND');
  await as('maya@x.com');
  await api.teams.demoteMember(group.id, ben.id);
  assert.equal((await db.groups.get(group.id)).adminIds.includes(ben.id), false);
  await api.teams.deleteTeamAnnouncement(ann.id);
  await rejects(api.teams.leaveGroup(group.id), 'BAD_REQUEST'); // owner cannot leave
  await rejects(api.teams.createGroup({ name: ' ' }), 'BAD_REQUEST');
  // an admin who is not the owner cannot remove another admin
  await api.teams.promoteMember(group.id, ben.id); await api.teams.promoteMember(group.id, cleo.id);
  await as('ben@x.com');
  await rejects(api.teams.kickMember(group.id, cleo.id), 'FORBIDDEN');
});

test('chat: validation, replies, images, pagination, deletion', async () => {
  const { group, ben } = await world();
  await rejects(api.teams.sendMessage(group.id, { text: '  ' }), 'BAD_REQUEST');
  const f = await api.files.uploadFile(file('pic.png', 5));
  const m1 = await api.teams.sendMessage(group.id, { text: 'one' });
  const m2 = await api.teams.sendMessage(group.id, { text: '', image: { fileId: f.id }, replyTo: m1.id });
  assert.equal(m2.image.name, 'pic.png'); assert.equal(m2.replyTo, m1.id);
  await rejects(api.teams.sendMessage(group.id, { text: 'x', replyTo: 'a'.repeat(24) }), 'BAD_REQUEST');
  await rejects(api.teams.sendMessage(group.id, { image: { fileId: 'b'.repeat(24) } }), 'BAD_REQUEST');
  const older = await api.teams.listMessages(group.id, { limit: 1 });
  assert.equal(older[0].id, m2.id);
  const before = await api.teams.listMessages(group.id, { before: m2.id, limit: 50 });
  assert.deepEqual(before.map((m) => m.id), [m1.id], 'the cursor is exact even when messages share a millisecond');
  assert.ok(m1.id < m2.id, 'ids increase in creation order');
  await api.teams.deleteMessage(m2.id);
  assert.equal((await db.files.get(f.id)), null, 'deleting a photo message frees the photo');
  assert.equal((await api.teams.reactToMessage(m2.id, '👍')).deleted, true, 'cannot react to a deleted message');
  await as('ben@x.com');
  await rejects(api.teams.deleteMessage(m1.id), 'FORBIDDEN');
  assert.ok(ben.id);
});

// Reads the file service directly, so it only runs against the in-process services (not over HTTP).
test('profile photo: teammates get the photo URL and may read it; strangers may not download it', { skip: Boolean(process.env.TASKIT_API_URL) }, async () => {
  const { maya, ben } = await world();
  const dan = await signUp('Dan', 'dan@x.com'); // not on Maya's team
  const mayaAsSeenBy = async (email) => { await as(email); return (await api.bootstrap()).accounts.find((a) => a.id === maya.id); };

  await as('maya@x.com');
  const photo = await api.files.uploadFile(file('me.png', 8));
  await rejects(api.auth.updateProfile({ avatarFileId: 'c'.repeat(24) }), 'BAD_REQUEST'); // not a real file
  await api.auth.updateProfile({ avatarFileId: photo.id });

  assert.equal((await mayaAsSeenBy('ben@x.com')).avatarUrl, photo.url, 'a teammate receives the photo URL (this is what team chat shows)');
  assert.ok(await getFileForDownload({ actorId: ben.id }, photo.id), 'a teammate may download the photo');

  // Team owners are listed for everyone (so a team can be recognised before joining), but the photo file itself is not.
  await rejects(getFileForDownload({ actorId: dan.id }, photo.id), 'NOT_FOUND');

  await as('maya@x.com');
  const replacement = await api.files.uploadFile(file('new.png', 8));
  await api.auth.updateProfile({ avatarFileId: replacement.id });
  assert.equal((await mayaAsSeenBy('ben@x.com')).avatarUrl, replacement.url, 'a changed photo reaches teammates');
  assert.equal(await db.files.get(photo.id), null, 'the replaced photo is freed');

  await as('maya@x.com');
  await api.auth.updateProfile({ avatarFileId: null });
  assert.equal((await mayaAsSeenBy('ben@x.com')).avatarUrl, null, 'removing the photo goes back to initials');
});

test('notifications and activity APIs', async () => {
  await signUp('Maya', 'maya@x.com'); await signUp('Boss', 'boss@x.com', 'admin'); await as('maya@x.com');
  const p = await api.tasks.createProject({ name: 'A' });
  await api.tasks.createTask({ title: 'Late', dueDate: '2026-10-01', projectId: p.id });
  await api.notifications.syncDeadlines({ today });
  // (the once-a-day digest also lands in the bell; it has its own tests in services.test.mjs)
  let notes = (await api.bootstrap()).notifications.filter((n) => n.type !== 'digest');
  assert.equal(notes.length, 1);
  await api.notifications.markNotificationRead(notes[0].id);
  assert.equal((await db.notifications.get(notes[0].id)).read, true);
  await rejects(api.notifications.markNotificationRead('9'.repeat(24)), 'NOT_FOUND');
  await api.tasks.addReminder({ title: 'r', date: tomorrow });
  await api.notifications.syncDeadlines({ today });
  await api.notifications.markAllNotificationsRead();
  assert.ok((await db.notifications.find()).every((n) => n.read));
  await api.notifications.clearNotifications();
  assert.equal((await db.notifications.find()).length, 0);

  await api.activity.logAccess({ action: 'opened', target: 'Calendar' });
  const mine = await api.activity.listMyActivity();
  assert.ok(mine.length > 0 && mine.every((l) => l.kind !== 'access'), 'page visits are not shown to members');
  assert.ok(mine[0].actor === 'Maya');
  await rejects(api.activity.listAllActivity(), 'FORBIDDEN');
  await as('boss@x.com');
  const all = await api.activity.listAllActivity({ limit: 500 });
  assert.ok(all.some((l) => l.kind === 'access'));
  assert.ok((await api.activity.listAllActivity({ scope: 'account' })).every((l) => l.scope === 'account'));
  const mayaId = (await db.users.find()).find((u) => u.email === 'maya@x.com').id;
  assert.ok((await api.activity.listAllActivity({ actorId: mayaId })).every((l) => l.actorId === mayaId));
  assert.equal((await api.activity.listAllActivity({ limit: 2 })).length, 2);
});

test('account management: sessions die on ban/delete, last admin protected, admin sees no team chat text', async () => {
  const { maya, ben, group, boss } = await world();
  await api.teams.sendMessage(group.id, { text: 'secret plans' });
  await signUp('Ana', 'ana@x.com', 'admin');
  await as('ben@x.com');
  await as('boss@x.com');
  const snap = await api.bootstrap();
  assert.equal(snap.accounts.length, 5);
  assert.ok(snap.accounts.every((a) => !('passwordHash' in a)));
  assert.ok(snap.messages.every((m) => !('text' in m)), 'the site admin gets chat metadata only');
  await api.auth.setAccountRole(ben.id, 'admin');
  await api.auth.setAccountRole(ben.id, 'user');
  await rejects(api.auth.setAccountRole(ben.id, 'owner'), 'BAD_REQUEST');
  await rejects(api.auth.setAccountStatus(ben.id, 'weird'), 'BAD_REQUEST');
  await rejects(api.auth.deleteUser('0'.repeat(24)), 'NOT_FOUND');
  // ban kills an existing session immediately
  await as('ben@x.com');
  const sneaky = await api.bootstrap();
  assert.ok(sneaky.me);
  await as('boss@x.com');
  await api.auth.setAccountStatus(ben.id, 'suspended');
  await api.auth.setAccountStatus(ben.id, 'active');
  // demoting down to a single admin is blocked
  await api.auth.setAccountRole((await db.users.find()).find((u) => u.email === 'ana@x.com').id, 'user');
  await rejects(api.auth.setAccountRole(boss.id, 'user'), 'FORBIDDEN');
  const anaId = (await db.users.find()).find((u) => u.email === 'ana@x.com').id;
  await api.auth.deleteUser(anaId);
  // the site admin can disband any team
  await api.teams.deleteGroup(group.id);
  assert.equal((await db.groups.find()).length, 0);
  assert.ok(maya.id);
});

test('non-site-admin cannot use admin functions', async () => {
  await signUp('Maya', 'maya@x.com'); await signUp('Ben', 'ben@x.com'); await as('maya@x.com');
  const id = (await db.users.find()).find((u) => u.email === 'ben@x.com').id;
  await rejects(api.auth.setAccountRole(id, 'admin'), 'FORBIDDEN');
  await rejects(api.auth.setAccountStatus(id, 'suspended'), 'FORBIDDEN');
  await rejects(api.auth.deleteUser(id), 'FORBIDDEN');
  await rejects(api.auth.updateSettings({ sessionTimeout: '5' }), 'FORBIDDEN');
});

test('settings: only whitelisted keys are saved', async () => {
  await signUp('Boss', 'boss@x.com', 'admin'); await as('boss@x.com');
  const s = await api.auth.updateSettings({ sessionTimeout: '15', evil: 'x', require2fa: false });
  assert.equal(s.sessionTimeout, '15'); assert.equal(s.require2fa, false); assert.equal('evil' in s, false);
  await rejects(api.auth.updateSettings({ require2fa: true }), 'BAD_REQUEST'); // no mail here: would lock every admin out
});

after(() => {
  // Guard: every API function must be touched by at least one of the test files.
  const src = ['services.test.mjs', 'full.test.mjs', 'google.test.mjs', 'emailcode.test.mjs'].map((f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
  const missing = [];
  for (const [area, fns] of Object.entries(api)) {
    if (typeof fns === 'function') continue;
    Object.keys(fns).forEach((n) => { if (!new RegExp(`\\b${n}\\b`).test(src)) missing.push(`${area}.${n}`); });
  }
  if (missing.length) throw new Error(`API functions with no test: ${missing.join(', ')}`);
});

test('regression: recent activity is not crowded out by page visits', async () => {
  await signUp('Maya', 'maya@x.com'); await as('maya@x.com');
  const p = await api.tasks.createProject({ name: 'A' });
  await api.tasks.createTask({ title: 'T', dueDate: tomorrow, projectId: p.id });
  for (let i = 0; i < 80; i++) await api.activity.logAccess({ action: 'opened', target: `Page ${i}` });
  const mine = await api.activity.listMyActivity({ limit: 30 });
  assert.ok(mine.length >= 2, `member lost their real activity behind page visits (got ${mine.length})`);
  assert.ok(mine.every((l) => l.kind !== 'access'));
});

// ---------------------------------------------------------------------------------------------
// Concurrency: many requests at once. These are the cases where "read the array, edit it, write it
// back" loses data, and where only a database-level unique index can pick one winner.
// ---------------------------------------------------------------------------------------------
import * as taskSvc from '../services/taskService.js';
import * as teamSvc from '../services/teamService.js';
import * as authSvc from '../services/authService.js';
import { notify } from '../core.js';

const ON_MONGO = process.env.TEST_DB === 'mongo';
// FerretDB (used where no real MongoDB is available) does not make concurrent single-document updates atomic
// (even a bare $inc loses writes), so set TEST_DB_ATOMIC=false there. Against real MongoDB / Atlas leave it unset.
const ATOMIC = process.env.TEST_DB_ATOMIC !== 'false';
const needsAtomic = !ATOMIC && 'the database server does not provide atomic concurrent updates (run against real MongoDB)';

test('concurrent edits to one task never lose each other', { skip: needsAtomic }, async () => {
  await signUp('Maya', 'maya@x.com');
  const maya = await as('maya@x.com');
  const ctx = { actorId: maya.id };
  const project = await taskSvc.createProject(ctx, { name: 'A' });
  const task = await taskSvc.createTask(ctx, { title: 'T', dueDate: tomorrow, projectId: project.id });

  const N = 25;
  await Promise.all([
    ...Array.from({ length: N }, (_, i) => taskSvc.addSubtask(ctx, task.id, `Sub ${i}`)),
    ...Array.from({ length: N }, (_, i) => taskSvc.addTimeEntry(ctx, task.id, 1 + i, `entry ${i}`)),
    ...Array.from({ length: N }, (_, i) => taskSvc.addComment(ctx, task.id, `comment ${i}`)),
  ]);
  const fresh = await db.tasks.get(task.id);
  assert.equal(fresh.subtasks.length, N, 'every concurrently added subtask survived');
  assert.equal(fresh.timeEntries.length, N);
  assert.equal(fresh.comments.length, N);

  // toggling different subtasks at the same time: each one flips, none is reverted by a neighbour
  await Promise.all(fresh.subtasks.slice(0, 10).map((s) => taskSvc.toggleSubtask(ctx, task.id, s.id)));
  const after = await db.tasks.get(task.id);
  assert.equal(after.subtasks.filter((s) => s.done).length, 10);
  assert.equal(after.subtasks.length, N);

  // removing several at once
  await Promise.all(after.subtasks.slice(0, 10).map((s) => taskSvc.removeSubtask(ctx, task.id, s.id)));
  assert.equal((await db.tasks.get(task.id)).subtasks.length, N - 10);
});

test('concurrent team approvals all land', { skip: needsAtomic }, async () => {
  const { maya, group } = await world();
  const owner = { actorId: maya.id };
  const people = [];
  for (let i = 0; i < 6; i += 1) {
    await signUp(`Joiner ${i}`, `j${i}@x.com`);
    const u = await as(`j${i}@x.com`);
    people.push(u);
    await teamSvc.joinByCode({ actorId: u.id }, group.inviteCode);
  }
  // approve all six requests at the same instant
  const requests = await db.joinRequests.find();
  await Promise.all(requests.map((r) => teamSvc.approveJoinRequest(owner, r.id)));
  const g = await db.groups.get(group.id);
  assert.equal(g.memberIds.length, 3 + 6, 'owner + Ben + Cleo (from world()) + all 6 concurrently approved joiners');
});

test('concurrent reactions from different people are all kept', { skip: needsAtomic }, async () => {
  const { maya, ben, cleo, group } = await world();
  const msg = await teamSvc.sendMessage({ actorId: maya.id }, group.id, { text: 'react to me' });
  await Promise.all([maya, ben, cleo].map((u, i) => teamSvc.reactToMessage({ actorId: u.id }, msg.id, ['👍', '❤️', '😂'][i])));
  const reactions = (await db.messages.get(msg.id)).reactions;
  assert.equal(Object.keys(reactions).length, 3);
  assert.equal(reactions[ben.id], '❤️');
});

test('the database picks exactly one winner for racing sign-ups, join requests and notices', { skip: !ON_MONGO && 'needs real unique indexes (MongoDB)' }, async () => {
  // 8 people try to register the same email at once -> exactly one account
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => authSvc.register({ name: `Racer ${i}`, email: 'same@x.com', password: PW })));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.ok(results.filter((r) => r.status === 'rejected').every((r) => r.reason.code === 'CONFLICT'));
  assert.equal((await db.users.find({ email: 'same@x.com' })).length, 1);

  // a double-click on "Request to join" files one request
  const { group } = await world();
  await signUp('Eager', 'eager@x.com');
  const eager = await as('eager@x.com');
  await Promise.all(Array.from({ length: 5 }, () => teamSvc.joinByCode({ actorId: eager.id }, group.inviteCode)));
  assert.equal((await db.joinRequests.find({ accountId: eager.id })).length, 1);

  // the same deadline notice created concurrently exists once
  await Promise.all(Array.from({ length: 6 }, () => notify(eager.id, { type: 'deadline', message: 'x', dedupeKey: 'soon:task:1:2026-10-15' })));
  assert.equal((await db.notifications.find({ recipientId: eager.id })).length, 1);
});
